#pragma once

#ifdef __cplusplus
extern "C" {
#endif

void reset_solver_state();

int lbm_solve_c(
    int nx, int ny,
    double re, double u_inflow,
    int max_steps, int save_interval,
    const char* output_dir,
    const char* case_type
);

int lbm_solve_geometry(
    int nx, int ny,
    double re, double u_inflow,
    int max_steps, int save_interval,
    const char* output_dir,
    const char* geometry_json
);

#ifdef __cplusplus
}
#endif
