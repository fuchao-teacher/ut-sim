/**
 * GSAP Motion Layer — 直探头 UT 仿真 webapp
 * 
 * UI chrome animations using GSAP core. All animations:
 * - Use transform/opacity only (compositor-friendly)
 * - Respect prefers-reduced-motion via gsap.matchMedia
 * - Never bind to Three.js rAF or WebGL render loop
 * 
 * @module ui/motion
 */

import gsap from 'gsap';

/**
 * Reduced motion detection. When true, all exports apply instant state changes
 * instead of tweening. Checked once on module load and via matchMedia listener.
 */
let reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
motionQuery?.addEventListener?.('change', (e) => {
  reducedMotion = e.matches;
});

/**
 * Default timing constants (in seconds).
 */
const DURATION = {
  fast: 0.15,
  normal: 0.25,
  slow: 0.4,
};

const EASE = {
  out: 'power2.out',
  inOut: 'power2.inOut',
  elastic: 'elastic.out(1, 0.5)',
  back: 'back.out(1.4)',
};

/**
 * Page/section enter animation — fade up from below.
 * 
 * @param {HTMLElement|HTMLElement[]|string} target - Element(s) or selector
 * @param {object} [options]
 * @param {number} [options.duration] - Animation duration in seconds
 * @param {number} [options.y] - Starting Y offset in pixels
 * @param {number} [options.stagger] - Stagger delay for multiple elements
 * @param {function} [options.onComplete] - Callback when animation completes
 * @returns {gsap.core.Tween|null} The tween instance, or null if reduced motion
 */
export function pageEnter(target, options = {}) {
  const {
    duration = DURATION.normal,
    y = 20,
    stagger = 0.06,
    onComplete,
  } = options;

  if (reducedMotion) {
    gsap.set(target, { opacity: 1, y: 0 });
    onComplete?.();
    return null;
  }

  return gsap.fromTo(
    target,
    { opacity: 0, y },
    {
      opacity: 1,
      y: 0,
      duration,
      ease: EASE.out,
      stagger,
      onComplete,
    }
  );
}

/**
 * Page/section exit animation — fade down.
 * 
 * @param {HTMLElement|HTMLElement[]|string} target - Element(s) or selector
 * @param {object} [options]
 * @param {number} [options.duration] - Animation duration in seconds
 * @param {number} [options.y] - Ending Y offset in pixels
 * @param {function} [options.onComplete] - Callback when animation completes
 * @returns {gsap.core.Tween|null} The tween instance, or null if reduced motion
 */
export function pageExit(target, options = {}) {
  const {
    duration = DURATION.fast,
    y = -10,
    onComplete,
  } = options;

  if (reducedMotion) {
    gsap.set(target, { opacity: 0 });
    onComplete?.();
    return null;
  }

  return gsap.to(target, {
    opacity: 0,
    y,
    duration,
    ease: EASE.out,
    onComplete,
  });
}

/**
 * Panel expand/collapse toggle animation.
 * 
 * @param {HTMLElement|string} target - Panel element or selector
 * @param {boolean} expand - True to expand, false to collapse
 * @param {object} [options]
 * @param {number} [options.duration] - Animation duration in seconds
 * @param {function} [options.onComplete] - Callback when animation completes
 * @returns {gsap.core.Tween|null} The tween instance, or null if reduced motion
 */
export function panelToggle(target, expand, options = {}) {
  const {
    duration = DURATION.normal,
    onComplete,
  } = options;

  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return null;

  if (reducedMotion) {
    el.style.display = expand ? '' : 'none';
    gsap.set(el, { opacity: expand ? 1 : 0, scale: 1 });
    onComplete?.();
    return null;
  }

  if (expand) {
    el.style.display = '';
    return gsap.fromTo(
      el,
      { opacity: 0, scale: 0.95, transformOrigin: 'top center' },
      {
        opacity: 1,
        scale: 1,
        duration,
        ease: EASE.out,
        onComplete,
      }
    );
  } else {
    return gsap.to(el, {
      opacity: 0,
      scale: 0.95,
      duration: duration * 0.7,
      ease: EASE.out,
      onComplete: () => {
        el.style.display = 'none';
        onComplete?.();
      },
    });
  }
}

/**
 * Step/task advance feedback — subtle pulse on the active item.
 * 
 * @param {HTMLElement|string} target - Step indicator element or selector
 * @param {object} [options]
 * @param {number} [options.duration] - Animation duration in seconds
 * @param {function} [options.onComplete] - Callback when animation completes
 * @returns {gsap.core.Tween|null} The tween instance, or null if reduced motion
 */
export function stepAdvance(target, options = {}) {
  const {
    duration = DURATION.fast,
    onComplete,
  } = options;

  if (reducedMotion) {
    onComplete?.();
    return null;
  }

  return gsap.fromTo(
    target,
    { scale: 1 },
    {
      scale: 1.08,
      duration: duration * 0.5,
      ease: EASE.out,
      yoyo: true,
      repeat: 1,
      onComplete,
    }
  );
}

