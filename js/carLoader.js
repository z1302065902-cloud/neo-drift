import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** 多 GLB 映射：造型差异；无模型时 cars.js 走程序化 */
const MODEL_MAP = {
  'neon-phantom': 'car-concept.glb',
  'titan-forge': 'damaged-vehicle.glb',
  'pulse-dart': 'sci-fi-vehicle.glb',
  'quantum-wing': 'clearcoat-car.glb',
  'void-runner': null, // 程序化低趴
  'solar-flare': 'car-concept.glb',
  'arctic-blade': 'clearcoat-car.glb',
  'crimson-striker': 'sci-fi-vehicle.glb',
};

const SCALE = {
  'neon-phantom': 1.05,
  'titan-forge': 1.22,
  'pulse-dart': 0.9,
  'quantum-wing': 1.02,
  'void-runner': 0.88,
  'solar-flare': 1.12,
  'arctic-blade': 0.96,
  'crimson-striker': 0.98,
};

const templates = new Map();
const loader = new GLTFLoader();

async function loadTemplate(file) {
  if (templates.has(file)) return templates.get(file);
  const gltf = await loader.loadAsync(`assets/models/${file}`);
  const scene = gltf.scene;
  scene.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  scene.userData.normalize = {
    size,
    center,
    maxDim: Math.max(size.x, size.y, size.z),
    minY: box.min.y,
  };
  templates.set(file, scene);
  return scene;
}

export async function preloadCarModels() {
  const files = [...new Set(Object.values(MODEL_MAP).filter(Boolean))];
  await Promise.all(files.map((f) => loadTemplate(f).catch(() => null)));
}

export function hasGlbFor(def) {
  const file = MODEL_MAP[def.id];
  return !!(file && templates.has(file));
}

export function buildCarMeshFromGLB(def) {
  const file = MODEL_MAP[def.id];
  if (!file || !templates.has(file)) return null;
  const baseScene = templates.get(file);
  const root = new THREE.Group();
  root.userData.carId = def.id;
  const model = baseScene.clone(true);
  const { center, maxDim, minY } = baseScene.userData.normalize;
  const targetLen = 4.4 * (SCALE[def.id] || 1);
  const s = targetLen / maxDim;
  model.scale.setScalar(s);
  model.position.set(-center.x * s, -minY * s + 0.05, -center.z * s);
  model.rotation.y = Math.PI;

  model.traverse((c) => {
    if (!c.isMesh || !c.material) return;
    const apply = (m) => {
      const nm = m.clone();
      if (nm.emissive) {
        nm.emissive = new THREE.Color(def.accent);
        nm.emissiveIntensity = 0.4 + (def.speed - 0.85) * 0.25;
      }
      if (nm.color) nm.color.lerp(new THREE.Color(def.color), 0.5);
      nm.metalness = Math.min(1, (nm.metalness ?? 0.5) + 0.28);
      nm.roughness = Math.max(0.06, (nm.roughness ?? 0.5) - 0.18);
      return nm;
    };
    if (Array.isArray(c.material)) c.material = c.material.map(apply);
    else c.material = apply(c.material);
  });

  const accent = def.accent;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.05, 8, 24),
    new THREE.MeshBasicMaterial({
      color: accent, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.35, -2.15);
  model.add(ring);

  // 车顶识别灯，避免同模难辨
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshBasicMaterial({ color: accent }),
  );
  beacon.position.set(0, 1.15, 0);
  model.add(beacon);

  const weaponMount = new THREE.Object3D();
  weaponMount.position.set(0, 1.15, 1.55);
  model.add(weaponMount);
  root.userData.weaponMount = weaponMount;
  root.userData.body = model;
  root.userData.collisionRadius = 1.35 * (SCALE[def.id] || 1);
  root.userData.fromGlb = file;
  root.add(model);
  return root;
}
