# Halloween theme

## Goal

During October, each player can pick a Halloween theme next to Light, Dark and System. It turns their own screen spooky: a dark base, a Halloween table, Jack-o'-Lantern card backs, and three Halloween items to throw. It's a personal choice, like Light and Dark. Nobody else's screen changes, except that they see the Halloween items land when someone throws one at them. That's the point: "how did you throw a bat?" gets people talking and gets them to switch it on.

It should feel like the same poker room dressed up for October, not a different app.

## Non-goals

- No room-wide Halloween mode. The host can't turn it on for everyone, and Jack-o'-Lantern is never offered in the host's card back picker.
- No restyle of buttons, badges, headers, modals or brand green. Those use the existing dark look.
- No new splat effects or animation profiles.
- No other seasonal themes. Don't build a seasonal framework for one theme.

## When it's available

- The Halloween button shows in the theme selector from October 1 to October 31, in the browser's local time. The date is checked once when the app loads.
- Outside October a saved Halloween pick acts exactly like System, and the button is hidden. The System button shows as selected. The pick stays saved, so it comes back on its own next October.

## Theme

- `ThemeService` gains a fourth preference, `halloween`, saved to the same local storage key.
- Halloween resolves to dark, so the `dark` class and the whole existing dark stylesheet apply unchanged. The service also toggles a `halloween` class on `<html>`, next to `dark`.
- The service exposes whether Halloween is currently in effect (picked and in October) as a signal. The game room and throw palette read that one signal; nothing else checks dates.
- Theme selector: a fourth button with a pumpkin icon and the label "Halloween", built the same way as the other three (inline SVG outline icon, same sizes and states). It's hidden outside October. The selector appears on many pages; check it still fits in the account dropdown and on mobile, where labels are already hidden.

## Table

In `styles.css`, a `.halloween .poker-table` rule, next to the existing `.dark` overrides. Same shape, size, shadow and inner rim as today. Only the felt changes: near-black purple instead of green, with an orange glow where the highlight sits today. The table's green border (`border-poker-green-800` in the game room template) becomes a dark purple or orange-brown to match.

## Card backs

- A new `jack-o-lantern` back, drawn like the seven on main: one `.card-back-jack-o-lantern` class in `styles.css`, pure CSS, no image file. It keeps the printed playing card frame the classic backs use (white border, inner border, corner dots) in orange on black, with a jack-o'-lantern face in the center oval. It must read at all three table sizes (compact 36×54, normal 48×72, large 56×84).
- It is not added to `CARD_BACKS`, the server's allowed list, or the picker. It's a client-only back.
- In the game room, the face-down card shows `jack-o-lantern` when Halloween is in effect, otherwise the room's back. Widen `CardBackComponent`'s input type so it accepts the extra id without loosening `CardBack` itself.
- `data-card-back` on table cards shows the back actually drawn, so tests can check it.

## Voting cards

Your selected card glows orange instead of green when Halloween is in effect, and the hover border turns orange. Today `getSelectedCardClasses` returns hard-coded Tailwind green classes, which the stylesheet can't cleanly override. Move the selected and hover looks into named classes in `styles.css` (as `deck-option-selected` already does), then add `.halloween` versions. Disabled and unselected cards keep the dark look.

Revealed card faces, the empty "not voted" slot and the results row stay as they are.

## Throwing

- Three new throw items: 🎃 pumpkin, 🦇 bat, 🕷️ spider.
- Frontend (`session.models.ts`): add them to the throw options and metadata. Pumpkin uses the `rock` profile (heavy, bounces off). Bat and spider use `default`. All three draw as plain emoji, like the tomato. No splats.
- The palette shows them, after the existing eight, only when Halloween is in effect. The palette is one row that doesn't wrap, so eleven items make it about 500px wide. Check it for players seated near the table's edges and on narrow screens.
- Backend (`GameDtos.cs`, `EmojiThrowOptions.AllowedEmojis`): add all three, with no date or theme check. The server can't see anyone's theme, and a throw shouldn't fail because the calendar changed mid-session. A determined player could throw them without the theme; that's fine.
- Receivers see them land whatever theme they're on. The receiving side already draws any allowed emoji.
- Check how the existing emoji are written (with or without the variation selector) and match it exactly on both sides, so 🕷️ isn't rejected over an invisible character.

## Tests

- Frontend (Vitest), `ThemeService`: Halloween in October resolves dark and sets the `halloween` class; outside October a saved Halloween pick behaves like System and the stored value is kept. Inject or fake the date; don't depend on the real clock.
- Backend (xUnit): throwing each of the three new items is accepted. Follow the existing `ThrowEmoji` tests.
- No new e2e test, since it would depend on the date. The existing e2e test that checks light and dark layouts at several widths will see a fourth theme button when it runs in October. Make sure it passes either way.

## Left to the builder

- Exact colors, the jack-o'-lantern drawing and the pumpkin icon path. Tune them in the running app in October, against the dark theme.
- How the date is injected for tests.
