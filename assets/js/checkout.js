'use strict';

/* ==========================================================================
   ODD Perfume — Hostinger Static Checkout & Order Integration Engine
   ========================================================================== */

const SKU_TO_ID = {
  'ODD-PH-001': 'phantom',
  'ODD-LC-003': 'lucid',
  'ODD-FM-002': 'first-move',
  'ODD-HM-004': 'hamper'
};

const ID_TO_SKU = {
  'phantom': 'ODD-PH-001',
  'lucid': 'ODD-LC-003',
  'first-move': 'ODD-FM-002',
  'hamper': 'ODD-HM-004'
};

function checkoutMoney(value) {
  return '₹' + Number(value || 0).toLocaleString('en-IN');
}

function checkoutEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

function getLiveInventory() {
  try {
    const inv = JSON.parse(localStorage.getItem('odd_admin_inventory'));
    return (inv && typeof inv === 'object') ? inv : {};
  } catch (e) {
    return {};
  }
}

// Synchronize live product stock, prices, and shipping config directly from backend
async function syncLiveProductsAndInventory() {
  try {
    const [res, shipRes] = await Promise.all([
      fetch('/api/products').catch(() => null),
      fetch('/api/settings/shipping').catch(() => null)
    ]);
    if (shipRes && shipRes.ok) {
      const sData = await shipRes.json().catch(() => null);
      if (sData && typeof sData === 'object') {
        localStorage.setItem('odd_admin_shipping', JSON.stringify(sData));
      }
    }
    if (res && res.ok) {
      const data = await res.json();
      const list = Array.isArray(data.products) ? data.products : (Array.isArray(data) ? data : []);
      const inv = getLiveInventory();
      list.forEach(p => {
        const sku = p.sku || ID_TO_SKU[p.id] || p.id;
        const fallbackPrice = (typeof PRODUCTS !== 'undefined' && PRODUCTS[p.id]?.price) ? PRODUCTS[p.id].price : 1599;
        const validPrice = Number(p.price) > 0 ? Number(p.price) : fallbackPrice;
        inv[sku] = {
          sku: sku,
          name: p.name,
          stock: Math.max(0, Number(p.stock ?? 0)),
          price: validPrice
        };
        if (typeof PRODUCTS !== 'undefined' && PRODUCTS[p.id]) {
          PRODUCTS[p.id].price = validPrice;
        }
      });
      localStorage.setItem('odd_admin_inventory', JSON.stringify(inv));
      if (typeof renderCheckoutSummary === 'function') {
        renderCheckoutSummary();
      }
    }
  } catch (e) {}
}
syncLiveProductsAndInventory();

function getProductAvailability(productId) {
  const inv = getLiveInventory();
  const sku = ID_TO_SKU[productId] || productId;
  
  if (inv && inv[sku]) {
    const item = inv[sku];
    return { stock: Math.max(0, Number(item.stock ?? 0)), name: item.name || productId };
  }
  return { stock: 999, name: productId };
}

function getShippingFee(subtotal) {
  try {
    const raw = localStorage.getItem('odd_admin_shipping');
    if (raw) {
      const cfg = JSON.parse(raw);
      if (cfg.enabled === false) return 0;
      const thresh = Number(cfg.freeThreshold ?? 0);
      if (thresh > 0 && subtotal >= thresh) return 0;
      return Number(cfg.standardRate ?? 50);
    }
  } catch (e) {}
  return 50;
}

