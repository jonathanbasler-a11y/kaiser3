# Graphics Expansion — Full-Screen Events + Kingdom Map

**Branch:** `cursor-graphics-crests`  
**Date:** 2026-08-02  
**Constraint:** Art assets + `gen-art` / `tileset` / `render` / `spriteLoader` only. Do not rewrite Claude Phase 18 UI (`app.ts` year-report / preview) until that phase merges — then wire scenes in.

## Crests (G1 outcome)

SDXL (`sd_xl_base_1.0`) failed **four** prompt/seed rounds at producing an honest Baron→Kaiser heraldic ladder (wrong charges: no plow/tower/mitre/double-eagle; low ranks too ornate). **Decision:** ship **procedural crests** (`drawCrestProcedural` in `render.ts`, per-rank distinct charges including Margrave tower + Archbishop mitre) as the source of truth for rank readability. Comfy crest PNGs cleared; `tileset.json` paths remain so a future better model/LoRA can drop files in without code changes. Verified in-browser: Realm title shows a `data:image/png` procedural crest.

## Event scenes + kingdom map (generated + reviewed)

| Asset | Verdict |
|---|---|
| fire, revolt, banditry | PASS (first pass) |
| plague, famine, flood | PASS after re-roll (seed 2500) |
| drought | ACCEPTABLE (arid desert camp; not cracked farmland but reads as drought) |
| kingdom_overview | PASS (isometric estate, river, fields) |

Paths: `public/art/eventScenes/*.png`, `public/art/scenes/kingdom_overview.png`.

## New categories

| Category | Assets | Size | Purpose |
|---|---|---|---|
| `eventScenes` | plague, fire, famine, revolt, banditry, flood, drought | 1280×720 | Full-screen year-report splash when that event fires (replaces icon-only log feel) |
| `scenes.kingdom_overview` | 1 | 1280×720 | Isometric principality overview (fields, buildings, river, forest) for Realm / map hub |

Small `eventIcons` (96×96) remain for log rows. Full scenes are the cinematic layer.

## Generate

```bash
npm run gen-art -- --filter eventScenes --seed-offset 100
npm run gen-art -- --filter scenes --assets kingdom_overview --seed-offset 100
npm run verify-art
```

Review each PNG; re-roll bad ones with `--assets <id> --seed-offset <n+1000>`.

## UI wiring ✅

1. Year report: when chronicle has events, show `spriteImg('eventScenes', …)` as a full-bleed banner above the log.
2. Realm tab: show `spriteImg('scenes', 'kingdom_overview', …)` as the kingdom vista.
3. Flood/drought icon map in `EVENT_ICON_ID` — wired (`flood_wave`, `drought_sun`).

## Procedural fallback

Missing `eventScenes` / `kingdom_overview` → existing scene color placeholder or banner tone; game stays playable.
