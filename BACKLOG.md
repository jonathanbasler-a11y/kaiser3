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

### F2. Inter-ruler trade
Buying and selling between rulers with per-ruler pricing, and the original's
in-fiction decree that at least 10% of goods be offered for sale. **Blocked on F1.**
Deliberately not attempted in Phase 7: trading grain is meaningless while grain has no
price, and half a trade system is worse than none.

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

### F6. Flood and drought events
Named in the research as agriculture-linked events; the event engine supports them
with no new machinery, but they are not in `data/events.json`.

### F7. Fog of war and the spy phase
The original's espionage had a spying step that revealed a rival's guard count.
Meaningless today because all state is visible. Needs hidden information first —
which is also what would make bluffing and misdirection possible.

---

## Balance and design findings

### D1. Kaiser is out of reach in a normal-length game
Even setting B1 aside, progression measures **Duke ~60y, Count ~120y, Margrave ~300y**.
Whether that is "hard" or simply unwinnable is a judgment call for Phase 11's
difficulty presets. Recorded rather than quietly tuned away.

### D2. Archetypes converge — and Phase 8 made it worse ⚠️
Noted in Phase 5, partly helped by Phase 7's aggression, and then **regressed** by
Phase 8: making food a real constraint turned population into the effective gate on
every senior rank, so every competent archetype now grows one. At the standard test
configuration all five finish within ~5% of each other on treasury; only the
Merchant and Raider stay visibly leaner (palace 13–14 vs 16, population ~1,900 vs
~2,350). The distinctness test asserts only that narrower claim.

The fix is not more weight-tweaking — it is genuinely different **routes** to rank,
which means F2 (inter-ruler trade) and F4 (warfare). F4 landed in Phase 11; F2 is
still out of scope. **Not yet re-measured** — `npm run ai-bench` (the archetype
distinctness benchmark) was not re-run this phase, only the balance harness (a
different measurement). Re-check before assuming warfare actually diversified the
archetypes rather than just adding uniform pressure to all of them equally.

### D5. The balance gate is one-sided
It guards against snowballing but not against a death spiral: strongly negative
returns pass the margin-flatness test trivially. Phase 8's five-ruler run shows the
leader's return going to **−1.36%** by decade 6 with setback rates at 100%, which is
plausibly the leader-focused aggression working as designed (the "leader" each year
is by definition whoever is being targeted) but is not currently distinguishable from
a game that is simply grinding everyone down. Add a floor as well as a ceiling.

**Phase 11 (warfare, F4) made this sharper, not just theoretically live.** Post-war
balance re-run (60 matches × 60 years, 5 rulers): the gate still **passes** every
criterion, but loss-persistence jumped from Phase 6's baseline **27–51%/decade to
78–96%/decade**, and margin-flatness now runs **negative** from decade 4 onward
(−0.06% to −0.90%). War is now clearly the dominant aggression channel — a
leader-focused AI declaring war on whoever's ahead hits far more often and far
harder than espionage alone did. Not fixed here: the gate's own one-sidedness (this
same entry) means "still passes" cannot distinguish "checked hard" from "ground
down," and this is exactly the scenario that ambiguity was already flagged against.
Worth a dedicated look before treating war's current tuning as final — likely
candidates if it turns out to be too punishing: lower `warfare.casualtyFractionLoser`
in `data/economy.json`, or raise `MIN_WIN_PROBABILITY` in
`src/ai/warAggression.ts` so AI rulers commit to fewer, more clearly-favorable wars.

### D3. Land beyond labour capacity is inert
Farmland is labour-gated at 5 ha per peasant, so a realm starts with **twice the land
it can work**. This is realistic and it is what makes population the true constraint,
but it makes "buy land" a trap for a new player with nothing in the UI to explain it.
A UI affordance is needed (worked vs. idle hectares), not a mechanics change.

### D4. The balance gate's five-ruler configuration is slow
Roughly 4× the per-match cost of three rulers; a 200-match run exceeds practical
runtime. Current results are reported at 60 matches. Consider parallelising the
harness or profiling `planYear`, whose candidate sweep dominates.

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
