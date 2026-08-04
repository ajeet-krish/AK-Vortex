#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod solver;
mod commands;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::run_simulation,
            commands::run_geometry_simulation,
            commands::read_frame_json,
            commands::list_frames,
            commands::get_solver_log,
            commands::clear_solver_log,
            commands::get_simulation_plots,
            commands::read_plot_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
