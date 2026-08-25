import * as THREE from 'three';
import { CAR_CATALOG, WEAPON_LABELS, buildCarMesh, getCarById, initCarAssets } from './cars.js';
import { TRACK_CATALOG, buildTrackEnvironment, getTrackPoints, sampleTrack, getTrackHalfWidth, getHazardFactor } from './tracks.js';
import { CinematicAudio } from './audio.js';
import { ParticlePool } from './particles.js';
import { WeaponFX, gatherTargets, WEAPON_FEEDBACK } from './weapons.js';
import { CollisionWorld } from './collision.js';
import { WeatherSystem } from './weather.js';
import { createInput, shouldShowTouchPad } from './input.js';
import { loadProgress, saveProgress, recordRaceResult, markTutorialDone, formatRecord } from './progress.js';
import { PAY, initDistribution, isTrackLocked, isCarLocked, isDiffLocked } from './pay.js';

const TOTAL_LAPS = 3;
const AI_COUNT = 5;
const BASE_SPEED = 42;
const WEAPON_COOLDOWN = 1.8;

const DIFFICULTY = {
  easy:   { label: '轻松', skill: 0.55, aggro: 0.25, speedMul: 0.88, fireChance: 0.003, rubber: 0.12 },
  normal: { label: '标准', skill: 0.78, aggro: 0.55, speedMul: 0.98, fireChance: 0.007, rubber: 0.06 },
  hard:   { label: '地狱', skill: 0.95, aggro: 0.9,  speedMul: 1.08, fireChance: 0.012, rubber: 0.02 },
};

const distro = initDistribution();
let demoRacesDone = 0;

// ── DOM ──
const $ = (id) => document.getElementById(id);
const menu = $('menu');
const results = $('results');
const hud = $('hud');
const countdownEl = $('countdown');
const carGrid = $('carGrid');
const trackGrid = $('trackGrid');
const carStats = $('carStats');

let selectedCarId = CAR_CATALOG[0].id;
let selectedTrackId = TRACK_CATALOG[0].id;
let selectedDifficulty = loadProgress().lastDifficulty || 'normal';
let playerBestLap = 0;
let lapStartTime = 0;
let finishCamT = 0;
let timeScale = 1;

// ── Three.js ──
const host = $('canvasHost');
const scene = new THREE.Scene();
const clock = new THREE.Clock();
const audio = new CinematicAudio();

let camera, trackData, racers = [], player = null;
let raceState = 'menu';
let raceTime = 0;
let particles = null;
let weaponFX = null;
let collisionWorld = null;
let weather = null;
let screenShake = 0;
let baseFov = 55;
const input = createInput();
input.attach(window);
input.bindTouchPad({
  up: $('tUp'), down: $('tDown'), left: $('tLeft'), right: $('tRight'),
  boost: $('tBoost'), fire: $('tFire'), cycle: $('tCycle'),
});

function setTouchPadVisible(show) {
  const pad = $('touchPad');
  if (!pad) return;
  // 手机/平板或窄屏显示；桌面宽屏默认隐藏
  const want = !!show && shouldShowTouchPad();
  pad.classList.toggle('show', want);
}

const glRenderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
applyQualitySettings();
glRenderer.setClearColor(0x4facfe, 1);
glRenderer.toneMapping = THREE.ACESFilmicToneMapping;
glRenderer.toneMappingExposure = 1.4;
host.appendChild(glRenderer.domElement);

function applyQualitySettings() {
  const mobile = shouldShowTouchPad();
  glRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 2));
  glRenderer.setSize(window.innerWidth, window.innerHeight);
  glRenderer.shadowMap.enabled = !mobile;
  glRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

