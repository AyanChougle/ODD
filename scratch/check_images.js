const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));

files.forEach(f => {
  const html = fs.readFileSync(f, 'utf8');
  const regex = /<img\b([^>]*)>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const attrs = match[1];
    const isLazy = /\bloading\s*=\s*['"]lazy['"]/i.test(attrs);
    const hasWidth = /\bwidth\s*=/i.test(attrs);
    const hasHeight = /\bheight\s*=/i.test(attrs);
    const hasAspectRatio = /\baspect-ratio\b/i.test(attrs);
    
    // Chrome issues check: loading="lazy" without explicit width & height OR aspect-ratio
    if (isLazy && (!hasWidth || !hasHeight) && !hasAspectRatio) {
      console.log(`${f} -> [CRITICAL LAZY ISSUE]: ${attrs.trim()}`);
    } else if (!hasWidth || !hasHeight) {
      console.log(`${f} -> [MISSING W/H]: lazy=${isLazy}, ar=${hasAspectRatio}, ${attrs.trim()}`);
    }
  }
});
