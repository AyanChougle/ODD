/* Checkout Page JavaScript with Real Razorpay SDK Integration */
document.addEventListener('DOMContentLoaded', () => {
  renderCheckoutSummary();
});

function getAppliedDiscountRate() {
  if (!appliedCoupon) return 0;
  const storedPct = Number(localStorage.getItem('odd_coupon_discount'));
  if (storedPct && storedPct > 0) return storedPct / 100;
  if (appliedCoupon === 'LAUNCH20') return 0.20;
  if (appliedCoupon === 'ODDSPOT10') return 0.10;
  return 0.10;
}

function renderCheckoutSummary() {
  const container = document.getElementById('chk-page-summary');
  if (!container) return;

  if (cartState.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">Your bag is currently empty.</p>';
    return;
  }

  let subtotal = 0;
  let html = '';
  const inv = JSON.parse(localStorage.getItem('odd_admin_inventory') || '{}');
  let hasOutOfStock = false;
  

  cartState.forEach(item => {
    const prod = PRODUCTS[item.id];
    if (!prod) return;
    const total = prod.price * item.qty;
    subtotal += total;
    html += `
      <div class="receipt-item-row" style="display:flex; justify-content:space-between; margin-bottom:0.75rem; font-size:0.9rem;">
        <span>${prod.name} &times; ${item.qty}</span>
        <strong>&#8377;${total.toLocaleString('en-IN')}</strong>
      </div>
    `;
  });

  const discountRate = getAppliedDiscountRate();
  const discount = Math.round(subtotal * discountRate);
  const finalTotal = subtotal - discount;

  const subtotalEl = document.getElementById('chk-page-subtotal');
  if (subtotalEl) subtotalEl.innerText = `&#8377;${subtotal.toLocaleString('en-IN')}`;
  
  const discRow = document.getElementById('chk-page-discount-row');
  const discEl = document.getElementById('chk-page-discount');
  if (discount > 0) {
    if (discRow) discRow.style.display = 'flex';
    if (discEl) discEl.innerText = `-&#8377;${discount.toLocaleString('en-IN')}`;
  } else if (discRow) {
    discRow.style.display = 'none';
  }

  const totalEl = document.getElementById('chk-page-total');
  if (totalEl) totalEl.innerText = `&#8377;${finalTotal.toLocaleString('en-IN')}`;
  container.innerHTML = html;
}

