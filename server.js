/**
 * Optional local Node.js server + CORS Proxy for Treg.to API
 * Run: npm start -> http://localhost:3456
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3456;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

const server = http.createServer(async (req, res) => {
  // Proxy /api/treg/* -> https://treg.to/*
  if (req.url.startsWith('/api/treg/')) {
    const targetPath = req.url.replace('/api/treg', '');
    const targetUrl = `https://treg.to${targetPath}`;
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (req.headers['x-treg-token']) headers['X-Treg-Token'] = req.headers['x-treg-token'];
        if (req.headers['x-treg-route-max-cost']) headers['X-Treg-Route-Max-Cost'] = req.headers['x-treg-route-max-cost'];

        const upstream = await fetch(targetUrl, {
          method: req.method,
          headers,
          body: req.method !== 'GET' && body ? body : undefined
        });
        const text = await upstream.text();
        res.writeHead(upstream.status, {
          'Content-Type': upstream.headers.get('content-type') || 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(text);
      } catch (err) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Static file serving
  const urlPath = req.url.split('?')[0];
  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Nagi SaaS rodando em http://localhost:${PORT}`);
});
