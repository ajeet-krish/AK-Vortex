#pragma once

#include "lbm_types.hpp"
#include <vector>
#include <cmath>
#include <cstdint>

// ==========================================================================
// Passive Scalar Transport (D2Q9 distribution g_i)
// ==========================================================================
// ONE-WAY coupling: flow carries scalar, scalar does NOT affect momentum
// Equation: d(phi)/dt + u.grad(phi) = D * laplacian(phi)
// D = diffusion coefficient (lattice units)
// ==========================================================================

struct ScalarTransport {
    std::vector<double> g;       // scalar distribution (9 directions)
    std::vector<double> g_next;  // post-streaming
    std::vector<double> phi;     // scalar concentration field
    double D;                    // diffusion coefficient
    double tau_s;                // scalar relaxation time
    bool enabled;

    ScalarTransport() : D(0.01), tau_s(0.5 + 3.0 * 0.01), enabled(false) {}

    void init(int nx, int ny, double diffusion_coeff = 0.01) {
        D = diffusion_coeff;
        tau_s = 0.5 + 3.0 * D;
        int n = nx * ny;
        g.assign(n * 9, 0.0);
        g_next.assign(n * 9, 0.0);
        phi.assign(n, 0.0);
        enabled = true;
    }

    // Compute equilibrium distribution for scalar
    // g_i^eq = w_i * phi * (1 + e_i.u / cs^2)
    void compute_scalar_equilibrium(int i, double phi_val, double u, double v,
                                    double* g_eq) const {
        double e_dot_u = cx[i] * u + cy[i] * v;
        g_eq[i] = weights[i] * phi_val * (1.0 + 3.0 * e_dot_u);
    }

    // Collide scalar distribution (BGK)
    void collide(int nx, int ny, const double* rho, const double* u, const double* v) {
        if (!enabled) return;

        int n = nx * ny;
        for (int idx = 0; idx < n; ++idx) {
            if (phi[idx] < 1e-12) continue;  // skip empty cells

            double* g_node = &g[idx * 9];
            double* g_eq = new double[9];

            for (int i = 0; i < 9; ++i) {
                compute_scalar_equilibrium(i, phi[idx], u[idx], v[idx], &g_eq[i]);
                // BGK collision: g = g - (g - g_eq) / tau_s
                g_node[i] = g_node[i] - (g_node[i] - g_eq[i]) / tau_s;
            }

            delete[] g_eq;
        }
    }

    // Stream scalar distribution
    void stream(int nx, int ny) {
        if (!enabled) return;

        int n = nx * ny;
        std::fill(g_next.begin(), g_next.end(), 0.0);

        for (int y = 0; y < ny; ++y) {
            for (int x = 0; x < nx; ++x) {
                int idx = y * nx + x;
                double* g_node = &g[idx * 9];

                for (int i = 0; i < 9; ++i) {
                    int xp = x + cx[i];
                    int yp = y + cy[i];

                    // Periodic boundary in x, walls in y
                    if (xp < 0) xp += nx;
                    if (xp >= nx) xp -= nx;
                    if (yp < 0 || yp >= ny) continue;

                    int idx_next = yp * nx + xp;
                    g_next[idx_next * 9 + i] = g_node[i];
                }
            }
        }

        std::swap(g, g_next);
    }

    // Compute macroscopic scalar concentration from distribution
    void compute_phi(int nx, int ny) {
        if (!enabled) return;

        int n = nx * ny;
        for (int idx = 0; idx < n; ++idx) {
            double* g_node = &g[idx * 9];
            double phi_val = 0.0;
            for (int i = 0; i < 9; ++i) {
                phi_val += g_node[i];
            }
            phi[idx] = phi_val;
        }
    }

    // Apply scalar boundary conditions
    // Inlet: fixed concentration, Walls: zero gradient (bounce-back)
    void apply_bc(int nx, int ny, const uint8_t* obstacle,
                  double phi_inlet = 1.0, int inlet_x = 0) {
        if (!enabled) return;

        int n = nx * ny;
        for (int y = 0; y < ny; ++y) {
            // Inlet: fixed concentration
            int idx = y * nx + inlet_x;
            if (!obstacle[idx]) {
                phi[idx] = phi_inlet;
                double* g_node = &g[idx * 9];
                for (int i = 0; i < 9; ++i) {
                    compute_scalar_equilibrium(i, phi_inlet, 0.0, 0.0, &g_node[i]);
                }
            }
        }

        // Walls: bounce-back for scalar
        for (int idx = 0; idx < n; ++idx) {
            if (obstacle[idx]) {
                double* g_node = &g[idx * 9];
                for (int i = 0; i < 9; ++i) {
                    int opp = 8 - i;  // opposite direction
                    double temp = g_node[i];
                    g_node[i] = g_node[opp];
                    g_node[opp] = temp;
                }
            }
        }
    }

    // Add scalar source at a point (e.g., chimney, pollutant source)
    void add_source(int x, int y, int nx, double strength = 1.0) {
        if (!enabled) return;

        if (x >= 0 && x < nx && y >= 0) {
            int idx = y * nx + x;
            phi[idx] += strength;
            double* g_node = &g[idx * 9];
            for (int i = 0; i < 9; ++i) {
                compute_scalar_equilibrium(i, phi[idx], 0.0, 0.0, &g_node[i]);
            }
        }
    }
};

// Global scalar transport instance
inline ScalarTransport g_scalar;
