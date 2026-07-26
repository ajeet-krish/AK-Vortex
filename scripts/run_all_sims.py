#!/usr/bin/env python3
"""
Run all LBM-2D simulations with tiered grid resolution.

Usage:
    python3 scripts/run_all_sims.py [--dry-run] [--tier 1|2|3] [--case CASE]

Grid tiers:
    Tier 1 (1200x1200/512x512/1200x900/3200x600): Cylinder, Cavity, Flat Plate, Step
    Tier 2 (1600x600/1200x1000/1600x1000): Cylinder Near Wall, Side-by-Side, Rotating Cylinder, Orifice
    Tier 3 (src defaults): Urban Canyon, Downwash, City Grid
"""

import subprocess
import os
import sys
import argparse
import time

BUILD_DIR = os.path.join(os.path.dirname(__file__), '..', 'build')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'output')
LOG_DIR = os.path.join(os.path.dirname(__file__), '..', 'output', 'logs')

# Tier 1: 1200x1200 / 512x512 / 1200x900 / 3200x600
TIER1 = [
    # Cylinder (radius=30, D=60, 5% blockage at NY=1200)
    {'exe': 'LBM_Engine', 'args': ['100', '30000', '--nx', '1200', '--ny', '1200'],
     'out': 'cylinder/re100', 'label': 'Cylinder Re=100 (1200x1200)'},
    {'exe': 'LBM_Engine', 'args': ['200', '30000', '--nx', '1200', '--ny', '1200'],
     'out': 'cylinder/re200', 'label': 'Cylinder Re=200 (1200x1200)'},
    {'exe': 'LBM_Engine', 'args': ['1000', '40000', '--nx', '1200', '--ny', '1200', '--use-les'],
     'out': 'cylinder/re1000', 'label': 'Cylinder Re=1000 (1200x1200)'},
    # Cavity (uses positional nx arg, no --nx/--ny needed)
    {'exe': 'LBM_Cavity', 'args': ['100', '512', '50000'],
     'out': 'cavity/re100', 'label': 'Cavity Re=100 (512x512)'},
    {'exe': 'LBM_Cavity', 'args': ['400', '512', '50000'],
     'out': 'cavity/re400', 'label': 'Cavity Re=400 (512x512)'},
    {'exe': 'LBM_Cavity', 'args': ['1000', '512', '50000'],
     'out': 'cavity/re1000', 'label': 'Cavity Re=1000 (512x512)'},
    # Flat Plate (chord=200)
    {'exe': 'LBM_FlatPlate', 'args': ['1000', '0', '30000', '--nx', '1200', '--ny', '900'],
     'out': 'flatplate/re1000_aoa0', 'label': 'Flat Plate Re=1000 AoA=0 (1200x900)'},
    {'exe': 'LBM_FlatPlate', 'args': ['1000', '5', '30000', '--nx', '1200', '--ny', '900'],
     'out': 'flatplate/re1000_aoa5', 'label': 'Flat Plate Re=1000 AoA=5 (1200x900)'},
    {'exe': 'LBM_FlatPlate', 'args': ['1000', '10', '30000', '--nx', '1200', '--ny', '900'],
     'out': 'flatplate/re1000_aoa10', 'label': 'Flat Plate Re=1000 AoA=10 (1200x900)'},
    {'exe': 'LBM_FlatPlate', 'args': ['500', '0', '30000', '--nx', '1200', '--ny', '900'],
     'out': 'flatplate/re500_aoa0', 'label': 'Flat Plate Re=500 AoA=0 (1200x900)'},
    {'exe': 'LBM_FlatPlate', 'args': ['2000', '0', '30000', '--nx', '1200', '--ny', '900'],
     'out': 'flatplate/re2000_aoa0', 'label': 'Flat Plate Re=2000 AoA=0 (1200x900)'},
    # Backward-facing step (Armaly benchmark, 2:1 expansion, L/H=8)
    {'exe': 'LBM_Step', 'args': ['100', '30000', '--nx', '3200', '--ny', '600'],
     'out': 'step/re100', 'label': 'Step Re=100 (3200x600, 2:1 ER, L/H=8)'},
    {'exe': 'LBM_Step', 'args': ['200', '30000'],
     'out': 'step/re200', 'label': 'Step Re=200 (3200x600 default, 2:1 ER, L/H=8)'},
    {'exe': 'LBM_Step', 'args': ['400', '30000'],
     'out': 'step/re400', 'label': 'Step Re=400 (3200x600 default, 2:1 ER, L/H=8)'},
]

