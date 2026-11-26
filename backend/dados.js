// Leads, fila de aprovação, config, lista de bloqueio e rascunhos de Instagram (tudo em data/*.json).
import { lerJSON, gravarJSON, novoId } from './store.js';
import { normalizarBR, mesmoNumero } from './telefone.js';

export const STATUS_LEAD = ['novo', 'abordado', 'respondeu', 'reuniao', 'proposta', 'fechado', 'perdido'];

export const CONFIG_PADRAO = {
  modo: 'aprovacao',      // 'aprovacao': tudo que vem do MCP espera o Jerry aprovar; 'auto': sai sozinho com as travas
  limiteDia: 25,          // NOVAS conversas por dia
  intervaloSeg: 90,       // mínimo entre novas conversas (+ variação aleatória)
  horarioInicio: 8,
  horarioFim: 19,
  tregToken: '',
  assinatura: 'Jerry',
};

// ---------------- config ----------------
export function config() {
  return { ...CONFIG_PADRAO, ...lerJSON('config.json', {}) };
}

export function configPublica() {
  const c = config();
  const t = c.tregToken || '';
  return { ...c, tregToken: t ? `••••${t.slice(-4)}` : '', tregConfigurado: !!t };
}

export function salvarConfig(entrada = {}) {
  const atual = config();
  const nova = { ...atual };
  if (entrada.modo === 'aprovacao' || entrada.modo === 'auto') nova.modo = entrada.modo;
  const num = (v, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : undefined;
  };
  const ld = num(entrada.limiteDia, 0, 200);
  if (ld !== undefined) nova.limiteDia = ld;
  const iv = num(entrada.intervaloSeg, 15, 3600);
  if (iv !== undefined) nova.intervaloSeg = iv;
  const hi = num(entrada.horarioInicio, 0, 23);
  if (hi !== undefined) nova.horarioInicio = hi;
  const hf = num(entrada.horarioFim, 1, 24);
  if (hf !== undefined) nova.horarioFim = hf;
  if (typeof entrada.assinatura === 'string') nova.assinatura = entrada.assinatura.trim().slice(0, 60);
  // token: string vazia apaga; valor mascarado (••••xxxx) é ignorado
  if (typeof entrada.tregToken === 'string' && !entrada.tregToken.startsWith('••••')) {
    nova.tregToken = entrada.tregToken.trim();
  }
  gravarJSON('config.json', nova);
  return configPublica();
}

// ---------------- leads ----------------
function todosLeads() {
  return lerJSON('leads.json', []);
}

function gravarLeads(l) {
  gravarJSON('leads.json', l);
}

function limparInstagram(v) {
  return String(v || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
}

function limparSite(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

export function listarLeads({ status, busca } = {}) {
  let l = todosLeads();
  if (status) {
    const s = String(status).split(',');
    l = l.filter((x) => s.includes(x.status));
  }
  if (busca) {
    const b = String(busca).toLowerCase();
    l = l.filter((x) =>
      [x.nome, x.empresa, x.segmento, x.cidade, x.telefone, x.instagram, x.site, x.notas]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(b)),
    );
  }
  return l
    .sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0))
    .map(({ historico, ...resto }) => ({ ...resto, ultimoEvento: historico?.at(-1) || null }));
}

export function obterLead(id) {
  return todosLeads().find((x) => x.id === id) || null;
}

function acharDuplicado(lista, c) {
  return lista.find(
    (x) =>
      (c.telefone && x.telefone && mesmoNumero(x.telefone, c.telefone)) ||
      (c.instagram && x.instagram && limparInstagram(x.instagram) === limparInstagram(c.instagram)) ||
      (c.site && x.site && limparSite(x.site) === limparSite(c.site)),
  );
}

const CAMPOS = ['nome', 'empresa', 'segmento', 'cidade', 'telefone', 'instagram', 'site', 'origem', 'notas'];

function limparEntrada(e) {
  const o = {};
  for (const k of CAMPOS) if (e[k] !== undefined && e[k] !== null) o[k] = String(e[k]).trim().slice(0, k === 'notas' ? 4000 : 300);
  if (o.telefone) o.telefone = normalizarBR(o.telefone) || o.telefone;
  if (o.instagram) o.instagram = limparInstagram(o.instagram);
  if (e.valor !== undefined) o.valor = Number(e.valor) || 0;
  if (e.status && STATUS_LEAD.includes(e.status)) o.status = e.status;
  return o;
}

/** Adiciona um ou vários leads. Duplicado (telefone/instagram/site) não é recriado: completa os campos vazios. */
export function adicionarLeads(entrada) {
  const itens = Array.isArray(entrada) ? entrada : [entrada];
  const lista = todosLeads();
  const criados = [];
  const duplicados = [];
  const agora = Date.now();
  for (const bruto of itens) {
    const c = limparEntrada(bruto || {});
    if (!c.nome && !c.empresa && !c.telefone && !c.instagram && !c.site) continue;
    const dup = acharDuplicado(lista, c);
    if (dup) {
      let mudou = false;
      for (const k of CAMPOS) if (c[k] && !dup[k]) { dup[k] = c[k]; mudou = true; }
      if (mudou) dup.atualizadoEm = agora;
      duplicados.push({ id: dup.id, nome: dup.nome || dup.empresa });
      continue;
    }
    const lead = {
      id: novoId('l_'),
      nome: '', empresa: '', segmento: '', cidade: '', telefone: '', instagram: '', site: '', origem: 'manual',
      status: 'novo', valor: 0, notas: '',
      ...c,
      historico: [{ quando: agora, tipo: 'criado', texto: `Lead criado (${c.origem || 'manual'})` }],
      criadoEm: agora,
      atualizadoEm: agora,
    };
    lista.push(lead);
    criados.push(lead);
  }
  gravarLeads(lista);
  return { criados, duplicados };
}

