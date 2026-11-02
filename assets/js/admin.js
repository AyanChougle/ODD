'use strict';

/* ==========================================================================
   ODD Perfume — 100% Offline Admin & Inventory Portal Engine
   Operates entirely client-side via localStorage for Hostinger static deployment.
   ========================================================================== */

const ADMIN_ROLE_PERMISSIONS = {
  admin: ['*'],
  warehouse: ['inventory:read', 'inventory:write', 'barcodes:write', 'scans:read', 'shipping:read', 'shipping:write'],
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
  'ODD-FM-002': { sku: 'ODD-FM-002', name: 'ODD FIRST MOVE', stock: 0, price: 899, updated: '2026-10-12 10:00' }
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

const DEFAULT_ORDERS = [
  {
    id: 'ODD-739182',
    date: '2026-10-18 14:32',
    customer: 'Rohit Sharma',
    phone: '+91 98201 12345',
    email: 'rohit.s@gmail.com',
    address: 'B-402, Sea Green Apts, Worli, Mumbai - 400018',
    items: [
      { id: 'first-move', sku: 'ODD-FM-002', name: 'ODD FIRST MOVE', qty: 1, price: 899 },
      { id: 'phantom', sku: 'ODD-PH-001', name: 'ODD PHANTOM', qty: 1, price: 899 }
    ],
    subtotal: 1798,
    coupon: 'LAUNCH20',
    discount: 360,
    shipping: 50,
    total: 1488,
    amount: 1488,
    status: 'Processing',
    method: 'Razorpay',
    paymentMethod: 'Razorpay Online (pay_PwK8201948)',
    paymentStatus: 'Paid',
    gateway: 'Razorpay Live',
    razorpayPaymentId: 'pay_PwK8201948',
    stockDeducted: true
  },
  {
    id: 'ODD-518294',
    date: '2026-10-17 11:15',
    customer: 'Priya Mehta',
    phone: '+91 98199 87654',
    email: 'priya.m@outlook.com',
    address: '12, Coral Heights, Bandra West, Mumbai - 400050',
    items: [
      { id: 'lucid', sku: 'ODD-LC-003', name: 'ODD LUCID', qty: 1, price: 899 }
    ],
    subtotal: 899,
    coupon: null,
    discount: 0,
    shipping: 50,
    total: 949,
    amount: 949,
    status: 'Confirmed',
    method: 'COD',
    paymentMethod: 'Cash on Delivery (COD)',
    paymentStatus: 'Payment pending',
    gateway: 'Cash on Delivery (COD)',
    razorpayPaymentId: null,
    stockDeducted: true
  },
  {
    id: 'ODD-429011',
    date: '2026-10-16 16:40',
    customer: 'Ananya Verma',
    phone: '+91 99200 45678',
    email: 'ananya.v@gmail.com',
    address: 'Flat 8A, Lodha Bellissimo, Mahalaxmi, Mumbai - 400011',
    items: [
      { id: 'phantom', sku: 'ODD-PH-001', name: 'ODD PHANTOM', qty: 2, price: 899 }
    ],
    subtotal: 1798,
    coupon: 'WELCOME15',
    discount: 270,
    shipping: 0,
    total: 1528,
    amount: 1528,
    status: 'Delivered',
    method: 'Razorpay',
    paymentMethod: 'Razorpay Online (pay_NxQ7102934)',
    paymentStatus: 'Paid',
    gateway: 'Razorpay Live',
    razorpayPaymentId: 'pay_NxQ7102934',
    stockDeducted: true,
    deliveredAt: '2026-10-18T10:00:00Z'
  }
];

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

function resolveProductSku(identifier) {
  if (!identifier) return null;
  const str = String(identifier).toUpperCase().trim();
  if (str === 'ODD-FM-002' || str.includes('FIRST MOVE') || str.includes('FIRST-MOVE') || str.includes('ODD-FM') || str.includes('MOVE') || str === 'FM') {
    return 'ODD-FM-002';
  }
  if (str === 'ODD-LC-003' || str.includes('LUCID') || str.includes('ODD-LC') || str === 'LC') {
    return 'ODD-LC-003';
  }
  if (str === 'ODD-PH-001' || str.includes('PHANTOM') || str.includes('ODD-PH') || str === 'PH') {
    return 'ODD-PH-001';
  }
  return null;
}

function formatWpDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).toUpperCase();
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const mon = months[d.getMonth()];
  const yr = d.getFullYear();
  return `${day} ${mon} ${yr}`;
}

function playScanBeep(type = 'success') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1760, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {}
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
    const sku = it.sku || resolveProductSku(it.id || it.sku || it.name);
    if (!name) {
      if (it.id === 'phantom' || it.id === 'ODD-PH-001') name = 'ODD PHANTOM';
      else if (it.id === 'lucid' || it.id === 'ODD-LC-003') name = 'ODD LUCID';
      else if (it.id === 'first-move' || it.id === 'ODD-FM-002') name = 'ODD FIRST MOVE';
      else name = String(it.id || 'Fragrance');
    }
    return {
      id: it.id || sku,
      sku: sku,
      name: name,
      qty: Number(it.qty) || 1,
      price: Number(it.price) || 899
    };
  });

  const isRzp = String(o.paymentMethod || o.method || '').toLowerCase().includes('razorpay');
  const isDelivered = o.status === 'Delivered';
  const isPaid = isRzp || String(o.paymentStatus || '').toLowerCase() === 'paid' || isDelivered;

  // Preserve production lifecycle fields
  const stockDeducted = o.stockDeducted !== undefined
    ? Boolean(o.stockDeducted)
    : (o.status !== 'Cancelled');

  return {
    id: o.id || ('ODD-' + Math.floor(100000 + Math.random() * 900000)),
    date: o.date || new Date().toISOString().split('T')[0],
    customer: o.customer || 'Guest Customer',
    phone: o.phone || '—',
    email: o.email || '—',
    address: o.address || '—',
    amount: amountNum,
    total: amountNum,
    subtotal: o.subtotal != null ? Number(o.subtotal) : amountNum,
    coupon: o.coupon || null,
    discount: Number(o.discount) || 0,
    shipping: o.shipping != null ? Number(o.shipping) : 50,
    method: isRzp ? 'Razorpay' : 'COD',
    paymentMethod: o.paymentMethod || (isRzp ? 'Razorpay Online' : 'Cash on Delivery (COD)'),
    paymentStatus: isPaid ? 'Paid' : 'Payment pending',
    gateway: o.gateway || (isRzp ? 'Razorpay Live' : 'Cash on Delivery (COD)'),
    razorpayPaymentId: o.razorpayPaymentId || (isRzp ? (String(o.paymentMethod || '').match(/pay_[a-zA-Z0-9]+/)?.[0] || null) : null),
    status: o.status || 'Confirmed',
    stockDeducted: stockDeducted,
    dispatchedAt: o.dispatchedAt || null,
    deliveredAt: o.deliveredAt || null,
    cancelledAt: o.cancelledAt || null,
    items: items
  };
}

