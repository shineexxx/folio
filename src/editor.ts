import { Crepe } from "@milkdown/crepe";
import { imageInlineComponent, inlineImageConfig } from "@milkdown/kit/component/image-inline";
import { commandsCtx, remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { clearTextInCurrentBlockCommand, insertImageCommand } from "@milkdown/kit/preset/commonmark";
import { uploadConfig, type Uploader } from "@milkdown/kit/plugin/upload";
import { $remark } from "@milkdown/kit/utils";
import { EditorView } from "@codemirror/view";

import { strings, type Strings } from "./i18n";
import { DEFAULTS } from "./settings";

const IMAGE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M5 21q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h14q.825 0 1.413.588T21 5v14q0 .825-.587 1.413T19 21zm0-2h14V5H5zm1-2h12l-3.75-5-3 4L9 13zm-1 2V5z"/></svg>`;

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${body}</svg>`;

const BULLETS = {
  disc: svg('<circle cx="12" cy="12" r="3" fill="currentColor"/>'),
  circle: svg('<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/>'),
  square: svg('<rect x="9.25" y="9.25" width="5.5" height="5.5" rx="1" fill="currentColor"/>'),
  dash: svg('<rect x="8" y="11.1" width="8" height="1.8" rx=".9" fill="currentColor"/>'),
  arrow: svg('<path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor"/>'),
};

const ROUND_UNCHECKED = svg('<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/>');
const ROUND_CHECKED = svg(
  '<circle cx="12" cy="12" r="9" fill="var(--accent)"/><path d="M8 12.3l2.6 2.6L16.2 9.3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
);

/** The subset of settings the editor is built with. */
export type EditorPrefs = Pick<
  typeof DEFAULTS,
  | "slashMenu" | "bulletStyle" | "checkboxStyle" | "codeWrap"
  | "mdBullet" | "mdEmphasis" | "mdStrong" | "mdRule" | "mdFence" | "mdListIndent"
>;

type MdNode = { type: string; title?: string | null; alt?: string | null; children?: MdNode[] };

/**
 * Milkdown 7.22 passes `title: null` for images without a title, which the
 * schema rejects, so the image silently disappears. Empty strings round-trip
 * to the same Markdown.
 */
const fixImageAttrs = $remark("fixImageAttrs", () => () => (tree: MdNode) => {
  const walk = (node: MdNode) => {
    if (node.type === "image") {
      node.title ??= "";
      node.alt ??= "";
    }
    node.children?.forEach(walk);
  };
  walk(tree);
});

export interface EditorOptions {
  root: HTMLElement;
  markdown: string;
  /** UI strings for placeholders and the slash menu. */
  t?: Strings;
  prefs?: EditorPrefs;
  /** Map an image src from the file to a URL the webview can load. */
  imageSrc?: (src: string) => string;
  /** Store a picked image file; returns the src to put in the document. */
  saveImage?: (file: File) => Promise<string>;
}

/**
 * Crepe with only what we need. Images use the standard inline `image` node
 * (Crepe's image-block rewrites alt text as a size ratio, which corrupts files).
 */
export function buildEditor({
  root,
  markdown,
  t = strings.ru,
  prefs = DEFAULTS,
  imageSrc,
  saveImage,
}: EditorOptions): Crepe {
  const round = prefs.checkboxStyle === "round";
  const crepe = new Crepe({
    root,
    defaultValue: markdown,
    features: {
      [Crepe.Feature.BlockEdit]: prefs.slashMenu,
      [Crepe.Feature.Toolbar]: false,
      [Crepe.Feature.Latex]: false,
      [Crepe.Feature.ImageBlock]: false,
    },
    featureConfigs: {
      [Crepe.Feature.Placeholder]: {
        text: prefs.slashMenu ? t.placeholder : t.placeholderPlain,
        mode: "doc",
      },
      [Crepe.Feature.ListItem]: {
        bulletIcon: BULLETS[prefs.bulletStyle],
        ...(round && { checkBoxCheckedIcon: ROUND_CHECKED, checkBoxUncheckedIcon: ROUND_UNCHECKED }),
      },
      [Crepe.Feature.CodeMirror]: {
        extensions: prefs.codeWrap ? [EditorView.lineWrapping] : [],
        searchPlaceholder: t.codeSearch,
        copyText: t.codeCopy,
        noResultText: t.codeNoResult,
      },
      // Notion-style "/" menu. Items are filtered by their (localized) label.
      [Crepe.Feature.BlockEdit]: {
        textGroup: {
          label: t.groupText,
          text: { label: t.text },
          h1: { label: t.h1 },
          h2: { label: t.h2 },
          h3: { label: t.h3 },
          h4: { label: t.h4 },
          h5: { label: t.h5 },
          h6: { label: t.h6 },
          quote: { label: t.quote },
          divider: { label: t.divider },
        },
        listGroup: {
          label: t.groupLists,
          bulletList: { label: t.bulletList },
          orderedList: { label: t.orderedList },
          taskList: { label: t.taskList },
        },
        advancedGroup: {
          label: t.groupInsert,
          codeBlock: { label: t.code },
          table: { label: t.table },
        },
        // Crepe only offers its image-block here; we use the plain inline image.
        buildMenu: (builder) => {
          builder.getGroup("advanced").addItem("image", {
            label: t.image,
            icon: IMAGE_ICON,
            onRun: (ctx) => {
              const commands = ctx.get(commandsCtx);
              commands.call(clearTextInCurrentBlockCommand.key);
              commands.call(insertImageCommand.key, {});
            },
          });
        },
      },
    },
  });

  const uploader: Uploader = async (files, schema) => {
    const nodes = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/") || !saveImage) continue;
      const src = await saveImage(file);
      const node = src && schema.nodes.image.createAndFill({ src, alt: "" });
      if (node) nodes.push(node);
    }
    return nodes;
  };

  crepe.editor
    .config((ctx) => {
      // Markdown style for saving (defaults match the most common style).
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        bullet: prefs.mdBullet,
        emphasis: prefs.mdEmphasis,
        strong: prefs.mdStrong,
        rule: prefs.mdRule,
        fence: prefs.mdFence,
        listItemIndent: prefs.mdListIndent,
      }));
      ctx.update(inlineImageConfig.key, (prev) => ({
        ...prev,
        imageIcon: "🖼",
        uploadButton: t.imagePick,
        confirmButton: "⏎",
        uploadPlaceholderText: t.imageLink,
        proxyDomURL: imageSrc,
        onUpload: saveImage ?? prev.onUpload,
      }));
      ctx.update(uploadConfig.key, (prev) => ({ ...prev, uploader }));
    })
    .use(fixImageAttrs)
    .use(imageInlineComponent);

  return crepe;
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)\s*/;

/** Split a file into its frontmatter and the Markdown body the editor shows. */
export function splitFile(text: string): [string, string] {
  const fm = text.match(FRONTMATTER)?.[0] ?? "";
  return [fm, text.slice(fm.length)];
}