# Tier 2: 1600x600 / 1200x1000 / 1600x1000
TIER2 = [
    # Cylinder Near Wall (radius=30, gap=15/20/40)
    {'exe': 'LBM_CylinderNearWall', 'args': ['100', '15', '30000', '--nx', '1600', '--ny', '600'],
     'out': 'cylinder_near_wall/re100_gap15', 'label': 'Cylinder Near Wall gap=15 (1600x600)'},
    {'exe': 'LBM_CylinderNearWall', 'args': ['100', '20', '30000', '--nx', '1600', '--ny', '600'],
     'out': 'cylinder_near_wall/re100_gap20', 'label': 'Cylinder Near Wall gap=20 (1600x600)'},
    {'exe': 'LBM_CylinderNearWall', 'args': ['100', '40', '30000', '--nx', '1600', '--ny', '600'],
     'out': 'cylinder_near_wall/re100_gap40', 'label': 'Cylinder Near Wall gap=40 (1600x600)'},
    # Side-by-Side (radius=30, D=60 at NY=1000, 6% blockage)
    {'exe': 'LBM_SideBySide', 'args': ['100', '2', '30000', '--nx', '1200', '--ny', '1000'],
     'out': 'side_by_side/re100_sd20', 'label': 'Side-by-Side S/D=2 (1200x1000)'},
    {'exe': 'LBM_SideBySide', 'args': ['100', '3', '30000', '--nx', '1200', '--ny', '1000'],
     'out': 'side_by_side/re100_sd30', 'label': 'Side-by-Side S/D=3 (1200x1000)'},
    {'exe': 'LBM_SideBySide', 'args': ['100', '5', '30000', '--nx', '1200', '--ny', '1000'],
     'out': 'side_by_side/re100_sd50', 'label': 'Side-by-Side S/D=5 (1200x1000)'},
    # Rotating Cylinder (radius=30, D=60 at NY=800)
    {'exe': 'LBM_RotatingCylinder', 'args': ['100', '0.5', '30000', '--nx', '1200', '--ny', '800'],
     'out': 'rotating_cylinder/re100_w5', 'label': 'Rotating Cylinder w=0.5 (1200x800)'},
    {'exe': 'LBM_RotatingCylinder', 'args': ['100', '1.0', '30000', '--nx', '1200', '--ny', '800'],
     'out': 'rotating_cylinder/re100_w10', 'label': 'Rotating Cylinder w=1.0 (1200x800)'},
    {'exe': 'LBM_RotatingCylinder', 'args': ['100', '2.0', '30000', '--nx', '1200', '--ny', '800'],
     'out': 'rotating_cylinder/re100_w20', 'label': 'Rotating Cylinder w=2.0 (1200x800)'},
    # Orifice Plate (1600x1000 grid)
    {'exe': 'LBM_OrificePlate', 'args': ['100', '1p1h', '30000', '--nx', '1600', '--ny', '1000'],
     'out': 'orifice_plate/re100_1p1h', 'label': 'Orifice 1p1h Re=100 (1600x1000)'},
    {'exe': 'LBM_OrificePlate', 'args': ['100', '1p3h', '30000', '--nx', '1600', '--ny', '1000'],
     'out': 'orifice_plate/re100_1p3h', 'label': 'Orifice 1p3h Re=100 (1600x1000)'},
    {'exe': 'LBM_OrificePlate', 'args': ['100', '2p', '30000', '--nx', '1600', '--ny', '1000'],
     'out': 'orifice_plate/re100_2p', 'label': 'Orifice 2p Re=100 (1600x1000)'},
    {'exe': 'LBM_OrificePlate', 'args': ['100', '3p', '30000', '--nx', '1600', '--ny', '1000'],
     'out': 'orifice_plate/re100_3p', 'label': 'Orifice 3p Re=100 (1600x1000)'},
]

