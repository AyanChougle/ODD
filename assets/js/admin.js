'use strict';

/* ==========================================================================
   ODD Perfume — 100% Offline Admin & Inventory Portal Engine
   Operates entirely client-side via localStorage for Hostinger static deployment.
   ========================================================================== */

const ADMIN_ROLE_PERMISSIONS = {
  admin: ['*'],
  warehouse: ['inventory:read', 'inventory:write', 'barcodes:write', 'scans:read'],
  orders: ['orders:read', 'orders:write'],
  finance: ['payments:read', 'orders:read'],
  marketing: ['coupons:read', 'coupons:write', 'banner:read', 'banner:write']
};

let adminSession = null;
let csrfToken = 'offline-csrf-token';
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

const DEFAULT_INVENTORY = {
  'ODD-PH-001': { sku: 'ODD-PH-001', name: 'ODD PHANTOM', stock: 240, price: 899, updated: '2026-10-12 10:00' },
  'ODD-LC-003': { sku: 'ODD-LC-003', name: 'ODD LUCID', stock: 180, price: 899, updated: '2026-10-12 10:00' },
  'ODD-FM-002': { sku: 'ODD-FM-002', name: 'ODD FIRST MOVE', stock: 320, price: 899, updated: '2026-10-12 10:00' }
};

const DEFAULT_COUPONS = [
  { code: 'LAUNCH20', discount: 20, active: true },
  { code: 'ODD10', discount: 10, active: true },
  { code: 'WELCOME15', discount: 15, active: true }
];

const DEFAULT_STAFF = [
  { id: 'usr-001', name: 'Admin', email: 'admin@oddperfume.com', role: 'admin', active: true, lastLogin: '2026-10-12 10:00' },
  { id: 'usr-002', name: 'Warehouse Lead', email: 'warehouse@oddperfume.com', role: 'warehouse', active: true, lastLogin: '2026-10-11 16:30' }
];

const DEFAULT_BANNER = {
  active: true,
  text: "WE'RE LIVE. Take 20% OFF your first order with code LAUNCH20",
  code: 'LAUNCH20'
};

