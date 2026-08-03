# Kaiser II–inspired features (optional)

Reference: Play Store screenshots of *Kaiser II – Die Rückkehr* (Mantronic).  
Kaiser 3 stays its own game (different rank ladder, D2 paths, no bonds/fleet) — borrow **UX patterns**, not systems that conflict with our engine.

**Status:** Art pipeline prepared (`uiIcons` in `tileset.json` / `gen-art.ts`). Features 1–3
implemented in UI (OK/deficit tiles, rank ladder, icon tabs) using procedural
`uiIcons` until Comfy PNGs are generated. **Do not generate** until asked
(`npm run gen-art -- --filter uiIcons`).

---

## Screenshot 1 — Hub grid + Volk Statistik

### What they show
- Top **icon grid** of management modules (People, Land, Buildings, Taler, Bonds, Income, Expenses, Market rate, Army, Points).
- A **history chart** (“Volk Statistik”) with MIN / MAX / AVG and yearly bars.

### Fit for Kaiser 3

| Idea | Fit | Notes |
|---|---|---|
| **Icon + label tab hub** | High | We already have Realm / Grain / Land / Tax / Build / Spy / War as text tabs. Swap or augment with `uiIcons` (people, land, buildings, taler, grain, army, spy). |
| **Income / Expenses ledger tab** | High | Engine already itemizes this on the year report (`PlayerChronicle`). A persistent “Ledger” view of last year (or running totals) mirrors Einn./Ausg. without new sim math. |
| **Points (score) tile** | Medium | `PlayerState.score` exists (reign productive income). Surface on Realm or a Stats tab. |
| **Population (etc.) history chart** | High | Needs a small **year-history ring** in session/save (e.g. last 40 years of pop / taler / land / unrest). Pure UI + thin state append in `advanceYear` or UI-only mirror after each year. Chart itself can be Canvas 2D (no Comfy). Optional parchment `uiIcons/chart_panel` background. |
| **Bonds (Obl.) / Kurs** | Skip | Not in Kaiser 3 economy; would be a large new feature (F2-adjacent). |
| **Army as separate module** | Low–medium | War + garrison + guards already exist across War / Build / Spy. Optional “Military” summary card rather than a new subsystem. |

### Art to prepare (optional)
- Hub icons: `people`, `land`, `buildings`, `taler`, `grain`, `income`, `expense`, `army`, `points`, `stats`
- Chart chrome: `chart_parchment` (wide texture only — no axes/numbers in the image)

---

## Screenshot 2 — Rangleiter + Fehlende Aufstiegspunkte

### What they show
- Full **rank ladder** grid; attained ranks highlighted (green).
- Per-requirement checklist: green **OK** vs red **deficit amount**.
- Aggregate “missing promotion points” total.

### Fit for Kaiser 3

| Idea | Fit | Notes |
|---|---|---|
| **Full rank ladder (8 crests)** | High | We only show “Path to *next*”. Add a Realm (or modal) grid Baron→Kaiser using existing `crests` + procedural fallback; dim locked, gold/green attained. |
| **OK / deficit requirement tiles** | High | Data already in `ranks.json` + `groupProgress` / path hints. Replace or supplement prose hints with tiles: e.g. Taler OK / need +5,000; Pop OK; Palace 2/4. Color like their green OK / red number boxes. Works per D2 **path** (Prestige / Land&Pop / Commerce). |
| **Single “missing points” sum** | Low | Their score is a weighted possession total. Our gates are **hard thresholds**, not point pools. Prefer per-field deficits + path % (already have). Don’t invent fake points unless we redesign ranks. |
| **Their rank names (Kurfürst, etc.)** | Skip | Keep Kaiser 3 ladder (`data/ranks.json`). Crests already map 1:1. |

### Art to prepare (optional)
- Requirement icons: `req_wealth`, `req_population`, `req_palace`, `req_cathedral`, `req_land`, `req_trading_house`
- Status chips can stay CSS (`OK` / red number) — no need to bake text into PNGs
- Missing crest PNGs (baron, duke, margrave, archbishop, kaiser) remain optional; procedural covers them

---

## Suggested implementation order (when building features)

1. **Rank ladder grid + OK/deficit tiles** — pure UI on existing rank APIs; biggest clarity win; uses crests + new `uiIcons` req_* .
2. **Icon tab bar** — cosmetic; needs `uiIcons` hub set.
3. **Year history + Stats chart** — needs thin history buffer (+ save/load field); chart in Canvas.
4. **Ledger tab** — re-present chronicle income lines; little/no art.

---

## Generate later (when ready)

```bash
# Do NOT run until explicitly asked — GPU / Comfy session
npm run gen-art -- --filter uiIcons
npm run verify-art
```

Procedural fallback: colored square + label via `spriteLoader` (same as other categories).
