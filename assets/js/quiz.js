/* Quiz Page JavaScript Engine */
let currentQuizStep = 1;
let quizScores = { 'phantom': 0, 'lucid': 0, 'first-move': 0 };

function answerQuiz(step, optionType) {
  quizScores[optionType] += 1;

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
}

function showQuizResult() {
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

  const prod = PRODUCTS[winner];
  if (!prod) return;
  const resTitle = document.getElementById('quiz-res-title');
  const resDesc = document.getElementById('quiz-res-desc');
  const addBtn = document.getElementById('quiz-add-btn');

  if (resTitle) resTitle.innerText = prod.name;
  if (resDesc) resDesc.innerText = `Based on your profile, your signature match is ${prod.name} (${prod.notes}). Formulated for long wear and maximum projection.`;
  if (addBtn) {
    addBtn.innerText = `Add ${prod.name} To Bag — ₹${prod.price}`;
    addBtn.setAttribute('onclick', `addToCart('${winner}')`);
  }

  const resView = document.getElementById('quiz-result');
  if (resView) resView.style.display = 'block';
}

function resetQuiz() {
  quizScores = { 'phantom': 0, 'lucid': 0, 'first-move': 0 };
  currentQuizStep = 1;
  const bar = document.getElementById('quiz-progress-bar');
  if (bar) bar.style.width = '20%';
  const resView = document.getElementById('quiz-result');
  if (resView) resView.style.display = 'none';
  document.querySelectorAll('.quiz-step').forEach(el => el.classList.remove('active'));
  const firstStep = document.querySelector('.quiz-step[data-step="1"]');
  if (firstStep) firstStep.classList.add('active');
}
