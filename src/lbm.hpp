#pragma once
#include "lbm_types.hpp"
#include "geometry.hpp"
#include "thermal.hpp"
#include "ibm.hpp"
#include "wall_functions.hpp"
#include "scalar_transport.hpp"
#include <iostream>
#include <fstream>
#include <string>
#include <algorithm>
#include <cmath>
#include <cstdlib>

// ==========================================================================
// D2Q9 LATTICE BOLTZMANN METHOD -- Core solver
// ==========================================================================

// ------------------------------------------------------------------
// Zou/He velocity inlet: enforce u = u_inflow, v = 0 at x = 0
// ------------------------------------------------------------------
inline void enforce_inflow(LBMCapabilities& sys, double u_inflow) {
    for (int y = 0; y < NY; ++y) {
        int idx = node_index(0, y);
        double* f_node = &sys.f[idx * 9];

        double rho = (f_node[0] + f_node[2] + f_node[4]
                    + 2.0 * (f_node[3] + f_node[6] + f_node[7]))
                    / (1.0 - u_inflow);

        f_node[1] = f_node[3] + (2.0 / 3.0) * rho * u_inflow;
        f_node[5] = f_node[7] + (1.0 / 6.0) * rho * u_inflow;
        f_node[8] = f_node[6] + (1.0 / 6.0) * rho * u_inflow;
    }
}

// ------------------------------------------------------------------
// Zou/He south inlet: enforce u = 0, v = v_inflow at y = 0
// Flow enters from the bottom boundary in the +y direction.
// Known: f0, f1, f3, f4, f7, f8. Unknown: f2, f5, f6.
// ------------------------------------------------------------------
inline void enforce_south_inflow(LBMCapabilities& sys, double v_inflow) {
    for (int x = 0; x < NX; ++x) {
        int idx = node_index(x, 0);
        double* f_node = &sys.f[idx * 9];

        double rho = (f_node[0] + f_node[1] + f_node[3]
                    + 2.0 * (f_node[2] + f_node[5] + f_node[6]))
                    / (1.0 - v_inflow);

        f_node[4] = f_node[2];
        f_node[7] = f_node[5] + 0.5 * (f_node[1] - f_node[3])
                   + 0.5 * rho * v_inflow;
        f_node[8] = f_node[6] - 0.5 * (f_node[1] - f_node[3])
                   + 0.5 * rho * v_inflow;
    }
}

// ------------------------------------------------------------------
// Zou/He west inlet: enforce u = -u_inflow, v = 0 at x = NX-1
// Flow enters from the right boundary in the -x direction.
// Known: f0, f2, f4, f1, f5, f8. Unknown: f3, f6, f7.
// ------------------------------------------------------------------
inline void enforce_west_inflow(LBMCapabilities& sys, double u_inflow) {
    for (int y = 0; y < NY; ++y) {
        int idx = node_index(NX - 1, y);
        double* f_node = &sys.f[idx * 9];

        // u_inflow is positive magnitude; actual velocity is -u_inflow
        double rho = (f_node[0] + f_node[2] + f_node[4]
                    + 2.0 * (f_node[1] + f_node[5] + f_node[8]))
                    / (1.0 + u_inflow);

        f_node[3] = f_node[1];
        f_node[6] = f_node[8] + 0.5 * (f_node[2] - f_node[4])
                   - 0.5 * rho * u_inflow;
        f_node[7] = f_node[5] - 0.5 * (f_node[2] - f_node[4])
                   - 0.5 * rho * u_inflow;
    }
}

// ------------------------------------------------------------------
// Convective outlet: zero-gradient at x = NX-1
// ------------------------------------------------------------------
inline void enforce_outflow(LBMCapabilities& sys) {
    for (int y = 0; y < NY; ++y) {
        int idx = node_index(NX - 1, y);
        int idx_in = node_index(NX - 2, y);
        double* f_node = &sys.f[idx * 9];
        const double* f_in = &sys.f[idx_in * 9];
        for (int i = 0; i < 9; ++i) {
            f_node[i] = f_in[i];
        }
    }
}

// ------------------------------------------------------------------
// Convective outlet at y = NY-1 (north boundary outflow)
// ------------------------------------------------------------------
inline void enforce_north_outflow(LBMCapabilities& sys) {
    for (int x = 0; x < NX; ++x) {
        int idx = node_index(x, NY - 1);
        int idx_in = node_index(x, NY - 2);
        double* f_node = &sys.f[idx * 9];
        const double* f_in = &sys.f[idx_in * 9];
        for (int i = 0; i < 9; ++i) {
            f_node[i] = f_in[i];
        }
    }
}

// ------------------------------------------------------------------
// Convective outlet at x = 0 (east boundary outflow for west inlet)
// ------------------------------------------------------------------
inline void enforce_east_outflow(LBMCapabilities& sys) {
    for (int y = 0; y < NY; ++y) {
        int idx = node_index(0, y);
        int idx_in = node_index(1, y);
        double* f_node = &sys.f[idx * 9];
        const double* f_in = &sys.f[idx_in * 9];
        for (int i = 0; i < 9; ++i) {
            f_node[i] = f_in[i];
        }
    }
}
inline void enforce_step_inflow(LBMCapabilities& sys, int h_step, int h_inlet, double u_max) {
    for (int y = h_step; y < NY; ++y) {
        if (sys.obstacle[node_index(0, y)]) continue;
        int idx = node_index(0, y);
        double* f_node = &sys.f[idx * 9];

        double yy = static_cast<double>(y - h_step);
        double h = static_cast<double>(h_inlet);
        double u_local = u_max * 4.0 * yy * (h - yy) / (h * h);

        double rho = (f_node[0] + f_node[2] + f_node[4]
                    + 2.0 * (f_node[3] + f_node[6] + f_node[7]))
                    / (1.0 - u_local);

        f_node[1] = f_node[3] + (2.0 / 3.0) * rho * u_local;
        f_node[5] = f_node[7] + (1.0 / 6.0) * rho * u_local;
        f_node[8] = f_node[6] + (1.0 / 6.0) * rho * u_local;
    }
}

// ------------------------------------------------------------------
// Cavity walls: mark bottom, left, right boundaries as obstacles
// (Top wall is handled by enforce_lid() instead)
// ------------------------------------------------------------------
inline void place_walls(LBMCapabilities& sys) {
    for (int x = 0; x < NX; ++x) {
        sys.obstacle[node_index(x, 0)] = true;
    }
    for (int y = 0; y < NY; ++y) {
        sys.obstacle[node_index(0, y)] = true;
        sys.obstacle[node_index(NX - 1, y)] = true;
    }
}

// ------------------------------------------------------------------
// Convergence detection: returns true when a quantity has stabilized
// Compares mean over a recent window vs an earlier window
// ------------------------------------------------------------------
inline bool check_convergence(const std::vector<double>& values, int window = 1000,
                             double threshold = 1e-4) {
    int n = static_cast<int>(values.size());
    if (n < 2 * window) return false;
    double recent = 0.0;
    for (int i = n - window; i < n; ++i) recent += values[i];
    recent /= static_cast<double>(window);
    double earlier = 0.0;
    for (int i = n - 2 * window; i < n - window; ++i) earlier += values[i];
    earlier /= static_cast<double>(window);
    return std::abs(recent - earlier) < threshold;
}

