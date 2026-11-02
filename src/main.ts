import "./style.css";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing interface element: ${id}`);
  return node as T;
}

const container = element<HTMLDivElement>("scene");
const status = element<HTMLParagraphElement>("status");
const foliageButton = element<HTMLButtonElement>("foliage");
const regenerateButton = element<HTMLButtonElement>("regenerate");
const windButton = element<HTMLButtonElement>("wind");
const error = element<HTMLDivElement>("error");

function reportError(message: string, cause?: unknown): void {
  console.error(message, cause);
  error.textContent = message;
  error.hidden = false;
  status.textContent = "The tree could not be displayed.";
  foliageButton.disabled = true;
  regenerateButton.disabled = true;
  windButton.disabled = true;
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
  position: THREE.Vector3;
  direction: THREE.Vector3;
  size: number;
  hue: number;
  roll: number;
}

// Seven pointed lobes, with smaller teeth along their edges.
function mapleLeaf(): THREE.BufferGeometry {
  const outline: THREE.Vector2[] = [];
  outline.push(new THREE.Vector2(0, -0.16), new THREE.Vector2(-0.045, 0));
  for (let lobe = 0; lobe < 7; lobe++) {
    const angle = -1.55 + lobe * (3.1 / 6);
    const length = [0.34, 0.7, 0.93, 1, 0.93, 0.7, 0.34][lobe];
    for (const [offset, radius] of [
      [-0.23, 0.35], [-0.15, 0.66], [-0.105, 0.58],
      [-0.06, 0.84], [0, 1], [0.06, 0.84],
      [0.105, 0.58], [0.15, 0.66], [0.23, 0.35],
    ]) {
      outline.push(new THREE.Vector2(
        Math.sin(angle + offset) * length * radius,
        Math.cos(angle + offset) * length * radius,
      ));
    }
  }
  outline.push(new THREE.Vector2(0.045, 0));
  const shape = new THREE.Shape(outline);
  const geometry = new THREE.ShapeGeometry(shape);
  const positions = geometry.getAttribute("position");
  const uvs = geometry.getAttribute("uv");
  const colors: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    positions.setZ(i, Math.abs(x) * 0.09 + Math.sin(y * 5) * 0.025);
    uvs.setXY(i, (x + 1) / 2, (y + 0.2) / 1.2);
    const shade = 0.82 + Math.max(0, y) * 0.18;
    colors.push(shade, shade, shade);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.translate(0, 0.16, 0);
  return geometry;
}

interface Wind {
  time: THREE.IUniform<number>;
}

function addWind(material: THREE.MeshStandardMaterial, wind: Wind, flutter: boolean): void {
  material.customProgramCacheKey = () => `maple-wind-${flutter}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = wind.time;
    shader.vertexShader = `uniform float windTime;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
      #include <begin_vertex>
      vec3 treePoint = position;
      #ifdef USE_INSTANCING
        treePoint = (instanceMatrix * vec4(position, 1.0)).xyz;
      #endif
      float height = max(treePoint.y - 0.3, 0.0);
      float gust = sin(windTime * 0.85) * 0.65 + sin(windTime * 0.29 + 1.3) * 0.28;
      float ripple = sin(windTime * 2.1 + treePoint.x * 0.9 + treePoint.z * 0.7);
      vec3 sway = vec3(
        height * height * (0.022 * gust + 0.004 * ripple),
        -height * height * 0.0015 * gust * gust,
        height * height * 0.009 * sin(windTime * 0.63 + 0.8)
      );
      #ifdef USE_INSTANCING
        float scaleSquared = dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz);
        transformed += vec3(
          dot(instanceMatrix[0].xyz, sway),
          dot(instanceMatrix[1].xyz, sway),
          dot(instanceMatrix[2].xyz, sway)
        ) / scaleSquared;
      #else
        transformed += sway;
      #endif
      ${flutter ? `
        float flutterPhase = windTime * 4.6 + treePoint.x * 2.4 + treePoint.z * 3.1;
        transformed.z += position.y * position.y * 0.11 * sin(flutterPhase);
      ` : ""}
    `);
  };
}

function shadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas textures are unavailable in this browser.");
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(30,40,27,0.7)");
  gradient.addColorStop(0.35, "rgba(30,40,27,0.46)");
  gradient.addColorStop(0.7, "rgba(30,40,27,0.16)");
  gradient.addColorStop(1, "rgba(30,40,27,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function leafTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas textures are unavailable in this browser.");
  ctx.fillStyle = "#eee9da";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#b5a98c";
  ctx.lineWidth = 1.4;
  for (let lobe = 0; lobe < 7; lobe++) {
    const angle = -1.55 + lobe * (3.1 / 6);
    const length = [0.34, 0.7, 0.93, 1, 0.93, 0.7, 0.34][lobe];
    const dx = Math.sin(angle) * length * 128;
    const dy = -Math.cos(angle) * length * 213;
    const baseY = 213;
    ctx.beginPath();
    ctx.moveTo(128, baseY);
    ctx.lineTo(128 + dx, baseY + dy);
    ctx.stroke();
    for (let i = 1; i <= 4; i++) {
      const t = i / 6;
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(128 + dx * t, baseY + dy * t);
        ctx.lineTo(128 + dx * (t + 0.16) + sign * 10, baseY + dy * (t + 0.16));
        ctx.stroke();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function groundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas textures are unavailable in this browser.");
  const rng = randomFrom(42);
  ctx.fillStyle = "#afb09a";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 60000; i++) {
    const light = 80 + rng() * 100;
    ctx.fillStyle = `rgba(${light},${light + 6},${light * 0.7},0.35)`;
    ctx.fillRect(rng() * 512, rng() * 512, 0.5 + rng() * 2, 0.5 + rng() * 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(36, 36);
  return texture;
}

function barkTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas textures are unavailable in this browser.");
  const rng = randomFrom(77);
  ctx.fillStyle = "#887d6f";
  ctx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 5400; i++) {
    const x = rng() * 256;
    const y = rng() * 512;
    ctx.strokeStyle = rng() > 0.5 ? `rgba(38,31,26,${rng() * 0.45})` : `rgba(203,194,168,${rng() * 0.3})`;
    ctx.lineWidth = 0.3 + rng() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - 3, y + 10, x + 4, y + 23, x + rng() * 5, y + 10 + rng() * 75);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function taperedBranch(
  curve: THREE.CatmullRomCurve3, radius: number, endRadius: number,
): THREE.BufferGeometry {
  const segments = radius > 0.06 ? 12 : 6;
  const sides = radius > 0.12 ? 10 : 6;
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = curve.getPointAt(t);
    const r = THREE.MathUtils.lerp(radius, endRadius, t);
    for (let j = 0; j <= sides; j++) {
      const theta = (j / sides) * Math.PI * 2;
      const ridge = 1 + Math.sin(theta * 5 + t * 3) * 0.035;
      const p = center.clone()
        .addScaledVector(frames.normals[i], Math.cos(theta) * r * ridge)
        .addScaledVector(frames.binormals[i], Math.sin(theta) * r * ridge);
      positions.push(p.x, p.y, p.z);
      uvs.push(j / sides * Math.max(1, radius * 7), t * curve.getLength() * 0.8);
      if (i < segments && j < sides) {
        const a = i * (sides + 1) + j;
        const b = a + sides + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

interface Tree {
  group: THREE.Group;
  foliage: THREE.InstancedMesh;
  leafCount: number;
  branchCount: number;
  dispose: () => void;
}

function createTree(seed: number, wood: THREE.Material, leafMaterial: THREE.Material, fallenMaterial: THREE.Material, leafGeometry: THREE.BufferGeometry): Tree {
  const rng = randomFrom(seed);
  const branches: THREE.BufferGeometry[] = [];
  const leaves: Leaf[] = [];
  const group = new THREE.Group();
  const trunkPoints = [
    new THREE.Vector3(0, -0.035, 0),
    new THREE.Vector3(0.06, 0.65, 0.05),
    new THREE.Vector3(-0.1, 1.4, 0.12),
    new THREE.Vector3(0.12, 2.1, 0.04),
    new THREE.Vector3(0.26, 2.85, -0.04),
  ];
  const trunk = new THREE.CatmullRomCurve3(trunkPoints);
  branches.push(taperedBranch(trunk, 0.24, 0.09));
  for (let i = 0; i < 7; i++) {
    const angle = i * Math.PI * 2 / 7 + rng() * 0.4;
    const tip = new THREE.Vector3(Math.cos(angle), 0.015, Math.sin(angle)).multiplyScalar(0.65 + rng() * 0.45);
    tip.y = -0.085;
    branches.push(taperedBranch(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.22, 0),
      tip.clone().multiplyScalar(0.5).setY(0.015), tip,
    ]), 0.11, 0.012));
  }

  function grow(start: THREE.Vector3, direction: THREE.Vector3, length: number, radius: number, depth: number, hue: number): void {
    const dir = direction.clone().normalize();
    const bend = new THREE.Vector3((rng() - 0.5) * 0.35, 0.12, (rng() - 0.5) * 0.35);
    const middle = start.clone().addScaledVector(dir, length * 0.52).addScaledVector(bend, length * 0.35);
    const end = start.clone().addScaledVector(dir, length).addScaledVector(bend, length);
    const curve = new THREE.CatmullRomCurve3([start, middle, end]);
    branches.push(taperedBranch(curve, radius, radius * (depth === 0 ? 0.15 : 0.5)));

    if (depth <= 1) {
      // Opposite pairs attach to the living twig, not a disconnected foliage cloud.
      const nodes = depth === 0 ? 7 : 4;
      const axis = new THREE.Vector3(0, 1, 0);
      const side = new THREE.Vector3().crossVectors(dir, axis);
      if (side.lengthSq() < 0.01) side.set(1, 0, 0);
      side.normalize();
      for (let node = 0; node < nodes; node++) {
        const t = 0.22 + node / nodes * 0.75;
        const point = curve.getPoint(t);
        const rotation = node * 1.7 + rng() * 0.4;
        const lateral = side.clone().applyAxisAngle(dir, rotation);
        for (const sign of [-1, 1]) {
          const outward = lateral.clone().multiplyScalar(sign).addScaledVector(dir, 0.4).normalize();
          leaves.push({
            position: point.clone(),
            direction: outward,
            size: 0.12 + rng() * 0.095,
            hue: hue + (rng() - 0.5) * 0.025,
            roll: (rng() - 0.5) * 1.2,
          });
        }
      }
    }
    if (depth === 0) return;

    const axis = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, axis);
    if (side.lengthSq() < 0.01) side.set(1, 0, 0);
    side.normalize();
    const count = depth === 3 ? 4 : 3;
    for (let i = 0; i < count; i++) {
      const t = 0.48 + i / count * 0.5;
      const childStart = curve.getPoint(t);
      const angle = i * 2.399 + rng() * 0.65;
      const spread = side.clone().applyAxisAngle(dir, angle);
      const childDir = dir.clone().multiplyScalar(0.66)
        .addScaledVector(spread, 0.65 + rng() * 0.28)
        .addScaledVector(axis, depth > 1 ? 0.18 : -0.1).normalize();
      grow(childStart, childDir, length * (0.52 + rng() * 0.13), radius * 0.45, depth - 1, hue + (rng() - 0.5) * 0.03);
    }
    grow(end, dir.clone().addScaledVector(axis, -0.08), length * 0.49, radius * 0.43, depth - 1, hue);
  }

  for (let i = 0; i < 10; i++) {
    const t = 0.48 + (i % 4) * 0.15;
    const angle = i * 2.399 + rng() * 0.4;
    const direction = new THREE.Vector3(Math.cos(angle), 0.35 + rng() * 0.6, Math.sin(angle)).normalize();
    grow(trunk.getPointAt(t), direction, 1.55 + rng() * 0.8, 0.065 + (1 - t) * 0.095, 3, 0.005 + rng() * 0.07);
  }

  const branchCount = branches.length;
  const merged = mergeGeometries(branches);
  for (const geometry of branches) geometry.dispose();
  if (!merged) throw new Error("Unable to assemble the tree branches.");
  const mesh = new THREE.Mesh(merged, wood);
  group.add(mesh);
  const foliage = new THREE.InstancedMesh(leafGeometry, leafMaterial, leaves.length);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    transform.position.copy(leaf.position);
    transform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), leaf.direction);
    transform.rotateY(leaf.roll);
    transform.scale.setScalar(leaf.size);
    transform.updateMatrix();
    foliage.setMatrixAt(i, transform.matrix);
    color.setHSL(THREE.MathUtils.clamp(leaf.hue, 0.005, 0.09), 0.72 + rng() * 0.16, 0.28 + rng() * 0.13);
    foliage.setColorAt(i, color);
  }
  foliage.computeBoundingSphere();
  if (foliage.boundingSphere) foliage.boundingSphere.radius += 1.2;
  group.add(foliage);

  const fallen = new THREE.InstancedMesh(leafGeometry, fallenMaterial, 420);
  for (let i = 0; i < 420; i++) {
    const angle = rng() * Math.PI * 2;
    const distance = Math.pow(rng(), 0.6) * 3.8;
    transform.position.set(Math.cos(angle) * distance, 0.01 + rng() * 0.015, Math.sin(angle) * distance);
    transform.rotation.set(-Math.PI / 2, 0, rng() * Math.PI * 2);
    transform.scale.setScalar(0.1 + rng() * 0.08);
    transform.updateMatrix();
    fallen.setMatrixAt(i, transform.matrix);
    fallen.setColorAt(i, color.setHSL(rng() * 0.08, 0.65, 0.22 + rng() * 0.12));
  }
  fallen.computeBoundingSphere();
  group.add(fallen);
  return {
    group, foliage, leafCount: leaves.length, branchCount,
    dispose: () => { merged.dispose(); foliage.dispose(); fallen.dispose(); },
  };
}

