const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = 'D:/AYAN/odd-perfume';

// Simple static server
const server = http.createServer((req, res) => {
  let filePath = path.join(rootDir, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.mp4': 'video/mp4',
    '.svg': 'image/svg+xml'
  };
  res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(8099, async () => {
  console.log('Server running on 8099');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  const client = await page.target().createCDPSession();
  await client.send('Audits.enable');
  
  const issues = [];
  client.on('Audits.issueAdded', (issue) => {
    issues.push(issue);
  });

  // Mobile viewport like in screenshot
  await page.setViewport({ width: 440, height: 956, isMobile: true, hasTouch: true });
  await page.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle2' });

  // Wait a bit
  await new Promise(r => setTimeout(r, 2000));

  console.log('TOTAL ISSUES DETECTED:', issues.length);
  issues.forEach(iss => console.log(JSON.stringify(iss, null, 2)));

  await browser.close();
  server.close();
});
