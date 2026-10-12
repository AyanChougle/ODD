
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

function readStorageJSON(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return value == null ? fallback : value; }
  catch { return fallback; }
}
let cartState = readStorageJSON('odd_cart', []).filter(item => item && PRODUCTS[item.id] && Number.isInteger(Number(item.qty)) && Number(item.qty) > 0).map(item => ({ id: item.id, qty: Number(item.qty) }));
let appliedCoupon = localStorage.getItem('odd_coupon') || null;
let STORE_INVENTORY = {
  phantom: { sku: 'ODD-PH-001', stock: 330, price: 899 },
  lucid: { sku: 'ODD-LC-003', stock: 326, price: 899 },
  'first-move': { sku: 'ODD-FM-002', stock: 0, price: 899 }
};
let ACTIVE_COUPONS = [{ code: 'LAUNCH20', discount: 20 }, { code: 'ODDSPOT10', discount: 10 }];
let STORE_STATE_FROM_SERVER = false;

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
    const willOpen = !drawer.classList.contains('open');
    backdrop.classList.toggle('open', willOpen);
    drawer.classList.toggle('open', willOpen);
    document.body.classList.toggle('drawer-open', willOpen);
    if (willOpen) updateCartUI();
  }
}

function getProductAvailability(productId) {
  const state = STORE_INVENTORY[productId];
  if (!state) return { stock: 0, price: PRODUCTS[productId]?.price || 0 };
  return { stock: Math.max(0, Number(state.stock) || 0), price: Math.max(0, Number(state.price) || 0) };
}

