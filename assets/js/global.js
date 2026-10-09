
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
    tagline: 'Unseen. Unforgotten. Dominant.',
    price: 899,
    originalPrice: 1199,
    notes: 'Oud · Saffron · Amberwood',
    bottleImage: 'Phantom Single bottle.png',
    notesList: ['Oud', 'Saffron', 'Amberwood'],
    intensity: '5/5',
    warmth: '4/5',
    freshness: '1/5',
    sweetness: '2/5',
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
    price: 899,
    originalPrice: 1199,
    notes: 'Bergamot · Patchouli · Blackcurrant',
    bottleImage: 'Lucid single bottle.png',
    notesList: ['Bergamot', 'Patchouli', 'Blackcurrant'],
    intensity: '2/5',
    warmth: '1/5',
    freshness: '5/5',
    sweetness: '1/5',
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
    price: 899,
    originalPrice: 1199,
    notes: 'Citrus · Black Tea · Smoky Musk',
    bottleImage: 'First Move single bottle.png',
    notesList: ['Citrus', 'Black Tea', 'Smoky Musk'],
    intensity: '4/5',
    warmth: '3/5',
    freshness: '3/5',
    sweetness: '3/5',
    occasion: 'Dates, evenings out, anytime you need confidence',
    themeColor: '#E67A7A',
    bgColor: '#110A0A',
    textColor: '#ffffff'
  }
};

let cartState = JSON.parse(localStorage.getItem('odd_cart') || '[]');
let appliedCoupon = localStorage.getItem('odd_coupon') || null;

document.addEventListener('DOMContentLoaded', () => {
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
    backdrop.classList.toggle('open');
    drawer.classList.toggle('open');
  }
}

function addToCart(productId) {
    const prod = PRODUCTS[productId];
    if (!prod) return;

    // Check stock from Admin Inventory
    const inv = JSON.parse(localStorage.getItem('odd_admin_inventory'));
    const skuMap = { 'phantom': 'ODD-PH-001', 'lucid': 'ODD-LC-003', 'first-move': 'ODD-FM-002' };
    const sku = skuMap[productId];
    if (inv && sku && inv[sku]) {
      const stock = inv[sku].stock;
      if (stock <= 0) {
        showToast(`${prod.name} is currently OUT OF STOCK.`);
        return;
      }
      const existing = cartState.find(item => item.id === productId);
      if (existing && existing.qty >= stock) {
        showToast(`Only ${stock} unit(s) of ${prod.name} available in stock.`);
        return;
      }
    }

    const existing = cartState.find(item => item.id === productId);
    if (existing) {
      existing.qty += 1;
    } else {
      cartState.push({ id: productId, qty: 1 });
    }

    saveCart();
    updateCartUI();
    showToast(`Added ${prod.name} to your bag.`);
    
    const drawer = document.getElementById('cart-drawer');
    if (drawer && !drawer.classList.contains('open')) {
      toggleCartDrawer();
    }
  }

function updateCartQty(productId, delta) {
  const item = cartState.find(i => i.id === productId);
  if (!item) return;

  item.qty += delta;
  if (item.qty <= 0) {
    cartState = cartState.filter(i => i.id !== productId);
  }
  saveCart();
  updateCartUI();
}

function removeFromCart(productId) {
  cartState = cartState.filter(i => i.id !== productId);
  saveCart();
  updateCartUI();
  showToast('Item removed from bag.');
}

function saveCart() {
  localStorage.setItem('odd_cart', JSON.stringify(cartState));
  if (appliedCoupon) localStorage.setItem('odd_coupon', appliedCoupon);
  else localStorage.removeItem('odd_coupon');
}

