# AGENTS.md — Procedural Trees

## Workflow & Calibration Rules

1. **Botanical Skill First:** Always load and follow `.claude/skills/procedural-botanical-trees/SKILL.md` when calibrating existing species or adding new species.
2. **Mandatory 8-Part Anatomical Comparison Gate:** Never declare a tree species complete without verifying all 4 states (`Mature · 100%`, `Show branches` bare skeleton, `Sapling · 26%`, and `Young · 58%`) side-by-side against real-world botanical reference photographs across all 8 anatomical parts:
   - Crown Silhouette & Aspect Ratio
   - Trunk Proportion, Lean & Root Flare
   - Bare Branch Skeleton (`Show branches`)
   - Canopy Layering & Sky Windows
   - Bark Color & 3D Surface Texture
   - Leaf & Flower Organ Morphology (`src/species-sprites.ts`)
   - Ground Context & Fallen Litter
   - Biological Growth Stages (`26%` & `58%`) and 60 FPS Wind Sway
3. **No Clutter in Repo Root:** Never save Playwright screenshots, reference images, or scratch study assets inside `D:\code\procedural-trees`. Write temporary verification screenshots and scratch files under `%TEMP%\agent-scratch\procedural-trees` or `%TEMP%\playwright-mcp` and clean them up after verification.
4. **Worktrees:** Keep any git worktrees inside `.worktrees/<name>` (ignored by `.gitignore`).
5. **Storage Key Versioning:** When updating preset defaults in `src/species-profiles.ts`, increment `storageKey` and `generatorVersion` in `src/tree-2d.ts` so live browser sessions load the updated species defaults rather than stale `localStorage` values.
