/* Home Page JavaScript Logic */

const showcaseItems = ['phantom', 'lucid', 'first-move', 'hamper'];
let activeShowcaseIndex = 0;
let suppressSlideClickUntil = 0;

function getShowcaseTotal() {
  const slideCount = document.querySelectorAll('.carousel-slide').length;
  return slideCount > 0 ? slideCount : showcaseItems.length;
}

document.addEventListener('DOMContentLoaded', () => {
  updateShowcaseCarousel();
  initShowcaseSwipe();
  initHeroLaunchCountdown();

  // Background video autoplay guarantee
  const heroVideo = document.getElementById('hero-bg-video');
  if (heroVideo) {
    heroVideo.muted = true;
    const playPromise = heroVideo.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        const triggerPlay = () => {
          heroVideo.play().catch(() => {});
        };
        window.addEventListener('click', triggerPlay, { once: true });
        window.addEventListener('touchstart', triggerPlay, { once: true });
        window.addEventListener('scroll', triggerPlay, { once: true });
      });
    }
  }
});

// --- 3D Perspective Showcase Carousel Engine ---
function rotateShowcase(direction) {
  const total = getShowcaseTotal();
  if (direction === 'next') {
    activeShowcaseIndex = (activeShowcaseIndex + 1) % total;
  } else if (direction === 'prev') {
    activeShowcaseIndex = (activeShowcaseIndex - 1 + total) % total;
  }
  updateShowcaseCarousel();
}

function selectShowcaseSlide(index) {
  if (Date.now() < suppressSlideClickUntil) return;
  const parsed = Number(index);
  if (!Number.isFinite(parsed)) return;
  const total = getShowcaseTotal();
  activeShowcaseIndex = ((parsed % total) + total) % total;
  updateShowcaseCarousel();
}

function updateShowcaseCarousel() {
  const slides = document.querySelectorAll('.carousel-slide');
  if (!slides || slides.length === 0) return;

  const total = slides.length;
  activeShowcaseIndex = ((activeShowcaseIndex % total) + total) % total;

  slides.forEach((slide, idx) => {
    slide.classList.remove('active', 'prev', 'next');

    if (idx === activeShowcaseIndex) {
      slide.classList.add('active');
    } else if (idx === (activeShowcaseIndex - 1 + total) % total) {
      slide.classList.add('prev');
    } else if (idx === (activeShowcaseIndex + 1) % total) {
      slide.classList.add('next');
    }
  });

  const dots = document.querySelectorAll('.carousel-dot');
  dots.forEach((dot, idx) => {
    const isActive = idx === activeShowcaseIndex;
    dot.classList.toggle('active', isActive);
    dot.style.background = isActive ? 'var(--brand-orange)' : '#ccc';
    dot.style.width = isActive ? '22px' : '8px';
    dot.style.borderRadius = isActive ? '999px' : '50%';
  });
}

function initShowcaseSwipe() {
  const viewport = document.querySelector('.carousel-viewport');
  if (!viewport) return;

  const SWIPE_THRESHOLD = 38;
  const AXIS_LOCK_DISTANCE = 10;

  let startX = 0;
  let startY = 0;
  let tracking = false;
  let lockedAxis = null; // 'x' | 'y' | null
  let activePointerId = null;
  let lastTouchEndTime = 0;

  const isInteractiveTarget = (target) => {
    if (!target || typeof target.closest !== 'function') return false;
    return Boolean(target.closest('.slide-actions, button, a, input, textarea, select'));
  };

  const beginSwipe = (clientX, clientY, target) => {
    if (isInteractiveTarget(target)) {
      tracking = false;
      return false;
    }
    startX = clientX;
    startY = clientY;
    tracking = true;
    lockedAxis = null;
    viewport.classList.add('is-swiping');
    return true;
  };

  const finishSwipe = (endX) => {
    if (!tracking) return;
    const dx = endX - startX;
    tracking = false;
    viewport.classList.remove('is-swiping');

    if (lockedAxis === 'x' || Math.abs(dx) >= SWIPE_THRESHOLD) {
      suppressSlideClickUntil = Date.now() + 180;
      if (dx <= -SWIPE_THRESHOLD) {
        rotateShowcase('next');
      } else if (dx >= SWIPE_THRESHOLD) {
        rotateShowcase('prev');
      }
    }
    lockedAxis = null;
  };

  // Native Touch Events for crisp mobile & tablet swiping
  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) {
      tracking = false;
      return;
    }
    beginSwipe(e.touches[0].clientX, e.touches[0].clientY, e.target);
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    if (!tracking || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (!lockedAxis && (Math.abs(dx) > AXIS_LOCK_DISTANCE || Math.abs(dy) > AXIS_LOCK_DISTANCE)) {
      lockedAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (lockedAxis === 'x' && e.cancelable) {
      e.preventDefault();
    }
  }, { passive: false });

  viewport.addEventListener('touchend', (e) => {
    lastTouchEndTime = Date.now();
    if (!tracking) return;
    const touch = e.changedTouches && e.changedTouches[0];
    finishSwipe(touch ? touch.clientX : startX);
  }, { passive: true });

  viewport.addEventListener('touchcancel', () => {
    tracking = false;
    lockedAxis = null;
    viewport.classList.remove('is-swiping');
  }, { passive: true });

  // Pointer / mouse drag fallback for tablet styluses and desktop trackpads/mice
  viewport.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || Date.now() - lastTouchEndTime < 400) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (beginSwipe(e.clientX, e.clientY, e.target)) {
      activePointerId = e.pointerId;
    }
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!tracking || e.pointerId !== activePointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!lockedAxis && (Math.abs(dx) > AXIS_LOCK_DISTANCE || Math.abs(dy) > AXIS_LOCK_DISTANCE)) {
      lockedAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
  });

  const endPointer = (e) => {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    finishSwipe(e.clientX);
  };

  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', () => {
    activePointerId = null;
    tracking = false;
    lockedAxis = null;
    viewport.classList.remove('is-swiping');
  });

  // Prevent native image drag from hijacking swipe gestures
  viewport.addEventListener('dragstart', (e) => {
    if (e.target && e.target.tagName === 'IMG') {
      e.preventDefault();
    }
  });
}

function initHeroLaunchCountdown() {
  const daysEl = document.getElementById('launch-days');
  const hoursEl = document.getElementById('launch-hours');
  const minsEl = document.getElementById('launch-mins');
  const secsEl = document.getElementById('launch-secs');
  const statusEl = document.getElementById('launch-status-label');
  if (!daysEl || !hoursEl || !minsEl || !secsEl) return;

  // Target: November 27, 2026 00:00:00 IST
  const targetMs = new Date('2026-11-27T00:00:00+05:30').getTime();
  const pad2 = (n) => String(Math.max(0, n)).padStart(2, '0');

  const tick = () => {
    const diff = targetMs - Date.now();
    if (diff <= 0) {
      daysEl.textContent = '00';
      hoursEl.textContent = '00';
      minsEl.textContent = '00';
      secsEl.textContent = '00';
      if (statusEl) statusEl.textContent = 'NOW LIVE · DROP OPEN';
      return;
    }
    const totalSecs = Math.floor(diff / 1000);
    const days = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    daysEl.textContent = pad2(days);
    hoursEl.textContent = pad2(hours);
    minsEl.textContent = pad2(mins);
    secsEl.textContent = pad2(secs);
  };

  tick();
  setInterval(tick, 1000);
}

window.rotateShowcase = rotateShowcase;
window.selectShowcaseSlide = selectShowcaseSlide;
