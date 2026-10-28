const fs = require('fs');
const path = require('path');

const rootDir = 'D:/AYAN/odd-perfume';
const htmlFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));

console.log('Auditing HTML files in', rootDir);

const linkAudit = {};
let totalBroken = 0;

htmlFiles.forEach(file => {
  const filePath = path.join(rootDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // Check href links
  const hrefMatches = [...content.matchAll(/href=["']([^"'#:]+)["']/g)].map(m => m[1]);
  const brokenLinks = hrefMatches.filter(href => {
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:') || href.startsWith('http')) return false;
    const clean = href.split('?')[0].split('#')[0];
    if (!clean) return false;
    const target = path.join(rootDir, clean);
    return !fs.existsSync(target);
  });

  // Check script src
  const scriptMatches = [...content.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
  const brokenScripts = scriptMatches.filter(src => {
    if (src.startsWith('http') || src.startsWith('//')) return false;
    const target = path.join(rootDir, src);
    return !fs.existsSync(target);
  });

  // Check CSS links
  const cssMatches = [...content.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/g)].map(m => m[1]);
  const brokenCss = cssMatches.filter(href => {
    if (href.startsWith('http') || href.startsWith('//')) return false;
    const target = path.join(rootDir, href);
    return !fs.existsSync(target);
  });

  // Check image src
  const imgMatches = [...content.matchAll(/<img[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
  const brokenImgs = imgMatches.filter(src => {
    if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('//')) return false;
    const target = path.join(rootDir, src);
    return !fs.existsSync(target);
  });

  if (brokenLinks.length || brokenScripts.length || brokenCss.length || brokenImgs.length) {
    linkAudit[file] = { brokenLinks, brokenScripts, brokenCss, brokenImgs };
    totalBroken += brokenLinks.length + brokenScripts.length + brokenCss.length + brokenImgs.length;
  }
});

console.log('Broken assets/links found:', totalBroken);
console.log(JSON.stringify(linkAudit, null, 2));