// ── Menu UI ──
function renderMenu() {
  const badge = $('demoBadge');
  if (badge) badge.classList.toggle('hidden', !distro.isDemoOnly);

  carGrid.innerHTML = '';
  CAR_CATALOG.forEach((car) => {
    const locked = isCarLocked(distro.isDemoOnly, car.id, CAR_CATALOG);
    const card = document.createElement('div');
    card.className = 'card' + (car.id === selectedCarId ? ' selected' : '') + (locked ? ' locked' : '');
    card.innerHTML = `
      <div class="swatch" style="background:linear-gradient(135deg,#${car.color.toString(16).padStart(6,'0')},#${car.accent.toString(16).padStart(6,'0')})"></div>
      <div class="name">${car.name}${locked ? ' 🔒' : ''}</div>
      <div class="meta">${WEAPON_LABELS[car.weapon]}<br>速 ${(car.speed*100|0)} · 控 ${(car.handling*100|0)}</div>`;
    card.onclick = () => {
      if (locked) { showPaywall('car'); return; }
      selectedCarId = car.id;
      renderMenu();
    };
    carGrid.appendChild(card);
  });

  trackGrid.innerHTML = '';
  TRACK_CATALOG.forEach((tr) => {
    const locked = isTrackLocked(distro.isDemoOnly, tr.id);
    const card = document.createElement('div');
    card.className = 'card' + (tr.id === selectedTrackId ? ' selected' : '') + (locked ? ' locked' : '');
    card.innerHTML = `
      <div class="swatch" style="background:linear-gradient(135deg,#${(tr.skyTop||tr.fog).toString(16).padStart(6,'0')},#${(tr.skyBottom||tr.fog).toString(16).padStart(6,'0')})"></div>
      <div class="name">${tr.name}${locked ? ' 🔒' : ''}</div>
      <div class="meta">${tr.desc}</div>`;
    card.onclick = () => {
      if (locked) { showPaywall('track'); return; }
      selectedTrackId = tr.id;
      renderMenu();
    };
    trackGrid.appendChild(card);
  });

  // 试玩默认落到免费车/图
  if (distro.isDemoOnly) {
    if (isCarLocked(true, selectedCarId, CAR_CATALOG)) selectedCarId = CAR_CATALOG[0].id;
    if (isTrackLocked(true, selectedTrackId)) selectedTrackId = PAY.freeTracks[0];
    if (isDiffLocked(true, selectedDifficulty)) selectedDifficulty = PAY.freeDifficulty;
  }

  const c = getCarById(selectedCarId);
  const prog = loadProgress();
  const best = formatRecord(prog.bestTimeByTrack[selectedTrackId]);
  carStats.innerHTML = `
    <div class="stat"><label>极速</label><span>${(c.speed * 100 | 0)}</span></div>
    <div class="stat"><label>操控</label><span>${(c.handling * 100 | 0)}</span></div>
    <div class="stat"><label>装甲</label><span>${(c.armor * 100 | 0)}</span></div>
    <div class="stat"><label>武器</label><span style="font-size:11px">${WEAPON_LABELS[c.weapon]}</span></div>
    <div class="stat"><label>弹药库</label><span style="font-size:11px">${(c.weapons||[]).length}种</span></div>
    <div class="stat"><label>本图纪录</label><span style="font-size:11px">${best}</span></div>
    <div class="stat"><label>胜场</label><span>${prog.wins || 0}</span></div>
    <div class="stat"><label>场次</label><span>${prog.races || 0}</span></div>`;

  const diffRow = $('diffRow');
  if (diffRow) {
    diffRow.querySelectorAll('[data-diff]').forEach((btn) => {
      const locked = isDiffLocked(distro.isDemoOnly, btn.dataset.diff);
      btn.classList.toggle('selected', btn.dataset.diff === selectedDifficulty);
      btn.classList.toggle('locked', locked);
      btn.onclick = () => {
        if (locked) { showPaywall('difficulty'); return; }
        selectedDifficulty = btn.dataset.diff;
        const p = loadProgress();
        p.lastDifficulty = selectedDifficulty;
        saveProgress(p);
        renderMenu();
      };
    });
  }
}
renderMenu();

$('btnStart').onclick = () => startRace();
$('btnRetry').onclick = () => {
  if (distro.isDemoOnly && demoRacesDone >= PAY.freeRaces) {
    showPaywall('retry');
    return;
  }
  results.classList.add('hidden');
  startRace();
};
$('btnMenu').onclick = () => showMenu();
$('btnPaywallClose')?.addEventListener('click', () => {
  hidePaywall();
  showMenu();
});

