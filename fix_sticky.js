const fs = require('fs');
let css = fs.readFileSync('D:/AYAN/odd-perfume/assets/css/global.css', 'utf8');
css = css.replace('.launch-banner {\r\n    background-color: #111111;', '.launch-banner {\r\n    position: sticky;\r\n    top: 0;\r\n    background-color: #111111;');
css = css.replace('.launch-banner {\n    background-color: #111111;', '.launch-banner {\n    position: sticky;\n    top: 0;\n    background-color: #111111;');

css = css.replace('.site-header {\r\n    position: sticky;\r\n    top: 0;', '.site-header {\r\n    position: sticky;\r\n    top: var(--banner-height, 36px);');
css = css.replace('.site-header {\n    position: sticky;\n    top: 0;', '.site-header {\n    position: sticky;\n    top: var(--banner-height, 36px);');

fs.writeFileSync('D:/AYAN/odd-perfume/assets/css/global.css', css);
