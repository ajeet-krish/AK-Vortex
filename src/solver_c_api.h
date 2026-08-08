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

int lbm_write_vtk(
    const char* source_dir,
    int step,
    const char* dest_path
);

int lbm_run_sweep(
    int nx, int ny,
    double re_min, double re_max, int re_steps,
    double u_inflow,
    int max_steps, int save_interval,
    const char* output_dir,
    const char* geometry_json
);

int lbm_run_gci(
    int nx_base, int ny_base,
    double re, double u_inflow,
    int max_steps, int save_interval,
    double refinement_ratio,
    const char* output_dir,
    const char* geometry_json
);

void lbm_set_cancel_flag(bool cancel);

#ifdef __cplusplus
}
#endif
