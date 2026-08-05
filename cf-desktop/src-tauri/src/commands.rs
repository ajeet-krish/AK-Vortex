use std::path::Path;
use std::sync::Mutex;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use tauri::command;
use tauri::Manager;
use crate::solver::{self, SolverConfig};

// Global solver log storage
static SOLVER_LOG: Mutex<Vec<String>> = Mutex::new(Vec::new());

pub fn log_message(msg: &str) {
    if let Ok(mut log) = SOLVER_LOG.lock() {
        log.push(msg.to_string());
    }
}

fn validate_path(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if p.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err("Invalid path: contains ..".to_string());
    }
    Ok(())
}

#[command]
pub fn reset_solver() -> Result<(), String> {
    solver::reset_solver();
    Ok(())
}

#[command]
pub fn run_simulation(
    nx: i32,
    ny: i32,
    re: f64,
    u_inflow: f64,
    max_steps: i32,
    save_interval: i32,
    case_type: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let valid_cases = ["cylinder", "cavity", "step", "custom"];
    if !valid_cases.contains(&case_type.as_str()) {
        return Err(format!("Invalid case type: {}", case_type));
    }

    if nx < 32 || nx > 4096 || ny < 32 || ny > 4096 {
        return Err(format!("Grid size out of bounds: {}x{}. Must be 32-4096.", nx, ny));
    }
    if max_steps < 1 || max_steps > 1_000_000 {
        return Err("max_steps must be 1-1,000,000".to_string());
    }

    let output_dir = app.path()
        .app_data_dir()
        .unwrap()
        .join("simulations")
        .join(&case_type)
        .join(format!("re{}", re as i32))
        .to_string_lossy()
        .to_string();

    log_message(&format!(
        "[solver] Starting {} simulation: {}x{}, Re={}, u={}, steps={}, interval={}",
        case_type, nx, ny, re, u_inflow, max_steps, save_interval
    ));
    log_message(&format!("[solver] Output directory: {}", output_dir));

    // Clean stale frames from previous runs
    let _ = std::fs::remove_dir_all(&output_dir);

    let config = SolverConfig {
        nx, ny, re, u_inflow, max_steps, save_interval,
        output_dir: output_dir.clone(),
        case_type,
    };

    log_message("[solver] Running LBM solver...");
    solver::run_solver(&config)?;
    log_message("[solver] Simulation complete.");

    Ok(output_dir)
}

#[command]
pub fn run_geometry_simulation(
    nx: i32,
    ny: i32,
    re: f64,
    u_inflow: f64,
    max_steps: i32,
    save_interval: i32,
    geometry_json: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let output_dir = app.path()
        .app_data_dir()
        .unwrap()
        .join("simulations")
        .join("custom")
        .join(format!("re{}", re as i32))
        .to_string_lossy()
        .to_string();

    if nx < 32 || nx > 4096 || ny < 32 || ny > 4096 {
        return Err(format!("Grid size out of bounds: {}x{}. Must be 32-4096.", nx, ny));
    }
    if max_steps < 1 || max_steps > 1_000_000 {
        return Err("max_steps must be 1-1,000,000".to_string());
    }

    log_message(&format!(
        "[solver] Starting custom geometry simulation: {}x{}, Re={}, steps={}",
        nx, ny, re, max_steps
    ));
    log_message(&format!("[solver] Geometry JSON length: {} bytes", geometry_json.len()));
    log_message(&format!("[solver] Output directory: {}", output_dir));

    // Clean stale frames from previous runs
    let _ = std::fs::remove_dir_all(&output_dir);

    log_message("[solver] Running LBM solver with custom geometry...");
    solver::run_geometry_solver(
        nx, ny, re, u_inflow, max_steps, save_interval,
        &output_dir, &geometry_json,
    )?;
    log_message("[solver] Simulation complete.");

    Ok(output_dir)
}

#[command]
pub fn read_frame_json(path: String, step: i32) -> Result<serde_json::Value, String> {
    validate_path(&path)?;
    let frame_path = format!("{}/frames/frame_{}.json", path, step);
    let data = std::fs::read_to_string(&frame_path)
        .map_err(|e| format!("Failed to read frame: {}", e))?;
    serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse JSON: {}", e))
}