function initCustomerCheckoutSession() {
  try {
    const session = JSON.parse(localStorage.getItem('odd_customer_session') || 'null');
    if (session && session.email) {
      const banner = document.getElementById('checkout-account-banner');
      const userText = document.getElementById('chk-logged-in-user');
      if (banner && userText) {
        userText.textContent = `${session.name || 'Customer'} (${session.email})`;
        banner.style.display = 'block';
      }

      const fNameInput = document.getElementById('chk-fname');
      const lNameInput = document.getElementById('chk-lname');
      const emailInput = document.getElementById('chk-email');
      const phoneInput = document.getElementById('chk-phone');

      if (session.name) {
        const parts = session.name.split(' ');
        if (fNameInput && !fNameInput.value) fNameInput.value = parts[0] || '';
        if (lNameInput && !lNameInput.value) lNameInput.value = parts.slice(1).join(' ') || '';
      }
      if (emailInput && !emailInput.value) emailInput.value = session.email;
      if (phoneInput && !phoneInput.value && session.phone) phoneInput.value = session.phone;

      // Auto-populate delivery address if available
      (async () => {
        try {
          const aRes = await fetch('/api/customer/addresses', { credentials: 'include' });
          if (aRes.ok) {
            const aData = await aRes.json();
            const list = Array.isArray(aData.addresses) ? aData.addresses : [];
            const defAddr = list.find(a => a.isDefault) || list[0];
            if (defAddr) {
              const addrInput = document.getElementById('chk-address');
              const cityInput = document.getElementById('chk-city');
              const pinInput = document.getElementById('chk-pincode');
              if (addrInput && !addrInput.value) addrInput.value = defAddr.street || defAddr.address || '';
              if (cityInput && !cityInput.value) cityInput.value = defAddr.city || '';
              if (pinInput && !pinInput.value) pinInput.value = defAddr.pin || defAddr.pincode || '';
            }
          }
        } catch (e) {}
      })();
    }
  } catch (e) {}
}

function signOutCustomerCheckout() {
  try {
    localStorage.removeItem('odd_customer_session');
  } catch (e) {}
  const banner = document.getElementById('checkout-account-banner');
  if (banner) banner.style.display = 'none';

  const fNameInput = document.getElementById('chk-fname');
  const lNameInput = document.getElementById('chk-lname');
  const emailInput = document.getElementById('chk-email');
  const phoneInput = document.getElementById('chk-phone');

  if (fNameInput) fNameInput.value = '';
  if (lNameInput) lNameInput.value = '';
  if (emailInput) emailInput.value = '';
  if (phoneInput) phoneInput.value = '';

  if (typeof showToast === 'function') {
    showToast('Signed out of customer account. You can now checkout as a guest.');
  }
}
window.signOutCustomerCheckout = signOutCustomerCheckout;

function getActiveCouponDetails() {
  const code = (localStorage.getItem('odd_coupon') || localStorage.getItem('odd_coupon_code') || '').trim().toUpperCase();
  if (!code) return null;

  let record = null;
  try {
    const activeList = (typeof ACTIVE_COUPONS !== 'undefined' && Array.isArray(ACTIVE_COUPONS)) ? ACTIVE_COUPONS : [];
    const pubCoupons = JSON.parse(localStorage.getItem('odd_coupons') || '[]');
    const adminCoupons = JSON.parse(localStorage.getItem('odd_admin_coupons') || '[]');
    record = activeList.find(c => String(c.code).toUpperCase() === code && c.active !== false)
      || pubCoupons.find(c => String(c.code).toUpperCase() === code && c.active !== false)
      || adminCoupons.find(c => String(c.code).toUpperCase() === code && c.active !== false)
      || null;
  } catch (e) {}

  let meta = null;
  try {
    meta = JSON.parse(localStorage.getItem('odd_coupon_meta') || 'null');
    if (meta && String(meta.code || '').toUpperCase() !== code) meta = null;
  } catch (e) {
    meta = null;
  }

  const savedDiscount = Number(localStorage.getItem('odd_coupon_discount') || 0);
  const discount = Number(record?.discount ?? record?.discountPercent ?? record?.discount_percent ?? meta?.discount ?? savedDiscount ?? 0);
  if (discount <= 0) return null;

  return {
    code,
    discount,
    maxDiscount: Math.max(0, Number(record?.maxDiscount ?? record?.max_discount ?? meta?.maxDiscount ?? 0)),
    minSpend: Math.max(0, Number(record?.minSpend ?? record?.min_spend ?? meta?.minSpend ?? 0))
  };
}

function computeCheckoutCouponDiscount(coupon, subtotal) {
  if (!coupon || !(coupon.discount > 0)) return { discountAmount: 0, minSpendShortfall: 0 };
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);
  const minSpend = Math.max(0, Number(coupon.minSpend || 0));
  if (minSpend > 0 && safeSubtotal < minSpend) {
    return { discountAmount: 0, minSpendShortfall: minSpend - safeSubtotal };
  }
  let discountAmount = Math.round(safeSubtotal * (coupon.discount / 100));
  const maxDiscount = Math.max(0, Number(coupon.maxDiscount || 0));
  if (maxDiscount > 0 && discountAmount > maxDiscount) {
    discountAmount = maxDiscount;
  }
  return { discountAmount, minSpendShortfall: 0 };
}

