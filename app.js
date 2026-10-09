/* ==========================================================================
   ODD Perfume — Official JavaScript Engine
   Reference: testing.oddperfume.com
   Color Palette: odd_perfume_color_codes.pdf
   - Phantom: #E6C27A
   - First Move: #532E38
   - Lucid: #1C4D3A
   ========================================================================== */

// --- 1. Product Database ---
const PRODUCTS = {
  'phantom': {
    id: 'phantom',
    name: 'Phantom',
    fullName: 'ODD Phantom',
    tagline: 'Unseen. Unforgotten. Dominant.',
    price: 899,
    originalPrice: 1199,
    discountPct: 25,
    notes: 'Oud · Amber · Smoky Woods',
    notesList: ['Cambodian Oud', 'Golden Amber', 'Smoky Birch Woods', 'Guaiacwood'],
    intensity: '5/5',
    warmth: '4/5',
    freshness: '1/5',
    sweetness: '2/5',
    occasion: 'Late nights, formal dinners, winter evenings, lounge parties',
    wearTime: '8—10 Hours',
    description: 'A dark, rich blend designed for nightouts, late dinners, and making an unshakeable impression. Eau De Parfum strength formulated in Mumbai.',
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
    discountPct: 25,
    notes: 'Citrus · Black Tea · Clean Woods',
    notesList: ['Calabrian Bergamot', 'Darjeeling Black Tea', 'White Cedar', 'Vetiver'],
    intensity: '2/5',
    warmth: '1/5',
    freshness: '5/5',
    sweetness: '1/5',
    occasion: 'Daily office, workout, warm summer afternoons, client meetings',
    wearTime: '8—10 Hours',
    description: 'Crisp, energizing citrus smoothed with black tea leaves. Ideal for morning hustles, office wear, and high humidity.',
    themeColor: '#1C4D3A',
    bgColor: '#0F2E23',
    textColor: '#FFFFFF'
  },
  'first-move': {
    id: 'first-move',
    name: 'First Move',
    fullName: 'ODD First Move',
    tagline: 'Start First. Stay Ahead.',
    price: 899,
    originalPrice: 1199,
    discountPct: 25,
    notes: 'Pineapple · Woods · Smoky Musk',
    notesList: ['Juicy Pineapple', 'Smoky Cedar', 'Warm Amber', 'Oakmoss Musk'],
    intensity: '4/5',
    warmth: '4/5',
    freshness: '2/5',
    sweetness: '3/5',
    occasion: 'Date nights, casual outings, cocktail lounges, weekend hangouts',
    wearTime: '8—10 Hours',
    description: 'Juicy pineapple cut with smoky wood layers. Designed for social dates, evenings out, and compliment hunting.',
    themeColor: '#532E38',
    bgColor: '#2A171D',
    textColor: '#FFFFFF'
  }
};

// --- 2. Global State ---
let cartState = [];
let appliedCoupon = null;
let currentQuizStep = 1;
let quizScores = { 'phantom': 0, 'lucid': 0, 'first-move': 0 };

// Mini-game state
let oddDotIndex = Math.floor(Math.random() * 40);
let gameStartTime = null;
let gameTimerInterval = null;
let gameActive = false;

// --- 3. Initializer ---
document.addEventListener('DOMContentLoaded', () => {
  initCountdownTimer();
  renderMiniGame();
  resetTimeToNow();
});

// --- 4. Launch Banner Countdown ---
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
}

function copyCouponCode(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast(`Copied promo code "${code}" to clipboard.`);
  }).catch(() => {
    showToast(`Promo code is ${code}`);
  });
}

// --- 5. Navigation ---
function toggleMobileNav() {
  const drawer = document.getElementById('mobile-nav');
  drawer.classList.toggle('open');
}

// --- 6. Cart Drawer & Calculations ---
function toggleCartDrawer() {
  const backdrop = document.getElementById('cart-backdrop');
  const drawer = document.getElementById('cart-drawer');
  backdrop.classList.toggle('open');
  drawer.classList.toggle('open');
}

