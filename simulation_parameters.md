# Simulation Parameters - Single Source of Truth

All case-specific default grid sizes and physical parameters. Override via CLI
flags (`--nx`, `--ny`, `--chord`, `--inlet`, etc.) where noted.

**Current build targets:** `LBM_Cavity`, `LBM_Step` (plus `LBM_AMR`, `LBM_Tests`,
`BodyFittedGrid_Tests`, `lbm_solver_shared`). All other entry points have been
removed from the build. Case sections below are retained for reference/archival.

## Grid Tiers

| Tier | Cases | Grid (Nx x Ny) | Rationale |
|------|-------|----------------|-----------|
| 1 | Cavity, Step | 512x512, 3200x600 | Current build targets |
| -- | ~~Cylinder, Flat Plate~~ | ~~1200x1200, 1200x900~~ | Archived (entry points removed) |
| -- | ~~Cylinder Near Wall, Side-by-Side, Rotating Cyl, Orifice~~ | ~~1600x600, 1200x1000, 1200x800, 1600x1000~~ | Archived (entry points removed) |
| -- | ~~Urban Canyon, Downwash, City Grid~~ | ~~900x400, 1200x600, 1600x1200~~ | Archived (entry points removed) |

## Case Parameters

### Cylinder (main.cpp -- LBM_Engine) [ARCHIVED - entry point removed]

| Parameter | Value | Notes |
|-----------|-------|-------|
| Grid | NX=1200, NY=1200 | `--nx`/`--ny` override |
| Radius | 30 cells | D=60, fixed |
| Blockage | 5% (NY=1200) | 60/1200 = 0.05 |
| u_inflow | 0.10 | Fixed |
| tau(Re=100) | 0.68 | tau = 0.5 + 3*u_inflow*D/Re |
| tau(Re=200) | 0.59 | |
| tau(Re=1000) | 0.518 | Auto-LES triggered (tau < 0.55) |
| Position | cx = NX/4, cy = NY/2+1 | Center-left |

### Cavity (cavity.cpp -- LBM_Cavity)

| Parameter | Value | Notes |
|-----------|-------|-------|
| Grid | NX=NY=512 | Positional arg `nx` (default 512) |
| Lid velocity | 0.10 | Fixed |
| tau(Re=100) | 2.04 | tau = 0.5 + 3*u_lid*nx/Re |
| tau(Re=400) | 0.88 | |
| tau(Re=1000) | 0.65 | |
| Walls | All no-slip (bounce-back) | Lid moving, other 3 stationary |

### Flat Plate (flat_plate.cpp -- LBM_FlatPlate) [ARCHIVED - entry point removed]

| Parameter | Value | Notes |
|-----------|-------|-------|
| Grid | NX=1200, NY=900 | `--nx`/`--ny` override |
| Chord | 200 cells | `--chord` override |
| Thickness | 2 cells | Blunt leading/trailing edge |
| u_inflow | 0.10 | Fixed |
| tau(Re=500) | 0.62 | tau = 0.5 + 3*u_inflow*chord/Re |
| tau(Re=1000) | 0.56 | |
| tau(Re=2000) | 0.53 | |
| Length scale | chord | Used for Cd = 2*Fx/(rho*u^2*chord) |
| AoA sweep | 0, 5, 10 deg | `--pos2` argument |

### Backward-Facing Step (step.cpp -- LBM_Step)

| Parameter | Value | Notes |
|-----------|-------|-------|
| Grid | NX=3200, NY=600 | `--nx`/`--ny` override (default set in main) |
| h_step | NY/2 = 300 | 2:1 expansion ratio |
| h_inlet | NY-1-h_step = 299 | Inlet channel height |
| Expansion ratio | 2:1 | h_inlet/h_step = 299/300 ~1 |
| L/H | 8.0 | (NX-NX/4)/h_step = 2400/300 = 8 |
| u_max | 0.10 | Parabolic peak velocity |
| u_mean | 0.0667 | Mean of parabola = 2/3*u_max |
| D_h | 2*h_inlet = 598 | Hydraulic diameter |
| tau(Re_H=100) | 1.70 | tau = 0.5 + 3*u_mean*D_h/Re |
| tau(Re_H=200) | 1.10 | |
| tau(Re_H=400) | 0.80 | |
| Validation | Armaly (1983) | Xr/H ~3/6/9 for Re=100/200/400 |

### Cylinder Near Wall (cylinder_near_wall.cpp -- LBM_CylinderNearWall) [ARCHIVED - entry point removed]

| Parameter | Value | Notes |
|-----------|-------|-------|
| Grid | NX=1600, NY=600 | `--nx`/`--ny` override |
| Radius | 30 cells | D=60 |
| Wall gaps | 15, 20, 40 cells | `--pos2` argument (was 10,20,40) |
| u_inflow | 0.10 | Fixed |
| Validation | Ground effect | Cd vs isolated, Cl sign change |

### Side-by-Side Cylinders (side_by_side_cylinders.cpp -- LBM_SideBySide) [ARCHIVED - entry point removed]