function renderCheckoutSummary() {
  const container = document.getElementById('chk-page-summary');
  if (!container) return;

  let cart = [];
  try {
    cart = (typeof cartState !== 'undefined' && Array.isArray(cartState))
      ? cartState
      : JSON.parse(localStorage.getItem('odd_cart') || '[]');
  } catch (e) {
    cart = [];
  }

  if (!cart || cart.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding: 2rem 0;">Your Cart is currently empty.</p>';
    
    const subtotalEl = document.getElementById('chk-page-subtotal');
    if (subtotalEl) subtotalEl.innerText = '₹0';
    const discRow = document.getElementById('chk-page-discount-row');
    if (discRow) discRow.style.display = 'none';
    const shippingEl = document.getElementById('chk-page-shipping');
    if (shippingEl) shippingEl.innerText = '₹0';
    const totalEl = document.getElementById('chk-page-total');
    if (totalEl) totalEl.innerText = '₹0';

    const submit = document.getElementById('checkout-submit');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Your Cart is empty';
    }
    return;
  }

  let subtotal = 0;
  let html = '';
  let hasUnavailable = false;

  cart.forEach(item => {
    const avail = getProductAvailability(item.id);
    const prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[item.id]) ? PRODUCTS[item.id] : null;
    const name = prod ? prod.name : (item.name || item.id);
    const price = Number(avail.price || prod?.price || item.price || 1599);
    const total = price * item.qty;
    subtotal += total;

    const isOutOfStock = avail.stock <= 0 || item.qty > avail.stock;
    if (isOutOfStock) hasUnavailable = true;

    html += `
      <div class="summary-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem; font-size:0.9rem; ${isOutOfStock ? 'opacity:0.5;' : ''}">
        <div>
          <strong style="display:block; font-family:var(--font-serif); font-size:1rem;">${checkoutEscape(name)} ${isOutOfStock ? '<span style="color:#d32f2f; font-size:0.75rem; font-family:var(--font-sans);">(Out of stock: ' + avail.stock + ' remaining)</span>' : ''}</strong>
          <span style="color:var(--text-muted); font-size:0.8rem;">Qty: ${item.qty} &times; ₹${price.toLocaleString('en-IN')}</span>
        </div>
        <strong style="font-family:var(--font-mono);">₹${total.toLocaleString('en-IN')}</strong>
      </div>
    `;
  });

  container.innerHTML = html;

  // Coupon calculations
  const coupon = getActiveCouponDetails();
  const { discountAmount, minSpendShortfall } = computeCheckoutCouponDiscount(coupon, subtotal);

  const shippingFee = getShippingFee(subtotal);
  const finalTotal = Math.max(0, subtotal - discountAmount + shippingFee);

  // Update Subtotal
  const subtotalEl = document.getElementById('chk-page-subtotal');
  if (subtotalEl) subtotalEl.innerText = checkoutMoney(subtotal);

  // Update Discount Row & Badge
  const discRow = document.getElementById('chk-page-discount-row');
  const discEl = document.getElementById('chk-page-discount');
  const badge = document.getElementById('chk-coupon-applied-badge');
  const badgeText = document.getElementById('chk-applied-code-text');

  if (coupon && discountAmount > 0) {
    if (discRow) discRow.style.display = 'flex';
    if (discEl) discEl.innerText = '- ' + checkoutMoney(discountAmount);
    if (badge) badge.style.display = 'flex';
    if (badgeText) badgeText.innerText = `${coupon.code} (${coupon.discount}% OFF)`;
  } else if (coupon && minSpendShortfall > 0) {
    if (discRow) discRow.style.display = 'none';
    if (badge) badge.style.display = 'flex';
    if (badgeText) badgeText.innerText = `${coupon.code} (Add ${checkoutMoney(minSpendShortfall)} for ${coupon.discount}% OFF)`;
  } else {
    if (discRow) discRow.style.display = 'none';
    if (badge) badge.style.display = 'none';
  }

  // Update Shipping Fee Row
  const shippingEl = document.getElementById('chk-page-shipping');
  if (shippingEl) {
    if (shippingFee > 0) {
      shippingEl.innerText = checkoutMoney(shippingFee);
      shippingEl.style.color = 'var(--text-main)';
    } else {
      shippingEl.innerText = 'FREE';
      shippingEl.style.color = '#2E7D32';
    }
  }

  // Update Final Total
  const totalEl = document.getElementById('chk-page-total');
  if (totalEl) totalEl.innerText = checkoutMoney(finalTotal);

  // Update Submit Button
  const submit = document.getElementById('checkout-submit');
  if (submit) {
    if (hasUnavailable) {
      submit.disabled = true;
      submit.textContent = 'Remove Out of Stock Items';
    } else {
      submit.disabled = false;
      submit.textContent = 'Confirm Order (' + checkoutMoney(finalTotal) + ')';
    }
  }
}

