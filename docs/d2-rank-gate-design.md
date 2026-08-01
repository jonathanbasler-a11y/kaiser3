# D2 Design Spike — Alternative Rank-Gate Shapes

**Status: design decision only. Nothing in this doc is implemented.** Deliverable
is the decision, the rejected alternatives, and the concrete shape for whoever
picks up the implementation as its own phase. Written per PLAN.md Phase 13 Step 1.

## Problem, restated with the evidence

`data/ranks.json`: every rank's `requirements` is a single AND-group —
`wealthMin`, `populationMin`, and (from Duke on) `palaceStages`, with `cathedral`
added at Archbishop and Kaiser. There is exactly one qualifying path per rank, and
it is the same *kind* of path at every rank: buy land, build the palace, hold
enough population and cash.

Measured (`npm run ai-bench`, Phase 12, 12 solo matches/archetype, F4 warfare live
the whole match):

| Archetype | Land | Palace | Rank |
|---|---|---|---|
| Builder | 13,240 | 16.0 | 3.67 |
| Expansionist | 13,256 | 16.0 | 3.58 |
| Schemer | 13,159 | 16.0 | 3.50 |
| Merchant | 13,097 | 10.8 | 2.17 |
| Raider | 13,093 | 12.1 | 2.92 |

Land is identical to three significant figures across all five. F4 (warfare) gave
every archetype a second *economic* channel (land/coin via conquest) and moved this
number **not at all** — it just produces another way to hit the same wall, because
the wall is the requirement shape, not a shortage of income sources feeding it.

## Why F4 failing to help is the key evidence

F4 proves that adding an economic channel *upstream* of a single-path rank
requirement cannot diversify behaviour, no matter how well-designed the channel is.
Any fix has to change the *shape of what counts as qualifying*, not add another way
to afford the one thing that already qualifies. That rules out anything like F2
(inter-ruler trade) on the same theory F2 was originally pitched on — see BACKLOG.md
F2, now marked deferred for exactly this reason.

## Candidates considered

