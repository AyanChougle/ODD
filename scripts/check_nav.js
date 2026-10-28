const fs = require('fs');
const path = require('path');

const rootDir = 'D:/AYAN/odd-perfume';
const htmlFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));

console.log('Checking navigation consistency across HTML files...');

htmlFiles.forEach(file => {
  const content = fs.readFileSync(path.join(rootDir, file), 'utf8');
  // Check main-desktop-nav
  const navMatch = content.match(/<nav class="main-desktop-nav">([\s\S]*?)<\/nav>/i);
  if (navMatch) {
    const links = [...navMatch[1].matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1]);
    console.log(`[${file}] Desktop Nav:`, links.join(', '));
  }
});
