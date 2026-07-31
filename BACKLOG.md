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

### B2. `dead` / `heir` are checked but never set
`PlayerState.dead` is read in four places in `year.ts` and is **never assigned true**;
`heir` is never read at all. Succession is designed (research doc: designate an heir,
inherit territory and rank, score resets to zero) but unimplemented, so the fields are
inert. Either implement succession (F5) or drop the fields — do not leave a
half-wired mechanic that looks live.

### B3. Trading houses are inert
`calculateUpkeep()` charges a wealth-proportional tribute *if* `tradingHouses > 0`, and
`data/ranks.json` advertises `unlockedFeature: "tradingHouses"` at Margrave — but
nothing ever increments the counter. `ConstructionDecision` has no field for it. The
tribute has therefore **never once fired**, and the Margrave unlock is a promise the
game does not keep.

### B4. `TradeDecision` and `WarDecision` are validated but never executed
Both are members of the `Decision` union and are fully validated by
`validateDecisions()`, so a caller can submit one and receive no error and no effect.
Silent no-ops are worse than missing features. Either implement (F2, F4) or remove
from the union until the phase that does.

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

### F4. Warfare, alliances, and geography-gated attack
`war.ts` does not exist. The research describes a battlefield screen, alliance voting,
and passage permission from intervening rulers.

### F5. Succession and heirs
On a ruler's death, designate an heir who inherits territory and rank but starts from
zero score — a legacy mechanic, and the counterpart to B2.

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
which means F2 (inter-ruler trade) and F4 (warfare). Re-check after both.

### D5. The balance gate is one-sided
It guards against snowballing but not against a death spiral: strongly negative
returns pass the margin-flatness test trivially. Phase 8's five-ruler run shows the
leader's return going to **−1.36%** by decade 6 with setback rates at 100%, which is
plausibly the leader-focused aggression working as designed (the "leader" each year
is by definition whoever is being targeted) but is not currently distinguishable from
a game that is simply grinding everyone down. Add a floor as well as a ceiling.

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

### P1. Playable in a mobile browser, iOS included ⭐
The game must run in Safari on iOS, not merely on desktop. This constrains Phase 9's
UI from the outset rather than being retrofitted:
- **Touch-first**: no hover-dependent affordances, tap targets ≥44 px.
- **Viewport**: portrait-first layout; must survive the iOS dynamic toolbar and safe-area
  insets (`env(safe-area-inset-*)`).
- **No numeric keyboard traps**: use sliders and steppers rather than free text where
  possible; `inputmode="numeric"` where not.
- **Canvas sizing** must honour `devicePixelRatio` or it renders blurry on Retina.
- **Static hosting only** — no backend, so it can be served from any static host.
- Performance target: a game year must resolve fast enough on a phone that the AI's
  candidate sweep does not visibly stall the UI. `planYear` currently evaluates ~150
  candidates × 2 seeds per ruler per year, which is comfortable on a laptop and
  **unmeasured on a phone**. Measure before Phase 9 commits to a turn flow.
