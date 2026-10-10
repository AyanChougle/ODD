const fs = require('fs');
const glob = fs.readdirSync('.');
const funcs = new Set();

glob.forEach(f => {
  if (f.endsWith('.html')) {
    const content = fs.readFileSync(f, 'utf8');
    const matches = content.match(/onclick="[^"]*"/g) || [];
    matches.forEach(m => {
      const fn = m.replace('onclick="', '').replace('"', '').split('(')[0].trim();
      if (fn) funcs.add(fn);
    });
  }
});

console.log('All onclick functions in HTML files:', Array.from(funcs));

const jsGlobal = fs.readFileSync('assets/js/global.js', 'utf8');
const jsHome = fs.existsSync('assets/js/home.js') ? fs.readFileSync('assets/js/home.js', 'utf8') : '';
const jsAll = jsGlobal + '\n' + jsHome;

Array.from(funcs).forEach(fn => {
  const exists = jsAll.includes('function ' + fn) || jsAll.includes(fn + ' =') || jsAll.includes(fn + '(');
  console.log(`Function '${fn}': ${exists ? 'EXISTS' : 'MISSING'}`);
});
