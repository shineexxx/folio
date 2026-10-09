//! Making Folio the default app for Markdown files (Launch Services).

#[cfg(target_os = "macos")]
mod imp {
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn LSSetDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            role: u32,
            handler_bundle_id: CFStringRef,
        ) -> i32;
        fn LSCopyDefaultRoleHandlerForContentType(content_type: CFStringRef, role: u32) -> CFStringRef;
    }

    const ROLES_ALL: u32 = 0xFFFF_FFFF;
    const MARKDOWN_UTI: &str = "net.daringfireball.markdown";

    pub fn current() -> Option<String> {
        let uti = CFString::new(MARKDOWN_UTI);
        let handler = unsafe { LSCopyDefaultRoleHandlerForContentType(uti.as_concrete_TypeRef(), ROLES_ALL) };
        if handler.is_null() {
            return None;
        }
        Some(unsafe { CFString::wrap_under_create_rule(handler) }.to_string())
    }

    pub fn set(bundle_id: &str) -> Result<(), String> {
        let uti = CFString::new(MARKDOWN_UTI);
        let id = CFString::new(bundle_id);
        let status = unsafe {
            LSSetDefaultRoleHandlerForContentType(uti.as_concrete_TypeRef(), ROLES_ALL, id.as_concrete_TypeRef())
        };
        if status == 0 { Ok(()) } else { Err(format!("Launch Services error {status}")) }
    }
}

#[cfg(windows)]
mod imp {
    use windows_sys::Win32::UI::Shell::{AssocQueryStringW, ASSOCF_NONE, ASSOCSTR_EXECUTABLE};

    /// Executable that opens `.md` files.
    pub fn current() -> Option<String> {
        let ext: Vec<u16> = ".md\0".encode_utf16().collect();
        let verb: Vec<u16> = "open\0".encode_utf16().collect();
        let mut len: u32 = 1024;
        let mut buf = vec![0u16; len as usize];
        let hr = unsafe {
            AssocQueryStringW(ASSOCF_NONE, ASSOCSTR_EXECUTABLE, ext.as_ptr(), verb.as_ptr(), buf.as_mut_ptr(), &mut len)
        };
        if hr != 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buf[..(len as usize).saturating_sub(1)]))
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod imp {
    pub fn current() -> Option<String> {
        None
    }
}

/// Whether Folio currently opens Markdown files by default.
#[tauri::command]
pub fn is_default_markdown_app(app: tauri::AppHandle) -> bool {
    let Some(handler) = imp::current() else { return false };
    #[cfg(target_os = "macos")]
    {
        handler.eq_ignore_ascii_case(&app.config().identifier)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = &app;
        std::env::current_exe()
            .map(|exe| exe.to_string_lossy().eq_ignore_ascii_case(&handler))
            .unwrap_or(false)
    }
}

/// macOS: switch the handler directly. Windows doesn't allow apps to do that,
/// so open Settings → Default apps for the user to pick Folio.
#[tauri::command]
pub fn set_default_markdown_app(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        imp::set(&app.config().identifier)
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_url("ms-settings:defaultapps", None::<&str>)
            .map_err(|e| e.to_string())
    }
}