async function applyCheckoutCoupon() {
  const input = document.getElementById('chk-coupon-input');
  if (!input) return;
  const code = input.value.trim().toUpperCase();
  if (!code) {
    if (typeof showToast === 'function') showToast('Please enter a coupon code.');
    input.focus();
    return;
  }

  const customerEmail = (
    document.getElementById('chk-email')?.value ||
    JSON.parse(localStorage.getItem('odd_customer_session') || '{}')?.email ||
    ''
  ).trim().toLowerCase();

  // Compute current cart subtotal
  let cart = [];
  try {
    cart = (typeof cartState !== 'undefined' && Array.isArray(cartState))
      ? cartState
      : JSON.parse(localStorage.getItem('odd_cart') || '[]');
  } catch (e) {
    cart = [];
  }
  let subtotal = 0;
  cart.forEach(item => {
    const prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[item.id]) ? PRODUCTS[item.id] : null;
    const price = prod ? prod.price : (item.price || 1599);
    subtotal += price * item.qty;
  });

  // Dynamic server verification
  try {
    const res = await fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, subtotal, email: customerEmail })
    });
    const data = await res.json();
    if (res.ok && data.valid) {
      const normalized = String(data.code || code).trim().toUpperCase();
      const matched = (typeof ACTIVE_COUPONS !== 'undefined' && Array.isArray(ACTIVE_COUPONS))
        ? ACTIVE_COUPONS.find(c => String(c.code).toUpperCase() === normalized)
        : null;
      const couponPayload = {
        code: normalized,
        discount: Number(data.discountPercent),
        maxDiscount: Number(matched?.maxDiscount ?? matched?.max_discount ?? 0),
        minSpend: Number(matched?.minSpend ?? matched?.min_spend ?? 0)
      };
      if (typeof saveAppliedCouponState === 'function') {
        saveAppliedCouponState(couponPayload);
      } else {
        localStorage.setItem('odd_coupon', normalized);
        localStorage.setItem('odd_coupon_code', normalized);
        localStorage.setItem('odd_coupon_discount', String(couponPayload.discount));
        localStorage.setItem('odd_coupon_meta', JSON.stringify(couponPayload));
      }
      input.value = '';
      renderCheckoutSummary();
      if (typeof updateCartUI === 'function') updateCartUI();
      if (typeof showToast === 'function') showToast(`Coupon ${normalized} applied: ${couponPayload.discount}% discount!`);
      return;
    } else {
      const err = data.error || 'Invalid or expired promo code.';
      if (typeof showToast === 'function') showToast(err);
      else alert(err);
      return;
    }
  } catch (err) {
    // Local storage fallback for offline mode
    let foundCoupon = null;
    try {
      const adminCoupons = JSON.parse(localStorage.getItem('odd_admin_coupons') || localStorage.getItem('odd_coupons') || '[]');
      foundCoupon = adminCoupons.find(c => String(c.code).toUpperCase() === code && c.active !== false) || null;
    } catch (e) {}

    const discount = foundCoupon ? Number(foundCoupon.discount || foundCoupon.discount_percent || 0) : 0;
    if (discount > 0) {
      const couponPayload = {
        code,
        discount,
        maxDiscount: Number(foundCoupon?.maxDiscount ?? foundCoupon?.max_discount ?? 0),
        minSpend: Number(foundCoupon?.minSpend ?? foundCoupon?.min_spend ?? 0)
      };
      if (typeof saveAppliedCouponState === 'function') {
        saveAppliedCouponState(couponPayload);
      } else {
        localStorage.setItem('odd_coupon', code);
        localStorage.setItem('odd_coupon_code', code);
        localStorage.setItem('odd_coupon_discount', String(discount));
        localStorage.setItem('odd_coupon_meta', JSON.stringify(couponPayload));
      }
      input.value = '';
      renderCheckoutSummary();
      if (typeof updateCartUI === 'function') updateCartUI();
      if (typeof showToast === 'function') showToast(`Coupon ${code} applied: ${discount}% discount!`);
    } else {
      if (typeof showToast === 'function') showToast('Invalid or expired promo code.');
      else alert('Invalid or expired promo code.');
    }
  }
}

