# Balance Report — Anti-Snowball Gate

## Current: Phase 21.11 (five archetypes, aggression + guild charters)

`npx tsx scripts/balance.ts 200 60` — 200 seeded matches × 60 years, 5 AI rulers.
**Result: BALANCE GATE PASSED** (74.3s)

This is the run that closes out the guild work (D2, issues #49/#51). It is the
**default** configuration, not a reduced one — see the runtime note below, which
corrects what this document used to say.

| Criterion | Result | Threshold |
|---|---|---|
| 1. Margin flatness | slope **−1.051e-2** (returns fall 4.86% → −0.29%) | ≤ 0.002 |
| 2. Loss persistence | late rate **74.1%**, ratio **0.97** (early 76.5%) | ≥ 25%, ≥ 0.6 |
| 3. Late lead volatility | **56.5%** | ≥ 20% |
| 4. No early runaway | yr-20 leader wins **51.0%** | ≤ 85% |
| 5. No death spiral | holdings growth **1.48**, population retention **2.23**, late non-leader return **−1.26%**, extinction **0.0%** | ≥ 1, ≥ 0.5, ≥ −3%, ≤ 15% |

Leader return by decade: **4.86% → 3.08% → 0.61% → −0.23% → −0.32% → −0.29%**.
Setback rate by decade: **75.5% → 77.5% → 88.0% → 57.1% → 48.1% → 100%**.

A caveat this document should hold itself to, given the sampling argument it makes
below: **the late-decade cells have small denominators and the report does not
show them.** Neither 57.1% nor 48.1% is expressible over a 200-match denominator
(they are 4/7 and 13/27), and a decade reading exactly 100.0% is the classic
signature of a very small sample. Matches end early when a ruler reaches Kaiser,
so few reach decade 6 at all. Criterion 2's headline 74.1% is the mean of decades
5 and 6, so it leans on that thin cell. The criterion passes with wide margin
either way — the floor is 25% — but the number should not be read as precise, and
a future pass over this harness should make the per-decade denominators visible.

Field health (mean per ruler, the D5 diagnostics that stop "PASS" being read too
generously):

| decade | population | holdings | mean rank |
|---|---|---|---|
| 1 | 1,147 | 372,482 | 0.02 |
| 3 | 1,826 | 703,017 | 1.71 |
| 6 | 3,281 | 614,985 | 5.43 |

### Two corrections to what this document previously said

**Criterion count.** This report listed **four** criteria. There are **five** —
Phase 13 added "no death spiral" (BACKLOG D5), because the first four are
one-sided: a game grinding every ruler into the dirt satisfies margin flatness
*better* than a healthy one does. The table above carries all five.

**Runtime.** The Phase 7 section below states that "a 200-match run exceeds
practical runtime here. 60 matches is the honest figure". That has not been true
since Phase 13 parallelised match generation across worker threads: 200 matches
now completes in **74.3s**, faster than the 188.3s that Phase 7's *60*-match run
took. **200 is the honest figure now, and it is the script's default.**

That correction matters beyond tidiness. Phase 21.9 recorded a smoke run at 60
matches failing criteria 2 and 5 — decade 6 comes back all zeros at that sample
size, because too few matches reach it. Running the same 60-match configuration
against the previous commit reproduced the same two failures, which is what
identified it as sampling rather than regression. **Do not gate on a
reduced-match run.** If you must use one for speed while iterating, it is only
meaningful against a same-config control.

### What the guild work did to the field

Guild charters (D2) are a multiplicative income bonus on a growing building
count — exactly the compounding shape criterion 1 polices — so they were the
main risk to this gate. Measured across the tranches:

| | mean rank @ decade 6 | population @ decade 6 |
|---|---|---|
| pre-guild baseline | 5.43 | 3,206 |
| 21.8, petitions firing with **no** AI answer path | **1.99** | **952** |
| 21.8 + AI answer path | 5.63 | 3,300 |
| 21.11 (final, real-reducer scoring) | 5.43 | 3,281 |

The middle row is the one worth remembering: with every petition lapsing to a
refusal, the field collapsed to a third of its rank progression — and **the gate
still returned PASS on all five criteria**, because a uniform tax on every ruler
is perfectly fair, and the criteria measure fairness and anti-snowball rather
than whether the game is any good. The leader-wins rate actually *improved*
(12.5% under universal lapsing, against 51% here) because nobody can hold a lead while everyone is sinking.

That is the standing caveat on this whole document: a PASS here means the game
is not unfair and does not snowball. It does not mean the game is fun, that a
mechanic is tuned, or that the field is healthy — read the D5 diagnostics above
for the last of those, and `npx tsx scripts/guild-bench.ts` for mechanic-level
behaviour the gate cannot see.

---

## Phase 7 (five archetypes, aggression enabled) — superseded by 21.11 above

`npx tsx scripts/balance.ts 60 60` — 60 seeded matches × 60 years, 5 AI rulers.
**Result: BALANCE GATE PASSED** (188.3s)

| Criterion | Result | Threshold |
|---|---|---|
| Margin flatness | slope **−1.026e-3** (returns fall 2.14% → 1.37%) | ≤ 0.002 |
| Loss persistence | late rate **74.2%**, ratio **1.25** | ≥ 25%, ≥ 0.6 |
| Late lead volatility | **50.0%** | ≥ 20% |
| No early runaway | yr-20 leader wins **23.3%** | ≤ 85% |

Setback rate by decade: **45% → 73% → 55% → 38% → 63% → 85%**.

Adding espionage moved every volatility measure sharply in the intended direction,
because a leader is now a target rather than merely unlucky:

| | Phase 6 (3 peaceful) | Phase 7 (5, with aggression) |
|---|---|---|
| Late lead volatility | 39.5% | **50.0%** |
| Early leader goes on to win | 50.5% | **23.3%** |
| Late setback rate | 38.8% | **74.2%** |

Sample-size note: the five-ruler configuration is roughly 4× the cost per match of
the three-ruler one, and a 200-match run exceeds practical runtime here. 60 matches
is the honest figure for this result; every criterion clears its threshold by a
wide margin, and the committed tests re-check the same criteria on every run.

One measurement change was required: the setback metric counted only *events*, so a
leader stripped of 18% of its treasury by raiders registered as having had a quiet
year. Plundered coin now counts as adversity — which is what this criterion's
"events **and AI aggression**" wording always meant.

---

## Phase 6 baseline (three peaceful archetypes)

Generated by `npm run balance` (200 seeded matches × 60 years, 3 AI rulers).

**Result: BALANCE GATE PASSED** (333.8s)

## Why this exists

The design requirement (`docs/kaiser-research.md` § Persistent Scarcity, and the
project owner's explicit brief): the game must stay hard throughout and must not
become a trivial exponential-growth snowball once the early game is survived.

That property is invisible in short playtests — "it feels hard" doesn't survive
fifty hours of play, and drift creeps in one feature at a time. So it is measured,
and the thresholds are committed as tests (`tests/balance.test.ts`) so any later
feature that reintroduces snowballing fails CI rather than being discovered by a
bored player.

## 1. Margin flatness — returns must not compound

Leader's net income as a share of total holdings, by decade:

| Decade | Years | Return |
|---|---|---|
| 1 | 1–10 | 2.125% |
| 2 | 11–20 | 2.559% |
| 3 | 21–30 | 2.050% |
| 4 | 31–40 | 1.728% |
| 5 | 41–50 | 1.342% |
| 6 | 51–60 | 0.945% |

**Trend slope −2.821e-3** (limit ≤ 0.002). Returns *decline* by more than half
across a game: a large realm earns a lower rate than a small one, because upkeep
and risk scale with holdings. This is the core anti-snowball property.

## 2. Loss persistence — the late game must stay dangerous

Chance the leader suffers an event costing ≥15% of treasury or population:

| Decade | Rate |
|---|---|
| 1 | 27.0% |
| 2 | 32.5% |
| 3 | 10.0% |
| 4 | 13.5% |
| 5 | 26.5% |
| 6 | **51.0%** |

Late rate **38.8%** (floor 25%), late/early ratio **1.30** (floor 0.6).

The arc is the intended shape and worth reading deliberately: danger is high early,
**dips in decades 3–4** as the ruler finishes buying mitigation buildings, then
**climbs again** — ending as the most dangerous stretch of the game — because
prosperity raises exposure faster than insurance suppresses it. You buy safety,
then outgrow it. Success creates new pressure rather than removing it.

## 3. Lead volatility — the game must not be decided early

- Leader changes after year 30 in **39.5%** of matches (floor 20%)
- The year-20 leader goes on to win **50.5%** of the time (ceiling 85%) — an early
  lead is worth roughly a coin flip, not a victory

## What had to change to get here

The first run **passed all four criteria and was wrong**, which is the most useful
thing this harness did. Three measurement bugs and two genuine design faults:

**Measurement bugs (all flattered the game):**
1. Setbacks measured against *total holdings* read 0.0% in every decade of every
   match — holdings are dominated by land at book value and barely move. A
   criterion that never fires is not evidence of balance, and a division-by-zero
   fallback let it "pass" vacuously. The vacuous-pass path is now an explicit
   failure, backed by an absolute floor as well as a ratio.
2. Setbacks measured against *treasury movement* were worse than useless: they
   counted the ruler's own **spending** as misfortune. The early game looked
   perilous precisely because that is when land and palace stages get bought, and
   a mature ruler with nothing left to buy looked serene — exactly backwards.
   Adversity is now read from event losses recorded in the chronicle.
3. `PlayerChronicle.eventLosses` summed peasants and Taler into one number, which
   means nothing. Split into `eventGoldLoss`, `eventPopulationLoss`, and
   `eventBuildingsDestroyed`.

**Design faults:**
4. **Only event *frequency* scaled with prosperity, not severity.** A large realm
   was struck more often but each blow stayed proportionally identical, and once
   mitigation shaved 40–50% off, no single event could dent a mature ruler at all.
   Added `severityExposureScaling` — a plague in a dense city really is worse than
   one in a village. Condition events (revolt, famine) have exposure ≤ 1 by
   construction and are deliberately untouched: only prosperity amplifies.
5. **Mitigation was close to immunity.** Cutting frequency ~70–80% *and* severity
   ~40–60% compounds to roughly 87% risk reduction. Insurance should mean "this
   happens to me less often", not "this barely matters when it happens". Severity
   reductions were cut to 0.2–0.3 and probability reductions moderated to 0.6–0.7.

## A separate finding: the rank ladder was unreachable

Tuning for difficulty exposed that the Phase 0 rank thresholds were invented before
the population model existed. Measured directly: under *ideal* play with full
mitigation, population peaks near **4,600** and oscillates. Kaiser required
**20,000** — unreachable by 4–5×, so every rank above Prince was unattainable no
matter how well the game was played.

Population thresholds are now calibrated to what the simulation can actually
produce (Duke 1,300 → Kaiser 4,200). Progression after the fix:

| Years | Rank reached |
|---|---|
| 60 | Duke |
| 120 | Count |
| 300 | Margrave |

**Kaiser remains deliberately out of reach in a normal-length game** and requires
sustained, focused population growth. This is a pacing observation to revisit in
Phase 11 (difficulty presets), recorded here rather than quietly tuned away.

## Caveat

This measures AI-vs-AI play, which is a proxy for the human experience rather than
the thing itself. It is a good proxy — the AI plays by the player's rules through
the same `Decision` sheets and the same reducer — but a proxy. The criterion for
loss persistence is also, by the plan's own wording, partly about "events **and AI
aggression**"; inter-ruler aggression (espionage, sabotage, raiding) arrives in
Phase 7, and this criterion should be re-examined and likely tightened once it does.
