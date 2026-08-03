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

### F2. Inter-ruler trade — deferred, its justification is now known false
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
`docs/kaiser-research.md` calls for. Re-open F2 only alongside a genuine rank-gate
redesign that would actually use it, not as a D2 fix.

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
would predictably regress the gate, not just add a feature.

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
`tradingHousesMin` groups (ranks 5-7) see little use in this run because most
archetypes plateau below Margrave before wealth-only paths matter — **flagged for a
follow-up calibration pass, not blocking**, per the design doc's own dominant-path-
risk and path-count-dilution warnings. Balance gate re-passes unchanged
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
