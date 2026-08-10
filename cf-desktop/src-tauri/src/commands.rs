use std::collections::VecDeque;
use std::os::raw::c_int;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread::{self, JoinHandle};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use tauri::command;
use tauri::Emitter;
use tauri::Manager;
use crate::solver::{self, SolverConfig};

// Maximum number of log entries to retain (ring buffer)
const LOG_CAPACITY: usize = 5000;

// Global solver log storage (ring buffer)
static SOLVER_LOG: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());

// Global cancel flag: set by cancel_simulation, checked by solver threads
pub static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

// Track whether a solver is currently running
static SIM_RUNNING: AtomicBool = AtomicBool::new(false);

// Handle to the running solver thread (drop old if a new one starts)
static SOLVER_HANDLE: Mutex<Option<JoinHandle<()>>> = Mutex::new(None);

// Global AppHandle for frame event emission from solver thread
static FRAME_APP_HANDLE: Mutex<Option<tauri::AppHandle>> = Mutex::new(None);

// C callback: called by solver after save_binary_frame()
extern "C" fn frame_event_callback(step: c_int) {
    if let Ok(guard) = FRAME_APP_HANDLE.lock() {
        if let Some(app) = guard.as_ref() {
            let _ = app.emit("solver:frame-ready", step as i32);
        }
    }
}

// Maximum log message length before truncation
const MAX_MSG_LEN: usize = 4096;

pub fn log_message(msg: &str) {
    let truncated = if msg.len() > MAX_MSG_LEN {
        // Safe truncation: find a valid UTF-8 boundary at or before MAX_MSG_LEN
        let mut end = MAX_MSG_LEN;
        while end > 0 && !msg.is_char_boundary(end) {
            end -= 1;
        }
        &msg[..end]
    } else {
        msg
    };
    if let Ok(mut log) = SOLVER_LOG.lock() {
        if log.len() >= LOG_CAPACITY {
            log.pop_front();
        }
        log.push_back(truncated.to_string());
    }
}

