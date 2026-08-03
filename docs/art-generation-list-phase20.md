# Phase 20.5 — Art generation list (for ComfyUI / `npm run gen-art`)

Cursor cannot generate images. Run these after the GPU queue is free.
Format matches `scripts/gen-art.ts` categories and `data/tileset.json` ids.

## Missing rank crests (5)

```bash
npm run gen-art -- --filter crests --assets baron,duke,margrave,archbishop,kaiser
```

Procedural heraldry already covers these via `drawCrestProcedural` until PNGs land.

## Missing tab / UI icons (4 + dike)

```bash
npm run gen-art -- --filter uiIcons --assets people,taler,grain,spy,req_wealth,req_population
```

Also declare and generate **dike** (Build tab always falls back today):

- Add `"dike": "art/buildings/dike.png"` under `buildings` in `data/tileset.json` if missing
- `npm run gen-art -- --filter buildings --assets dike`

## Positive-event reward scenes (4) — Phase 3a follow-up

New category suggestion (add to tileset + gen-art ASSET_SPECS when ready):

| id | path | note |
|---|---|---|
| `reward_taler` | `art/eventScenes/reward_taler.png` | coin / purse on parchment |
| `reward_population` | `art/eventScenes/reward_population.png` | families arriving |
| `reward_grain` | `art/eventScenes/reward_grain.png` | full barns |
| `reward_unrest` | `art/eventScenes/reward_unrest.png` | calmed crowd / feast |

Until then Overview/year cards use CSS parchment treatment keyed by `rewardType`.

## Verify

```bash
npm run verify-art
```

Use the printed present/missing checklist. Spot-check all nine screens at 375×812 after wiring.
