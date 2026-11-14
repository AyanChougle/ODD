
function closeLaunchBanner() {
  const banner = document.getElementById('launch-banner');
  if (banner) banner.style.display = 'none';
  sessionStorage.setItem('odd_hide_banner', 'true');
}

function closeCartDrawer() {
  const backdrop = document.getElementById('cart-backdrop');
  const drawer = document.getElementById('cart-drawer');
  if (backdrop) backdrop.classList.remove('open');
  if (drawer) drawer.classList.remove('open');
  document.body.classList.remove('drawer-open');
}

/* ==========================================================================
   ODD Perfume — Shared Global JavaScript Engine
   Handles: Cart persistence, drawer state, header timer, search modal, toasts
   ========================================================================== */

const PRODUCTS = {
  'phantom': {
    id: 'phantom',
    name: 'Phantom',
    fullName: 'ODD Phantom',
    tagline: 'Unseen. Unforgotten. Undeniable.',
    price: 1999,
    originalPrice: null,
    notes: 'Oud · Incense · Benzoin',
    bottleImage: 'Phantom Single bottle.webp',
    notesList: ['Oud', 'Incense', 'Benzoin'],
    intensity: '5/5',
    warmth: '5/5',
    freshness: '1/5',
    sweetness: '3/5',
    occasion: 'Late nights, formal dinners, winter evenings',
    themeColor: '#E6C27A',
    bgColor: '#110E0A',
    textColor: '#000000'
  },
  'lucid': {
    id: 'lucid',
    name: 'Lucid',
    fullName: 'ODD Lucid',
    tagline: 'Clear Mind. Sharp Presence.',
    price: 1599,
    originalPrice: null,
    notes: 'Vanilla · Birch · Black pepper',
    bottleImage: 'Lucid single bottle.webp',
    notesList: ['Vanilla', 'Birch', 'Black pepper'],
    intensity: '4/5',
    warmth: '2/5',
    freshness: '4/5',
    sweetness: '3/5',
    occasion: 'Office, daytime meetings, summer',
    themeColor: '#7AE6B2',
    bgColor: '#0A110E',
    textColor: '#000000'
  },
  'first-move': {
    id: 'first-move',
    name: 'First Move',
    fullName: 'ODD First Move',
    tagline: 'Make your presence felt instantly.',
    price: 1899,
    originalPrice: null,
    notes: 'Bergamot · Ginger · Amber',
    bottleImage: 'First Move single bottle.webp',
    notesList: ['Bergamot', 'Ginger', 'Amber'],
    intensity: '3/5',
    warmth: '2/5',
    freshness: '5/5',
    sweetness: '1/5',
    occasion: 'Dates, evenings out, anytime you need confidence',
    themeColor: '#E67A7A',
    bgColor: '#110A0A',
    textColor: '#ffffff'
  },
  hamper: {
    id: 'hamper',
    name: 'The Trio Gift Hamper',
    fullName: 'ODD Trio Gift Hamper',
    tagline: 'The Complete Trio. Ready to Gift.',
    price: 4999,
    originalPrice: null,
    notes: 'Phantom · Lucid · First Move (3 × 100ml)',
    bottleImage: 'Trio Gift Hamper.webp',
    notesList: ['Phantom 100ml', 'Lucid 100ml', 'First Move 100ml'],
    intensity: 'Full Wardrobe',
    warmth: 'Versatile',
    freshness: 'Day & Night',
    sweetness: 'Balanced',
    occasion: 'Luxury gifting, celebrations, collectors, every mood',
    themeColor: '#C57B48',
    bgColor: '#141110',
    textColor: '#ffffff'
  }
};

function readStorageJSON(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return value == null ? fallback : value; }
  catch { return fallback; }
}

// Hydrate PRODUCTS and STORE_INVENTORY immediately from database & admin storage cache to eliminate any price discrepancy
try {
  const skuMap = {
    'ODD-PH-001': 'phantom',
    'ODD-LC-003': 'lucid',
    'ODD-FM-002': 'first-move',
    'ODD-HM-004': 'hamper'
  };

  // 1. Live admin inventory cache (set when admin updates prices in dashboard)
  const adminInv = readStorageJSON('odd_admin_inventory', null);
  if (adminInv && typeof adminInv === 'object') {
    Object.entries(adminInv).forEach(([key, item]) => {
      const pid = skuMap[key] || key;
      if (PRODUCTS[pid] && item && item.price) {
        const pNum = Number(item.price);
        // Guard: Do not downgrade authoritative prices with obsolete legacy local cache values
        if ((pid === 'phantom' && pNum === 1599) || (pid === 'first-move' && pNum === 1599) || (pid === 'hamper' && pNum === 4797)) {
          // Keep authoritative price
        } else if (!isNaN(pNum) && pNum > 0) {
          PRODUCTS[pid].price = pNum;
          if (item.originalPrice != null && Number(item.originalPrice) > pNum) {
            PRODUCTS[pid].originalPrice = Number(item.originalPrice);
          }
        }
      }
    });
  }

  // 2. Synchronous cache from live API products
  const cachedProducts = readStorageJSON('odd_live_products', null);
  if (cachedProducts && typeof cachedProducts === 'object') {
    Object.keys(cachedProducts).forEach(pid => {
      if (PRODUCTS[pid] && cachedProducts[pid].price) {
        const pNum = Number(cachedProducts[pid].price);
        if ((pid === 'phantom' && pNum === 1599) || (pid === 'first-move' && pNum === 1599) || (pid === 'hamper' && pNum === 4797)) {
          // Keep authoritative price
        } else if (!isNaN(pNum) && pNum > 0) {
          PRODUCTS[pid].price = pNum;
          PRODUCTS[pid].originalPrice = (cachedProducts[pid].originalPrice && Number(cachedProducts[pid].originalPrice) > pNum)
            ? Number(cachedProducts[pid].originalPrice)
            : null;
        }
      }
    });
  }
} catch (e) {}

function normalizeCouponCode(code) {
  const cleaned = String(code || '').trim().toUpperCase();
  return cleaned || null;
}

let cartState = readStorageJSON('odd_cart', []).filter(item => item && PRODUCTS[item.id] && Number.isInteger(Number(item.qty)) && Number(item.qty) > 0).map(item => ({ id: item.id, qty: Number(item.qty) }));
let appliedCoupon = normalizeCouponCode(localStorage.getItem('odd_coupon') || localStorage.getItem('odd_coupon_code'));
let ACTIVE_COUPONS = (function hydrateInitialCoupons() {
  const local = readStorageJSON('odd_coupons', null) || readStorageJSON('odd_admin_coupons', []);
  return Array.isArray(local) ? local.filter(c => c && c.active !== false) : [];
})();
let STORE_STATE_FROM_SERVER = false;
let COUPONS_SYNCED_FROM_SERVER = false;
let STORE_INVENTORY = {
  phantom: { sku: 'ODD-PH-001', stock: 0, price: PRODUCTS['phantom']?.price || 1999 },
  lucid: { sku: 'ODD-LC-003', stock: 0, price: PRODUCTS['lucid']?.price || 1599 },
  'first-move': { sku: 'ODD-FM-002', stock: 0, price: PRODUCTS['first-move']?.price || 1899 },
  hamper: { sku: 'ODD-HM-004', stock: 0, price: PRODUCTS['hamper']?.price || 4999 }
};

// Immediate hydration of inventory stock from admin cache
try {
  const adminInv = readStorageJSON('odd_admin_inventory', null);
  if (adminInv && typeof adminInv === 'object') {
    const skuMap = { 'ODD-PH-001': 'phantom', 'ODD-LC-003': 'lucid', 'ODD-FM-002': 'first-move', 'ODD-HM-004': 'hamper' };
    Object.entries(adminInv).forEach(([key, item]) => {
      const pid = skuMap[key] || key;
      if (STORE_INVENTORY[pid] && item) {
        if (item.stock != null) STORE_INVENTORY[pid].stock = Math.max(0, Number(item.stock));
        if (item.price != null && Number(item.price) > 0) {
          const pNum = Number(item.price);
          if ((pid === 'phantom' && pNum === 1599) || (pid === 'first-move' && pNum === 1599) || (pid === 'hamper' && pNum === 4797)) {
            // Keep authoritative price
          } else {
            STORE_INVENTORY[pid].price = pNum;
          }
        }
      }
    });
  }
} catch (e) {}

function getGlobalShippingConfig() {
  const fallback = { enabled: true, standardRate: 50, freeThreshold: 0 };
  const raw = readStorageJSON('odd_admin_shipping', null);
  if (raw && typeof raw === 'object') {
    return {
      enabled: raw.enabled !== false,
      standardRate: Math.max(0, Number(raw.standardRate ?? 50) || 0),
      freeThreshold: Math.max(0, Number(raw.freeThreshold ?? 0) || 0)
    };
  }
  return fallback;
}

