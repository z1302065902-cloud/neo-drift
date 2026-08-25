import * as THREE from 'three';

/** 8 款造型差异明显的科幻战车 + 独立武器树 */
export const CAR_CATALOG = [
  { id: 'neon-phantom', name: '霓虹魅影', weapon: 'laser_rail', weapons: ['laser_rail', 'laser_scatter', 'particle_storm'], color: 0x00f0ff, accent: 0xff3d6e, speed: 1.05, handling: 1.1, armor: 0.85, shape: 'hover_wedge' },
  { id: 'titan-forge', name: '泰坦熔炉', weapon: 'missile_nuke', weapons: ['missile_nuke', 'plasma', 'missile_homing'], color: 0xff6a00, accent: 0xffd54a, speed: 0.88, handling: 0.82, armor: 1.35, shape: 'tank_fortress' },
  { id: 'pulse-dart', name: '脉冲飞镖', weapon: 'missile_swarm', weapons: ['missile_swarm', 'laser_beam', 'ion_stream'], color: 0xa855f7, accent: 0x00ffaa, speed: 1.15, handling: 1.05, armor: 0.75, shape: 'needle_dart' },
  { id: 'quantum-wing', name: '量子翼刃', weapon: 'laser_beam', weapons: ['laser_beam', 'laser_scatter', 'plasma'], color: 0x4fc3f7, accent: 0xffffff, speed: 1.0, handling: 1.2, armor: 0.9, shape: 'delta_wing' },
  { id: 'void-runner', name: '虚空行者', weapon: 'particle_storm', weapons: ['particle_storm', 'missile_homing', 'ion_stream'], color: 0x311b92, accent: 0x7c4dff, speed: 0.95, handling: 0.95, armor: 1.0, shape: 'low_rider' },
  { id: 'solar-flare', name: '太阳耀斑', weapon: 'plasma', weapons: ['plasma', 'missile_homing', 'laser_rail'], color: 0xffab00, accent: 0xff5252, speed: 1.08, handling: 0.9, armor: 0.95, shape: 'solar_cruiser' },
  { id: 'arctic-blade', name: '极寒利刃', weapon: 'ion_stream', weapons: ['ion_stream', 'laser_beam', 'missile_swarm'], color: 0xb3e5fc, accent: 0x00bcd4, speed: 1.02, handling: 1.08, armor: 0.88, shape: 'ice_blade' },
  { id: 'crimson-striker', name: '赤红突击', weapon: 'missile_homing', weapons: ['missile_homing', 'missile_nuke', 'laser_scatter'], color: 0xd50000, accent: 0xff1744, speed: 1.12, handling: 0.92, armor: 0.8, shape: 'assault_ram' },
];

export const WEAPON_LABELS = {
  laser_rail: '轨道激光',
  laser_scatter: '散射激光',
  laser_beam: '持续光束',
  missile_homing: '追踪导弹',
  missile_swarm: '蜂群导弹',
  missile_nuke: '高爆导弹',
  plasma: '等离子炮',
  particle_storm: '粒子风暴',
  ion_stream: '离子流',
};

export function getCarById(id) {
  return CAR_CATALOG.find(c => c.id === id) || CAR_CATALOG[0];
}

function mat(color, emissive, metal = 0.85, rough = 0.18) {
  return new THREE.MeshStandardMaterial({
    color, emissive, emissiveIntensity: 0.7, metalness: metal, roughness: rough,
  });
}

function glow(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
  );
  m.position.set(x, y, z);
  return m;
}

