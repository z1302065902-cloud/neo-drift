import * as THREE from 'three';
import { addBuildingMeshes } from './collision.js';

/** 亮色 Synthwave 赛道 — 参考 Laser Drift / Neon Highway 逆向 */
export const TRACK_CATALOG = [
  { id: 'cosmos', name: '宇宙深空', desc: '紫粉星云 · 霓虹网格', fog: 0x6b4cff, ambient: 0xc4b5fd, sun: 0x00f5ff, skyTop: 0xff6ad5, skyBottom: 0x4facfe, grid: 0xbf00ff },
  { id: 'sky', name: '云端天际', desc: '极光 · 浮岛', fog: 0x87ceeb, ambient: 0xe0f4ff, sun: 0xfff176, skyTop: 0x89f7fe, skyBottom: 0x66a6ff, grid: 0x00d4ff },
  { id: 'ocean', name: '深海裂谷', desc: '生物光 · 碧浪', fog: 0x20e3b2, ambient: 0x7fffd4, sun: 0x00ffcc, skyTop: 0x43e97b, skyBottom: 0x38f9d7, grid: 0x00ffaa },
  { id: 'gobi', name: '戈壁星尘', desc: '铜锈 · 夕照', fog: 0xffcc80, ambient: 0xffe0b2, sun: 0xffab40, skyTop: 0xffd54f, skyBottom: 0xff8a65, grid: 0xff9800 },
  { id: 'desert', name: '赤色沙漠', desc: '热浪 · 熔金', fog: 0xffab91, ambient: 0xffccbc, sun: 0xff7043, skyTop: 0xff8a65, skyBottom: 0xff5252, grid: 0xff5722 },
  { id: 'forest', name: '霓虹森林', desc: '荧光 · 孢子', fog: 0x69f0ae, ambient: 0xb9f6ca, sun: 0x00e676, skyTop: 0x76ff03, skyBottom: 0x1de9b6, grid: 0x00e676 },
];

export function getTrackPoints(segments = 64) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const rx = 95, rz = 62;
    const x = Math.cos(t) * rx + Math.sin(t * 2) * 8;
    const z = Math.sin(t) * rz + Math.cos(t * 3) * 6;
    pts.push(new THREE.Vector3(x, 0, z));
  }
  return pts;
}

/** 半宽：窄弯 / 宽直道，塑造超车决策 */
export function getTrackHalfWidth(t) {
  const u = ((t % 1) + 1) % 1;
  // 起跑直线偏宽，两处咽喉偏窄
  const choke = Math.max(0, Math.sin((u - 0.22) * Math.PI * 2) * 0.55)
    + Math.max(0, Math.sin((u - 0.68) * Math.PI * 2) * 0.55);
  const wide = Math.max(0, Math.cos(u * Math.PI * 2) * 0.4);
  return THREE.MathUtils.clamp(12.5 - choke * 4.5 + wide * 2.5, 8.2, 15.5);
}

/** 危险区：减速带（热浪 / 乱流） */
export function getHazardFactor(t) {
  const u = ((t % 1) + 1) % 1;
  if (u > 0.4 && u < 0.48) return 0.82; // 中段乱流
  if (u > 0.85 && u < 0.92) return 0.88;
  return 1;
}

export function sampleTrack(points, t) {
  const n = points.length;
  const f = ((t % 1) + 1) % 1 * n;
  const i = Math.floor(f) % n;
  const j = (i + 1) % n;
  const a = f - Math.floor(f);
  const p = new THREE.Vector3().lerpVectors(points[i], points[j], a);
  const tangent = new THREE.Vector3().subVectors(points[j], points[i]).normalize();
  return { position: p, tangent, index: i };
}

