const fs = require('fs');
const path = require('path');

const rootDir = 'D:/AYAN/odd-perfume';
const htmlFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));

console.log('Auditing duplicate scripts in all HTML files:');
htmlFiles.forEach(file => {
  const content = fs.readFileSync(path.join(rootDir, file), 'utf8');
  const scripts = [...content.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi)].map(m => m[1]);
  const seen = new Set();
  scripts.forEach(s => {
    if (seen.has(s)) console.log(`  [${file}] DUPLICATE script: ${s}`);
    seen.add(s);
  });
});
