/** 本地纪录：圈速 / 完赛 / 胜场 / 首局引导 */
const KEY = 'neo-drift-progress-v1';

const DEFAULT = {
  wins: 0,
  races: 0,
  tutorialDone: false,
  bestTimeByTrack: {},
  bestLapByTrack: {},
  lastDifficulty: 'normal',
};

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT, bestTimeByTrack: {}, bestLapByTrack: {} };
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT, bestTimeByTrack: {}, bestLapByTrack: {} };
  }
}

export function saveProgress(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch { /* quota / private mode */ }
}

export function recordRaceResult({ trackId, time, bestLap, rank, difficulty }) {
  const p = loadProgress();
  p.races = (p.races || 0) + 1;
  if (rank === 1) p.wins = (p.wins || 0) + 1;
  p.lastDifficulty = difficulty || p.lastDifficulty;
  if (Number.isFinite(time)) {
    const prev = p.bestTimeByTrack[trackId];
    if (prev == null || time < prev) p.bestTimeByTrack[trackId] = time;
  }
  if (Number.isFinite(bestLap) && bestLap > 0) {
    const prev = p.bestLapByTrack[trackId];
    if (prev == null || bestLap < prev) p.bestLapByTrack[trackId] = bestLap;
  }
  saveProgress(p);
  return p;
}

export function markTutorialDone() {
  const p = loadProgress();
  p.tutorialDone = true;
  saveProgress(p);
}

export function formatRecord(t) {
  if (t == null || !Number.isFinite(t)) return '—';
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1);
  return `${m}:${s.padStart(4, '0')}`;
}