/* --- Permission & Utility Helpers --- */
function hasPermission(permission) {
  if (!adminSession) return true;
  const permissions = adminSession.permissions || ['*'];
  return permissions.includes('*') || permissions.includes(permission);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function formatINR(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

/* --- Offline Data Storage Getters & Setters --- */
function getOfflineInventory() {
  let inv = JSON.parse(localStorage.getItem('odd_admin_inventory') || 'null');
  if (!inv || !Object.keys(inv).length) {
    inv = { ...DEFAULT_INVENTORY };
    localStorage.setItem('odd_admin_inventory', JSON.stringify(inv));
  }
  return inv;
}

function saveOfflineInventory(inv) {
  localStorage.setItem('odd_admin_inventory', JSON.stringify(inv));
  try {
    window.dispatchEvent(new CustomEvent('odd:inventory-updated', { detail: inv }));
  } catch (e) {}
}

function normalizeOrder(o) {
  const rawTotal = o.total != null ? o.total : (o.amount || 0);
  const amountNum = typeof rawTotal === 'number'
    ? rawTotal
    : (parseInt(String(rawTotal).replace(/[^0-9]/g, '')) || 0);

  const rawItems = Array.isArray(o.items) ? o.items : [];
  const items = rawItems.map(it => {
    let name = it.name;
    if (!name) {
      if (it.id === 'phantom' || it.id === 'ODD-PH-001') name = 'ODD PHANTOM';
      else if (it.id === 'lucid' || it.id === 'ODD-LC-003') name = 'ODD LUCID';
      else if (it.id === 'first-move' || it.id === 'ODD-FM-002') name = 'ODD FIRST MOVE';
      else name = String(it.id || 'Fragrance');
    }
    return {
      name: name,
      qty: Number(it.qty) || 1,
      price: Number(it.price) || 899
    };
  });

  const isRzp = String(o.paymentMethod || o.method || '').toLowerCase().includes('razorpay');
  const isDelivered = o.status === 'Delivered';
  const isPaid = isRzp || String(o.paymentStatus || '').toLowerCase() === 'paid' || isDelivered;

  return {
    id: o.id || ('ODD-' + Math.floor(100000 + Math.random() * 900000)),
    date: o.date || new Date().toISOString().split('T')[0],
    customer: o.customer || 'Guest Customer',
    phone: o.phone || '—',
    email: o.email || '—',
    address: o.address || '—',
    amount: amountNum,
    total: amountNum,
    subtotal: o.subtotal || amountNum,
    coupon: o.coupon || null,
    discount: Number(o.discount) || 0,
    method: isRzp ? 'Razorpay' : 'COD',
    paymentMethod: o.paymentMethod || (isRzp ? 'Razorpay Online' : 'Cash on Delivery (COD)'),
    paymentStatus: isPaid ? 'Paid' : 'Payment pending',
    status: o.status || 'Confirmed',
    items: items
  };
}

function getOfflineOrders() {
  const raw = JSON.parse(localStorage.getItem('odd_orders') || '[]');
  return raw.map(normalizeOrder);
}

function saveOfflineOrders(orders) {
  localStorage.setItem('odd_orders', JSON.stringify(orders));
  try {
    window.dispatchEvent(new CustomEvent('odd:orders-updated', { detail: orders }));
  } catch (e) {}
}

function getOfflineCoupons() {
  let coupons = JSON.parse(localStorage.getItem('odd_admin_coupons') || 'null');
  if (!coupons) {
    coupons = JSON.parse(localStorage.getItem('odd_coupons') || 'null');
  }
  if (!coupons || !coupons.length) {
    coupons = [...DEFAULT_COUPONS];
    saveOfflineCoupons(coupons);
  }
  return coupons;
}

function saveOfflineCoupons(coupons) {
  localStorage.setItem('odd_admin_coupons', JSON.stringify(coupons));
  localStorage.setItem('odd_coupons', JSON.stringify(coupons));
}

function getOfflineStaff() {
  let staff = JSON.parse(localStorage.getItem('odd_admin_staff') || 'null');
  if (!staff || !staff.length) {
    staff = [...DEFAULT_STAFF];
    localStorage.setItem('odd_admin_staff', JSON.stringify(staff));
  }
  return staff;
}

function saveOfflineStaff(staff) {
  localStorage.setItem('odd_admin_staff', JSON.stringify(staff));
}

function getOfflineBanner() {
  let banner = JSON.parse(localStorage.getItem('odd_admin_banner') || 'null');
  if (!banner) {
    banner = { ...DEFAULT_BANNER };
    localStorage.setItem('odd_admin_banner', JSON.stringify(banner));
  }
  return banner;
}

function saveOfflineBanner(banner) {
  localStorage.setItem('odd_admin_banner', JSON.stringify(banner));
}

function getOfflineScans() {
  return JSON.parse(localStorage.getItem('odd_scans') || '[]');
}

function saveOfflineScans(scans) {
  localStorage.setItem('odd_scans', JSON.stringify(scans));
}

/* ==========================================================================
   Central Offline-First API Interceptor
   ========================================================================== */
async function adminApi(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body || {};

  // 1. Session / Auth
  if (path.includes('/api/session')) {
    return {
      authenticated: true,
      user: adminSession?.user || { email: 'admin@oddperfume.com', name: 'Admin User', role: 'admin' },
      permissions: ['*']
    };
  }

  // 2. Inventory Management
  if (path.includes('/api/inventory')) {
    const inv = getOfflineInventory();

    if (method === 'PUT' || method === 'PATCH') {
      const parts = path.split('/');
      const sku = decodeURIComponent(parts[parts.length - 1]);
      if (inv[sku]) {
        if (body.stock !== undefined) inv[sku].stock = Math.max(0, Number(body.stock));
        if (body.price !== undefined) inv[sku].price = Math.max(0, Number(body.price));
        inv[sku].updated = new Date().toISOString().replace('T', ' ').substring(0, 16);
        saveOfflineInventory(inv);
        return { success: true, item: inv[sku] };
      }
      return { success: false, error: 'SKU not found' };
    }

    return { inventory: Object.values(inv) };
  }

  // 3. Orders Management
  if (path.includes('/api/orders')) {
    let orders = getOfflineOrders();

    if (method === 'PATCH') {
      const parts = path.split('/');
      const orderId = decodeURIComponent(parts[parts.length - 1]);
      if (body.status) {
        orders = orders.map(o => {
          if (o.id === orderId) {
            const updated = { ...o, status: body.status };
            if (body.status === 'Delivered') {
              updated.paymentStatus = 'Paid';
            }
            return updated;
          }
          return o;
        });
        saveOfflineOrders(orders);
        const updated = orders.find(o => o.id === orderId);
        return { order: updated };
      }
    }

    return { orders: orders };
  }

  // 4. Payment KPI Summary
  if (path.includes('/api/payments/summary')) {
    const orders = getOfflineOrders();
    const activeOrders = orders.filter(o => o.status !== 'Cancelled');
    const paidOrders = activeOrders.filter(o => o.paymentStatus === 'Paid' || o.status === 'Delivered');
    const codOrders = activeOrders.filter(o => o.method === 'COD' && o.status !== 'Delivered' && o.paymentStatus !== 'Paid');
    const pendingOrders = activeOrders.filter(o => ['Pending', 'Payment pending'].includes(o.paymentStatus) && o.status !== 'Delivered' && o.paymentStatus !== 'Paid');

    const confirmedRev = paidOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
    const codRev = codOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
    const pendingRev = pendingOrders.reduce((sum, o) => sum + (o.amount || 0), 0);

    return {
      confirmedRevenue: confirmedRev,
      paidCount: paidOrders.length,
      codRevenue: codRev,
      codCount: codOrders.length,
      pendingRevenue: pendingRev,
      pendingCount: pendingOrders.length,
      totalOrders: orders.length
    };
  }

  // 5. Barcode Scans
  if (path.includes('/api/scans')) {
    const scans = getOfflineScans();

    if (method === 'POST') {
      const code = String(body.code || '').trim().toUpperCase();
      const mode = body.mode || 'receive';
      const inv = getOfflineInventory();

      // Find matching SKU
      let matchedSku = null;
      if (inv[code]) matchedSku = code;
      else if (code.includes('PH') || code.includes('PHANTOM')) matchedSku = 'ODD-PH-001';
      else if (code.includes('LC') || code.includes('LUCID')) matchedSku = 'ODD-LC-003';
      else if (code.includes('FM') || code.includes('MOVE')) matchedSku = 'ODD-FM-002';
      else matchedSku = 'ODD-PH-001'; // Fallback

      if (!inv[matchedSku]) {
        inv[matchedSku] = {
          sku: matchedSku,
          name: SKU_LABELS[matchedSku] || matchedSku,
          stock: 100,
          price: 899,
          updated: new Date().toISOString().replace('T', ' ').substring(0, 16)
        };
      }

      const item = inv[matchedSku];
      const delta = mode === 'receive' ? 1 : -1;
      item.stock = Math.max(0, (Number(item.stock) || 0) + delta);
      item.updated = new Date().toISOString().replace('T', ' ').substring(0, 16);
      saveOfflineInventory(inv);

      const newScan = {
        id: Date.now(),
        code: code,
        sku: matchedSku,
        name: item.name,
        delta: delta,
        newStock: item.stock,
        mode: mode,
        staff: adminSession?.user?.name || 'Staff',
        time: new Date().toISOString()
      };

      scans.unshift(newScan);
      saveOfflineScans(scans);

      return {
        success: true,
        scan: newScan,
        name: item.name,
        sku: matchedSku,
        stock: item.stock,
        delta: delta
      };
    }

    return { scans: scans };
  }

  // 6. Barcodes Batch Generation
  if (path.includes('/api/barcodes/batch')) {
    const products = Array.isArray(body.products) ? body.products : [];
    const lot = body.lot || '77750';
    const mfg = body.mfg || new Date().toISOString().slice(0, 10);
    const shelfLife = Number(body.shelfLife) || 36;

    // Calculate expiry
    const mfgDate = new Date(mfg);
    mfgDate.setMonth(mfgDate.getMonth() + shelfLife);
    const expiry = mfgDate.toISOString().slice(0, 10);

    const labels = [];
    products.forEach(p => {
      const sku = p.sku;
      const count = Math.min(100, Math.max(1, Number(p.qty) || 1));
      const name = SKU_LABELS[sku] || sku;

      for (let i = 1; i <= count; i++) {
        const serial = String(i).padStart(3, '0');
        const barcode = `${sku}-B${lot}-${serial}`;
        labels.push({
          sku,
          name,
          barcode,
          lot,
          mfg,
          expiry
        });
      }
    });

    return { success: true, labels: labels, expiry: expiry };
  }

  // 7. Coupons Manager
  if (path.includes('/api/coupons')) {
    let coupons = getOfflineCoupons();

    if (method === 'POST') {
      const code = String(body.code || '').trim().toUpperCase();
      const discount = Number(body.discount) || 10;
      const active = body.active !== false;

      // Remove any existing with same code
      coupons = coupons.filter(c => c.code !== code);
      coupons.unshift({ code, discount, active });
      saveOfflineCoupons(coupons);
      return { success: true, coupons };
    }

    if (method === 'PATCH') {
      const parts = path.split('/');
      const code = decodeURIComponent(parts[parts.length - 1]).toUpperCase();
      coupons = coupons.map(c => c.code === code ? { ...c, active: body.active } : c);
      saveOfflineCoupons(coupons);
      return { success: true, coupons };
    }

    if (method === 'DELETE') {
      const parts = path.split('/');
      const code = decodeURIComponent(parts[parts.length - 1]).toUpperCase();
      coupons = coupons.filter(c => c.code !== code);
      saveOfflineCoupons(coupons);
      return { success: true, coupons };
    }

    return { coupons: coupons };
  }

  // 8. Launch Banner Settings
  if (path.includes('/api/settings/banner')) {
    if (method === 'PUT') {
      const updated = {
        active: !!body.active,
        text: String(body.text || '').trim(),
        code: String(body.code || '').trim().toUpperCase()
      };
      saveOfflineBanner(updated);
      return updated;
    }
    return getOfflineBanner();
  }

  // 9. Staff Accounts
  if (path.includes('/api/staff')) {
    let staff = getOfflineStaff();

    if (method === 'POST') {
      const newStaff = {
        id: 'usr-' + Date.now(),
        name: body.name || 'New Staff',
        email: body.email || 'staff@oddperfume.com',
        role: body.role || 'warehouse',
        active: true,
        lastLogin: 'Never'
      };
      staff.push(newStaff);
      saveOfflineStaff(staff);
      return { success: true, staff: newStaff };
    }

    if (method === 'PATCH') {
      const parts = path.split('/');
      const id = decodeURIComponent(parts[parts.length - 1]);
      staff = staff.map(s => s.id === id ? { ...s, active: body.active } : s);
      saveOfflineStaff(staff);
      return { success: true };
    }

    return { staff: staff };
  }

  return { success: true };
}

/* ==========================================================================
   UI Status & Notifications
   ========================================================================== */
function setConnectionStatus(text, good = true) {
  const element = document.getElementById('admin-connection-status');
  if (element) {
    element.textContent = text;
    element.style.color = good ? '#10B981' : '#EF4444';
  }
}

function showAdminToast(message, isError = false) {
  let container = document.getElementById('admin-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'admin-toast-container';
    container.className = 'admin-toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `admin-toast${isError ? ' is-error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 240);
  }, 3400);
}

