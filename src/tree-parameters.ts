import { getSpecies, type Species } from "./species-profiles";

export interface TreeParameters {
  trunkHeight: number;
  crownWidth: number;
  crownDepth: number;
  branchSpread: number;
  apicalDominance: number;
  gravity: number;
  taper: number;
  foliageSpacing: number;
  foliageSize: number;
  flowerDensity: number;
  windStrength: number;
  forkCount: number;
  attachmentSpacing: number;
  angleVariation: number;
  asymmetry: number;
  twigLength: number;
  trunkThickness: number;
  curvature: number;
  rootFlare: number;
  branchStiffness: number;
  foliageClustering: number;
  canopyGaps: number;
  leafSizeVariation: number;
  leafOrientation: number;
  rearShading: number;
  panicleSize: number;
  flowersPerSpray: number;
  flowerColorVariation: number;
  gustFrequency: number;
  branchResponse: number;
  leafFlutter: number;
  interiorShoots: number;
  crownTiers: number;
  frondCount: number;
}

export interface ParameterDefinition {
  key: keyof TreeParameters;
  label: string;
  group: "Growth" | "Foliage" | "Animation" | "Advanced branching" | "Advanced structure" | "Advanced foliage" | "Flowers" | "Advanced wind";
  min: number;
  max: number;
  step: number;
  suffix: string;
  help: string;
}

export const definitions: ParameterDefinition[] = [
  { key: "trunkHeight", label: "Clear trunk height", group: "Growth", min: 0.5, max: 1.8, step: 0.05, suffix: "x", help: "Lengthen the trunk and lift its crown." },
  { key: "crownWidth", label: "Crown width", group: "Growth", min: 0.65, max: 1.6, step: 0.05, suffix: "x", help: "Change the horizontal growing space." },
  { key: "crownDepth", label: "Crown depth", group: "Growth", min: 0.65, max: 1.6, step: 0.05, suffix: "x", help: "Change the vertical growing space." },
  { key: "branchSpread", label: "Scaffold spread", group: "Growth", min: 0.6, max: 1.4, step: 0.05, suffix: "x", help: "Spread the primary limbs outward." },
  { key: "apicalDominance", label: "Leader priority", group: "Growth", min: 0, max: 1, step: 0.05, suffix: "", help: "Favor upward continuation over lateral shoots. A growth heuristic, not a hormone simulation." },
  { key: "gravity", label: "Droop under weight", group: "Growth", min: 0, max: 1, step: 0.05, suffix: "", help: "Lower outer twig targets. This approximates weight, not physical force." },
  { key: "taper", label: "Tip / base thickness", group: "Growth", min: 0.25, max: 0.8, step: 0.01, suffix: "", help: "The thickness ratio along structural branches." },
  { key: "foliageSpacing", label: "Foliage spacing", group: "Foliage", min: 0.65, max: 2.5, step: 0.05, suffix: "x", help: "Space leaf pairs along shoots without changing the skeleton." },
  { key: "foliageSize", label: "Foliage size", group: "Foliage", min: 0.5, max: 1.8, step: 0.05, suffix: "x", help: "Scale leaves and flower sprays without changing branches." },
  { key: "flowerDensity", label: "Flowering shoots", group: "Foliage", min: 0, max: 1, step: 0.01, suffix: "", help: "Fraction of terminal foliage groups rendered as this species' flowers." },
  { key: "windStrength", label: "Wind strength", group: "Animation", min: 0, max: 2, step: 0.05, suffix: "x", help: "Change sway and flutter, keeping roots anchored." },
  { key: "forkCount", label: "Shoots per fork", group: "Advanced branching", min: 2, max: 4, step: 1, suffix: "", help: "Maximum shoots per structural fork. Some shoots are naturally omitted." },
  { key: "attachmentSpacing", label: "Attachment spacing", group: "Advanced branching", min: 0.65, max: 1.35, step: 0.05, suffix: "x", help: "Move lateral attachment points along their parent limb." },
  { key: "angleVariation", label: "Branch angle variation", group: "Advanced branching", min: 0, max: 1, step: 0.05, suffix: "", help: "Vary lateral target directions using the fixed seed." },
  { key: "asymmetry", label: "Crown asymmetry", group: "Advanced branching", min: 0, max: 1, step: 0.05, suffix: "", help: "Favor one side of the scaffold rather than mirroring it." },
  { key: "twigLength", label: "Terminal shoot length", group: "Advanced branching", min: 0.5, max: 1.6, step: 0.05, suffix: "x", help: "Change the reach of the finest shoots." },
  { key: "interiorShoots", label: "Interior shoots per limb", group: "Advanced branching", min: 0, max: 5, step: 1, suffix: "", help: "Grow short leafy shoots inside the scaffold, rather than only along the crown edge." },
  { key: "crownTiers", label: "Branch whorls", group: "Advanced branching", min: 4, max: 12, step: 1, suffix: "", help: "Number of branch tiers along the leader of a conical conifer." },
  { key: "frondCount", label: "Palm fronds", group: "Advanced branching", min: 8, max: 24, step: 1, suffix: "", help: "Number of pinnate fronds attached to the palm's unbranched trunk." },
  { key: "trunkThickness", label: "Trunk thickness", group: "Advanced structure", min: 0.6, max: 1.8, step: 0.05, suffix: "x", help: "Scale trunk and child-limb thicknesses together." },
  { key: "curvature", label: "Additional limb curvature", group: "Advanced structure", min: 0, max: 1, step: 0.05, suffix: "", help: "Add bowing between the smoothly connected forks." },
  { key: "rootFlare", label: "Root flare", group: "Advanced structure", min: 0, max: 1, step: 0.05, suffix: "", help: "Widen only the base of the trunk." },
  { key: "branchStiffness", label: "Branch stiffness", group: "Advanced structure", min: 0.5, max: 2, step: 0.05, suffix: "x", help: "Reduce sway as stiffness increases. A rig parameter, not an elastic-material simulation." },
  { key: "foliageClustering", label: "Foliage clustering", group: "Advanced foliage", min: 0, max: 1, step: 0.05, suffix: "", help: "Concentrate leaf pairs into groups along each shoot." },
  { key: "canopyGaps", label: "Leafless shoots", group: "Advanced foliage", min: 0, max: 0.6, step: 0.01, suffix: "", help: "Omit whole foliage groups, preserving their branches." },
  { key: "leafSizeVariation", label: "Leaf-size variation", group: "Advanced foliage", min: 0, max: 1, step: 0.05, suffix: "", help: "Vary individual sizes around the foliage-size setting." },
  { key: "leafOrientation", label: "Leaf angle variation", group: "Advanced foliage", min: 0, max: 1, step: 0.05, suffix: "", help: "Vary orientations while keeping opposite pairs attached." },
  { key: "rearShading", label: "Rear-layer shading", group: "Advanced foliage", min: 0, max: 0.65, step: 0.01, suffix: "", help: "Darken the rear foliage sprites without changing their placement." },
  { key: "panicleSize", label: "Flower panicle size", group: "Flowers", min: 0.5, max: 1.8, step: 0.05, suffix: "x", help: "Scale jacaranda flower sprays independently of its leaves." },
  { key: "flowersPerSpray", label: "Flowers per spray", group: "Flowers", min: 3, max: 15, step: 1, suffix: "", help: "Paint this many trumpet flowers in each jacaranda sprite." },
  { key: "flowerColorVariation", label: "Flower color variation", group: "Flowers", min: 0, max: 1, step: 0.05, suffix: "", help: "Vary lilac-blue hues across flower sprays." },
  { key: "gustFrequency", label: "Gust frequency", group: "Advanced wind", min: 0.3, max: 2, step: 0.05, suffix: "x", help: "Change how quickly the broad gust rises and falls." },
  { key: "branchResponse", label: "Branch response speed", group: "Advanced wind", min: 0.5, max: 1.8, step: 0.05, suffix: "x", help: "Change smaller branch oscillations independently of the gust." },
  { key: "leafFlutter", label: "Leaf flutter", group: "Advanced wind", min: 0, max: 2, step: 0.05, suffix: "x", help: "Change leaf flutter while leaving branch sway intact." },
];

