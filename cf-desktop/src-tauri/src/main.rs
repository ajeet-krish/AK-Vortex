#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod solver;
mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::reset_solver,
            commands::run_simulation,
            commands::run_geometry_simulation,
            commands::read_frame_json,
            commands::list_frames,
            commands::get_solver_log,
            commands::clear_solver_log,
            commands::get_simulation_plots,
            commands::read_plot_image,
            commands::export_vtk,
            commands::run_sweep,
            commands::run_gci,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
