import type { Crepe } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/kit/utils";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ask, message, save } from "@tauri-apps/plugin-dialog";

import "@milkdown/crepe/theme/common/style.css";
import "./styles.css";
import { buildEditor, splitFile } from "./editor";
import {
  EDITOR_KEYS,
  applySettings,
  getSettings,
  isDefaultApp,
  makeDefaultApp,
  onSettingsChanged,
  saveSettings,
  t,
  watchSystemTheme,
  type Settings,
} from "./settings";

declare global {
  interface Window {
    __MDR_PATH__?: string | null;
  }
}

const win = getCurrentWebviewWindow();
const editorEl = document.getElementById("editor")!;
const sourceEl = document.getElementById("source") as HTMLTextAreaElement;

let filePath: string | null = window.__MDR_PATH__ ?? null;
let saved = ""; // file text as last written (in the editor's normalized form)
let current = ""; // file text as it is now
let frontmatter = ""; // YAML header, kept out of the editor and written back verbatim
let mtime = 0;
let timer: number | undefined;
let saving: Promise<void> = Promise.resolve();

let settings: Settings = await getSettings();
let T = t(settings);

// ---------- paths ----------

const dirOf = (p: string) => p.slice(0, p.lastIndexOf("/"));
const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);

function resolvePath(base: string, rel: string): string {
  const parts = (rel.startsWith("/") ? rel : `${base}/${rel}`).split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part && part !== ".") out.push(part);
  }
  return "/" + out.join("/");
}

const isExternal = (url: string) => /^[a-z][a-z0-9+.-]*:/i.test(url);

