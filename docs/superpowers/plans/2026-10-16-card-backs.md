# Card Backs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The organizer picks one of seven card back designs when creating a session and can change it live; every face-down card on the table shows that back.

**Architecture:** The session stores a `CardBack` id. The create endpoint accepts it, the game-state snapshot carries it, and a new organizer-only hub method `SetCardBack` saves it and broadcasts `CardBackChanged`. The browser keeps it in a `GameStateService` signal. A shared `CardBackComponent` draws one back from CSS classes in `styles.css`, and a shared `CardBackPickerComponent` is used on the create form and in the settings panel.

**Tech Stack:** .NET 10, EF Core 10 + Npgsql, SignalR, xUnit + Moq + FluentAssertions; Angular (standalone, signals), Tailwind v4, Vitest; Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-card-backs-design.md`

## Global Constraints

- Allowed ids, in this display order: `classic-red`, `classic-blue`, `midnight-neon`, `art-deco`, `retro-sunset`, `scout-night`, `scout-deco`.
- Labels: Classic Red, Classic Blue, Midnight Neon, Art Deco, Retro Sunset, Scout Night, Scout Deco.
- Default: `classic-red`. Existing sessions get `classic-red`.
- Id matching is exact and case-sensitive.
- Card backs never change deck values, votes, the timer or the round.
- Scout backs draw `brand/logo.svg?v=scout-1` unchanged: no recoloring, shadows or effects on the mark.
- Only the face-down table card changes. The voting hand, results row, empty slot and revealed faces stay as they are.
- No `any` in TypeScript. No comments that restate code.
- Commits: short lower-case summaries, no AI attribution.

## Review Focus

1. **A player reloads or joins after the back changed.** They should see the current back, not Classic Red. Covered by the E2E reload step in Task 5.
2. **The back changes while votes are face down.** Voters must still show as voted. Only the look changes. Covered in Task 5.
3. **A host who lost host controls, or a session that ended, calls `SetCardBack`.** It must be refused. Covered by the "not organizer" and "inactive session" hub tests in Task 2.
4. **An old client gets an id it doesn't know** (after a deploy that adds backs). It should fall back to Classic Red, not blank the cards. Covered in Task 3.
5. **Compact table size (36×54).** Scout must still be recognizable and the frame visible against the felt. This is a manual check in Task 4, step 9.

---

## File map

Backend (`src/backend/PokerPoints`):
- Create `PokerPoints.Api/Models/CardBacks.cs`: allowed ids, default, `IsValid`.
- Modify `PokerPoints.Data/Entities/Session.cs`: `CardBack` property.
- Modify `PokerPoints.Data/PokerPointsDbContext.cs`: column config.
- Create migration `AddSessionCardBack` under `PokerPoints.Data/Migrations`.
- Modify `PokerPoints.Api/Models/SessionDtos.cs`: `CreateSessionRequest.CardBack`, `SessionInfoResponse.CardBack`.
- Modify `PokerPoints.Api/Models/GameDtos.cs`: `CardBackChangedEvent`.
- Modify `PokerPoints.Api/Services/SessionService.cs`: create param, both `SessionInfoResponse` builders, `SetCardBackAsync`.
- Modify `PokerPoints.Api/Controllers/SessionsController.cs`: validate and pass `CardBack`.
- Modify `PokerPoints.Api/Hubs/PokerHub.cs`: `SetCardBack`.
- Tests: `PokerPoints.Api.Tests/Services/SessionServiceTests.cs`, `Controllers/SessionsControllerTests.cs`, `Hubs/PokerHubTests.cs`.

Frontend (`src/frontend/poker-points-app/src`):
- Modify `app/core/models/session.models.ts`: `CardBack`, `CARD_BACKS`, `toCardBack`, `CardBackChangedEvent`, request/info fields.
- Modify `app/core/services/signalr.service.ts`: `cardBackChanged$`, `setCardBack`.
- Modify `app/core/services/game-state.service.ts`: `cardBack` signal, `setCardBack`.
- Modify `app/core/services/game-state.service.spec.ts`.
- Modify `app/core/services/session.service.ts`: send `cardBack`.
- Create `app/shared/components/card-back.component.ts`: draws one back.
- Create `app/shared/components/card-back-picker.component.ts`: row of backs.
- Modify `styles.css`: replace the `card-back` utility with per-back classes.
- Modify `app/features/home/home.component.ts` and `.html`: picker on the create form.
- Modify `app/features/game/settings-panel.component.ts`: picker for the organizer.
- Modify `app/features/game/game-room.component.html` and `.ts`: use `CardBackComponent`.

E2E: create `tests/e2e/specs/card-backs.spec.ts`.

---

### Task 1: Store the card back and accept it on create

**Files:**
- Create: `src/backend/PokerPoints/PokerPoints.Api/Models/CardBacks.cs`
- Modify: `src/backend/PokerPoints/PokerPoints.Data/Entities/Session.cs`
- Modify: `src/backend/PokerPoints/PokerPoints.Data/PokerPointsDbContext.cs:93`
- Create: migration `AddSessionCardBack`
- Modify: `src/backend/PokerPoints/PokerPoints.Api/Models/SessionDtos.cs`
- Modify: `src/backend/PokerPoints/PokerPoints.Api/Services/SessionService.cs`
- Modify: `src/backend/PokerPoints/PokerPoints.Api/Controllers/SessionsController.cs:40-44`
- Test: `PokerPoints.Api.Tests/Services/SessionServiceTests.cs`, `PokerPoints.Api.Tests/Controllers/SessionsControllerTests.cs`

**Interfaces:**
- Produces: `CardBacks.Default` (`"classic-red"`), `CardBacks.All` (`IReadOnlyList<string>`), `CardBacks.IsValid(string?) : bool`.
- Produces: `ISessionService.CreateSessionAsync(string deckType, string? name = null, Guid? organizerId = null, int timerDurationSeconds = 120, string cardBack = CardBacks.Default)`.
- Produces: `CreateSessionRequest(string DeckType = "fibonacci", string? Name = null, int TimerDurationSeconds = 300, string? CardBack = null)`.
- Produces: `SessionInfoResponse` gains `string CardBack` after `TimerDurationSeconds`. The JSON field is `cardBack`.

- [ ] **Step 1: Write the failing service tests**

Add to `SessionServiceTests.cs`:

```csharp
[Fact]
public async Task CreateSessionAsync_ShouldDefaultCardBackToClassicRed()
{
    var result = await _service.CreateSessionAsync("fibonacci");

    var session = await _db.Sessions.SingleAsync(s => s.Id == result.SessionId);
    session.CardBack.Should().Be("classic-red");
}

