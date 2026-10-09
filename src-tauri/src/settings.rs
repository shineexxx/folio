use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager};

/// User preferences as a JSON object stored in the app config directory.
/// The frontend owns the schema and defaults; the backend only needs `language`.
pub struct SettingsState(pub Mutex<Map<String, Value>>);

/// Concrete UI language for a settings object: "ru" or "en".
pub fn lang(settings: &Map<String, Value>) -> &'static str {
    match settings.get("language").and_then(Value::as_str) {
        Some("ru") => "ru",
        Some("en") => "en",
        _ => {
            let locale = sys_locale::get_locale().unwrap_or_default();
            if locale.starts_with("ru") { "ru" } else { "en" }
        }
    }
}

fn settings_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Map<String, Value> {
    settings_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle, settings: &Map<String, Value>) -> Result<(), String> {
    let path = settings_path(app).ok_or("no config dir")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

/// Settings plus the resolved language, as the frontend sees them.
fn payload(settings: &Map<String, Value>) -> Value {
    let mut value = settings.clone();
    value.insert("lang".into(), lang(settings).into());
    Value::Object(value)
}

#[tauri::command]
pub fn get_settings(state: tauri::State<SettingsState>) -> Value {
    payload(&state.0.lock().unwrap())
}

#[tauri::command]
pub fn set_settings(
    app: AppHandle,
    state: tauri::State<SettingsState>,
    mut settings: Map<String, Value>,
) -> Result<(), String> {
    settings.remove("lang");
    let old_lang = {
        let mut current = state.0.lock().unwrap();
        if *current == settings {
            return Ok(());
        }
        let old = lang(&current);
        *current = settings.clone();
        old
    };
    save(&app, &settings)?;
    let new_lang = lang(&settings);
    if new_lang != old_lang {
        crate::menu::install(&app, new_lang).map_err(|e| e.to_string())?;
        if let Some(w) = app.get_webview_window(crate::SETTINGS_LABEL) {
            let _ = w.set_title(crate::menu::tr(new_lang, "settings-title"));
        }
    }
    app.emit("settings-changed", payload(&settings)).map_err(|e| e.to_string())
}

/// Font families installed on the system, sorted, for the font pickers.
#[tauri::command]
pub async fn list_fonts() -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        use core_text::font_collection::create_for_all_families;
        let mut names: Vec<String> = create_for_all_families()
            .get_descriptors()
            .map(|descs| descs.iter().map(|d| d.family_name()).collect())
            .unwrap_or_default();
        names.retain(|n| !n.starts_with('.'));
        names.sort_by_key(|n| n.to_lowercase());
        names.dedup();
        names
    }
    #[cfg(windows)]
    {
        windows_fonts()
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        Vec::new()
    }
}

/// Windows lists installed fonts in the registry as "Family Style (TrueType)".
#[cfg(windows)]
fn windows_fonts() -> Vec<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    const KEY: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts";
    const STYLES: &[&str] = &[
        "Regular", "Bold", "Italic", "Oblique", "Light", "Thin", "Medium", "Black", "Heavy", "Book",
        "Semibold", "SemiBold", "Demibold", "DemiBold", "Semilight", "SemiLight", "ExtraLight",
        "ExtraBold", "UltraLight", "UltraBold", "Condensed", "SemiCondensed", "Narrow",
    ];

    let mut names = Vec::new();
    for root in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let Ok(key) = RegKey::predef(root).open_subkey(KEY) else { continue };
        for (value, _) in key.enum_values().flatten() {
            let value = value.split(" (").next().unwrap_or(&value);
            for face in value.split(" & ") {
                let mut words: Vec<&str> = face.split_whitespace().collect();
                while words.len() > 1 && STYLES.contains(words.last().unwrap()) {
                    words.pop();
                }
                if !words.is_empty() {
                    names.push(words.join(" "));
                }
            }
        }
    }
    names.retain(|n| !n.starts_with('@'));
    names.sort_by_key(|n| n.to_lowercase());
    names.dedup();
    names
}
