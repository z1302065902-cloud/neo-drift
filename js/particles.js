import * as THREE from 'three';

/** 轻量粒子池 — 参考 synthwave 竞速的 nitro/爆炸碎屑 */
export class ParticlePool {
  constructor(scene, max = 600) {
    this.scene = scene;
    this.max = max;
    this.live = [];
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({
      size: 0.55, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    scene.add(this.points);
    this._free = [...Array(max).keys()];
  }

  burst(origin, count, color, speed = 12, spread = 1) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count && this._free.length; i++) {
      const id = this._free.pop();
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        Math.random() * spread * 0.6,
        (Math.random() - 0.5) * spread,
      ).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.live.push({
        id, life: 0.35 + Math.random() * 0.45, max: 0.8,
        pos: origin.clone(),
        vel: dir,
        drag: 0.92 + Math.random() * 0.06,
        r: c.r, g: c.g, b: c.b,
      });
    }
  }

  trail(origin, color, n = 2) {
    this.burst(origin, n, color, 4, 0.3);
  }

  update(dt) {
    const pos = this.pos;
    const col = this.col;
    let idx = 0;
    this.live = this.live.filter(p => {
      p.life -= dt;
      if (p.life <= 0) {
        this._free.push(p.id);
        return false;
      }
      p.vel.multiplyScalar(Math.pow(p.drag, dt * 60));
      p.pos.add(p.vel.clone().multiplyScalar(dt));
      const t = p.life / p.max;
      pos[p.id * 3] = p.pos.x;
      pos[p.id * 3 + 1] = p.pos.y;
      pos[p.id * 3 + 2] = p.pos.z;
      col[p.id * 3] = p.r * t;
      col[p.id * 3 + 1] = p.g * t;
      col[p.id * 3 + 2] = p.b * t;
      idx++;
      return true;
    });
    for (let i = 0; i < this.max; i++) {
      if (!this.live.find(p => p.id === i)) {
        pos[i * 3 + 1] = -9999;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
  }
}