/* ==========================================================================
   Tab Navigation & Layout
   ========================================================================== */
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

  window.switchAdminTab = function(targetTab) {
    if (!access[targetTab]) return;

    document.querySelectorAll('.admin-nav-item[data-tab]').forEach(link => {
      link.classList.toggle('active', link.dataset.tab === targetTab);
    });

    document.querySelectorAll('.quicktab-btn[data-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === targetTab);
    });

    document.querySelectorAll('.admin-tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab-${targetTab}`);
    });

    const activeNav = document.querySelector(`.admin-nav-item[data-tab="${targetTab}"]`);
    const title = document.getElementById('admin-page-title');
    if (title && activeNav) {
      title.textContent = activeNav.innerText.trim();
    }

    // Auto-close mobile drawer
    toggleAdminMobileNav(false);

    loadTab(targetTab).catch(error => showAdminToast(error.message, true));
  };

  window.toggleAdminMobileNav = function(force) {
    const sidebar = document.getElementById('admin-sidebar');
    const backdrop = document.getElementById('admin-sidebar-backdrop');
    if (!sidebar) return;
    const shouldOpen = typeof force === 'boolean' ? force : !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', shouldOpen);
    if (backdrop) backdrop.classList.toggle('open', shouldOpen);
    document.body.classList.toggle('admin-sidebar-open', shouldOpen);
  };

  document.querySelectorAll('.admin-nav-item[data-tab]').forEach(item => {
    const allowed = !!access[item.dataset.tab];
    item.hidden = !allowed;
    item.setAttribute('aria-hidden', String(!allowed));

    item.addEventListener('click', event => {
      event.preventDefault();
      if (!allowed) return;
      window.switchAdminTab(item.dataset.tab);
    });
  });

  document.querySelectorAll('.quicktab-btn[data-tab]').forEach(btn => {
    const allowed = !!access[btn.dataset.tab];
    btn.hidden = !allowed;
    btn.addEventListener('click', () => {
      if (!allowed) return;
      window.switchAdminTab(btn.dataset.tab);
    });
  });

  // Mobile toggle buttons
  document.getElementById('admin-mobile-menu-toggle')?.addEventListener('click', () => toggleAdminMobileNav());
  document.getElementById('admin-sidebar-close')?.addEventListener('click', () => toggleAdminMobileNav(false));
  document.getElementById('admin-sidebar-backdrop')?.addEventListener('click', () => toggleAdminMobileNav(false));

  Object.entries(access).forEach(([tab, allowed]) => {
    const pane = document.getElementById(`tab-${tab}`);
    if (pane) {
      pane.hidden = !allowed;
      if (!allowed) pane.classList.remove('active');
    }
  });

  const first = [...document.querySelectorAll('.admin-nav-item[data-tab]')].find(item => !item.hidden);
  if (first) {
    window.switchAdminTab(first.dataset.tab);
  }
}

