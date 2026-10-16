# Halloween Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A personal, October-only Halloween theme that repaints the table, swaps face-down cards to a Jack-o'-Lantern back, tints the voting cards orange, and unlocks three Halloween throw items.

**Architecture:** `ThemeService` gains a `halloween` preference that resolves to dark and adds a `halloween` class on `<html>`. All visual changes are `.halloween` rules in `styles.css`, beside the existing `.dark` overrides. One `isHalloween` signal on the service drives the two behavior changes: the table's card back and the extra throw items. The server only learns three new emoji.

**Tech Stack:** Angular (signals, standalone components), Tailwind 4, Vitest with Testing Library, .NET / xUnit / Moq.

**Spec:** `docs/superpowers/specs/2026-10-16-halloween-theme-design.md`

## Global Constraints

- Available October 1 to 31, browser local time, checked once at app load.
- Theme is personal: stored in `localStorage` key `poker-points-theme`, never sent to the server.
- `jack-o-lantern` is never added to `CARD_BACKS`, the server's card back list, or the card back picker.
- Throw items: 🎃 label `Pumpkin` profile `rock`; 🦇 label `Bat` profile `default`; 🕷️ label `Spider` profile `default`. All `iconKind: 'emoji'`, no splats.
- Server accepts the three items with no date or theme check.
- Spider is `'\u{1F577}\u{FE0F}'` (with variation selector, like `✈️` and `❤️`) on both sides.
- No restyle of buttons, badges, headers, modals or brand green.
- No code comments unless they explain something the code can't.

## Review Focus

1. **A saved Halloween pick in November.** Expect System behavior (OS light/dark, no `halloween` class), the System button highlighted, and `localStorage` still holding `halloween`. Pinned in Task 2 and Task 3.
2. **🕷️ written differently on each side.** Expect the server to accept exactly what the client sends. Pinned in Task 1 (server InlineData) and Task 4 (client constant code points).
3. **A non-Halloween player is hit by a pumpkin.** Expect it to fly with the rock profile and draw as an emoji, because metadata lookup doesn't depend on the theme. Pinned in Task 4.
4. **Switching theme mid-round with face-down cards on the table.** Expect the backs to change right away, no reload. Covered by the `computed` in Task 5 and checked by hand in Task 6.
5. **Eleven-item throw row near the table edge or on a phone.** Expect it to stay usable on screen. Checked by hand in Task 6.

---

### Task 1: Server accepts the Halloween throw items

**Files:**
- Modify: `src/backend/PokerPoints/PokerPoints.Api/Models/GameDtos.cs` (`EmojiThrowOptions.AllowedEmojis`)
- Test: `src/backend/PokerPoints/PokerPoints.Api.Tests/Hubs/PokerHubTests.cs` (`ThrowEmoji_ShouldAllowCuratedThrowOptions`)

**Interfaces:**
- Produces: server accepts `"🎃"`, `"🦇"`, `"\U0001F577️"`.

- [ ] **Step 1: Add three cases to the existing theory**

```csharp
[InlineData("🎃")]
[InlineData("🦇")]
[InlineData("\U0001F577️")]
```

Write the spider as escapes so the variation selector can't be lost in an editor.

- [ ] **Step 2: Run, expect the three new cases to fail**

Run: `cd src/backend/PokerPoints && dotnet test --filter ThrowEmoji_ShouldAllowCuratedThrowOptions`
Expected: 3 failed (an `Error` is sent instead of `EmojiThrown`), the rest pass.

- [ ] **Step 3: Add the three to `AllowedEmojis`**

Use the same escape for the spider.

- [ ] **Step 4: Run again**

