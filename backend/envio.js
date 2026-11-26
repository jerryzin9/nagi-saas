// Travas de envio + fila de aprovação + registro em data/envios.jsonl.
// Regras (valem para a UI, para o MCP e para a fila):
//  - lista de bloqueio (quem pediu para parar nunca mais recebe)
//  - nunca o mesmo texto duas vezes para o mesmo número
//  - número precisa existir no WhatsApp (onWhatsApp, com e sem o 9º dígito)
//  - NOVA conversa (número sem histórico): só no horário configurado, até limiteDia por dia,
//    com intervalo mínimo (intervaloSeg + variação aleatória) entre uma e outra,
//    e respeitando o limite de novas conversas que o próprio WhatsApp informa (message-capping)
//  - resposta em conversa que já existe, feita pelo Jerry na UI: sai na hora (sem horário/intervalo),
//    porque é conversa dele, não prospecção
import crypto from 'node:crypto';
import { anexarJSONL, lerJSONL, diaBR, horaBR } from './store.js';
import { normalizarBR, numeroDoJid, mesmoNumero } from './telefone.js';
import * as wa from './whatsapp.js';
import * as dados from './dados.js';

const ARQ = 'envios.jsonl';
let ultimoNovoEnvio = 0;          // ms do último envio de conversa nova
let proximoIntervaloMs = 0;       // intervalo sorteado para o próximo
let ocupado = false;              // um envio por vez

function hashTexto(t) {
  return crypto.createHash('sha1').update(String(t).trim().toLowerCase().replace(/\s+/g, ' ')).digest('hex');
}

function registrar(obj) {
  anexarJSONL(ARQ, { quando: Date.now(), ...obj });
}

export function enviosHoje() {
  const hoje = diaBR();
  return lerJSONL(ARQ).filter((e) => e.status === 'enviado' && diaBR(e.quando) === hoje);
}

export function novasConversasHoje() {
  return enviosHoje().filter((e) => e.novaConversa).length;
}

function jaMandouEsseTexto(numero, texto) {
  const h = hashTexto(texto);
  return lerJSONL(ARQ).some((e) => e.status === 'enviado' && e.hash === h && mesmoNumero(e.para, numero));
}

function jaEnviouAntes(numero) {
  return lerJSONL(ARQ).some((e) => e.status === 'enviado' && mesmoNumero(e.para, numero));
}

function sortearIntervalo(cfg) {
  const base = cfg.intervaloSeg * 1000;
  return base + Math.round(Math.random() * base * 0.6); // +0 a +60%
}

/** Verifica as travas sem enviar. Retorna {ok, motivo, aguardarSeg, novaConversa}. */
export function checarTravas({ para, texto, origem }) {
  const cfg = dados.config();
  const numero = normalizarBR(para) || numeroDoJid(para) || String(para || '');
  if (!numero) return { ok: false, motivo: 'número inválido' };
  if (!String(texto || '').trim()) return { ok: false, motivo: 'texto vazio' };
  if (dados.estaBloqueado(numero)) return { ok: false, motivo: 'número na lista de bloqueio (pediu para não receber)' };
  if (jaMandouEsseTexto(numero, texto)) return { ok: false, motivo: 'esse mesmo texto já foi enviado para esse número' };
  const novaConversa = !wa.temHistoricoCom(numero) && !jaEnviouAntes(numero);
  const respostaManual = origem === 'ui' && !novaConversa;
  if (!respostaManual) {
    const h = horaBR();
    if (h < cfg.horarioInicio || h >= cfg.horarioFim) {
      return { ok: false, motivo: `fora do horário de envio (${cfg.horarioInicio}h às ${cfg.horarioFim}h)`, novaConversa };
    }
  }
  if (novaConversa) {
    if (novasConversasHoje() >= cfg.limiteDia) {
      return { ok: false, motivo: `limite de ${cfg.limiteDia} novas conversas por dia atingido`, novaConversa };
    }
    if (wa.capWhatsAppEsgotado()) {
      return { ok: false, motivo: 'o próprio WhatsApp avisou que o limite de novas conversas acabou', novaConversa };
    }
    const falta = ultimoNovoEnvio + proximoIntervaloMs - Date.now();
    if (falta > 0) {
      return { ok: false, motivo: 'aguarde o intervalo entre novas conversas', aguardarSeg: Math.ceil(falta / 1000), novaConversa };
    }
  }
  return { ok: true, novaConversa, numero };
}

