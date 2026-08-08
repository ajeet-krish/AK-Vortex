# LinkedIn Posts for AK-Vortex Solver Project

## Style Notes
- Casual, not academic. No em dashes.
- Short paragraphs. Plain punctuation.
- Assume the reader knows nothing about CFD.
- Hiring managers care about your thinking process, not just that it works.
- Reference images by filename so you can attach them when posting.

---

## Post 1: I Built a CFD Solver From Scratch

How does air flow around a plane wing, a high-rise building, or a racing car? To predict this without expensive physical wind tunnels, engineers use Computational Fluid Dynamics (CFD) to simulate air as millions of interacting particles. To understand how this works, I built my own solver from scratch in C++.

Rather than solving the traditional Navier-Stokes equations directly, it uses the Lattice Boltzmann Method (LBM), a particle-based approach, to simulate fluid behaviour. Particles collide to dissipate energy, then stream to neighboring grid points. Repeat that millions of times and realistic fluid behaviour emerges. About 1,700 lines of C++ total.

I'm still working through a full validation process, but early results against published benchmarks are encouraging. I tested three simple test cases to see if it could at least capture realistic flow behaviour as seen in velocity field contour plots and streamlines:

1. Lid-driven cavity at Re=100 is a great visual check. The contour plot shows velocity magnitude from zero (blue) to maximum lid speed (red). Streamlines reveal the primary vortex in the center and weaker corner vortices in the bottom corners.

2. Backward-facing step shows how separation works. Flow exits the step corner, separates into a free shear layer, and reattaches downstream. The recirculation bubble grows with Reynolds number as inertial forces dominate viscosity.

3. 3-Stage Orifice plate shows how multiple restrictions compound pressure loss. Three staggered plates force the flow through a serpentine path, accelerating through each hole and decelerating into large recirculation zones between plates. Each turn dissipates energy.

This is still early work, but building a solver forces you to understand the physics. Why does the relaxation rate affect stability? What happens when the grid is too coarse to resolve the shear layer? Lots of failures, but lots of lessons learned.

[Attach: docs/assets/images/cavity/re100_contour.png]
[Attach: docs/assets/images/cavity/re100_streamlines.png]

[Attach: docs/assets/images/step/re100_contour.png]
[Attach: docs/assets/images/step/re100_streamlines.png]

[Attach: docs/assets/images/orifice_plate/1p1h_contour.png]
[Attach: docs/assets/images/orifice_plate/1p1h_streamlines.png]

The full solver is on GitHub with 14 simulation cases, unit tests, and an interactive website. Link in comments.

#CFD #LatticeBoltzmann #AerospaceEngineering #FluidMechanics #HPC #Simulation #OpenMP

---

## Post 2: CFD for Real Applications -- Urban Microclimate Simulation

Textbook benchmarks are great for validation, but the real test of a CFD solver is whether it can handle problems that matter. I applied my LBM solver to urban microclimate simulation: how wind moves through streets and around buildings.

Urban canyon flow is a classic problem in environmental fluid mechanics. The aspect ratio of a street (building height to street width, H/W) determines the entire flow regime. Oke 1988 identified three distinct regimes based on this ratio, and my solver reproduces them.

At low aspect ratios (H/W = 0.3), the street is wide relative to the buildings. Wind flows over the tops with minimal interaction with the street level. The flow is relatively uniform and pedestrian-level wind speeds are close to the freestream.

[Attach: docs/assets/images/urban/side/re0.3_contour.png]
[Attach: docs/assets/images/urban/side/re0.3_streamlines.png]

At high aspect ratios (H/W = 0.8), the street is narrow and deep. The flow becomes dominated by a single large recirculation cell that fills the entire canyon. Pedestrian-level winds are driven by this vortex rather than the freestream. Pollutant dispersion changes completely.

[Attach: docs/assets/images/urban/side/re0.8_contour.png]
[Attach: docs/assets/images/urban/side/re0.8_streamlines.png]

I also simulated a top-down view of a street network with three buildings. The flow channels between buildings, creating high-speed jets in the gaps and recirculation zones behind each structure. This is the kind of analysis that matters for pedestrian comfort studies, pollutant dispersion modeling, and HVAC intake placement.

[Attach: docs/assets/images/urban/topdown/re100_contour.png]
[Attach: docs/assets/images/urban/topdown/re100_streamlines.png]

The building downwash case shows how a tall building interacts with a shorter one downstream. The tall building deflects wind downward (downwash), creating strong recirculation at street level between the two structures. This is a real concern in urban planning: a new tall building can create uncomfortable or dangerous wind conditions at the base of neighboring buildings.

[Attach: docs/assets/images/urban/downwash/re100_contour.png]
[Attach: docs/assets/images/urban/downwash/re100_streamlines.png]

These cases show that a solver built for textbook problems can handle real engineering questions. The physics is the same. The boundary conditions change. The interpretation changes. But the underlying lattice Boltzmann machinery works the same way whether you are simulating a lid-driven box or a city block.

Full results and interactive viewers for all cases are on the project site. Link in comments.

