/** 电影感 WebAudio + 用户 BGM MP3 循环 */
const BGM_FILES = {
  cosmos: 'track-fury.mp3',
  sky: 'track-fury.mp3',
  ocean: 'track-fury.mp3',
  forest: 'track-fury.mp3',
  gobi: 'racing-rush.mp3',
  desert: 'racing-rush.mp3',
};

export class CinematicAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.unlocked = false;
    this.engineGain = null;
    this.engineOscs = [];
    this.padGain = null;
    this.bgmGain = null;
    this.bassGain = null;
    this.windGain = null;
    this.windOsc = null;
    this.reverb = null;
    this.biomeId = 'cosmos';
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.racing = false;
    this.bgmEl = new Audio();
    this.bgmEl.loop = true;
    this.bgmEl.volume = 0.42;
    this.useMp3Bgm = true;
    this.lastScrape = 0;
    this.lastWind = 0;
    this.lastHail = 0;
    this.rainGain = null;
    this.rainTimer = null;
  }

  async unlock() {
    if (this.unlocked) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.62;
    this.master.connect(this.ctx.destination);

    this.reverb = this._makeReverb(1.8, 2.5);
    this.reverb.connect(this.master);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.master);

    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0;
    this.padGain.connect(this.reverb);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0;
    this.bgmGain.connect(this.reverb);

    this.bassGain = this.ctx.createGain();
    this.bassGain.gain.value = 0;
    this.bassGain.connect(this.master);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    this.windGain.connect(this.master);

    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0;
    this.rainGain.connect(this.master);

    this.unlocked = true;
  }

  startRace(biomeId) {
    if (!this.ctx) return;
    this.biomeId = biomeId;
    this.racing = true;
    this.bgmStep = 0;
    this._startEngineLayers();
    this._startAmbientPad(biomeId);
    this._startWindLayer();
    if (this.useMp3Bgm) this._startMp3Bgm(biomeId);
    else {
      this._startBgmLoop(biomeId);
      this._startBassPulse(biomeId);
    }
  }

  _startMp3Bgm(biomeId) {
    const file = BGM_FILES[biomeId] || BGM_FILES.cosmos;
    this.bgmEl.src = `assets/audio/${file}`;
    this.bgmEl.currentTime = 0;
    this.bgmEl.play().catch(() => {});
  }

  stopRace() {
    this.racing = false;
    this.bgmEl.pause();
    this.bgmEl.currentTime = 0;
    if (this.bgmTimer) { clearInterval(this.bgmTimer); this.bgmTimer = null; }
    if (this.rainTimer) { clearInterval(this.rainTimer); this.rainTimer = null; }
    this.engineOscs.forEach(o => { try { o.stop(); } catch (_) {} });
    this.engineOscs = [];
    const t = this.ctx?.currentTime ?? 0;
    if (this.padGain) this.padGain.gain.setTargetAtTime(0, t, 0.4);
    if (this.bgmGain) this.bgmGain.gain.setTargetAtTime(0, t, 0.4);
    if (this.bassGain) this.bassGain.gain.setTargetAtTime(0, t, 0.4);
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, t, 0.4);
    if (this.windGain) this.windGain.gain.setTargetAtTime(0, t, 0.4);
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(0, t, 0.4);
  }

  setEngine(speedNorm) {
    if (!this.engineGain || !this.engineOscs.length) return;
    const t = this.ctx.currentTime;
    const n = Math.min(1, Math.max(0, speedNorm));
    this.engineGain.gain.setTargetAtTime(0.06 + n * 0.28, t, 0.06);
    this.engineOscs[0].frequency.setTargetAtTime(45 + n * 90, t, 0.08);
    if (this.engineOscs[1]) this.engineOscs[1].frequency.setTargetAtTime(120 + n * 280, t, 0.06);
    if (this.engineOscs[2]) this.engineOscs[2].frequency.setTargetAtTime(800 + n * 1200, t, 0.04);
    if (n > 0.55 && t - this.lastWind > 0.15) {
      this.lastWind = t;
      this._setWind(n);
    }
  }

  _startWindLayer() {
    const t = this.ctx.currentTime;
    this.windOsc = this.ctx.createOscillator();
    this.windOsc.type = 'pink' in this.ctx ? 'pink' : 'sawtooth';
    this.windOsc.type = 'sawtooth';
    this.windOsc.frequency.value = 200;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 0.4;
    this.windOsc.connect(f).connect(this.windGain);
    this.windOsc.start(t);
  }

  _setWind(n) {
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(n * 0.08, t, 0.12);
    if (this.windOsc) this.windOsc.frequency.setTargetAtTime(300 + n * 800, t, 0.1);
  }

  playCollision() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noiseBurst(0.12, 400, 0.28, t);
    this._tone(t, 120, 40, 0.18, 'square', 0.22, this.reverb);
  }

  playScrape() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.lastScrape < 0.25) return;
    this.lastScrape = t;
    this._noiseBurst(0.2, 2200, 0.12, t);
  }

  playLapComplete() {
    if (!this.ctx) return;
    this.playStinger('lap');
  }

  playWeapon(type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (type === 'laser_rail' || type === 'laser') {
      this._sweep(t, 1400, 200, 0.1, 'sawtooth', 0.22);
      this._tone(t, 1200, 400, 0.12, 'square', 0.2, this.reverb);
      this._noiseBurst(0.08, 2800, 0.15, t);
    } else if (type === 'laser_scatter') {
      for (let i = 0; i < 6; i++) {
        this._tone(t + i * 0.025, 900 + i * 60, 500, 0.05, 'square', 0.1, this.reverb);
      }
      this._noiseBurst(0.1, 2200, 0.14, t);
    } else if (type === 'laser_beam') {
      this._tone(t, 440, 220, 0.4, 'sawtooth', 0.16, this.reverb);
      this._noiseBurst(0.35, 1600, 0.1, t);
    } else if (type === 'missile_homing' || type === 'missile') {
      this._noiseBurst(0.15, 400, 0.22, t);
      this._sweep(t, 180, 55, 0.35, 'square', 0.16);
    } else if (type === 'missile_swarm') {
      for (let i = 0; i < 5; i++) this._tone(t + i * 0.04, 220 - i * 15, 80, 0.12, 'square', 0.1, this.reverb);
      this._noiseBurst(0.25, 500, 0.18, t);
    } else if (type === 'missile_nuke') {
      this._noiseBurst(0.2, 200, 0.3, t);
      this._tone(t, 90, 30, 0.5, 'sine', 0.28, this.reverb);
      this._sweep(t, 160, 40, 0.45, 'sawtooth', 0.18);
    } else if (type === 'plasma' || type === 'pulse') {
      this._tone(t, 80, 30, 0.4, 'sine', 0.3, this.reverb);
      this._tone(t, 180, 60, 0.3, 'triangle', 0.18, this.reverb);
      this._noiseBurst(0.3, 350, 0.16, t);
    } else if (type === 'particle_storm') {
      this._noiseBurst(0.5, 900, 0.22, t);
      this._noiseBurst(0.4, 400, 0.18, t + 0.05);
      this._tone(t, 55, 25, 0.55, 'sine', 0.25, this.reverb);
    } else if (type === 'ion_stream') {
      this._sweep(t, 600, 1200, 0.35, 'sine', 0.14);
      this._noiseBurst(0.3, 1800, 0.12, t);
    }
  }

  playWeatherStart(mode) {
    if (!this.ctx) return;
    if (this.rainTimer) { clearInterval(this.rainTimer); this.rainTimer = null; }
    if (mode === 'rain' || mode === 'storm') {
      this.rainGain.gain.setTargetAtTime(mode === 'storm' ? 0.18 : 0.12, this.ctx.currentTime, 0.8);
      this.rainTimer = setInterval(() => {
        if (!this.racing) return;
        this._noiseBurst(0.08, 3000 + Math.random() * 1500, 0.04, this.ctx.currentTime);
      }, 90);
    }
    if (mode === 'hail') {
      this.rainGain.gain.setTargetAtTime(0.08, this.ctx.currentTime, 0.5);
    }
  }

  playThunder() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noiseBurst(0.8, 80, 0.45, t);
    this._noiseBurst(0.5, 200, 0.3, t + 0.08);
    this._tone(t, 45, 20, 0.9, 'sine', 0.35, this.reverb);
    this._tone(t + 0.1, 90, 30, 0.6, 'triangle', 0.2, this.reverb);
  }

  playHailHit() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.lastHail < 0.08) return;
    this.lastHail = t;
    this._noiseBurst(0.04, 4000, 0.08, t);
    this._tone(t, 1800 + Math.random() * 400, 900, 0.04, 'square', 0.06, this.master);
  }

  playHit() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noiseBurst(0.1, 1800, 0.25, t);
    this._tone(t, 200, 50, 0.2, 'triangle', 0.28, this.reverb);
    this._tone(t + 0.03, 800, 200, 0.12, 'square', 0.15, this.reverb);
  }

  playExplosion() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noiseBurst(0.5, 120, 0.35, t);
    this._noiseBurst(0.3, 600, 0.2, t + 0.05);
    this._tone(t, 80, 30, 0.45, 'sine', 0.3, this.reverb);
  }

  playBoost() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._sweep(t, 150, 900, 0.45, 'sawtooth', 0.18);
    this._noiseBurst(0.5, 1200, 0.14, t);
  }

  playStinger(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const scales = {
      start: [220, 277, 330, 440, 554],
      win: [330, 415, 523, 659, 831],
      count: [440, 440, 554, 880],
      lap: [523, 659, 784],
    };
    (scales[kind] || scales.start).forEach((freq, i) => {
      this._tone(t + i * 0.07, freq, freq * 1.02, 0.35, 'sine', 0.14, this.reverb);
    });
  }

  _startEngineLayers() {
    const t = this.ctx.currentTime;
    const types = ['sawtooth', 'square', 'sine'];
    const filters = [180, 600, 2000];
    types.forEach((type, i) => {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = 45 + i * 60;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filters[i];
      o.connect(f).connect(this.engineGain);
      o.start(t);
      this.engineOscs.push(o);
    });
    this.engineGain.gain.setTargetAtTime(0.08, t, 0.6);
  }

  _startAmbientPad(biomeId) {
    const t = this.ctx.currentTime;
    const chords = {
      cosmos: [[130.8, 164.8, 196], [155.6, 196, 233.1]],
      sky: [[174.6, 220, 261.6], [196, 246.9, 293.7]],
      ocean: [[116.5, 146.8, 174.6], [130.8, 164.8, 196]],
      gobi: [[146.8, 185, 220], [164.8, 207.6, 246.9]],
      desert: [[155.6, 196, 233.1], [174.6, 220, 261.6]],
      forest: [[123.5, 155.6, 185], [130.8, 164.8, 196]],
    }[biomeId] || [[130.8, 164.8, 196]];

    chords.flat().forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.value = 0.025 - (i % 3) * 0.004;
      o.connect(g).connect(this.padGain);
      o.start(t);
    });
    this.padGain.gain.setTargetAtTime(0.5, t, 1.5);
  }

  _startBassPulse(biomeId) {
    const t = this.ctx.currentTime;
    this.bassGain.gain.setTargetAtTime(0.35, t, 0.8);
    const roots = { cosmos: 55, sky: 65.4, ocean: 49, gobi: 73.4, desert: 82.4, forest: 58.3 };
    this._bassRoot = roots[biomeId] || 55;
  }

  _startBgmLoop(biomeId) {
    const t = this.ctx.currentTime;
    this.bgmGain.gain.setTargetAtTime(0.22, t, 1);
    const patterns = {
      cosmos: [0, 3, 7, 3, 10, 7, 5, 3],
      sky: [0, 4, 7, 11, 7, 4, 2, 0],
      ocean: [0, 5, 7, 10, 7, 5, 3, 0],
      gobi: [0, 2, 5, 7, 5, 2, 0, 2],
      desert: [0, 3, 5, 7, 10, 7, 5, 0],
      forest: [0, 4, 5, 7, 5, 4, 2, 0],
    };
    this._arpPattern = patterns[biomeId] || patterns.cosmos;
    this._arpBase = { cosmos: 220, sky: 261.6, ocean: 196, gobi: 246.9, desert: 220, forest: 233.1 }[biomeId] || 220;

    if (this.bgmTimer) clearInterval(this.bgmTimer);
    this.bgmTimer = setInterval(() => {
      if (!this.racing || !this.ctx) return;
      this._playArpStep();
      if (this.bgmStep % 4 === 0) this._playBassHit();
      this.bgmStep++;
    }, 160);
  }

  _playArpStep() {
    const t = this.ctx.currentTime;
    const semi = this._arpPattern[this.bgmStep % this._arpPattern.length];
    const freq = this._arpBase * Math.pow(2, semi / 12);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(this.bgmGain);
    o.start(t);
    o.stop(t + 0.16);
  }

  _playBassHit() {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.value = this._bassRoot;
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.bassGain);
    o.start(t);
    o.stop(t + 0.28);
  }

  _tone(t, f0, f1, dur, type, vol, dest = this.master) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.02);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _sweep(t, f0, f1, dur, type, vol, dest = this.master) {
    this._tone(t, f0, f1, dur, type, vol, dest);
  }

  _noiseBurst(dur, freq, vol, t = this.ctx.currentTime) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    filt.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(g).connect(this.reverb || this.master);
    src.start(t);
  }

  _makeReverb(duration, decay) {
    const rate = this.ctx.sampleRate;
    const len = rate * duration;
    const impulse = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    const conv = this.ctx.createConvolver();
    conv.buffer = impulse;
    const g = this.ctx.createGain();
    g.gain.value = 0.35;
    conv.connect(g);
    return g;
  }
}
