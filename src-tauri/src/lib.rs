use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, UNIX_EPOCH};

use tauri::{
    AppHandle, Emitter, EventTarget, Manager, RunEvent, TitleBarStyle, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use tauri_plugin_dialog::DialogExt;

mod default_app;
mod menu;
mod settings;

use settings::SettingsState;

pub const SETTINGS_LABEL: &str = "settings";

const MD_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd"];

/// Which file each window shows (`None` for an untitled document).
#[derive(Default)]
struct Windows {
    paths: Mutex<HashMap<String, Option<PathBuf>>>,
    counter: AtomicUsize,
    quitting: AtomicBool,
}

// ---------- file commands ----------

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Atomic write: temp file in the same directory, then rename over the target.
#[tauri::command]
fn write_text(path: String, contents: String) -> Result<u64, String> {
    let target = PathBuf::from(&path);
    let dir = target.parent().ok_or("invalid path")?;
    let name = target.file_name().ok_or("invalid path")?.to_string_lossy();
    let tmp = dir.join(format!(".{name}.mdr-tmp"));
    std::fs::write(&tmp, contents.as_bytes()).map_err(|e| e.to_string())?;
    if let Ok(meta) = std::fs::metadata(&target) {
        let _ = std::fs::set_permissions(&tmp, meta.permissions());
    }
    std::fs::rename(&tmp, &target).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })?;
    Ok(mtime_ms(&target))
}

#[tauri::command]
fn write_bytes(path: String, data: Vec<u8>) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if let Some(dir) = target.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&target, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn file_mtime(path: String) -> u64 {
    mtime_ms(Path::new(&path))
}

fn mtime_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Open a link in the default app, or reveal a file in Finder.
#[tauri::command]
fn open_external(target: String, reveal: bool) -> Result<(), String> {
    let is_url = target.contains("://") || target.starts_with("mailto:");
    if is_url && !["http://", "https://", "mailto:"].iter().any(|s| target.starts_with(s)) {
        return Err("unsupported link".into());
    }
    if !is_url && !Path::new(&target).exists() {
        return Err("file not found".into());
    }
    let mut cmd = std::process::Command::new("open");
    if reveal {
        cmd.arg("-R");
    }
    cmd.arg(&target).spawn().map(|_| ()).map_err(|e| e.to_string())
}

// ---------- window commands ----------

#[tauri::command]
fn set_window_path(window: WebviewWindow, state: tauri::State<Windows>, path: String) {
    state
        .paths
        .lock()
        .unwrap()
        .insert(window.label().to_string(), Some(PathBuf::from(path)));
}

#[tauri::command]
fn cancel_quit(state: tauri::State<Windows>) {
    state.quitting.store(false, Ordering::SeqCst);
}

// ---------- windows ----------

fn open_document(app: &AppHandle, path: Option<PathBuf>) {
    let state = app.state::<Windows>();
    let path = path.map(|p| p.canonicalize().unwrap_or(p));

    // Already open? Just focus that window.
    if let Some(p) = &path {
        let existing = state
            .paths
            .lock()
            .unwrap()
            .iter()
            .find(|(_, v)| v.as_ref() == Some(p))
            .map(|(k, _)| k.clone());
        if let Some(window) = existing.and_then(|label| app.get_webview_window(&label)) {
            let _ = window.unminimize();
            let _ = window.set_focus();
            return;
        }
    }

    let n = state.counter.fetch_add(1, Ordering::SeqCst);
    let label = format!("doc-{n}");
    let title = path
        .as_ref()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| menu::tr(current_lang(app), "untitled").into());
    let init = format!(
        "window.__MDR_PATH__ = {};",
        serde_json::to_string(&path.as_ref().map(|p| p.to_string_lossy())).unwrap()
    );

    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title(&title)
        .inner_size(860.0, 900.0)
        .min_inner_size(420.0, 300.0)
        .title_bar_style(TitleBarStyle::Overlay)
        .initialization_script(&init);

    // Cascade new windows from the focused one, like native document apps.
    if let Some(pos) = app
        .webview_windows()
        .values()
        .find(|w| w.is_focused().unwrap_or(false))
        .and_then(|w| w.outer_position().ok().zip(w.scale_factor().ok()))
        .map(|(p, s)| p.to_logical::<f64>(s))
    {
        builder = builder.position(pos.x + 26.0, pos.y + 26.0);
    } else {
        builder = builder.center();
    }

    match builder.build() {
        Ok(_) => {
            state.paths.lock().unwrap().insert(label, path);
        }
        Err(e) => eprintln!("failed to open window: {e}"),
    }
}

