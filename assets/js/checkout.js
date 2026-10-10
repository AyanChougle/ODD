'use strict';

/* ==========================================================================
   ODD Perfume — Hostinger Static Checkout & Payment Engine
   ========================================================================== */

function checkoutMoney(value) {
  return '₹' + Number(value || 0).toLocaleString('en-IN');
}

function checkoutEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

function getProductAvailability(productId) {
  const inv = JSON.parse(localStorage.getItem('odd_admin_inventory') || '{}');
  const skuMap = { 'phantom': 'ODD-PH-001', 'lucid': 'ODD-LC-003', 'first-move': 'ODD-FM-002' };
  const sku = skuMap[productId];
  
  if (inv && sku && inv[sku]) {
    const item = inv[sku];
    return { stock: Number(item.stock ?? 0), name: item.name };
  }
  return { stock: 999, name: productId };
}

function renderCheckoutSummary() {
  const container = document.getElementById('chk-page-summary');
  if (!container) return;

  const cart = (typeof cartState !== 'undefined' && Array.isArray(cartState)) ? cartState : JSON.parse(localStorage.getItem('odd_cart') || '[]');

  if (!cart || cart.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding: 2rem 0;">Your bag is currently empty.</p>';
    
    const subtotalEl = document.getElementById('chk-page-subtotal');
    if (subtotalEl) subtotalEl.innerText = '₹0';
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
          <strong style="display:block; font-family:var(--font-serif); font-size:1rem;">${checkoutEscape(name)} ${isOutOfStock ? '<span style="color:#d32f2f; font-size:0.75rem; font-family:var(--font-sans);">(Out of stock)</span>' : ''}</strong>
          <span style="color:var(--text-muted); font-size:0.8rem;">Qty: ${item.qty} &times; ₹${price}</span>
        </div>
        <strong style="font-family:var(--font-mono);">₹${total.toLocaleString('en-IN')}</strong>
      </div>
    `;
  });

  container.innerHTML = html;

  // Coupon calculations
  let discountRate = 0;
  if (typeof getAppliedDiscountRate === 'function') {
    discountRate = getAppliedDiscountRate();
  } else {
    const code = String(localStorage.getItem('odd_coupon_code') || '').trim().toUpperCase();
    if (code === 'ODD10') discountRate = 0.10;
    else if (code === 'WELCOME15') discountRate = 0.15;
  }

  const discount = Math.round(subtotal * discountRate);
  const finalTotal = Math.max(0, subtotal - discount);

  const subtotalEl = document.getElementById('chk-page-subtotal');
  if (subtotalEl) subtotalEl.innerText = checkoutMoney(subtotal);

  const discRow = document.getElementById('chk-page-discount-row');
  const discEl = document.getElementById('chk-page-discount');
  if (discount > 0) {
    if (discRow) discRow.style.display = 'flex';
    if (discEl) discEl.innerText = '- ' + checkoutMoney(discount);
  } else if (discRow) {
    discRow.style.display = 'none';
  }

  const totalEl = document.getElementById('chk-page-total');
  if (totalEl) totalEl.innerText = checkoutMoney(finalTotal);

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

async function processPageOrder(e) {
  if (e) e.preventDefault();

  const cart = (typeof cartState !== 'undefined' && Array.isArray(cartState)) ? cartState : JSON.parse(localStorage.getItem('odd_cart') || '[]');
  if (!cart || cart.length === 0) {
    if (typeof showToast === 'function') showToast('Your bag is currently empty.');
    return;
  }

  // Stock check
  for (let item of cart) {
    const avail = getProductAvailability(item.id);
    if (avail.stock < item.qty) {
      if (typeof showToast === 'function') showToast('Error: ' + avail.name + ' is out of stock.');
      return;
    }
  }

  // Get Form Inputs
  const firstName = (document.getElementById('first-name')?.value || '').trim();
  const lastName = (document.getElementById('last-name')?.value || '').trim();
  const phone = (document.getElementById('mobile')?.value || document.getElementById('phone')?.value || '').trim();
  const email = (document.getElementById('email')?.value || '').trim();
  const address = (document.getElementById('address')?.value || document.getElementById('street')?.value || '').trim();
  const city = (document.getElementById('city')?.value || '').trim();
  const pincode = (document.getElementById('pincode')?.value || '').trim();
  const method = document.querySelector('input[name="payment-method"]:checked')?.value || 'cod';

  if (!firstName || !phone || !address) {
    if (typeof showToast === 'function') showToast('Please fill in your name, mobile number, and delivery address.');
    else alert('Please fill in your name, mobile number, and delivery address.');
    return;
  }

  const orderId = 'ODD-' + Math.floor(100000 + Math.random() * 900000);
  const totalStr = document.getElementById('chk-page-total')?.innerText || '₹899';

  if (method === 'razorpay' && typeof Razorpay !== 'undefined') {
    // Razorpay Integration with graceful fallback
    const options = {
      key: 'rzp_test_ODDPERFUMEKEY',
      amount: parseInt(totalStr.replace(/[^0-9]/g, '')) * 100 || 89900,
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

  // Complete COD or fallback placement
  completeOrderPlacement(orderId, firstName, lastName, phone, email, address, city, pincode, method === 'razorpay' ? 'Razorpay Online' : 'Cash on Delivery (COD)', cart);
}

function completeOrderPlacement(orderId, firstName, lastName, phone, email, address, city, pincode, paymentMethod, cart) {
  // 1. Deduct Inventory from odd_admin_inventory
  const inv = JSON.parse(localStorage.getItem('odd_admin_inventory') || '{}');
  const skuMap = { 'phantom': 'ODD-PH-001', 'lucid': 'ODD-LC-003', 'first-move': 'ODD-FM-002' };

  cart.forEach(item => {
    const sku = skuMap[item.id];
    if (inv && sku && inv[sku]) {
      inv[sku].stock = Math.max(0, Number(inv[sku].stock) - item.qty);
    }
  });
  localStorage.setItem('odd_admin_inventory', JSON.stringify(inv));

  // 2. Save Order to odd_orders in localStorage
  const existingOrders = JSON.parse(localStorage.getItem('odd_orders') || '[]');
  const newOrder = {
    id: orderId,
    date: new Date().toISOString().split('T')[0],
    customer: firstName + ' ' + lastName,
    phone: phone,
    email: email,
    address: address + ', ' + city + ' - ' + pincode,
    items: cart,
    total: document.getElementById('chk-page-total')?.innerText || '₹899',
    status: 'Processing',
    paymentMethod: paymentMethod
  };
  existingOrders.unshift(newOrder);
  localStorage.setItem('odd_orders', JSON.stringify(existingOrders));

  // 3. Clear Cart
  localStorage.setItem('odd_cart', '[]');
  if (typeof cartState !== 'undefined') cartState.length = 0;
  if (typeof updateCartUI === 'function') updateCartUI();

  // 4. Success UI Feedback
  alert('Order Confirmed! Order ID: ' + orderId + '\nThank you for shopping with ODD Perfume.');
  window.location.href = 'order-tracking.html?orderId=' + orderId;
}

document.addEventListener('DOMContentLoaded', () => {
  renderCheckoutSummary();

  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', processPageOrder);
  }
});
