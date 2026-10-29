/* Vlexyna — Tauri 2 app entry.
   The entire studio is the web app in ../dist (built by Vite); Rust side stays
   a thin, auditable shell: one window, no network calls, no native plugins. */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Vlexyna Studio");
}
