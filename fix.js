const fs = require('fs');
let html = fs.readFileSync('D:/AYAN/odd-perfume/my-account.html', 'utf8');

html = html.replace(/onclick="showToast\('Set as default.'\)"/g, 'onclick="setDefaultAddress(this)"');
html = html.replace(/onclick="showToast\('Edit address modal opened.'\)"/g, 'onclick="openEditModal(this)"');

let addModalHtml = html.substring(html.indexOf('<!-- Add Address Modal -->'), html.indexOf('<script>', html.indexOf('<!-- Add Address Modal -->')));
let editModalHtml = addModalHtml.replace('id="address-modal"', 'id="edit-address-modal"')
  .replace('Add New Address', 'Edit Address')
  .replace('id="addr-form"', 'id="edit-addr-form"')
  .replace('onsubmit="saveCustomerAddress(event)"', 'onsubmit="saveEditAddress(event)"')
  .replace(/id="addr-/g, 'id="edit-addr-')
  .replace('Save Address', 'Update Address')
  .replace('hideAddAddressModal()', 'hideEditAddressModal()');

if (!html.includes('id="edit-address-modal"')) {
  html = html.replace('<script>', editModalHtml + '\n<script>');
}

let jsLogic = `
let currentEditCard = null;

function openEditModal(btn) {
  currentEditCard = btn.closest('.address-card');
  const name = currentEditCard.querySelector('h4').innerText;
  const pText = currentEditCard.querySelector('p').innerText.split('\\n');
  
  document.getElementById('edit-addr-name').value = name;
  document.getElementById('edit-addr-street').value = pText[0] || '';
  
  let cityPin = pText[1] || '';
  let city = cityPin.split(' – ')[0] || '';
  let pin = cityPin.split(' – ')[1] || '';
  document.getElementById('edit-addr-city').value = city.trim();
  document.getElementById('edit-addr-pin').value = pin.trim();
  
  let phoneLine = pText.find(line => line.includes('Phone:'));
  document.getElementById('edit-addr-phone').value = phoneLine ? phoneLine.replace('Phone:', '').trim() : '';
  
  document.getElementById('edit-address-modal').style.display = 'flex';
}

function hideEditAddressModal() {
  document.getElementById('edit-address-modal').style.display = 'none';
}

function saveEditAddress(e) {
  e.preventDefault();
  if(!currentEditCard) return;
  
  const name = document.getElementById('edit-addr-name').value;
  const street = document.getElementById('edit-addr-street').value;
  const city = document.getElementById('edit-addr-city').value;
  const pin = document.getElementById('edit-addr-pin').value;
  const phone = document.getElementById('edit-addr-phone').value;
  
  currentEditCard.querySelector('h4').innerText = name;
  currentEditCard.querySelector('p').innerHTML = street + '<br>' + city + ' &ndash; ' + pin + '<br>India<br><strong>Phone:</strong> ' + phone;
  
  hideEditAddressModal();
  showToast('Address updated successfully.');
}

function setDefaultAddress(btn) {
  const card = btn.closest('.address-card');
  
  document.querySelectorAll('.address-card').forEach(c => {
    c.style.borderColor = 'var(--border-color)';
    c.style.background = '#FFF';
    const tag = c.querySelector('.default-tag');
    if(tag) tag.remove();
    
    const dBtn = c.querySelector('.make-def-btn');
    if(dBtn) {
       dBtn.innerText = 'Make Default';
       dBtn.setAttribute('onclick', 'setDefaultAddress(this)');
    }
  });
  
  card.style.borderColor = 'var(--brand-orange)';
  card.style.background = 'rgba(232,107,50,0.03)';
  
  let tag = document.createElement('span');
  tag.className = 'default-tag';
  tag.style.cssText = 'position:absolute; top:12px; right:12px; background:var(--brand-orange); color:#fff; font-size:0.65rem; font-family:var(--font-mono); font-weight:700; padding:0.2rem 0.5rem; border-radius:4px;';
  tag.innerText = 'DEFAULT';
  card.appendChild(tag);
  
  btn.innerText = 'Default';
  btn.setAttribute('onclick', "showToast('Address is already default.')");
  
  showToast('Default address updated.');
}
`;

if (!html.includes('function setDefaultAddress')) {
  html = html.replace('function saveCustomerAddress(e) {', jsLogic + '\nfunction saveCustomerAddress(e) {');
}

let newCardHtml = `<button class="btn btn-sm btn-outline make-def-btn" onclick="setDefaultAddress(this)">Make Default</button>
      <button class="btn btn-sm btn-outline" onclick="openEditModal(this)">Edit</button>
      <button class="btn btn-sm btn-outline" style="color:#d32f2f;" onclick="this.closest('.address-card').remove(); showToast('Address deleted.')">Delete</button>`;
html = html.replace(/<button class="btn btn-sm btn-outline" onclick="showToast\('Set as default.'\)">Make Default<\/button>[\s\S]*?Delete<\/button>/, newCardHtml);

html = html.replace(/<button class="btn btn-sm btn-outline" onclick="showToast\('Address is already default.'\)">Default<\/button>/g, '<button class="btn btn-sm btn-outline make-def-btn" onclick="showToast(\'Address is already default.\')">Default</button>');
html = html.replace(/<span style="position:absolute; top:12px; right:12px; background:var\(--brand-orange\);/g, '<span class="default-tag" style="position:absolute; top:12px; right:12px; background:var(--brand-orange);');

fs.writeFileSync('D:/AYAN/odd-perfume/my-account.html', html);
console.log('Saved my-account.html');