[Fact]
public async Task CreateSessionAsync_ShouldStoreChosenCardBack()
{
    var result = await _service.CreateSessionAsync("fibonacci", cardBack: "scout-night");

    var session = await _db.Sessions.SingleAsync(s => s.Id == result.SessionId);
    session.CardBack.Should().Be("scout-night");

    var info = await _service.GetSessionInfoAsync(result.AccessCode);
    info!.CardBack.Should().Be("scout-night");

    var state = await _service.GetGameStateAsync(result.AccessCode);
    state!.Session.CardBack.Should().Be("scout-night");
}
```

- [ ] **Step 2: Write the failing controller test**

Add to `SessionsControllerTests.cs`:

```csharp
[Fact]
public async Task CreateSession_ShouldRejectUnknownCardBack()
{
    var fixture = CreateFixture();
    var request = new CreateSessionRequest("fibonacci", "Game", 300, "plaid");

    var result = await fixture.Controller.CreateSession(request);

    result.Result.Should().BeOfType<BadRequestObjectResult>();
    fixture.SessionService.Verify(
        s => s.CreateSessionAsync(
            It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<Guid?>(), It.IsAny<int>(), It.IsAny<string>()),
        Times.Never);
}
```

Moq setups can't omit optional arguments, so the six existing `CreateSessionAsync(...)` setups and verifies in this file each gain a fifth argument, `"classic-red"`. Example: `s.CreateSessionAsync("modified", "Guest Game", null, 420, "classic-red")`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd src/backend/PokerPoints && dotnet test PokerPoints.Api.Tests --filter "FullyQualifiedName~CardBack"`
Expected: build fails. `CardBack` doesn't exist on `Session`, `SessionInfoResponse` or `CreateSessionRequest`.

- [ ] **Step 4: Add `CardBacks`**

`PokerPoints.Api/Models/CardBacks.cs`:

```csharp
namespace PokerPoints.Api.Models;

public static class CardBacks
{
    public const string Default = "classic-red";

    public static readonly IReadOnlyList<string> All =
    [
        "classic-red",
        "classic-blue",
        "midnight-neon",
        "art-deco",
        "retro-sunset",
        "scout-night",
        "scout-deco",
    ];

    public static bool IsValid(string? cardBack) =>
        cardBack is not null && All.Contains(cardBack, StringComparer.Ordinal);
}
```

- [ ] **Step 5: Add the entity property and column config**

In `Session.cs`, after `DeckType`:

```csharp
public string CardBack { get; set; } = "classic-red";
```

In `PokerPointsDbContext.cs`, after the `DeckType` line in `ConfigureSession`:

```csharp
entity.Property(e => e.CardBack).HasMaxLength(50).HasDefaultValue("classic-red");
```

- [ ] **Step 6: Generate the migration**

Run (the global `dotnet-ef` is 10.x and matches EF Core 10; the root tool manifest pins an old 8.x and is not used here):

```bash
cd src/backend/PokerPoints
dotnet ef migrations add AddSessionCardBack --project PokerPoints.Data --startup-project PokerPoints.Api
```