#CFD #UrbanMicroclimate #WindEngineering #LatticeBoltzmann #AerospaceEngineering #FluidMechanics #Simulation

---

## Post 3: What If You Could Run CFD in Your Browser?

Building a CFD solver that runs in seconds is useful. Building a surrogate model that runs in milliseconds is a different kind of useful entirely.

I trained a Physics-Informed Neural Network, or PINN, on data from my LBM solver. The network learns the governing equations directly from the simulation output, plus a PDE residual loss that enforces the Navier-Stokes equations at collocation points throughout the domain. No mesh required at inference time.

The architecture is straightforward. Spatial coordinates pass through a Fourier feature embedding to break the spectral bias of tanh activations. The embedding lifts (x, y) into a 512-dimensional frequency space using frozen random sinusoidal projections. The MLP is 256 hidden units, 8 layers, about 600K parameters. Physical parameters like Reynolds number are concatenated after the Fourier features, making the network parametric.

The training setup uses Apple Silicon MPS backend. Hybrid loss combines data loss (velocity and pressure from the LBM), PDE residual loss (steady incompressible Navier-Stokes via torch.autograd), and boundary condition loss for the no-slip walls and moving lid. Importance sampling near the walls and vortex core improves data efficiency.

The results. At Re=100, the PINN matches the LBM velocity field within 24% L2 error. At Re=400, it achieves 24% on u-velocity and 30% on v-velocity. The u_max ratio (predicted peak velocity divided by true peak velocity) is 1.24, down from 3.50 without Fourier features. That is the spectral bias fix in action.

[Attach: docs/assets/images/cavity/pinn_comparison_re100.png]

The real payoff is speed. The trained ONNX model inferences a full 96x96 velocity field in about 60 to 100 milliseconds on CPU. The C++ LBM solver takes about 30 seconds for the same grid. That is a 300x to 600x speedup.

What does that unlock? A recruiter can drag a Reynolds number slider and watch the vortex center migrate in real time. An engineer can explore the design space without waiting hours for each simulation. A student can build intuition about how flow patterns change with Reynolds number by experimenting interactively.

[Attach: docs/assets/images/cavity/sensitivity_map_re300.png]

The sensitivity map above shows how the velocity field changes with Reynolds number, computed via autograd. Red regions are where increasing Re accelerates the flow. Blue regions are where it decelerates. This kind of gradient information is free from the PINN but would require multiple CFD runs to estimate.

The temporal extension goes further. I trained a time-parametric version that takes (x, y, Re, t) as input and predicts the full transient from rest to steady state. A single network animates the vortex roll-up, the shear layer instability, and the approach to steady state. Frame-by-frame L2 error is about 33% averaged over the transient, with the hardest part being the early frames (0-10) where gradients are steepest.

None of this replaces the CFD solver. The solver generates the baseline data. The PINN provides a deployable, interactive surrogate. The two work together.

Full architecture details, training convergence plots, and the interactive PINN viewer are on the project site. Link in comments.

#MachineLearning #PINN #CFD #LatticeBoltzmann #NeuralNetworks #AerospaceEngineering #HPC #Simulation

---

## Post 4 (Stub): Improving the Solver -- LES and Adaptive Mesh Refinement

Outline:
- Smagorinsky LES: subgrid-scale eddy viscosity model for turbulent flows
- Auto-LES: automatically enable when tau drops below stability threshold
- Strain rate computation from non-equilibrium stress moments in MRT
- Block-structured AMR: 2-level hierarchy with bilinear prolongation and restriction
- Refinement sensor based on velocity gradient magnitude
- Why AMR matters: resolve thin boundary layers and shear zones without refining the whole domain
- Status: AMR restriction operator needs tuning, LES validated on cylinder Re=1000

Suggested images: cylinder Re=1000 with LES, periodic hills Re=2800

---

## Post 5 (Stub): Advanced Cases -- Beyond Textbook Benchmarks

Outline:
- Flat plate boundary layer: Blasius solution validation, AoA sweep, drag polar
- Square cylinder: ERCOFTAC 043 sharp-edge separation, fixed separation points
- Periodic hills: canonical LES benchmark (Moser/Kim/Moin 1993), sinusoidal bottom
- Cylinder near wall: ground effect, variable wall gap changes lift coefficient
- Side-by-side cylinders: transverse interference, S/D ratio effects on Cd/Cl
- Rotating cylinder: Magnus effect with Ladd moving boundary, lift generation
- Each case teaches something different about flow physics

Suggested images: flat plate AoA sweep, square cylinder, periodic hills Re=2800, rotating cylinder

---

## Post 6: Building a CFD Desktop App -- From Solver to Tool

A CFD solver that runs from the command line is useful for research. A CFD desktop application that anyone can use is a different kind of project entirely. I spent the last few weeks turning my LBM solver into a Tauri-based desktop app, and the engineering challenges were nothing like what I expected.

The first surprise was the architecture. A desktop CFD app is not just a solver with a GUI wrapper. It is a full-stack application with four distinct layers: a React frontend for the interface, a Rust backend for file I/O and process management, a C++ solver core for the physics, and an FFI bridge connecting them. Each layer has its own language, its own conventions, and its own failure modes.