function addToCart(productId) {
    const prod = PRODUCTS[productId];
    if (!prod) return;
    const availability = getProductAvailability(productId);
    const stock = availability.stock;
    const existing = cartState.find(item => item.id === productId);
    if (stock <= 0) {
      showToast(`${prod.name} is currently out of stock. It cannot be added to your bag.`);
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
    showToast(`Added ${prod.name} to your bag.`);
    
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
  showToast('Item removed from bag.');
}

function saveCart() {
  localStorage.setItem('odd_cart', JSON.stringify(cartState));
  if (appliedCoupon) localStorage.setItem('odd_coupon', appliedCoupon);
  else localStorage.removeItem('odd_coupon');
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
    if (!emptyState) { emptyState = document.createElement('div'); emptyState.className = 'cart-empty-state'; emptyState.innerHTML = '<span class="cart-empty-mark">ODD.</span><p>Your bag is taking a breather.</p><span>Add a fragrance and it will show up here.</span><a href="shop.html">Explore the three fragrances</a>'; cartItemsList.appendChild(emptyState); }
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
          <img src="assets/images/${prod.bottleImage || 'Final-Logo-768x768.png'}" alt="${prod.name} perfume bottle">
        </div>
        <div class="cart-item-details">
          <h4>${prod.name}</h4>
          <div class="cart-item-price">₹${price.toLocaleString('en-IN')} <span style="font-size:0.75rem; text-decoration:line-through; color:var(--text-muted);">₹${prod.originalPrice.toLocaleString('en-IN')}</span></div>
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

  let discountAmount = 0;
  const appliedCouponRecord = appliedCoupon ? ACTIVE_COUPONS.find(coupon => coupon.code === appliedCoupon && coupon.active !== false) : null;
  const appliedTag = document.getElementById('coupon-tag-applied');
  const appliedName = document.getElementById('applied-code-name');
  if (appliedCouponRecord) {
    discountAmount = Math.round(subtotal * (Number(appliedCouponRecord.discount) / 100));
    if (appliedTag) appliedTag.style.display = 'flex';
    if (appliedName) appliedName.textContent = `${appliedCouponRecord.code} (${appliedCouponRecord.discount}% OFF)`;
  } else if (appliedCoupon) {
    appliedCoupon = null; localStorage.removeItem('odd_coupon'); localStorage.removeItem('odd_coupon_discount');
    if (appliedTag) appliedTag.style.display = 'none';
  }

  const grandTotal = subtotal - discountAmount;

  const subElem = document.getElementById('cart-subtotal');
  if (subElem) subElem.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
  
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
  if (totElem) totElem.textContent = `₹${grandTotal.toLocaleString('en-IN')}`;
}


function renderCartPage() {
  const container = document.getElementById('cart-page-items');
  if (!container) return;
  const subtotalEl = document.getElementById('cart-page-subtotal');
  const discountRow = document.getElementById('cart-page-discount-row');
  const discountEl = document.getElementById('cart-page-discount');
  const totalEl = document.getElementById('cart-page-total');
  const checkoutLink = document.getElementById('cart-page-checkout');
  const items = Array.isArray(cartState) ? cartState.filter(item => PRODUCTS[item.id] && Number(item.qty) > 0) : [];
  if (!items.length) {
    container.innerHTML = '<div class="cart-page-empty"><span class="cart-empty-mark">ODD.</span><h2>Your bag is taking a breather.</h2><p>Add a fragrance and it will appear here.</p><a class="btn btn-primary" href="shop.html">Explore the three fragrances</a></div>';
    if (subtotalEl) subtotalEl.textContent = '₹0';
    if (discountRow) discountRow.hidden = true;
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
        <div class="cart-page-product-image"><img src="assets/images/${product.bottleImage}" alt="ODD ${product.name}" loading="lazy"></div>
        <div class="cart-page-product-copy"><a href="${item.id === 'first-move' ? 'products-odd-first-move.html' : `products-odd-${item.id}.html`}">${product.name}</a><span>100 ml · ${price.toLocaleString('en-IN')} each</span>
          <div class="cart-page-qty"><button type="button" data-cart-page-qty="-1" data-product-id="${item.id}" aria-label="Remove one ${product.name}">−</button><span>Qty ${qty}</span><button type="button" data-cart-page-qty="1" data-product-id="${item.id}" aria-label="Add one ${product.name}" ${out || qty >= stock ? 'disabled' : ''}>+</button><button type="button" class="cart-page-remove" data-cart-page-remove="${item.id}">Remove</button></div>
          ${out ? `<small class="cart-page-stock-warning">${stock <= 0 ? 'Currently out of stock. Remove this item to continue.' : `Only ${stock} available. Reduce the quantity to continue.`}</small>` : ''}</div>
        <strong class="cart-page-line-total">₹${lineTotal.toLocaleString('en-IN')}</strong>
      </article>`;
    }).join('');
    const coupon = appliedCoupon ? ACTIVE_COUPONS.find(item => item.code === appliedCoupon && item.active !== false) : null;
    const discount = coupon ? Math.round(subtotal * Number(coupon.discount) / 100) : 0;
    if (subtotalEl) subtotalEl.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
    if (discountRow) discountRow.hidden = discount <= 0;
    if (discountEl) discountEl.textContent = `−₹${discount.toLocaleString('en-IN')}`;
    if (totalEl) totalEl.textContent = `₹${Math.max(0, subtotal - discount).toLocaleString('en-IN')}`;
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

function applyCartCoupon() {
    const input = document.getElementById('cart-coupon-input') || document.getElementById('coupon-input-drawer');
    if (!input) return;
    const code = input.value.trim().toUpperCase();
    if (!code) return;

    // Read active coupons from Admin
    const coupons = ACTIVE_COUPONS;
    const found = coupons.find(c => c.code === code && c.active !== false);

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

function applyCoupon() { applyCartCoupon(); }
function applyCouponFromBanner() {
  const code = (document.getElementById('banner-code')?.textContent || 'LAUNCH20').trim().toUpperCase();
  const coupons = ACTIVE_COUPONS;
  const found = coupons.find(item => item.code === code && item.active !== false);
  if (!found) { showToast('This offer is no longer active.'); return; }
  appliedCoupon = found.code; localStorage.setItem('odd_coupon_discount', String(found.discount)); saveCart(); updateCartUI();
  showToast(`${found.code} is ready. Add a fragrance to apply it at checkout.`);
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
    return `<article class="search-result-row"><a class="search-result-visual" href="${detailLink}"><img src="assets/images/${product.bottleImage}" alt="ODD ${product.name}"></a><div class="search-result-copy"><a href="${detailLink}" class="search-result-name">${product.name}</a><p>${product.notes}</p><span class="search-stock ${stock > 0 ? 'in-stock' : 'out-stock'}"><i></i>${stock > 0 ? 'In stock' : 'Currently unavailable'}</span></div><div class="search-result-action"><strong>₹${product.price.toLocaleString('en-IN')}</strong><button type="button" class="search-add-btn" data-search-add="${product.id}" ${stock <= 0 ? 'disabled' : ''}>${stock > 0 ? 'Add to bag' : 'Out of stock'}</button></div></article>`;
  }).join('');
  resultsContainer.querySelectorAll('[data-search-add]').forEach(button => button.addEventListener('click', () => { closeSearchModal(); addToCart(button.dataset.searchAdd); }));
}
function handleEmailSignup(event) {
  event?.preventDefault();
  const form = event?.currentTarget;
  const email = form?.querySelector('input[type="email"]');
  if (!email || !email.checkValidity()) { email?.reportValidity(); return; }
  showToast('Email signup is not connected to a mailing-list service yet. No email was submitted.');
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
    const addButtons = [...document.querySelectorAll('[onclick]')].filter(button => (button.getAttribute('onclick') || '').includes(`addToCart('${productId}')`));
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
      if (button) { button.disabled = out; button.textContent = out ? 'Out of stock' : `Add to Bag — ₹${product.price.toLocaleString('en-IN')}`; }
      const priceBlock = document.querySelector('.product-detail-price');
      let status = document.getElementById('product-stock-status');
      if (!status && priceBlock) { status = document.createElement('span'); status.id = 'product-stock-status'; status.className = 'product-stock-status'; priceBlock.insertAdjacentElement('afterend', status); }
      if (status) { status.textContent = out ? 'Currently out of stock' : `${stock} available · Ready to ship`; status.classList.toggle('out-stock', out); }
    }
    document.querySelectorAll(`.product-card[data-product="${productId}"]`).forEach(card => {
      const button = card.querySelector('[onclick*="addToCart"]');
      if (button) { button.disabled = out; button.textContent = out ? 'Out of stock' : (button.dataset.originalText || 'Add to bag'); }
      let badge = card.querySelector('.stock-state-badge');
      if (out && !badge) { badge = document.createElement('span'); badge.className = 'stock-state-badge'; badge.textContent = 'Out of stock'; card.querySelector('.product-door-container')?.appendChild(badge); }
      if (!out) badge?.remove();
    });
    document.querySelectorAll(`.carousel-slide [onclick*="addToCart('${productId}')"]`).forEach(button => {
      button.disabled = out; button.textContent = out ? 'Out of stock' : (button.dataset.originalText || 'Add to bag');
      const slide = button.closest('.carousel-slide'); let badge = slide?.querySelector('.carousel-stock-badge');
      if (slide && out && !badge) { badge = document.createElement('span'); badge.className = 'carousel-stock-badge'; badge.textContent = 'Currently unavailable'; slide.querySelector('.slide-image-box')?.appendChild(badge); }
      if (!out) badge?.remove();
    });
    if (typeof currentQvId !== 'undefined' && currentQvId === productId) {
      const add = document.querySelector('.qv-add-btn'); if (add) { add.disabled = out; add.textContent = out ? 'Out of stock' : 'Add to cart'; }
      const buy = document.querySelector('.qv-buy-btn'); if (buy) { buy.disabled = out; buy.textContent = out ? 'Out of stock' : 'Buy now'; }
      const stockBadge = document.querySelector('.qv-stock-badge'); if (stockBadge) stockBadge.textContent = out ? 'Currently out of stock' : `${stock} in stock, ready to ship`;
    }
  });
}

async function refreshStoreState() {
  try {
    // Static host mode: load state from localStorage (set by admin dashboard)
    const localInv = JSON.parse(localStorage.getItem('odd_admin_inventory'));
    if (localInv) {
      Object.entries(localInv).forEach(([productId, item]) => {
        if (STORE_INVENTORY[productId]) {
          STORE_INVENTORY[productId].stock = Number(item.stock);
          STORE_INVENTORY[productId].price = Number(item.price);
          if (PRODUCTS[productId]) PRODUCTS[productId].price = Number(item.price);
        }
      });
    }
    const localCoupons = JSON.parse(localStorage.getItem('odd_admin_coupons'));
    if (localCoupons) {
      ACTIVE_COUPONS = localCoupons.filter(c => c.active !== false);
    }
    
    // Update UI elements
    document.querySelectorAll('.product-detail-price[data-product]').forEach(element => {
      const product = PRODUCTS[element.dataset.product]; if (!product) return;
      const original = product.originalPrice; const discount = Math.max(0, Math.round((original - product.price) / original * 100));
      element.innerHTML = `<span class="price-current">₹ ${product.price.toLocaleString('en-IN')}</span><span class="price-original">₹ ${original.toLocaleString('en-IN')}</span><span class="price-discount-pill">-${discount}%</span>`;
    });
    updateCartUI(); syncStockStatusUI();
  } catch (e) {
    syncStockStatusUI();
  }
}

document.addEventListener('DOMContentLoaded', () => { syncStockStatusUI(); refreshStoreState(); });


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
    bottleImage: targetId === 'lucid' ? 'Lucid single bottle.png' : targetId === 'first-move' ? 'First Move single bottle.png' : 'Phantom Single bottle.png'
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
  if (price) price.innerHTML = '&#8377;' + prod.price;

  const img = modal.querySelector('.quick-view-bottle-img');
  if (img) img.src = 'assets/images/' + prod.bottleImage;

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
      btn.innerHTML = '⚡ Go to Admin Portal';
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
      btn.innerHTML = 'Admin Portal';
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
      btn.innerHTML = '⚡ Admin Portal';
      
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
});


/* ==========================================================================
   SCENT QUIZ ENGINE (find-your-scent.html)
   ========================================================================== */

let quizAnswers = {};
let matchedPerfumeId = 'phantom';

function answerQuiz(step, perfumeId) {
  quizAnswers[step] = perfumeId;
  const counts = { 'phantom': 0, 'lucid': 0, 'first-move': 0 };
  Object.values(quizAnswers).forEach(p => { if (counts[p] !== undefined) counts[p]++; });
  
  let best = 'phantom';
  let max = -1;
  Object.keys(counts).forEach(k => { if (counts[k] > max) { max = counts[k]; best = k; } });
  matchedPerfumeId = best;

  const currentStep = document.getElementById('quiz-step-' + step);
  const nextStep = document.getElementById('quiz-step-' + (step + 1));
  
  if (currentStep) currentStep.style.display = 'none';

  if (nextStep) {
    nextStep.style.display = 'block';
  } else {
    const resultCard = document.getElementById('quiz-result-card');
    if (resultCard) {
      resultCard.style.display = 'block';
      const prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[matchedPerfumeId]) ? PRODUCTS[matchedPerfumeId] : null;
      if (prod) {
        const title = resultCard.querySelector('.quiz-result-title');
        if (title) title.innerText = prod.fullName || prod.name;
        const desc = resultCard.querySelector('.quiz-result-desc');
        if (desc) desc.innerText = prod.tagline || '';
        const img = resultCard.querySelector('.quiz-result-img');
        if (img) img.src = 'assets/images/' + prod.bottleImage;
      }
    }
  }
}

function addQuizMatchToCart() {
  if (typeof addToCart === 'function') addToCart(matchedPerfumeId);
  if (typeof toggleCartDrawer === 'function') toggleCartDrawer();
}

function resetQuiz() {
  quizAnswers = {};
  matchedPerfumeId = 'phantom';
  for (let i = 1; i <= 5; i++) {
    const s = document.getElementById('quiz-step-' + i);
    if (s) s.style.display = (i === 1) ? 'block' : 'none';
  }
  const resultCard = document.getElementById('quiz-result-card');
  if (resultCard) resultCard.style.display = 'none';
}
