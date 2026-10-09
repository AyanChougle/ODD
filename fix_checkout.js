const fs = require('fs');
let js = fs.readFileSync('D:/AYAN/odd-perfume/assets/js/checkout.js', 'utf8');

js = js.replace(/function processPageOrder\(e\) \{[\s\S]*?e\.preventDefault\(\);/, (match) => {
  return match + `
  const inv = JSON.parse(localStorage.getItem('odd_admin_inventory') || '{}');
  for (let item of cartState) {
    if (inv[item.id] !== undefined && inv[item.id] < item.qty) {
      showToast('Error: ' + item.name + ' is out of stock or insufficient quantity.');
      return;
    }
  }
  
  // Deduct inventory
  for (let item of cartState) {
    if (inv[item.id] !== undefined) {
      inv[item.id] -= item.qty;
    }
  }
  localStorage.setItem('odd_admin_inventory', JSON.stringify(inv));
  `;
});

fs.writeFileSync('D:/AYAN/odd-perfume/assets/js/checkout.js', js);
console.log('Checkout logic fixed');
