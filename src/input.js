/* ------------------------------------------------------------------ */
/*  Keyboard + touch input                                            */
/* ------------------------------------------------------------------ */
export function createInput({ onPause, onMute, onRestart } = {}) {
  const keys = new Set();
  const touch = { left: false, right: false, gas: false, brake: false, drift: false, nitro: false };

  const down = (e) => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'spacebar'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    keys.add(k);
    if (k === 'p' || k === 'escape') onPause?.();
    if (k === 'm') onMute?.();
    if (k === 'r') onRestart?.();
  };
  const up = (e) => keys.delete(e.key.toLowerCase());
  const blur = () => keys.clear();

  window.addEventListener('keydown', down, { passive: false });
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);

  const buttons = Array.from(document.querySelectorAll('[data-touch]'));
  const states = new Map();
  for (const btn of buttons) {
    const name = btn.dataset.touch;
    const set = (on) => {
      touch[name] = on;
      btn.classList.toggle('on', on);
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture?.(e.pointerId);
      set(true);
    });
    const release = (e) => {
      e.preventDefault();
      set(false);
    };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', (e) => {
      if (e.buttons === 0) set(false);
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    states.set(name, btn);
  }

  function playerInput() {
    const left = keys.has('a') || keys.has('arrowleft') || touch.left;
    const right = keys.has('d') || keys.has('arrowright') || touch.right;
    const up = keys.has('w') || keys.has('arrowup') || touch.gas;
    const downK = keys.has('s') || keys.has('arrowdown') || touch.brake;
    const handbrake = keys.has(' ') || keys.has('spacebar') || touch.drift;
    const boost = keys.has('shift') || touch.nitro;
    return {
      steer: (left ? 1 : 0) - (right ? 1 : 0),
      throttle: (up ? 1 : 0) - (downK ? 1 : 0),
      handbrake,
      boost,
    };
  }

  function anyDrive() {
    const i = playerInput();
    return i.throttle !== 0 || i.steer !== 0;
  }

  return {
    playerInput,
    anyDrive,
    keys,
    touch,
    dispose() {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    },
  };
}
