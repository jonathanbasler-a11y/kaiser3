# Kaiser 3 Art Generation Spec

All art is AI-generated via local ComfyUI, 100% original — never derived from copyrighted reference material (Ariolasoft's Historyline, Blue Byte IP, etc.). Visual style is historical medieval/HRE-inspired: painterly, semi-isometric, natural palette (ochres, teals, grays, forest greens), dense texture.

## Art Generation Workflow

**Invocation:** `npm run gen-art [--dry-run] [--filter <category>]`

**Process:**
1. Read asset manifest from `data/tileset.json`
2. For each asset, generate a prompt via a per-category template
3. Dispatch to local ComfyUI via MCP
4. Save PNG to `public/art/<category>/<id>.png`
5. Verify non-zero file size
6. Run `npm run verify-art` to confirm fallback still works and art loads

**Speed:** ~30-60 assets × 15-20 sec/image ≈ 7.5–20 minutes for a full run (parallelizable up to ComfyUI queue depth).

---

## Asset Categories & Prompt Templates

### Portraits (5 × archetype)

**Resolution:** 256×256 (character/profile icon)  
**Count:** 5 (builder, expansionist, merchant, schemer, raider)

**Shared preamble (all portraits):**
> Medieval Holy Roman Empire, oil painting style, late 15th century. Character portrait, three-quarter view, rich clothing and regalia befitting their rank. Natural lighting, slight warm tone. Painterly brushwork, fine detail in faces. No text, no modern elements.

**Per-archetype prompt:**
- **Builder:** Stern, disciplined, middle-aged merchant-prince in fur-trimmed coat. Hands show calluses. Books and architectural plans in background blur. Serious, methodical expression.
- **Expansionist:** Young, confident, bright-eyed noble in velvet doublet. Golden jewels catch light. Maps and banners visible behind. Expansive gesture, optimistic bearing.
- **Merchant:** Shrewd, weathered trader in fine silk and saffron tones. Scales, coins, spice jars on nearby table. Sharp eyes, knowing smile. Prosperous but cautious.
- **Schemer:** Shadowed, calculating face in dark silks. Single candle illuminates one side. Dagger hilt visible. Knowing, almost amused expression. Murky background.
- **Raider:** Wild-eyed, scarred, muscular warrior in leather and iron. Wind-blown hair, weapon nearby. Fierce, predatory expression. Stormy sky behind.

---

### Buildings (11 × type/stage)

**Resolution:** 128×96 (isometric hex icon)  
**Count:** 21 (market/mill basics, palace 16 stages, cathedral, hospital, well, granary, garrison, trading house)

**Shared preamble (all buildings):**
> Medieval architecture, isometric three-quarter view, semi-transparent shadow beneath. Painterly texture, earth tones (ochre, sienna, grays). Slight depth of field. Single building per image, no people, no text. Roof and facing visible, shading suggests 3D form.

**Market (1):**
> Stone marketplace with a covered arcade, barrels and crates stacked outside. Tiled roof, wooden shutters. Prosperous, busy appearance despite being empty of people.

**Mill (1):**
> Stone watermill with a large wooden wheel on one side, stream below. Thatched or tiled roof. Gears visible inside the open side. Sturdy, functional design.

**Palace stages (16) — progression from modest to grand:**
1. *Stage 1 — Foundation:* Excavated plot with a few stone blocks, simple wooden scaffold. Bare earth around.
2. *Stage 2:* Ground floor complete, one story of walls, wooden framing for floors above. 
3. *Stage 3:* Two stories, windows installed, roof frame visible. 
4. ... *(stages 4–14 are incremental: each adds one story or adds towers/wings, progressively more elaborate)*
5. *Stage 15:* Four-story grand palace with two corner towers, crenellations, decorative stonework, manicured grounds. Partially complete spire at center.
6. *Stage 16 — Complete:* Full five-story palace with four towers, central spire, heraldic banners, courtyard visible, manicured gardens and wall. Seat of power.

**Cathedral (1):**
> Grand Gothic cathedral with a high central spire, flying buttresses, rose window visible. Lighter stone (pale gray/cream). Intricate masonry. Sacred, imposing, complete in one image (not multi-stage).

**Hospital (1):**
> Stone building with a red cross banner, large windows (suggesting light, cleanliness), herb garden boxes outside. Smaller than palace, clearly civic/care-oriented.

**Well (1):**
> Circular stone well with a wooden pulley mechanism and rope. Bucket nearby. Simple, functional, rustic appearance.

**Granary (1):**
> Large timber-frame building with sloped roof, multiple small windows for ventilation, external stairs. Grain sacks stacked outside. Clearly a storage building.

**Garrison (1):**
> Fortified stone structure, narrower windows (defensive), guard tower on corner, small catapult or cannon visible. Flags with shields. Martial, defensive appearance.

**Trading House (1):**
> Ornate merchant's house with imported luxuries evident: fancy tiles, silk banners, exotic goods in display. Smaller than palace but ostentatiously wealthy.

---

### Event Icons (7 × event type)

**Resolution:** 96×96 (event banner/notification icon)  
**Count:** 7 (plague, fire, famine, revolt, banditry, flood, drought)

**Shared preamble (all event icons):**
> Medieval icon style, symbolic rather than realistic. Bold, clear silhouette. Warm or dark background to suggest the event's tone. Oil painting texture, gold leaf accents where appropriate. Fits in a square, centered. No text.

**Plague flag:**
> Quarantine flag with skull/crossbones, sickly green mist wisps around it. Dark background. Ominous, diseased tone.

**Fire smoke:**
> Flames and thick orange/red smoke rising from a building silhouette. Yellow and orange tones. Urgent, destructive energy.

**Famine sign:**
> Empty bread loaf, wilted wheat sheaf, bare earth. Brown and gray tones. Desperate, starving feeling.

**Revolt banner:**
> Raised fist or pitchfork, torn banner, angry red and black tones. Chaotic energy. Revolutionary tone.

**Bandit skull:**
> Skull with crossed swords or daggers behind it. Dark tones with metallic glint. Dangerous, plunder-focused.

**Flood wave:**
> Large blue/gray wave crashing, swallowing buildings/land in silhouette. Churning, destructive. Cool, overwhelming tone.

**Drought sun:**
> Harsh, oversized sun beating down on cracked earth and wilted plants. Yellows and browns, parched feeling. Relentless heat.

---

### Scenes (3 × major scene)

**Resolution:** 1280×720 (UI backdrop/tableau)  
**Count:** 3

**Coronation Tableau (1):**
> Grand coronation scene in a cathedral: a crowned figure (generic, not specific to any archetype) kneeling or standing before an altar, surrounded by bishops and nobles in ceremonial dress. Golden light streaming through stained glass. Opulent, triumphant, ceremonial tone. Oil painting, warm colors, rich detail. This is the victory screen — celebrate it.

**Battlefield Backdrop (1):**
> Aerial view of a medieval battlefield: rolling hills, fortified town in the distance, cavalry and foot soldiers positioned across fields. Tents, banners, smoke from siege weapons. Strategic, tactical feeling. Early morning or late afternoon light. This is the war-resolution screen — stakes are high, but distant enough to be readable.

**Chronicle Parchment (1):**
> Aged parchment or vellum texture with faded wax seal, torn edges, calligraphic script (illegible but decorative). Warm beige/cream tones, slight age staining. This frames the year-report text — suggests an official record being read aloud by a scribe.

---

### Terrain (6 × state)

**Resolution:** 128×96 (isometric hex tile)  
**Count:** 6

**Shared preamble (all terrain):**
> Medieval landscape hexagon, isometric three-quarter view, semi-transparent shadow beneath. Painterly, textured. Natural palette. No people, no buildings (those overlay). Shows land fertility/state via color/pattern.

**Farmland — Fallow:**
> Bare earth, turned soil, some rocks. Brown, gray tones. Ready but not planted.

**Farmland — Planted:**
> Rows of young green shoots, fresh soil. Hopeful green and brown. Early growth.

**Farmland — Ripe:**
> Golden wheat or grain at full height, ready for harvest. Rich golden-brown. Abundant, prosperous.

**Farmland — Blighted:**
> Diseased or drought-affected crops: yellowed, withered, sparse. Dull khaki and brown. Desperate, poor yield.

**Forest:**
> Dense trees, dark green canopy, tree trunks visible beneath. Cool, shadowed tones. Wild, untamed.

**River:**
> Flowing water, blue-gray tones, banks on either side. Slight current suggested by water flow. Splits/divides hexagons on a map.

---

### Crests (8 × rank, added Phase 15)

**Resolution:** 96×96 (small icon, shown beside the rank title in the UI)
**Count:** 8 — one per rank in `data/ranks.json` (Baron → Kaiser)

**Shared preamble (all crests):**
> Heraldic coat-of-arms crest, painted illuminated-manuscript style, centered on a plain dark parchment background, symmetrical, no people, no landscape, no buildings, no text or letters of any kind — only heraldic shapes, a shield outline, and rank-appropriate ornamentation. Gold leaf accents, rich medieval pigments.

Ornamentation escalates with rank so the crest reads as a promotion at a glance,
not just via the text label next to it — Baron is a plain unadorned shield, Kaiser
is a full imperial crest with crown, orb, and sceptre. See `scripts/gen-art.ts`'s
`ASSET_SPECS.crests` for the exact per-rank prompt (kept there rather than
duplicated here, since the generator is the single source of truth for what's
actually sent to ComfyUI — this doc explains the *shape* of the category, not a
copy that can drift from it).

---

## Generation Parameters

### ComfyUI Model Setup
- **Base model:** A robust general-purpose model (e.g., `juggernaut-xl`, `dreamshaper-8`, or similar with good medieval/painting support)
- **Sampler:** DPM++ 2M Karras or Euler (deterministic, quality)
- **Steps:** 30–40 (balance quality vs. speed)
- **CFG scale:** 7–8 (follow prompts closely but allow some creativity)
- **Seed:** Derived from asset ID (deterministic reproducibility)
- **Upscaling (optional):** ESRGAN 4× for portraits; skip for smaller tiles (adds 10sec/image)

### Prompt Formula (per asset)
```
[shared-preamble-for-category] [per-asset-specific-prompt]. Style: painterly, semi-isometric, natural medieval palette, fine detail, no text, no modern elements, no people [except: "one figure" for portraits/coronation].
```

### LoRA/Embedding Considerations (optional, if available)
- A "painterly medieval" LoRA would help consistency across all assets
- A "isometric" embedding for building/terrain tiles could enhance alignment
- Skip if not available (base model + prompt engineering should suffice)

---

## Verification & Fallback

**Post-generation checks:**
1. File size > 0 bytes (image saved)
2. Load test in `src/ui/spriteLoader.ts` (fetch + canvas.drawImage doesn't throw)
3. Visual spot-check: portrait faces recognizable, building silhouettes clear, icons readable at 96×96
4. Run `npm run verify-art` (deletes all art, confirms procedural fallback still renders, then restores)

**Procedural fallback:** `src/ui/render.ts` contains Canvas 2D drawing code for every asset ID. If `public/art/<id>.png` is missing, it falls back to procedural rendering. This is permanent, so the game stays fully playable even if art generation is incomplete.

---

## Asset Naming Convention

All filenames match keys in `tileset.json`, with underscores replacing spaces:
- `art/portraits/builder.png` (lowercase, no version number)
- `art/buildings/palace_1.png` (not `palace_stage_1`)
- `art/events/plague.png`
- `art/scenes/coronation.png`
- `art/terrain/farmland_planted.png`

---

## Success Criteria

- [ ] All 45 assets generated (5 portraits + 21 buildings + 7 events + 3 scenes + 6 terrain + 3 misc)
- [ ] File sizes all > 0, no generation failures logged
- [ ] Each asset loads without error in a test game (via `spriteLoader.ts`)
- [ ] Visual spot-check: style is consistent (painterly, medieval, isometric), recognizable, readable at intended sizes
- [ ] Procedural fallback still works (delete `public/art/*`, game renders via Canvas code, restore)
- [ ] Game plays end-to-end with generated art, no console errors
- [ ] Commit includes all generated PNG files (no `.gitignore` exclusion)

