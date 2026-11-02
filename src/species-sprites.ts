import type { SpeciesProfile } from "./species-profiles";

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface LeafPaint {
  fill: string;
  outline: string;
  vein: string;
  highlight: string;
}

type Random = () => number;

const WIDTH = 80;
const HEIGHT = 90;
const ATTACH_X = 40;
const ATTACH_Y = 83;

function randomFor(seed: number): Random {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededRandom(id: string, sprite: number): Random {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  }
  return randomFor(hash ^ Math.imul(sprite + 1, 0x9e3779b9));
}

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  if (typeof document === "undefined") {
    throw new Error("Canvas 2D is unavailable; species sprites require a browser canvas.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D is unavailable; species sprites cannot be generated.");
  }
  return [canvas, context];
}

function readColor(context: CanvasRenderingContext2D, color: string): Rgb {
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const pixel = context.getImageData(0, 0, 1, 1).data;
  return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] / 255 };
}

function rgba(color: Rgb, alpha = color.a): string {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
}

function shade(color: Rgb, factor: number, alpha = color.a): Rgb {
  return {
    r: Math.max(0, Math.min(255, color.r * factor)),
    g: Math.max(0, Math.min(255, color.g * factor)),
    b: Math.max(0, Math.min(255, color.b * factor)),
    a: alpha,
  };
}

function interpolate(first: Rgb, second: Rgb, amount: number): Rgb {
  return {
    r: first.r + (second.r - first.r) * amount,
    g: first.g + (second.g - first.g) * amount,
    b: first.b + (second.b - first.b) * amount,
    a: first.a + (second.a - first.a) * amount,
  };
}

function paletteColor(
  context: CanvasRenderingContext2D,
  palette: readonly string[],
  index: number,
  count: number,
  variation: number,
  rng: Random,
): Rgb {
  if (palette.length === 0) throw new RangeError("Species palettes must not be empty.");
  const parsed = palette.map((color) => readColor(context, color));
  if (parsed.length === 1) return parsed[0];
  const middle = (parsed.length - 1) / 2;
  const normalizedIndex = count <= 1 ? 0.5 : index / (count - 1);
  const position = Math.max(
    0,
    Math.min(
      parsed.length - 1,
      middle + (normalizedIndex * 2 - 1) * middle * variation + (rng() - 0.5) * variation * 0.65,
    ),
  );
  const low = Math.floor(position);
  return interpolate(parsed[low], parsed[Math.min(parsed.length - 1, low + 1)], position - low);
}

function makePaint(color: Rgb): LeafPaint {
  return {
    fill: rgba(color),
    outline: rgba(shade(color, 0.48, 0.78)),
    vein: rgba(shade(color, 0.54, 0.85)),
    highlight: rgba(shade(color, 1.55, 0.35)),
  };
}

function gradient(context: CanvasRenderingContext2D, color: Rgb, y1 = 8, y2 = 74): CanvasGradient {
  const result = context.createLinearGradient(26, y1, 54, y2);
  result.addColorStop(0, rgba(shade(color, 1.28)));
  result.addColorStop(0.48, rgba(color));
  result.addColorStop(1, rgba(shade(color, 0.67)));
  return result;
}

function finishLeafPath(context: CanvasRenderingContext2D, color: Rgb, rng: Random): void {
  context.fillStyle = gradient(context, color);
  context.fill();
  context.strokeStyle = rgba(shade(color, 0.48, 0.78));
  context.lineWidth = 0.65 + rng() * 0.35;
  context.lineJoin = "round";
  context.stroke();
}

function drawPetiole(context: CanvasRenderingContext2D, paint: LeafPaint, endX = 40, endY = 69): void {
  context.beginPath();
  context.moveTo(ATTACH_X, ATTACH_Y);
  context.quadraticCurveTo(39 + endX * 0.025, 77, endX, endY);
  context.strokeStyle = paint.outline;
  context.lineWidth = 1.5;
  context.lineCap = "round";
  context.stroke();
}

function drawMidrib(
  context: CanvasRenderingContext2D,
  paint: LeafPaint,
  startX = 40,
  startY = 70,
  endX = 40,
  endY = 10,
  width = 0.9,
): void {
  context.beginPath();
  context.moveTo(startX, startY);
  context.quadraticCurveTo((startX + endX) / 2 + 1.1, (startY + endY) / 2, endX, endY);
  context.strokeStyle = paint.vein;
  context.lineWidth = width;
  context.lineCap = "round";
  context.stroke();
  context.beginPath();
  context.moveTo(startX - 0.45, startY - 1);
  context.quadraticCurveTo((startX + endX) / 2, (startY + endY) / 2 - 1, endX - 0.35, endY + 1);
  context.strokeStyle = paint.highlight;
  context.lineWidth = 0.45;
  context.stroke();
}

function drawSideVeins(
  context: CanvasRenderingContext2D,
  paint: LeafPaint,
  count: number,
  widthAt: (t: number) => number,
  startY = 68,
  endY = 11,
): void {
  context.save();
  context.lineCap = "round";
  context.strokeStyle = paint.vein;
  context.lineWidth = 0.52;
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const y = startY - t * (startY - endY);
    const reach = widthAt(t) * (0.32 + (i % 2) * 0.025);
    for (const sign of [-1, 1]) {
      context.beginPath();
      context.moveTo(40, y);
      context.quadraticCurveTo(40 + sign * reach * 0.58, y - 2.6, 40 + sign * reach, y - 6 - (i % 3) * 0.5);
      context.stroke();
    }
  }
  context.restore();
}

function drawArcuateVeins(context: CanvasRenderingContext2D, paint: LeafPaint, width: number): void {
  context.save();
  context.lineCap = "round";
  context.strokeStyle = paint.vein;
  context.lineWidth = 0.68;
  for (let i = 0; i < 6; i++) {
    const y = 60 - i * 6.3;
    const t = (y - 8) / 62;
    const reach = width * 0.5 * Math.sin(Math.PI * t) ** 0.55 * 0.78;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.moveTo(40, y);
      context.quadraticCurveTo(40 + side * reach * 0.82, y - 2, 40 + side * reach, y - 12);
      context.stroke();
    }
  }
  context.restore();
}

function drawMaple(context: CanvasRenderingContext2D, color: Rgb, rng: Random): void {
  const centerX = 40 + (rng() - 0.5) * 1.2;
  const lobes = [0.36, 0.74, 0.93, 1, 0.93, 0.74, 0.36];
  context.beginPath();
  context.moveTo(40, ATTACH_Y);
  context.lineTo(centerX - 2, 72);
  for (let lobe = 0; lobe < 7; lobe++) {
    const angle = -1.62 + lobe * 3.24 / 6;
    for (const [offset, radial] of [
      [-0.25, 0.48], [-0.16, 0.73], [-0.11, 0.67], [-0.06, 0.84],
      [0, 1], [0.06, 0.84], [0.11, 0.67], [0.16, 0.73], [0.25, 0.48],
    ]) {
      context.lineTo(
        centerX + Math.sin(angle + offset) * lobes[lobe] * radial * 36 + (rng() - 0.5) * 0.45,
        72 - Math.cos(angle + offset) * lobes[lobe] * radial * 64 + (rng() - 0.5) * 0.35,
      );
    }
  }
  context.lineTo(42, 72);
  context.closePath();
  finishLeafPath(context, color, rng);

  const paint = makePaint(color);
  context.save();
  context.clip();
  context.strokeStyle = paint.vein;
  context.lineWidth = 0.66;
  for (let lobe = 0; lobe < 7; lobe++) {
    const angle = -1.62 + lobe * 3.24 / 6;
    const length = lobes[lobe];
    const x = Math.sin(angle) * length * 36;
    const y = -Math.cos(angle) * length * 64;
    context.beginPath();
    context.moveTo(40, 72);
    context.lineTo(40 + x, 72 + y);
    context.stroke();
    for (let i = 1; i < 5; i++) {
      const t = i / 6;
      for (const sign of [-1, 1]) {
        context.beginPath();
        context.moveTo(40 + x * t, 72 + y * t);
        context.lineTo(40 + x * (t + 0.12) + sign * 4.5, 72 + y * (t + 0.12));
        context.stroke();
      }
    }
  }
  context.restore();
  drawPetiole(context, paint, 39, 72);
}