function getGlobalShippingFee(subtotal) {
  const cfg = getGlobalShippingConfig();
  if (!cfg.enabled) return 0;
  if (cfg.freeThreshold > 0 && Number(subtotal) >= cfg.freeThreshold) return 0;
  return cfg.standardRate;
}

function getCartSubtotal() {
  if (!Array.isArray(cartState)) return 0;
  return cartState.reduce((sum, item) => {
    const prod = PRODUCTS[item.id];
    if (!prod) return sum;
    const qty = Math.min(25, Math.max(0, Number(item.qty) || 0));
    if (qty <= 0) return sum;
    const availability = getProductAvailability(item.id);
    const price = Number(availability.price ?? prod.price) || 0;
    return sum + (price * qty);
  }, 0);
}

function saveAppliedCouponState(couponData) {
  if (!couponData || !couponData.code) {
    appliedCoupon = null;
    localStorage.removeItem('odd_coupon');
    localStorage.removeItem('odd_coupon_code');
    localStorage.removeItem('odd_coupon_discount');
    localStorage.removeItem('odd_coupon_meta');
    return;
  }
  const code = normalizeCouponCode(couponData.code);
  const discount = Math.max(0, Number(couponData.discount ?? couponData.discountPercent ?? couponData.discount_percent ?? 0));
  const maxDiscount = Math.max(0, Number(couponData.maxDiscount ?? couponData.max_discount ?? 0));
  const minSpend = Math.max(0, Number(couponData.minSpend ?? couponData.min_spend ?? 0));
  appliedCoupon = code;
  localStorage.setItem('odd_coupon', code);
  localStorage.setItem('odd_coupon_code', code);
  localStorage.setItem('odd_coupon_discount', String(discount));
  localStorage.setItem('odd_coupon_meta', JSON.stringify({ code, discount, maxDiscount, minSpend }));
}

function resolveAppliedCoupon(subtotal) {
  const code = normalizeCouponCode(appliedCoupon);
  if (!code) {
    return { active: false, code: null, discountPercent: 0, discountAmount: 0, minSpend: 0, minSpendShortfall: 0 };
  }

  let record = ACTIVE_COUPONS.find(c => normalizeCouponCode(c.code) === code && c.active !== false) || null;
  if (!record) {
    const adminCoupons = readStorageJSON('odd_admin_coupons', null) || readStorageJSON('odd_coupons', []);
    if (Array.isArray(adminCoupons)) {
      record = adminCoupons.find(c => normalizeCouponCode(c.code) === code && c.active !== false) || null;
    }
  }

  // If the server explicitly responded with the active coupon list and this code is no longer active, clear it
  if (!record && COUPONS_SYNCED_FROM_SERVER) {
    saveAppliedCouponState(null);
    return { active: false, code: null, discountPercent: 0, discountAmount: 0, minSpend: 0, minSpendShortfall: 0 };
  }

  // Before server sync finishes (or offline after validation), honor persisted validated coupon metadata
  if (!record) {
    const meta = readStorageJSON('odd_coupon_meta', null);
    const savedPct = Number(localStorage.getItem('odd_coupon_discount') || 0);
    if (meta && normalizeCouponCode(meta.code) === code && Number(meta.discount) > 0) {
      record = meta;
    } else if (savedPct > 0) {
      record = { code, discount: savedPct, maxDiscount: 0, minSpend: 0 };
    } else if (COUPONS_SYNCED_FROM_SERVER) {
      saveAppliedCouponState(null);
      return { active: false, code: null, discountPercent: 0, discountAmount: 0, minSpend: 0, minSpendShortfall: 0 };
    } else {
      return { active: false, code: null, discountPercent: 0, discountAmount: 0, minSpend: 0, minSpendShortfall: 0 };
    }
  }

  const discountPercent = Math.max(0, Number(record.discount ?? record.discountPercent ?? record.discount_percent ?? 0));
  const minSpend = Math.max(0, Number(record.minSpend ?? record.min_spend ?? 0));
  const maxDiscount = Math.max(0, Number(record.maxDiscount ?? record.max_discount ?? 0));
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);

  if (minSpend > 0 && safeSubtotal < minSpend) {
    return {
      active: true,
      code: normalizeCouponCode(record.code) || code,
      discountPercent,
      discountAmount: 0,
      minSpend,
      minSpendShortfall: minSpend - safeSubtotal
    };
  }

  let discountAmount = Math.round(safeSubtotal * (discountPercent / 100));
  if (maxDiscount > 0 && discountAmount > maxDiscount) {
    discountAmount = maxDiscount;
  }

  return {
    active: true,
    code: normalizeCouponCode(record.code) || code,
    discountPercent,
    discountAmount,
    minSpend,
    minSpendShortfall: 0
  };
}

// Function to synchronize all price tags, cards, CTA buttons, and modal elements
function syncAllPriceElementsUI() {
  // 1. Update all .product-detail-price[data-product] containers
  document.querySelectorAll('.product-detail-price[data-product]').forEach(element => {
    const pid = element.dataset.product;
    const product = PRODUCTS[pid];
    if (!product || !product.price) return;

    const currentPrice = Number(product.price);
    const originalPrice = (product.originalPrice != null && Number(product.originalPrice) > currentPrice)
      ? Number(product.originalPrice)
      : null;

    if (originalPrice && originalPrice > currentPrice) {
      const discount = Math.round((originalPrice - currentPrice) / originalPrice * 100);
      if (discount >= 1) {
        element.innerHTML = `<span class="price-current">₹ ${currentPrice.toLocaleString('en-IN')}</span> <span class="price-original">₹ ${originalPrice.toLocaleString('en-IN')}</span> <span class="price-discount-pill">-${discount}%</span>`;
        return;
      }
    }

    // No discount set or originalPrice <= currentPrice:
    // Completely HIDE strikethrough and discount pill! Show ONLY the clean selling price.
    element.innerHTML = `<span class="price-current">₹ ${currentPrice.toLocaleString('en-IN')}</span>`;
  });

  // 2. Update Hero "Pick of the day" price on index.html
  const heroPickPrice = document.querySelector('.hero-pick-price');
  if (heroPickPrice) {
    const fmPrice = PRODUCTS['first-move']?.price || 1599;
    heroPickPrice.innerHTML = `&#8377;${Number(fmPrice).toLocaleString('en-IN')}`;
  }

  // 3. Update "Add to Cart — ₹..." CTA buttons on product pages
  document.querySelectorAll('.product-add-btn').forEach(btn => {
    let pid = btn.dataset.productBtn;
    if (!pid) {
      const path = (window.location.pathname || '').toLowerCase();
      if (path.includes('first-move')) pid = 'first-move';
      else if (path.includes('lucid')) pid = 'lucid';
      else if (path.includes('phantom')) pid = 'phantom';
      else if (path.includes('hamper')) pid = 'hamper';
    }
    if (pid && PRODUCTS[pid] && PRODUCTS[pid].price) {
      const stock = STORE_INVENTORY[pid]?.stock ?? 0;
      if (stock <= 0) {
        btn.innerHTML = 'Out of Stock';
        btn.disabled = true;
      } else {
        btn.innerHTML = `Add to Cart &mdash; &#8377;${Number(PRODUCTS[pid].price).toLocaleString('en-IN')}`;
        btn.disabled = false;
      }
    }
  });

  // 4. Update related product cards on product pages
  document.querySelectorAll('.product-related-card').forEach(card => {
    const href = (card.getAttribute('href') || '').toLowerCase();
    let pid = null;
    if (href.includes('first-move')) pid = 'first-move';
    else if (href.includes('lucid')) pid = 'lucid';
    else if (href.includes('phantom')) pid = 'phantom';
    else if (href.includes('hamper')) pid = 'hamper';
    if (pid && PRODUCTS[pid] && PRODUCTS[pid].price) {
      const bTag = card.querySelector('b');
      if (bTag) {
        bTag.textContent = `₹${Number(PRODUCTS[pid].price).toLocaleString('en-IN')} · Discover →`;
      }
    }
  });

  // 5. Update quiz button on find-your-scent.html
  const quizBtn = document.getElementById('quiz-add-btn');
  if (quizBtn) {
    const p = PRODUCTS['phantom']?.price || 1599;
    quizBtn.textContent = `Add Match To Cart — ₹ ${Number(p).toLocaleString('en-IN')}`;
  }

  // 6. Update Quick View modal price if open
  const qvPrice = document.getElementById('qv-price');
  if (qvPrice && typeof currentQvId !== 'undefined' && PRODUCTS[currentQvId] && PRODUCTS[currentQvId].price) {
    qvPrice.innerHTML = `&#8377; ${Number(PRODUCTS[currentQvId].price).toLocaleString('en-IN')}`;
  }
}
window.syncAllPriceElementsUI = syncAllPriceElementsUI;

