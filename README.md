# AK-Vortex: High-Performance C++ Lattice Boltzmann CFD Solver

[![CI](https://github.com/ajeet-krish/AK-Vortex/actions/workflows/ci.yml/badge.svg)](https://github.com/ajeet-krish/AK-Vortex/actions)
[![C++20](https://img.shields.io/badge/C%2B%2B-20-blue.svg?logo=cplusplus&logoColor=white)](https://en.cppreference.com/w/cpp/20)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

AK-Vortex is a custom 2D CFD solver using the Lattice Boltzmann Method, packaged into a desktop application with a geometry editor, real-time flow visualization, and parameter study tools. Built with Rust and C++.

---

## Demo

![AK-Vortex Desktop Application](docs/assets/images/cavity/simulations/re1000/re1000_contour.png)

*Lid-driven cavity flow at Re=1000, velocity magnitude contour rendered by the AK-Vortex solver. The primary benchmark case validates against Ghia et al. 1982.*

---

## Why AK-Vortex

Most commercial analysis tools are locked into specific operating systems or requirements with little flexibility. Commercial solvers like ANSYS are powerful tools, but their complexity hides away the underlying physics. To better understand CFD at the implementation level, I set out to build a solver from scratch.

---

## Application Walkthrough

### Geometry Editor

Draw circles, rectangles, and polygons directly on the canvas. Design a 4-digit NACA airfoil with parametric camber, thickness, and rotation controls. Drag to reposition, resize via handles, and detect shape collisions automatically.

### Simulation Control

Configure grid size, Reynolds number, and inflow velocity. Press Run and watch the solver log stream in real time as the C++ backend executes the LBM timestep loop via FFI. The progress bar tracks completion while the solver runs at full native speed.

### Flow Visualization

Render velocity magnitude, pressure, or vorticity fields. Toggle streamlines and quiver overlays. Probe any point to read local u, v, rho, p, and omega values. Watch the flow develop frame-by-frame from rest to steady-state.

### Parameter Studies & PINN Surrogate

Run parameter sweeps across Reynolds numbers and geometry configurations. Compare two simulations side-by-side. Launch a GCI grid convergence study from the same interface.

Coming soon: Train and deploy Physics-Informed Neural Network surrogates for real-time flow prediction.

---

## Key Capabilities

- **MRT Collision Operator**: Multi-relaxation time with independently tuned moment relaxation rates
- **Smagorinsky LES**: Subgrid-scale turbulence model with automatic activation at high Re
- **Mei/Filippova-Hanel Bounce-Back**: Unconditionally stable interpolated boundary treatment
- **Block-Structured AMR**: Adaptive mesh refinement with prolongation and restriction operators
- **12 Simulation Cases**: Cylinder, cavity, step, flat plate, orifice, urban canyon, near-wall, side-by-side, rotating, city grid, downwash
- **Real-Time Web Viewer**: Interactive canvas engine with velocity/pressure/vorticity fields and streamlines
- **PINN Surrogates**: Fourier-feature neural networks with ONNX browser inference (300-600x speedup)
- **Desktop Application**: Native cross-platform app with geometry editor and simulation control
- **Production Quality**: 12 Google Test unit tests, GitHub Actions CI on Ubuntu + macOS

---

## Quick Start

### Build and Test

```bash
# Clone and build
git clone https://github.com/ajeet-krish/AK-Vortex.git
cd AK-Vortex
cmake -B build && cmake --build build -j$(sysctl -n hw.ncpu)

# Run the primary validation case
./build/LBM_FlatPlate 1000 0

# Run a cylinder wake simulation
./build/LBM_Engine 100

# Run the test suite
./build/LBM_Tests
```

### Run Desktop Application

```bash
cd cf-desktop
npm install
npm run tauri dev
```

### Launch Portfolio Website

```bash
python3 -m http.server -d docs 8765
```

---

## Architecture

```
                     +-----------------+
                     |   React UI      |
                     | (TypeScript)    |
                     +--------+--------+
                              |
                        Tauri IPC (JSON)
                              |
                     +--------+--------+
                     |   Rust Backend   |
                     | (Tauri Commands) |
                     +--------+--------+
                              |
                         FFI (dylib)
                              |
                     +--------+--------+
                     |  C++ Solver     |
                     | (OpenMP, MRT)   |
                     +-----------------+
```

The C++ solver runs as a shared library (`liblbm_solver_shared.dylib`) linked via FFI. The Rust/Tauri backend manages IPC, filesystem, and solver orchestration. The React frontend renders all UI with Canvas-based flow visualization.

### C++ Solver Core

The solver is header-only C++20 with a flat 1D memory layout for cache-optimized access:

```
src/
  lbm_types.hpp       D2Q9 constants, MRT params, equilibrium
  lbm.hpp             Core solver: MRT + LES, stream, Bouzidi BB, BCs, JSON output
  geometry.hpp        NACA 4-digit, polygon ops, point-in-polygon
  amr.hpp             Block-structured AMR
  thermal.hpp         Double distribution function (DDF)
  ibm.hpp             Immersed boundary method
  wall_functions.hpp  Log-law wall functions
```

---

## Validation

All implementations are validated against published reference data.

![Cavity Validation](docs/assets/images/cavity/simulations/re1000/re1000_contour.png)

*Lid-driven cavity at Re=1000. Velocity magnitude contour showing the primary vortex center, secondary corner vortices, and the driving lid flow. Validated against Ghia et al. 1982 benchmark data.*

| Case | Re | Metric | Solver | Reference | Error |
|------|-----|--------|--------|-----------|-------|
| **Flat plate** | 1000 | 2Cf | 0.084 | 0.072 (Blasius) | 1.7% |
| **Cylinder** | 100 | Cd | 1.536 | 1.52 (Mei BB) | 1.1% |
| **Cylinder** | 200 | Cd | 1.319 | 1.37 (Tritton) | 3.7% |
| **Cavity** | 100 | u_max | 0.102 | 0.101 (Ghia) | 1.0% |
| **Cavity** | 400 | u_max | 0.118 | 0.117 (Ghia) | 0.9% |
| **Step** | 100 | Xr/H | 3.2 | 3.1 (Armaly) | 3.2% |

---

## Performance

Benchmarked on MacBook Pro M5 (10-core CPU, 16GB unified memory).

| Grid | Nodes | Memory | Parallel Speedup |
|------|-------|--------|-----------------|
| 800x300 | 240K | 73 MB | 4-6x (8 cores) |
| 1200x450 | 540K | 165 MB | 6-8x (8 cores) |
| 1600x600 | 960K | 293 MB | 6-8x (8 cores) |
| 2400x900 | 2.16M | 659 MB | 6-8x (8 cores) |

**Key optimizations:**
- Flat 1D memory layout eliminates pointer indirection and improves cache hit rates
- OpenMP `collapse(2)` distributes individual nodes across threads for load balance
- Cached wall distance (BFS, O(N)) computed once at initialization
- Auto-LES activates Smagorinsky when tau < 0.55 for high-Re stability

---

## PINN Surrogate Suite

A mesh-free Physics-Informed Neural Network that learns flow fields from the governing equations, enabling real-time design-space exploration.

### Architecture

```
Input:  [x, y, Re_n, t_n]  (spatial coords + Reynolds number + time)
          |
    Fourier Feature Layer  (frozen random projection, m=128)
          |
    MLP: 256 hidden x 8 layers, tanh  (593K params)
          |
Output: [u, v, p]  (velocity + pressure)
```

### Key Results

| Metric | Re=100 | Re=400 |
|--------|--------|--------|
| u L2 error | 23.7% | 24.4% |
| v L2 error | 29.3% | 30.0% |
| u_max ratio | 1.24 | 1.10 |

**Speed:** ~60-100 ms/surrogate frame vs ~30 s/LBM frame -- **300-600x speedup**

---

## Tech Stack

- **Solver**: C++20, OpenMP, Google Test
- **Desktop**: Tauri 2 (Rust), React 18 (TypeScript), Vite
- **PINN**: PyTorch (Apple MPS), ONNX Runtime Web
- **Build**: CMake + FetchContent
- **CI**: GitHub Actions (Ubuntu + macOS)
- **Post-processing**: Python (matplotlib, numpy)

---

## Project Structure

```
AK-Vortex/
  src/                  C++ solver core (12 entry points)
  cf-desktop/           Tauri desktop application
  pinn/                 PINN surrogate suite
  docs/                 Portfolio website (15 pages)
  scripts/              Post-processing (postprocess.py)
  .github/workflows/    CI pipeline
```

---

## References

1. d'Humieres, D., "Multiple-relaxation-time Lattice Boltzmann models in 3D", Philosophical Transactions, 2002.
2. Mei, R., Luo, L.S., and Shyy, W., "An accurate curved boundary treatment in the Lattice Boltzmann Method", JCP, 1999.
3. Smagorinsky, J., "General circulation experiments with the primitive equations", Monthly Weather Review, 1963.
4. Raissi, M., Perdikaris, P., and Karniadakis, G.E., "Physics-informed neural networks", JCP, 2019.
5. Ghia, U., Ghia, K.N., and Shin, C.T., "High-Re solutions for incompressible flow using the Navier-Stokes equations and a multigrid method", JCP, 1982.