/// Log a message and emit it as a Tauri event for real-time streaming.
pub fn log_message_with_emit(msg: &str, app: &tauri::AppHandle) {
    log_message(msg);
    let _ = app.emit("solver-log", msg.to_string());
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
pub fn cancel_simulation(app: tauri::AppHandle) -> Result<(), String> {
    CANCEL_FLAG.store(true, Ordering::SeqCst);
    solver::set_cancel_flag(true);
    log_message_with_emit("[solver] Cancel requested by user.", &app);
    Ok(())
}

#[command]
pub fn get_simulation_status() -> Result<serde_json::Value, String> {
    let running = SIM_RUNNING.load(Ordering::SeqCst);
    Ok(serde_json::json!({
        "running": running,
    }))
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

    if SIM_RUNNING.load(Ordering::SeqCst) {
        return Err("A simulation is already running. Cancel it first.".to_string());
    }

    let app_data = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let output_dir = app_data
        .join("simulations")
        .join(&case_type)
        .join(format!("re{}", re as i32))
        .to_string_lossy()
        .to_string();

    log_message_with_emit(&format!(
        "[solver] Starting {} simulation: {}x{}, Re={}, u={}, steps={}, interval={}",
        case_type, nx, ny, re, u_inflow, max_steps, save_interval
    ), &app);
    log_message_with_emit(&format!("[solver] Output directory: {}", output_dir), &app);

    // Clean stale frames from previous runs (with path safety check)
    if std::path::Path::new(&output_dir).exists() {
        let canonical_output = std::path::Path::new(&output_dir).canonicalize()
            .map_err(|e| format!("Invalid output path: {}", e))?;
        let canonical_base = app_data.canonicalize()
            .map_err(|e| format!("Invalid base path: {}", e))?;
        if !canonical_output.starts_with(&canonical_base) {
            return Err("Output path escapes application directory".to_string());
        }
        let _ = std::fs::remove_dir_all(&output_dir);
    }

    // Reset cancel flag and mark running
    CANCEL_FLAG.store(false, Ordering::SeqCst);
    solver::set_cancel_flag(false);
    SIM_RUNNING.store(true, Ordering::SeqCst);

    log_message_with_emit("[solver] Running LBM solver in background thread...", &app);

    // Store AppHandle for frame events
    {
        if let Ok(mut handle) = FRAME_APP_HANDLE.lock() {
            *handle = Some(app.clone());
        }
    }

    // Register frame callback
    crate::solver::register_frame_callback(Some(frame_event_callback));

    let config = SolverConfig {
        nx, ny, re, u_inflow, max_steps, save_interval,
        output_dir: output_dir.clone(),
        case_type,
    };

    let app_clone = app.clone();
    let handle = thread::spawn(move || {
        let result = solver::run_solver(&config);
        match result {
            Ok(_) => {
                log_message_with_emit("[solver] Simulation complete.", &app_clone);
            }
            Err(e) => {
                log_message_with_emit(&format!("[solver] Failed: {}", e), &app_clone);
            }
        }

        // Unregister frame callback after simulation
        crate::solver::register_frame_callback(None);
        {
            if let Ok(mut handle) = FRAME_APP_HANDLE.lock() {
                *handle = None;
            }
        }

        SIM_RUNNING.store(false, Ordering::SeqCst);
    });

    // Store handle, drop old one if exists
    if let Ok(mut h) = SOLVER_HANDLE.lock() {
        *h = Some(handle);
    }

    // Return immediately -- client polls get_simulation_status
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
    let app_data = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let output_dir = app_data
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

    if SIM_RUNNING.load(Ordering::SeqCst) {
        return Err("A simulation is already running. Cancel it first.".to_string());
    }

    log_message_with_emit(&format!(
        "[solver] Starting custom geometry simulation: {}x{}, Re={}, steps={}",
        nx, ny, re, max_steps
    ), &app);
    log_message_with_emit(&format!("[solver] Geometry JSON length: {} bytes", geometry_json.len()), &app);
    log_message_with_emit(&format!("[solver] Output directory: {}", output_dir), &app);

    // Clean stale frames from previous runs (with path safety check)
    if std::path::Path::new(&output_dir).exists() {
        let canonical_output = std::path::Path::new(&output_dir).canonicalize()
            .map_err(|e| format!("Invalid output path: {}", e))?;
        let canonical_base = app_data.canonicalize()
            .map_err(|e| format!("Invalid base path: {}", e))?;
        if !canonical_output.starts_with(&canonical_base) {
            return Err("Output path escapes application directory".to_string());
        }
        let _ = std::fs::remove_dir_all(&output_dir);
    }

    // Reset cancel flag and mark running
    CANCEL_FLAG.store(false, Ordering::SeqCst);
    solver::set_cancel_flag(false);
    SIM_RUNNING.store(true, Ordering::SeqCst);

    log_message_with_emit("[solver] Running LBM solver with custom geometry in background thread...", &app);

    // Store AppHandle for frame events
    {
        if let Ok(mut handle) = FRAME_APP_HANDLE.lock() {
            *handle = Some(app.clone());
        }
    }

    // Register frame callback
    crate::solver::register_frame_callback(Some(frame_event_callback));

    let out_dir_clone = output_dir.clone();
    let geom_clone = geometry_json.clone();
    let app_clone = app.clone();
    let handle = thread::spawn(move || {
        let result = solver::run_geometry_solver(
            nx, ny, re, u_inflow, max_steps, save_interval,
            &out_dir_clone, &geom_clone,
        );
        match result {
            Ok(_) => {
                log_message_with_emit("[solver] Simulation complete.", &app_clone);
            }
            Err(e) => {
                log_message_with_emit(&format!("[solver] Failed: {}", e), &app_clone);
            }
        }

        // Unregister frame callback after simulation
        crate::solver::register_frame_callback(None);
        {
            if let Ok(mut handle) = FRAME_APP_HANDLE.lock() {
                *handle = None;
            }
        }

        SIM_RUNNING.store(false, Ordering::SeqCst);
    });

    // Store handle, drop old one if exists
    if let Ok(mut h) = SOLVER_HANDLE.lock() {
        *h = Some(handle);
    }

    // Return immediately -- client polls get_simulation_status
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
pub fn read_frame_binary(path: String, step: i32) -> Result<Vec<u8>, String> {
    validate_path(&path)?;
    let frame_path = format!("{}/frames/frame_{}.bin", path, step);

    // Canonicalize and verify path is under the provided base
    let canonical_frame = std::fs::canonicalize(&frame_path)
        .map_err(|e| format!("Failed to resolve frame path: {}", e))?;
    let canonical_base = std::fs::canonicalize(&path)
        .map_err(|e| format!("Failed to resolve base path: {}", e))?;
    if !canonical_frame.starts_with(&canonical_base) {
        return Err("Frame path escapes base directory".to_string());
    }

    // File size limit: 100 MB
    let metadata = std::fs::metadata(&canonical_frame)
        .map_err(|e| format!("Failed to read frame metadata: {}", e))?;
    if metadata.len() > 100 * 1024 * 1024 {
        return Err("Binary frame too large (>100 MB)".to_string());
    }

    std::fs::read(&canonical_frame)
        .map_err(|e| format!("Failed to read binary frame: {}", e))
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
            if let Some(s) = name.strip_prefix("frame_") {
                if let Some(s) = s.strip_suffix(".json") {
                    return s.parse().ok();
                }
                if let Some(s) = s.strip_suffix(".bin") {
                    return s.parse().ok();
                }
            }
            None
        })
        .collect();
    frames.sort();
    frames.dedup();
    Ok(frames)
}