async function loadTab(tab) {
  if (tab === 'payments') await loadPaymentDashboard();
  if (tab === 'orders') await loadOrders();
  if (tab === 'inventory') await loadInventory();
  if (tab === 'scanner') {
    await loadInventory();
    await loadRecentScans();
    document.getElementById('barcode-scan-input')?.focus();
  }
  if (tab === 'barcodes') {
    await loadInventory();
    const preview = document.getElementById('barcode-sheet-preview');
    if (preview && !preview.querySelector('.barcode-sticker')) {
      await generateBarcodeSheet();
    }
  }
  if (tab === 'access-links') await loadStaff();
  if (tab === 'launch-offer') {
    await loadCoupons();
    await loadBannerSettings();
  }
  if (tab === 'razorpay') await loadGatewayStatus();
}

/* ==========================================================================
   Tab 1: Payment Dashboard
   ========================================================================== */
async function loadPaymentDashboard() {
  const summary = await adminApi('/api/payments/summary');
  const set = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  set('kpi-confirmed-rev', formatINR(summary.confirmedRevenue));
  set('kpi-confirmed-count', `${summary.paidCount} verified paid order(s)`);

  set('kpi-cod-rev', formatINR(summary.codRevenue));
  set('kpi-cod-count', `${summary.codCount} COD order(s) · collect on delivery`);

  set('kpi-pending-verify', formatINR(summary.pendingRevenue));
  set('kpi-pending-count', `${summary.pendingCount} pending order(s) requiring review`);

  set('kpi-total-orders', summary.totalOrders);

  const totalVol = summary.confirmedRevenue + summary.codRevenue;
  const rzpPct = totalVol ? Math.round((summary.confirmedRevenue / totalVol) * 100) : 0;
  const codPct = totalVol ? (100 - rzpPct) : 0;

  set('breakdown-rzp-text', `${summary.paidCount} paid orders — ${formatINR(summary.confirmedRevenue)} (${rzpPct}%)`);
  set('breakdown-cod-text', `${summary.codCount} COD orders — ${formatINR(summary.codRevenue)} (${codPct}%)`);

  const rzpbar = document.getElementById('breakdown-rzp-bar');
  if (rzpbar) rzpbar.style.width = `${rzpPct}%`;

  const codbar = document.getElementById('breakdown-cod-bar');
  if (codbar) codbar.style.width = `${codPct}%`;
}

function renderPaymentDashboardFromOrders() {
  loadPaymentDashboard();
}

/* ==========================================================================
   Tab 2: Orders Management
   ========================================================================== */
async function loadOrders() {
  const data = await adminApi('/api/orders');
  ordersData = data.orders || [];
  renderOrdersTable();
  renderPaymentDashboardFromOrders();
}

