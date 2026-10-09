const fs = require('fs');
let css = fs.readFileSync('D:/AYAN/odd-perfume/assets/css/home.css', 'utf8');

// Remove all occurrences of hero-pick classes
css = css.replace(/\.hero-pick-card\s*\{[\s\S]*?\}/g, '');
css = css.replace(/\.hero-pick-badge\s*\{[\s\S]*?\}/g, '');
css = css.replace(/\.hero-pick-body\s*\{[\s\S]*?\}/g, '');
css = css.replace(/\.hero-pick-img\s*\{[\s\S]*?\}/g, '');
css = css.replace(/\.hero-pick-info\s*\{[\s\S]*?\}/g, '');
css = css.replace(/\.hero-pick-category\s*\{[\s\S]*?\}/g, '');
css = css.replace(/\.hero-pick-name\s*\{[\s\S]*?\}/g, '');
css = css.replace(/\.hero-pick-notes\s*\{[\s\S]*?\}/g, '');
css = css.replace(/\.hero-pick-price-row\s*\{[\s\S]*?\}/g, '');
css = css.replace(/\.hero-pick-price\s*\{[\s\S]*?\}/g, '');
css = css.replace(/\.hero-pick-cta\s*\{[\s\S]*?\}/g, '');
css = css.replace(/\.hero-trust-pill\s*\{[\s\S]*?\}/g, '');
css = css.replace(/\.hero-floating-pick-wrapper\s*\{[\s\S]*?\}/g, '');

let correctCss = `
.hero-floating-pick-wrapper {
  position: absolute;
  bottom: 2rem;
  right: clamp(1.5rem, 5vw, 4rem);
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.hero-pick-card {
  background: rgba(26, 26, 26, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: 1.2rem;
  text-decoration: none;
  display: block;
  transition: transform 0.3s ease, background 0.3s ease;
  width: 320px;
}
.hero-pick-card:hover {
  transform: translateY(-4px);
  background: rgba(26, 26, 26, 0.85);
}
.hero-pick-badge {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--brand-orange);
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 1rem;
}
.hero-pick-body {
  display: flex;
  gap: 1.2rem;
  align-items: center;
}
.hero-pick-img {
  width: 70px;
  height: 90px;
  object-fit: contain;
}
.hero-pick-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.hero-pick-category {
  font-family: var(--font-mono);
  font-size: 0.55rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.3rem;
}
.hero-pick-name {
  font-family: var(--font-serif);
  font-size: 1.4rem;
  font-weight: 400;
  color: #fff;
  margin: 0 0 0.3rem 0;
  line-height: 1.1;
}
.hero-pick-notes {
  font-family: var(--font-sans);
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 0.8rem;
}
.hero-pick-price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.hero-pick-price {
  font-family: var(--font-sans);
  font-weight: 700;
  font-size: 1.1rem;
  color: #fff;
}
.hero-pick-cta {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--brand-orange);
}
.hero-trust-pill {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  border-radius: 999px;
  padding: 0.5rem 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
}
.hero-trust-pill .orange-dot-sm {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand-orange);
}
`;

css += '\n' + correctCss;
fs.writeFileSync('D:/AYAN/odd-perfume/assets/css/home.css', css);
