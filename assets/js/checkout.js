'use strict';

/* ==========================================================================
   ODD Perfume — Hostinger Static Checkout & Order Integration Engine
   ========================================================================== */

const DEFAULT_INVENTORY_MAP = {
  'ODD-PH-001': { sku: 'ODD-PH-001', name: 'ODD PHANTOM', stock: 240, price: 899 },
  'ODD-LC-003': { sku: 'ODD-LC-003', name: 'ODD LUCID', stock: 180, price: 899 },
  'ODD-FM-002': { sku: 'ODD-FM-002', name: 'ODD FIRST MOVE', stock: 0, price: 899 }
};

const SKU_TO_ID = {
  'ODD-PH-001': 'phantom',
  'ODD-LC-003': 'lucid',
  'ODD-FM-002': 'first-move'
};

const ID_TO_SKU = {
  'phantom': 'ODD-PH-001',
  'lucid': 'ODD-LC-003',
  'first-move': 'ODD-FM-002'
};

const DEFAULT_COUPONS_LIST = [
  { code: 'LAUNCH20', discount: 20 },
  { code: 'ODD10', discount: 10 },
  { code: 'WELCOME15', discount: 15 },
  { code: 'ODDSPOT10', discount: 10 }
];

function checkoutMoney(value) {
  return '₹' + Number(value || 0).toLocaleString('en-IN');
}

function checkoutEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

function getLiveInventory() {
  let inv = null;
  try {
    inv = JSON.parse(localStorage.getItem('odd_admin_inventory'));
  } catch (e) {
    inv = null;
  }
  if (!inv || typeof inv !== 'object' || !Object.keys(inv).length) {
    inv = { ...DEFAULT_INVENTORY_MAP };
    localStorage.setItem('odd_admin_inventory', JSON.stringify(inv));
  }
  return inv;
}

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
    }
  } catch (e) {}
}

