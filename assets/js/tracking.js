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

    window.currentTrackedOrder = order;

    if (resultBox) {
      const rawPayMethod = String(order.payment_method || order.paymentMethod || order.gateway || '').toLowerCase();
      const isCodOrder = rawPayMethod.includes('cod') || rawPayMethod.includes('cash');
      const isPaidOrder = String(order.payment_status || order.paymentStatus).toLowerCase() === 'paid' || (!isCodOrder && rawPayMethod.includes('razorpay'));

      resultBox.innerHTML = `
        <header class="tracking-order-header">
          <div>
            <span class="tracking-eyebrow">ORDER REFERENCE</span>
            <h2>${trackingEscape(order.id)}</h2>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:6px;">
              <span class="tracking-status ${statusClass(order.status)}">${status}</span>
              <button type="button" class="btn btn-outline btn-sm" onclick="printCustomerInvoice()" style="font-size:0.75rem; padding:4px 10px; display:inline-flex; align-items:center; gap:5px; border-radius:4px; font-weight:600; cursor:pointer;" title="Print or save tax invoice">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                Print Invoice
              </button>
            </div>
          </div>
          <div class="tracking-order-total">
            <span>Order total</span>
            <strong>${trackingMoney(amountNum)}</strong>
            ${order.discount ? `<small style="display:block; color:var(--brand-orange, #E86B32); font-size:0.75rem; font-weight:600;">Includes discount -${trackingMoney(order.discount)} (${trackingEscape(order.coupon || 'PROMO')})</small>` : ''}
            <small>${confirmedDate ? formatMilestoneDate(confirmedDate) : ''}</small>
          </div>
        </header>
        <div style="margin:12px 0 16px; padding:10px 14px; border-radius:6px; font-size:0.82rem; background:${isCodOrder ? '#FFFBEB' : '#ECFDF5'}; border:1px solid ${isCodOrder ? '#FDE68A' : '#A7F3D0'}; color:${isCodOrder ? '#92400E' : '#065F46'}; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <strong>Payment Method:</strong> ${isCodOrder ? 'Cash on Delivery (COD)' : 'Online Prepaid (Razorpay Live Secured)'}
          </div>
          <span style="font-weight:700; text-transform:uppercase; font-size:0.75rem; padding:2px 8px; border-radius:4px; background:${isPaidOrder ? '#10B981' : (isCodOrder ? '#F59E0B' : '#3B82F6')}; color:#fff;">
            ${isPaidOrder ? 'Verified & Paid' : (isCodOrder ? `Collect ₹${amountNum} on Delivery` : 'Processing')}
          </span>
        </div>
        ${(order.tracking_number || order.trackingNumber) ? `
          <div class="tracking-courier-banner" style="background:#f8f9fa; border:1px solid #e5e7eb; border-radius:8px; padding:14px 18px; margin:16px 0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; display:block; margin-bottom:3px;">Dispatched via Official Courier</span>
              <strong style="font-size:1.05rem; color:#111827;">${trackingEscape(order.courier_name || order.courier || 'Shiprocket Logistics Partner')}</strong>
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

window.printCustomerInvoice = function() {
  const order = window.currentTrackedOrder;
  if (!order) {
    alert('Please track an order before printing the tax invoice.');
    return;
  }

  const items = Array.isArray(order.items) && order.items.length ? order.items : [
    { name: 'ODD Fragrance', sku: 'ODD-PARFUM', qty: 1, price: order.amount || order.total || 899 }
  ];
  const customerName = order.customer_name || order.customer || 'Valued Customer';
  const customerPhone = order.customer_phone || order.phone || '';
  const customerEmail = order.customer_email || order.email || '';
  const customerAddress = order.shipping_address || order.address || 'Standard Delivery Address';
  const orderDate = (order.created_at || order.createdAt || order.date)
    ? formatMilestoneDate(order.created_at || order.createdAt || order.date)
    : new Date().toLocaleDateString('en-IN');
  const subtotal = Number(order.subtotal || order.amount || order.total || 899);
  const discount = Number(order.discount_amount || order.discount || 0);
  const coupon = order.coupon_code || order.coupon || '';
  const shipping = Number(order.shipping_fee || order.shipping || 0);
  const total = Number(order.total_amount || order.amount || order.total || 899);

  const rawMethod = String(order.payment_method || order.paymentMethod || order.gateway || '').toLowerCase();
  const isCod = rawMethod.includes('cod') || rawMethod.includes('cash');
  const isPaid = String(order.payment_status || order.paymentStatus).toLowerCase() === 'paid' || (!isCod && rawMethod.includes('razorpay'));
  const courier = order.courier_name || order.courier || 'Shiprocket Logistics Partner';
  const trackingNumber = order.tracking_number || order.trackingNumber || 'Pending AWB';

  const rowsHtml = items.map((it, idx) => {
    let name = it.name;
    if (!name) {
      if (it.id === 'phantom' || it.id === 'ODD-PH-001') name = 'ODD PHANTOM';
      else if (it.id === 'lucid' || it.id === 'ODD-LC-003') name = 'ODD LUCID';
      else if (it.id === 'first-move' || it.id === 'ODD-FM-002') name = 'ODD FIRST MOVE';
      else name = String(it.id || 'Fragrance');
    }
    const qty = it.quantity || it.qty || 1;
    const price = it.price || 899;
    const lineTotal = price * qty;
    return `
      <tr>
        <td style="padding:10px 12px; border-bottom:1px solid #e5e7eb; font-size:13px; text-align:center;">${idx + 1}</td>
        <td style="padding:10px 12px; border-bottom:1px solid #e5e7eb; font-size:13px;">
          <strong>${trackingEscape(name)}</strong>
          <div style="font-size:11px; color:#6b7280; font-family:monospace;">SKU: ${trackingEscape(it.sku || 'ODD-BOTTLE')}</div>
        </td>
        <td style="padding:10px 12px; border-bottom:1px solid #e5e7eb; font-size:13px; text-align:center;">${qty}</td>
        <td style="padding:10px 12px; border-bottom:1px solid #e5e7eb; font-size:13px; text-align:right;">₹${price.toLocaleString('en-IN')}</td>
        <td style="padding:10px 12px; border-bottom:1px solid #e5e7eb; font-size:13px; text-align:center; color:#6b7280;">18% (Incl.)</td>
        <td style="padding:10px 12px; border-bottom:1px solid #e5e7eb; font-size:13px; text-align:right; font-weight:600;">₹${lineTotal.toLocaleString('en-IN')}</td>
      </tr>
    `;
  }).join('');

  const printWindow = window.open('', '_blank', 'width=840,height=960');
  if (!printWindow) {
    alert('Please allow popups to view and print the tax invoice.');
    return;
  }

  const invoiceHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tax Invoice — ${trackingEscape(order.id)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #111827; background: #fff; padding: 40px; font-size: 13px; line-height: 1.5; }
    .invoice-card { max-width: 760px; margin: 0 auto; border: 1px solid #e5e7eb; padding: 32px; border-radius: 8px; }
    .header-row { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 2px solid #111827; margin-bottom: 24px; }
    .brand-title { font-size: 28px; font-weight: 900; letter-spacing: -0.03em; color: #111827; }
    .brand-dot { color: #E86B32; }
    .brand-subtitle { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; margin-top: 4px; }
    .invoice-badge-box { text-align: right; }
    .invoice-title { font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #111827; }
    .invoice-ref { font-family: monospace; font-size: 14px; font-weight: 700; color: #E86B32; margin-top: 4px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
    .meta-col h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 8px; }
    .meta-box { background: #f9fafb; border: 1px solid #f3f4f6; border-radius: 6px; padding: 12px 14px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #f9fafb; border-bottom: 2px solid #e5e7eb; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #4b5563; padding: 10px 12px; font-weight: 700; }
    .totals-wrapper { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 24px; }
    .payment-notice-box { flex: 1; border: 1px solid ${isCod ? '#f59e0b' : '#10b981'}; background: ${isCod ? '#fffbeb' : '#ecfdf5'}; border-radius: 6px; padding: 14px; }
    .payment-notice-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${isCod ? '#b45309' : '#047857'}; margin-bottom: 6px; }
    .payment-notice-desc { font-size: 12px; color: #374151; }
    .totals-table { width: 280px; }
    .totals-table td { padding: 6px 0; font-size: 13px; }
    .totals-table tr.grand-total td { font-size: 16px; font-weight: 800; border-top: 2px solid #111827; padding-top: 8px; color: #111827; }
    .shipping-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .footer-note { font-size: 11px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 16px; }
    @media print {
      body { padding: 0; }
      .invoice-card { border: none; padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="max-width:760px; margin:0 auto 16px; display:flex; justify-content:space-between; align-items:center;">
    <button onclick="window.print()" style="background:#111827; color:#fff; border:none; padding:10px 20px; font-weight:700; border-radius:6px; cursor:pointer; font-size:13px;">Print Invoice / Save as PDF</button>
    <span style="font-size:12px; color:#6b7280;">Official Tax Invoice &middot; Customer Copy</span>
  </div>
  <div class="invoice-card">
    <div class="header-row">
      <div>
        <div class="brand-title">ODD<span class="brand-dot">.</span></div>
        <div class="brand-subtitle">Haute Parfumerie &middot; Mumbai, India</div>
        <div style="font-size:11px; color:#6b7280; margin-top:4px;">GSTIN: 27AABCO0000A1Z5 &middot; Support: hello@oddperfume.com</div>
      </div>
      <div class="invoice-badge-box">
        <div class="invoice-title">Tax Invoice</div>
        <div class="invoice-ref">#INV-${trackingEscape(order.id)}</div>
        <div style="font-size:12px; color:#6b7280; margin-top:4px;">Order Date: ${trackingEscape(orderDate)}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-col">
        <h4>Billed &amp; Shipped To</h4>
        <div class="meta-box">
          <strong style="font-size:14px; color:#111827; display:block;">${trackingEscape(customerName)}</strong>
          <div style="margin-top:4px; color:#374151;">${trackingEscape(customerAddress)}</div>
          <div style="margin-top:6px; font-size:12px; color:#6b7280;">Phone: ${trackingEscape(customerPhone || '—')}</div>
          <div style="font-size:12px; color:#6b7280;">Email: ${trackingEscape(customerEmail || '—')}</div>
        </div>
      </div>
      <div class="meta-col">
        <h4>Order Overview</h4>
        <div class="meta-box">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span style="color:#6b7280;">Order Reference:</span>
            <strong>${trackingEscape(order.id)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span style="color:#6b7280;">Payment Method:</span>
            <strong>${isCod ? 'Cash on Delivery (COD)' : 'Razorpay Online'}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span style="color:#6b7280;">Payment Status:</span>
            <strong style="color:${isPaid ? '#059669' : '#d97706'};">${isPaid ? 'Paid in Full' : (isCod ? 'Collect on Delivery' : 'Pending')}</strong>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#6b7280;">Fulfillment:</span>
            <span>Dispatched from Mumbai Hub</span>
          </div>
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:40px; text-align:center;">#</th>
          <th style="text-align:left;">Item / Fragrance</th>
          <th style="width:60px; text-align:center;">Qty</th>
          <th style="width:100px; text-align:right;">Unit Price</th>
          <th style="width:90px; text-align:center;">GST</th>
          <th style="width:100px; text-align:right;">Net Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="totals-wrapper">
      <div class="payment-notice-box">
        <div class="payment-notice-title">${isCod ? 'Cash on Delivery Collection (COD)' : 'Online Payment Verified (Razorpay)'}</div>
        <div class="payment-notice-desc">
          ${isCod
            ? `<strong>Collect ₹${total.toLocaleString('en-IN')}</strong> in cash upon delivery. Please hand over package only after receiving cash payment.`
            : `Payment received in full via <strong>Razorpay Live Secured Gateway</strong>. Reference: <code>${trackingEscape(order.razorpay_payment_id || order.paymentId || 'pay_verified')}</code>. No cash to be collected.`
          }
        </div>
      </div>
      <table class="totals-table">
        <tr>
          <td style="color:#6b7280;">Items Subtotal</td>
          <td style="text-align:right; font-weight:600;">₹${subtotal.toLocaleString('en-IN')}</td>
        </tr>
        ${discount > 0 ? `
        <tr>
          <td style="color:#E86B32;">Coupon Discount ${coupon ? '(' + trackingEscape(coupon) + ')' : ''}</td>
          <td style="text-align:right; font-weight:600; color:#E86B32;">-₹${discount.toLocaleString('en-IN')}</td>
        </tr>` : ''}
        <tr>
          <td style="color:#6b7280;">Shipping &amp; Handling</td>
          <td style="text-align:right; font-weight:600;">${shipping > 0 ? '₹' + shipping.toLocaleString('en-IN') : 'FREE'}</td>
        </tr>
        <tr class="grand-total">
          <td>Total Amount</td>
          <td style="text-align:right;">₹${total.toLocaleString('en-IN')}</td>
        </tr>
      </table>
    </div>

    ${trackingNumber && trackingNumber !== 'Pending AWB' ? `
    <div class="shipping-box">
      <div>
        <span style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#6b7280; display:block;">Logistics Partner</span>
        <strong style="font-size:14px; color:#111827;">${trackingEscape(courier)}</strong>
      </div>
      <div style="text-align:right;">
        <span style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#6b7280; display:block;">AWB Tracking Reference</span>
        <span style="font-family:monospace; font-weight:700; font-size:14px; color:#111827;">${trackingEscape(trackingNumber)}</span>
      </div>
    </div>` : ''}

    <div class="footer-note">
      Thank you for your order with ODD Perfume. For returns or customer care, visit <a href="https://test.oddperfume.com" style="color:#111827; text-decoration:none;">oddperfume.com</a> or write to hello@oddperfume.com.
    </div>
  </div>
</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(invoiceHtml);
  printWindow.document.close();
};

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('order') || params.get('orderId');
  if (orderId) {
    const input = document.getElementById('tracking-order-id');
    if (input) input.value = orderId;
    submitOrderTracking();
  }
});