Same command. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/backend/PokerPoints
git commit -m "allowed halloween throw items"
```

---

### Task 2: ThemeService learns Halloween

**Files:**
- Modify: `src/frontend/poker-points-app/src/app/core/services/theme.service.ts`
- Create: `src/frontend/poker-points-app/src/app/core/services/theme.service.spec.ts`

**Interfaces:**
- Produces, all in `theme.service.ts`:
  - `export type ThemePreference = 'light' | 'dark' | 'system' | 'halloween'`
  - `export const CURRENT_DATE = new InjectionToken<() => Date>('CURRENT_DATE', { providedIn: 'root', factory: () => () => new Date() })`
  - `ThemeService.halloweenAvailable: boolean`, true when `CURRENT_DATE()` is in October (`getMonth() === 9`), read once in the constructor.
  - `ThemeService.effectivePreference: Signal<ThemePreference>`, `'system'` when the stored pick is `halloween` and it isn't available, otherwise the stored pick.
  - `ThemeService.isHalloween: Signal<boolean>`, `effectivePreference() === 'halloween'`.
  - `resolvedTheme` maps `halloween` to `'dark'`.
  - `applyTheme` toggles `halloween` on `<html>` from `isHalloween()`, and sets `data-theme` to `effectivePreference()`.
  - `preference` stays the raw stored pick. `setPreference` unchanged.

- [ ] **Step 1: Write the failing tests**

Use `TestBed` with `{ provide: CURRENT_DATE, useValue: () => new Date(2026, 9, 16) }` for October and `new Date(2026, 10, 1)` for November. Set `localStorage` before creating the service and clear it and the `<html>` classes after each test. Flush effects with `TestBed.tick()`.

```ts
it('applies dark and halloween classes when halloween is picked in October', () => {
  localStorage.setItem('poker-points-theme', 'halloween');
  const service = createService(october);
  TestBed.tick();
  expect(service.isHalloween()).toBe(true);
  expect(service.resolvedTheme()).toBe('dark');
  expect(document.documentElement.classList).toContain('dark');
  expect(document.documentElement.classList).toContain('halloween');
});

it('treats a saved halloween pick as system outside October and keeps it saved', () => {
  localStorage.setItem('poker-points-theme', 'halloween');
  const service = createService(november);
  TestBed.tick();
  expect(service.halloweenAvailable).toBe(false);
  expect(service.effectivePreference()).toBe('system');
  expect(service.isHalloween()).toBe(false);
  expect(document.documentElement.classList).not.toContain('halloween');
  expect(localStorage.getItem('poker-points-theme')).toBe('halloween');
});

it('drops the halloween class when switching back to light', () => {
  const service = createService(october);
  service.setPreference('halloween');
  TestBed.tick();
  service.setPreference('light');
  TestBed.tick();
  expect(document.documentElement.classList).not.toContain('halloween');
  expect(document.documentElement.classList).not.toContain('dark');
});
```

- [ ] **Step 2: Run, expect failure**

Run: `cd src/frontend/poker-points-app && npx vitest run src/app/core/services/theme.service.spec.ts`
Expected: FAIL, `CURRENT_DATE` is not exported.

- [ ] **Step 3: Implement the interfaces above**

Add `'halloween'` to `isThemePreference`.

- [ ] **Step 4: Run again**

Same command. Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/poker-points-app/src/app/core/services
git commit -m "added halloween theme preference"
```

---

### Task 3: Pumpkin button in the theme selector

**Files:**
- Modify: `src/frontend/poker-points-app/src/app/shared/components/theme-selector.component.ts`
- Create: `src/frontend/poker-points-app/src/app/shared/components/theme-selector.component.spec.ts`

**Interfaces:**
- Consumes: `ThemeService.halloweenAvailable`, `ThemeService.effectivePreference`, `CURRENT_DATE` (Task 2).
- Produces: a fourth option `{ value: 'halloween', label: 'Halloween', title: 'Use Halloween theme', iconPath: <pumpkin outline path> }`, listed only when `halloweenAvailable`. The active state reads `effectivePreference()` instead of `preference()`.

- [ ] **Step 1: Write the failing tests**

Render with Testing Library, providing `CURRENT_DATE`. Clear `localStorage` after each.

```ts
it('shows the Halloween button in October', async () => {
  await renderSelector(october);
  expect(screen.getByRole('button', { name: 'Use Halloween theme' })).toBeInTheDocument();
});

it('hides it outside October and marks System active for a saved halloween pick', async () => {
  localStorage.setItem('poker-points-theme', 'halloween');
  await renderSelector(november);
  expect(screen.queryByRole('button', { name: 'Use Halloween theme' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Use system theme' })).toHaveAttribute('aria-pressed', 'true');
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/app/shared/components/theme-selector.component.spec.ts`
Expected: FAIL, no Halloween button.