export function atualizarLead(id, mudancas = {}, evento) {
  const lista = todosLeads();
  const lead = lista.find((x) => x.id === id);
  if (!lead) return null;
  const c = limparEntrada(mudancas);
  const statusAntes = lead.status;
  Object.assign(lead, c);
  if (c.status && c.status !== statusAntes) {
    lead.historico.push({ quando: Date.now(), tipo: 'status', texto: `${statusAntes} → ${c.status}` });
  }
  if (evento) lead.historico.push({ quando: Date.now(), ...evento });
  if (typeof mudancas.nota === 'string' && mudancas.nota.trim()) {
    lead.historico.push({ quando: Date.now(), tipo: 'nota', texto: mudancas.nota.trim().slice(0, 2000) });
  }
  lead.atualizadoEm = Date.now();
  gravarLeads(lista);
  return lead;
}

export function removerLead(id) {
  const lista = todosLeads();
  const i = lista.findIndex((x) => x.id === id);
  if (i < 0) return false;
  lista.splice(i, 1);
  gravarLeads(lista);
  return true;
}

export function leadPorTelefone(numero) {
  if (!numero) return null;
  return todosLeads().find((x) => x.telefone && mesmoNumero(x.telefone, numero)) || null;
}

/** Registra evento no lead (ex.: mensagem enviada/recebida) e muda status se indicado. */
export function eventoLead(id, evento, novoStatus) {
  const lista = todosLeads();
  const lead = lista.find((x) => x.id === id);
  if (!lead) return null;
  lead.historico.push({ quando: Date.now(), ...evento });
  if (novoStatus && novoStatus !== lead.status) {
    lead.historico.push({ quando: Date.now(), tipo: 'status', texto: `${lead.status} → ${novoStatus}` });
    lead.status = novoStatus;
  }
  lead.atualizadoEm = Date.now();
  gravarLeads(lista);
  return lead;
}

export function todosLeadsCompletos() {
  return todosLeads();
}

// ---------------- bloqueio (opt-out) ----------------
export function bloqueados() {
  return lerJSON('bloqueio.json', []);
}

export function estaBloqueado(numero) {
  return bloqueados().some((b) => mesmoNumero(b.numero, numero));
}

export function bloquear(numero, motivo) {
  const n = normalizarBR(numero) || String(numero);
  const l = bloqueados();
  if (!l.some((b) => mesmoNumero(b.numero, n))) {
    l.push({ numero: n, motivo: String(motivo || '').slice(0, 300), quando: Date.now() });
    gravarJSON('bloqueio.json', l);
  }
}

// ---------------- fila ----------------
export function fila() {
  return lerJSON('fila.json', []);
}

export function gravarFila(f) {
  gravarJSON('fila.json', f);
}

export function listarFila(status) {
  const f = fila();
  const s = status ? String(status).split(',') : null;
  return (s ? f.filter((x) => s.includes(x.status)) : f).sort((a, b) => b.criadoEm - a.criadoEm);
}

export function criarItemFila({ para, texto, leadId, origem, nome }, status = 'pendente') {
  const f = fila();
  const lead = leadId ? obterLead(leadId) : leadPorTelefone(para);
  const item = {
    id: novoId('f_'),
    para: normalizarBR(para) || String(para || ''),
    nome: nome || lead?.nome || lead?.empresa || '',
    texto: String(texto || '').trim().slice(0, 4000),
    leadId: leadId || lead?.id || null,
    origem: origem === 'ui' ? 'ui' : origem === 'mcp' ? 'mcp' : 'ui',
    status,
    criadoEm: Date.now(),
    enviadoEm: null,
    erro: null,
  };
  f.push(item);
  gravarFila(f);
  return item;
}

export function atualizarItemFila(id, mudancas) {
  const f = fila();
  const it = f.find((x) => x.id === id);
  if (!it) return null;
  Object.assign(it, mudancas);
  gravarFila(f);
  return it;
}

// ---------------- instagram (só rascunho; nunca envia) ----------------
export function rascunhosInstagram() {
  return lerJSON('instagram.json', []).sort((a, b) => b.criadoEm - a.criadoEm);
}

export function criarRascunhoInstagram({ leadId, usuario, texto }) {
  const u = limparInstagram(usuario || (leadId && obterLead(leadId)?.instagram));
  if (!u) throw new Error('usuario do Instagram obrigatório');
  if (!String(texto || '').trim()) throw new Error('texto obrigatório');
  const l = lerJSON('instagram.json', []);
  const r = {
    id: novoId('ig_'),
    leadId: leadId || null,
    usuario: u,
    texto: String(texto).trim().slice(0, 1000),
    link: `https://ig.me/m/${u}`,
    perfil: `https://www.instagram.com/${u}/`,
    status: 'pendente',
    criadoEm: Date.now(),
    feitoEm: null,
  };
  l.push(r);
  gravarJSON('instagram.json', l);
  return r;
}

export function marcarRascunhoFeito(id) {
  const l = lerJSON('instagram.json', []);
  const r = l.find((x) => x.id === id);
  if (!r) return null;
  r.status = 'feito';
  r.feitoEm = Date.now();
  gravarJSON('instagram.json', l);
  if (r.leadId) {
    const lead = obterLead(r.leadId);
    eventoLead(r.leadId, { tipo: 'instagram', texto: `DM enviada à mão: ${r.texto}` }, lead?.status === 'novo' ? 'abordado' : undefined);
  }
  return r;
}
