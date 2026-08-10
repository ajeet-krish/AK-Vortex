#!/bin/bash
# AK-Vortex Desktop CFD Launcher
# Builds C++ solver + frontend, then launches the app

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== AK-Vortex Desktop CFD ==="
echo ""

# Build C++ solver if needed
echo "[1/2] Building C++ solver library..."
cd "$PROJECT_DIR/build"
cmake .. -DCMAKE_BUILD_TYPE=Release > /dev/null 2>&1
make lbm_solver_shared -j8 > /dev/null 2>&1
echo "  Done."

# Launch app
echo "[2/2] Launching app..."
cd "$SCRIPT_DIR"
./start.sh