export function buildTrackEnvironment(scene, biomeId) {
  const biome = TRACK_CATALOG.find(t => t.id === biomeId) || TRACK_CATALOG[0];
  const group = new THREE.Group();
  group.name = 'environment';

  const skyTop = biome.skyTop ?? biome.fog;
  const skyBottom = biome.skyBottom ?? biome.fog;
  scene.background = new THREE.Color(skyBottom);
  scene.fog = new THREE.FogExp2(skyBottom, 0.0016);

  // 亮色渐变天幕 + 地平线光晕
  const skyGeo = new THREE.SphereGeometry(280, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(skyTop) },
      bottomColor: { value: new THREE.Color(skyBottom) },
      glowColor: { value: new THREE.Color(biome.sun) },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor, bottomColor, glowColor;
      varying vec3 vWorld;
      void main() {
        float h = normalize(vWorld).y * 0.5 + 0.5;
        vec3 col = mix(bottomColor, topColor, pow(h, 0.55));
        col += glowColor * pow(max(0.0, 1.0 - abs(h - 0.35) * 2.5), 2.0) * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  group.add(new THREE.Mesh(skyGeo, skyMat));

  // Synthwave 复古太阳
  if (biomeId === 'cosmos' || biomeId === 'sky' || biomeId === 'desert') {
    const sunGroup = new THREE.Group();
    sunGroup.position.set(-80, 45, -120);
    const sunMat = new THREE.MeshBasicMaterial({ color: biome.sun, transparent: true, opacity: 0.95 });
    const sun = new THREE.Mesh(new THREE.CircleGeometry(22, 32), sunMat);
    for (let i = 0; i < 6; i++) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(44, 2.2),
        new THREE.MeshBasicMaterial({ color: skyBottom, transparent: true, opacity: 0.85 }),
      );
      stripe.position.y = -16 + i * 5.5;
      sunGroup.add(stripe);
    }
    sunGroup.add(sun);
    group.add(sunGroup);
  }

  // 霓虹透视网格地面 — Laser Drift 核心视觉
  const gridColor = biome.grid ?? biome.sun;
  const grid = _makeNeonGrid(400, gridColor, biome.ambient);
  group.add(grid);

  const trackPoints = getTrackPoints();
  const curve = new THREE.CatmullRomCurve3(trackPoints, true, 'catmullrom', 0.4);

  // 赛道面 — 分段宽度感：主轨 + 窄段发光警示环
  const trackGeo = new THREE.TubeGeometry(curve, 200, 14, 8, true);
  const trackMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a4a, emissive: biome.ambient, emissiveIntensity: 0.45,
    metalness: 0.85, roughness: 0.15,
  });
  const track = new THREE.Mesh(trackGeo, trackMat);
  track.position.y = 0.08;
  track.receiveShadow = true;
  group.add(track);

  // 起终点拱门 + 中点地标
  _addTrackLandmarks(group, trackPoints, biome);

  // 内外双霓虹边线
  [14.6, 15.2].forEach((r, i) => {
    const edge = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 200, r, 4, true),
      new THREE.MeshBasicMaterial({
        color: i === 0 ? biome.sun : biome.grid,
        transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    edge.position.y = 0.12;
    group.add(edge);
  });

  // 护栏柱
  const postMat = new THREE.MeshStandardMaterial({
    color: biome.sun, emissive: biome.sun, emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.15,
  });
  for (let i = 0; i < 48; i++) {
    const t = i / 48;
    const s = sampleTrack(trackPoints, t);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.8, 6), postMat);
    const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
    post.position.copy(s.position).add(side.multiplyScalar(16)).setY(1.4);
    group.add(post);
  }

  _addBiomeProps(group, biomeId, trackPoints, biome);

  const hemi = new THREE.HemisphereLight(biome.ambient, biome.fog, 0.85);
  group.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
  sunLight.position.set(70, 140, 50);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 320;
  sunLight.shadow.camera.left = -140;
  sunLight.shadow.camera.right = 140;
  sunLight.shadow.camera.top = 140;
  sunLight.shadow.camera.bottom = -140;
  sunLight.shadow.bias = -0.0002;
  group.add(sunLight);

  // 赛道霓虹补光 + 轮廓光
  const fill = new THREE.PointLight(biome.sun, 3.2, 220);
  fill.position.set(0, 28, 0);
  group.add(fill);
  const rim = new THREE.DirectionalLight(biome.grid || biome.sun, 0.9);
  rim.position.set(-40, 30, -60);
  group.add(rim);
  const spot = new THREE.SpotLight(biome.sun, 2.2, 180, Math.PI / 5, 0.4, 1);
  spot.position.set(0, 55, 0);
  spot.target.position.set(0, 0, 0);
  spot.castShadow = true;
  group.add(spot);
  group.add(spot.target);

  // 沿赛道点光
  for (let i = 0; i < 8; i++) {
    const s = sampleTrack(trackPoints, i / 8);
    const pl = new THREE.PointLight(biome.grid || biome.sun, 1.4, 40);
    pl.position.copy(s.position).setY(6);
    group.add(pl);
  }

  scene.add(group);
  return { group, trackPoints, curve, biome, grid, sunLight, fill };
}

function _addTrackLandmarks(group, trackPoints, biome) {
  const placeGate = (t, labelColor) => {
    const s = sampleTrack(trackPoints, t);
    const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
    const gate = new THREE.Group();
    const pillarMat = new THREE.MeshStandardMaterial({
      color: biome.sun, emissive: biome.sun, emissiveIntensity: 1.6, metalness: 0.7, roughness: 0.2,
    });
    [-1, 1].forEach((sign) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 10, 1.2), pillarMat);
      p.position.copy(s.position).add(side.clone().multiplyScalar(sign * 16));
      p.position.y = 5;
      gate.add(p);
    });
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(34, 0.6, 0.6),
      new THREE.MeshBasicMaterial({ color: labelColor, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }),
    );
    beam.position.copy(s.position);
    beam.position.y = 9.5;
    beam.lookAt(s.position.clone().add(s.tangent));
    gate.add(beam);
    // 危险区地面条纹
    if (t > 0.35 && t < 0.5) {
      const hazard = new THREE.Mesh(
        new THREE.PlaneGeometry(28, 8),
        new THREE.MeshBasicMaterial({
          color: 0xff3366, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }),
      );
      hazard.rotation.x = -Math.PI / 2;
      hazard.position.copy(s.position).setY(0.2);
      gate.add(hazard);
    }
    group.add(gate);
  };
  placeGate(0.0, biome.sun);
  placeGate(0.33, biome.grid || biome.sun);
  placeGate(0.66, biome.grid || biome.sun);
}

