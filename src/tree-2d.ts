import "./style.css";
import { defaultParameters, definitions, isParameters, normalizeParameters, type TreeParameters } from "./tree-parameters";
import { getSpecies, isSpecies, speciesProfiles, type Species } from "./species-profiles";
import { makeSpeciesSprites } from "./species-sprites";

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing interface element: ${id}`);
  return node as T;
}

function randomFrom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Leaf {
  at: number;
  angle: number;
  size: number;
  stem: number;
  color: number;
  phase: number;
  layer: number;
  pendant: boolean;
}

interface Branch {
  length: number;
  radius: number;
  bend: number;
  angle: number;
  handleLength?: number;
  at: number;
  phase: number;
  flexibility: number;
  leaves: Leaf[];
  juvenileLeaves?: Leaf[];
  children: Branch[];
  path: Path2D;
  props?: { at: number; groundX: number }[];
  depth?: number;
  birthAge?: number;
  fullAge?: number;
}

interface Tree {
  trunk: Branch;
  count: number;
  bounds: { left: number; right: number; top: number };
  signature: string;
}

interface RasterPatch {
  canvas: HTMLCanvasElement;
  left: number;
  top: number;
  width: number;
  height: number;
  density: number;
}

interface LeafAtlas extends RasterPatch {
  context: CanvasRenderingContext2D;
  leaves: Leaf[];
  ready: boolean[];
}

const scene = element<HTMLDivElement>("scene");
const status = element<HTMLParagraphElement>("status");
const foliageButton = element<HTMLButtonElement>("foliage");
const regenerateButton = element<HTMLButtonElement>("regenerate");
const windButton = element<HTMLButtonElement>("wind");
const growButton = element<HTMLButtonElement>("grow");
const ageSlider = element<HTMLInputElement>("age-slider");
const ageLabel = element<HTMLLabelElement>("age-label");
const error = element<HTMLDivElement>("error");
const speciesSelect = element<HTMLSelectElement>("species");
const title = element<HTMLHeadingElement>("tree-title");

function reportError(cause: unknown): void {
  console.error("Unable to draw the 2D tree", cause);
  error.hidden = false;
  error.textContent = "The 2D tree could not be drawn. Reload the page, or try another browser.";
  status.textContent = "The tree could not be displayed.";
  foliageButton.disabled = regenerateButton.disabled = windButton.disabled = growButton.disabled = true;
  speciesSelect.disabled = true;
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  return [canvas, ctx];
}

function pointAt(branch: Branch, t: number): { x: number; y: number; tangent: number } {
  return curvePoint(branch.length, branch.bend, branch.angle, t, branch.handleLength);
}

function curvePoint(length: number, bend: number, angle: number, t: number, handleLength = 0.28): { x: number; y: number; tangent: number } {
  const u = 1 - t;
  // Negative handleLength encodes a world-space gravity fountain arch (monotonically outward X, vertical tip tangent, zero inward hook)
  if (handleLength < 0) {
    const dx = Math.max(-length * 0.98, Math.min(length * 0.98, bend));
    const dy = Math.sqrt(Math.max(0, length * length - dx * dx));
    const sinW = length > 0 ? dx / length : 0;
    const cosW = length > 0 ? -dy / length : -1;
    const archRise = Math.max(0, (-handleLength - 0.05) * length);
    const dX1 = (archRise > 0 ? 0.44 : 0.48) * dx;
    const dY1 = archRise > 0 ? -archRise : 0.14 * dy;
    const dX2 = 0.96 * dx;
    const dY2 = archRise > 0 ? -0.42 * archRise + 0.18 * dy : 0.48 * dy;
    const firstX = dX1 * cosW + dY1 * sinW;
    const firstY = -dX1 * sinW + dY1 * cosW;
    const secondX = dX2 * cosW + dY2 * sinW;
    const secondY = -dX2 * sinW + dY2 * cosW;
    const dxl = 3 * u * u * firstX + 6 * u * t * (secondX - firstX) - 3 * t * t * secondX;
    const dyl = 3 * u * u * firstY + 6 * u * t * (secondY - firstY) + 3 * t * t * (-length - secondY);
    return {
      x: 3 * u * u * t * firstX + 3 * u * t * t * secondX,
      y: 3 * u * u * t * firstY + 3 * u * t * t * secondY - t * t * t * length,
      tangent: Math.atan2(dxl, -dyl),
    };
  }
  const collar = Math.min(0.05, handleLength * 0.18);
  const firstX = -Math.sin(angle) * length * collar + bend * (handleLength > 0.32 ? -0.78 : 0.32);
  const firstY = -Math.max(0.25, Math.cos(angle)) * length * handleLength;
  const secondY = -length * 0.72;
  const dx = 3 * u * u * firstX + 6 * u * t * (bend - firstX) - 3 * t * t * bend;
  const dy = 3 * u * u * firstY + 6 * u * t * (secondY - firstY) + 3 * t * t * (-length - secondY);
  return {
    x: 3 * u * u * t * firstX + 3 * u * t * t * bend,
    y: 3 * u * u * t * firstY + 3 * u * t * t * secondY - t * t * t * length,
    tangent: Math.atan2(dx, -dy),
  };
}

function branchPath(
  length: number, radius: number, bend: number, angle = 0, taper = 0.57, flare = 0, swelling = 0, handleLength = 0.28,
): Path2D {
  const path = new Path2D();
  const steps = radius > 3 ? 28 : 20;
  const isWoody = radius > 3.2;
  const collarBoost = flare === 0 && isWoody ? 0.18 : 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i <= steps; i++) {
      const t = side === -1 ? i / steps : 1 - i / steps;
      const point = curvePoint(length, bend, angle, t, handleLength);
      const gnarl = isWoody
        ? 1 + Math.sin(t * 10.5 + side * 1.4 + bend * 0.09) * 0.042 + Math.cos(t * 23 - side * 0.9) * 0.018
        : 1;
      const rootButtress = flare > 0
        ? flare * (0.72 * Math.exp(-t * 13) + 0.18 * Math.exp(-t * 4.5) * (side === -1 ? 1.12 : 0.94))
        : collarBoost * Math.exp(-t * 14);
      const width = radius * (1 - t * (radius > 2 ? 1 - taper : 0.82))
        * (1 + rootButtress + Math.sin(t * Math.PI) * swelling) * gnarl;
      const x = point.x + side * Math.cos(point.tangent) * width;
      const y = point.y + side * Math.sin(point.tangent) * width;
      if (side === -1 && i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
  }
  const baseRadius = radius * (1 + (flare > 0 ? flare * 0.90 : collarBoost));
  if (flare > 0) {
    // Organic multi-toed root-buttress ground contact curve instead of a flat geometric arc
    path.bezierCurveTo(
      baseRadius * 0.42, baseRadius * 0.22,
      -baseRadius * 0.38, baseRadius * 0.26,
      -Math.cos(-angle) * baseRadius * 1.02, -Math.sin(-angle) * baseRadius,
    );
  } else {
    path.quadraticCurveTo(0, baseRadius * 0.28, -Math.cos(-angle) * baseRadius, -Math.sin(-angle) * baseRadius);
  }
  path.closePath();
  return path;
}

function growTree(seed: number, species: Species, parameters: TreeParameters): Tree {
  const rng = randomFrom(seed);
  const profile = getSpecies(species);
  const maple = species === "maple";
  const jacaranda = species === "jacaranda";
  const palm = profile.habit === "palm";
  const conifer = profile.habit === "conifer";
  const needles = profile.leafForm === "needle" || profile.leafForm === "scale";
  const weeping = profile.habit === "weeping";
  // Reserve room for the largest allowed leaves without moving branches during foliage experiments.
  const pendantClearance = profile.leafSize * 2.7 + 10;
  const fanBroadleaf = !maple && !needles
    && ["rounded", "spreading", "vase", "columnar", "baobab", "banyan"].includes(profile.habit);
  let count = 0;
  let nodeIndex = 0;
  const trunkOffset = profile.trunk.length * (parameters.trunkHeight - 1);
  const crown = {
    x: profile.crown.width * parameters.crownWidth,
    y: profile.crown.depth * parameters.crownDepth,
    center: profile.crown.center - trunkOffset - (parameters.crownDepth - 1) * profile.crown.depth * 0.35,
  };

  function shoot(
    startX: number, startY: number, endX: number, endY: number,
    radius: number, parentAngle: number, at: number, depth: number, hue: number,
  ): Branch {
    const length = Math.hypot(endX - startX, endY - startY);
    const worldAngle = Math.atan2(endX - startX, startY - endY);
    const fanLeaves = profile.leafForm === "fan";
    const upwardSweep = fanLeaves || (!weeping && parameters.apicalDominance > 0.78) ? 1 : -1;
    const centerDome = Math.exp(-((startX / 105) ** 2));
    const archHeight = weeping && depth === 1
      ? (8 + at * 12 + centerDome * 8 + rng() * 6) * parameters.crownDepth * (0.65 + parameters.curvature * 0.45)
      : 0;
    const bend = weeping
      ? depth === 3 || depth === 2
        ? -Math.sin(worldAngle) * (depth === 3 ? 0.14 + rng() * 0.04 : 0.18 + rng() * 0.05) * length * (0.65 + parameters.curvature * 0.55)
        : endX - startX
      : jacaranda
        ? ((depth % 2 === 1 ? -1 : 1) * (Math.sign(worldAngle) || (nodeIndex % 2 ? 1 : -1)))
          * (depth === 3 ? 0.24 + rng() * 0.08 : depth === 2 ? 0.22 + rng() * 0.08 : 0.18 + rng() * 0.07)
          * length * (0.82 + parameters.curvature * 0.62)
        : ((rng() - 0.5) * 0.12 + upwardSweep * Math.sign(endX) * (fanLeaves ? 0.11 : 0.08)) * length * parameters.curvature * 2;
    const handleLength = weeping
      ? (depth === 1 ? -(0.04 + archHeight / Math.max(32, length)) : depth === 0 ? -0.05 : 0.27)
      : jacaranda
        ? (depth === 3 ? 0.38 : 0.35)
        : 0.28;
    // A separate random stream keeps foliage experiments from moving branches.
    const leafRng = randomFrom(seed ^ Math.imul(++nodeIndex, 0x45d9f3b));
    const node: Branch = {
      length, radius, angle: worldAngle - parentAngle, at, bend, handleLength, phase: rng() * Math.PI * 2,
      flexibility: radius > 8 ? 0.003 : 0.006 + (3 - depth) * 0.007,
      leaves: [], children: [], path: branchPath(length, radius, bend, worldAngle - parentAngle, parameters.taper, 0, 0, handleLength),
    };
    if ((depth === 0 || depth === 1 || (needles || weeping || fanLeaves || jacaranda) && depth === 2 || fanLeaves && depth === 3) && leafRng() >= parameters.canopyGaps) {
      const pairs = palm ? 22
        : fanLeaves ? profile.leafPairs * (depth === 3 ? 1.4 : depth === 2 ? 1.15 : depth === 1 ? 0.95 : 1)
          : weeping ? profile.leafPairs * (depth === 2 ? 1.42 : depth === 1 ? 1.72 : 1.18)
            : jacaranda ? profile.leafPairs * (depth === 2 ? 0.92 : depth === 1 ? 1.36 : 1.50)
              : depth === 0 ? profile.leafPairs
                : profile.leafPairs * (needles ? 0.7 : 0.45);
      const nodes = Math.max(1, Math.round(pairs / parameters.foliageSpacing),
        needles ? Math.ceil(length / (profile.leafSize * parameters.foliageSize * parameters.foliageSpacing * 0.6)) : 0);
      for (let i = 0; i < nodes; i++) {
        for (const side of [-1, 1]) {
          const u = i / nodes;
          // In peak spring bloom, Jacaranda is brevideciduous (~98% lavender-violet blossom clouds, no heavy green lower belt)
          const flower = !!profile.flower && (
            jacaranda
              ? (depth === 2 ? u > 0.22 && leafRng() < parameters.flowerDensity * 0.98
                : depth === 1 ? (u > 0.06 || leafRng() < parameters.flowerDensity) && leafRng() < 0.98
                  : leafRng() < Math.max(0.98, parameters.flowerDensity))
              : depth === 0 && leafRng() < parameters.flowerDensity
          );
          if (jacaranda && depth === 2 && !flower) continue;
          const regular = palm || needles ? 0.05 + u * 0.93
            : weeping ? (depth === 1 ? 0.01 + (u < 0.56 ? u * 0.64 : 0.368 + (u - 0.56) * 1.4) : 0.03 + u * 0.92)
              : fanLeaves ? (depth === 3 ? 0.20 + u * 0.78 : 0.06 + u * 0.92)
                : jacaranda ? (depth === 2 ? 0.26 + u * 0.70 : depth === 1 ? 0.12 + u * 0.84 : 0.06 + u * 0.90)
                  : 0.38 + u * 0.6;
          const grouped = fanLeaves
            ? [0.16, 0.34, 0.52, 0.71, 0.9][i % 5] + (leafRng() - 0.5) * 0.06
            : jacaranda
              ? [0.20, 0.45, 0.70, 0.92][i % 4] + (leafRng() - 0.5) * 0.06
              : [0.5, 0.72, 0.91][i % 3] + (leafRng() - 0.5) * 0.07;
          const attachment = palm ? regular : regular * (1 - parameters.foliageClustering) + grouped * parameters.foliageClustering;
          const leafWorldX = startX + (endX - startX) * attachment;
          const leafWorldY = startY + (endY - startY) * attachment;
          // Vaulted sub-canopy arch: open below -114px at center (x=0) so stout primary/secondary boughs breathe, sloping down to -72px on outer wings
          const galleryArchY = Math.abs(leafWorldX) < 124
            ? -114 + ((leafWorldX / 124) ** 2) * 42
            : -72;
          if (jacaranda && leafWorldY > galleryArchY) continue;
          // Dappled sky pockets along the lower sub-canopy gallery edge behind the stout boughs
          const inLowerGalleryBand = Math.abs(leafWorldX) < 116 && leafWorldY > galleryArchY - 28;
          if (jacaranda && inLowerGalleryBand && leafWorldY > galleryArchY - 14 && leafRng() < 0.24) continue;
          const weepingCrownScale = weeping
            ? (depth === 2 ? 1.18 : depth === 1 ? 1.22 - attachment * 0.28 : 0.94)
            : jacaranda
              ? (flower ? (depth === 0 ? 1.18 : depth === 1 ? 1.14 : 1.04) : 0.72)
              : 1;
          const isRearLobe = weeping && (hue <= 5 || (depth === 0 && Math.abs(startX) < 54 && attachment > 0.35));
          const crestLight = depth === 2 ? 0.90 : depth === 1 ? Math.max(0, 1 - attachment * 1.08) : Math.max(0, 0.42 - attachment * 0.38);
          const weepingTone = isRearLobe
            ? 1.5 + crestLight * 6.5
            : 5.8 + Math.max(0, hue - 8) * 0.55 + crestLight * 7.8;
          const weepingColor = Math.max(0, Math.min(17, Math.round(weepingTone + (leafRng() - 0.5) * 3.2)));
          const weepingLayer: 0 | 1 = isRearLobe
            ? (leafRng() > 0.86 ? 1 : 0)
            : (depth >= 1 && attachment < 0.58 ? (leafRng() > 0.14 ? 1 : 0) : (leafRng() > 0.34 ? 1 : 0));
          // Volumetric 3D cauliflower-cloud shading: combine global dome height with per-puff local shadow bowls & sunlit upper crests
          const heightNorm = Math.max(0, Math.min(1, (-leafWorldY - 102) / 152));
          const radialNorm = Math.max(0, Math.min(1, Math.hypot(leafWorldX / (crown.x * 0.92), (leafWorldY - (crown.center - 12)) / (crown.y * 0.95))));
          const skyPerimeter = heightNorm > 0.72 || (radialNorm > 0.78 && !inLowerGalleryBand);
          const midY = (startY + endY) * 0.5;
          const localUp = Math.max(-1, Math.min(1, (midY - leafWorldY) / Math.max(16, length * 0.44)));
          const sideLift = -side * Math.sin(worldAngle) * 0.34;
          const puffSun = Math.max(0, Math.min(1, 0.46 + localUp * 0.38 + sideLift + (attachment - 0.48) * 0.28));
          const jacarandaSun = inLowerGalleryBand
            ? Math.max(0, Math.min(0.46, heightNorm * 0.36 + puffSun * 0.26 - 0.10))
            : Math.max(0, Math.min(1, heightNorm * 0.46 + puffSun * 0.54 + (depth === 0 ? 0.08 : depth === 2 ? -0.18 : 0)));
          const minFlowerColor = skyPerimeter ? 11 : 6;
          const maxFlowerColor = inLowerGalleryBand && depth >= 1 ? 11 : 17;
          const jacarandaColor = flower
            ? Math.max(minFlowerColor, Math.min(maxFlowerColor, Math.round(6 + jacarandaSun * 11.2 + (leafRng() - 0.5) * 2.0)))
            : Math.max(1, Math.min(5, Math.round(1.5 + jacarandaSun * 3.0)));
          // Depth 2 & basal depth 1 sit in layer 0 ("rear") behind stout gallery boughs; terminal depth 0 & distal depth 1 billow in layer 1 ("front") over fine twig tips
          const jacarandaLayer: 0 | 1 = !flower
            ? 0
            : depth === 2
              ? (Math.abs(leafWorldX) > 132 && attachment > 0.68 && leafRng() > 0.32 ? 1 : 0)
              : depth === 1
                ? (inLowerGalleryBand
                  ? (attachment > 0.62 && leafRng() > 0.38 ? 1 : 0)
                  : (attachment > 0.34 && leafRng() > 0.20 ? 1 : 0))
                : (inLowerGalleryBand
                  ? (attachment > 0.32 && leafRng() > 0.24 ? 1 : 0)
                  : (leafRng() > 0.12 ? 1 : 0));
          node.leaves.push({
            at: attachment,
            angle: side * (palm ? 1.08 + leafRng() * 0.3 * parameters.leafOrientation
              : needles ? (i % 2 ? 2.3 : 0.75) + (leafRng() - 0.5) * parameters.leafOrientation
                : weeping ? (depth === 2 ? 0.48 + leafRng() * 0.28 : depth === 1 ? (0.44 - attachment * 0.18) + leafRng() * 0.22 : 0.22 + leafRng() * 0.16) * (0.78 + parameters.leafOrientation)
                  : fanLeaves ? 0.28 + leafRng() * 0.82 * parameters.leafOrientation
                    : jacaranda ? (flower ? 0.38 + leafRng() * 0.88 * parameters.leafOrientation : 0.58 + leafRng() * 0.95 * parameters.leafOrientation)
                      : 0.7 + leafRng() * 2.3 * parameters.leafOrientation),
            size: (flower ? profile.flower?.form === "magnolia" ? 32 : 28 : profile.leafSize)
              * (palm ? 0.2 + Math.sin(attachment * Math.PI) * 0.85 : weepingCrownScale)
              * (1 + (leafRng() - 0.5) * parameters.leafSizeVariation)
              * parameters.foliageSize * (flower ? parameters.panicleSize : 1),
            stem: palm || weeping ? 0 : fanLeaves ? 1.4 + leafRng() * 2.2 : jacaranda && flower ? 4 + leafRng() * 7.5 : 2 + leafRng() * 3.3,
            color: weeping ? weepingColor
              : jacaranda ? jacarandaColor
                : !maple
                  ? (flower ? 6 + Math.floor(leafRng() * 12) : Math.floor(leafRng() * (profile.flower ? 6 : 18)))
                  : Math.max(0, Math.min(17, hue + Math.floor((leafRng() - 0.5) * 4))),
            phase: leafRng() * Math.PI * 2,
            layer: weeping ? weepingLayer : jacaranda ? jacarandaLayer : (leafRng() > 0.42 ? 1 : 0),
            pendant: weeping || species === "norway-spruce" && depth < 2 || flower && profile.flower?.form === "raceme",
          });
          count++;
        }
      }
    }
    if (depth > 0) {
      const children = Math.min(4, parameters.forkCount + (maple && depth === 1 ? 1 : 0));
      for (let i = 0; i < children; i++) {
        if (depth === 2 && i === 1 && !weeping && !jacaranda && rng() < (maple ? 0.1 : 0.25)) continue;
        const baseAttach = fanLeaves ? 0.28 + i * 0.24
          : weeping ? (depth === 3 ? 0.42 + i * 0.19 : depth === 2 ? 0.44 + i * 0.18 : 0.30 + i * 0.22)
            : jacaranda ? (depth === 3 ? [0.34, 0.68, 1.0][i] : [0.40, 0.72, 1.0][i]) ?? 0.85
              : 0.56 + i * 0.15;
        const attachment = i === children - 1 ? 1 : Math.max(0.18, Math.min(0.94, baseAttach * parameters.attachmentSpacing));
        const point = pointAt(node, attachment);
        const cos = Math.cos(worldAngle);
        const sin = Math.sin(worldAngle);
        const childX = startX + point.x * cos - point.y * sin;
        const childY = startY + point.x * sin + point.y * cos;
        const reach = length * (depth === 1 ? 0.48 * parameters.twigLength : 0.57);
        const side = Math.abs(endX) < 20 ? (i % 2 ? 1 : -1) : Math.sign(endX);
        let targetX: number;
        let targetY: number;
        if (fanBroadleaf) {
          const branchSide = Math.abs(worldAngle) < 0.12 ? (i % 2 ? 1 : -1) : Math.sign(worldAngle);
          const spreadUnit = (jacaranda ? 0.34 : 0.26) + parameters.angleVariation * 0.34;
          let baseDirection: number;
          if (jacaranda) {
            // Hierarchical sympodial gallery: 6 low-forking primary boughs classified deterministically by trunk attachment (`at`)
            const outwardness = Math.min(1, Math.abs(childX) / (crown.x * 0.76));
            if (depth === 3) {
              if (at > 0.82) {
                // Inner-crown primary pair: i=0 bridges to upper shoulder, i=1 arches inward across x=0, i=2 ascends into the central dome apex
                const innerGallerySlots = [
                  worldAngle * 0.74 + branchSide * 0.16,
                  -branchSide * 0.20,
                  worldAngle * 0.20 - branchSide * 0.05,
                ];
                baseDirection = innerGallerySlots[i] ?? worldAngle * 0.50;
              } else if (at > 0.60) {
                // Mid-shoulder primary pair: i=0 rises into upper-inner shoulder, i=1 builds mid-shoulder dome, i=2 sweeps to outer shoulder
                const midGallerySlots = [
                  worldAngle * 0.48 - branchSide * 0.10,
                  worldAngle * 0.72 + branchSide * 0.02,
                  worldAngle * 0.92 + branchSide * 0.16,
                ];
                baseDirection = midGallerySlots[i] ?? worldAngle * 0.74;
              } else {
                // Outer-wing primary pair: i=0 rises into outer shoulder, i=1 sweeps into mid-wing, i=2 extends into lower-outer skirt
                const outerGallerySlots = [
                  worldAngle * 0.58 - branchSide * 0.12,
                  worldAngle * 0.84 + branchSide * 0.06,
                  worldAngle * 1.02 + branchSide * 0.20,
                ];
                baseDirection = outerGallerySlots[i] ?? worldAngle;
              }
            } else if (Math.abs(worldAngle) < 0.52 && Math.abs(childX) < 82) {
              const domeSlots = [
                -branchSide * 0.22,
                worldAngle * 0.34 + branchSide * 0.06,
                worldAngle * 0.76 + branchSide * 0.20,
              ];
              baseDirection = domeSlots[i] ?? worldAngle * 0.60;
            } else {
              const shoulderSlots = [
                worldAngle * (0.52 + outwardness * 0.12) - branchSide * spreadUnit * 0.30,
                worldAngle * (0.78 + outwardness * 0.10) + branchSide * spreadUnit * 0.02,
                worldAngle * (0.98 + outwardness * 0.10) + branchSide * spreadUnit * 0.24,
              ];
              baseDirection = shoulderSlots[i] ?? worldAngle;
            }
          } else if (i === children - 1) {
            // Terminal leader continues along the parent branch ray with a gentle upward candelabra sweep
            baseDirection = worldAngle * (fanLeaves ? 0.88 : 1 - parameters.apicalDominance * 0.12);
          } else if (Math.abs(worldAngle) < 0.18) {
            // Near-vertical central leader: fan lateral shoots symmetrically left and right
            const centralSlot = [-0.75, 0.75, -0.38][i] ?? (i % 2 ? 0.55 : -0.55);
            baseDirection = worldAngle + centralSlot * spreadUnit;
          } else if (fanLeaves) {
            // Fork Ginkgo boughs into ascending candelabra plumes while preserving open bays between tiers
            baseDirection = i === 0
              ? worldAngle * 0.72 - branchSide * spreadUnit * 0.34
              : i === 1
                ? worldAngle * 0.98 + branchSide * spreadUnit * 0.36
                : worldAngle * 0.82 - branchSide * spreadUnit * 0.18;
          } else if (i === 0) {
            // Inner lateral shoot launches steeply upward off the upper side of the diagonal limb
            baseDirection = worldAngle * (0.52 - parameters.apicalDominance * 0.2) - branchSide * spreadUnit * 0.22;
          } else if (i === 1) {
            // Outer lateral shoot extends along the limb ray
            baseDirection = worldAngle * (0.94 - parameters.apicalDominance * 0.06) + branchSide * spreadUnit * 0.68;
          } else {
            // Upper-mid lateral shoot rises between the steep inner shoot and the terminal ray
            baseDirection = worldAngle * (0.74 - parameters.apicalDominance * 0.18) - branchSide * spreadUnit * 0.15;
          }
          const jitter = (rng() - 0.5) * parameters.angleVariation * (fanLeaves ? 0.18 : 0.22);
          const maxSpread = jacaranda
            ? Math.PI * (0.44 + Math.min(1, Math.abs(childX) / (crown.x * 0.84)) * 0.08)
            : Math.PI * ((fanLeaves ? 0.45 : 0.48) - parameters.apicalDominance * (fanLeaves ? 0.04 : 0.1) + parameters.gravity * 0.22);
          const direction = Math.max(-maxSpread, Math.min(maxSpread, baseDirection + jitter));
          const isTerminal = i === children - 1;
          const distance = length * (fanLeaves
            ? (isTerminal ? (depth === 1 ? 0.58 * parameters.twigLength : 0.66) : (depth === 1 ? 0.44 * parameters.twigLength : 0.50))
            : jacaranda
              ? (depth === 3 ? (isTerminal ? 0.88 : 0.82) : depth === 2 ? (isTerminal ? 0.76 : 0.66) : (isTerminal ? 0.60 : 0.50) * parameters.twigLength)
              : (depth === 1 ? 0.56 * parameters.twigLength : 0.72));
          targetX = childX + Math.sin(direction) * distance;
          targetY = childY - Math.cos(direction) * distance;
        } else if (weeping) {
          const outerSide = Math.abs(childX) < 18 ? (i % 2 ? 1 : -1) : Math.sign(childX);
          if (depth === 3) {
            // Secondary structural boughs (depth 2): fan across each scaffold lobe (both bridging inward and sweeping outward) to form broad overlapping dome clouds
            if (Math.abs(endX) < 42) {
              // Upper-center dome scaffolds: fan widely across x ≈ -85..+85 so the top dome merges seamlessly with the mid shoulders
              const centralOffsets = [-outerSide * (18 + rng() * 10), outerSide * (12 + rng() * 12), outerSide * (36 + rng() * 14), outerSide * (62 + rng() * 16)];
              targetX = childX + (centralOffsets[i] ?? outerSide * 24) * parameters.branchSpread;
            } else if (Math.abs(endX) < 105) {
              // Mid-shoulder lobes: i=0 bridges inward toward the upper dome, while i=1..3 fan broadly across the shoulder
              const spreadSlots = [-12 + rng() * 10, 18 + rng() * 12, 42 + rng() * 14, 66 + rng() * 16];
              targetX = childX + outerSide * (spreadSlots[i] ?? 30) * parameters.branchSpread + (rng() - 0.5) * 8 * parameters.angleVariation;
            } else {
              // Lower-outer flank lobes: i=0 bridges upward/inward toward the mid shoulder, while i=1..3 sweep wide
              const spreadSlots = [-8 + rng() * 10, 22 + rng() * 12, 46 + rng() * 14, 70 + rng() * 16];
              targetX = childX + outerSide * (spreadSlots[i] ?? 36) * parameters.branchSpread + (rng() - 0.5) * 8 * parameters.angleVariation;
            }
            // Broad dome envelope with subtle per-lobe undulation so sub-crowns overlap like billowy clouds without deep V-canyons
            const domeRatio = Math.min(1, Math.abs(targetX) / (crown.x * 0.74));
            const lobeBillow = Math.cos((targetX - endX) * 0.045) * 14;
            const domeTargetY = -194 - (1 - domeRatio ** 1.55) * 112 * parameters.crownDepth - lobeBillow + (rng() - 0.5) * 10;
            targetY = Math.min(childY - 10, domeTargetY);
          } else if (depth === 2) {
            // Parabolic fountain shoots (depth 1): fan broadly over the depth 2 bough and stream down into cascading curtains
            const whipSide = Math.abs(childX) < 34
              ? (i % 2 ? 1 : -1)
              : i === 0 && Math.abs(childX) < 115
                ? -outerSide
                : outerSide;
            const flankReach = Math.min(1, Math.abs(childX) / 145);
            const archOut = (Math.abs(childX) < 36 ? 32 + i * 10 + rng() * 16 : 36 + i * 12 + rng() * 18) * parameters.branchSpread;
            const lobeDropBase = Math.abs(childX) < 62
              ? (hue <= 5 || i === 0 ? 96 : 74)
              : Math.abs(childX) < 118
                ? 106
                : 132;
            const whipDrop = (lobeDropBase + flankReach * 36 + i * 15 + (rng() - 0.35) * 40) * parameters.twigLength * (0.48 + parameters.gravity * 0.52);
            targetX = childX + whipSide * archOut + (rng() - 0.5) * 10 * parameters.angleVariation;
            targetY = childY + whipDrop;
          } else {
            // Pendulous vertical whips (depth 0): emerge smoothly along the shoulder of depth 1 and hang straight down with natural strand-to-strand feathering
            const whipSide = Math.sign(endX - startX) || outerSide;
            const flankReach = Math.min(1, Math.abs(childX) / 150);
            const shoulderOut = whipSide * ((1 - attachment * 0.72) * (22 + rng() * 14)) + (rng() - 0.5) * 7 * parameters.angleVariation;
            const lobeDropBase = Math.abs(childX) < 62
              ? (hue <= 5 ? 98 : 76)
              : Math.abs(childX) < 120
                ? 110
                : 136;
            const whipDrop = (lobeDropBase + flankReach * 38 + i * 18 + (rng() - 0.35) * 46) * parameters.twigLength * (0.50 + parameters.gravity * 0.55);
            targetX = childX + shoulderOut;
            targetY = childY + whipDrop;
          }
        } else {
          targetX = endX + (i === 0 ? side * reach : (rng() - 0.5) * reach * 2.8 * parameters.angleVariation);
          if (maple && depth === 1) targetX += (i % 2 ? 1 : -1) * reach * 0.38;
          targetY = endY - reach * (i === 0 ? 0.02 : 0.35 + parameters.apicalDominance * 0.6 + rng() * 0.22);
          if (depth === 1) targetY = endY + (rng() - 0.66) * reach * 0.95;
          if (profile.habit === "layered-conifer" || profile.habit === "umbrella") {
            targetX = childX + side * reach * (0.625 + (rng() - 0.5) * parameters.angleVariation * 0.9);
            targetY = childY + (rng() - 0.5) * reach * parameters.angleVariation * 0.7 + parameters.gravity * reach * 0.25;
          }
        }
        if (conifer) {
          const coneWidth = crown.x * Math.max(0.05, 1 + targetY / (profile.trunk.length * parameters.trunkHeight));
          targetX = Math.max(-coneWidth, Math.min(coneWidth, targetX));
        }
        if (fanBroadleaf) {
          // Preserve shoot ray angle when trimming to the crown envelope so tips never kink vertical or horizontal
          targetY += reach * parameters.gravity * (Math.abs(targetX) / crown.x) * (jacaranda ? 0.26 : 0.45);
          const dx = targetX - childX;
          const dy = targetY - childY;
          const maxX = crown.x * (jacaranda ? 1.04 : 0.96);
          const scaleX = Math.abs(targetX) > maxX && Math.abs(dx) > 0.01
            ? Math.max(0.25, (maxX - Math.abs(childX)) / Math.abs(dx))
            : 1;
          const clampedX = childX + dx * scaleX;
          const widthRatio = Math.min(1, Math.abs(clampedX / (jacaranda ? crown.x * 1.04 : crown.x)));
          const dome = fanLeaves
            ? Math.max(0.16, 1 - widthRatio ** 1.05)
            : jacaranda
              ? Math.pow(Math.max(0.08, 1 - widthRatio ** 1.82), 0.62)
              : Math.sqrt(Math.max(0.08, 1 - widthRatio ** 2));
          // Gentle cloud undulation across the rounded umbrella dome
          const lobeUndulation = jacaranda
            ? Math.cos(widthRatio * Math.PI * 2.5) * 5
            : 0;
          const upper = crown.center - crown.y * dome - lobeUndulation + 7;
          if (jacaranda) {
            // Smooth ray-preserving umbrella deflection: never bend ascending shoots into downward hooks
            const lowerSkirt = crown.center + crown.y * (0.36 + 0.16 * (widthRatio ** 1.2));
            const scaleY = targetY < upper && dy < -0.01
              ? Math.max(0.32, (upper - childY) / dy)
              : 1;
            const rayScale = Math.min(1, scaleX, scaleY);
            targetX = Math.max(-maxX, Math.min(maxX, childX + dx * rayScale));
            const rawY = childY + dy * rayScale;
            targetY = dy < 0
              ? Math.min(childY - 6, Math.max(upper, rawY))
              : Math.min(lowerSkirt, Math.max(upper, rawY));
          } else {
            const scaleY = targetY < upper && dy < -0.01
              ? Math.max(0.25, (upper - childY) / dy)
              : 1;
            const rayScale = Math.min(1, scaleX, scaleY);
            targetX = childX + dx * rayScale;
            targetY = childY + dy * rayScale;
          }
        } else {
          targetX = Math.max(-crown.x * 0.95, Math.min(crown.x * 0.95, targetX));
          if (!weeping) targetY += reach * parameters.gravity * (Math.abs(targetX) / crown.x) * 0.65;
          if (profile.habit === "layered-conifer") {
            const tierRange = reach * 0.4;
            targetY = Math.max(childY - tierRange, Math.min(-4, Math.min(childY + tierRange, targetY)));
          } else if (conifer) {
            targetY = Math.max(-profile.trunk.length * parameters.trunkHeight + 4,
              Math.min(-profile.trunk.length * parameters.trunkHeight * 0.12, targetY));
          } else if (weeping) {
            const widthRatio = Math.min(1, Math.abs(targetX / crown.x));
            const dome = Math.sqrt(Math.max(0.12, 1 - widthRatio ** 2));
            const upper = crown.center - crown.y * dome;
            // Clear only the lower central trunk window while letting each lobe hang to its natural feathered length
            const lowerTrunkClearance = Math.abs(targetX - 4) < 38
              ? -102 - (rng() * 24)
              : -16 - (rng() * 26);
            const maxDrop = depth === 3 ? crown.center + crown.y * 0.18 : lowerTrunkClearance;
            targetY = Math.max(upper + 7, Math.min(maxDrop, targetY));
            if (depth === 2) targetY = Math.max(childY + 34, targetY);
          } else {
            const widthRatio = Math.min(1, Math.abs(targetX / crown.x));
            const dome = Math.sqrt(Math.max(0.08, 1 - widthRatio ** 2));
            const upper = crown.center - crown.y * dome;
            const lower = crown.center + crown.y * dome * (maple ? 0.88 : jacaranda ? 0.62 : 0.9);
            targetY = Math.max(upper + 7, Math.min(lower - 8, targetY));
            if (parameters.apicalDominance > parameters.gravity) {
              const minRise = reach * 0.22 * (parameters.apicalDominance - parameters.gravity);
              targetY = Math.min(targetY, childY - minRise);
            }
          }
        }
        if (weeping) {
          targetY = Math.min(targetY, -16);
          if (depth === 1) {
            const drop = targetY - childY;
            if (drop < 40) continue;
            const dx = targetX - childX;
            const maxOut = drop * 0.35;
            if (Math.abs(dx) > maxOut) targetX = childX + Math.sign(dx) * maxOut;
          }
        }
        if (Math.hypot(targetX - childX, targetY - childY) < 10) continue;
        const parentRadius = radius * (1 - attachment * (1 - parameters.taper));
        const childRadius = weeping
          ? Math.max(0.28, parentRadius * (depth === 3 ? (i === children - 1 ? 0.54 : 0.44) : depth === 2 ? 0.34 : 0.62))
          : jacaranda
            ? Math.max(0.32, parentRadius * (depth === 3 ? (i >= children - 2 ? 0.66 : 0.56) : (i === children - 1 ? 0.62 : 0.50)))
            : Math.max(0.35, parentRadius * (i === children - 1 ? 0.73 : 0.55));
        const childHue = weeping
          ? (depth === 3 ? (i === 0 ? 3 : 10 + i) : depth === 2 ? (hue <= 5 || i === 0 ? 3 : hue) : hue)
          : hue;
        node.children.push(shoot(
          childX, childY, targetX, targetY,
          childRadius,
          worldAngle + point.tangent, attachment, depth - 1, childHue,
        ));
      }
      if (depth === 2 && !conifer) {
        const shoots = weeping ? [[0.56, -1], [0.78, 1]] : maple || fanLeaves || jacaranda ? [[0.48, -1], [0.76, 1]] : [[0.7, Math.sign(endX) || 1]];
        for (const [attachment, side] of shoots) {
          const point = pointAt(node, attachment);
          const cos = Math.cos(worldAngle);
          const sin = Math.sin(worldAngle);
          const x = startX + point.x * cos - point.y * sin;
          const y = startY + point.x * sin + point.y * cos;
          if (weeping) {
            const archSide = Math.abs(x) < 34 ? side : (side < 0 && Math.abs(x) < 110 ? -Math.sign(x) : Math.sign(x));
            const flankReach = Math.min(1, Math.abs(x) / 145);
            const spurHue = side < 0 ? 3 : hue;
            const lobeDropBase = Math.abs(x) < 62 ? (spurHue <= 5 ? 96 : 74) : Math.abs(x) < 118 ? 106 : 132;
            const whipDrop = (lobeDropBase + flankReach * 36 + (rng() - 0.35) * 40) * parameters.twigLength * (0.48 + parameters.gravity * 0.54);
            const tx = x + archSide * (34 + rng() * 20) * parameters.branchSpread;
            const lowerClearance = Math.abs(tx - 4) < 38 ? -102 - rng() * 24 : -16 - rng() * 26;
            const ty = Math.min(lowerClearance, Math.max(y + 34, y + whipDrop));
            node.children.push(shoot(x, y, tx, ty, 0.44, worldAngle + point.tangent, attachment, 1, spurHue));
          } else {
            const spurAngle = fanLeaves || jacaranda ? worldAngle * 0.78 + side * 0.40 : Math.atan2(side * (18 + rng() * 14), 12 + rng() * 17);
            const spurLen = jacaranda ? 34 + rng() * 18 : fanLeaves ? 22 + rng() * 14 : Math.hypot(18 + rng() * 14, 12 + rng() * 17);
            node.children.push(shoot(
              x, y, x + Math.sin(spurAngle) * spurLen, y - Math.cos(spurAngle) * spurLen,
              jacaranda ? 0.72 : 0.6, worldAngle + point.tangent, attachment, jacaranda ? 1 : 0, hue,
            ));
          }
        }
      }
      if (weeping && depth === 1) {
        // Additional pendulous whips along the outer shoulder of each fountain arch for dense vertical curtain strands
        for (const attachment of [0.46, 0.70]) {
          const point = pointAt(node, attachment);
          const cos = Math.cos(worldAngle);
          const sin = Math.sin(worldAngle);
          const x = startX + point.x * cos - point.y * sin;
          const y = startY + point.x * sin + point.y * cos;
          const whipSide = Math.sign(endX - startX) || Math.sign(x) || 1;
          const flankReach = Math.min(1, Math.abs(x) / 150);
          const rawDx = whipSide * ((1 - attachment * 0.72) * (20 + rng() * 12)) + (rng() - 0.5) * 6;
          const txProbe = x + rawDx;
          const lobeDropBase = Math.abs(x) < 62 ? (hue <= 5 ? 98 : 76) : Math.abs(x) < 120 ? 110 : 136;
          const whipDrop = (lobeDropBase + flankReach * 38 + (rng() - 0.35) * 46) * parameters.twigLength * (0.50 + parameters.gravity * 0.55);
          const lowerClearance = Math.abs(txProbe - 4) < 38 ? -102 - rng() * 24 : -16 - rng() * 26;
          const ty = Math.min(lowerClearance, y + whipDrop);
          const drop = ty - y;
          if (drop < 40) continue;
          const maxOut = drop * 0.35;
          const tx = x + Math.sign(rawDx) * Math.min(Math.abs(rawDx), maxOut);
          node.children.push(shoot(x, y, tx, ty, 0.34, worldAngle + point.tangent, attachment, 0, hue));
        }
      }
    }
    if (needles && depth === (conifer ? 2 : 3)) {
      for (let i = 0; i < 4; i++) {
        const attachment = 0.08 + i * 0.12;
        const point = pointAt(node, attachment);
        const x = startX + point.x * Math.cos(worldAngle) - point.y * Math.sin(worldAngle);
        const y = startY + point.x * Math.sin(worldAngle) + point.y * Math.cos(worldAngle);
        const direction = species === "norway-spruce" ? Math.PI + (rng() - 0.5) * 0.3
          : worldAngle + (i % 2 ? 0.8 : -0.8);
        const distance = Math.min(length * 0.22, 24 + rng() * 18) * parameters.twigLength;
        node.children.push(shoot(x, y, x + Math.sin(direction) * distance,
          y - Math.cos(direction) * distance, 0.55, worldAngle + point.tangent, attachment, 0, hue));
      }
    }
    if (depth === 3 && !weeping) {
      for (let i = 0; i < parameters.interiorShoots; i++) {
        if (jacaranda && i === 0) continue;
        // Keep Jacaranda's lower sub-canopy bough gallery open by attaching interior shoots high up near the canopy entry
        const attachment = jacaranda
          ? 0.72 + (i - 1) / Math.max(1, parameters.interiorShoots - 2) * 0.22
          : 0.34 + i / Math.max(1, parameters.interiorShoots - 1) * 0.5;
        const point = pointAt(node, attachment);
        const cos = Math.cos(worldAngle);
        const sin = Math.sin(worldAngle);
        const x = startX + point.x * cos - point.y * sin;
        const y = startY + point.x * sin + point.y * cos;
        const side = Math.sign(endX) || (i % 2 ? 1 : -1);
        const shootLen = (jacaranda ? 36 + rng() * 24 : 32 + rng() * 28) * parameters.twigLength;
        const shootAngle = jacaranda
          ? worldAngle * 0.68 + (i % 2 ? -side * 0.22 : side * 0.28) + (rng() - 0.5) * 0.14
          : worldAngle * (0.35 + (1 - parameters.apicalDominance) * 0.45)
            + (i % 2 ? -side * 0.32 : side * 0.22) + (rng() - 0.5) * 0.2;
        const whipDrop = (68 + rng() * 32) * parameters.twigLength * (0.48 + parameters.gravity * 0.54);
        const whipTargetX = x + side * (32 + rng() * 18) * parameters.branchSpread + (rng() - 0.5) * 10 * parameters.angleVariation;
        const trunkWindow = Math.exp(-(((whipTargetX - 14) / 46) ** 2));
        node.children.push(shoot(
          x, y,
          weeping ? whipTargetX : x + Math.sin(shootAngle) * shootLen,
          weeping ? Math.max(y + 26, Math.min(-pendantClearance * 0.42 - trunkWindow * 136, y + whipDrop))
            : y - Math.cos(shootAngle) * shootLen + parameters.gravity * shootLen * 0.2,
          0.52, worldAngle + point.tangent, attachment, jacaranda || (!profile.flower && !needles) ? 1 : 0, hue,
        ));
      }
    }
    return node;
  }

  const trunkLength = profile.trunk.length * parameters.trunkHeight;
  const trunk: Branch = {
    length: trunkLength, radius: profile.trunk.radius * parameters.trunkThickness, angle: 0,
    at: 0, bend: profile.trunk.bend * parameters.curvature * 2
      + (species === "coconut" ? trunkLength * 0.12 * parameters.curvature : 0), phase: 0, flexibility: 0.002,
    leaves: [], children: [], path: new Path2D(),
  };
  trunk.path = branchPath(trunk.length, trunk.radius, trunk.bend, 0, parameters.taper, parameters.rootFlare, profile.habit === "baobab" ? 0.45 : 0);
  const scaffolds: (readonly [number, number, number, number])[] = [...profile.scaffolds];
  if (conifer) {
    scaffolds.length = 0;
    for (let tier = 0; tier < parameters.crownTiers; tier++) {
      const lowest = Math.max(0.04, 1 - parameters.crownDepth * 0.8);
      const at = lowest + tier / parameters.crownTiers * (0.98 - lowest);
      const reach = profile.crown.width * (1 - at);
      for (const side of [-1, 1]) scaffolds.push([side * reach, -profile.trunk.length * at + reach * parameters.gravity * 0.3, at, 0]);
    }
  }
  if (palm) {
    for (let i = 0; i < parameters.frondCount; i++) {
      const at = 0.97 + rng() * 0.03;
      const start = pointAt(trunk, at);
      const fan = -2.08 + i / (parameters.frondCount - 1) * 4.16 + (rng() - 0.5) * parameters.angleVariation * 0.4;
      const reach = crown.x * (0.76 + rng() * 0.25) * parameters.twigLength;
      trunk.children.push(shoot(start.x, start.y,
        start.x + Math.sin(fan) * reach * parameters.branchSpread * (1 + Math.sign(fan) * parameters.asymmetry * 0.3),
        start.y - Math.cos(fan) * reach * 0.85 * parameters.crownDepth + parameters.gravity * reach * 0.15,
        0.85 * parameters.trunkThickness, start.tangent, at, 0, 0));
    }
  }
  for (const [x, y, baseAt, hue] of scaffolds) {
    const at = profile.habit === "layered-conifer"
      ? Math.max(0.12, Math.min(1, 1 - (1 - baseAt) * parameters.crownDepth))
      : baseAt;
    const start = pointAt(trunk, at);
    const targetX = (x + (rng() - 0.5) * 16) * parameters.crownWidth * parameters.branchSpread
      * (1 + Math.sign(x) * parameters.asymmetry * 0.3);
    const baseStartY = -profile.trunk.length * baseAt;
    const baseRise = y - baseStartY;
    const riseScale = profile.leafForm === "fan"
      ? parameters.crownDepth
      : parameters.crownDepth * (1 + (parameters.apicalDominance - parameters.gravity) * 0.28);
    const rawTargetY = profile.habit === "layered-conifer"
      ? start.y - profile.crown.depth * 0.04 * parameters.crownDepth
      : conifer ? y - trunkOffset * at
        : baseRise < 0
          ? start.y + baseRise * riseScale + (rng() - 0.5) * 12
          : crown.center + (y - profile.crown.center) * parameters.crownDepth + (rng() - 0.5) * 12;
    const minUpwardSlope = profile.leafForm === "fan"
      ? 0.14 + baseAt * 0.22
      : Math.max(0.14, 0.22 + (parameters.apicalDominance - 0.5) * 0.34 - parameters.gravity * 0.28);
    const targetY = !conifer && !weeping && baseRise < 0 && parameters.apicalDominance >= parameters.gravity
      ? Math.min(rawTargetY, start.y - Math.abs(targetX - start.x) * minUpwardSlope)
      : rawTargetY;
    const main = shoot(
      start.x, start.y, targetX, targetY,
      trunk.radius * (1 - at * (1 - parameters.taper)) * (needles ? 0.4 : maple ? 0.58 : weeping ? 0.62 : 0.74),
      start.tangent, at, conifer ? 2 : 3, hue,
    );
    if (profile.habit === "banyan") {
      main.props = [];
      for (let i = 0; i < parameters.forkCount; i++) {
        const attachment = 0.3 + i / parameters.forkCount * 0.6;
        const point = pointAt(main, attachment);
        const angle = start.tangent + main.angle;
        main.props.push({
          at: attachment,
          groundX: start.x + point.x * Math.cos(angle) - point.y * Math.sin(angle) + (rng() - 0.5) * 12,
        });
      }
    }
    trunk.children.push(main);
  }
  if (conifer) {
    const leaderAt = 0.95;
    const start = pointAt(trunk, leaderAt);
    const tip = pointAt(trunk, 1);
    trunk.children.push(shoot(
      start.x, start.y, tip.x, tip.y - profile.crown.depth * 0.02 * parameters.crownDepth,
      Math.max(0.35, trunk.radius * 0.08), start.tangent, leaderAt, 0, 0,
    ));
  }
  const bounds = { left: 0, right: 0, top: 0 };
  let signature = (2166136261 ^ Math.round(parameters.rootFlare * 10000)) >>> 0;
  function assignGrowthSchedule(node: Branch, depth: number, birthAge: number, fullAge: number): void {
    node.depth = depth;
    node.birthAge = birthAge;
    node.fullAge = fullAge;
    if ((depth === 4 || depth === 3 || depth === 2 || (!!profile.flower && depth === 1)) && (node.leaves.length === 0 || !!profile.flower)) {
      const juvLeaves: Leaf[] = [];
      const count = depth === 4 ? 5 : depth === 3 ? 7 : depth === 2 ? 7 : 6;
      const startAt = depth === 4 ? 0.58 : depth === 3 ? 0.38 : 0.32;
      for (let i = 0; i < count; i++) {
        const at = startAt + (i / Math.max(1, count - 1)) * (0.96 - startAt);
        for (const side of [-1, 1]) {
          const isRear = i < count - 2 && (i + (side > 0 ? 1 : 0)) % 3 === 0;
          // Flowering trees grow lush green juvenile foliage on seedling/sapling stems (depth 4, 3, 2, 1) with fresh bright green at shoot tips
          const juvColor = profile.flower
            ? (i >= count - 2 ? 3 + ((i + (side > 0 ? 1 : 0)) % 3) : 1 + ((i * 2 + (side > 0 ? 1 : 0)) % 4))
            : ((i * 5 + (side > 0 ? 3 : 0)) % 18);
          juvLeaves.push({
            at,
            angle: side * (0.34 + (i % 4) * 0.14),
            size: profile.leafSize * parameters.foliageSize * (depth === 4 ? 0.96 : depth === 3 ? 1.08 : 1.02) * (0.85 + (i % 3) * 0.12),
            stem: 2.2,
            color: juvColor,
            phase: i * 0.7 + (side > 0 ? 1.1 : 0),
            layer: isRear ? 0 : 1,
            pendant: weeping,
          });
        }
      }
      node.juvenileLeaves = juvLeaves;
    }
    for (const child of node.children) {
      const childDepth = Math.max(0, depth - 1);
      const baseBirth = childDepth === 3 ? 0.08 : childDepth === 2 ? 0.24 : childDepth === 1 ? 0.44 : 0.60;
      const atOffset = Math.max(0.10, child.at) * (childDepth === 3 ? 0.09 : 0.14);
      const childBirth = Math.min(0.82, Math.max(birthAge + 0.06, baseBirth + atOffset));
      const span = childDepth === 3 ? 0.32 : childDepth === 2 ? 0.30 : childDepth === 1 ? 0.28 : 0.26;
      const maxFull = childDepth === 3 ? 0.58 : childDepth === 2 ? 0.74 : childDepth === 1 ? 0.88 : 1.00;
      const childFull = Math.min(maxFull, childBirth + span);
      assignGrowthSchedule(child, childDepth, childBirth, childFull);
    }
  }
  assignGrowthSchedule(trunk, 4, 0, 0.32);
  function measure(node: Branch, x: number, y: number, angle: number): void {
    for (const value of [node.length, node.radius, node.bend, node.angle, node.at, node.handleLength ?? 0.28]) {
      signature = Math.imul(signature ^ Math.round(value * 10000), 16777619) >>> 0;
    }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const t of [0, 0.28, 0.5, 0.75, 1]) {
      const point = pointAt(node, t);
      const px = x + point.x * cos - point.y * sin;
      const py = y + point.x * sin + point.y * cos;
      const padding = Math.max(20, profile.leafSize * 1.8 * parameters.foliageSize,
        profile.flower ? 40 * parameters.foliageSize * parameters.panicleSize : 0);
      bounds.left = Math.min(bounds.left, px - padding);
      bounds.right = Math.max(bounds.right, px + padding);
      bounds.top = Math.min(bounds.top, py - padding);
    }
    for (const child of node.children) {
      const point = pointAt(node, child.at);
      measure(child,
        x + point.x * cos - point.y * sin,
        y + point.x * sin + point.y * cos,
        angle + point.tangent + child.angle,
      );
    }
  }
  measure(trunk, 0, 0, trunk.angle);
  return { trunk, count, bounds, signature: signature.toString(16) };
}

function shadeSprites(sprites: HTMLCanvasElement[], strength = 0.24): HTMLCanvasElement[] {
  return [...sprites, ...sprites.map((sprite) => {
    const [canvas, ctx] = makeCanvas(sprite.width, sprite.height);
    ctx.drawImage(sprite, 0, 0);
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = `rgba(42, 32, 78, ${strength})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  })];
}