The second surprise was the geometry problem. In a command-line solver, you hardcode each case: cylinder here, cavity there, step in the corner. In a desktop app, the user draws whatever they want. I built an interactive geometry editor where you click to place circles, rectangles, and NACA airfoils. The editor converts your drawing into an obstacle mask, sends it to the C++ solver as JSON, and the solver marks those grid points as solid. Getting that pipeline working required solving three separate problems: a JSON parser in C++ with no external dependencies, a coordinate transform between canvas pixels and solver grid nodes, and a y-flip because screen coordinates have y increasing downward while solver coordinates have y increasing upward.

[Attach: docs/assets/images/desktop/geometry-editor.png]

The third surprise was visualization. The solver outputs JSON frames with velocity, pressure, and vorticity fields. But raw numbers are not useful. I built a canvas-based renderer that maps scalar fields to colormaps, overlays streamlines via RK4 integration, and adds quiver arrows for velocity direction. The pressure field was especially tricky: in LBM, density stays near 1.0, so pressure perturbations are tiny (order 0.003). The auto-scaling colormap showed everything as one color until I learned to output pressure as (rho - 1) / 3 instead of rho / 3, and to exclude obstacle nodes from the range calculation.

[Attach: docs/assets/images/desktop/velocity-contour.png]

The fourth surprise was state management. When the user runs a simulation, the C++ solver runs in the same process via FFI. If you run a cylinder case and then switch to an airfoil, the C++ globals (turbulence model flags, case type, boundary conditions) from the cylinder case persist. I had to add a reset function that zeros all globals before each run. Without it, the airfoil simulation ran with LES turbulence modeling enabled from the cylinder case, producing wrong results.

[Attach: docs/assets/images/desktop/comparison-mode.png]

The most valuable feature turned out to be the simplest: VTK export. One button writes the simulation frame as a VTK structured points file that ParaView can read. It took about 100 lines of C++ to implement, but it connects the desktop app to the entire ParaView ecosystem: isosurfaces, animations, volume rendering, screenshots for reports. Sometimes the highest-impact feature is the one that lets users leverage existing tools.

[Attach: docs/assets/images/desktop/export-vtk.png]

The mesh resolution study (GCI) feature surprised me too. I implemented a function that automatically runs the same case at three grid resolutions, extracts a metric (like max velocity or drag coefficient), and computes the Grid Convergence Index using Richardson extrapolation. It is the standard method for quantifying numerical uncertainty in CFD. Having it built into the desktop app means any user can validate their simulation without writing custom scripts.

[Attach: docs/assets/images/desktop/gci-study.png]

Looking back, the desktop app taught me more about software engineering than the solver did. The solver is pure physics: collision, streaming, boundary conditions. The desktop app is systems engineering: data flow across language boundaries, state management across process boundaries, UI responsiveness during long computations, and security hardening against path traversal and injection attacks.

The full desktop app is on GitHub. It is open source, built with Tauri 2, React, Rust, and C++. Link in comments.

#DesktopApp #CFD #Tauri #RustLang #CPlusPlus #AerospaceEngineering #SoftwareEngineering #HPC #Simulation

---

## Post 7 (Stub): What I Learned Building a Complete CFD Project

Outline:
- From solver to desktop app to website to PINN: the full stack
- Engineering design process: requirements -> architecture -> implementation -> validation
- What I would do differently (start with the desktop app, not the solver)
- Skills demonstrated: HPC, CFD, ML, full-stack development, technical communication
- Advice for engineers building portfolio projects

Suggested images: architecture diagram, desktop app screenshot, validation table

---

## Suggested Hashtags
`#CFD #LatticeBoltzmann #AerospaceEngineering #FluidMechanics #MachineLearning #HPC #Simulation #NeuralNetworks #OpenMP #WindEngineering #DesktopApp #Tauri #RustLang #CPlusPlus #SoftwareEngineering`

## Suggested Posting Sequence
- Post 1 (solver intro + cavity/step/orifice images)
- Wait a few days
- Post 2 (urban canyon applications + downwash images)
- Wait a few days
- Post 3 (ML/PINN + comparison + sensitivity map)
- Wait a few days
- Post 4 (LES + AMR improvements, when ready)
- Wait a few days
- Post 5 (advanced cases, when ready)
- Wait a few days
- Post 6 (desktop app development journey)
- Wait a few days
- Post 7 (full project reflection, when ready)

Let each post breathe. Do not drop them all at once.

## Tips
- Attach contour and streamline images as separate images in the LinkedIn carousel
- For Post 1, lead with the cavity contour (most visually striking)
- For Post 2, lead with the urban canyon side view (tells the aspect ratio story)
- For Post 3, lead with the 3-panel comparison (LBM vs PINN vs error)
- For Post 6, lead with the geometry editor screenshot (most interactive-looking)
- Keep captions under 300 characters on LinkedIn
- Link to the project site in the first comment, not in the post body (LinkedIn algorithm penalizes external links in post text)