Open the generated `*_AddSessionCardBack.cs`. `Up` must contain only an `AddColumn<string>` for `CardBack` on `sessions` with `maxLength: 50`, `nullable: false` and `defaultValue: "classic-red"`. `Down` must drop that one column. If anything else appears, the model snapshot was out of date. Stop and report it rather than committing unrelated schema changes.

- [ ] **Step 7: Thread the card back through the DTOs and service**

`SessionDtos.cs`:

```csharp
public record CreateSessionRequest(
    string DeckType = "fibonacci",
    string? Name = null,
    int TimerDurationSeconds = 300,
    string? CardBack = null
);
```

In `SessionInfoResponse`, add `string CardBack,` directly after `int TimerDurationSeconds,`.

`SessionService.cs`: change the interface and implementation signatures to

```csharp
Task<CreateSessionResponse> CreateSessionAsync(string deckType, string? name = null, Guid? organizerId = null, int timerDurationSeconds = 120, string cardBack = CardBacks.Default);
```

Set `CardBack = cardBack,` in the `new Session { ... }` initializer. In both `new SessionInfoResponse(...)` calls (`GetSessionInfoAsync` and `GetGameStateAsync`), pass `session.CardBack,` after `session.TimerDurationSeconds,`.

- [ ] **Step 8: Validate in the controller**

Replace lines 40-43 of `SessionsController.cs`:

```csharp
var cardBack = request?.CardBack ?? CardBacks.Default;
if (!CardBacks.IsValid(cardBack))
    return BadRequest(new { error = "Unknown card back" });

var deckType = request?.DeckType ?? "fibonacci";
var name = request?.Name;
var timerDuration = request?.TimerDurationSeconds ?? 300;
var result = await _sessionService.CreateSessionAsync(deckType, name, organizerId, timerDuration, cardBack);
```

- [ ] **Step 9: Run the backend tests**

Run: `cd src/backend/PokerPoints && dotnet test`
Expected: all pass, including the three new tests. Any other compile error from `SessionInfoResponse`'s new positional field (for example in integration tests) gets fixed by passing `"classic-red"` in the new slot.

- [ ] **Step 10: Commit**

```bash
git add src/backend/PokerPoints
git commit -m "added card back to sessions"
```

---

### Task 2: Let the organizer change the card back live

**Files:**
- Modify: `src/backend/PokerPoints/PokerPoints.Api/Models/GameDtos.cs`
- Modify: `src/backend/PokerPoints/PokerPoints.Api/Services/SessionService.cs`
- Modify: `src/backend/PokerPoints/PokerPoints.Api/Hubs/PokerHub.cs` (next to `UpdateStory`)
- Test: `PokerPoints.Api.Tests/Services/SessionServiceTests.cs`, `PokerPoints.Api.Tests/Hubs/PokerHubTests.cs`

**Interfaces:**
- Consumes: `CardBacks.IsValid` from Task 1.
- Produces: `ISessionService.SetCardBackAsync(Guid sessionId, string cardBack) : Task<bool>`. Returns false when the session is missing or inactive.
- Produces: hub method `SetCardBack(string cardBack)`. Broadcasts `"CardBackChanged"` with `CardBackChangedEvent(string CardBack)`. The JSON is `{ cardBack }`.

- [ ] **Step 1: Write the failing service test**

```csharp
[Fact]
public async Task SetCardBackAsync_ShouldUpdateActiveSession()
{
    var created = await _service.CreateSessionAsync("fibonacci");

    var updated = await _service.SetCardBackAsync(created.SessionId, "art-deco");

    updated.Should().BeTrue();
    var session = await _db.Sessions.SingleAsync(s => s.Id == created.SessionId);
    session.CardBack.Should().Be("art-deco");
}
```

- [ ] **Step 2: Write the failing hub tests**

Add to `PokerHubTests.cs`:

