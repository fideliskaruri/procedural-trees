# Botanical Math, Bark Shading, and Leaf Sprite Recipes

## Table of Contents
1. [Cubic Bézier Branch Curves & Fountain Arches](#1-cubic-bézier-branch-curves--fountain-arches)
2. [Gravity-Draped vs. Branch-Relative Leaf Orientation](#2-gravity-draped-vs-branch-relative-leaf-orientation)
3. [Curve-Following 3D Cylindrical Bark & Diamond Furrows](#3-curve-following-3d-cylindrical-bark--diamond-furrows)
4. [Multi-Layered 3D Species Leaf Sprites](#4-multi-layered-3d-species-leaf-sprites)
5. [60 FPS Ontogenetic Growth Schedule & Rendering](#5-60-fps-ontogenetic-growth-schedule--rendering)

---

## 1. Cubic Bézier Branch Curves & Fountain Arches

A branch in local coordinates starts at `(0, 0)` and ends at `(bend, -length)`.
- Standard ascending/spreading branches use a positive `handleLength ≈ 0.27–0.28`.
- **Weeping fountain arches (`depth === 1`)** must rise above `(0, 0)` before arching over and cascading downward to `(bend, -length)`. Achieve this by passing a **negative `handleLength`**:

```ts
function pointAt(
  branch: { length: number; bend: number; handleLength?: number },
  t: number,
): { x: number; y: number; tangent: number } {
  const h = branch.handleLength ?? 0.28;
  const u = 1 - t;
  const p1x = branch.bend * 0.22;
  const p1y = -branch.length * h;
  const p2x = branch.bend * (h < 0 ? 0.88 : 0.68);
  const p2y = -branch.length * (h < 0 ? 0.28 : 0.72);
  const p3x = branch.bend;
  const p3y = -branch.length;

  const x = 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * p3x;
  const y = 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * p3y;
  const dx = 3 * u * u * p1x + 6 * u * t * (p2x - p1x) + 3 * t * t * (p3x - p2x);
  const dy = 3 * u * u * p1y + 6 * u * t * (p2y - p1y) + 3 * t * t * (p3y - p2y);
  return { x, y, tangent: Math.atan2(dx, -dy) };
}
```

For weeping trees (`habit === "weeping"`):
- **Primary & secondary boughs (`depth = 3, 2`)**: gently arch upward/outward with `bend = -Math.sin(worldAngle) * (0.14..0.22) * length` so they never form reverse S-hooks.
- **Fountain arches (`depth = 1`)**: set `worldAngle = Math.PI` (local `-Y` points downward in world space), `bend = endX - startX`, and `handleLength = -(0.04 + archHeight / Math.max(32, length))` so the shoot rises by `archHeight` at its crest before sweeping straight down.
- **Pendulous whips (`depth = 0`)**: set `worldAngle = Math.PI`, `bend = endX - startX`, `handleLength = -0.05`.

---

## 2. Gravity-Draped vs. Branch-Relative Leaf Orientation

On weeping trees, orienting leaves relative to `point.tangent` causes leaves on the rising half of a fountain arch (`worldTangent ≈ 0`) to point straight up into the sky like spiky bristles. Instead, compute the spine angle in **world space** and convert back to the branch's rest frame:

```ts
if (isWeeping) {
  const worldTangent = angleAtRest + point.tangent;
  // Always hang downward (Math.PI in world space), with fuller lateral splay across the upper dome crest
  const spineWorld = Math.PI - Math.sin(worldTangent) * 0.32;
  const splay = Math.min(0.56, Math.abs(leaf.angle) * 0.82);
  angle = spineWorld + side * splay + flutter - angleAtRest;
}
```

Pair this with a higher sprite anchor (`anchorY = -leaf.size * 68 / 80` instead of `-leaf.size * 83 / 80`) so the top of each multi-leaf willow spray sits above the twig attachment point and completely conceals the upper arch wire.

---

## 3. Curve-Following 3D Cylindrical Bark & Diamond Furrows

Never use a single straight linear gradient across a curved branch. Subdivide the branch along `t ∈ [0, 1]` and shade each quad strip along its local normal `(Math.cos(pm.tangent), Math.sin(pm.tangent))`:

```ts
const segs = isTrunk ? 18 : node.radius > 4 ? 12 : 6;
for (let s = 0; s < segs; s++) {
  const t0 = s / segs;
  const t1 = (s + 1) / segs;
  const tm = (t0 + t1) * 0.5;
  const p0 = pointAt(node, t0);
  const p1 = pointAt(node, t1);
  const pm = pointAt(node, tm);
  const w0 = widthAt(t0);
  const w1 = widthAt(t1);
  const wm = Math.max(1.2, (w0 + w1) * 0.5);
  const n0x = Math.cos(p0.tangent), n0y = Math.sin(p0.tangent);
  const n1x = Math.cos(p1.tangent), n1y = Math.sin(p1.tangent);
  const nmx = Math.cos(pm.tangent), nmy = Math.sin(pm.tangent);

  const grad = ctx.createLinearGradient(
    pm.x - nmx * wm, pm.y - nmy * wm,
    pm.x + nmx * wm, pm.y + nmy * wm,
  );
  // 5-stop cylindrical lighting: warm reflected rim -> sunlit ridge -> mid-bark -> core terminator -> deep crevice shade
  grad.addColorStop(0.0, bark.base);
  grad.addColorStop(0.22, bark.light);
  grad.addColorStop(0.52, bark.base);
  grad.addColorStop(0.82, bark.shade);
  grad.addColorStop(1.0, "#181412");
  ctx.fillStyle = grad;
  // Fill overlapping quad from t0 to t1...
}
```

Then clip to `node.path` and overlay:
1. **Root buttress flutes** (`isTrunk`, `t = 0..0.38`, `4` overlapping root ridges with sunlit crests and dark inter-flute hollows).
2. **Anastomosing diamond-braided bark furrows** (`cols` sinusoidal columns where adjacent columns have opposite polarity `c % 2 === 0 ? 1 : -1`, creating braided diamond bark plates with sunlit left ridges and dark right crevices).
3. **Collar-welded limb unions** (`!isTrunk && node.radius > 3.2`, curved compression arcs at `t = 0.03, 0.07, 0.12`).
4. **Canopy & ground ambient occlusion** (linear gradient darkening the top `35%` of the trunk under the canopy shadow).

---

## 4. Multi-Layered 3D Species Leaf Sprites

### Weeping Willow (`drawWillowLeaf`)
Draw a complete 3D-shaded pendulous willow shoot segment on an `80×90` sprite canvas:
- **Pass 1 (Back-layer self-shadowed blades)**: `6` alternating narrow lance blades (`y = 14..70`) filled with `shadeColor(color, 0.64)` so the spray has internal depth.
- **Pass 2 (Flexible olive-gold stem)**: tapered two-tone central shoot axis (`#5b5338` shade + `#988e5c` highlight) from `y = 82` to `y = 8`.
- **Pass 3 (Front-layer 3D rolled lance blades)**: `9` alternating curved lance blades + `1` terminal tip blade (`y = 74..12`), varying blade half-width (`1.75px` edge-on to `3.2px` flat-on), filling the sunlit half-lamina with `tintColor(color, 0.28)` for waxy willow sheen, and stroking the pale midrib.

### Ginkgo Biloba (`drawFanLeaf`)
Draw a true bilobed fan cluster (`3` overlapping fan blades radiating from a short spur shoot):
- Wedge-shaped basal margins sweeping out at `100°–120°`,
- Distinct central apical notch/cleft dividing the fan into two lobes,
- Fine dichotomous radiating veins from the petiole apex to the ruffled upper margin,
- Render with `baseBreadth = 0.96` so the fan never collapses into a narrow needle during wind sway.

---

## 5. 60 FPS Ontogenetic Growth Schedule & Rendering

Assign causal `birthAge` and `fullAge` immediately after building `trunk` so each branch order (`4 → 3 → 2 → 1 → 0`) spans a distinct biological window of `treeAge ∈ [0.04, 1.00]`:

```ts
function assignGrowthSchedule(node: Branch, depth: number, birthAge: number, fullAge: number): void {
  node.depth = depth;
  node.birthAge = birthAge;
  node.fullAge = fullAge;
  if ((depth === 4 || depth === 3 || depth === 2 || (!!profile.flower && depth === 1)) && (node.leaves.length === 0 || !!profile.flower)) {
    // Populate node.juvenileLeaves across t = 0.20..0.98 (both layer 0 and layer 1).
    // For flowering trees (profile.flower), ALWAYS use green leaf palette indices (0..5)
    // so Seedling and Sapling stages (age = 0.04..0.45) are clothed in 100% green foliage before blooming.
  }
  for (const child of node.children) {
    const childDepth = Math.max(0, depth - 1);
    const baseBirth = childDepth === 3 ? 0.12 : childDepth === 2 ? 0.28 : childDepth === 1 ? 0.46 : 0.62;
    const atOffset = Math.max(0.10, child.at) * (childDepth === 3 ? 0.16 : 0.14);
    const childBirth = Math.min(0.82, Math.max(birthAge + 0.08, baseBirth + atOffset));
    const span = childDepth === 3 ? 0.32 : childDepth === 2 ? 0.30 : childDepth === 1 ? 0.28 : 0.26;
    const maxFull = childDepth === 3 ? 0.58 : childDepth === 2 ? 0.74 : childDepth === 1 ? 0.88 : 1.00;
    const childFull = Math.min(maxFull, childBirth + span);
    assignGrowthSchedule(child, childDepth, childBirth, childFull);
  }
}
assignGrowthSchedule(trunk, 4, 0, 0.32);
```

In `drawBranch(node, pass)` & `paintGroundCover(ctx, treeAge)`:
- Scale `woodPatch(node)` by `ctx.scale(thickness, progress)`.
- Gate adult flowering atlases by `bloomGate = isGrowing && activeProfile.flower ? Math.max(0, Math.min(1, (treeAge - 0.48) / 0.36)) : 1` so saplings are 100% green and blossoms flush in during the Young → Mature transition.
- Scale ground shadow (`0.24 + 0.76 * treeAge`) and ground fallen-blossom carpet (`litterProgress = Math.max(0, Math.min(1, (treeAge - 0.50) / 0.50))`) so a sapling never sits on an adult fallen-petal carpet.

---

## 6. Decurrent Umbrella-Dome & Flowering Trees (*Jacaranda mimosifolia*)

1. **Primary Scaffold Placement (First Structural Fork Tier, NOT Canopy Top):**
   - Place `scaffolds` at the first major fork zone (`y = -112..-206`), NOT all the way at the top of the crown. Include twin central ascending forks (`at = 0.96, 1.00`) so the top-center of the umbrella dome is convex rather than V-notched.
2. **Sinuous S-Curved Limbs (`curvePoint` Inflection):**
   - Set `handleLength > 0.32` (`0.34–0.36`) and `firstX = -Math.sin(angle) * length * collar - bend * 0.24` so the cubic Bezier swings `-0.28 * bend` in its basal third and `+0.40 * bend` in its outer two-thirds, producing authentic crooked S-curved Jacaranda boughs while keeping `pointAt(0)` and `pointAt(1)` exact.
3. **Progressive Umbrella Arch (`outwardness`) & Horizontal Dome Deflection:**
   - Compute `outwardness = Math.min(1, Math.abs(childX) / (crown.x * 0.78))` so inner forks ascend into the central dome (`worldAngle * 0.72`) while outer forks arch progressively into horizontal/nodding shelves (`worldAngle * (1.10 + outwardness * 0.16)`, up to `~99°`).
   - When clamping to the upper dome ceiling `upper`, deflect `targetY = Math.min(lowerSkirt, Math.max(upper, childY + dy * scaleX))` without multiplying `dx` by `scaleY`, so branches glide horizontally under the dome instead of shrinking into stubby broom tips.
4. **Bipinnate Fern Fronds (`drawJacarandaLeaf`) & Trumpet Panicles (`drawTrumpet`):**
   - Render `12` opposite pairs of arching pinnae with `18–26` tiny oblong-mucronate leaflets per pinna in a diamond-oval bipinnate frond (`layer = 0` under-canopy).
   - Render pyramidal panicles of `16–22` curved 5-lobed tubular-campanulate blossoms with pale whitish-lilac ventral throat streaks and unopened violet apical buds (`layer = 1` sunlit tiers).

