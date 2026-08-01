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

### B5. Cathedral population gate is inconsistent with the ranks that need it
Beyond B1: the cathedral needs 5,000 population while **Archbishop asks 3,000, King
3,500 and Kaiser 4,200**. Even after B1 is fixed, the building requirement should be
stated in terms of the ranks it gates rather than drifting independently.

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

### D1. Kaiser is out of reach in a normal-length game
Even setting B1 aside, progression measures **Duke ~60y, Count ~120y, Margrave ~300y**.
Whether that is "hard" or simply unwinnable is a judgment call for Phase 11's
difficulty presets. Recorded rather than quietly tuned away.

### D2. Archetypes converge — and it is a victory-condition problem, not a missing-mechanics one ⚠️
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
rank-gate shape**, not another economic channel feeding the same gate. Recorded as a
design question for the hardening phase, not a benchmark to re-run.

### D5. The balance gate is one-sided
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
either way. The gate itself is unchanged; only the reader's ability to interpret
"PASS" honestly has improved. **A numeric floor on the criteria themselves is still
not implemented** — that remains open.

**The Phase 11 entry that stood here was wrong and has been removed.** It claimed
war had made loss-persistence leap to 78–96%/decade with margin flatness running
negative from decade 4. Both figures were instrument error, not game behaviour —
see PLAN.md Phase 11.5. Corrected, leader return is **positive in every decade**,
decaying 5.48% → 0.79%, which is the intended anti-snowball shape.

### D3. Land beyond labour capacity is inert
Farmland is labour-gated at 5 ha per peasant, so a realm starts with **twice the land
it can work**. This is realistic and it is what makes population the true constraint,
but it makes "buy land" a trap for a new player with nothing in the UI to explain it.
A UI affordance is needed (worked vs. idle hectares), not a mechanics change.

### D4. The balance gate's five-ruler configuration is slow ⚠️ partially addressed (Phase 12)
Roughly 4× the per-match cost of three rulers; a 200-match run exceeds practical
runtime. Current results are reported at 60 matches. Consider parallelising the
harness or profiling `planYear`, whose candidate sweep dominates.

**Phase 12 profiled and fixed the algorithmic waste**, not the match count.
~48% of `planYear`'s cost was `JSON.parse(JSON.stringify())`: 960–1,650 candidates ×
`EVALUATION_SEEDS=2` = 1,920–3,300 `advanceYear` calls per `planYear`, each cloning
the full `GameState`. Fixed, in order: hoisting `isolate()` out of the
per-candidate/per-seed loop (advanceYear never mutates the state it's given, so one
clone can serve every candidate and seed in a `planYear` call, not one per
candidate-seed pair); a hand-written structural clone
(`cloneGameState`/`clonePlayerState`, `src/engine/state.ts`) replacing the JSON
round-trip in `year.ts` and `evaluator.ts`'s `applyExpectedLosses`. Full test suite
52.5s → 13.6s (~4×); `npm run ai-bench` re-run after and matched the pre-optimization
baseline (`tests/fixtures/ai-bench-baseline.json`) byte-for-byte, so this was pure
speedup with zero decision drift, verified rather than assumed. **Excluded:** a
`PlayerChronicle` clone optimization worth only 5–10% that would have widened
`advanceYear`'s signature — CLAUDE.md treats that as load-bearing.

**Critical prerequisite this fix depended on:** there was previously no committed
golden baseline for planner decisions. `determinism.test.ts` only compares two runs
*in the same process*, so an optimization that consistently changes which candidate
wins still passes it silently. `tests/golden.test.ts` (new) diffs live `planYear`
output against a fixture committed to disk, regenerated only via a deliberate,
reviewed run of `scripts/gen-golden-fixture.ts` — this is what let the performance
pass above be verified as decision-neutral rather than merely assumed to be.
Still open: match-count parallelisation (workers) was not attempted this phase.

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

### P2. Bug report → GitHub Issues integration (Phase 9.5)
`api/bug-report.ts` is a Vercel serverless function that files an in-game bug
report as a GitHub issue (label `bug-report`) on `jonathanbasler-a11y/kaiser3`.
This is the one deliberate exception to the "no backend" invariant — bug
reports need to outlive a static deploy. Reads via `GITHUB_TOKEN` and
`GITHUB_REPO` env vars set on Vercel (fine-grained PAT, Issues read/write only,
scoped to this repo). Read reports anytime with:
`gh issue list --repo jonathanbasler-a11y/kaiser3 --label bug-report`
