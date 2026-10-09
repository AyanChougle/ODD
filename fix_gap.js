const fs = require('fs');
let css = fs.readFileSync('D:/AYAN/odd-perfume/assets/css/home.css', 'utf8');
css = css.replace('.hero-giant-odd {\r\n  font-family: var(--font-serif);', '.hero-giant-odd {\r\n  margin-top: 0;\r\n  font-family: var(--font-serif);');
css = css.replace('.hero-giant-odd {\n  font-family: var(--font-serif);', '.hero-giant-odd {\n  margin-top: 0;\n  font-family: var(--font-serif);');
fs.writeFileSync('D:/AYAN/odd-perfume/assets/css/home.css', css);