fn current_lang(app: &AppHandle) -> &'static str {
    settings::lang(&app.state::<SettingsState>().0.lock().unwrap())
}

fn open_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = window.unminimize();
        let _ = window.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("settings.html".into()))
        .title(menu::tr(current_lang(app), "settings-title"))
        .inner_size(640.0, 560.0)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .center()
        .build();
}

fn pick_and_open(app: &AppHandle) {
    let handle = app.clone();
    app.dialog()
        .file()
        .add_filter("Markdown", MD_EXTENSIONS)
        .pick_files(move |files| {
            for file in files.unwrap_or_default() {
                if let Ok(path) = file.into_path() {
                    open_document(&handle, Some(path));
                }
            }
        });
}

fn focused_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.webview_windows()
        .into_values()
        .find(|w| w.is_focused().unwrap_or(false))
}

/// Close every window through its normal close flow (which saves), then exit.
fn quit(app: &AppHandle) {
    let windows = app.webview_windows();
    if windows.is_empty() {
        app.exit(0);
        return;
    }
    app.state::<Windows>().quitting.store(true, Ordering::SeqCst);
    for window in windows.values() {
        let _ = window.close();
    }
}

fn md_paths_from_args() -> Vec<PathBuf> {
    std::env::args()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(PathBuf::from)
        .filter(|p| p.is_file())
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Windows::default())
        .setup(|app| {
            let handle = app.handle();
            let prefs = settings::load(handle);
            menu::install(handle, settings::lang(&prefs))?;
            app.manage(SettingsState(std::sync::Mutex::new(prefs)));
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "new" => open_document(app, None),
            "settings" => open_settings(app),
            "open" => pick_and_open(app),
            "quit" => quit(app),
            id @ ("save" | "save-as" | "reveal" | "source") => {
                if let Some(window) = focused_window(app) {
                    let _ = app.emit_to(EventTarget::webview_window(window.label()), "menu", id);
                }
            }
            _ => {}
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let app = window.app_handle();
                let state = app.state::<Windows>();
                state.paths.lock().unwrap().remove(window.label());
                if state.quitting.load(Ordering::SeqCst) && app.webview_windows().is_empty() {
                    app.exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_text,
            write_text,
            write_bytes,
            file_mtime,
            open_external,
            set_window_path,
            cancel_quit,
            settings::get_settings,
            settings::set_settings,
            settings::list_fonts,
            default_app::is_default_markdown_app,
            default_app::set_default_markdown_app
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            RunEvent::Ready => {
                for path in md_paths_from_args() {
                    open_document(app, Some(path));
                }
                // Finder hands files over via `Opened` shortly after launch;
                // only show an empty document if nothing arrived.
                let handle = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(400));
                    let h = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        if h.webview_windows().keys().all(|l| l == SETTINGS_LABEL) {
                            open_document(&h, None);
                        }
                    });
                });
            }
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            RunEvent::Opened { urls } => {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        open_document(app, Some(path));
                    }
                }
            }
            #[cfg(target_os = "macos")]
            RunEvent::Reopen {
                has_visible_windows,
                ..
            } => {
                if !has_visible_windows {
                    open_document(app, None);
                }
            }
            // Stay in the Dock after the last window closes, like other Mac apps.
            RunEvent::ExitRequested { api, code, .. } => {
                if code.is_none() && !app.state::<Windows>().quitting.load(Ordering::SeqCst) {
                    api.prevent_exit();
                }
            }
            _ => {}
        });
}
