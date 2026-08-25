import * as THREE from 'three';

/** 赛道碰撞体 + 车与障碍/边界检测 */
export class CollisionWorld {
  constructor() {
    this.boxes = [];
    this.trackHalfWidth = 12.5;
  }

  setFromTrack(trackPoints, biomeId) {
    this.boxes = [];
    this.trackHalfWidth = 12.5;

    // 赛道外护栏 — 简化为沿赛道采样点两侧墙
    for (let i = 0; i < trackPoints.length; i += 4) {
      const t = i / trackPoints.length;
      const p = trackPoints[i];
      const p2 = trackPoints[(i + 1) % trackPoints.length];
      const tangent = new THREE.Vector3().subVectors(p2, p).normalize();
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      [16, -16].forEach(m => {
        const pos = p.clone().add(side.clone().multiplyScalar(m));
        this.boxes.push(_makeBox(pos, 2.5, 3, 2.5));
      });
    }

    // 戈壁/沙漠：巨石与岩柱 — 实体碰撞
    if (biomeId === 'gobi' || biomeId === 'desert') {
      const rnd = _seed(biomeId.length * 777);
      for (let i = 0; i < 22; i++) {
        const x = (rnd() - 0.5) * 170;
        const z = (rnd() - 0.5) * 170;
        if (_nearTrack(trackPoints, x, z, 32)) continue;
        const h = 4 + rnd() * 10;
        const w = 3 + rnd() * 6;
        this.boxes.push(_makeBox(new THREE.Vector3(x, h * 0.5, z), w, h, w * 0.8));
      }
      for (let i = 0; i < 10; i++) {
        const x = (rnd() - 0.5) * 140;
        const z = (rnd() - 0.5) * 140;
        if (_nearTrack(trackPoints, x, z, 30)) continue;
        this.boxes.push(_makeBox(new THREE.Vector3(x, 2, z), 8, 4, 8));
      }
    }

    // 森林：树干
    if (biomeId === 'forest') {
      const rnd = _seed(333);
      for (let i = 0; i < 40; i++) {
        const x = (rnd() - 0.5) * 175;
        const z = (rnd() - 0.5) * 175;
        if (_nearTrack(trackPoints, x, z, 20)) continue;
        this.boxes.push(_makeBox(new THREE.Vector3(x, 2.5, z), 1.2, 5, 1.2));
      }
    }

    // 天空：浮岛底
    if (biomeId === 'sky') {
      const rnd = _seed(444);
      for (let i = 0; i < 10; i++) {
        const x = (rnd() - 0.5) * 180;
        const z = (rnd() - 0.5) * 180;
        const y = 28 + rnd() * 18;
        if (_nearTrack(trackPoints, x, z, 25)) continue;
        this.boxes.push(_makeBox(new THREE.Vector3(x, y, z), 10, 3, 10));
      }
    }
  }

  /** 返回是否发生碰撞 */
  resolveRacer(racer, nextPos, trackPoints, trackT) {
    let pos = nextPos.clone();
    let hit = false;
    const r = racer.mesh.userData.collisionRadius ?? 1.35;

    // 赛道横向边界
    const s = _sample(trackPoints, trackT);
    const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
    const delta = new THREE.Vector3().subVectors(pos, s.position);
    const lateral = delta.dot(side);
    const clamped = THREE.MathUtils.clamp(lateral, -this.trackHalfWidth, this.trackHalfWidth);
    if (Math.abs(lateral - clamped) > 0.01) {
      pos.copy(s.position).add(side.multiplyScalar(clamped));
      pos.y = nextPos.y;
      racer.speed *= 0.72;
      hit = true;
    }

    // AABB vs 障碍
    const carBox = new THREE.Box3().setFromCenterAndSize(
      pos.clone().add(new THREE.Vector3(0, 0.6, 0)),
      new THREE.Vector3(r * 2, 1.2, r * 2.2),
    );
    for (const box of this.boxes) {
      if (!carBox.intersectsBox(box)) continue;
      const push = _pushOut(carBox, box, r);
      if (push) {
        pos.add(push);
        racer.speed *= 0.45;
        racer.stun = Math.max(racer.stun, 0.25);
        hit = true;
      }
    }
    return { pos, hit };
  }

  getDebugMeshes(scene) {
    const g = new THREE.Group();
    g.name = 'colliderDebug';
    this.boxes.forEach(b => {
      const helper = new THREE.Box3Helper(b, 0xff0044);
      g.add(helper);
    });
    scene.add(g);
    return g;
  }
}

function _makeBox(pos, w, h, d) {
  const b = new THREE.Box3();
  b.setFromCenterAndSize(pos, new THREE.Vector3(w, h, d));
  return b;
}

function _pushOut(carBox, obstacle, r) {
  const carC = carBox.getCenter(new THREE.Vector3());
  const obsC = obstacle.getCenter(new THREE.Vector3());
  const dir = carC.sub(obsC);
  dir.y = 0;
  if (dir.lengthSq() < 0.001) dir.set(1, 0, 0);
  dir.normalize();
  return dir.multiplyScalar(r * 0.35);
}

function _nearTrack(pts, x, z, minDist) {
  for (let i = 0; i < pts.length; i += 2) {
    const dx = pts[i].x - x;
    const dz = pts[i].z - z;
    if (dx * dx + dz * dz < minDist * minDist) return true;
  }
  return false;
}

function _sample(points, t) {
  const n = points.length;
  const f = ((t % 1) + 1) % 1 * n;
  const i = Math.floor(f) % n;
  const j = (i + 1) % n;
  const a = f - Math.floor(f);
  const p = new THREE.Vector3().lerpVectors(points[i], points[j], a);
  const tangent = new THREE.Vector3().subVectors(points[j], points[i]).normalize();
  return { position: p, tangent };
}

function _seed(s) {
  let v = s;
  return () => { v = (v * 16807) % 2147483647; return (v - 1) / 2147483646; };
}

export function addBuildingMeshes(group, biomeId, trackPoints) {
  const meshes = [];
  const rnd = _seed(biomeId.length * 777);
  if (biomeId !== 'gobi' && biomeId !== 'desert') return meshes;

  for (let i = 0; i < 22; i++) {
    const x = (rnd() - 0.5) * 170;
    const z = (rnd() - 0.5) * 170;
    if (_nearTrack(trackPoints, x, z, 32)) continue;
    const h = 4 + rnd() * 10;
    const w = 3 + rnd() * 6;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(w * 0.45, 0),
      new THREE.MeshStandardMaterial({
        color: biomeId === 'gobi' ? 0x8d6e63 : 0xbf360c,
        emissive: 0xff7043, emissiveIntensity: 0.12, roughness: 0.95, metalness: 0.1,
      }),
    );
    rock.position.set(x, h * 0.45, z);
    rock.scale.set(1, h / w, 1);
    rock.castShadow = true;
    group.add(rock);
    meshes.push(rock);
  }
  for (let i = 0; i < 10; i++) {
    const x = (rnd() - 0.5) * 140;
    const z = (rnd() - 0.5) * 140;
    if (_nearTrack(trackPoints, x, z, 30)) continue;
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(6, 4 + rnd() * 6, 5),
      new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 1 }),
    );
    pillar.position.set(x, 2, z);
    pillar.rotation.y = rnd() * Math.PI;
    pillar.castShadow = true;
    group.add(pillar);
    meshes.push(pillar);
  }
  return meshes;
}
