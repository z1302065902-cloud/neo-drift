import * as THREE from 'three';

/** 大雨 / 冰雹 / 闪电打雷 */
export class WeatherSystem {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.group = new THREE.Group();
    this.group.name = 'weather';
    this.mode = 'clear'; // clear | rain | hail | storm
    this.rain = null;
    this.hail = null;
    this.flashLight = null;
    this.thunderTimer = 0;
    this.rainVel = [];
    this.hailVel = [];
  }

  /** 按赛道选天气：海洋/森林雨；戈壁冰雹；宇宙/天空雷暴 */
  start(biomeId) {
    this.clear();
    const map = {
      ocean: 'rain',
      forest: 'rain',
      gobi: 'hail',
      desert: 'hail',
      cosmos: 'storm',
      sky: 'storm',
    };
    this.mode = map[biomeId] || 'storm';
    this.scene.add(this.group);

    this.flashLight = new THREE.PointLight(0xaaccff, 0, 400);
    this.flashLight.position.set(0, 80, 0);
    this.group.add(this.flashLight);

    if (this.mode === 'rain' || this.mode === 'storm') this._makeRain(this.mode === 'storm' ? 6500 : 4200);
    if (this.mode === 'hail' || this.mode === 'storm') this._makeHail(this.mode === 'storm' ? 900 : 1400);
    if (this.mode === 'storm') this.thunderTimer = 1.5 + Math.random() * 2;
    this.audio?.playWeatherStart?.(this.mode);
  }

  _makeRain(count) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.rainVel = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 160;
      pos[i * 3 + 1] = Math.random() * 50 + 5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 160;
      this.rainVel.push(18 + Math.random() * 22);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xe8ffff, size: 2.2, transparent: true, opacity: 0.88,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.group.add(this.rain);
  }

  _makeHail(count) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.hailVel = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 140;
      pos[i * 3 + 1] = Math.random() * 45 + 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 140;
      this.hailVel.push(28 + Math.random() * 25);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.hail = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 3.2, transparent: true, opacity: 1, depthWrite: false, sizeAttenuation: true,
    }));
    this.group.add(this.hail);
  }

  update(dt, followPos) {
    if (!followPos) return;
    this.group.position.set(followPos.x, 0, followPos.z);

    if (this.rain) {
      const arr = this.rain.geometry.attributes.position.array;
      for (let i = 0; i < this.rainVel.length; i++) {
        arr[i * 3 + 1] -= this.rainVel[i] * dt;
        arr[i * 3] -= 4 * dt;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 40 + Math.random() * 15;
          arr[i * 3] = (Math.random() - 0.5) * 160;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 160;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    if (this.hail) {
      const arr = this.hail.geometry.attributes.position.array;
      for (let i = 0; i < this.hailVel.length; i++) {
        arr[i * 3 + 1] -= this.hailVel[i] * dt;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 35 + Math.random() * 20;
          arr[i * 3] = (Math.random() - 0.5) * 140;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 140;
          if (Math.random() < 0.08) this.audio?.playHailHit?.();
        }
      }
      this.hail.geometry.attributes.position.needsUpdate = true;
    }

    if (this.mode === 'storm' || this.mode === 'rain') {
      this.thunderTimer -= dt;
      if (this.thunderTimer <= 0) {
        this._strikeLightning();
        this.thunderTimer = 2.5 + Math.random() * 5;
      }
    }

    if (this.flashLight && this.flashLight.intensity > 0) {
      this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 40);
    }
  }

  _strikeLightning() {
    const x = (Math.random() - 0.5) * 100;
    const z = (Math.random() - 0.5) * 100;
    this.flashLight.position.set(x, 70, z);
    this.flashLight.intensity = 25 + Math.random() * 20;
    this.flashLight.color.setHex(Math.random() > 0.5 ? 0xffffff : 0xaaccff);

    // 闪电折线
    const pts = [new THREE.Vector3(x, 90, z)];
    let y = 90;
    while (y > 5) {
      y -= 8 + Math.random() * 12;
      pts.push(new THREE.Vector3(
        pts[pts.length - 1].x + (Math.random() - 0.5) * 8,
        Math.max(2, y),
        pts[pts.length - 1].z + (Math.random() - 0.5) * 8,
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.group.add(line);
    setTimeout(() => this.group.remove(line), 180);

    this.audio?.playThunder?.();
  }

  clear() {
    if (this.group.parent) this.scene.remove(this.group);
    while (this.group.children.length) {
      const c = this.group.children[0];
      this.group.remove(c);
      c.geometry?.dispose?.();
      c.material?.dispose?.();
    }
    this.rain = null;
    this.hail = null;
    this.flashLight = null;
    this.mode = 'clear';
  }

  getLabel() {
    return { rain: '暴雨', hail: '冰雹', storm: '雷暴', clear: '晴' }[this.mode] || '';
  }

  /** 天气对操控/极速的修正系数 */
  getGripMod() {
    if (this.mode === 'storm') return { handling: 0.82, maxSpeed: 0.9, lateralDamp: 0.92 };
    if (this.mode === 'rain') return { handling: 0.88, maxSpeed: 0.95, lateralDamp: 0.94 };
    if (this.mode === 'hail') return { handling: 0.93, maxSpeed: 0.92, lateralDamp: 0.96 };
    return { handling: 1, maxSpeed: 1, lateralDamp: 1 };
  }

  /** 低端机：减粒子 */
  setBudget(mobile) {
    if (!mobile) return;
    if (this.rain) this.rain.material.size *= 0.85;
    if (this.hail) this.hail.material.size *= 0.9;
  }
}
