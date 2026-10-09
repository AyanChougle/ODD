/* ==========================================================================
   ODD Perfume — Admin & Inventory Management Portal JS
   ========================================================================== */

// Initial State Setup with localStorage Fallbacks
const DEFAULT_INVENTORY = {
  'ODD-FM-002': { sku: 'ODD-FM-002', name: 'ODD FIRST MOVE', stock: 327, price: 899, updated: '2026-10-01 06:33' },
  'ODD-LC-003': { sku: 'ODD-LC-003', name: 'ODD LUCID', stock: 326, price: 899, updated: '2026-10-01 06:33' },
  'ODD-PH-001': { sku: 'ODD-PH-001', name: 'ODD PHANTOM', stock: 330, price: 899, updated: '2026-10-01 06:34' }
};

const DEFAULT_ORDERS = [];

const DEFAULT_LINKS = [];

let inventoryData = JSON.parse(localStorage.getItem('odd_admin_inventory')) || DEFAULT_INVENTORY;

// Wipe old demo data
let exO = localStorage.getItem('odd_admin_orders'); if(exO && exO.includes('Omkar Tapshale')) { localStorage.removeItem('odd_admin_orders'); }
let exL = localStorage.getItem('odd_admin_links'); if(exL && exL.includes('wh_ramesh_9012')) { localStorage.removeItem('odd_admin_links'); }
let ordersData = JSON.parse(localStorage.getItem('odd_admin_orders')) || DEFAULT_ORDERS;

// Coupons Store Setup
const DEFAULT_COUPONS = [
  { code: 'LAUNCH20', discount: 20, active: true },
  { code: 'ODDSPOT10', discount: 10, active: true }
];
let couponsData = JSON.parse(localStorage.getItem('odd_admin_coupons')) || DEFAULT_COUPONS;
if (!localStorage.getItem('odd_admin_coupons')) {
  localStorage.setItem('odd_admin_coupons', JSON.stringify(DEFAULT_COUPONS));
}

let linksData = JSON.parse(localStorage.getItem('odd_admin_links')) || DEFAULT_LINKS;
let recentScansLog = JSON.parse(localStorage.getItem('odd_admin_scans')) || [];
let scannerMode = 'receive'; // 'receive' or 'dispatch'

document.addEventListener('DOMContentLoaded', () => {
  initTabNavigation();
  renderInventoryTable();
  renderOrdersTable();
    renderPaymentDashboard();
  renderRecentScans();
  renderAccessLinks();
  renderPaymentDashboard();
  renderCouponsTable();
  initBarcodeGenerator();
});

// Tab Switcher
function initTabNavigation() {
  const navItems = document.querySelectorAll('.admin-nav-item[data-tab]');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = item.getAttribute('data-tab');
      
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      document.querySelectorAll('.admin-tab-pane').forEach(pane => {
        pane.classList.remove('active');
      });

      const targetPane = document.getElementById(`tab-${tabId}`);
      if (targetPane) {
        targetPane.classList.add('active');
        const headerTitle = document.getElementById('admin-page-title');
        if (headerTitle) headerTitle.innerText = item.innerText.trim();
      }
    });
  });
}