/** Envia de verdade (com todas as travas). Usado pela UI e pela fila. */
export async function enviar({ para, texto, leadId, origem = 'ui', filaId = null }) {
  if (ocupado) return { erro: 'outro envio em andamento, tente em alguns segundos', aguardarSeg: 5 };
  ocupado = true;
  const base = { para: normalizarBR(para) || String(para || ''), texto: String(texto || '').trim(), origem, leadId: leadId || null, filaId };
  try {
    if (!wa.conectado()) {
      registrar({ ...base, status: 'negado', motivo: 'WhatsApp desconectado' });
      return { erro: 'WhatsApp não está conectado' };
    }
    const t = checarTravas({ para, texto, origem });
    if (!t.ok) {
      registrar({ ...base, status: 'negado', motivo: t.motivo });
      return { erro: t.motivo, ...(t.aguardarSeg ? { aguardarSeg: t.aguardarSeg } : {}) };
    }
    const jid = await wa.resolverJid(para);
    if (!jid) {
      registrar({ ...base, status: 'negado', motivo: 'número não tem WhatsApp' });
      return { erro: 'esse número não tem WhatsApp' };
    }
    const id = await wa.enviarTexto(jid, base.texto);
    if (t.novaConversa) {
      ultimoNovoEnvio = Date.now();
      proximoIntervaloMs = sortearIntervalo(dados.config());
    }
    registrar({ ...base, jid, id, status: 'enviado', novaConversa: !!t.novaConversa, hash: hashTexto(base.texto) });
    // lead: histórico + 'novo' -> 'abordado'
    const lead = leadId ? dados.obterLead(leadId) : dados.leadPorTelefone(base.para);
    if (lead) {
      dados.eventoLead(lead.id, { tipo: 'enviada', texto: base.texto }, lead.status === 'novo' ? 'abordado' : undefined);
    }
    return { ok: true, id };
  } catch (e) {
    registrar({ ...base, status: 'erro', motivo: e.message });
    return { erro: e.message };
  } finally {
    ocupado = false;
  }
}

// ---------------- fila ----------------
/** POST /api/wa/enviar: MCP no modo aprovação vai para a fila; no modo auto vai para a fila já aprovado. */
export async function pedirEnvio({ para, texto, leadId, origem }) {
  const cfg = dados.config();
  if (origem === 'mcp') {
    const pre = checarTravasFixas({ para, texto });
    if (!pre.ok) return { erro: pre.motivo };
    const item = dados.criarItemFila({ para, texto, leadId, origem: 'mcp', nome: wa.nomeDoNumero(para) }, cfg.modo === 'auto' ? 'aprovado' : 'pendente');
    if (cfg.modo === 'auto') processarFilaLogo();
    return { fila: item };
  }
  return enviar({ para, texto, leadId, origem: 'ui' });
}

/** Travas que não mudam com o tempo (bloqueio, texto repetido, número válido): checadas já na entrada da fila. */
function checarTravasFixas({ para, texto }) {
  const numero = normalizarBR(para) || numeroDoJid(para);
  if (!numero) return { ok: false, motivo: 'número inválido' };
  if (!String(texto || '').trim()) return { ok: false, motivo: 'texto vazio' };
  if (dados.estaBloqueado(numero)) return { ok: false, motivo: 'número na lista de bloqueio (pediu para não receber)' };
  if (jaMandouEsseTexto(numero, texto)) return { ok: false, motivo: 'esse mesmo texto já foi enviado para esse número' };
  const pend = dados.fila().some((x) => (x.status === 'pendente' || x.status === 'aprovado') && mesmoNumero(x.para, numero));
  if (pend) return { ok: false, motivo: 'já existe mensagem na fila para esse número' };
  return { ok: true };
}

export function criarNaFila({ para, texto, leadId, origem }) {
  const pre = checarTravasFixas({ para, texto });
  if (!pre.ok) return { erro: pre.motivo };
  return dados.criarItemFila({ para, texto, leadId, origem, nome: wa.nomeDoNumero(para) }, 'pendente');
}

/** Aprovar: tenta enviar já; se a trava for só de tempo (intervalo/horário/limite), fica 'aprovado' e sai na vez. */
export async function aprovar(id) {
  const it = dados.fila().find((x) => x.id === id);
  if (!it) return { erro: 'item não encontrado' };
  if (it.status !== 'pendente' && it.status !== 'erro' && it.status !== 'aprovado') return { erro: `item já está ${it.status}` };
  dados.atualizarItemFila(id, { status: 'aprovado', erro: null });
  const r = await tentarItem(id);
  return { item: dados.fila().find((x) => x.id === id), ...(r?.erro ? { aviso: r.erro } : {}) };
}

export function rejeitar(id) {
  const it = dados.fila().find((x) => x.id === id);
  if (!it) return { erro: 'item não encontrado' };
  if (it.status === 'enviado') return { erro: 'item já foi enviado' };
  return { item: dados.atualizarItemFila(id, { status: 'rejeitado' }) };
}

export function editar(id, { texto }) {
  const it = dados.fila().find((x) => x.id === id);
  if (!it) return { erro: 'item não encontrado' };
  if (it.status === 'enviado') return { erro: 'item já foi enviado' };
  if (!String(texto || '').trim()) return { erro: 'texto vazio' };
  return { item: dados.atualizarItemFila(id, { texto: String(texto).trim().slice(0, 4000) }) };
}

const TEMPORARIAS = /intervalo|horário|limite|outro envio|desconectado|não está conectado/i;

