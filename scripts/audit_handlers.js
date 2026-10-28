const fs = require('fs');
const path = require('path');

const rootDir = 'D:/AYAN/odd-perfume';
const htmlFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));

console.log('Auditing event handlers and function definitions per page...');

htmlFiles.forEach(file => {
  const filePath = path.join(rootDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // Find loaded scripts
  const scriptMatches = [...content.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi)].map(m => m[1]);
  // Also find inline scripts
  const inlineScripts = [...content.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');

  let combinedJs = inlineScripts + '\n';
  scriptMatches.forEach(src => {
    if (!src.startsWith('http')) {
      const full = path.join(rootDir, src);
      if (fs.existsSync(full)) {
        combinedJs += fs.readFileSync(full, 'utf8') + '\n';
      }
    }
  });

  // Find all inline handlers: onclick, onsubmit, onchange, oninput
  const handlers = [...content.matchAll(/on[a-z]+=["']([^"']+)["']/gi)].map(m => m[1]);
  const calledFuncs = new Set();
  handlers.forEach(h => {
    // extract function calls e.g. foo(bar), bar()
    const calls = h.match(/([a-zA-Z0-9_$]+)\s*\(/g) || [];
    calls.forEach(c => {
      const name = c.replace('(', '').trim();
      if (!['if', 'for', 'while', 'switch', 'alert', 'confirm', 'prompt', 'parseInt', 'parseFloat', 'Number', 'String'].includes(name)) {
        calledFuncs.add(name);
      }
    });
  });

  const missing = [];
  calledFuncs.forEach(fn => {
    // Check if defined in combinedJs
    const hasDef = new RegExp(`function\\s+${fn}\\b|${fn}\\s*=\\s*function|window\\.${fn}\\s*=|window\\[['"]${fn}['"]\\]\\s*=|const\\s+${fn}\\s*=|let\\s+${fn}\\s*=|var\\s+${fn}\\s*=`).test(combinedJs);
    if (!hasDef) {
      missing.push(fn);
    }
  });

  if (missing.length > 0) {
    console.log(`[${file}] Missing functions referenced in HTML:`, missing);
  }
});

console.log('Done.');
