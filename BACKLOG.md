# Kaiser 3 — Backlog

Known bugs, dead code, and missing features, kept out of PLAN.md so the phase plan
stays a plan rather than a bug list. Everything here has been **verified against the
code or measured**, not assumed. Items are removed when fixed, not ticked off.

Ordered by severity within each section.

---

## Bugs

### ~~B1. The top three ranks are unreachable — the cathedral cannot be built~~ ✅ FIXED (Phase 8)
Cathedral population gate lowered from 5,000 to 2,800 (just under Archbishop's own
threshold). Kaiser is now reached around year 120 in solo play and in 7 of 24
competitive matches. Original diagnosis kept below because the lesson generalises.
`data/ranks.json` requires a cathedral for **Archbishop (5)** and **Kaiser (7)**, but
`data/buildings.json` gates the cathedral behind **5,000 population** — above the
measured ceiling of ~4,600 under ideal play. Measured: `cathedral = 0` in every run,
rank capping at **Margrave (4)** even after 300 years.

Introduced in Phase 6: rank population thresholds were recalibrated down to match the
population model, but the cathedral's own population gate was not, so a coupled
constraint silently became the binding one. *Lesson: when recalibrating a threshold,
check every other requirement that depends on the same quantity.*

### ~~B2. `dead` / `heir` are checked but never set~~ ✅ FIXED (F5, Phase 11)
`dead` is now genuinely set by `checkExtinction()` when population collapses to
nothing — the one permanent failure state — instead of being derived separately (and
never actually written) in three different callers. `heir` is set on succession
(always `player.id`: Kaiser 3 is a continuous single session, not hot-seat, so there
is no separate heir entity to route to — a deliberate, documented simplification, see
`src/engine/succession.ts`).

### ~~B3. Trading houses are inert~~ ✅ FIXED (Phase 11)
`ConstructionDecision.tradingHouseBuild` now exists, is rank-gated at Margrave (data
in `data/buildings.json` commerce.tradingHouse), capped at 3, and generates real
income (`calculateBuildingIncome`) sized to roughly offset the existing tribute at
typical Margrave-era wealth before falling behind as wealth grows further — an
anti-snowball shape, not a strictly-losing building. AI and human UI both build them.

### ~~B4. `TradeDecision` and `WarDecision` are validated but never executed~~ ✅ ADDRESSED (Phase 11)
`WarDecision` is now fully implemented (F4) and executed every year for both AI and
human. `TradeDecision` (inter-ruler trade, F2) is still out of scope — removed from
the `Decision` union entirely per this entry's own prescribed remedy, rather than
left validated-but-inert. Re-add only alongside the phase that implements F2.

### ~~B5. Cathedral's own population gate is ABOVE the first rank that requires it~~ ✅ FIXED
Lowered `data/buildings.json` cathedral `requiresMinPopulation` from 2800 → **2600**
to match Archbishop Prestige-path `populationMin` in `data/ranks.json` (the first
rank with `cathedral: true`). The `_note` on the cathedral entry now says to keep
that coupling when ranks are recalibrated — same lesson as B1.

### ~~B6. Malformed Decision fields could poison PlayerState to NaN permanently~~ ✅ FIXED (Phase 13)
`advanceYear()` does NOT call `validateDecisions()` (`src/engine/decisions.ts`)
itself — that check happens at the UI/AI boundary, by convention. `resolveFeeding()`
(`src/engine/economy.ts`) already established the right response to a malformed
field reaching the engine anyway (degrade to the safe choice, documented as
load-bearing, not defensive padding), but it was the only place that rule was
applied. Audited every other Decision-consuming engine function and found the same
gap repeatedly: `Math.max`/`Math.min`/`Math.floor` do **not** self-heal `NaN`
(`Math.max(0, NaN)` is `NaN`, not `0`), so a NaN tax rate, land order, construction
count, espionage hire/strike count, custom feed percentage, or grain trade order
would poison a `PlayerState` field that is a running total mutated year over year —
one bad number, once, corrupts every year after it for that ruler. Fixed with a
shared `src/engine/sanitize.ts` (`finiteOr`, `sanitizeRate`) applied at the entry of
`tax.ts`, `land.ts`, `buildings.ts` (all construction counts funnel through one
`buildCapped` closure, sanitized once), `espionage.ts` (recruitment and strike), and
the two remaining gaps in `economy.ts` itself (custom feed `?? 50` only caught
`undefined`, not `NaN`; the grain-market sell/buy path had no guard at all).
Verified end-to-end via `advanceYear()` (`tests/malformedInput.test.ts`), not just
unit-by-unit: every numeric field NaN in one sheet, and a clean second year
afterward, both stay fully finite.

---

## Missing features

### ~~F1. Grain market~~ ✅ DONE (Phase 8)
Surplus can be sold to the Kaiser and bought back at a markup. Consumption was
recalibrated from 0.5 to 8.0 per peasant (the old figure gave a 25× surplus, which is
not an agricultural economy), grain now spoils at 18%/yr with a storage ceiling in
years of consumption, and harvests draw from named weather bands. Original entry:

### F1-original. Grain market — no way to sell surplus
The original's central loop is buying and selling corn (`docs/kaiser-research.md`
§ Trade partner / market screen). Kaiser 3 has **no way to price or sell grain at
all**, with three consequences already measured:
- Harvests run roughly **25× consumption**, so stockpiles reach hundreds of thousands
  and do nothing whatsoever.
- Sabotage loot is nearly worthless: the Schemer lost matches despite sabotage
  **succeeding over 70% of the time**, because it was paid in a commodity with no price.
- Inter-ruler trade (F2) cannot be built at all, since grain cannot be valued.

Requires re-running the balance gate — it adds a whole income channel.

### F2. Inter-ruler trade — deferred, cannot ship without a rank-gate redesign
Buying and selling between rulers with per-ruler pricing, and the original's
in-fiction decree that at least 10% of goods be offered for sale. No longer blocked
on F1 (grain has a real price since Phase 8), but deferred anyway: F2's stated
purpose was diversifying the archetypes (D2), and Phase 12's F4 measurement shows a
second economic route to rank doesn't touch that convergence — the binding
constraint is the victory condition, not a shortage of routes. F2 is also
substantially larger than F4 (bilateral offer book, matching, partial fills, value
conservation, money-pump risk, and it must not enter the AI planner's candidate
sweep, which is already the performance-sensitive path — see D4). A small precursor
was taken instead: `prices.cornPriceBands` (previously dead data — defined,
referenced nowhere) is now wired into a real corn-price drift (Phase 12,
`driftCornPrice()` in `src/engine/economy.ts`) — field-wide harvest scarcity nudges
the Kaiser's price, the Hanse-style "price + weather" uncertainty
`docs/kaiser-research.md` calls for. **Session decision (Cursor, post-Phase 18):**
still cannot ship — would re-add complexity that measured data says does not fix
archetype convergence; re-open only alongside a genuine further rank-gate redesign
that would actually use bilateral trade, not as a D2 fix. D2 commerce calibration
(unlock/floors/evaluator) is the correct lever for commerce-path underuse.

