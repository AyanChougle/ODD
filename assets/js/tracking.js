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

function formatMilestoneDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function formatDayDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
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

    // 1. Authoritative Server Lookup
    let order = null;
    try {
      const params = new URLSearchParams({ order: id || '', ...(phone ? { phone } : {}) });
      const response = await fetch(`/api/orders/track?${params.toString()}`, { cache: 'no-store' });
      if (response.ok) {
        order = await response.json();
      }
    } catch (e) {}

    // 2. Local fallback if offline or unreachable
    if (!order) {
      const localOrders = JSON.parse(localStorage.getItem('odd_orders') || '[]');
      if (id) {
        order = localOrders.find(o => String(o.id || '').toUpperCase() === id);
      }
      if (!order && phone) {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        order = localOrders.find(o => String(o.phone || '').replace(/[^0-9]/g, '').includes(cleanPhone));
      }
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

    const confirmedDate = order.date || order.createdAt || order.created_at;
    const dispatchedDate = order.dispatchedAt || order.dispatched_at;
    const deliveredDate = order.deliveredAt || order.delivered_at;
    const cancelledDate = order.cancelledAt || order.cancelled_at;

    let eddText = '';
    if (order.estimatedDelivery || order.estimated_delivery) {
      eddText = formatDayDate(order.estimatedDelivery || order.estimated_delivery);
    } else if (dispatchedDate) {
      const edd = new Date(new Date(dispatchedDate).getTime() + 4 * 86400000);
      eddText = formatDayDate(edd);
    } else if (confirmedDate) {
      const edd = new Date(new Date(confirmedDate).getTime() + 5 * 86400000);
      eddText = formatDayDate(edd);
    }

    const currentIndex = ['Confirmed', 'Processing', 'Packed', 'Dispatched', 'Delivered'].indexOf(order.status || 'Confirmed');

    const progressSteps = [
      {
        name: 'Confirmed',
        date: confirmedDate ? formatMilestoneDate(confirmedDate) : ''
      },
      {
        name: 'Processing',
        date: (currentIndex >= 1 && confirmedDate) ? 'Order verified' : ''
      },
      {
        name: 'Packed',
        date: (currentIndex >= 2 && confirmedDate) ? 'Quality inspected' : ''
      },
      {
        name: 'Dispatched',
        date: dispatchedDate ? formatMilestoneDate(dispatchedDate) : (currentIndex >= 3 ? 'Handed to courier' : '')
      },
      {
        name: 'Delivered',
        date: deliveredDate ? formatMilestoneDate(deliveredDate) : (eddText && order.status !== 'Cancelled' ? 'Expected by ' + eddText : '')
      }
    ];

    const timeline = order.status === 'Cancelled'
      ? `<li class="is-current is-cancelled"><strong>Order cancelled</strong><span>This order has been cancelled${cancelledDate ? ' on ' + formatMilestoneDate(cancelledDate) : ''}.</span></li>`
      : progressSteps.map((step, index) => {
          const isComplete = index <= currentIndex;
          const isCurrent = index === currentIndex;
          const label = isCurrent ? 'Current status' : (isComplete ? 'Completed' : 'Pending');
          const extraDate = step.date ? `<div style="font-size:0.75rem; color:#6b7280; margin-top:2px; font-weight:500;">${trackingEscape(step.date)}</div>` : '';
          return `
            <li class="${isComplete ? 'is-complete' : ''} ${isCurrent ? 'is-current' : ''}">
              <strong>${step.name}</strong>
              <span>${label}</span>
              ${extraDate}
            </li>
          `;
        }).join('');

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
            <small>${confirmedDate ? formatMilestoneDate(confirmedDate) : ''}</small>
          </div>
        </header>
        ${(order.tracking_number || order.trackingNumber) ? `
          <div class="tracking-courier-banner" style="background:#f8f9fa; border:1px solid #e5e7eb; border-radius:8px; padding:14px 18px; margin:16px 0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; display:block; margin-bottom:3px;">Dispatched via Official Courier</span>
              <strong style="font-size:1.05rem; color:#111827;">${trackingEscape(order.courier_name || order.courier || 'Envia Logistics')}</strong>
              <div style="font-size:0.85rem; color:#374151; margin-top:3px;">AWB Tracking: <span style="font-family:monospace; font-weight:700; color:#111827;">${trackingEscape(order.tracking_number || order.trackingNumber)}</span></div>
              ${dispatchedDate ? `<div style="font-size:0.78rem; color:#059669; margin-top:4px; font-weight:600;">Dispatched on: ${formatMilestoneDate(dispatchedDate)}</div>` : ''}
              ${eddText && order.status !== 'Delivered' && order.status !== 'Cancelled' ? `<div style="font-size:0.78rem; color:#4B5563; margin-top:2px;">Estimated Delivery: <strong style="color:#111827;">${eddText}</strong></div>` : ''}
              ${deliveredDate ? `<div style="font-size:0.78rem; color:#2563EB; margin-top:4px; font-weight:600;">Delivered on: ${formatMilestoneDate(deliveredDate)}</div>` : ''}
            </div>
            ${(order.tracking_url || order.trackingUrl) ? `<a href="${trackingEscape(order.tracking_url || order.trackingUrl)}" target="_blank" rel="noopener" class="btn btn-outline" style="font-size:0.8rem; padding:8px 16px; text-decoration:none; display:inline-block; font-weight:600;">Track Shipment Live &rarr;</a>` : ''}
          </div>
        ` : ''}
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