function renderOrdersTable() {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;

  if (!ordersData.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="admin-empty-state">No customer orders yet. Orders placed at checkout will appear here in real time.</td></tr>';
    return;
  }

  const transitions = {
    Confirmed: ['Processing', 'Cancelled'],
    Processing: ['Packed', 'Cancelled'],
    Packed: ['Dispatched', 'Cancelled'],
    Dispatched: ['Delivered'],
    Delivered: [],
    Cancelled: []
  };

  tbody.innerHTML = ordersData.map(order => {
    const items = (order.items || []).map(item => `${item.name} × ${item.qty}`).join(', ');
    const nextStatuses = [order.status, ...(transitions[order.status] || ['Confirmed', 'Processing', 'Packed', 'Dispatched', 'Delivered', 'Cancelled'])];
    const uniqueStatuses = [...new Set(nextStatuses)];

    const statusControl = hasPermission('orders:write')
      ? `<select class="admin-order-status" data-order-status="${escapeHtml(order.id)}" aria-label="Status for ${escapeHtml(order.id)}">
          ${uniqueStatuses.map(status => `<option ${status === order.status ? 'selected' : ''} value="${status}">${status}</option>`).join('')}
        </select>`
      : `<span class="badge-status ${order.status === 'Cancelled' ? 'danger' : 'info'}">${escapeHtml(order.status)}</span>`;

    return `
      <tr>
        <td><strong>${escapeHtml(order.id)}</strong><small class="admin-cell-subtext">${escapeHtml(order.phone)}</small></td>
        <td>${escapeHtml(order.customer)}<small class="admin-cell-subtext">${escapeHtml(order.email)}</small></td>
        <td>${escapeHtml(items || '—')}</td>
        <td>
          <strong>${formatINR(order.amount)}</strong>
          ${order.discount ? `<small class="admin-cell-subtext" style="color:var(--admin-warning, #d97706); font-size:0.75rem;">-${formatINR(order.discount)} (${escapeHtml(order.coupon || 'PROMO')})</small>` : ''}
        </td>
        <td>
          <span class="badge-status ${order.method === 'Razorpay' || order.paymentStatus === 'Paid' ? 'info' : 'warning'}">${escapeHtml(order.method)}</span>
          <small class="admin-cell-subtext">${escapeHtml(order.paymentStatus)}</small>
        </td>
        <td>${statusControl}</td>
        <td class="admin-muted-cell">${escapeHtml(formatDate(order.date))}</td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-order-status]').forEach(select => {
    select.addEventListener('change', async () => {
      const orderId = select.dataset.orderStatus;
      const status = select.value;
      select.disabled = true;
      try {
        const result = await adminApi(`/api/orders/${encodeURIComponent(orderId)}`, { method: 'PATCH', body: { status } });
        ordersData = ordersData.map(order => order.id === orderId ? result.order : order);
        renderOrdersTable();
        renderPaymentDashboardFromOrders();
        showAdminToast(`${orderId} status updated to ${status}.`);
      } catch (error) {
        showAdminToast(error.message, true);
        await loadOrders();
      } finally {
        select.disabled = false;
      }
    });
  });
}

/* ==========================================================================
   Tab 3: Fragrance Inventory Management
   ========================================================================== */
async function loadInventory() {
  const data = await adminApi('/api/inventory');
  inventoryData = data.inventory || [];
  renderInventoryTable();
}

function renderInventoryTable() {
  const tbody = document.getElementById('inventory-tbody');
  if (!tbody) return;

  if (!inventoryData.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="admin-empty-state">No inventory records returned.</td></tr>';
    return;
  }

  tbody.innerHTML = inventoryData.map(item => `
    <tr>
      <td><code class="admin-sku">${escapeHtml(item.sku)}</code></td>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td>
        <div class="inventory-stock-controls">
          <button class="admin-btn admin-btn-outline admin-btn-sm" type="button" data-stock-delta="-1" data-sku="${escapeHtml(item.sku)}" aria-label="Remove one stock">−</button>
          <span class="inventory-stock-count${item.stock === 0 ? ' is-out' : ''}">${item.stock}</span>
          <button class="admin-btn admin-btn-outline admin-btn-sm" type="button" data-stock-delta="1" data-sku="${escapeHtml(item.sku)}" aria-label="Add one stock">+</button>
        </div>
      </td>
      <td>${formatINR(item.price)}</td>
      <td class="admin-muted-cell">${escapeHtml(formatDate(item.updated))}</td>
      <td>
        <div class="inventory-action-group">
          <button class="admin-btn admin-btn-secondary admin-btn-sm" type="button" data-edit-stock="${escapeHtml(item.sku)}">Edit stock</button>
          <button class="admin-btn admin-btn-outline admin-btn-sm" type="button" data-edit-price="${escapeHtml(item.sku)}">Edit price</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-stock-delta]').forEach(btn => btn.addEventListener('click', () => {
    const item = inventoryData.find(row => row.sku === btn.dataset.sku);
    if (!item) return;
    saveInventoryItem(item, { stock: Math.max(0, item.stock + Number(btn.dataset.stockDelta)) });
  }));

  tbody.querySelectorAll('[data-edit-stock]').forEach(btn => btn.addEventListener('click', () => {
    const item = inventoryData.find(row => row.sku === btn.dataset.editStock);
    if (!item) return;
    const value = prompt(`Set available stock for ${item.name}:`, item.stock);
    if (value === null) return;
    const stock = Number(value);
    if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) {
      return showAdminToast('Enter a whole stock count from 0 to 1,000,000.', true);
    }
    saveInventoryItem(item, { stock });
  }));

  tbody.querySelectorAll('[data-edit-price]').forEach(btn => btn.addEventListener('click', () => {
    const item = inventoryData.find(row => row.sku === btn.dataset.editPrice);
    if (!item) return;
    const value = prompt(`Set selling price for ${item.name} (₹):`, item.price);
    if (value === null) return;
    const price = Number(value);
    if (!Number.isInteger(price) || price < 0 || price > 1_000_000) {
      return showAdminToast('Enter a whole rupee price from ₹0 to ₹10,00,000.', true);
    }
    saveInventoryItem(item, { price });
  }));
}