// Sync live inventory, prices, coupons, banner, and shipping settings directly from authoritative backend
let isSyncingInventory = false;
let lastSyncTimestamp = 0;

async function syncInventoryFromApi() {
  if (isSyncingInventory) return;
  if (Date.now() - lastSyncTimestamp < 3000) return;
  isSyncingInventory = true;
  lastSyncTimestamp = Date.now();
  try {
    const [prodRes, coupRes, bannerRes, shipRes] = await Promise.all([
      fetch('/api/products').catch(() => null),
      fetch('/api/coupons/active').catch(() => null),
      fetch('/api/settings/banner').catch(() => null),
      fetch('/api/settings/shipping').catch(() => null)
    ]);

    if (prodRes && prodRes.ok) {
      const data = await prodRes.json();
      const products = Array.isArray(data.products) ? data.products : (Array.isArray(data) ? data : []);
      products.forEach(p => {
        const pid = p.id;
        const numPrice = Number(p.price);
        const numOrig = (p.originalPrice != null && Number(p.originalPrice) > numPrice) ? Number(p.originalPrice) : null;
        if (STORE_INVENTORY[pid]) {
          STORE_INVENTORY[pid].stock = Math.max(0, Number(p.stock));
          if (!isNaN(numPrice) && numPrice > 0) STORE_INVENTORY[pid].price = numPrice;
        }
        if (PRODUCTS[pid]) {
          if (!isNaN(numPrice) && numPrice > 0) {
            PRODUCTS[pid].price = numPrice;
            PRODUCTS[pid].originalPrice = numOrig;
          }
        }
      });
      try {
        localStorage.setItem('odd_live_products', JSON.stringify(PRODUCTS));
        const inv = readStorageJSON('odd_admin_inventory', {}) || {};
        const skuMapInv = { 'phantom': 'ODD-PH-001', 'lucid': 'ODD-LC-003', 'first-move': 'ODD-FM-002', 'hamper': 'ODD-HM-004' };
        products.forEach(p => {
          const sku = p.sku || skuMapInv[p.id] || p.id;
          inv[sku] = {
            sku: sku,
            name: p.name,
            stock: Math.max(0, Number(p.stock)),
            price: Number(p.price)
          };
        });
        localStorage.setItem('odd_admin_inventory', JSON.stringify(inv));
      } catch (e) {}
      syncAllPriceElementsUI();
      if (typeof syncStockStatusUI === 'function') syncStockStatusUI();
      if (typeof updateCartUI === 'function') updateCartUI();
      if (typeof renderCheckoutSummary === 'function') renderCheckoutSummary();
    }

    if (shipRes && shipRes.ok) {
      const sData = await shipRes.json().catch(() => null);
      if (sData && typeof sData === 'object') {
        try {
          localStorage.setItem('odd_admin_shipping', JSON.stringify(sData));
        } catch (e) {}
      }
    }

    if (coupRes && coupRes.ok) {
      const cData = await coupRes.json();
      if (Array.isArray(cData.coupons)) {
        COUPONS_SYNCED_FROM_SERVER = true;
        ACTIVE_COUPONS = cData.coupons.filter(c => c && c.active !== false);
        try {
          localStorage.setItem('odd_coupons', JSON.stringify(ACTIVE_COUPONS));
          if (appliedCoupon) {
            const matched = ACTIVE_COUPONS.find(c => normalizeCouponCode(c.code) === normalizeCouponCode(appliedCoupon));
            if (matched) saveAppliedCouponState(matched);
          }
        } catch (e) {}
      }
    }

    if (bannerRes && bannerRes.ok) {
      const bData = await bannerRes.json();
      if (bData && typeof bData === 'object') {
        const bannerEl = document.getElementById('launch-banner');
        if (bannerEl) {
          if (bData.active === false || sessionStorage.getItem('odd_hide_banner') === 'true') {
            bannerEl.style.display = 'none';
            document.documentElement.style.setProperty('--banner-height', '0px');
          } else {
            bannerEl.style.display = '';
            const textNode = bannerEl.querySelector('.banner-text');
            if (textNode && bData.text) {
              const codeStr = bData.code ? `<code class="coupon-tag" id="banner-code">${escapeHTML(bData.code)}</code>` : '';
              textNode.innerHTML = `${escapeHTML(bData.text)} ${codeStr}`;
            }
            const copyBtn = bannerEl.querySelector('.banner-btn');
            if (copyBtn && bData.code) {
              copyBtn.setAttribute('onclick', `copyCouponCode('${escapeHTML(bData.code)}')`);
            }
          }
        }
      }
    }

    if (typeof updateCartUI === 'function') updateCartUI();
    if (typeof renderCheckoutSummary === 'function') renderCheckoutSummary();
  } catch (e) {
  } finally {
    isSyncingInventory = false;
  }
}
if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => syncInventoryFromApi(), { timeout: 1500 });
  } else {
    setTimeout(syncInventoryFromApi, 100);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  syncAllPriceElementsUI();
  if (typeof initScrollSpy === 'function') initScrollSpy();
  initCountdownTimer();
  updateCartUI();
  if (typeof initScrollReveal === 'function') initScrollReveal();
  if (typeof syncStockStatusUI === 'function') syncStockStatusUI();
});

