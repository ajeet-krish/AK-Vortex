#!/bin/bash
# AK-Vortex Desktop CFD - Launch Script
# Builds frontend, starts watch rebuild, launches Tauri app

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== AK-Vortex Desktop CFD ==="
echo ""

# Step 1: Build frontend
echo "[1/3] Building frontend..."
npm run build --silent 2>&1 | tail -3

# Step 2: Start watch process in background
echo "[2/3] Starting watch rebuild..."
npx vite build --watch &
WATCH_PID=$!

# Cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down..."
    kill $WATCH_PID 2>/dev/null
    wait $WATCH_PID 2>/dev/null
}
trap cleanup EXIT INT TERM

# Step 3: Launch Tauri app
echo "[3/3] Launching Tauri app..."
echo ""
cargo tauri dev
