const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const oddDir = 'D:\\AYAN\\odd-perfume';
const PORT = 8099;
const debugPort = 9341;

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
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(oddDir, decodeURIComponent(reqPath));
  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.end('Not found: ' + reqPath);
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

async function runAudit(isMobile = false) {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=' + debugPort,
    '--disable-gpu',
    '--no-sandbox',
    isMobile ? '--window-size=440,956' : '--window-size=1440,900'
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
    const listRaw = await httpGet(`http://127.0.0.1:${debugPort}/json/list`);
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
    await send('Performance.enable');
    await send('Page.enable');
    await send('DOM.enable');
    await send('Network.enable');

    if (isMobile) {
      await send('Emulation.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      });
      await send('Emulation.setDeviceMetricsOverride', {
        width: 440,
        height: 956,
        deviceScaleFactor: 3,
        mobile: true
      });
    }

    const networkRequests = [];
    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.method === 'Network.responseReceived') {
          networkRequests.push({
            url: data.params.response.url,
            status: data.params.response.status,
            mimeType: data.params.response.mimeType,
            size: data.params.response.encodedDataLength
          });
        }
      } catch (e) {}
    });

    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
    await new Promise(r => setTimeout(r, 3500));

    // Get Web Vitals from PerformanceObserver inside the page
    const metrics = await send('Runtime.evaluate', {
      expression: `(() => {
        let fcp = 0, lcp = 0, cls = 0, tbt = 0;
        let lcpElement = null;

        // FCP
        const paintEntries = performance.getEntriesByType('paint');
        const fcpEntry = paintEntries.find(e => e.name === 'first-contentful-paint');
        if (fcpEntry) fcp = fcpEntry.startTime;

        // Long Tasks -> TBT estimation
        const longTasks = performance.getEntriesByType('longtask');
        longTasks.forEach(t => {
          if (t.duration > 50) {
            tbt += (t.duration - 50);
          }
        });

        // Navigation timing
        const nav = performance.getEntriesByType('navigation')[0] || {};

        return {
          fcp: Math.round(fcp),
          longTaskCount: longTasks.length,
          estimatedTbt: Math.round(tbt),
          domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
          loadEvent: Math.round(nav.loadEventEnd - nav.startTime),
          resourceCount: performance.getEntriesByType('resource').length
        };
      })()`,
      returnByValue: true
    });

    console.log(`\n================== ${isMobile ? 'MOBILE' : 'DESKTOP'} METRICS ==================`);
    console.log(JSON.stringify(metrics.result.value, null, 2));

    // Identify LCP element using PerformanceObserver snippet
    const lcpDetails = await send('Runtime.evaluate', {
      expression: `(() => {
        return new Promise((resolve) => {
          new PerformanceObserver((entryList) => {
            const entries = entryList.getEntries();
            const lastEntry = entries[entries.length - 1];
            resolve({
              startTime: Math.round(lastEntry.startTime),
              size: lastEntry.size,
              id: lastEntry.id,
              url: lastEntry.url,
              elementTag: lastEntry.element ? lastEntry.element.tagName : null,
              elementClass: lastEntry.element ? lastEntry.element.className : null,
              elementText: lastEntry.element ? lastEntry.element.textContent.slice(0, 80) : null
            });
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          setTimeout(() => resolve(null), 1000);
        });
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('LCP Element Details:');
    console.log(JSON.stringify(lcpDetails.result.value, null, 2));

    ws.close();
  } catch (err) {
    console.error('Audit Error:', err);
  } finally {
    chromeProc.kill();
  }
}

server.listen(PORT, async () => {
  console.log('Testing server running on ' + PORT);
  await runAudit(false); // Desktop
  await runAudit(true);  // Mobile
  server.close();
  process.exit(0);
});
