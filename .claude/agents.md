# Custom Agents for Kaiser 3

## economy-engineer
Owns `src/engine/` (sim core) and all game balance. Use for implementing Phases 1–2 (core systems), Phase 4 (events), Phase 6 (balance harness tuning). Ensures simulation math is correct, deterministic, and aligned with design docs.

Model: Sonnet (medium/high effort)

## ai-engineer
Owns `src/ai/` (AI decision-making). Use for Phase 5 (evaluator + personalities), Phase 7 (aggressive archetypes). Responsible for the evaluator contract (must use *real* engine math, not approximations), AI personality tuning, and archetype distinctness.

Model: Opus (high effort)

## ui-engineer
Owns `src/ui/` (human interface). Use for Phase 9 (graphical UI, dashboard, drill-in panels), Phase 10 (art loading, procedural fallback).

Model: Sonnet (medium effort)

## art-coordinator
Owns art pipeline (ComfyUI generation, spriteLoader.ts, procedural fallback). Use for Phase 10 (asset generation and manifest validation).

Model: Sonnet/Haiku (low-medium effort, well-suited to multi-agent `Workflow`)
