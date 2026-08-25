/**
 * 分发 / 收款：与 Village Adventure 同一套三渠道
 * itch $1 下载完整包 · 爱发电国内 · Vercel/GitHub 试玩墙
 */
export const PAY = {
  itchUrl: 'https://zsy2026.itch.io/neo-drift',
  afdianUrl: 'https://afdian.com/item/9a3adaf2a06011f1848d52540025c377',
  /** 试玩可用赛道 */
  freeTracks: ['cosmos', 'sky'],
  /** 试玩可用前 N 辆车 */
  freeCarCount: 3,
  /** 试玩仅轻松难度 */
  freeDifficulty: 'easy',
  /** 试玩最多完赛次数，之后弹墙 */
  freeRaces: 1,
};

export function initDistribution() {
  const host = location.hostname;
  const params = new URLSearchParams(location.search);
  const hasFullAccess = params.get('full') === '1';
  const isFreeMirror = /vercel\.app|github\.io|localhost|127\.0\.0\.1/.test(host);
  const isDemoOnly = !hasFullAccess && (params.get('demo') === '1' || isFreeMirror);
  return { hasFullAccess, isFreeMirror, isDemoOnly };
}

export function isTrackLocked(isDemoOnly, trackId) {
  return isDemoOnly && !PAY.freeTracks.includes(trackId);
}

export function isCarLocked(isDemoOnly, carId, catalog) {
  if (!isDemoOnly) return false;
  const freeIds = catalog.slice(0, PAY.freeCarCount).map((c) => c.id);
  return !freeIds.includes(carId);
}

export function isDiffLocked(isDemoOnly, diff) {
  return isDemoOnly && diff !== PAY.freeDifficulty;
}
