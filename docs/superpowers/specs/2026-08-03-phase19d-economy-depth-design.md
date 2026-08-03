# Phase 19D Design Spike — Economy Depth (Trade Routes & Guilds)

**Status: design decision only. Nothing in this doc is implemented.** Deliverable
is the spec, the rejected alternatives, and a concrete shape for whoever picks up
the implementation as its own phase. Written per PLAN.md Phase 19D.

---

## Motivation and scope

Phase 14's rank-gate diversification gave Merchant and Raider genuine alternative
paths to advancement (Commerce path: wealth + trading houses), and Phase 11's
trading-house income gave the Commerce path real weight. The outstanding question is
whether *economic depth inside a single session* can be extended further — more
strategic decisions beyond the standard tax/land/construction triangle — without
reopening F2 (bilateral inter-ruler trade), which BACKLOG.md § F2 explicitly
deferred: bilateral trade does not fix archetype convergence (the D2 measurement
proved it), adds order-book complexity that would enter `planYear`'s candidate
sweep, and cannot ship without a further rank-gate redesign to make it matter.

Two features survive that test:

1. **D1 — Trade routes / caravans to named NPC powers.** Outbound commerce to the
   Kaiser, the Hanse, Venice, and the Levant. Pays a route-establishment cost;
   yields recurring annual income; carries route-specific event exposure (bandits,
   storms, war severance). Reuses the existing event/exposure machinery.

2. **D2 — Guilds and building specialization.** Markets and mills may specialize in
   a commodity (cloth, iron, wine, salt). Guild petitions arrive as events — grant
   → bonus production; refuse → unrest. Reuses `buildings.ts` + `buildings.json`.

Both are **NPC-facing only.** Neither involves a second ruler on the other side of a
transaction. Both reuse the reducer contract and existing event machinery without
requiring new `Decision` union variants that would complicate the planner's
candidate sweep.

---

## D1 — Trade Routes & Caravans

### Problem the feature solves

Trading houses give a Merchant-path ruler a flat `incomePerYear` per house plus a
wealth-proportional tribute (`taler * tradingHouseTributePercentage`). That is one
strategic dial: build more houses, pay more tribute. The Commerce path lacks a
*directional* choice — you don't choose *who* you trade with, at what risk, or how
exposed your wealth-flow is to external events. A trade-route layer adds those
choices without adding inter-ruler complexity.

### Named NPC powers and their flavour

Four destination archetypes, referenced in `docs/kaiser-research.md` § Trade partner
/ market screen:

| Destination | Flavour              | Primary risk class    | Severability condition       |
|-------------|----------------------|-----------------------|------------------------------|
| Kaiser      | Political favour     | War (Phase 19A truce/weariness state) | Active war with Kaiser (if any) |
| Hanse       | Northern grain/goods | Bandits, storms       | None — always open           |
| Venice      | Southern luxury      | Storms, pirates       | Costly in bad weather years  |
| Levant      | Eastern spice        | Bandits, war far afield | Highest income, highest risk |

Destination is a permanent, named string rather than a free-form label — it drives
risk class lookup and war-severance logic without needing a per-route event catalog.

### State shape sketch

```typescript
// src/engine/state.ts — NOT final schema, illustrative only
export interface TradeRoute {
  destination: 'kaiser' | 'hanse' | 'venice' | 'levant'
  establishedYear: number     // for chronicle / duration tracking
  severed: boolean            // set by war or event; route earns nothing while true
}

// Add to PlayerState:
tradeRoutes: TradeRoute[]
```

`tradeRoutes` replaces the simple `tradingHouses: number` scalar in shape only —
the field stays on `PlayerState` directly, not nested in `BuildingState`, because
routes are active commercial contracts, not constructions on the territory.

No `severed: true` route should earn income. Severed routes may self-heal (event
resolution) or require an explicit re-establishment cost (owner decision).

### Decision shape sketch

```typescript
// src/engine/state.ts — illustrative only
export type TradeRouteDecision = {
  type: 'tradeRoute'
  establish?: 'kaiser' | 'hanse' | 'venice' | 'levant'  // one per year
  abandon?: 'kaiser' | 'hanse' | 'venice' | 'levant'     // explicit exit
}
```

Only one route may be established per year (prevents the AI from front-loading
every route in year 1, and keeps the cost meaningful).

`TradeRouteDecision` is a new member of the `Decision` union. The planner's
candidate sweep would need to evaluate it — see AI notes below.

