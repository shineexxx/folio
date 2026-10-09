import { ask } from "@tauri-apps/plugin-dialog";

import "./styles.css";
import type { Strings } from "./i18n";
import { PALETTES } from "./palettes";
import {
  DEFAULTS,
  applySettings,
  getSettings,
  isDefaultApp,
  makeDefaultApp,
  listFonts,
  onSettingsChanged,
  saveSettings,
  t,
  watchSystemTheme,
  type Settings,
} from "./settings";

type Key = keyof typeof DEFAULTS;
type Label = keyof Strings | `=${string}`;

type Field = { key: Key; label?: keyof Strings; hint?: keyof Strings; when?: (s: Settings) => boolean } & (
  | { type: "select"; options: [string, Label][] }
  | { type: "toggle" }
  | { type: "range"; min: number; max: number; step: number; format: (v: number) => string }
  | { type: "color" }
  | { type: "font"; same?: boolean }
  | { type: "text" }
  | { type: "defaultApp" }
);

interface Section {
  id: string;
  label: keyof Strings;
  fields: Field[];
  preview?: "doc" | "markdown";
  hint?: keyof Strings;
}

const px = (v: number) => `${v}px`;

const SECTIONS: Section[] = [
  {
    id: "general",
    label: "tabGeneral",
    fields: [
      { key: "language", type: "select", options: [["system", "systemDefault"], ["ru", "=Русский"], ["en", "=English"]] },
      { key: "autosave", type: "toggle", hint: "autosaveHint" },
      {
        key: "autosaveDelay", type: "range", min: 100, max: 5000, step: 100,
        format: (v) => (v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`),
        when: (s) => s.autosave,
      },
      { key: "assetsDir", type: "text", hint: "assetsDirHint" },
      { key: "linkOpen", type: "select", options: [["cmd", "linkCmd"], ["click", "linkClick"]] },
      { key: "askedDefault", label: "defaultApp", type: "defaultApp" },
    ],
  },
  {
    id: "appearance",
    label: "tabAppearance",
    preview: "doc",
    fields: [
      { key: "theme", type: "select", options: [["system", "systemDefault"], ["light", "themeLight"], ["dark", "themeDark"]] },
      {
        key: "palette", type: "select",
        options: [
          ["default", "paletteDefault"], ["paper", "palettePaper"], ["graphite", "paletteGraphite"],
          ["nord", "paletteNord"], ["solarized", "paletteSolarized"], ["rose", "paletteRose"], ["forest", "paletteForest"],
        ],
      },
      { key: "accent", type: "color", hint: "accentHint" },
      { key: "widthMode", type: "select", options: [["fixed", "widthFixed"], ["full", "widthFull"]] },
      { key: "width", type: "range", min: 480, max: 1400, step: 20, format: px, when: (s) => s.widthMode === "fixed" },
      { key: "paddingX", type: "range", min: 0, max: 160, step: 4, format: px },
      { key: "paddingTop", type: "range", min: 28, max: 200, step: 4, format: px },
      { key: "smoothing", type: "select", options: [["antialiased", "smoothingAA"], ["subpixel", "smoothingSub"]] },
    ],
  },
  {
    id: "typography",
    label: "tabTypography",
    preview: "doc",
    fields: [
      { key: "bodyFont", type: "font" },
      { key: "headingFont", type: "font", same: true },
      { key: "codeFont", type: "font" },
      { key: "fontSize", type: "range", min: 12, max: 28, step: 1, format: px },
      { key: "fontWeight", type: "range", min: 300, max: 700, step: 100, format: String },
      { key: "lineHeight", type: "range", min: 1.1, max: 2.4, step: 0.05, format: (v) => v.toFixed(2) },
      { key: "letterSpacing", type: "range", min: -5, max: 10, step: 0.5, format: (v) => `${(v / 100).toFixed(3)} em` },
      { key: "paragraphSpacing", type: "range", min: 0, max: 32, step: 1, format: px },
      { key: "headingWeight", type: "range", min: 400, max: 900, step: 100, format: String },
      { key: "headingScale", type: "range", min: 0.4, max: 2, step: 0.05, format: (v) => `×${v.toFixed(2)}` },
      { key: "codeSize", type: "range", min: 70, max: 120, step: 1, format: (v) => `${v}%` },
      { key: "codeLigatures", type: "toggle" },
    ],
  },
  {
    id: "editor",
    label: "tabEditor",
    fields: [
      { key: "spellcheck", type: "toggle" },
      { key: "placeholder", label: "placeholderSetting", type: "toggle" },
      { key: "slashMenu", type: "toggle" },
      { key: "blockHandle", type: "toggle", when: (s) => s.slashMenu },
      {
        key: "bulletStyle", type: "select",
        options: [["disc", "bulletDisc"], ["circle", "bulletCircle"], ["square", "bulletSquare"], ["dash", "bulletDash"], ["arrow", "bulletArrow"]],
      },
      { key: "checkboxStyle", type: "select", options: [["square", "checkboxSquare"], ["round", "checkboxRound"]] },
      { key: "strikeDone", type: "toggle" },
      { key: "codeLineNumbers", type: "toggle" },
      { key: "codeWrap", type: "toggle" },
    ],
  },
  {
    id: "markdown",
    label: "tabMarkdown",
    preview: "markdown",
    hint: "mdHint",
    fields: [
      { key: "mdBullet", type: "select", options: [["-", "=-  (дефис)"], ["*", "=*  (звёздочка)"], ["+", "=+  (плюс)"]] },
      { key: "mdEmphasis", type: "select", options: [["*", "=*текст*"], ["_", "=_текст_"]] },
      { key: "mdStrong", type: "select", options: [["*", "=**текст**"], ["_", "=__текст__"]] },
      { key: "mdRule", type: "select", options: [["-", "=---"], ["*", "=***"], ["_", "=___"]] },
      { key: "mdFence", type: "select", options: [["`", "=```"], ["~", "=~~~"]] },
      { key: "mdListIndent", type: "select", options: [["one", "indentOne"], ["tab", "indentTab"], ["mixed", "indentMixed"]] },
    ],
  },
];

const tabsEl = document.getElementById("tabs")!;
const paneEl = document.getElementById("pane")!;
const resetEl = document.getElementById("reset") as HTMLButtonElement;

let settings = await getSettings();
let fonts: string[] = [];
let active = SECTIONS[0].id;
let builtLang = "";
/** Updaters that push the current settings into the controls. */
let syncers: (() => void)[] = [];

const S = () => t(settings);
const label = (l: Label) => (l.startsWith("=") ? l.slice(1).replace(/\s+\(.*\)$/, "") : S()[l as keyof Strings]);

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...kids);
  return node;
}

function update(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  applySettings(settings);
  syncers.forEach((f) => f());
  saveSettings(settings);
}

const set = (key: Key, value: unknown) => update({ [key]: value } as Partial<Settings>);

function optionLabel(key: Key, l: Label) {
  // Markdown samples are shown verbatim; Russian helper text only for ru.
  if (l.startsWith("=") && key === "mdBullet") return settings.lang === "ru" ? l.slice(1) : l.slice(1).replace(/\s+\(.*\)$/, "");
  if (l.startsWith("=") && settings.lang === "en") return l.slice(1).replace(/текст/g, "text");
  return label(l);
}

function fontOptions(select: HTMLSelectElement, f: Field & { type: "font" }) {
  const s = S();
  select.replaceChildren();
  if (f.same) select.append(el("option", { value: "same", textContent: s.fontSame }));
  const presets = el("optgroup", { label: s.fontPresets });
  for (const [value, key] of [["system", "fontSystem"], ["serif", "fontSerif"], ["rounded", "fontRounded"], ["mono", "fontMono"]] as const) {
    presets.append(el("option", { value, textContent: s[key] }));
  }
  select.append(presets);
  const installed = el("optgroup", { label: s.fontInstalled });
  const names = new Set(fonts);
  const current = String(settings[f.key]);
  if (!["same", "system", "serif", "rounded", "mono"].includes(current)) names.add(current);
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const opt = el("option", { value: name, textContent: name });
    opt.style.fontFamily = `"${name}"`;
    installed.append(opt);
  }
  select.append(installed);
}

function control(f: Field): HTMLElement {
  const value = () => settings[f.key];
  switch (f.type) {
    case "select": {
      const select = el("select");
      for (const [v, l] of f.options) select.append(el("option", { value: v, textContent: optionLabel(f.key, l) }));
      select.addEventListener("change", () => set(f.key, select.value));
      syncers.push(() => (select.value = String(value())));
      return select;
    }
    case "font": {
      const select = el("select", { className: "font" });
      fontOptions(select, f);
      select.addEventListener("change", () => set(f.key, select.value));
      syncers.push(() => {
        if (![...select.options].some((o) => o.value === value())) fontOptions(select, f);
        select.value = String(value());
      });
      return select;
    }
    case "toggle": {
      const input = el("input", { type: "checkbox", className: "switch" });
      input.addEventListener("change", () => set(f.key, input.checked));
      syncers.push(() => (input.checked = Boolean(value())));
      return input;
    }
    case "range": {
      const input = el("input", { type: "range", min: String(f.min), max: String(f.max), step: String(f.step) });
      const out = el("output");
      input.addEventListener("input", () => set(f.key, Number(input.value)));
      syncers.push(() => {
        input.value = String(value());
        out.textContent = f.format(Number(value()));
      });
      return el("span", { className: "range" }, input, out);
    }
    case "color": {
      const input = el("input", { type: "color" });
      const reset = el("button", { type: "button", className: "link", textContent: S().reset });
      const swatches = el("span", { className: "swatches" });
      const presets = ["#2383e2", "#5e5ce6", "#d6336c", "#e8590c", "#2f8f5b", "#0c8599", "#7c4dff", "#37352f"];
      for (const c of presets) {
        const b = el("button", { type: "button", className: "swatch", title: c });
        b.style.background = c;
        b.addEventListener("click", () => update({ accent: c }));
        swatches.append(b);
      }
      input.addEventListener("input", () => update({ accent: input.value }));
      reset.addEventListener("click", () => update({ accent: "" }));
      syncers.push(() => {
        const dark = document.documentElement.dataset.theme === "dark";
        const palette = (PALETTES[settings.palette] ?? PALETTES.default)[dark ? "dark" : "light"];
        input.value = settings.accent || palette.accent;
        reset.hidden = !settings.accent;
        swatches.querySelectorAll<HTMLButtonElement>(".swatch").forEach((b) =>
          b.classList.toggle("on", b.title === settings.accent),
        );
      });
      return el("span", { className: "color" }, input, swatches, reset);
    }
    case "defaultApp": {
      const status = el("span", { className: "status", textContent: `✓ ${S().defaultAppIs}` });
      const button = el("button", { type: "button", className: "push", textContent: S().defaultAppMake });
      const refresh = async () => {
        const yes = await isDefaultApp();
        status.hidden = !yes;
        button.hidden = yes;
      };
      button.addEventListener("click", async () => {
        await makeDefaultApp().catch(() => {});
        await refresh();
      });
      refresh();
      return el("span", {}, status, button);
    }
    case "text": {
      const input = el("input", { type: "text", spellcheck: false });
      input.addEventListener("change", () => set(f.key, input.value.trim() || DEFAULTS[f.key]));
      syncers.push(() => {
        if (document.activeElement !== input) input.value = String(value());
      });
      return input;
    }
  }
}

function previewDoc(): HTMLElement {
  const s = S();
  const inline = (text: string) =>
    text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part) =>
      part.startsWith("**") ? el("strong", {}, part.slice(2, -2))
        : part.startsWith("`") ? el("code", {}, part.slice(1, -1))
        : part,
    );
  return el(
    "div",
    { className: "preview-doc" },
    el("h2", {}, s.previewHeading),
    el("p", {}, ...inline(s.previewText)),
    el(
      "ul",
      {},
      el("li", { className: "bullet" }, s.previewItem1),
      el("li", { className: "task done" }, s.previewItem2),
    ),
    el("pre", {}, el("code", {}, "const answer = 42; // => !=")),
  );
}

function markdownSample(): string {
  const s = settings;
  const em = s.mdEmphasis;
  const strong = s.mdStrong.repeat(2);
  const marker = s.mdListIndent === "tab" ? `${s.mdBullet}   ` : `${s.mdBullet} `;
  const fence = s.mdFence.repeat(3);
  const word = settings.lang === "ru" ? ["Заголовок", "курсив", "жирный", "пункт"] : ["Heading", "italic", "bold", "item"];
  return [
    `## ${word[0]}`,
    "",
    `${em}${word[1]}${em} ${strong}${word[2]}${strong}`,
    "",
    `${marker}${word[3]} 1`,
    `${marker}${word[3]} 2`,
    "",
    s.mdRule.repeat(3),
    "",
    `${fence}js`,
    "const a = 1;",
    fence,
  ].join("\n");
}

function build() {
  const s = S();
  builtLang = settings.lang;
  syncers = [];
  document.title = s.settingsTitle;
  resetEl.textContent = s.resetAll;

  tabsEl.replaceChildren(
    ...SECTIONS.map((sec) => {
      const b = el("button", { type: "button", textContent: s[sec.label], className: sec.id === active ? "on" : "" });
      b.addEventListener("click", () => {
        active = sec.id;
        build();
      });
      return b;
    }),
  );

  const section = SECTIONS.find((x) => x.id === active)!;
  const form = el("div", { className: "fields" });
  if (section.hint) form.append(el("p", { className: "section-hint", textContent: s[section.hint] }));
  for (const f of section.fields) {
    const row = el("div", { className: `row row-${f.type}` });
    row.append(el("span", { className: "label", textContent: s[f.label ?? (f.key as keyof Strings)] }));
    const cell = el("div", { className: "cell" }, control(f));
    if (f.hint) cell.append(el("small", { textContent: s[f.hint] }));
    row.append(cell);
    if (f.when) {
      const when = f.when;
      syncers.push(() => row.classList.toggle("disabled", !when(settings)));
    }
    form.append(row);
  }

  paneEl.replaceChildren(form);
  if (section.preview === "doc") {
    paneEl.append(el("div", { className: "preview" }, el("span", { className: "preview-label", textContent: s.preview }), previewDoc()));
  } else if (section.preview === "markdown") {
    const pre = el("pre", { className: "md-sample" });
    syncers.push(() => (pre.textContent = markdownSample()));
    paneEl.append(el("div", { className: "preview" }, el("span", { className: "preview-label", textContent: s.mdExample }), pre));
  }
  syncers.forEach((fn) => fn());
}

resetEl.addEventListener("click", async () => {
  const s = S();
  if (await ask(s.resetConfirm, { kind: "warning", okLabel: s.reset, cancelLabel: s.cancel })) {
    update({ ...DEFAULTS });
  }
});

await onSettingsChanged((next) => {
  settings = next;
  applySettings(next);
  if (next.lang !== builtLang) build();
  else syncers.forEach((fn) => fn());
});
watchSystemTheme(() => settings);

applySettings(settings);
build();

// Installed fonts load in the background; rebuild the pickers once they arrive.
fonts = await listFonts();
build();
