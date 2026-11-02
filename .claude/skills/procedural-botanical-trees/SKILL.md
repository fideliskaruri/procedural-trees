---
name: procedural-botanical-trees
description: Build, calibrate, texture, animate, and verify botanically realistic procedural 2D and 3D trees, foliage sprites, bark shaders, wind sway, and ontogenetic tree growth. Use this skill whenever the user asks to create, tune, fix, or audit procedural trees, botanical species presets (such as Ginkgo, Weeping Willow, Maple, Cherry, Oak, Conifers, Palms, Baobab), leaf or flower sprites, trunk or bark textures, branch skeletons, wind animation optimization, or tree growth simulation.
---

# Procedural Botanical Trees

A first-principles engineering workflow for building photorealistic, botanically accurate procedural trees that hold up under reverse-image species recognition, bare-skeleton inspection, 60 FPS wind sway, and ontogenetic growth from seedling to maturity.

---

## 1. Mandatory 5-Step Calibration Workflow

Never tune tree parameters blindly or declare a species "done" from a single leafy screenshot. Follow this exact loop for every species:

1. **Multi-Reference Outline & Proportion Audit First**
   - Gather at least **3 real-world full-specimen photographs** of the target species (Wikimedia Commons or botanical garden specimens showing clear trunk, scaffold fork angles, crown silhouette, and foliage clustering).
   - Measure and record four primary biometric ratios before touching code:
     - **Crown aspect ratio (`W : H`)**: e.g., upright-fan *Ginkgo biloba* (`0.72–0.92`), broad weeping *Salix babylonica* (`1.15–1.35`).
     - **Clear trunk height (`% of total height`)**: where the lowest primary scaffold forks (`14%–22%` for low-branching Ginkgo/Willow; `35%–55%` for forest canopy trees).
     - **Mid-bole trunk diameter (`% of crown width`)**: critical for realism. Most deciduous/weeping trees have a mid-bole trunk diameter of **`4.0%–5.5%` of crown width** (not `9%–12%`, which looks like a cartoon stump).
     - **Scaffold launch angle vs. terminal droop**: how steeply primary limbs ascend (`25°–55°` above horizontal) vs. how outer shoots arch or hang.
   - Build a side-by-side **SVG Outline & Proportion Study Sheet** comparing the 3+ reference photos and their traced silhouettes against the procedural render before locking parameters.

2. **Skeleton-First Verification (`Show branches`)**
   - Always toggle foliage off (`Show branches`) and inspect the bare woody skeleton at full resolution.
   - A realistic tree must look like a real winter specimen when bare. Check and eliminate these five structural bugs:
     - **Reverse S-hooks / inward curls**: caused by positive `bend` fighting downward target angles on weeping or drooping branches.
     - **Wire-cage interior loops**: caused by spawning thin interior shoots directly on thick lower primary scaffolds (`depth === 3`) on weeping trees.
     - **Horizontal or downward scaffold launches on upright species**: caused by crown depth scaling pulling `targetY` below `startY`. Enforce a minimum upward slope (`targetY <= startY - |targetX - startX| * minUpwardSlope`) when `apicalDominance >= gravity`.
     - **Over-thick primary logs**: scale child limb radius at scaffold forks by `0.58–0.64` of the tapered trunk radius so primary boughs read as ascending limbs, not duplicate trunks.
     - **Pasted-on tube seams at forks**: overlap child branch bases slightly into the parent (`t = 0` start cap + collar bark wrinkles) so unions look organically welded.

3. **Species-Specific Leaf & Flower Sprite Verification**
   - A tree is misidentified by human viewers and vision models when its leaf sprite contradicts its species (e.g., yellow blobs on bare twigs read as *Tabebuia aurea* trumpet flowers instead of *Ginkgo biloba* fan leaves).
   - Verify the **leaf silhouette, venation, clustering, and attachment anchor** at the sprite level:
     - **Fan leaves (*Ginkgo*)**: distinct wedge-fan lamina (`100°–120°` spread), central apical cleft/notch, radiating dichotomous veins, long slender petioles radiating in spur whorls (`3–5` leaves per short shoot), and broad aspect ratio (`baseBreadth >= 0.95` so fans are never squashed into needles).
     - **Weeping lance sprays (*Salix babylonica*)**: multi-layered pendulous shoot segments containing a central olive-tan twig axis, darker self-shadowed back-layer blades, and brighter sun-faceted front-layer lance blades with varied 3D roll (`edge-on` to `flat-on`).