### Data file sketch — `data/tradeRoutes.json`

```jsonc
// NOT final schema, illustrative only
{
  "routes": {
    "kaiser":  { "establishCost": 8000,  "baseIncomePerYear": 1800, "riskClass": "war",     "wealthCapFraction": 0.004 },
    "hanse":   { "establishCost": 6000,  "baseIncomePerYear": 1500, "riskClass": "bandits", "wealthCapFraction": 0.003 },
    "venice":  { "establishCost": 10000, "baseIncomePerYear": 2200, "riskClass": "storm",   "wealthCapFraction": 0.003 },
    "levant":  { "establishCost": 14000, "baseIncomePerYear": 3000, "riskClass": "bandits", "wealthCapFraction": 0.005 }
  },
  "maxActiveRoutes": 2,
  "requiresRank": 3,
  "severanceSelfHealChance": 0.3,
  "events": {
    "bandit": { "baseExposure": 0.12, "lossType": "talerAndRoute", "mitigationBuilding": "garrison" },
    "storm":  { "baseExposure": 0.08, "lossType": "talerOnly",     "mitigationBuilding": "none"    },
    "war":    { "severedByActiveWar": true }
  }
}
```

`wealthCapFraction`: effective route income is `min(baseIncomePerYear, taler * wealthCapFraction)`.
This is the **anti-snowball shape**: a wealthy ruler's routes earn no more than a
fixed fraction of their treasury per year, so absolute route income *grows* with
wealth but sub-linearly — the same pattern as trading-house tribute
(`taler * tradingHouseTributePercentage` in `economy.json`), applied as a
*ceiling* rather than a floor. A poor ruler benefits proportionally more from a
route; a rich ruler cannot compound routes into runaway income.

`maxActiveRoutes: 2` prevents a ruler from hedging all four simultaneously.

### Reducer steps

Fits into `year.ts` after construction (step 3) and before the grain market
(step 6), in a new **step 4.5** (or wherever war outcomes are resolved post-19A):

1. **Sever check** — for each active route: if `riskClass === 'war'` and an active
   war touches that destination affiliation, set `severed = true`.
2. **Event exposure** — for non-severed routes with a non-`war` risk class: draw a
   route event roll from the existing RNG stream (unconditionally, per the
   disciplined unconditional-draw contract in `events.ts:287-297`), apply bandit
   loss or storm loss against `taler` if the roll fires. Garrison mitigation
   reduces bandit exposure.
3. **Income** — for each non-severed, non-event-hit route: apply
   `min(baseIncomePerYear, taler * wealthCapFraction)` to taler.
4. **Self-heal** — severed routes draw a `severanceSelfHealChance` roll each year;
   on success, `severed` is cleared and the route earns next year.
5. **Chronicle** — record route income, event hits, and sever/heal events. The AI
   and the human UI can both read `chronicle.tradeRouteEvents`.

### AI notes

`planYear` candidate sweep currently evaluates construction and espionage decisions
as discrete point-in-time choices. Route establishment is a multi-year commitment
with expected-value payback — the planner would need a 1-year-forward return that
prices both:

- **Upfront amortization**: `establishCost / paybackYearsHorizon` as a one-time
  cost charged to the current year's budget.
- **Risk-adjusted income**: `baseIncomePerYear * (1 - baseExposure)` rather than
  the full `baseIncomePerYear`.

Personality weights: Merchant's `production` weight already points at trading
houses — trade routes should inherit the same weight. Raider's low `prestige`
weight means it values routes only on raw income; it may prefer Levant (highest
income, highest risk) while Merchant prefers Hanse (safer, shorter payback).

Importantly: `planYear` must evaluate **at most one `establish` per year** to
respect the decision constraint. The planner should score every candidate
`establish` destination and pick the highest-scored one, rather than generating a
`TradeRouteDecision` per destination and letting the reducer implicitly pick the
first — that would introduce ordering-dependent behavior.

### Balance concerns

- **War-severed Kaiser route at 19A interaction**: Phase 19A added war brakes
  (truces, weariness). A ruler at war with the Kaiser archetype (if that concept
  even exists) should have its Kaiser route severed, but Kaiser the rank-title and
  the NPC trade partner are distinct. The spec should clarify whether "war
  severance" means war against *any* rival (all routes close during any active war)
  or only against the specific NPC affiliations. Recommendation: only the `kaiser`
  route is severed during an active war declared *against the player by any rival*
  — it represents political standing, not physical geography. Hanse/Venice/Levant
  sever only on their own risk-class events.
