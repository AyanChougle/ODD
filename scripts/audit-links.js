'use strict';

const fs = require('fs');
const path = require('path');

const htmlFiles = fs.readdirSync('.').filter(f => f.endsWith('.html'));
console.log('Auditing ' + htmlFiles.length + ' HTML files...');

let issues = 0;

for (const file of htmlFiles) {
  const content = fs.readFileSync(file, 'utf8');

  // Check script tags
  const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
  let sm;
  while ((sm = scriptRegex.exec(content)) !== null) {
    const src = sm[1];
    if (src.startsWith('http://') || src.startsWith('https://')) continue;
    const cleanSrc = src.split('?')[0];
    if (!fs.existsSync(cleanSrc)) {
      console.error(`[BROKEN SCRIPT] in ${file}: ${src}`);
      issues++;
    }
  }

  // Check stylesheets
  const cssRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi;
  let cm;
  while ((cm = cssRegex.exec(content)) !== null) {
    const href = cm[1];
    if (href.startsWith('http://') || href.startsWith('https://')) continue;
    const cleanHref = href.split('?')[0];
    if (!fs.existsSync(cleanHref)) {
      console.error(`[BROKEN CSS] in ${file}: ${href}`);
      issues++;
    }
  }

  // Check local images
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let im;
  while ((im = imgRegex.exec(content)) !== null) {
    const src = im[1];
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) continue;
    const cleanSrc = decodeURIComponent(src.split('?')[0]);
    if (!fs.existsSync(cleanSrc)) {
      console.error(`[BROKEN IMAGE] in ${file}: ${src}`);
      issues++;
    }
  }

  // Check internal href links
  const hrefRegex = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let hm;
  while ((hm = hrefRegex.exec(content)) !== null) {
    const href = hm[1];
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
    const cleanHref = href.split('?')[0];
    if (cleanHref.endsWith('.html') && !fs.existsSync(cleanHref)) {
      console.error(`[BROKEN LINK] in ${file}: ${href}`);
      issues++;
    }
  }
}

console.log(`Audit complete: ${issues} broken references found.`);