function showPaywall(place) {
  const el = $('paywallScreen');
  const msg = $('paywallMsg');
  if (msg) {
    const reasons = {
      car: '试玩仅开放前 3 辆战车。',
      track: '试玩仅开放宇宙 / 云端两图。',
      difficulty: '试玩仅支持「轻松」难度。',
      retry: '试玩场次已用完。',
      finish: '本局试玩结束。',
    };
    msg.textContent = `${reasons[place] || '完整内容需购买。'}在 itch 支付 $1 下载完整包（8 车 · 6 图 · 三难度），或用爱发电赞助。`;
  }
  if (el) el.classList.add('show');
}

function hidePaywall() {
  $('paywallScreen')?.classList.remove('show');
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && raceState === 'racing') resetPlayer();
});
window.addEventListener('resize', onResize);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', onResize);
}

function onResize() {
  applyQualitySettings();
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (camera) {
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  // 横竖屏 / 窗口缩放后刷新触控条（桌面↔手机切换）
  if (raceState === 'racing' || raceState === 'countdown' || raceState === 'finish_cam') {
    setTouchPadVisible(raceState !== 'finish_cam');
  }
}

// ── Racer entity ──
function createRacer(def, isPlayer, startT, laneOffset = 0) {
  const mesh = buildCarMesh(def);
  scene.add(mesh);

  const trackPoints = getTrackPoints();
  const start = sampleTrack(trackPoints, startT);
  const side = new THREE.Vector3(-start.tangent.z, 0, start.tangent.x).normalize();

  mesh.position.copy(start.position).add(side.multiplyScalar(laneOffset));
  mesh.position.y = 0.35;
  const yaw = Math.atan2(start.tangent.x, start.tangent.z);
  mesh.rotation.y = yaw;

  return {
    def, mesh, isPlayer,
    trackT: startT,
    speed: 0,
    lateral: 0,
    drift: 0,
    hp: 100 * def.armor,
    maxHp: 100 * def.armor,
    lap: 0,
    lastCheckpoint: 0,
    finished: false,
    finishTime: 0,
    boost: 1,
    boostFuel: 1,
    weaponCd: 0,
    weaponIndex: 0,
    activeWeapon: def.weapon,
    stun: 0,
    hitSlow: 0,
    aiAggro: 0.5,
    aiSkill: 0.75,
    aiLane: laneOffset,
  };
}

function clearScene() {
  weather?.clear();
  weather = null;
  weaponFX?.clear();
  particles?.dispose();
  particles = null;
  weaponFX = null;
  racers.forEach(r => scene.remove(r.mesh));
  racers = [];
  player = null;
  collisionWorld = null;
  const env = scene.getObjectByName('environment');
  if (env) scene.remove(env);
}

function showMenu() {
  raceState = 'menu';
  audio.stopRace();
  clearScene();
  setTouchPadVisible(false);
  hidePaywall();
  menu.classList.remove('hidden');
  hud.classList.add('hidden');
  results.classList.add('hidden');
  countdownEl.classList.remove('show');
  renderMenu();
}

async function startRace() {
  if (distro.isDemoOnly) {
    if (isCarLocked(true, selectedCarId, CAR_CATALOG) || isTrackLocked(true, selectedTrackId) || isDiffLocked(true, selectedDifficulty)) {
      showPaywall('track');
      return;
    }
    if (demoRacesDone >= PAY.freeRaces) {
      showPaywall('retry');
      return;
    }
  }
  await audio.unlock();
  await initCarAssets();
  // 避免开始键残留焦点：手机/桌面按空格会再次触发按钮
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
  hidePaywall();
  menu.classList.add('hidden');
  results.classList.add('hidden');
  hud.classList.remove('hidden');
  clearScene();

  trackData = buildTrackEnvironment(scene, selectedTrackId);
  collisionWorld = new CollisionWorld();
  collisionWorld.setFromTrack(trackData.trackPoints, selectedTrackId);
  particles = new ParticlePool(scene);
  weaponFX = new WeaponFX(scene, particles);
  weather = new WeatherSystem(scene, audio);
  weather.start(selectedTrackId);
  camera = new THREE.PerspectiveCamera(baseFov, window.innerWidth / window.innerHeight, 0.5, 500);
  glRenderer.setClearColor(trackData.biome.skyBottom);

  const playerDef = getCarById(selectedCarId);
  player = createRacer(playerDef, true, 0, -4);
  racers.push(player);

  const diff = DIFFICULTY[selectedDifficulty] || DIFFICULTY.normal;
  const aiCars = CAR_CATALOG.filter(c => c.id !== selectedCarId);
  for (let i = 0; i < AI_COUNT; i++) {
    const def = aiCars[i % aiCars.length];
    const r = createRacer(def, false, 0, -4 + (i + 1) * 3.5);
    // 难度分层：车手技能/火力拉开
    const tier = i / Math.max(1, AI_COUNT - 1);
    r.aiSkill = THREE.MathUtils.clamp(diff.skill - 0.12 + tier * 0.22 + (Math.random() - 0.5) * 0.08, 0.35, 1.15);
    r.aiAggro = THREE.MathUtils.clamp(diff.aggro * (0.7 + tier * 0.5), 0.1, 1.2);
    r.aiLane = -3 + i * 1.6;
    racers.push(r);
  }

  raceTime = 0;
  playerBestLap = 0;
  lapStartTime = 0;
  finishCamT = 0;
  timeScale = 1;
  screenShake = 0;
  raceState = 'countdown';
  audio.startRace(selectedTrackId);
  setTouchPadVisible(true);
  weather?.setBudget?.(shouldShowTouchPad());
  showTutorialIfNeeded();

  await runCountdown();
  lapStartTime = 0;
  raceState = 'racing';
}

async function runCountdown() {
  if (window.__NEO_FAST__) {
    countdownEl.textContent = 'GO!';
    countdownEl.classList.add('show');
    await wait(120);
    countdownEl.classList.remove('show');
    return;
  }
  const seq = ['3', '2', '1', 'GO!'];
  for (const txt of seq) {
    countdownEl.textContent = txt;
    countdownEl.classList.add('show');
    if (txt !== 'GO!') audio.playStinger('count');
    else audio.playStinger('start');
    await wait(700);
    countdownEl.classList.remove('show');
    await wait(150);
  }
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function resetPlayer() {
  if (!player) return;
  const s = sampleTrack(trackData.trackPoints, player.trackT);
  player.mesh.position.copy(s.position);
  player.mesh.position.y = 0.35;
  player.speed *= 0.3;
  player.stun = 0.5;
}

// ── Input & driving ──
function updatePlayer(dt) {
  const r = player;
  const grip = weather?.getGripMod?.() || { handling: 1, maxSpeed: 1, lateralDamp: 1 };
  const cmd = input.consume();
  if (cmd.cyclePressed) cycleWeapon(r);

  // 受击：不完全锁死，保留微弱转向与滑行
  const stunned = r.stun > 0;
  if (stunned) r.stun -= dt;
  if (r.hitSlow > 0) r.hitSlow = Math.max(0, r.hitSlow - dt);

  const handling = r.def.handling * grip.handling * (stunned ? 0.35 : 1);
  const maxSpeed = BASE_SPEED * r.def.speed * grip.maxSpeed * (r.hitSlow > 0 ? 0.72 : 1);
  const speedRatio = r.speed / Math.max(1, maxSpeed);

  // 高速转向产生漂移滑移
  const steerIn = stunned ? cmd.steer * 0.4 : cmd.steer;
  r.drift = THREE.MathUtils.lerp(r.drift, steerIn * speedRatio * speedRatio * 1.4, 1 - Math.pow(0.02, dt));
  r.lateral += (steerIn * handling * 32 + r.drift * 10) * dt;
  const damp = Math.pow(0.04 * grip.lateralDamp, dt);
  r.lateral *= damp;

  const accel = stunned ? cmd.accel * 0.25 : cmd.accel;
  const boosting = !stunned && cmd.boost && r.boostFuel > 0.02;
  if (boosting) {
    // 氮气：起步爆发 + 持续推高顶速
    const kick = r.boostFuel > 0.85 ? 1.12 : 1;
    r.boost = 1.55 * kick;
    r.boostFuel = Math.max(0, r.boostFuel - dt * 0.42);
    if (Math.random() < 0.18) {
      audio.playBoost();
      const tail = r.mesh.position.clone().add(new THREE.Vector3(0, 0.3, -1.2).applyQuaternion(r.mesh.quaternion));
      particles?.trail(tail, r.def.accent, 6);
    }
  } else {
    r.boost = THREE.MathUtils.lerp(r.boost, 1, 1 - Math.pow(0.05, dt));
    // 低速回气快，高速回气慢
    const regen = 0.08 + (1 - speedRatio) * 0.14;
    r.boostFuel = Math.min(1, r.boostFuel + dt * regen);
  }

  if (accel > 0) r.speed += accel * (48 + handling * 8) * dt;
  else if (accel < 0) r.speed += accel * 70 * dt;
  else r.speed *= Math.pow(0.22, dt);

  r.speed = THREE.MathUtils.clamp(r.speed, 0, maxSpeed * r.boost * getHazardFactor(r.trackT));

  advanceRacer(r, dt);

  // 车身侧倾 / 俯仰（手感）
  if (r.mesh.userData.body) {
    r.mesh.userData.body.rotation.z = THREE.MathUtils.lerp(
      r.mesh.userData.body.rotation.z, -steerIn * 0.18 - r.drift * 0.08, 1 - Math.pow(0.001, dt),
    );
    r.mesh.userData.body.rotation.x = THREE.MathUtils.lerp(
      r.mesh.userData.body.rotation.x, boosting ? -0.06 : accel * -0.04, 1 - Math.pow(0.002, dt),
    );
  }

  if ((cmd.firePressed || cmd.fireHeld) && r.weaponCd <= 0 && !stunned) {
    fireWeapon(r);
    const fb = WEAPON_FEEDBACK[r.activeWeapon] || { cd: WEAPON_COOLDOWN, shake: 0.3 };
    r.weaponCd = fb.cd;
    screenShake = Math.max(screenShake, fb.shake);
  }
  if (r.weaponCd > 0) r.weaponCd -= dt;

  // Third-person camera + 氮气 FOV
  const fovTarget = boosting ? baseFov + 14 : baseFov + Math.abs(r.drift) * 4;
  camera.fov = THREE.MathUtils.lerp(camera.fov, fovTarget, dt * 5);
  camera.updateProjectionMatrix();
  const shake = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
  const back = new THREE.Vector3(0, 0, -1).applyQuaternion(r.mesh.quaternion);
  const camPos = r.mesh.position.clone()
    .add(back.multiplyScalar(14 + Math.abs(r.drift) * 1.5))
    .add(new THREE.Vector3(shake + r.drift * 0.8, 6.2 + shake, shake));
  camera.position.lerp(camPos, 1 - Math.pow(0.001, dt));
  camera.lookAt(r.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
  if (screenShake > 0) screenShake = Math.max(0, screenShake - dt * 2.8);
}

function advanceRacer(r, dt) {
  const pts = trackData.trackPoints;
  const forward = r.speed * dt * 0.0018;
  r.trackT = (r.trackT + forward) % 1;

  const s = sampleTrack(pts, r.trackT);
  const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
  const halfW = getTrackHalfWidth(r.trackT);
  r.lateral = THREE.MathUtils.clamp(r.lateral, -halfW + 1.2, halfW - 1.2);
  const pos = s.position.clone().add(side.multiplyScalar(r.lateral));
  pos.y = 0.35 + Math.sin(raceTime * 3 + r.trackT * 20) * 0.04;

  if (collisionWorld) {
    const res = collisionWorld.resolveRacer(r, pos, pts, r.trackT);
    pos.copy(res.pos);
    if (res.hit && r.isPlayer) {
      audio.playCollision();
      audio.playScrape();
      screenShake = Math.max(screenShake, 0.25);
      r.speed *= 0.9;
    }
  }

  r.mesh.position.lerp(pos, 1 - Math.pow(0.0001, dt));
  const yawOff = (r.drift || 0) * 0.25;
  const targetYaw = Math.atan2(s.tangent.x, s.tangent.z) + yawOff;
  r.mesh.rotation.y = THREE.MathUtils.lerp(r.mesh.rotation.y, targetYaw, 1 - Math.pow(0.00001, dt));

  // Lap detection
  const idx = Math.floor(r.trackT * pts.length);
  if (idx < r.lastCheckpoint - pts.length / 2) {
    if (r.isPlayer) {
      const lapTime = raceTime - lapStartTime;
      if (lapStartTime > 0 && (!playerBestLap || lapTime < playerBestLap)) playerBestLap = lapTime;
      lapStartTime = raceTime;
      audio.playLapComplete();
    }
    r.lap++;
    if (r.isPlayer && r.lap >= TOTAL_LAPS) finishRacer(r);
  }
  r.lastCheckpoint = idx;

  // Off-track slowdown（按动态半宽）
  if (Math.abs(r.lateral) > halfW - 2.5) r.speed *= 0.93;
}

function updateAI(dt) {
  const diff = DIFFICULTY[selectedDifficulty] || DIFFICULTY.normal;
  const playerProg = player ? player.lap + player.trackT : 0;

  racers.filter(r => !r.isPlayer && !r.finished).forEach((r, i) => {
    if (r.stun > 0) { r.stun -= dt; return; }
    if (r.hitSlow > 0) r.hitSlow = Math.max(0, r.hitSlow - dt);

    const grip = weather?.getGripMod?.() || { maxSpeed: 1 };
    let targetSpeed = BASE_SPEED * r.def.speed * diff.speedMul * r.aiSkill * grip.maxSpeed;
    // 橡胶带：落后追、领先放
    const myProg = r.lap + r.trackT;
    const gap = playerProg - myProg;
    if (gap > 0.08) targetSpeed *= 1 + Math.min(0.22, gap * diff.rubber * 4);
    if (gap < -0.12) targetSpeed *= 1 - Math.min(0.12, -gap * 0.15);

    // 窄道 / 危险区
    targetSpeed *= getHazardFactor(r.trackT) * (getTrackHalfWidth(r.trackT) < 10 ? 0.92 : 1);
    if (r.hitSlow > 0) targetSpeed *= 0.75;

    r.speed = THREE.MathUtils.lerp(r.speed, targetSpeed, dt * (0.55 + r.aiSkill * 0.5));

    // 变道超车：朝玩家侧线压或绕开
    const wantLane = r.aiLane + Math.sin(raceTime * (0.4 + r.aiSkill) + i) * (1.2 + r.aiAggro);
    let block = 0;
    if (player && Math.abs(myProg - playerProg) < 0.04) {
      block = Math.sign(r.lateral - player.lateral) * (0.8 + r.aiAggro);
    }
    r.lateral = THREE.MathUtils.lerp(r.lateral, wantLane + block, dt * (0.6 + r.aiSkill));
    advanceRacer(r, dt);

    const fireP = diff.fireChance * (0.5 + r.aiAggro);
    if (r.weaponCd <= 0 && Math.random() < fireP) {
      const target = findTarget(r);
      if (target && (r.aiAggro > 0.35 || Math.random() < 0.4)) {
        if (r.def.weapons?.length) {
          r.weaponIndex = Math.floor(Math.random() * r.def.weapons.length);
          r.activeWeapon = r.def.weapons[r.weaponIndex];
        }
        fireWeapon(r, target);
        const fb = WEAPON_FEEDBACK[r.activeWeapon] || { cd: WEAPON_COOLDOWN };
        r.weaponCd = fb.cd * (1.5 - r.aiAggro * 0.3);
      }
    }
    if (r.weaponCd > 0) r.weaponCd -= dt;
  });
}

function findTarget(from) {
  let best = null, bestD = 999;
  racers.forEach(r => {
    if (r === from || r.finished) return;
    const d = from.mesh.position.distanceTo(r.mesh.position);
    if (d < 35 && d < bestD) { bestD = d; best = r; }
  });
  return best;
}

function cycleWeapon(r) {
  const list = r.def.weapons || [r.def.weapon];
  r.weaponIndex = ((r.weaponIndex || 0) + 1) % list.length;
  r.activeWeapon = list[r.weaponIndex];
  if (r.isPlayer) {
    $('weaponHud').textContent = WEAPON_LABELS[r.activeWeapon] || r.activeWeapon;
  }
}

// ── Weapons ──
function fireWeapon(r, target = null) {
  const wType = r.activeWeapon || r.def.weapon;
  audio.playWeapon(wType);
  const mount = r.mesh?.userData?.weaponMount;
  const origin = new THREE.Vector3();
  if (mount) mount.getWorldPosition(origin);
  else origin.copy(r.mesh.position).add(new THREE.Vector3(0, 1, 1.2).applyQuaternion(r.mesh.quaternion));
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(r.mesh.quaternion);

  const aoe = wType === 'particle_storm' || wType === 'plasma';
  let targets = gatherTargets(r, racers, aoe ? 28 : 55);
  if (target) targets = [{ racer: target, dist: r.mesh.position.distanceTo(target.mesh.position) }, ...targets.filter(t => t.racer !== target)];

  if (wType.startsWith('laser') || wType === 'ion_stream') {
    targets = targets.filter(t => {
      const to = new THREE.Vector3().subVectors(t.racer.mesh.position, origin);
      return to.dot(forward) > 0;
    }).slice(0, 5);
  }
  if ((wType.startsWith('missile') || wType === 'plasma') && !targets.length) {
    const t = target || findTarget(r) || racers.find(x => x !== r && !x.finished);
    if (t) targets = [{ racer: t, dist: r.mesh.position.distanceTo(t.mesh.position) }];
  }

  const result = weaponFX.fire(wType, r, origin, forward, targets, damageRacer);
  const fb = WEAPON_FEEDBACK[wType];
  if (result?.flash || fb) screenShake = Math.max(screenShake, fb?.shake || 0.35);
  if (r.isPlayer) $('weaponHud').textContent = WEAPON_LABELS[wType] || wType;
}

function damageRacer(v, dmg, from) {
  v.hp -= dmg;
  v.stun = Math.min(0.55, 0.18 + dmg * 0.006);
  v.hitSlow = Math.max(v.hitSlow || 0, 0.55 + dmg * 0.01);
  v.speed *= 0.72;
  audio.playHit();
  flashMesh(v.mesh);
  screenShake = Math.max(screenShake, 0.18 + dmg * 0.004);
  if (v.hp <= 0) {
    v.hp = v.maxHp * 0.4;
    v.speed *= 0.35;
    v.stun = 0.9;
    v.hitSlow = 1.4;
  }
}

function damageExplosion(v, dmg, from) {
  audio.playExplosion();
  screenShake = 0.5;
  damageRacer(v, dmg, from);
}

function flashMesh(mesh) {
  mesh.traverse(c => {
    if (c.isMesh && c.material.emissive) {
      const orig = c.material.emissiveIntensity;
      c.material.emissiveIntensity = 2;
      setTimeout(() => { c.material.emissiveIntensity = orig; }, 120);
    }
  });
}

// ── Ranking ──
function getRankings() {
  return [...racers].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    const progA = a.lap + a.trackT;
    const progB = b.lap + b.trackT;
    return progB - progA;
  });
}

function getPlayerRank() {
  const sorted = getRankings();
  return sorted.indexOf(player) + 1;
}

function finishRacer(r) {
  if (r.finished) return;
  r.finished = true;
  r.finishTime = raceTime;
  if (r.isPlayer) beginFinishCam();
}

function beginFinishCam() {
  raceState = 'finish_cam';
  finishCamT = 1.6;
  timeScale = 0.28;
  setTouchPadVisible(false);
  audio.playStinger('win');
  countdownEl.textContent = 'FINISH';
  countdownEl.classList.add('show');
  screenShake = 0.6;
}

function endRace() {
  raceState = 'finished';
  timeScale = 1;
  countdownEl.classList.remove('show');
  setTouchPadVisible(false);
  audio.stopRace();
  const rank = getPlayerRank();
  const prog = recordRaceResult({
    trackId: selectedTrackId,
    time: raceTime,
    bestLap: playerBestLap || null,
    rank,
    difficulty: selectedDifficulty,
  });
  const isPB = prog.bestTimeByTrack[selectedTrackId] === raceTime;
  $('resultRank').textContent = `P${rank}`;
  $('resultMsg').textContent = rank === 1
    ? `冠军！${formatTime(raceTime)}${isPB ? ' · 新纪录' : ''}`
    : `完赛 ${formatTime(raceTime)} · 最佳圈 ${formatRecord(playerBestLap || prog.bestLapByTrack[selectedTrackId])}`;
  const detail = $('resultDetail');
  if (detail) {
    detail.innerHTML = `难度 ${DIFFICULTY[selectedDifficulty]?.label || ''} · 胜场 ${prog.wins} · 总场次 ${prog.races}<br>本图最佳 ${formatRecord(prog.bestTimeByTrack[selectedTrackId])}`;
  }
  if (distro.isDemoOnly) {
    demoRacesDone += 1;
    const buy = $('resultBuy');
    if (buy) buy.classList.remove('hidden');
  }
  hud.classList.add('hidden');
  results.classList.remove('hidden');
  if (distro.isDemoOnly && demoRacesDone >= PAY.freeRaces) {
    setTimeout(() => showPaywall('finish'), 900);
  }
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1);
  return `${m}:${s.padStart(4, '0')}`;
}