- **Payback window must be longer than a single bad event**: at `baseIncomePerYear
  ≈ 1800` and `establishCost = 8000`, a Hanse route breaks even in ~4.5 years.
  An early bandit event (lossType `talerAndRoute`: severs the route and deals taler
  damage) before break-even should sting but not be catastrophic. The
  `lossType = 'talerOnly'` / `'talerAndRoute'` split handles this — bandits sever
  the route AND cost taler; storms only cost taler. This makes garrison investment
  a real hedge for merchants, not just a war tool.
- **Max 2 active routes** is a conservative first-pass. If `ai-bench` shows
  Merchant running 2 routes and Archbishop-rank with a balance-gate pass, raising to
  3 is a single data-change. Lower is the right starting point.

---

## D2 — Guilds & Building Specialization

### Problem the feature solves

Markets and mills are currently undifferentiated. Building 20 markets is the same
decision as building 10 — just more of the same income. There is no direction to
production buildings beyond *count*, so Merchant and Builder both end up with the
same 25.9 market+mill number (BACKLOG D2 table, pre-Phase-14). Post-Phase-14 the
Commerce path gave Merchant a different *rank strategy* but the *production
building* profile remains undifferentiated. Specialization gives markets/mills a
qualitative choice layer.

### Guild petition mechanism

Rather than a free-choice "pick a specialization" button, guilds arrive as
**petition events** — the same event machinery (`src/engine/events/events.ts`)
used for plague, fire, and famine. A guild event fires when:

- The ruler has at least one unspecialized market or mill (the petition is for
  one building), AND
- They meet a minimum rank/building threshold (e.g. Count+, ≥ 3 markets)

The petition offers a `Decision`-side response:

```typescript
// src/engine/state.ts — illustrative only
export type GuildDecision = {
  type: 'guild'
  action: 'grant' | 'refuse'
  buildingRef?: { kind: 'market' | 'mill'; specialization: GuildType }
}

export type GuildType = 'cloth' | 'iron' | 'wine' | 'salt'
```

- **Grant** → that building gains `specialization: GuildType` on its `BuildingState`
  slot (see state shape below); receives a production bonus (`incomeMultiplier`).
  Annual upkeep rises to reflect the guild's operating costs.
- **Refuse** → one-time unrest spike (`+8` unrest). No specialization, no bonus.
  The guild may re-petition in a future year (weighted lower after a refusal).

Grant/refuse is a yes/no decision, not a construction spend — which keeps the
planner's candidate sweep tractable (binary branch, not a cost search).

### State shape sketch

```typescript
// Extends BuildingState — NOT final schema, illustrative only
export interface SpecializedBuilding {
  kind: 'market' | 'mill'
  specialization: GuildType
  incomeMultiplier: number   // stored on state so it can vary by event
}

// Add to PlayerState:
guilds: SpecializedBuilding[]   // only specialized buildings tracked here;
                                 // unspecialized markets/mills remain in BuildingState counts
```

Keeping `guilds` as a separate array (rather than replacing `BuildingState.markets`
with a typed array) minimizes blast radius: the existing `calculateBuildingIncome`
and `calculateUpkeep` paths continue operating on plain counts for unspecialized
buildings; guild income is computed in a separate pass that sums
`incomePerYear * incomeMultiplier` across `guilds`.

This is the same layering principle as `tradeRoutes` vs `BuildingState`.

### Data sketch — additions to `data/buildings.json`

```jsonc
// NOT final schema, illustrative only — additions to existing buildings.json
{
  "guilds": {
    "cloth": { "incomeMultiplier": 1.40, "upkeepSurcharge": 200, "petitionMinRank": 2, "petitionMinBuilding": 3 },
    "iron":  { "incomeMultiplier": 1.35, "upkeepSurcharge": 180, "petitionMinRank": 2, "petitionMinBuilding": 2 },
    "wine":  { "incomeMultiplier": 1.50, "upkeepSurcharge": 250, "petitionMinRank": 3, "petitionMinBuilding": 4 },
    "salt":  { "incomeMultiplier": 1.45, "upkeepSurcharge": 220, "petitionMinRank": 3, "petitionMinBuilding": 3 }
  },
  "guildPetitionBaseChance": 0.15,
  "guildRefusalUnrestSpike": 8,
  "guildRefusalRepetitionWeight": 0.4
}
```

