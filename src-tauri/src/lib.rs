// Vlexyna — Tauri 2 app entry.
// The entire studio is the web app in ../dist (built by Vite); the Rust side
// stays a thin, auditable shell: one window, no network calls, no plugins.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Vlexyna Studio");
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    fn conf() -> Value {
        serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("tauri.conf.json must be valid JSON")
    }

    fn caps() -> Value {
        serde_json::from_str(include_str!("../capabilities/default.json"))
            .expect("capabilities/default.json must be valid JSON")
    }

    #[test]
    fn config_has_required_fields() {
        let c = conf();
        assert_eq!(c["productName"], "Vlexyna");
        assert_eq!(c["version"], "2.4.0");
        assert!(
            c["identifier"].as_str().unwrap().contains('.'),
            "identifier must be reverse-DNS"
        );
        assert_eq!(c["build"]["frontendDist"], "../dist");
        assert_eq!(c["build"]["devUrl"], "http://localhost:1420");
        assert_eq!(c["build"]["beforeDevCommand"], "npm run dev");
        assert_eq!(c["build"]["beforeBuildCommand"], "npm run build");
    }

    #[test]
    fn window_config_is_sane() {
        let c = conf();
        let w = &c["app"]["windows"][0];
        assert_eq!(w["title"], "Vlexyna Studio");
        assert!(w["width"].as_u64().unwrap() >= w["minWidth"].as_u64().unwrap());
        assert!(w["height"].as_u64().unwrap() >= w["minHeight"].as_u64().unwrap());
        assert_eq!(w["backgroundColor"], "#0a0b0e");
    }

    #[test]
    fn bundle_icons_exist() {
        let c = conf();
        let icons = c["bundle"]["icon"].as_array().unwrap();
        assert!(icons.len() >= 5, "expected png/ico/icns icon set");
        for icon in icons {
            let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(icon.as_str().unwrap());
            assert!(p.exists(), "missing icon file: {}", p.display());
            assert!(
                std::fs::metadata(&p).unwrap().len() > 100,
                "icon looks empty: {}",
                p.display(),
            );
        }
    }

    #[test]
    fn capabilities_reference_the_main_window() {
        let cap = caps();
        let windows = cap["windows"].as_array().unwrap();
        assert!(windows.contains(&Value::String("main".into())));
        let perms = cap["permissions"].as_array().unwrap();
        assert!(!perms.is_empty(), "expected at least core:default");
    }

    #[test]
    fn frontend_placeholder_or_build_exists() {
        let dist = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../dist/index.html");
        assert!(
            dist.exists(),
            "dist/index.html missing (build.rs should create it)"
        );
    }
}
