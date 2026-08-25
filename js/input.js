/**
 * 跨端输入：Mac / PC 键盘鼠标 + 手机触屏
 * 开火：空格 / E / F / 鼠标左键 / 触屏「开火」
 * 切武器：Q / Tab / C / 鼠标右键 / 滚轮 / 触屏「切武器」
 */
export function createInput() {
  const state = {
    accel: 0,
    steer: 0,
    boost: false,
    fireHeld: false,
    firePressed: false,
    cyclePressed: false,
  };

  const keys = Object.create(null);
  const touch = { accel: 0, steer: 0, boost: false, fire: false };

  function syncFromKeys() {
    let accel = 0;
    let steer = 0;
    if (keys.KeyW || keys.ArrowUp) accel += 1;
    if (keys.KeyS || keys.ArrowDown) accel -= 0.6;
    if (keys.KeyA || keys.ArrowLeft) steer -= 1;
    if (keys.KeyD || keys.ArrowRight) steer += 1;
    if (touch.accel) accel = touch.accel;
    if (touch.steer) steer = touch.steer;
    state.accel = THREE_CLAMP(accel, -1, 1);
    state.steer = THREE_CLAMP(steer, -1, 1);
    state.boost = !!(keys.ShiftLeft || keys.ShiftRight || touch.boost);
    state.fireHeld = !!(keys.Space || keys.KeyE || keys.KeyF || keys.KeyJ || touch.fire || state._mouseFire);
  }

  function THREE_CLAMP(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function onKeyDown(e) {
    keys[e.code] = true;
    // 开火
    if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'KeyJ') {
      state.firePressed = true;
      e.preventDefault();
    }
    // 切武器：Q / Tab / C / 数字1
    if (e.code === 'KeyQ' || e.code === 'Tab' || e.code === 'KeyC' || e.code === 'Digit1') {
      state.cyclePressed = true;
      e.preventDefault();
    }
    // 方向键/WASD：避免页面滚动（部分浏览器/可滚动父级）
    if (
      e.code === 'ArrowUp' || e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' || e.code === 'ArrowRight' ||
      e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD'
    ) {
      e.preventDefault();
    }
    syncFromKeys();
  }

  function onKeyUp(e) {
    keys[e.code] = false;
    syncFromKeys();
  }

  function onMouseDown(e) {
    // 只在画布上响应，避免点菜单误开火
    const t = e.target;
    if (t && t.closest && (t.closest('.screen') || t.closest('#touchPad') || t.closest('button'))) return;
    if (e.button === 0) {
      state._mouseFire = true;
      state.firePressed = true;
      state.fireHeld = true;
    } else if (e.button === 2 || e.button === 1) {
      state.cyclePressed = true;
      e.preventDefault();
    }
  }

  function onMouseUp(e) {
    if (e.button === 0) {
      state._mouseFire = false;
      state.fireHeld = !!(keys.Space || keys.KeyE || keys.KeyF || keys.KeyJ || touch.fire);
    }
  }

  function onWheel(e) {
    if (Math.abs(e.deltaY) < 2) return;
    state.cyclePressed = true;
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  /** 绑定触屏虚拟按钮（传按钮元素） */
  function bindTouchPad(els) {
    if (!els) return;
    const hold = (el, on, off) => {
      if (!el) return;
      let activeId = null;
      const start = (ev) => {
        ev.preventDefault();
        activeId = ev.pointerId;
        try { el.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
        on();
      };
      const end = (ev) => {
        if (activeId != null && ev.pointerId !== activeId) return;
        ev.preventDefault();
        activeId = null;
        try { if (el.hasPointerCapture?.(ev.pointerId)) el.releasePointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
        off();
      };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('lostpointercapture', end);
      // 有 capture 后不依赖 pointerleave，避免滑出误松 / 粘滞
    };

    hold(els.up, () => { touch.accel = 1; syncFromKeys(); }, () => { touch.accel = 0; syncFromKeys(); });
    hold(els.down, () => { touch.accel = -0.6; syncFromKeys(); }, () => { touch.accel = 0; syncFromKeys(); });
    hold(els.left, () => { touch.steer = -1; syncFromKeys(); }, () => { touch.steer = 0; syncFromKeys(); });
    hold(els.right, () => { touch.steer = 1; syncFromKeys(); }, () => { touch.steer = 0; syncFromKeys(); });
    hold(els.boost, () => { touch.boost = true; syncFromKeys(); }, () => { touch.boost = false; syncFromKeys(); });
    hold(els.fire, () => {
      touch.fire = true;
      state.firePressed = true;
      syncFromKeys();
    }, () => { touch.fire = false; syncFromKeys(); });

    if (els.cycle) {
      els.cycle.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        state.cyclePressed = true;
      });
    }
  }

  /** 每帧调用：读出一次性按键并清掉 */
  function consume() {
    const out = {
      accel: state.accel,
      steer: state.steer,
      boost: state.boost,
      fireHeld: state.fireHeld,
      firePressed: state.firePressed,
      cyclePressed: state.cyclePressed,
    };
    state.firePressed = false;
    state.cyclePressed = false;
    return out;
  }

  function attach(target = window) {
    target.addEventListener('keydown', onKeyDown, { passive: false });
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('mousedown', onMouseDown);
    target.addEventListener('mouseup', onMouseUp);
    target.addEventListener('wheel', onWheel, { passive: true });
    target.addEventListener('contextmenu', onContextMenu);
  }

  return { attach, bindTouchPad, consume, state, keys };
}

export function isTouchDevice() {
  // 压测可强制
  if (typeof window !== 'undefined' && window.__NEO_FORCE_TOUCH__ === true) return true;
  if (typeof window !== 'undefined' && window.__NEO_FORCE_TOUCH__ === false) return false;
  return (
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches) ||
    window.matchMedia('(pointer: coarse)').matches
  );
}

/** 窄屏手机布局：用于显示触控条，与「是否触摸设备」解耦 */
export function shouldShowTouchPad() {
  if (typeof window !== 'undefined' && window.__NEO_FORCE_TOUCH__ === true) return true;
  if (typeof window !== 'undefined' && window.__NEO_FORCE_TOUCH__ === false) return false;
  return isTouchDevice() || window.innerWidth < 820;
}
