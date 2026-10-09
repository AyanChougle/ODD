/* Order Tracking Page JavaScript */
function submitOrderTracking(e) {
  e.preventDefault();
  const res = document.getElementById('tracking-result');
  if (res) res.style.display = 'block';
  showToast('Found Order #ODD-89421 in system.');
}
