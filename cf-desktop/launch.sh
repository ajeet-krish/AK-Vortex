#!/bin/bash
# AK-Vortex Desktop CFD Launcher
# Builds and runs the desktop application

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== AK-Vortex Desktop CFD ==="
echo "Building C++ solver library..."
cd "$PROJECT_DIR/build"
cmake .. -DCMAKE_BUILD_TYPE=Release > /dev/null 2>&1
make lbm_solver_shared -j8 > /dev/null 2>&1

echo "Starting desktop application..."
cd "$SCRIPT_DIR"
npm run tauri dev