function showTutorialIfNeeded() {
  const tip = $('tutorialTip');
  if (!tip) return;
  if (loadProgress().tutorialDone || window.__NEO_FAST__) {
    tip.classList.add('hidden');
    return;
  }
  const mobile = shouldShowTouchPad();
  tip.innerHTML = mobile
    ? '左方向键驾驶 · 右下开火 · 氮气加速 · 切武器换弹'
    : 'WASD 驾驶 · Shift 氮气 · 空格/左键开火 · Q 切武器';
  tip.classList.remove('hidden');
  setTimeout(() => {
    tip.classList.add('hidden');
    markTutorialDone();
  }, 5500);
}

function updateHUD() {
  if (!player) return;
  $('lapHud').textContent = `${Math.min(player.lap + 1, TOTAL_LAPS)} / ${TOTAL_LAPS}`;
  $('timeHud').textContent = formatTime(raceTime);
  $('speedHud').textContent = `${(player.speed * 2.2 | 0)}`;
  $('hpHud').textContent = `${Math.max(0, player.hp | 0)}`;
  $('positionBadge').textContent = `P${getPlayerRank()}`;
  $('boostFill').style.transform = `scaleX(${player.boostFuel})`;
  if (player.weaponCd <= 0) $('weaponHud').textContent = WEAPON_LABELS[player.activeWeapon] || 'READY';
  else $('weaponHud').textContent = player.weaponCd.toFixed(1) + 's';
  const weatherEl = $('weatherHud');
  if (weatherEl && weather) weatherEl.textContent = weather.getLabel();
  audio.setEngine(player.speed / (BASE_SPEED * player.def.speed));
}

