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

#[cfg(not(target_os = "macos"))]
mod imp {
    pub fn current() -> Option<String> {
        None
    }
    pub fn set(_: &str) -> Result<(), String> {
        Err("unsupported".into())
    }
}

/// Whether Folio currently opens Markdown files by default.
#[tauri::command]
pub fn is_default_markdown_app(app: tauri::AppHandle) -> bool {
    let id = &app.config().identifier;
    imp::current().is_some_and(|h| h.eq_ignore_ascii_case(id))
}

#[tauri::command]
pub fn set_default_markdown_app(app: tauri::AppHandle) -> Result<(), String> {
    imp::set(&app.config().identifier)
}