- [ ] **Step 3: Implement**

Build `options` from the existing three plus the Halloween option when `themeService.halloweenAvailable`. The pumpkin is a 24×24 outline path that works with the existing `stroke="currentColor"` markup.

- [ ] **Step 4: Run again**

Same command. Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/poker-points-app/src/app/shared/components
git commit -m "added halloween option to theme selector"
```

---

### Task 4: Halloween throw items

**Files:**
- Modify: `src/frontend/poker-points-app/src/app/core/models/session.models.ts`
- Modify: `src/frontend/poker-points-app/src/app/features/game/emoji-throw-palette.component.ts`
- Create: `src/frontend/poker-points-app/src/app/features/game/emoji-throw-palette.component.spec.ts`

**Interfaces:**
- Consumes: `ThemeService.isHalloween` (Task 2).
- Produces in `session.models.ts`:
  - `PUMPKIN_THROW_OPTION = '🎃'`, `BAT_THROW_OPTION = '🦇'`, `SPIDER_THROW_OPTION = '\u{1F577}\u{FE0F}'`
  - `HALLOWEEN_THROW_OPTIONS = [PUMPKIN_THROW_OPTION, BAT_THROW_OPTION, SPIDER_THROW_OPTION] as const`
  - `EmojiThrowOption` becomes the union of `EMOJI_THROW_OPTIONS` and `HALLOWEEN_THROW_OPTIONS` entries, so `EMOJI_THROW_OPTION_METADATA` must hold all eleven.
- Palette: `emojiThrowOptions` becomes a `computed` that adds `HALLOWEEN_THROW_OPTIONS` after the existing eight when `isHalloween()`.

- [ ] **Step 1: Write the failing tests**

```ts
it('shows only the standard items without the Halloween theme', async () => {
  await renderPalette({ halloween: false });
  expect(screen.getAllByRole('button')).toHaveLength(EMOJI_THROW_OPTIONS.length);
  expect(screen.queryByRole('button', { name: 'Throw Pumpkin at Sam' })).toBeNull();
});

it('adds pumpkin, bat and spider with the Halloween theme', async () => {
  await renderPalette({ halloween: true });
  for (const label of ['Pumpkin', 'Bat', 'Spider']) {
    expect(screen.getByRole('button', { name: `Throw ${label} at Sam` })).toBeInTheDocument();
  }
});

it('knows how to fly Halloween items for players without the theme', () => {
  expect(getEmojiThrowOptionMetadata('🎃')?.profile).toBe('rock');
  expect(getEmojiThrowOptionMetadata('🦇')?.profile).toBe('default');
  expect(getEmojiThrowOptionMetadata('\u{1F577}\u{FE0F}')?.label).toBe('Spider');
});
```

`renderPalette` passes `targetDisplayName: 'Sam'` and fakes Halloween through `localStorage` plus an October `CURRENT_DATE`, or by providing a stub `ThemeService` with `isHalloween: signal(value)`.

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/app/features/game/emoji-throw-palette.component.spec.ts`
Expected: FAIL, the Halloween constants don't exist.

- [ ] **Step 3: Implement the interfaces above**

- [ ] **Step 4: Run the new spec and the throw animation spec**

Run: `npx vitest run src/app/features/game/emoji-throw-palette.component.spec.ts src/app/features/game/emoji-throw-animation.utils.spec.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/poker-points-app/src/app
git commit -m "added halloween throw items"
```

---

### Task 5: Halloween table, card back and voting cards

**Files:**
- Modify: `src/frontend/poker-points-app/src/app/core/models/session.models.ts`
- Modify: `src/frontend/poker-points-app/src/app/shared/components/card-back.component.ts`
- Modify: `src/frontend/poker-points-app/src/app/features/game/game-room.component.ts` (`cardBack`, `getSelectedCardClasses`)
- Modify: `src/frontend/poker-points-app/src/app/features/game/game-room.component.html` (table border at ~line 231, face-down card at ~line 441)
- Modify: `src/frontend/poker-points-app/src/styles.css`
- Create: `src/frontend/poker-points-app/src/app/shared/components/card-back.component.spec.ts`