### (a) Alternative requirement SETS per rank — recommended
Each rank gets a **list** of requirement-groups instead of one; a ruler qualifies by
satisfying *any single group in full*. A Prestige path (today's shape) sits
alongside a Commerce path (wealth + trading-house count, little or no palace) and
possibly a Military path (garrison/guards standing + population).

**Why this fits the existing architecture:**
- No new `Decision` type. Every stat these paths would reference — taler,
  population, `buildings.tradingHouses`... — is one the planner already tracks and
  the human already has UI for (`ConstructionDecision.tradingHouseBuild` exists
  since Phase 11/B3).
- `checkPromotion()`'s structure barely changes: `meetsRequirements()` becomes "any
  group in `rank.requirements` passes" instead of "the one group passes."
- `rankProgress()` stays continuous by construction: compute the existing
  min-across-a-group ratio **per path**, then take the **max across paths**. A max
  of several continuous [0,1]-clamped functions is itself continuous — there is no
  discontinuity at the point where the "winning" path changes, which is exactly the
  property the existing `evaluator.ts` comment on the 540,000-utility cliff insists
  on (a term that jumps on crossing a requirement bribes the planner not to cross
  it).
- Archetypes already have the right raw material to prefer different paths without
  retuning weights: Merchant's `production: 4200` > `prestige: 2200` is currently
  wasted on a rank system that gives zero rank-credit for production/wealth beyond a
  scalar floor. A Commerce path gives that weight vector somewhere to point.

### (b) Weighted/points system — rejected
Sum normalized progress across many axes (wealth, population, buildings, military,
trade) against a single threshold per rank, instead of naming discrete paths.

Rejected: it breaks `rankProgress()`'s clean "the binding constraint" framing
(a sum has no single binding constraint — nothing to report as *why* you aren't
promoted yet), it moves further from the original game's flavor of named,
legible titles-by-achievement, and it makes every archetype converge on
*whichever single axis has the best utility-per-Taler*, which is arguably the same
convergence failure in a different shape — D2 already showed archetypes will
optimize a shared scalar identically when there's only one.

### (c) Per-archetype rank ladders — rejected outright
Different rank tracks for different personalities.

Rejected: rank is a **cross-ruler standing comparison** (`compareStanding()` in
`src/ai/sim.ts`, and the whole point of `earlyLeaderWinRate`/lead-volatility
criteria in the balance gate). Personality-specific ladders make "who is ahead"
undefined between two rulers on different tracks — it would need its own
normalization scheme and would likely need to change the balance gate's own
criteria, a much larger blast radius than this spike's scope. Also has no analogue
for a **human** player, who doesn't pick an "archetype" — they'd need the union of
every path, at which point it collapses back into option (a).

## Recommended shape (for the implementation phase)

```jsonc
// data/ranks.json, sketch — NOT the final schema, illustrative only
{
  "id": 4, "name": "Margrave",
  "requirements": [
    { "wealthMin": 75000, "populationMin": 2400, "palaceStages": 14 },      // Prestige (today's shape)
    { "wealthMin": 140000, "populationMin": 2200, "tradingHousesMin": 2 }   // Commerce — higher wealth bar, no palace
  ],
  "unlockedFeature": "tradingHouses"
}
```

`meetsRequirements` becomes `requirements.some(group => allSatisfied(group))`.
`rankProgress` becomes `Math.max(...requirements.map(groupProgress))`.

### The chicken-and-egg problem this surfaces (must be resolved by whoever implements)
`data/buildings.json`'s `commerce.tradingHouse.requiresRank` is **4** (Margrave) —
and Margrave is exactly the rank a Commerce path would need to unlock trading
houses at all. As written today, a Commerce path can only be a genuine alternative
from Margrave **onward** — it cannot help a Merchant/Raider diversify from Baron,
where the convergence already starts (D2's evidence shows land at the same 13,000ha
ceiling from the very first archetype comparison, not just at senior ranks).

Two ways to resolve this, either legitimate:
1. **Scope the Commerce path to ranks 5+ only** (Archbishop/King/Kaiser), and give
   ranks 0-4 a *different* alternative not gated behind anything downstream of
   itself — e.g. a "Land & Population" path (higher population/wealth bar, no
   palace stages) using only stats every archetype can reach from turn one.
2. **Loosen the trading-house unlock** to a wealth/population threshold instead of
   a rank number, so Commerce is reachable independent of the Prestige ladder from
   the start. Bigger change — touches `buildings.ts`'s construction gating and the
   UI's `isFeatureUnlocked()` check (`src/ui/app.ts`), not just `ranks.json`.

Recommendation: (1) for the first implementation pass — smaller diff, and it
directly targets where the evidence says convergence already starts (Baron/Duke),
not just the senior ranks.

## Expected effect on `ai-bench` (what "worked" looks like)

Merchant and Raider should show **materially fewer** palace stages and **more**
production buildings/trading houses at comparable final rank, instead of today's
"same land ceiling, fewer palace stages, lower rank" pattern (which reads as
*underperforming* the same goal, not *pursuing a different one*). Builder/
Expansionist/Schemer should be largely unchanged — they already weight prestige
heavily and would still find the Prestige path competitive or better for them.
A change that makes `ai-bench`'s Merchant/Raider rows converge back toward the
others (rather than diverge in construction profile) is evidence the paths aren't
actually differentiated and the weight-per-path balance needs another pass.

## Risks flagged for the implementation phase, not resolved here

- **Dominant-path risk**: if one path is strictly cheaper Taler-per-rank-progress
  than the others for every archetype, everyone still converges on it — the
  balance-gate-style verification in Phase 12's Step 1→ai-bench diff loop is the
  right tool to catch this, not inspection.
- **Path count**: more than 2-3 paths per rank dilutes "the game stays hard
  throughout" into "there's always an easy way through" — CLAUDE.md's persistent-
  scarcity requirement should gate how many paths get added, not just whether they
  exist.
- **`evaluator.ts`'s `palaceLandEnablement()`** nudge (the 0.15-share bonus for
  land held toward the palace requirement) is currently unconditional whenever the
  next rank has a `palaceStages` requirement. With alternative paths, a ruler
  pursuing Commerce would still get nudged toward buying palace-gate land it
  doesn't need — this term needs to become path-aware (or dropped when a cheaper
  qualifying path exists) or it will keep bribing every archetype toward the same
  13,000ha regardless of which path their weights actually favor.
- Re-verify the promotion check's leapfrog behavior (`checkPromotion` can jump
  multiple ranks in one year today) still makes sense once a rank might have
  distinct paths a ruler satisfies via different means at different ranks.

## Explicitly out of scope for this spike

Implementation of any of the above — schema change, `ranks.ts` logic, `evaluator.ts`
generalization, `ai-bench`/balance-gate re-runs, UI display of "which path are you
on." All belong to the phase that picks this decision up.