async function tentarItem(id) {
  const it = dados.fila().find((x) => x.id === id);
  if (!it || it.status !== 'aprovado') return null;
  const r = await enviar({ para: it.para, texto: it.texto, leadId: it.leadId, origem: 'fila', filaId: it.id });
  if (r.ok) {
    dados.atualizarItemFila(id, { status: 'enviado', enviadoEm: Date.now(), erro: null });
  } else if (!TEMPORARIAS.test(r.erro || '')) {
    dados.atualizarItemFila(id, { status: 'erro', erro: r.erro });
  } else {
    dados.atualizarItemFila(id, { erro: r.erro }); // continua 'aprovado', sai na próxima vez possível
  }
  return r;
}

let timerFila = null;
function processarFilaLogo() {
  clearTimeout(timerFila);
  timerFila = setTimeout(processarFila, 1500);
}

/** Roda a cada 20 s: manda o próximo item aprovado se as travas deixarem. */
export async function processarFila() {
  if (ocupado || !wa.conectado()) return;
  const proximo = dados
    .fila()
    .filter((x) => x.status === 'aprovado')
    .sort((a, b) => a.criadoEm - b.criadoEm)[0];
  if (proximo) await tentarItem(proximo.id);
}

setInterval(() => processarFila().catch((e) => console.error('[fila]', e.message)), 20000).unref();

// ---------------- mensagens recebidas ----------------
const OPT_OUT_FORTE = /n[aã]o\s+tenho\s+interesse|n[aã]o\s+quero|n[aã]o\s+me\s+(mande|envie)|remov[ae]r?\s+(meu|o\s+meu|da|o)|me\s+(tira|tire|remove)|descadastr|para\s+de\s+(me\s+)?mandar|pare\s+de\s+(me\s+)?mandar|sem\s+interesse/i;
const OPT_OUT_CURTO = /^\s*(pare|parar|sair|stop|remove|remover|n[aã]o)\s*[.!]*\s*$/i;

export function ehOptOut(texto) {
  const t = String(texto || '');
  return OPT_OUT_FORTE.test(t) || OPT_OUT_CURTO.test(t);
}

/** Mensagem recebida: se for de um lead, registra; se for recusa, bloqueia e tira da fila. */
export function tratarRecebida({ numero, texto }) {
  const lead = dados.leadPorTelefone(numero);
  if (!lead) return;
  if (ehOptOut(texto)) {
    dados.bloquear(numero, `opt-out: ${texto.slice(0, 120)}`);
    dados.eventoLead(lead.id, { tipo: 'recebida', texto }, 'perdido');
    // nada pendente para quem pediu para parar
    for (const it of dados.fila()) {
      if ((it.status === 'pendente' || it.status === 'aprovado') && mesmoNumero(it.para, numero)) {
        dados.atualizarItemFila(it.id, { status: 'rejeitado', erro: 'o contato pediu para não receber' });
      }
    }
    return;
  }
  dados.eventoLead(lead.id, { tipo: 'recebida', texto }, lead.status === 'abordado' || lead.status === 'novo' ? 'respondeu' : undefined);
}

wa.aoReceber(tratarRecebida);

// ---------------- métricas ----------------
export function metricas() {
  const leads = dados.todosLeadsCompletos();
  const porStatus = Object.fromEntries(dados.STATUS_LEAD.map((s) => [s, 0]));
  for (const l of leads) porStatus[l.status] = (porStatus[l.status] || 0) + 1;
  const envios = lerJSONL(ARQ).filter((e) => e.status === 'enviado');
  const hoje = diaBR();
  const dias = [];
  for (let i = 13; i >= 0; i--) dias.push(diaBR(Date.now() - i * 86400000));
  const respostasPorDia = {};
  for (const l of leads) {
    const vistos = new Set();
    for (const h of l.historico || []) {
      if (h.tipo !== 'recebida') continue;
      const d = diaBR(h.quando);
      if (vistos.has(d)) continue;
      vistos.add(d);
      respostasPorDia[d] = (respostasPorDia[d] || 0) + 1;
    }
  }
  return {
    leads: leads.length,
    porStatus,
    abordadosHoje: envios.filter((e) => e.novaConversa && diaBR(e.quando) === hoje).length,
    enviadosHoje: envios.filter((e) => diaBR(e.quando) === hoje).length,
    respostas: leads.filter((l) => (l.historico || []).some((h) => h.tipo === 'recebida')).length,
    reunioes: porStatus.reuniao || 0,
    fechados: porStatus.fechado || 0,
    faturamento: leads.filter((l) => l.status === 'fechado').reduce((s, l) => s + (Number(l.valor) || 0), 0),
    filaPendente: dados.fila().filter((x) => x.status === 'pendente').length,
    enviadosPorDia: dias.map((d) => ({
      dia: d,
      enviados: envios.filter((e) => diaBR(e.quando) === d).length,
      respostas: respostasPorDia[d] || 0,
    })),
  };
}
