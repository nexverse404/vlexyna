fn main() {
    // `tauri::generate_context!` embeds the frontend dist at compile time and fails
    // the build when `frontendDist` is missing. `npm run tauri dev/build` creates it
    // via beforeDevCommand/beforeBuildCommand, but bare `cargo check`/`clippy`/`test`
    // runs don't — so we drop a placeholder index.html when dist/ is absent.
    let dist = std::path::Path::new("../dist");
    if !dist.join("index.html").exists() {
        let _ = std::fs::create_dir_all(dist);
        let _ = std::fs::write(
            dist.join("index.html"),
            "<!doctype html><meta charset=\"utf-8\"><title>Vlexyna</title>\
             <p>Placeholder frontend — run <code>npm run build</code> or \
             <code>npm run tauri dev</code> for the real app.</p>\n",
        );
    }
    tauri_build::build()
}