function removeCheckoutCoupon() {
  if (typeof saveAppliedCouponState === 'function') {
    saveAppliedCouponState(null);
  } else {
    localStorage.removeItem('odd_coupon');
    localStorage.removeItem('odd_coupon_code');
    localStorage.removeItem('odd_coupon_discount');
    localStorage.removeItem('odd_coupon_meta');
  }
  renderCheckoutSummary();
  if (typeof updateCartUI === 'function') updateCartUI();
  if (typeof showToast === 'function') showToast('Coupon removed.');
}

let _orderInProgress = false;
async function processPageOrder(e) {
  if (e) e.preventDefault();
  if (_orderInProgress) return;
  _orderInProgress = true;

  let cart = [];
  try {
    cart = (typeof cartState !== 'undefined' && Array.isArray(cartState))
      ? cartState
      : JSON.parse(localStorage.getItem('odd_cart') || '[]');
  } catch (e) {
    cart = [];
  }

  if (!cart || cart.length === 0) {
    if (typeof showToast === 'function') showToast('Your Cart is currently empty.');
    else alert('Your Cart is currently empty.');
    return;
  }

  const submitBtn = document.getElementById('checkout-submit');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';
  }

  // Stock check
  for (let item of cart) {
    const avail = getProductAvailability(item.id);
    if (avail.stock < item.qty) {
      const msg = `Error: ${avail.name} has only ${avail.stock} in stock. Please adjust your Cart.`;
      if (typeof showToast === 'function') showToast(msg);
      else alert(msg);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm & Place Order';
      }
      _orderInProgress = false;
      return;
    }
  }

  // Extract Form Inputs with fallback IDs
  const firstName = (
    document.getElementById('chk-fname')?.value ||
    document.getElementById('first-name')?.value ||
    ''
  ).trim();

  const lastName = (
    document.getElementById('chk-lname')?.value ||
    document.getElementById('last-name')?.value ||
    ''
  ).trim();

  const phone = (
    document.getElementById('chk-phone')?.value ||
    document.getElementById('mobile')?.value ||
    document.getElementById('phone')?.value ||
    ''
  ).trim();

  const email = (
    document.getElementById('chk-email')?.value ||
    document.getElementById('email')?.value ||
    ''
  ).trim();

  const address = (
    document.getElementById('chk-address')?.value ||
    document.getElementById('address')?.value ||
    document.getElementById('street')?.value ||
    ''
  ).trim();

  const city = (
    document.getElementById('chk-city')?.value ||
    document.getElementById('city')?.value ||
    ''
  ).trim();

  const pincode = (
    document.getElementById('chk-pincode')?.value ||
    document.getElementById('pincode')?.value ||
    ''
  ).trim();

  const method = (
    document.querySelector('input[name="payment"]:checked')?.value ||
    document.querySelector('input[name="payment-method"]:checked')?.value ||
    'razorpay'
  );

  if (!firstName || !phone || !address) {
    const msg = 'Please fill in your name, mobile number, and delivery address.';
    if (typeof showToast === 'function') showToast(msg);
    else alert(msg);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm & Place Order';
    }
    _orderInProgress = false;
      return;
  }

  // Check coupon usage limit against email before finalizing
  const coupon = getActiveCouponDetails();
  if (coupon && coupon.code && email) {
    try {
      const usages = JSON.parse(localStorage.getItem('odd_coupon_usages') || '[]');
      const alreadyUsed = usages.some(u => (u.coupon || '').toUpperCase() === coupon.code.toUpperCase() && String(u.email || '').toLowerCase() === email.toLowerCase());
      if (alreadyUsed) {
        alert(`Coupon ${coupon.code} has already been redeemed with ${email}. Please remove the coupon code to place this order.`);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Confirm & Place Order';
        }
        _orderInProgress = false;
      return;
      }
    } catch (e) {}
  }

  // Derive clean sequential fallback order ID: ODD-00001, ODD-00002...
  const localOrders = JSON.parse(localStorage.getItem('odd_orders') || '[]');
  let maxLocalSeq = 0;
  localOrders.forEach(o => {
    const m = String(o.id).match(/^ODD-(\d{1,5})$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > maxLocalSeq) maxLocalSeq = n;
    }
  });
  const fallbackOrderId = 'ODD-' + String(maxLocalSeq + 1).padStart(5, '0');
  const orderId = fallbackOrderId;

  // Subtotal & Shipping calculation
  let subtotal = 0;
  cart.forEach(item => {
    const prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[item.id]) ? PRODUCTS[item.id] : null;
    const price = prod ? prod.price : (item.price || 1599);
    subtotal += price * item.qty;
  });

  const { discountAmount } = computeCheckoutCouponDiscount(coupon, subtotal);
  const shippingFee = getShippingFee(subtotal);
  const finalTotal = Math.max(0, subtotal - discountAmount + shippingFee);

  // Razorpay Gateway Configuration (loaded dynamically from server)
  let activeRzpKeyId = '';
  try {
    const pubRes = await fetch('/api/settings/razorpay-public');
    if (pubRes.ok) {
      const pubData = await pubRes.json();
      if (pubData.keyId) activeRzpKeyId = pubData.keyId;
    }
  } catch (e) {}

  if (method === 'razorpay') {
    const amountPaisa = Math.round(finalTotal * 100);

    if (typeof Razorpay !== 'undefined') {
      let rzpServerOrderId = null;
      try {
        const orderCreateRes = await fetch('/api/payments/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: finalTotal,
            receipt: 'rcpt_' + (orderId || Date.now())
          })
        });
        if (orderCreateRes.ok) {
          const createData = await orderCreateRes.json();
          if (createData.orderId) {
            rzpServerOrderId = createData.orderId;
          }
          if (createData.keyId) {
            activeRzpKeyId = createData.keyId;
          }
        }
      } catch (e) {
        console.warn('Server Razorpay order creation check:', e);
      }

      if (!activeRzpKeyId) {
        alert('Online payment gateway is temporarily initializing. Please select Cash on Delivery (COD) or try again in a moment.');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Confirm & Place Order';
        }
        _orderInProgress = false;
      return;
      }

      const options = {
        key: activeRzpKeyId,
        amount: amountPaisa,
        currency: 'INR',
        name: 'ODD Perfume',
        description: 'Fragrance Order ' + orderId,
        image: 'assets/images/Phantom Single bottle.webp',
        ...(rzpServerOrderId ? { order_id: rzpServerOrderId } : {}),
        handler: async function (response) {
          const paymentId = response.razorpay_payment_id || ('pay_' + Math.random().toString(36).substring(2, 12));
          if (response.razorpay_signature && response.razorpay_order_id) {
            try {
              const verifyRes = await fetch('/api/payments/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature
                })
              });
              const vData = await verifyRes.json();
              if (verifyRes.ok && vData.verified === false) {
                alert('Payment verification failed. Please contact store support.');
                if (submitBtn) {
                  submitBtn.disabled = false;
                  submitBtn.textContent = 'Confirm & Place Order';
                }
                _orderInProgress = false;
      return;
              }
            } catch (vErr) {
              console.warn('Signature verification check note:', vErr);
            }
          }

          await completeOrderPlacement(
            orderId, firstName, lastName, phone, email, address, city, pincode,
            'Razorpay Online (' + paymentId + ')',
            cart, shippingFee, paymentId, response.razorpay_order_id || rzpServerOrderId
          );
        },
        prefill: {
          name: (firstName + ' ' + lastName).trim(),
          email: email,
          contact: phone
        },
        theme: {
          color: rzpConfig.themeColor || '#E86B32'
        },
        modal: {
          ondismiss: function() {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Confirm & Place Order';
            }
            if (typeof showToast === 'function') showToast('Payment window closed.');
          }
        }
      };

      try {
        const rzp = new Razorpay(options);
        rzp.on('payment.failed', function (resp) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirm & Place Order';
          }
          const failMsg = resp.error?.description || 'Transaction declined. Please try again.';
          alert('Razorpay payment failed: ' + failMsg);
        });
        rzp.open();
        return;
      } catch (err) {
        console.warn('Razorpay invocation exception:', err);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Confirm & Place Order';
        }
      }
    }

    // Sandbox Simulation fallback only if explicitly enabled
    if (rzpConfig.simulate === true) {
      const simPaymentId = 'pay_sim_' + Math.random().toString(36).substring(2, 10).toUpperCase();
      await completeOrderPlacement(
        orderId, firstName, lastName, phone, email, address, city, pincode,
        'Razorpay Online (' + simPaymentId + ')',
        cart, shippingFee, simPaymentId, null
      );
      return;
    } else {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm & Place Order';
      }
      alert('Razorpay gateway is not accessible. Please ensure you are connected to the internet.');
      return;
    }
  }

  // Complete COD placement
  await completeOrderPlacement(orderId, firstName, lastName, phone, email, address, city, pincode, 'Cash on Delivery (COD)', cart, shippingFee, null, null);
}