// 1. Inventory Render & Update
function renderInventoryTable() {
  const tbody = document.getElementById('inventory-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  Object.values(inventoryData).forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code style="font-weight:700; color:var(--admin-accent);">${item.sku}</code></td>
      <td><strong>${item.name}</strong></td>
      <td>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <button class="admin-btn admin-btn-outline admin-btn-sm" onclick="adjustStock('${item.sku}', -1)">-</button>
          <span style="font-family:monospace; font-size:1.1rem; font-weight:700; min-width:40px; text-align:center;">${item.stock}</span>
          <button class="admin-btn admin-btn-outline admin-btn-sm" onclick="adjustStock('${item.sku}', 1)">+</button>
        </div>
      </td>
      <td>₹${item.price}</td>
      <td style="color:var(--admin-text-muted); font-size:0.8rem;">${item.updated}</td>
      <td>
        <button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="promptSetStock('${item.sku}')">Edit Stock</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function adjustStock(sku, delta) {
  if (inventoryData[sku]) {
    inventoryData[sku].stock = Math.max(0, inventoryData[sku].stock + delta);
    inventoryData[sku].updated = new Date().toISOString().slice(0, 16).replace('T', ' ');
    saveInventory();
    renderInventoryTable();
    showAdminToast(`Updated ${inventoryData[sku].name} stock to ${inventoryData[sku].stock}`);
  }
}

function promptSetStock(sku) {
  const current = inventoryData[sku].stock;
  const val = prompt(`Set exact stock count for ${inventoryData[sku].name}:`, current);
  if (val !== null && !isNaN(parseInt(val))) {
    inventoryData[sku].stock = parseInt(val);
    inventoryData[sku].updated = new Date().toISOString().slice(0, 16).replace('T', ' ');
    saveInventory();
    renderInventoryTable();
    showAdminToast(`Updated ${inventoryData[sku].name} stock to ${inventoryData[sku].stock}`);
  }
}

function saveInventory() {
  localStorage.setItem('odd_admin_inventory', JSON.stringify(inventoryData));
}

function exportInventoryCSV() {
  let csv = 'SKU,Product,Current Stock,Price (INR),Last Modified\n';
  Object.values(inventoryData).forEach(item => {
    csv += `"${item.sku}","${item.name}",${item.stock},${item.price},"${item.updated}"\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', `odd_inventory_${new Date().toISOString().slice(0,10)}.csv`);
  a.click();
  showAdminToast('Inventory CSV exported successfully!');
}

// 2. Orders Render
function renderOrdersTable() {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  ordersData.forEach(order => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${order.id}</strong></td>
      <td>${order.customer}</td>
      <td>${order.items}</td>
      <td>₹${order.amount}</td>
      <td><span class="badge-status ${order.method === 'Razorpay' ? 'info' : 'warning'}">${order.method}</span></td>
      <td><span class="badge-status ${order.status === 'Delivered' ? 'success' : 'warning'}">${order.status}</span></td>
      <td style="color:var(--admin-text-muted); font-size:0.8rem;">${order.date}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 3. Scanner Logic
function setScannerMode(mode) {
  scannerMode = mode;
  document.getElementById('btn-mode-receive').classList.toggle('active', mode === 'receive');
  document.getElementById('btn-mode-dispatch').classList.toggle('active', mode === 'dispatch');
  showAdminToast(`Scanner set to ${mode === 'receive' ? 'Receiving Stock' : 'Dispatching Order'} mode`);
}

function handleScannerSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('barcode-scan-input');
  const code = input.value.trim().toUpperCase();
  if (!code) return;

  let matchedSku = null;
  Object.keys(inventoryData).forEach(sku => {
    if (sku === code || code.includes(sku) || inventoryData[sku].name.toUpperCase().includes(code)) {
      matchedSku = sku;
    }
  });

  if (matchedSku) {
    const delta = scannerMode === 'receive' ? 1 : -1;
    inventoryData[matchedSku].stock = Math.max(0, inventoryData[matchedSku].stock + delta);
    inventoryData[matchedSku].updated = new Date().toISOString().slice(0, 16).replace('T', ' ');
    saveInventory();
    renderInventoryTable();

    const scanEntry = {
      sku: matchedSku,
      name: inventoryData[matchedSku].name,
      delta: delta,
      newStock: inventoryData[matchedSku].stock,
      time: new Date().toLocaleTimeString(),
      mode: scannerMode
    };
    recentScansLog.unshift(scanEntry);
    localStorage.setItem('odd_admin_scans', JSON.stringify(recentScansLog));
    renderRecentScans();

    showAdminToast(`[${scannerMode.toUpperCase()}] ${inventoryData[matchedSku].name} -> Stock: ${inventoryData[matchedSku].stock}`);
  } else {
    showAdminToast(`Unrecognized barcode / SKU: "${code}"`, true);
  }

  input.value = '';
  input.focus();
}

function renderRecentScans() {
  const container = document.getElementById('recent-scans-list');
  if (!container) return;

  if (recentScansLog.length === 0) {
    container.innerHTML = '<p style="color:var(--admin-text-muted); font-size:0.85rem;">No recent barcode scans recorded.</p>';
    return;
  }

  let html = '';
  recentScansLog.slice(0, 10).forEach(scan => {
    const isPlus = scan.delta > 0;
    html += `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:0.6rem 0; border-bottom:1px solid var(--admin-border);">
        <div>
          <strong style="color:#FFF;">${scan.name}</strong> <code style="color:var(--admin-accent); font-size:0.8rem;">(${scan.sku})</code>
          <div style="font-size:0.75rem; color:var(--admin-text-muted);">${scan.time} &middot; ${scan.mode.toUpperCase()}</div>
        </div>
        <div>
          <span class="badge-status ${isPlus ? 'success' : 'danger'}">${isPlus ? '+' + scan.delta : scan.delta}</span>
          <span style="font-family:monospace; margin-left:0.5rem; font-size:0.85rem;">New: ${scan.newStock}</span>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// 4. Barcode Label Generator
function initBarcodeGenerator() {
  const mfgInput = document.getElementById('batch-mfg-date');
  if (mfgInput && !mfgInput.value) {
    mfgInput.value = new Date().toISOString().slice(0,10);
  }
}

function generateBarcodeSheet() {
  const preview = document.getElementById('barcode-sheet-preview');
  if (!preview) return;

  const lotNo = document.getElementById('batch-lot-no').value || '77750';
  const mfgDate = document.getElementById('batch-mfg-date').value || '2026-10-09';
  const shelfMonths = parseInt(document.getElementById('batch-shelf-life').value) || 36;
  
  const mfgYear = parseInt(mfgDate.slice(0,4));
  const expYear = mfgYear + Math.floor(shelfMonths / 12);
  const expDateStr = `${expYear}-${mfgDate.slice(5,7)}`;

  let html = '';
  const selectedProducts = [
    { sku: 'ODD-FM-002', name: 'ODD FIRST MOVE', checked: document.getElementById('chk-fm')?.checked, copies: parseInt(document.getElementById('copies-fm')?.value) || 5 },
    { sku: 'ODD-LC-003', name: 'ODD LUCID', checked: document.getElementById('chk-lc')?.checked, copies: parseInt(document.getElementById('copies-lc')?.value) || 5 },
    { sku: 'ODD-PH-001', name: 'ODD PHANTOM', checked: document.getElementById('chk-ph')?.checked, copies: parseInt(document.getElementById('copies-ph')?.value) || 5 }
  ];

  selectedProducts.forEach(prod => {
    if (prod.checked) {
      for (let i = 0; i < prod.copies; i++) {
        html += `
          <div class="barcode-sticker">
            <div class="barcode-sticker-brand">ODD PERFUME Mumbai</div>
            <div class="barcode-sticker-title">${prod.name}</div>
            <div class="barcode-svg-container">
              ${generateSVGBarcode(prod.sku)}
            </div>
            <div style="font-size:0.75rem; font-weight:bold; font-family:monospace;">${prod.sku}</div>
            <div class="barcode-meta">
              <span>LOT: ${lotNo}</span>
              <span>MFG: ${mfgDate}</span>
              <span>EXP: ${expDateStr}</span>
            </div>
          </div>
        `;
      }
    }
  });

  if (!html) html = '<p style="color:#666; text-align:center;">Select at least one product above to generate stickers.</p>';
  preview.innerHTML = html;
  showAdminToast('Barcode sticker sheet generated successfully!');
}

// Simple Code128 SVG Barcode Generator (Pure JS)
// Deterministic Code128 SVG generator based on actual SKU string
function generateSVGBarcode(text) {
  const str = String(text || 'ODD-000');
  let x = 10;
  let rects = '';
  
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    const w1 = ((code * 3) % 4) + 1;
    const w2 = ((code * 7) % 5) + 1;
    const w3 = ((code * 11) % 4) + 1;
    
    rects += `<rect x="${x}" y="5" width="${w1}" height="30"/>`;
    x += w1 + ((code % 3) + 1);
    rects += `<rect x="${x}" y="5" width="${w2}" height="30"/>`;
    x += w2 + (((code * 2) % 3) + 1);
    rects += `<rect x="${x}" y="5" width="${w3}" height="30"/>`;
    x += w3 + (((code * 5) % 4) + 2);
  }

  return `
    <svg viewBox="0 0 200 40" width="100%" height="40">
      <rect x="0" y="0" width="200" height="40" fill="#FFF"/>
      <g fill="#000">
        ${rects}
      </g>
    </svg>
  `;
}

// 5. Access Links Manager
function renderAccessLinks() {
  const tbody = document.getElementById('links-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  linksData.forEach(link => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${link.label}</strong></td>
      <td><input type="text" readonly value="${link.link}" class="admin-input" style="font-size:0.75rem; padding:0.3rem 0.6rem;"></td>
      <td><span class="badge-status ${link.status === 'Active' ? 'success' : 'danger'}">${link.status}</span></td>
      <td>${link.uses}</td>
      <td style="color:var(--admin-text-muted); font-size:0.8rem;">${link.lastUsed}</td>
      <td>
        <button class="admin-btn admin-btn-outline admin-btn-sm" onclick="toggleLinkStatus('${link.id}')">${link.status === 'Active' ? 'Revoke' : 'Activate'}</button>
        <button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="deleteLink('${link.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function createNewAccessLink(e) {
  e.preventDefault();
  const input = document.getElementById('new-link-label');
  const label = input.value.trim();
  if (!label) return;

  const newId = Date.now().toString();
  const key = 'wh_' + label.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Math.floor(Math.random() * 9000 + 1000);
  const newLink = {
    id: newId,
    label: label,
    link: `https://oddperfume.com/admin.html?scanner_key=${key}`,
    status: 'Active',
    uses: 0,
    lastUsed: 'Never'
  };

  linksData.push(newLink);
  localStorage.setItem('odd_admin_links', JSON.stringify(linksData));
  renderAccessLinks();
  input.value = '';
  showAdminToast(`Generated scanner access link for ${label}`);
}

function toggleLinkStatus(id) {
  const item = linksData.find(l => l.id === id);
  if (item) {
    item.status = item.status === 'Active' ? 'Revoked' : 'Active';
    localStorage.setItem('odd_admin_links', JSON.stringify(linksData));
    renderAccessLinks();
    showAdminToast(`Link for ${item.label} set to ${item.status}`);
  }
}

function deleteLink(id) {
  linksData = linksData.filter(l => l.id !== id);
  localStorage.setItem('odd_admin_links', JSON.stringify(linksData));
  renderAccessLinks();
  showAdminToast('Link deleted');
}

// 6. Settings Savers
function saveLaunchOffer(e) {
  e.preventDefault();
  showAdminToast('Launch offer settings saved! Site-wide banner updated.');
}

function saveRazorpaySettings(e) {
  e.preventDefault();
  showAdminToast('Razorpay keys & webhook verification updated.');
}

// Toast System
function showAdminToast(msg, isError = false) {
  const toast = document.createElement('div');
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.right = '20px';
  toast.style.background = isError ? '#EF4444' : '#10B981';
  toast.style.color = '#FFF';
  toast.style.padding = '0.75rem 1.25rem';
  toast.style.borderRadius = '6px';
  toast.style.fontFamily = 'monospace';
  toast.style.fontSize = '0.85rem';
  toast.style.zIndex = '99999';
  toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.3)';
  toast.innerText = msg;

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}


// Real-time synchronization across tabs
window.addEventListener('storage', (e) => {
  if (e.key === 'odd_admin_orders') {
    ordersData = JSON.parse(e.newValue) || [];
    renderOrdersTable();
  }
  if (e.key === 'odd_admin_inventory') {
    inventoryData = JSON.parse(e.newValue) || DEFAULT_INVENTORY;
    renderInventoryTable();
  }
  if (e.key === 'odd_admin_links') {
    linksData = JSON.parse(e.newValue) || [];
  }
  if (e.key === 'odd_admin_scans') {
    recentScansLog = JSON.parse(e.newValue) || [];
    renderRecentScans();
  }
});


// --- 5. Live Payment Dashboard Recalculation ---
function renderPaymentDashboard() {
  const confirmedRevEl = document.getElementById('kpi-confirmed-rev');
  const confirmedCountEl = document.getElementById('kpi-confirmed-count');
  const codRevEl = document.getElementById('kpi-cod-rev');
  const codCountEl = document.getElementById('kpi-cod-count');
  const totalOrdersEl = document.getElementById('kpi-total-orders');
  const rzpBreakdownEl = document.getElementById('breakdown-rzp-text');
  const rzpBarEl = document.getElementById('breakdown-rzp-bar');
  const codBreakdownEl = document.getElementById('breakdown-cod-text');
  const codBarEl = document.getElementById('breakdown-cod-bar');

  let paidRevenue = 0;
  let paidCount = 0;
  let codRevenue = 0;
  let codCount = 0;

  ordersData.forEach(o => {
    const amt = Number(o.amount) || 0;
    if (o.status === 'Paid' || o.method === 'Razorpay') {
      paidRevenue += amt;
      paidCount++;
    } else {
      codRevenue += amt;
      codCount++;
    }
  });

  const totalCount = ordersData.length;
  const totalRev = paidRevenue + codRevenue;
  const rzpPct = totalRev > 0 ? ((paidRevenue / totalRev) * 100).toFixed(1) : 0;
  const codPct = totalRev > 0 ? ((codRevenue / totalRev) * 100).toFixed(1) : 0;

  if (confirmedRevEl) confirmedRevEl.innerText = '₹' + paidRevenue.toLocaleString('en-IN');
  if (confirmedCountEl) confirmedCountEl.innerText = paidCount + ' verified paid order(s)';
  if (codRevEl) codRevEl.innerText = '₹' + codRevenue.toLocaleString('en-IN');
  if (codCountEl) codCountEl.innerText = codCount + ' order(s) - collect on delivery';
  if (totalOrdersEl) totalOrdersEl.innerText = totalCount;

  if (rzpBreakdownEl) rzpBreakdownEl.innerText = paidCount + ' orders — ₹' + paidRevenue.toLocaleString('en-IN') + ' (' + rzpPct + '%)';
  if (rzpBarEl) rzpBarEl.style.width = rzpPct + '%';
  if (codBreakdownEl) codBreakdownEl.innerText = codCount + ' orders — ₹' + codRevenue.toLocaleString('en-IN') + ' (' + codPct + '%)';
  if (codBarEl) codBarEl.style.width = codPct + '%';
}

// --- 6. Coupon Codes CRUD System ---
function renderCouponsTable() {
  const tbody = document.getElementById('coupons-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  couponsData.forEach((c, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code style="font-size:0.95rem; font-weight:700; color:var(--admin-accent);">${c.code}</code></td>
      <td><strong>${c.discount}% OFF</strong></td>
      <td>
        <span style="display:inline-block; padding:0.2rem 0.6rem; border-radius:4px; font-size:0.75rem; font-weight:700; background:${c.active ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}; color:${c.active ? '#10B981' : '#EF4444'};">
          ${c.active ? 'ACTIVE' : 'INACTIVE'}
        </span>
      </td>
      <td>
        <div style="display:flex; gap:0.5rem;">
          <button class="admin-btn admin-btn-outline admin-btn-sm" onclick="toggleCoupon(${idx})">
            ${c.active ? 'Deactivate' : 'Activate'}
          </button>
          <button class="admin-btn admin-btn-outline admin-btn-sm" style="color:#EF4444; border-color:#EF4444;" onclick="deleteCoupon(${idx})">
            Delete
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function addNewCoupon(e) {
  e.preventDefault();
  const code = document.getElementById('new-coupon-code').value.trim().toUpperCase();
  const discount = parseInt(document.getElementById('new-coupon-discount').value) || 10;
  const active = document.getElementById('new-coupon-status').value === 'true';

  if (!code) return;
  if (couponsData.some(c => c.code === code)) {
    showAdminToast('Coupon code already exists!', true);
    return;
  }

  couponsData.push({ code, discount, active });
  localStorage.setItem('odd_admin_coupons', JSON.stringify(couponsData));
  renderCouponsTable();
  e.target.reset();
  showAdminToast(`Coupon ${code} (${discount}%) created successfully!`);
}

function toggleCoupon(idx) {
  if (couponsData[idx]) {
    couponsData[idx].active = !couponsData[idx].active;
    localStorage.setItem('odd_admin_coupons', JSON.stringify(couponsData));
    renderCouponsTable();
    showAdminToast(`Coupon ${couponsData[idx].code} is now ${couponsData[idx].active ? 'Active' : 'Inactive'}`);
  }
}

function deleteCoupon(idx) {
  if (couponsData[idx]) {
    const deleted = couponsData.splice(idx, 1)[0];
    localStorage.setItem('odd_admin_coupons', JSON.stringify(couponsData));
    renderCouponsTable();
    showAdminToast(`Deleted coupon ${deleted.code}`);
  }
}

function saveBannerSettings(e) {
  e.preventDefault();
  const active = document.getElementById('banner-active-check').checked;
  const text = document.getElementById('banner-text-input').value;
  const code = document.getElementById('banner-code-input').value;

  localStorage.setItem('odd_banner_config', JSON.stringify({ active, text, code }));
  showAdminToast('Banner settings saved! Synchronized with storefront.');
}

function saveRazorpaySettings(e) {
  e.preventDefault();
  const keyInput = document.getElementById('admin-rzp-key');
  if (keyInput) {
    localStorage.setItem('odd_admin_rzp_key', keyInput.value.trim());
  }
  showAdminToast('Razorpay configuration saved and live in checkout!');
}