`incomeMultiplier * incomePerYear` replaces the flat `incomePerYear` for
specialized buildings only. The bonus is intentionally not enormous (1.35–1.50×)
to avoid making specialization a dominant strategy — it should reward a deliberate
builder who has *already* built production depth, not let a single guild grant
double a sparse ruler's income.

### Event surface

The petition fires via `events.ts`'s standard weight/mitigation machinery, not as
a special-cased `if` in `year.ts`. Its difference from a negative event is that it
carries a `Decision`-side response (`grant` / `refuse`), analogous to how the
original game asked the player for ransom decisions in events. This maps to an
existing pattern: `chronicle.pendingDecision` (if that mechanism is introduced) or
a one-year-delayed resolution where the player's submitted `GuildDecision` is read
next year (simpler, no new chronicle variant needed).

Refusal unrest is already priced by the AI via `evaluator.ts`'s `unrest`-penalty
weight — no new evaluator dimension is needed, just a `grant`/`refuse` branch in
the planner's event-response scoring.

### Balance concerns

- **Dominant specialization risk**: cloth (highest market upkeep) might be
  universally optimal if `incomeMultiplier` isn't calibrated against the upkeep
  surcharge. `ai-bench` is the right verification tool — if all five archetypes end
  up with the same `guilds[]` composition, the multipliers/surcharges need another
  pass.
- **Petition frequency**: `guildPetitionBaseChance: 0.15` means a ruler with
  10 unspecialized markets will face ~1.5 guild petitions per year on average —
  plausible, but could become noise if uncapped. A cap of 1 petition per year (or
  per `kind`) prevents petition spam in a mature economy.
- **No guild should ever make a market strictly worse**: `incomeMultiplier` must
  exceed 1.0 AND the surcharge must not exceed `(multiplier - 1) * incomePerYear`
  at a realistic market count. With `iron: 1.35` and `incomePerYear` (market) at
  whatever `buildings.json` sets it, verify `0.35 * incomePerYear > 180` before
  locking the data. This is a numerical check for the implementation phase, not
  this spec.
- **Interaction with D1**: a wine-specialized mill might plausibly increase the
  Venice route's income (thematic link). This is explicitly **not in scope for a
  first pass** — leave it as an open question rather than coupling D1 and D2 from
  the start.

---

## Non-goals (explicit)

- **F2 bilateral inter-ruler trade.** Both D1 and D2 are NPC-facing. Neither
  adds a second ruler to any transaction. F2 remains deferred per BACKLOG.md.
- **Implementation in Phase 19D.** This is a design spike. No `.ts` files change,
  no tests run, no data files ship. The output is this document and the PLAN.md
  pointer.
- **A guild UI screen.** Petition events surface through the existing event/chronicle
  display. No new tab is implied.
- **Map or geography.** Trade routes use named destination strings, not map nodes.
  A real geography model (see BACKLOG.md F4 deferred geography) is out of scope.
- **Route/guild income carrying over to the rank gate.** Neither feature should
  directly change rank promotion thresholds or counting. Their income feeds the
  Commerce-path's `wealthMin` the same way any other income does — implicitly,
  not with a dedicated rank requirement.

---

## Recommended build order

**D2 (guilds) before D1 (trade routes).** Rationale:

1. D2 is entirely within the existing `buildings.ts` / `buildings.json` / event
   machinery. It adds a `GuildDecision` union member and a `guilds[]` array to
   `PlayerState`, but touches no new sub-system.
2. D1 requires a new data file (`data/tradeRoutes.json`), a new `TradeRoute[]`
   field on `PlayerState`, a new `TradeRouteDecision` union member, and an extension
   of the RNG stream ordering (the unconditional route-event draws must be placed
   correctly). That is a larger surface.
3. D2's balance impact is bounded by `guildPetitionBaseChance` and the
   `incomeMultiplier` values — a balance gate re-run after D2 is a contained pass.
   D1's interaction with Phase 19A's war-brakes state (route severance) means D1
   needs the war-brakes code to already be stable before the interaction can be
   calibrated.
4. D2 gives the AI planner a new binary branch (grant/refuse petitions) which is
   easier to evaluate before D1 adds a multi-year commitment evaluation. Land the
   simpler evaluator extension first.

If D2 reveals unexpected balance regressions, D1 can be scoped to a separate phase
without losing D2's gains.

---

## Open questions for the owner

