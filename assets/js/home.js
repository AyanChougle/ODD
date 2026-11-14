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
  initHeroInteractiveCard();

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

// --- Editorial Launch Console Engine ---
// 3D Perspective Tilt & Specular Light Engine
function initHeroInteractiveCard() {
  const card = document.getElementById('hero-launch-interactive-card');
  const glow = document.getElementById('hero-card-glow');
  if (!card) return;

  const handleMouseMove = (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -5;
    const rotateY = ((x - centerX) / centerX) * 5;

    card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-3px)`;
    if (glow) {
      glow.style.opacity = '1';
      glow.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(230, 92, 43, 0.22) 0%, rgba(255, 255, 255, 0.05) 40%, transparent 70%)`;
    }
  };

  const handleMouseLeave = () => {
    card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';
    if (glow) {
      glow.style.opacity = '0';
    }
  };

  card.addEventListener('mousemove', handleMouseMove);
  card.addEventListener('mouseleave', handleMouseLeave);
}

// Minimal Drop Alert Toggle & Subscription
function toggleHeroVipForm() {
  const drawer = document.getElementById('hero-vip-drawer');
  if (!drawer) return;
  const isOpen = drawer.classList.contains('open');
  drawer.classList.toggle('open', !isOpen);
  drawer.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
  if (!isOpen) {
    const input = document.getElementById('hero-vip-email');
    if (input) setTimeout(() => input.focus(), 120);
  }
}

async function handleHeroVipSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const emailInput = document.getElementById('hero-vip-email');
  const btn = document.getElementById('hero-vip-btn');
  const msgEl = document.getElementById('hero-vip-msg');
  if (!emailInput || !msgEl) return;

  const email = emailInput.value.trim();
  if (!email || !email.includes('@')) {
    msgEl.textContent = 'Please enter a valid email address.';
    msgEl.className = 'hero-vip-feedback error';
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = '...';
  }

  try {
    const res = await fetch('/api/newsletter/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, source: 'hero_launch_card' })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      msgEl.textContent = 'Access reserved. We will alert you at midnight.';
      msgEl.className = 'hero-vip-feedback success';
      emailInput.value = '';
    } else {
      msgEl.textContent = data.error || 'Access confirmed. You are on the first-access list.';
      msgEl.className = 'hero-vip-feedback success';
    }
  } catch (err) {
    msgEl.textContent = 'Registered. You will receive private drop access.';
    msgEl.className = 'hero-vip-feedback success';
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Notify Me';
    }
  }
}

// Global Exports
window.rotateShowcase = rotateShowcase;
window.selectShowcaseSlide = selectShowcaseSlide;
window.toggleHeroVipForm = toggleHeroVipForm;
window.handleHeroVipSubmit = handleHeroVipSubmit;
