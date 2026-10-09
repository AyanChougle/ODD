const fs = require('fs');
let css = fs.readFileSync('D:/AYAN/odd-perfume/assets/css/home.css', 'utf8');

// Apply calc(100vh - 120px) to showcase, compare, and story sections
css = css.replace('.showcase-section {\r\n  height: 100vh;', '.showcase-section {\r\n  height: calc(100vh - 120px);');
css = css.replace('.showcase-section {\n  height: 100vh;', '.showcase-section {\n  height: calc(100vh - 120px);');

// Let's find comparison section
css = css.replace('.comparison-section {\r\n  height: 100vh;', '.comparison-section {\r\n  height: calc(100vh - 120px);');
css = css.replace('.comparison-section {\n  height: 100vh;', '.comparison-section {\n  height: calc(100vh - 120px);');

// Let's find story section
css = css.replace('.story-section-landing {\r\n  height: 100vh;', '.story-section-landing {\r\n  height: calc(100vh - 120px);');
css = css.replace('.story-section-landing {\n  height: 100vh;', '.story-section-landing {\n  height: calc(100vh - 120px);');

// Let's just forcefully inject the height for those sections if they don't have it
css += `
#showcase, #comparison, #story {
  height: calc(100vh - 120px) !important;
  min-height: calc(100vh - 120px) !important;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
`;

fs.writeFileSync('D:/AYAN/odd-perfume/assets/css/home.css', css);