/** Map a markdown image src to something the webview can load. */
function imageSrc(url: string): string {
  if (!url || isExternal(url) || !filePath && !url.startsWith("/")) return url;
  const local = decodeURI(url.split(/[?#]/)[0]);
  return convertFileSrc(filePath ? resolvePath(dirOf(filePath), local) : local);
}

// ---------- saving ----------

/** Window title: file name, plus a marker while there are unsaved edits. */
function updateTitle() {
  const name = filePath ? baseName(filePath) : T.untitled;
  const unsaved = filePath ? current !== saved && !settings.autosave : current.trim() !== "";
  win.setTitle(unsaved ? `${name} — ${T.unsavedSuffix}` : name);
}

function scheduleSave() {
  clearTimeout(timer);
  if (filePath && settings.autosave) timer = window.setTimeout(flush, settings.autosaveDelay);
  updateTitle();
}

/** Write pending changes to disk right now (no-op for untitled docs). */
function flush(): Promise<void> {
  clearTimeout(timer);
  syncCurrent();
  saving = saving.then(async () => {
    if (!filePath || current === saved) return;
    const text = current;
    try {
      mtime = await invoke<number>("write_text", { path: filePath, contents: text });
      saved = text;
      updateTitle();
    } catch (e) {
      await message(`${T.saveError}\n${e}`, { kind: "error" });
    }
  });
  return saving;
}

async function saveAs() {
  const chosen = await save({
    defaultPath: filePath ?? `${T.untitled}.md`,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  if (!chosen) return false;
  filePath = chosen;
  saved = "\u0000"; // force a write
  await invoke("set_window_path", { path: chosen });
  updateTitle();
  await flush();
  return true;
}

// ---------- editor ----------

/** Copy an image into ./assets next to the document; returns the relative src. */
async function saveImage(file: File): Promise<string> {
  if (!filePath && !(await saveAs())) return "";
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const stem = file.name && file.name !== "image.png"
    ? file.name.replace(/\.[^.]+$/, "")
    : `image-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 17)}`;
  const dir = settings.assetsDir.replace(/^\/+|\/+$/g, "") || "assets";
  const rel = `${dir}/${stem}.${ext}`;
  await invoke("write_bytes", {
    path: resolvePath(dirOf(filePath!), rel),
    data: Array.from(new Uint8Array(await file.arrayBuffer())),
  });
  return encodeURI(rel);
}

/** Bring `current` up to date with whatever the user is looking at. */
function syncCurrent() {
  current = sourceEl.hidden ? frontmatter + crepe.getMarkdown() : sourceEl.value;
}

/** Show a whole file in the editor (without counting it as a change). */
function showFile(text: string) {
  const [fm, body] = splitFile(text);
  frontmatter = fm;
  crepe.editor.action(replaceAll(body, true));
  syncCurrent();
}

let initial = "";
if (filePath) {
  try {
    initial = await invoke<string>("read_text", { path: filePath });
    mtime = await invoke<number>("file_mtime", { path: filePath });
  } catch (e) {
    await message(`${T.openError}\n${e}`, { kind: "error" });
    filePath = null;
  }
}

let crepe: Crepe;

/** (Re)create the editor with the current UI language. */
async function mountEditor(body: string) {
  const next = buildEditor({ root: editorEl, markdown: body, t: T, prefs: settings, imageSrc, saveImage });
  next.on((listener) =>
    listener.markdownUpdated(() => {
      syncCurrent();
      if (current !== saved) scheduleSave();
    }),
  );
  await next.create();
  crepe = next;
}

function applyAll(s: Settings) {
  applySettings(s);
  editorEl.spellcheck = sourceEl.spellcheck = s.spellcheck;
}

applyAll(settings);
watchSystemTheme(() => settings);
let body: string;
[frontmatter, body] = splitFile(initial);
await mountEditor(body);
// Baseline is the editor's own serialization, so merely opening a file never rewrites it.
syncCurrent();
saved = current;
updateTitle();
if (!initial) (editorEl.querySelector(".ProseMirror") as HTMLElement | null)?.focus();

// ---------- source mode (Cmd+/) ----------

function toggleSource() {
  const showSource = sourceEl.hidden;
  if (showSource) {
    syncCurrent();
    sourceEl.value = current;
    editorEl.hidden = true;
    sourceEl.hidden = false;
    sourceEl.focus();
  } else {
    const text = sourceEl.value;
    sourceEl.hidden = true;
    editorEl.hidden = false;
    showFile(text);
    if (current !== saved) scheduleSave();
  }
}

sourceEl.addEventListener("input", () => {
  syncCurrent();
  scheduleSave();
});

// ---------- links: Cmd+click opens ----------

editorEl.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest("a");
  if (!a || (settings.linkOpen === "cmd" && !(e.metaKey || e.ctrlKey))) return;
  e.preventDefault();
  const href = a.getAttribute("href") ?? "";
  if (isExternal(href)) invoke("open_external", { target: href, reveal: false });
  else if (filePath && href && !href.startsWith("#"))
    invoke("open_external", { target: resolvePath(dirOf(filePath), decodeURI(href.split("#")[0])), reveal: false });
});

// ---------- settings ----------

await onSettingsChanged(async (next) => {
  const rebuild = EDITOR_KEYS.some((k) => next[k] !== settings[k]);
  settings = next;
  T = t(next);
  applyAll(next);
  updateTitle();
  if (!rebuild) return;
  // Labels, list icons and Markdown style are fixed at creation, so rebuild the editor.
  syncCurrent();
  const [fm, md] = splitFile(current);
  frontmatter = fm;
  await crepe.destroy();
  editorEl.replaceChildren();
  await mountEditor(md);
  updateTitle();
});

// ---------- window lifecycle ----------

await win.listen<string>("menu", async ({ payload }) => {
  if (payload === "save") filePath ? await flush() : await saveAs();
  else if (payload === "save-as") await saveAs();
  else if (payload === "source") toggleSource();
  else if (payload === "reveal" && filePath) invoke("open_external", { target: filePath, reveal: true });
});

// Pick up edits made by other programs (git pull, another editor) when we come back.
window.addEventListener("focus", async () => {
  if (!filePath || current !== saved) return;
  const m = await invoke<number>("file_mtime", { path: filePath });
  if (m === mtime || m === 0) return;
  mtime = m;
  const text = await invoke<string>("read_text", { path: filePath });
  if (text === saved) return;
  if (sourceEl.hidden) showFile(text);
  else sourceEl.value = current = text;
  saved = current;
  updateTitle();
});

window.addEventListener("blur", () => void flush());

await win.onCloseRequested(async (event) => {
  await flush();
  if (filePath || current.trim() === "") return;

  const answer = await message(T.saveOnClose, {
    kind: "warning",
    buttons: { yes: T.saveButton, no: T.dontSave, cancel: T.cancel },
  });
  if (answer === T.saveButton && (await saveAs())) return;
  if (answer === T.dontSave) return;
  event.preventDefault();
  await invoke("cancel_quit");
});

// ---------- first launch: offer to become the default Markdown editor ----------

if (!settings.askedDefault && win.label === "doc-0") {
  saveSettings({ ...settings, askedDefault: true });
  if (!(await isDefaultApp())) {
    const yes = await ask(`${T.defaultAppAsk}\n\n${T.defaultAppAskDetail}`, {
      kind: "info",
      okLabel: T.defaultAppYes,
      cancelLabel: T.defaultAppLater,
    });
    if (yes) await makeDefaultApp().catch((e) => message(`${T.defaultAppError}\n${e}`, { kind: "error" }));
  }
}
