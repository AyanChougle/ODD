'use strict';

/* ==========================================================================
   ODD Perfume — Scent Quiz Engine (find-your-scent.html)
   ========================================================================== */

let currentQuizStep = 1;
let quizScores = { 'phantom': 0, 'lucid': 0, 'first-move': 0 };
let matchedPerfumeId = 'first-move';

window.answerQuiz = function(step, optionType) {
  if (quizScores[optionType] !== undefined) {
    quizScores[optionType] += 1;
  }

  if (step < 5) {
    currentQuizStep = step + 1;
    const bar = document.getElementById('quiz-progress-bar');
    if (bar) bar.style.width = `${currentQuizStep * 20}%`;

    document.querySelectorAll('.quiz-step').forEach(el => el.classList.remove('active'));
    const nextStep = document.querySelector(`.quiz-step[data-step="${currentQuizStep}"]`);
    if (nextStep) nextStep.classList.add('active');
  } else {
    showQuizResult();
  }
};

window.showQuizResult = function() {
  document.querySelectorAll('.quiz-step').forEach(el => el.classList.remove('active'));
  const bar = document.getElementById('quiz-progress-bar');
  if (bar) bar.style.width = '100%';

  let winner = 'first-move';
  let maxScore = -1;

  for (const [key, val] of Object.entries(quizScores)) {
    if (val > maxScore) {
      maxScore = val;
      winner = key;
    }
  }

  matchedPerfumeId = winner;
  const prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[winner]) ? PRODUCTS[winner] : { name: winner, price: 899, notes: '' };
  const availability = (typeof getProductAvailability === 'function') ? getProductAvailability(winner) : { stock: winner === 'first-move' ? 0 : 100 };
  const isOutOfStock = availability.stock <= 0;

  const resTitle = document.getElementById('quiz-res-title');
  const resDesc = document.getElementById('quiz-res-desc');
  const addBtn = document.getElementById('quiz-add-btn');

  if (resTitle) resTitle.innerText = prod.name;
  if (resDesc) {
    resDesc.innerText = `Based on your lifestyle and preferences, your signature match is ${prod.name} (${prod.notes}). Crafted in India with 30% fragrance concentration for long projection.`;
  }

  if (addBtn) {
    if (isOutOfStock) {
      addBtn.disabled = true;
      addBtn.innerText = `${prod.name} — Currently Out of Stock`;
      addBtn.classList.add('btn-disabled');
    } else {
      addBtn.disabled = false;
      addBtn.innerText = `Add ${prod.name} To Cart — ₹${Number(prod.price || 899).toLocaleString('en-IN')}`;
      addBtn.classList.remove('btn-disabled');
    }
  }

  const resView = document.getElementById('quiz-result');
  if (resView) resView.style.display = 'block';
};

window.addQuizMatchToCart = function() {
  const availability = (typeof getProductAvailability === 'function') ? getProductAvailability(matchedPerfumeId) : { stock: matchedPerfumeId === 'first-move' ? 0 : 100 };
  if (availability.stock <= 0) {
    if (typeof showToast === 'function') {
      showToast('This signature fragrance is currently out of stock.');
    } else {
      alert('This signature fragrance is currently out of stock.');
    }
    return;
  }

  if (typeof addToCart === 'function') {
    addToCart(matchedPerfumeId);
  }
  if (typeof toggleCartDrawer === 'function') {
    toggleCartDrawer();
  }
};

window.resetQuiz = function() {
  quizScores = { 'phantom': 0, 'lucid': 0, 'first-move': 0 };
  currentQuizStep = 1;
  matchedPerfumeId = 'first-move';

  const bar = document.getElementById('quiz-progress-bar');
  if (bar) bar.style.width = '20%';

  const resView = document.getElementById('quiz-result');
  if (resView) resView.style.display = 'none';

  document.querySelectorAll('.quiz-step').forEach(el => el.classList.remove('active'));
  const firstStep = document.querySelector('.quiz-step[data-step="1"]');
  if (firstStep) firstStep.classList.add('active');
};