function _makeNeonGrid(size, lineColor, fillColor) {
  const g = new THREE.Group();
  const divisions = 40;
  const grid = new THREE.GridHelper(size, divisions, lineColor, lineColor);
  grid.material.opacity = 0.55;
  grid.material.transparent = true;
  grid.material.blending = THREE.AdditiveBlending;
  grid.material.depthWrite = false;
  grid.position.y = 0.01;
  g.add(grid);

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({
      color: fillColor, emissive: lineColor, emissiveIntensity: 0.12,
      metalness: 0.7, roughness: 0.35, transparent: true, opacity: 0.35,
    }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.01;
  plane.receiveShadow = true;
  g.add(plane);
  return g;
}

function _addBiomeProps(group, id, trackPoints, biome) {
  const rnd = (seed) => {
    let s = seed;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  };
  const r = rnd(id.length * 999);

  if (id === 'cosmos') {
    const starGeo = new THREE.BufferGeometry();
    const n = 1200;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 400;
      pos[i * 3 + 1] = r() * 80 + 15;
      pos[i * 3 + 2] = (r() - 0.5) * 400;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.2, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
    })));
    for (let i = 0; i < 10; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(6 + r() * 14, 0.2, 8, 48),
        new THREE.MeshBasicMaterial({ color: biome.grid, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ring.position.set((r() - 0.5) * 180, 20 + r() * 35, (r() - 0.5) * 180);
      ring.rotation.x = r() * Math.PI;
      group.add(ring);
    }
  } else if (id === 'sky') {
    for (let i = 0; i < 14; i++) {
      const island = new THREE.Mesh(
        new THREE.CylinderGeometry(6 + r() * 8, 8 + r() * 10, 3, 8),
        new THREE.MeshStandardMaterial({ color: 0xdceeff, emissive: 0x88ccff, emissiveIntensity: 0.3, roughness: 0.7 }),
      );
      island.position.set((r() - 0.5) * 200, 28 + r() * 22, (r() - 0.5) * 200);
      group.add(island);
    }
  } else if (id === 'ocean') {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x00bcd4, emissive: 0x00e5ff, emissiveIntensity: 0.25, transparent: true, opacity: 0.5, metalness: 0.95, roughness: 0.05 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.3;
    group.add(water);
    for (let i = 0; i < 50; i++) {
      const kelp = new THREE.Mesh(
        new THREE.ConeGeometry(0.35, 4 + r() * 7, 4),
        new THREE.MeshStandardMaterial({ color: 0x00ffaa, emissive: 0x00ffcc, emissiveIntensity: 0.7 }),
      );
      kelp.position.set((r() - 0.5) * 160, 2, (r() - 0.5) * 160);
      group.add(kelp);
    }
  } else if (id === 'gobi' || id === 'desert') {
    addBuildingMeshes(group, id, trackPoints);
    for (let i = 0; i < 12; i++) {
      const x = (rnd() - 0.5) * 220;
      const z = (rnd() - 0.5) * 220;
      let near = false;
      for (let k = 0; k < trackPoints.length; k += 4) {
        const dx = trackPoints[k].x - x, dz = trackPoints[k].z - z;
        if (dx * dx + dz * dz < 35 * 35) { near = true; break; }
      }
      if (near) continue;
      const dune = new THREE.Mesh(
        new THREE.SphereGeometry(8 + r() * 12, 8, 6),
        new THREE.MeshStandardMaterial({ color: id === 'gobi' ? 0xffcc80 : 0xffab40, emissive: 0xff8a50, emissiveIntensity: 0.15, roughness: 0.9 }),
      );
      dune.scale.set(1.8, 0.25, 1.2);
      dune.position.set(x, 1, z);
      group.add(dune);
    }
  } else if (id === 'forest') {
    for (let i = 0; i < 50; i++) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 5, 6), new THREE.MeshStandardMaterial({ color: 0x4e342e }));
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(2.5, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x76ff03, emissive: 0x00e676, emissiveIntensity: 0.65 }),
      );
      const tree = new THREE.Group();
      trunk.position.y = 2.5;
      crown.position.y = 6;
      tree.add(trunk, crown);
      tree.position.set((r() - 0.5) * 190, 0, (r() - 0.5) * 190);
      group.add(tree);
    }
  }
}

export function getTrackById(id) {
  return TRACK_CATALOG.find(t => t.id === id) || TRACK_CATALOG[0];
}
