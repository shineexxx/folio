// Dev check: open /tests/roundtrip.html in `npm run dev` to see how the editor
// re-serializes tests/sample.md. Lines prefixed with - / + differ.
import { editorViewCtx } from "@milkdown/kit/core";
import { buildEditor, splitFile } from "../src/editor";
import sampleMain from "./sample.md?raw";
import sampleEdge from "./edge.md?raw";

const sample = location.search.includes("edge") ? sampleEdge : sampleMain;

const [frontmatter, body] = splitFile(sample);
const crepe = buildEditor({ root: document.getElementById("editor")!, markdown: body });
await crepe.create();
const out = frontmatter + crepe.getMarkdown();

const a = sample.trimEnd().split("\n");
const b = out.trimEnd().split("\n");
const lines: string[] = [];
const max = Math.max(a.length, b.length);
let diffs = 0;
for (let i = 0; i < max; i++) {
  if (a[i] === b[i]) lines.push(`  ${a[i]}`);
  else {
    diffs++;
    if (a[i] !== undefined) lines.push(`- ${a[i]}`);
    if (b[i] !== undefined) lines.push(`+ ${b[i]}`);
  }
}
const nodes: string[] = [];
crepe.editor.action((ctx) =>
  ctx.get(editorViewCtx).state.doc.descendants((n) => {
    if (n.type.name.includes("image")) nodes.push(JSON.stringify(n.toJSON()));
  }),
);
document.getElementById("out")!.textContent =
  `${diffs} differing lines\n\n` + lines.join("\n") + "\n\nImage nodes:\n" + nodes.join("\n");