**Interfaces:**
- Consumes: `ThemeService.isHalloween` (Task 2).
- Produces:
  - `session.models.ts`: `HALLOWEEN_CARD_BACK = 'jack-o-lantern' as const`, `type TableCardBack = CardBack | typeof HALLOWEEN_CARD_BACK`. `CardBack` and `CARD_BACKS` unchanged.
  - `CardBackComponent.back = input.required<TableCardBack>()`.
  - Game room: `tableCardBack = computed<TableCardBack>(() => isHalloween() ? HALLOWEEN_CARD_BACK : gameState.cardBack())`, used for both `[back]` and `data-card-back` on the face-down card.
  - `styles.css`: `.card-back-jack-o-lantern` (+ `::before`/`::after`), `.halloween .poker-table`, a table rim class replacing `border-poker-green-800` in the template (for example `poker-table-rim`, green by default and dark purple under `.halloween`), and `vote-card-selected` / `vote-card-idle` utilities that hold today's green looks, with `.halloween` orange versions.
  - `getSelectedCardClasses` returns `vote-card-selected` and `vote-card-idle` (plus the text and border classes it keeps) instead of the inline green classes. Disabled stays as is.

- [ ] **Step 1: Write the failing test**

```ts
it('draws the Jack-o-Lantern back without a logo', async () => {
  const { container } = await render(CardBackComponent, { inputs: { back: 'jack-o-lantern' } });
  expect(container).toHaveClass('card-back', 'card-back-jack-o-lantern');
  expect(container.querySelector('img')).toBeNull();
});
```

Adjust the selector to the host element if `container` isn't it.

- [ ] **Step 2: Run, expect a type failure**

Run: `npx vitest run src/app/shared/components/card-back.component.spec.ts`
Expected: FAIL, `'jack-o-lantern'` isn't assignable to `CardBack`.

- [ ] **Step 3: Implement the types, component input and game room wiring**

- [ ] **Step 4: Run again**

Same command. Expected: PASS.

- [ ] **Step 5: Write the CSS**

The back follows `.card-back-classic-red`'s structure: white outer border, `::before` inner border with corner dots, `::after` center oval. Orange (`#f97316` range) on near-black, with a jack-o'-lantern face (two triangle eyes, a jagged mouth) drawn with gradients or an inline SVG data URI in the oval. The table felt is near-black purple with an orange highlight where today's white highlight sits, and the same `shadow-table`. Selected voting card: orange gradient and orange glow in place of `shadow-glow-green`. Idle hover: orange border.

- [ ] **Step 6: Run the full frontend suite and the build**

Run: `npx vitest run && npm run build`
Expected: all pass, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/poker-points-app
git commit -m "added halloween table and card back"
```

---

### Task 6: See it in the running app

**Files:** none new, unless tuning changes `styles.css`.

- [ ] **Step 1: Start the database, API and frontend** as in `AGENTS.md`, then open `http://localhost:4200/`.

- [ ] **Step 2: Check by hand, in October**

- Pick Halloween: the page goes dark, the table turns purple, the pumpkin button is selected.
- Start a game in two browsers, one on Halloween and one on Light. Vote in both. The Halloween browser shows Jack-o'-Lantern backs; the Light one shows the host's back.
- Switch the Halloween browser to Dark mid-round. The backs change right away to the host's pick.
- Throw a pumpkin, bat and spider from the Halloween browser. They land in the Light browser; the pumpkin bounces.
- The selected voting card glows orange.
- The Jack-o'-Lantern back reads at compact, normal and large table sizes.
- The throw row fits for a player seated at the table's left and right edges, and at 390px wide.
- The theme selector fits in the account dropdown and on mobile.

Tune `styles.css` until each holds.

- [ ] **Step 3: Run the e2e appearance test**

Run: `cd tests/e2e && npx playwright test specs/appearance.spec.ts`
Expected: pass. It runs in October, so it sees four theme buttons.

- [ ] **Step 4: Run the backend suite**

Run: `cd src/backend/PokerPoints && dotnet test`
Expected: all pass.

- [ ] **Step 5: Commit any tuning**

```bash
git add src/frontend/poker-points-app/src/styles.css
git commit -m "tuned halloween styles"
```