function updateCartUI() {
  const countBadge = document.getElementById('cart-count');
  const drawerCount = document.getElementById('cart-drawer-count');
  const cartItemsList = document.getElementById('cart-items');
  const cartEmpty = document.getElementById('cart-empty');
  const cartFooter = document.getElementById('cart-footer');
  
  const totalItems = cartState.reduce((sum, i) => sum + i.qty, 0);
  if (countBadge) countBadge.innerText = totalItems;
  if (drawerCount) drawerCount.innerText = totalItems;

  if (!cartItemsList) return;

  if (cartState.length === 0) {
    if (cartEmpty) cartEmpty.style.display = 'block';
    if (cartFooter) cartFooter.style.display = 'none';
    const renderedItems = cartItemsList.querySelectorAll('.cart-item-single');
    renderedItems.forEach(el => el.remove());
    return;
  }

  if (cartEmpty) cartEmpty.style.display = 'none';
  if (cartFooter) cartFooter.style.display = 'block';

  let subtotal = 0;
  let itemsHtml = '';

  cartState.forEach(item => {
    const prod = PRODUCTS[item.id];
    if (!prod) return;
    const itemTotal = prod.price * item.qty;
    subtotal += itemTotal;

    itemsHtml += `
      <div class="cart-item-single">
        <div class="cart-item-img">
          <img src="assets/images/${prod.bottleImage || 'Final-Logo-768x768.png'}" alt="${prod.name}">
        </div>
        <div class="cart-item-details">
          <h4>${prod.name}</h4>
          <div class="cart-item-price">₹${prod.price} <span style="font-size:0.75rem; text-decoration:line-through; color:var(--text-muted);">₹${prod.originalPrice}</span></div>
          <div class="qty-controls">
            <button onclick="updateCartQty('${item.id}', -1)">-</button>
            <span>${item.qty}</span>
            <button onclick="updateCartQty('${item.id}', 1)">+</button>
          </div>
        </div>
        <button class="cart-item-remove" onclick="removeFromCart('${item.id}')">&times;</button>
      </div>
    `;
  });

  const oldItems = cartItemsList.querySelectorAll('.cart-item-single');
  oldItems.forEach(el => el.remove());
  cartItemsList.insertAdjacentHTML('beforeend', itemsHtml);

  let discountAmount = 0;
    if (appliedCoupon) {
      const discountPct = Number(localStorage.getItem('odd_coupon_discount')) || (appliedCoupon === 'LAUNCH20' ? 20 : 10);
      discountAmount = Math.round(subtotal * (discountPct / 100));
    }

  const grandTotal = subtotal - discountAmount;

  const subElem = document.getElementById('cart-subtotal');
  if (subElem) subElem.innerText = `₹${subtotal.toLocaleString('en-IN')}`;
  
  const discountRow = document.getElementById('cart-discount-row');
  if (discountRow) {
    if (discountAmount > 0) {
      discountRow.style.display = 'flex';
      const discElem = document.getElementById('cart-discount');
      if (discElem) discElem.innerText = `-₹${discountAmount.toLocaleString('en-IN')}`;
    } else {
      discountRow.style.display = 'none';
    }
  }

  const totElem = document.getElementById('cart-total');
  if (totElem) totElem.innerText = `₹${grandTotal.toLocaleString('en-IN')}`;
}

function applyCartCoupon() {
    const input = document.getElementById('cart-coupon-input');
    if (!input) return;
    const code = input.value.trim().toUpperCase();
    if (!code) return;

    // Read active coupons from Admin
    const defaultCoupons = [
      { code: 'LAUNCH20', discount: 20, active: true },
      { code: 'ODDSPOT10', discount: 10, active: true }
    ];
    const coupons = JSON.parse(localStorage.getItem('odd_admin_coupons')) || defaultCoupons;
    const found = coupons.find(c => c.code === code && c.active);

    if (found) {
      appliedCoupon = found.code;
      localStorage.setItem('odd_coupon_discount', found.discount);
      saveCart();
      const tag = document.getElementById('coupon-tag-applied');
      if (tag) tag.style.display = 'flex';
      const codeName = document.getElementById('applied-code-name');
      if (codeName) codeName.innerText = `${found.code} (${found.discount}% OFF)`;
      input.value = '';
      updateCartUI();
      showToast(`Code ${found.code} applied: ${found.discount}% discount!`);
    } else {
      showToast('Invalid or expired promo code.');
    }
  }

