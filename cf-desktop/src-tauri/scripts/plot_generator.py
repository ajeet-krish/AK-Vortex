#!/usr/bin/env python3
"""Generate publication-quality CFD plots from LBM solver frame data.

Produces 4 PNG files:
  1. velocity_contour.png  - Velocity magnitude contour (jet colormap)
  2. streamlines.png       - Streamlines colored by speed
  3. pressure_contour.png  - Pressure coefficient Cp (coolwarm diverging)
  4. vorticity_contour.png - Vorticity field (RdBu diverging)

Usage:
  python3 plot_generator.py \\
    --frame frame_30000.json \\
    --config '{"nx":800,"ny":300,"re":100,"uInflow":0.1,"caseType":"cylinder"}' \\
    --geometry '[{"type":"circle","x":200,"y":150,"radius":30}]' \\
    --output ./plots/
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle, Polygon
from matplotlib.colors import TwoSlopeNorm

# ---------------------------------------------------------------------------
# Publication-quality rcParams
# ---------------------------------------------------------------------------

def _configure_rcParams():
    """Set global matplotlib parameters for publication output."""
    rcParams = matplotlib.rcParams

    # Fonts: prefer STIX Two Sans, fallback to DejaVu Sans, then serif
    rcParams["font.family"] = "sans-serif"
    rcParams["font.sans-serif"] = [
        "STIX Two Sans", "DejaVu Sans", "Arial", "Helvetica"
    ]
    rcParams["mathtext.fontset"] = "stix"

    rcParams["font.size"] = 10
    rcParams["axes.titlesize"] = 14
    rcParams["axes.labelsize"] = 12
    rcParams["xtick.labelsize"] = 10
    rcParams["ytick.labelsize"] = 10
    rcParams["legend.fontsize"] = 10

    rcParams["figure.dpi"] = 150
    rcParams["savefig.dpi"] = 150
    rcParams["savefig.bbox"] = "tight"
    rcParams["savefig.pad_inches"] = 0.1
    rcParams["figure.facecolor"] = "#FFFFFF"
    rcParams["axes.facecolor"] = "#FFFFFF"
    rcParams["axes.edgecolor"] = "#333333"
    rcParams["axes.linewidth"] = 0.8
    rcParams["xtick.color"] = "#333333"
    rcParams["ytick.color"] = "#333333"

    # High-quality rasterization for line art
    rcParams["path.simplify_threshold"] = 1.0 / 72.0
    rcParams["savefig.format"] = "png"

_configure_rcParams()

# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_frame(path: Path) -> dict:
    """Load a LBM frame JSON file and reshape arrays to (ny, nx).

    Returns dict with keys: nx, ny, u, v, p, omega, velocity, obstacle,
    rho (when present).
    """
    with open(path) as fh:
        raw = json.load(fh)

    nx = int(raw["nx"])
    ny = int(raw["ny"])
    n = nx * ny

    frame = {
        "nx": nx,
        "ny": ny,
        "u":       np.asarray(raw["u"],       dtype=np.float64).reshape(ny, nx),
        "v":       np.asarray(raw["v"],       dtype=np.float64).reshape(ny, nx),
        "p":       np.asarray(raw["p"],       dtype=np.float64).reshape(ny, nx),
        "omega":   np.asarray(raw["omega"],   dtype=np.float64).reshape(ny, nx),
        "velocity": np.asarray(raw["velocity"], dtype=np.float64).reshape(ny, nx),
        "obstacle": np.asarray(raw["obstacle"], dtype=np.bool_).reshape(ny, nx),
    }
    if "rho" in raw:
        frame["rho"] = np.asarray(raw["rho"], dtype=np.float64).reshape(ny, nx)

    return frame

# ---------------------------------------------------------------------------
# Geometry overlay
# ---------------------------------------------------------------------------

def _draw_geometry(ax, geometry, nx: int, ny: int, filled: bool = True):
    """Render vector geometry shapes on the given axes.

    Parameters
    ----------
    ax : matplotlib Axes
    geometry : list[dict] or str (JSON-encoded list)
    nx, ny : domain extents
    filled : if True, fill obstacles white with dark border; if False, outline only
    """
    if not geometry:
        return

    shapes = (
        json.loads(geometry) if isinstance(geometry, str) else geometry
    )
    for shape in shapes:
        kind = shape.get("type", "").lower()
        edge_kw = dict(edgecolor="#333333", linewidth=1.0, zorder=10)
        fill_kw = dict(facecolor="#FFFFFF", alpha=0.80) if filled else dict(
            facecolor="none"
        )
        patch = None
        if kind == "circle":
            cx, cy = float(shape["x"]), float(shape["y"])
            r = float(shape["radius"])
            patch = Circle((cx, cy), r, **fill_kw, **edge_kw)
        elif kind == "rectangle":
            rx, ry = float(shape["x"]), float(shape["y"])
            w, h   = float(shape["width"]), float(shape["height"])
            patch = Rectangle((rx, ry), w, h, **fill_kw, **edge_kw)
        elif kind == "polygon":
            pts = [tuple(p) for p in shape["points"]]
            patch = Polygon(pts, closed=True, **fill_kw, **edge_kw)
        if patch is not None:
            ax.add_patch(patch)


def _draw_obstacle_mask(ax, obstacle: np.ndarray, nx: int, ny: int):
    """Draw the boolean obstacle mask as white-filled cells with dark edges."""
    if not obstacle.any():
        return

    obs_img = np.ma.masked_where(~obstacle, np.ones_like(obstacle, dtype=float))
    ax.imshow(obs_img, origin="lower", cmap="Greys",
              vmin=0, vmax=1, extent=[0, nx, 0, ny],
              alpha=0.6, zorder=5, interpolation="nearest")

# ---------------------------------------------------------------------------
# Plotting helpers
# ---------------------------------------------------------------------------

def _add_colorbar(fig, ax, mappable, label: str, shrink: float = 0.82):
    """Attach a colorbar to the right of the axes."""
    cbar = fig.colorbar(mappable, ax=ax, shrink=shrink,
                        pad=0.02, fraction=0.046)
    cbar.set_label(label, fontsize=12)
    cbar.ax.tick_params(labelsize=10)
    return cbar


def _common_setup(ax, nx: int, ny: int, config: dict, geometry):
    """Apply axis limits, labels, and geometry overlay to all plots."""
    ax.set_xlim(0, nx)
    ax.set_ylim(0, ny)
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_aspect("equal")
    _draw_obstacle_mask(ax, None, nx, ny)  # placeholder; caller draws obs
    _draw_geometry(ax, geometry, nx, ny, filled=False)


# ---------------------------------------------------------------------------
# 1. Velocity contour
# ---------------------------------------------------------------------------

def plot_velocity(frame: dict, config: dict, geometry, output_dir: Path):
    """Velocity magnitude contour with jet colormap."""
    nx, ny = frame["nx"], frame["ny"]
    vel = frame["velocity"].copy()
    vel[frame["obstacle"]] = np.nan

    fig, ax = plt.subplots(figsize=(8, 6))
    im = ax.imshow(
        vel, origin="lower", cmap="jet", aspect="equal",
        extent=[0, nx, 0, ny], interpolation="bilinear",
    )
    _draw_obstacle_mask(ax, frame["obstacle"], nx, ny)
    _draw_geometry(ax, geometry, nx, ny, filled=False)

    re = config.get("re", "")
    ax.set_title(f"Velocity Contour - Re={re}", fontweight="bold")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_xlim(0, nx)
    ax.set_ylim(0, ny)
    ax.set_aspect("equal")

    _add_colorbar(fig, ax, im, "|V| (lattice units)")
    fig.savefig(output_dir / "velocity_contour.png")
    plt.close(fig)


# ---------------------------------------------------------------------------
# 2. Streamlines
# ---------------------------------------------------------------------------

def plot_streamlines(frame: dict, config: dict, geometry, output_dir: Path):
    """Streamlines colored by local speed."""
    nx, ny = frame["nx"], frame["ny"]
    u = frame["u"].copy()
    v = frame["v"].copy()
    u[frame["obstacle"]] = np.nan
    v[frame["obstacle"]] = np.nan

    speed = np.sqrt(u**2 + v**2)

    fig, ax = plt.subplots(figsize=(8, 6))

    # streamplot requires 1-D coordinate arrays
    xs = np.linspace(0, nx, nx, endpoint=False)
    ys = np.linspace(0, ny, ny, endpoint=False)

    strm = ax.streamplot(
        xs, ys, u, v, color=speed, cmap="jet",
        density=1.5, linewidth=0.8, arrowsize=0,
        broken_streamlines=False,
    )

    _draw_obstacle_mask(ax, frame["obstacle"], nx, ny)
    _draw_geometry(ax, geometry, nx, ny, filled=False)

    re = config.get("re", "")
    ax.set_title(f"Velocity Streamlines - Re={re}", fontweight="bold")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_xlim(0, nx)
    ax.set_ylim(0, ny)
    ax.set_aspect("equal")

    _add_colorbar(fig, ax, strm.lines, "Speed (lattice units)")
    fig.savefig(output_dir / "streamlines.png")
    plt.close(fig)


# ---------------------------------------------------------------------------
# 3. Pressure coefficient
# ---------------------------------------------------------------------------

def plot_pressure(frame: dict, config: dict, geometry, output_dir: Path):
    """Pressure coefficient Cp contour with symmetric coolwarm colormap."""
    nx, ny = frame["nx"], frame["ny"]
    p = frame["p"].copy()
    p[frame["obstacle"]] = np.nan

    # Reference quantities from config
    u_ref = config.get("uInflow", 0.1)
    rho_ref = 1.0
    q_ref = 0.5 * rho_ref * u_ref**2

    # Reference pressure: inlet average (leftmost 5 columns)
    inlet_mask = np.zeros_like(p, dtype=bool)
    inlet_mask[:, :min(5, nx)] = True
    inlet_mask &= ~frame["obstacle"]
    p_ref = np.nanmean(p[inlet_mask]) if inlet_mask.any() else np.nanmean(p)

    cp = (p - p_ref) / q_ref if q_ref > 0 else p * 0.0

    # Clamp extreme values for a readable colorbar
    cp_clamp = np.nanpercentile(np.abs(cp), 99.5)
    if cp_clamp == 0:
        cp_clamp = 1.0

    fig, ax = plt.subplots(figsize=(8, 6))
    im = ax.imshow(
        cp, origin="lower", cmap="coolwarm", aspect="equal",
        extent=[0, nx, 0, ny], interpolation="bilinear",
        vmin=-cp_clamp, vmax=cp_clamp,
    )
    _draw_obstacle_mask(ax, frame["obstacle"], nx, ny)
    _draw_geometry(ax, geometry, nx, ny, filled=False)

    re = config.get("re", "")
    ax.set_title(f"Pressure Coefficient - Re={re}", fontweight="bold")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_xlim(0, nx)
    ax.set_ylim(0, ny)
    ax.set_aspect("equal")

    _add_colorbar(fig, ax, im, "Cp")
    fig.savefig(output_dir / "pressure_contour.png")
    plt.close(fig)


# ---------------------------------------------------------------------------
# 4. Vorticity
# ---------------------------------------------------------------------------

def plot_vorticity(frame: dict, config: dict, geometry, output_dir: Path):
    """Vorticity contour with symmetric RdBu diverging colormap."""
    nx, ny = frame["nx"], frame["ny"]
    omega = frame["omega"].copy()
    omega[frame["obstacle"]] = np.nan

    # Symmetric range centred on zero
    omega_clamp = np.nanpercentile(np.abs(omega), 99.5)
    if omega_clamp == 0:
        omega_clamp = 1e-6

    fig, ax = plt.subplots(figsize=(8, 6))
    im = ax.imshow(
        omega, origin="lower", cmap="RdBu", aspect="equal",
        extent=[0, nx, 0, ny], interpolation="bilinear",
        vmin=-omega_clamp, vmax=omega_clamp,
    )
    _draw_obstacle_mask(ax, frame["obstacle"], nx, ny)
    _draw_geometry(ax, geometry, nx, ny, filled=False)

    re = config.get("re", "")
    ax.set_title(f"Vorticity - Re={re}", fontweight="bold")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_xlim(0, nx)
    ax.set_ylim(0, ny)
    ax.set_aspect("equal")

    _add_colorbar(fig, ax, im, r"$\omega$ (s$^{-1}$)")
    fig.savefig(output_dir / "vorticity_contour.png")
    plt.close(fig)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Generate publication-quality CFD report plots from LBM frame data.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Example:\n"
            "  python3 plot_generator.py \\\n"
            "    --frame output/cylinder/re100/frames/frame_10000.json \\\n"
            "    --config '{\"nx\":100,\"ny\":50,\"re\":100,"
            "\"uInflow\":0.1,\"caseType\":\"cylinder\"}' \\\n"
            "    --output /tmp/plots/\n"
        ),
    )
    parser.add_argument(
        "--frame", required=True, type=Path,
        help="Path to LBM frame JSON file",
    )
    parser.add_argument(
        "--geometry", default="[]",
        help="JSON array of geometry shapes (circle, rectangle, polygon)",
    )
    parser.add_argument(
        "--config", required=True,
        help='JSON object with nx, ny, re, uInflow, caseType',
    )
    parser.add_argument(
        "--output", required=True, type=Path,
        help="Directory to write the 4 PNG files",
    )
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)

    # Validate inputs --------------------------------------------------------
    if not args.frame.is_file():
        print(f"ERROR: frame file not found: {args.frame}", file=sys.stderr)
        return 1

    output_dir: Path = args.output
    output_dir.mkdir(parents=True, exist_ok=True)

    # Parse config
    try:
        config = json.loads(args.config)
    except json.JSONDecodeError as exc:
        print(f"ERROR: invalid --config JSON: {exc}", file=sys.stderr)
        return 1

    # Parse geometry (allow empty / null)
    geometry = None
    if args.geometry and args.geometry.strip() not in ("", "[]", "null"):
        try:
            geometry = json.loads(args.geometry)
        except json.JSONDecodeError as exc:
            print(f"WARNING: invalid --geometry JSON, skipping overlay: {exc}",
                  file=sys.stderr)

    # Load data --------------------------------------------------------------
    try:
        frame = load_frame(args.frame)
    except Exception as exc:
        print(f"ERROR: failed to load frame: {exc}", file=sys.stderr)
        return 1

    # Generate plots ---------------------------------------------------------
    try:
        plot_velocity(frame, config, geometry, output_dir)
        plot_streamlines(frame, config, geometry, output_dir)
        plot_pressure(frame, config, geometry, output_dir)
        plot_vorticity(frame, config, geometry, output_dir)
    except Exception as exc:
        print(f"ERROR: plotting failed: {exc}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1

    # Verify output ----------------------------------------------------------
    expected = [
        "velocity_contour.png",
        "streamlines.png",
        "pressure_contour.png",
        "vorticity_contour.png",
    ]
    for name in expected:
        p = output_dir / name
        if p.is_file():
            size_kb = p.stat().st_size / 1024
            print(f"  OK  {p}  ({size_kb:.1f} KB)")
        else:
            print(f"  MISSING  {p}", file=sys.stderr)
            return 1

    print(f"\nAll 4 plots written to {output_dir}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