// ------------------------------------------------------------------
// Moving lid: enforce u = u_lid, v = 0 at y = NY-1
// Sets equilibrium distribution at top wall nodes.
// ------------------------------------------------------------------
inline void enforce_lid(LBMCapabilities& sys, double u_lid) {
    for (int x = 0; x < NX; ++x) {
        int idx = node_index(x, NY - 1);
        double* f_node = &sys.f[idx * 9];
        double rho, u, v;
        compute_macros(f_node, rho, u, v);
        for (int i = 0; i < 9; ++i) {
            f_node[i] = compute_equilibrium(i, rho, u_lid, 0.0);
        }
    }
}

// ------------------------------------------------------------------
// MRT collision (d'Humieres 2002, D2Q9)
// Forward transform: f -> moment space
// Relax moments independently
// Inverse transform: moment space -> f
// ------------------------------------------------------------------
inline void mrt_collide(double* f_node, double rho, double u, double v,
                        const MRTParams& mrt, double cs_sq = 0.0, double tau_base = 0.0,
                        double y_plus = 0.0) {
    double f0 = f_node[0], f1 = f_node[1], f2 = f_node[2];
    double f3 = f_node[3], f4 = f_node[4];
    double f5 = f_node[5], f6 = f_node[6], f7 = f_node[7], f8 = f_node[8];

    // Forward transform: compute non-conserved moments
    double e   = -4*f0 - f1 - f2 - f3 - f4 + 2*(f5 + f6 + f7 + f8);
    double eps =  4*f0 - 2*(f1 + f2 + f3 + f4) + (f5 + f6 + f7 + f8);
    double qx  = -2*f1 + 2*f3 + f5 - f6 - f7 + f8;
    double qy  = -2*f2 + 2*f4 + f5 + f6 - f7 - f8;
    double pxx =  f1 - f2 + f3 - f4;
    double pxy =  f5 - f6 + f7 - f8;

    double jx = rho * u;
    double jy = rho * v;
    double usq = u*u + v*v;

    // Equilibrium moments (non-conserved)
    double e_eq   = -2*rho + 3*rho*usq;
    double eps_eq =  rho - 3*rho*usq;
    double qx_eq  = -jx;
    double qy_eq  = -jy;
    double pxx_eq = rho*(u*u - v*v);
    double pxy_eq = rho*u*v;

    // Smagorinsky LES: compute effective s_shear from non-equilibrium stress
    double s_shear_eff = mrt.s_shear;
    auto clamp = [](double x) { return (x < 0.5) ? 0.5 : ((x > 1.99) ? 1.99 : x); };
    if (cs_sq > 0.0 && tau_base > 0.0) {
        double pxx_neq = pxx - pxx_eq;
        double pxy_neq = pxy - pxy_eq;
        double Q = std::sqrt(2.0 * (pxx_neq*pxx_neq + pxy_neq*pxy_neq));
        double A = 9.0 * cs_sq * Q / (2.0 * rho);
        double tau_eff = (tau_base + std::sqrt(tau_base*tau_base + 4.0*A)) / 2.0;
        double s = 1.0 / tau_eff;
        s_shear_eff = clamp(s);
    }

    // Van Driest near-wall damping for LES: reduces SGS viscosity near walls
    // nu_t_damped = nu_t * (1 - exp(-y+/A+))^2, A+ = 26
    // Implemented by damping the Smagorinsky constant (cs) used in tau_eff
    if (cs_sq > 0.0 && tau_base > 0.0 && y_plus > 0.0) {
        double damp = 1.0 - std::exp(-y_plus / 26.0);
        double cs_damped = std::sqrt(cs_sq) * damp;
        double cs_sq_damped = cs_damped * cs_damped;
        double pxx_neq = pxx - pxx_eq;
        double pxy_neq = pxy - pxy_eq;
        double Q = std::sqrt(2.0 * (pxx_neq*pxx_neq + pxy_neq*pxy_neq));
        double A = 9.0 * cs_sq_damped * Q / (2.0 * rho);
        double tau_eff_damped = (tau_base + std::sqrt(tau_base*tau_base + 4.0*A)) / 2.0;
        double s_damped = 1.0 / tau_eff_damped;
        s_shear_eff = clamp(s_damped);
    }

    // Relax non-conserved moments
    e   -= mrt.s_bulk  * (e   - e_eq);
    eps -= mrt.s_bulk  * (eps - eps_eq);
    qx  -= mrt.s_normal * (qx  - qx_eq);
    qy  -= mrt.s_normal * (qy  - qy_eq);
    pxx -= s_shear_eff * (pxx - pxx_eq);
    pxy -= s_shear_eff * (pxy - pxy_eq);

    // Inverse transform: construct f_i = M_inv[i] . m
    f_node[0] = (1.0/9.0)*rho + (-1.0/9.0)*e + (1.0/9.0)*eps;
    f_node[1] = (1.0/9.0)*rho + (-1.0/36.0)*e + (-1.0/18.0)*eps
              + (1.0/6.0)*jx + (-1.0/6.0)*qx + (1.0/4.0)*pxx;
    f_node[2] = (1.0/9.0)*rho + (-1.0/36.0)*e + (-1.0/18.0)*eps
              + (1.0/6.0)*jy + (-1.0/6.0)*qy + (-1.0/4.0)*pxx;
    f_node[3] = (1.0/9.0)*rho + (-1.0/36.0)*e + (-1.0/18.0)*eps
              + (-1.0/6.0)*jx + (1.0/6.0)*qx + (1.0/4.0)*pxx;
    f_node[4] = (1.0/9.0)*rho + (-1.0/36.0)*e + (-1.0/18.0)*eps
              + (-1.0/6.0)*jy + (1.0/6.0)*qy + (-1.0/4.0)*pxx;
    f_node[5] = (1.0/9.0)*rho + (1.0/18.0)*e + (1.0/36.0)*eps
              + (1.0/6.0)*jx + (1.0/12.0)*qx
              + (1.0/6.0)*jy + (1.0/12.0)*qy
              + (1.0/4.0)*pxy;
    f_node[6] = (1.0/9.0)*rho + (1.0/18.0)*e + (1.0/36.0)*eps
              + (-1.0/6.0)*jx + (-1.0/12.0)*qx
              + (1.0/6.0)*jy + (1.0/12.0)*qy
              + (-1.0/4.0)*pxy;
    f_node[7] = (1.0/9.0)*rho + (1.0/18.0)*e + (1.0/36.0)*eps
              + (-1.0/6.0)*jx + (-1.0/12.0)*qx
              + (-1.0/6.0)*jy + (-1.0/12.0)*qy
              + (1.0/4.0)*pxy;
    f_node[8] = (1.0/9.0)*rho + (1.0/18.0)*e + (1.0/36.0)*eps
              + (1.0/6.0)*jx + (1.0/12.0)*qx
              + (-1.0/6.0)*jy + (-1.0/12.0)*qy
              + (-1.0/4.0)*pxy;
}

