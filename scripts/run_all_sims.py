#!/usr/bin/env python3
"""
Run all LBM-2D simulations with tiered grid resolution.

Usage:
    python3 scripts/run_all_sims.py [--dry-run] [--tier 1|2|3] [--case CASE]

Grid tiers:
    Tier 1 (1600x600): Cylinder, Cavity, Flat Plate
    Tier 2 (1200x450): Step, Square Cylinder, Periodic Hills, Cylinder Near Wall,
                       Side-by-Side, Rotating Cylinder
    Tier 3 (defaults): Orifice Plate, Urban Canyon, Downwash
"""

import subprocess
import os
import sys
import argparse
import time

BUILD_DIR = os.path.join(os.path.dirname(__file__), '..', 'build')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'output')

# Tier 1: 1600x600
TIER1 = [
    # Cylinder
    {'exe': 'LBM_Engine', 'args': ['100', '30000', '--nx', '1600', '--ny', '600'],
     'out': 'cylinder/re100', 'label': 'Cylinder Re=100 (1600x600)'},
    {'exe': 'LBM_Engine', 'args': ['200', '30000', '--nx', '1600', '--ny', '600'],
     'out': 'cylinder/re200', 'label': 'Cylinder Re=200 (1600x600)'},
    # Cavity (uses positional nx arg)
    {'exe': 'LBM_Cavity', 'args': ['100', '512', '50000'],
     'out': 'cavity/re100', 'label': 'Cavity Re=100 (512x512)'},
    {'exe': 'LBM_Cavity', 'args': ['400', '512', '50000'],
     'out': 'cavity/re400', 'label': 'Cavity Re=400 (512x512)'},
    {'exe': 'LBM_Cavity', 'args': ['1000', '512', '50000'],
     'out': 'cavity/re1000', 'label': 'Cavity Re=1000 (512x512)'},
    # Flat Plate
    {'exe': 'LBM_FlatPlate', 'args': ['1000', '0', '30000', '--nx', '1600', '--ny', '600'],
     'out': 'flatplate/re1000_aoa0', 'label': 'Flat Plate Re=1000 AoA=0 (1600x600)'},
    {'exe': 'LBM_FlatPlate', 'args': ['1000', '5', '30000', '--nx', '1600', '--ny', '600'],
     'out': 'flatplate/re1000_aoa5', 'label': 'Flat Plate Re=1000 AoA=5 (1600x600)'},
    {'exe': 'LBM_FlatPlate', 'args': ['1000', '10', '30000', '--nx', '1600', '--ny', '600'],
     'out': 'flatplate/re1000_aoa10', 'label': 'Flat Plate Re=1000 AoA=10 (1600x600)'},
    {'exe': 'LBM_FlatPlate', 'args': ['500', '0', '30000', '--nx', '1600', '--ny', '600'],
     'out': 'flatplate/re500_aoa0', 'label': 'Flat Plate Re=500 AoA=0 (1600x600)'},
    {'exe': 'LBM_FlatPlate', 'args': ['2000', '0', '30000', '--nx', '1600', '--ny', '600'],
     'out': 'flatplate/re2000_aoa0', 'label': 'Flat Plate Re=2000 AoA=0 (1600x600)'},
]

