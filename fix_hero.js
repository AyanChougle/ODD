const fs = require('fs');
let css = fs.readFileSync('D:/AYAN/odd-perfume/assets/css/home.css', 'utf8');
css = css.replace(/height: calc\(100dvh[\s\S]*?\);/, 'height: calc(100vh - 120px);\n  max-height: 780px;');
css = css.replace(/height: calc\(100vh - 170px\);/, '');
fs.writeFileSync('D:/AYAN/odd-perfume/assets/css/home.css', css);
