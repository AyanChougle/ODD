const fs = require('fs');
let js = fs.readFileSync('D:/AYAN/odd-perfume/assets/js/checkout.js', 'utf8');

js = js.replace(/function renderCheckoutSummary\(\) \{[\s\S]*?let html = '';/, (match) => {
  return match + `
  const inv = JSON.parse(localStorage.getItem('odd_admin_inventory') || '{}');
  let hasOutOfStock = false;
  `;
});

js = js.replace(/html \+= \`<div class="summary-item">[\s\S]*?<\/div>\`;/, (match) => {
  return `
    const isOutOfStock = (inv[item.id] !== undefined && inv[item.id] < item.qty);
    if (isOutOfStock) hasOutOfStock = true;
    html += \`<div class="summary-item" \${isOutOfStock ? 'style="opacity: 0.5; border: 1px solid red;"' : ''}>\` +
      \`<img src="\${item.img}" alt="\${item.name}">\` +
      \`<div class="summary-item-details">\` +
        \`<h4>\${item.name} \${isOutOfStock ? '<span style="color:red;font-size:0.7rem;">(Out of Stock)</span>' : ''}</h4>\` +
        \`<p>Qty: \${item.qty}</p>\` +
      \`</div>\` +
      \`<div class="summary-item-price">&#8377;\${item.price * item.qty}</div>\` +
    \`</div>\`;
  `;
});

js = js.replace(/document\.getElementById\('checkout-summary-list'\)\.innerHTML = html;/, (match) => {
  return match + `
  if (hasOutOfStock) {
    const btn = document.querySelector('button[onclick="processPageOrder(event)"]');
    if (btn) {
       btn.disabled = true;
       btn.style.background = '#666';
       btn.innerText = 'Remove out of stock items';
    }
  }
  `;
});

fs.writeFileSync('D:/AYAN/odd-perfume/assets/js/checkout.js', js);
console.log('Checkout UI updated for out of stock');
