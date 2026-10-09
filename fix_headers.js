const fs = require('fs');
let css = fs.readFileSync('D:/AYAN/odd-perfume/assets/css/global.css', 'utf8');

// Banner fixed
css = css.replace('.launch-banner {\r\n    position: sticky;\r\n    top: 0;', '.launch-banner {\r\n    position: fixed;\r\n    top: 0;\r\n    left: 0;\r\n    width: 100%;');
css = css.replace('.launch-banner {\n    position: sticky;\n    top: 0;', '.launch-banner {\n    position: fixed;\n    top: 0;\n    left: 0;\n    width: 100%;');

// Header fixed
css = css.replace('.site-header {\r\n    position: sticky;', '.site-header {\r\n    position: fixed;\r\n    width: 100%;\r\n    left: 0;');
css = css.replace('.site-header {\n    position: sticky;', '.site-header {\n    position: fixed;\n    width: 100%;\n    left: 0;');

// Add padding to body to compensate for fixed headers
css = css.replace('body {\r\n    font-family: var(--font-sans);', 'body {\r\n    padding-top: calc(36px + 84px);\r\n    font-family: var(--font-sans);');
css = css.replace('body {\n    font-family: var(--font-sans);', 'body {\n    padding-top: calc(36px + 84px);\n    font-family: var(--font-sans);');

fs.writeFileSync('D:/AYAN/odd-perfume/assets/css/global.css', css);
console.log("Fixed headers applied");
