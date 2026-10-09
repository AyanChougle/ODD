const fs = require('fs');
let html = fs.readFileSync('D:/AYAN/odd-perfume/index.html', 'utf8');

const dotsHtml = `
        <div class="carousel-dots" style="display:flex; justify-content:center; gap:0.5rem; margin-top:2rem;">
          <span class="carousel-dot active" onclick="selectShowcaseSlide(0)" style="width:10px; height:10px; border-radius:50%; background:var(--brand-orange); cursor:pointer;"></span>
          <span class="carousel-dot" onclick="selectShowcaseSlide(1)" style="width:10px; height:10px; border-radius:50%; background:#ccc; cursor:pointer;"></span>
          <span class="carousel-dot" onclick="selectShowcaseSlide(2)" style="width:10px; height:10px; border-radius:50%; background:#ccc; cursor:pointer;"></span>
        </div>
`;

// Insert it right after the carousel-track closes
let trackEndIdx = html.indexOf('</div>', html.lastIndexOf('carousel-slide'));
if (trackEndIdx !== -1) {
  html = html.substring(0, trackEndIdx + 6) + dotsHtml + html.substring(trackEndIdx + 6);
}

fs.writeFileSync('D:/AYAN/odd-perfume/index.html', html);