function traceLobedSide(
  context: CanvasRenderingContext2D,
  side: number,
  count: number,
  reverse = false,
): void {
  const indexes = Array.from({ length: count }, (_, i) => i);
  if (reverse) indexes.reverse();
  for (const i of indexes) {
    const t0 = i / count;
    const t1 = (i + 1) / count;
    const dy = (t1 - t0) * 60;
    const middle = (t0 + t1) / 2;
    const radius = Math.max(1.2, Math.sin(Math.PI * middle) ** 0.7 * 27);
    const endRadius = Math.sin(Math.PI * t1) ** 0.85 * 11;
    const y0 = 8 + t0 * 60;
    const y1 = 8 + t1 * 60;
    const yMid = (y0 + y1) / 2;
    if (!reverse) {
      context.quadraticCurveTo(40 + side * radius, y0 + dy * 0.24, 40 + side * radius * 1.04, yMid);
      context.quadraticCurveTo(40 + side * radius, y0 + dy * 0.78, 40 + side * endRadius, y1);
    } else {
      context.quadraticCurveTo(40 + side * radius, y1 - dy * 0.24, 40 + side * radius * 1.04, yMid);
      context.quadraticCurveTo(40 + side * radius, y0 + dy * 0.22, 40 + side * Math.sin(Math.PI * t0) ** 0.85 * 11, y0);
    }
  }
}

function drawLobedLeaf(context: CanvasRenderingContext2D, color: Rgb, rng: Random, lobes: number): void {
  context.beginPath();
  context.moveTo(40, 8);
  traceLobedSide(context, 1, lobes);
  context.lineTo(40, 70);
  traceLobedSide(context, -1, lobes, true);
  context.closePath();
  finishLeafPath(context, color, rng);
  const paint = makePaint(color);
  drawPetiole(context, paint, 40, 70);
  drawMidrib(context, paint, 40, 70, 40 + (rng() - 0.5) * 1.8, 9);
  drawSideVeins(context, paint, lobes * 2, (t) => 27 * Math.sin(Math.PI * t) ** 0.7);
}

function drawOvateLeaf(
  context: CanvasRenderingContext2D,
  color: Rgb,
  rng: Random,
  options: { width?: number; teeth?: number; curve?: number; veinCount?: number; arcuateVeins?: boolean } = {},
): void {
  const width = options.width ?? 49;
  const teeth = options.teeth ?? 0;
  const curve = options.curve ?? 0;
  const points = 64;
  const phase = rng() * Math.PI * 2;
  context.beginPath();
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const tooth = 1 + teeth * Math.sin(angle * (teeth > 0.07 ? 36 : 5) + phase);
    const tip = 0.24 + 0.76 * Math.abs(Math.sin(angle)) ** 0.36;
    const x = 40 + Math.sin(angle) * width * 0.5 * tooth * tip + curve * Math.sin(angle * 2);
    const y = 39 - Math.cos(angle) * 31;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  finishLeafPath(context, color, rng);
  const paint = makePaint(color);
  drawPetiole(context, paint, 40, 69);
  drawMidrib(context, paint, 40, 69, 40 + curve * 0.5, 9, 0.85);
  if (options.arcuateVeins) drawArcuateVeins(context, paint, width);
  else drawSideVeins(context, paint, options.veinCount ?? 7, (t) => width * 0.5 * Math.sin(Math.PI * t) ** 0.55);
}

function drawPoplarLeaf(context: CanvasRenderingContext2D, color: Rgb, rng: Random): void {
  const asymmetry = (rng() - 0.5) * 2;
  context.beginPath();
  context.moveTo(40, 7);
  context.bezierCurveTo(29, 13, 16, 25, 12 + asymmetry, 42);
  context.quadraticCurveTo(10, 58, 25, 65);
  context.quadraticCurveTo(34, 69, 40, 63);
  context.quadraticCurveTo(47, 69, 56, 65);
  context.quadraticCurveTo(70, 58, 68 - asymmetry, 42);
  context.bezierCurveTo(64, 25, 51, 13, 40, 7);
  context.closePath();
  finishLeafPath(context, color, rng);
  const paint = makePaint(color);
  drawPetiole(context, paint, 40, 64);
  drawMidrib(context, paint, 40, 64, 40, 8, 0.85);
  drawSideVeins(context, paint, 7, (t) => 29 * Math.sin(Math.PI * t) ** 0.64, 64, 12);
}

function drawBirchLeaf(context: CanvasRenderingContext2D, color: Rgb, rng: Random): void {
  const asymmetry = (rng() - 0.5) * 3;
  context.beginPath();
  context.moveTo(40, 7);
  for (let i = 1; i <= 28; i++) {
    const t = i / 28;
    const envelope = Math.sin(Math.PI * t) ** 0.72;
    const tooth = (i % 2 === 0 ? 1 : -0.28) * (1.1 + rng() * 1.15);
    context.lineTo(40 + envelope * (27 + asymmetry * (t - 0.5)) + tooth, 8 + t * 61);
  }
  context.lineTo(40, 69);
  for (let i = 27; i >= 1; i--) {
    const t = i / 28;
    const envelope = Math.sin(Math.PI * t) ** 0.72;
    const tooth = (i % 2 === 0 ? 1 : -0.28) * (1.1 + rng() * 1.15);
    context.lineTo(40 - envelope * (27 + asymmetry * (t - 0.5)) - tooth, 8 + t * 61);
  }
  context.closePath();
  finishLeafPath(context, color, rng);
  const paint = makePaint(color);
  drawPetiole(context, paint, 40, 70);
  drawMidrib(context, paint, 40, 70, 40, 8, 0.8);
  drawSideVeins(context, paint, 8, (t) => 27 * Math.sin(Math.PI * t) ** 0.72, 68, 9);
}

