import { buildCarMesh as buildProceduralCar, CAR_CATALOG, WEAPON_LABELS, getCarById } from './cars.procedural.js';
import { preloadCarModels, buildCarMeshFromGLB, hasGlbFor } from './carLoader.js';

export { CAR_CATALOG, WEAPON_LABELS, getCarById };

/** 预载多款 GLB；失败不影响程序化开局 */
export async function initCarAssets() {
  try {
    await preloadCarModels();
  } catch {
    /* offline / missing assets */
  }
  return true;
}

/** 有独立 GLB 的车用真模；其余用差异化程序化造型 */
export function buildCarMesh(def) {
  if (hasGlbFor(def)) {
    const glb = buildCarMeshFromGLB(def);
    if (glb) return glb;
  }
  const m = buildProceduralCar(def);
  m.userData.collisionRadius = m.userData.collisionRadius ?? 1.35;
  return m;
}
