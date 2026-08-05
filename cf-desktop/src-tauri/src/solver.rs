use std::ffi::{c_double, c_int, CString};
use std::os::raw::c_char;

extern "C" {
    fn lbm_solve_c(
        nx: c_int,
        ny: c_int,
        re: c_double,
        u_inflow: c_double,
        max_steps: c_int,
        save_interval: c_int,
        output_dir: *const c_char,
        case_type: *const c_char,
    ) -> c_int;

    fn lbm_solve_geometry(
        nx: c_int,
        ny: c_int,
        re: c_double,
        u_inflow: c_double,
        max_steps: c_int,
        save_interval: c_int,
        output_dir: *const c_char,
        geometry_json: *const c_char,
    ) -> c_int;

    fn reset_solver_state();

    fn lbm_write_vtk(
        source_dir: *const c_char,
        step: c_int,
        dest_path: *const c_char,
    ) -> c_int;
}

pub fn reset_solver() {
    unsafe {
        reset_solver_state();
    }
}

pub struct SolverConfig {
    pub nx: i32,
    pub ny: i32,
    pub re: f64,
    pub u_inflow: f64,
    pub max_steps: i32,
    pub save_interval: i32,
    pub output_dir: String,
    pub case_type: String,
}

pub fn run_solver(config: &SolverConfig) -> Result<i32, String> {
    let c_output_dir = CString::new(config.output_dir.clone())
        .map_err(|e| e.to_string())?;
    let c_case_type = CString::new(config.case_type.clone())
        .map_err(|e| e.to_string())?;

    unsafe {
        let result = lbm_solve_c(
            config.nx,
            config.ny,
            config.re,
            config.u_inflow,
            config.max_steps,
            config.save_interval,
            c_output_dir.as_ptr(),
            c_case_type.as_ptr(),
        );
        Ok(result)
    }
}

pub fn run_geometry_solver(
    nx: i32, ny: i32, re: f64, u_inflow: f64,
    max_steps: i32, save_interval: i32,
    output_dir: &str, geometry_json: &str,
) -> Result<i32, String> {
    let c_output_dir = CString::new(output_dir.to_string())
        .map_err(|e| e.to_string())?;
    let c_geometry = CString::new(geometry_json.to_string())
        .map_err(|e| e.to_string())?;

    unsafe {
        let result = lbm_solve_geometry(
            nx, ny, re, u_inflow, max_steps, save_interval,
            c_output_dir.as_ptr(), c_geometry.as_ptr(),
        );
        Ok(result)
    }
}

pub fn write_vtk(source_dir: &str, step: i32, dest_path: &str) -> Result<(), String> {
    let c_source = CString::new(source_dir).map_err(|e| e.to_string())?;
    let c_dest = CString::new(dest_path).map_err(|e| e.to_string())?;

    unsafe {
        let result = lbm_write_vtk(c_source.as_ptr(), step, c_dest.as_ptr());
        if result != 0 {
            return Err("VTK write failed".to_string());
        }
    }
    Ok(())
}