function drawWillowLeaf(context: CanvasRenderingContext2D, color: Rgb, rng: Random): void {
  const stemSway = (rng() - 0.5) * 4.2;
  const stemCurve = (rng() - 0.5) * 2.8;
  const stemXAt = (t: number) => {
    const u = 1 - t;
    return 40 * u * u + (40 + stemCurve) * 2 * u * t + (40 + stemSway) * t * t;
  };
  const stemYAt = (t: number) => ATTACH_Y - t * 68;

  const drawLanceBlade = (
    bx: number,
    by: number,
    angle: number,
    length: number,
    halfW: number,
    curve: number,
    shadeFactor: number,
  ) => {
    context.save();
    context.translate(bx, by);
    context.rotate(angle);

    // Fine short petiole tucking the blade into the shoot
    context.beginPath();
    context.moveTo(0, 1.2);
    context.lineTo(0, -1.5);
    context.strokeStyle = rgba(shade(color, 0.58 * shadeFactor, 0.78));
    context.lineWidth = 0.65;
    context.stroke();

    // Full linear-lanceolate blade path with long acuminate willow drip-tip
    context.beginPath();
    context.moveTo(0, 0);
    context.bezierCurveTo(
      halfW * 0.92, -length * 0.14,
      halfW * 1.08 + curve * 0.32, -length * 0.40,
      curve, -length,
    );
    context.bezierCurveTo(
      -halfW * 0.98 + curve * 0.44, -length * 0.44,
      -halfW * 0.86, -length * 0.14,
      0, 0,
    );
    context.closePath();

    // Base lamina gradient along the blade length
    const fill = context.createLinearGradient(0, 0, curve, -length);
    fill.addColorStop(0, rgba(shade(color, 0.80 * shadeFactor, 0.96)));
    fill.addColorStop(0.38, rgba(shade(color, 1.02 * shadeFactor, 0.98)));
    fill.addColorStop(0.78, rgba(shade(color, 1.14 * shadeFactor, 0.96)));
    fill.addColorStop(1, rgba(shade(color, 1.22 * shadeFactor, 0.90)));
    context.fillStyle = fill;
    context.fill();

    // Sunward half-lamina sheen (gives 3D facet relief across the midrib)
    if (halfW > 1.8) {
      context.beginPath();
      context.moveTo(0, -1);
      context.bezierCurveTo(
        halfW * 0.90, -length * 0.14,
        halfW * 1.04 + curve * 0.32, -length * 0.40,
        curve, -length,
      );
      context.quadraticCurveTo(curve * 0.48, -length * 0.48, 0, -1);
      context.closePath();
      context.fillStyle = rgba(shade(color, 1.18 * shadeFactor, 0.34));
      context.fill();
    }

    context.strokeStyle = rgba(shade(color, 0.50 * shadeFactor, 0.46));
    context.lineWidth = 0.45;
    context.stroke();

    // Crisp pale midrib vein
    context.beginPath();
    context.moveTo(0, -1);
    context.quadraticCurveTo(curve * 0.48, -length * 0.48, curve * 0.94, -length + 1.8);
    context.strokeStyle = rgba(shade(color, 1.28 * shadeFactor, 0.62));
    context.lineWidth = 0.52;
    context.stroke();
    context.restore();
  };

  // 1. Rear self-shadowed blades tucked behind the shoot for volumetric strand depth
  const backSlots: readonly [number, number][] = [
    [0.10, -1],
    [0.29, 1],
    [0.50, -1],
    [0.71, 1],
    [0.88, -1],
  ];
  for (const [baseT, side] of backSlots) {
    const t = Math.max(0.04, Math.min(0.94, baseT + (rng() - 0.5) * 0.06));
    const bx = stemXAt(t);
    const by = stemYAt(t);
    const angle = side * (0.09 + rng() * 0.14) + (rng() - 0.5) * 0.04;
    const len = 30 + (1 - t * 0.35) * 8 + (rng() - 0.5) * 5;
    const hw = 1.6 + rng() * 1.1; // Foreshortened / edge-turned rear blades
    const curve = side * (0.8 + rng() * 1.6);
    drawLanceBlade(bx, by, angle, len, hw, curve, 0.76);
  }

  // 2. Slender, flexible olive-tan weeping shoot axis
  context.beginPath();
  context.moveTo(40, ATTACH_Y);
  context.quadraticCurveTo(40 + stemCurve, 50, 40 + stemSway, 15);
  context.strokeStyle = rgba(shade(color, 0.54, 0.82));
  context.lineWidth = 1.25;
  context.lineCap = "round";
  context.stroke();

  context.beginPath();
  context.moveTo(39.6, ATTACH_Y);
  context.quadraticCurveTo(39.6 + stemCurve, 50, 39.6 + stemSway, 15);
  context.strokeStyle = rgba(shade(color, 1.08, 0.45));
  context.lineWidth = 0.55;
  context.stroke();

  // 3. Front alternating linear-lanceolate blades with varied 3D roll (edge-on to flat-on)
  const frontSlots: readonly [number, number][] = [
    [0.05, 1],
    [0.18, -1],
    [0.33, 1],
    [0.46, -1],
    [0.60, 1],
    [0.74, -1],
    [0.86, 1],
  ];
  for (const [baseT, side] of frontSlots) {
    const t = Math.max(0.02, Math.min(0.95, baseT + (rng() - 0.5) * 0.05));
    const bx = stemXAt(t);
    const by = stemYAt(t);
    const angle = side * (0.12 + rng() * 0.15) + (rng() - 0.5) * 0.04;
    const len = 32 + (1 - t * 0.32) * 9 + (rng() - 0.5) * 5;
    // Mix flat-on sunlit blades (hw ~ 3.1) with obliquely rolled blades (hw ~ 1.8)
    const hw = 1.75 + rng() * 1.45;
    const curve = side * (1.0 + rng() * 1.7);
    drawLanceBlade(bx, by, angle, len, hw, curve, 0.96 + rng() * 0.12);
  }

  // 4. Terminal acuminate tip blade extending the strand cleanly
  drawLanceBlade(
    stemXAt(0.96),
    stemYAt(0.96),
    (rng() - 0.5) * 0.06,
    24 + rng() * 4,
    2.2 + rng() * 0.6,
    (rng() - 0.5) * 1.4,
    1.06,
  );
}

function drawFan(context: CanvasRenderingContext2D, color: Rgb, rng: Random): void {
  const paint = makePaint(color);
  const notchDepth = 36 + (rng() - 0.5) * 4;
  const waveL = (rng() - 0.5) * 2.4;
  const waveR = (rng() - 0.5) * 2.4;
  context.beginPath();
  // Narrow cuneate (wedge) base right above attachment (40, 74) so blades don't orbit like flower petals
  context.moveTo(40, 74);
  // Straight/slightly concave left wedge side flaring wide to the upper-left fan corner
  context.quadraticCurveTo(22, 54, 2.5, 27);
  // Broad undulating upper-left fan lobe
  context.quadraticCurveTo(1.5, 17, 11, 11 + waveL);
  context.quadraticCurveTo(19, 6, 28, 8 - waveL);
  context.quadraticCurveTo(33.5, 8.5, 36, 15);
  // Distinct central bilobed V-cleft ("bi-loba")
  context.lineTo(40, notchDepth);
  context.lineTo(44, 15);
  // Broad undulating upper-right fan lobe
  context.quadraticCurveTo(46.5, 8.5, 52, 8 - waveR);
  context.quadraticCurveTo(61, 6, 69, 11 + waveR);
  context.quadraticCurveTo(78.5, 17, 77.5, 27);
  // Straight/slightly concave right wedge side back to cuneate base
  context.quadraticCurveTo(58, 54, 40, 74);
  context.closePath();

  // Flat sunlit golden-yellow lamina (avoid dark base that makes clusters look like flower throats)
  const fanGrad = context.createLinearGradient(22, 8, 58, 74);
  fanGrad.addColorStop(0, rgba(shade(color, 1.15)));
  fanGrad.addColorStop(0.58, rgba(color));
  fanGrad.addColorStop(1, rgba(shade(color, 0.86)));
  context.fillStyle = fanGrad;
  context.fill();
  context.strokeStyle = rgba(shade(color, 0.52, 0.82));
  context.lineWidth = 0.85;
  context.lineJoin = "round";
  context.stroke();

  context.save();
  context.clip();
  context.strokeStyle = rgba(shade(color, 0.64, 0.68));
  context.lineWidth = 0.58;
  // Dichotomous radiating veins fanning into left and right lobes without crossing the central cleft
  for (let i = -9; i <= 9; i++) {
    if (i === 0) continue;
    const endX = 40 + i * 4.0;
    const endY = 10 + Math.abs(i) * 1.6;
    context.beginPath();
    context.moveTo(40, 73);
    context.quadraticCurveTo(40 + i * 2.0, 48, endX, endY);
    context.stroke();
  }
  context.restore();
  drawPetiole(context, paint, 40, 74);
}

function drawPlaneLeaf(context: CanvasRenderingContext2D, color: Rgb, rng: Random): void {
  const paint = makePaint(color);
  const jitter = (rng() - 0.5) * 2;
  context.beginPath();
  context.moveTo(40, 8);
  context.bezierCurveTo(45, 17, 53, 19, 57, 25);
  context.quadraticCurveTo(64, 20 + jitter, 69, 26);
  context.quadraticCurveTo(72, 35, 60, 43);
  context.quadraticCurveTo(72, 47, 68, 55);
  context.quadraticCurveTo(62, 65, 52, 63);
  context.quadraticCurveTo(47, 71, 40, 64);
  context.quadraticCurveTo(33, 71, 28, 63);
  context.quadraticCurveTo(18, 65, 12, 55);
  context.quadraticCurveTo(8, 47, 20, 43);
  context.quadraticCurveTo(8, 35, 11, 26 - jitter);
  context.quadraticCurveTo(16, 20, 23, 25);
  context.bezierCurveTo(27, 19, 35, 17, 40, 8);
  context.closePath();
  finishLeafPath(context, color, rng);

  context.save();
  context.strokeStyle = paint.vein;
  context.lineWidth = 0.72;
  context.lineCap = "round";
  const tips: Array<[number, number]> = [[40, 9], [12, 24], [68, 24], [11, 50], [69, 50]];
  for (const [tipX, tipY] of tips) {
    context.beginPath();
    context.moveTo(40, 65);
    context.quadraticCurveTo(40 + (tipX - 40) * 0.5, 50 + (tipY - 50) * 0.25, tipX, tipY);
    context.stroke();
    for (const side of [-1, 1]) {
      context.beginPath();
      context.moveTo(40 + (tipX - 40) * 0.46, 65 + (tipY - 65) * 0.46);
      context.lineTo(40 + (tipX - 40) * 0.58 + side * 4, 65 + (tipY - 65) * 0.58 - 3);
      context.stroke();
    }
  }
  context.restore();
  drawPetiole(context, paint, 40, 66);
}