```csharp
[Fact]
public async Task SetCardBack_ShouldSaveAndBroadcast_WhenCallerIsHost()
{
    var fixture = CreateFixture();
    fixture.ParticipantService
        .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
        .ReturnsAsync(CreateParticipant(SenderId, "Sender", "ABC123", SenderConnectionId, isOrganizer: true));
    fixture.SessionService
        .Setup(s => s.SetCardBackAsync(SessionId, "scout-deco"))
        .ReturnsAsync(true);

    await fixture.Hub.SetCardBack("scout-deco");

    fixture.GroupClient.Verify(
        c => c.SendCoreAsync(
            "CardBackChanged",
            It.Is<object?[]>(args => args.SingleOrDefault() is CardBackChangedEvent e && e.CardBack == "scout-deco"),
            It.IsAny<CancellationToken>()),
        Times.Once);
}

[Fact]
public async Task SetCardBack_ShouldSendError_WhenCallerIsNotHost()
{
    var fixture = CreateFixture();
    fixture.ParticipantService
        .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
        .ReturnsAsync(CreateParticipant(SenderId, "Sender", "ABC123", SenderConnectionId));

    await fixture.Hub.SetCardBack("scout-deco");

    VerifyError(fixture.CallerClient, "Only the host can change the card back");
    fixture.SessionService.Verify(s => s.SetCardBackAsync(It.IsAny<Guid>(), It.IsAny<string>()), Times.Never);
}

[Fact]
public async Task SetCardBack_ShouldSendError_WhenSessionIsInactive()
{
    var fixture = CreateFixture();
    var host = CreateParticipant(SenderId, "Sender", "ABC123", SenderConnectionId, isOrganizer: true);
    host.Session.IsActive = false;
    fixture.ParticipantService
        .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
        .ReturnsAsync(host);

    await fixture.Hub.SetCardBack("scout-deco");

    VerifyError(fixture.CallerClient, "Only the host can change the card back");
    fixture.SessionService.Verify(s => s.SetCardBackAsync(It.IsAny<Guid>(), It.IsAny<string>()), Times.Never);
}

[Fact]
public async Task SetCardBack_ShouldSendError_WhenCardBackIsUnknown()
{
    var fixture = CreateFixture();
    fixture.ParticipantService
        .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
        .ReturnsAsync(CreateParticipant(SenderId, "Sender", "ABC123", SenderConnectionId, isOrganizer: true));

    await fixture.Hub.SetCardBack("Scout-Night");

    VerifyError(fixture.CallerClient, "Unknown card back");
    fixture.SessionService.Verify(s => s.SetCardBackAsync(It.IsAny<Guid>(), It.IsAny<string>()), Times.Never);
    fixture.GroupClient.Verify(
        c => c.SendCoreAsync("CardBackChanged", It.IsAny<object?[]>(), It.IsAny<CancellationToken>()),
        Times.Never);
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd src/backend/PokerPoints && dotnet test PokerPoints.Api.Tests --filter "FullyQualifiedName~CardBack"`
Expected: build fails because `SetCardBackAsync`, `SetCardBack` and `CardBackChangedEvent` don't exist.

- [ ] **Step 4: Add the event and service method**

`GameDtos.cs`, next to `VotesResetEvent`:

```csharp
public record CardBackChangedEvent(string CardBack);
```

`ISessionService`:

```csharp
Task<bool> SetCardBackAsync(Guid sessionId, string cardBack);
```

`SessionService`:

```csharp
public async Task<bool> SetCardBackAsync(Guid sessionId, string cardBack)
{
    var session = await _db.Sessions.FirstOrDefaultAsync(s => s.Id == sessionId && s.IsActive);
    if (session == null) return false;

    session.CardBack = cardBack;
    await _db.SaveChangesAsync();
    return true;
}
```

- [ ] **Step 5: Add the hub method**

In `PokerHub.cs`, after `UpdateStory`:

```csharp
public async Task SetCardBack(string cardBack)
{
    var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
    if (participant == null)
    {
        await Clients.Caller.SendAsync("Error", "Not in a session");
        return;
    }

    if (!participant.IsOrganizer || !participant.Session.IsActive)
    {
        await Clients.Caller.SendAsync("Error", "Only the host can change the card back");
        return;
    }

    if (!CardBacks.IsValid(cardBack))
    {
        await Clients.Caller.SendAsync("Error", "Unknown card back");
        return;
    }

    var session = participant.Session;
    if (!await _sessionService.SetCardBackAsync(session.Id, cardBack))
    {
        await Clients.Caller.SendAsync("Error", "Session not found or already ended");
        return;
    }

    await Clients.Group(session.AccessCode).SendAsync("CardBackChanged", new CardBackChangedEvent(cardBack));
}
```

- [ ] **Step 6: Run the backend tests**

Run: `cd src/backend/PokerPoints && dotnet test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/backend/PokerPoints
git commit -m "added live card back changes"
```

---

### Task 3: Frontend state for the card back

**Files:**
- Modify: `src/frontend/poker-points-app/src/app/core/models/session.models.ts`
- Modify: `src/frontend/poker-points-app/src/app/core/services/signalr.service.ts`
- Modify: `src/frontend/poker-points-app/src/app/core/services/game-state.service.ts`
- Modify: `src/frontend/poker-points-app/src/app/core/services/session.service.ts:21-28`
- Test: `src/frontend/poker-points-app/src/app/core/services/game-state.service.spec.ts`

**Interfaces:**
- Consumes: hub method `SetCardBack(string)` and event `CardBackChanged { cardBack }` from Task 2; `SessionInfo.cardBack` from Task 1.
- Produces, in `session.models.ts`:
  - `CARD_BACKS: readonly { id: CardBack; label: string }[]`
  - `type CardBack`, derived from `CARD_BACKS`
  - `DEFAULT_CARD_BACK: CardBack = 'classic-red'`
  - `toCardBack(value: string | null | undefined): CardBack`
  - `interface CardBackChangedEvent { cardBack: string }`
