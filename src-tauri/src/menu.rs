use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Wry};

/// Native UI strings (menu, window titles) for "ru" / "en".
pub fn tr(lang: &str, key: &str) -> &'static str {
    let ru = lang == "ru";
    match key {
        "about" => if ru { "О программе Folio" } else { "About Folio" },
        "settings" => if ru { "Настройки…" } else { "Settings…" },
        "check-updates" => if ru { "Проверить обновления…" } else { "Check for Updates…" },
        "update-available" => if ru {
            "Доступна новая версия Folio {new} (у вас {old}). Установить?"
        } else {
            "Folio {new} is available (you have {old}). Install it now?"
        },
        "update-install" => if ru { "Установить" } else { "Install" },
        "update-later" => if ru { "Позже" } else { "Later" },
        "update-ready" => if ru {
            "Обновление установлено. Перезапустить Folio сейчас? Открытые документы сохранятся."
        } else {
            "The update is installed. Restart Folio now? Open documents will be saved."
        },
        "update-restart" => if ru { "Перезапустить" } else { "Restart" },
        "update-none" => if ru { "У вас последняя версия Folio ({v})." } else { "You're up to date: Folio {v}." },
        "update-error" => if ru { "Не удалось проверить обновления:" } else { "Couldn't check for updates:" },
        "settings-title" => if ru { "Настройки" } else { "Settings" },
        "hide" => if ru { "Скрыть Folio" } else { "Hide Folio" },
        "hide-others" => if ru { "Скрыть остальные" } else { "Hide Others" },
        "show-all" => if ru { "Показать все" } else { "Show All" },
        "quit" => if ru { "Завершить Folio" } else { "Quit Folio" },
        "file" => if ru { "Файл" } else { "File" },
        "new" => if ru { "Новый" } else { "New" },
        "open" => if ru { "Открыть…" } else { "Open…" },
        "save" => if ru { "Сохранить" } else { "Save" },
        "save-as" => if ru { "Сохранить как…" } else { "Save As…" },
        "reveal" => if ru { "Показать в Finder" } else { "Show in Finder" },
        "close" => if ru { "Закрыть" } else { "Close" },
        "edit" => if ru { "Правка" } else { "Edit" },
        "undo" => if ru { "Отменить" } else { "Undo" },
        "redo" => if ru { "Повторить" } else { "Redo" },
        "cut" => if ru { "Вырезать" } else { "Cut" },
        "copy" => if ru { "Скопировать" } else { "Copy" },
        "paste" => if ru { "Вставить" } else { "Paste" },
        "select-all" => if ru { "Выбрать все" } else { "Select All" },
        "view" => if ru { "Вид" } else { "View" },
        "source" => if ru { "Исходный Markdown" } else { "Markdown Source" },
        "fullscreen" => if ru { "Во весь экран" } else { "Enter Full Screen" },
        "window" => if ru { "Окно" } else { "Window" },
        "minimize" => if ru { "Свернуть" } else { "Minimize" },
        "zoom" => if ru { "Изменить масштаб" } else { "Zoom" },
        "untitled" => if ru { "Без названия" } else { "Untitled" },
        _ => "",
    }
}

fn build(app: &AppHandle, lang: &str) -> tauri::Result<Menu<Wry>> {
    let t = |key: &str| tr(lang, key);
    let item = |id: &str, key: &str, accel: Option<&str>| {
        let mut b = MenuItemBuilder::with_id(id, t(key));
        if let Some(a) = accel {
            b = b.accelerator(a);
        }
        b.build(app)
    };

    let app_menu = SubmenuBuilder::new(app, "Folio")
        .item(&PredefinedMenuItem::about(app, Some(t("about")), None)?)
        .separator()
        .item(&item("check-updates", "check-updates", None)?)
        .separator()
        .item(&item("settings", "settings", Some("CmdOrCtrl+,"))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some(t("hide")))?)
        .item(&PredefinedMenuItem::hide_others(app, Some(t("hide-others")))?)
        .item(&PredefinedMenuItem::show_all(app, Some(t("show-all")))?)
        .separator()
        .item(&item("quit", "quit", Some("CmdOrCtrl+Q"))?)
        .build()?;

    let file_menu = SubmenuBuilder::new(app, t("file"))
        .item(&item("new", "new", Some("CmdOrCtrl+N"))?)
        .item(&item("open", "open", Some("CmdOrCtrl+O"))?)
        .separator()
        .item(&item("save", "save", Some("CmdOrCtrl+S"))?)
        .item(&item("save-as", "save-as", Some("CmdOrCtrl+Shift+S"))?)
        .separator()
        .item(&item("reveal", "reveal", None)?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some(t("close")))?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, t("edit"))
        .item(&PredefinedMenuItem::undo(app, Some(t("undo")))?)
        .item(&PredefinedMenuItem::redo(app, Some(t("redo")))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some(t("cut")))?)
        .item(&PredefinedMenuItem::copy(app, Some(t("copy")))?)
        .item(&PredefinedMenuItem::paste(app, Some(t("paste")))?)
        .item(&PredefinedMenuItem::select_all(app, Some(t("select-all")))?)
        .build()?;

    let view_menu = SubmenuBuilder::new(app, t("view"))
        .item(&item("source", "source", Some("CmdOrCtrl+/"))?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, Some(t("fullscreen")))?)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, t("window"))
        .item(&PredefinedMenuItem::minimize(app, Some(t("minimize")))?)
        .item(&PredefinedMenuItem::maximize(app, Some(t("zoom")))?)
        .build()?;

    MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu])
        .build()
}

/// Build the menu bar in the given language and make it the app menu.
pub fn install(app: &AppHandle, lang: &str) -> tauri::Result<()> {
    app.set_menu(build(app, lang)?)?;
    Ok(())
}