### ~~F3. Multi-season grain storage~~ ✅ DONE (Phase 8)
Spoilage at 18%/yr (roughly half a reserve survives three years) plus a hard storage
ceiling expressed in years of consumption, which a granary raises. Grain is now a real
but wasting asset: worth carrying through one bad harvest, impossible to hoard.

### ~~F4. Warfare, alliances, and geography-gated attack~~ ✅ DONE (Phase 11, scoped down)
`src/engine/war.ts`: declared wars resolved probabilistically from `warStrength()`
(garrison + guards + population levy — no new unit system), with requested allies
joining data-driven-probabilistically (more likely against a defender stronger than
themselves — the same balance-of-power logic as leader-focused espionage). Both
sides always take a real casualty regardless of outcome; the winner takes land
(capped at half the loser's holdings) and reparations, and the loser's garrison has
a real chance of being destroyed.

**Deliberately NOT built:** an actual battlefield scene or geography-gated attack
requiring passage permission from intervening rulers — Kaiser 3 has no map/region
model to hook that into (unlike the research doc's assumption). Land changing hands
is the closest available stand-in for a territorial consequence. A real map is a
bigger, separate feature.

### ~~F5. Succession and heirs~~ ✅ DONE (Phase 11, scoped down)
`src/engine/succession.ts`: no chance before a 15-year minimum reign, then a small
and rising annual chance (capped) of the reign ending — territory/rank/buildings
persist unchanged, only the reign's own accumulated `score` (a new field: cumulative
productive income this reign) resets to zero.

**Deliberately simplified:** the research doc's heir is `player.id` (self) rather
than routing to a different entity — Kaiser 3 is one continuous session against AI
rivals, not a hot-seat handoff between human players, so there is no separate heir
to choose from. A real multi-heir/dynasty system is a multiplayer-era feature,
correctly deferred per CLAUDE.md.

### ~~F6. Flood and drought events~~ ✅ DONE (Phase 12, Path B)
Built as genuinely agriculture-linked, per the original research framing, not a
data-only reskin of the existing catalog (a "Path A" reskin was considered and
rejected during planning: it would have made flood≈fire and drought≈famine, failing
this project's own rule that every event needs a distinct mitigation hook). New
exposure drivers `harvestShortfall`/`harvestExcess` (`src/engine/scarcity.ts`) are
driven by the same weather roll that decided that year's harvest, so drought/flood
compound a real bad/wet year rather than rolling independently — the same
relationship famine already has to a real feeding shortfall. New loss types `grain`
(drought) and `farmland` (flood); mitigated by `well` (drought, alongside fire) and
a new `dike` building (flood). The AI's forward risk-pricing needed a real fix, not
just a new context field: pricing off the mean weather multiplier (~1.02) collapsed
drought exposure to exactly zero forever (`max(0, 1-1.02) = 0`, a Jensen's-gap trap —
`E[f(X)] ≠ f(E[X])` for the nonlinear exposure formula); fixed by computing the true
expectation `E[max(0, 1-m)]` over the weather-band distribution instead of deriving
it from a single expected multiplier.

### F7. Fog of war and the spy phase — deferred, would regress the balance gate
The original's espionage had a spying step that revealed a rival's guard count.
Meaningless today because all state is visible. Needs hidden information first —
which is also what would make bluffing and misdirection possible. Deliberately
deferred past the hardening phase (Phase 12 planning pass): leader-focused
targeting is the anti-snowball lever `src/ai/balance.ts` criteria 2 and 3 measure,
and it works precisely because AIs can see who is leading — hiding that information
would predictably regress the gate, not just add a feature. **Session decision
(Cursor, post-Phase 18):** still cannot ship — any fog that blinds AI standings
breaks the measured anti-snowball criteria unless the balance harness and AI
targeting are redesigned together (out of scope for a feature-only pass).

---

## Balance and design findings

### ~~D1. Kaiser is out of reach in a normal-length game~~ ✅ STALE, RE-MEASURED (Phase 13)
The original figures ("Duke ~60y, Count ~120y, Margrave ~300y") predated Phase 8's
food-scarcity rework and B1's cathedral fix, and had already been contradicted by
Phase 12's ai-bench (mean rank 3.27, i.e. past Count, at year 60 in a competitive
5-ruler match — the two could not both be true).

Re-measured directly (`scripts/rank-timing.ts`, 20 seeds x 5 archetypes, **solo
play** — deliberately without rivals competing for the same land/titles, to answer
D1's original "how hard is progression" question on its own terms rather than
conflated with competitive pressure, which BACKLOG D2 covers separately):

| Rank | Mean year reached | Reached within 300y |
|---|---|---|
| Duke | 28.8 | 100% |
| Prince | 45.4 | 100% |
| Count | 61.6 | 100% |
| Margrave | 79.5 | 99% |
| Archbishop | 111.4 | 63% |
| King | 111.4 | 63% |
| Kaiser | 126.6 | 58% |

Kaiser — the win condition — is reached in the majority of solo runs, at a mean
year well inside a normal-length game (`maxYears` defaults to 60 in the UI, but a
player can set up to 300). **Not unwinnable.** Whether the pacing (Duke by ~29,
Kaiser only reachable past ~127 on average) is the right shape for difficulty
presets (Phase 13's `data/difficulty.json`) to tune around is a live, separate
question — but "out of reach" is retired as a finding.

### D2. Archetypes converge — and it is a victory-condition problem, not a missing-mechanics one ✓ (implemented Phase 14)
Noted in Phase 5, partly helped by Phase 7's aggression, and then **regressed** by
Phase 8: making food a real constraint turned population into the effective gate on
every senior rank.

**Measured in Phase 12** (`npm run ai-bench`, 12 solo matches/archetype, after F4
had a full match-year to matter):

| Archetype | Taler | Pop | Land | Mkt+Mill | Palace | Rank |
|---|---|---|---|---|---|---|
| Builder | 695,451 | 2227 | 13,240 | 25.9 | 16.0 | 3.67 |
| Expansionist | 766,873 | 2127 | 13,256 | 26.0 | 16.0 | 3.58 |
| Merchant | 736,713 | 1651 | 13,097 | 25.9 | 10.8 | 2.17 |
| Schemer | 802,802 | 2155 | 13,159 | 25.8 | 16.0 | 3.50 |
| Raider | 723,774 | 1955 | 13,093 | 25.8 | 12.1 | 2.92 |

Land is identical to three significant figures across every archetype: **all five
buy exactly to the 13,000 ha palace gate and stop.** Builder/Expansionist/Schemer
are effectively the same ruler; Merchant/Raider differ only by underperforming, not
by pursuing a different route.

**F4 (warfare, live since Phase 11.5) moved this number not at all.** It gave every
archetype a coalition-war option, but every archetype already reaches the same land
ceiling without it — a new mechanic in front of the same single gate just produces
another way to hit the same wall. The convergence is caused by the *victory
condition itself* (one palace/population gate every strategy must clear), not by a
shortage of mechanics feeding into it.

**This reframes what would actually fix it.** F2 (inter-ruler trade) was previously
proposed as the fix on the theory that a second route to rank would diversify play —
that theory is now falsified by the F4 measurement above, since F4 *was* a second
route and changed nothing. A real fix needs a different **victory condition or
rank-gate shape**, not another economic channel feeding the same gate.

**Design decision (Phase 13 spike): `docs/d2-rank-gate-design.md`. Implemented
Phase 14.** Every rank now carries alternative requirement GROUPS — a ruler
qualifies via any one group in full. Ranks 1-4 (Duke-Margrave) add a
Land/Population alt path alongside the original Prestige/palace path, gated on
nothing downstream of itself. Ranks 5-7 (Archbishop-Kaiser) add a Commerce alt
path (wealth + `tradingHousesMin`) instead, since `tradingHouse` is itself
rank-gated at Margrave and can't help earlier. `rankProgress()` takes `max` across
groups (each group's own progress is `min` across its requirements), staying
continuous. `evaluator.ts`'s `palaceLandEnablement()` is now path-aware: it only
nudges toward palace-gate land when the Prestige path is at least as promising as
every alt path for that ruler, so a Commerce-leaning ruler isn't bribed into land
they don't need.

**Re-measured** (`npm run ai-bench`, 12 solo matches/archetype, 40 years):

| Archetype | Taler | Pop | Land | Mkt+Mill | Palace | Rank |
|---|---|---|---|---|---|---|
| Builder | 338,848 | 2538 | 13,358 | 23.8 | 13.3 | 5.17 |
| Expansionist | 340,609 | 2515 | 12,266 | 22.2 | 13.3 | 5.58 |
| Merchant | 582,947 | 1874 | 12,540 | 25.1 | 12.2 | 3.00 |
| Schemer | 371,202 | 2266 | 12,939 | 24.6 | 16.0 | 4.92 |
| Raider | 621,172 | 1894 | 12,626 | 25.0 | 13.3 | 2.83 |

Merchant/Raider now bank roughly **60-80% more treasury** than Builder/Expansionist
instead of merely underperforming them — a genuinely different strategy (accumulate
wealth via the alt paths) rather than a worse version of the same one. Land is no
longer a flat, identical ceiling across every archetype. Palace-stage separation is
real but modest (Merchant 12.2 vs. Builder/Expansionist 13.3); the Commerce path's
`tradingHousesMin` groups (ranks 5-7) saw little use because most archetypes
plateaued below Margrave before wealth-only paths mattered — **calibrated** in a
follow-up pass: trading-house unlock moved Count←Margrave; Margrave gained a
Commerce rung; senior commerce population/wealth floors lowered toward
Merchant/Raider's high-treasury low-pop profile; evaluator scores trading houses
as production so Merchant's production weight points at them. Re-measured
(`npm run ai-bench` profile, 12 solo × 60y): Merchant mean rank **5.17** (was 3.00)
with **2.0** trading houses (was ~0); Raider **6.08** / 2.5 houses; all five
archetypes now lease houses. Balance gate re-passes unchanged
(margin flatness, loss persistence, lead volatility, no-death-spiral all PASS).

### ~~D5. The balance gate is one-sided~~ ✅ ADDRESSED (Phases 11.5 + 13)
It guards against snowballing but not against a death spiral: strongly negative
returns pass the margin-flatness test trivially. Phase 8's five-ruler run shows the
leader's return going to **−1.36%** by decade 6 with setback rates at 100%, which is
plausibly the leader-focused aggression working as designed (the "leader" each year
is by definition whoever is being targeted) but is not currently distinguishable from
a game that is simply grinding everyone down. Add a floor as well as a ceiling.

**A diagnostic now exists (Phase 11.5).** `npm run balance` prints a DIAGNOSTICS
block that is explicitly not part of the gate: leader return vs **non-leader**
return side by side, field-wide population/holdings/rank trajectory, and the
extinction rate. The leader/non-leader pair is the discriminator this entry asked
for — the design *intends* the leader to have a hard time, so a negative leader
return beside a healthy non-leader return is the anti-snowball lever working,
whereas both negative is a spiral. Field growth and extinction rate settle it
either way. Criterion 4 ("no death spiral", Phase 13) now gates on the same
fields — see the entry below.

### ~~D5 numeric floor~~ ✅ DONE (Phase 13)
`src/ai/balanceCriteria.ts` gained a fourth criterion, "no death spiral," built
from the exact same DIAGNOSTICS fields the Phase 11.5 block already computed
(`nonLeaderReturnByDecade`, `fieldPopulationByDecade`, `fieldHoldingsByDecade`,
`extinctionRate`) — a reader no longer has to interpret them, a spiral shape now
fails the gate outright. Verified against hand-constructed report objects
(`tests/balanceCriteria.test.ts`), not just real matches: a synthetic spiral-shaped
report that would satisfy criteria 1-3 (a falling return trend "passes" margin
flatness; a high setback rate "passes" loss persistence) is confirmed to fail
criterion 4, and the actual Phase 12 measured shape (including its worst-decade
non-leader return, −0.61%) is confirmed to still pass — the floor catches a real
spiral without being tight enough to fail on ordinary noise.

**The Phase 11 entry that stood here was wrong and has been removed.** It claimed
war had made loss-persistence leap to 78–96%/decade with margin flatness running
negative from decade 4. Both figures were instrument error, not game behaviour —
see PLAN.md Phase 11.5. Corrected, leader return is **positive in every decade**,
decaying 5.48% → 0.79%, which is the intended anti-snowball shape.

### ~~D3. Land beyond labour capacity is inert~~ ✅ DONE (Phase 13)
Farmland is labour-gated at 5 ha per peasant, so a realm starts with **twice the land
it can work**. This is realistic and it is what makes population the true constraint,
but it made "buy land" a trap for a new player with nothing in the UI to explain it.

The Land tab (`src/ui/app.ts`'s `renderLandTab`) now shows worked vs. idle hectares
directly, computed via `laborGatedFarmland()` (`src/engine/economy.ts`) — the SAME
function the harvest itself uses, so the displayed split can never disagree with
what actually happens at harvest time. Verified in-browser: a starter realm (10,000
ha, 1,000 peasants) correctly shows 5,000 ha worked / 5,000 ha idle.
### ~~D4. The balance gate's five-ruler configuration is slow~~ ✅ ADDRESSED (Phases 12 + 13)
**Phase 12** fixed the algorithmic waste in `planYear` (~4× suite speedup, golden-
fixture verified decision-neutral). **Phase 13** added match-count parallelisation
via `worker_threads` (`scripts/balance-worker.ts`, `src/ai/balanceParallel.ts`) —
byte-identical to serial, ~4.6× faster wall-clock, with serial fallback if workers
fail. No further D4 work outstanding.

---

## Platform

### ~~P1. Playable in a mobile browser, iOS included~~ ✅ DONE (Phase 9)
Built mobile-first: touch-first controls (steppers/sliders/segmented — no free-text
numeric entry anywhere in normal play), portrait-first layout with `env(safe-area-inset-*)`
and `100dvh` for the iOS dynamic toolbar, `devicePixelRatio`-aware canvas, and a static
build (47.75 kB JS / 15.56 kB gzipped, root-relative asset paths — deployable to any
static host, no backend). Verified at a 375×812 (iPhone) viewport: zero horizontal
overflow, zero console errors across a full 20-year game including every tab, the
espionage flow, and game-over.

`planYear`'s candidate sweep measured **in-browser**, not just in Node: 30-118ms per
year at 2-5 rivals — comfortable even at 3-6x phone slowdown, no Web Worker needed.

**Real bug found by that measurement, not by inspection:** the year-advance handler
used a double `requestAnimationFrame` to yield one frame before the heavy synchronous
planning work. rAF callbacks are tied to the display compositor and **do not fire at
all** while a tab isn't actively compositing (backgrounded, screen-locked, mid-navigation
on some mobile browsers) — confirmed directly: an "advance year" call that should take
~50ms instead hung for 6+ seconds in a non-compositing browser context, because the rAF
callback simply never fired at the normal rate. Replaced with `setTimeout(fn, 0)`, which
still yields a turn for the loading screen to paint but fires regardless of visibility.
Left as a note for Phase 10+: **any future use of rAF in this codebase should go through
the same scrutiny** — it is the wrong primitive for "defer this synchronous work",
right only for "run this in sync with the next paint".

### ~~P2. Bug report → GitHub Issues integration~~ ✅ DONE (Phase 9.5)
`api/bug-report.ts` is a Vercel serverless function that files an in-game bug
report as a GitHub issue (label `bug-report`) on `jonathanbasler-a11y/kaiser3`.
This is the one deliberate exception to the "no backend" invariant — bug
reports need to outlive a static deploy. Reads via `GITHUB_TOKEN` and
`GITHUB_REPO` env vars set on Vercel (fine-grained PAT, Issues read/write only,
scoped to this repo). Read reports anytime with:
`gh issue list --repo jonathanbasler-a11y/kaiser3 --label bug-report`

### F8. Save / load — three local slots ✅ DONE
Browser `localStorage` slots (`src/ui/saves.ts`, validated by `src/engine/persist.ts`).
Setup screen loads any of three slots; in-game **Save game** overwrites a chosen
slot with an optional **name**. **Export** downloads a `.json` file; **Import**
loads it into a slot on another device — the portable path across phones/PCs
without a cloud backend (static-hosted invariant). Corrupted / wrong-version
blobs are rejected. Clears with site data.

### ~~D6. `rivalStartingMultiplier`'s HANDICAP direction doesn't reliably hold~~ ✅ FIXED
Root cause (measured): modest taler/farmland cuts that leave farmland **above**
`laborGatedFarmland` capacity do not reduce early harvest (starter: 10,000 ha vs
5,000 labor cap at 1,000 peasants × 5 ha). The "handicapped" Builder then follows
path-dependent plans that can *outperform* standard on materialScore win-rate
(~40-47% at N=300 — wrong direction). Head-start direction was already real
(54-59%).

Fix: extend `rivalStartingMultiplier` with **population** (and scale `grainStock`
proportionally so the ~1-year food buffer stays fair). Easy 0.9 / hard 1.1
peasants move day-one labor capacity. Measured after fix: standard beats easy
~77% (N=150); hard beats standard ~75%. Handicap test in `tests/difficulty.test.ts`
unskipped.

---

# Full-codebase audit — 2026-08-03 (post-PR #26)

Findings from a systematic read-only audit run after the five same-day PRs
(#22–#26) landed on top of Phase 18. **Nothing here was fixed** — this pass was
documentation-only by instruction. Every entry cites `file:line` with the actual
line quoted, so each is re-checkable without trusting the audit.

Loop-by-loop yield (the diminished-returns stopping decision, shown rather than
asserted): Loop 1 (UI↔engine duplication + engine invariants) **25**; Loop 2
(AI/balance layer) **8**, incl. 2 High; Loop 3 (data integrity) **3**; Loop 4
(test suite) **2**, both Low. Stopped after Loop 4 — the curve had flattened and
the mechanical scans were returning mostly false positives.

**Verified as HOLDING** (recorded so they stay closed, and so nobody re-derives
them): `advanceYear` reducer purity — input state confirmed byte-identical after
a maximal decision sheet; save/load round-trip — confirmed byte-identical, no
`PlayerState` field dropped by `persist.ts`; Decision-field NaN sanitization — no
unsanitized numeric Decision read found anywhere in the engine.

**PR2 stream closeout:** B7, B10, R1, the high-frequency part of R2, and T3 are
fixed on the PR2 stream branch. S1 and the remaining S/T entries are still open.
R2 still has separately documented residual conditional draws in succession,
espionage, and the ally-join loop.

## Bugs

### ~~B7. All rivals share one planning seed — `id.length` doesn't differentiate them~~ ✅ FIXED (PR2 stream branch)
`src/ai/sim.ts:156`, `src/ui/app.ts:1401`, `src/ui/preview.ts:46`:
```ts
const planningSeed = seed + year * 104729 + competitor.id.length
```
The `+ id.length` term exists to give each ruler its own planning seed. It fails
wherever ids are the same length, which is **the main game path**:
`app.ts:322` builds `` `rival${i + 1}` `` — `rival1`…`rival5` are *all* 6
characters, so every rival plans with an identical seed every year.

It also fails in the balance harness. `scripts/balance.ts:25` maps personality ids
to player ids, giving `builder`(7), `expansionist`(12), `merchant`(8),
`schemer`(7), `raider`(6) — **`builder` and `schemer` collide**, in the 5-ruler
configuration that gates every balance-sensitive change in this project.

The codebase already contains the correct idiom in two places:
`scripts/play.ts:156` uses `+ index`, and `tests/difficulty.test.ts:42-43` passes
`+ 1` / `+ 2` explicitly. The broken `+ id.length` form appears at 9 sites
(`sim.ts`, `app.ts`, `preview.ts`, `gen-golden-fixture.ts` ×2,
`hardening-measure.ts` ×2, `golden.test.ts` ×2).

Not a crash — rivals still differ by personality and by their own state — but the
intended decorrelation of evaluation noise is simply absent. **Fixing this will
shift the golden fixture and the ai-bench baseline**, so it needs a deliberate,
reviewed regeneration, not an incidental one.

Fixed by replacing the length-based salt with deterministic per-id planning seed
salts everywhere the planner stream is derived (`sim`, UI preview/app paths,
golden generation/tests, and hardening measurement). T3 now guards same-length id
decorrelation, and `tests/fixtures/planner-golden.json` was deliberately
regenerated after the stream shift.

### ~~B8. The War tab computes odds from a treasury the engine will have already spent~~ ✅ FIXED (PR1 silent branch)
`src/ui/app.ts:857-868` (`pendingWarAttacker`) re-implements `year.ts` steps
2/2.5/3 with none of the engine's clamps:
```ts
applyMilitaryInvestment(invested, draft.trainingInvest, draft.equipmentInvest)
invested.guards = player.guards + Math.max(0, draft.guardHire)
invested.buildings.garrison = player.buildings.garrison + Math.max(0, draft.garrisonBuild)
```
- It runs `applyMilitaryInvestment` against the **full** treasury, but `year.ts:159`
  (recruitment) spends before `year.ts:172` (military investment). The tab can show
  training/equipment levels the engine will clamp away.
- Guards are added with no `ESPIONAGE.maxGuards` cap and no affordability check —
  `espionage.ts:145-148` applies both.
- Garrison is added with no cost check and no `Math.max(0, 1 - garrison)` cap
  (`buildings.ts:71`).

The War tab's odds line is the one place in the UI that does **not** go through
`previewYear()`, even though `preview.ts` already caches the rivals' real
`planYear` decisions.

### ~~B9. The AI has the same treasury-order bug as B8~~ ✅ FIXED (PR1 silent branch)
`src/ai/warAggression.ts:147`:
```ts
let spendable = self.taler - (isAggressor ? MILITARY_RESERVE_AGGRESSOR_TALER : MILITARY_RESERVE_DEFENDER_TALER)
```
`planMilitaryInvestment` is priced **directly**, not through the planner's
one-year-forward candidate sweep (the file's own header explains why), so its
affordability assumption is never validated by simulation. It plans against the
start-of-turn treasury while `year.ts` has already spent on land trade (step 1)
and recruitment (step 2). `applyMilitaryInvestment` then silently clamps. Unlike
the human, no one reads the AI's shortfall — the investment just doesn't happen.

### ~~B10. `resolveWar` floors casualties but not population transfer~~ ✅ FIXED (PR2 stream branch)
`src/engine/war.ts:196-197` vs `:230-232`:
```ts
const winnerCasualties = Math.floor(winner.population.peasants * WARFARE.casualtyFractionWinner)
...
const populationTransferred = loser.population.peasants * WARFARE.populationTransferFraction
```
Casualties are floored; the transfer is not. Every war therefore leaves both sides
with a fractional peasant count, which then flows into `annualGrainRequirement`,
`laborGatedFarmland`, rank `populationMin` checks and the UI. Inconsistent within
a single function — whichever convention is right, both should follow it.

Population transfer now follows the same integer-peasant convention as war
casualties.

### ~~B11. Grain "available" has two different definitions depending on preview state~~ ✅ FIXED (PR1 silent branch)
`src/ui/app.ts:887-890`:
```ts
const projectedHarvest = preview?.harvestYield ?? expectedHarvestYield(player)
const available = preview ? feedStockFromChronicle(...) : player.grainStock + projectedHarvest
```
The `preview == null` fallback silently drops spoilage **and** the storage cap that
`feedStockFromChronicle` exists to model — so the same tile means two different
things depending on whether `previewYear` happened to return a result.

### ~~B12. "Net" in the income breakdown is a third, different definition of Taler change~~ ✅ FIXED (PR1 silent branch)
`src/ui/app.ts:1443-1472`:
```ts
const net = shown.reduce((sum, [, v]) => sum + v, 0)
```
Excludes construction spend, land trade, recruitment/military spend, event gold
loss, raids and war reparations. The footer's `Taler ±delta` (`app.ts:627`) is the
real `talerAfter − talerBefore`. Two different numbers under the same label — in
the release whose stated purpose was coherence.

### ~~B13. The UI caps guard/saboteur hiring far below what the data allows~~ ✅ FIXED (PR1 silent branch)
`src/ui/app.ts:1183,1189` set `max: 10` for guard and saboteur hire, while
`data/economy.json` sets `maxGuards: 25` / `maxSaboteurs: 25` (applied at
`espionage.ts:145,150`). A third, different cap exists in the AI at
`aggression.ts:111` (`Math.min(3, …)`) and `:140` (`Math.min(4, …)`). Three layers,
three caps, none derived from the data.

## Correctness and robustness (latent — currently masked, still real)

### ~~R1. `war.ts:242` advances the RNG stream conditionally, inside a short-circuit~~ ✅ FIXED (PR2 stream branch)
```ts
if (loser.buildings.garrison > 0 && rng.next() < WARFARE.garrisonDestructionChanceLoser) {
```
Whether the loser *owns a garrison* decides whether the shared stream advances.
This is the exact fragility class as D6 above, and it directly contradicts the
deliberate discipline two files over — `events.ts:287-297` ("Draw BOTH the
occurrence roll and the severity roll unconditionally") and
`positiveEvents.ts:48-53` ("Draws exactly 3 values … UNCONDITIONALLY").

The garrison-destruction roll is now drawn unconditionally, then applied only when
the loser has a garrison.

### ~~R2. `population.ts:62` was the highest-frequency conditional draw in the pipeline~~ ✅ FIXED (PR2 stream branch)
Immigration now draws its roll unconditionally in `population.ts`, then applies it
only if the thriving gate passes (`unrest < 15 && feedAdequacy >= 0.95 &&
feedAdequacy <= 1.3`). This removes the measured high-frequency drift where a
3-player year drew 60 values, but setting one player's unrest to 50 made it 59.

Residual conditional draws remain and need separate, scoped fixes. ✅
`cursor-audit-s-t-cleanup` fixed the scoped `succession.ts` death roll before
`minReignYears` and the `espionage.ts` zero-saboteur strike roll by drawing before
gating application. The ally-join loop at `war.ts` still draws once per surviving
requested ally and remains deliberately open.

### ~~R3. `clonePlayerState` does not coerce NaN, and a comment says it does~~ ✅ FIXED (PR1 silent branch)
`src/engine/state.ts:23-25` claims both `clonePlayerState()` and `persist.ts`'s
`normalizePlayer()` "coerce them to a real 0, so neither can silently drop out of a
cloned or saved state." `persist.ts` does (`Number.isFinite`). `clonePlayerState`
does **not** — `state.ts:311-312` uses `?? 0`, which does not catch `NaN`.
Verified: a `PlayerState` carrying `trainingLevel: NaN` survives cloning and
poisons **12 fields** in one year. Not reachable from a Decision or a save today
(both are sanitized), but reachable from any hand-constructed state in a test,
script, or the AI layer. The same wording appears for `dike` at `state.ts:52-53`.

### ~~R4. The hand-written clone's compile-time guarantee doesn't cover optional fields~~ ✅ FIXED (PR1 silent branch)
`src/engine/state.ts:281-283` claims the clone "fails loudly at compile time if a
new field is ever added to PlayerState/GameState without also being copied here."
True for **required** fields only — a new `foo?: number` is silently accepted by
the object literal and would drop out of every clone. `dike`, `trainingLevel` and
`equipmentLevel` are all in this category and are currently handled by hand.
`normalizeBuildings` (`persist.ts:36-49`) is a whitelist with the identical hole.

### ~~R5. `starter.ts:55` shares `buildings` by reference~~ ✅ FIXED (PR1 silent branch)
`applyStartingMultiplier` spreads `...player` and rebuilds `land` and `population`
explicitly, but not `buildings`. Verified at runtime: mutating
`scaled.buildings.markets` leaks into the original. Currently masked because both
call sites immediately overwrite the source slot — but it is exactly the
nested-reference pattern the rest of the engine is careful to avoid.

### ~~R6. A typo'd `loss.type` in `data/events.json` would fire a silently inert event~~ ✅ FIXED (PR1 silent branch)
`validateEventCatalog` (`events.ts`) checks ids, the mitigation hook, mitigation
bounds, `floorProbability <= maxProbability` and jitter range — but **not**
`loss.type`. Neither `applyEventLoss` nor `evaluator.ts:240-275` has a `default`
case. So an unrecognized loss type passes validation, applies no loss, prices no
risk, and still logs to the chronicle as though it happened.

### ~~R7. `validatePositiveEventCatalog` never checks the reward ranges are finite~~ ✅ FIXED (PR1 silent branch)
`positiveEvents.ts:31-44` validates ids, text, `rewardType`, and
`CHANCE_PER_YEAR ∈ [0,1]`, but not `range.min`/`range.max`. `positiveEvents.ts:63`
(`range.min + magnitudeRoll * (range.max - range.min)`) would then write `NaN`
directly into `taler`/`peasants`/`grainStock` — the one unguarded numeric write in
the newest engine file.

### ~~R8. Pre-F5 saves are rejected on fields whose newer siblings default~~ ✅ FIXED (PR1 silent branch)
`persist.ts:78-79` calls `finiteNumber` unconditionally on `score` and
`reignYears`, so a save written before F5 fails outright — while `dike`,
`trainingLevel`, `equipmentLevel` and `heir` all tolerate absence and default.
Asymmetric with `persist.ts:81-84`'s own stated philosophy ("a save written before
military investment existed is still a valid save"). Reject-not-lose, so no silent
data loss, but the rule isn't applied consistently.

## Simplification and data discipline

### ~~S1. `maxLandTransferShare` can never bind — it is a constant-fold, not a cap~~ ✅ FIXED (`cursor-audit-s-t-cleanup`)
`src/engine/war.ts:205-208`:
```ts
const landTransferred = Math.min(
  loserTotalLand * WARFARE.landTransferFraction,
  loserTotalLand * WARFARE.maxLandTransferShare
)
```
Both terms scale off the **same** `loserTotalLand`, so this reduces to
`loserTotalLand * min(0.08, 0.5)` — a comparison of two config constants that
never depends on game state. Measured from `data/economy.json`:
`landTransferFraction = 0.08`, `maxLandTransferShare = 0.5`, so the cap never has
any effect. The comment claims a gameplay rule ("capped so a single war can never
claim more than maxLandTransferShare of the loser's holdings") that the data
contradicts by a factor of 6. Either the cap should be measured against a
different base (cumulative transfer, or the winner's holdings), or it is dead
config that should say so. Related: `warAggression.ts:196` prices `landAtStake`
using `landTransferFraction` alone — correct *today* only because 0.08 is the
smaller constant; raise it above 0.5 and the AI's pricing silently diverges from
the engine, breaking that file's own stated contract.

### ~~S2. Hardcoded game stats in `src/`, against CLAUDE.md's explicit rule~~ ✅ FIXED (`cursor-s2-data-driven-stats`)
Starter realm, feeding dial fractions/adequacy bands, population unrest/migration
gates, tax unrest divisor, alliance power peasant weight, and event severity
exposure ceiling now live in `data/economy.json` (`starter`, `feeding`, extended
`population`, `taxation.unrestExcessDivisor`, `warfare.alliancePowerPeasantWeight`,
`eventSeverity`). Engine modules read those keys; retuning no longer requires
editing `/src`.
Original findings kept below for history:
- `src/engine/starter.ts` — every starting stat was a literal
  (`taler: 15000`, `farmland: 10000`, `grainStock: 11000`, `peasants: 1000`).
- `src/engine/population.ts` — unrest/migration model constants.
- `src/engine/economy.ts` — Min/Max feed dials and underfed/overfed bands.
- `src/engine/tax.ts` unrest excess divisor; `war.ts` alliance power proxy;
  `events.ts` max severity exposure multiplier.

### ~~S3. Constants duplicated in `src/` that already exist in `data/`~~ ✅ FIXED (`cursor-audit-s-t-cleanup`)
- **Palace stage count `16`** at `app.ts:652,1069,1073` and `evaluator.ts:160`,
  while `buildingsData.prestige.palace.stages` is live and used at
  `buildings.ts:79`. `evaluator.ts` is the worst case: it already imports
  `PALACE` (line 32) and uses `PALACE.landRequirement` at `:217`, yet writes
  `player.buildings.cathedral * 16` at `:160`.
- **Trading-house max `3`** at `app.ts:1140,1141,1152`, while
  `COMMERCE.tradingHouse.maxCount` is used at `buildings.ts:102`.
- **`KAISER_RANK = 7`** in `gameLoop.ts:10`, `sim.ts:15`, `app.ts:91`, plus a bare
  `rank >= 7` at `render.ts:337` — while `getTopRank()` (`ranks.ts:123`) exists and
  is used only by `scripts/` and `tests/`.
- **Farmland/building-land prices** `30`/`50` inlined at `sim.ts:45-46`, duplicating
  `prices.farmlandBasePrice` / `prices.buildingLandBasePrice`.
- **`app.ts:979,985`** state "~5 ha per peasant" in prose, restating
  `HARVEST.laborHectaresPerPeasant: 5` — will go stale silently.

### ~~S4. Dead keys in `data/buildings.json`~~ ✅ FIXED (`cursor-audit-s-t-cleanup`)
Never referenced by any `.ts` file in `src/`, `scripts/` or `tests/`:
`production.market.laborRequirement`, `production.mill.laborRequirement`,
`prestige.palace.completeAtStage`, and `mitigation.{hospital,well,granary,garrison,dike}.mitigates`.

The five `mitigates` keys are the notable ones: they are a **second, unenforced
declaration** of the event↔building mitigation relationship, which actually lives
in `data/events.json` (`event.mitigation.building`) and is validated one-way only
(`validateEventCatalog` checks event→building, nothing checks building→event). Two
sources of truth for one relationship, one of them inert and free to drift. Same
class as `cornPriceBands` before Phase 12.

### S5. The UI re-implements engine logic that is one `export` away
**Deferred (`cursor-audit-s-t-cleanup`):** deep UI-vs-engine reimplementation
cleanup remains open by scope.
- `app.ts:695-743` (`requirementTiles`) reimplements rank gating; the engine's
  `meetsRequirementGroup()` (`ranks.ts:29-36`) is the same logic but is **not
  exported**.
- `app.ts:1067,1097-1099` duplicate the palace/cathedral gates from
  `buildings.ts:78,84-89` verbatim.
- `app.ts:830-835` (`expectedHarvestYield`) is a third copy of the weather-band
  weighted mean, alongside `economy.ts:24` and `evaluator.ts:123-131`.
- `decisions.ts:150-154` (`yearsOfFoodLabel`) duplicates `evaluator.ts:70-74`'s
  `yearsOfFoodHeld()`.
- `app.ts:1031-1040` (`mitigationDetail`) reads `eventsData.events` raw, bypassing
  `getEventCatalog()` and therefore `validateEventCatalog()`.
- `decisions.ts:156-159` (`affordableHectares`) is used at `app.ts:959-960` as two
  independent maxima, but `land.ts:39-52` clamps the **combined** order by
  proportional scaling — so both maxima can never actually be taken together.

### ~~S6. `land.farmland + land.buildingLand` appears at 12 sites with no helper~~ ✅ FIXED (`cursor-audit-s-t-cleanup`)
`buildings.ts:38`, `war.ts:204`, `evaluator.ts:147,216`, `planner.ts:73,180`,
`sim.ts:110`, `balance.ts:72`, `warAggression.ts:196,197`, `app.ts:651,1059`.

### ~~S7. One aggression constant serves two unrelated policies~~ ✅ FIXED (`cursor-audit-s-t-cleanup`)
`warAggression.ts:28` `MIN_AGGRESSION_TO_CONSIDER_WAR = 0.5` gates **whether to
declare war** at `:172`, and separately decides the **investment reserve tier**
(8k vs 30k) via `isAggressor` at `:102`. The file's comments treat these as
distinct policies ("aggressors arm early and cheaply, defenders only once rich"),
but retuning one silently retunes the other.

### ~~S8. `aggression.ts` breaks its own stated invariant at exactly 2 saboteurs~~ ✅ FIXED (`cursor-audit-s-t-cleanup`)
`:147-148` — "Commit most of the barracks, but keep a seed to rebuild from":
```ts
const committed = Math.max(2, Math.floor(self.saboteurs * 0.75))
```
At `saboteurs === 2` (the smallest value the guard at `:143` admits):
`floor(1.5) = 1`, `max(2, 1) = 2` — it commits **all** of them, keeping no seed.
Correct from 3 upward.

### ~~S9. Stale comments~~ ✅ FIXED (`cursor-audit-s-t-cleanup`)
- `planner.ts:216` cites "year.ts:38" for the clone; it is at `year.ts:54`.
- `state.ts:23-25` and `:52-53` — see R3.
- `state.ts:281-283` — see R4.
- `war.ts:201-203` — see S1.

## Test debt

### ~~T1. `malformedInput.test.ts` never exercises the `war` decision~~ ✅ FIXED (`cursor-audit-s-t-cleanup`)
`tests/malformedInput.test.ts:121-145` ("a fully malformed sheet — every numeric
field NaN") omits the `war` decision entirely, so `trainingInvest`/`equipmentInvest`
as `NaN` never reaches `advanceYear` in the suite that exists to catch exactly
that. (Checked manually during this audit: it does pass — `war.ts:93,100` sanitize
correctly. The gap is coverage, not a live defect.) `dikeBuild: NaN` is likewise
only covered in the construction-only case at `:65`.

### ~~T2. Two AI tests still assert on a single hardcoded seed~~ ✅ FIXED (`cursor-audit-s-t-cleanup`)
`tests/ai.test.ts:321` and `:330` run `runMatch([...], 500, 60)` / `(…, 500, 120)`
against one fixed seed. This is the class that broke during Phase 18D when a new
RNG-consuming step shifted stream positions — the file's neighbour at `:305`
already averages over `SEEDS = [500, 3000, 9000, 15000, 21000]` for that reason.
The rest of the suite is in good shape here: most stochastic tests already loop
200–500 seeds.

### ~~T3. Nothing guards against a same-length-id planning-seed collision~~ ✅ FIXED (PR2 stream branch)
B7 above went undetected because no test asserts that two rulers in the same match
receive different planning seeds. A direct assertion would have caught it in the
5-ruler balance configuration.

Covered by a direct same-length-id planning-seed decorrelation regression test.

## Platform / infra

### ~~P3. `/api/bug-report` is an unauthenticated public endpoint that files real GitHub issues, with no rate limiting~~ ✅ FIXED (`cursor-audit-s-t-cleanup`)
`api/bug-report.ts` — the one deliberate backend exception (see F8's neighbour
above) — validates payload shape and length, but has no CAPTCHA, no per-IP/per-
session throttling, and no origin check. The client
(`src/ui/app.ts:169-240 mountBugReport`) is a plain unauthenticated `fetch('/api/bug-report', …)`;
nothing about the request proves it came from the actual game UI.

Browser-only cross-origin abuse is blocked by CORS preflight (the request is
`Content-Type: application/json`, a non-simple request), but CORS is enforced by
browsers, not by the server — a script or `curl` can POST directly to the deployed
URL with no restriction at all. Each accepted POST spends the project's
`GITHUB_TOKEN` to file a real issue on `jonathanbasler-a11y/kaiser3` labeled
`bug-report`. Low likelihood today (the URL isn't advertised beyond the in-game
button), but the blast radius if found is real: issue-spam on the repo, or
exhausting the token's GitHub API rate limit. Worth a lightweight mitigation
(per-IP throttling, a honeypot field, or a shared-secret header set by the client
build) before this endpoint is ever linked to or discovered externally.

## User-reported (live bug reports, `gh issue list --repo jonathanbasler-a11y/kaiser3 --label bug-report`)

Three real in-game reports came in via `/api/bug-report` during this session
(issues #27–#29, all iPhone/mobile). Root-caused against the current code below;
not fixed, per this pass's document-only instruction.

### ~~B14. Grain sold this turn can never fund a same-turn build~~ ✅ FIXED (issue #27)
> "I build without gold and then sold a lot of grain but it did not build? Error
> message that there was only 14k left at time of build" — Tab: grain, Year 1.

Root cause, confirmed against `year.ts`'s own numbered pipeline comment
(`year.ts:66-89`): **construction is step 3; the grain market is step 6**,
*after* feeding (step 5) — deliberately, so a ruler sells genuine surplus rather
than the grain in the peasants' mouths (`year.ts:224-225`'s comment). That
ordering is correct for feeding, but it also means **grain-sale income can never
be spent on construction queued the same turn** — the treasury construction sees
at step 3 has not yet received step 6's proceeds. This is a distinct instance of
the same underlying class A2 was built to surface (silent same-turn spending-order
shortfalls) — but A2's shortfall detection is keyed off requested-vs-actual
building counts, not off "you tried to fund this with an income source that
hasn't landed yet," so the shortfall message here (if A2 fires at all) doesn't
explain *why*. Two independent fixes are possible: reorder the pipeline (risky —
would need re-verification against every test tied to the current step numbers),
or make this specific case legible (an explicit note when a construction shortfall
coincides with a same-turn grain sale: "grain sale proceeds land after
construction this turn — queue the sale a turn ahead").

Fixed via the legibility route (kept the pipeline order, which every other
step-numbered test depends on): `year.ts` now peeks at the queued grain
decision before construction's shortfall checks, and if a construction
shortfall occurred *and* a grain sale was queued the same turn, appends
`"This turn's grain sale settles after construction, so its proceeds didn't
count toward the build above — queue the sale a turn ahead if you're relying
on it to fund one."` to `report.shortfalls`. Covered by
`tests/integration.test.ts` (`describe('same-turn spending order (bug report
#27)')`) — one test confirming the note appears alongside a genuine shortfall,
one confirming it does NOT appear when there's no shortfall to explain.

### ~~B15. Tax rates silently reset to default every single turn~~ ✅ FIXED (issue #29)
> "Goes back to default every turn" — Tab: tax, Year 3.

Root cause, confirmed at `src/ui/app.ts:1428`:
```ts
session.draft = trackDraft(defaultDraft(result.state.players[HUMAN_ID]))
```
Every End Year advance replaces the **entire** draft object with
`defaultDraft()`, including `vat`/`incomeTax`/`tariff`/`justiceGraft`
(`decisions.ts:56-59`, defaults `15/15/5/0`). That reset is correct for the
one-shot decisions in the same draft (land trade, construction, recruitment,
military investment, grain trade) — those genuinely should not carry over. But
tax rates are a **standing policy**, not a one-shot order, and a player who sets
a rate once should reasonably expect it to hold until changed — instead it
silently reverts every year, so any deliberate tax strategy is undone the moment
the player stops re-entering it. Fix shape: carry `vat`/`incomeTax`/`tariff`/
`justiceGraft` forward from the previous draft into the new one at line 1428,
rather than sourcing them from `defaultDraft()`.

Fixed exactly as described: `app.ts:1428` now captures the previous draft's
four tax fields before rebuilding from `defaultDraft()`, then spreads them back
in — every other field (land, construction, recruitment, military, grain
trade, war) still resets as before. Browser-verified: set VAT to 30% on the
Tax tab, ended the year, and the next year's Tax tab still showed 30% instead
of reverting to the 15% default.

### ~~B16. Population change has no visible breakdown anywhere in the UI~~ ✅ FIXED (issue #28)
> "Unclear where growth and shrinking is coming from - should be seen at end
> turn stats and during turn in forecast" — Tab: overview, Year 1.

Confirmed: `PlayerChronicle` already computes `births`, `deaths`, `emigration`,
and `immigration` every year (`year.ts:241-244`, from `applyPopulationDynamics`),
but the UI renders **only** `emigration`, and only conditionally
(`app.ts:1584-1585`, gated on `report.emigration > 1`) — `births`, `deaths`, and
`immigration` are computed and then discarded. `populationProjectionText`
(`app.ts:831`, A6's forward projection) likewise shows only the net before/after
delta, not its components. So neither the end-of-turn report nor the in-turn
forecast the user is asking for actually breaks the number down — the data
exists end-to-end, it's just never surfaced. Straightforward fix: a births/
deaths/emigration/immigration line in the year-report log (same pattern as the
existing emigration entry) and/or a components tooltip on the population
projection.

Fixed both places, from one shared `populationBreakdownText()` helper so the
forecast and the report can't disagree: `preview.ts`'s `YearPreview` now
carries `births`/`deaths`/`emigration`/`immigration` straight from the
chronicle; the Grain tab's forward projection appends the breakdown inline;
and the year-end report replaces the old emigration-only line with a full
"Population: +38 born, −17 died, +3 immigrated (net +24)" line, keeping the
"unrest is taking its toll" framing when emigration is significant. Covered by
`tests/uiCoherence.test.ts` (asserts the components sum to the same delta the
footer already shows) and browser-verified: the year-end report's breakdown
matched the footer's net exactly.