function getOfflineOrders() {
  let raw = JSON.parse(localStorage.getItem('odd_orders') || 'null');
  if (!raw || !Array.isArray(raw) || !raw.length) {
    raw = [...DEFAULT_ORDERS];
    localStorage.setItem('odd_orders', JSON.stringify(raw));
  }
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
   Central Server API Client
   ========================================================================== */
async function adminApi(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    'Accept': 'application/json',
    ...(options.headers || {})
  };

  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const fetchOptions = {
    method,
    headers,
    credentials: 'include'
  };

  if (options.body && method !== 'GET' && method !== 'HEAD') {
    fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(path, fetchOptions);
  } catch (netErr) {
    showAdminToast('Network connection error. Server may be offline.', true);
    setConnectionStatus('Server Offline / Unreachable', false);
    throw netErr;
  }

  if (response.status === 401) {
    sessionStorage.removeItem('odd_csrf_token');
    window.location.replace('admin-login.html');
    throw new Error('Authentication required');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.details ? `${data.error}: ${data.details}` : (data.error || `Request failed with status ${response.status}`);
    showAdminToast(errorMsg, true);
    throw new Error(errorMsg);
  }

  return data;
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

  // Prevent toast flooding by keeping at most 2 toasts active
  while (container.children.length >= 2) {
    container.firstElementChild.remove();
  }

  const toast = document.createElement('div');
  toast.className = `admin-toast${isError ? ' is-error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 200);
  }, 2600);
}

/* ==========================================================================
   Tab Navigation & Layout
   ========================================================================== */
function initTabNavigation() {
  const role = (adminSession?.user?.role || '').toLowerCase();
  const isAdmin = role === 'admin';

  // Strict role-based page allowances:
  // Admin: all tabs
  // Warehouse: stock inventory, scanner, barcode generator (strictly warehouse & inventory only)
  // Marketing: launch offers & banner
  // Finance: payment dashboard & orders
  // Orders: orders
  const access = {
    payments: isAdmin || role === 'finance',
    orders: isAdmin || role === 'finance' || role === 'orders',
    inventory: isAdmin || role === 'warehouse',
    scanner: isAdmin || role === 'warehouse',
    barcodes: isAdmin || role === 'warehouse',
    shipping: isAdmin,
    'access-links': isAdmin,
    'launch-offer': isAdmin || role === 'marketing',
    razorpay: isAdmin
  };

  window.switchAdminTab = function(targetTab) {
    if (!access[targetTab]) return;

    if (targetTab !== 'scanner') {
      try { stopCameraScanner(); } catch (e) {}
    }

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
    item.style.setProperty('display', allowed ? 'flex' : 'none', 'important');

    item.addEventListener('click', event => {
      event.preventDefault();
      if (!allowed) return;
      window.switchAdminTab(item.dataset.tab);
    });
  });

  // Hide nav group headings if none of their child navigation tabs are accessible
  document.querySelectorAll('.admin-nav-group-title').forEach(titleEl => {
    let el = titleEl.nextElementSibling;
    let hasVisibleChild = false;
    while (el && !el.classList.contains('admin-nav-group-title')) {
      if (el.classList.contains('admin-nav-item') && !el.hidden && el.style.display !== 'none') {
        hasVisibleChild = true;
        break;
      }
      el = el.nextElementSibling;
    }
    titleEl.hidden = !hasVisibleChild;
    titleEl.style.setProperty('display', hasVisibleChild ? '' : 'none', 'important');
  });

  document.querySelectorAll('.quicktab-btn[data-tab]').forEach(btn => {
    const allowed = !!access[btn.dataset.tab];
    btn.hidden = !allowed;
    btn.style.setProperty('display', allowed ? '' : 'none', 'important');
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
  if (tab === 'shipping') {
    loadShippingSettings();
  }
  if (tab === 'access-links') await loadStaff();
  if (tab === 'launch-offer') {
    await loadCoupons();
    await loadBannerSettings();
    loadCouponUsages();
  }
  if (tab === 'razorpay') {
    loadRazorpaySettings();
  }
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

  // Render Recent Transactions on Payment Dashboard
  const pTbody = document.getElementById('payment-dashboard-orders-tbody');
  if (pTbody) {
    const list = summary.recentOrders || [];
    if (!list.length) {
      pTbody.innerHTML = '<tr><td colspan="8" class="admin-empty-state">No payment transactions recorded yet.</td></tr>';
    } else {
      pTbody.innerHTML = list.map(order => {
        const items = (order.items || []).map(item => `${item.name} × ${item.qty}`).join(', ');
        const isPaid = order.paymentStatus === 'Paid' || order.status === 'Delivered';
        const isCancelled = order.status === 'Cancelled';
        const payStatusClass = isPaid ? 'success' : (isCancelled ? 'danger' : 'warning');
        const orderStatusClass = order.status === 'Delivered' ? 'success' : (isCancelled ? 'danger' : 'info');

        return `
          <tr>
            <td><strong>${escapeHtml(order.id)}</strong></td>
            <td>${escapeHtml(order.customer)}<small class="admin-cell-subtext">${escapeHtml(order.phone)}</small></td>
            <td>${escapeHtml(items || '—')}</td>
            <td><strong>${formatINR(order.amount)}</strong></td>
            <td>
              <span>${escapeHtml(order.gateway || order.method || 'Direct')}</span>
              ${order.razorpayPaymentId ? `<small class="admin-cell-subtext" style="font-family:var(--font-mono); font-size:0.7rem;">${escapeHtml(order.razorpayPaymentId)}</small>` : ''}
            </td>
            <td><span class="badge-status ${payStatusClass}">${escapeHtml(order.paymentStatus || 'Pending')}</span></td>
            <td><span class="badge-status ${orderStatusClass}">${escapeHtml(order.status || 'Confirmed')}</span></td>
            <td class="admin-muted-cell">${escapeHtml(formatDate(order.date))}</td>
          </tr>
        `;
      }).join('');
    }
  }
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

  // Sync offline storage cache with live inventory
  const cacheObj = {};
  inventoryData.forEach(item => {
    cacheObj[item.sku] = { stock: item.stock, price: item.price };
  });
  if (Object.keys(cacheObj).length) {
    saveOfflineInventory(cacheObj);
  }

  renderInventoryTable();
  updateInventoryKpis();
  updateScannerLiveStock();
}

function updateScannerLiveStock() {
  const fmEl = document.getElementById('scanner-stock-fm');
  const lcEl = document.getElementById('scanner-stock-lc');
  const phEl = document.getElementById('scanner-stock-ph');

  let fmStock = 0, lcStock = 0, phStock = 0;
  if (Array.isArray(inventoryData) && inventoryData.length > 0) {
    const fm = inventoryData.find(i => i.sku === 'ODD-FM-002');
    const lc = inventoryData.find(i => i.sku === 'ODD-LC-003');
    const ph = inventoryData.find(i => i.sku === 'ODD-PH-001');
    if (fm) fmStock = fm.stock;
    if (lc) lcStock = lc.stock;
    if (ph) phStock = ph.stock;
  } else {
    const inv = getOfflineInventory();
    fmStock = inv['ODD-FM-002']?.stock ?? 0;
    lcStock = inv['ODD-LC-003']?.stock ?? 0;
    phStock = inv['ODD-PH-001']?.stock ?? 0;
  }

  if (fmEl) fmEl.textContent = fmStock;
  if (lcEl) lcEl.textContent = lcStock;
  if (phEl) phEl.textContent = phStock;
}

function updateInventoryKpis() {
  const totalUnits = inventoryData.reduce((sum, it) => sum + (Number(it.stock) || 0), 0);
  const totalValuation = inventoryData.reduce((sum, it) => sum + ((Number(it.stock) || 0) * (Number(it.price) || 899)), 0);

  const orders = getOfflineOrders();
  const activeOrders = orders.filter(o => ['Confirmed', 'Processing', 'Packed'].includes(o.status));
  const fulfilledOrders = orders.filter(o => ['Dispatched', 'Delivered'].includes(o.status));

  let committedUnits = 0;
  activeOrders.forEach(o => {
    (o.items || []).forEach(it => {
      committedUnits += Number(it.qty) || 1;
    });
  });

  let dispatchedUnits = 0;
  fulfilledOrders.forEach(o => {
    (o.items || []).forEach(it => {
      dispatchedUnits += Number(it.qty) || 1;
    });
  });

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  set('inv-kpi-total-units', totalUnits.toLocaleString('en-IN') + ' units');
  set('inv-kpi-valuation', formatINR(totalValuation));
  set('inv-kpi-committed', committedUnits.toLocaleString('en-IN') + ' units');
  set('inv-kpi-dispatched', dispatchedUnits.toLocaleString('en-IN') + ' units');
}

function renderInventoryTable() {
  const tbody = document.getElementById('inventory-tbody');
  if (!tbody) return;

  if (!inventoryData.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="admin-empty-state">No inventory records returned.</td></tr>';
    return;
  }

  tbody.innerHTML = inventoryData.map(item => {
    const stock = Math.max(0, Number(item.stock) || 0);
    let badgeClass = 'success';
    let badgeLabel = 'In Stock';
    if (stock === 0) {
      badgeClass = 'danger';
      badgeLabel = 'Out of Stock';
    } else if (stock <= 25) {
      badgeClass = 'warning';
      badgeLabel = 'Low Stock';
    }

    return `
      <tr>
        <td><code class="admin-sku">${escapeHtml(item.sku)}</code></td>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td>
          <div class="inventory-stock-display">
            <span class="inventory-stock-count${stock === 0 ? ' is-out' : ''}">${stock}</span>
            <span class="inventory-stock-subtext">Scanner Managed</span>
          </div>
        </td>
        <td>
          <span class="badge-status ${badgeClass}">${badgeLabel}</span>
        </td>
        <td><strong>${formatINR(item.price)}</strong></td>
        <td class="admin-muted-cell">${escapeHtml(formatDate(item.updated))}</td>
        <td>
          <div class="inventory-action-group">
            <button class="admin-btn admin-btn-outline admin-btn-sm" type="button" data-edit-price="${escapeHtml(item.sku)}" style="color:#FFF; border-color:var(--admin-border);">Edit price</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-edit-price]').forEach(btn => btn.addEventListener('click', () => {
    const item = inventoryData.find(row => row.sku === btn.dataset.editPrice);
    if (!item) return;
    const value = prompt(`Set selling price for ${item.name} (₹):`, item.price);
    if (value === null) return;
    const price = Number(value);
    if (!Number.isInteger(price) || price <= 0 || price > 1_000_000) {
      return showAdminToast('Enter a valid whole rupee price from ₹1 to ₹10,00,000.', true);
    }
    saveInventoryItem(item, { price });
  }));
}

