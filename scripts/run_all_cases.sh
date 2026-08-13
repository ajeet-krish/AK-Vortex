#!/usr/bin/env bash
# ==============================================================
# AK-Vortex: Run All Simulation Cases
# ==============================================================
# Orchestrates all Reynolds number sweeps for every case.
# Runs cavity and step simulations sequentially.
#
# Usage:
#   bash scripts/run_all_cases.sh
# ==============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Build once
echo "Building AK-Vortex..."
cmake -B build && cmake --build build

echo ""
echo "================================================"
echo " AK-Vortex: Full Simulation Suite"
echo "================================================"
echo ""

# --- Cavity ---
echo ">>> Cavity Re=100 (512x512, 50000 steps)"
mkdir -p output/cavity_re100
./build/LBM_Cavity 100 512 50000 2>&1 | tee output/cavity_re100/run.log
echo ""

echo ">>> Cavity Re=400 (512x512, 50000 steps)"
mkdir -p output/cavity_re400
./build/LBM_Cavity 400 512 50000 2>&1 | tee output/cavity_re400/run.log
echo ""

echo ">>> Cavity Re=1000 (512x512, 50000 steps)"
mkdir -p output/cavity_re1000
./build/LBM_Cavity 1000 512 50000 2>&1 | tee output/cavity_re1000/run.log
echo ""

# --- Step ---
bash scripts/run_step.sh

echo ""
echo "================================================"
echo " All simulations complete."
echo "================================================"
