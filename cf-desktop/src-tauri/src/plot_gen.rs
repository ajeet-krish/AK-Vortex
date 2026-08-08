use std::path::{Path, PathBuf};
use std::process::Command;

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde::Serialize;
use tauri::command;

/// Return type for the four report plot PNGs encoded as base64 strings.
#[derive(Serialize)]
pub struct ReportPlots {
    pub velocity_png: String,
    pub streamlines_png: String,
    pub pressure_png: String,
    pub vorticity_png: String,
}

/// Validate that a path does not contain directory traversal components.
fn validate_path(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if p.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err("Invalid path: contains ..".to_string());
    }
    Ok(())
}

/// Invoke the Python matplotlib script to generate four publication-quality
/// CFD report plots (velocity contour, streamlines, pressure Cp, vorticity)
/// from a solver frame JSON file.
///
/// # Arguments
///
/// * `output_dir` - Root output directory containing `frames/frame_{step}.json`.
/// * `step`       - Timestep number identifying the frame file.
/// * `geometry`   - JSON array of geometry shapes for overlay
///                   (e.g. `[{"type":"circle","x":200,"y":150,"radius":30}]`).
/// * `config`     - JSON object with simulation parameters
///                   (`nx`, `ny`, `re`, `uInflow`, `caseType`).
#[command]
pub fn generate_report_plots(
    output_dir: String,
    step: i32,
    geometry: String,
    config: String,
) -> Result<ReportPlots, String> {
    // Validate paths against traversal attacks
    validate_path(&output_dir)?;

    if step < 0 {
        return Err("Step must be non-negative".to_string());
    }

    // Locate the Python plotting script
    let script_path = find_python_script()?;

    // Build the path to the requested frame JSON
    let frame_path = format!("{}/frames/frame_{}.json", output_dir, step);
    if !PathBuf::from(&frame_path).exists() {
        return Err(format!("Frame file not found: {}", frame_path));
    }

    // Create a unique temporary directory for the generated PNGs
    let pid = std::process::id();
    let temp_dir = std::env::temp_dir().join(format!("cf_report_plots_{}", pid));
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    // Resolve the python3 interpreter
    let python = find_python()?;

    // Run the plotting script
    let output = Command::new(&python)
        .arg(&script_path)
        .arg("--frame")
        .arg(&frame_path)
        .arg("--geometry")
        .arg(&geometry)
        .arg("--config")
        .arg(&config)
        .arg("--output")
        .arg(&temp_dir)
        .output()
        .map_err(|e| format!("Failed to run Python: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Python script failed: {}", stderr));
    }

    // Read the four generated PNGs as base64-encoded strings
    let velocity = read_png_base64(&temp_dir.join("velocity_contour.png"))?;
    let streamlines = read_png_base64(&temp_dir.join("streamlines.png"))?;
    let pressure = read_png_base64(&temp_dir.join("pressure_contour.png"))?;
    let vorticity = read_png_base64(&temp_dir.join("vorticity_contour.png"))?;

    // Clean up temporary files
    let _ = std::fs::remove_dir_all(&temp_dir);

    Ok(ReportPlots {
        velocity_png: velocity,
        streamlines_png: streamlines,
        pressure_png: pressure,
        vorticity_png: vorticity,
    })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Locate `plot_generator.py` on disk.
///
/// Search order:
///   1. `src-tauri/scripts/plot_generator.py` (dev mode, relative to CWD)
///   2. `{exe_dir}/scripts/plot_generator.py` (bundled alongside the binary)
fn find_python_script() -> Result<String, String> {
    // Dev mode: relative to the current working directory
    let dev_path = PathBuf::from("src-tauri/scripts/plot_generator.py");
    if dev_path.exists() {
        return Ok(dev_path.to_string_lossy().into_owned());
    }

    // Production: relative to the executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let bundle_path = exe_dir.join("scripts").join("plot_generator.py");
            if bundle_path.exists() {
                return Ok(bundle_path.to_string_lossy().into_owned());
            }
        }
    }

    Err(
        "Python script not found. Ensure plot_generator.py is in src-tauri/scripts/".to_string(),
    )
}

/// Find a working `python3` (or `python`) interpreter on the system PATH.
fn find_python() -> Result<String, String> {
    for cmd in &["python3", "python"] {
        if Command::new(cmd)
            .arg("--version")
            .output()
            .is_ok()
        {
            return Ok(cmd.to_string());
        }
    }
    Err(
        "Python 3 not found. Install Python 3.8+ to enable report generation.".to_string(),
    )
}

/// Read a PNG file from disk and return its contents as a base64 string.
fn read_png_base64(path: &PathBuf) -> Result<String, String> {
    let data =
        std::fs::read(path).map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    Ok(STANDARD.encode(&data))
}