function drawStarLeaf(context: CanvasRenderingContext2D, color: Rgb, rng: Random): void {
  const cx = 40 + (rng() - 0.5) * 1.8;
  const cy = 40 + (rng() - 0.5) * 1.8;
  const outer = [31, 26, 29, 24, 28];
  context.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 === 0 ? outer[i / 2] : 11 + rng() * 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) context.moveTo(x, y);
    else context.quadraticCurveTo(cx + Math.cos(angle - 0.18) * (radius + 2), cy + Math.sin(angle - 0.18) * (radius + 2), x, y);
  }
  context.closePath();
  finishLeafPath(context, color, rng);
  const paint = makePaint(color);
  context.strokeStyle = paint.vein;
  context.lineWidth = 0.62;
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / 5;
    context.beginPath();
    context.moveTo(40, 44);
    context.lineTo(cx + Math.cos(angle) * outer[i], cy + Math.sin(angle) * outer[i]);
    context.stroke();
  }
  drawPetiole(context, paint, 40, 67);
}

function drawSimpleBlade(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  length: number,
  halfWidth: number,
  color: Rgb,
  curve = 0,
  veins = true,
): void {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.beginPath();
  context.moveTo(0, 0);
  context.bezierCurveTo(halfWidth * 0.5, -length * 0.2, halfWidth, -length * 0.56, curve, -length);
  context.bezierCurveTo(-halfWidth * 0.56, -length * 0.78, -halfWidth * 0.8, -length * 0.28, 0, 0);
  context.closePath();
  context.fillStyle = gradient(context, color, -length, 0);
  context.fill();
  context.strokeStyle = rgba(shade(color, 0.48, 0.75));
  context.lineWidth = Math.max(0.35, Math.min(0.8, halfWidth * 0.24));
  context.stroke();
  if (veins && halfWidth > 1.4) {
    context.beginPath();
    context.moveTo(0, -1);
    context.quadraticCurveTo(curve * 0.5, -length * 0.48, curve, -length + 1);
    context.strokeStyle = rgba(shade(color, 0.52, 0.8));
    context.lineWidth = Math.max(0.35, halfWidth * 0.16);
    context.stroke();
    if (halfWidth > 4) {
      context.strokeStyle = rgba(shade(color, 0.55, 0.62));
      context.lineWidth = 0.42;
      for (let i = 1; i < 4; i++) {
        const t = i / 4;
        const yy = -length * t;
        for (const side of [-1, 1]) {
          context.beginPath();
          context.moveTo(curve * t, yy);
          context.lineTo(curve * t + side * halfWidth * 0.6, yy - 2.2);
          context.stroke();
        }
      }
    }
  }
  context.restore();
}

function drawJacarandaLeaf(context: CanvasRenderingContext2D, color: Rgb, rng: Random): void {
  const curve = (rng() - 0.5) * 3.2;

  // Soft ambient shadow beneath the bipinnate fern frond for sub-canopy depth
  context.save();
  context.fillStyle = rgba(shade(color, 0.36, 0.16));
  context.beginPath();
  context.ellipse(40 + curve * 0.4, 42, 22, 29, curve * 0.02, 0, Math.PI * 2);
  context.fill();
  context.restore();

  // Slender tapering olive-green primary rachis
  context.save();
  context.strokeStyle = rgba(shade(color, 0.52, 0.92));
  context.lineCap = "round";
  context.lineWidth = 1.25;
  context.beginPath();
  context.moveTo(ATTACH_X, ATTACH_Y);
  context.quadraticCurveTo(40 + curve * 0.55, 44, 40 + curve, 10);
  context.stroke();

  const pinnaePairs = 12;
  for (let p = 0; p < pinnaePairs; p++) {
    const t = (p + 0.45) / (pinnaePairs + 0.25);
    const rachisY = 70 - t * 57;
    const rachisX = 40 + curve * (t * (2 - t));
    // Diamond-oval bipinnate frond envelope: shorter at base & apex, wide across mid-frond
    const envelope = Math.sin(Math.pow(t, 0.86) * Math.PI);
    const span = 5.5 + envelope * 21.5;
    const leafletsPerSide = Math.max(5, Math.round(5 + envelope * 6));

    for (const side of [-1, 1] as const) {
      const pinnaDroop = (t - 0.45) * 2.4 + (rng() - 0.5) * 1.1;
      const ctrlX = rachisX + side * span * 0.54;
      const ctrlY = rachisY - 2.6 + pinnaDroop * 0.4;
      const tipX = rachisX + side * span;
      const tipY = rachisY - 3.8 + pinnaDroop;

      // Secondary pinna rachilla
      context.beginPath();
      context.moveTo(rachisX, rachisY);
      context.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
      context.strokeStyle = rgba(shade(color, 0.58, 0.84));
      context.lineWidth = 0.52;
      context.stroke();

      const pinnaAngle = Math.atan2(tipY - rachisY, tipX - rachisX);
      for (let l = 0; l < leafletsPerSide; l++) {
        const u = (l + 0.55) / (leafletsPerSide + 0.35);
        const omt = 1 - u;
        const lx = omt * omt * rachisX + 2 * omt * u * ctrlX + u * u * tipX;
        const ly = omt * omt * rachisY + 2 * omt * u * ctrlY + u * u * tipY;
        const leafletScale = Math.sin(Math.pow(u, 0.78) * Math.PI * 0.92);
        const leafletLen = (2.8 + envelope * 1.9) * (0.68 + leafletScale * 0.42);
        const leafletWid = 0.92 + envelope * 0.42;

        // Opposite pair of tiny oblong-mucronate leaflets along each pinna
        for (const vSide of [-1, 1] as const) {
          const forwardTilt = pinnaAngle + vSide * (1.02 - u * 0.18) + (rng() - 0.5) * 0.08;
          context.save();
          context.translate(lx, ly);
          context.rotate(forwardTilt);
          context.beginPath();
          context.moveTo(0, 0);
          context.bezierCurveTo(leafletLen * 0.28, -leafletWid, leafletLen * 0.78, -leafletWid * 0.85, leafletLen, 0);
          context.bezierCurveTo(leafletLen * 0.78, leafletWid * 0.85, leafletLen * 0.28, leafletWid, 0, 0);
          context.closePath();
          const sunlit = vSide < 0 ? 1.10 + (1 - t) * 0.08 : 0.86 + (1 - t) * 0.06;
          context.fillStyle = rgba(shade(color, sunlit, 0.96));
          context.fill();
          context.restore();
        }
      }

      // Terminal mucronate leaflet at the tip of the pinna
      context.save();
      context.translate(tipX, tipY);
      context.rotate(pinnaAngle);
      context.beginPath();
      context.ellipse(1.6, 0, 1.9, 0.82, 0, 0, Math.PI * 2);
      context.fillStyle = rgba(shade(color, 1.14, 0.95));
      context.fill();
      context.restore();
    }
  }
  context.restore();
}