function getActiveCouponDetails() {
  const code = (localStorage.getItem('odd_coupon') || localStorage.getItem('odd_coupon_code') || '').trim().toUpperCase();
  if (!code) return null;

  // 1. Check if discount percent was stored directly
  const savedDiscount = Number(localStorage.getItem('odd_coupon_discount'));
  if (savedDiscount > 0) {
    return { code, discount: savedDiscount };
  }

  // 2. Check odd_admin_coupons from localStorage
  try {
    const adminCoupons = JSON.parse(localStorage.getItem('odd_admin_coupons') || '[]');
    const match = adminCoupons.find(c => c.code === code && c.active !== false);
    if (match) return { code: match.code, discount: Number(match.discount) };
  } catch (e) {}

  // 3. Fallback to default coupons
  const defaultMatch = DEFAULT_COUPONS_LIST.find(c => c.code === code);
  if (defaultMatch) {
    return defaultMatch;
  }

  return null;
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
    container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding: 2rem 0;">Your bag is currently empty.</p>';
    
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
      submit.textContent = 'Your bag is empty';
    }
    return;
  }

  let subtotal = 0;
  let html = '';
  let hasUnavailable = false;

  cart.forEach(item => {
    const prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[item.id]) ? PRODUCTS[item.id] : null;
    const name = prod ? prod.name : (item.name || item.id);
    const price = prod ? prod.price : (item.price || 899);
    const total = price * item.qty;
    subtotal += total;

    const avail = getProductAvailability(item.id);
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
  let discountAmount = 0;
  if (coupon && coupon.discount > 0) {
    discountAmount = Math.round(subtotal * (coupon.discount / 100));
  }

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

function applyCheckoutCoupon() {
  const input = document.getElementById('chk-coupon-input');
  if (!input) return;
  const code = input.value.trim().toUpperCase();
  if (!code) {
    if (typeof showToast === 'function') showToast('Please enter a coupon code.');
    return;
  }

  // Check email-linked coupon usage
  const customerEmail = (
    document.getElementById('chk-email')?.value ||
    JSON.parse(localStorage.getItem('odd_customer_session') || '{}')?.email ||
    ''
  ).trim().toLowerCase();

  if (customerEmail) {
    try {
      const usages = JSON.parse(localStorage.getItem('odd_coupon_usages') || '[]');
      const alreadyUsed = usages.some(u => (u.coupon || '').toUpperCase() === code && String(u.email || '').toLowerCase() === customerEmail);
      if (alreadyUsed) {
        const msg = `Coupon ${code} has already been redeemed with this email (${customerEmail}). Limited to 1 use per customer.`;
        if (typeof showToast === 'function') showToast(msg);
        else alert(msg);
        return;
      }
    } catch (e) {}
  }

  // Check admin coupons or default coupons
  let discount = 0;
  try {
    const adminCoupons = JSON.parse(localStorage.getItem('odd_admin_coupons') || '[]');
    const match = adminCoupons.find(c => c.code === code && c.active !== false);
    if (match) discount = Number(match.discount);
  } catch (e) {}

  if (!discount) {
    const defaultMatch = DEFAULT_COUPONS_LIST.find(c => c.code === code);
    if (defaultMatch) discount = defaultMatch.discount;
  }

  if (discount > 0) {
    localStorage.setItem('odd_coupon', code);
    localStorage.setItem('odd_coupon_code', code);
    localStorage.setItem('odd_coupon_discount', String(discount));
    input.value = '';
    renderCheckoutSummary();
    if (typeof updateCartUI === 'function') updateCartUI();
    if (typeof showToast === 'function') showToast(`Coupon ${code} applied: ${discount}% discount!`);
  } else {
    if (typeof showToast === 'function') showToast('Invalid or expired promo code.');
    else alert('Invalid or expired promo code.');
  }
}

function removeCheckoutCoupon() {
  localStorage.removeItem('odd_coupon');
  localStorage.removeItem('odd_coupon_code');
  localStorage.removeItem('odd_coupon_discount');
  renderCheckoutSummary();
  if (typeof updateCartUI === 'function') updateCartUI();
  if (typeof showToast === 'function') showToast('Coupon removed.');
}

async function processPageOrder(e) {
  if (e) e.preventDefault();

  let cart = [];
  try {
    cart = (typeof cartState !== 'undefined' && Array.isArray(cartState))
      ? cartState
      : JSON.parse(localStorage.getItem('odd_cart') || '[]');
  } catch (e) {
    cart = [];
  }

  if (!cart || cart.length === 0) {
    if (typeof showToast === 'function') showToast('Your bag is currently empty.');
    else alert('Your bag is currently empty.');
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
      const msg = `Error: ${avail.name} has only ${avail.stock} in stock. Please adjust your bag.`;
      if (typeof showToast === 'function') showToast(msg);
      else alert(msg);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm & Place Order';
      }
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
    const price = prod ? prod.price : (item.price || 899);
    subtotal += price * item.qty;
  });

  const discountAmount = (coupon && coupon.discount > 0) ? Math.round(subtotal * (coupon.discount / 100)) : 0;
  const shippingFee = getShippingFee(subtotal);
  const finalTotal = Math.max(0, subtotal - discountAmount + shippingFee);

  // Live Razorpay Gateway Configuration
  const rzpConfig = (() => {
    try {
      const raw = localStorage.getItem('odd_razorpay_config');
      if (raw) {
        const parsed = JSON.parse(raw);
        // Automatically migrate legacy test key to user live key
        if (parsed.keyId === 'rzp_test_51NgQODDPERFUME') {
          parsed.keyId = 'rzp_live_Ti8AffHarb3tai';
          parsed.keySecret = 'X4Ws6I0iovvSrTYh18i1nNjl';
          parsed.env = 'live';
          parsed.simulate = false;
          localStorage.setItem('odd_razorpay_config', JSON.stringify(parsed));
        }
        return parsed;
      }
    } catch (e) {}
    const def = {
      enabled: true,
      env: 'live',
      keyId: 'rzp_live_Ti8AffHarb3tai',
      keySecret: 'X4Ws6I0iovvSrTYh18i1nNjl',
      brandName: 'ODD Perfume',
      themeColor: '#E86B32',
      simulate: false
    };
    try {
      localStorage.setItem('odd_razorpay_config', JSON.stringify(def));
    } catch (e) {}
    return def;
  })();

  if (method === 'razorpay') {
    const amountPaisa = Math.round(finalTotal * 100);
    const keyId = rzpConfig.keyId || 'rzp_live_Ti8AffHarb3tai';

    if (typeof Razorpay !== 'undefined') {
      const options = {
        key: keyId,
        amount: amountPaisa,
        currency: 'INR',
        name: rzpConfig.brandName || 'ODD Perfume',
        description: 'Fragrance Order ' + orderId,
        image: 'assets/images/Phantom Single bottle.png',
        handler: async function (response) {
          const paymentId = response.razorpay_payment_id || ('pay_' + Math.random().toString(36).substring(2, 12));
          await completeOrderPlacement(
            orderId, firstName, lastName, phone, email, address, city, pincode,
            'Razorpay Online (' + paymentId + ')',
            cart, shippingFee, paymentId
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
        cart, shippingFee, simPaymentId
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
  await completeOrderPlacement(orderId, firstName, lastName, phone, email, address, city, pincode, 'Cash on Delivery (COD)', cart, shippingFee, null);
}

async function completeOrderPlacement(orderId, firstName, lastName, phone, email, address, city, pincode, paymentMethod, cart, shippingFee, razorpayPaymentId = null) {
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
    const price = prod ? prod.price : (item.price || 899);
    subtotal += price * item.qty;
  });

  const discountAmount = (coupon && coupon.discount > 0) ? Math.round(subtotal * (coupon.discount / 100)) : 0;
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
      return;
    }

    if (resData.orderId) {
      assignedOrderId = resData.orderId;
    }
    if (resData.totalAmount != null) {
      serverTotal = resData.totalAmount;
    }
  } catch (netErr) {
    console.warn('Backend /api/orders sync encountered network issue, proceeding with local fallback:', netErr);
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
        price: prod ? prod.price : (it.price || 899)
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

  // 6. Clear Cart
  localStorage.setItem('odd_cart', '[]');
  if (typeof cartState !== 'undefined') cartState.length = 0;
  if (typeof updateCartUI === 'function') updateCartUI();

  // 7. Success UI Feedback & Redirect
  alert(`Order Confirmed! Order ID: ${assignedOrderId}\nPayment: ${paymentMethod}\nShipping: ₹${finalShipping}\nTotal Payable: ₹${serverTotal.toLocaleString('en-IN')}\nThank you for shopping with ODD Perfume.`);
  window.location.href = 'order-tracking.html?orderId=' + encodeURIComponent(assignedOrderId);
}

document.addEventListener('DOMContentLoaded', () => {
  initCustomerCheckoutSession();
  renderCheckoutSummary();

  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', processPageOrder);
  }
});
