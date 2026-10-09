const fs = require('fs');
let css = fs.readFileSync('D:/AYAN/odd-perfume/assets/css/home.css', 'utf8');
css = css.replace('min-height: 40vh; max-height: 450px;', 'min-height: 480px;');
fs.writeFileSync('D:/AYAN/odd-perfume/assets/css/home.css', css);