1. **Kaiser-route war severance scope**: should an active war against *any* rival
   sever the Kaiser route (political standing falls), or only a war where the
   Kaiser himself is a party (which has no current engine equivalent)? The first is
   implementable today; the second requires a Kaiser NPC concept.

2. **Route re-establishment cost**: should a self-healed severed route resume
   automatically (cheap to model, risks trivializing severance risk) or require the
   player to pay a reduced re-establishment fee next turn? The design above uses
   auto-heal (`severanceSelfHealChance`); a decision-based re-establishment would
   add another `TradeRouteDecision` variant.

3. **Guild petition timing**: should the player see the petition in the *current*
   year's decision panel (same year as the event, grant/refuse before End Year is
   pressed) or resolve it *next* year (petition arrives in the chronicle, response
   submitted the following year)? Same-year is more responsive; next-year is
   simpler (no mid-year decision variant needed on `PlayerState`).

4. **Maximum guild count**: should there be a cap on total specialized buildings
   (e.g. 4 guilds maximum), or is the effective cap just "however many petitions
   fire"? A hard cap prevents a fully-specialized Merchant from running 20 guild
   markets, which may or may not be the right design.

5. **D1 + D2 income stacking**: combined, trade routes and guilds add two new
   income channels to the Commerce path. Is the intent that Merchant/Raider can
   realistically reach Kaiser rank *via the Commerce path alone* (not needing
   palace or population) if they fully optimize D1+D2? Or should D1+D2 make the
   Commerce path *more competitive* without making it the single fastest path? The
   balance gate will answer this empirically, but the intended design intent should
   be stated before implementation.

---

## Acceptance criteria for the future implementation phase

These are the criteria a phase that picks up D1 and/or D2 must satisfy before it
can be considered done. None are currently checked.

### D1 — Trade routes

- [ ] `PlayerState` carries `tradeRoutes: TradeRoute[]`; it survives a
  `clonePlayerState` and `persist.ts` round-trip byte-identically.
- [ ] `advanceYear` with zero trade routes is byte-identical to the current output
  on the existing golden fixture (no RNG stream shift without routes).
- [ ] A seeded test confirms: a route established in year N earns income in year
  N+1; a bandit event in year N+1 (forced via seed selection) severs the route
  and charges taler loss; no income in year N+2; self-heal fires in year N+3 (seed
  selected); income resumes in year N+4.
- [ ] `calculateBuildingIncome` (or its successor that handles routes) returns a
  route income that satisfies `income ≤ taler * wealthCapFraction` at all wealth
  levels — verified by property test over a wealth range of 1,000–2,000,000 Taler.
- [ ] `ai-bench` after D1: Merchant mean rank ≥ 5.0; at least one route active per
  Merchant ruler by year 20; balance gate re-passes all four criteria unchanged.
- [ ] The Phase 19A war-brakes interaction is explicitly tested: a ruler with an
  active war has its war-risk route severed; a non-war-risk route is unaffected.

### D2 — Guilds

- [ ] `PlayerState` carries `guilds: SpecializedBuilding[]`; it survives
  `clonePlayerState` and `persist.ts` round-trip.
- [ ] A seeded test confirms: a guild petition fires when `markets >= petitionMinBuilding`
  AND rank ≥ `petitionMinRank`; granting raises income by `incomeMultiplier`; refusing
  raises unrest by `guildRefusalUnrestSpike`; petition does NOT fire again for the
  same building the following year (refusal cooldown applies).
- [ ] Guild income satisfies `(incomeMultiplier - 1.0) * incomePerYear > upkeepSurcharge`
  for every guild type — verified by a static data-integrity test (no specialization
  should ever make a building strictly worse on net).
- [ ] `ai-bench` after D2: at least one guild active per Merchant/Builder ruler by
  year 30; Builder and Merchant show meaningfully different guild compositions (not
  all rulers specializing identically); balance gate re-passes all four criteria.
- [ ] The existing `calculateBuildingIncome` test baseline is updated with a
  golden fixture that includes guilds — so any future change to income math is
  forced to deliberately regenerate it, not accidentally shift it.

### Combined

- [ ] `npm run balance` gate re-passes after both D1 and D2 are live in the same
  build. The gate may not be run mid-D1 before D2 is added — the combined income
  channels need a single calibrated pass, not two incremental ones.

---

*Written 2026-08-03. Implementation deferred. Design decisions above are subject to
owner review and revision before any code is written.*