async function saveInventoryItem(item, changes) {
  try {
    const payload = {};
    if (changes.price !== undefined) payload.price = changes.price;
    if (changes.stock !== undefined) payload.stock = changes.stock;

    const result = await adminApi(`/api/inventory/${encodeURIComponent(item.sku)}`, {
      method: 'PUT',
      body: payload
    });
    const saved = result.item || { ...item, ...changes };
    inventoryData = inventoryData.map(row => row.sku === saved.sku ? { ...row, ...saved } : row);
    renderInventoryTable();
    updateInventoryKpis();
    showAdminToast(`${item.name} price updated to ${formatINR(saved.price)}.`);
  } catch (error) {
    showAdminToast(error.message, true);
  }
}

function exportInventoryCSV() {
  if (!inventoryData.length) return showAdminToast('Load inventory before exporting.', true);
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [
    ['SKU', 'Product', 'Current Stock', 'Stock Status', 'Price INR', 'Valuation INR', 'Last Modified'],
    ...inventoryData.map(item => {
      const stock = Math.max(0, Number(item.stock) || 0);
      const price = Number(item.price) || 899;
      const status = stock === 0 ? 'Out of Stock' : (stock <= 25 ? 'Low Stock' : 'In Stock');
      const val = stock * price;
      return [item.sku, item.name, stock, status, price, val, item.updated || '—'];
    })
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

  const banner = document.getElementById('scanner-active-mode-banner');
  if (banner) {
    if (mode === 'receive') {
      banner.style.background = 'rgba(16, 185, 129, 0.15)';
      banner.style.color = '#34D399';
      banner.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      banner.textContent = 'ACTIVE: STOCK IN (+1 Stock Added per scan)';
    } else {
      banner.style.background = 'rgba(232, 107, 50, 0.15)';
      banner.style.color = '#F97316';
      banner.style.borderColor = 'rgba(232, 107, 50, 0.3)';
      banner.textContent = 'ACTIVE: STOCK OUT (−1 Stock Deducted per scan)';
    }
  }

  const cameraBadge = document.getElementById('camera-mode-badge');
  const quickToggleBtn = document.getElementById('btn-toggle-scan-mode-quick');
  if (cameraBadge) {
    if (mode === 'receive') {
      cameraBadge.style.background = 'rgba(16, 185, 129, 0.18)';
      cameraBadge.style.color = '#34D399';
      cameraBadge.style.borderColor = 'rgba(16, 185, 129, 0.35)';
      cameraBadge.textContent = 'STOCK IN (+1)';
      if (quickToggleBtn) quickToggleBtn.textContent = 'Switch to Stock Out';
    } else {
      cameraBadge.style.background = 'rgba(239, 68, 68, 0.18)';
      cameraBadge.style.color = '#F87171';
      cameraBadge.style.borderColor = 'rgba(239, 68, 68, 0.35)';
      cameraBadge.textContent = 'STOCK OUT (−1)';
      if (quickToggleBtn) quickToggleBtn.textContent = 'Switch to Stock In';
    }
  }
}

async function processScannedCode(rawCode) {
  const code = String(rawCode || '').trim();
  if (!code) return;

  try {
    const result = await adminApi('/api/scans', {
      method: 'POST',
      body: { code, mode: scannerMode }
    });
    
    playScanBeep('success');
    if (navigator.vibrate) {
      try { navigator.vibrate([70, 40, 70]); } catch (e) {}
    }

    if (result.isOrder) {
      showAdminToast(result.message || `Order ${result.code} dispatched!`);
      await loadOrders();
    } else {
      showAdminToast(`${result.name}: ${scannerMode === 'receive' ? '+1 received' : '−1 dispatched'} · stock now ${result.stock}`);
    }

    const input = document.getElementById('barcode-scan-input');
    if (input) input.value = '';

    await loadInventory();
    updateScannerLiveStock();
    await loadRecentScans();
    return result;
  } catch (error) {
    playScanBeep('error');
    if (navigator.vibrate) {
      try { navigator.vibrate(200); } catch (e) {}
    }
    showAdminToast(error.message, true);
    throw error;
  }
}

async function handleScannerSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('barcode-scan-input');
  const code = input?.value.trim();
  if (!code) return;

  try {
    await processScannedCode(code);
  } catch (e) {}
  input?.focus();
}

