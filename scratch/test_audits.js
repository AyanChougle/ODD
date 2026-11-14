const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const oddDir = 'D:\\AYAN\\odd-perfume';
const PORT = 8098;
const debugPort = 9340;

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(oddDir, decodeURIComponent(reqPath));
  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, async () => {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=' + debugPort,
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=440,956'
  ]);

  await new Promise(r => setTimeout(r, 1500));

  const httpGet = (url) => new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });

  try {
    const listRaw = await httpGet('http://127.0.0.1:' + debugPort + '/json/list');
    const targets = JSON.parse(listRaw);
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    const ws = new globalThis.WebSocket(pageTarget.webSocketDebuggerUrl);

    let id = 1;
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const msgId = id++;
      const handler = (event) => {
        const parsed = JSON.parse(event.data);
        if (parsed.id === msgId) {
          ws.removeEventListener('message', handler);
          if (parsed.error) reject(parsed.error);
          else resolve(parsed.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

    await new Promise(res => ws.addEventListener('open', res, { once: true }));
    await send('Audits.enable');
    await send('Page.enable');
    await send('DOM.enable');

    const issues = [];
    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.method === 'Audits.issueAdded') {
          issues.push(data.params.issue);
        }
      } catch (e) {}
    });

    await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
    await new Promise(r => setTimeout(r, 2500));

    // Evaluate form fields without id or name
    const formIssues = await send('Runtime.evaluate', {
      expression: `(() => {
        const fields = Array.from(document.querySelectorAll('input, select, textarea'));
        return fields.filter(f => !f.id || !f.name).map(f => ({
          tag: f.tagName,
          type: f.type,
          id: f.id,
          name: f.name,
          placeholder: f.placeholder,
          className: f.className,
          outerHTML: f.outerHTML
        }));
      })()`,
      returnByValue: true
    });

    console.log('--- FORM FIELDS WITHOUT ID OR NAME ---');
    console.log(JSON.stringify(formIssues.result.value, null, 2));

    console.log('\n--- AUDITS ISSUES CAPTURED BY CHROME (' + issues.length + ') ---');
    issues.forEach((iss, idx) => {
      console.log(`Issue ${idx + 1}: ${iss.code}`);
      console.log(JSON.stringify(iss.details, null, 2));
    });

    ws.close();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    chromeProc.kill();
    server.close();
    process.exit(0);
  }
});
