# Procedural Trees (Tree Lab)

Interactive 2D procedural botanical tree generator and calibration lab supporting 30 species with real-time biological growth (`age ∈ [0.04, 1]`), 60 FPS wind animation, bare-branch skeleton inspection (`Show branches`), and species-specific bark, foliage, and flower organ sprites.

## Stack

- **TypeScript** (strict)
- **Vite** + **Tailwind CSS v4** (`@tailwindcss/vite`)
- **HTML5 2D Canvas** with cached limb/foliage atlases and 4-phase wind flutter

## Commands

```bash
npm install
npm run dev      # Start dev server on http://127.0.0.1:5173
npm run build    # Typecheck (tsc --noEmit) and build production bundle
```

## Architecture

- `src/species-profiles.ts` — Botanical profiles, crown envelopes, scaffold vectors, palettes, and calibrated default parameters for 30 tree species.
- `src/species-sprites.ts` — Procedural 2D organ sprite generators for compound/simple leaves, needles, fronds, catkins, and floral panicles.
- `src/tree-2d.ts` — Sympodial/monopodial branch generation, cubic Bézier skeleton curves, normal-lit bark rendering, ontogenetic growth scheduling, ground litter, and 60 FPS cached wind animation.
- `src/tree-parameters.ts` — Tunable parameter definitions, ranges, and normalization.
- `.claude/skills/procedural-botanical-trees/` — Botanical calibration workflow and mandatory 8-part anatomical comparison gate.