function initCountdownTimer() {
  let totalSeconds = 6 * 86400 + 14 * 3600 + 22 * 60 + 45;
  const timerElem = document.getElementById('timer-val');
  if (!timerElem) return;

  setInterval(() => {
    if (totalSeconds <= 0) return;
    totalSeconds--;
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    timerElem.innerText = `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }, 1000);
}

function closeBanner() {
  const banner = document.getElementById('launch-banner');
  if (banner) banner.style.display = 'none';
  document.getElementById('site-header').style.top = '0';
  document.documentElement.style.setProperty('--banner-height', '0px');
}

function copyCouponCode(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast(`Copied promo code "${code}" to clipboard.`);
  }).catch(() => {
    showToast(`Promo code is ${code}`);
  });
}

function toggleMobileNav() {
  const drawer = document.getElementById('mobile-nav');
  if (drawer) drawer.classList.toggle('open');
}

function toggleCartDrawer() {
  const backdrop = document.getElementById('cart-backdrop');
  const drawer = document.getElementById('cart-drawer');
  if (backdrop && drawer) {
    const willOpen = !drawer.classList.contains('open');
    backdrop.classList.toggle('open', willOpen);
    drawer.classList.toggle('open', willOpen);
    document.body.classList.toggle('drawer-open', willOpen);
    if (willOpen) updateCartUI();
  }
}

function getProductAvailability(productId) {
  const authoritativePrice = PRODUCTS[productId]?.price || STORE_INVENTORY[productId]?.price;
  try {
    const localInv = JSON.parse(localStorage.getItem('odd_admin_inventory'));
    if (localInv && typeof localInv === 'object') {
      const skuMap = { 'phantom': 'ODD-PH-001', 'lucid': 'ODD-LC-003', 'first-move': 'ODD-FM-002', 'hamper': 'ODD-HM-004' };
      const sku = skuMap[productId] || productId;
      if (localInv[sku]) {
        const liveStock = Math.max(0, Number(localInv[sku].stock ?? 0));
        let livePrice = Number(localInv[sku].price);
        if (!livePrice || (productId === 'phantom' && livePrice === 1599) || (productId === 'first-move' && livePrice === 1599) || (productId === 'hamper' && livePrice === 4797)) {
          livePrice = authoritativePrice || 1599;
        }
        if (STORE_INVENTORY[productId]) {
          STORE_INVENTORY[productId].stock = liveStock;
          STORE_INVENTORY[productId].price = livePrice;
        }
        return { stock: liveStock, price: livePrice };
      }
    }
  } catch (e) {}

  const state = STORE_INVENTORY[productId];
  if (!state) return { stock: 0, price: authoritativePrice || 1599 };
  return { stock: Math.max(0, Number(state.stock) || 0), price: Math.max(0, Number(state.price || authoritativePrice) || 1599) };
}

function addToCart(productId) {
    const prod = PRODUCTS[productId];
    if (!prod) return;
    const availability = getProductAvailability(productId);
    const stock = availability.stock;
    const existing = cartState.find(item => item.id === productId);
    if (stock <= 0) {
      showToast(`${prod.name} is currently out of stock. It cannot be added to your Cart.`);
      syncStockStatusUI();
      return;
    }
    if (existing && existing.qty >= stock) {
      showToast(`Only ${stock} unit(s) of ${prod.name} are available.`);
      return;
    }
    prod.price = availability.price;

    /* Stock is authoritative on the server when the server is running; the client
       check is immediate UX, while checkout validates stock again atomically. */
    const existingItem = cartState.find(item => item.id === productId);
    if (existingItem) {
      existingItem.qty += 1;
    } else {
      cartState.push({ id: productId, qty: 1 });
    }

    saveCart();
    updateCartUI();
    showToast(`Added ${prod.name} to your Cart.`);
    
    const drawer = document.getElementById('cart-drawer');
    if (drawer && !drawer.classList.contains('open')) {
      toggleCartDrawer();
    }
  }

function updateCartQty(productId, delta) {
  const item = cartState.find(i => i.id === productId);
  if (!item) return;
  const nextQty = item.qty + Number(delta);
  const stock = getProductAvailability(productId).stock;
  if (nextQty > stock) { showToast(stock ? `Only ${stock} unit(s) are available.` : 'This perfume is currently out of stock.'); return; }
  item.qty = nextQty;
  if (item.qty <= 0) cartState = cartState.filter(i => i.id !== productId);
  saveCart(); updateCartUI();
}

function removeFromCart(productId) {
  cartState = cartState.filter(i => i.id !== productId);
  saveCart();
  updateCartUI();
  showToast('Item removed from Cart.');
}

function saveCart() {
  localStorage.setItem('odd_cart', JSON.stringify(cartState));
  if (appliedCoupon) {
    const code = normalizeCouponCode(appliedCoupon);
    localStorage.setItem('odd_coupon', code);
    localStorage.setItem('odd_coupon_code', code);
  } else {
    localStorage.removeItem('odd_coupon');
    localStorage.removeItem('odd_coupon_code');
    localStorage.removeItem('odd_coupon_discount');
    localStorage.removeItem('odd_coupon_meta');
  }
  document.dispatchEvent(new CustomEvent('odd:cart-updated', { detail: { items: cartState.length } }));
}

function updateCartUI() {
  renderCartPage();
  const countBadge = document.getElementById('cart-count');
  const drawerCount = document.getElementById('cart-drawer-count');
  const cartItemsList = document.getElementById('cart-items') || document.getElementById('cart-items-list');
  const cartEmpty = document.getElementById('cart-empty');
  const cartDrawer = document.getElementById('cart-drawer');
  const cartFooter = document.getElementById('cart-footer') || cartDrawer?.querySelector('.cart-footer');
  let emptyState = cartEmpty;
  if (!emptyState && cartItemsList) {
    emptyState = cartItemsList.querySelector('.cart-empty-state');
    if (!emptyState) { emptyState = document.createElement('div'); emptyState.className = 'cart-empty-state'; emptyState.innerHTML = '<span class="cart-empty-mark">ODD.</span><p>Your Cart is taking a breather.</p><span>Add a fragrance and it will show up here.</span><a href="shop.html">Explore the three fragrances</a>'; cartItemsList.appendChild(emptyState); }
  }
  
  const totalItems = cartState.reduce((sum, i) => sum + i.qty, 0);
  if (countBadge) countBadge.innerText = totalItems;
  if (drawerCount) drawerCount.innerText = totalItems;

  if (!cartItemsList) return;

  if (cartState.length === 0) {
    if (emptyState) emptyState.style.display = 'flex';
    if (cartFooter) cartFooter.style.display = 'none';
    cartItemsList.querySelectorAll('.cart-item-single').forEach(el => el.remove());
    const subtotalEl = document.getElementById('cart-subtotal'); if (subtotalEl) subtotalEl.textContent = '₹0';
    const discountRow = document.getElementById('cart-discount-row'); if (discountRow) discountRow.style.display = 'none';
    const appliedTag = document.getElementById('coupon-tag-applied'); if (appliedTag) appliedTag.style.display = 'none';
    const totalEl = document.getElementById('cart-total'); if (totalEl) totalEl.textContent = '₹0';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (cartFooter) cartFooter.style.display = 'block';

  let subtotal = 0;
  let itemsHtml = '';

  cartState.forEach(item => {
    const prod = PRODUCTS[item.id];
    if (!prod) return;
    const availability = getProductAvailability(item.id);
    const price = Number(availability.price ?? prod.price);
    const stock = Number(availability.stock) || 0;
    const unavailable = stock <= 0 || item.qty > stock;
    const itemTotal = price * item.qty;
    subtotal += itemTotal;

    itemsHtml += `
      <div class="cart-item-single${unavailable ? ' cart-item-unavailable' : ''}">
        <div class="cart-item-img">
          <img src="assets/images/${prod.bottleImage || 'Final-Logo-768x768.png'}?v=8.1" alt="${prod.name} perfume bottle" width="60" height="60" loading="lazy">
        </div>
        <div class="cart-item-details">
          <h4>${prod.name}</h4>
          <div class="cart-item-price">₹${price.toLocaleString('en-IN')}${(prod.originalPrice && Number(prod.originalPrice) > price) ? ` <span style="font-size:0.75rem; text-decoration:line-through; color:var(--text-muted); margin-left:0.35rem;">₹${Number(prod.originalPrice).toLocaleString('en-IN')}</span>` : ''}</div>
          <div class="qty-controls">
            <button type="button" aria-label="Remove one ${prod.name}" onclick="updateCartQty('${item.id}', -1)">−</button>
            <span>${item.qty}</span>
            <button type="button" aria-label="Add one ${prod.name}" onclick="updateCartQty('${item.id}', 1)" ${unavailable || item.qty >= stock ? 'disabled' : ''}>+</button>
          </div>
          ${unavailable ? `<small class="cart-item-stock-warning">${stock <= 0 ? 'Out of stock. Remove this item before checkout.' : `Only ${stock} available. Reduce the quantity to continue.`}</small>` : ''}
        </div>
        <button type="button" class="cart-item-remove" aria-label="Remove ${prod.name}" onclick="removeFromCart('${item.id}')">&times;</button>
      </div>
    `;
  });

  const oldItems = cartItemsList.querySelectorAll('.cart-item-single');
  oldItems.forEach(el => el.remove());
  cartItemsList.insertAdjacentHTML('beforeend', itemsHtml);

  const couponInfo = resolveAppliedCoupon(subtotal);
  const discountAmount = couponInfo.discountAmount;
  const appliedTag = document.getElementById('coupon-tag-applied');
  const appliedName = document.getElementById('applied-code-name');
  if (couponInfo.active) {
    if (appliedTag) appliedTag.style.display = 'flex';
    if (appliedName) {
      appliedName.textContent = couponInfo.minSpendShortfall > 0
        ? `${couponInfo.code} (Add ₹${couponInfo.minSpendShortfall.toLocaleString('en-IN')} for ${couponInfo.discountPercent}% OFF)`
        : `${couponInfo.code} (${couponInfo.discountPercent}% OFF)`;
    }
  } else {
    if (appliedTag) appliedTag.style.display = 'none';
  }

  const shippingCfg = getGlobalShippingConfig();
  const shippingFee = getGlobalShippingFee(subtotal);
  const grandTotal = Math.max(0, subtotal - discountAmount + shippingFee);

  const shippingBanner = cartDrawer?.querySelector('.free-shipping-banner');
  if (shippingBanner) {
    const bannerSpan = shippingBanner.querySelector('span');
    const fillBar = shippingBanner.querySelector('.shipping-progress .fill');
    if (shippingFee <= 0 || !shippingCfg.enabled) {
      if (bannerSpan) bannerSpan.textContent = 'Free Express Shipping Unlocked Across India';
      if (fillBar) fillBar.style.width = '100%';
    } else if (shippingCfg.freeThreshold > 0) {
      const remaining = Math.max(0, shippingCfg.freeThreshold - subtotal);
      const pct = Math.min(100, Math.round((subtotal / shippingCfg.freeThreshold) * 100));
      if (bannerSpan) bannerSpan.textContent = `Add ₹${remaining.toLocaleString('en-IN')} more for Free Shipping`;
      if (fillBar) fillBar.style.width = `${pct}%`;
    } else {
      if (bannerSpan) bannerSpan.textContent = `Flat Shipping: ₹${shippingFee.toLocaleString('en-IN')} Across India`;
      if (fillBar) fillBar.style.width = '100%';
    }
  }

  const subElem = document.getElementById('cart-subtotal');
  if (subElem) subElem.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
  
  const discountRow = document.getElementById('cart-discount-row');
  if (discountRow) {
    if (discountAmount > 0) {
      discountRow.style.display = 'flex';
      const discElem = document.getElementById('cart-discount');
      if (discElem) discElem.textContent = `-₹${discountAmount.toLocaleString('en-IN')}`;
    } else {
      discountRow.style.display = 'none';
    }
  }

  const shippingRow = document.getElementById('cart-shipping-row');
  const shippingVal = document.getElementById('cart-shipping-fee');
  if (shippingVal) {
    shippingVal.textContent = shippingFee > 0 ? `₹${shippingFee.toLocaleString('en-IN')}` : 'FREE';
    shippingVal.style.color = shippingFee > 0 ? '' : '#2E7D32';
    if (shippingRow) shippingRow.style.display = 'flex';
  }

  const totElem = document.getElementById('cart-total');
  if (totElem) totElem.textContent = `₹${grandTotal.toLocaleString('en-IN')}`;
}


function renderCartPage() {
  const container = document.getElementById('cart-page-items');
  if (!container) return;
  const subtotalEl = document.getElementById('cart-page-subtotal');
  const discountRow = document.getElementById('cart-page-discount-row');
  const discountEl = document.getElementById('cart-page-discount');
  const totalEl = document.getElementById('cart-page-total');
  const pageCouponTag = document.getElementById('cart-page-coupon-tag');
  const pageAppliedCode = document.getElementById('cart-page-applied-code-name');
  const checkoutLink = document.getElementById('cart-page-checkout');
  const items = Array.isArray(cartState) ? cartState.filter(item => PRODUCTS[item.id] && Number(item.qty) > 0) : [];
  if (!items.length) {
    container.innerHTML = '<div class="cart-page-empty"><span class="cart-empty-mark">ODD.</span><h2>Your Cart is taking a breather.</h2><p>Add a fragrance and it will appear here.</p><a class="btn btn-primary" href="shop.html">Explore the three fragrances</a></div>';
    if (subtotalEl) subtotalEl.textContent = '₹0';
    if (discountRow) { discountRow.hidden = true; discountRow.style.display = 'none'; }
    if (pageCouponTag) pageCouponTag.style.display = 'none';
    const cartPageShip = document.getElementById('cart-page-shipping');
    if (cartPageShip) cartPageShip.textContent = '₹0';
    if (totalEl) totalEl.textContent = '₹0';
    if (checkoutLink) { checkoutLink.setAttribute('aria-disabled', 'true'); checkoutLink.classList.add('is-disabled'); }
  } else {
    let subtotal = 0;
    let unavailable = false;
    container.innerHTML = items.map(item => {
      const product = PRODUCTS[item.id]; const stockState = getProductAvailability(item.id);
      const price = Number(stockState.price ?? product.price); const stock = Number(stockState.stock) || 0;
      const qty = Math.min(25, Number(item.qty)); const lineTotal = price * qty; subtotal += lineTotal;
      const out = stock <= 0 || qty > stock; if (out) unavailable = true;
      return `<article class="cart-page-line${out ? ' is-unavailable' : ''}">
        <div class="cart-page-product-image"><img src="assets/images/${product.bottleImage}?v=8.1" alt="ODD ${product.name}" width="80" height="80" style="aspect-ratio: 1 / 1;" loading="lazy"></div>
        <div class="cart-page-product-copy"><a href="${item.id === 'first-move' ? 'products-odd-first-move.html' : `products-odd-${item.id}.html`}">${product.name}</a><span>${item.id === 'hamper' ? '3 × 100 ml' : '100 ml'} · ₹${price.toLocaleString('en-IN')} each</span>
          <div class="cart-page-qty"><button type="button" data-cart-page-qty="-1" data-product-id="${item.id}" aria-label="Remove one ${product.name}">−</button><span>Qty ${qty}</span><button type="button" data-cart-page-qty="1" data-product-id="${item.id}" aria-label="Add one ${product.name}" ${out || qty >= stock ? 'disabled' : ''}>+</button><button type="button" class="cart-page-remove" data-cart-page-remove="${item.id}">Remove</button></div>
          ${out ? `<small class="cart-page-stock-warning">${stock <= 0 ? 'Currently out of stock. Remove this item to continue.' : `Only ${stock} available. Reduce the quantity to continue.`}</small>` : ''}</div>
        <strong class="cart-page-line-total">₹${lineTotal.toLocaleString('en-IN')}</strong>
      </article>`;
    }).join('');
    const couponInfo = resolveAppliedCoupon(subtotal);
    const discount = couponInfo.discountAmount;
    const shipping = getGlobalShippingFee(subtotal);
    if (subtotalEl) subtotalEl.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
    if (pageCouponTag) {
      if (couponInfo.active) {
        pageCouponTag.style.display = 'flex';
        if (pageAppliedCode) {
          pageAppliedCode.textContent = couponInfo.minSpendShortfall > 0
            ? `${couponInfo.code} (Add ₹${couponInfo.minSpendShortfall.toLocaleString('en-IN')} for ${couponInfo.discountPercent}% OFF)`
            : `${couponInfo.code} (${couponInfo.discountPercent}% OFF)`;
        }
      } else {
        pageCouponTag.style.display = 'none';
      }
    }
    if (discountRow) {
      discountRow.hidden = discount <= 0;
      discountRow.style.display = discount > 0 ? 'flex' : 'none';
    }
    if (discountEl) discountEl.textContent = `−₹${discount.toLocaleString('en-IN')}`;
    const cartPageShip = document.getElementById('cart-page-shipping');
    if (cartPageShip) {
      cartPageShip.textContent = shipping > 0 ? `₹${shipping.toLocaleString('en-IN')}` : 'FREE';
      cartPageShip.style.color = shipping > 0 ? '' : '#2E7D32';
    }
    if (totalEl) totalEl.textContent = `₹${Math.max(0, subtotal - discount + shipping).toLocaleString('en-IN')}`;
    if (checkoutLink) { checkoutLink.setAttribute('aria-disabled', String(unavailable)); checkoutLink.classList.toggle('is-disabled', unavailable); }
  }
  if (!container.dataset.cartActionsBound) {
    container.dataset.cartActionsBound = 'true';
    container.addEventListener('click', event => {
      const qtyButton = event.target.closest('[data-cart-page-qty]');
      const removeButton = event.target.closest('[data-cart-page-remove]');
      if (qtyButton) { event.preventDefault(); updateCartQty(qtyButton.dataset.productId, Number(qtyButton.dataset.cartPageQty)); }
      if (removeButton) { event.preventDefault(); removeFromCart(removeButton.dataset.cartPageRemove); }
    });
  }
  if (checkoutLink && !checkoutLink.dataset.guardBound) {
    checkoutLink.dataset.guardBound = 'true';
    checkoutLink.addEventListener('click', event => {
      if (checkoutLink.getAttribute('aria-disabled') === 'true') { event.preventDefault(); showToast('Remove unavailable items or adjust their quantities before checkout.'); }
    });
  }
}

async function applyCartCoupon(source) {
  const drawerInput = document.getElementById('cart-coupon-input') || document.getElementById('coupon-input-drawer');
  const pageInput = document.getElementById('cart-page-coupon-input');
  const input = (source === 'page' && pageInput)
    ? pageInput
    : (drawerInput && drawerInput.value.trim() ? drawerInput : (pageInput && pageInput.value.trim() ? pageInput : (drawerInput || pageInput)));
  if (!input) return;
  const code = normalizeCouponCode(input.value);
  if (!code) {
    showToast('Please enter a promo code.');
    input.focus();
    return;
  }

  const subtotal = getCartSubtotal();
  const customerSession = readStorageJSON('odd_customer_session', null);
  const customerEmail = String(customerSession?.email || '').trim().toLowerCase();

  try {
    const res = await fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, subtotal, email: customerEmail })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.valid) {
      const normalized = normalizeCouponCode(data.code || code);
      const matched = ACTIVE_COUPONS.find(c => normalizeCouponCode(c.code) === normalized);
      const couponPayload = {
        code: normalized,
        discount: Number(data.discountPercent || matched?.discount || 0),
        maxDiscount: Number(matched?.maxDiscount ?? matched?.max_discount ?? 0),
        minSpend: Number(matched?.minSpend ?? matched?.min_spend ?? 0)
      };
      if (!matched) {
        ACTIVE_COUPONS.push(couponPayload);
      }
      saveAppliedCouponState(couponPayload);
      saveCart();
      input.value = '';
      if (drawerInput && drawerInput !== input) drawerInput.value = '';
      if (pageInput && pageInput !== input) pageInput.value = '';
      updateCartUI();
      if (typeof renderCheckoutSummary === 'function') renderCheckoutSummary();
      showToast(`Code ${normalized} applied: ${couponPayload.discount}% discount!`);
      return;
    } else {
      showToast(data.error || 'Invalid or expired promo code.');
      return;
    }
  } catch (e) {
    // Fallback to cached active coupons if network is temporarily unreachable
    try {
      const localCoupons = readStorageJSON('odd_admin_coupons', null) || readStorageJSON('odd_coupons', null) || ACTIVE_COUPONS;
      const found = Array.isArray(localCoupons)
        ? localCoupons.find(c => normalizeCouponCode(c.code) === code && c.active !== false)
        : null;
      if (found) {
        const minSpend = Number(found.minSpend ?? found.min_spend ?? 0);
        if (minSpend > 0 && subtotal < minSpend) {
          showToast(`Minimum order of ₹${minSpend.toLocaleString('en-IN')} required for ${found.code}.`);
          return;
        }
        saveAppliedCouponState(found);
        saveCart();
        input.value = '';
        updateCartUI();
        if (typeof renderCheckoutSummary === 'function') renderCheckoutSummary();
        showToast(`Code ${found.code} applied!`);
        return;
      }
    } catch (err) {}
    showToast('Invalid or expired promo code.');
  }
}

function removeCartCoupon() {
  saveAppliedCouponState(null);
  saveCart();
  updateCartUI();
  if (typeof renderCheckoutSummary === 'function') renderCheckoutSummary();
  showToast('Coupon removed.');
}

function applyCoupon() { applyCartCoupon(); }
async function applyCouponFromBanner() {
  const code = normalizeCouponCode(document.getElementById('banner-code')?.textContent || 'LAUNCH20') || 'LAUNCH20';
  const subtotal = getCartSubtotal();
  const customerSession = readStorageJSON('odd_customer_session', null);
  const customerEmail = String(customerSession?.email || '').trim().toLowerCase();

  try {
    const res = await fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, subtotal, email: customerEmail })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.valid) {
      const normalized = normalizeCouponCode(data.code || code);
      const matched = ACTIVE_COUPONS.find(c => normalizeCouponCode(c.code) === normalized);
      const couponPayload = {
        code: normalized,
        discount: Number(data.discountPercent || matched?.discount || 0),
        maxDiscount: Number(matched?.maxDiscount ?? matched?.max_discount ?? 0),
        minSpend: Number(matched?.minSpend ?? matched?.min_spend ?? 0)
      };
      if (!matched) ACTIVE_COUPONS.push(couponPayload);
      saveAppliedCouponState(couponPayload);
      saveCart();
      updateCartUI();
      if (typeof renderCheckoutSummary === 'function') renderCheckoutSummary();
      showToast(`${normalized} applied! ${couponPayload.discount}% discount is ready for your order.`);
      return;
    } else if (res.status >= 400 && data.error) {
      showToast(data.error);
      return;
    }
  } catch (e) {}

  const found = ACTIVE_COUPONS.find(item => normalizeCouponCode(item.code) === code && item.active !== false);
  if (found) {
    saveAppliedCouponState(found);
    saveCart();
    updateCartUI();
    if (typeof renderCheckoutSummary === 'function') renderCheckoutSummary();
    showToast(`${found.code} applied: ${found.discount || 20}% discount ready.`);
  } else {
    saveAppliedCouponState({ code, discount: 20, maxDiscount: 500, minSpend: 0 });
    saveCart();
    updateCartUI();
    if (typeof renderCheckoutSummary === 'function') renderCheckoutSummary();
    showToast(`${code} applied: 20% discount ready.`);
  }
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || !event.target) return;
  const id = event.target.id;
  if (id === 'cart-coupon-input' || id === 'coupon-input-drawer') {
    event.preventDefault();
    applyCartCoupon('drawer');
  } else if (id === 'cart-page-coupon-input') {
    event.preventDefault();
    applyCartCoupon('page');
  } else if (id === 'chk-coupon-input' && typeof applyCheckoutCoupon === 'function') {
    event.preventDefault();
    applyCheckoutCoupon();
  }
});

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('open');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('open');
}

function openSearchModal() {
  const modal = document.getElementById('search-modal');
  if (modal) {
    modal.classList.add('open');
    const input = modal.querySelector('.search-modal-input');
    if (input) {
      input.focus();
      handleSearchInput('');
    }
  }
}

function closeSearchModal() {
  const modal = document.getElementById('search-modal');
  if (modal) modal.classList.remove('open');
}

function handleSearchInput(query) {
  const resultsContainer = document.getElementById('search-modal-results');
  if (!resultsContainer) return;
  const q = (query || '').toLowerCase().trim();
  const matches = Object.values(PRODUCTS).filter(p =>
    p.name.toLowerCase().includes(q) || p.notes.toLowerCase().includes(q) ||
    p.tagline.toLowerCase().includes(q) || p.occasion.toLowerCase().includes(q)
  );
  if (!matches.length) {
    resultsContainer.innerHTML = `<div class="search-empty-state"><span>NO MATCHES</span><p>No fragrance found for “${escapeHTML(query)}”. Try a note like oud, citrus, tea or woods.</p></div>`;
    return;
  }
  resultsContainer.innerHTML = matches.map(product => {
    const stock = getProductAvailability(product.id).stock;
    const detailLink = product.id === 'first-move' ? 'products-odd-first-move.html' : `products-odd-${product.id}.html`;
    return `<article class="search-result-row"><a class="search-result-visual" href="${detailLink}"><img src="assets/images/${product.bottleImage}?v=8.1" alt="ODD ${product.name}" width="60" height="60" style="aspect-ratio: 1 / 1;"></a><div class="search-result-copy"><a href="${detailLink}" class="search-result-name">${product.name}</a><p>${product.notes}</p><span class="search-stock ${stock > 0 ? 'in-stock' : 'out-stock'}"><i></i>${stock > 0 ? 'In stock' : 'Currently unavailable'}</span></div><div class="search-result-action"><strong>₹${product.price.toLocaleString('en-IN')}</strong><button type="button" class="search-add-btn" data-search-add="${product.id}" ${stock <= 0 ? 'disabled' : ''}>${stock > 0 ? 'Add to Cart' : 'Out of stock'}</button></div></article>`;
  }).join('');
  resultsContainer.querySelectorAll('[data-search-add]').forEach(button => button.addEventListener('click', () => { closeSearchModal(); addToCart(button.dataset.searchAdd); }));
}
function handleEmailSignup(event) {
  event?.preventDefault();
  const form = event?.currentTarget;
  const input = form?.querySelector('input[type="email"]');
  if (!input || !input.checkValidity()) { input?.reportValidity(); return; }
  const email = input.value.trim();

  fetch('/api/newsletter/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ email })
  }).then(res => res.json()).then(data => {
    showToast(data.message || 'Thank you for subscribing to ODD Fragrance Notes.');
    if (form) form.reset();
  }).catch(() => {
    showToast('Thank you for subscribing to ODD Fragrance Notes.');
    if (form) form.reset();
  });
}

function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])); }


function initScrollReveals() {
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  document.querySelectorAll('.reveal-on-scroll').forEach(el => observer.observe(el));
}

function showToast(message) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = message;
  container.appendChild(toast);
  
  // Trigger reflow
  void toast.offsetWidth;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  initScrollReveals();
});



// --- Dynamic Stock UI Sync Across All Pages ---
function syncStockStatusUI() {
  Object.keys(PRODUCTS).forEach(productId => {
    const product = PRODUCTS[productId]; const stock = getProductAvailability(productId).stock;
    const out = stock <= 0;
    const addButtons = [...document.querySelectorAll('[onclick]')].filter(button => {
      const handler = button.getAttribute('onclick') || '';
      return handler.includes(`addToCart('${productId}')`) || handler.includes(`buyNow('${productId}')`);
    });
    addButtons.forEach(button => {
      button.disabled = out;
      button.setAttribute('aria-disabled', String(out));
      button.classList.toggle('is-out-of-stock', out);
      if (!button.dataset.originalText) button.dataset.originalText = button.textContent.trim();
      button.textContent = out ? 'Out of stock' : button.dataset.originalText;
    });
    const file = productId === 'first-move' ? 'products-odd-first-move.html' : `products-odd-${productId}.html`;
    const productPage = location.pathname.toLowerCase().endsWith(file);
    if (productPage) {
      const button = document.querySelector('.product-add-btn');
      if (button) { button.disabled = out; button.textContent = out ? 'Out of stock' : `Add to Cart — ₹${product.price.toLocaleString('en-IN')}`; }
      const priceBlock = document.querySelector('.product-detail-price');
      let status = document.getElementById('product-stock-status');
      if (!status && priceBlock) { status = document.createElement('span'); status.id = 'product-stock-status'; status.className = 'product-stock-status'; priceBlock.insertAdjacentElement('afterend', status); }
      if (status) { status.textContent = out ? 'Currently out of stock' : 'Available · Ready to ship'; status.classList.toggle('out-stock', out); }
    }
    document.querySelectorAll(`.product-card[data-product="${productId}"]`).forEach(card => {
      const button = card.querySelector('[onclick*="addToCart"]');
      if (button) { button.disabled = out; button.textContent = out ? 'Out of stock' : (button.dataset.originalText || 'Add to Cart'); }
      let badge = card.querySelector('.stock-state-badge');
      if (out && !badge) { badge = document.createElement('span'); badge.className = 'stock-state-badge'; badge.textContent = 'Out of stock'; card.querySelector('.product-door-container')?.appendChild(badge); }
      if (!out) badge?.remove();
    });
    document.querySelectorAll(`.carousel-slide [onclick*="addToCart('${productId}')"]`).forEach(button => {
      button.disabled = out; button.textContent = out ? 'Out of stock' : (button.dataset.originalText || 'Add to Cart');
      const slide = button.closest('.carousel-slide'); let badge = slide?.querySelector('.carousel-stock-badge');
      if (slide && out && !badge) { badge = document.createElement('span'); badge.className = 'carousel-stock-badge'; badge.textContent = 'Currently unavailable'; slide.querySelector('.slide-image-box')?.appendChild(badge); }
      if (!out) badge?.remove();
    });
    if (typeof currentQvId !== 'undefined' && currentQvId === productId) {
      const add = document.querySelector('.qv-add-btn'); if (add) { add.disabled = out; add.textContent = out ? 'Out of stock' : 'Add to cart'; }
      const buy = document.querySelector('.qv-buy-btn'); if (buy) { buy.disabled = out; buy.textContent = out ? 'Out of stock' : 'Buy now'; }
      const stockBadge = document.querySelector('.qv-stock-badge'); if (stockBadge) stockBadge.innerHTML = out ? '<span class="qv-stock-dot"></span> Currently out of stock' : '<span class="qv-stock-dot"></span> In stock, ready to ship';
    }
  });
}

async function refreshStoreState() {
  try {
    // Static host mode: load state from localStorage (set by admin dashboard)
    const localInv = JSON.parse(localStorage.getItem('odd_admin_inventory'));
    if (localInv) {
      const skuMap = {
        'ODD-PH-001': 'phantom',
        'ODD-LC-003': 'lucid',
        'ODD-FM-002': 'first-move',
        'ODD-HM-004': 'hamper'
      };
      Object.entries(localInv).forEach(([key, item]) => {
        const pid = skuMap[key] || key;
        if (STORE_INVENTORY[pid]) {
          STORE_INVENTORY[pid].stock = Number(item.stock);
          STORE_INVENTORY[pid].price = Number(item.price);
        }
        if (PRODUCTS[pid]) {
          PRODUCTS[pid].price = Number(item.price);
        }
      });
    }

    const localCoupons = JSON.parse(localStorage.getItem('odd_admin_coupons') || localStorage.getItem('odd_coupons') || 'null');
    if (localCoupons && Array.isArray(localCoupons)) {
      ACTIVE_COUPONS = localCoupons.filter(c => c.active !== false);
    }

    // Sync banner settings from admin
    const localBanner = JSON.parse(localStorage.getItem('odd_admin_banner') || 'null');
    const bannerEl = document.getElementById('launch-banner');
    if (bannerEl && localBanner) {
      if (localBanner.active === false || sessionStorage.getItem('odd_hide_banner') === 'true') {
        bannerEl.style.display = 'none';
        document.documentElement.style.setProperty('--banner-height', '0px');
      } else {
        bannerEl.style.display = '';
        const textNode = bannerEl.querySelector('.banner-text');
        if (textNode && localBanner.text) {
          const codeStr = localBanner.code ? `<code class="coupon-tag" id="banner-code">${escapeHTML(localBanner.code)}</code>` : '';
          textNode.innerHTML = `${escapeHTML(localBanner.text)} ${codeStr}`;
        }
        const copyBtn = bannerEl.querySelector('.banner-btn');
        if (copyBtn && localBanner.code) {
          copyBtn.setAttribute('onclick', `copyCouponCode('${escapeHTML(localBanner.code)}')`);
        }
      }
    }
    
    // Update UI elements across product cards, hero, CTA buttons, and modal
    syncAllPriceElementsUI();
    updateCartUI();
    syncStockStatusUI();
    await syncInventoryFromApi();
  } catch (e) {
    syncStockStatusUI();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  syncStockStatusUI();
  refreshStoreState();
});

window.addEventListener('storage', (e) => {
  if (e.key === 'odd_admin_inventory' || e.key === 'odd_orders' || e.key === 'odd_admin_coupons' || e.key === 'odd_admin_shipping' || e.key === 'odd_coupons') {
    try {
      const adminInv = readStorageJSON('odd_admin_inventory', null);
      if (adminInv && typeof adminInv === 'object') {
        const skuMap = { 'ODD-PH-001': 'phantom', 'ODD-LC-003': 'lucid', 'ODD-FM-002': 'first-move', 'ODD-HM-004': 'hamper' };
        Object.entries(adminInv).forEach(([key, item]) => {
          const pid = skuMap[key] || key;
          if (PRODUCTS[pid] && item && item.price) {
            const pNum = Number(item.price);
            if ((pid === 'phantom' && pNum === 1599) || (pid === 'first-move' && pNum === 1599) || (pid === 'hamper' && pNum === 4797)) {
              // Keep authoritative price
            } else if (!isNaN(pNum) && pNum > 0) {
              PRODUCTS[pid].price = pNum;
              if (item.originalPrice != null && Number(item.originalPrice) > pNum) {
                PRODUCTS[pid].originalPrice = Number(item.originalPrice);
              }
            }
          }
          if (STORE_INVENTORY[pid] && item) {
            if (item.stock != null) STORE_INVENTORY[pid].stock = Math.max(0, Number(item.stock));
            if (item.price != null && Number(item.price) > 0) {
              const pNum = Number(item.price);
              if ((pid === 'phantom' && pNum === 1599) || (pid === 'first-move' && pNum === 1599) || (pid === 'hamper' && pNum === 4797)) {
                // Keep authoritative price
              } else {
                STORE_INVENTORY[pid].price = pNum;
              }
            }
          }
        });
      }
    } catch (_) {}
    syncAllPriceElementsUI();
    updateCartUI();
    syncStockStatusUI();
    if (typeof renderCheckoutSummary === 'function') renderCheckoutSummary();
  }
  if (e.key === 'odd_coupon' || e.key === 'odd_coupon_code' || e.key === 'odd_coupon_discount' || e.key === 'odd_coupon_meta') {
    appliedCoupon = normalizeCouponCode(localStorage.getItem('odd_coupon') || localStorage.getItem('odd_coupon_code'));
    updateCartUI();
    if (typeof renderCheckoutSummary === 'function') renderCheckoutSummary();
  }
  if (e.key === 'odd_cart') {
    cartState = readStorageJSON('odd_cart', []).filter(item => item && PRODUCTS[item.id] && Number.isInteger(Number(item.qty)) && Number(item.qty) > 0).map(item => ({ id: item.id, qty: Number(item.qty) }));
    updateCartUI();
    if (typeof renderCheckoutSummary === 'function') renderCheckoutSummary();
  }
});

window.addEventListener('odd:inventory-updated', () => {
  refreshStoreState();
  syncStockStatusUI();
});


function initScrollSpy() {
  const sections = [
    { id: 'story', link: 'index.html#story' },
    { id: 'comparison', link: 'index.html#comparison' },
    { id: 'showcase', link: 'index.html#showcase' },
    { id: 'hero-top', link: 'index.html' } // fallback for top
  ];
  
  window.addEventListener('scroll', () => {
    let current = '';
    const scrollPos = window.scrollY + 200; // offset
    
    // Check from bottom to top
    for (let s of sections) {
      if (s.id === 'hero-top') {
        if (scrollPos < 500) { current = s.link; break; }
        continue;
      }
      const el = document.getElementById(s.id);
      if (el && el.offsetTop <= scrollPos) {
        current = s.link;
        break;
      }
    }
    
    if (current) {
      document.querySelectorAll('.main-nav-link').forEach(a => {
        if (a.getAttribute('href') === current) {
          a.classList.add('active');
        } else {
          // don't remove if it's an external link like shop.html that shouldn't be active anyway
          if(a.getAttribute('href') !== 'shop.html' || current === 'shop.html') {
             a.classList.remove('active');
          }
        }
      });
    }
  });
}


/* ==========================================================================
   QUICK VIEW & ACCOUNT MODAL JS ENGINE
   ========================================================================== */

let currentQvId = 'phantom';
let currentQvQty = 1;

function openQuickView(productId) {
  const targetId = productId || 'phantom';
  const prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[targetId]) ? PRODUCTS[targetId] : {
    id: targetId,
    name: targetId.charAt(0).toUpperCase() + targetId.slice(1),
    price: 899,
    notes: 'Luxury Perfume',
    bottleImage: targetId === 'lucid' ? 'Lucid single bottle.webp' : targetId === 'first-move' ? 'First Move single bottle.webp' : targetId === 'hamper' ? 'Trio Gift Hamper.webp' : 'Phantom Single bottle.webp'
  };

  currentQvId = targetId;
  currentQvQty = 1;

  const modal = document.getElementById('quick-view-modal');
  if (!modal) {
    if (typeof addToCart === 'function') addToCart(targetId);
    return;
  }

  const title = modal.querySelector('.qv-title');
  if (title) title.innerText = prod.name;
  
  const price = modal.querySelector('.qv-price');
  if (price) {
    const avail = getProductAvailability(targetId);
    const livePrice = Number(avail.price || prod.price || 1999);
    const origPrice = (prod.originalPrice != null && Number(prod.originalPrice) > livePrice) ? Number(prod.originalPrice) : null;
    if (origPrice && origPrice > livePrice) {
      const discount = Math.round((origPrice - livePrice) / origPrice * 100);
      price.innerHTML = `<span class="price-current">&#8377; ${livePrice.toLocaleString('en-IN')}</span> <span class="price-original">&#8377; ${origPrice.toLocaleString('en-IN')}</span> <span class="price-discount-pill">-${discount}%</span>`;
    } else {
      price.innerHTML = `&#8377; ${livePrice.toLocaleString('en-IN')}`;
    }
  }

  const img = modal.querySelector('.quick-view-bottle-img');
  if (img) img.src = 'assets/images/' + prod.bottleImage + '?v=8.1';

  const brand = modal.querySelector('.qv-brand');
  if (brand) brand.innerText = 'ODD PERFUME · ' + (prod.notes || '');

  const link = modal.querySelector('.qv-full-details-link');
  if (link) link.href = 'products-odd-' + targetId + '.html';

  const qtyEl = document.getElementById('qv-qty');
  if (qtyEl) qtyEl.innerText = '1';

  modal.classList.add('open');
  modal.style.display = 'flex';
  modal.style.opacity = '1';
  modal.style.visibility = 'visible';
  document.body.classList.add('drawer-open');
}