// --- Mobile / Device Camera QR & Barcode Scanner Controller ---
let html5QrScannerInstance = null;
let currentCameraIndex = 0;
let availableCameraIds = [];
let lastCameraScannedCode = '';
let lastCameraScanTime = 0;
let isTorchOn = false;
let nativeBarcodeDetector = null;
let nativeDetectorInterval = null;

// Initialize native browser BarcodeDetector (supported by Android Chrome & Chromium)
if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
  try {
    nativeBarcodeDetector = new BarcodeDetector({
      formats: ['code_128', 'code_39', 'qr_code', 'ean_13', 'upc_a']
    });
  } catch (e) {
    nativeBarcodeDetector = null;
  }
}

async function startCameraScanner() {
  const viewWrapper = document.getElementById('camera-viewfinder-wrapper');
  const btnStart = document.getElementById('btn-start-camera');
  const btnStop = document.getElementById('btn-stop-camera');
  const feedback = document.getElementById('camera-scan-feedback');

  if (typeof Html5Qrcode === 'undefined') {
    return showAdminToast('Camera scanning library is loading... please retry in a moment.', true);
  }

  try {
    if (viewWrapper) viewWrapper.style.display = 'block';
    if (btnStart) btnStart.style.display = 'none';
    if (btnStop) btnStop.style.display = 'inline-flex';
    if (feedback) feedback.textContent = 'Starting camera scanner...';

    // Query available video cameras
    const devices = await Html5Qrcode.getCameras().catch(() => []);
    availableCameraIds = devices.map(d => d.id);

    if (!html5QrScannerInstance) {
      const formats = (typeof Html5QrcodeSupportedFormats !== 'undefined') ? [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.UPC_A
      ] : undefined;

      html5QrScannerInstance = new Html5Qrcode('camera-reader-viewport', {
        verbose: false,
        formatsToSupport: formats,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      });
    }

    // High definition video constraints & continuous autofocus for maximum 2D QR & 1D barcode legibility
    const qrConfig = {
      fps: 20,
      videoConstraints: {
        facingMode: { ideal: 'environment' },
        width: { min: 1024, ideal: 1920 },
        height: { min: 720, ideal: 1080 }
      }
    };

    // Prioritize autofocus environment camera
    const cameraConfig = availableCameraIds.length > 0 && currentCameraIndex > 0
      ? { deviceId: { exact: availableCameraIds[currentCameraIndex % availableCameraIds.length] } }
      : { facingMode: { ideal: 'environment' } };

    await html5QrScannerInstance.start(
      cameraConfig,
      qrConfig,
      onCameraCodeDetected,
      () => { /* Silent per-frame decode attempt */ }
    );

    // Synchronize current mode badge & quick toggle
    setScannerMode(scannerMode);

    // Launch high-speed native BarcodeDetector loop if supported by browser
    if (nativeBarcodeDetector) {
      const videoEl = document.querySelector('#camera-reader-viewport video');
      if (videoEl) {
        nativeDetectorInterval = setInterval(async () => {
          if (videoEl.readyState >= 2 && !videoEl.paused) {
            try {
              const detected = await nativeBarcodeDetector.detect(videoEl);
              if (detected && detected.length > 0) {
                const rawVal = detected[0].rawValue;
                if (rawVal) {
                  onCameraCodeDetected(rawVal);
                }
              }
            } catch (err) {}
          }
        }, 120);
      }
    }

    if (feedback) feedback.textContent = 'Camera active. Point at QR code or barcode to scan.';
    checkTorchCapability();

  } catch (err) {
    console.error('Camera start error:', err);
    if (feedback) feedback.textContent = 'Camera access denied or unavailable.';
    showAdminToast('Camera error: ' + (err.message || 'Permission denied. Please grant camera permission in browser.'), true);
    stopCameraScanner();
  }
}

async function stopCameraScanner() {
  const viewWrapper = document.getElementById('camera-viewfinder-wrapper');
  const btnStart = document.getElementById('btn-start-camera');
  const btnStop = document.getElementById('btn-stop-camera');
  const feedback = document.getElementById('camera-scan-feedback');

  if (nativeDetectorInterval) {
    clearInterval(nativeDetectorInterval);
    nativeDetectorInterval = null;
  }

  if (html5QrScannerInstance) {
    try {
      if (html5QrScannerInstance.isScanning) {
        await html5QrScannerInstance.stop();
      }
      await html5QrScannerInstance.clear();
    } catch (e) {
      console.warn('Error closing camera:', e);
    }
  }

  if (viewWrapper) viewWrapper.style.display = 'none';
  if (btnStart) btnStart.style.display = 'inline-flex';
  if (btnStop) btnStop.style.display = 'none';
  if (feedback) feedback.textContent = '';
}

