/* Home Page JavaScript Logic */

const showcaseItems = ['phantom', 'lucid', 'first-move'];
let activeShowcaseIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
  updateShowcaseCarousel();
});

// --- 3D Perspective Showcase Carousel Engine ---
function rotateShowcase(direction) {
  if (direction === 'next') {
    activeShowcaseIndex = (activeShowcaseIndex + 1) % showcaseItems.length;
  } else if (direction === 'prev') {
    activeShowcaseIndex = (activeShowcaseIndex - 1 + showcaseItems.length) % showcaseItems.length;
  }
  updateShowcaseCarousel();
}

function selectShowcaseSlide(index) {
  activeShowcaseIndex = index;
  updateShowcaseCarousel();
}

function updateShowcaseCarousel() {
  const slides = document.querySelectorAll('.carousel-slide');
  if (!slides || slides.length === 0) return;

  const total = showcaseItems.length;

  slides.forEach((slide, idx) => {
    slide.classList.remove('active', 'prev', 'next');

    if (idx === activeShowcaseIndex) {
      slide.classList.add('active');
    } else if (idx === (activeShowcaseIndex - 1 + total) % total) {
      slide.classList.add('prev');
    } else if (idx === (activeShowcaseIndex + 1) % total) {
      slide.classList.add('next');
    }
  });
}
