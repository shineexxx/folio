import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { strings, type Lang, type Strings } from "./i18n";
import { PALETTES } from "./palettes";

export const DEFAULTS = {
  // General
  language: "system" as "system" | Lang,
  autosave: true,
  autosaveDelay: 400, // ms
  assetsDir: "assets",
  linkOpen: "cmd" as "cmd" | "click",
  askedDefault: false, // first-launch "make default editor?" prompt shown

  // Appearance
  theme: "system" as "system" | "light" | "dark",
  palette: "default",
  accent: "", // "" = palette accent
  widthMode: "fixed" as "fixed" | "full",
  width: 720, // px
  paddingX: 48, // px
  paddingTop: 44, // px
  smoothing: "antialiased" as "antialiased" | "subpixel",

  // Typography
  bodyFont: "system",
  headingFont: "same",
  codeFont: "mono",
  fontSize: 16,
  fontWeight: 400,
  lineHeight: 1.6,
  letterSpacing: 0, // em * 100
  paragraphSpacing: 8, // px
  headingWeight: 700,
  headingScale: 1, // multiplier for h1–h3 growth
  codeSize: 88, // % of body size
  codeLigatures: true,

  // Editor
  spellcheck: true,
  placeholder: true,
  slashMenu: true,
  blockHandle: false,
  bulletStyle: "disc" as "disc" | "circle" | "dash" | "square" | "arrow",
  checkboxStyle: "square" as "square" | "round",
  strikeDone: true,
  codeLineNumbers: false,
  codeWrap: false,

  // Markdown output
  mdBullet: "-" as "-" | "*" | "+",
  mdEmphasis: "*" as "*" | "_",
  mdStrong: "*" as "*" | "_",
  mdRule: "-" as "-" | "*" | "_",
  mdFence: "`" as "`" | "~",
  mdListIndent: "one" as "one" | "tab" | "mixed",
};

export type Settings = typeof DEFAULTS & {
  /** Resolved UI language (filled in by the backend). */
  lang: Lang;
};

/** Settings baked into the editor at creation; changing them rebuilds it. */
export const EDITOR_KEYS: (keyof Settings)[] = [
  "lang",
  "slashMenu",
  "bulletStyle",
  "checkboxStyle",
  "codeWrap",
  "mdBullet",
  "mdEmphasis",
  "mdStrong",
  "mdRule",
  "mdFence",
  "mdListIndent",
];

export async function getSettings(): Promise<Settings> {
  const stored = await invoke<Partial<Settings>>("get_settings");
  return { ...DEFAULTS, ...stored } as Settings;
}

export const saveSettings = ({ lang: _, ...settings }: Settings) =>
  invoke("set_settings", { settings });

export const isDefaultApp = () => invoke<boolean>("is_default_markdown_app").catch(() => false);
export const makeDefaultApp = () => invoke("set_default_markdown_app");

export const listFonts = () => invoke<string[]>("list_fonts").catch(() => [] as string[]);

export const t = (s: Settings): Strings => strings[s.lang];

export const onSettingsChanged = (fn: (s: Settings) => void) =>
  listen<Partial<Settings>>("settings-changed", ({ payload }) =>
    fn({ ...DEFAULTS, ...payload } as Settings),
  );

// ---------- applying to a window ----------

const FONT_PRESETS: Record<string, string> = {
  system: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
  serif: '"New York", ui-serif, "Iowan Old Style", Charter, Georgia, serif',
  rounded: 'ui-rounded, "SF Pro Rounded", -apple-system, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
};

export function fontStack(name: string, fallback = "system"): string {
  if (FONT_PRESETS[name]) return FONT_PRESETS[name];
  return `"${name.replace(/"/g, "")}", ${FONT_PRESETS[fallback]}`;
}

const darkQuery = matchMedia("(prefers-color-scheme: dark)");

export function isDark(s: Settings) {
  return s.theme === "dark" || (s.theme === "system" && darkQuery.matches);
}

/** Apply appearance settings to this window as CSS variables. */
export function applySettings(s: Settings) {
  const root = document.documentElement;
  const css = (name: string, value: string | number) => root.style.setProperty(name, String(value));

  root.lang = s.lang;
  root.dataset.theme = isDark(s) ? "dark" : "light";
  const palette = (PALETTES[s.palette] ?? PALETTES.default)[isDark(s) ? "dark" : "light"];
  css("--bg", palette.bg);
  css("--text", palette.text);
  css("--muted", palette.muted);
  css("--faint", palette.faint);
  css("--surface", palette.surface);
  css("--accent", s.accent || palette.accent);
  css("--code-inline", palette.code);
  css("--menu-bg", palette.menu);

  css("--column", s.widthMode === "full" ? "none" : `${s.width}px`);
  css("--pad-x", `${s.paddingX}px`);
  css("--pad-top", `${s.paddingTop}px`);

  css("--font-body", fontStack(s.bodyFont));
  css("--font-heading", s.headingFont === "same" ? "var(--font-body)" : fontStack(s.headingFont));
  css("--font-code", fontStack(s.codeFont, "mono"));
  css("--font-size", `${s.fontSize}px`);
  css("--font-weight", s.fontWeight);
  css("--line-height", s.lineHeight);
  css("--letter-spacing", `${s.letterSpacing / 100}em`);
  css("--para-space", `${s.paragraphSpacing}px`);
  css("--heading-weight", s.headingWeight);
  css("--heading-scale", s.headingScale);
  css("--code-size", `${s.codeSize}%`);
  css("--code-ligatures", s.codeLigatures ? "normal" : "none");
  css("--smoothing", s.smoothing === "subpixel" ? "auto" : "antialiased");

  root.classList.toggle("no-placeholder", !s.placeholder);
  root.classList.toggle("show-handle", s.blockHandle);
  root.classList.toggle("strike-done", s.strikeDone);
  root.classList.toggle("code-numbers", s.codeLineNumbers);

  // Native titlebar follows the chosen theme too.
  getCurrentWindow().setTheme(s.theme === "system" ? null : s.theme).catch(() => {});
}

/** Re-apply when the system appearance flips (matters for theme = system). */
export function watchSystemTheme(get: () => Settings) {
  darkQuery.addEventListener("change", () => applySettings(get()));
}