async function switchCamera() {
  if (!availableCameraIds.length || availableCameraIds.length < 2) {
    return showAdminToast('Only one camera detected on this device.');
  }
  currentCameraIndex = (currentCameraIndex + 1) % availableCameraIds.length;
  await stopCameraScanner();
  await startCameraScanner();
}

async function checkTorchCapability() {
  const torchBtn = document.getElementById('btn-toggle-torch');
  if (!torchBtn || !html5QrScannerInstance) return;
  try {
    const capabilities = html5QrScannerInstance.getRunningTrackCameraCapabilities();
    if (capabilities && typeof capabilities.torchFeature === 'function' && capabilities.torchFeature().isSupported()) {
      torchBtn.style.display = 'inline-block';
    } else {
      torchBtn.style.display = 'none';
    }
  } catch (e) {
    torchBtn.style.display = 'none';
  }
}

async function toggleTorch() {
  const torchBtn = document.getElementById('btn-toggle-torch');
  if (!html5QrScannerInstance) return;
  try {
    isTorchOn = !isTorchOn;
    await html5QrScannerInstance.applyVideoConstraints({
      advanced: [{ torch: isTorchOn }]
    });
    if (torchBtn) torchBtn.textContent = isTorchOn ? 'Flashlight: ON' : 'Flashlight Torch';
  } catch (e) {
    showAdminToast('Flashlight not supported on this device.');
  }
}

async function onCameraCodeDetected(decodedText) {
  const now = Date.now();
  // 1.8 second debounce for identical code to prevent continuous spamming while aiming
  if (decodedText === lastCameraScannedCode && (now - lastCameraScanTime) < 1800) {
    return;
  }

  lastCameraScannedCode = decodedText;
  lastCameraScanTime = now;

  const feedback = document.getElementById('camera-scan-feedback');
  if (feedback) {
    feedback.innerHTML = `<span style="color:#34D399; font-weight:700;">Scanned: ${escapeHtml(decodedText)}</span> (Processing...)`;
  }

  // Visual reticle flash feedback
  const box = document.querySelector('.camera-viewfinder-box');
  if (box) {
    box.style.borderColor = '#10B981';
    box.style.boxShadow = '0 0 25px rgba(16,185,129,0.7)';
    setTimeout(() => {
      box.style.borderColor = 'rgba(232,107,50,0.6)';
      box.style.boxShadow = '0 8px 32px rgba(0,0,0,0.8), 0 0 15px rgba(232,107,50,0.2)';
    }, 450);
  }

  try {
    const res = await processScannedCode(decodedText);
    if (feedback) {
      if (res.isOrder) {
        feedback.innerHTML = `<span style="color:#34D399; font-weight:700;">Order Dispatched: ${escapeHtml(res.code)}</span>`;
      } else {
        feedback.innerHTML = `<span style="color:#34D399; font-weight:700;">${escapeHtml(res.name)} (${res.sku})</span>: ${scannerMode === 'receive' ? '+1 Stock Added' : '−1 Stock Dispatched'} (Current Stock: ${res.stock})`;
      }
    }
  } catch (err) {
    if (feedback) {
      feedback.innerHTML = `<span style="color:#EF4444; font-weight:700;">Scan Failed:</span> ${escapeHtml(err.message || 'Unknown barcode')}`;
    }
  }
}

function quickScanSimulate(code) {
  const input = document.getElementById('barcode-scan-input');
  if (input) {
    input.value = code;
    const form = document.getElementById('barcode-scan-form');
    if (form) {
      form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  }
}

function quickScanLatestOrder() {
  const orders = getOfflineOrders();
  if (!orders.length) return showAdminToast('No orders found to test dispatch scan.', true);
  const targetOrder = orders.find(o => o.status !== 'Dispatched' && o.status !== 'Delivered') || orders[0];
  quickScanSimulate(targetOrder.id);
}

async function clearScanLog() {
  try {
    await adminApi('/api/scans', { method: 'DELETE' });
  } catch (e) {
    console.warn('Server scan clear warning:', e);
  }
  saveOfflineScans([]);
  recentScansLog = [];
  const container = document.getElementById('recent-scans-list');
  if (container) {
    container.innerHTML = '<p class="admin-empty-state">No barcode scans recorded yet. Scan an SKU or Order Reference to start logging.</p>';
  }
  showAdminToast('Scan history cleared.');
}

async function loadRecentScans() {
  const container = document.getElementById('recent-scans-list');
  if (!container) return;

  const result = await adminApi('/api/scans');
  recentScansLog = result.scans || [];

  if (!recentScansLog.length) {
    container.innerHTML = '<p class="admin-empty-state">No barcode scans recorded yet. Scan an SKU or Order Reference to start logging.</p>';
    return;
  }

  container.innerHTML = recentScansLog.slice(0, 15).map(scan => `
    <div class="admin-scan-row">
      <div>
        <strong>${escapeHtml(scan.name)}</strong>
        <code>${escapeHtml(scan.sku || scan.code)}</code>
        <small>${escapeHtml(formatDate(scan.time))} · ${escapeHtml(scan.staff || 'Staff')} · ${escapeHtml(scan.mode)}${scan.details ? ' · ' + escapeHtml(scan.details) : ''}</small>
      </div>
      <strong class="${scan.delta > 0 ? 'scan-plus' : 'scan-minus'}">
        ${scan.delta > 0 ? '+' + scan.delta : scan.delta} <small>${scan.newStock !== undefined ? 'Stock: ' + scan.newStock : ''}</small>
      </strong>
    </div>
  `).join('');
}

/* ==========================================================================
   Tab 5: Barcode Generator (Code 128-B Vector Renderer)
   ========================================================================== */
const CODE128_PATTERNS = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');

function code128Svg(value, barHeight = 45) {
  const text = String(value || '').trim();
  const values = [104]; // Start B
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 32 && code <= 126) values.push(code - 32);
  }
  let sum = values[0];
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103, 106);

  // High precision integer module width & standard 6-module quiet zone
  const moduleWidth = 2;
  const quietZonePx = 6 * moduleWidth;
  let x = quietZonePx;
  const bars = [];
  values.forEach(valuePart => {
    const pattern = CODE128_PATTERNS[valuePart];
    if (!pattern) return;
    let black = true;
    for (const widthChar of pattern) {
      const width = Number(widthChar) * moduleWidth;
      if (black) bars.push(`<rect x="${x}" y="0" width="${width}" height="${barHeight}"/>`);
      x += width;
      black = !black;
    }
  });
  const totalWidth = x + quietZonePx;

  return `<svg class="sticker-barcode-svg" viewBox="0 0 ${totalWidth} ${barHeight}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Barcode ${escapeHtml(text)}" shape-rendering="crispEdges">
    <rect width="${totalWidth}" height="${barHeight}" fill="#FFFFFF"/>
    <g fill="#000000">${bars.join('')}</g>
  </svg>`;
}