function start(): void {
  const [canvas, ctx] = makeCanvas(1, 1);
  const [background, backgroundCtx] = makeCanvas(1, 1);
  scene.appendChild(canvas);
  let species: Species = "jacaranda";
  let sprites: HTMLCanvasElement[] = [];
  let seed = 1847;
  const message = element<HTMLParagraphElement>("tuning-message");
  const seedInput = element<HTMLInputElement>("seed");
  const settings: Partial<Record<Species, TreeParameters>> = {};
  for (const profile of speciesProfiles) settings[profile.id] = defaultParameters(profile.id);
  function settingsFor(id: Species): TreeParameters {
    const value = settings[id];
    if (!value) throw new Error(`Missing parameters for ${id}`);
    return value;
  }
  speciesSelect.replaceChildren(...speciesProfiles.map((profile) => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    return option;
  }));
  const storageKey = "tree-lab-v18";
  const trialLimit = 150;
  const generatorVersion = 22;
  interface Trial {
    species: Species;
    seed: number;
    parameters: TreeParameters;
    time: number;
    signature: string;
    count: number;
    image: string;
    foliageVisible: boolean;
    generatorVersion: number;
  }
  let trials: Trial[] = [];
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid saved experiment");
      let knownSettings = 0;
      for (const profile of speciesProfiles) {
        if (!Object.hasOwn(parsed, profile.id)) continue;
        const normalized = normalizeParameters(Reflect.get(parsed, profile.id), profile.id);
        if (!normalized) throw new Error(`Invalid saved parameters for ${profile.id}`);
        settings[profile.id] = normalized;
        knownSettings++;
      }
      if (!knownSettings) throw new Error("No recognized saved species");
      const current: unknown = Reflect.get(parsed, "current");
      if (current !== undefined) {
        if (!current || typeof current !== "object") throw new Error("Invalid saved selection");
        const savedSpecies: unknown = Reflect.get(current, "species");
        const savedSeed: unknown = Reflect.get(current, "seed");
        if (!isSpecies(savedSpecies)
          || typeof savedSeed !== "number" || !Number.isInteger(savedSeed) || savedSeed < 0 || savedSeed > 99999) {
          throw new Error("Invalid saved selection");
        }
        species = savedSpecies;
        seed = savedSeed;
      }
      const savedTrials: unknown = Reflect.get(parsed, "trials");
      if (!Array.isArray(savedTrials) || savedTrials.length > trialLimit) throw new Error("Invalid saved trial list");
      trials = savedTrials.map((trial: unknown) => {
        if (!trial || typeof trial !== "object") return trial;
        const species: unknown = Reflect.get(trial, "species");
        if (!isSpecies(species)) return trial;
        return {
          ...trial,
          parameters: normalizeParameters(Reflect.get(trial, "parameters"), species),
          foliageVisible: Object.hasOwn(trial, "foliageVisible") ? Reflect.get(trial, "foliageVisible") : true,
          generatorVersion: Object.hasOwn(trial, "generatorVersion") ? Reflect.get(trial, "generatorVersion") : 0,
        };
      }).filter((trial: unknown): trial is Trial => {
        if (!trial || typeof trial !== "object") return false;
        const species: unknown = Reflect.get(trial, "species");
        const seed: unknown = Reflect.get(trial, "seed");
        const image: unknown = Reflect.get(trial, "image");
        const time: unknown = Reflect.get(trial, "time");
        return isSpecies(species)
          && typeof seed === "number" && Number.isInteger(seed) && seed >= 0 && seed <= 99999
          && isParameters(Reflect.get(trial, "parameters"))
          && typeof image === "string" && image.length < 100000 && image.startsWith("data:image/png;base64,")
          && typeof time === "number" && Number.isFinite(time) && time >= 0
          && typeof Reflect.get(trial, "foliageVisible") === "boolean"
          && typeof Reflect.get(trial, "generatorVersion") === "number"
          && typeof Reflect.get(trial, "signature") === "string"
          && typeof Reflect.get(trial, "count") === "number";
      });
      if (trials.length !== savedTrials.length) throw new Error("Some saved trials are invalid");
    }
  } catch (cause) {
    console.error("Cannot load saved tree experiments", cause);
    message.textContent = "Saved experiments could not be read. Editing works in this tab; export JSON to keep your work.";
  }
  let parameters = settingsFor(species);
  let activeProfile = getSpecies(species);
  function refreshSprites(): void {
    activeProfile = getSpecies(species);
    sprites = shadeSprites(makeSpeciesSprites(activeProfile, parameters.flowersPerSpray, parameters.flowerColorVariation), parameters.rearShading);
  }
  refreshSprites();
  let tree = growTree(seed, species, parameters);
  let leavesVisible = true;
  let treeAge = 1;
  let growthPlaying = false;
  let lastGrowthTime: number | undefined;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let windEnabled = !reducedMotion.matches;
  let explicitWind = false;
  let time = 0;
  let frame = 0;
  let lastTime: number | undefined;
  let width = 1;
  let height = 1;
  let ratio = 1;
  let scale = 1;
  let originX = 0;
  let originY = 0;
  let active = true;
  let editorFrame = 0;
  let saveTimer = 0;
  let pendingGrowth = false;
  let pendingSprites = false;
  let pendingBackground = false;
  let pendingPersistence = false;

  function persist(): boolean {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = 0;
    pendingPersistence = false;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...settings, current: { species, seed }, trials }));
      return true;
    } catch (cause) {
      console.error("Cannot save tree experiment", cause);
      message.textContent = "Browser storage is unavailable. Changes work in this tab; export JSON to keep them.";
      return false;
    }
  }

  const controlNodes = new Map<keyof TreeParameters, { input: HTMLInputElement; output: HTMLOutputElement; row: HTMLLabelElement; name: HTMLSpanElement }>();
  const controlContainer = element<HTMLDivElement>("parameter-controls");
  const sections = new Map<string, HTMLDetailsElement>();
  for (const group of ["Growth", "Foliage", "Animation", "Advanced branching", "Advanced structure", "Advanced foliage", "Flowers", "Advanced wind"] as const) {
    const section = document.createElement("details");
    section.open = group === "Growth" || group === "Foliage";
    sections.set(group, section);
    section.className = "border-t border-[#223c43]/15 pt-3";
    const summary = document.createElement("summary");
    summary.className = "cursor-pointer text-sm font-semibold";
    summary.textContent = group;
    section.appendChild(summary);
    for (const definition of definitions.filter((item) => item.group === group)) {
      const row = document.createElement("label");
      row.className = "mt-4 block text-xs";
      row.title = definition.help;
      const line = document.createElement("span");
      line.className = "flex items-center justify-between gap-2";
      const name = document.createElement("span");
      name.textContent = definition.label;
      const output = document.createElement("output");
      output.className = "tabular-nums";
      const input = document.createElement("input");
      input.id = `parameter-${definition.key}`;
      input.type = "range";
      input.min = String(definition.min);
      input.max = String(definition.max);
      input.step = String(definition.step);
      input.className = "mt-2 block w-full cursor-pointer";
      input.setAttribute("aria-label", definition.label);
      row.htmlFor = input.id;
      output.htmlFor = input.id;
      line.append(name, output);
      row.append(line, input);
      section.appendChild(row);
      controlNodes.set(definition.key, { input, output, row, name });
      input.addEventListener("input", () => {
        parameters[definition.key] = Number(input.value);
        updateControlValue(definition.key);
        queueEditorWork(definition.key);
        schedulePersistence();
      });
      input.addEventListener("change", () => {
        if (pendingPersistence) persist();
      });
    }
    if (group === "Animation") {
      const resetPose = document.createElement("button");
      resetPose.id = "reset-pose";
      resetPose.className = "mt-3 rounded-full border border-[#223c43]/25 px-3 py-2 text-xs";
      resetPose.textContent = "Reset wind pose";
      resetPose.addEventListener("click", () => {
        if (!prepareDiscreteAction()) return;
        time = 0;
        windEnabled = false;
        explicitWind = true;
        lastTime = undefined;
        syncControls();
        requestFrame();
        if (pendingPersistence) persist();
      });
      section.appendChild(resetPose);
    }
    controlContainer.appendChild(section);
  }

  function updateControlValue(key: keyof TreeParameters): void {
    const definition = definitions.find((item) => item.key === key);
    const nodes = controlNodes.get(key);
    if (!definition || !nodes) return;
    nodes.input.value = String(parameters[key]);
    nodes.output.value = `${definition.step === 1 ? parameters[key] : parameters[key].toFixed(2)}${definition.suffix}`;
  }

  function updateControlValues(): void {
    const profile = getSpecies(species);
    const palm = profile.habit === "palm";
    const flowers = sections.get("Flowers");
    if (flowers) flowers.hidden = !profile.flower;
    for (const definition of definitions) {
      const nodes = controlNodes.get(definition.key);
      if (!nodes) continue;
      nodes.input.value = String(parameters[definition.key]);
      nodes.output.value = `${definition.step === 1 ? parameters[definition.key] : parameters[definition.key].toFixed(2)}${definition.suffix}`;
      nodes.row.hidden = definition.key === "flowerDensity" && !profile.flower
        || definition.key === "crownTiers" && profile.habit !== "conifer"
        || definition.key === "frondCount" && !palm
        || definition.key === "apicalDominance" && (profile.habit === "layered-conifer" || profile.habit === "umbrella")
        || definition.key === "interiorShoots" && (palm || profile.habit === "conifer")
        || palm && ["forkCount", "attachmentSpacing", "apicalDominance", "foliageClustering"].includes(definition.key)
        || definition.key === "flowersPerSpray" && (profile.flower?.form === "magnolia" || profile.flower?.form === "dogwood");
      const label = definition.key === "trunkHeight" && (palm || profile.habit === "conifer") ? "Trunk / leader height" : definition.label;
      nodes.name.textContent = label;
      nodes.input.setAttribute("aria-label", label);
    }
  }

  function queueEditorWork(key: keyof TreeParameters): void {
    if (key === "rearShading" || key === "flowersPerSpray" || key === "flowerColorVariation") pendingSprites = true;
    if (key === "crownWidth" || key === "rearShading" || key === "flowersPerSpray" || key === "flowerColorVariation") {
      pendingBackground = true;
    }
    if (!["windStrength", "branchStiffness", "gustFrequency", "branchResponse", "leafFlutter"].includes(key)) {
      pendingGrowth = true;
    }
    canvas.dataset.previewReady = "false";
    if (!editorFrame) {
      editorFrame = requestAnimationFrame(() => {
        editorFrame = 0;
        try {
          applyPendingEditorWork();
        } catch (cause) {
          reportError(cause);
        }
      });
    }
  }

  function applyPendingEditorWork(): void {
    const rebuildSprites = pendingSprites;
    const rebuildTree = pendingGrowth;
    const repaintBackground = pendingBackground;
    pendingSprites = false;
    pendingGrowth = false;
    pendingBackground = false;
    if (rebuildSprites) refreshSprites();
    if (rebuildTree) tree = growTree(seed, species, parameters);
    resize(repaintBackground);
    syncControls();
  }

  function flushPendingEditorWork(): boolean {
    const pending = !!editorFrame || pendingGrowth || pendingSprites || pendingBackground;
    if (editorFrame) cancelAnimationFrame(editorFrame);
    editorFrame = 0;
    if (!pending) return true;
    try {
      applyPendingEditorWork();
      return true;
    } catch (cause) {
      reportError(cause);
      return false;
    }
  }

  function schedulePersistence(): void {
    pendingPersistence = true;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = 0;
      if (pendingPersistence) persist();
    }, 350);
  }

  function prepareDiscreteAction(): boolean {
    return flushPendingEditorWork();
  }

  function renderTrials(): void {
    const list = element<HTMLDivElement>("saved-trials");
    list.replaceChildren();
    if (!trials.length) {
      list.textContent = "No trials yet. Save a parameter set to compare it later.";
      return;
    }
    trials.forEach((trial, index) => {
      const button = document.createElement("button");
      button.className = "flex w-full items-center gap-3 rounded-lg border border-[#223c43]/15 bg-white p-2 text-left hover:border-[#223c43]/50";
      const image = document.createElement("img");
      image.src = trial.image;
      image.alt = "";
      image.className = "h-14 w-20 rounded bg-[#b9cad1] object-contain";
      const text = document.createElement("span");
      text.textContent = `${getSpecies(trial.species).name} trial ${index + 1} / seed ${trial.seed}`;
      button.append(image, text);
      button.addEventListener("click", () => {
        if (!prepareDiscreteAction()) return;
        species = trial.species;
        speciesSelect.value = species;
        seed = trial.seed;
        settings[species] = { ...trial.parameters };
        parameters = settingsFor(species);
        refreshSprites();
        time = trial.time;
        leavesVisible = trial.foliageVisible;
        windEnabled = false;
        explicitWind = true;
        lastTime = undefined;
        tree = growTree(seed, species, parameters);
        updateControlValues();
        syncControls();
        resize();
        if (persist()) {
          message.textContent = tree.signature === trial.signature && trial.generatorVersion === generatorVersion
            ? `Restored trial ${index + 1}. Wind is paused at its saved frame.`
            : `Trial ${index + 1} uses an older generator. Its settings were restored, but the tree may differ from its thumbnail.`;
        }
      });
      list.appendChild(button);
    });
  }

  function requestFrame(): void {
    if (active && !document.hidden && !frame) frame = requestAnimationFrame(render);
  }

  function ageStageText(age: number): string {
    const pct = Math.round(age * 100);
    const stage = age < 0.18 ? "Seedling" : age < 0.44 ? "Sapling" : age < 0.80 ? "Young" : "Mature";
    return `${stage} · ${pct}%`;
  }

  function syncControls(): void {
    const profile = getSpecies(species);
    title.textContent = profile.name;
    element<HTMLParagraphElement>("scientific-name").textContent = profile.scientificName;
    element<HTMLParagraphElement>("species-traits").textContent = `${profile.specimen}. ${profile.traits}`;
    element<HTMLAnchorElement>("botanical-reference").href = profile.sourceUrl;
    status.textContent = `Seed ${seed} / ${tree.count.toLocaleString()} ${profile.flower ? "leaf and flower groups" : profile.habit === "palm" ? "palm leaflets" : "foliage groups"}`;
    windButton.textContent = windEnabled ? "Pause wind" : "Start wind";
    windButton.setAttribute("aria-pressed", String(windEnabled));
    foliageButton.textContent = leavesVisible ? "Show branches" : "Show leaves";
    foliageButton.setAttribute("aria-pressed", String(!leavesVisible));
    growButton.textContent = growthPlaying ? "Pause growth" : "Grow tree";
    growButton.setAttribute("aria-pressed", String(growthPlaying));
    ageSlider.value = treeAge.toFixed(3);
    ageLabel.textContent = ageStageText(treeAge);
    canvas.dataset.renderer = "canvas-2d";
    canvas.dataset.species = species;
    canvas.dataset.seed = String(seed);
    canvas.dataset.leaves = String(tree.count);
    canvas.dataset.wind = String(windEnabled);
    canvas.dataset.foliage = String(leavesVisible);
    canvas.dataset.age = treeAge.toFixed(3);
    canvas.dataset.growing = String(growthPlaying);
    canvas.dataset.skeleton = tree.signature;
    seedInput.value = String(seed);
    speciesSelect.value = species;
    scene.setAttribute("aria-label", `A procedural ${profile.name} drawn entirely in 2D, ${windEnabled ? "swaying in the wind" : "with the wind paused"}.`);
  }

  const groundCover = document.createElement("canvas");
  const groundCoverCtx = groundCover.getContext("2d")!;

  function paintGroundCover(targetCtx: CanvasRenderingContext2D, age: number): void {
    targetCtx.save();
    targetCtx.translate(originX, originY);
    targetCtx.scale(scale, scale);
    const shadowScale = 0.24 + 0.76 * age;
    targetCtx.save();
    targetCtx.scale(shadowScale, 0.2 * shadowScale);
    const shadow = targetCtx.createRadialGradient(0, 0, 0, 0, 0, 155);
    shadow.addColorStop(0, `rgba(36,46,27,${(0.43 * (0.45 + 0.55 * age)).toFixed(3)})`);
    shadow.addColorStop(0.28, `rgba(36,46,27,${(0.26 * (0.45 + 0.55 * age)).toFixed(3)})`);
    shadow.addColorStop(1, "rgba(36,46,27,0)");
    targetCtx.fillStyle = shadow;
    targetCtx.fillRect(-155, -155, 310, 310);
    targetCtx.restore();

    const litterProgress = activeProfile.flower
      ? Math.max(0, Math.min(1, (age - 0.68) / 0.32))
      : Math.max(0, Math.min(1, (age - 0.35) / 0.65));
    if (litterProgress > 0.01) {
      const scatter = randomFrom(seed + 15);
      if (species === "jacaranda") {
        // Soft velvety lavender-periwinkle fallen blossom carpet beneath the drip line (matches jacaranda-inat-1.jpg)
        const matRx = 195 * parameters.crownWidth * (0.55 + 0.45 * litterProgress);
        const matRy = 26 * (0.55 + 0.45 * litterProgress);
        const matAlpha = litterProgress ** 1.15;
        targetCtx.save();
        targetCtx.translate(0, 11);
        targetCtx.scale(1, matRy / matRx);
        const petalMat = targetCtx.createRadialGradient(0, 0, 8, 0, 0, matRx);
        petalMat.addColorStop(0, `rgba(130, 114, 214, ${(0.44 * matAlpha).toFixed(3)})`);
        petalMat.addColorStop(0.45, `rgba(148, 134, 226, ${(0.34 * matAlpha).toFixed(3)})`);
        petalMat.addColorStop(0.78, `rgba(164, 150, 232, ${(0.16 * matAlpha).toFixed(3)})`);
        petalMat.addColorStop(1, "rgba(164, 150, 232, 0)");
        targetCtx.fillStyle = petalMat;
        targetCtx.beginPath();
        targetCtx.arc(0, 0, matRx, 0, Math.PI * 2);
        targetCtx.fill();
        targetCtx.restore();
      }
      const maxLitter = species === "jacaranda" ? 420 : species === "maple" ? 200 : activeProfile.flower ? 140 : 0;
      const litterCount = Math.round(maxLitter * (litterProgress ** 1.45));
      const spreadRadius = (species === "jacaranda" ? 132 : 180) * parameters.crownWidth * (0.58 + 0.42 * litterProgress);
      for (let i = 0; i < litterCount; i++) {
        const angle = scatter() * Math.PI * 2;
        const distance = species === "jacaranda" ? Math.pow(scatter(), 0.92) : Math.sqrt(scatter());
        const x = Math.cos(angle) * distance * spreadRadius;
        const y = species === "jacaranda"
          ? Math.sin(angle) * distance * 15 + 9
          : Math.sin(angle) * distance * 31 + 6;
        const rot = scatter() * Math.PI * 2;
        const sizeRand = scatter();
        const colorRand = scatter();
        targetCtx.save();
        targetCtx.translate(x, y);
        targetCtx.rotate(rot);
        targetCtx.scale(1, 0.38);
        const size = species === "jacaranda" ? 6.5 + sizeRand * 5.5 : 6 + sizeRand * 5;
        const color = activeProfile.flower ? 6 + Math.floor(colorRand * 12) : Math.floor(colorRand * 18);
        targetCtx.drawImage(sprites[color], -size / 2, -size * 0.9, size, size * 1.125);
        targetCtx.restore();
      }
    }
    targetCtx.restore();
  }

  function paintBackground(): void {
    background.width = canvas.width;
    background.height = canvas.height;
    backgroundCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const sky = backgroundCtx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#b9cad1");
    sky.addColorStop(0.38, "#b9cad1");
    sky.addColorStop(0.65, "#aab297");
    sky.addColorStop(1, "#999d7e");
    backgroundCtx.fillStyle = sky;
    backgroundCtx.fillRect(0, 0, width, height);
    const rng = randomFrom(42);
    for (let i = 0; i < 6500; i++) {
      const y = height * (0.59 + rng() * 0.41);
      const alpha = (y / height - 0.59) * 0.14;
      backgroundCtx.fillStyle = `rgba(67,76,45,${alpha})`;
      backgroundCtx.fillRect(rng() * width, y, 0.8 + rng() * 1.8, 0.6);
    }
    groundCover.width = canvas.width;
    groundCover.height = canvas.height;
    groundCoverCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    groundCoverCtx.clearRect(0, 0, width, height);
    paintGroundCover(groundCoverCtx, 1);
  }

  let backgroundStamp = "";

  function resize(repaintBackground = true): void {
    canvas.dataset.previewReady = "false";
    width = scene.clientWidth;
    height = scene.clientHeight;
    ratio = Math.min(devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const motionMargin = -tree.bounds.top * 0.08 * parameters.windStrength / parameters.branchStiffness;
    const treeWidth = tree.bounds.right - tree.bounds.left + 30 + motionMargin * 2;
    const treeHeight = -tree.bounds.top + 32 + motionMargin;
    const header = title.parentElement;
    const headerBottom = header ? header.getBoundingClientRect().bottom - scene.getBoundingClientRect().top : 145;
    const top = Math.max(width < 600 ? 175 : 150, headerBottom + 16);
    const toolbarTop = element<HTMLDivElement>("preview-toolbar").getBoundingClientRect().top - scene.getBoundingClientRect().top;
    const bottom = width < 600 ? Math.max(160, height - toolbarTop + 30) : 110;
    scale = Math.max(0.1, Math.min((width - 44) / treeWidth, (height - top - bottom) / treeHeight));
    originX = width / 2 - (tree.bounds.left + tree.bounds.right) / 2 * scale;
    originY = top + (height - top - bottom + (-tree.bounds.top) * scale) / 2;
    const stamp = [width, height, ratio, originX, originY, scale, species, seed, parameters.crownWidth].join(":");
    if (repaintBackground || stamp !== backgroundStamp) {
      paintBackground();
      backgroundStamp = stamp;
    }
    requestFrame();
  }

  function paintProps(node: Branch): void {
    const bark = activeProfile.bark;
    if (node.props) {
      const transform = ctx.getTransform();
      for (const prop of node.props) {
        const point = pointAt(node, prop.at);
        const start = new DOMPoint(point.x, point.y).matrixTransform(transform);
        const endX = (originX + prop.groundX * scale) * ratio;
        const endY = originY * ratio;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = bark.base;
        ctx.lineWidth = (1.6 + parameters.rootFlare * 2.5) * scale * ratio;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.bezierCurveTo(start.x, start.y + (endY - start.y) * 0.55, endX, endY - 15 * scale * ratio, endX, endY);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function paintBranch(node: Branch, ctx: CanvasRenderingContext2D): void {
    const bark = activeProfile.habit === "weeping" && node.radius < 1.1
      ? { base: "#625d3e", light: "#827c54", shade: "#45412b", marks: activeProfile.bark.marks }
      : activeProfile.habit === "weeping" && node.radius < 3.2
        ? { base: "#4d4637", light: "#716752", shade: "#322d23", marks: activeProfile.bark.marks }
        : activeProfile.bark;
    const isTrunk = node === tree.trunk;
    const flare = isTrunk ? parameters.rootFlare : 0;
    const swelling = isTrunk && activeProfile.habit === "baobab" ? 0.45 : 0;
    const collarBoost = !isTrunk && node.radius > 3.2 ? 0.18 : 0;
    const widthAt = (t: number) => {
      const rootButtress = flare > 0
        ? flare * (0.72 * Math.exp(-t * 13) + 0.18 * Math.exp(-t * 4.5))
        : collarBoost * Math.exp(-t * 14);
      return node.radius * (1 - t * (node.radius > 2 ? 1 - parameters.taper : 0.82))
        * (1 + rootButtress + Math.sin(t * Math.PI) * swelling);
    };

    ctx.fillStyle = bark.base;
    ctx.fill(node.path);
    ctx.save();
    ctx.clip(node.path);

    // 1. Curve-following 3D cylindrical shading along the actual spine (fixes curved-trunk flat shading)
    const segs = node.radius > 8 ? 18 : node.radius > 2.5 ? 10 : 4;
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs;
      const t1 = (s + 1) / segs;
      const tm = (t0 + t1) * 0.5;
      const p0 = pointAt(node, t0);
      const p1 = pointAt(node, t1);
      const pm = pointAt(node, tm);
      const nx = Math.cos(pm.tangent);
      const ny = Math.sin(pm.tangent);
      const w0 = widthAt(t0) * 1.35 + 2;
      const w1 = widthAt(t1) * 1.35 + 2;
      const wm = widthAt(tm) * 1.12;
      const n0x = Math.cos(p0.tangent);
      const n0y = Math.sin(p0.tangent);
      const n1x = Math.cos(p1.tangent);
      const n1y = Math.sin(p1.tangent);
      const tx0 = Math.sin(p0.tangent);
      const ty0 = -Math.cos(p0.tangent);
      const tx1 = Math.sin(p1.tangent);
      const ty1 = -Math.cos(p1.tangent);
      const pad0 = s === 0 ? node.radius * 0.55 : 1.2;
      const pad1 = s === segs - 1 ? 2.5 : 1.2;

      const cyl = ctx.createLinearGradient(pm.x - nx * wm, pm.y - ny * wm, pm.x + nx * wm, pm.y + ny * wm);
      // Soften contrast right at a child branch's collar (t < 0.12) so it welds into the parent bark without a dark seam
      const collarWeld = !isTrunk && s === 0 ? 0.55 : 0;
      cyl.addColorStop(0, collarWeld > 0 ? bark.base : bark.light);
      cyl.addColorStop(0.24, bark.light);
      cyl.addColorStop(0.54, bark.base);
      cyl.addColorStop(0.86, collarWeld > 0 ? bark.base : bark.shade);
      cyl.addColorStop(1, bark.base);
      ctx.fillStyle = cyl;
      ctx.beginPath();
      ctx.moveTo(p0.x - tx0 * pad0 - n0x * w0, p0.y - ty0 * pad0 - n0y * w0);
      ctx.lineTo(p0.x - tx0 * pad0 + n0x * w0, p0.y - ty0 * pad0 + n0y * w0);
      ctx.lineTo(p1.x + tx1 * pad1 + n1x * w1, p1.y + ty1 * pad1 + n1y * w1);
      ctx.lineTo(p1.x + tx1 * pad1 - n1x * w1, p1.y + ty1 * pad1 - n1y * w1);
      ctx.closePath();
      ctx.fill();
    }

    // 2. Vertical canopy ambient occlusion & ground-contact root shadow
    if (node.radius > 4) {
      const tip = pointAt(node, 1);
      const ao = ctx.createLinearGradient(0, node.radius * 0.3, tip.x, tip.y);
      if (isTrunk) {
        ao.addColorStop(0, "rgba(22, 18, 14, 0.34)");
        ao.addColorStop(0.14, "rgba(22, 18, 14, 0)");
        ao.addColorStop(0.62, "rgba(22, 18, 14, 0.04)");
        ao.addColorStop(1, "rgba(18, 15, 12, 0.36)");
      } else {
        ao.addColorStop(0, "rgba(22, 18, 14, 0.22)");
        ao.addColorStop(0.18, "rgba(22, 18, 14, 0)");
        ao.addColorStop(0.75, "rgba(22, 18, 14, 0.05)");
        ao.addColorStop(1, "rgba(18, 15, 12, 0.28)");
      }
      ctx.fillStyle = ao;
      ctx.fillRect(-node.length - node.radius * 2, -node.length - node.radius * 2, (node.length + node.radius * 2) * 2, node.length + node.radius * 3);
    }

    // 3. Multi-fluted root buttress ridges and deep root hollows on the trunk base
    if (isTrunk && flare > 0.15) {
      const flutes = [-0.74, -0.32, 0.08, 0.48, 0.80];
      for (let f = 0; f < flutes.length; f++) {
        const uBase = flutes[f];
        const uTop = uBase * 0.52;
        const p0 = pointAt(node, 0);
        const p1 = pointAt(node, 0.16);
        const p2 = pointAt(node, 0.36);
        const w0 = widthAt(0);
        const w1 = widthAt(0.16);
        const w2 = widthAt(0.36);
        const n0x = Math.cos(p0.tangent), n0y = Math.sin(p0.tangent);
        const n1x = Math.cos(p1.tangent), n1y = Math.sin(p1.tangent);
        const n2x = Math.cos(p2.tangent), n2y = Math.sin(p2.tangent);

        // Sunlit rounded root-buttress crest
        ctx.beginPath();
        ctx.moveTo(p0.x + n0x * w0 * uBase, p0.y + n0y * w0 * uBase + 3);
        ctx.quadraticCurveTo(
          p1.x + n1x * w1 * ((uBase + uTop) * 0.52),
          p1.y + n1y * w1 * ((uBase + uTop) * 0.52),
          p2.x + n2x * w2 * uTop,
          p2.y + n2y * w2 * uTop,
        );
        ctx.strokeStyle = bark.light;
        ctx.globalAlpha = uBase < 0.25 ? 0.34 : 0.18;
        ctx.lineWidth = Math.max(1.4, node.radius * 0.13 * (1 - f * 0.08));
        ctx.lineCap = "round";
        ctx.stroke();

        // Deep shaded valley between adjacent root toes
        if (f < flutes.length - 1) {
          const uValley = (uBase + flutes[f + 1]) * 0.5;
          const uValleyTop = uValley * 0.55;
          ctx.beginPath();
          ctx.moveTo(p0.x + n0x * w0 * uValley, p0.y + n0y * w0 * uValley + 3);
          ctx.quadraticCurveTo(
            p1.x + n1x * w1 * ((uValley + uValleyTop) * 0.5),
            p1.y + n1y * w1 * ((uValley + uValleyTop) * 0.5),
            p2.x + n2x * w2 * uValleyTop,
            p2.y + n2y * w2 * uValleyTop,
          );
          ctx.strokeStyle = bark.shade;
          ctx.globalAlpha = 0.52;
          ctx.lineWidth = Math.max(1.2, node.radius * 0.10);
          ctx.stroke();
        }
      }
    }

    // 4. Procedural bark surface texture (anastomosing diamond furrows, peeling plates, or lenticel rings)
    if (node.radius > 1.8) {
      if (bark.marks === "fissured") {
        // Interlocking diamond-braided longitudinal bark ridges & deep crevices following the curved branch flow
        const cols = Math.max(3, Math.min(10, Math.round(node.radius * 0.48)));
        const rowSteps = node.radius > 8 ? 22 : node.radius > 4 ? 14 : 9;
        const freq = node.radius > 8 ? 11.5 : 8.5;

        // 4a. Raised sunlit bark plate ridges
        ctx.strokeStyle = bark.light;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (let c = 0; c < cols; c++) {
          const baseU = -0.82 + (c / Math.max(1, cols - 1)) * 1.64;
          ctx.globalAlpha = baseU < 0.15 ? 0.32 : 0.16;
          ctx.lineWidth = Math.max(0.7, node.radius * 0.065 * (1 - Math.abs(baseU) * 0.3));
          ctx.beginPath();
          for (let r = 0; r <= rowSteps; r++) {
            const t = r / rowSteps;
            const pt = pointAt(node, t);
            const w = widthAt(t);
            const braid = Math.sin(t * freq + c * 2.15 + node.phase) * 0.11
              + Math.cos(t * freq * 1.7 - c * 1.35) * 0.05;
            const u = Math.max(-0.92, Math.min(0.92, baseU + braid - 0.04));
            const x = pt.x + Math.cos(pt.tangent) * w * u;
            const y = pt.y + Math.sin(pt.tangent) * w * u;
            if (r === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        // 4b. Deep dark braided bark crevices & diamond cross-fissures
        ctx.strokeStyle = bark.shade;
        for (let c = 0; c < cols; c++) {
          const baseU = -0.80 + (c / Math.max(1, cols - 1)) * 1.60;
          ctx.globalAlpha = 0.46 + (baseU > 0 ? 0.16 : 0);
          ctx.lineWidth = Math.max(0.55, node.radius * 0.052);
          ctx.beginPath();
          for (let r = 0; r <= rowSteps; r++) {
            const t = r / rowSteps;
            const pt = pointAt(node, t);
            const w = widthAt(t);
            const polarity = c % 2 === 0 ? 1 : -1;
            const braid = polarity * Math.sin(t * freq + (c >> 1) * 2.3 + node.phase) * 0.12
              + Math.cos(t * freq * 1.6 + c * 1.7) * 0.05;
            const u = Math.max(-0.94, Math.min(0.94, baseU + braid));
            const x = pt.x + Math.cos(pt.tangent) * w * u;
            const y = pt.y + Math.sin(pt.tangent) * w * u;
            if (r === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        // 4c. Subtle compressed bark collar wrinkles at limb unions (welds child limb into parent bough)
        if (!isTrunk && node.radius > 3.2) {
          ctx.strokeStyle = bark.shade;
          ctx.globalAlpha = 0.34;
          ctx.lineWidth = Math.max(0.7, node.radius * 0.055);
          for (const collarT of [0.03, 0.07, 0.12]) {
            const pt = pointAt(node, collarT);
            const w = widthAt(collarT) * 0.86;
            const nx = Math.cos(pt.tangent);
            const ny = Math.sin(pt.tangent);
            const tx = Math.sin(pt.tangent);
            const ty = -Math.cos(pt.tangent);
            ctx.beginPath();
            ctx.moveTo(pt.x - nx * w + tx * 2, pt.y - ny * w + ty * 2);
            ctx.quadraticCurveTo(pt.x - tx * 2.5, pt.y - ty * 2.5, pt.x + nx * w + tx * 2, pt.y + ny * w + ty * 2);
            ctx.stroke();
          }
        }
      } else {
        ctx.strokeStyle = bark.marks === "white" ? "#474341" : bark.shade;
        ctx.globalAlpha = bark.marks === "smooth" ? 0.16 : 0.34;
        ctx.lineWidth = 0.7;
        const marks = bark.marks === "ringed" ? 24 : 12;
        for (let i = 0; i < marks; i++) {
          const t = 0.05 + i / marks * 0.9;
          const center = pointAt(node, t);
          const w = widthAt(t);
          const offset = Math.sin(i * 3.7 + node.phase) * w * 0.45;
          if (bark.marks === "peeling") {
            ctx.fillStyle = i % 2 ? bark.light : bark.shade;
            ctx.beginPath();
            ctx.ellipse(center.x + offset, center.y, w * 0.55, 4 + i % 3 * 3, center.tangent + Math.sin(i) * 0.2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            if (bark.marks === "white" || bark.marks === "ringed") {
              const nx = Math.cos(center.tangent);
              const ny = Math.sin(center.tangent);
              ctx.moveTo(center.x - nx * w * (bark.marks === "white" ? 0.15 : 0.9), center.y - ny * w * (bark.marks === "white" ? 0.15 : 0.9));
              ctx.lineTo(center.x + nx * w * 0.85, center.y + ny * w * 0.85 + 1);
            } else {
              ctx.moveTo(center.x + offset, center.y);
              ctx.quadraticCurveTo(center.x + offset + 1, center.y - 5, center.x + offset - 0.5, center.y - 11);
            }
            ctx.stroke();
          }
        }
      }
    }
    ctx.restore();
  }

  let atlasTree: Tree | undefined;
  let atlasStamp = "";
  let atlases = new WeakMap<Branch, Partial<Record<0 | 1, LeafAtlas | null>>>();
  let woodPatches = new WeakMap<Branch, RasterPatch>();
  let restAngles = new WeakMap<Branch, number>();
  let cacheBudget = Infinity;
  let frameCachesReady = false;

  function prepareAtlases(): void {
    const stamp = [ratio * scale, parameters.windStrength, parameters.branchStiffness, parameters.leafFlutter].join(":");
    if (atlasTree === tree && atlasStamp === stamp) return;
    canvas.dataset.previewReady = "false";
    atlasTree = tree;
    atlasStamp = stamp;
    atlases = new WeakMap();
    woodPatches = new WeakMap();
    restAngles = new WeakMap();
    function measureRest(node: Branch, parentAngle: number): void {
      const sway = parameters.windStrength / parameters.branchStiffness * node.flexibility
        * (Math.sin(1.2) * 0.32 + Math.sin(node.phase) * 0.25);
      const angle = parentAngle + node.angle + sway;
      restAngles.set(node, angle);
      for (const child of node.children) measureRest(child, angle + pointAt(node, child.at).tangent);
    }
    measureRest(tree.trunk, 0);
  }

  function woodPatch(node: Branch): RasterPatch | undefined {
    const saved = woodPatches.get(node);
    if (saved) return saved;
    if (cacheBudget <= 0) return undefined;
    const started = performance.now();
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const padding = node.radius * 2.5 + 4;
    for (let i = 0; i <= 20; i++) {
      const point = pointAt(node, i / 20);
      left = Math.min(left, point.x - padding);
      right = Math.max(right, point.x + padding);
      top = Math.min(top, point.y - padding);
      bottom = Math.max(bottom, point.y + padding);
    }
    const density = Math.min(2, Math.max(0.5, ratio * scale));
    left = Math.floor(left * density) / density;
    top = Math.floor(top * density) / density;
    const width = Math.ceil((right - left) * density);
    const height = Math.ceil((bottom - top) * density);
    const [canvas, painter] = makeCanvas(width, height);
    painter.setTransform(density, 0, 0, density, -left * density, -top * density);
    paintBranch(node, painter);
    const patch = { canvas, left, top, width, height, density };
    woodPatches.set(node, patch);
    cacheBudget -= performance.now() - started;
    return patch;
  }

  function leafPoses(node: Branch, leaves: Leaf[], frameIndex: number) {
    const angleAtRest = restAngles.get(node);
    if (angleAtRest === undefined) throw new Error("Missing rest pose for foliage atlas.");
    const phase = frameIndex * Math.PI / 2;
    const isWeeping = activeProfile.habit === "weeping";
    return leaves.map((leaf) => {
      const point = pointAt(node, leaf.at);
      const flutter = parameters.windStrength * parameters.leafFlutter
        * (Math.sin(phase + leaf.phase) * 0.13 + Math.sin(phase + node.phase) * 0.055);
      const side = Math.sign(leaf.angle) || 1;
      let angle: number;
      if (isWeeping) {
        // Gravity-draped pendant leaves: hang downward everywhere while splaying fuller across the upper dome crest
        const worldTangent = angleAtRest + point.tangent;
        const spineWorld = Math.PI - Math.sin(worldTangent) * 0.32;
        const splay = Math.min(0.56, Math.abs(leaf.angle) * 0.82);
        angle = spineWorld + side * splay + flutter - angleAtRest;
      } else if (species === "jacaranda" && leaf.color >= 6) {
        // Cauliflower blossom puffs orient radially around the dome crest, and billow over/below outer-skirt boughs
        const worldTangent = angleAtRest + point.tangent;
        const skirtDrape = Math.abs(Math.sin(worldTangent)) > 0.78 && side < 0 ? 0.55 : 0;
        const domeWorld = Math.sin(worldTangent) * (0.62 + skirtDrape) + side * Math.min(0.48, Math.abs(leaf.angle) * 0.42);
        angle = domeWorld + flutter - angleAtRest;
      } else {
        const rawPull = leaf.pendant ? Math.sin(angleAtRest + point.tangent + leaf.angle) * 0.22 : 0;
        const signedOffset = side * Math.max(Math.abs(leaf.angle) * 0.78, side * (leaf.angle + rawPull));
        angle = point.tangent + signedOffset + flutter;
      }
      return { leaf, point, cos: Math.cos(angle), sin: Math.sin(angle) };
    });
  }

  function drawLeafSprite(painter: CanvasRenderingContext2D, leaf: Leaf, layer: 0 | 1): void {
    const anchorY = activeProfile.habit === "weeping" ? -leaf.size * 68 / 80 : -leaf.size * 83 / 80;
    painter.drawImage(sprites[leaf.color + (layer === 0 ? 18 : 0)],
      -leaf.size / 2, anchorY, leaf.size, leaf.size * 90 / 80);
  }

  function paintFoliageContent(
    painter: CanvasRenderingContext2D,
    layer: 0 | 1,
    poses: ReturnType<typeof leafPoses>,
    phase: number,
    placeLeaf: (leaf: Leaf, point: { x: number; y: number; tangent: number }, sin: number, cos: number, breadth: number) => void,
  ): void {
    const stems = new Path2D();
    for (const { leaf, point, sin, cos } of poses) {
      if (leaf.stem === 0) continue;
      stems.moveTo(point.x, point.y);
      stems.lineTo(point.x + sin * leaf.stem, point.y - cos * leaf.stem);
    }
    painter.globalAlpha = 1;
    painter.strokeStyle = "#6a4935";
    painter.lineWidth = 0.4;
    painter.stroke(stems);
    painter.globalAlpha = layer === 0 ? 0.94 : 0.98;
    const baseBreadth = activeProfile.leafForm === "fan" || species === "jacaranda" ? 0.96 : 0.76;
    for (const { leaf, point, sin, cos } of poses) {
      const breadth = baseBreadth + Math.sin(phase + leaf.phase) * 0.12 * parameters.windStrength * parameters.leafFlutter;
      placeLeaf(leaf, point, sin, cos, breadth);
    }
  }

  function paintFoliage(node: Branch, layer: 0 | 1, frameIndex: number, leaves: Leaf[]): void {
    const phase = frameIndex * Math.PI / 2;
    const poses = leafPoses(node, leaves, frameIndex);
    ctx.save();
    paintFoliageContent(ctx, layer, poses, phase, (leaf, point, sin, cos, breadth) => {
      ctx.save();
      ctx.translate(point.x + sin * leaf.stem, point.y - cos * leaf.stem);
      ctx.transform(cos * breadth, sin * breadth, -sin, cos, 0, 0);
      drawLeafSprite(ctx, leaf, layer);
      ctx.restore();
    });
    ctx.restore();
  }

  function foliageAtlas(node: Branch, layer: 0 | 1, frameIndex: number): LeafAtlas | null | undefined {
    let layers = atlases.get(node);
    if (!layers) {
      layers = {};
      atlases.set(node, layers);
    }
    let atlas = layers[layer];
    if (atlas === null || atlas?.ready[frameIndex]) return atlas;
    if (cacheBudget <= 0) return undefined;
    const started = performance.now();
    if (atlas === undefined) {
      const leaves = node.leaves.filter((leaf) => leaf.layer === layer);
      if (!leaves.length) {
        layers[layer] = null;
        return null;
      }
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      for (const leaf of leaves) {
        const point = pointAt(node, leaf.at);
        const padding = leaf.size * 2 + leaf.stem;
        left = Math.min(left, point.x - padding);
        right = Math.max(right, point.x + padding);
        top = Math.min(top, point.y - padding);
        bottom = Math.max(bottom, point.y + padding);
      }
      const density = Math.min(2, Math.max(0.5, ratio * scale));
      left = Math.floor(left * density) / density;
      top = Math.floor(top * density) / density;
      const width = Math.ceil((right - left) * density);
      const height = Math.ceil((bottom - top) * density);
      const [canvas, context] = makeCanvas(width * 4, height);
      atlas = { canvas, context, leaves, left, top, width, height, density, ready: [false, false, false, false] };
      layers[layer] = atlas;
    }
    const phase = frameIndex * Math.PI / 2;
    const poses = leafPoses(node, atlas.leaves, frameIndex);
    const { context: painter, density, width, height, left, top } = atlas;
    const offset = frameIndex * width;
    painter.save();
    painter.beginPath();
    painter.rect(offset, 0, width, height);
    painter.clip();
    painter.setTransform(density, 0, 0, density, offset - left * density, -top * density);
    paintFoliageContent(painter, layer, poses, phase, (leaf, point, sin, cos, breadth) => {
      painter.setTransform(density * cos * breadth, density * sin * breadth, -density * sin, density * cos,
        offset + (point.x + sin * leaf.stem - left) * density,
        (point.y - cos * leaf.stem - top) * density);
      drawLeafSprite(painter, leaf, layer);
    });
    painter.restore();
    atlas.ready[frameIndex] = true;
    cacheBudget -= performance.now() - started;
    return atlas;
  }

  function drawBranch(node: Branch, pass: "rear" | "wood" | "front"): void {
    const birth = node.birthAge ?? 0;
    const full = node.fullAge ?? 1;
    const depth = node.depth ?? 0;
    const isGrowing = treeAge < 0.999;
    let progress = 1;
    let thickness = 1;
    if (isGrowing) {
      if (treeAge <= birth) return;
      const raw = Math.min(1, (treeAge - birth) / Math.max(0.05, full - birth));
      progress = 1 - (1 - raw) ** 1.65;
      const cambial = Math.min(1, (treeAge - birth) / Math.max(0.14, 1 - birth * 0.65));
      thickness = node === tree.trunk
        ? 0.20 + 0.80 * (cambial ** 1.15)
        : (depth >= 3 ? 0.28 : 0.38) + (depth >= 3 ? 0.72 : 0.62) * cambial;
    }
    const gust = Math.sin(time * 0.8 * parameters.gustFrequency) * 0.68 + Math.sin(time * 0.31 * parameters.gustFrequency + 1.2) * 0.32;
    const sway = parameters.windStrength / parameters.branchStiffness * node.flexibility
      * (gust + Math.sin(time * 1.8 * parameters.branchResponse + node.phase) * 0.25);
    const rotation = node.angle + sway;
    ctx.rotate(rotation);
    if (pass === "wood") {
      ctx.save();
      if (isGrowing) ctx.scale(thickness, progress);
      if (!isGrowing || progress > 0.75) paintProps(node);
      const patch = woodPatch(node);
      if (patch) {
        ctx.drawImage(patch.canvas, patch.left, patch.top, patch.width / patch.density, patch.height / patch.density);
      } else {
        frameCachesReady = false;
        paintBranch(node, ctx);
      }
      ctx.restore();
    }
    if (leavesVisible && pass !== "wood") {
      const layer = pass === "rear" ? 0 : 1;
      const frameIndex = Math.floor(time * 3.6 * (1 + Math.sin(node.phase) * 0.25) / (Math.PI * 2) * 4) % 4;
      const rawLeafProgress = isGrowing ? Math.max(0, Math.min(1, (progress - 0.08) / 0.92)) : 1;
      // Flowering trees grow lush green juvenile foliage through the young stage (treeAge <= 0.62) before bursting into bloom
      const bloomGate = isGrowing && activeProfile.flower
        ? Math.max(0, Math.min(1, (treeAge - 0.62) / 0.28))
        : 1;
      const leafProgress = rawLeafProgress * bloomGate;
      if (leafProgress > 0.01) {
        const atlas = foliageAtlas(node, layer, frameIndex);
        ctx.save();
        if (isGrowing) {
          // Uniform isotropic scale from the shoot base (0, 0) preserves downward gravity orientation and leaf aspect ratio
          const uniformScale = 0.24 + 0.76 * progress;
          ctx.scale(uniformScale, uniformScale);
          ctx.globalAlpha = Math.min(1, leafProgress * 1.4);
        }
        if (atlas?.ready[frameIndex]) {
          ctx.drawImage(atlas.canvas, frameIndex * atlas.width, 0, atlas.width, atlas.height,
            atlas.left, atlas.top, atlas.width / atlas.density, atlas.height / atlas.density);
        } else if (atlas !== null) {
          frameCachesReady = false;
          paintFoliage(node, layer, frameIndex, atlas?.leaves ?? node.leaves.filter((leaf) => leaf.layer === layer));
        }
        ctx.restore();
      }
      // Render temporary juvenile leaves on sapling/young stems before outer bloom canopy takes over
      const shedStart = depth === 4 ? 0.20 : depth === 3 ? 0.44 : depth === 2 ? 0.64 : 0.74;
      const shedEnd = shedStart + (depth === 4 ? 0.10 : 0.16);
      if (isGrowing && node.juvenileLeaves && treeAge < shedEnd && progress > 0.12) {
        const juvAlpha = treeAge < shedStart
          ? Math.min(1, (progress - 0.12) / 0.35)
          : Math.max(0, 1 - (treeAge - shedStart) / 0.22);
        if (juvAlpha > 0.02) {
          const juvScale = 0.45 + 0.55 * Math.min(1, treeAge / 0.32);
          const angleAtRest = restAngles.get(node) ?? 0;
          ctx.save();
          ctx.globalAlpha = juvAlpha * (layer === 0 ? 0.92 : 0.98);
          for (const leaf of node.juvenileLeaves) {
            if (leaf.layer !== layer) continue;
            const pt = pointAt(node, leaf.at);
            const side = Math.sign(leaf.angle) || 1;
            const a = activeProfile.habit === "weeping"
              ? Math.PI - Math.sin(angleAtRest + pt.tangent) * 0.28 + side * Math.min(0.48, Math.abs(leaf.angle)) - angleAtRest
              : pt.tangent + leaf.angle;
            const c = Math.cos(a);
            const s = Math.sin(a);
            ctx.save();
            ctx.translate(pt.x * thickness, pt.y * progress);
            ctx.scale(juvScale, juvScale);
            ctx.transform(c * 0.82, s * 0.82, -s, c, 0, 0);
            drawLeafSprite(ctx, leaf, layer);
            ctx.restore();
          }
          ctx.restore();
        }
      }
    }
    for (const child of node.children) {
      const point = pointAt(node, child.at);
      ctx.save();
      ctx.translate(point.x * thickness, point.y * progress);
      ctx.rotate(point.tangent);
      drawBranch(child, pass);
      ctx.restore();
    }
  }

  function paintFrame(forceCacheConstruction = false): void {
    cacheBudget = forceCacheConstruction ? Infinity : 6;
    frameCachesReady = true;
    prepareAtlases();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(background, 0, 0);
    if (treeAge >= 0.999) {
      ctx.drawImage(groundCover, 0, 0);
    } else {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      paintGroundCover(ctx, treeAge);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(scale, scale);
    for (const pass of ["rear", "wood", "front"] as const) {
      ctx.save();
      drawBranch(tree.trunk, pass);
      ctx.restore();
    }
    ctx.restore();
    canvas.dataset.windTime = time.toFixed(3);
    canvas.dataset.previewReady = String(frameCachesReady && !pendingGrowth && !pendingSprites);
  }

  function render(timestamp: number): void {
    frame = 0;
    if (!active || document.hidden) return;
    try {
      if (!flushPendingEditorWork()) return;
      if (windEnabled && lastTime !== undefined) time += Math.min((timestamp - lastTime) / 1000, 0.05);
      lastTime = windEnabled ? timestamp : undefined;
      if (growthPlaying) {
        if (lastGrowthTime !== undefined) {
          const dt = Math.min((timestamp - lastGrowthTime) / 1000, 0.05);
          // Biological growth rate: slightly faster in sapling sprint, steady into full crown maturity (~6.5s total)
          const speed = 0.145 * (0.82 + 0.36 * Math.sin(treeAge * Math.PI));
          treeAge = Math.min(1, treeAge + dt * speed);
          if (treeAge >= 1) {
            treeAge = 1;
            growthPlaying = false;
            lastGrowthTime = undefined;
          }
          syncControls();
        }
        if (growthPlaying) lastGrowthTime = timestamp;
      } else {
        lastGrowthTime = undefined;
      }
      paintFrame();
      if (growthPlaying || (windEnabled && parameters.windStrength > 0) || !frameCachesReady) requestFrame();
    } catch (cause) {
      reportError(cause);
    }
  }

  updateControlValues();
  renderTrials();
  syncControls();
  resize();
  foliageButton.disabled = regenerateButton.disabled = windButton.disabled = growButton.disabled = false;
  growButton.addEventListener("click", () => {
    if (!prepareDiscreteAction()) return;
    if (growthPlaying) {
      growthPlaying = false;
      lastGrowthTime = undefined;
    } else {
      if (treeAge >= 0.98) treeAge = 0.04;
      growthPlaying = true;
      lastGrowthTime = undefined;
    }
    syncControls();
    requestFrame();
  });
  ageSlider.addEventListener("input", () => {
    if (!prepareDiscreteAction()) return;
    growthPlaying = false;
    lastGrowthTime = undefined;
    treeAge = Math.max(0.04, Math.min(1, Number(ageSlider.value)));
    syncControls();
    paintFrame();
  });
  windButton.addEventListener("click", () => {
    if (!prepareDiscreteAction()) return;
    windEnabled = !windEnabled;
    explicitWind = true;
    lastTime = undefined;
    syncControls();
    requestFrame();
    if (pendingPersistence) persist();
  });
  foliageButton.addEventListener("click", () => {
    if (!prepareDiscreteAction()) return;
    leavesVisible = !leavesVisible;
    syncControls();
    requestFrame();
    if (pendingPersistence) persist();
  });
  regenerateButton.addEventListener("click", () => {
    try {
      if (!prepareDiscreteAction()) return;
      seed = crypto.getRandomValues(new Uint32Array(1))[0] % 100000;
      tree = growTree(seed, species, parameters);
      syncControls();
      resize();
      persist();
    } catch (cause) {
      reportError(cause);
    }
  });
  speciesSelect.addEventListener("change", () => {
    try {
      const selection = speciesSelect.value;
      if (!prepareDiscreteAction()) return;
      if (!isSpecies(selection)) throw new Error("Unknown species selection");
      species = selection;
      parameters = settingsFor(species);
      refreshSprites();
      tree = growTree(seed, species, parameters);
      updateControlValues();
      syncControls();
      resize();
      persist();
    } catch (cause) {
      reportError(cause);
    }
  });
  seedInput.addEventListener("change", () => {
    const value = seedInput.valueAsNumber;
    if (!Number.isInteger(value) || value < 0 || value > 99999) {
      seedInput.setCustomValidity("Use a whole-number seed from 0 to 99999.");
      seedInput.reportValidity();
      return;
    }
    if (!prepareDiscreteAction()) return;
    seedInput.setCustomValidity("");
    seed = value;
    tree = growTree(seed, species, parameters);
    syncControls();
    resize();
    persist();
  });
  seedInput.addEventListener("input", () => seedInput.setCustomValidity(""));
  element<HTMLButtonElement>("reset-preset").addEventListener("click", () => {
    if (!prepareDiscreteAction()) return;
    settings[species] = defaultParameters(species);
    parameters = settingsFor(species);
    refreshSprites();
    tree = growTree(seed, species, parameters);
    updateControlValues();
    syncControls();
    resize();
    if (persist()) message.textContent = "Species preset restored. Your seed is unchanged.";
  });
  element<HTMLButtonElement>("save-trial").addEventListener("click", () => {
    if (!prepareDiscreteAction()) return;
    if (trials.length >= trialLimit) {
      message.textContent = `${trialLimit} trials are saved. Export JSON to preserve this experiment.`;
      if (pendingPersistence) persist();
      return;
    }
    const [thumbnail, thumbnailCtx] = makeCanvas(160, 120);
    try {
      paintFrame(true);
    } catch (cause) {
      reportError(cause);
      return;
    }
    const thumbnailScale = Math.min(thumbnail.width / canvas.width, thumbnail.height / canvas.height);
    thumbnailCtx.fillStyle = "#b9cad1";
    thumbnailCtx.fillRect(0, 0, thumbnail.width, thumbnail.height);
    thumbnailCtx.drawImage(canvas,
      (thumbnail.width - canvas.width * thumbnailScale) / 2,
      (thumbnail.height - canvas.height * thumbnailScale) / 2,
      canvas.width * thumbnailScale, canvas.height * thumbnailScale);
    trials.push({
      species, seed, parameters: { ...parameters }, time,
      signature: tree.signature, count: tree.count, image: thumbnail.toDataURL("image/png"),
      foliageVisible: leavesVisible,
      generatorVersion,
    });
    renderTrials();
    if (persist()) message.textContent = `Trial ${trials.length} saved with seed and parameters.`;
  });
  element<HTMLButtonElement>("export-trials").addEventListener("click", () => {
    if (!prepareDiscreteAction()) return;
    const saved = !pendingPersistence || persist();
    const json = JSON.stringify({
      version: 1, generatorVersion, renderer: "canvas-2d",
      units: "Multipliers use each species' base architecture; other controls use fractions or counts.",
      current: { species, seed, parameters, time, foliageVisible: leavesVisible, signature: tree.signature, count: tree.count },
      presets: settings, trials,
      limitation: "Heuristic growth, not a physiological simulation or a realism score.",
    }, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "tree-experiment.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (saved) message.textContent = "Experiment exported as JSON.";
  });
  const panel = element<HTMLElement>("tuning-panel");
  const openTuning = element<HTMLButtonElement>("open-tuning");
  function setPanel(open: boolean): void {
    panel.classList.toggle("hidden", !open);
    openTuning.setAttribute("aria-expanded", String(open));
    if (open) element<HTMLButtonElement>("close-tuning").focus();
    else openTuning.focus();
  }
  openTuning.addEventListener("click", () => setPanel(true));
  element<HTMLButtonElement>("close-tuning").addEventListener("click", () => setPanel(false));
  panel.addEventListener("keydown", (event) => { if (event.key === "Escape") setPanel(false); });
  reducedMotion.addEventListener("change", () => {
    if (explicitWind) return;
    if (!prepareDiscreteAction()) return;
    windEnabled = !reducedMotion.matches;
    lastTime = undefined;
    syncControls();
    requestFrame();
    if (pendingPersistence) persist();
  });
  document.addEventListener("visibilitychange", () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastTime = undefined;
    requestFrame();
  });
  window.addEventListener("resize", () => resize());
  window.addEventListener("pagehide", (event) => {
    flushPendingEditorWork();
    if (pendingPersistence) persist();
    if (event.persisted) return;
    active = false;
    if (frame) cancelAnimationFrame(frame);
    if (editorFrame) cancelAnimationFrame(editorFrame);
    if (saveTimer) window.clearTimeout(saveTimer);
    frame = editorFrame = saveTimer = 0;
  });
}

try {
  start();
} catch (cause) {
  reportError(cause);
}
