'use strict';

/* ==========================================================================
   ODD Perfume — Hostinger Static Checkout & Order Integration Engine
   ========================================================================== */

const DEFAULT_INVENTORY_MAP = {
  'ODD-PH-001': { sku: 'ODD-PH-001', name: 'ODD PHANTOM', stock: 240, price: 899 },
  'ODD-LC-003': { sku: 'ODD-LC-003', name: 'ODD LUCID', stock: 180, price: 899 },
  'ODD-FM-002': { sku: 'ODD-FM-002', name: 'ODD FIRST MOVE', stock: 320, price: 899 }
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

  const finalTotal = Math.max(0, subtotal - discountAmount);

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

  // Stock check
  for (let item of cart) {
    const avail = getProductAvailability(item.id);
    if (avail.stock < item.qty) {
      const msg = `Error: ${avail.name} has only ${avail.stock} in stock.`;
      if (typeof showToast === 'function') showToast(msg);
      else alert(msg);
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
    'cod'
  );

  if (!firstName || !phone || !address) {
    const msg = 'Please fill in your name, mobile number, and delivery address.';
    if (typeof showToast === 'function') showToast(msg);
    else alert(msg);
    return;
  }

  const orderId = 'ODD-' + Math.floor(100000 + Math.random() * 900000);

  if (method === 'razorpay' && typeof Razorpay !== 'undefined') {
    const totalStr = document.getElementById('chk-page-total')?.innerText || '₹899';
    const amountPaisa = (parseInt(totalStr.replace(/[^0-9]/g, '')) || 899) * 100;
    const options = {
      key: 'rzp_test_ODDPERFUMEKEY',
      amount: amountPaisa,
      currency: 'INR',
      name: 'ODD Perfume',
      description: 'Order ' + orderId,
      image: 'assets/images/Phantom Single bottle.png',
      handler: function (response) {
        completeOrderPlacement(orderId, firstName, lastName, phone, email, address, city, pincode, 'Razorpay (' + response.razorpay_payment_id + ')', cart);
      },
      prefill: { name: firstName + ' ' + lastName, email: email, contact: phone },
      theme: { color: '#E86B32' },
      modal: {
        ondismiss: function() {
          if (typeof showToast === 'function') showToast('Payment window closed.');
        }
      }
    };
    try {
      const rzp = new Razorpay(options);
      rzp.open();
      return;
    } catch (err) {
      console.warn('Razorpay failed, falling back to instant placement:', err);
    }
  }

  // Complete COD placement
  completeOrderPlacement(orderId, firstName, lastName, phone, email, address, city, pincode, method === 'razorpay' ? 'Razorpay Online' : 'Cash on Delivery (COD)', cart);
}

function completeOrderPlacement(orderId, firstName, lastName, phone, email, address, city, pincode, paymentMethod, cart) {
  // 1. Deduct Inventory from odd_admin_inventory
  const inv = getLiveInventory();

  cart.forEach(item => {
    const sku = ID_TO_SKU[item.id] || item.id;
    if (inv[sku]) {
      inv[sku].stock = Math.max(0, Number(inv[sku].stock) - item.qty);
      inv[sku].updated = new Date().toISOString().replace('T', ' ').substring(0, 16);
    }
  });
  localStorage.setItem('odd_admin_inventory', JSON.stringify(inv));

  // Dispatch custom event so storefront & admin reflect updated stock
  try {
    window.dispatchEvent(new CustomEvent('odd:inventory-updated', { detail: inv }));
  } catch (e) {}

  // 2. Compute bill breakdown with coupon
  let subtotal = 0;
  cart.forEach(item => {
    const prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[item.id]) ? PRODUCTS[item.id] : null;
    const price = prod ? prod.price : (item.price || 899);
    subtotal += price * item.qty;
  });

  const coupon = getActiveCouponDetails();
  const discountAmount = (coupon && coupon.discount > 0) ? Math.round(subtotal * (coupon.discount / 100)) : 0;
  const finalTotal = Math.max(0, subtotal - discountAmount);

  // 3. Save Order to odd_orders in localStorage
  const existingOrders = JSON.parse(localStorage.getItem('odd_orders') || '[]');
  const isPaid = paymentMethod.toLowerCase().includes('razorpay');

  const newOrder = {
    id: orderId,
    date: new Date().toISOString(),
    customer: (firstName + ' ' + lastName).trim(),
    phone: phone,
    email: email,
    address: `${address}${city ? ', ' + city : ''}${pincode ? ' - ' + pincode : ''}`,
    items: cart.map(it => {
      const prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[it.id]) ? PRODUCTS[it.id] : null;
      return {
        id: it.id,
        name: prod ? prod.name : (it.name || it.id),
        qty: Number(it.qty) || 1,
        price: prod ? prod.price : (it.price || 899)
      };
    }),
    subtotal: subtotal,
    coupon: coupon ? coupon.code : null,
    discount: discountAmount,
    total: finalTotal,
    amount: finalTotal,
    status: 'Confirmed',
    paymentMethod: paymentMethod,
    paymentStatus: isPaid ? 'Paid' : 'Payment pending'
  };

  existingOrders.unshift(newOrder);
  localStorage.setItem('odd_orders', JSON.stringify(existingOrders));

  // 4. Clear Cart
  localStorage.setItem('odd_cart', '[]');
  if (typeof cartState !== 'undefined') cartState.length = 0;
  if (typeof updateCartUI === 'function') updateCartUI();

  // 5. Success UI Feedback & Redirect
  alert(`Order Confirmed! Order ID: ${orderId}\nPayment: ${paymentMethod}\nTotal Payable: ₹${finalTotal.toLocaleString('en-IN')}\nThank you for shopping with ODD Perfume.`);
  window.location.href = 'order-tracking.html?orderId=' + encodeURIComponent(orderId);
}

document.addEventListener('DOMContentLoaded', () => {
  renderCheckoutSummary();

  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', processPageOrder);
  }
});