function drawCompound(
  context: CanvasRenderingContext2D,
  color: Rgb,
  rng: Random,
  kind: "ash" | "baobab" | "bipinnate",
): void {
  const paint = makePaint(color);
  if (kind === "baobab") {
    context.beginPath();
    context.moveTo(40, ATTACH_Y);
    context.quadraticCurveTo(40, 78, 40, 70);
    context.strokeStyle = paint.outline;
    context.lineWidth = 1.5;
    context.stroke();
    const count = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const angle = -1.38 + i * 2.76 / (count - 1);
      const length = 39 + rng() * 9;
      drawSimpleBlade(context, 40, 70, angle, length, 8.5 + rng() * 2.2, color, (rng() - 0.5) * 2.2);
    }
    context.beginPath();
    context.moveTo(40, 83);
    context.lineTo(40, 69);
    context.strokeStyle = paint.outline;
    context.lineWidth = 1.1;
    context.stroke();
    return;
  }

  context.beginPath();
  context.moveTo(ATTACH_X, ATTACH_Y);
  context.quadraticCurveTo(42, 50, 40 + (rng() - 0.5) * 3, 14);
  context.strokeStyle = paint.outline;
  context.lineWidth = kind === "ash" ? 1.35 : 1.15;
  context.stroke();

  if (kind === "ash") {
    const pairs = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < pairs; i++) {
      const t = (i + 0.65) / (pairs + 0.55);
      const y = 70 - t * 48;
      const length = 17 + Math.sin((i + 1) / (pairs + 1) * Math.PI) * 8 + rng() * 2;
      for (const side of [-1, 1]) {
        const startX = 40 + (rng() - 0.5) * 1.5;
        drawSimpleBlade(context, startX, y, side * (0.9 + rng() * 0.45), length, 5.2 + rng(), color, (rng() - 0.5) * 2);
      }
    }
    drawSimpleBlade(context, 40, 74, (rng() - 0.5) * 0.18, 54, 5.3, color, (rng() - 0.5) * 1.2);
    return;
  }

  const pinnae = kind === "bipinnate" ? 9 : 8;
  const leafletsPerSide = kind === "bipinnate" ? 5 : 4;
  for (let p = 0; p < pinnae; p++) {
    const t = (p + 0.6) / (pinnae + 0.1);
    const y = 72 - t * 51;
    const span = (7 + Math.sin(t * Math.PI) * 13) * (kind === "bipinnate" ? 1 : 0.9);
    for (const side of [-1, 1]) {
      const tipX = 40 + side * span;
      const tipY = y - 4.2 + rng() * 2;
      context.beginPath();
      context.moveTo(40, y);
      context.quadraticCurveTo(40 + side * span * 0.55, y - 2, tipX, tipY);
      context.strokeStyle = paint.outline;
      context.lineWidth = 0.52;
      context.stroke();
      for (let leaf = 0; leaf < leafletsPerSide; leaf++) {
        const leafT = (leaf + 0.8) / (leafletsPerSide + 0.3);
        const bx = 40 + side * span * leafT;
        const by = y - leafT * 4;
        const length = kind === "bipinnate" ? 4.5 + rng() * 1.4 : 5.4 + rng() * 1.6;
        drawSimpleBlade(context, bx, by, side * (1.05 + rng() * 0.26), length, kind === "bipinnate" ? 1.65 : 2.0, color, (rng() - 0.5) * 0.7, false);
      }
    }
  }
}

function drawPalmLeaflet(context: CanvasRenderingContext2D, color: Rgb, rng: Random): void {
  const angle = (rng() - 0.5) * 0.54;
  const length = 57 + rng() * 8;
  const width = 2.5 + rng() * 1.3;
  drawSimpleBlade(context, ATTACH_X, ATTACH_Y, angle, length, width, color, (rng() - 0.5) * 5, true);
}

function drawConifer(
  context: CanvasRenderingContext2D,
  color: Rgb,
  rng: Random,
  kind: "scots-pine" | "spruce" | "blue-spruce" | "cedar" | "redwood" | "cypress",
): void {
  const paint = makePaint(color);
  const bend = (rng() - 0.5) * 3;
  context.beginPath();
  context.moveTo(40, ATTACH_Y);
  context.quadraticCurveTo(41 + bend, 46, 40 + bend, 14);
  context.strokeStyle = paint.outline;
  context.lineWidth = kind === "cypress" ? 1.25 : 1.05;
  context.stroke();

  if (kind === "cypress") {
    for (let branch = 0; branch < 5; branch++) {
      const t = (branch + 0.8) / 6;
      const y = 71 - t * 48;
      for (const side of [-1, 1]) {
        const reach = 10 + Math.sin(t * Math.PI) * 8 + rng() * 2;
        context.beginPath();
        context.moveTo(40 + bend * t, y);
        context.quadraticCurveTo(40 + side * reach * 0.55, y - 4, 40 + side * reach, y - 9);
        context.strokeStyle = paint.outline;
        context.lineWidth = 0.75;
        context.stroke();
        for (let scale = 0; scale < 5; scale++) {
          const s = scale / 5;
          const sx = 40 + side * reach * s;
          const sy = y - 1 - s * 7;
          drawSimpleBlade(context, sx, sy, side * (0.55 + rng() * 0.32), 4.4 + rng() * 1.7, 1.8, color, 0.3, false);
        }
      }
    }
    return;
  }

  if (kind === "redwood") {
    for (let i = 0; i < 11; i++) {
      const y = 70 - i * 4.6;
      const side = i % 2 === 0 ? 1 : -1;
      const angle = side * (1.22 + rng() * 0.28);
      drawSimpleBlade(context, 40 + bend * (1 - i / 11), y, angle, 13 + rng() * 5, 2.4 + rng() * 0.5, color, (rng() - 0.5) * 1.8, true);
    }
    return;
  }

  if (kind === "cedar") {
    for (let node = 0; node < 7; node++) {
      const y = 71 - node * 7.2;
      const count = 5 + Math.floor(rng() * 4);
      for (let needle = 0; needle < count; needle++) {
        const angle = needle / count * Math.PI * 2 + rng() * 0.28;
        drawSimpleBlade(context, 40 + bend * (1 - node / 8), y, angle, 6 + rng() * 4, 1.05, color, (rng() - 0.5) * 1.2, false);
      }
    }
    return;
  }

  const nodes = kind === "scots-pine" ? 6 : 8;
  for (let node = 0; node < nodes; node++) {
    const t = (node + 0.6) / (nodes + 0.2);
    const y = 72 - t * 54;
    const x = 40 + bend * t;
    if (kind === "scots-pine") {
      for (const side of [-1, 1]) {
        const length = 18 + rng() * 9;
        drawSimpleBlade(context, x, y, side * (0.7 + rng() * 0.38), length, 1.35, color, (rng() - 0.5) * 2, false);
        drawSimpleBlade(context, x + 0.6, y + 0.8, side * (0.76 + rng() * 0.38), length * (0.85 + rng() * 0.16), 1.2, color, (rng() - 0.5) * 2, false);
      }
    } else {
      const count = kind === "blue-spruce" ? 7 : 5;
      for (let needle = 0; needle < count; needle++) {
        const angle = needle / count * Math.PI * 2 + t * 2.1 + rng() * 0.22;
        const length = kind === "blue-spruce" ? 10 + rng() * 5 : 12 + rng() * 5;
        drawSimpleBlade(context, x, y, angle, length, kind === "blue-spruce" ? 1.65 : 1.2, color, (rng() - 0.5) * 1.6, false);
      }
    }
  }
}