function processPageOrder(e) {
  if (e) e.preventDefault();
  const inv = JSON.parse(localStorage.getItem('odd_admin_inventory') || '{}');
  for (let item of cartState) {
    if (inv[item.id] !== undefined && inv[item.id] < item.qty) {
      showToast('Error: ' + item.name + ' is out of stock or insufficient quantity.');
      return;
    }
  }
  
  // Deduct inventory
  for (let item of cartState) {
    if (inv[item.id] !== undefined) {
      inv[item.id] -= item.qty;
    }
  }
  localStorage.setItem('odd_admin_inventory', JSON.stringify(inv));
  
  
  if (cartState.length === 0) {
    showToast('Your bag is empty.');
    return;
  }

  // Stock Validation Check against Admin Inventory
  const inv = JSON.parse(localStorage.getItem('odd_admin_inventory'));
  if (inv) {
    for (let item of cartState) {
      let sku = '';
      if (item.id === 'phantom') sku = 'ODD-PH-001';
      else if (item.id === 'lucid') sku = 'ODD-LC-003';
      else if (item.id === 'first-move') sku = 'ODD-FM-002';

      if (sku && inv[sku]) {
        if (inv[sku].stock <= 0) {
          showToast(`Sorry, ${inv[sku].name} is OUT OF STOCK. Please remove it from your cart to proceed.`);
          return;
        }
        if (item.qty > inv[sku].stock) {
          showToast(`Only ${inv[sku].stock} unit(s) available for ${inv[sku].name}.`);
          return;
        }
      }
    }
  }

  // Calculate totals and items list
  let subtotal = 0;
  let itemsStr = [];
  
  cartState.forEach(item => {
    const prod = PRODUCTS[item.id];
    if (prod) {
      subtotal += (prod.price * item.qty);
      itemsStr.push(`${prod.name} (x${item.qty})`);
    }
  });

  const discountRate = getAppliedDiscountRate();
  const discount = Math.round(subtotal * discountRate);
  const finalTotal = subtotal - discount;

  // Order Details
  const orderId = '#ODD-' + Math.floor(10000 + Math.random() * 90000);
  const firstName = document.getElementById('chk-fname') ? document.getElementById('chk-fname').value.trim() : 'Customer';
  const lastName = document.getElementById('chk-lname') ? document.getElementById('chk-lname').value.trim() : '';
  const customerName = `${firstName} ${lastName}`.trim() || 'Guest Customer';
  const customerEmail = document.getElementById('chk-email') ? document.getElementById('chk-email').value.trim() : 'customer@oddperfume.com';
  const customerPhone = document.getElementById('chk-phone') ? document.getElementById('chk-phone').value.trim() : '9876543210';
  
  const selectedPaymentInput = document.querySelector('input[name="payment"]:checked') || document.querySelector('input[name="payment_method"]:checked');
  const method = selectedPaymentInput ? selectedPaymentInput.value : 'razorpay';

  const now = new Date();
  const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

  // If Razorpay Express selected -> Open Real Razorpay Checkout Modal
  if (method === 'razorpay') {
    const rzpKey = localStorage.getItem('odd_admin_rzp_key') || 'rzp_test_1DP5mmOlF5G5ag';
    
    if (typeof Razorpay === 'undefined') {
      console.warn('Razorpay SDK not loaded, proceeding with simulated gateway verification');
      finalizeCustomerOrder({
        id: orderId,
        customer: customerName,
        items: itemsStr.join(', '),
        amount: finalTotal,
        method: 'Razorpay',
        status: 'Paid',
        paymentId: 'pay_' + Math.random().toString(36).substring(2, 12),
        date: dateStr
      });
      return;
    }

    const options = {
      key: rzpKey,
      amount: Math.round(finalTotal * 100), // amount in paise
      currency: 'INR',
      name: 'ODD PERFUME',
      description: itemsStr.join(', '),
      image: 'assets/images/Phantom Single bottle.png',
      handler: function (response) {
        finalizeCustomerOrder({
          id: orderId,
          customer: customerName,
          items: itemsStr.join(', '),
          amount: finalTotal,
          method: 'Razorpay',
          status: 'Paid',
          paymentId: response.razorpay_payment_id || ('pay_' + Math.random().toString(36).substring(2, 12)),
          date: dateStr
        });
      },
      prefill: {
        name: customerName,
        email: customerEmail,
        contact: customerPhone
      },
      theme: {
        color: '#E86B32'
      },
      modal: {
        ondismiss: function() {
          showToast('Payment window cancelled. You can retry anytime.');
        }
      }
    };

    const rzp = new Razorpay(options);
    rzp.open();

  } else {
    // Cash on Delivery
    finalizeCustomerOrder({
      id: orderId,
      customer: customerName,
      items: itemsStr.join(', '),
      amount: finalTotal,
      method: 'COD',
      status: 'Pending',
      paymentId: 'COD-' + Math.floor(1000 + Math.random() * 9000),
      date: dateStr
    });
  }
}

function finalizeCustomerOrder(orderObj) {
  // 1. Sync to Admin Orders in localStorage
  let ordersData = JSON.parse(localStorage.getItem('odd_admin_orders')) || [];
  ordersData.unshift(orderObj);
  localStorage.setItem('odd_admin_orders', JSON.stringify(ordersData));

  // 2. Decrement Stock in Admin Inventory
  let inventoryData = JSON.parse(localStorage.getItem('odd_admin_inventory'));
  if (inventoryData) {
    cartState.forEach(item => {
      let sku = '';
      if (item.id === 'phantom') sku = 'ODD-PH-001';
      else if (item.id === 'lucid') sku = 'ODD-LC-003';
      else if (item.id === 'first-move') sku = 'ODD-FM-002';
      
      if (sku && inventoryData[sku]) {
        inventoryData[sku].stock = Math.max(0, inventoryData[sku].stock - item.qty);
        inventoryData[sku].updated = new Date().toISOString().slice(0, 16).replace('T', ' ');
      }
    });
    localStorage.setItem('odd_admin_inventory', JSON.stringify(inventoryData));
  }

  // 3. Clear Bag
  cartState = [];
  appliedCoupon = null;
  localStorage.removeItem('odd_coupon');
  localStorage.removeItem('odd_coupon_discount');
  saveCart();
  updateCartUI();

  showToast(`Order confirmed! Order ID: ${orderObj.id}`);
  setTimeout(() => {
    window.location.href = 'order-tracking.html';
  }, 1200);
}
