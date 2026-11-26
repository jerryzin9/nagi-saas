// Prospecção real no Google Maps pelo CLI do treg (já logado neste PC).
// Nunca inventa dado: campo que não veio fica vazio.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as dados from './dados.js';
import { normalizarBR, mesmoNumero } from './telefone.js';

function acharTreg() {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  const nomes = process.platform === 'win32' ? ['treg.exe', 'treg.cmd', 'treg'] : ['treg'];
  for (const d of dirs) {
    for (const n of nomes) {
      const p = path.join(d, n);
      try {
        if (fs.statSync(p).isFile()) return p;
      } catch {}
    }
  }
  // instalação padrão do pip no Windows
  const padrao = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'Scripts', 'treg.exe');
  return fs.existsSync(padrao) ? padrao : null;
}

function rodarTreg(args, timeoutMs = 60000) {
  const bin = acharTreg();
  if (!bin) return Promise.resolve({ erro: 'CLI do treg não encontrado (instale com `pip install treg` e faça `treg login`)' });
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, windowsHide: true, encoding: 'utf8' }, (err, stdout, stderr) => {
      let json = null;
      try {
        json = JSON.parse(stdout);
      } catch {}
      if (err) {
        const det = json?.detail;
        if (det?.error === 'insufficient_balance') {
          return resolve({ erro: `saldo do treg insuficiente (a busca custa ~US$ ${(det.estimated_cost_micro / 1e6).toFixed(4)}; saldo US$ ${(det.balance_micro / 1e6).toFixed(4)}). Recarregue em treg.to/app#billing ou \`treg topup\`.` });
        }
        const msg = (det?.message || stderr || err.message || '').toString().split('\n')[0].trim();
        return resolve({ erro: err.killed ? 'o treg demorou mais de 60 s' : `treg: ${msg || 'falhou'}` });
      }
      if (!json) return resolve({ erro: 'resposta do treg não é JSON' });
      resolve({ json });
    });
  });
}

const primeiro = (o, ...ks) => {
  for (const k of ks) {
    const v = k.includes('.') ? k.split('.').reduce((a, p) => a?.[p], o) : o?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
};

function limparSite(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/google\.[a-z.]+\/maps|maps\.google|goo\.gl\/maps|g\.page/i.test(s)) return '';
  return s;
}

function acharLista(json) {
  const o = json?.output ?? json;
  const cand = [o?.places, o?.results, o?.local_results, o?.items, o?.data, Array.isArray(o) ? o : null];
  for (const c of cand) if (Array.isArray(c) && c.length) return c;
  // dataforseo: tasks[0].result[0].items
  const df = json?.raw?.tasks?.[0]?.result?.[0]?.items || o?.tasks?.[0]?.result?.[0]?.items;
  if (Array.isArray(df)) return df;
  return [];
}

function normalizar(p) {
  const tel = String(primeiro(p, 'phone', 'phone_number', 'phoneNumber', 'formatted_phone_number', 'international_phone_number', 'contact_info.0.value') || '');
  const telefone = tel ? normalizarBR(tel) || tel : '';
  const tipos = p?.types || p?.category_ids;
  const r = {
    nome: String(primeiro(p, 'title', 'name')),
    telefone,
    site: limparSite(primeiro(p, 'website', 'site', 'domain', 'url')),
    endereco: String(primeiro(p, 'address', 'full_address', 'formatted_address', 'address_info.address')),
    nota: Number(primeiro(p, 'rating', 'rating.value')) || null,
    avaliacoes: Number(primeiro(p, 'reviews', 'reviews_count', 'user_ratings_total', 'ratingCount', 'rating.votes_count')) || null,
    categoria: String(primeiro(p, 'category', 'type') || (Array.isArray(tipos) ? tipos[0] : '') || ''),
    mapsUrl: String(primeiro(p, 'mapsUrl', 'maps_url', 'link', 'url', 'check_url') || ''),
  };
  if (r.mapsUrl && !/google\.[a-z.]+\/maps|maps\.google|goo\.gl\/maps|g\.page|cid=/i.test(r.mapsUrl)) r.mapsUrl = '';
  if (r.site && r.site === r.mapsUrl) r.site = '';
  return r;
}

export async function prospectarMaps({ busca, cidade, limite = 20 }) {
  const b = String(busca || '').trim();
  const c = String(cidade || '').trim();
  if (!b) return { erro: 'informe o que buscar (ex.: barbearia)' };
  const q = c ? `${b} em ${c}` : b;
  const corpo = JSON.stringify({ q, country: 'br', language: 'pt' });
  const r = await rodarTreg([
    'call', 'treg.google.serp.maps',
    '--method', 'POST',
    '--data', corpo,
    '--header', 'X-Treg-Route-Max-Cost: 0.01',
    '--header', 'X-Treg-Route-Waterfall: 0',
  ]);
  if (r.erro) return { erro: r.erro };
  const leads = dados.todosLeadsCompletos();
  const lim = Math.max(1, Math.min(100, Number(limite) || 20));
  const resultados = acharLista(r.json)
    .map(normalizar)
    .filter((x) => x.nome)
    .slice(0, lim)
    .map((x) => ({
      ...x,
      jaEhLead: leads.some(
        (l) =>
          (x.telefone && l.telefone && mesmoNumero(l.telefone, x.telefone)) ||
          (x.site && l.site && l.site.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] === x.site.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]),
      ),
    }));
  const meta = r.json?._treg || {};
  return {
    busca: q,
    resultados,
    servidoPor: meta.provider || meta.served_by || meta.endpoint || meta.route?.provider || '',
    custoUSD: meta.cost_usd ?? (meta.cost_micro != null ? meta.cost_micro / 1e6 : meta.cost ?? null),
  };
}