function start(): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#b9cad1");
  scene.fog = new THREE.Fog("#b9cad1", 17, 55);
  const camera = new THREE.OrthographicCamera(-6, 6, 5, -5, 0.1, 90);
  scene.add(new THREE.HemisphereLight("#eef7ff", "#717459", 1.8));
  const sun = new THREE.DirectionalLight("#fff0d3", 2.5);
  sun.position.set(-5, 9, 5);
  scene.add(sun);
  const groundMap = groundTexture();
  const groundMaterial = new THREE.MeshStandardMaterial({ color: "#a4a48b", map: groundMap, roughness: 1 });
  const groundGeometry = new THREE.PlaneGeometry(200, 200);
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  scene.add(ground);
  const shadowMap = shadowTexture();
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false });
  const shadowGeometry = new THREE.PlaneGeometry(1, 1);
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.6, -0.033, 0.2);
  scene.add(shadow);
  const contactShadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(0, -0.028, 0);
  contactShadow.scale.set(1.9, 1.5, 1);
  scene.add(contactShadow);
  const texture = barkTexture();
  const wood = new THREE.MeshStandardMaterial({ color: "#9c9285", map: texture, bumpMap: texture, bumpScale: 0.065, roughness: 0.96 });
  const leafGeometry = mapleLeaf();
  const leafMap = leafTexture();
  const leafMaterial = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide, roughness: 0.8, vertexColors: true, map: leafMap,
  });
  const fallenMaterial = leafMaterial.clone();
  const wind: Wind = { time: { value: 0 } };
  addWind(wood, wind, false);
  addWind(leafMaterial, wind, true);
  let seed = 1847;
  let tree: Tree | undefined;
  let bare = false;
  let active = true;
  let frame = 0;
  let lastTime: number | undefined;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let windEnabled = !reducedMotion.matches;
  let windExplicitlySet = false;

  function requestFrame(): void {
    if (active && !document.hidden && frame === 0) frame = requestAnimationFrame(render);
  }

  function updateWindButton(): void {
    windButton.textContent = windEnabled ? "Pause wind" : "Start wind";
    windButton.setAttribute("aria-pressed", String(windEnabled));
    renderer.domElement.dataset.wind = String(windEnabled);
    container.setAttribute("aria-label", windEnabled
      ? "Japanese maple swaying in a gentle breeze, shown from a fixed view."
      : "Japanese maple with the wind paused, shown from a fixed view.");
  }

  function growTree(): void {
    const next = createTree(seed, wood, leafMaterial, fallenMaterial, leafGeometry);
    if (tree) {
      scene.remove(tree.group);
      tree.dispose();
    }
    tree = next;
    scene.add(tree.group);
    tree.foliage.visible = !bare;
    status.textContent = `Seed ${seed} / ${tree.leafCount.toLocaleString()} individual leaves`;
    renderer.domElement.dataset.seed = String(seed);
    renderer.domElement.dataset.leaves = String(tree.leafCount);
    renderer.domElement.dataset.branches = String(tree.branchCount);
    fitCamera();
    requestFrame();
  }

  function fitCamera(): void {
    if (!tree) return;
    const box = new THREE.Box3().setFromObject(tree.foliage);
    box.min.y = 0;
    const target = box.getCenter(new THREE.Vector3());
    const outward = new THREE.Vector3(7.8, 2.5, 10.2).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), outward).normalize();
    const up = new THREE.Vector3().crossVectors(outward, right).normalize();
    const aspect = container.clientWidth / container.clientHeight;
    let halfHeight = 3;
    const matrix = new THREE.Matrix4();
    const delta = new THREE.Vector3();
    function includePoint(point: THREE.Vector3, padding: number): void {
      delta.copy(point).sub(target);
      halfHeight = Math.max(halfHeight,
        (Math.abs(delta.dot(right)) + padding) / (aspect * 0.86),
        (Math.abs(delta.dot(up)) + padding) / 0.72,
      );
    }
    includePoint(new THREE.Vector3(0, 0, 0), 0.5);
    const point = new THREE.Vector3();
    for (let i = 0; i < tree.foliage.count; i++) {
      tree.foliage.getMatrixAt(i, matrix);
      includePoint(point.setFromMatrixPosition(matrix), 1.05);
    }
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    const cameraDistance = Math.max(35, halfHeight / outward.y + 10);
    camera.position.copy(target).addScaledVector(outward, cameraDistance);
    camera.far = cameraDistance + 100;
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    shadow.scale.set(box.max.x - box.min.x + 1, box.max.z - box.min.z + 1, 1);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = cameraDistance + 8;
      scene.fog.far = cameraDistance + 65;
    }
  }

  function resize(): void {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height);
    fitCamera();
    requestFrame();
  }
  growTree();
  resize();
  foliageButton.disabled = regenerateButton.disabled = windButton.disabled = false;
  updateWindButton();
  windButton.addEventListener("click", () => {
    windExplicitlySet = true;
    windEnabled = !windEnabled;
    lastTime = undefined;
    updateWindButton();
    requestFrame();
  });
  reducedMotion.addEventListener("change", () => {
    if (windExplicitlySet) return;
    windEnabled = !reducedMotion.matches;
    lastTime = undefined;
    updateWindButton();
    requestFrame();
  });
  foliageButton.addEventListener("click", () => {
    bare = !bare;
    if (tree) tree.foliage.visible = !bare;
    foliageButton.textContent = bare ? "Show leaves" : "Show branches";
    foliageButton.setAttribute("aria-pressed", String(bare));
    renderer.domElement.dataset.foliage = String(!bare);
    requestFrame();
  });
  regenerateButton.addEventListener("click", () => {
    seed = crypto.getRandomValues(new Uint32Array(1))[0] % 100000;
    try {
      growTree();
    } catch (cause) {
      reportError("This tree could not grow. Reload the page to try again.", cause);
    }
  });
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastTime = undefined;
    requestFrame();
  });
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    active = false;
    cancelAnimationFrame(frame);
    reportError("The 3D graphics connection was lost. Close other graphics-heavy tabs and reload this page.");
  });
  function render(timestamp: number): void {
    frame = 0;
    if (!active) return;
    if (document.hidden) return;
    if (windEnabled) {
      if (lastTime !== undefined) wind.time.value += Math.min((timestamp - lastTime) / 1000, 0.05);
      lastTime = timestamp;
    } else {
      lastTime = undefined;
    }
    renderer.render(scene, camera);
    renderer.domElement.dataset.windTime = wind.time.value.toFixed(3);
    renderer.domElement.dataset.drawCalls = String(renderer.info.render.calls);
    renderer.domElement.dataset.shadowMaps = String(renderer.shadowMap.enabled);
    if (windEnabled) requestFrame();
  }
  requestFrame();
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    active = false;
    cancelAnimationFrame(frame);
    tree?.dispose();
    wood.dispose();
    texture.dispose();
    leafMaterial.dispose();
    fallenMaterial.dispose();
    leafMap.dispose();
    leafGeometry.dispose();
    groundGeometry.dispose();
    groundMaterial.dispose();
    groundMap.dispose();
    shadowMap.dispose();
    shadowMaterial.dispose();
    shadowGeometry.dispose();
    renderer.dispose();
  });
}

try {
  start();
} catch (cause) {
  reportError("Your browser could not start the 3D scene. Enable hardware acceleration, then reload, or try a WebGL-capable browser.", cause);
}
