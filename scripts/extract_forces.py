#!/usr/bin/env python3
"""Extract force statistics from forces.jsonl for all configs."""

import json, os, sys
import numpy as np

PROJROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Configs: (output_dir, label, is_normalized)
# is_normalized=True means forces.jsonl has proper Cd/Cl
# is_normalized=False means forces.jsonl has raw Fx/Fy

CONFIGS = [
    # Cavity (proper Cd/Cl)
    ("output/cavity/re100", "cavity_re100", True),
    ("output/cavity/re400", "cavity_re400", True),
    ("output/cavity/re1000", "cavity_re1000", True),
    # Step (raw Fx/Fy)
    ("output/step/re100", "step_re100", False),
    ("output/step/re200", "step_re200", False),
    ("output/step/re400", "step_re400", False),
]


def load_forces(outdir):
    """Load forces.jsonl, return (steps, cd/cl or fx/fy) arrays."""
    path = os.path.join(outdir, "forces.jsonl")
    if not os.path.exists(path):
        return None, None, None
    steps, v1, v2 = [], [], []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
                steps.append(d.get("step", 0))
                v1.append(d.get("cd", 0.0))
                v2.append(d.get("cl", 0.0))
            except json.JSONDecodeError:
                continue
    if not steps:
        return None, None, None
    return np.array(steps), np.array(v1), np.array(v2)


def compute_strouhal(steps, fy, dt=1.0):
    """Compute Strouhal number from fy time series using FFT.
    
    Uses zero-crossing method for more robust frequency detection.
    Returns frequency in (1/lattice time units).
    """
    if len(fy) < 200:
        return None
    
    # Skip first 40% as transient (vortex shedding needs time to develop)
    n_skip = int(len(fy) * 0.4)
    if n_skip < 50:
        n_skip = 50
    fy_seg = fy[n_skip:]
    
    if len(fy_seg) < 100:
        return None
    
    # Zero-crossing method: count upward crossings of the mean
    fy_mean = np.mean(fy_seg)
    crossings = 0
    for i in range(1, len(fy_seg)):
        if fy_seg[i-1] < fy_mean and fy_seg[i] >= fy_mean:
            crossings += 1
    
    if crossings < 2:
        return None
    
    duration = len(fy_seg) * dt
    freq = crossings / (2.0 * duration)  # crossings per half-cycle, so /2 for full cycles
    return freq


def main():
    results = {}
    for outdir, label, is_norm in CONFIGS:
        fulldir = os.path.join(PROJROOT, outdir)
        steps, v1, v2 = load_forces(fulldir)
        if steps is None:
            print(f"{label}: NO FORCES DATA")
            continue

        # Skip first 20% as transient
        n_skip = int(len(v1) * 0.2)
        if n_skip < 10:
            n_skip = 0

        if is_norm:
            # v1=cd, v2=cl (properly normalized)
            cd_mean = np.mean(v1[n_skip:])
            cl_mean = np.mean(v2[n_skip:])
            cl_std = np.std(v2[n_skip:])
            st_raw = compute_strouhal(steps, v2)
            st = st_raw if st_raw else None
            st_str = f"{st:.4f}" if st is not None else "N/A"
            label_str = f"Cd={cd_mean:.3f}  Cl={cl_mean:.3f}  St={st_str}"
        else:
            # v1=fx_total, v2=fy_total (raw forces)
            fx_mean = np.mean(v1[n_skip:])
            fy_mean = np.mean(v2[n_skip:])
            fy_std = np.std(v2[n_skip:])
            st_raw = compute_strouhal(steps, v2)
            st = st_raw if st_raw else None
            cd_mean = fx_mean  # alias for reporting
            cl_mean = fy_mean
            st_str = f"{st:.4f}" if st is not None else "N/A"
            label_str = f"Fx={fx_mean:.2f}  Fy={fy_mean:.2f}  St={st_str}"

        n_steps = int(steps[-1]) if len(steps) > 0 else 0

        results[label] = {
            "is_normalized": is_norm,
            "cd": float(cd_mean),
            "cl": float(cl_mean),
            "st": float(st) if st is not None else None,
            "n_steps": n_steps,
        }

        print(f"{label}: {label_str}  steps={n_steps}")

    # Save results
    outpath = os.path.join(PROJROOT, "output", "force_stats.json")
    with open(outpath, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved to {outpath}")


if __name__ == "__main__":
    main()