- Produces: `SignalRService.cardBackChanged$: Subject<CardBackChangedEvent>`, `SignalRService.setCardBack(cardBack: CardBack): Promise<void>`.
- Produces: `GameStateService.cardBack: Signal<CardBack>`, `GameStateService.setCardBack(cardBack: CardBack): Promise<void>`.
- Produces: `SessionService.createSession(deckType, name?, timerDurationSeconds = 120, cardBack: CardBack = DEFAULT_CARD_BACK)`.

- [ ] **Step 1: Write the failing tests**

In `game-state.service.spec.ts`, add `CardBackChangedEvent` to the model import. Add to `MockSignalRService`:

```ts
readonly cardBackChanged$ = new Subject<CardBackChangedEvent>();
readonly setCardBack = vi.fn().mockResolvedValue(undefined);
```

Add `cardBack: 'classic-red',` to the `session` object in `createGameState`. Then add:

```ts
it('takes the card back from the session snapshot', () => {
  const state = createGameState([hostParticipant]);
  signalR.sessionState$.next({ ...state, session: { ...state.session, cardBack: 'scout-night' } });

  expect(service.cardBack()).toBe('scout-night');
});

it('updates the card back when the host changes it', () => {
  signalR.cardBackChanged$.next({ cardBack: 'retro-sunset' });

  expect(service.cardBack()).toBe('retro-sunset');
});

it('falls back to classic red for a card back it does not know', () => {
  signalR.cardBackChanged$.next({ cardBack: 'tartan' });

  expect(service.cardBack()).toBe('classic-red');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src/frontend/poker-points-app && npx vitest run src/app/core/services/game-state.service.spec.ts`
Expected: FAIL. TypeScript errors on `cardBack`, or `service.cardBack is not a function`.

- [ ] **Step 3: Add the model types**

In `session.models.ts`, after `DECK_VALUES`:

```ts
export const CARD_BACKS = [
  { id: 'classic-red', label: 'Classic Red' },
  { id: 'classic-blue', label: 'Classic Blue' },
  { id: 'midnight-neon', label: 'Midnight Neon' },
  { id: 'art-deco', label: 'Art Deco' },
  { id: 'retro-sunset', label: 'Retro Sunset' },
  { id: 'scout-night', label: 'Scout Night' },
  { id: 'scout-deco', label: 'Scout Deco' },
] as const;

export type CardBack = (typeof CARD_BACKS)[number]['id'];

export const DEFAULT_CARD_BACK: CardBack = 'classic-red';

export function toCardBack(value: string | null | undefined): CardBack {
  return CARD_BACKS.find((back) => back.id === value)?.id ?? DEFAULT_CARD_BACK;
}

export interface CardBackChangedEvent {
  cardBack: string;
}
```

Add `cardBack?: string;` to `CreateSessionRequest` and `cardBack: string;` to `SessionInfo`, after `timerDurationSeconds`.

- [ ] **Step 4: Wire SignalR**

In `signalr.service.ts`, import `CardBack` and `CardBackChangedEvent`. Add the subject next to the others:

```ts
readonly cardBackChanged$ = new Subject<CardBackChangedEvent>();
```

Register the handler after `SessionEnded`:

```ts
this.connection.on('CardBackChanged', (event: CardBackChangedEvent) => {
  this.cardBackChanged$.next(event);
});
```

Add the invoke after `sendEmojiReaction`:

```ts
async setCardBack(cardBack: CardBack): Promise<void> {
  if (!this.connection) {
    throw new Error('Not connected to SignalR hub');
  }
  await this.connection.invoke('SetCardBack', cardBack);
}
```

- [ ] **Step 5: Add the game state**

In `game-state.service.ts`, import `CardBack`, `DEFAULT_CARD_BACK` and `toCardBack`. Then:

```ts
private readonly _cardBack = signal<CardBack>(DEFAULT_CARD_BACK);
readonly cardBack = this._cardBack.asReadonly();
```

In `subscribeToSignalREvents`:

```ts
this.signalR.cardBackChanged$
  .pipe(takeUntilDestroyed(this.destroyRef))
  .subscribe((event) => this._cardBack.set(toCardBack(event.cardBack)));
```

In `applyGameState`, after the `_deckType` line:

```ts
this._cardBack.set(toCardBack(state.session.cardBack));
```

In `clearSessionState`: `this._cardBack.set(DEFAULT_CARD_BACK);`

Add an action next to `transferHost`:

```ts
async setCardBack(cardBack: CardBack): Promise<void> {
  if (!this.isOrganizer()) return;
  await this.signalR.setCardBack(cardBack);
}
```

The local signal updates when the server's broadcast comes back, so every client, including the host, takes the same path.

- [ ] **Step 6: Send it on create**

`session.service.ts`:

```ts
async createSession(
  deckType: DeckType = 'fibonacci',
  name?: string,
  timerDurationSeconds: number = 120,
  cardBack: CardBack = DEFAULT_CARD_BACK,
): Promise<CreateSessionResponse> {
  const request: CreateSessionRequest = { deckType, name, timerDurationSeconds, cardBack };
  return firstValueFrom(this.http.post<CreateSessionResponse>(this.apiUrl, request));
}
```