function drawLeaf(
  context: CanvasRenderingContext2D,
  profile: SpeciesProfile,
  color: Rgb,
  rng: Random,
): void {
  switch (profile.id) {
    case "maple":
      drawMaple(context, color, rng);
      break;
    case "oak":
      drawLobedLeaf(context, color, rng, 6);
      break;
    case "plane":
      drawPlaneLeaf(context, color, rng);
      break;
    case "beech":
      drawOvateLeaf(context, color, rng, { width: 48, teeth: 0.035, curve: 0.8, veinCount: 8 });
      break;
    case "birch":
      drawBirchLeaf(context, color, rng);
      break;
    case "aspen":
      drawOvateLeaf(context, color, rng, { width: 57, teeth: 0.045, curve: 1, veinCount: 8 });
      break;
    case "poplar":
      drawPoplarLeaf(context, color, rng);
      break;
    case "willow":
      drawWillowLeaf(context, color, rng);
      break;
    case "ash":
    case "golden-rain":
      drawCompound(context, color, rng, "ash");
      break;
    case "acacia":
      drawCompound(context, color, rng, "bipinnate");
      break;
    case "baobab":
      drawCompound(context, color, rng, "baobab");
      break;
    case "jacaranda":
      drawJacarandaLeaf(context, color, rng);
      break;
    case "ginkgo":
      drawFan(context, color, rng);
      break;
    case "sweetgum":
      drawStarLeaf(context, color, rng);
      break;
    case "eucalyptus":
      drawOvateLeaf(context, color, rng, { width: 27, teeth: 0, curve: -4, veinCount: 6 });
      break;
    case "banyan":
      drawOvateLeaf(context, color, rng, { width: 55, teeth: 0.015, curve: -1.5, veinCount: 8 });
      break;
    case "magnolia":
      drawOvateLeaf(context, color, rng, { width: 56, teeth: 0, curve: 0.5, veinCount: 9 });
      break;
    case "dogwood":
      drawOvateLeaf(context, color, rng, { width: 46, teeth: 0, curve: -1, arcuateVeins: true });
      break;
    case "poinciana":
      drawCompound(context, color, rng, "bipinnate");
      break;
    case "coconut":
    case "date-palm":
      drawPalmLeaflet(context, color, rng);
      break;
    case "scots-pine":
      drawConifer(context, color, rng, "scots-pine");
      break;
    case "norway-spruce":
      drawConifer(context, color, rng, "spruce");
      break;
    case "blue-spruce":
      drawConifer(context, color, rng, "blue-spruce");
      break;
    case "cedar":
      drawConifer(context, color, rng, "cedar");
      break;
    case "redwood":
      drawConifer(context, color, rng, "redwood");
      break;
    case "cypress":
      drawConifer(context, color, rng, "cypress");
      break;
    case "elm":
      drawOvateLeaf(context, color, rng, { width: 49, teeth: 0.075, curve: -2, veinCount: 10 });
      break;
    default:
      drawOvateLeaf(context, color, rng, { width: profile.leafForm === "lance" ? 25 : 48, teeth: 0.025 });
  }
}

function flowerPoint(index: number, count: number, rng: Random): [number, number] {
  const angle = index * 2.399963 + rng() * 0.34;
  const radius = 5 + Math.sqrt((index + 0.6) / count) * 23;
  return [
    40 + Math.cos(angle) * radius + (rng() - 0.5) * 3,
    43 + Math.sin(angle) * radius * 0.82 + (rng() - 0.5) * 3,
  ];
}

function drawFlowerStems(
  context: CanvasRenderingContext2D,
  points: readonly [number, number][],
  paint: LeafPaint,
): void {
  context.save();
  context.strokeStyle = paint.outline;
  context.lineWidth = 0.8;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(40, ATTACH_Y);
  context.quadraticCurveTo(37, 51, 40, 19);
  context.stroke();
  for (const [x, y] of points) {
    context.beginPath();
    context.moveTo(40, 56);
    context.quadraticCurveTo(40 + (x - 40) * 0.36, y + 7, x, y + 2);
    context.stroke();
  }
  context.restore();
}

function drawTerminalFlowerStem(context: CanvasRenderingContext2D, color: Rgb): void {
  context.beginPath();
  context.moveTo(ATTACH_X, ATTACH_Y);
  context.quadraticCurveTo(41.5, 68, 40, 48);
  context.strokeStyle = rgba(shade(color, 0.44, 0.95));
  context.lineWidth = 1.45;
  context.lineCap = "round";
  context.stroke();
}

function drawPetal(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  length: number,
  width: number,
  color: Rgb,
): void {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.beginPath();
  context.moveTo(0, 0);
  context.bezierCurveTo(-width * 0.85, -length * 0.22, -width * 0.68, -length * 0.88, 0, -length);
  context.bezierCurveTo(width * 0.68, -length * 0.88, width * 0.85, -length * 0.22, 0, 0);
  context.closePath();
  context.fillStyle = gradient(context, color, -length, 0);
  context.fill();
  context.strokeStyle = rgba(shade(color, 0.66, 0.46));
  context.lineWidth = 0.48;
  context.stroke();
  context.restore();
}

function drawTrumpet(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: Rgb,
  scale = 1,
  isBud = false,
): void {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.scale(scale, scale);

  // Small dark violet-olive calyx cup at the pedicel base
  context.beginPath();
  context.moveTo(-1.2, 7.6);
  context.lineTo(-1.8, 5.4);
  context.lineTo(0, 6.0);
  context.lineTo(1.8, 5.4);
  context.lineTo(1.2, 7.6);
  context.closePath();
  context.fillStyle = rgba(shade(color, 0.42, 0.92));
  context.fill();

  if (isBud) {
    // Unopened curved club-shaped violet-indigo flower bud at panicle tips
    const budGrad = context.createLinearGradient(0, 6, 0.8, -6.5);
    budGrad.addColorStop(0, rgba(shade(color, 0.56, 0.96)));
    budGrad.addColorStop(0.55, rgba(shade(color, 0.84, 0.98)));
    budGrad.addColorStop(1, rgba(shade(color, 1.08, 0.98)));
    context.beginPath();
    context.moveTo(-1.1, 6.2);
    context.bezierCurveTo(-1.5, 2.5, -3.0, -1.8, -2.1, -5.2);
    context.quadraticCurveTo(0.2, -7.4, 2.4, -4.8);
    context.bezierCurveTo(3.1, -1.5, 1.4, 2.6, 1.0, 6.2);
    context.closePath();
    context.fillStyle = budGrad;
    context.fill();
    context.restore();
    return;
  }

  // Curved tubular-campanulate Jacaranda corolla tube: slender dark-violet base curving & inflating into bell throat
  const tubeGrad = context.createLinearGradient(-1, 6.8, 1.2, -8.5);
  tubeGrad.addColorStop(0, rgba(shade(color, 0.56, 0.96)));
  tubeGrad.addColorStop(0.36, rgba(shade(color, 0.82, 0.97)));
  tubeGrad.addColorStop(0.74, rgba(shade(color, 1.04, 0.98)));
  tubeGrad.addColorStop(1, rgba(shade(color, 1.18, 0.98)));

  context.beginPath();
  context.moveTo(-1.15, 6.2);
  // Concave dorsal side of curved trumpet tube
  context.bezierCurveTo(-1.8, 2.8, -4.2, -0.8, -4.8, -5.2);
  context.quadraticCurveTo(-5.0, -7.8, 0.4, -8.0);
  context.quadraticCurveTo(5.4, -7.6, 4.9, -4.6);
  // Ventricose (inflated) ventral belly of the Jacaranda trumpet
  context.bezierCurveTo(4.2, -0.4, 2.0, 3.0, 1.15, 6.2);
  context.closePath();
  context.fillStyle = tubeGrad;
  context.fill();
  context.strokeStyle = rgba(shade(color, 0.58, 0.30));
  context.lineWidth = 0.34;
  context.stroke();

  // Pale whitish-lilac ventral throat streak characteristic of Jacaranda mimosifolia
  const throatGlow = context.createLinearGradient(0.3, 3.2, 0.3, -6.2);
  throatGlow.addColorStop(0, "rgba(245, 240, 255, 0.10)");
  throatGlow.addColorStop(0.55, "rgba(246, 242, 255, 0.58)");
  throatGlow.addColorStop(1, "rgba(250, 248, 255, 0.25)");
  context.beginPath();
  context.moveTo(-0.3, 3.2);
  context.bezierCurveTo(-1.3, 0.2, -2.0, -3.2, -1.6, -6.0);
  context.quadraticCurveTo(0.3, -6.6, 2.1, -5.8);
  context.bezierCurveTo(2.3, -3.0, 1.4, 0.4, 0.5, 3.2);
  context.closePath();
  context.fillStyle = throatGlow;
  context.fill();

  // 5-lobed bilabiate flaring corolla limb (2 upper lobes + 3 spreading lower lobes)
  const lobeSpecs: readonly [number, number, number, number, number, number][] = [
    [-3.8, -6.4, 2.9, 2.0, -0.52, 1.12], // outer left lobe
    [ 4.1, -6.1, 2.9, 2.0,  0.52, 1.10], // outer right lobe
    [-1.8, -8.3, 2.7, 2.1, -0.22, 1.20], // upper-left lobe
    [ 2.1, -8.2, 2.7, 2.1,  0.22, 1.18], // upper-right lobe
    [ 0.2, -8.9, 3.1, 2.25, 0.02, 1.25], // broad central lower-lip lobe
  ];
  for (const [lx, ly, rx, ry, rot, bright] of lobeSpecs) {
    context.beginPath();
    context.ellipse(lx, ly, rx, ry, rot, 0, Math.PI * 2);
    context.fillStyle = rgba(shade(color, bright, 0.95));
    context.fill();
    context.strokeStyle = rgba(shade(color, 0.72, 0.22));
    context.lineWidth = 0.28;
    context.stroke();
  }

  // Subtle shaded corolla mouth opening + pale throat center
  context.beginPath();
  context.ellipse(0.2, -6.3, 2.1, 1.15, 0.04, 0, Math.PI * 2);
  context.fillStyle = rgba(shade(color, 0.48, 0.62));
  context.fill();
  context.beginPath();
  context.ellipse(0.3, -5.8, 1.15, 0.62, 0.04, 0, Math.PI * 2);
  context.fillStyle = "rgba(248, 244, 255, 0.68)";
  context.fill();

  context.restore();
}