4. ** Bilateral & Gravity-Aware Foliage Distribution**
   - Never bias leaf angles to one side of a branch (`+angle` only), which leaves half the crown bare. Always alternate sides (`const side = i % 2 === 0 ? 1 : -1`).
   - Distinguish **branch-relative** vs. **gravity-draped (world-space)** leaf orientation:
     - On **weeping species**, leaves hang downward under gravity everywhere—even on the rising half of high fountain arches. Compute the spine angle in world space (`spineWorld = Math.PI - Math.sin(worldTangent) * 0.32`) and subtract `angleAtRest`, with the sprite anchor near the top of the spray (`-leaf.size * 68 / 80`). This prevents upward-bristling spikes on the top dome and bare twig wires poking into the sky.
   - Give every major scaffold lobe both **recessed interior shadow bays (`layer = 0`)** and **sunlit foreground dome crests (`layer = 1`)** by varying `childHue` and `layer` across inward vs. outward sub-branches (`depth = 2`).
   - Avoid flat horizontal "hedge-trimmer" bottom skirts: vary curtain drop lengths per scaffold lobe plus per-strand feathering (`whipDrop`), lifting the inner central hem slightly to frame the upper trunk fork while outer curtains sweep lower.

5. **Curve-Following 3D Bark Shading**
   - Never shade a curved trunk with a single axis-aligned gradient `createLinearGradient(-radius, 0, radius, 0)`. When `bend != 0`, the upper trunk drifts outside `[-radius, +radius]` and clamps to a flat unshaded color.
   - Always step along `pointAt(node, t)` (`s = 0..segs - 1`) and align each quad strip's linear gradient along the **local cross-sectional normal** `(Math.cos(tangent), Math.sin(tangent))` from `-width` to `+width`.
   - Layer four anatomical bark cues on top of the cylindrical base:
     1. **Multi-fluted root buttresses** near `t = 0..0.38` on the trunk (`3–4` overlapping root ridges with sunlit crests and dark inter-flute hollows).
     2. **Anastomosing diamond-braided bark furrows** (opposing sinusoidal columns `c = 0..cols` that split and rejoin into diamond plates, rendered as shadow crevices offset from sunlit ridge plates).
     3. **Collar-welded limb unions** (curved bark compression wrinkles at `t = 0.03..0.12` on child limbs).
     4. **Canopy & ground ambient occlusion** (darkening the upper trunk where it disappears under the crown shadow and grounding the root flare).

---

## 2. Mandatory 8-Part Anatomical Comparison Gate (Anti-Premature-Completion Check)

**CRITICAL RULE: Never stop after one pass and declare a tree "done" while it still looks artificial, blobby, or disproportionate.**
Before you are allowed to finish or present a tree as complete, you must compare **each of the 8 anatomical parts below** side-by-side against at least 3 real-life reference photographs (inspecting both the **Leafy Render** and the **Bare Skeleton (`Show branches`)** via real screenshots).

If **any single part** fails to match its real-life counterpart, you **must** iterate on the generator/sprites/profile and re-screenshot until all 8 parts pass:

| # | Anatomical Part | What to Check Against Real-Life Counterpart Photos | Common Failure Modes That Must Be Fixed |
|---|---|---|---|
| **1** | **Root Flare & Ground Contact** | Does the base flare organically into the soil with species-appropriate root flutes/buttresses and ground AO shadow? | Cylindrical "stovepipe" trunk meeting the ground flat; exaggerated wide skirt on slender species. |
| **2** | **Trunk Proportions, Sweep & Bark** | Does mid-bole trunk diameter (`% of crown width`), clear-trunk height before first fork, trunk lean/sweep, and bark color/fissure texture match real specimens? | Trunk 2× too thick ("cartoon log"); flat gradient clamping on curved trunks; wrong bark color (e.g., dark brown on a pale gray-buff Jacaranda or Beech). |
| **3** | **Primary Scaffold Forks (`Show branches`)** | Do primary boughs fork at the real height and launch angle, with welded collars and realistic limb-to-trunk radius ratio (`0.55–0.68×`)? | Branches pasted on with hard tube seams; all scaffolds radiating from a single point like an umbrella spoke wheel; upward limbs sagging below horizontal. |
| **4** | **Secondary Boughs & Terminal Twigs (`Show branches`)** | Does the bare skeleton look like a real winter photograph of the species—sinuous, tapered, with clean sub-branch hierarchy? | Reverse S-hooks; chaotic wire-cage loops on lower limbs; stiff straight sticks; bare twig wires poking out past the foliage envelope. |
| **5** | **Crown Silhouette, Aspect Ratio & Sky Windows** | Does the outer silhouette match the real `W : H` ratio, crown habit (umbrella dome, vase, pyramid, weeping), and internal negative-space sky windows? | Solid monotone green/purple blob with zero sky windows or branch peek-through; symmetric lollipop sphere; flat scissor-cut bottom hem. |
| **6** | **Leaf & Flower Organ Morphology (Close-Up)** | Could a botanist or reverse-image search identify the species from a close-up of the foliage/flower sprites alone? | Generic ovals instead of bipinnate fern fronds, bilobed fans, or hanging lance sprays; round dots instead of tubular trumpet panicles (*Jacaranda*) or pendulous racemes (*Wisteria*). |
| **7** | **Canopy Depth, Lobe Shadow Bays & Palette** | Are individual cloud tiers / scaffold lobes separated by deep recessed interior shadow bays (`layer = 0`) behind sunlit foreground crests (`layer = 1`), with dark structural branches peeking through gaps? | Flat 2D sticker appearance where all leaves share the same brightness; oversaturated neon colors; no dark interior depth around the upper fork. |
| **8** | **Ontogenetic Growth Stages (`4%–100%`) & 60 FPS Wind** | Scrub `Age` to `12%` (Seedling), `26%` (Sapling), `58%` (Young), and `100%` (Mature): does every stage look like a real living tree at that age, with smooth 60 FPS wind sway? | Bare brown sticks with no juvenile leaves at sapling stage; tilted or non-uniformly squashed leaf atlases at intermediate ages; bare branch tips poking out of saplings. |