// ------------------------------------------------------------------
// Bouzidi interpolated bounce-back for a single boundary link
// Called during streaming when fluid->solid link is detected.
// Reads post-collision sys.f, writes to sys.f_next.
// Ladd (1994) moving boundary: f_bb = f_opp - 2*w_i*rho*(e_i.u_wall)/c_s^2
// ------------------------------------------------------------------
inline void apply_bouzidi_bb(LBMCapabilities& sys, int x, int y, int i,
                               const double* f_node, int node_idx) {
    const BounceBackGeometry& geom = sys.bb_geom;
    double q = geom.compute_q(static_cast<double>(x), static_cast<double>(y), i);
    int bb = bounce_back[i];

    // Compute bounce-back value
    double f_bb;
    if (geom.use_mei_bb) {
        // Mei et al. (1999) / Filippova-Hanel (1998) interpolated bounce-back:
        // f_bb = q * f_i^{eq}(rho, u_wall) + (1-q) * f_post(node,i) + (2q-1) * w_i * rho * (e_i.u_wall)/cs^2
        // Unconditionally stable for all q in [0,1]. At q=0.5 reduces to halfway BB.
        double rho, u, v;
        compute_macros(f_node, rho, u, v);

        // Wall velocity (zero for static walls, tangential for rotating walls)
        double u_wx = 0.0, u_wy = 0.0;
        if (geom.has_moving_wall) {
            geom.compute_wall_velocity(static_cast<double>(x + cx[i]),
                                        static_cast<double>(y + cy[i]),
                                        u_wx, u_wy);
        }

        // Equilibrium at wall velocity (wet node value)
        double f_eq_wall = compute_equilibrium(i, rho, u_wx, u_wy);
        // Post-collision value at fluid node in the SAME direction i
        double f_post = f_node[i];
        double edot_uw = cx[i] * u_wx + cy[i] * u_wy;

        f_bb = q * f_eq_wall + (1.0 - q) * f_post
             + (2.0 * q - 1.0) * weights[i] * rho * edot_uw * 3.0;  // * 3.0 = / (1/3)
    } else {
        // Standard Bouzidi (2001) interpolated bounce-back
        if (q < 0.5) {
            int src_x = x - cx[i];
            int src_y = y - cy[i];
            if (src_x >= 0 && src_x < NX && src_y >= 0 && src_y < NY) {
                double f_i_src = sys.f[node_index(src_x, src_y) * 9 + i];
                f_bb = 2.0 * q * f_node[i] + (1.0 - 2.0 * q) * f_i_src;
            } else {
                f_bb = f_node[i];
            }
        } else {
            double inv2q = 1.0 / (2.0 * q);
            double f_opp = sys.f[node_idx * 9 + bb];
            f_bb = inv2q * f_node[i] + (1.0 - inv2q) * f_opp;
        }
    }

    // Ladd (1994) moving boundary correction (already in Mei scheme above)
    if (geom.has_moving_wall && !geom.use_mei_bb) {
        double u_wx, u_wy;
        geom.compute_wall_velocity(static_cast<double>(x + cx[i]),
                                    static_cast<double>(y + cy[i]),
                                    u_wx, u_wy);
        double rho, u, v;
        compute_macros(f_node, rho, u, v);
        double edot_uw = cx[i] * u_wx + cy[i] * u_wy;
        f_bb -= 2.0 * weights[i] * rho * edot_uw * 3.0;  // * 3.0 = / (1/3)
    }

    sys.f_next[node_idx * 9 + bb] = f_bb;
}