#[command]
pub fn get_solver_log(last_n: Option<usize>) -> Result<Vec<String>, String> {
    let log = SOLVER_LOG.lock()
        .map_err(|e| format!("Failed to lock log: {}", e))?;
    match last_n {
        Some(n) => {
            let skip = log.len().saturating_sub(n);
            Ok(log.iter().skip(skip).cloned().collect())
        }
        None => Ok(log.iter().cloned().collect()),
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
    let app_data = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let output_dir = app_data
        .join("simulations")
        .join("sweep")
        .to_string_lossy()
        .to_string();

    if SIM_RUNNING.load(Ordering::SeqCst) {
        return Err("A simulation is already running. Cancel it first.".to_string());
    }

    log_message_with_emit(&format!(
        "[sweep] Starting parameter sweep: Re=[{}..{}] x {} steps",
        re_min, re_max, re_steps
    ), &app);
    log_message_with_emit(&format!("[sweep] Output directory: {}", output_dir), &app);

    // Clean stale frames from previous runs (with path safety check)
    if std::path::Path::new(&output_dir).exists() {
        let canonical_output = std::path::Path::new(&output_dir).canonicalize()
            .map_err(|e| format!("Invalid output path: {}", e))?;
        let canonical_base = app_data.canonicalize()
            .map_err(|e| format!("Invalid base path: {}", e))?;
        if !canonical_output.starts_with(&canonical_base) {
            return Err("Output path escapes application directory".to_string());
        }
        let _ = std::fs::remove_dir_all(&output_dir);
    }

    // Reset cancel flag and mark running
    CANCEL_FLAG.store(false, Ordering::SeqCst);
    solver::set_cancel_flag(false);
    SIM_RUNNING.store(true, Ordering::SeqCst);

    log_message_with_emit("[sweep] Running parameter sweep in background thread...", &app);

    // Store AppHandle for frame events
    {
        if let Ok(mut handle) = FRAME_APP_HANDLE.lock() {
            *handle = Some(app.clone());
        }
    }

    // Register frame callback
    crate::solver::register_frame_callback(Some(frame_event_callback));

    let out_dir_clone = output_dir.clone();
    let geom_clone = geometry_json.clone();
    let app_clone = app.clone();
    let handle = thread::spawn(move || {
        let result = solver::run_sweep(
            nx, ny, re_min, re_max, re_steps, u_inflow, max_steps, save_interval,
            &out_dir_clone, &geom_clone,
        );
        match result {
            Ok(_) => {
                log_message_with_emit("[sweep] Parameter sweep complete.", &app_clone);
            }
            Err(e) => {
                log_message_with_emit(&format!("[sweep] Failed: {}", e), &app_clone);
            }
        }

        // Unregister frame callback after simulation
        crate::solver::register_frame_callback(None);
        {
            if let Ok(mut handle) = FRAME_APP_HANDLE.lock() {
                *handle = None;
            }
        }

        SIM_RUNNING.store(false, Ordering::SeqCst);
    });

    // Store handle, drop old one if exists
    if let Ok(mut h) = SOLVER_HANDLE.lock() {
        *h = Some(handle);
    }

    // Return immediately -- client polls get_simulation_status
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
    let app_data = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let output_dir = app_data
        .join("simulations")
        .join("gci")
        .join(format!("re{}", re as i32))
        .to_string_lossy()
        .to_string();

    if SIM_RUNNING.load(Ordering::SeqCst) {
        return Err("A simulation is already running. Cancel it first.".to_string());
    }

    log_message_with_emit(&format!(
        "[gci] Starting GCI study: {}x{}, Re={}, ratio={}, steps={}",
        nx_base, ny_base, re, refinement_ratio, max_steps
    ), &app);
    log_message_with_emit(&format!("[gci] Output directory: {}", output_dir), &app);

    // Clean stale frames from previous runs (with path safety check)
    if std::path::Path::new(&output_dir).exists() {
        let canonical_output = std::path::Path::new(&output_dir).canonicalize()
            .map_err(|e| format!("Invalid output path: {}", e))?;
        let canonical_base = app_data.canonicalize()
            .map_err(|e| format!("Invalid base path: {}", e))?;
        if !canonical_output.starts_with(&canonical_base) {
            return Err("Output path escapes application directory".to_string());
        }
        let _ = std::fs::remove_dir_all(&output_dir);
    }

    // Reset cancel flag and mark running
    CANCEL_FLAG.store(false, Ordering::SeqCst);
    solver::set_cancel_flag(false);
    SIM_RUNNING.store(true, Ordering::SeqCst);

    log_message_with_emit("[gci] Running grid convergence study in background thread...", &app);

    // Store AppHandle for frame events
    {
        if let Ok(mut handle) = FRAME_APP_HANDLE.lock() {
            *handle = Some(app.clone());
        }
    }

    // Register frame callback
    crate::solver::register_frame_callback(Some(frame_event_callback));

    let out_dir_clone = output_dir.clone();
    let geom_clone = geometry_json.clone();
    let app_clone = app.clone();
    let handle = thread::spawn(move || {
        let result = solver::run_gci(
            nx_base, ny_base, re, u_inflow, max_steps, save_interval,
            refinement_ratio, &out_dir_clone, &geom_clone,
        );
        match result {
            Ok(_) => {
                log_message_with_emit("[gci] Grid convergence study complete.", &app_clone);
            }
            Err(e) => {
                log_message_with_emit(&format!("[gci] Failed: {}", e), &app_clone);
            }
        }

        // Unregister frame callback after simulation
        crate::solver::register_frame_callback(None);
        {
            if let Ok(mut handle) = FRAME_APP_HANDLE.lock() {
                *handle = None;
            }
        }

        SIM_RUNNING.store(false, Ordering::SeqCst);
    });

    // Store handle, drop old one if exists
    if let Ok(mut h) = SOLVER_HANDLE.lock() {
        *h = Some(handle);
    }

    // Return immediately -- client polls get_simulation_status
    Ok(output_dir)
}