- [ ] **Step 7: Run the frontend tests**

Run: `cd src/frontend/poker-points-app && npm test -- --run`
Expected: all pass. Any other spec or fixture building a `SessionInfo` literal gets `cardBack: 'classic-red'`.

- [ ] **Step 8: Commit**

```bash
git add src/frontend/poker-points-app/src/app/core
git commit -m "added card back to game state"
```

---

### Task 4: Draw the backs and add the pickers

**Files:**
- Modify: `src/frontend/poker-points-app/src/styles.css:367-470` (the `card-back` utility)
- Create: `src/frontend/poker-points-app/src/app/shared/components/card-back.component.ts`
- Create: `src/frontend/poker-points-app/src/app/shared/components/card-back-picker.component.ts`
- Modify: `src/frontend/poker-points-app/src/app/features/game/game-room.component.html:419-446`, `game-room.component.ts:395-408`
- Modify: `src/frontend/poker-points-app/src/app/features/home/home.component.ts`, `home.component.html` (after the Deck Type block, ~line 205)
- Modify: `src/frontend/poker-points-app/src/app/features/game/settings-panel.component.ts`

**Interfaces:**
- Consumes: `CardBack`, `CARD_BACKS`, `DEFAULT_CARD_BACK` and `GameStateService.cardBack` / `setCardBack` from Task 3; `SessionService.createSession(..., cardBack)`.
- Produces: `<app-card-back [back]="CardBack" />`, which fills its positioned parent.
- Produces: `<app-card-back-picker [selected]="CardBack" (selectedChange)="..." />`. Options carry `data-testid="card-back-option-<id>"`.
- Produces: the face-down table card carries `data-testid="table-card-back"` and `data-card-back="<id>"`. These go on the table usage only, not inside the component, because the pickers also render `app-card-back`.

- [ ] **Step 1: Replace the card-back CSS**

In `styles.css`, delete the whole `@utility card-back { ... }` block and add plain classes below the utilities. These come from the spec appendix, renamed under a `card-back-` prefix:

```css
.card-back {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
}

.card-back-classic-red,
.card-back-classic-blue {
  background: var(--card-back-color);
  border: 2px solid #fff;
}
.card-back-classic-red { --card-back-color: #c41e3a; }
.card-back-classic-blue { --card-back-color: #1f4fa8; }
.card-back-classic-red::before,
.card-back-classic-blue::before {
  content: '';
  position: absolute;
  inset: 3px;
  border: 1px solid #fff9;
  border-radius: 4px;
  background:
    radial-gradient(ellipse 8px 8px at 6px 6px, #fff6 40%, transparent 50%),
    radial-gradient(ellipse 8px 8px at calc(100% - 6px) 6px, #fff6 40%, transparent 50%),
    radial-gradient(ellipse 8px 8px at 6px calc(100% - 6px), #fff6 40%, transparent 50%),
    radial-gradient(ellipse 8px 8px at calc(100% - 6px) calc(100% - 6px), #fff6 40%, transparent 50%);
}
.card-back-classic-red::after,
.card-back-classic-blue::after {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 3px;
  border: 1px solid #fff4;
  background:
    radial-gradient(ellipse 70% 45% at 50% 50%, #ffffff26 80%, transparent 81%),
    radial-gradient(ellipse 55% 35% at 50% 50%, transparent 75%, #fff3 76%, #fff3 85%, transparent 86%),
    repeating-linear-gradient(45deg, transparent 0 3px, #ffffff14 3px 4px),
    repeating-linear-gradient(-45deg, transparent 0 3px, #ffffff14 3px 4px);
}

.card-back-midnight-neon {
  background: #0d0b1f;
  border: 2px solid #ff3ea5;
  box-shadow: inset 0 0 8px #ff3ea5aa;
}
.card-back-midnight-neon::before {
  content: '';
  position: absolute;
  inset: 4px;
  border-radius: 4px;
  background:
    repeating-linear-gradient(0deg, transparent 0 7px, #29e7ff33 7px 8px),
    repeating-linear-gradient(90deg, transparent 0 7px, #29e7ff33 7px 8px);
}
.card-back-midnight-neon::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 40%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%) rotate(45deg);
  border: 2px solid #29e7ff;
  box-shadow: 0 0 6px #29e7ff, inset 0 0 6px #29e7ff;
}

.card-back-art-deco,
.card-back-scout-deco {
  background: #111;
  border: 2px solid #d4af37;
}
.card-back-art-deco::before,
.card-back-scout-deco::before {
  content: '';
  position: absolute;
  inset: 4px;
  border: 1px solid #d4af3799;
  border-radius: 3px;
  background: repeating-conic-gradient(from 0deg at 50% 50%, #d4af3733 0 10deg, transparent 10deg 20deg);
}
.card-back-art-deco::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 50%;
  height: 34%;
  transform: translate(-50%, -50%) rotate(45deg);
  border: 2px solid #d4af37;
  background: #111;
}

.card-back-retro-sunset {
  background: linear-gradient(#2b1055 0 45%, #7597de 45% 46%, #2b1055 46%);
  border: 2px solid #ffd166;
}
.card-back-retro-sunset::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 44%;
  width: 60%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: repeating-linear-gradient(#ffd166 0 4px, #ef476f 4px 5px);
  mask: linear-gradient(#000 50%, transparent 50%);
}
.card-back-retro-sunset::after {
  content: '';
  position: absolute;
  inset: auto 0 0 0;
  height: 54%;
  background:
    repeating-linear-gradient(90deg, transparent 0 7px, #ef476f88 7px 8px),
    repeating-linear-gradient(0deg, transparent 0 5px, #ef476f88 5px 6px);
}

.card-back-scout-night {
  background: #233d22;
  border: 2px solid #f4f8ef;
}
.card-back-scout-night::before {
  content: '';
  position: absolute;
  inset: 3px;
  border: 1px solid #f4f8ef66;
  border-radius: 4px;
  background:
    repeating-linear-gradient(45deg, transparent 0 3px, #80b6491a 3px 4px),
    repeating-linear-gradient(-45deg, transparent 0 3px, #80b6491a 3px 4px);
}

.card-back-logo {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 72%;
  height: auto;
  transform: translate(-50%, -50%);
}
```

