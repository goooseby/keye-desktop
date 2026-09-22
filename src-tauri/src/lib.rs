mod commands;
mod library;
mod pdf;
mod platform;

use std::sync::{Arc,RwLock};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let root = if let Ok(path) = std::env::var("KEYE_DEV_DATA_DIR") {
                std::path::PathBuf::from(path)
            } else {
                app.path().app_data_dir()?
            };
            let selected = std::fs::read_to_string(root.join("app-settings.json")).ok()
                .and_then(|s|serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|v|v["libraryDir"].as_str().map(std::path::PathBuf::from))
                .unwrap_or_else(||root.clone());
            let library = library::Library::open(selected).map_err(std::io::Error::other)?;
            app.manage(commands::AppState { library: Arc::new(RwLock::new(Arc::new(library))), base:root, runtime: Arc::new(std::sync::Mutex::new(commands::Runtime::default())), import_busy: Arc::new(std::sync::atomic::AtomicBool::new(false)) });
            Ok(())
        })
        .register_uri_scheme_protocol("keye-media", |ctx, request| {
            let parts: Vec<&str> = request.uri().path().trim_start_matches('/').split('/').collect();
            let page = parts.get(1).and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
            let size = if request.uri().query().unwrap_or("").contains("size=thumb") { "thumb" } else { "preview" };
            let bytes = parts.first().and_then(|mid| {
                let state = ctx.app_handle().state::<commands::AppState>();
                let library=state.library.read().ok()?;
                let path = library.media_file(mid, page, size)?;
                std::fs::read(path).ok()
            });
            match bytes {
                Some(bytes) => tauri::http::Response::builder().header("Content-Type", "image/jpeg").header("Cache-Control", "private, max-age=3600").body(bytes).unwrap(),
                None => tauri::http::Response::builder().status(404).body(Vec::new()).unwrap(),
            }
        })
        .invoke_handler(tauri::generate_handler![commands::request])
        .run(tauri::generate_context!())
        .expect("无法启动课页");
}