# Tier 2: 1200x450
TIER2 = [
    # Step
    {'exe': 'LBM_Step', 'args': ['100', '30000', '--nx', '1200', '--ny', '450'],
     'out': 'step/re100', 'label': 'Step Re=100 (1200x450)'},
    {'exe': 'LBM_Step', 'args': ['200', '30000', '--nx', '1200', '--ny', '450'],
     'out': 'step/re200', 'label': 'Step Re=200 (1200x450)'},
    {'exe': 'LBM_Step', 'args': ['400', '30000', '--nx', '1200', '--ny', '450'],
     'out': 'step/re400', 'label': 'Step Re=400 (1200x450)'},
    # Square Cylinder
    {'exe': 'LBM_SquareCylinder', 'args': ['200', '30000', '--nx', '1200', '--ny', '450'],
     'out': 'square_cylinder/re200', 'label': 'Square Cylinder Re=200 (1200x450)'},
    # Periodic Hills
    {'exe': 'LBM_PeriodicHills', 'args': ['100', '30000', '--nx', '1600', '--ny', '450'],
     'out': 'periodic_hills/re100', 'label': 'Periodic Hills Re=100 (1600x450)'},
    {'exe': 'LBM_PeriodicHills', 'args': ['1000', '60000', '--nx', '1600', '--ny', '450', '--use-les'],
     'out': 'periodic_hills/re1000', 'label': 'Periodic Hills Re=1000 (1600x450)'},
    {'exe': 'LBM_PeriodicHills', 'args': ['2800', '60000', '--nx', '1600', '--ny', '450', '--use-les'],
     'out': 'periodic_hills/re2800', 'label': 'Periodic Hills Re=2800 (1600x450)'},
    # Cylinder Near Wall
    {'exe': 'LBM_CylinderNearWall', 'args': ['100', '10', '30000', '--nx', '1200', '--ny', '450'],
     'out': 'cylinder_near_wall/re100_gap10', 'label': 'Cylinder Near Wall gap=10 (1200x450)'},
    {'exe': 'LBM_CylinderNearWall', 'args': ['100', '20', '30000', '--nx', '1200', '--ny', '450'],
     'out': 'cylinder_near_wall/re100_gap20', 'label': 'Cylinder Near Wall gap=20 (1200x450)'},
    {'exe': 'LBM_CylinderNearWall', 'args': ['100', '40', '30000', '--nx', '1200', '--ny', '450'],
     'out': 'cylinder_near_wall/re100_gap40', 'label': 'Cylinder Near Wall gap=40 (1200x450)'},
    # Side-by-Side
    {'exe': 'LBM_SideBySide', 'args': ['100', '2', '30000', '--nx', '1200', '--ny', '450'],
     'out': 'side_by_side/re100_sd20', 'label': 'Side-by-Side S/D=2 (1200x450)'},
    {'exe': 'LBM_SideBySide', 'args': ['100', '3', '30000', '--nx', '1200', '--ny', '450'],
     'out': 'side_by_side/re100_sd30', 'label': 'Side-by-Side S/D=3 (1200x450)'},
    {'exe': 'LBM_SideBySide', 'args': ['100', '5', '30000', '--nx', '1200', '--ny', '450'],
     'out': 'side_by_side/re100_sd50', 'label': 'Side-by-Side S/D=5 (1200x450)'},
    # Rotating Cylinder
    {'exe': 'LBM_RotatingCylinder', 'args': ['100', '0.5', '30000', '--nx', '1200', '--ny', '450'],
     'out': 'rotating_cylinder/re100_w5', 'label': 'Rotating Cylinder w=0.5 (1200x450)'},
    {'exe': 'LBM_RotatingCylinder', 'args': ['100', '1.0', '30000', '--nx', '1200', '--ny', '450'],
     'out': 'rotating_cylinder/re100_w10', 'label': 'Rotating Cylinder w=1.0 (1200x450)'},
    {'exe': 'LBM_RotatingCylinder', 'args': ['100', '2.0', '30000', '--nx', '1200', '--ny', '450'],
     'out': 'rotating_cylinder/re100_w20', 'label': 'Rotating Cylinder w=2.0 (1200x450)'},
]

# Tier 3: Keep defaults (800x300 / 900x400)
TIER3 = [
    # Orifice Plate
    {'exe': 'LBM_OrificePlate', 'args': ['100', '1p1h', '30000'],
     'out': 'orifice_plate/re100_1p1h', 'label': 'Orifice 1p1h Re=100 (800x300)'},
    {'exe': 'LBM_OrificePlate', 'args': ['100', '1p3h', '30000'],
     'out': 'orifice_plate/re100_1p3h', 'label': 'Orifice 1p3h Re=100 (800x300)'},
    {'exe': 'LBM_OrificePlate', 'args': ['100', '2p', '30000'],
     'out': 'orifice_plate/re100_2p', 'label': 'Orifice 2p Re=100 (800x300)'},
    {'exe': 'LBM_OrificePlate', 'args': ['100', '3p', '30000'],
     'out': 'orifice_plate/re100_3p', 'label': 'Orifice 3p Re=100 (800x300)'},
    # Urban Canyon
    {'exe': 'LBM_UrbanCanyon', 'args': ['--mode', 'side', '--ar', '0.3', '30000'],
     'out': 'urban/side_ar0.3_re100', 'label': 'Urban Side AR=0.3 (900x400)'},
    {'exe': 'LBM_UrbanCanyon', 'args': ['--mode', 'side', '--ar', '0.5', '30000'],
     'out': 'urban/side_ar0.5_re100', 'label': 'Urban Side AR=0.5 (900x400)'},
    {'exe': 'LBM_UrbanCanyon', 'args': ['--mode', 'side', '--ar', '0.8', '30000'],
     'out': 'urban/side_ar0.8_re100', 'label': 'Urban Side AR=0.8 (900x400)'},
    {'exe': 'LBM_UrbanCanyon', 'args': ['--mode', 'topdown', '30000'],
     'out': 'urban/topdown_re100', 'label': 'Urban Topdown (900x400)'},
    # Downwash
    {'exe': 'LBM_Downwash', 'args': ['100', '30000'],
     'out': 'urban/downwash_re100', 'label': 'Downwash Re=100 (900x400)'},
]