The Scout logo is an `<img>` in the component rather than a CSS `url()`. It then loads from the same path `BrandComponent` uses, and Angular's build doesn't try to resolve it.

- [ ] **Step 2: Create `CardBackComponent`**

`app/shared/components/card-back.component.ts`:

```ts
import { Component, computed, input } from '@angular/core';
import { CardBack } from '../../core/models/session.models';

@Component({
  selector: 'app-card-back',
  standalone: true,
  host: { '[class]': 'backClass()' },
  template: `
    @if (hasLogo()) {
      <img class="card-back-logo" src="brand/logo.svg?v=scout-1" alt="" width="272" height="256" />
    }
  `,
})
export class CardBackComponent {
  readonly back = input.required<CardBack>();
  readonly backClass = computed(() => `card-back card-back-${this.back()}`);
  readonly hasLogo = computed(() => this.back().startsWith('scout-'));
}
```

- [ ] **Step 3: Create `CardBackPickerComponent`**

`app/shared/components/card-back-picker.component.ts`:

```ts
import { Component, input, output } from '@angular/core';
import { CARD_BACKS, CardBack } from '../../core/models/session.models';
import { CardBackComponent } from './card-back.component';

@Component({
  selector: 'app-card-back-picker',
  standalone: true,
  imports: [CardBackComponent],
  template: `
    <div class="flex flex-wrap gap-3" role="radiogroup" aria-label="Card back">
      @for (back of backs; track back.id) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="selected() === back.id"
          [attr.aria-label]="back.label"
          [attr.title]="back.label"
          [attr.data-testid]="'card-back-option-' + back.id"
          (click)="selectedChange.emit(back.id)"
          class="relative w-12 h-[72px] rounded-lg shadow-card transition-all duration-200 ring-offset-2"
          [class.ring-2]="selected() === back.id"
          [class.ring-poker-green-500]="selected() === back.id"
        >
          <app-card-back [back]="back.id" />
        </button>
      }
    </div>
  `,
})
export class CardBackPickerComponent {
  readonly selected = input.required<CardBack>();
  readonly selectedChange = output<CardBack>();
  readonly backs = CARD_BACKS;
}
```

- [ ] **Step 4: Use it on the table**

In `game-room.component.html`, replace `<div class="card-back"></div>` (inside the `hasParticipantVoted` branch, ~line 442) with:

```html
<app-card-back
  [back]="cardBack()"
  data-testid="table-card-back"
  [attr.data-card-back]="cardBack()"
/>
```

In `game-room.component.ts`, import `CardBackComponent` into the component's `imports` array and add `readonly cardBack = this.gameState.cardBack;` next to `deckValues`. In `getCardClasses`, change the voted branch to drop the hardcoded red, since the back now owns its whole look:

```ts
if (this.hasParticipantVoted(participant.id)) {
  return 'shadow-card';
}
```

- [ ] **Step 5: Add the picker to the create form**

`home.component.ts`: import `CardBack`, `DEFAULT_CARD_BACK` and `CardBackPickerComponent` (add the component to `imports`). Then add:

```ts
readonly selectedCardBack = signal<CardBack>(DEFAULT_CARD_BACK);
```

Pass it as the fourth argument in `createSession`:

```ts
const response = await this.sessionService.createSession(
  this.selectedDeck(),
  name,
  this.selectedTimerDuration(),
  this.selectedCardBack(),
);
```