async function completeOrderPlacement(orderId, firstName, lastName, phone, email, address, city, pincode, paymentMethod, cart, shippingFee, razorpayPaymentId = null, razorpayOrderId = null) {
  const submitBtn = document.getElementById('checkout-submit') || document.getElementById('place-order-btn') || document.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing Order...';
  }

  const customerName = (firstName + ' ' + lastName).trim();
  const fullAddress = `${address}${city ? ', ' + city : ''}${pincode ? ' - ' + pincode : ''}`;
  const coupon = getActiveCouponDetails();
  const isPaid = paymentMethod.toLowerCase().includes('razorpay');

  // 1. Compute bill breakdown with coupon and shipping
  let subtotal = 0;
  cart.forEach(item => {
    const prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[item.id]) ? PRODUCTS[item.id] : null;
    const price = prod ? prod.price : (item.price || 1599);
    subtotal += price * item.qty;
  });

  const { discountAmount } = computeCheckoutCouponDiscount(coupon, subtotal);
  const finalShipping = (shippingFee != null) ? Number(shippingFee) : getShippingFee(subtotal);
  const finalTotal = Math.max(0, subtotal - discountAmount + finalShipping);

  // 2. Persist order directly into backend database (/api/orders)
  let assignedOrderId = orderId;
  let serverTotal = finalTotal;

  try {
    const serverPayload = {
      customer: customerName,
      email: email,
      phone: phone,
      address: fullAddress,
      items: cart.map(it => ({
        sku: ID_TO_SKU[it.id] || it.id,
        id: it.id,
        qty: Number(it.qty) || 1
      })),
      paymentMethod: paymentMethod,
      couponCode: coupon ? coupon.code : null,
      razorpayOrderId: razorpayOrderId || null,
      razorpayPaymentId: razorpayPaymentId || null
    };

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serverPayload)
    });

    const resData = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = resData.error || 'Failed to place order on server.';
      alert('Order Placement Error: ' + errMsg);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm & Place Order';
      }
      _orderInProgress = false;
      return;
    }

    if (resData.orderId) {
      assignedOrderId = resData.orderId;
    }
    if (resData.totalAmount != null) {
      serverTotal = resData.totalAmount;
    }
  } catch (netErr) {
    console.error('Backend /api/orders sync encountered network issue:', netErr);
    alert('We could not establish a connection to the store server to finalize your order. Please check your internet connection and try again.');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm & Place Order';
    }
    _orderInProgress = false;
      return;
  }

  // 3. Deduct Inventory from odd_admin_inventory (storefront local sync)
  const inv = getLiveInventory();
  cart.forEach(item => {
    const sku = ID_TO_SKU[item.id] || item.id;
    if (inv[sku]) {
      inv[sku].stock = Math.max(0, Number(inv[sku].stock) - item.qty);
      inv[sku].updated = new Date().toISOString().replace('T', ' ').substring(0, 16);
    }
  });
  localStorage.setItem('odd_admin_inventory', JSON.stringify(inv));

  try {
    window.dispatchEvent(new CustomEvent('odd:inventory-updated', { detail: inv }));
  } catch (e) {}

  // 4. Record coupon usage linked to customer email
  if (coupon && coupon.code) {
    try {
      const usages = JSON.parse(localStorage.getItem('odd_coupon_usages') || '[]');
      usages.unshift({
        coupon: coupon.code,
        email: email || 'guest@oddperfume.com',
        phone: phone || '',
        orderId: assignedOrderId,
        discount: discountAmount,
        date: new Date().toISOString()
      });
      localStorage.setItem('odd_coupon_usages', JSON.stringify(usages));
    } catch (e) {}
  }

  // 5. Save Order to odd_orders in localStorage
  const existingOrders = JSON.parse(localStorage.getItem('odd_orders') || '[]');

  const newOrder = {
    id: assignedOrderId,
    date: new Date().toISOString(),
    customer: customerName,
    phone: phone,
    email: email,
    address: fullAddress,
    items: cart.map(it => {
      const prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[it.id]) ? PRODUCTS[it.id] : null;
      const sku = ID_TO_SKU[it.id] || it.id;
      return {
        id: it.id,
        sku: sku,
        name: prod ? prod.name : (it.name || it.id),
        qty: Number(it.qty) || 1,
        price: prod ? prod.price : (it.price || 1599)
      };
    }),
    subtotal: subtotal,
    coupon: coupon ? coupon.code : null,
    discount: discountAmount,
    shipping: finalShipping,
    total: serverTotal,
    amount: serverTotal,
    status: 'Confirmed',
    paymentMethod: paymentMethod,
    paymentStatus: isPaid ? 'Paid' : 'Payment pending',
    gateway: isPaid ? 'Razorpay Live' : 'Cash on Delivery (COD)',
    razorpayPaymentId: razorpayPaymentId || (isPaid ? (paymentMethod.match(/pay_[a-zA-Z0-9]+/)?.[0] || null) : null),
    stockDeducted: true,
    createdAt: new Date().toISOString()
  };

  existingOrders.unshift(newOrder);
  localStorage.setItem('odd_orders', JSON.stringify(existingOrders));

  // 6. Clear Cart and Applied Coupon
  localStorage.setItem('odd_cart', '[]');
  if (typeof cartState !== 'undefined') cartState.length = 0;
  if (typeof saveAppliedCouponState === 'function') {
    saveAppliedCouponState(null);
  } else {
    localStorage.removeItem('odd_coupon');
    localStorage.removeItem('odd_coupon_code');
    localStorage.removeItem('odd_coupon_discount');
    localStorage.removeItem('odd_coupon_meta');
  }
  if (typeof updateCartUI === 'function') updateCartUI();

  // 7. Success UI Feedback & Redirect
  alert(`Order Confirmed! Order ID: ${assignedOrderId}\nPayment: ${paymentMethod}\nShipping: ₹${finalShipping}\nTotal Payable: ₹${serverTotal.toLocaleString('en-IN')}\nThank you for shopping with ODD Perfume.`);
  _orderInProgress = false;
  window.location.href = 'order-tracking.html?orderId=' + encodeURIComponent(assignedOrderId);
}

document.addEventListener('DOMContentLoaded', () => {
  initCustomerCheckoutSession();
  renderCheckoutSummary();

  // Form submission handled by inline onsubmit in checkout.html (no duplicate listener)
});


// Keep checkout summary synchronized whenever cart changes in drawer or other tabs
document.addEventListener('odd:cart-updated', () => {
  if (typeof renderCheckoutSummary === 'function') {
    renderCheckoutSummary();
  }
});
