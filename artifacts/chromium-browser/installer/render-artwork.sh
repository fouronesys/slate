#!/bin/sh
# Deterministically render Slate Privacy's installer artwork and preview.
# Requires ImageMagick (`magick` or the legacy `convert` command); no packages
# or network resources are used.
set -eu

HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT=$(CDPATH= cd -- "$HERE/.." && pwd)
SOURCE_ICON="$PROJECT/src/assets/icon.png"
BACKGROUND_SVG="$HERE/background.svg"
BACKGROUND_PNG="$HERE/background.png"
RETINA_PNG="$HERE/background@2x.png"
PREVIEW_DIR="$PROJECT/../../generated-artifacts"
PREVIEW_PNG="$PREVIEW_DIR/slate-dmg-preview.png"

if command -v magick >/dev/null 2>&1; then
  IM=magick
elif command -v convert >/dev/null 2>&1; then
  IM=convert
else
  echo "ImageMagick is required (install 'magick' or 'convert')." >&2
  exit 1
fi

test -f "$BACKGROUND_SVG" || { echo "Missing $BACKGROUND_SVG" >&2; exit 1; }
test -f "$SOURCE_ICON" || { echo "Missing existing Slate icon: $SOURCE_ICON" >&2; exit 1; }
mkdir -p "$PREVIEW_DIR"
TMP=$(mktemp -d "$HERE/.render-tmp-XXXXXX")
trap 'rm -rf "$TMP"' EXIT HUP INT TERM

# dmg-builder derives the Finder window from the background's pixel dimensions,
# not its DPI. Ship a 1x base and a separate @2x partner so it builds a HiDPI TIFF.
"$IM" -background none "$BACKGROUND_SVG" -resize '1440x960!' \
  -units PixelsPerInch -density 144 "$RETINA_PNG"
"$IM" "$RETINA_PNG" -resize '720x480!' \
  -units PixelsPerInch -density 72 "$BACKGROUND_PNG"

cat > "$TMP/applications-folder.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <defs>
    <linearGradient id="folder" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#dce7d4"/><stop offset="1" stop-color="#a9bc9e"/>
    </linearGradient>
    <linearGradient id="front" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c8d8bd"/><stop offset="1" stop-color="#9db391"/>
    </linearGradient>
  </defs>
  <rect x="24" y="39" width="144" height="112" rx="23" fill="#687a61" opacity=".13"/>
  <path d="M37 48h44l12 13h62a13 13 0 0 1 13 13v58a13 13 0 0 1-13 13H37a13 13 0 0 1-13-13V61a13 13 0 0 1 13-13z" fill="url(#folder)" stroke="#82967a" stroke-width="2"/>
  <path d="M24 83a13 13 0 0 1 13-13h118a13 13 0 0 1 13 13v49a13 13 0 0 1-13 13H37a13 13 0 0 1-13-13z" fill="url(#front)" stroke="#82967a" stroke-width="2"/>
  <path d="M36 88h120" stroke="#e9efe4" stroke-opacity=".8" stroke-width="2"/>
</svg>
SVG

cat > "$TMP/preview-overlay.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="960" viewBox="0 0 1440 960">
  <defs>
    <style>
      @font-face { font-family: "Slate DM Sans"; src: url("../src/assets/fonts/dm-sans.ttf") format("truetype"); }
      @font-face { font-family: "Slate IBM Plex Mono"; src: url("../src/assets/fonts/ibm-plex-mono.ttf") format("truetype"); }
      .sans { font-family: "Slate DM Sans", sans-serif; }
      .mono { font-family: "Slate IBM Plex Mono", monospace; }
    </style>
  </defs>
  <g class="sans" text-anchor="middle" font-size="28" fill="#454a42">
    <text x="396" y="681">Slate Privacy</text>
    <text x="1044" y="681">Aplicaciones</text>
  </g>
  <g transform="translate(100 37)">
    <rect width="273" height="38" rx="19" fill="#e4e8de" stroke="#d1d8ca"/>
    <circle cx="20" cy="19" r="4" fill="#73856b"/>
    <text x="35" y="23" class="mono" font-size="12" letter-spacing="1.15" fill="#576252">VISTA PREVIA · NO ES UN DMG</text>
  </g>
</svg>
SVG

"$IM" -background none "$TMP/applications-folder.svg" "$TMP/applications-folder.png"
"$IM" -background none "$TMP/preview-overlay.svg" "$TMP/preview-overlay.png"

# Preview-only: actual Slate icon, illustrative Applications folder and labels.
# Their centers match the requested Finder placements, in points: (198,270),
# (522,270), with 96 pt icons rendered at 2x. None are painted into background.
"$IM" "$RETINA_PNG" \
  \( "$SOURCE_ICON" -resize '192x192!' \) -geometry '+300+444' -composite \
  \( "$TMP/applications-folder.png" \) -geometry '+948+444' -composite \
  \( "$TMP/preview-overlay.png" \) -geometry '+0+0' -composite \
  -units PixelsPerInch -density 144 "$PREVIEW_PNG"

echo "Rendered $BACKGROUND_PNG (720x480 px, 72 dpi) and $RETINA_PNG (1440x960 px, 144 dpi)"
echo "Rendered visual-only preview $PREVIEW_PNG (1440x960 px, 144 dpi)"
