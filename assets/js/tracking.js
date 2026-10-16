'use strict';

function trackingMoney(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function trackingEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function statusClass(status) {
  return status === 'Delivered'
    ? 'delivered'
    : status === 'Dispatched'
    ? 'transit'
    : status === 'Cancelled'
    ? 'cancelled'
    : 'pending';
}

async function submitOrderTracking(event) {
  event?.preventDefault();
  const id = document.getElementById('tracking-order-id')?.value.trim().toUpperCase();
  const phone = document.getElementById('tracking-phone')?.value.trim();
  const message = document.getElementById('tracking-message');
  const resultBox = document.getElementById('tracking-result');

  if (message) {
    message.textContent = 'Checking order records…';
    message.className = 'tracking-message';
  }
  if (resultBox) {
    resultBox.hidden = true;
    resultBox.innerHTML = '';
  }

  try {
    if (!id && !phone) {
      throw new Error('Please enter your Order Reference or checkout mobile number.');
    }

    // 1. Offline Lookup from localStorage
    const localOrders = JSON.parse(localStorage.getItem('odd_orders') || '[]');
    let order = null;

    if (id) {
      order = localOrders.find(o => String(o.id || '').toUpperCase() === id);
    }
    if (!order && phone) {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      order = localOrders.find(o => String(o.phone || '').replace(/[^0-9]/g, '').includes(cleanPhone));
    }

    // 2. Try online API as graceful fallback if not found locally
    if (!order) {
      try {
        const params = new URLSearchParams({ order: id || '', ...(phone ? { phone } : {}) });
        const response = await fetch(`/api/orders/track?${params.toString()}`, { cache: 'no-store' });
        if (response.ok) {
          order = await response.json();
        }
      } catch (e) {}
    }

    if (!order) {
      throw new Error('Order not found. Please verify your Order Reference and checkout mobile number.');
    }

    if (message) {
      message.textContent = '';
      message.className = 'tracking-message';
    }

    const rawTotal = order.total || order.amount || 0;
    const amountNum = typeof rawTotal === 'number'
      ? rawTotal
      : (parseInt(String(rawTotal).replace(/[^0-9]/g, '')) || 899);

    const status = trackingEscape(order.status || 'Confirmed');

    const rawItems = Array.isArray(order.items) ? order.items : [];
    const itemsHtml = rawItems.map(item => {
      let name = item.name;
      if (!name) {
        if (item.id === 'phantom' || item.id === 'ODD-PH-001') name = 'ODD PHANTOM';
        else if (item.id === 'lucid' || item.id === 'ODD-LC-003') name = 'ODD LUCID';
        else if (item.id === 'first-move' || item.id === 'ODD-FM-002') name = 'ODD FIRST MOVE';
        else name = String(item.id || 'Fragrance');
      }
      const qty = Number(item.qty) || 1;
      const price = Number(item.price) || 899;
      return `
        <div class="tracking-item">
          <div>
            <strong>${trackingEscape(name)}</strong>
            <span>Quantity ${qty}</span>
          </div>
          <strong>${trackingMoney(price * qty)}</strong>
        </div>
      `;
    }).join('');

    const progress = ['Confirmed', 'Processing', 'Packed', 'Dispatched', 'Delivered'];
    const currentIndex = progress.indexOf(order.status || 'Confirmed');
    const timeline = order.status === 'Cancelled'
      ? '<li class="is-current is-cancelled"><strong>Order cancelled</strong><span>This order has been cancelled.</span></li>'
      : progress.map((step, index) => `
          <li class="${index <= currentIndex ? 'is-complete' : ''} ${index === currentIndex ? 'is-current' : ''}">
            <strong>${step}</strong>
            <span>${index < currentIndex ? 'Completed' : index === currentIndex ? 'Current status' : 'Pending'}</span>
          </li>
        `).join('');

    if (resultBox) {
      resultBox.innerHTML = `
        <header class="tracking-order-header">
          <div>
            <span class="tracking-eyebrow">ORDER REFERENCE</span>
            <h2>${trackingEscape(order.id)}</h2>
            <span class="tracking-status ${statusClass(order.status)}">${status}</span>
          </div>
          <div class="tracking-order-total">
            <span>Order total</span>
            <strong>${trackingMoney(amountNum)}</strong>
            ${order.discount ? `<small style="display:block; color:var(--brand-orange, #E86B32); font-size:0.75rem; font-weight:600;">Includes discount -${trackingMoney(order.discount)} (${trackingEscape(order.coupon || 'PROMO')})</small>` : ''}
            <small>${order.date ? new Date(order.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</small>
          </div>
        </header>
        <section class="tracking-order-items">
          <h3>Items in your order</h3>
          ${itemsHtml || '<p>No item details available.</p>'}
          <div style="border-top:1px dashed var(--border-color, #E5E5E5); margin-top:0.8rem; padding-top:0.8rem;">
            <div class="tracking-item" style="color:var(--text-muted); font-size:0.85rem;">
              <span>Items Subtotal</span>
              <strong>${trackingMoney(order.subtotal || amountNum)}</strong>
            </div>
            ${order.discount ? `
              <div class="tracking-item" style="color:var(--brand-orange, #E86B32); font-weight:600; font-size:0.85rem;">
                <span>Coupon Discount (${trackingEscape(order.coupon || 'PROMO')})</span>
                <strong>-${trackingMoney(order.discount)}</strong>
              </div>
            ` : ''}
            <div class="tracking-item" style="color:var(--text-muted); font-size:0.85rem;">
              <span>Shipping & Delivery</span>
              <strong>${order.shipping > 0 ? trackingMoney(order.shipping) : (order.shipping === 0 ? 'FREE' : 'Included')}</strong>
            </div>
            <div class="tracking-item" style="font-weight:700; font-size:1rem; border-top:1px solid var(--border-color, #E5E5E5); margin-top:0.5rem; padding-top:0.5rem;">
              <span>Total Payable</span>
              <strong>${trackingMoney(amountNum)}</strong>
            </div>
          </div>
        </section>
        <section class="tracking-timeline">
          <h3>Delivery progress</h3>
          <ol>${timeline}</ol>
        </section>
      `;
      resultBox.hidden = false;
    }
  } catch (error) {
    if (message) {
      message.textContent = error.message;
      message.className = 'tracking-message is-error';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('order') || params.get('orderId');
  if (orderId) {
    const input = document.getElementById('tracking-order-id');
    if (input) input.value = orderId;
    submitOrderTracking();
  }
});