function closeQuickView() {
  const modal = document.getElementById('quick-view-modal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
    modal.style.opacity = '0';
    modal.style.visibility = 'hidden';
  }
  document.body.classList.remove('drawer-open');
}

function updateQvQty(delta) {
  currentQvQty = Math.max(1, currentQvQty + delta);
  const qtyEl = document.getElementById('qv-qty');
  if (qtyEl) qtyEl.innerText = currentQvQty;
}

function addQvToCart() {
  if (typeof addToCart === 'function') {
    for (let i = 0; i < currentQvQty; i++) {
      addToCart(currentQvId);
    }
  }
  closeQuickView();
  if (typeof toggleCartDrawer === 'function') toggleCartDrawer();
}

function buyNow(productId) {
  const availability = typeof getProductAvailability === 'function' ? getProductAvailability(productId) : { stock: 0 };
  if (!availability || Number(availability.stock) <= 0) {
    if (typeof addToCart === 'function') addToCart(productId);
    return;
  }
  if (typeof addToCart === 'function') addToCart(productId);
  window.location.href = 'checkout.html';
}

function buyNowQv() {
  if (typeof addToCart === 'function') {
    for (let i = 0; i < currentQvQty; i++) {
      addToCart(currentQvId);
    }
  }
  closeQuickView();
  window.location.href = 'checkout.html';
}

