#!/usr/bin/env bash
set -euo pipefail

# Run after replacing the canonical Scout SVG. Requires Python 3, librsvg and ImageMagick.
cd "$(dirname "$0")/.."
brand_dir=src/frontend/poker-points-app/public/brand
python3 - <<'PY'
from pathlib import Path
import xml.etree.ElementTree as ET

brand = Path('src/frontend/poker-points-app/public/brand')
source = (brand / 'logo.svg').read_text()
ET.fromstring(source)  # Fail before generating assets if the source is invalid.
for name in ['logo-icon.svg', 'croc.svg']:
    (brand / name).write_text(source)
(brand / 'favicon.svg').write_text(source.replace('viewBox="0 0 272 256"', 'viewBox="24 20 224 224"'))
art = source[source.index('<g '):source.rindex('</svg>')]
(brand / 'logo-horizontal.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 344 80" role="img" aria-labelledby="title">
<title id="title">Estimagator</title>
<svg width="80" height="80" viewBox="0 0 272 256">''' + art + '''</svg>
<text x="88" y="52" font-family="Poppins, Arial, sans-serif" font-size="36" font-weight="700" letter-spacing="-1.8" fill="#233D22">Estima<tspan fill="#47772C" font-style="italic" letter-spacing="1.8">gator</tspan></text>
</svg>
''')
PY
rsvg-convert -w 544 -h 512 "$brand_dir/logo.svg" -o "$brand_dir/logo-email.png"
cp "$brand_dir/logo-email.png" src/backend/PokerPoints/PokerPoints.Api/Assets/logo-email.png
rsvg-convert -w 180 -h 180 -b '#f4f8ef' "$brand_dir/favicon.svg" -o "$brand_dir/apple-touch-icon.png"
rsvg-convert -w 48 -h 48 "$brand_dir/favicon.svg" -o "$brand_dir/favicon-48.png"
magick "$brand_dir/favicon-48.png" -define icon:auto-resize=48,32,16 src/frontend/poker-points-app/public/favicon.ico
magick "$brand_dir/favicon-48.png" -resize 32x32 "$brand_dir/favicon-32.png"