`home.component.html`, directly after the closing `</div>` of the Deck Type `stack-y-2` block and before `<!-- Timer Duration -->`:

```html
<div class="stack-y-2">
  <label class="block text-gray-600 text-sm font-medium mb-1 text-left">Card Back</label>
  <app-card-back-picker
    [selected]="selectedCardBack()"
    (selectedChange)="selectedCardBack.set($event)"
  />
</div>
```

- [ ] **Step 6: Add the picker to the settings panel**

In `settings-panel.component.ts`, add `CardBackPickerComponent` to `imports` and `CardBack` to the model imports. As the first child of `<div class="flex-1 overflow-auto p-4 stack-y-6">`, before the Story Queue block:

```html
@if (isOrganizer()) {
  <div class="stack-y-3">
    <div class="text-sm font-semibold text-gray-700 uppercase tracking-wider">Card Back</div>
    <app-card-back-picker
      [selected]="gameState.cardBack()"
      (selectedChange)="changeCardBack($event)"
    />
  </div>
}
```

In the class:

```ts
async changeCardBack(cardBack: CardBack): Promise<void> {
  await this.gameState.setCardBack(cardBack);
}
```

- [ ] **Step 7: Build and test**

Run: `cd src/frontend/poker-points-app && npm run build && npm test -- --run`
Expected: build succeeds with no new warnings, and all tests pass.

- [ ] **Step 8: Run the app and look at every back**

Start the database, the API and the frontend as described in `AGENTS.md`. Create a session, open a second browser as a player, vote, then switch through all seven backs from the settings panel.

- [ ] **Step 9: Check the compact size**

With enough players, or the size toggle, get the table into compact mode (36×54). Check that each back is distinguishable from the dashed empty slot, that the frame shows against the felt, and that Scout is recognizable. Do the same in dark mode. Tune sizes in `styles.css` only if one fails, and keep Scout's artwork untouched. Take a screenshot of the table at normal size for the PR.

- [ ] **Step 10: Commit**

```bash
git add src/frontend/poker-points-app/src
git commit -m "added card back designs and pickers"
```

---

### Task 5: End-to-end check

**Files:**
- Create: `tests/e2e/specs/card-backs.spec.ts`

**Interfaces:**
- Consumes: `card-back-option-<id>` test ids, `table-card-back` test id with `data-card-back` on table backs, the "Session Settings" button title, and `vote-card-<value>` test ids.

- [ ] **Step 1: Write the test**

```ts
import { test, expect, Page } from '@playwright/test';

async function createGame(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start New Game', exact: true }).click();
  await page.getByPlaceholder('e.g., Riley').fill('Guest Host');
  await page.getByRole('button', { name: 'Vote', exact: true }).click();
  await page.getByTestId('card-back-option-art-deco').click();
  await page.getByRole('button', { name: 'Create Game', exact: true }).click();
  await expect(page).toHaveURL(/\/game\/[A-Z0-9]{6}$/);
  return new URL(page.url()).pathname.split('/').pop()!;
}

test('host picks a card back at creation and changes it live', async ({ page, browser }) => {
  const code = await createGame(page);
  const playerContext = await browser.newContext();
  try {
    const player = await playerContext.newPage();
    await player.goto(`/join/${code}`);
    await player.getByPlaceholder('Enter your name').fill('Player Two');
    await player.getByRole('button', { name: 'Join Game', exact: true }).click();
    await expect(player).toHaveURL(new RegExp(`/game/${code}$`));

    await player.getByTestId('vote-card-5').click();
    for (const participant of [page, player]) {
      await expect(participant.getByTestId('table-card-back')).toHaveAttribute('data-card-back', 'art-deco');
    }

    await page.getByTitle('Session Settings').click();
    await page.getByTestId('card-back-option-scout-night').click();
    for (const participant of [page, player]) {
      await expect(participant.getByTestId('table-card-back')).toHaveAttribute('data-card-back', 'scout-night');
    }
    await expect(player.getByTestId('my-vote')).toContainText('Your vote: 5');

    await player.reload();
    await expect(player.getByTestId('table-card-back')).toHaveAttribute('data-card-back', 'scout-night');
  } finally {
    await playerContext.close();
  }
});
```

- [ ] **Step 2: Run it**

With the API on 5051 and the frontend on 4200 running: `cd tests/e2e && npx playwright test specs/card-backs.spec.ts --project=chromium`
Expected: PASS. If the picker's options sit outside the viewport on the create form, scroll into view with `scrollIntoViewIfNeeded()` before clicking. Don't change the layout to suit the test.

- [ ] **Step 3: Run the full E2E suite**

Run: `cd tests/e2e && npx playwright test --project=chromium`
Expected: all pass. `appearance.spec.ts` checks the create form doesn't scroll sideways at 390px, so a picker that wraps badly would show up there.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/specs/card-backs.spec.ts
git commit -m "added card backs e2e test"
```
