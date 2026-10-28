const fs = require('fs');
const path = require('path');

const rootDir = 'D:/AYAN/odd-perfume';
const htmlFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));

htmlFiles.forEach(file => {
  const filePath = path.join(rootDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const scripts = [...content.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi)].map(m => m[1]);
  const css = [...content.matchAll(/<link[^>]*href=["']([^"']+\.css)["'][^>]*>/gi)].map(m => m[1]);
  console.log(`${file}:`);
  console.log('  CSS:', css.join(', '));
  console.log('  JS :', scripts.join(', '));
});
