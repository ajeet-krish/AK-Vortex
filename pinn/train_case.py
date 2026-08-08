#!/usr/bin/env python3
"""Generic PINN trainer for any AK-Vortex case.

Auto-discovers LBM frame data from output/{case}/{config}/, builds a
CaseConfig, selects the appropriate architecture and BC losses, and
trains a steady-state hybrid PINN.

Usage:
    python3 pinn/train_case.py --case cylinder --config re100
    python3 pinn/train_case.py --case step --config re100
    python3 pinn/train_case.py --case flatplate --config re1000_aoa0
    python3 pinn/train_case.py --case cavity --config re100
    python3 pinn/train_case.py --case orifice_plate --config re100_1p1h
    python3 pinn/train_case.py --case urban --config topdown_v
    python3 pinn/train_case.py --case cylinder_near_wall --config re100_gap20
    python3 pinn/train_case.py --case side_by_side --config re100_sd30
    python3 pinn/train_case.py --case rotating_cylinder --config re100_w10
"""

import argparse
import json
import os
import sys
import time

import numpy as np

# Ensure pinn/ is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import CaseConfig, from_meta, downsample_factor
from data.loader import (
    load_frame, grid_coords, flatten_grid,
    make_collocation, subsample_sensors,
)


# --------------------------------------------------------------------------
# Case discovery
# --------------------------------------------------------------------------
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "output")

# Map case name aliases to output directory paths
CASE_ALIASES = {
    "cylinder": "cylinder",
    "cavity": "cavity",
    "step": "step",
    "flatplate": "flatplate",
    "flat_plate": "flatplate",
    "orifice_plate": "orifice_plate",
    "orifice": "orifice_plate",
    "urban": "urban",
    "urban_citygrid": "urban/city_grid",
    "cylinder_near_wall": "cylinder_near_wall",
    "cnw": "cylinder_near_wall",
    "side_by_side": "side_by_side",
    "sbs": "side_by_side",
    "rotating_cylinder": "rotating_cylinder",
    "rotating": "rotating_cylinder",
}


def discover_case(case_name: str, config: str):
    """Find meta.json + frames for a given case/config.

    Returns (meta_path, case_dir, frame_path) or raises FileNotFoundError.
    """
    # Try direct path first
    out_dir = os.path.join(OUTPUT_DIR, case_name, config)
    if not os.path.isdir(out_dir):
        # Try alias
        alias = CASE_ALIASES.get(case_name, case_name)
        out_dir = os.path.join(OUTPUT_DIR, alias, config)
    if not os.path.isdir(out_dir):
        raise FileNotFoundError(f"Output directory not found: {out_dir}")

    meta_path = os.path.join(out_dir, "meta.json")
    if not os.path.exists(meta_path):
        raise FileNotFoundError(f"meta.json not found: {meta_path}")

    frames_dir = os.path.join(out_dir, "frames")
    if not os.path.isdir(frames_dir):
        raise FileNotFoundError(f"frames/ not found: {frames_dir}")

    # Find the last frame (steady state)
    frame_files = sorted([
        f for f in os.listdir(frames_dir)
        if f.startswith("frame_") and f.endswith(".json")
    ])
    if not frame_files:
        raise FileNotFoundError(f"No frame JSONs in {frames_dir}")

    # Use the last frame (steady state)
    frame_path = os.path.join(frames_dir, frame_files[-1])
    return meta_path, out_dir, frame_path


