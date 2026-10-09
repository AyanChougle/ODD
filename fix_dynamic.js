const fs = require('fs');
let globalCss = fs.readFileSync('D:/AYAN/odd-perfume/assets/css/global.css', 'utf8');

// Ensure root has total-header-height
if (!globalCss.includes('--total-header-height')) {
  globalCss = globalCss.replace(':root {', ':root {\r\n    --total-header-height: calc(var(--banner-height, 36px) + var(--header-height, 84px));');
}

// Update body padding
globalCss = globalCss.replace(/padding-top: calc\(36px \+ 84px\);/g, 'padding-top: var(--total-header-height);');

// Make sure banner has transition if needed, but not necessary.
fs.writeFileSync('D:/AYAN/odd-perfume/assets/css/global.css', globalCss);

let homeCss = fs.readFileSync('D:/AYAN/odd-perfume/assets/css/home.css', 'utf8');
homeCss = homeCss.replace(/calc\(100vh - 120px\)/g, 'calc(100vh - var(--total-header-height))');
fs.writeFileSync('D:/AYAN/odd-perfume/assets/css/home.css', homeCss);

let globalJs = fs.readFileSync('D:/AYAN/odd-perfume/assets/js/global.js', 'utf8');
globalJs = globalJs.replace(/document\.body\.style\.paddingTop = '84px';/g, 'document.documentElement.style.setProperty(\'--banner-height\', \'0px\');');
fs.writeFileSync('D:/AYAN/odd-perfume/assets/js/global.js', globalJs);

console.log('Dynamic heights configured');
