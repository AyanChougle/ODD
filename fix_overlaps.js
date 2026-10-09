const fs = require('fs');
let css = fs.readFileSync('D:/AYAN/odd-perfume/assets/css/home.css', 'utf8');

css = css.replace(/height: calc\(100vh - 120px\) !important;/g, '');
css = css.replace(/min-height: calc\(100vh - 120px\) !important;/g, 'min-height: calc(100vh - 120px);');

// Also fix the individual classes
css = css.replace(/\.showcase-section \{\r\n  height: calc\(100vh - 120px\);/g, '.showcase-section {\r\n  min-height: calc(100vh - 120px);');
css = css.replace(/\.showcase-section \{\n  height: calc\(100vh - 120px\);/g, '.showcase-section {\n  min-height: calc(100vh - 120px);');

css = css.replace(/\.comparison-section \{\r\n  height: calc\(100vh - 120px\);/g, '.comparison-section {\r\n  min-height: calc(100vh - 120px);');
css = css.replace(/\.comparison-section \{\n  height: calc\(100vh - 120px\);/g, '.comparison-section {\n  min-height: calc(100vh - 120px);');

css = css.replace(/\.story-section-landing \{\r\n  height: calc\(100vh - 120px\);/g, '.story-section-landing {\r\n  min-height: calc(100vh - 120px);');
css = css.replace(/\.story-section-landing \{\n  height: calc\(100vh - 120px\);/g, '.story-section-landing {\n  min-height: calc(100vh - 120px);');

// Adjust carousel track
css = css.replace('min-height: 50vh; max-height: 500px;', 'min-height: 480px;');

// Reduce slide image box height so it fits better
css = css.replace('min-height: 400px;', 'min-height: 280px;');

fs.writeFileSync('D:/AYAN/odd-perfume/assets/css/home.css', css);
console.log('Fixed flex shrink overlaps');