async function saveInventoryItem(item, changes) {
  try {
    const result = await adminApi(`/api/inventory/${encodeURIComponent(item.sku)}`, {
      method: 'PUT',
      body: {
        stock: changes.stock ?? item.stock,
        price: changes.price ?? item.price
      }
    });
    const saved = result.item;
    inventoryData = inventoryData.map(row => row.sku === saved.sku ? saved : row);
    renderInventoryTable();
    showAdminToast(`${saved.name} saved to inventory.`);
  } catch (error) {
    showAdminToast(error.message, true);
  }
}

function exportInventoryCSV() {
  if (!inventoryData.length) return showAdminToast('Load inventory before exporting.', true);
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [
    ['SKU', 'Product', 'Current Stock', 'Price INR', 'Last Modified'],
    ...inventoryData.map(item => [item.sku, item.name, item.stock, item.price, item.updated])
  ].map(row => row.map(quote).join(',')).join('\r\n');

  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `odd-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showAdminToast('Inventory CSV exported.');
}

/* ==========================================================================
   Tab 4: Warehouse Barcode Scanner
   ========================================================================== */
function setScannerMode(mode) {
  if (!['receive', 'dispatch'].includes(mode)) return;
  scannerMode = mode;
  document.getElementById('btn-mode-receive')?.classList.toggle('active', mode === 'receive');
  document.getElementById('btn-mode-dispatch')?.classList.toggle('active', mode === 'dispatch');
  showAdminToast(mode === 'receive' ? 'Scanner mode: receive (+1 stock).' : 'Scanner mode: dispatch (−1 stock).');
}

async function handleScannerSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('barcode-scan-input');
  const code = input?.value.trim();
  if (!code) return;

  try {
    const result = await adminApi('/api/scans', {
      method: 'POST',
      body: { code, mode: scannerMode }
    });
    showAdminToast(`${result.name}: ${scannerMode === 'receive' ? '+1 received' : '−1 dispatched'} · stock now ${result.stock}`);
    input.value = '';
    await loadInventory();
    await loadRecentScans();
  } catch (error) {
    showAdminToast(error.message, true);
  }
  input?.focus();
}

async function loadRecentScans() {
  const container = document.getElementById('recent-scans-list');
  if (!container) return;

  const result = await adminApi('/api/scans');
  recentScansLog = result.scans || [];

  if (!recentScansLog.length) {
    container.innerHTML = '<p class="admin-empty-state">No barcode scans recorded yet. Scan an SKU to start logging.</p>';
    return;
  }

  container.innerHTML = recentScansLog.slice(0, 15).map(scan => `
    <div class="admin-scan-row">
      <div>
        <strong>${escapeHtml(scan.name)}</strong>
        <code>${escapeHtml(scan.sku || scan.code)}</code>
        <small>${escapeHtml(formatDate(scan.time))} · ${escapeHtml(scan.staff || 'Staff')} · ${escapeHtml(scan.mode)}</small>
      </div>
      <strong class="${scan.delta > 0 ? 'scan-plus' : 'scan-minus'}">
        ${scan.delta > 0 ? '+1' : '−1'} <small>Now ${scan.newStock}</small>
      </strong>
    </div>
  `).join('');
}

/* ==========================================================================
   Tab 5: Barcode Generator (Code 128-B Vector Renderer)
   ========================================================================== */
const CODE128_PATTERNS = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');

function code128Svg(value) {
  const text = String(value);
  const values = [104]; // Start B
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) continue;
    values.push(code - 32);
  }
  let sum = values[0];
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103, 106);

  // 12 modules quiet zone on each side
  const quietZone = 12;
  let x = quietZone;
  const bars = [];
  values.forEach(valuePart => {
    const pattern = CODE128_PATTERNS[valuePart];
    let black = true;
    for (const widthChar of pattern) {
      const width = Number(widthChar);
      if (black) bars.push(`<rect x="${x}" y="0" width="${width}" height="50"/>`);
      x += width;
      black = !black;
    }
  });
  const totalWidth = x + quietZone;

  return `<svg class="barcode-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 50" role="img" aria-label="Code 128 barcode ${escapeHtml(text)}" shape-rendering="crispEdges"><rect width="${totalWidth}" height="50" fill="#fff"/><g fill="#000">${bars.join('')}</g></svg>`;
}

function initBarcodeGenerator() {
  const mfgInput = document.getElementById('batch-mfg-date');
  if (mfgInput && !mfgInput.value) {
    mfgInput.value = new Date().toISOString().slice(0, 10);
  }
}

async function generateBarcodeSheet(event) {
  event?.preventDefault();
  const selected = [
    { sku: 'ODD-FM-002', checked: document.getElementById('chk-fm')?.checked, qty: Number(document.getElementById('copies-fm')?.value) },
    { sku: 'ODD-LC-003', checked: document.getElementById('chk-lc')?.checked, qty: Number(document.getElementById('copies-lc')?.value) },
    { sku: 'ODD-PH-001', checked: document.getElementById('chk-ph')?.checked, qty: Number(document.getElementById('copies-ph')?.value) }
  ].filter(item => item.checked).map(({ sku, qty }) => ({ sku, qty }));

  if (!selected.length) {
    return showAdminToast('Select at least one fragrance product above.', true);
  }

  const preview = document.getElementById('barcode-sheet-preview');
  if (!preview) return;

  const button = document.querySelector('[data-generate-barcode]');
  if (button) {
    button.disabled = true;
    button.textContent = 'Generating labels…';
  }

  try {
    const width = Number(document.getElementById('batch-label-width')?.value || 70);
    const lot = document.getElementById('batch-lot-no')?.value.trim() || '77750';
    const mfg = document.getElementById('batch-mfg-date')?.value || new Date().toISOString().slice(0, 10);
    const shelfLife = Number(document.getElementById('batch-shelf-life')?.value || 36);

    const result = await adminApi('/api/barcodes/batch', {
      method: 'POST',
      body: { products: selected, lot, mfg, shelfLife }
    });

    const labels = result.labels || [];
    const expiry = result.expiry || labels[0]?.expiry || '';
    preview.style.setProperty('--barcode-label-width', `${width}mm`);
    preview.innerHTML = `
      <div class="barcode-print-heading">
        <div>
          <strong>ODD PERFUME · TRACEABLE PACKAGING LABELS</strong>
          <small>Batch Lot ${escapeHtml(lot)} · MFG ${escapeHtml(mfg)} · EXP ${escapeHtml(expiry)}</small>
        </div>
        <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
          <span>${labels.length} stickers (${width}mm)</span>
          <button type="button" class="admin-btn admin-btn-primary admin-btn-sm" onclick="printBarcodeSheet()" style="padding:0.45rem 1.1rem; font-size:0.78rem; font-weight:700;">Print label sheet</button>
        </div>
      </div>
      <div class="barcode-label-grid">
        ${labels.map(label => `
          <article class="barcode-sticker">
            <div class="barcode-sticker-top">
              <strong class="barcode-sticker-brand">ODD PERFUME</strong>
              <span class="barcode-sticker-origin">MUMBAI</span>
            </div>
            <h4 class="barcode-sticker-title">${escapeHtml(label.name)}</h4>
            <div class="barcode-svg-wrapper">
              ${code128Svg(label.barcode)}
            </div>
            <div class="barcode-serial-tag">${escapeHtml(label.barcode)}</div>
            <div class="barcode-compliance-grid">
              <div class="comp-col"><span>LOT</span><strong>${escapeHtml(label.lot)}</strong></div>
              <div class="comp-col"><span>MFG</span><strong>${escapeHtml(label.mfg)}</strong></div>
              <div class="comp-col"><span>EXP</span><strong>${escapeHtml(label.expiry)}</strong></div>
            </div>
          </article>
        `).join('')}
      </div>
    `;

    showAdminToast(`${labels.length} Code 128 labels generated.`);
  } catch (error) {
    showAdminToast(error.message, true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Generate Printable Stickers Sheet';
    }
  }
}

function printBarcodeSheet() {
  if (!document.querySelector('.barcode-sticker')) {
    return showAdminToast('Generate labels before printing.', true);
  }
  window.print();
}

/* ==========================================================================
   Tab 6: Staff Access & Permissions
   ========================================================================== */
async function loadStaff() {
  const data = await adminApi('/api/staff');
  staffData = data.staff || [];
  renderStaffTable();
}

function renderStaffTable() {
  const tbody = document.getElementById('staff-tbody');
  if (!tbody) return;

  if (!staffData.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="admin-empty-state">No staff accounts found.</td></tr>';
    return;
  }

  tbody.innerHTML = staffData.map(staff => `
    <tr>
      <td>
        <strong>${escapeHtml(staff.name)}</strong>
        <small class="admin-cell-subtext">${escapeHtml(staff.email)}</small>
      </td>
      <td><span class="badge-status info">${escapeHtml(staff.role)}</span></td>
      <td><span class="badge-status ${staff.active ? 'success' : 'danger'}">${staff.active ? 'Active' : 'Disabled'}</span></td>
      <td class="admin-muted-cell">${escapeHtml(formatDate(staff.lastLogin))}</td>
      <td>
        <button class="admin-btn admin-btn-outline admin-btn-sm" data-staff-toggle="${staff.id}" data-active="${staff.active}">
          ${staff.active ? 'Disable' : 'Enable'}
        </button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-staff-toggle]').forEach(button => {
    button.addEventListener('click', async () => {
      const id = button.dataset.staffToggle;
      const active = button.dataset.active !== 'true';
      try {
        await adminApi(`/api/staff/${id}`, { method: 'PATCH', body: { active } });
        await loadStaff();
        showAdminToast(`Staff account ${active ? 'enabled' : 'disabled'}.`);
      } catch (error) {
        showAdminToast(error.message, true);
      }
    });
  });
}