function removeCartCoupon() {
  appliedCoupon = null;
  saveCart();
  const tag = document.getElementById('coupon-tag-applied');
  if (tag) tag.style.display = 'none';
  updateCartUI();
  showToast('Coupon removed.');
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('open');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('open');
}

function openSearchModal() {
  openModal('search-modal');
  performSearch('');
}

function performSearch(query) {
  const container = document.getElementById('search-results');
  if (!container) return;
  const q = query.toLowerCase().trim();

  const results = Object.values(PRODUCTS).filter(p => 
    p.name.toLowerCase().includes(q) ||
    p.notes.toLowerCase().includes(q) ||
    p.occasion.toLowerCase().includes(q)
  );

  if (results.length === 0) {
    container.innerHTML = `<p style="padding: 1rem; color: var(--text-muted);">No matching fragrances found for "${query}".</p>`;
    return;
  }

  container.innerHTML = results.map(p => `
    <div style="display: flex; gap: 1rem; align-items: center; padding: 0.8rem 0; border-bottom: 1px solid var(--border-color);">
      <div style="flex:1;">
        <h4 style="font-family: var(--font-serif); font-size: 1.1rem;">${p.name}</h4>
        <p style="font-size: 0.82rem; color: var(--text-muted);">${p.notes}</p>
        <strong>₹${p.price}</strong>
      </div>
      <button class="btn btn-sm btn-dark" onclick="closeModal('search-modal'); addToCart('${p.id}');">Add to Bag</button>
    </div>
  `).join('');
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

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}


// --- Magnetic Buttons Effect ---
function initMagneticButtons() {
  const magnetics = document.querySelectorAll('.magnetic-btn, .btn-pill-orange, .btn-pill-glass, .cart-trigger-btn');
  magnetics.forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${x * 0.25}px, ${y * 0.25}px)`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translate(0px, 0px)';
    });
  });
}
document.addEventListener('DOMContentLoaded', initMagneticButtons);


// --- Floating Water Button Ripple Effect ---
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-water-float, .btn-pill-orange, .btn-primary, .footer-email-btn');
  if (!btn) return;

  const circle = document.createElement('span');
  const diameter = Math.max(btn.clientWidth, btn.clientHeight);
  const radius = diameter / 2;
  const rect = btn.getBoundingClientRect();

  circle.style.width = circle.style.height = `${diameter}px`;
  circle.style.left = `${e.clientX - rect.left - radius}px`;
  circle.style.top = `${e.clientY - rect.top - radius}px`;
  circle.classList.add('water-ripple-circle');

  const ripple = btn.getElementsByClassName('water-ripple-circle')[0];
  if (ripple) ripple.remove();

  btn.appendChild(circle);
});

// --- Quick View Luxury Modal Engine ---
let currentQvQty = 1;
let currentQvId = 'phantom';

function openQuickView(productId) {
  const prod = PRODUCTS[productId];
  if (!prod) return;

  currentQvId = productId;
  currentQvQty = 1;

  const modal = document.getElementById('quick-view-modal');
  const imgElem = document.getElementById('qv-img');
  const titleElem = document.getElementById('qv-title');
  const priceElem = document.getElementById('qv-price');
  const qtyElem = document.getElementById('qv-qty');
  const linkElem = document.getElementById('qv-link');

  if (imgElem) imgElem.src = `assets/images/${prod.packageImage || prod.bottleImage}`;
  if (titleElem) {
    titleElem.innerText = prod.name;
    if (prod.id === 'phantom') titleElem.style.fontFamily = '"Phantom Font", serif';
    else if (prod.id === 'lucid') titleElem.style.fontFamily = '"Lucid Font", serif';
    else if (prod.id === 'first-move') titleElem.style.fontFamily = '"First Move Font", serif';
  }
  if (priceElem) {
    const discount = Math.round(((prod.originalPrice - prod.price) / prod.originalPrice) * 100);
    priceElem.classList.add('product-detail-price');
    priceElem.style.fontSize = '1.4rem';
    priceElem.innerHTML = `
      <span class="price-current">&#8377; ${prod.price}</span>
      <span class="price-original" style="font-size: 0.9rem;">&#8377; ${prod.originalPrice}</span>
      <span class="price-discount-pill" style="font-size: 0.7rem;">-${discount}%</span>
    `;
  }
  if (qtyElem) qtyElem.innerText = currentQvQty;
  if (linkElem) linkElem.href = `products-odd-${productId}.html`;

  if (modal) modal.classList.add('open');
}

function closeQuickView() {
  const modal = document.getElementById('quick-view-modal');
  if (modal) modal.classList.remove('open');
}

function updateQvQty(delta) {
  currentQvQty = Math.max(1, currentQvQty + delta);
  const qtyElem = document.getElementById('qv-qty');
  if (qtyElem) qtyElem.innerText = currentQvQty;
}

function addQvToCart() {
  for (let i = 0; i < currentQvQty; i++) {
    addToCart(currentQvId);
  }
  closeQuickView();
}

function buyNowQv() {
  for (let i = 0; i < currentQvQty; i++) {
    addToCart(currentQvId);
  }
  window.location.href = 'checkout.html';
}

function handleEmailSignup(e) {
  e.preventDefault();
  const input = e.target.querySelector('input[type="email"]');
  if (input && input.value) {
    showToast(`Welcome! You're on the list with ${input.value}.`);
    input.value = '';
  }
}


