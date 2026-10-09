const fs = require('fs');
let js = fs.readFileSync('D:/AYAN/odd-perfume/assets/js/global.js', 'utf8');

const scrollSpyCode = `
function initScrollSpy() {
  const sections = [
    { id: 'story', link: 'index.html#story' },
    { id: 'comparison', link: 'index.html#comparison' },
    { id: 'showcase', link: 'index.html#showcase' },
    { id: 'hero-top', link: 'index.html' } // fallback for top
  ];
  
  window.addEventListener('scroll', () => {
    let current = '';
    const scrollPos = window.scrollY + 200; // offset
    
    // Check from bottom to top
    for (let s of sections) {
      if (s.id === 'hero-top') {
        if (scrollPos < 500) { current = s.link; break; }
        continue;
      }
      const el = document.getElementById(s.id);
      if (el && el.offsetTop <= scrollPos) {
        current = s.link;
        break;
      }
    }
    
    if (current) {
      document.querySelectorAll('.main-nav-link').forEach(a => {
        if (a.getAttribute('href') === current) {
          a.classList.add('active');
        } else {
          // don't remove if it's an external link like shop.html that shouldn't be active anyway
          if(a.getAttribute('href') !== 'shop.html' || current === 'shop.html') {
             a.classList.remove('active');
          }
        }
      });
    }
  });
}
`;

js = js.replace(/document\.addEventListener\('DOMContentLoaded',\s*\(\)\s*=>\s*\{/, (match) => {
  return match + '\n  if (typeof initScrollSpy === \'function\') initScrollSpy();';
});
js += '\n' + scrollSpyCode;

fs.writeFileSync('D:/AYAN/odd-perfume/assets/js/global.js', js);
console.log('ScrollSpy added');
