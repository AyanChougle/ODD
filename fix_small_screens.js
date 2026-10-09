const fs = require('fs');
let css = fs.readFileSync('D:/AYAN/odd-perfume/assets/css/home.css', 'utf8');

css = css.replace(/min-height: 480px;/g, 'min-height: 40vh; max-height: 450px;');
css = css.replace(/min-height: 280px;/g, 'min-height: 220px;');

// Also fix phantom slide box scale if needed, but it's fine.
fs.writeFileSync('D:/AYAN/odd-perfume/assets/css/home.css', css);