ALL_SIMS = TIER1 + TIER2 + TIER3


def run_sim(sim, dry_run=False):
    exe_path = os.path.join(BUILD_DIR, sim['exe'])
    if not os.path.exists(exe_path):
        print(f"  ERROR: {exe_path} not found. Build first.")
        return False

    cmd = [exe_path] + sim['args']
    print(f"  CMD: {' '.join(cmd)}")

    if dry_run:
        return True

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
        if result.returncode != 0:
            print(f"  FAILED (exit {result.returncode})")
            print(f"  STDERR: {result.stderr[:500]}")
            return False
        print(f"  OK")
        return True
    except subprocess.TimeoutExpired:
        print(f"  TIMEOUT (2h limit)")
        return False


def postprocess_sim(sim, dry_run=False):
    script = os.path.join(os.path.dirname(__file__), 'postprocess.py')
    out_dir = os.path.join(OUTPUT_DIR, sim['out'])
    if not os.path.isdir(out_dir):
        print(f"  No output directory: {out_dir}")
        return False

    # Determine image prefix for website (e.g., re100 for cylinder, re100_gap10 for near_wall)
    out_parts = sim['out'].split('/')
    case_name = out_parts[0]  # e.g., "cylinder", "step"
    config = out_parts[1] if len(out_parts) > 1 else ''  # e.g., "re100", "re100_gap10"

    cmd = ['python3', script, out_dir, '--split', '--cmap', 'jet']
    print(f"  POST: {' '.join(cmd)}")

    if dry_run:
        return True

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            print(f"  POST FAILED: {result.stderr[:200]}")
            return False

        # Copy last-frame PNGs to docs/assets/images/{case}/ with correct names
        import glob
        import shutil
        docs_images = os.path.join(os.path.dirname(__file__), '..', 'docs', 'assets', 'images', case_name)
        os.makedirs(docs_images, exist_ok=True)

        # Find the last contour and streamline PNGs
        contour_files = sorted(glob.glob(os.path.join(out_dir, 'contour_*.png')))
        stream_files = sorted(glob.glob(os.path.join(out_dir, 'streamlines_*.png')))

        if contour_files:
            src = contour_files[-1]
            dst = os.path.join(docs_images, f'{config}_contour.png')
            shutil.copy2(src, dst)
            print(f"  -> {dst}")

        if stream_files:
            src = stream_files[-1]
            dst = os.path.join(docs_images, f'{config}_streamlines.png')
            shutil.copy2(src, dst)
            print(f"  -> {dst}")

        return True
    except subprocess.TimeoutExpired:
        print(f"  POST TIMEOUT")
        return False


def main():
    parser = argparse.ArgumentParser(description='Run all LBM-2D simulations')
    parser.add_argument('--dry-run', action='store_true', help='Print commands without running')
    parser.add_argument('--tier', type=int, choices=[1, 2, 3], help='Run only this tier')
    parser.add_argument('--case', type=str, help='Run only cases matching this substring')
    parser.add_argument('--skip-postprocess', action='store_true', help='Skip post-processing')
    args = parser.parse_args()

    sims = ALL_SIMS
    if args.tier == 1:
        sims = TIER1
    elif args.tier == 2:
        sims = TIER2
    elif args.tier == 3:
        sims = TIER3

    if args.case:
        sims = [s for s in sims if args.case.lower() in s['label'].lower()]

    print(f"Running {len(sims)} simulations")
    print(f"Output directory: {OUTPUT_DIR}")
    print()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    passed = 0
    failed = 0
    t0 = time.time()

    for i, sim in enumerate(sims, 1):
        print(f"[{i}/{len(sims)}] {sim['label']}")
        if run_sim(sim, args.dry_run):
            passed += 1
            if not args.dry_run and not args.skip_postprocess:
                postprocess_sim(sim, args.dry_run)
        else:
            failed += 1
        print()

    elapsed = time.time() - t0
    print(f"Done: {passed} passed, {failed} failed, {elapsed:.0f}s elapsed")


if __name__ == '__main__':
    main()
