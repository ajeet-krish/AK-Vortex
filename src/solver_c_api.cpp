#include "solver_c_api.h"
#include "lbm.hpp"
#include "geometry.hpp"
#include <string>
#include <filesystem>
#include <cmath>
#include <random>

int lbm_solve_c(
    int nx, int ny,
    double re, double u_inflow,
    int max_steps, int save_interval,
    const char* output_dir,
    const char* case_type
) {
    // Set global grid dimensions
    NX = nx;
    NY = ny;

    // Set case type
    std::string case_str(case_type);
    if (case_str == "cylinder") {
        g_case = CaseType::CYLINDER;
    } else if (case_str == "cavity") {
        g_case = CaseType::CAVITY;
    } else if (case_str == "step") {
        g_case = CaseType::STEP;
    } else {
        return -1;
    }

    // Compute tau from Re
    double D = 60.0;
    double nu = u_inflow * D / re;
    double tau = 0.5 + 3.0 * nu;

    // Auto-LES for high Re
    if (tau < 0.55) {
        g_use_les = true;
    }

    // Create output directory
    std::string out_dir(output_dir);
    std::filesystem::create_directories(out_dir + "/frames");

    // Initialize system
    LBMCapabilities system;

    // Initialize based on case type
    if (g_case == CaseType::CYLINDER) {
        int cx_cyl = NX / 4;
        int cy_cyl = NY / 2 + 1;
        int radius = 30;
        place_cylinder(system, cx_cyl, cy_cyl, radius);

        // Initialize with equilibrium
        for (int n = 0; n < NX * NY; ++n) {
            double* f_node = &system.f[n * 9];
            for (int i = 0; i < 9; ++i) {
                f_node[i] = compute_equilibrium(i, 1.0, u_inflow, 0.0);
            }
        }

        // Perturbation to trigger shedding
        std::mt19937 rng(42);
        std::uniform_real_distribution<double> pert_dist(-1e-4, 1e-4);
        for (int x = cx_cyl + 5; x < std::min(NX, cx_cyl + 60); ++x) {
            for (int y = 0; y < NY; ++y) {
                int n = node_index(x, y);
                if (system.obstacle[n]) continue;
                double* f_node = &system.f[n * 9];
                double v_pert = pert_dist(rng);
                double rho, u, v;
                compute_macros(f_node, rho, u, v);
                for (int i = 0; i < 9; ++i) {
                    f_node[i] = compute_equilibrium(i, rho, u, v + v_pert);
                }
            }
        }
    } else if (g_case == CaseType::CAVITY) {
        place_walls(system);

        // Initialize to rest
        for (int n = 0; n < NX * NY; ++n) {
            double* f_node = &system.f[n * 9];
            for (int i = 0; i < 9; ++i) {
                f_node[i] = compute_equilibrium(i, 1.0, 0.0, 0.0);
            }
        }
    } else if (g_case == CaseType::STEP) {
        int h_step = NY / 2;
        for (int y = 0; y < h_step; ++y) {
            for (int x = 0; x < NX / 4; ++x) {
                system.obstacle[node_index(x, y)] = true;
            }
        }

        // Initialize to rest
        for (int n = 0; n < NX * NY; ++n) {
            double* f_node = &system.f[n * 9];
            for (int i = 0; i < 9; ++i) {
                f_node[i] = compute_equilibrium(i, 1.0, 0.0, 0.0);
            }
        }
    }

    // Save metadata
    save_meta_json(out_dir, re, tau, u_inflow, D, case_str, NX, NY);

    // Run simulation
    for (int step = 0; step <= max_steps; ++step) {
        execute_time_step(system, tau, u_inflow);

        // Save forces
        double fx_total = 0.0, fy_total = 0.0;
        for (int n = 0; n < NX * NY; ++n) {
            fx_total += system.fx_body[n];
            fy_total += system.fy_body[n];
        }
        save_forces_jsonl(out_dir, step, fx_total, fy_total);

        // Save frames
        if (step % save_interval == 0) {
            save_json_frame(system, step, out_dir);
        }
    }

    return 0;
}
