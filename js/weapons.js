import * as THREE from 'three';

/**
 * 武器库：激光 / 导弹 / 粒子三大类，多子类型
 * 按键：Space 开火 · Q 切换武器
 */

/** 冷却 / 震屏反馈（秒 / 强度） */
export const WEAPON_FEEDBACK = {
  laser_rail: { cd: 1.35, shake: 0.28 },
  laser_scatter: { cd: 1.55, shake: 0.22 },
  laser_beam: { cd: 1.9, shake: 0.32 },
  missile_homing: { cd: 2.1, shake: 0.38 },
  missile_swarm: { cd: 2.35, shake: 0.42 },
  missile_nuke: { cd: 3.0, shake: 0.55 },
  plasma: { cd: 1.85, shake: 0.4 },
  particle_storm: { cd: 2.5, shake: 0.48 },
  ion_stream: { cd: 1.45, shake: 0.25 },
};

export class WeaponFX {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.effects = [];
    this.projectiles = [];
  }

  clear() {
    this.effects.forEach(e => { this._remove(e.mesh); if (e.mesh2) this._remove(e.mesh2); });
    this.projectiles.forEach(p => this._remove(p.mesh));
    this.effects = [];
    this.projectiles = [];
  }

  fire(type, owner, origin, forward, targets, onHit) {
    const accent = owner.def.accent;
    const color = owner.def.color;
    const handlers = {
      laser_rail: () => this._laserRail(owner, origin, forward, targets, onHit, accent),
      laser_scatter: () => this._laserScatter(owner, origin, forward, targets, onHit, accent),
      laser_beam: () => this._laserBeam(owner, origin, forward, targets, onHit, color, accent),
      missile_homing: () => this._missile(owner, origin, forward, targets, onHit, accent, 2, 70, 28, false),
      missile_swarm: () => this._missile(owner, origin, forward, targets, onHit, 0x00ffaa, 6, 48, 18, true),
      missile_nuke: () => this._missile(owner, origin, forward, targets, onHit, 0xff4400, 1, 45, 55, false, true),
      plasma: () => this._plasma(owner, origin, forward, targets, onHit, color, accent),
      particle_storm: () => this._particleStorm(owner, origin, targets, onHit, accent),
      ion_stream: () => this._ionStream(owner, origin, forward, targets, onHit, accent),
    };
    return (handlers[type] || handlers.laser_rail)();
  }

  _laserRail(owner, origin, forward, targets, onHit, accent) {
    const end = origin.clone().add(forward.clone().multiplyScalar(55));
    this._beam(origin, end, accent, 0.28, 1);
    this._beam(origin, end, 0xffffff, 0.15, 0.6);
    this._muzzleFlash(origin, accent, 1.2);
    this.particles.burst(origin, 20, accent, 18, 0.5);
    targets.forEach(({ racer }) => {
      if (this._pointLineDist(racer.mesh.position, origin, end) < 3.2) {
        onHit(racer, 28, owner);
        this._impactSpark(racer.mesh.position, accent);
      }
    });
  }

  _laserScatter(owner, origin, forward, targets, onHit, accent) {
    const dirs = [-0.22, -0.12, -0.04, 0.04, 0.12, 0.22, -0.08, 0.08];
    dirs.forEach((off, i) => {
      const dir = forward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), off);
      dir.applyAxisAngle(new THREE.Vector3(1, 0, 0), (i % 2 ? 0.04 : -0.04));
      const end = origin.clone().add(dir.multiplyScalar(38));
      this._beam(origin, end, accent, 0.14, 0.7);
      targets.forEach(({ racer }) => {
        if (this._pointLineDist(racer.mesh.position, origin, end) < 3.8) onHit(racer, 10, owner);
      });
    });
    this._muzzleFlash(origin, accent, 0.8);
  }

  _laserBeam(owner, origin, forward, targets, onHit, color, accent) {
    const end = origin.clone().add(forward.clone().multiplyScalar(42));
    this._beam(origin, end, color, 0.45, 0.9);
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.2, 42, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    tube.position.copy(origin.clone().lerp(end, 0.5));
    tube.lookAt(end);
    tube.rotateX(Math.PI / 2);
    this.scene.add(tube);
    this.effects.push({ mesh: tube, life: 0.4, fade: true });
    targets.forEach(({ racer }) => {
      if (this._pointLineDist(racer.mesh.position, origin, end) < 5) {
        onHit(racer, 14, owner);
        this.particles.burst(racer.mesh.position, 12, accent, 10, 0.6);
      }
    });
  }

  _missile(owner, origin, forward, targets, onHit, accent, count, speed, dmg, swarm, nuke = false) {
    const pool = targets.length ? targets.map(t => t.racer) : [];
    for (let i = 0; i < count; i++) {
      const tgt = pool[i % Math.max(1, pool.length)] || null;
      if (!tgt && pool.length === 0) continue;
      const side = swarm ? (Math.random() - 0.5) * 2.5 : (i - (count - 1) / 2) * 1.1;
      const off = new THREE.Vector3(side, 0.3 + Math.random() * 0.3, 0).applyQuaternion(owner.mesh.quaternion);
      const pos = origin.clone().add(off);
      const mesh = this._makeMissile(accent, nuke ? 1.6 : swarm ? 0.7 : 1);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.projectiles.push({
        type: nuke ? 'nuke' : 'missile',
        owner, target: tgt, mesh, life: nuke ? 6 : 4.5,
        speed: speed + Math.random() * 8, dmg,
        vel: forward.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.05, 0)).normalize().multiplyScalar(28),
        trailT: 0, trailColor: accent, nuke,
      });
      this.particles.burst(pos, 8, accent, 10, 0.4);
    }
  }

  _plasma(owner, origin, forward, targets, onHit, color, accent) {
    for (let i = 0; i < 3; i++) {
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 10, 10),
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
      );
      const side = (i - 1) * 0.8;
      const pos = origin.clone().add(new THREE.Vector3(side, 0.2, 0).applyQuaternion(owner.mesh.quaternion));
      ball.position.copy(pos);
      this.scene.add(ball);
      this.projectiles.push({
        type: 'plasma', owner, target: targets[0]?.racer || null, mesh: ball,
        life: 2.2, speed: 55, dmg: 22,
        vel: forward.clone().multiplyScalar(40),
        trailT: 0, trailColor: color,
      });
    }
    this._muzzleFlash(origin, accent, 1.4);
  }

  _particleStorm(owner, origin, targets, onHit, accent) {
    this.particles.burst(origin, 80, accent, 28, 2.2);
    this.particles.burst(origin, 40, 0xffffff, 18, 1.5);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1 + i, 2.2 + i * 1.5, 32),
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ring.position.copy(origin).setY(0.7);
      ring.rotation.x = -Math.PI / 2;
      this.scene.add(ring);
      this.effects.push({ mesh: ring, life: 0.5 + i * 0.08, expand: 16 + i * 3 });
    }
    targets.filter(t => t.dist < 26).forEach(({ racer, dist }) => {
      onHit(racer, 12 + (1 - dist / 26) * 20, owner);
      this._impactSpark(racer.mesh.position, accent);
    });
    return { flash: true };
  }

  _ionStream(owner, origin, forward, targets, onHit, accent) {
    for (let i = 0; i < 12; i++) {
      const t = (i + 1) / 12;
      const p = origin.clone().add(forward.clone().multiplyScalar(t * 36));
      p.x += Math.sin(i * 1.7) * 0.4;
      this.particles.burst(p, 6, accent, 8, 0.3);
    }
    const end = origin.clone().add(forward.clone().multiplyScalar(40));
    this._beam(origin, end, accent, 0.35, 0.5);
    targets.forEach(({ racer }) => {
      if (this._pointLineDist(racer.mesh.position, origin, end) < 4.5) {
        onHit(racer, 12, owner);
        racer.stun = Math.max(racer.stun || 0, 0.55);
      }
    });
  }

  _pointLineDist(p, a, b) {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ap = new THREE.Vector3().subVectors(p, a);
    const t = THREE.MathUtils.clamp(ap.dot(ab) / ab.lengthSq(), 0, 1);
    return ap.sub(ab.multiplyScalar(t)).length();
  }

  _beam(a, b, color, life = 0.18, opacity = 0.95) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    const mid = a.clone().lerp(b, 0.5);
    const len = a.distanceTo(b);
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, len, 6, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    tube.position.copy(mid);
    tube.lookAt(b);
    tube.rotateX(Math.PI / 2);
    this.scene.add(tube);
    this.effects.push({ mesh: line, mesh2: tube, life, fade: true });
  }

  _muzzleFlash(pos, color, scale = 1) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.55 * scale, 8, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    flash.position.copy(pos);
    this.scene.add(flash);
    this.effects.push({ mesh: flash, life: 0.1, expand: 4 });
  }

  _impactSpark(pos, color) {
    this.particles.burst(pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 28, color, 16, 1.1);
    const boom = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 8, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    boom.position.copy(pos).add(new THREE.Vector3(0, 0.6, 0));
    this.scene.add(boom);
    this.effects.push({ mesh: boom, life: 0.22, expand: 7 });
  }

  _makeMissile(color, scale = 1) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(0.2 * scale, 1.0 * scale, 6),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, metalness: 0.8, roughness: 0.2 }),
    );
    body.rotation.x = Math.PI / 2;
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(0.85 * scale, 0.04, 0.3 * scale),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
    );
    g.add(body, wing);
    return g;
  }

  update(dt, onExplode) {
    this.projectiles = this.projectiles.filter(p => {
      p.life -= dt;
      p.trailT -= dt;
      if (p.trailT <= 0) {
        p.trailT = 0.03;
        this.particles.trail(p.mesh.position, p.trailColor || 0xff8844, p.nuke ? 6 : 3);
      }
      if (p.target) {
        const to = new THREE.Vector3().subVectors(p.target.mesh.position, p.mesh.position);
        const dist = to.length();
        const hitR = p.nuke ? 4.5 : p.type === 'plasma' ? 2.2 : 2.6;
        if (dist < hitR) {
          onExplode(p.target, p.dmg || 28, p.owner, p.mesh.position);
          if (p.nuke) {
            // AOE
            this._explosion(p.mesh.position, p.trailColor || 0xff4400, true);
          } else {
            this._explosion(p.mesh.position, p.trailColor || 0xff8844, false);
          }
          this._remove(p.mesh);
          return false;
        }
        to.normalize();
        p.vel.lerp(to.multiplyScalar(p.speed), dt * (p.type === 'plasma' ? 1.2 : 3));
        p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
        p.mesh.lookAt(p.target.mesh.position);
      } else {
        p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
      }
      if (p.life <= 0) { this._remove(p.mesh); return false; }
      return true;
    });

    this.effects = this.effects.filter(e => {
      if (e.delay) { e.age = (e.age || 0) + dt; if (e.age < e.delay) return true; }
      e.life -= dt;
      if (e.expand && e.mesh.scale) e.mesh.scale.multiplyScalar(1 + dt * e.expand);
      if (e.fade) {
        const o = Math.max(0, e.life * 3);
        if (e.mesh.material) e.mesh.material.opacity = o;
        if (e.mesh2?.material) e.mesh2.material.opacity = o * 0.3;
      }
      if (e.life <= 0) {
        this._remove(e.mesh);
        if (e.mesh2) this._remove(e.mesh2);
        return false;
      }
      return true;
    });
  }

  _explosion(pos, color, big = false) {
    this.particles.burst(pos, big ? 80 : 45, color, big ? 28 : 18, big ? 2 : 1.2);
    this.particles.burst(pos, big ? 40 : 20, 0xffffff, 14, 1);
    for (let i = 0; i < (big ? 3 : 2); i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.5, big ? 2.5 : 1.5, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ring.position.copy(pos).setY(0.8);
      ring.rotation.x = -Math.PI / 2;
      this.scene.add(ring);
      this.effects.push({ mesh: ring, life: 0.45 + i * 0.1, expand: big ? 22 : 16 });
    }
  }

  _remove(obj) {
    if (!obj) return;
    this.scene.remove(obj);
    obj.traverse?.(c => {
      if (c.geometry) c.geometry.dispose?.();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose?.());
        else c.material.dispose?.();
      }
    });
  }
}

export function gatherTargets(from, racers, maxDist) {
  return racers
    .filter(r => r !== from && !r.finished)
    .map(r => ({ racer: r, dist: from.mesh.position.distanceTo(r.mesh.position) }))
    .filter(x => x.dist < maxDist)
    .sort((a, b) => a.dist - b.dist);
}
