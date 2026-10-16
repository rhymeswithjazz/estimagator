# Card backs

## Goal

The organizer picks the design on the back of the cards. Everyone in the room sees the same back. The organizer can change it at any time during a session. Classic Red, today's back, stays the default.

A card back is decoration only. It never touches the deck's values, votes, the timer or the round.

## The seven backs

| Id | Label | Look |
| --- | --- | --- |
| `classic-red` | Classic Red | Today's red Bicycle-style back. Default. |
| `classic-blue` | Classic Blue | Same drawing as Classic Red, in `#1f4fa8`. |
| `midnight-neon` | Midnight Neon | Near-black with a cyan grid, pink border and a glowing cyan diamond. |
| `art-deco` | Art Deco | Black with a gold sunburst, gold frame and a gold-outlined diamond. |
| `retro-sunset` | Retro Sunset | Purple sky, striped synthwave sun, pink grid below. Gold border. |
| `scout-night` | Scout Night | Outline Green (`#233D22`) with a faint crosshatch, cream frame, Scout logo centered. |
| `scout-deco` | Scout Deco | The Art Deco sunburst with Scout centered in place of the diamond. |

The Scout backs draw `public/brand/logo.svg` unchanged, as the brand guide requires: no recoloring, shadows or effects on the mark. Use the same `?v=scout-1` cache revision as `BrandComponent`.

Reference CSS for every back is in the appendix. Tune it in the real app at all three table sizes (compact 36×54, normal 48×72, large 56×84).

## Where backs appear

Only on the table, on the card of a participant who has voted before the reveal (`game-room.component.html`, the `card-back` element). The voting hand, the results row, the empty "not voted" slot and revealed faces are unchanged.

## Backend

- `Session` gains `CardBack` (string, default `"classic-red"`). A migration adds the column with that default, so existing sessions get Classic Red.
- A single source of truth for allowed ids, for example a static `CardBacks` class with `Default` and `IsValid(string)`.
- `CreateSessionRequest` gains optional `CardBack`. A missing value uses the default. An unknown value returns 400.
- `SessionInfoResponse` gains `CardBack`, so the join/reconnect snapshot carries it.
- New hub method `SetCardBack(string cardBack)`:
  - Caller must be the organizer of an active session, matching `UpdateStory`'s check. Otherwise send `Error`.
  - Unknown id sends `Error` and changes nothing.
  - Saves the change and broadcasts `CardBackChanged` with the id to the session group.

## Frontend

- `session.models.ts`: `CardBack` union type and a `CARD_BACKS` list of `{ id, label }`, in the order of the table above. `CreateSessionRequest` and `SessionInfo` gain `cardBack`.
- `GameStateService`: a `cardBack` signal, set from the session snapshot and from `CardBackChanged`. An unknown id from the server falls back to `classic-red`.
- `SignalRService`: listen for `CardBackChanged`; expose `setCardBack(id)`.
- A small shared card-back picker component: a row of small cards, one per back, with the selected one highlighted and each labeled for screen readers. It takes the selected id and emits the chosen id.
- Home page create form: the picker, under the deck choice, sent with the create request.
- Settings panel: the picker, organizer only, calling `setCardBack`.
- Game room: the face-down card gets the class for the current back instead of the hardcoded red. Today `getCardClasses` adds `bg-[#c41e3a]` under the overlay; the back's class now owns its whole look.
- `styles.css`: one class per back, replacing the single `card-back` utility. Classic Red keeps today's look.
- Stable test ids: `card-back-option-<id>` on picker options, and `data-card-back="<id>"` on face-down table cards.

## Tests

- Backend (xUnit):
  - A created session defaults to `classic-red`; an unknown id on create is rejected.
  - `SetCardBack` by the organizer saves and broadcasts.
  - `SetCardBack` by anyone else is refused and changes nothing.
  - `SetCardBack` with an unknown id is refused and changes nothing.
- Frontend (Vitest): `GameStateService` updates `cardBack` from the snapshot and from `CardBackChanged`, and falls back on an unknown id.
- E2E (Playwright), one test: the organizer and a second player join; the second player votes; the organizer switches backs; the organizer's view of that face-down card shows the new back. Do the same check from the second player's view.

## Out of scope

- Restyling card faces, the voting hand or the table felt.
- Per-player card back preferences.
- Changing deck values mid-session.

## Appendix: reference CSS

From the approved mockups. `.back` fills the card (`position:absolute; inset:0; border-radius:inherit`). `--logo` stands in for the logo URL.

