# Estimagator brand guide

Estimagator is a friendly planning poker tool for agile teams.

**Tagline:** Bite-sized estimation for agile teams.

## Scout logo

The canonical artwork is `logo.svg`, supplied as `estimagator-04-scout.svg`: an alligator shaped like the letter E. Preserve its paths, colors, proportions, and clear space. Do not substitute an emoji, the previous card-biting alligator, or a generic crocodile. Avoid shadows and effects on the mark itself.

Use the shared Angular `BrandComponent` for application branding. Its compact, stacked, and hero sizes pair Scout with one consistent wordmark. The wordmark uses Poppins bold (system sans-serif fallback), with “Estima” in Outline Green and “gator” in Deep Green. In dark mode, the text uses pale green tones for contrast; the mascot retains its original colors.

## Colors

| Role | Color | Usage |
| --- | --- | --- |
| Scout Green | `#80B649` | Mascot fill, decorative accents |
| Deep Green | `#47772C` | Primary controls, links, wordmark accent |
| Outline Green | `#233D22` | Mascot outline, wordmark text |
| Pale Green | `#F4F8EF` | Subtle backgrounds and email panels |
| Hover Green | `#365B27` | Button hover/pressed treatments |

White button text sits on Deep Green or darker, not the bright mascot fill. Existing gold highlights, status colors, and user theme controls remain available. `poker-green` is the existing internal Tailwind token family; its values now follow the Scout palette.

## Assets

| File | Purpose |
| --- | --- |
| `logo.svg` | Canonical supplied Scout artwork, 272 × 256 viewBox |
| `logo-horizontal.svg` | Scout and wordmark for standalone light-background use |
| `logo-icon.svg`, `croc.svg` | Compatibility names containing the same Scout artwork |
| `favicon.svg` | Square, tighter framing for small browser icons |
| `favicon-32.png`, `favicon-48.png` | Raster browser icons |
| `../favicon.ico` | Legacy browser icon containing 16, 32, and 48 px versions |
| `apple-touch-icon.png` | 180 px icon on an opaque pale background |
| `logo-email.png` | 544 × 512 transparent PNG export of the supplied SVG |

The browser/tab title, application name, account emails, and sender default use **Estimagator**. Internal project names, database names, storage keys, and authentication identifiers are not display branding and must not be renamed as part of a visual update.

## Email

Verification and password-reset emails share the Scout header, wordmark, tagline, and Deep Green buttons. The backend embeds `Assets/logo-email.png` into its assembly and attaches it to HTML email as a CID-linked image. Emails retain a plain-text alternative, readable wordmark and logo alt text when images are unavailable. No hosted image URL or SVG-capable email client is required.

SMTP sender name/address overrides remain configurable. Administrators requesting verification or password reset use these same templates.

## Regeneration

From the repository root, run:

```sh
bash scripts/generate-brand-assets.sh
```

Requires Python 3, `rsvg-convert` (librsvg), and `magick` (ImageMagick). The script derives the variants from `logo.svg` and copies the identical email PNG to the backend. Commit the outputs together; normal app builds do not need these export tools. Inspect the app in light/dark mode and on mobile, and inspect both email templates after changing the artwork.

The app and browser-icon URLs use `?v=scout-1` to bypass the previous assets' long-lived cache. Bump that revision in `BrandComponent` and `index.html` when replacing these assets again. Deploy both the frontend assets and the backend assembly to update the app and emails together.
