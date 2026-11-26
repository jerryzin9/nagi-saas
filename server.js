/**
 * Nagi 凪 — servidor local (só 127.0.0.1): arquivos do painel, API (/api/*), proxy do treg (/api/treg/*)
 * e a ponte com o WhatsApp. Rodar: npm start -> http://127.0.0.1:3456
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tratarApi, origemPermitida } from './backend/api.js';
import * as dados from './backend/dados.js';
import { retomarSeHouverSessao } from './backend/whatsapp.js';

const PORT = Number(process.env.PORT) || 3456;
const HOST = '127.0.0.1';
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.glsl': 'text/plain; charset=utf-8',
};

// Nada de servir dados, sessão do WhatsApp, código do servidor ou dependências.
const PROIBIDO = /^\/(data|node_modules|backend|mcp|docs|\.git)(\/|$)|^\/(server\.js|package(-lock)?\.json)$|\/\./i;

async function proxyTreg(req, res) {
  const barrado = origemPermitida(req, PORT);
  if (barrado) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ erro: barrado }));
  }
  const targetUrl = `https://treg.to${req.url.replace('/api/treg', '')}`;
  const partes = [];
  req.on('data', (c) => partes.push(c));
  req.on('end', async () => {
    try {
      const body = Buffer.concat(partes).toString('utf8');
      const headers = { 'Content-Type': 'application/json' };
      const token = req.headers['x-treg-token'] || dados.config().tregToken;
      if (token) headers['X-Treg-Token'] = token;
      if (req.headers['x-treg-route-max-cost']) headers['X-Treg-Route-Max-Cost'] = req.headers['x-treg-route-max-cost'];
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: req.method !== 'GET' && body ? body : undefined,
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
      res.end(text);
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ erro: err.message }));
    }
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/treg/')) return proxyTreg(req, res);
    if (await tratarApi(req, res, PORT)) return;

    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (PROIBIDO.test(urlPath)) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.join(ROOT, 'index.html')) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('Not found');
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  } catch (e) {
    res.writeHead(500);
    res.end('erro');
    console.error(e);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Nagi rodando em http://${HOST}:${PORT}`);
  retomarSeHouverSessao().catch((e) => console.error('[wa] não retomou a sessão:', e.message));
});