function initBarcodeGenerator() {
  // Let the user pick manufacturing date and lot number freely
}

function applyLabelPreset(preset) {
  const widthInput = document.getElementById('batch-label-width');
  const heightInput = document.getElementById('batch-label-height');
  const colsSelect = document.getElementById('batch-label-cols');
  if (!widthInput || !heightInput) return;

  const presets = {
    '50x15': { w: 50, h: 15, cols: 3 },
    '60x20': { w: 60, h: 20, cols: 3 },
    '70x25': { w: 70, h: 25, cols: 3 },
    '70x35': { w: 70, h: 35, cols: 3 },
    '50x25': { w: 50, h: 25, cols: 3 },
    '80x40': { w: 80, h: 40, cols: 2 },
    '100x50': { w: 100, h: 50, cols: 2 }
  };

  if (presets[preset]) {
    widthInput.value = presets[preset].w;
    heightInput.value = presets[preset].h;
    if (colsSelect) colsSelect.value = presets[preset].cols;
  }
}

function onCustomDimensionInput() {
  const presetSelect = document.getElementById('batch-label-preset');
  if (presetSelect) presetSelect.value = 'custom';
}

function backToBarcodeSelection() {
  const card = document.querySelector('#tab-barcodes .admin-card');
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const height = Number(document.getElementById('batch-label-height')?.value || 35);
    const cols = Number(document.getElementById('batch-label-cols')?.value || 4);
    const lot = document.getElementById('batch-lot-no')?.value.trim() || '01';
    const mfg = document.getElementById('batch-mfg-date')?.value || new Date().toISOString().slice(0, 10);
    const shelfLife = Number(document.getElementById('batch-shelf-life')?.value || 36);
    const mrp = Number(document.getElementById('batch-mrp')?.value || 899);
    const codeFormat = document.getElementById('batch-code-format')?.value || 'dual';

    const result = await adminApi('/api/barcodes/batch', {
      method: 'POST',
      body: { products: selected, lot, mfg, shelfLife, mrp }
    });

    const labels = result.labels || [];
    const expiry = result.expiry || labels[0]?.expiry || '';

    preview.style.setProperty('--label-width', `${width}mm`);
    preview.style.setProperty('--label-height', `${height}mm`);
    preview.style.setProperty('--label-cols', cols);

    const formatDesc = codeFormat === 'dual'
      ? 'Dual: Small Barcode + QR'
      : (codeFormat === 'barcode' ? 'Small Barcode Only' : 'QR Code Only');

    preview.innerHTML = `
      <div class="wp-barcode-actions-bar">
        <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
          <button type="button" class="wp-btn-print" onclick="printBarcodeSheet()">Print This Sheet</button>
          <button type="button" class="wp-btn-back" onclick="backToBarcodeSelection()">Back to Selection</button>
        </div>
        <div class="wp-barcode-meta-summary">
          <span>${labels.length} labels</span> · Format: <strong>${formatDesc}</strong> · Size: <strong>${width} × ${height} mm</strong> (${cols} cols) · Lot No: <strong>${escapeHtml(lot)}</strong> · Mfg: <strong>${escapeHtml(mfg)}</strong> · Exp: <strong>${escapeHtml(expiry)}</strong>
        </div>
      </div>
      <div class="barcode-label-grid" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr)) !important;">
        ${labels.map(label => {
          if (codeFormat === 'dual') {
            return `
              <article class="barcode-sticker sticker-format-dual" style="height:${height}mm; border:0 !important; outline:0 !important; box-shadow:none !important; border-radius:0 !important; background:#ffffff !important; padding:1.5mm !important;">
                <div class="sticker-body-row">
                  <div class="sticker-barcode-pane">
                    <svg class="sticker-barcode-svg" data-barcode="${escapeHtml(label.barcode)}"></svg>
                    <div class="sticker-code-text">${escapeHtml(label.barcode)}</div>
                  </div>
                  <div class="sticker-qr-pane">
                    <div class="sticker-qr-frame">
                      <div class="sticker-qr-box" data-qr="${escapeHtml(label.barcode)}"></div>
                    </div>
                  </div>
                </div>
              </article>
            `;
          } else if (codeFormat === 'qr') {
            return `
              <article class="barcode-sticker sticker-format-qr" style="height:${height}mm; border:0 !important; outline:0 !important; box-shadow:none !important; border-radius:0 !important; background:#ffffff !important; padding:1.5mm !important;">
                <div class="sticker-qr-pane full-center">
                  <div class="sticker-qr-frame">
                    <div class="sticker-qr-box" data-qr="${escapeHtml(label.barcode)}"></div>
                  </div>
                  <div class="sticker-code-text">${escapeHtml(label.barcode)}</div>
                </div>
              </article>
            `;
          } else {
            return `
              <article class="barcode-sticker sticker-format-barcode" style="height:${height}mm; border:0 !important; outline:0 !important; box-shadow:none !important; border-radius:0 !important; background:#ffffff !important; padding:1.5mm !important;">
                <div class="sticker-barcode-pane full-width">
                  <svg class="sticker-barcode-svg" data-barcode="${escapeHtml(label.barcode)}"></svg>
                  <div class="sticker-code-text">${escapeHtml(label.barcode)}</div>
                </div>
              </article>
            `;
          }
        }).join('')}
      </div>
    `;

    const printBorder = document.getElementById('batch-print-border')?.checked ?? false;
    preview.classList.toggle('has-print-borders', printBorder);

    // 1. Render Barcodes (Crisp Vector Bars with Visible Bold Text Below)
    const stickerSvgs = preview.querySelectorAll('svg.sticker-barcode-svg[data-barcode]');
    const targetBarHeight = Math.max(28, Math.round((height - 7) * 3.78));
    const barWidth = (codeFormat === 'dual') ? 1.4 : 1.7;
    const barHeight = targetBarHeight;
    stickerSvgs.forEach(svgEl => {
      const code = svgEl.dataset.barcode;
      let rendered = false;
      if (typeof window.JsBarcode === 'function') {
        try {
          window.JsBarcode(svgEl, code, {
            format: 'CODE128',
            width: barWidth,
            height: barHeight,
            displayValue: false, // Clean bold HTML text below ensures 100% visibility!
            margin: 0,
            background: '#FFFFFF',
            lineColor: '#000000',
            flat: true
          });
          rendered = true;
        } catch (e) {
          rendered = false;
        }
      }
      if (!rendered) {
        svgEl.outerHTML = code128Svg(code, barHeight);
      }
    });

    // 2. Render QR Codes (High DPI 256x256, Level M)
    const qrBoxes = preview.querySelectorAll('.sticker-qr-box[data-qr]');
    qrBoxes.forEach(container => {
      const qrData = container.dataset.qr;
      if (typeof window.QRCode === 'function') {
        try {
          container.innerHTML = '';
          new window.QRCode(container, {
            text: qrData,
            width: 256,
            height: 256,
            colorDark: '#000000',
            colorLight: '#FFFFFF',
            correctLevel: window.QRCode.CorrectLevel.M
          });
        } catch (e) {
          console.warn('QR Code generation error:', e);
        }
      }
    });

    showAdminToast(`${labels.length} labels generated (${width} × ${height} mm).`);
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

  const name = (form.querySelector('#staff-name')?.value || '').trim();
  const email = (form.querySelector('#staff-email')?.value || '').trim();
  const role = (form.querySelector('#staff-role')?.value || 'warehouse').trim();
  const password = (form.querySelector('#staff-password')?.value || '').trim();

  if (!name || !email || !password) {
    button.disabled = false;
    return showAdminToast('Please provide name, email, and password.', true);
  }

  try {
    await adminApi('/api/staff', {
      method: 'POST',
      body: {
        name,
        email,
        role,
        password
      }
    });
    form.reset();
    await loadStaff();
    showAdminToast(`Staff account for ${name} (${role}) created.`);
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
   Tab 7: Shipping & Delivery Pricing Configuration
   ========================================================================== */
function getOfflineShipping() {
  try {
    const raw = localStorage.getItem('odd_admin_shipping');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    standardRate: 50,
    freeThreshold: 0,
    expressRate: 120,
    timeline: '3–5 Business Days Across India',
    enabled: true
  };
}

function saveOfflineShipping(cfg) {
  try {
    localStorage.setItem('odd_admin_shipping', JSON.stringify(cfg));
    localStorage.setItem('odd_shipping', JSON.stringify(cfg));
  } catch (e) {}
}

async function loadShippingSettings() {
  const local = getOfflineShipping();
  const applyFields = (cfg) => {
    const enCheck = document.getElementById('shipping-enabled-check');
    const stdRate = document.getElementById('shipping-standard-rate');
    const freeThresh = document.getElementById('shipping-free-threshold');
    const expRate = document.getElementById('shipping-express-rate');
    const timeline = document.getElementById('shipping-timeline-text');

    if (enCheck) enCheck.checked = cfg.enabled !== false;
    if (stdRate) stdRate.value = cfg.standardRate ?? 50;
    if (freeThresh) freeThresh.value = cfg.freeThreshold ?? 0;
    if (expRate) expRate.value = cfg.expressRate ?? 120;
    if (timeline) timeline.value = cfg.timeline || '3–5 Business Days Across India';
  };

  applyFields(local);

  try {
    const cfg = await adminApi('/api/settings/shipping');
    if (cfg && typeof cfg === 'object' && Object.keys(cfg).length > 0) {
      applyFields(cfg);
      saveOfflineShipping(cfg);
    }
  } catch (err) {
    console.warn('Using cached local shipping settings:', err.message);
  }
}

async function saveShippingSettings(event) {
  if (event) event.preventDefault();
  const cfg = {
    enabled: document.getElementById('shipping-enabled-check')?.checked ?? true,
    standardRate: Number(document.getElementById('shipping-standard-rate')?.value ?? 50),
    freeThreshold: Number(document.getElementById('shipping-free-threshold')?.value ?? 0),
    expressRate: Number(document.getElementById('shipping-express-rate')?.value ?? 120),
    timeline: document.getElementById('shipping-timeline-text')?.value?.trim() || '3–5 Business Days Across India'
  };

  saveOfflineShipping(cfg);

  try {
    await adminApi('/api/settings/shipping', { method: 'PUT', body: cfg });
    const msg = document.getElementById('shipping-saved-msg');
    if (msg) {
      msg.style.display = 'inline';
      setTimeout(() => { msg.style.display = 'none'; }, 2500);
    }
    showAdminToast(`Shipping fees updated: Standard ₹${cfg.standardRate}${cfg.freeThreshold > 0 ? ` (Free above ₹${cfg.freeThreshold})` : ''}.`);
  } catch (err) {
    showAdminToast(`Saved locally! (Sync notice: ${err.message})`, false);
  }
}

/* ==========================================================================
   Tab 8: Customer Coupon Usages Log
   ========================================================================== */
async function loadCouponUsages() {
  const tbody = document.getElementById('coupon-usages-tbody');
  if (!tbody) return;

  try {
    const data = await adminApi('/api/coupons/usages');
    const usages = data.usages || [];

    if (!usages || !usages.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="admin-empty-state">No coupons redeemed yet. When customers apply coupons at checkout with their emails, redemptions appear here.</td></tr>';
      return;
    }

    tbody.innerHTML = usages.map(u => `
      <tr>
        <td><code class="admin-sku">${escapeHtml(u.coupon || 'PROMO')}</code></td>
        <td><strong>${escapeHtml(u.email || '—')}</strong></td>
        <td>${escapeHtml(u.phone || '—')}</td>
        <td><strong>${escapeHtml(u.orderId || '—')}</strong></td>
        <td><span style="color:var(--brand-orange, #E86B32); font-weight:700;">-₹${Number(u.discount || 0).toLocaleString('en-IN')}</span></td>
        <td class="admin-muted-cell">${escapeHtml(formatDate(u.date))}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load coupon redemptions:', err);
  }
}

function clearCouponUsages() {
  showAdminToast('Coupon redemptions are stored in the server database.');
}

/* ==========================================================================
   Tab 9: Razorpay Gateway Configuration
   ========================================================================== */
async function loadRazorpaySettings() {
  try {
    const cfg = await adminApi('/api/settings/razorpay');
    const enCheck = document.getElementById('rzp-enabled-check');
    const envSelect = document.getElementById('rzp-env-select');
    const keyInput = document.getElementById('rzp-key-id');
    const secretInput = document.getElementById('rzp-key-secret');
    const brandInput = document.getElementById('rzp-brand-name');
    const colorInput = document.getElementById('rzp-theme-color');
    const simCheck = document.getElementById('rzp-simulate-check');
    const badge = document.getElementById('rzp-active-badge');

    if (enCheck) enCheck.checked = cfg.enabled !== false;
    if (envSelect) envSelect.value = cfg.env || 'live';
    if (keyInput) keyInput.value = cfg.keyId || 'rzp_live_Ti8AffHarb3tai';
    if (secretInput && cfg.keySecret) secretInput.value = cfg.keySecret;
    if (brandInput) brandInput.value = cfg.brandName || 'ODD Perfume';
    if (colorInput) colorInput.value = cfg.themeColor || '#E86B32';
    if (simCheck) simCheck.checked = cfg.simulate === true;
    if (badge) {
      const isLive = (cfg.env || 'live') === 'live';
      badge.className = `badge-status ${cfg.enabled !== false ? 'success' : 'danger'}`;
      badge.textContent = cfg.enabled !== false ? (isLive ? 'Live Gateway (Active)' : 'Test Mode Active') : 'Disabled';
    }
  } catch (err) {
    console.error('Failed to load Razorpay settings:', err);
  }
}

async function saveRazorpaySettings(event) {
  if (event) event.preventDefault();
  const cfg = {
    enabled: document.getElementById('rzp-enabled-check')?.checked ?? true,
    env: document.getElementById('rzp-env-select')?.value || 'live',
    keyId: document.getElementById('rzp-key-id')?.value?.trim() || 'rzp_live_Ti8AffHarb3tai',
    keySecret: document.getElementById('rzp-key-secret')?.value?.trim() || 'X4Ws6I0iovvSrTYh18i1nNjl',
    brandName: document.getElementById('rzp-brand-name')?.value?.trim() || 'ODD Perfume',
    themeColor: document.getElementById('rzp-theme-color')?.value?.trim() || '#E86B32',
    simulate: document.getElementById('rzp-simulate-check')?.checked ?? false
  };

  try {
    await adminApi('/api/settings/razorpay', { method: 'PUT', body: cfg });
    const msg = document.getElementById('rzp-saved-msg');
    if (msg) {
      msg.style.display = 'inline';
      setTimeout(() => { msg.style.display = 'none'; }, 2500);
    }
    const badge = document.getElementById('rzp-active-badge');
    if (badge) {
      const isLive = cfg.env === 'live';
      badge.className = `badge-status ${cfg.enabled ? 'success' : 'danger'}`;
      badge.textContent = cfg.enabled ? (isLive ? 'Live Gateway (Active)' : 'Test Mode Active') : 'Disabled';
    }
    showAdminToast(`Razorpay configuration saved (${cfg.env.toUpperCase()} mode).`);
  } catch (err) {
    showAdminToast(err.message || 'Failed to save Razorpay configuration', true);
  }
}

window.toggleSecretVisibility = function() {
  const input = document.getElementById('rzp-key-secret');
  const btn = document.getElementById('rzp-secret-toggle-btn');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btn) btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    if (btn) btn.textContent = 'Show';
  }
};



/* ==========================================================================
   Sign Out
   ========================================================================== */
async function signOut() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'X-CSRF-Token': csrfToken
      }
    });
  } catch (e) {}
  sessionStorage.removeItem('odd_csrf_token');
  localStorage.removeItem('odd_admin_session');
  localStorage.removeItem('odd_role');
  window.location.replace('admin-login.html');
}

/* ==========================================================================
   App Initialization
   ========================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Verify authentic server-side session
    let session = null;
    try {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.authenticated && data.user) {
          session = {
            authenticated: true,
            user: data.user,
            permissions: ADMIN_ROLE_PERMISSIONS[data.user.role] || ['*']
          };
          csrfToken = data.csrfToken || sessionStorage.getItem('odd_csrf_token') || '';
        }
      }
    } catch (netErr) {
      console.warn('Backend session verification request failed:', netErr);
    }

    if (!session || !session.authenticated) {
      window.location.replace('admin-login.html');
      return;
    }

    adminSession = session;

    // 2. Populate Header & Sidebar Info
    const userLabel = document.getElementById('admin-user-name');
    if (userLabel) userLabel.textContent = `${adminSession.user.name} · ${adminSession.user.role.toUpperCase()}`;

    setConnectionStatus('Production API Connected (Active)', true);

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
    document.getElementById('btn-toggle-scan-mode-quick')?.addEventListener('click', () => {
      setScannerMode(scannerMode === 'receive' ? 'dispatch' : 'receive');
    });
    document.getElementById('btn-start-camera')?.addEventListener('click', startCameraScanner);
    document.getElementById('btn-stop-camera')?.addEventListener('click', stopCameraScanner);
    document.getElementById('btn-switch-camera')?.addEventListener('click', switchCamera);
    document.getElementById('btn-toggle-torch')?.addEventListener('click', toggleTorch);
    document.querySelector('[data-generate-barcode]')?.addEventListener('click', generateBarcodeSheet);
    document.querySelector('[data-print-barcodes]')?.addEventListener('click', printBarcodeSheet);
    document.querySelector('#tab-inventory [data-export-inventory]')?.addEventListener('click', exportInventoryCSV);
    document.querySelector('#new-coupon-code')?.closest('form')?.addEventListener('submit', addNewCoupon);

    const bannerForm = document.getElementById('banner-active-check')?.closest('form');
    bannerForm?.addEventListener('submit', saveBannerSettings);

    const shippingForm = document.getElementById('shipping-settings-form');
    shippingForm?.addEventListener('submit', saveShippingSettings);

    const razorpayForm = document.getElementById('razorpay-settings-form');
    razorpayForm?.addEventListener('submit', saveRazorpaySettings);

    // Global USB / Bluetooth Hardware Barcode Scanner Keydown Listener
    let hardwareScanBuffer = '';
    let lastKeyTime = 0;

    window.addEventListener('keydown', (e) => {
      const activeNavTab = document.querySelector('.admin-nav-item[data-tab].active')?.dataset.tab;
      const scanInput = document.getElementById('barcode-scan-input');
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

      if (e.target === scanInput) return;
      if (isInput) return;
      if (activeNavTab !== 'scanner') return;

      const now = Date.now();
      if (now - lastKeyTime > 150) {
        hardwareScanBuffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (hardwareScanBuffer.trim().length >= 3) {
          e.preventDefault();
          if (scanInput) {
            scanInput.value = hardwareScanBuffer.trim();
            hardwareScanBuffer = '';
            const form = document.getElementById('barcode-scan-form');
            if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
          }
        }
        hardwareScanBuffer = '';
      } else if (e.key.length === 1) {
        hardwareScanBuffer += e.key;
      }
    });

    // Expose utility functions on window for inline handlers
    window.applyLabelPreset = applyLabelPreset;
    window.onCustomDimensionInput = onCustomDimensionInput;
    window.backToBarcodeSelection = backToBarcodeSelection;
    window.printBarcodeSheet = printBarcodeSheet;
    window.quickScanSimulate = quickScanSimulate;
    window.quickScanLatestOrder = quickScanLatestOrder;
    window.clearScanLog = clearScanLog;

  } catch (error) {
    console.error('Admin initialization error:', error);
    setConnectionStatus('Offline Local Storage Mode (Active)', true);
  }
});