function drawCherryBlossom(context: CanvasRenderingContext2D, x: number, y: number, size: number, color: Rgb, rng: Random): void {
  for (let petal = 0; petal < 5; petal++) {
    const angle = petal * Math.PI * 2 / 5 + rng() * 0.16;
    drawPetal(context, x + Math.cos(angle) * size * 0.14, y + Math.sin(angle) * size * 0.14, angle, size * 0.72, size * 0.29, shade(color, 0.98 + rng() * 0.1));
  }
  context.beginPath();
  context.arc(x, y, Math.max(1, size * 0.16), 0, Math.PI * 2);
  context.fillStyle = "#b88743";
  context.fill();
  context.strokeStyle = "rgba(147, 112, 52, 0.72)";
  context.lineWidth = 0.45;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.3;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(a) * size * 0.42, y + Math.sin(a) * size * 0.42);
    context.stroke();
  }
}

function drawGoldenRainFlower(context: CanvasRenderingContext2D, x: number, y: number, size: number, color: Rgb, rng: Random): void {
  for (let petal = 0; petal < 5; petal++) {
    const angle = petal * Math.PI * 2 / 5 + rng() * 0.14;
    context.beginPath();
    context.ellipse(
      x + Math.cos(angle) * size * 0.32,
      y + Math.sin(angle) * size * 0.32,
      size * 0.38,
      size * 0.24,
      angle,
      0,
      Math.PI * 2,
    );
    context.fillStyle = rgba(shade(color, 1 + rng() * 0.16));
    context.fill();
  }
  context.beginPath();
  context.arc(x, y, size * 0.18, 0, Math.PI * 2);
  context.fillStyle = "#a36b22";
  context.fill();
}

function drawPoincianaFlower(context: CanvasRenderingContext2D, x: number, y: number, size: number, color: Rgb, rng: Random): void {
  for (let petal = 0; petal < 5; petal++) {
    const angle = petal * Math.PI * 2 / 5 + rng() * 0.19;
    drawPetal(context, x, y, angle, size * (0.78 + rng() * 0.23), size * 0.42, shade(color, 0.92 + rng() * 0.19));
  }
  context.beginPath();
  context.arc(x, y, 1.5, 0, Math.PI * 2);
  context.fillStyle = "#70421f";
  context.fill();
  context.strokeStyle = rgba(shade(color, 0.73, 0.95));
  context.lineWidth = 0.62;
  for (let filament = 0; filament < 6; filament++) {
    const angle = -Math.PI * 0.88 + filament * Math.PI * 0.19 + rng() * 0.1;
    const length = size * (1.45 + rng() * 0.8);
    context.beginPath();
    context.moveTo(x, y - 1);
    context.quadraticCurveTo(x + Math.cos(angle) * length * 0.6, y + Math.sin(angle) * length * 0.5, x + Math.cos(angle) * length, y + Math.sin(angle) * length - 2);
    context.stroke();
    context.beginPath();
    context.arc(x + Math.cos(angle) * length, y + Math.sin(angle) * length - 2, 0.8, 0, Math.PI * 2);
    context.fillStyle = "#efc576";
    context.fill();
  }
}

function drawMagnoliaFlower(context: CanvasRenderingContext2D, x: number, y: number, size: number, color: Rgb, rng: Random): void {
  const tepals = 6 + Math.floor(rng() * 7);
  for (let tepal = 0; tepal < tepals; tepal++) {
    const angle = tepal * Math.PI * 2 / tepals + rng() * 0.12;
    drawPetal(context, x, y, angle, size * (0.84 + rng() * 0.22), size * 0.31, shade(color, 0.96 + rng() * 0.1));
  }
  context.beginPath();
  context.ellipse(x, y, size * 0.18, size * 0.2, 0, 0, Math.PI * 2);
  context.fillStyle = "#b38a4a";
  context.fill();
  for (let stamen = 0; stamen < 5; stamen++) {
    const angle = stamen * Math.PI * 2 / 5;
    context.beginPath();
    context.arc(x + Math.cos(angle) * size * 0.28, y + Math.sin(angle) * size * 0.28, 0.65, 0, Math.PI * 2);
    context.fillStyle = "#8f6031";
    context.fill();
  }
}

function drawDogwoodFlower(context: CanvasRenderingContext2D, x: number, y: number, size: number, color: Rgb, rng: Random): void {
  for (let bract = 0; bract < 4; bract++) {
    const angle = bract * Math.PI / 2 + Math.PI / 4 + rng() * 0.08;
    context.save();
    context.translate(x + Math.cos(angle) * size * 0.2, y + Math.sin(angle) * size * 0.2);
    context.rotate(angle);
    context.beginPath();
    context.moveTo(0, 0);
    context.bezierCurveTo(-size * 0.5, -size * 0.3, -size * 0.55, -size * 0.9, -size * 0.16, -size);
    context.quadraticCurveTo(-size * 0.06, -size * 1.02, 0, -size * 0.9);
    context.quadraticCurveTo(size * 0.06, -size * 1.02, size * 0.16, -size);
    context.bezierCurveTo(size * 0.55, -size * 0.9, size * 0.5, -size * 0.3, 0, 0);
    context.closePath();
    context.fillStyle = gradient(context, shade(color, 0.98 + rng() * 0.08), -size, 0);
    context.fill();
    context.strokeStyle = rgba(shade(color, 0.72, 0.62));
    context.lineWidth = 0.55;
    context.stroke();
    context.restore();
  }
  context.fillStyle = "#b9a15a";
  for (let floret = 0; floret < 7; floret++) {
    const angle = floret * 2.399963;
    const radius = size * (0.06 + (floret % 3) * 0.035);
    context.beginPath();
    context.arc(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, size * 0.07, 0, Math.PI * 2);
    context.fill();
  }
}

