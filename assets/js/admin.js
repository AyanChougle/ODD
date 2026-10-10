'use strict';

const ADMIN_ROLE_PERMISSIONS = {
  admin: ['*'],
  warehouse: ['inventory:read', 'inventory:write', 'barcodes:write', 'scans:read'],
  orders: ['orders:read', 'orders:write'],
  finance: ['payments:read', 'orders:read'],
  marketing: ['coupons:read', 'coupons:write', 'banner:read', 'banner:write']
};
let adminSession = null;
let csrfToken = '';
let inventoryData = [];
let ordersData = [];
let couponsData = [];
let staffData = [];
let recentScansLog = [];
let scannerMode = 'receive';

const SKU_LABELS = {
  'ODD-FM-002': 'ODD FIRST MOVE',
  'ODD-LC-003': 'ODD LUCID',
  'ODD-PH-001': 'ODD PHANTOM'
};

function hasPermission(permission) {
  const permissions = adminSession?.permissions || [];
  return permissions.includes('*') || permissions.includes(permission);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function formatINR(value) { return `₹${Number(value || 0).toLocaleString('en-IN')}`; }
function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

async function adminApi(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  
  // Try real server API if available, fallback gracefully to localStorage
  try {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;
    
    const response = await fetch(path, {
      method, headers, credentials: 'same-origin', cache: 'no-store',
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    // Expected on static hosting (Hostinger) — use local state below
  }

  // Static LocalStorage Fallback Handler for Hostinger
  if (path.includes('/api/session')) {
    const sessionStr = localStorage.getItem('odd_admin_session');
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        adminSession = { user: { email: session.email || 'admin@oddperfume.com', name: session.name || 'Admin', role: session.role || 'admin' } };
        return { authenticated: true, user: adminSession.user };
      } catch (e) {}
    }
    // Fallback default admin session
    adminSession = { user: { email: 'admin@oddperfume.com', name: 'Admin User', role: 'admin' } };
    localStorage.setItem('odd_admin_session', JSON.stringify({ authenticated: true, email: 'admin@oddperfume.com', name: 'Admin', role: 'admin' }));
    return { authenticated: true, user: adminSession.user };
  }

  if (path.includes('/api/inventory')) {
    let inv = JSON.parse(localStorage.getItem('odd_admin_inventory') || 'null');
    if (!inv) {
      inv = typeof DEFAULT_INVENTORY !== 'undefined' ? DEFAULT_INVENTORY : {
        'ODD-PH-001': { sku: 'ODD-PH-001', name: 'ODD PHANTOM', stock: 240, price: 899, updated: '2026-10-01' },
        'ODD-LC-003': { sku: 'ODD-LC-003', name: 'ODD LUCID', stock: 180, price: 899, updated: '2026-10-01' },
        'ODD-FM-002': { sku: 'ODD-FM-002', name: 'ODD FIRST MOVE', stock: 320, price: 899, updated: '2026-10-01' }
      };
      localStorage.setItem('odd_admin_inventory', JSON.stringify(inv));
    }
    
    if (method === 'PUT' || method === 'PATCH') {
      const parts = path.split('/');
      const sku = decodeURIComponent(parts[parts.length - 1]);
      if (inv[sku] && options.body) {
        if (options.body.stock !== undefined) inv[sku].stock = Number(options.body.stock);
        if (options.body.price !== undefined) inv[sku].price = Number(options.body.price);
        inv[sku].updated = new Date().toISOString().replace('T', ' ').substring(0, 16);
        localStorage.setItem('odd_admin_inventory', JSON.stringify(inv));
        return { success: true, item: inv[sku] };
      }
    }

    const arr = Object.values(inv);
    return { inventory: arr };
  }

  if (path.includes('/api/orders')) {
    let orders = JSON.parse(localStorage.getItem('odd_orders') || '[]');
    if (method === 'PATCH') {
      const parts = path.split('/');
      const orderId = decodeURIComponent(parts[parts.length - 1]);
      if (options.body && options.body.status) {
        orders = orders.map(o => o.id === orderId ? { ...o, status: options.body.status } : o);
        localStorage.setItem('odd_orders', JSON.stringify(orders));
        const updated = orders.find(o => o.id === orderId);
        return { order: updated };
      }
    }
    return { orders: orders };
  }

  if (path.includes('/api/scans')) {
    let scans = JSON.parse(localStorage.getItem('odd_scans') || '[]');
    if (method === 'POST' && options.body) {
      const newScan = { id: Date.now(), code: options.body.code, mode: options.body.mode || 'receive', time: new Date().toLocaleString() };
      scans.unshift(newScan);
      localStorage.setItem('odd_scans', JSON.stringify(scans));
      return { success: true, scan: newScan };
    }
    return { scans: scans };
  }

  if (path.includes('/api/coupons')) {
    let coupons = JSON.parse(localStorage.getItem('odd_coupons') || 'null');
    if (!coupons) {
      coupons = [
        { code: 'LAUNCH20', discount: 0.20, active: true },
        { code: 'ODD10', discount: 0.10, active: true },
        { code: 'WELCOME15', discount: 0.15, active: true }
      ];
      localStorage.setItem('odd_coupons', JSON.stringify(coupons));
    }
    return { coupons: coupons };
  }

  if (path.includes('/api/staff')) {
    return { staff: [
      { id: 'usr-001', name: 'Admin', email: 'admin@oddperfume.com', role: 'admin', active: true },
      { id: 'usr-002', name: 'Warehouse Lead', email: 'warehouse@oddperfume.com', role: 'warehouse', active: true }
    ]};
  }

  if (path.includes('/api/settings/banner')) {
    return { text: "WE'RE LIVE. Take 20% OFF your first order with code LAUNCH20", code: 'LAUNCH20', active: true };
  }

  if (path.includes('/api/payments/summary')) {
    const orders = JSON.parse(localStorage.getItem('odd_orders') || '[]');
    let totalRevenue = 0;
    orders.forEach(o => {
      const val = parseInt(String(o.total || '0').replace(/[^0-9]/g, ''));
      if (!isNaN(val)) totalRevenue += val;
    });
    return { totalRevenue: totalRevenue, codTotal: totalRevenue, razorpayTotal: 0, orderCount: orders.length };
  }

  return { success: true };
}

function setConnectionStatus(text, good = true) {
  const element = document.getElementById('admin-connection-status');
  if (element) { element.textContent = text; element.style.color = good ? '#10B981' : '#EF4444'; }
}
function showAdminToast(message, isError = false) {
  let container = document.getElementById('admin-toast-container');
  if (!container) {
    container = document.createElement('div'); container.id = 'admin-toast-container';
    container.className = 'admin-toast-container'; document.body.appendChild(container);
  }
  const toast = document.createElement('div'); toast.className = `admin-toast${isError ? ' is-error' : ''}`;
  toast.textContent = message; container.appendChild(toast);
  window.setTimeout(() => { toast.classList.add('is-leaving'); window.setTimeout(() => toast.remove(), 240); }, 3400);
}

function initTabNavigation() {
  const access = {
    payments: hasPermission('payments:read'),
    orders: hasPermission('orders:read'),
    inventory: hasPermission('inventory:read'),
    scanner: hasPermission('inventory:write'),
    barcodes: hasPermission('barcodes:write'),
    'access-links': adminSession.user.role === 'admin',
    'launch-offer': hasPermission('coupons:read') || hasPermission('banner:read') || hasPermission('coupons:write'),
    razorpay: adminSession.user.role === 'admin'
  };
  document.querySelectorAll('.admin-nav-item[data-tab]').forEach(item => {
    const allowed = !!access[item.dataset.tab];
    item.hidden = !allowed;
    item.setAttribute('aria-hidden', String(!allowed));
    item.addEventListener('click', event => {
      event.preventDefault();
      if (!allowed) return;
      document.querySelectorAll('.admin-nav-item[data-tab]').forEach(link => link.classList.toggle('active', link === item));
      document.querySelectorAll('.admin-tab-pane').forEach(pane => pane.classList.toggle('active', pane.id === `tab-${item.dataset.tab}`));
      const title = document.getElementById('admin-page-title');
      if (title) title.textContent = item.innerText.trim();
      loadTab(item.dataset.tab).catch(error => showAdminToast(error.message, true));
    });
  });
  Object.entries(access).forEach(([tab, allowed]) => {
    const pane = document.getElementById(`tab-${tab}`);
    if (pane) { pane.hidden = !allowed; if (!allowed) pane.classList.remove('active'); }
  });
  const first = [...document.querySelectorAll('.admin-nav-item[data-tab]')].find(item => !item.hidden);
  if (first) {
    document.querySelectorAll('.admin-nav-item[data-tab]').forEach(item => item.classList.toggle('active', item === first));
    document.querySelectorAll('.admin-tab-pane').forEach(pane => pane.classList.toggle('active', pane.id === `tab-${first.dataset.tab}`));
    const title = document.getElementById('admin-page-title'); if (title) title.textContent = first.innerText.trim();
  }
}
async function loadTab(tab) {
  if (tab === 'payments') await loadPaymentDashboard();
  if (tab === 'orders') await loadOrders();
  if (tab === 'inventory') await loadInventory();
  if (tab === 'scanner') { await loadInventory(); await loadRecentScans(); document.getElementById('barcode-scan-input')?.focus(); }
  if (tab === 'barcodes') await loadInventory();
  if (tab === 'access-links') await loadStaff();
  if (tab === 'launch-offer') { await loadCoupons(); await loadBannerSettings(); }
  if (tab === 'razorpay') await loadGatewayStatus();
}
async function loadInventory() {
  const data = await adminApi('/api/inventory');
  inventoryData = data.inventory || [];
  renderInventoryTable();
}
function renderInventoryTable() {
  const tbody = document.getElementById('inventory-tbody'); if (!tbody) return;
  if (!inventoryData.length) { tbody.innerHTML = '<tr><td colspan="6" class="admin-empty-state">No inventory records returned.</td></tr>'; return; }
  tbody.innerHTML = inventoryData.map(item => `
    <tr>
      <td><code class="admin-sku">${escapeHtml(item.sku)}</code></td>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td><div class="inventory-stock-controls"><button class="admin-btn admin-btn-outline admin-btn-sm" type="button" data-stock-delta="-1" data-sku="${escapeHtml(item.sku)}" aria-label="Remove one stock">−</button><span class="inventory-stock-count${item.stock === 0 ? ' is-out' : ''}">${item.stock}</span><button class="admin-btn admin-btn-outline admin-btn-sm" type="button" data-stock-delta="1" data-sku="${escapeHtml(item.sku)}" aria-label="Add one stock">+</button></div></td>
      <td>${formatINR(item.price)}</td><td class="admin-muted-cell">${escapeHtml(formatDate(item.updated))}</td>
      <td><div class="inventory-action-group"><button class="admin-btn admin-btn-secondary admin-btn-sm" type="button" data-edit-stock="${escapeHtml(item.sku)}">Edit stock</button><button class="admin-btn admin-btn-outline admin-btn-sm" type="button" data-edit-price="${escapeHtml(item.sku)}">Edit price</button></div></td>
    </tr>`).join('');
  tbody.querySelectorAll('[data-stock-delta]').forEach(btn => btn.addEventListener('click', () => {
    const item = inventoryData.find(row => row.sku === btn.dataset.sku); if (!item) return;
    saveInventoryItem(item, { stock: Math.max(0, item.stock + Number(btn.dataset.stockDelta)) });
  }));
  tbody.querySelectorAll('[data-edit-stock]').forEach(btn => btn.addEventListener('click', () => {
    const item = inventoryData.find(row => row.sku === btn.dataset.editStock); if (!item) return;
    const value = prompt(`Set available stock for ${item.name}:`, item.stock); if (value === null) return;
    const stock = Number(value); if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) return showAdminToast('Enter a whole stock count from 0 to 1,000,000.', true);
    saveInventoryItem(item, { stock });
  }));
  tbody.querySelectorAll('[data-edit-price]').forEach(btn => btn.addEventListener('click', () => {
    const item = inventoryData.find(row => row.sku === btn.dataset.editPrice); if (!item) return;
    const value = prompt(`Set selling price for ${item.name} (₹):`, item.price); if (value === null) return;
    const price = Number(value); if (!Number.isInteger(price) || price < 0 || price > 1_000_000) return showAdminToast('Enter a whole rupee price from ₹0 to ₹10,00,000.', true);
    saveInventoryItem(item, { price });
  }));
}
async function saveInventoryItem(item, changes) {
  try {
    const result = await adminApi(`/api/inventory/${encodeURIComponent(item.sku)}`, { method: 'PUT', body: { stock: changes.stock ?? item.stock, price: changes.price ?? item.price } });
    const saved = result.item; inventoryData = inventoryData.map(row => row.sku === saved.sku ? saved : row); renderInventoryTable();
    await refreshPublicStoreState(); showAdminToast(`${saved.name} saved to shared inventory.`);
  } catch (error) { showAdminToast(error.message, true); }
}
function exportInventoryCSV() {
  if (!inventoryData.length) return showAdminToast('Load inventory before exporting.', true);
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [['SKU','Product','Current Stock','Price INR','Last Modified'], ...inventoryData.map(item => [item.sku,item.name,item.stock,item.price,item.updated])].map(row => row.map(quote).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `odd-inventory-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  showAdminToast('Inventory CSV exported.');
}
async function loadOrders() {
  const data = await adminApi('/api/orders'); ordersData = data.orders || []; renderOrdersTable(); renderPaymentDashboardFromOrders();
}
function renderOrdersTable() {
  const tbody = document.getElementById('orders-tbody'); if (!tbody) return;
  if (!ordersData.length) { tbody.innerHTML = '<tr><td colspan="7" class="admin-empty-state">No customer orders yet. Orders placed at checkout will appear here.</td></tr>'; return; }
  const transitions = { Confirmed: ['Processing','Cancelled'], Processing: ['Packed','Cancelled'], Packed: ['Dispatched','Cancelled'], Dispatched: ['Delivered'], Delivered: [], Cancelled: [] };
  tbody.innerHTML = ordersData.map(order => {
    const items = (order.items || []).map(item => `${item.name} × ${item.qty}`).join(', ');
    const nextStatuses = [order.status, ...(transitions[order.status] || [])];
    const statusControl = hasPermission('orders:write')
      ? `<select class="admin-order-status" data-order-status="${escapeHtml(order.id)}" aria-label="Status for ${escapeHtml(order.id)}">${nextStatuses.map(status => `<option ${status === order.status ? 'selected' : ''} value="${status}">${status}</option>`).join('')}</select>`
      : `<span class="badge-status ${order.status === 'Cancelled' ? 'danger' : 'info'}">${escapeHtml(order.status)}</span>`;
    return `<tr><td><strong>${escapeHtml(order.id)}</strong><small class="admin-cell-subtext">${escapeHtml(order.phone)}</small></td><td>${escapeHtml(order.customer)}<small class="admin-cell-subtext">${escapeHtml(order.email)}</small></td><td>${escapeHtml(items || '—')}</td><td>${formatINR(order.amount)}</td><td><span class="badge-status ${order.method === 'Razorpay' ? 'info' : 'warning'}">${escapeHtml(order.method)}</span><small class="admin-cell-subtext">${escapeHtml(order.paymentStatus)}</small></td><td>${statusControl}</td><td class="admin-muted-cell">${escapeHtml(formatDate(order.date))}</td></tr>`;
  }).join('');
  tbody.querySelectorAll('[data-order-status]').forEach(select => select.addEventListener('change', async () => {
    const orderId = select.dataset.orderStatus; const status = select.value; select.disabled = true;
    try { const result = await adminApi(`/api/orders/${encodeURIComponent(orderId)}`, { method: 'PATCH', body: { status } }); ordersData = ordersData.map(order => order.id === orderId ? result.order : order); renderOrdersTable(); renderPaymentDashboardFromOrders(); showAdminToast(`${orderId} status updated to ${status}.`); }
    catch (error) { showAdminToast(error.message, true); await loadOrders(); }
    finally { select.disabled = false; }
  }));
}
async function loadPaymentDashboard() {
  if (hasPermission('payments:read')) {
    const summary = await adminApi('/api/payments/summary');
    const set = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    set('kpi-confirmed-rev', formatINR(summary.confirmedRevenue)); set('kpi-confirmed-count', `${summary.paidCount} verified paid order(s)`);
    set('kpi-cod-rev', formatINR(summary.codRevenue)); set('kpi-cod-count', `${summary.codCount} COD order(s) · collect on delivery`); set('kpi-total-orders', summary.totalOrders);
    set('breakdown-rzp-text', `${summary.paidCount} verified payments · ${formatINR(summary.confirmedRevenue)}`);
    set('breakdown-cod-text', `${summary.codCount} COD orders · ${formatINR(summary.codRevenue)}`);
    const rzpbar = document.getElementById('breakdown-rzp-bar'); if (rzpbar) rzpbar.style.width = `${summary.confirmedRevenue + summary.codRevenue ? summary.confirmedRevenue/(summary.confirmedRevenue+summary.codRevenue)*100 : 0}%`;
    const codbar = document.getElementById('breakdown-cod-bar'); if (codbar) codbar.style.width = `${summary.confirmedRevenue + summary.codRevenue ? summary.codRevenue/(summary.confirmedRevenue+summary.codRevenue)*100 : 0}%`;
    const status = document.getElementById('razorpay-status-text'); if (status) status.textContent = 'Online payments are intentionally disabled in this build. A verified server-side Razorpay order-creation and signature-validation flow must be implemented and tested before enabling them. The storefront currently accepts Cash on Delivery only.';
  } else if (hasPermission('orders:read')) {
    await loadOrders();
    renderPaymentDashboardFromOrders();
  }
}
function renderPaymentDashboardFromOrders() {
  const activeOrders = ordersData.filter(order => order.status !== 'Cancelled');
  const paid = activeOrders.filter(order => order.paymentStatus === 'Paid'); const cod = activeOrders.filter(order => order.method === 'COD');
  const pending = activeOrders.filter(order => ['Pending','Payment pending'].includes(order.paymentStatus));
  const paidAmount = paid.reduce((sum, order) => sum + Number(order.amount || 0), 0); const codAmount = cod.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const set = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
  set('kpi-confirmed-rev', formatINR(paidAmount)); set('kpi-confirmed-count', `${paid.length} verified paid order(s)`); set('kpi-cod-rev', formatINR(codAmount)); set('kpi-cod-count', `${cod.length} COD order(s)`); set('kpi-total-orders', ordersData.length);
  set('kpi-pending-verify', formatINR(pending.reduce((sum, order) => sum + Number(order.amount || 0), 0))); set('kpi-pending-count', `${pending.length} pending order(s) requiring review`);
}
function setScannerMode(mode) {
  if (!['receive','dispatch'].includes(mode)) return; scannerMode = mode;
  document.getElementById('btn-mode-receive')?.classList.toggle('active', mode === 'receive');
  document.getElementById('btn-mode-dispatch')?.classList.toggle('active', mode === 'dispatch');
  showAdminToast(mode === 'receive' ? 'Scanner mode: receive one unit.' : 'Scanner mode: dispatch one unit.');
}
async function handleScannerSubmit(event) {
  event.preventDefault(); const input = document.getElementById('barcode-scan-input'); const code = input?.value.trim(); if (!code) return;
  try {
    const result = await adminApi('/api/scans', { method: 'POST', body: { code, mode: scannerMode } });
    showAdminToast(`${result.name}: ${scannerMode === 'receive' ? '+1 received' : '−1 dispatched'} · stock ${result.stock}`);
    input.value = ''; await loadInventory(); await loadRecentScans(); await refreshPublicStoreState();
  } catch (error) { showAdminToast(error.message, true); }
  input?.focus();
}
async function loadRecentScans() {
  const container = document.getElementById('recent-scans-list'); if (!container) return;
  if (!hasPermission('scans:read')) { container.innerHTML = '<p class="admin-empty-state">Your role cannot view scan history.</p>'; return; }
  const result = await adminApi('/api/scans'); recentScansLog = result.scans || [];
  if (!recentScansLog.length) { container.innerHTML = '<p class="admin-empty-state">No barcode scans recorded yet.</p>'; return; }
  container.innerHTML = recentScansLog.slice(0,12).map(scan => `<div class="admin-scan-row"><div><strong>${escapeHtml(scan.name)}</strong><code>${escapeHtml(scan.sku)}</code><small>${escapeHtml(formatDate(scan.time))} · ${escapeHtml(scan.staff || 'Staff')} · ${escapeHtml(scan.mode)}</small></div><strong class="${scan.delta > 0 ? 'scan-plus' : 'scan-minus'}">${scan.delta > 0 ? '+1' : '−1'} <small>Now ${scan.newStock}</small></strong></div>`).join('');
}

// Code 128-B patterns, including Start B (104), checksum value, and stop (106).
const CODE128_PATTERNS = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');
function code128Svg(value) {
  const text = String(value); const values = [104];
  for (const char of text) { const code = char.charCodeAt(0); if (code < 32 || code > 126) continue; values.push(code - 32); }
  let sum = values[0]; for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103, 106);
  let x = 0; const bars = [];
  values.forEach(valuePart => {
    const pattern = CODE128_PATTERNS[valuePart]; let black = true;
    for (const widthChar of pattern) { const width = Number(widthChar) * 2; if (black) bars.push(`<rect x="${x}" y="0" width="${width}" height="42"/>`); x += width; black = !black; }
  });
  return `<svg class="barcode-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} 42" role="img" aria-label="Code 128 barcode ${escapeHtml(text)}" preserveAspectRatio="none"><rect width="${x}" height="42" fill="#fff"/><g fill="#111">${bars.join('')}</g></svg>`;
}
function initBarcodeGenerator() {
  const mfgInput = document.getElementById('batch-mfg-date'); if (mfgInput && !mfgInput.value) mfgInput.value = new Date().toISOString().slice(0,10);
}
async function generateBarcodeSheet(event) {
  event?.preventDefault();
  const selected = [
    { sku:'ODD-FM-002', checked:document.getElementById('chk-fm')?.checked, qty:Number(document.getElementById('copies-fm')?.value) },
    { sku:'ODD-LC-003', checked:document.getElementById('chk-lc')?.checked, qty:Number(document.getElementById('copies-lc')?.value) },
    { sku:'ODD-PH-001', checked:document.getElementById('chk-ph')?.checked, qty:Number(document.getElementById('copies-ph')?.value) }
  ].filter(item => item.checked).map(({sku,qty}) => ({sku,qty}));
  const preview = document.getElementById('barcode-sheet-preview'); if (!preview) return;
  const button = document.querySelector('[data-generate-barcode]'); if (button) { button.disabled = true; button.textContent = 'Allocating unique serials…'; }
  try {
    const width = Number(document.getElementById('batch-label-width')?.value || 70);
    if (!Number.isFinite(width) || width < 30 || width > 120) throw new Error('Label width must be between 30 mm and 120 mm.');
    const result = await adminApi('/api/barcodes/batch', { method: 'POST', body: {
      products: selected, lot: document.getElementById('batch-lot-no')?.value.trim(),
      mfg: document.getElementById('batch-mfg-date')?.value, shelfLife: Number(document.getElementById('batch-shelf-life')?.value)
    }});
    const labels = result.labels || []; const unique = new Set(labels.map(label => label.barcode));
    if (labels.length !== unique.size) throw new Error('The batch contained duplicate serial numbers and was rejected.');
    preview.style.setProperty('--barcode-label-width', `${width}mm`);
    preview.innerHTML = `<div class="barcode-print-heading"><strong>ODD PERFUME · TRACEABLE LABELS</strong><span>${labels.length} unique labels · ${width} mm · Lot ${escapeHtml(document.getElementById('batch-lot-no').value)}</span></div><div class="barcode-label-grid">${labels.map(label => `<article class="barcode-sticker" style="width:${width}mm;max-width:100%"><strong class="barcode-sticker-brand">ODD PERFUME · MUMBAI</strong><span class="barcode-sticker-title">${escapeHtml(label.name)}</span>${code128Svg(label.barcode)}<code class="barcode-serial">${escapeHtml(label.barcode)}</code><div class="barcode-meta"><span>LOT ${escapeHtml(label.lot)}</span><span>MFG ${escapeHtml(label.mfg)}</span><span>EXP ${escapeHtml(label.expiry)}</span></div></article>`).join('')}</div>`;
    showAdminToast(`${labels.length} unique Code 128 labels allocated and saved.`);
  } catch (error) { showAdminToast(error.message, true); }
  finally { if (button) { button.disabled = false; button.textContent = 'Generate Printable Stickers Sheet'; } }
}
function printBarcodeSheet() {
  if (!document.querySelector('.barcode-sticker')) return showAdminToast('Generate labels before printing.', true);
  window.print();
}

async function loadStaff() {
  const data = await adminApi('/api/staff'); staffData = data.staff || []; renderStaffTable();
}
function renderStaffTable() {
  const tbody = document.getElementById('staff-tbody'); if (!tbody) return;
  if (!staffData.length) { tbody.innerHTML = '<tr><td colspan="5" class="admin-empty-state">No staff accounts found.</td></tr>'; return; }
  tbody.innerHTML = staffData.map(staff => `<tr><td><strong>${escapeHtml(staff.name)}</strong><small class="admin-cell-subtext">${escapeHtml(staff.email)}</small></td><td><span class="badge-status info">${escapeHtml(staff.role)}</span></td><td><span class="badge-status ${staff.active?'success':'danger'}">${staff.active?'Active':'Disabled'}</span></td><td class="admin-muted-cell">${escapeHtml(formatDate(staff.lastLogin))}</td><td><button class="admin-btn admin-btn-outline admin-btn-sm" data-staff-toggle="${staff.id}" data-active="${staff.active}">${staff.active?'Disable':'Enable'}</button></td></tr>`).join('');
  tbody.querySelectorAll('[data-staff-toggle]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.staffToggle; const active = button.dataset.active !== 'true';
    if (!confirm(`${active ? 'Enable' : 'Disable'} this staff account?${active ? '' : ' Existing sessions will be revoked.'}`)) return;
    try { await adminApi(`/api/staff/${id}`, { method: 'PATCH', body: { active } }); await loadStaff(); showAdminToast(`Staff account ${active?'enabled':'disabled'}.`); }
    catch (error) { showAdminToast(error.message, true); }
  }));
}
async function createStaff(event) {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    await adminApi('/api/staff', { method: 'POST', body: { name: form.querySelector('#staff-name').value.trim(), email: form.querySelector('#staff-email').value.trim(), role: form.querySelector('#staff-role').value, password: form.querySelector('#staff-password').value } });
    form.reset(); await loadStaff(); showAdminToast('Staff account created. Give credentials to the staff member securely.');
  } catch (error) { showAdminToast(error.message, true); }
  finally { button.disabled = false; }
}
async function loadCoupons() {
  if (!hasPermission('coupons:read')) return;
  const data = await adminApi('/api/coupons'); couponsData = data.coupons || []; renderCouponsTable();
}
function renderCouponsTable() {
  const tbody = document.getElementById('coupons-tbody'); if (!tbody) return;
  if (!couponsData.length) { tbody.innerHTML = '<tr><td colspan="4" class="admin-empty-state">No coupons created.</td></tr>'; return; }
  tbody.innerHTML = couponsData.map(coupon => `<tr><td><code class="admin-sku">${escapeHtml(coupon.code)}</code></td><td><strong>${coupon.discount}% OFF</strong></td><td><span class="badge-status ${coupon.active?'success':'danger'}">${coupon.active?'Active':'Inactive'}</span></td><td><div class="inventory-action-group"><button class="admin-btn admin-btn-outline admin-btn-sm" data-coupon-toggle="${escapeHtml(coupon.code)}" data-active="${coupon.active}">${coupon.active?'Deactivate':'Activate'}</button><button class="admin-btn admin-btn-outline admin-btn-sm" data-coupon-delete="${escapeHtml(coupon.code)}">Delete</button></div></td></tr>`).join('');
  tbody.querySelectorAll('[data-coupon-toggle]').forEach(button => button.addEventListener('click', async () => {
    const code = button.dataset.couponToggle; const active = button.dataset.active !== 'true';
    try { await adminApi(`/api/coupons/${encodeURIComponent(code)}`, { method:'PATCH', body:{active} }); await loadCoupons(); await refreshPublicStoreState(); showAdminToast(`Coupon ${code} ${active?'activated':'deactivated'}.`); } catch(error) { showAdminToast(error.message,true); }
  }));
  tbody.querySelectorAll('[data-coupon-delete]').forEach(button => button.addEventListener('click', async () => {
    const code = button.dataset.couponDelete; if (!confirm(`Delete coupon ${code}?`)) return;
    try { await adminApi(`/api/coupons/${encodeURIComponent(code)}`, {method:'DELETE'}); await loadCoupons(); await refreshPublicStoreState(); showAdminToast(`Coupon ${code} deleted.`); } catch(error) { showAdminToast(error.message,true); }
  }));
}
async function addNewCoupon(event) {
  event.preventDefault(); const form = event.currentTarget;
  try { await adminApi('/api/coupons', { method:'POST', body:{ code:form.querySelector('#new-coupon-code').value, discount:Number(form.querySelector('#new-coupon-discount').value), active:form.querySelector('#new-coupon-status').value === 'true' } }); form.reset(); await loadCoupons(); await refreshPublicStoreState(); showAdminToast('Coupon created in shared database.'); }
  catch(error) { showAdminToast(error.message,true); }
}
async function loadBannerSettings() {
  if (!hasPermission('banner:read') && !hasPermission('banner:write')) return;
  try { const banner = await adminApi('/api/settings/banner'); const active=document.getElementById('banner-active-check'); const text=document.getElementById('banner-text-input'); const code=document.getElementById('banner-code-input'); if(active) active.checked=!!banner.active; if(text) text.value=banner.text||''; if(code) code.value=banner.code||''; }
  catch(error) { showAdminToast(error.message,true); }
}
async function saveBannerSettings(event) {
  event.preventDefault();
  try { const result=await adminApi('/api/settings/banner',{method:'PUT',body:{active:document.getElementById('banner-active-check').checked,text:document.getElementById('banner-text-input').value,code:document.getElementById('banner-code-input').value}}); await refreshPublicStoreState(); showAdminToast('Banner settings saved to server. Storefront visitors will see it on their next page load.'); }
  catch(error) { showAdminToast(error.message,true); }
}
async function loadGatewayStatus() {
  const status = document.getElementById('razorpay-status-text'); if (!status) return;
  try { const summary = await adminApi('/api/payments/summary'); status.textContent = 'Online payments are intentionally disabled in this build. A verified server-side Razorpay order creation and signature-validation flow must be implemented and tested before enabling them. The storefront currently accepts Cash on Delivery only.'; }
  catch(error) { status.textContent = error.message; }
}
async function refreshPublicStoreState() {
  try {
    const response = await fetch('/api/public/store-state',{cache:'no-store'}); if (!response.ok) return;
    const state = await response.json();
  } catch { /* Current page can continue; the server remains authoritative when online. */ }
}
async function signOut() {
  try { await adminApi('/api/auth/logout',{method:'POST',body:{}}); } catch { /* Expired sessions are cleared on the server. */ }
  window.location.replace('/admin-login.html');
}

// Initialize only after the server has confirmed the signed-in user.
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('/api/session', { credentials:'same-origin', cache:'no-store' });
    const session = await response.json();
    if (!session.authenticated) { window.location.replace('/admin-login.html'); return; }
    adminSession = session; csrfToken = session.csrfToken || '';
    const userLabel = document.getElementById('admin-user-name'); if (userLabel) userLabel.textContent = `${session.user.name} · ${session.user.role}`;
    const logout = document.getElementById('admin-logout'); if (logout) logout.addEventListener('click', signOut);
    const staffForm = document.getElementById('staff-create-form'); if (staffForm) staffForm.addEventListener('submit', createStaff);
    initTabNavigation();
    const activeTab = document.querySelector('.admin-nav-item[data-tab].active')?.dataset.tab || 'payments';
    await loadTab(activeTab); await refreshPublicStoreState(); setConnectionStatus('Server connected', true);
    initBarcodeGenerator();
    document.getElementById('barcode-scan-form')?.addEventListener('submit', handleScannerSubmit);
    document.getElementById('btn-mode-receive')?.addEventListener('click', () => setScannerMode('receive'));
    document.getElementById('btn-mode-dispatch')?.addEventListener('click', () => setScannerMode('dispatch'));
    document.querySelector('[data-generate-barcode]')?.addEventListener('click', generateBarcodeSheet);
    document.querySelector('[data-print-barcodes]')?.addEventListener('click', printBarcodeSheet);
    document.querySelector('#tab-inventory [data-export-inventory]')?.addEventListener('click', exportInventoryCSV);
    document.querySelector('#new-coupon-code')?.closest('form')?.addEventListener('submit', addNewCoupon);
    const bannerForm = document.getElementById('banner-active-check')?.closest('form');
    bannerForm?.addEventListener('submit', saveBannerSettings);
  } catch (error) {
    setConnectionStatus('Server unavailable', false); showAdminToast(`Could not load admin data: ${error.message}`, true);
  }
});
