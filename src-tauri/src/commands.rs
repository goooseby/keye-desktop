use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    version: &'static str,
    platform: &'static str,
    phase: &'static str,
}

#[tauri::command]
pub fn app_status() -> AppStatus {
    AppStatus {
        version: env!("CARGO_PKG_VERSION"),
        platform: "windows",
        phase: "architecture-prototype",
    }
}
