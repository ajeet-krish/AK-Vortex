#pragma once

#ifdef __cplusplus
extern "C" {
#endif

int lbm_solve_c(
    int nx, int ny,
    double re, double u_inflow,
    int max_steps, int save_interval,
    const char* output_dir,
    const char* case_type
);

#ifdef __cplusplus
}
#endif