function showAddAddressModal() {
  const modal = document.getElementById('edit-address-modal');
  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
  } else {
    if (typeof showToast === 'function') showToast('Address manager ready.');
  }
}

function hideAddAddressModal() {
  const modal = document.getElementById('edit-address-modal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
}

function hideEditAddressModal() {
  hideAddAddressModal();
}

function setDefaultAddress(btn) {
  if (typeof showToast === 'function') showToast('Default shipping address updated.');
}

function checkAdminAccountRole() {
  const session = localStorage.getItem('odd_admin_session');
  const role = localStorage.getItem('odd_role');
  const isAdmin = session || role === 'admin';

  if (isAdmin) {
    const nav = document.querySelector('.acc-nav');
    if (nav && !document.getElementById('acc-admin-btn')) {
      const btn = document.createElement('a');
      btn.id = 'acc-admin-btn';
      btn.href = 'admin.html';
      btn.className = 'acc-nav-link';
      btn.style.background = 'var(--brand-orange, #E86B32)';
      btn.style.color = '#FFFFFF';
      btn.style.marginTop = '1rem';
      btn.style.fontWeight = '700';
      btn.style.boxSizing = 'border-box';
      btn.style.width = '100%';
      btn.style.textAlign = 'center';
      btn.textContent = 'Go to Admin Portal';
      nav.appendChild(btn);
    }
    
    // Inject into Desktop Header
    const desktopNav = document.querySelector('.main-desktop-nav');
    if (desktopNav && !document.getElementById('header-admin-btn')) {
      const btn = document.createElement('a');
      btn.id = 'header-admin-btn';
      btn.href = 'admin.html';
      btn.className = 'main-nav-link';
      btn.style.color = 'var(--brand-orange, #E86B32)';
      btn.style.fontWeight = '700';
      btn.textContent = 'Admin Portal';
      desktopNav.appendChild(btn);
    }

    // Inject into Mobile Drawer
    const mobileDrawerContent = document.querySelector('.mobile-nav-drawer .drawer-content');
    if (mobileDrawerContent && !document.getElementById('mobile-admin-btn')) {
      const btn = document.createElement('a');
      btn.id = 'mobile-admin-btn';
      btn.href = 'admin.html';
      btn.style.color = 'var(--brand-orange, #E86B32)';
      btn.style.fontWeight = '700';
      btn.textContent = 'Admin Portal';
      
      // Insert before the footer
      const footer = mobileDrawerContent.querySelector('.drawer-footer');
      if (footer) {
        mobileDrawerContent.insertBefore(btn, footer);
      } else {
        mobileDrawerContent.appendChild(btn);
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  checkAdminAccountRole();
  initProductGallerySwipe();
});

let currentProductSlide = 0;

function switchProductSlide(index) {
  const slider = document.getElementById('gallerySlider');
  if (!slider) return;
  const slides = slider.querySelectorAll('.product-gallery-slide');
  if (!slides.length) return;
  const targetIdx = Math.max(0, Math.min(slides.length - 1, index));
  currentProductSlide = targetIdx;
  
  const targetSlide = slides[targetIdx];
  if (targetSlide) {
    slider.scrollTo({
      left: targetSlide.offsetLeft,
      behavior: 'smooth'
    });
  }
  
  const dots = document.querySelectorAll('.gallery-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === targetIdx));
  const btns = document.querySelectorAll('.product-gallery-thumb-btn');
  btns.forEach((b, i) => b.classList.toggle('active', i === targetIdx));
}
window.switchProductSlide = switchProductSlide;

function stepProductSlide(delta) {
  const slider = document.getElementById('gallerySlider');
  if (!slider) return;
  const slides = slider.querySelectorAll('.product-gallery-slide');
  if (!slides.length) return;
  const nextIdx = (currentProductSlide + delta + slides.length) % slides.length;
  switchProductSlide(nextIdx);
}
window.stepProductSlide = stepProductSlide;

function initProductGallerySwipe() {
  const slider = document.getElementById('gallerySlider');
  if (!slider) return;

  let startX = 0;
  let startY = 0;
  let isPointerDown = false;
  let isSwiping = false;

  // Touch Swipe
  slider.addEventListener('touchstart', (e) => {
    if (!e.touches.length) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isSwiping = true;
  }, { passive: true });

  slider.addEventListener('touchmove', (e) => {
    if (!isSwiping || !e.touches.length) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - startX;
    const diffY = currentY - startY;

    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
      // Horizontal swipe gesture in progress
    }
  }, { passive: true });

  slider.addEventListener('touchend', (e) => {
    if (!isSwiping || !e.changedTouches.length) return;
    isSwiping = false;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - startX;
    const diffY = endY - startY;

    if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX < 0) {
        stepProductSlide(1); // Swipe left -> next
      } else {
        stepProductSlide(-1); // Swipe right -> prev
      }
    }
  }, { passive: true });

  // Mouse Drag Swipe for Desktop
  slider.addEventListener('mousedown', (e) => {
    isPointerDown = true;
    startX = e.clientX;
    startY = e.clientY;
  });

  window.addEventListener('mouseup', (e) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    const diffX = e.clientX - startX;
    const diffY = e.clientY - startY;
    if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX < 0) {
        stepProductSlide(1);
      } else {
        stepProductSlide(-1);
      }
    }
  });

  // Keep button states in sync with scroll/snap
  slider.addEventListener('scroll', () => {
    const width = slider.clientWidth || 1;
    const idx = Math.round(slider.scrollLeft / width);
    if (idx !== currentProductSlide && idx >= 0) {
      currentProductSlide = idx;
      const dots = document.querySelectorAll('.gallery-dot');
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
      const btns = document.querySelectorAll('.product-gallery-thumb-btn');
      btns.forEach((b, i) => b.classList.toggle('active', i === idx));
    }
  }, { passive: true });
}
window.initProductGallerySwipe = initProductGallerySwipe;



