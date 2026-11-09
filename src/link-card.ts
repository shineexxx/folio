import { invoke } from "@tauri-apps/api/core";

import type { Strings } from "./i18n";

/** Notion-style hover card for links: favicon, page title, URL; click opens. */

interface Preview {
  title: string | null;
  icon: string | null;
  url: string;
}

export interface LinkCardOptions {
  root: HTMLElement;
  strings: () => Strings;
  /** Fetch page title and favicon (Settings → Editor). */
  fetchPreviews: () => boolean;
  /** Open the link (external URL or local file). */
  open: (href: string) => void;
  /** Start editing the link under this anchor. */
  edit: (anchor: HTMLAnchorElement) => void;
}

const SHOW_DELAY = 280;
const HIDE_DELAY = 220;

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/>'),
  file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
  open: svg('<path d="M7 17 17 7M9 7h8v8"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  edit: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
};

const isExternal = (href: string) => /^(https?:|mailto:)/i.test(href);

const cache = new Map<string, Promise<Preview | null>>();
function preview(url: string): Promise<Preview | null> {
  let p = cache.get(url);
  if (!p) {
    p = invoke<Preview>("link_preview", { url }).catch(() => null);
    cache.set(url, p);
  }
  return p;
}

function prettyUrl(href: string): string {
  try {
    const u = new URL(href);
    if (u.protocol === "mailto:") return u.pathname;
    return (u.host + u.pathname + u.search).replace(/\/$/, "");
  } catch {
    return href;
  }
}

export function setupLinkCard(opts: LinkCardOptions) {
  const card = document.createElement("div");
  card.className = "link-card";
  card.hidden = true;
  card.innerHTML = `
    <button type="button" class="lc-main">
      <span class="lc-icon"></span>
      <span class="lc-text"><span class="lc-title"></span><span class="lc-url"></span></span>
      <span class="lc-go">${ICONS.open}</span>
    </button>
    <span class="lc-sep"></span>
    <button type="button" class="lc-btn lc-copy">${ICONS.copy}</button>
    <button type="button" class="lc-btn lc-edit">${ICONS.edit}</button>`;
  document.body.append(card);

  const $ = <T extends HTMLElement>(sel: string) => card.querySelector(sel) as T;
  const main = $<HTMLButtonElement>(".lc-main");
  const iconEl = $<HTMLSpanElement>(".lc-icon");
  const titleEl = $<HTMLSpanElement>(".lc-title");
  const urlEl = $<HTMLSpanElement>(".lc-url");
  const copyBtn = $<HTMLButtonElement>(".lc-copy");
  const editBtn = $<HTMLButtonElement>(".lc-edit");

  let anchor: HTMLAnchorElement | null = null;
  let showTimer: number | undefined;
  let hideTimer: number | undefined;

  const setIcon = (src: string | null, fallback: string) => {
    iconEl.innerHTML = fallback;
    if (!src) return;
    const img = new Image(16, 16);
    img.onload = () => iconEl.replaceChildren(img);
    img.src = src;
  };

  function position(a: HTMLAnchorElement) {
    // A link can wrap over lines; anchor the card to the first line box.
    const rect = a.getClientRects()[0] ?? a.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = card;
    const titlebar = document.documentElement.classList.contains("windows") ? 0 : 30;
    let top = rect.top - h - 8;
    if (top < titlebar + 4) top = rect.bottom + 8;
    const left = Math.max(8, Math.min(rect.left, innerWidth - w - 8));
    card.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  function show(a: HTMLAnchorElement) {
    const href = a.getAttribute("href") ?? "";
    if (!href || href.startsWith("#")) return;
    const t = opts.strings();
    anchor = a;
    main.title = t.linkOpenAction;
    copyBtn.title = t.linkCopy;
    editBtn.title = t.linkEdit;
    copyBtn.innerHTML = ICONS.copy;

    if (isExternal(href)) {
      const pretty = prettyUrl(href);
      titleEl.textContent = href.startsWith("mailto:") ? t.linkEmail : (() => {
        try { return new URL(href).hostname.replace(/^www\./, ""); } catch { return pretty; }
      })();
      urlEl.textContent = pretty;
      card.classList.add("loading");
      setIcon(null, ICONS.globe);
      if (opts.fetchPreviews() && /^https?:/i.test(href)) {
        preview(href).then((p) => {
          if (anchor !== a) return;
          card.classList.remove("loading");
          if (p?.title) titleEl.textContent = p.title;
          setIcon(p?.icon ?? null, ICONS.globe);
          position(a);
        });
      } else {
        card.classList.remove("loading");
      }
    } else {
      const path = decodeURI(href.split("#")[0]);
      titleEl.textContent = path.split(/[\\/]/).pop() || path;
      urlEl.textContent = path;
      card.classList.remove("loading");
      setIcon(null, ICONS.file);
    }

    card.hidden = false;
    position(a);
    requestAnimationFrame(() => card.classList.add("visible"));
  }

  function hide() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    anchor = null;
    card.classList.remove("visible");
    card.hidden = true;
  }

  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hide, HIDE_DELAY);
  };

  opts.root.addEventListener("mouseover", (e) => {
    const a = (e.target as HTMLElement).closest?.(".ProseMirror a") as HTMLAnchorElement | null;
    if (!a) return;
    clearTimeout(hideTimer);
    if (a === anchor) return;
    clearTimeout(showTimer);
    showTimer = window.setTimeout(() => show(a), anchor ? 60 : SHOW_DELAY);
  });

  opts.root.addEventListener("mouseout", (e) => {
    const from = (e.target as HTMLElement).closest?.(".ProseMirror a");
    const to = (e.relatedTarget as HTMLElement | null)?.closest?.(".ProseMirror a");
    if (from && from !== to) {
      clearTimeout(showTimer);
      if (anchor) scheduleHide();
    }
  });

  card.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  card.addEventListener("mouseleave", scheduleHide);

  main.addEventListener("click", () => {
    const href = anchor?.getAttribute("href");
    hide();
    if (href) opts.open(href);
  });

  copyBtn.addEventListener("click", async () => {
    const href = anchor?.getAttribute("href");
    if (!href) return;
    await navigator.clipboard.writeText(href).catch(() => {});
    copyBtn.innerHTML = ICONS.check;
    copyBtn.title = opts.strings().linkCopied;
  });

  editBtn.addEventListener("click", () => {
    const a = anchor;
    hide();
    if (a) opts.edit(a);
  });

  // Typing, scrolling or clicking elsewhere dismisses the card.
  window.addEventListener("keydown", hide, true);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("blur", hide);
  document.addEventListener("mousedown", (e) => {
    if (!card.contains(e.target as Node)) hide();
  });

  return { hide };
}