// ------------------------------------------------------------------
// One complete time step: collide + stream + boundaries + forces
// ------------------------------------------------------------------
inline void execute_time_step(LBMCapabilities& sys, double tau, double u_inflow) {
    int n_nodes = NX * NY;

    double Fscale = (sys.body_force_x != 0.0)
        ? (1.0 - 1.0 / (2.0 * tau)) * 3.0 * sys.body_force_x : 0.0;

    // --- Collision (+ body force fused + LES) ---
    if (g_collision == CollisionType::MRT) {
        MRTParams mrt = MRTParams::from_tau(tau);
        double cs_sq = g_use_les ? (g_cs * g_cs) : 0.0;
        // Compute wall distance for Van Driest damping (only if LES enabled)
        if (cs_sq > 0.0) compute_wall_distance(sys);
        double nu = (tau - 0.5) / 3.0;  // lattice kinematic viscosity
        #pragma omp parallel for collapse(2)
        for (int y = 0; y < NY; ++y) {
            for (int x = 0; x < NX; ++x) {
                int node_idx = node_index(x, y);
                if (sys.obstacle[node_idx]) continue;
                double* f_node = &sys.f[node_idx * 9];
                double rho, u, v;
                compute_macros(f_node, rho, u, v);
                // y+ = y * u_tau / nu; u_tau from wall distance estimate
                // For Van Driest, y+ ~ wall_dist * sqrt(tau_wall/rho) / nu
                // tau_wall approximated from local velocity gradient magnitude
                double y_plus = 0.0;
                if (cs_sq > 0.0 && nu > 0.0) {
                    double wall_d = sys.wall_dist[node_idx];
                    // u_tau ~ 0.5 * |grad u| * y (from linear sublayer u+ = y+)
                    // Use speed magnitude as proxy; conservative estimate
                    double speed = std::sqrt(u*u + v*v);
                    double u_tau = std::sqrt(speed * speed + 1e-12); // lower bound
                    y_plus = wall_d * u_tau / nu;
                }
                mrt_collide(f_node, rho, u, v, mrt, cs_sq, tau, y_plus);
                if (Fscale != 0.0) {
                    for (int i = 0; i < 9; ++i) {
                        f_node[i] += weights[i] * cx[i] * Fscale;
                    }
                }
            }
        }
    } else {
        // BGK fallback
        #pragma omp parallel for collapse(2)
        for (int y = 0; y < NY; ++y) {
            for (int x = 0; x < NX; ++x) {
                int node_idx = node_index(x, y);
                if (sys.obstacle[node_idx]) continue;
                double* f_node = &sys.f[node_idx * 9];
                double rho, u, v;
                compute_macros(f_node, rho, u, v);
                double inv_tau = 1.0 / tau;
                for (int i = 0; i < 9; ++i) {
                    double feq = compute_equilibrium(i, rho, u, v);
                    f_node[i] -= inv_tau * (f_node[i] - feq);
                    if (Fscale != 0.0) {
                        f_node[i] += weights[i] * cx[i] * Fscale;
                    }
                }
            }
        }
    }

    // --- Thermal collision (Upgrade 4: Double Distribution Function) ---
    if (sys.use_thermal) {
        // Compute Boussinesq buoyancy force from temperature field and apply to
        // momentum distributions (Guo forcing scheme: implicit velocity correction)
        double rho_0 = 1.0;  // reference density (lattice units)
        #pragma omp parallel for collapse(2)
        for (int y = 0; y < NY; ++y) {
            for (int x = 0; x < NX; ++x) {
                int node_idx = node_index(x, y);
                if (sys.obstacle[node_idx]) continue;
                double* f_node = &sys.f[node_idx * 9];
                double* g_node = &sys.g_thermal[node_idx * 9];
                double rho, u, v;
                compute_macros(f_node, rho, u, v);
                double T;
                compute_temperature(g_node, T);

                // Thermal collision: relax g_i toward thermal equilibrium
                thermal_collide(g_node, T, u, v, sys.omega_k);

                // Boussinesq buoyancy: F = -rho_0 * beta * (T - T_ref) * g
                if (sys.beta > 0.0 && sys.g_buoyancy != 0.0) {
                    double fx_buoy, fy_buoy;
                    boussinesq_force(T, sys.T_ref, rho_0, sys.beta,
                                    0.0, sys.g_buoyancy, fx_buoy, fy_buoy);
                    // Guo forcing: add to momentum distributions
                    // f_i += w_i * [3 * (e_i - u) + 9 * (e_i.u) * e_i] . F * dt
                    for (int i = 0; i < 9; ++i) {
                        double edotu = cx[i] * u + cy[i] * v;
                        double feq = compute_equilibrium(i, rho, u, v);
                        double Fdot = cx[i] * fx_buoy + cy[i] * fy_buoy;
                        double correction = weights[i] * (
                            3.0 * Fdot +
                            9.0 * edotu * (cx[i] * fx_buoy + cy[i] * fy_buoy)
                        );
                        // Apply as body force (explicit, second-order)
                        f_node[i] += correction;
                    }
                }
            }
        }
    }

    // --- Zero f_next (parallel) ---
    #pragma omp parallel for
    for (int n = 0; n < NX * NY * 9; ++n) sys.f_next[n] = 0.0;
    if (sys.use_thermal) {
        #pragma omp parallel for
        for (int n = 0; n < NX * NY * 5; ++n) sys.g_thermal_next[n] = 0.0;
    }

    // --- Streaming (g_case hoisted outside direction loop) ---
    bool use_interp_global = sys.bb_geom.is_valid();

    if (g_case == CaseType::CAVITY) {
        #pragma omp parallel for collapse(2)
        for (int y = 0; y < NY; ++y) {
            for (int x = 0; x < NX; ++x) {
                int node_idx = node_index(x, y);
                if (sys.obstacle[node_idx]) continue;
                double* f_node = &sys.f[node_idx * 9];
                for (int i = 0; i < 9; ++i) {
                    int next_x = x + cx[i];
                    int next_y = y + cy[i];
                    if (next_x < 0 || next_x >= NX || next_y < 0 || next_y >= NY) {
                        sys.f_next[node_idx * 9 + bounce_back[i]] = f_node[i];
                    } else {
                        int target_node = node_index(next_x, next_y);
                        if (sys.obstacle[target_node]) {
                            if (use_interp_global)
                                apply_bouzidi_bb(sys, x, y, i, f_node, node_idx);
                            else
                                sys.f_next[node_idx * 9 + bounce_back[i]] = f_node[i];
                        } else {
                            sys.f_next[target_node * 9 + i] = f_node[i];
                        }
                    }
                }
            }
        }
    } else if (g_case == CaseType::RIBS || g_case == CaseType::PERIODIC_HILLS) {
        #pragma omp parallel for collapse(2)
        for (int y = 0; y < NY; ++y) {
            for (int x = 0; x < NX; ++x) {
                int node_idx = node_index(x, y);
                if (sys.obstacle[node_idx]) continue;
                double* f_node = &sys.f[node_idx * 9];
                for (int i = 0; i < 9; ++i) {
                    int next_x = x + cx[i];
                    int next_y = y + cy[i];
                    if (next_x < 0) next_x += NX;
                    if (next_x >= NX) next_x -= NX;
                    if (next_y < 0) next_y += NY;
                    if (next_y >= NY) next_y -= NY;
                    int target_node = node_index(next_x, next_y);
                    if (sys.obstacle[target_node]) {
                        sys.f_next[node_idx * 9 + bounce_back[i]] = f_node[i];
                    } else {
                        sys.f_next[target_node * 9 + i] = f_node[i];
                    }
                }
            }
        }
    } else if (g_case == CaseType::URBAN_CITYGRID) {
        // No periodic wrapping -- all boundaries are solid walls or BCs.
        // BCs (enforce_inflow/enforce_outflow) are applied after streaming.
        #pragma omp parallel for collapse(2)
        for (int y = 0; y < NY; ++y) {
            for (int x = 0; x < NX; ++x) {
                int node_idx = node_index(x, y);
                if (sys.obstacle[node_idx]) continue;
                double* f_node = &sys.f[node_idx * 9];
                for (int i = 0; i < 9; ++i) {
                    int next_x = x + cx[i];
                    int next_y = y + cy[i];
                    if (next_x < 0 || next_x >= NX || next_y < 0 || next_y >= NY) {
                        // Bounce-back at domain boundaries (BCs overwrite after swap)
                        sys.f_next[node_idx * 9 + bounce_back[i]] = f_node[i];
                    } else {
                        int target_node = node_index(next_x, next_y);
                        if (sys.obstacle[target_node]) {
                            if (use_interp_global)
                                apply_bouzidi_bb(sys, x, y, i, f_node, node_idx);
                            else
                                sys.f_next[node_idx * 9 + bounce_back[i]] = f_node[i];
                        } else {
                            sys.f_next[target_node * 9 + i] = f_node[i];
                        }
                    }
                }
            }
        }
    } else {
        // Default: periodic in y, convective outlet at x
        // Wall functions: when enabled, apply log-law slip velocity at walls
        // instead of no-slip bounce-back for nodes with y+ > threshold.
        double nu = (tau - 0.5) / 3.0;
        #pragma omp parallel for collapse(2)
        for (int y = 0; y < NY; ++y) {
            for (int x = 0; x < NX; ++x) {
                int node_idx = node_index(x, y);
                if (sys.obstacle[node_idx]) continue;
                double* f_node = &sys.f[node_idx * 9];
                double rho, u, v;
                compute_macros(f_node, rho, u, v);
                for (int i = 0; i < 9; ++i) {
                    int next_x = x + cx[i];
                    int next_y = y + cy[i];
                    if (next_y < 0) next_y += NY;
                    if (next_y >= NY) next_y -= NY;
                    if (next_x >= 0 && next_x < NX) {
                        int target_node = node_index(next_x, next_y);
                        if (sys.obstacle[target_node]) {
                            // Wall function check: apply log-law slip if y+ is high enough
                            bool use_wf = false;
                            double u_slip_x = 0.0, u_slip_y = 0.0;
                            if (g_wf.enabled && nu > 0.0) {
                                double wall_d = sys.wall_dist[node_idx];
                                double speed = std::sqrt(u * u + v * v);
                                double u_tau_est = std::sqrt(speed * speed + 1e-12);
                                double y_plus = wall_d * u_tau_est / nu;
                                if (y_plus > g_wf.y_plus_min && u_tau_est > 1e-12) {
                                    // Log-law slip velocity (tangential to wall)
                                    double u_plus = (1.0 / g_wf.kappa) * std::log(y_plus) + g_wf.B;
                                    double slip_mag = u_tau_est * u_plus;
                                    // Tangential direction: perpendicular to wall-normal
                                    // Wall-normal is roughly (cx[i], cy[i]) direction
                                    // Tangential is perpendicular: (-cy[i], cx[i])
                                    double len = std::sqrt(cx[i] * cx[i] + cy[i] * cy[i]);
                                    if (len > 0.0) {
                                        u_slip_x = -cy[i] / len * slip_mag;
                                        u_slip_y = cx[i] / len * slip_mag;
                                    }
                                    use_wf = true;
                                }
                            }
                            if (use_wf) {
                                // Wall function bounce-back with slip velocity
                                double f_opp = f_node[i];
                                double edot_u = cx[i] * u_slip_x + cy[i] * u_slip_y;
                                double correction = 2.0 * weights[i] * rho * edot_u * 3.0;
                                sys.f_next[node_idx * 9 + bounce_back[i]] = f_opp - correction;
                            } else if (use_interp_global) {
                                apply_bouzidi_bb(sys, x, y, i, f_node, node_idx);
                            } else {
                                sys.f_next[node_idx * 9 + bounce_back[i]] = f_node[i];
                            }
                        } else {
                            sys.f_next[target_node * 9 + i] = f_node[i];
                        }
                    }
                }
            }
        }
    }

    // Swap buffers
    sys.f.swap(sys.f_next);

    // --- Thermal streaming (Upgrade 4: DDF) ---
    if (sys.use_thermal) {
        // Thermal streaming uses same pattern as momentum but with adiabatic
        // bounce-back at solid boundaries (zero heat flux)
        #pragma omp parallel for collapse(2)
        for (int y = 0; y < NY; ++y) {
            for (int x = 0; x < NX; ++x) {
                int node_idx = node_index(x, y);
                if (sys.obstacle[node_idx]) continue;
                double* g_node = &sys.g_thermal[node_idx * 9];
                for (int i = 0; i < 9; ++i) {
                    int next_x = x + cx[i];
                    int next_y = y + cy[i];
                    // Handle periodic / outflow wrapping (same as momentum)
                    if (g_case == CaseType::RIBS || g_case == CaseType::PERIODIC_HILLS) {
                        if (next_x < 0) next_x += NX;
                        if (next_x >= NX) next_x -= NX;
                        if (next_y < 0) next_y += NY;
                        if (next_y >= NY) next_y -= NY;
                    } else {
                        if (next_y < 0) next_y += NY;
                        if (next_y >= NY) next_y -= NY;
                    }
                    if (next_x < 0 || next_x >= NX || next_y < 0 || next_y >= NY) {
                        // Outflow / wall: adiabatic bounce-back for temperature
                        sys.g_thermal_next[node_idx * 9 + bounce_back[i]] = g_node[i];
                    } else {
                        int target_node = node_index(next_x, next_y);
                        if (sys.obstacle[target_node]) {
                            // Adiabatic wall: bounce-back on g_i
                            sys.g_thermal_next[node_idx * 9 + bounce_back[i]] = g_node[i];
                        } else {
                            sys.g_thermal_next[target_node * 9 + i] = g_node[i];
                        }
                    }
                }
            }
        }
        sys.g_thermal.swap(sys.g_thermal_next);

        // Apply isothermal (Dirichlet) thermal BC at heated walls.
        // The adiabatic bounce-back above handles adiabatic walls.
        // For isothermal walls (T = T_wall), enforce equilibrium distribution.
        // This runs after streaming to ensure correct post-streaming values.
        if (sys.T_wall != sys.T_ref) {
            #pragma omp parallel for collapse(2)
            for (int y = 0; y < NY; ++y) {
                for (int x = 0; x < NX; ++x) {
                    int idx = node_index(x, y);
                    if (!sys.obstacle[idx]) continue;
                    // Check if this obstacle node has a fluid neighbor (i.e., is a wall node)
                    bool has_fluid = false;
                    for (int d = 0; d < 4; ++d) {
                        int nx = x + (d == 0 ? -1 : d == 1 ? 1 : 0);
                        int ny = y + (d == 2 ? -1 : d == 3 ? 1 : 0);
                        if (nx >= 0 && nx < NX && ny >= 0 && ny < NY) {
                            if (!sys.obstacle[node_index(nx, ny)]) {
                                has_fluid = true;
                                break;
                            }
                        }
                    }
                    if (has_fluid) {
                        // Enforce isothermal BC: g_i = w_i * T_wall
                        double* g_node = &sys.g_thermal[idx * 9];
                        for (int i = 0; i < 9; ++i) {
                            g_node[i] = weights[i] * sys.T_wall;
                        }
                    }
                }
            }
        }
    }

    // --- Passive scalar transport (ONE-WAY coupling: flow carries scalar) ---
    if (g_scalar.enabled) {
        // Compute macroscopic velocity for scalar transport
        std::vector<double> u_scalar(NX * NY, 0.0);
        std::vector<double> v_scalar(NX * NY, 0.0);
        std::vector<double> rho_scalar(NX * NY, 1.0);

        #pragma omp parallel for collapse(2)
        for (int y = 0; y < NY; ++y) {
            for (int x = 0; x < NX; ++x) {
                int idx = node_index(x, y);
                if (sys.obstacle[idx]) continue;
                double rho, u, v;
                compute_macros(&sys.f[idx * 9], rho, u, v);
                u_scalar[idx] = u;
                v_scalar[idx] = v;
                rho_scalar[idx] = rho;
            }
        }

        // Collide scalar
        g_scalar.collide(NX, NY, rho_scalar.data(), u_scalar.data(), v_scalar.data());

        // Stream scalar
        g_scalar.stream(NX, NY);

        // Compute new scalar concentration
        g_scalar.compute_phi(NX, NY);

        // Apply scalar BCs (inlet fixed concentration)
        g_scalar.apply_bc(NX, NY, sys.obstacle.data(), 1.0, 0);
    }

    // --- Boundary conditions ---
    if (g_case == CaseType::CAVITY) {
        enforce_lid(sys, u_inflow);
    } else if (g_case == CaseType::STEP) {
        int sh = (g_step_h_step > 0) ? g_step_h_step : NY / 2;
        int si = (g_step_h_inlet > 0) ? g_step_h_inlet : (NY - 1 - NY / 2);
        enforce_step_inflow(sys, sh, si, u_inflow);
        enforce_outflow(sys);
    } else if (g_case == CaseType::URBAN_CITYGRID) {
        // Three inlet configurations: East (left->right), South (bottom->top),
        // West (right->left). Each requires different Zou-He BCs and outflow.
        if (g_inlet_dir == 0) {
            // East inlet: flow from left to right
            enforce_inflow(sys, u_inflow);
            enforce_outflow(sys);
        } else if (g_inlet_dir == 1) {
            // South inlet: flow from bottom to top
            enforce_south_inflow(sys, u_inflow);
            enforce_north_outflow(sys);
        } else if (g_inlet_dir == 2) {
            // West inlet: flow from right to left
            enforce_west_inflow(sys, u_inflow);
            enforce_east_outflow(sys);
        }
    } else if (g_case != CaseType::RIBS && g_case != CaseType::PERIODIC_HILLS) {
        enforce_inflow(sys, u_inflow);
        enforce_outflow(sys);
    }
    // RIBS and PERIODIC_HILLS have periodic x -- no BC enforcement needed

    // --- Force extraction (all non-cavity cases) ---
    if (g_case != CaseType::CAVITY) {
        sys.reset_forces();
        for (int y = 0; y < NY; ++y) {
            for (int x = 0; x < NX; ++x) {
                int node_idx = node_index(x, y);
                if (sys.obstacle[node_idx]) continue;

                for (int i = 0; i < 9; ++i) {
                    int nx = x + cx[i];
                    int ny = y + cy[i];
                    if (g_case == CaseType::RIBS || g_case == CaseType::PERIODIC_HILLS) {
                        // Periodic in x (and y) for ribbed channel / periodic hills
                        if (ny < 0) ny += NY;
                        if (ny >= NY) ny -= NY;
                        if (nx < 0) nx += NX;
                        if (nx >= NX) nx -= NX;
                    } else {
                        if (ny < 0) ny += NY;
                        if (ny >= NY) ny -= NY;
                        if (nx < 0 || nx >= NX) continue;
                    }

                    int target_idx = node_index(nx, ny);
                    if (sys.obstacle[target_idx]) {
                        // For CYLINDER_NEAR_WALL, only count forces on the cylinder
                        // (skip wall nodes at y=0 which are not part of bb_geom)
                        if (g_case == CaseType::CYLINDER_NEAR_WALL) {
                            double dx = static_cast<double>(nx) - sys.bb_geom.cx;
                            double dy = static_cast<double>(ny) - sys.bb_geom.cy;
                            if (std::sqrt(dx*dx + dy*dy) > sys.bb_geom.radius) continue;
                        }
                        double f_boundary = sys.f[node_idx * 9 + bounce_back[i]];
                        sys.fx_body[node_idx] += cx[i] * 2.0 * f_boundary;
                        sys.fy_body[node_idx] += cy[i] * 2.0 * f_boundary;
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------
// JSON frame export: velocity field, downsampled for web
// Writes output_dir/frames/frame_{step:04d}.json
// ------------------------------------------------------------------
inline void save_json_frame(const LBMCapabilities& sys, int step, const std::string& output_dir) {
    int ds = std::max(1, NX / 100);                // downsample factor
    int nx_ds = (NX + ds - 1) / ds;                // ceil division
    int ny_ds = (NY + ds - 1) / ds;

    std::string dir = output_dir + "/frames";
    std::filesystem::create_directories(dir);

    std::string filename = dir + "/frame_" + std::to_string(step) + ".json";
    std::ofstream out(filename);
    out.precision(6);
    out << std::fixed;

    // Cache downsampled macro values
    int n_ds = nx_ds * ny_ds;
    std::vector<double> vel_arr(n_ds, 0.0);
    std::vector<double> u_arr(n_ds, 0.0);
    std::vector<double> v_arr(n_ds, 0.0);
    std::vector<double> rho_arr(n_ds, 0.0);
    std::vector<double> omega_arr(n_ds, 0.0);
    std::vector<int> obst_arr(n_ds, 0);
    int idx2 = 0;
    for (int y = 0; y < NY; y += ds) {
        for (int x = 0; x < NX; x += ds) {
            int idx = node_index(x, y);
            if (sys.obstacle[idx]) {
                obst_arr[idx2] = 1;
                ++idx2;
                continue;
            }
            double rho, u, v;
            compute_macros(&sys.f[idx * 9], rho, u, v);
            if (rho < 1e-12 || std::isnan(rho)) { rho = 1.0; u = 0.0; v = 0.0; }
            if (std::isnan(u)) u = 0.0;
            if (std::isnan(v)) v = 0.0;
            double vel = std::sqrt(u * u + v * v);
            if (std::isnan(vel)) vel = 0.0;
            vel_arr[idx2] = vel;
            u_arr[idx2] = u;
            v_arr[idx2] = v;
            rho_arr[idx2] = rho;
            ++idx2;
        }
    }

    // Compute vorticity on downsampled grid using 9-point stencil
    // omega = dv/dx - du/dy  (2D z-component of vorticity)
    // Uses a higher-order central-difference operator (9-point) for accuracy
    for (int j = 0; j < ny_ds; ++j) {
        for (int i = 0; i < nx_ds; ++i) {
            int idx = j * nx_ds + i;
            if (obst_arr[idx]) continue;
            // 9-point stencil: sample offsets up to 1 cell in each direction
            int il = std::max(0, i - 1);
            int ir = std::min(nx_ds - 1, i + 1);
            int jd = std::max(0, j - 1);
            int ju = std::min(ny_ds - 1, j + 1);
            // Higher-order central difference (2nd-order accurate, 9-point):
            // dv/dx = (v[i+1] - v[i-1]) / (2*dx)
            // du/dy = (u[j+1] - u[j-1]) / (2*dy)
            double dv_dx = (v_arr[j * nx_ds + ir] - v_arr[j * nx_ds + il])
                           / (2.0 * static_cast<double>((ir - il) * ds));
            double du_dy = (u_arr[ju * nx_ds + i] - u_arr[jd * nx_ds + i])
                           / (2.0 * static_cast<double>((ju - jd) * ds));
            omega_arr[idx] = dv_dx - du_dy;
        }
    }

    // Write velocity magnitude
    out << "{\"nx\":" << nx_ds << ",\"ny\":" << ny_ds << ",\"velocity\":[";
    for (int i = 0; i < n_ds; ++i) {
        if (i > 0) out << ",";
        out << vel_arr[i];
    }

    out << "],\"u\":[";
    for (int i = 0; i < n_ds; ++i) {
        if (i > 0) out << ",";
        out << u_arr[i];
    }

    out << "],\"v\":[";
    for (int i = 0; i < n_ds; ++i) {
        if (i > 0) out << ",";
        out << v_arr[i];
    }

    out << "],\"rho\":[";
    for (int i = 0; i < n_ds; ++i) {
        if (i > 0) out << ",";
        out << rho_arr[i];
    }

    out << "],\"p\":[";
    for (int i = 0; i < n_ds; ++i) {
        if (i > 0) out << ",";
        // Pressure perturbation: p' = (rho - 1) / 3 (relative to reference density)
        out << ((rho_arr[i] - 1.0) / 3.0);
    }

    out << "],\"omega\":[";
    for (int i = 0; i < n_ds; ++i) {
        if (i > 0) out << ",";
        out << omega_arr[i];
    }

    out << "],\"obstacle\":[";
    for (int i = 0; i < n_ds; ++i) {
        if (i > 0) out << ",";
        out << obst_arr[i];
    }

    // Write obstacle geometry metadata for vector-geometry overlay
    out << "],\"obstacle_meta\":{";
    out << "\"type\":\"" << ([](CaseType c) -> std::string {
        switch (c) {
            case CaseType::CYLINDER: return "circle";
            case CaseType::CAVITY: return "none";
            case CaseType::STEP: return "rectangle";
            case CaseType::RIBS: return "ribbed";
            case CaseType::URBAN_CANYON: return "buildings";
            case CaseType::DOWNWASH: return "buildings";
            case CaseType::ORIFICE_PLATE: return "orifice";
            case CaseType::FLAT_PLATE: return "none";
            case CaseType::SQUARE_CYLINDER: return "square";
            case CaseType::PERIODIC_HILLS: return "hill";
            case CaseType::CYLINDER_NEAR_WALL: return "cylinder_wall";
            case CaseType::SIDE_BY_SIDE: return "two_circles";
            case CaseType::ROTATING_CYLINDER: return "circle";
            case CaseType::URBAN_CITYGRID: return "citygrid";
            default: return "unknown";
        }
    })(g_case) << "\"";

    // Add geometry details based on case type
    switch (g_case) {
        case CaseType::CYLINDER:
        case CaseType::ROTATING_CYLINDER: {
            // Single cylinder at center-left
            double cx = NX / 4.0;
            double cy = NY / 2.0;
            double r = std::min(NX, NY) * 0.0375;
            out << ",\"circles\":[{\"cx\":" << cx << ",\"cy\":" << cy << ",\"r\":" << r << "}]";
            break;
        }
        case CaseType::STEP: {
            // Backward-facing step: rectangle at bottom-left
            double h_step = NY / 3.0;
            double w_step = NX / 4.0;
            out << ",\"rectangles\":[{\"x0\":0,\"y0\":0,\"w\":" << w_step << ",\"h\":" << h_step << "}]";
            break;
        }
        case CaseType::CYLINDER_NEAR_WALL: {
            // Cylinder above wall
            double cx = NX / 4.0;
            double r = std::min(NX, NY) * 0.0375;
            out << ",\"circles\":[{\"cx\":" << cx << ",\"cy\":" << r << ",\"r\":" << r << "}]";
            break;
        }
        case CaseType::SIDE_BY_SIDE: {
            out << ",\"circles\":[";
            for (size_t ci = 0; ci < sys.bb_geom.cylinders.size(); ++ci) {
                if (ci > 0) out << ",";
                out << "{\"cx\":" << sys.bb_geom.cylinders[ci].cx
                    << ",\"cy\":" << sys.bb_geom.cylinders[ci].cy
                    << ",\"r\":" << sys.bb_geom.cylinders[ci].radius << "}";
            }
            out << "]";
            break;
        }
        case CaseType::URBAN_CITYGRID: {
            // 7 buildings: 4 horizontal + 3 vertical (matching compute_citygrid_params)
            int bldg_w = 120;
            int bldg_h = 240;
            int street_w = 2 * bldg_w;
            out << ",\"rectangles\":[";
            bool first = true;
            // 4 horizontal buildings (long in x)
            int y_start = NY / 6;
            int y_spacing = NY / 5;
            for (int i = 0; i < 4; ++i) {
                int x0 = NX / 6 + i * (bldg_h + street_w / 2);
                int y0 = y_start + i * y_spacing;
                if (!first) out << ",";
                out << "{\"x0\":" << x0 << ",\"y0\":" << y0
                    << ",\"w\":" << bldg_h << ",\"h\":" << bldg_w << "}";
                first = false;
            }
            // 3 vertical buildings (long in y)
            int x_start = NX / 3;
            int x_spacing = NX / 4;
            for (int i = 0; i < 3; ++i) {
                int x0 = x_start + i * x_spacing;
                int y0 = NY / 4 + i * (bldg_w + street_w / 3);
                out << ",{\"x0\":" << x0 << ",\"y0\":" << y0
                    << ",\"w\":" << bldg_w << ",\"h\":" << bldg_h << "}";
            }
            out << "]";
            break;
        }
        default:
            break;
    }

    out << "}";
    out << "}";
    out.close();
}

// ------------------------------------------------------------------
// Thermal frame output (Upgrade 4: includes temperature field)
// Same as save_json_frame but adds "temperature" channel
// ------------------------------------------------------------------
inline void save_json_frame_thermal(LBMCapabilities& sys, int step,
                                     const std::string& output_dir, double T_wall) {
    int ds = std::max(1, NX / 100);                // downsample factor
    int nx_ds = (NX + ds - 1) / ds;                // ceil division
    int ny_ds = (NY + ds - 1) / ds;

    std::string dir = output_dir + "/frames";
    std::filesystem::create_directories(dir);

    std::string filename = dir + "/frame_" + std::to_string(step) + ".json";
    std::ofstream out(filename);
    out.precision(6);
    out << std::fixed;

    int n_ds = nx_ds * ny_ds;
    std::vector<double> vel_arr(n_ds, 0.0);
    std::vector<double> u_arr(n_ds, 0.0);
    std::vector<double> v_arr(n_ds, 0.0);
    std::vector<double> rho_arr(n_ds, 0.0);
    std::vector<double> omega_arr(n_ds, 0.0);
    std::vector<double> temp_arr(n_ds, 0.0);
    std::vector<int> obst_arr(n_ds, 0);
    int idx2 = 0;
    for (int y = 0; y < NY; y += ds) {
        for (int x = 0; x < NX; x += ds) {
            int idx = node_index(x, y);
            if (sys.obstacle[idx]) {
                obst_arr[idx2] = 1;
                temp_arr[idx2] = T_wall;  // wall temperature
                ++idx2;
                continue;
            }
            double rho, u, v;
            compute_macros(&sys.f[idx * 9], rho, u, v);
            double T;
            compute_temperature(&sys.g_thermal[idx * 9], T);
            if (rho < 1e-12 || std::isnan(rho)) { rho = 1.0; u = 0.0; v = 0.0; }
            if (std::isnan(u)) u = 0.0;
            if (std::isnan(v)) v = 0.0;
            if (std::isnan(T)) T = 1.0;
            double vel = std::sqrt(u * u + v * v);
            if (std::isnan(vel)) vel = 0.0;
            vel_arr[idx2] = vel;
            u_arr[idx2] = u;
            v_arr[idx2] = v;
            rho_arr[idx2] = rho;
            temp_arr[idx2] = T;
            ++idx2;
        }
    }

    // Compute vorticity (same as momentum frame)
    for (int j = 0; j < ny_ds; ++j) {
        for (int i = 0; i < nx_ds; ++i) {
            int idx = j * nx_ds + i;
            if (obst_arr[idx]) continue;
            int il = std::max(0, i - 1);
            int ir = std::min(nx_ds - 1, i + 1);
            int jd = std::max(0, j - 1);
            int ju = std::min(ny_ds - 1, j + 1);
            double dv_dx = (v_arr[j * nx_ds + ir] - v_arr[j * nx_ds + il])
                           / (2.0 * static_cast<double>((ir - il) * ds));
            double du_dy = (u_arr[ju * nx_ds + i] - u_arr[jd * nx_ds + i])
                           / (2.0 * static_cast<double>((ju - jd) * ds));
            omega_arr[idx] = dv_dx - du_dy;
        }
    }

    out << "{\"nx\":" << nx_ds << ",\"ny\":" << ny_ds << ",\"velocity\":[";
    for (int i = 0; i < n_ds; ++i) {
        if (i > 0) out << ",";
        out << vel_arr[i];
    }
    out << "],\"u\":[";
    for (int i = 0; i < n_ds; ++i) {
        if (i > 0) out << ",";
        out << u_arr[i];
    }
    out << "],\"v\":[";
    for (int i = 0; i < n_ds; ++i) {
        if (i > 0) out << ",";
        out << v_arr[i];
    }
    out << "],\"rho\":[";
    for (int i = 0; i < n_ds; ++i) {
        if (i > 0) out << ",";
        out << rho_arr[i];
    }
    out << "],\"p\":[";
    for (int i = 0; i < n_ds; ++i) {
        if (i > 0) out << ",";
        // Pressure perturbation: p' = (rho - 1) / 3 (relative to reference density)
        out << ((rho_arr[i] - 1.0) / 3.0);
    }
    out << "],\"omega\":[";
    for (int i = 0; i < n_ds; ++i) {
        if (i > 0) out << ",";
        out << omega_arr[i];
    }
    out << "],\"temperature\":[";
    for (int i = 0; i < n_ds; ++i) {
        if (i > 0) out << ",";
        out << temp_arr[i];
    }
    out << "],\"obstacle\":[";
    for (int i = 0; i < n_ds; ++i) {
        if (i > 0) out << ",";
        out << obst_arr[i];
    }
    out << "]}";
    out.close();
}

// ------------------------------------------------------------------
// Forces JSONL export: cached file handle (open once in trunc mode)
// ------------------------------------------------------------------
inline void save_forces_jsonl(const std::string& output_dir, int step, double cd, double cl) {
    static std::string cached_dir;
    static std::ofstream out;
    if (cached_dir != output_dir) {
        if (out.is_open()) out.close();
        std::string filename = output_dir + "/forces.jsonl";
        out.open(filename, std::ios::trunc);
        out.precision(6);
        out << std::fixed;
        cached_dir = output_dir;
    }
    out << "{\"step\":" << step << ",\"cd\":" << cd << ",\"cl\":" << cl << "}\n";
}

// ------------------------------------------------------------------
// Metadata JSON export: simulation parameters
// ------------------------------------------------------------------
inline void save_meta_json(const std::string& output_dir, double re, double tau,
                            double u_inflow, double length_scale, const std::string& shape_type,
                            int nx, int ny) {
    std::string filename = output_dir + "/meta.json";
    std::ofstream out(filename);
    out.precision(6);
    out << std::fixed;
    out << "{\n";
    out << "  \"nx\": " << nx << ",\n";
    out << "  \"ny\": " << ny << ",\n";
    out << "  \"re\": " << re << ",\n";
    out << "  \"tau\": " << tau << ",\n";
    out << "  \"u_inflow\": " << u_inflow << ",\n";
    out << "  \"length_scale\": " << length_scale << ",\n";
    out << "  \"shape_type\": \"" << shape_type << "\"\n";
    out << "}\n";
}

// ------------------------------------------------------------------
// VTK export (structured points, ASCII) -- legacy, use --vtk flag
// ------------------------------------------------------------------
inline void save_vtk_frame(const LBMCapabilities& sys, int frame, const std::string& output_dir = "output") {
    std::string filename = output_dir + "/frame_" + std::to_string(frame) + ".vtk";
    std::ofstream out(filename);

    out << "# vtk DataFile Version 3.0\nLBM Fluid Grid\nASCII\nDATASET STRUCTURED_POINTS\n";
    out << "DIMENSIONS " << NX << " " << NY << " 1\n";
    out << "ORIGIN 0 0 0\nSPACING 1 1 1\n";
    out << "POINT_DATA " << NX * NY << "\n";

    // Velocity magnitude
    out << "SCALARS VelocityMagnitude double 1\nLOOKUP_TABLE default\n";
    for (int y = 0; y < NY; ++y) {
        for (int x = 0; x < NX; ++x) {
            int idx = node_index(x, y);
            if (sys.obstacle[idx]) {
                out << "0.0\n";
            } else {
                double rho, u, v;
                compute_macros(&sys.f[idx * 9], rho, u, v);
                out << std::sqrt(u * u + v * v) << "\n";
            }
        }
    }

    // Velocity vector field
    out << "VECTORS Velocity double\n";
    for (int y = 0; y < NY; ++y) {
        for (int x = 0; x < NX; ++x) {
            int idx = node_index(x, y);
            if (sys.obstacle[idx]) {
                out << "0 0 0\n";
            } else {
                double rho, u, v;
                compute_macros(&sys.f[idx * 9], rho, u, v);
                out << u << " " << v << " 0\n";
            }
        }
    }

    // Density field
    out << "SCALARS Density double 1\nLOOKUP_TABLE default\n";
    for (int y = 0; y < NY; ++y) {
        for (int x = 0; x < NX; ++x) {
            int idx = node_index(x, y);
            if (sys.obstacle[idx]) {
                out << "0.0\n";
            } else {
                double rho, u, v;
                compute_macros(&sys.f[idx * 9], rho, u, v);
                out << rho << "\n";
            }
        }
    }

    // Drag coefficient field (obstacle boundary nodes)
    out << "SCALARS DragForce double 1\nLOOKUP_TABLE default\n";
    for (int y = 0; y < NY; ++y) {
        for (int x = 0; x < NX; ++x) {
            int idx = node_index(x, y);
            if (sys.fx_body[idx] != 0.0 || sys.fy_body[idx] != 0.0) {
                out << sys.fx_body[idx] << "\n";
            } else {
                out << "0.0\n";
            }
        }
    }
}

// ------------------------------------------------------------------
// Place cylinder obstacle in the domain
// ------------------------------------------------------------------
inline void place_cylinder(LBMCapabilities& sys, int cx_cyl, int cy_cyl, int radius) {
    // Add to multi-cylinder list (for side-by-side and similar cases)
    sys.bb_geom.cylinders.push_back({static_cast<double>(cx_cyl),
                                      static_cast<double>(cy_cyl),
                                      static_cast<double>(radius)});
    // Also set single-cylinder fields (backward compatible for single-cylinder cases)
    sys.bb_geom.cx = static_cast<double>(cx_cyl);
    sys.bb_geom.cy = static_cast<double>(cy_cyl);
    sys.bb_geom.radius = static_cast<double>(radius);
    for (int y = 0; y < NY; ++y) {
        for (int x = 0; x < NX; ++x) {
            double dx = static_cast<double>(x - cx_cyl);
            double dy = static_cast<double>(y - cy_cyl);
            if (std::sqrt(dx * dx + dy * dy) < radius) {
                sys.obstacle[node_index(x, y)] = true;
            }
        }
    }
}

// ------------------------------------------------------------------
// Place arbitrary polygon obstacle in the domain
// poly: closed polygon vertices in grid coordinates
// Also sets bb_geom for interpolated bounce-back
// ------------------------------------------------------------------
inline void place_polygon(LBMCapabilities& sys,
    const std::vector<std::pair<double,double>>& poly)
{
    sys.bb_geom.poly_vertices = poly;
    sys.bb_geom.is_polygon = true;
    for (int y = 0; y < NY; ++y) {
        for (int x = 0; x < NX; ++x) {
            if (point_in_polygon(static_cast<double>(x),
                                 static_cast<double>(y), poly)) {
                sys.obstacle[node_index(x, y)] = true;
            }
        }
    }
}