// --- Scroll-Driven Reveal Observer ---
function initScrollReveals() {
  const revealElements = document.querySelectorAll('.reveal-on-scroll, .product-card, .carousel-slide, .story-landing-grid, .comparison-table, .shop-hero, .page-hero, .footer-col, .footer-top-signup, .checkout-page-grid');
  if (!('IntersectionObserver' in window)) {
    revealElements.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      }
    });
  }, {
    rootMargin: '0px 0px -40px 0px',
    threshold: 0.1
  });

  revealElements.forEach(el => {
    el.classList.add('reveal-on-scroll');
    observer.observe(el);
  });
}

// --- Global Search Modal Logic ---
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
    p.name.toLowerCase().includes(q) ||
    p.notes.toLowerCase().includes(q) ||
    p.tagline.toLowerCase().includes(q)
  );

  if (matches.length === 0) {
    resultsContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; padding: 1rem 0;">No matching fragrances found.</p>';
    return;
  }

  resultsContainer.innerHTML = matches.map(p => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--border-color); gap: 1rem;">
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <img src="assets/images/${p.bottleImage}" alt="${p.name}" style="height: 48px; width: auto; object-fit: contain;">
        <div>
          <h4 style="font-family: var(--font-serif); font-size: 1.15rem; margin: 0; color: var(--text-main);">${p.name}</h4>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">${p.notes}</p>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <span style="font-weight: 700; font-size: 0.95rem;">₹ ${p.price}</span>
        <button class="btn btn-sm btn-dark btn-water-float" onclick="closeSearchModal(); addToCart('${p.id}');">Add to Bag</button>
      </div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  initScrollReveals();
});



// --- Dynamic Pricing Sync ---
document.addEventListener('DOMContentLoaded', () => {
  try {
    const inv = JSON.parse(localStorage.getItem('odd_admin_inventory'));
    if (inv) {
      if (inv['ODD-PH-001']) PRODUCTS['phantom'].price = inv['ODD-PH-001'].price;
      if (inv['ODD-LC-003']) PRODUCTS['lucid'].price = inv['ODD-LC-003'].price;
      if (inv['ODD-FM-002']) PRODUCTS['first-move'].price = inv['ODD-FM-002'].price;
    }
  } catch (e) {}

  document.querySelectorAll('.product-detail-price[data-product]').forEach(el => {
    const pId = el.getAttribute('data-product');
    const prod = PRODUCTS[pId];
    if (prod) {
      const discount = Math.round(((prod.originalPrice - prod.price) / prod.originalPrice) * 100);
      el.innerHTML = `
        <span class="price-current">&#8377; ${prod.price}</span>
        <span class="price-original" style="font-size: 0.9rem;">&#8377; ${prod.originalPrice}</span>
        <span class="price-discount-pill" style="font-size: 0.7rem;">-${discount}%</span>
      `;
    }
  });
});


