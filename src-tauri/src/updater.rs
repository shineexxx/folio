//! Auto-update from GitHub Releases (`latest.json` produced by `scripts/release.sh`).

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

use crate::menu::tr;
use crate::settings::{self, SettingsState};

/// Only one check at a time (startup check vs. menu item).
static CHECKING: AtomicBool = AtomicBool::new(false);

fn lang(app: &AppHandle) -> &'static str {
    settings::lang(&app.state::<SettingsState>().0.lock().unwrap())
}

fn auto_update_enabled(app: &AppHandle) -> bool {
    app.state::<SettingsState>()
        .0
        .lock()
        .unwrap()
        .get("autoUpdate")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

fn info(app: &AppHandle, title: &str, text: String, kind: MessageDialogKind) {
    app.dialog().message(text).title(title).kind(kind).blocking_show();
}

fn confirm(app: &AppHandle, title: &str, text: String, ok: &str, cancel: &str) -> bool {
    app.dialog()
        .message(text)
        .title(title)
        .buttons(MessageDialogButtons::OkCancelCustom(ok.into(), cancel.into()))
        .blocking_show()
}

/// Check GitHub for a newer version. `manual` = started from the menu:
/// then "you're up to date" and errors are reported too.
pub fn check(app: &AppHandle, manual: bool) {
    if !manual && !auto_update_enabled(app) {
        return;
    }
    if CHECKING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        run(&app, manual).await;
        CHECKING.store(false, Ordering::SeqCst);
    });
}

async fn run(app: &AppHandle, manual: bool) {
    let l = lang(app);
    let result = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(e) => Err(e),
    };
    let update = match result {
        Ok(Some(update)) => update,
        Ok(None) => {
            if manual {
                let version = app.package_info().version.to_string();
                info(app, "Folio", tr(l, "update-none").replace("{v}", &version), MessageDialogKind::Info);
            }
            return;
        }
        Err(e) => {
            if manual {
                info(app, "Folio", format!("{}\n{e}", tr(l, "update-error")), MessageDialogKind::Error);
            }
            return;
        }
    };

    let mut text = tr(l, "update-available")
        .replace("{new}", &update.version)
        .replace("{old}", &update.current_version);
    if let Some(notes) = update.body.as_deref().map(str::trim).filter(|n| !n.is_empty()) {
        // Release notes can be long; the first paragraph is enough for a dialog.
        let first: String = notes.split("\n\n").next().unwrap_or(notes).chars().take(400).collect();
        text.push_str("\n\n");
        text.push_str(&first);
    }
    if !confirm(app, "Folio", text, tr(l, "update-install"), tr(l, "update-later")) {
        return;
    }

    if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
        info(app, "Folio", format!("{}\n{e}", tr(l, "update-error")), MessageDialogKind::Error);
        return;
    }

    if confirm(app, "Folio", tr(l, "update-ready").into(), tr(l, "update-restart"), tr(l, "update-later")) {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || crate::quit(&handle, true));
    }
}