# Tier 3: Source-defined defaults (Urban Canyon 900x400, Downwash 800x300, City Grid 1600x1200)
TIER3 = [
    # Urban Canyon (default 900x400, hardcoded in urban_canyon.cpp)
    {'exe': 'LBM_UrbanCanyon', 'args': ['--mode', 'side', '--ar', '0.3', '100', '30000'],
     'out': 'urban/side/2p_ar0.3_re100', 'label': 'Urban Side AR=0.3 (900x400)'},
    {'exe': 'LBM_UrbanCanyon', 'args': ['--mode', 'side', '--ar', '0.5', '100', '30000'],
     'out': 'urban/side/2p_ar0.5_re100', 'label': 'Urban Side AR=0.5 (900x400)'},
    {'exe': 'LBM_UrbanCanyon', 'args': ['--mode', 'side', '--ar', '0.6', '--nb', '3', '100', '30000'],
     'out': 'urban/side/3p_ar0.6_re100', 'label': 'Urban Side AR=0.6 3-bldg (900x400)'},
    {'exe': 'LBM_UrbanCanyon', 'args': ['--mode', 'side', '--ar', '0.8', '100', '30000'],
     'out': 'urban/side/2p_ar0.8_re100', 'label': 'Urban Side AR=0.8 (900x400)'},
    {'exe': 'LBM_UrbanCanyon', 'args': ['--mode', 'topdown', '100', '30000'],
     'out': 'urban/topdown_v/re100', 'label': 'Urban Topdown Vertical (900x400)'},
    {'exe': 'LBM_UrbanCanyon', 'args': ['--mode', 'topdown', '--orient', 'horizontal', '100', '30000'],
     'out': 'urban/topdown_h/re100', 'label': 'Urban Topdown Horizontal (900x400)'},
    # Downwash (default 800x300, hardcoded in downwash.cpp)
    {'exe': 'LBM_Downwash', 'args': ['100', '30000'],
     'out': 'urban/downwash/re100', 'label': 'Downwash Re=100 (800x300)'},
    # Urban City Grid (1600x1200, east-only; south/west deferred)
    {'exe': 'LBM_UrbanCityGrid', 'args': ['100', '30000', '--inlet', 'east'],
     'out': 'urban/city_grid/inlet_east', 'label': 'City Grid East Wind (1600x1200)'},
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


def get_image_paths(case_name, config):
    """Return (img_subdir, filename_prefix) for a given case and config string.
    Matches the HTML imageBasePath + imageSuffix pattern used by viewer-common-v2.js."""
    # Extract short_config (config.file equivalent) by stripping leading re<number>_
    import re as _re
    short_config = config
    m = _re.match(r'^re\d+_(.+)$', config)
    if m:
        short_config = m.group(1)

    if case_name == 'cylinder':
        re_id = config.lstrip('re')
        return ('simulations/re' + re_id, 're' + re_id)
    elif case_name == 'step':
        re_id = config.lstrip('re')
        return ('simulations/re' + re_id, 're' + re_id)
    elif case_name == 'flatplate':
        if config.startswith('re') and '_' in config[2:]:
            parts = config.split('_', 1)
            re_part = parts[0]
            aoa_part = parts[1]
            return ('simulations/' + re_part + '/' + aoa_part, config)
        return ('simulations', config)
    elif case_name == 'orifice_plate':
        return ('simulations/' + short_config, config)
    elif case_name == 'cylinder_near_wall':
        return ('simulation/' + short_config, config)
    elif case_name == 'side_by_side':
        return ('simulations/' + short_config, config)
    elif case_name == 'rotating_cylinder':
        return ('simulations/' + short_config, config)
    elif case_name == 'urban':
        parts = config.split('/')
        section = parts[0]
        if section == 'side':
            subdir_part = parts[1]
            ar_part = subdir_part.rsplit('_re', 1)[0]
            ar_val = ar_part.rsplit('_ar', 1)[-1]  # '0.3', '0.5', '0.6', '0.8'
            ar_digits = ar_val.replace('.', '')  # '03', '05', '06', '08'
            fname = 'side_a' + ar_digits
            return ('simulations/side/' + ar_part, fname)
        elif section == 'topdown_v':
            return ('simulations/topdown_v', 'topdown')
        elif section == 'topdown_h':
            return ('simulations/topdown_h', 'topdown_h')
        elif section == 'downwash':
            return ('simulations/downwash', 'downwash')
        elif section == 'city_grid':
            inlet = parts[1]
            suffix = inlet.split('_', 1)[1] if '_' in inlet else inlet
            return ('simulations/city_grid/' + inlet, 'lbm_' + suffix)
        return ('simulations', config)
    else:
        return ('', config)


def postprocess_sim(sim, dry_run=False):
    script = os.path.join(os.path.dirname(__file__), 'postprocess.py')
    out_dir = os.path.join(OUTPUT_DIR, sim['out'])
    if not os.path.isdir(out_dir):
        print(f"  No output directory: {out_dir}")
        return False

    out_parts = sim['out'].split('/')
    case_name = out_parts[0]
    config = '/'.join(out_parts[1:]) if len(out_parts) > 1 else ''

    cmd = ['python3', script, out_dir, '--split', '--cmap', 'jet']
    print(f"  POST: {' '.join(cmd)}")

    if dry_run:
        return True

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            print(f"  POST FAILED: {result.stderr[:200]}")
            return False

        cmd_vort = ['python3', script, out_dir, '--vorticity']
        subprocess.run(cmd_vort, capture_output=True, text=True, timeout=300)

        cmd_cp = ['python3', script, out_dir, '--cp']
        subprocess.run(cmd_cp, capture_output=True, text=True, timeout=300)

        # Export binary data for FlowViewer
        export_script = os.path.join(os.path.dirname(__file__), '..', 'pinn', 'export', 'export_web_data.py')
        if os.path.exists(export_script):
            cmd_export = ['python3', export_script, '--case', case_name]
            subprocess.run(cmd_export, capture_output=True, text=True, timeout=120)

        import glob
        import shutil

        img_subdir, fname_prefix = get_image_paths(case_name, config)
        docs_images = os.path.join(os.path.dirname(__file__), '..', 'docs', 'assets', 'images', case_name, img_subdir)
        os.makedirs(docs_images, exist_ok=True)

        contour_files = sorted(glob.glob(os.path.join(out_dir, 'contour_*.png')))
        stream_files = sorted(glob.glob(os.path.join(out_dir, 'streamlines_*.png')))
        vort_files = sorted(glob.glob(os.path.join(out_dir, 'vorticity_*.png')))
        cp_files = sorted(glob.glob(os.path.join(out_dir, 'cp_*.png')))

        if contour_files:
            shutil.copy2(contour_files[-1], os.path.join(docs_images, fname_prefix + '_contour.png'))
            print(f"  -> {os.path.join(docs_images, fname_prefix + '_contour.png')}")

        if stream_files:
            shutil.copy2(stream_files[-1], os.path.join(docs_images, fname_prefix + '_streamlines.png'))
            print(f"  -> {os.path.join(docs_images, fname_prefix + '_streamlines.png')}")

        if vort_files:
            shutil.copy2(vort_files[-1], os.path.join(docs_images, fname_prefix + '_vorticity.png'))
            print(f"  -> {os.path.join(docs_images, fname_prefix + '_vorticity.png')}")

        if cp_files:
            shutil.copy2(cp_files[-1], os.path.join(docs_images, fname_prefix + '_cp.png'))
            print(f"  -> {os.path.join(docs_images, fname_prefix + '_cp.png')}")

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
    parser.add_argument('--log', type=str, default=None,
                        help='Log file path (default: output/logs/run_all_sims.log)')
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

    # Setup log file
    log_dir = LOG_DIR
    os.makedirs(log_dir, exist_ok=True)
    log_path = args.log or os.path.join(log_dir, 'run_all_sims.log')

    class Tee:
        def __init__(self, *files):
            self.files = files
        def write(self, obj):
            for f in self.files:
                f.write(obj)
                f.flush()
        def flush(self):
            for f in self.files:
                f.flush()

    log_file = open(log_path, 'w')
    sys.stdout = Tee(sys.__stdout__, log_file)
    sys.stderr = Tee(sys.__stderr__, log_file)
    print(f"Log file: {log_path}")

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
    log_file.close()


if __name__ == '__main__':
    main()