export function defaultParameters(species: Species): TreeParameters {
  const maple = species === "maple";
  const parameters: TreeParameters = {
    trunkHeight: maple ? 0.6 : 0.9, crownWidth: maple ? 1.2 : 1,
    crownDepth: 1.2, branchSpread: maple ? 0.85 : 1,
    apicalDominance: maple ? 0.3 : 0.85,
    gravity: maple ? 0.95 : 0.15,
    taper: maple ? 0.65 : 0.57, foliageSpacing: maple ? 0.65 : 0.75,
    foliageSize: maple ? 1.2 : 1.1,
    flowerDensity: maple ? 0.87 : 0.95, windStrength: 1,
    forkCount: 4, attachmentSpacing: 1, angleVariation: 0.5, asymmetry: 0.25,
    twigLength: 1, trunkThickness: maple ? 1.2 : 1.25,
    curvature: maple ? 0.7 : 0.35, rootFlare: maple ? 0.7 : 0.65,
    branchStiffness: maple ? 1.25 : 1, foliageClustering: 0.4,
    canopyGaps: maple ? 0.05 : 0.1,
    leafSizeVariation: maple ? 0.7 : 0.65, leafOrientation: 0.5,
    rearShading: maple ? 0.5 : 0.45,
    panicleSize: maple ? 1 : 1.15, flowersPerSpray: maple ? 9 : 12,
    flowerColorVariation: maple ? 0.4 : 0.3,
    gustFrequency: 1, branchResponse: 1, leafFlutter: 1,
    interiorShoots: 3,
    crownTiers: 8,
    frondCount: species === "date-palm" ? 20 : 12,
  };
  if (species !== "maple" && species !== "jacaranda") {
    Object.assign(parameters, {
      trunkHeight: 1, crownWidth: 1, crownDepth: 1, branchSpread: 1,
      apicalDominance: 0.65, gravity: 0.3, taper: 0.55,
      foliageSpacing: 1, foliageSize: 1, flowerDensity: 0.65,
      forkCount: 3, trunkThickness: 1, curvature: 0.45, rootFlare: 0.4,
      branchStiffness: 1.25, canopyGaps: 0.08,
      leafSizeVariation: 0.55, rearShading: 0.35,
      panicleSize: 1, flowersPerSpray: 9, flowerColorVariation: 0.35,
      interiorShoots: 2,
    });
  }
  return Object.assign(parameters, getSpecies(species).calibration);
}

export function isParameters(value: unknown): value is TreeParameters {
  if (!value || typeof value !== "object") return false;
  return definitions.every(({ key, min, max }) => {
    const number = Reflect.get(value, key);
    return typeof number === "number" && Number.isFinite(number) && number >= min && number <= max
      && (!["forkCount", "flowersPerSpray", "interiorShoots", "crownTiers", "frondCount"].includes(key) || Number.isInteger(number));
  });
}

export function normalizeParameters(value: unknown, species: Species): TreeParameters | null {
  if (!value || typeof value !== "object") return null;
  const parameters = defaultParameters(species);
  for (const { key } of definitions) {
    if (Object.hasOwn(value, key)) parameters[key] = Reflect.get(value, key);
  }
  return isParameters(parameters) ? parameters : null;
}
