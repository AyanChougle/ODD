const fs = require('fs');
let js = fs.readFileSync('D:/AYAN/odd-perfume/assets/js/global.js', 'utf8');
js = js.replace('function closeBanner() {\r\n  const banner = document.getElementById(\'launch-banner\');\r\n  if (banner) banner.style.display = \'none\';\r\n}', 'function closeBanner() {\r\n  const banner = document.getElementById(\'launch-banner\');\r\n  if (banner) banner.style.display = \'none\';\r\n  document.getElementById(\'site-header\').style.top = \'0\';\r\n  document.body.style.paddingTop = \'84px\';\r\n}');
js = js.replace('function closeBanner() {\n  const banner = document.getElementById(\'launch-banner\');\n  if (banner) banner.style.display = \'none\';\n}', 'function closeBanner() {\n  const banner = document.getElementById(\'launch-banner\');\n  if (banner) banner.style.display = \'none\';\n  document.getElementById(\'site-header\').style.top = \'0\';\n  document.body.style.paddingTop = \'84px\';\n}');
fs.writeFileSync('D:/AYAN/odd-perfume/assets/js/global.js', js);
console.log("Updated closeBanner");
