const fs = require('fs');
let css = fs.readFileSync('D:/AYAN/odd-perfume/assets/css/home.css', 'utf8');
css = css.replace('min-height: 650px;', 'min-height: 50vh; max-height: 500px;');
fs.writeFileSync('D:/AYAN/odd-perfume/assets/css/home.css', css);