async function createStaff(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;

  try {
    await adminApi('/api/staff', {
      method: 'POST',
      body: {
        name: form.querySelector('#staff-name').value.trim(),
        email: form.querySelector('#staff-email').value.trim(),
        role: form.querySelector('#staff-role').value
      }
    });
    form.reset();
    await loadStaff();
    showAdminToast('Staff account created.');
  } catch (error) {
    showAdminToast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

/* ==========================================================================
   Tab 7: Launch Banner & Coupon Codes
   ========================================================================== */
async function loadCoupons() {
  const data = await adminApi('/api/coupons');
  couponsData = data.coupons || [];
  renderCouponsTable();
}

function renderCouponsTable() {
  const tbody = document.getElementById('coupons-tbody');
  if (!tbody) return;

  if (!couponsData.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="admin-empty-state">No coupons created.</td></tr>';
    return;
  }

  tbody.innerHTML = couponsData.map(coupon => `
    <tr>
      <td><code class="admin-sku">${escapeHtml(coupon.code)}</code></td>
      <td><strong>${coupon.discount}% OFF</strong></td>
      <td><span class="badge-status ${coupon.active ? 'success' : 'danger'}">${coupon.active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <div class="inventory-action-group">
          <button class="admin-btn admin-btn-outline admin-btn-sm" data-coupon-toggle="${escapeHtml(coupon.code)}" data-active="${coupon.active}">
            ${coupon.active ? 'Deactivate' : 'Activate'}
          </button>
          <button class="admin-btn admin-btn-outline admin-btn-sm" data-coupon-delete="${escapeHtml(coupon.code)}" style="color:#EF4444;">
            Delete
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-coupon-toggle]').forEach(button => {
    button.addEventListener('click', async () => {
      const code = button.dataset.couponToggle;
      const active = button.dataset.active !== 'true';
      try {
        await adminApi(`/api/coupons/${encodeURIComponent(code)}`, { method: 'PATCH', body: { active } });
        await loadCoupons();
        showAdminToast(`Coupon ${code} ${active ? 'activated' : 'deactivated'}.`);
      } catch (error) {
        showAdminToast(error.message, true);
      }
    });
  });

  tbody.querySelectorAll('[data-coupon-delete]').forEach(button => {
    button.addEventListener('click', async () => {
      const code = button.dataset.couponDelete;
      if (!confirm(`Delete coupon code ${code}?`)) return;
      try {
        await adminApi(`/api/coupons/${encodeURIComponent(code)}`, { method: 'DELETE' });
        await loadCoupons();
        showAdminToast(`Coupon ${code} deleted.`);
      } catch (error) {
        showAdminToast(error.message, true);
      }
    });
  });
}

async function addNewCoupon(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const code = form.querySelector('#new-coupon-code')?.value.trim().toUpperCase();
  const discount = Number(form.querySelector('#new-coupon-discount')?.value);
  const active = form.querySelector('#new-coupon-status')?.value === 'true';

  if (!code || !discount) {
    return showAdminToast('Enter both coupon code and discount percentage.', true);
  }

  try {
    await adminApi('/api/coupons', {
      method: 'POST',
      body: { code, discount, active }
    });
    form.reset();
    await loadCoupons();
    showAdminToast(`Coupon ${code} created (${discount}% OFF).`);
  } catch (error) {
    showAdminToast(error.message, true);
  }
}

async function loadBannerSettings() {
  try {
    const banner = await adminApi('/api/settings/banner');
    const active = document.getElementById('banner-active-check');
    const text = document.getElementById('banner-text-input');
    const code = document.getElementById('banner-code-input');

    if (active) active.checked = !!banner.active;
    if (text) text.value = banner.text || '';
    if (code) code.value = banner.code || '';
  } catch (error) {
    showAdminToast(error.message, true);
  }
}

async function saveBannerSettings(event) {
  event.preventDefault();
  try {
    const active = document.getElementById('banner-active-check')?.checked;
    const text = document.getElementById('banner-text-input')?.value;
    const code = document.getElementById('banner-code-input')?.value;

    await adminApi('/api/settings/banner', {
      method: 'PUT',
      body: { active, text, code }
    });
    showAdminToast('Banner settings saved to local storage.');
  } catch (error) {
    showAdminToast(error.message, true);
  }
}

/* ==========================================================================
   Tab 8: Razorpay Gateway Settings
   ========================================================================== */
async function loadGatewayStatus() {
  const status = document.getElementById('razorpay-status-text');
  if (status) {
    status.textContent = 'ODD Storefront is currently accepting Cash on Delivery (COD) seamlessly without requiring a server. To connect Razorpay client checkout on Hostinger, enter your test Key ID in checkout.js.';
  }
}

/* ==========================================================================
   Sign Out
   ========================================================================== */
function signOut() {
  localStorage.removeItem('odd_admin_session');
  localStorage.removeItem('odd_role');
  window.location.replace('admin-login.html');
}

/* ==========================================================================
   App Initialization
   ========================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Verify or automatically seed offline admin session
    let session = null;
    const sessionStr = localStorage.getItem('odd_admin_session');
    if (sessionStr) {
      try { session = JSON.parse(sessionStr); } catch (e) {}
    }

    if (!session || !session.authenticated) {
      session = {
        authenticated: true,
        user: { name: 'Admin User', email: 'admin@oddperfume.com', role: 'admin' },
        permissions: ['*']
      };
      localStorage.setItem('odd_admin_session', JSON.stringify(session));
      localStorage.setItem('odd_role', 'admin');
    }

    if (!session.permissions || !session.permissions.length) {
      session.permissions = ['*'];
    }

    adminSession = session;

    // 2. Populate Header & Sidebar Info
    const userLabel = document.getElementById('admin-user-name');
    if (userLabel) userLabel.textContent = `${adminSession.user.name} · ${adminSession.user.role}`;

    setConnectionStatus('Offline Local Storage Mode (Active)', true);

    const logout = document.getElementById('admin-logout');
    if (logout) logout.addEventListener('click', signOut);

    const staffForm = document.getElementById('staff-create-form');
    if (staffForm) staffForm.addEventListener('submit', createStaff);

    // 3. Tab Routing
    initTabNavigation();
    const activeTab = document.querySelector('.admin-nav-item[data-tab].active')?.dataset.tab || 'payments';
    await loadTab(activeTab);

    // 4. Attach Event Listeners
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
    console.error('Admin initialization error:', error);
    setConnectionStatus('Offline Local Storage Mode (Active)', true);
  }
});