function drawFlowers(
  context: CanvasRenderingContext2D,
  profile: SpeciesProfile,
  flowersPerSpray: number,
  color: Rgb,
  rng: Random,
): void {
  const form = profile.flower?.form;
  if (!form) return;
  if (form === "magnolia") {
    drawTerminalFlowerStem(context, color);
    drawMagnoliaFlower(context, 40, 35, 18, color, rng);
    return;
  }
  if (form === "dogwood") {
    drawTerminalFlowerStem(context, color);
    drawDogwoodFlower(context, 40, 36, 17, color, rng);
    return;
  }
  const points: [number, number][] = [];
  if (form === "raceme") {
    const racemeCount = 3;
    for (let raceme = 0; raceme < racemeCount; raceme++) {
      const x = 24 + raceme * 16;
      context.beginPath();
      context.moveTo(40, ATTACH_Y);
      context.quadraticCurveTo(x + (rng() - 0.5) * 5, 49, x, 24);
      context.strokeStyle = rgba(shade(color, 0.48, 0.82));
      context.lineWidth = 0.8;
      context.stroke();
    }
    for (let i = 0; i < flowersPerSpray; i++) {
      const strand = i % racemeCount;
      const rank = Math.floor(i / racemeCount);
      const perStrand = Math.ceil(flowersPerSpray / racemeCount);
      const t = (rank + 1) / (perStrand + 1);
      const x = 24 + strand * 16 + (rng() - 0.5) * 4;
      const y = 27 + t * 43 + (rng() - 0.5) * 3;
      points.push([x, y]);
      context.beginPath();
      context.moveTo(24 + strand * 16, 26 + t * 40);
      context.quadraticCurveTo(x + (rng() - 0.5) * 2, y - 2, x, y);
      context.strokeStyle = rgba(shade(color, 0.58, 0.82));
      context.lineWidth = 0.6;
      context.stroke();
      drawGoldenRainFlower(context, x, y, 3.4 + rng() * 1.2, color, rng);
    }
    return;
  }

  if (form === "trumpet") {
    // Billowy cauliflower-dome Jacaranda blossom cluster composed of 3 overlapping sub-puffs + airy lacy peripheral florets
    const curve = (rng() - 0.5) * 3.0;
    const totalBlossoms = Math.max(20, flowersPerSpray + 8);
    const subLobes: readonly [number, number, number][] = [
      [-12.5, 46, 13.5], // lower-left cloud puff
      [ 12.5, 45, 13.5], // lower-right cloud puff
      [  0.0, 31, 15.5], // upper-center crown puff
    ];
    const blossomNodes: {
      x: number;
      y: number;
      stemX: number;
      stemY: number;
      angle: number;
      scale: number;
      tone: number;
      layer: 0 | 1;
      bud: boolean;
    }[] = [];

    for (let i = 0; i < totalBlossoms; i++) {
      const lobeIdx = i % 3;
      const [lobeX, lobeY, lobeR] = subLobes[lobeIdx];
      const rank = Math.floor(i / 3) / Math.max(1, Math.ceil(totalBlossoms / 3) - 1);
      // Golden-angle spiral within each sub-puff for rounded, non-spiky cauliflower floret distribution
      const theta = i * 2.399963 + (rng() - 0.5) * 0.45;
      const radius = (0.28 + 0.78 * Math.sqrt(rank)) * lobeR;
      const x = 40 + lobeX + Math.cos(theta) * radius * 1.12 + (rng() - 0.5) * 2.4;
      const y = lobeY + Math.sin(theta) * radius * 0.86 + (rng() - 0.5) * 2.4;
      const stemX = 40 + lobeX * 0.45 + curve * (1 - y / 70);
      const stemY = Math.min(67, y + 7);
      // Florets radiate softly outward from the sub-puff center so edges look lacy and billowy
      const dx = x - (40 + lobeX * 0.35);
      const dy = y - (lobeY + 6);
      const outwardAngle = Math.atan2(dx, -dy) * 0.62 + (rng() - 0.5) * 0.32;
      // Top-down 3D cloud illumination: deeper indigo-violet at the lower base (y > 46), luminous lilac at the upper crest (y < 32)
      const heightLight = Math.max(0, Math.min(1, (64 - y) / 46));
      const isRear = y > 47 || (i % 3 === 0 && y > 32);
      const isBud = rank > 0.78 && i >= totalBlossoms - 4;
      blossomNodes.push({
        x,
        y,
        stemX,
        stemY,
        angle: outwardAngle,
        scale: (0.64 + (1 - rank * 0.28) * 0.24) * (isRear ? 0.92 : 0.98),
        tone: isRear
          ? 0.72 + heightLight * 0.18 + (rng() - 0.5) * 0.06
          : 0.92 + heightLight * 0.24 + (rng() - 0.5) * 0.08,
        layer: isRear ? 0 : 1,
        bud: isBud,
      });
    }

    // Sort back-to-front (lower shaded base florets first, sunlit upper dome florets last)
    blossomNodes.sort((a, b) => (a.layer - b.layer) || (b.y - a.y));

    // 1. Subtle slender twig rachis tucked inside the rear florets
    context.save();
    context.strokeStyle = rgba(shade(color, 0.42, 0.55));
    context.lineCap = "round";
    context.lineWidth = 0.85;
    context.beginPath();
    context.moveTo(ATTACH_X, ATTACH_Y);
    context.quadraticCurveTo(40 + curve * 0.4, 52, 40 + curve, 28);
    context.stroke();
    context.restore();

    // 2. Render rear shadow-tier florets, then delicate pedicels, then sunlit upper-dome florets
    for (const node of blossomNodes) {
      if (node.layer !== 0) continue;
      drawTrumpet(context, node.x, node.y, node.angle, shade(color, node.tone), node.scale, node.bud);
    }

    context.save();
    context.strokeStyle = rgba(shade(color, 0.46, 0.42));
    context.lineWidth = 0.48;
    for (const node of blossomNodes) {
      context.beginPath();
      context.moveTo(node.stemX, node.stemY);
      context.quadraticCurveTo((node.stemX + node.x) * 0.5, node.stemY - 1.2, node.x, node.y + 3.0);
      context.stroke();
    }
    context.restore();

    for (const node of blossomNodes) {
      if (node.layer !== 1) continue;
      drawTrumpet(context, node.x, node.y, node.angle, shade(color, node.tone), node.scale, node.bud);
    }
    return;
  }

  for (let i = 0; i < flowersPerSpray; i++) points.push(flowerPoint(i, flowersPerSpray, rng));
  const paint = makePaint(color);
  drawFlowerStems(context, points, paint);

  for (const [x, y] of points) {
    const scale = 1 - Math.max(0, flowersPerSpray - 5) * 0.026;
    if (form === "blossom") {
      drawCherryBlossom(context, x, y, (6.2 + rng() * 2.3) * scale, color, rng);
    } else if (form === "poinciana") {
      drawPoincianaFlower(context, x, y, (7.2 + rng() * 2.8) * scale, color, rng);
    }
  }
}

export function makeSpeciesSprites(
  profile: SpeciesProfile,
  flowersPerSpray: number,
  colorVariation: number,
): HTMLCanvasElement[] {
  if (!Number.isInteger(flowersPerSpray) || flowersPerSpray < 3 || flowersPerSpray > 15) {
    throw new RangeError("flowersPerSpray must be an integer from 3 to 15.");
  }
  if (!Number.isFinite(colorVariation) || colorVariation < 0 || colorVariation > 1) {
    throw new RangeError("colorVariation must be between 0 and 1.");
  }
  if (profile.leafPalette.length === 0) {
    throw new RangeError("leafPalette must contain at least one CSS color.");
  }
  if (profile.flower && profile.flower.palette.length === 0) {
    throw new RangeError("flower.palette must contain at least one CSS color.");
  }
  if (typeof document === "undefined") {
    throw new Error("Canvas 2D is unavailable; species sprites require a browser canvas.");
  }
  const flowerCount = flowersPerSpray;
  const variation = colorVariation;
  const sampler = document.createElement("canvas");
  sampler.width = 1;
  sampler.height = 1;
  const sampleContext = sampler.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) {
    throw new Error("Canvas 2D is unavailable; species sprites cannot be generated.");
  }

  const sprites: HTMLCanvasElement[] = [];
  const isFlowering = Boolean(profile.flower);
  for (let spriteIndex = 0; spriteIndex < 18; spriteIndex++) {
    const [canvas, context] = makeCanvas();
    const rng = seededRandom(profile.id, spriteIndex);
    const flowerSprite = isFlowering && spriteIndex >= 6;
    const palette = flowerSprite ? profile.flower!.palette : profile.leafPalette;
    const paletteIndex = flowerSprite ? spriteIndex - 6 : spriteIndex;
    const paletteSize = flowerSprite ? 12 : isFlowering ? 6 : 18;
    const color = paletteColor(sampleContext, palette, paletteIndex, paletteSize, flowerSprite ? variation : 1, rng);
    if (flowerSprite) drawFlowers(context, profile, flowerCount, color, rng);
    else drawLeaf(context, profile, color, rng);
    sprites.push(canvas);
  }
  return sprites;
}