| Parameter | Value | Notes |
|-----------|-------|-------|
| Grid | NX=1200, NY=1000 | `--nx`/`--ny` override |
| Radius | 30 cells | D=60 |
| Blockage | 6% (NY=1000) | 60/1000 = 0.06 |
| S/D ratios | 2, 3, 5 | `--pos2` argument |
| Arrangement | Transverse | Same x, offset in y |
| u_inflow | 0.10 | Fixed |

### Rotating Cylinder (rotating_cylinder.cpp -- LBM_RotatingCylinder) [ARCHIVED - entry point removed]

| Parameter | Value | Notes |
|-----------|-------|-------|
| Grid | NX=1200, NY=800 | `--nx`/`--ny` override |
| Radius | 30 cells | D=60 |
| Angular velocities | 0.5, 1.0, 2.0 rad/ts | `--pos2` argument |
| u_inflow | 0.10 | Fixed |
| BC | Ladd (1994) | Moving boundary bounce-back |

### Orifice Plate (orifice_plate.cpp -- LBM_OrificePlate) [ARCHIVED - entry point removed]

| Parameter | Value | Notes |
|-----------|-------|-------|
| Grid | NX=1600, NY=1000 | `--nx`/`--ny` override |
| u_inflow | 0.025 | Lower for jet stability |
| Configs | 1p1h, 1p3h, 2p, 3p | Single/multi-stage |
| LES | Auto-enabled | u_inflow=0.025 gives tau near 0.55 |
| Validation | ISO 5167 | Loss coefficient K |

### Urban Canyon (urban_canyon.cpp -- LBM_UrbanCanyon) [ARCHIVED - entry point removed]

| Parameter | Value | Notes |
|-----------|-------|-------|
| Grid | 900x400 (side), 900x400 (topdown) | Source defaults |
| Modes | side, topdown | `--mode` argument |
| Side AR | 0.3, 0.5, 0.6(3-bldg), 0.8 | `--ar` argument |
| Topdown orient | vertical, horizontal | `--orient` argument |
| Building height | NY * 2/5 = 160 (side) | 40% of domain |
| Building width | 1.2 * H = 192 (side) | Scaled to fit |
| Inlet buffer | 100 cells minimum | Prevents NaN divergence |
| Canyon width | Capped to fit within NX-200 | Side: W=316(AR0.3/0.5), 62(AR0.6), 200(AR0.8) |
| Topdown V | w_bldg=120, l_bldg=NY/2=200 | Canyon capped for 100-cell buffer |
| Topdown H | w_bldg=100, l_bldg=NY/8=50 | Smaller blockage, fits naturally |

### Downwash (downwash.cpp -- LBM_Downwash) [ARCHIVED - entry point removed]

| Parameter | Value | Notes |
|-----------|-------|-------|
| Grid | NX=1200, NY=600 | Source default (scaled up buildings) |
| Buildings | h_tall=80, h_low=30, w=30 | Height ratio 2.67 |
| Validation | Hunt (1984) | Building downwash |

### Urban City Grid (urban_citygrid.cpp -- LBM_UrbanCityGrid) [ARCHIVED - entry point removed]

| Parameter | Value | Notes |
|-----------|-------|-------|
| Grid | NX=1600, NY=1200 | `--nx`/`--ny` override |
| Buildings | 7 (4 horizontal + 3 vertical) | |
| Building dims | w=120, h=240 | Long dimension |
| Street width | 240 | 2x building width |
| u_ref | 0.10 | Inflow velocity |
| tau(Re=100) | 1.22 | tau = 0.5 + 3*u_ref*bldg_h/Re |
| Inlet configs | East only | South/West deferred |
| BC | Inflow at x=0, outlet at x=NX-1 | No-slip y-walls |

## Reynolds Number Summary

| Case | Re values | Definition | Length scale |
|------|-----------|------------|-------------|
| Cylinder | 100, 200, 1000 | u_inflow * D / nu | D = 60 |
| Cavity | 100, 400, 1000 | u_lid * NX / nu | NX |
| Flat plate | 500, 1000, 2000 | u_inflow * chord / nu | chord |
| Step | 100, 200, 400 | u_mean * D_h / nu | D_h = 2*h_inlet |
| Cylinder near wall | 100 | u_inflow * D / nu | D = 60 |
| Side-by-side | 100 | u_inflow * D / nu | D = 60 |
| Rotating cylinder | 100 | u_inflow * D / nu | D = 60 |
| Orifice plate | 100 | u_inflow * NY / nu | NY |
| Urban canyon | 100 | u_ref * bldg_h / nu | Building height |
| Downwash | 100 | u_ref * h_tall / nu | Tall building height |
| City grid | 100 | u_ref * bldg_h / nu | Building height |

## Tau Computation

All cases use the D2Q9 MRT collision operator:
```
nu = u_ref * L / Re          (lattice kinematic viscosity)
tau = 0.5 + 3 * nu            (relaxation time)
s_shear = 1 / tau             (MRT shear rate, clamped [0.5, 1.99])
```

LES auto-enables when tau < 0.55 for high-Re stability.
