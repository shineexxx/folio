<p align="center">
  <img src="icon/folio-1024.png" width="128" height="128" alt="Folio icon">
</p>

<h1 align="center">Folio</h1>

<p align="center">
  A lightweight Markdown editor for macOS and Windows where you edit text right in its rendered form.<br>
  <a href="https://github.com/shineexxx/folio/releases/latest"><b>Download</b></a> ·
  <a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <img src="docs/screenshot.png" width="760" alt="Folio window">
</p>

## Why

Typora is paid. Obsidian and Notion bring vaults, plugins, sync and accounts.
Folio does one thing: open a `.md` file, let you edit it as formatted text, and keep the file clean Markdown.

- **~6 MB app**, starts instantly (Tauri + the system WebView, no Electron).
- **WYSIWYG editing**: headings, lists, to-dos, quotes, code with highlighting, tables, links, images.
- **`/` block menu**, as in Notion. Type to filter, Enter to insert.
- **Autosave**: no "Save changes?" dialogs.
- **Faithful files**: opening a file never rewrites it; YAML frontmatter is kept verbatim.
- **Images**: paste or drop an image and it is saved to `./assets` next to the document.
- **One window per file**. Double-click `.md` in Finder or Explorer to open it.
- **Detailed customization**: themes and palettes, any installed font for text, headings and code, sizes and spacing, list bullets, Markdown output style.
- **English and Russian** interface.
- **Auto-update** from GitHub Releases: Folio checks on launch, or via *Folio → Check for Updates…* (Windows: *Help → Check for Updates…*).

## Install

**macOS** (11 or later, Apple Silicon)

1. Download `Folio_<version>_aarch64.dmg` from [Releases](https://github.com/shineexxx/folio/releases/latest).
2. Open it and drag **Folio** to **Applications**.
3. On first launch Folio offers to become your default Markdown editor. You can also change this later in **Settings → General**.

**Windows** (10 or 11, x64)

1. Download `Folio_<version>_x64-setup.exe` from [Releases](https://github.com/shineexxx/folio/releases/latest) and run it. No administrator rights needed.
2. The installer isn't code-signed yet, so SmartScreen may warn: click **More info → Run anyway**.
3. To open `.md` files in Folio by default, use **Settings → General → Choose Folio in Windows Settings**.

## Shortcuts

| Shortcut | Action |
|---|---|
| `/` | Block menu (headings, lists, code, table, image…) |
| `Cmd+N` / `Cmd+O` | New / open document |
| `Cmd+S` | Save (for new documents: choose where) |
| `Cmd+Shift+S` | Save as |
| `Cmd+/` | Toggle raw Markdown source |
| `Cmd+,` | Settings |
| `Cmd+click` a link | Open it (or a plain click, see Settings) |

On Windows use `Ctrl` instead of `Cmd`.

Markdown shortcuts work while typing: `# `, `- `, `1. `, `[ ] `, `> `, ` ``` `, `---`.

## Settings

| Tab | Options |
|---|---|
| General | language, autosave and its delay, images folder, how links open, default editor |
| Appearance | light / dark / system theme, 7 palettes, accent color, text width, margins, font smoothing |
| Fonts | text, heading and code font (built-in or any installed), size, weight, line height, letter spacing, paragraph spacing, heading size and weight, code size, ligatures |
| Editor | spell check, empty-document hint, `/` menu, block handle, bullet style, round or square to-dos, strike done tasks, code line numbers and wrapping |
| Markdown | how files are written: `-`/`*`/`+` bullets, `*` or `_` emphasis, `**` or `__` bold, rule, code fence, list indent |

Settings are stored in `~/Library/Application Support/com.arseny.folio/settings.json`.

## Build from source

Requirements: Node.js 20+, Rust, Xcode Command Line Tools.

```bash
npm install
npx tauri dev -- -- /path/to/file.md   # run in dev mode with a file
npx tauri build --bundles app,dmg      # build Folio.app and the DMG
npm run install-app                    # build and copy to /Applications
```

Signing uses the identity in `src-tauri/tauri.conf.json` → `bundle.macOS.signingIdentity`; change or remove it to build with your own certificate.

Dev pages without Tauri (after `npm run dev`):

- `http://localhost:1420/tests/playground.html`: the editor, `?en` for English, `?prefs={...}` for any settings.
- `http://localhost:1420/tests/roundtrip.html`: shows how the editor re-serializes `tests/sample.md` (`?edge` for edge cases).

### Release (signed and notarized)

Bump the version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `package.json`, then:

```bash
APPLE_API_KEY=<key id> APPLE_API_ISSUER=<issuer id> scripts/release.sh notes.md
```

The script builds and signs the app, notarizes the app and the DMG, signs the update archive with the updater key from `~/.tauri/folio-updater.key`, writes `latest.json` and publishes everything to GitHub Releases. Installed copies pick the update up from `latest.json`.

Publishing the release triggers the **Windows** GitHub Actions workflow: it builds the installer, attaches it to the release and adds Windows to `latest.json`. It needs two repository secrets with the updater key: `TAURI_SIGNING_PRIVATE_KEY` (contents of `~/.tauri/folio-updater.key`) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

## Project layout

| Path | What |
|---|---|
| `src-tauri/src/lib.rs` | windows (one per file), opening files from Finder, atomic writes |
| `src-tauri/src/menu.rs` | native menu in English and Russian |
| `src-tauri/src/settings.rs` | settings storage and broadcast to all windows, installed fonts list |
| `src-tauri/src/default_app.rs` | making Folio the default Markdown app (Launch Services) |
| `src-tauri/src/updater.rs` | auto-update from GitHub Releases |
| `scripts/release.sh` | build, notarize and publish a release |
| `.github/workflows/windows.yml` | Windows installer build, attached to each release |
| `src/editor.ts` | Milkdown Crepe setup, `/` menu, Markdown output style, image fix |
| `src/main.ts` | document window: loading, autosave, frontmatter, source mode, images |
| `src/settings.ts`, `src/palettes.ts` | settings defaults and applying them as CSS variables |
| `src/settings-page.ts` | Settings window, generated from the `SECTIONS` description |
| `src/i18n.ts` | interface strings (en/ru) |
| `icon/`, `dmg/` | icon and DMG background sources |

## Known limitations

After an edit the whole file is re-serialized, so a few things may change: table columns get aligned, a hard line break written as two trailing spaces becomes `\`, and reference-style links `[text][id]` become inline links. Content and rendering stay the same.

## License

[MIT](LICENSE)
