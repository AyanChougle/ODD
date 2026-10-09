const fs = require('fs');
let css = fs.readFileSync('D:/AYAN/odd-perfume/assets/css/global.css', 'utf8');
css = css.replace('.launch-banner {\r\n    background-color: #111111;\r\n    color: var(--text-light);\r\n    font-family: var(--font-mono);\r\n    font-size: 0.78rem;\r\n    padding: 0.6rem 0;\r\n    position: relative;\r\n    z-index: 1000;', 
'.launch-banner {\r\n    background-color: #111111;\r\n    color: var(--text-light);\r\n    font-family: var(--font-mono);\r\n    font-size: 0.78rem;\r\n    padding: 0.6rem 0;\r\n    position: relative;\r\n    z-index: 800;');
// if it used \n instead of \r\n
css = css.replace('.launch-banner {\n    background-color: #111111;\n    color: var(--text-light);\n    font-family: var(--font-mono);\n    font-size: 0.78rem;\n    padding: 0.6rem 0;\n    position: relative;\n    z-index: 1000;', 
'.launch-banner {\n    background-color: #111111;\n    color: var(--text-light);\n    font-family: var(--font-mono);\n    font-size: 0.78rem;\n    padding: 0.6rem 0;\n    position: relative;\n    z-index: 800;');
fs.writeFileSync('D:/AYAN/odd-perfume/assets/css/global.css', css);
console.log('Fixed launch banner z-index');
