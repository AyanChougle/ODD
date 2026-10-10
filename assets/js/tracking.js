'use strict';
function trackingMoney(value) { return `₹${Number(value || 0).toLocaleString('en-IN')}`; }
function trackingEscape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function statusClass(status) { return status === 'Delivered' ? 'delivered' : status === 'Dispatched' ? 'transit' : status === 'Cancelled' ? 'cancelled' : 'pending'; }
async function submitOrderTracking(event) {
  event?.preventDefault();
  const id = document.getElementById('tracking-order-id')?.value.trim().toUpperCase();
  const phone = document.getElementById('tracking-phone')?.value.trim();
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const message = document.getElementById('tracking-message'); const resultBox = document.getElementById('tracking-result');
  if (message) { message.textContent = 'Checking the order record…'; message.className = 'tracking-message'; }
  if (resultBox) { resultBox.hidden = true; resultBox.innerHTML = ''; }
  try {
    const params = new URLSearchParams({ order: id || '', ...(token ? {token} : phone ? {phone} : {}) });
    if (!token && !phone) throw new Error('Enter the mobile number used at checkout, or open the secure tracking link from your confirmation.');
    const response = await fetch(`/api/orders/track?${params.toString()}`, { cache:'no-store', credentials:'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not find that order.');
    if (message) { message.textContent = ''; message.className = 'tracking-message'; }
    const status = trackingEscape(data.status || 'Confirmed');
    const items = (data.items || []).map(item => `<div class="tracking-item"><div><strong>${trackingEscape(item.name)}</strong><span>Quantity ${Number(item.qty)||1}</span></div><strong>${trackingMoney(Number(item.price) * Number(item.qty))}</strong></div>`).join('');
    const progress = ['Confirmed','Processing','Packed','Dispatched','Delivered'];
    const currentIndex = progress.indexOf(data.status);
    const timeline = data.status === 'Cancelled'
      ? '<li class="is-current is-cancelled"><strong>Order cancelled</strong><span>This order has been cancelled.</span></li>'
      : progress.map((step, index) => `<li class="${index <= currentIndex ? 'is-complete' : ''} ${index === currentIndex ? 'is-current' : ''}"><strong>${step}</strong><span>${index < currentIndex ? 'Completed' : index === currentIndex ? 'Current status' : 'Pending'}</span></li>`).join('');
    if (resultBox) {
      resultBox.innerHTML = `<header class="tracking-order-header"><div><span class="tracking-eyebrow">ORDER REFERENCE</span><h2>${trackingEscape(data.id)}</h2><span class="tracking-status ${statusClass(data.status)}">${status}</span></div><div class="tracking-order-total"><span>Order total</span><strong>${trackingMoney(data.amount)}</strong><small>${data.date ? new Date(data.date).toLocaleString('en-IN', {dateStyle:'medium',timeStyle:'short'}) : ''}</small></div></header><section class="tracking-order-items"><h3>Items in your order</h3>${items || '<p>No item details are available.</p>'}</section><section class="tracking-timeline"><h3>Delivery progress</h3><ol>${timeline}</ol></section>`;
      resultBox.hidden = false;
    }
  } catch (error) {
    if (message) { message.textContent = error.message; message.className = 'tracking-message is-error'; }
  }
}
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('order')) { const input = document.getElementById('tracking-order-id'); if(input) input.value = params.get('order'); submitOrderTracking(); }
});
