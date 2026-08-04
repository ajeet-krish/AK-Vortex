use std::path::Path;
use tauri::command;
use tauri::Manager;
use crate::solver::{self, SolverConfig};

fn validate_path(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if p.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err("Invalid path: contains ..".to_string());
    }
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

    let output_dir = app.path()
        .app_data_dir()
        .unwrap()
        .join("simulations")
        .join(&case_type)
        .join(format!("re{}", re as i32))
        .to_string_lossy()
        .to_string();

    let config = SolverConfig {
        nx, ny, re, u_inflow, max_steps, save_interval,
        output_dir: output_dir.clone(),
        case_type,
    };

    solver::run_solver(&config)?;

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

    solver::run_geometry_solver(
        nx, ny, re, u_inflow, max_steps, save_interval,
        &output_dir, &geometry_json,
    )?;

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
