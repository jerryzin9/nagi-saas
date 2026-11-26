// Rotas /api/* do Nagi (JSON). Só aceita chamadas do próprio Nagi (127.0.0.1/localhost):
// - Host precisa ser 127.0.0.1:PORTA ou localhost:PORTA (barra DNS rebinding)
// - Origin, se vier, precisa ser o próprio Nagi
// - POST/PATCH/DELETE precisam de Content-Type: application/json (outro site não consegue mandar sem preflight)
import * as wa from './whatsapp.js';
import * as envio from './envio.js';
import * as dados from './dados.js';
import { prospectarMaps } from './prospectar.js';

function enviarJSON(res, codigo, obj) {
  const corpo = JSON.stringify(obj);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(corpo);
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let tam = 0;
    const partes = [];
    req.on('data', (c) => {
      tam += c.length;
      if (tam > 2 * 1024 * 1024) {
        reject(new Error('corpo grande demais'));
        req.destroy();
      } else partes.push(c);
    });
    req.on('end', () => {
      const t = Buffer.concat(partes).toString('utf8');
      if (!t.trim()) return resolve({});
      try {
        resolve(JSON.parse(t));
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

export function origemPermitida(req, porta) {
  const hosts = [`127.0.0.1:${porta}`, `localhost:${porta}`];
  if (!hosts.includes(String(req.headers.host || '').toLowerCase())) return 'host não permitido';
  const origin = req.headers.origin;
  if (origin && !hosts.map((h) => `http://${h}`).includes(String(origin).toLowerCase())) return 'origem não permitida';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const ct = String(req.headers['content-type'] || '');
    if (!ct.includes('application/json')) return 'use Content-Type: application/json';
  }
  return null;
}

const ROTAS = [];
function rota(metodo, padrao, fn) {
  const nomes = [];
  const re = new RegExp('^' + padrao.replace(/:(\w+)/g, (_, n) => (nomes.push(n), '([^/]+)')) + '/?$');
  ROTAS.push({ metodo, re, nomes, fn });
}

// ---------------- WhatsApp ----------------
rota('GET', '/api/wa/status', () => {
  const s = wa.status();
  const cfg = dados.config();
  return {
    estado: s.estado,
    qr: s.qr,
    eu: s.eu,
    erro: s.erro,
    enviadosHoje: envio.novasConversasHoje(),
    limiteDia: cfg.limiteDia,
    modo: cfg.modo,
    capWhatsApp: s.cap
      ? { total: s.cap.total_quota ?? null, usado: s.cap.used_quota ?? null, status: s.cap.capping_status || null, fimDoCiclo: s.cap.cycle_end_timestamp || null }
      : null,
  };
});
rota('POST', '/api/wa/conectar', async () => {
  await wa.conectar();
  // dá um tempinho para o QR ou a conexão aparecer
  for (let i = 0; i < 40 && wa.status().estado === 'conectando'; i++) await new Promise((r) => setTimeout(r, 250));
  const s = wa.status();
  return { estado: s.estado, qr: s.qr, eu: s.eu, erro: s.erro };
});
rota('POST', '/api/wa/sair', async () => {
  const s = await wa.sair();
  return { estado: s.estado };
});
rota('GET', '/api/wa/conversas', (q) => wa.conversas({ limite: q.get('limite') || 40, grupos: q.get('grupos') === '1' }));
rota('GET', '/api/wa/mensagens', async (q) => {
  const jid = q.get('jid');
  if (!jid) throw codigo(400, 'informe jid');
  return wa.mensagens(jid, q.get('limite') || 50);
});
rota('POST', '/api/wa/enviar', async (_q, corpo) => {
  if (!corpo.para || !corpo.texto) throw codigo(400, 'informe para e texto');
  const origem = corpo.origem === 'mcp' ? 'mcp' : 'ui';
  const r = await envio.pedirEnvio({ para: corpo.para, texto: corpo.texto, leadId: corpo.leadId, origem });
  if (r.erro) throw codigo(422, r.erro, r.aguardarSeg ? { aguardarSeg: r.aguardarSeg } : undefined);
  return r;
});

// ---------------- fila ----------------
rota('GET', '/api/fila', (q) => dados.listarFila(q.get('status')));
rota('POST', '/api/fila', (_q, c) => {
  if (!c.para || !c.texto) throw codigo(400, 'informe para e texto');
  const r = envio.criarNaFila({ para: c.para, texto: c.texto, leadId: c.leadId, origem: c.origem === 'mcp' ? 'mcp' : 'ui' });
  if (r.erro) throw codigo(422, r.erro);
  return r;
});
rota('POST', '/api/fila/:id/aprovar', async (_q, _c, p) => {
  const r = await envio.aprovar(p.id);
  if (r.erro) throw codigo(404, r.erro);
  return r;
});
rota('POST', '/api/fila/:id/rejeitar', (_q, _c, p) => {
  const r = envio.rejeitar(p.id);
  if (r.erro) throw codigo(409, r.erro);
  return r;
});
rota('PATCH', '/api/fila/:id', (_q, c, p) => {
  const r = envio.editar(p.id, c);
  if (r.erro) throw codigo(409, r.erro);
  return r;
});

// ---------------- config ----------------
rota('GET', '/api/config', () => dados.configPublica());
rota('POST', '/api/config', (_q, c) => dados.salvarConfig(c));

// ---------------- leads ----------------
rota('GET', '/api/leads', (q) => dados.listarLeads({ status: q.get('status'), busca: q.get('busca') }));
rota('POST', '/api/leads', (_q, c) => {
  const entrada = Array.isArray(c) ? c : Array.isArray(c.leads) ? c.leads : c;
  return dados.adicionarLeads(entrada);
});
rota('GET', '/api/leads/:id', (_q, _c, p) => {
  const l = dados.obterLead(p.id);
  if (!l) throw codigo(404, 'lead não encontrado');
  return l;
});
rota('PATCH', '/api/leads/:id', (_q, c, p) => {
  const l = dados.atualizarLead(p.id, c);
  if (!l) throw codigo(404, 'lead não encontrado');
  return l;
});
rota('DELETE', '/api/leads/:id', (_q, _c, p) => {
  if (!dados.removerLead(p.id)) throw codigo(404, 'lead não encontrado');
  return { ok: true };
});

// ---------------- instagram (só rascunho) ----------------
rota('GET', '/api/instagram/rascunhos', () => dados.rascunhosInstagram());
rota('POST', '/api/instagram/rascunho', (_q, c) => {
  try {
    return dados.criarRascunhoInstagram(c);
  } catch (e) {
    throw codigo(400, e.message);
  }
});
rota('POST', '/api/instagram/rascunho/:id/feito', (_q, _c, p) => {
  const r = dados.marcarRascunhoFeito(p.id);
  if (!r) throw codigo(404, 'rascunho não encontrado');
  return r;
});

// ---------------- prospecção (treg CLI) e métricas ----------------
rota('POST', '/api/prospectar', async (_q, c) => {
  const r = await prospectarMaps({ busca: c.busca, cidade: c.cidade, limite: c.limite });
  if (r.erro) throw codigo(502, r.erro);
  return r;
});
rota('GET', '/api/metricas', () => envio.metricas());

function codigo(status, erro, extra) {
  const e = new Error(erro);
  e.status = status;
  e.extra = extra;
  return e;
}

/** Retorna true se tratou a requisição. */
export async function tratarApi(req, res, porta) {
  const url = new URL(req.url, `http://127.0.0.1:${porta}`);
  if (!url.pathname.startsWith('/api/') || url.pathname.startsWith('/api/treg/')) return false;
  const barrado = origemPermitida(req, porta);
  if (barrado) {
    enviarJSON(res, 403, { erro: barrado });
    return true;
  }
  const candidatos = ROTAS.filter((r) => r.re.test(url.pathname));
  const r = candidatos.find((x) => x.metodo === req.method);
  if (!r) {
    enviarJSON(res, candidatos.length ? 405 : 404, { erro: candidatos.length ? 'método não permitido' : 'rota não encontrada' });
    return true;
  }
  try {
    const m = r.re.exec(url.pathname);
    const params = Object.fromEntries(r.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    const corpo = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await lerCorpo(req) : {};
    const saida = await r.fn(url.searchParams, corpo, params);
    enviarJSON(res, 200, saida ?? { ok: true });
  } catch (e) {
    enviarJSON(res, e.status || 500, { erro: e.message || 'erro', ...(e.extra || {}) });
    if (!e.status) console.error('[api]', req.method, url.pathname, e);
  }
  return true;
}