// ── Main loop ──
function animate() {
  requestAnimationFrame(animate);
  const raw = Math.min(clock.getDelta(), 0.05);
  const dt = raw * timeScale;

  if (raceState === 'racing') {
    raceTime += dt;
    updatePlayer(dt);
    updateAI(dt);
    weaponFX?.update(dt, damageExplosion);
    particles?.update(dt);
    if (weather && player) weather.update(dt, player.mesh.position);

    if (player && player.lap >= TOTAL_LAPS && !player.finished) finishRacer(player);

    racers.filter(r => !r.isPlayer).forEach(r => {
      if (!r.finished && r.lap >= TOTAL_LAPS) finishRacer(r);
    });

    updateHUD();
  } else if (raceState === 'finish_cam') {
    finishCamT -= raw;
    if (player && camera) {
      const back = new THREE.Vector3(0, 0, -1).applyQuaternion(player.mesh.quaternion);
      const camPos = player.mesh.position.clone().add(back.multiplyScalar(10)).add(new THREE.Vector3(0, 5, 0));
      camera.position.lerp(camPos, 0.08);
      camera.lookAt(player.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)));
      camera.fov = THREE.MathUtils.lerp(camera.fov, baseFov + 8, 0.05);
      camera.updateProjectionMatrix();
    }
    weaponFX?.update(dt, damageExplosion);
    particles?.update(dt);
    if (finishCamT <= 0) endRace();
  }

  if (trackData?.grid) trackData.grid.rotation.y += dt * 0.015;
  if (trackData?.group) {
    trackData.group.children.forEach(c => {
      if (c.isPoints) c.rotation.y += dt * 0.02;
    });
  }

  if (camera) glRenderer.render(scene, camera);
}

animate();
showMenu();
initCarAssets().catch(() => {});

// 压测 / 调试钩子
window.__NEO_DEBUG__ = {
  get raceState() { return raceState; },
  get player() { return !!player; },
  get racerCount() { return racers.length; },
  get weapon() { return player?.activeWeapon; },
  get touchShown() { return $('touchPad')?.classList.contains('show'); },
  get difficulty() { return selectedDifficulty; },
  get isDemoOnly() { return distro.isDemoOnly; },
};
window.__NEO_FAST__ = false;
window.__NEO_FORCE_FINISH__ = () => { if (player) { player.lap = TOTAL_LAPS; finishRacer(player); } };