/**
 * Toast notification enter animation — slide up and fade in.
 * 
 * @param {HTMLElement|string} target - Toast element or selector
 * @param {object} [options]
 * @param {number} [options.duration] - Animation duration in seconds
 * @param {number} [options.y] - Starting Y offset in pixels
 * @param {function} [options.onComplete] - Callback when animation completes
 * @returns {gsap.core.Tween|null} The tween instance, or null if reduced motion
 */
export function toastIn(target, options = {}) {
  const {
    duration = DURATION.normal,
    y = 20,
    onComplete,
  } = options;

  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return null;

  if (reducedMotion) {
    gsap.set(el, { opacity: 1, y: 0, scale: 1 });
    onComplete?.();
    return null;
  }

  return gsap.fromTo(
    el,
    { opacity: 0, y, scale: 0.9 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration,
      ease: EASE.back,
      onComplete,
    }
  );
}

/**
 * Toast notification exit animation — fade out and scale down.
 * 
 * @param {HTMLElement|string} target - Toast element or selector
 * @param {object} [options]
 * @param {number} [options.duration] - Animation duration in seconds
 * @param {function} [options.onComplete] - Callback when animation completes
 * @returns {gsap.core.Tween|null} The tween instance, or null if reduced motion
 */
export function toastOut(target, options = {}) {
  const {
    duration = DURATION.fast,
    onComplete,
  } = options;

  if (reducedMotion) {
    gsap.set(target, { opacity: 0 });
    onComplete?.();
    return null;
  }

  return gsap.to(target, {
    opacity: 0,
    scale: 0.9,
    duration,
    ease: EASE.out,
    onComplete,
  });
}

/**
 * Card expand animation — grow from compact to full size.
 * 
 * @param {HTMLElement|string} target - Card element or selector
 * @param {object} [options]
 * @param {number} [options.duration] - Animation duration in seconds
 * @param {function} [options.onComplete] - Callback when animation completes
 * @returns {gsap.core.Tween|null} The tween instance, or null if reduced motion
 */
export function cardExpand(target, options = {}) {
  const {
    duration = DURATION.normal,
    onComplete,
  } = options;

  if (reducedMotion) {
    gsap.set(target, { opacity: 1, scale: 1 });
    onComplete?.();
    return null;
  }

  return gsap.fromTo(
    target,
    { opacity: 0.8, scale: 0.96, transformOrigin: 'center top' },
    {
      opacity: 1,
      scale: 1,
      duration,
      ease: EASE.out,
      onComplete,
    }
  );
}

/**
 * Mode/shell transition — cross-fade between two states.
 * 
 * @param {HTMLElement|string} exitTarget - Element to fade out
 * @param {HTMLElement|string} enterTarget - Element to fade in
 * @param {object} [options]
 * @param {number} [options.duration] - Animation duration in seconds
 * @param {function} [options.onComplete] - Callback when animation completes
 * @returns {gsap.core.Timeline|null} The timeline instance, or null if reduced motion
 */
export function modeTransition(exitTarget, enterTarget, options = {}) {
  const {
    duration = DURATION.normal,
    onComplete,
  } = options;

  const exitEl = typeof exitTarget === 'string' ? document.querySelector(exitTarget) : exitTarget;
  const enterEl = typeof enterTarget === 'string' ? document.querySelector(enterTarget) : enterTarget;

  if (reducedMotion) {
    if (exitEl) gsap.set(exitEl, { opacity: 0, display: 'none' });
    if (enterEl) {
      enterEl.style.display = '';
      gsap.set(enterEl, { opacity: 1, y: 0 });
    }
    onComplete?.();
    return null;
  }

  const tl = gsap.timeline({ onComplete });

  if (exitEl) {
    tl.to(exitEl, {
      opacity: 0,
      duration: duration * 0.4,
      ease: EASE.out,
      onComplete: () => { exitEl.style.display = 'none'; },
    });
  }

  if (enterEl) {
    enterEl.style.display = '';
    tl.fromTo(
      enterEl,
      { opacity: 0, y: 12 },
      {
        opacity: 1,
        y: 0,
        duration: duration * 0.6,
        ease: EASE.out,
      },
      exitEl ? '-=0.1' : 0
    );
  }

  return tl;
}

/**
 * Highlight pulse — draw attention to an element temporarily.
 * 
 * @param {HTMLElement|string} target - Element to highlight
 * @param {object} [options]
 * @param {number} [options.duration] - Total animation duration in seconds
 * @param {number} [options.scale] - Maximum scale factor
 * @returns {gsap.core.Tween|null} The tween instance, or null if reduced motion
 */
export function highlightPulse(target, options = {}) {
  const {
    duration = 0.6,
    scale = 1.03,
  } = options;

  if (reducedMotion) {
    return null;
  }

  return gsap.fromTo(
    target,
    { scale: 1 },
    {
      scale,
      duration: duration / 2,
      ease: 'power1.inOut',
      yoyo: true,
      repeat: 1,
    }
  );
}

/**
 * Check if reduced motion is currently active.
 * 
 * @returns {boolean} True if reduced motion is preferred
 */
export function isReducedMotion() {
  return reducedMotion;
}

/**
 * Kill all GSAP animations on a target.
 * 
 * @param {HTMLElement|HTMLElement[]|string} target - Element(s) or selector
 */
export function killAnimations(target) {
  gsap.killTweensOf(target);
}

export { gsap };