/** 每车独立科幻造型 — 不靠同一 GLB 染色 */
export function buildCarMesh(def) {
  const root = new THREE.Group();
  root.userData.carId = def.id;
  const body = new THREE.Group();
  const c = def.color;
  const a = def.accent;
  const bodyMat = mat(c, a);
  const dark = mat(0x0a1018, 0x223344, 0.95, 0.3);
  const chrome = mat(0xccddee, a, 1, 0.08);

  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
    return mesh;
  };

  switch (def.shape) {
    case 'tank_fortress':
      add(new THREE.BoxGeometry(2.6, 0.7, 4.6), bodyMat, 0, 0.5, 0);
      add(new THREE.BoxGeometry(2.0, 0.55, 1.8), dark, 0, 1.0, -0.6);
      add(new THREE.CylinderGeometry(0.25, 0.25, 2.4, 8), chrome, 0, 1.1, 1.4, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.4, 0.9, 0.4), dark, 1.2, 0.9, -1.2);
      add(new THREE.BoxGeometry(0.4, 0.9, 0.4), dark, -1.2, 0.9, -1.2);
      body.add(glow(2.4, 0.08, 0.1, a, 0, 0.2, 2.3));
      break;
    case 'needle_dart':
      add(new THREE.ConeGeometry(0.85, 4.4, 6), bodyMat, 0, 0.45, 0.2, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.15, 1.4, 1.6), bodyMat, 0.7, 0.55, -0.4, 0, 0, 0.4);
      add(new THREE.BoxGeometry(0.15, 1.4, 1.6), bodyMat, -0.7, 0.55, -0.4, 0, 0, -0.4);
      add(new THREE.SphereGeometry(0.35, 8, 8), chrome, 0, 0.55, 2.0);
      break;
    case 'delta_wing':
      add(new THREE.BoxGeometry(1.4, 0.32, 3.4), bodyMat, 0, 0.4, 0.2);
      add(new THREE.BoxGeometry(3.6, 0.08, 1.8), bodyMat, 0, 0.48, -0.2, 0, 0, 0.05);
      add(new THREE.ConeGeometry(0.45, 1.4, 4), chrome, 0, 0.5, 2.0, Math.PI / 2, 0, 0);
      add(new THREE.TorusGeometry(0.5, 0.06, 8, 20), new THREE.MeshBasicMaterial({ color: a }), 0, 0.35, -1.8, Math.PI / 2, 0, 0);
      break;
    case 'low_rider':
      add(new THREE.BoxGeometry(2.0, 0.28, 4.2), bodyMat, 0, 0.22, 0);
      add(new THREE.BoxGeometry(1.5, 0.2, 0.8), dark, 0, 0.42, 1.6);
      add(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16), chrome, 0.95, 0.2, 0, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16), chrome, -0.95, 0.2, 0, 0, 0, Math.PI / 2);
      for (const z of [1.2, -1.2]) {
        body.add(glow(0.4, 0.15, 0.4, a, 0.9, 0.15, z));
        body.add(glow(0.4, 0.15, 0.4, a, -0.9, 0.15, z));
      }
      break;
    case 'solar_cruiser':
      add(new THREE.BoxGeometry(1.9, 0.4, 3.8), bodyMat, 0, 0.35, 0);
      add(new THREE.SphereGeometry(0.7, 12, 12), chrome, 0, 0.55, 1.5);
      add(new THREE.BoxGeometry(2.4, 0.06, 1.2), bodyMat, 0, 0.7, 0, 0.15, 0, 0);
      add(new THREE.TorusGeometry(0.8, 0.08, 8, 24), new THREE.MeshBasicMaterial({ color: a }), 0, 0.4, -1.9, Math.PI / 2, 0, 0);
      break;
    case 'ice_blade':
      add(new THREE.BoxGeometry(1.5, 0.3, 3.8), bodyMat, 0, 0.32, 0);
      add(new THREE.BoxGeometry(0.12, 0.9, 2.8), chrome, 0.95, 0.55, 0, 0, 0, -0.5);
      add(new THREE.BoxGeometry(0.12, 0.9, 2.8), chrome, -0.95, 0.55, 0, 0, 0, 0.5);
      add(new THREE.ConeGeometry(0.4, 1.6, 3), bodyMat, 0, 0.4, 2.1, Math.PI / 2, 0, 0);
      break;
    case 'assault_ram':
      add(new THREE.BoxGeometry(2.1, 0.48, 3.8), bodyMat, 0, 0.38, 0);
      add(new THREE.ConeGeometry(0.85, 1.8, 4), bodyMat, 0, 0.55, 2.0, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.5, 0.7, 0.5), dark, 1.0, 0.55, -0.5);
      add(new THREE.BoxGeometry(0.5, 0.7, 0.5), dark, -1.0, 0.55, -0.5);
      add(new THREE.BoxGeometry(1.8, 0.15, 0.3), chrome, 0, 0.25, 2.5);
      break;
    case 'hover_wedge':
    default:
      add(new THREE.BoxGeometry(1.7, 0.35, 3.5), bodyMat, 0, 0.45, 0.1);
      add(new THREE.ConeGeometry(0.8, 2.0, 4), bodyMat, 0, 0.55, 1.9, Math.PI / 2, 0, 0);
      add(new THREE.CylinderGeometry(0.4, 0.4, 0.15, 12), chrome, 0.85, 0.2, 0.8, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.4, 0.4, 0.15, 12), chrome, -0.85, 0.2, 0.8, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.4, 0.4, 0.15, 12), chrome, 0.85, 0.2, -0.8, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.4, 0.4, 0.15, 12), chrome, -0.85, 0.2, -0.8, 0, 0, Math.PI / 2);
      body.add(glow(0.6, 0.6, 0.2, a, 0.5, 0.4, -1.9));
      body.add(glow(0.6, 0.6, 0.2, a, -0.5, 0.4, -1.9));
      break;
  }

  // 悬浮光环 / 推进器（全车种）
  body.add(glow(1.2, 0.06, 0.06, c, 0, 0.12, 2.1));
  const thruster = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.07, 8, 20),
    new THREE.MeshBasicMaterial({ color: a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }),
  );
  thruster.rotation.x = Math.PI / 2;
  thruster.position.set(0, 0.4, -2.1);
  body.add(thruster);

  // 车顶武器塔造型差异
  const turret = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.28, 0.35, 8),
    dark,
  );
  turret.position.set(0, 0.85, 0.4);
  body.add(turret);

  const weaponMount = new THREE.Object3D();
  weaponMount.position.set(0, 1.05, 1.3);
  body.add(weaponMount);

  root.userData.weaponMount = weaponMount;
  root.userData.body = body;
  root.userData.collisionRadius = def.shape === 'tank_fortress' ? 1.7 : 1.35;
  root.add(body);
  return root;
}
