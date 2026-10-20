mod commands;
mod library;
mod pdf;
mod platform;
mod updates;

use std::sync::{Arc,RwLock};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            #[cfg(debug_assertions)]
            let root = std::env::var("KEYE_DEV_DATA_DIR").map(std::path::PathBuf::from)
                .unwrap_or_else(|_|std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.build/dev-data"));
            #[cfg(not(debug_assertions))]
            let root = app.path().app_local_data_dir()?;
            let selected = std::fs::read_to_string(root.join("app-settings.json")).ok()
                .and_then(|s|serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|v|v["libraryDir"].as_str().map(std::path::PathBuf::from))
                .unwrap_or_else(||root.clone());
            let library = library::Library::open(selected).map_err(std::io::Error::other)?;
            app.manage(commands::AppState { library: Arc::new(RwLock::new(Arc::new(library))), base:root, runtime: Arc::new(std::sync::Mutex::new(commands::Runtime::default())), import_busy: Arc::new(std::sync::atomic::AtomicBool::new(false)), download_gate: Arc::new((std::sync::Mutex::new(0),std::sync::Condvar::new())), download_enqueue: std::sync::Mutex::new(()), export_lock: std::sync::Mutex::new(()) });
            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol("keye-media", |ctx, request, responder| {
            let state = ctx.app_handle().state::<commands::AppState>();
            let library = state.library.read().ok().map(|library|Arc::clone(&library));
            tauri::async_runtime::spawn_blocking(move || {
            let parts: Vec<&str> = request.uri().path().trim_start_matches('/').split('/').collect();
            let page = parts.get(1).and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
            let size = if request.uri().query().unwrap_or("").contains("size=thumb") { "thumb" } else { "preview" };
            let bytes = parts.first().and_then(|mid| {
                let library=library.as_ref()?;
                let path = library.media_file(mid, page, size)?;
                std::fs::read(path).ok()
            });
            responder.respond(match bytes {
                Some(bytes) => tauri::http::Response::builder().header("Content-Type", "image/jpeg").header("Cache-Control", "private, max-age=3600").body(bytes).unwrap(),
                None => tauri::http::Response::builder().status(404).body(Vec::new()).unwrap(),
            });
            });
        })
        .invoke_handler(tauri::generate_handler![commands::request])
        .run(tauri::generate_context!())
        .expect("无法启动课页");
}
