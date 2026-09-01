/**
 * 跨端压测：iPhone / Android / Mac / PC 各模拟 N 局
 * 用法：在 neo-race 目录 node stress-playtest.mjs
 * 或由 Playwright 注入执行
 */
export async function runStressSuite(page, racesPerDevice = 50) {
  const devices = [
    { id: 'iphone', w: 390, h: 844, touch: true, ua: 'iPhone' },
    { id: 'android', w: 412, h: 915, touch: true, ua: 'Android' },
    { id: 'mac', w: 1440, h: 900, touch: false, ua: 'Macintosh' },
    { id: 'pc', w: 1920, h: 1080, touch: false, ua: 'Windows' },
  ];

  const report = { startedAt: Date.now(), devices: {}, totals: { ok: 0, fail: 0, errors: [] } };

  for (const dev of devices) {
    const drep = { ok: 0, fail: 0, issues: [], samples: [] };
    await page.setViewportSize({ width: dev.w, height: dev.h });

    for (let i = 0; i < racesPerDevice; i++) {
      const carIdx = i % 8;
      const trackIdx = i % 6;
      const result = await page.evaluate(async ({ carIdx, trackIdx, touch, round }) => {
        const issues = [];
        const errs = [];
        const onErr = (e) => errs.push(String(e?.message || e));
        window.addEventListener('error', onErr);
        window.addEventListener('unhandledrejection', (e) => errs.push(String(e.reason)));

        try {
          // 回菜单
          const btnMenu = document.getElementById('btnMenu');
          const results = document.getElementById('results');
          if (results && !results.classList.contains('hidden') && btnMenu) btnMenu.click();
          await new Promise(r => setTimeout(r, 80));

          const menu = document.getElementById('menu');
          if (menu?.classList.contains('hidden')) {
            // 强制显示菜单
            menu.classList.remove('hidden');
          }

          const cars = [...document.querySelectorAll('#carGrid .card')];
          const tracks = [...document.querySelectorAll('#trackGrid .card')];
          if (cars.length < 8) issues.push('carGrid_lt_8:' + cars.length);
          if (tracks.length < 6) issues.push('trackGrid_lt_6:' + tracks.length);
          cars[carIdx % cars.length]?.click();
          tracks[trackIdx % tracks.length]?.click();

          document.getElementById('btnStart')?.click();
          await new Promise(r => setTimeout(r, 3200)); // countdown

          const hud = document.getElementById('hud');
          if (hud?.classList.contains('hidden')) issues.push('hud_hidden_after_start');

          const touchPad = document.getElementById('touchPad');
          const touchShown = touchPad?.classList.contains('show');
          if (touch && !touchShown) issues.push('touchPad_missing_on_mobile');
          // desktop may or may not show depending on width — only flag if mobile missing

          // 模拟操作
          const fire = () => {
            if (touch) {
              const btn = document.getElementById('tFire');
              btn?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
              btn?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            } else {
              window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
              window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
              window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 200, clientY: 200 }));
              window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
            }
          };
          const cycle = () => {
            if (touch) {
              document.getElementById('tCycle')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            } else {
              window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true }));
              window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ', bubbles: true }));
            }
          };
          const drive = () => {
            if (touch) {
              const up = document.getElementById('tUp');
              const left = document.getElementById('tLeft');
              up?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
              left?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
              setTimeout(() => {
                up?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                left?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
              }, 400);
            } else {
              window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
              window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }));
              setTimeout(() => {
                window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
                window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA', bubbles: true }));
              }, 400);
            }
          };

          drive();
          cycle();
          fire();
          await new Promise(r => setTimeout(r, 500));
          fire();
          cycle();

          const weapon = document.getElementById('weaponHud')?.textContent || '';
          const speed = document.getElementById('speedHud')?.textContent || '';
          const hp = document.getElementById('hpHud')?.textContent || '';
          if (!weapon) issues.push('weaponHud_empty');
          if (hp === '' || Number.isNaN(Number(hp))) issues.push('hp_invalid:' + hp);

          // 检查 canvas
          const canvas = document.querySelector('canvas');
          if (!canvas) issues.push('no_canvas');
          if (canvas && (canvas.width < 10 || canvas.height < 10)) issues.push('canvas_tiny');

          // 暴露的内部状态（若有）
          const exposed = window.__NEO_DEBUG__;
          if (exposed) {
            if (exposed.raceState !== 'racing' && exposed.raceState !== 'countdown') {
              issues.push('bad_raceState:' + exposed.raceState);
            }
            if (!exposed.player) issues.push('no_player');
            if ((exposed.racerCount || 0) < 2) issues.push('few_racers:' + exposed.racerCount);
          }

          window.removeEventListener('error', onErr);
          return {
            ok: issues.length === 0 && errs.length === 0,
            issues, errs: errs.slice(0, 5),
            weapon, speed, hp, touchShown: !!touchShown,
            round, carIdx, trackIdx,
          };
        } catch (e) {
          window.removeEventListener('error', onErr);
          return { ok: false, issues: ['exception:' + e.message], errs, round };
        }
      }, { carIdx, trackIdx, touch: dev.touch, round: i });

      if (result.ok) drep.ok++;
      else {
        drep.fail++;
        drep.issues.push(result);
      }
      if (i < 3 || !result.ok) drep.samples.push(result);
    }

    report.devices[dev.id] = drep;
    report.totals.ok += drep.ok;
    report.totals.fail += drep.fail;
  }

  report.elapsedMs = Date.now() - report.startedAt;
  return report;
}
