#!/usr/bin/env python3
"""
Run all AK-Vortex simulations.

Usage:
    python3 scripts/run_all_sims.py [--dry-run] [--case CASE]

Current build targets: LBM_Cavity, LBM_Step
"""

import subprocess
import os
import sys
import argparse
import time

BUILD_DIR = os.path.join(os.path.dirname(__file__), '..', 'build')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'output')
LOG_DIR = os.path.join(os.path.dirname(__file__), '..', 'output', 'logs')

ALL_SIMS = [
    # Cavity (uses positional nx arg, no --nx/--ny needed)
    {'exe': 'LBM_Cavity', 'args': ['100', '512', '50000'],
     'out': 'cavity/re100', 'label': 'Cavity Re=100 (512x512)'},
    {'exe': 'LBM_Cavity', 'args': ['400', '512', '50000'],
     'out': 'cavity/re400', 'label': 'Cavity Re=400 (512x512)'},
    {'exe': 'LBM_Cavity', 'args': ['1000', '512', '50000'],
     'out': 'cavity/re1000', 'label': 'Cavity Re=1000 (512x512)'},
    # Backward-facing step (Armaly benchmark, 2:1 expansion, L/H=8)
    {'exe': 'LBM_Step', 'args': ['100', '30000', '--nx', '3200', '--ny', '600'],
     'out': 'step/re100', 'label': 'Step Re=100 (3200x600, 2:1 ER, L/H=8)'},
    {'exe': 'LBM_Step', 'args': ['200', '30000'],
     'out': 'step/re200', 'label': 'Step Re=200 (3200x600 default, 2:1 ER, L/H=8)'},
    {'exe': 'LBM_Step', 'args': ['400', '30000'],
     'out': 'step/re400', 'label': 'Step Re=400 (3200x600 default, 2:1 ER, L/H=8)'},
]


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
    if case_name == 'cavity':
        re_id = config.lstrip('re')
        return ('simulations/re' + re_id, 're' + re_id)
    elif case_name == 'step':
        re_id = config.lstrip('re')
        return ('simulations/re' + re_id, 're' + re_id)
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
    parser = argparse.ArgumentParser(description='Run all AK-Vortex simulations')
    parser.add_argument('--dry-run', action='store_true', help='Print commands without running')
    parser.add_argument('--case', type=str, help='Run only cases matching this substring')
    parser.add_argument('--skip-postprocess', action='store_true', help='Skip post-processing')
    parser.add_argument('--log', type=str, default=None,
                        help='Log file path (default: output/logs/run_all_sims.log)')
    args = parser.parse_args()

    sims = ALL_SIMS

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