function addToCart(productId) {
  const prod = PRODUCTS[productId];
  if (!prod) return;

  const existing = cartState.find(item => item.id === productId);
  if (existing) {
    existing.qty += 1;
  } else {
    cartState.push({ id: productId, qty: 1 });
  }

  updateCartUI();
  showToast(`Added ${prod.name} to your bag.`);
  
  const drawer = document.getElementById('cart-drawer');
  if (!drawer.classList.contains('open')) {
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
  updateCartUI();
}

function removeFromCart(productId) {
  cartState = cartState.filter(i => i.id !== productId);
  updateCartUI();
  showToast('Item removed from bag.');
}

function updateCartUI() {
  const countBadge = document.getElementById('cart-count');
  const drawerCount = document.getElementById('cart-drawer-count');
  const cartItemsList = document.getElementById('cart-items');
  const cartEmpty = document.getElementById('cart-empty');
  const cartFooter = document.getElementById('cart-footer');
  
  const totalItems = cartState.reduce((sum, i) => sum + i.qty, 0);
  countBadge.innerText = totalItems;
  drawerCount.innerText = totalItems;

  if (cartState.length === 0) {
    cartEmpty.style.display = 'block';
    cartFooter.style.display = 'none';
    const renderedItems = cartItemsList.querySelectorAll('.cart-item-single');
    renderedItems.forEach(el => el.remove());
    return;
  }

  cartEmpty.style.display = 'none';
  cartFooter.style.display = 'block';

  let subtotal = 0;
  let itemsHtml = '';

  cartState.forEach(item => {
    const prod = PRODUCTS[item.id];
    const itemTotal = prod.price * item.qty;
    subtotal += itemTotal;

    itemsHtml += `
      <div class="cart-item-single">
        <div class="cart-item-img">
          <span style="font-weight: 700; font-family: var(--font-serif); font-size: 0.85rem;">ODD</span>
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
  if (appliedCoupon === 'LAUNCH20') {
    discountAmount = Math.round(subtotal * 0.20);
  } else if (appliedCoupon === 'ODDSPOT10') {
    discountAmount = Math.round(subtotal * 0.10);
  }

  const grandTotal = subtotal - discountAmount;

  document.getElementById('cart-subtotal').innerText = `₹${subtotal.toLocaleString('en-IN')}`;
  
  const discountRow = document.getElementById('cart-discount-row');
  if (discountAmount > 0) {
    discountRow.style.display = 'flex';
    document.getElementById('cart-discount').innerText = `-₹${discountAmount.toLocaleString('en-IN')}`;
  } else {
    discountRow.style.display = 'none';
  }

  document.getElementById('cart-total').innerText = `₹${grandTotal.toLocaleString('en-IN')}`;
}

function applyCartCoupon() {
  const input = document.getElementById('cart-coupon-input');
  const code = input.value.trim().toUpperCase();

  if (code === 'LAUNCH20' || code === 'ODDSPOT10') {
    appliedCoupon = code;
    document.getElementById('coupon-tag-applied').style.display = 'flex';
    document.getElementById('applied-code-name').innerText = code;
    input.value = '';
    updateCartUI();
    showToast(`Code ${code} applied successfully.`);
  } else {
    showToast('Invalid promo code. Try LAUNCH20');
  }
}

function removeCartCoupon() {
  appliedCoupon = null;
  document.getElementById('coupon-tag-applied').style.display = 'none';
  updateCartUI();
  showToast('Coupon removed.');
}

// --- 7. "When to Wear What" Time Recommendation ---
function updateTimeRecommendation(minutesVal) {
  const totalMins = parseInt(minutesVal, 10);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const timeStr = `${String(displayHours).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${period}`;
  
  document.getElementById('time-readout').innerText = timeStr;

  const readoutPhase = document.getElementById('time-phase');
  const recTitle = document.getElementById('rec-title');
  const recReason = document.getElementById('rec-reason');
  const recNotes = document.getElementById('rec-notes');
  const recBtn = document.getElementById('rec-add-btn');
  const recIcon = document.getElementById('rec-icon');

  let recProdId = 'phantom';

  if (hours >= 6 && hours < 14) {
    recProdId = 'lucid';
    readoutPhase.innerText = 'MORNING / DAYTIME OFFICE';
    recReason.innerText = `At ${timeStr}, boost clarity and sharp presence with Calabrian bergamot, Darjeeling black tea, and clean cedarwood.`;
  } else if (hours >= 14 && hours < 19) {
    recProdId = 'first-move';
    readoutPhase.innerText = 'GOLDEN HOUR & EVENING DATES';
    recReason.innerText = `At ${timeStr}, transition smoothly into evening plans with juicy pineapple, warm amber, and smoky musk.`;
  } else {
    recProdId = 'phantom';
    readoutPhase.innerText = 'STILL UP? SAME HERE.';
    recReason.innerText = `At ${timeStr}, make an unshakeable impression with deep Cambodian oud, golden amber, and smoky woods.`;
  }

  const prod = PRODUCTS[recProdId];
  recTitle.innerText = prod.name;
  recNotes.innerText = `Notes: ${prod.notes}`;
  recBtn.innerText = `Add ${prod.name} To Bag — ₹${prod.price}`;
  recBtn.setAttribute('onclick', `addToCart('${recProdId}')`);

  recIcon.innerHTML = `
    <svg class="bottle-svg" viewBox="0 0 100 180" style="width: 100%; height: 100%;">
      <rect x="35" y="10" width="30" height="20" rx="2" fill="${prod.bgColor}" stroke="${prod.themeColor}" stroke-width="2"/>
      <rect x="20" y="45" width="60" height="125" rx="6" fill="${prod.bgColor}" stroke="${prod.themeColor}" stroke-width="2"/>
      <rect x="28" y="75" width="44" height="55" rx="2" fill="${prod.themeColor}"/>
      <text x="50" y="98" font-family="'DM Serif Display', serif" font-size="12" fill="${prod.textColor}" text-anchor="middle">ODD</text>
      <text x="50" y="114" font-family="'IBM Plex Mono', monospace" font-size="7" font-weight="700" fill="${prod.textColor}" text-anchor="middle">${prod.name.toUpperCase()}</text>
    </svg>
  `;
}

function resetTimeToNow() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const slider = document.getElementById('time-slider');
  if (slider) {
    slider.value = mins;
    updateTimeRecommendation(mins);
  }
}

// --- 8. Scent Quiz Engine ---
function answerQuiz(step, optionType) {
  quizScores[optionType] += 1;

  if (step < 5) {
    currentQuizStep = step + 1;
    document.getElementById('quiz-progress-bar').style.width = `${currentQuizStep * 20}%`;
    document.querySelectorAll('.quiz-step').forEach(el => el.classList.remove('active'));
    document.querySelector(`.quiz-step[data-step="${currentQuizStep}"]`).classList.add('active');
  } else {
    showQuizResult();
  }
}

function showQuizResult() {
  document.querySelectorAll('.quiz-step').forEach(el => el.classList.remove('active'));
  document.getElementById('quiz-progress-bar').style.width = '100%';

  let winner = 'first-move';
  let maxScore = -1;

  for (const [key, val] of Object.entries(quizScores)) {
    if (val > maxScore) {
      maxScore = val;
      winner = key;
    }
  }

  const prod = PRODUCTS[winner];
  document.getElementById('quiz-res-title').innerText = prod.name;
  document.getElementById('quiz-res-desc').innerText = `Based on your profile, your signature match is ${prod.name} (${prod.notes}). Formulated for long wear and maximum projection.`;
  
  const addBtn = document.getElementById('quiz-add-btn');
  addBtn.innerText = `Add ${prod.name} To Bag — ₹${prod.price}`;
  addBtn.setAttribute('onclick', `addToCart('${winner}')`);

  document.getElementById('quiz-result').style.display = 'block';
}

function resetQuiz() {
  quizScores = { 'phantom': 0, 'lucid': 0, 'first-move': 0 };
  currentQuizStep = 1;
  document.getElementById('quiz-progress-bar').style.width = '20%';
  document.getElementById('quiz-result').style.display = 'none';
  document.querySelectorAll('.quiz-step').forEach(el => el.classList.remove('active'));
  document.querySelector('.quiz-step[data-step="1"]').classList.add('active');
}

// --- 9. Mini Game Engine ---
function renderMiniGame() {
  const container = document.getElementById('dots-container');
  if (!container) return;

  container.innerHTML = '';
  oddDotIndex = Math.floor(Math.random() * 40);

  for (let i = 0; i < 40; i++) {
    const dot = document.createElement('button');
    dot.className = 'dot-btn';
    dot.setAttribute('aria-label', `Dot ${i + 1}`);

    if (i === oddDotIndex) {
      dot.classList.add('odd-target');
      dot.onclick = handleOddDotClick;
    } else {
      dot.onclick = () => showToast('Normal dot. Keep looking for the odd one.');
    }

    container.appendChild(dot);
  }
}

function handleOddDotClick() {
  if (!gameActive) {
    gameActive = true;
  }
  
  clearInterval(gameTimerInterval);
  document.getElementById('game-win').style.display = 'block';
  document.getElementById('game-score').innerText = '1 / 1';
  showToast('You found the ODD dot! Code ODDSPOT10 unlocked.');
}

function hintOddDot() {
  const dots = document.querySelectorAll('.dot-btn');
  if (dots[oddDotIndex]) {
    dots[oddDotIndex].classList.add('hint-highlight');
    setTimeout(() => {
      dots[oddDotIndex].classList.remove('hint-highlight');
    }, 2500);
  }
}

function resetGame() {
  gameActive = false;
  gameStartTime = Date.now();
  document.getElementById('game-win').style.display = 'none';
  document.getElementById('game-score').innerText = '0';
  document.getElementById('game-time').innerText = '00s';
  
  clearInterval(gameTimerInterval);
  gameTimerInterval = setInterval(() => {
    if (gameStartTime) {
      const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
      document.getElementById('game-time').innerText = `${String(elapsed).padStart(2, '0')}s`;
    }
  }, 1000);

  renderMiniGame();
}

// --- 10. Modals ---
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('open');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('open');
}

function openProductModal(productId) {
  const prod = PRODUCTS[productId];
  if (!prod) return;

  const title = document.getElementById('pmodal-title');
  const body = document.getElementById('pmodal-body');

  title.innerText = prod.name;
  body.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 2rem; align-items: center;">
      <div style="background: var(--bg-subtle); padding: 2.5rem 2rem; border-radius: var(--radius-sm); text-align: center;">
        <svg class="bottle-svg" viewBox="0 0 100 180" style="width: 130px;">
          <rect x="35" y="10" width="30" height="20" rx="2" fill="${prod.bgColor}" stroke="${prod.themeColor}" stroke-width="2"/>
          <rect x="20" y="45" width="60" height="125" rx="6" fill="${prod.bgColor}" stroke="${prod.themeColor}" stroke-width="2"/>
          <rect x="28" y="75" width="44" height="55" rx="2" fill="${prod.themeColor}"/>
          <text x="50" y="98" font-family="'DM Serif Display', serif" font-size="12" fill="${prod.textColor}" text-anchor="middle">ODD</text>
        </svg>
      </div>
      <div>
        <span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">${prod.tagline}</span>
        <h2 style="font-family: var(--font-serif); font-size: 2rem; margin: 0.2rem 0 0.5rem;">${prod.name}</h2>
        <div style="font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem;">
          ₹${prod.price} <span style="font-size:0.9rem; text-decoration:line-through; color:var(--text-muted);">₹${prod.originalPrice}</span>
        </div>
        <p style="color: var(--text-muted); font-size: 0.92rem; margin-bottom: 1.2rem;">${prod.description}</p>
        
        <div style="margin-bottom: 1.5rem;">
          <strong>Notes breakdown:</strong>
          <ul style="margin-top: 0.4rem; padding-left: 1.2rem; color: var(--text-muted); font-size:0.9rem;">
            ${prod.notesList.map(n => `<li>${n}</li>`).join('')}
          </ul>
        </div>

        <button class="btn btn-primary full-width" onclick="closeModal('product-detail-modal'); addToCart('${prod.id}');">
          Add To Bag — ₹${prod.price}
        </button>
      </div>
    </div>
  `;

  openModal('product-detail-modal');
}

function openPolicyModal(type) {
  const title = document.getElementById('policy-modal-title');
  const body = document.getElementById('policy-modal-body');

  if (type === 'shipping') {
    title.innerText = 'Shipping & Delivery Policy';
    body.innerHTML = `
      <p>We provide <strong>FREE Shipping anywhere in India</strong> on all orders.</p>
      <p style="margin-top:0.6rem;">Orders are dispatched within 24 hours from our facility in Mumbai. Typical delivery timelines:</p>
      <ul style="margin: 0.6rem 0 0.6rem 1.2rem;">
        <li>Mumbai & Mumbai: 1—2 Business Days</li>
        <li>Metro Cities (Delhi, Bangalore, Hyderabad, etc.): 2—4 Business Days</li>
        <li>Rest of India: 4—6 Business Days</li>
      </ul>
      <p>Express Cash on Delivery (COD) is supported for all pincodes.</p>
    `;
  } else if (type === 'refund') {
    title.innerText = 'Returns & Refunds Policy';
    body.innerHTML = `
      <p>If your package arrives damaged or leaking, we offer a <strong>100% replacement or full refund</strong> within 7 days of delivery.</p>
      <p style="margin-top:0.6rem;">Simply email us at <a href="mailto:hello@oddperfume.com" style="color:var(--text-main); text-decoration:underline;">hello@oddperfume.com</a> with your Order ID and photo proof.</p>
    `;
  } else if (type === 'privacy') {
    title.innerText = 'Privacy Policy';
    body.innerHTML = `
      <p>ODD respects your privacy. We strictly collect only essential shipping and contact details to fulfill your orders. Your data is encrypted and never sold to third-party advertisers.</p>
    `;
  } else if (type === 'terms') {
    title.innerText = 'Terms of Service';
    body.innerHTML = `
      <p>By browsing or purchasing from ODD Perfume, you agree to our fair terms of service. All prices displayed in INR (₹) include applicable GST.</p>
    `;
  }

  openModal('policy-modal');
}

function openSearchModal() {
  openModal('search-modal');
  performSearch('');
}

function performSearch(query) {
  const container = document.getElementById('search-results');
  const q = query.toLowerCase().trim();

  const results = Object.values(PRODUCTS).filter(p => 
    p.name.toLowerCase().includes(q) ||
    p.notes.toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q) ||
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

// --- 11. Checkout & Order Placement ---
function openCheckoutModal() {
  if (cartState.length === 0) {
    showToast('Your bag is empty.');
    return;
  }

  const summaryContainer = document.getElementById('checkout-items-summary');
  let subtotal = 0;
  let itemsHtml = '';

  cartState.forEach(item => {
    const prod = PRODUCTS[item.id];
    const total = prod.price * item.qty;
    subtotal += total;
    itemsHtml += `
      <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 0.4rem;">
        <span>${prod.name} (x${item.qty})</span>
        <strong>₹${total}</strong>
      </div>
    `;
  });

  let discount = 0;
  if (appliedCoupon === 'LAUNCH20') discount = Math.round(subtotal * 0.20);
  if (appliedCoupon === 'ODDSPOT10') discount = Math.round(subtotal * 0.10);

  const totalPayable = subtotal - discount;

  summaryContainer.innerHTML = itemsHtml;
  document.getElementById('chk-subtotal').innerText = `₹${subtotal.toLocaleString('en-IN')}`;
  
  if (discount > 0) {
    document.getElementById('chk-discount-row').style.display = 'flex';
    document.getElementById('chk-discount').innerText = `-₹${discount.toLocaleString('en-IN')}`;
  } else {
    document.getElementById('chk-discount-row').style.display = 'none';
  }

  document.getElementById('chk-total').innerText = `₹${totalPayable.toLocaleString('en-IN')}`;

  toggleCartDrawer();
  openModal('checkout-modal');
}

function handlePlaceOrder(e) {
  e.preventDefault();
  closeModal('checkout-modal');
  cartState = [];
  appliedCoupon = null;
  updateCartUI();

  openModal('tracking-modal');
  document.getElementById('tracking-result').style.display = 'block';
  showToast('Order placed successfully. Order ID: #ODD-89421');
}

function trackOrderSubmit(e) {
  e.preventDefault();
  document.getElementById('tracking-result').style.display = 'block';
}

function handleNewsletterSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('newsletter-email');
  document.getElementById('news-feedback').innerText = 'Thank you for subscribing to ODD.';
  input.value = '';
}

// --- 12. Toast System (NO EMOJIS) ---
function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