```css
/* classic-red, classic-blue: same structure, --c sets the color */
.bicycle{background:var(--c);border:2px solid #fff}
.bicycle::before{content:'';position:absolute;inset:3px;border:1px solid #fff9;border-radius:4px;
background:radial-gradient(ellipse 8px 8px at 6px 6px,#fff6 40%,transparent 50%),radial-gradient(ellipse 8px 8px at calc(100% - 6px) 6px,#fff6 40%,transparent 50%),radial-gradient(ellipse 8px 8px at 6px calc(100% - 6px),#fff6 40%,transparent 50%),radial-gradient(ellipse 8px 8px at calc(100% - 6px) calc(100% - 6px),#fff6 40%,transparent 50%)}
.bicycle::after{content:'';position:absolute;inset:8px;border-radius:3px;border:1px solid #fff4;
background:radial-gradient(ellipse 70% 45% at 50% 50%,#ffffff26 80%,transparent 81%),radial-gradient(ellipse 55% 35% at 50% 50%,transparent 75%,#fff3 76%,#fff3 85%,transparent 86%),repeating-linear-gradient(45deg,transparent 0 3px,#ffffff14 3px 4px),repeating-linear-gradient(-45deg,transparent 0 3px,#ffffff14 3px 4px)}
.red{--c:#c41e3a}.blue{--c:#1f4fa8}

/* midnight-neon */
.neon{background:#0d0b1f;border:2px solid #ff3ea5;box-shadow:inset 0 0 8px #ff3ea5aa}
.neon::before{content:'';position:absolute;inset:4px;border-radius:4px;
background:repeating-linear-gradient(0deg,transparent 0 7px,#29e7ff33 7px 8px),repeating-linear-gradient(90deg,transparent 0 7px,#29e7ff33 7px 8px)}
.neon::after{content:'';position:absolute;left:50%;top:50%;width:40%;aspect-ratio:1;transform:translate(-50%,-50%) rotate(45deg);border:2px solid #29e7ff;box-shadow:0 0 6px #29e7ff,inset 0 0 6px #29e7ff}

/* art-deco */
.deco{background:#111;border:2px solid #d4af37}
.deco::before{content:'';position:absolute;inset:4px;border:1px solid #d4af3799;border-radius:3px;
background:repeating-conic-gradient(from 0deg at 50% 50%,#d4af3733 0 10deg,transparent 10deg 20deg)}
.deco::after{content:'';position:absolute;left:50%;top:50%;width:50%;height:34%;transform:translate(-50%,-50%) rotate(45deg);border:2px solid #d4af37;background:#111}

/* retro-sunset */
.sun{background:linear-gradient(#2b1055 0 45%,#7597de 45% 46%,#2b1055 46%);border:2px solid #ffd166}
.sun::before{content:'';position:absolute;left:50%;top:44%;width:60%;aspect-ratio:1;transform:translate(-50%,-100%) translateY(50%);border-radius:50%;
background:repeating-linear-gradient(#ffd166 0 4px,#ef476f 4px 5px);-webkit-mask:linear-gradient(#000 50%,transparent 50%)}
.sun::after{content:'';position:absolute;inset:auto 0 0 0;height:54%;
background:repeating-linear-gradient(90deg,transparent 0 7px,#ef476f88 7px 8px),repeating-linear-gradient(0deg,transparent 0 5px,#ef476f88 5px 6px)}

/* Scout logo, shared by both Scout backs */
.scout{position:absolute;left:50%;top:50%;width:72%;aspect-ratio:272/256;transform:translate(-50%,-50%);background:var(--logo) center/contain no-repeat;z-index:2}

/* scout-night */
.scout-night{background:#233D22;border:2px solid #F4F8EF}
.scout-night::before{content:'';position:absolute;inset:3px;border:1px solid #F4F8EF66;border-radius:4px;
background:repeating-linear-gradient(45deg,transparent 0 3px,#80B6491a 3px 4px),repeating-linear-gradient(-45deg,transparent 0 3px,#80B6491a 3px 4px)}

/* scout-deco */
.scout-deco{background:#111;border:2px solid #d4af37}
.scout-deco::before{content:'';position:absolute;inset:4px;border:1px solid #d4af3799;border-radius:3px;
background:repeating-conic-gradient(from 0deg at 50% 50%,#d4af3726 0 10deg,transparent 10deg 20deg)}
```

In the mockups the logo was a child element. In the app it can be a child element, or a `::after` layer on the Scout classes. Choose whichever keeps the template simplest.
