// Dev page: the editor without Tauri.
// /tests/playground.html?en  — English UI
// /tests/playground.html?prefs={"bulletStyle":"dash"}  — any settings
import "@milkdown/crepe/theme/common/style.css";
import "../src/styles.css";
import { buildEditor, editLinkAt } from "../src/editor";
import { setupLinkCard } from "../src/link-card";
import { strings } from "../src/i18n";
import { DEFAULTS } from "../src/settings";
import sample from "./sample.md?raw";

const params = new URLSearchParams(location.search);
const t = params.has("en") ? strings.en : strings.ru;
const prefs = { ...DEFAULTS, ...JSON.parse(params.get("prefs") ?? "{}") };
document.documentElement.classList.toggle("strike-done", prefs.strikeDone);
const root = document.getElementById("editor")!;
const crepe = buildEditor({ root, markdown: sample, t, prefs });
await crepe.create();
setupLinkCard({
  root,
  strings: () => t,
  fetchPreviews: () => true,
  open: (href) => console.log("open", href),
  edit: (a) => editLinkAt(crepe, a),
});
