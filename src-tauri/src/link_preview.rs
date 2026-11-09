//! Title and favicon for the link hover card (fetched here: the webview can't, CORS).

use std::sync::OnceLock;
use std::time::Duration;

use regex::Regex;
use serde::Serialize;
use url::Url;

const MAX_HTML: usize = 512 * 1024;

#[derive(Serialize)]
pub struct LinkPreview {
    title: Option<String>,
    icon: Option<String>,
    /// Where the link ended up after redirects.
    url: String,
}

fn client() -> Result<reqwest::Client, String> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(c) = CLIENT.get() {
        return Ok(c.clone());
    }
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let c = reqwest::Client::builder()
        .timeout(Duration::from_secs(6))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15 Folio")
        .build()
        .map_err(|e| e.to_string())?;
    Ok(CLIENT.get_or_init(|| c).clone())
}

#[tauri::command]
pub async fn link_preview(url: String) -> Result<LinkPreview, String> {
    let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("unsupported link".into());
    }

    let mut resp = client()?
        .get(parsed)
        .header("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let final_url = resp.url().clone();
    let is_html = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("html"));

    let (mut title, mut icon) = (None, None);
    if is_html {
        let mut body = Vec::new();
        while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
            body.extend_from_slice(&chunk);
            if body.len() > MAX_HTML || contains(&body, b"</head>") {
                break;
            }
        }
        let html = String::from_utf8_lossy(&body);
        let head = &html[..html.find("</head>").unwrap_or(html.len())];
        title = find_title(head);
        icon = find_icon(head).and_then(|href| final_url.join(&href).ok()).map(|u| u.to_string());
    }
    let icon = icon.or_else(|| final_url.join("/favicon.ico").ok().map(|u| u.to_string()));
    Ok(LinkPreview { title, icon, url: final_url.to_string() })
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|w| w.eq_ignore_ascii_case(needle))
}

fn re(pattern: &'static str, cell: &'static OnceLock<Regex>) -> &'static Regex {
    cell.get_or_init(|| Regex::new(pattern).unwrap())
}

/// Value of `name="…"` (or '…' / bare) inside a tag.
fn attr(tag: &str, name: &str) -> Option<String> {
    let pattern = format!(r#"(?is)\b{name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#);
    let caps = Regex::new(&pattern).ok()?.captures(tag)?;
    caps.get(1).or(caps.get(2)).or(caps.get(3)).map(|m| decode_entities(m.as_str()))
}

fn find_title(head: &str) -> Option<String> {
    static META: OnceLock<Regex> = OnceLock::new();
    static TITLE: OnceLock<Regex> = OnceLock::new();
    let og = re(r"(?is)<meta\s[^>]*>", &META).find_iter(head).find_map(|m| {
        let tag = m.as_str();
        let key = attr(tag, "property").or_else(|| attr(tag, "name"))?.to_lowercase();
        (key == "og:title" || key == "twitter:title").then(|| attr(tag, "content")).flatten()
    });
    let title = og.or_else(|| {
        re(r"(?is)<title[^>]*>(.*?)</title>", &TITLE)
            .captures(head)
            .map(|c| decode_entities(&c[1]))
    })?;
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    (!title.is_empty()).then(|| title.chars().take(200).collect())
}

/// Best favicon `href`: an explicit icon first, then apple-touch-icon.
fn find_icon(head: &str) -> Option<String> {
    static LINK: OnceLock<Regex> = OnceLock::new();
    let mut touch = None;
    for m in re(r"(?is)<link\s[^>]*>", &LINK).find_iter(head) {
        let tag = m.as_str();
        let Some(rel) = attr(tag, "rel").map(|r| r.to_lowercase()) else { continue };
        let Some(href) = attr(tag, "href") else { continue };
        let rels: Vec<&str> = rel.split_whitespace().collect();
        if rels.contains(&"icon") {
            return Some(href);
        }
        if touch.is_none() && rels.iter().any(|r| r.starts_with("apple-touch-icon")) {
            touch = Some(href);
        }
    }
    touch
}

fn decode_entities(s: &str) -> String {
    static ENTITY: OnceLock<Regex> = OnceLock::new();
    re(r"&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);", &ENTITY)
        .replace_all(s, |c: &regex::Captures| {
            let e = &c[1];
            let ch = if let Some(hex) = e.strip_prefix("#x").or_else(|| e.strip_prefix("#X")) {
                u32::from_str_radix(hex, 16).ok().and_then(char::from_u32)
            } else if let Some(dec) = e.strip_prefix('#') {
                dec.parse().ok().and_then(char::from_u32)
            } else {
                match e {
                    "amp" => Some('&'),
                    "lt" => Some('<'),
                    "gt" => Some('>'),
                    "quot" => Some('"'),
                    "apos" => Some('\''),
                    "nbsp" => Some(' '),
                    "mdash" => Some('—'),
                    "ndash" => Some('–'),
                    "laquo" => Some('«'),
                    "raquo" => Some('»'),
                    _ => None,
                }
            };
            ch.map(String::from).unwrap_or_else(|| c[0].to_string())
        })
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_title_and_icon() {
        let head = r#"<head><title> Hello &amp; world </title>
            <link rel="apple-touch-icon" href="/touch.png">
            <link rel="shortcut icon" href='/fav.ico'></head>"#;
        assert_eq!(find_title(head).as_deref(), Some("Hello & world"));
        assert_eq!(find_icon(head).as_deref(), Some("/fav.ico"));
    }

    #[test]
    fn prefers_og_title() {
        let head = r#"<title>Site</title><meta property="og:title" content="Article &#8212; Site">"#;
        assert_eq!(find_title(head).as_deref(), Some("Article — Site"));
    }

    #[test]
    fn falls_back_to_touch_icon() {
        let head = r#"<link rel="stylesheet" href="a.css"><link rel="apple-touch-icon-precomposed" href="t.png">"#;
        assert_eq!(find_icon(head).as_deref(), Some("t.png"));
    }
}

#[cfg(test)]
mod network_tests {
    #[test]
    #[ignore = "network"]
    fn real_sites() {
        for url in ["https://github.com/shineexxx/folio", "https://ru.wikipedia.org/wiki/Markdown", "https://tauri.app"] {
            let p = tauri::async_runtime::block_on(super::link_preview(url.into()));
            match p {
                Ok(p) => println!("{url}\n  title={:?}\n  icon={:?}\n  final={}", p.title, p.icon, p.url),
                Err(e) => println!("{url} ERROR {e}"),
            }
        }
    }
}