# --------------------------------------------------------------------------
# Geometry-aware boundary condition selection
# --------------------------------------------------------------------------
def make_bc_fn(cfg: CaseConfig, device):
    """Return a BC loss function appropriate for the case geometry."""
    st = cfg.shape_type
    geom = cfg.geometry

    if st == "lid-driven-cavity":
        from models.losses import bc_loss_cavity
        u_lid = cfg.u_inflow
        return lambda model, n, dev: bc_loss_cavity(model, n, u_lid, dev)

    if st == "cylinder":
        from models.losses import bc_loss_cylinder, bc_loss_inflow, bc_loss_outlet, bc_loss_walls
        cx_n = geom["cx"] / (cfg.nx - 1) * 2 - 1
        cy_n = geom["cy"] / (cfg.ny - 1) * 2 - 1
        rx_n = geom["radius"] * cfg.ds / cfg.NX * 2
        ry_n = geom["radius"] * cfg.ds / cfg.NY * 2
        def bc_cyl(model, n, dev):
            return (bc_loss_inflow(model, n, cfg.u_inflow, dev)
                    + bc_loss_outlet(model, n, dev)
                    + bc_loss_walls(model, n, dev)
                    + bc_loss_cylinder(model, cx_n, cy_n, rx_n, ry_n, n, dev))
        return bc_cyl

    if st == "backward-facing-step":
        from models.losses import bc_loss_step_full
        h_norm = geom.get("h_step_norm", -0.33)
        return lambda model, n, dev: bc_loss_step_full(
            model, n, cfg.u_inflow, h_norm, dev)

    if st == "flat-plate":
        from models.losses import bc_loss_flatplate_full
        chord_n = geom.get("chord_norm", 0.5)
        return lambda model, n, dev: bc_loss_flatplate_full(
            model, n, cfg.u_inflow, chord_n, dev)

    if st == "orifice-plate":
        from models.losses import bc_loss_orifice_full
        px = geom.get("plate_x_norm", 0.0)
        hc = geom.get("hole_center_norm", 0.0)
        hh = geom.get("hole_half_norm", 0.1)
        return lambda model, n, dev: bc_loss_orifice_full(
            model, n, cfg.u_inflow, px, hc, hh, dev)

    if st in ("urban-side", "urban-topdown", "urban-canyon", "building-downwash"):
        from models.losses import bc_loss_urban_full
        return lambda model, n, dev: bc_loss_urban_full(
            model, n, cfg.u_inflow, dev)

    if st == "cylinder-near-wall":
        from models.losses import bc_loss_near_wall_full
        cx_n = geom["cx"] / (cfg.nx - 1) * 2 - 1
        cy_n = geom["cy"] / (cfg.ny - 1) * 2 - 1
        rx_n = geom["radius"] * cfg.ds / cfg.NX * 2
        ry_n = geom["radius"] * cfg.ds / cfg.NY * 2
        gap_n = geom.get("gap_y_norm", -0.8)
        return lambda model, n, dev: bc_loss_near_wall_full(
            model, n, cfg.u_inflow, cx_n, cy_n, rx_n, ry_n, gap_n, dev)

    if st == "side-by-side":
        from models.losses import bc_loss_cylinder, bc_loss_inflow, bc_loss_outlet, bc_loss_walls
        cx_n = geom["cx"] / (cfg.nx - 1) * 2 - 1
        cy1_n = geom["cy"] / (cfg.ny - 1) * 2 - 1
        cy2_n = geom.get("cy2", geom["cy"]) / (cfg.ny - 1) * 2 - 1
        rx_n = geom["radius"] * cfg.ds / cfg.NX * 2
        ry_n = geom["radius"] * cfg.ds / cfg.NY * 2
        def bc_sbs(model, n, dev):
            return (bc_loss_inflow(model, n, cfg.u_inflow, dev)
                    + bc_loss_outlet(model, n, dev)
                    + bc_loss_walls(model, n, dev)
                    + bc_loss_cylinder(model, cx_n, cy1_n, rx_n, ry_n, n // 2, dev)
                    + bc_loss_cylinder(model, cx_n, cy2_n, rx_n, ry_n, n // 2, dev))
        return bc_sbs

    if st == "rotating-cylinder":
        from models.losses import bc_loss_cylinder, bc_loss_inflow, bc_loss_outlet, bc_loss_walls
        cx_n = geom["cx"] / (cfg.nx - 1) * 2 - 1
        cy_n = geom["cy"] / (cfg.ny - 1) * 2 - 1
        rx_n = geom["radius"] * cfg.ds / cfg.NX * 2
        ry_n = geom["radius"] * cfg.ds / cfg.NY * 2
        def bc_rot(model, n, dev):
            return (bc_loss_inflow(model, n, cfg.u_inflow, dev)
                    + bc_loss_outlet(model, n, dev)
                    + bc_loss_walls(model, n, dev)
                    + bc_loss_cylinder(model, cx_n, cy_n, rx_n, ry_n, n, dev))
        return bc_rot

    # Fallback: inflow + outlet + walls (external flow)
    from models.losses import bc_loss_inflow, bc_loss_outlet, bc_loss_walls
    def bc_default(model, n, dev):
        return (bc_loss_inflow(model, n, cfg.u_inflow, dev)
                + bc_loss_outlet(model, n, dev)
                + bc_loss_walls(model, n, dev))
    return bc_default


# --------------------------------------------------------------------------
# Training
# --------------------------------------------------------------------------
def train(args):
    import torch
    from models.pinn import PINN, predict
    from models.losses import pde_loss, data_loss_full

    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"Device: {device}")

    # Discover and load case data
    meta_path, case_dir, frame_path = discover_case(args.case, args.config)
    print(f"Case: {args.case}/{args.config}")
    print(f"  meta: {meta_path}")
    print(f"  frame: {frame_path}")

    cfg = from_meta(meta_path, case_dir=case_dir, frame_path=frame_path)
    print(f"  shape_type: {cfg.shape_type}")
    print(f"  grid: {cfg.NX}x{cfg.NY} (downsampled: {cfg.nx}x{cfg.ny}, ds={cfg.ds})")
    print(f"  Re={cfg.re}  tau={cfg.tau}  nu={cfg.nu:.5f}  u_inflow={cfg.u_inflow}")

    # Load frame data
    fr = load_frame(frame_path)
    obstacle = fr["obstacle"]
    u_true = fr["u"]
    v_true = fr["v"]
    p_true = fr["p"]

    print(f"  Frame fields: u[{u_true.shape}] v[{v_true.shape}] p[{p_true.shape}]")
    print(f"  u range: [{u_true.min():.4f}, {u_true.max():.4f}]")
    print(f"  obstacle nodes: {int(obstacle.sum())}")

    # Build coordinate grids
    Xn, Yn, _, _ = grid_coords(cfg)
    coords_all = flatten_grid(Xn, Yn)

    # Sample collocation points (exclude obstacle)
    colloc = make_collocation(cfg, args.n_colloc, seed=0, obstacle=obstacle)

    # Sample sensor points
    sens = subsample_sensors(
        u_true, v_true, p_true, obstacle, args.n_sensors, seed=2,
        normalized_coords=coords_all, importance_sample=True,
    )

    # Build BC loss function
    bc_fn = make_bc_fn(cfg, device)

    print(f"  Collocation: {colloc.shape}")
    print(f"  Sensors: {sens['coords'].shape}")
    print(f"  Geometry: {cfg.geometry}")

    # To tensors
    def to_dev(t):
        return t.to(device, dtype=torch.float32)

    colloc_t = to_dev(torch.from_numpy(colloc).requires_grad_(True))
    sens_coords_t = to_dev(torch.from_numpy(sens["coords"]))
    sens_u_t = to_dev(torch.from_numpy(sens["u"]))
    sens_v_t = to_dev(torch.from_numpy(sens["v"]))
    sens_p_t = to_dev(torch.from_numpy(sens["p"]))

    # Model
    model = PINN(hidden=args.hidden, n_layers=args.n_layers).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"  Model params: {n_params}")

    # Optimizer
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, factor=0.5, patience=500, min_lr=1e-5)

    # Output directory
    out_dir = os.path.join(case_dir, "pinn")
    os.makedirs(out_dir, exist_ok=True)

    # Training loop
    t0 = time.time()
    history = {"epoch": [], "loss": [], "pde": [], "data": [], "bc": []}

    print(f"\n--- Adam training ({args.epochs_adam} epochs) ---")
    for ep in range(1, args.epochs_adam + 1):
        optimizer.zero_grad()

        L_pde = pde_loss(model, colloc_t, cfg.re, cfg.u_inflow)
        L_data = data_loss_full(model, sens_coords_t, sens_u_t, sens_v_t, sens_p_t)
        L_bc = bc_fn(model, 200, device)

        L = args.w_pde * L_pde + args.w_data * L_data + args.w_bc * L_bc
        L.backward()
        optimizer.step()
        scheduler.step(L.item())

        if ep % 200 == 0 or ep == 1:
            lr = optimizer.param_groups[0]["lr"]
            print(f"  epoch {ep:5d}  loss={L.item():.6f}  "
                  f"pde={L_pde.item():.6f}  data={L_data.item():.6f}  "
                  f"bc={L_bc.item():.6f}  lr={lr:.2e}")
            history["epoch"].append(ep)
            history["loss"].append(L.item())
            history["pde"].append(L_pde.item())
            history["data"].append(L_data.item())
            history["bc"].append(L_bc.item())

    adam_time = time.time() - t0
    print(f"Adam phase done in {adam_time:.1f}s")

    # L-BFGS fine-tune
    if args.epochs_lbfgs > 0:
        print(f"\n--- L-BFGS fine-tune ({args.epochs_lbfgs} steps) ---")
        t1 = time.time()
        optimizer_lbfgs = torch.optim.LBFGS(
            model.parameters(), lr=1.0,
            max_iter=args.epochs_lbfgs, history_size=100,
            line_search_fn="strong_wolfe")

        def closure():
            optimizer_lbfgs.zero_grad()
            L_pde = pde_loss(model, colloc_t, cfg.re, cfg.u_inflow)
            L_data = data_loss_full(model, sens_coords_t, sens_u_t, sens_v_t, sens_p_t)
            L_bc = bc_fn(model, 200, device)
            L = args.w_pde * L_pde + args.w_data * L_data + args.w_bc * L_bc
            L.backward()
            return L

        L_lbfgs = optimizer_lbfgs.step(closure)
        lbfgs_time = time.time() - t1
        print(f"L-BFGS done in {lbfgs_time:.1f}s  final loss={L_lbfgs.item():.6f}")

    total_time = time.time() - t0
    print(f"\nTotal training time: {total_time:.1f}s ({total_time/60:.1f}min)")

    # Save model
    model_path = os.path.join(out_dir, "model_steady.pt")
    torch.save(model.state_dict(), model_path)
    print(f"Model saved: {model_path}")

    # Inference on full grid
    model.eval()
    coords_t = to_dev(torch.from_numpy(coords_all))
    with torch.no_grad():
        u_pred, v_pred, p_pred = predict(model, coords_t)
    u_pred = u_pred.cpu().numpy().reshape(cfg.ny, cfg.nx)
    v_pred = v_pred.cpu().numpy().reshape(cfg.ny, cfg.nx)
    p_pred = p_pred.cpu().numpy().reshape(cfg.ny, cfg.nx)

    # L2 relative error
    l2_u = np.linalg.norm(u_pred - u_true) / (np.linalg.norm(u_true) + 1e-12)
    l2_v = np.linalg.norm(v_pred - v_true) / (np.linalg.norm(v_true) + 1e-12)
    l2_p = np.linalg.norm(p_pred - p_true) / (np.linalg.norm(p_true) + 1e-12)
    print(f"\nL2 relative error vs LBM:")
    print(f"  u: {l2_u:.4f}  v: {l2_v:.4f}  p: {l2_p:.4f}")

    # Save prediction
    np.savez(os.path.join(out_dir, "prediction_steady.npz"),
             u_pred=u_pred, v_pred=v_pred, p_pred=p_pred,
             u_true=u_true, v_true=v_true, p_true=p_true,
             Xn=Xn, Yn=Yn, obstacle=obstacle,
             l2_u=l2_u, l2_v=l2_v, l2_p=l2_p)
    print(f"Prediction saved: {out_dir}/prediction_steady.npz")

    # Save loss history
    np.savez(os.path.join(out_dir, "loss_history.npz"), **history)
    print(f"Loss history saved: {out_dir}/loss_history.npz")

    # Summary
    print(f"\n=== SUMMARY ===")
    print(f"Case:    {args.case}/{args.config} ({cfg.shape_type})")
    print(f"Device:  {device}")
    print(f"Params:  {n_params}")
    print(f"Time:    {total_time:.1f}s ({total_time/60:.1f}min)")
    print(f"L2 u:    {l2_u:.4f}")
    print(f"L2 v:    {l2_v:.4f}")
    print(f"L2 p:    {l2_p:.4f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generic PINN trainer")
    parser.add_argument("--case", required=True, help="Case name (e.g. cylinder, cavity, step)")
    parser.add_argument("--config", required=True, help="Config name (e.g. re100, re400)")
    parser.add_argument("--hidden", type=int, default=64, help="MLP hidden width")
    parser.add_argument("--n-layers", type=int, default=8, help="MLP depth")
    parser.add_argument("--n-colloc", type=int, default=5000, help="Collocation points")
    parser.add_argument("--n-sensors", type=int, default=1000, help="Sensor points")
    parser.add_argument("--lr", type=float, default=1e-3, help="Adam learning rate")
    parser.add_argument("--epochs-adam", type=int, default=5000, help="Adam epochs")
    parser.add_argument("--epochs-lbfgs", type=int, default=500, help="L-BFGS steps")
    parser.add_argument("--w-pde", type=float, default=1.0, help="PDE loss weight")
    parser.add_argument("--w-data", type=float, default=10.0, help="Data loss weight")
    parser.add_argument("--w-bc", type=float, default=5.0, help="BC loss weight")
    args = parser.parse_args()
    train(args)