### Required Visual Sign-Off Loop
1. Capture screenshots of **4 states**: `Mature Leafy (100%)`, `Bare Skeleton (Show branches)`, `Sapling (26%)`, and `Young (58%)`.
2. View the screenshots directly and grade all **8 parts** against the real reference photos.
3. Explicitly fix every discrepancy found (never rationalize a flaw as "acceptable for 2D").
4. Only after at least one self-critique & refinement pass where all 8 parts match the real tree may you report completion.

---

## 3. 60 FPS Wind Sway & Ontogenetic Growth Architecture

When rendering 15,000–35,000 leaves in 2D Canvas, re-Evaluating paths and per-leaf transforms every frame drops frame rates below 15 FPS. Use **Hierarchical Rigid-Body + 4-Frame Phase-Quantized Sprite Atlases**:

1. **Two-Tier Caching (`woodPatch` + `foliageAtlas`)**
   - Cache each branch's rendered bark cylinder + fissures into an offscreen `woodPatch(node)`.
   - Cache each branch's leaves (`layer = 0` rear and `layer = 1` front) into a **4-frame horizontal strip** `foliageAtlas(node, layer, frameIndex)` (`frameIndex ∈ {0, 1, 2, 3}` for wind flutter phases `0, π/2, π, 3π/2`).
   - Per frame, `drawBranch` performs only `1` `drawImage` for the wood patch and `2` `drawImage` calls (rear + front) for the foliage atlas, reducing ~25,000 leaf draws to ~150 fast GPU blits.
   - Budget atlas construction across frames (`cacheBudget = 6ms` during interactive scrubbing; `Infinity` for thumbnails/exports) so parameter sliders stay instant.

2. **Biological Growth Simulation (`age ∈ [0.04, 1.00]`) Without Cache Invalidation**
   - Precompute a causal developmental schedule on each `Branch` right after tree generation:
     - `trunk` (`depth = 4`): `birthAge = 0`, `fullAge = 0.24`.
     - Child at `child.at` on parent `(birthAge, fullAge)`:
       `childBirth = Math.min(0.82, birthAge + Math.max(0.14, child.at) * (fullAge - birthAge) * 0.62)`
       `childFull = Math.min(maxFullByDepth, childBirth + spanByDepth)`.
   - During `drawBranch(node, pass)` when `treeAge < 0.999`:
     - **Causal sprouting**: if `treeAge <= node.birthAge`, return immediately.
     - **Acropetal shoot elongation**: `raw = clamp01((treeAge - birth) / (full - birth))`, `progress = 1 - (1 - raw) ** 1.65`.
     - **Secondary cambial thickening**: `cambial = clamp01((treeAge - birth) / (1 - birth * 0.65))`, `thickness = baseThickness + (1 - baseThickness) * (cambial ** 1.15)`.
     - **Wood scaling**: draw `woodPatch(node)` under `ctx.scale(thickness, progress)` and translate children to `(point.x * thickness, point.y * progress)`.
     - **Isotropic foliage scaling**: draw `foliageAtlas` under **uniform** `ctx.scale(uniformScale, uniformScale)` (`uniformScale = 0.24 + 0.76 * progress`) and **never** add extra parent rotation offsets that deviate from `restAngles.get(node)`. This preserves 100% of the pre-baked downward gravity orientation and leaf aspect ratio at every growth stage.
     - **Juvenile sapling foliage**: because `trunk` (`depth = 4`), `depth = 3`, and `depth = 2` boughs carry no adult leaves at `age = 1.0`, attach temporary `juvenileLeaves` along `t = 0.22..0.98` of `depth = 4, 3, 2` that render during `Seedling` and `Sapling` stages (`age < 0.58`) and smoothly shed (`juvAlpha -> 0`) as the outer canopy takes over. Never clip `juvenileLeaves` by `leaf.at > progress` when their coordinates are already scaled by `(pt.x * thickness, pt.y * progress)`, or bare brown stick tips will poke out of saplings.

---

## 3. Detailed Code Recipes & Mathematical Reference

When implementing or modifying branch geometry, bark rendering, species leaf sprites, or growth simulation, read:
- `references/botanical-math-and-sprites.md` — complete, copy-ready TypeScript recipes for cubic Bézier fountain arches, curve-following normal bark shading, Ginkgo/Willow 3D leaf sprites, gravity-draped `leafPoses`, and 60 FPS ontogenetic growth.
