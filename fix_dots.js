const fs = require('fs');
let js = fs.readFileSync('D:/AYAN/odd-perfume/assets/js/global.js', 'utf8');

js = js.replace(/function selectShowcaseSlide\(index\) \{[\s\S]*?slide\.classList\.add\('active'\);\r?\n\s*\}/, (match) => {
  return match + `
    const dots = document.querySelectorAll('.carousel-dot');
    if (dots.length > 0) {
      dots.forEach((dot, i) => {
        dot.style.background = (i === index) ? 'var(--brand-orange)' : '#ccc';
      });
    }`;
});

fs.writeFileSync('D:/AYAN/odd-perfume/assets/js/global.js', js);
