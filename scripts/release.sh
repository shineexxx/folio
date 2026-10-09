#!/usr/bin/env bash
# Build, sign, notarize and publish a Folio release to GitHub with auto-update metadata.
#
#   APPLE_API_KEY=… APPLE_API_ISSUER=… scripts/release.sh [notes.md]
#
# Needs: Developer ID certificate in the keychain, App Store Connect API key
# (~/.appstoreconnect/private_keys/AuthKey_<id>.p8), updater key in ~/.tauri, gh CLI.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO=shineexxx/folio
VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
TAG="v$VERSION"
NOTES=${1:-}

: "${APPLE_API_KEY:?set APPLE_API_KEY (App Store Connect key id)}"
: "${APPLE_API_ISSUER:?set APPLE_API_ISSUER (App Store Connect issuer id)}"
export APPLE_API_KEY APPLE_API_ISSUER
export APPLE_API_KEY_PATH=${APPLE_API_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_$APPLE_API_KEY.p8}
export TAURI_SIGNING_PRIVATE_KEY=${TAURI_SIGNING_PRIVATE_KEY:-$(cat "$HOME/.tauri/folio-updater.key")}
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-$(cat "$HOME/.tauri/folio-updater.password")}

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "Release $TAG already exists. Bump the version in src-tauri/tauri.conf.json first." >&2
  exit 1
fi

echo "==> Building Folio $VERSION (signs, notarizes and staples the app)"
npx tauri build --bundles app,dmg

BUNDLE=src-tauri/target/release/bundle
DMG="$BUNDLE/dmg/Folio_${VERSION}_aarch64.dmg"
ARCHIVE="$BUNDLE/macos/Folio_${VERSION}_aarch64.app.tar.gz"
mv "$BUNDLE/macos/Folio.app.tar.gz" "$ARCHIVE"
mv "$BUNDLE/macos/Folio.app.tar.gz.sig" "$ARCHIVE.sig"

echo "==> Notarizing the DMG"
xcrun notarytool submit "$DMG" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" \
  --issuer "$APPLE_API_ISSUER" --wait
xcrun stapler staple "$DMG"
spctl -a -t open --context context:primary-signature "$DMG"

echo "==> Writing latest.json"
NOTES_TEXT=""
[ -n "$NOTES" ] && NOTES_TEXT=$(cat "$NOTES")
VERSION="$VERSION" REPO="$REPO" ARCHIVE="$ARCHIVE" NOTES_TEXT="$NOTES_TEXT" node -e '
  const fs = require("fs");
  const { VERSION, REPO, ARCHIVE, NOTES_TEXT } = process.env;
  const name = require("path").basename(ARCHIVE);
  fs.writeFileSync(process.argv[1], JSON.stringify({
    version: VERSION,
    notes: NOTES_TEXT,
    pub_date: new Date().toISOString(),
    platforms: {
      "darwin-aarch64": {
        signature: fs.readFileSync(ARCHIVE + ".sig", "utf8").trim(),
        url: `https://github.com/${REPO}/releases/download/v${VERSION}/${name}`,
      },
    },
  }, null, 2));
' "$BUNDLE/latest.json"

echo "==> Publishing $TAG"
NOTES_ARGS=(--generate-notes)
[ -n "$NOTES" ] && NOTES_ARGS=(--notes-file "$NOTES")
gh release create "$TAG" "$DMG" "$ARCHIVE" "$BUNDLE/latest.json" \
  --repo "$REPO" --title "Folio $VERSION" "${NOTES_ARGS[@]}"