#[command]
pub fn list_frames(path: String) -> Result<Vec<i32>, String> {
    validate_path(&path)?;
    let frames_dir = format!("{}/frames", path);
    let mut frames: Vec<i32> = std::fs::read_dir(&frames_dir)
        .map_err(|e| format!("Failed to read frames dir: {}", e))?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.strip_prefix("frame_")
                .and_then(|s| s.strip_suffix(".json"))
                .and_then(|s| s.parse().ok())
        })
        .collect();
    frames.sort();
    Ok(frames)
}

#[command]
pub fn get_solver_log(last_n: Option<usize>) -> Result<Vec<String>, String> {
    let log = SOLVER_LOG.lock()
        .map_err(|e| format!("Failed to lock log: {}", e))?;
    match last_n {
        Some(n) => {
            let start = log.len().saturating_sub(n);
            Ok(log[start..].to_vec())
        }
        None => Ok(log.clone()),
    }
}

#[command]
pub fn clear_solver_log() -> Result<(), String> {
    let mut log = SOLVER_LOG.lock()
        .map_err(|e| format!("Failed to lock log: {}", e))?;
    log.clear();
    Ok(())
}

#[command]
pub fn get_simulation_plots(path: String) -> Result<Vec<String>, String> {
    validate_path(&path)?;
    let mut plots: Vec<String> = std::fs::read_dir(&path)
        .map_err(|e| format!("Failed to read output directory: {}", e))?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if name.ends_with(".png") {
                Some(name)
            } else {
                None
            }
        })
        .collect();
    plots.sort();
    Ok(plots)
}

#[command]
pub fn read_plot_image(path: String, filename: String) -> Result<String, String> {
    validate_path(&path)?;
    // Reject path traversal in filename
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Invalid filename: contains path separator or ..".to_string());
    }
    let filepath = format!("{}/{}", path, filename);
    let data = std::fs::read(&filepath)
        .map_err(|e| format!("Failed to read image: {}", e))?;
    Ok(STANDARD.encode(&data))
}

#[command]
pub fn export_vtk(path: String, step: i32) -> Result<String, String> {
    validate_path(&path)?;
    let vtk_path = format!("{}/frame_{}.vtk", path, step);
    solver::write_vtk(&path, step, &vtk_path)?;
    Ok(vtk_path)
}

#[command]
pub fn run_sweep(
    nx: i32,
    ny: i32,
    re_min: f64,
    re_max: f64,
    re_steps: i32,
    u_inflow: f64,
    max_steps: i32,
    save_interval: i32,
    geometry_json: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let output_dir = app.path()
        .app_data_dir()
        .unwrap()
        .join("simulations")
        .join("sweep")
        .to_string_lossy()
        .to_string();

    log_message(&format!(
        "[sweep] Starting parameter sweep: Re=[{}..{}] x {} steps",
        re_min, re_max, re_steps
    ));
    log_message(&format!("[sweep] Output directory: {}", output_dir));

    let _ = std::fs::remove_dir_all(&output_dir);

    solver::run_sweep(
        nx, ny, re_min, re_max, re_steps, u_inflow, max_steps, save_interval,
        &output_dir, &geometry_json,
    )?;
    log_message("[sweep] Parameter sweep complete.");

    Ok(output_dir)
}

#[command]
pub fn run_gci(
    nx_base: i32,
    ny_base: i32,
    re: f64,
    u_inflow: f64,
    max_steps: i32,
    save_interval: i32,
    refinement_ratio: f64,
    geometry_json: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let output_dir = app.path()
        .app_data_dir()
        .unwrap()
        .join("simulations")
        .join("gci")
        .join(format!("re{}", re as i32))
        .to_string_lossy()
        .to_string();

    log_message(&format!(
        "[gci] Starting GCI study: {}x{}, Re={}, ratio={}, steps={}",
        nx_base, ny_base, re, refinement_ratio, max_steps
    ));
    log_message(&format!("[gci] Output directory: {}", output_dir));

    let _ = std::fs::remove_dir_all(&output_dir);

    solver::run_gci(
        nx_base, ny_base, re, u_inflow, max_steps, save_interval,
        refinement_ratio, &output_dir, &geometry_json,
    )?;
    log_message("[gci] Grid convergence study complete.");

    Ok(output_dir)
}


