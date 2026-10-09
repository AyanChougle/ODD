const fs = require('fs');
let js = fs.readFileSync('D:/AYAN/odd-perfume/assets/js/global.js', 'utf8');
js = js.replace(/document\.addEventListener\('DOMContentLoaded',\s*\(\)\s*=>\s*\{[\s\S]*?updateCartUI\(\);\s*\}\);/, `document.addEventListener('DOMContentLoaded', () => {
  initCountdownTimer();
  updateCartUI();
  if (typeof initScrollReveal === 'function') initScrollReveal();
  if (typeof syncStockStatusUI === 'function') syncStockStatusUI();
});`);
fs.writeFileSync('D:/AYAN/odd-perfume/assets/js/global.js', js);
