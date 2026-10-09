const fs = require('fs');
let css = fs.readFileSync('D:/AYAN/odd-perfume/assets/css/home.css', 'utf8');

css += `
html {
  scroll-snap-type: y proximity;
  scroll-padding-top: calc(var(--banner-height, 36px) + var(--header-height, 84px));
}

.hero-section,
.showcase-section,
#comparison,
.story-section-landing {
  scroll-snap-align: start;
}
`;

fs.writeFileSync('D:/AYAN/odd-perfume/assets/css/home.css', css);
console.log('Scroll snap added');