// --- Dynamic Stock UI Sync Across All Pages ---
function syncStockStatusUI() {
  let inv = null;
  try {
    inv = JSON.parse(localStorage.getItem('odd_admin_inventory'));
  } catch(e) {}
  if (!inv) return;

  const skuMap = {
    'phantom': 'ODD-PH-001',
    'lucid': 'ODD-LC-003',
    'first-move': 'ODD-FM-002'
  };

  Object.keys(skuMap).forEach(pId => {
    const sku = skuMap[pId];
    const item = inv[sku];
    if (!item) return;

    const isOutOfStock = item.stock <= 0;

    // 1. Current Product Detail Page
    if (window.location.pathname.toLowerCase().includes(pId)) {
      const addBtn = document.querySelector('.product-add-btn');
      const priceContainer = document.querySelector('.product-detail-price');
      if (isOutOfStock) {
        if (addBtn) {
          addBtn.innerText = 'OUT OF STOCK';
          addBtn.disabled = true;
          addBtn.style.opacity = '0.5';
          addBtn.style.cursor = 'not-allowed';
          addBtn.style.background = '#222';
        }
        if (priceContainer && !document.getElementById('product-oos-pill')) {
          const oosPill = document.createElement('span');
          oosPill.id = 'product-oos-pill';
          oosPill.style.cssText = 'background:#EF4444; color:#FFF; font-size:0.75rem; font-family:var(--font-mono); font-weight:700; padding:0.3rem 0.75rem; border-radius:20px; text-transform:uppercase; margin-left:0.5rem;';
          oosPill.innerText = 'OUT OF STOCK';
          priceContainer.appendChild(oosPill);
        }
      }
    }

    // 2. Shop Page Cards
    const shopCard = document.querySelector(`.product-card[data-product="${pId}"]`);
    if (shopCard && isOutOfStock) {
      const buyBtn = shopCard.querySelector('.btn-primary');
      if (buyBtn) {
        buyBtn.innerText = 'Out of Stock';
        buyBtn.disabled = true;
        buyBtn.style.opacity = '0.5';
        buyBtn.style.cursor = 'not-allowed';
        buyBtn.style.background = '#333';
      }
      if (!shopCard.querySelector('.shop-oos-pill')) {
        const badge = document.createElement('div');
        badge.className = 'shop-oos-pill';
        badge.style.cssText = 'position:absolute; top:12px; left:12px; background:#EF4444; color:#fff; font-size:0.65rem; font-family:var(--font-mono); font-weight:700; padding:0.25rem 0.6rem; border-radius:4px; z-index:10;';
        badge.innerText = 'OUT OF STOCK';
        shopCard.appendChild(badge);
      }
    }

    // 3. Compare Cards on index.html
    const compareCard = document.querySelector(`.compare-card[data-product="${pId}"]`) || 
      (pId === 'first-move' ? document.querySelectorAll('.compare-card')[2] : (pId === 'lucid' ? document.querySelectorAll('.compare-card')[1] : document.querySelectorAll('.compare-card')[0]));
    if (compareCard && isOutOfStock) {
      const cmpBtn = compareCard.querySelector('.compare-buy-btn');
      if (cmpBtn) {
        cmpBtn.innerText = 'Out of Stock';
        cmpBtn.style.opacity = '0.5';
        cmpBtn.style.pointerEvents = 'none';
        cmpBtn.style.background = 'rgba(255,255,255,0.05)';
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
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
