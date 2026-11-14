'use strict';
const fs = require('fs');

const html = fs.readFileSync('D:/AYAN/odd-perfume/index.html', 'utf8');

console.log('=== FORM FIELDS AUDIT ===');
const fieldRegex = /<(input|textarea|select)\b([^>]*)>/gi;
let match;
while ((match = fieldRegex.exec(html)) !== null) {
  const tag = match[1];
  const attrs = match[2];
  const hasId = /\bid\s*=/i.test(attrs);
  const hasName = /\bname\s*=/i.test(attrs);
  const typeMatch = attrs.match(/\btype\s*=\s*['"]([^'"]*)['"]/i);
  const type = typeMatch ? typeMatch[1] : 'text';
  if (!hasId || !hasName) {
    console.log(`[MISSING IDENTIFIER] <${tag} type="${type}">`);
    console.log(`  Attrs: ${attrs.trim()}`);
  } else {
    console.log(`[OK] <${tag} id="..." name="...">: type="${type}"`);
  }
}

console.log('\n=== LAZY IMAGES AUDIT ===');
const imgRegex = /<img\b([^>]*)>/gi;
while ((match = imgRegex.exec(html)) !== null) {
  const attrs = match[1];
  const isLazy = /\bloading\s*=\s*['"]lazy['"]/i.test(attrs);
  const hasWidth = /\bwidth\s*=/i.test(attrs);
  const hasHeight = /\bheight\s*=/i.test(attrs);
  const srcMatch = attrs.match(/\bsrc\s*=\s*['"]([^'"]*)['"]/i);
  const src = srcMatch ? srcMatch[1] : 'unknown';
  if (isLazy && (!hasWidth || !hasHeight)) {
    console.log(`[LAZY MISSING DIMENSIONS] src="${src}" (width: ${hasWidth}, height: ${hasHeight})`);
    console.log(`  Raw: <img ${attrs.trim()}>`);
  } else {
    console.log(`[OK] src="${src}" (lazy: ${isLazy}, w: ${hasWidth}, h: ${hasHeight})`);
  }
}


console.log('\n=== JS RENDERED IMAGES AUDIT ===');
const jsFiles = ['assets/js/global.js', 'assets/js/home.js'];
jsFiles.forEach(f => {
  const content = fs.readFileSync('D:/AYAN/odd-perfume/' + f, 'utf8');
  const imgs = [...content.matchAll(/<img\b([^>]*)>/gi)];
  console.log(`File: ${f} (Images: ${imgs.length})`);
  imgs.forEach(m => {
    const raw = m[0];
    const isLazy = /loading\s*=\s*['"]lazy['"]/i.test(raw);
    const hasW = /width\s*=/i.test(raw);
    const hasH = /height\s*=/i.test(raw);
    console.log(`  lazy: ${isLazy}, w: ${hasW}, h: ${hasH} -> ${raw.replace(/\s+/g, ' ').slice(0, 100)}`);
  });
});


console.log('\n=== SCRIPTS AUDIT ===');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
console.log(`Total scripts: ${scripts.length}`);
scripts.forEach((s, i) => {
  const attrs = s[1].trim();
  const inline = s[2].trim();
  console.log(`Script ${i+1}: attrs: [${attrs}], inline len: ${inline.length}`);
  if (attrs.includes('src')) {
    console.log(`   src: ${attrs}`);
  }
});

console.log('\n=== STYLESHEETS & FONTS IN HEAD ===');
const headContent = html.slice(0, html.indexOf('</head>'));
const links = [...headContent.matchAll(/<link\b([^>]*)>/gi)];
links.forEach(l => {
  console.log(`Link: ${l[1].trim()}`);
});
