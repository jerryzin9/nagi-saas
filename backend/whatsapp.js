// Ponte com o WhatsApp pessoal do Jerry pelo WhatsApp Web DE VERDADE (whatsapp-web.js + Chrome sem janela).
// Em 26/11 o celular recusou o pareamento da Baileys ("não é possível conectar" e 401 Connection Failure); a
// versão Baileys ficou em backend/whatsapp-baileys.js só como referência. As funções exportadas são as mesmas.
// Sessão em data/wa-wwebjs (fora do Git). Conversas recentes guardadas em data/wa-store.json.
// IDs são expostos no formato numero@s.whatsapp.net (o resto do Nagi usa esse formato); por dentro, @c.us.
import fs from 'node:fs';
import QRCode from 'qrcode';
import wweb from 'whatsapp-web.js';
import { caminho, lerJSON, gravarJSON } from './store.js';
import { numeroDoJid, variantesWhatsApp } from './telefone.js';

const { Client, LocalAuth } = wweb;
const DADOS_DIR = caminho('wa-wwebjs');
const CHROME = [
  process.env.NAGI_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => p && fs.existsSync(p));

// 'atual' = a versão do dia. A whatsapp-web.js vem do GitHub (commit 38eb45b de 24/11, "fix: Socket"), que já entende a
// versão 2.3000.1056…; a 1.34.8 do npm não entendia e o WhatsApp Web se atualiza sozinho depois do login.
const VERSAO_WA_PADRAO = 'atual';
const MAX_CONVERSAS = 400;
const MAX_MSGS = 60;

fs.mkdirSync(caminho(''), { recursive: true });
function logWa(msg) {
  try { fs.appendFileSync(caminho('wa.log'), `${new Date().toISOString()} ${msg}\n`); } catch {}
}

const estado = {
  estado: 'desconectado', // desconectado | qr | conectando | conectado
  qr: null,
  eu: null,
  cap: null,
  erro: null,
};

let cliente = null;
let parado = true;
let tentativas = 0;
let timerReconexao = null;
const ouvintes = new Set();

// ---------------- formatos de id ----------------
const paraLoja = (id) => String(id || '').replace(/@c\.us$/, '@s.whatsapp.net');
const paraWweb = (jid) => String(jid || '').replace(/@s\.whatsapp\.net$/, '@c.us');
const ehGrupo = (id) => /@g\.us$/.test(String(id || ''));
const ignorar = (id) => !id || /@broadcast$|@newsletter$/.test(String(id)) || id === 'status@broadcast';

// ---------------- armazenamento local ----------------
const loja = lerJSON('wa-store.json', { conversas: {}, mensagens: {}, nomes: {}, lidPn: {} });
let sujo = false;
setInterval(() => {
  if (!sujo) return;
  sujo = false;
  try {
    const chaves = Object.values(loja.conversas).sort((a, b) => (b.quando || 0) - (a.quando || 0));
    for (const c of chaves.slice(MAX_CONVERSAS)) {
      delete loja.conversas[c.jid];
      delete loja.mensagens[c.jid];
    }
    gravarJSON('wa-store.json', loja);
  } catch (e) {
    console.error('[wa] erro ao gravar wa-store:', e.message);
  }
}, 4000).unref();
const marcar = () => (sujo = true);

/** Contato com @lid (identificador oculto do WhatsApp): troca pelo número de telefone quando der. */
async function jidDaConversa(idWweb, chat) {
  if (!/@lid$/.test(idWweb)) return paraLoja(idWweb);
  if (loja.lidPn[idWweb]) return loja.lidPn[idWweb];
  try {
    const ct = await (chat?.getContact ? chat.getContact() : cliente.getContactById(idWweb));
    const num = ct?.number || ct?.id?.user;
    if (num && /^\d{10,15}$/.test(num)) {
      loja.lidPn[idWweb] = `${num}@s.whatsapp.net`;
      marcar();
      return loja.lidPn[idWweb];
    }
  } catch {}
  return idWweb;
}

export function textoDaMensagem(m) {
  if (!m) return '';
  const t = m.type;
  if (t === 'chat') return m.body || '';
  if (t === 'image') return `[imagem]${m.body ? ' ' + m.body : ''}`;
  if (t === 'video') return `[vídeo]${m.body ? ' ' + m.body : ''}`;
  if (t === 'ptt' || t === 'audio') return '[áudio]';
  if (t === 'document') return `[documento] ${m.body || ''}`.trim();
  if (t === 'sticker') return '[figurinha]';
  if (t === 'vcard' || t === 'multi_vcard') return '[contato]';
  if (t === 'location') return '[localização]';
  if (t === 'buttons_response' || t === 'list_response') return m.body || '';
  if (t === 'revoked' || t === 'e2e_notification' || t === 'notification_template' || t === 'call_log') return '';
  return m.body || '';
}

async function guardarMensagem(m, { contarNaoLida = false, jidPronto } = {}) {
  const idConversa = m.fromMe ? m.to : m.from;
  if (ignorar(idConversa)) return null;
  const grupo = ehGrupo(idConversa);
  const jid = jidPronto || (grupo ? idConversa : await jidDaConversa(idConversa));
  const texto = textoDaMensagem(m);
  if (!texto) return null;
  const quando = (m.timestamp || Date.now() / 1000) * 1000;
  const id = m.id?._serialized || m.id?.id || String(quando);
  const lista = (loja.mensagens[jid] ||= []);
  if (lista.some((x) => x.id === id)) return null;
  const msg = { id, deMim: !!m.fromMe, texto, quando };
  lista.push(msg);
  lista.sort((a, b) => a.quando - b.quando);
  if (lista.length > MAX_MSGS) lista.splice(0, lista.length - MAX_MSGS);
  if (!m.fromMe && !grupo && m._data?.notifyName) loja.nomes[jid] = loja.nomes[jid] || m._data.notifyName;
  const c = (loja.conversas[jid] ||= { jid, nome: '', numero: numeroDoJid(jid), ultimaMensagem: '', naoLidas: 0, quando: 0, grupo });
  if (quando >= (c.quando || 0)) {
    c.ultimaMensagem = (m.fromMe ? 'Você: ' : '') + texto.slice(0, 160);
    c.quando = quando;
  }
  if (contarNaoLida && !m.fromMe) c.naoLidas = (c.naoLidas || 0) + 1;
  marcar();
  return { jid, msg, grupo };
}

const nomeDe = (jid) => loja.nomes[jid] || loja.conversas[jid]?.nome || '';

/** Depois de conectar: lista de conversas + últimas mensagens das mais recentes (para saber quem já é conversa antiga).
 *  Lê direto do WhatsApp Web só os campos que o Nagi usa (o getChats() completo estoura o tempo com muitas conversas). */
const LER_CONVERSAS = `() => {
  const S = window.Store;
  const lista = (S && S.Chat && S.Chat.getModelsArray) ? S.Chat.getModelsArray() : [];
  return lista.map((c) => {
    let ult = null;
    try {
      const ms = c.msgs && c.msgs.getModelsArray ? c.msgs.getModelsArray() : [];
      const m = ms[ms.length - 1];
      if (m) ult = { id: m.id && m.id._serialized, fromMe: !!(m.id && m.id.fromMe), body: m.body || m.caption || '', type: m.type, t: m.t };
    } catch (e) {}
    return { id: c.id && c.id._serialized, nome: c.name || c.formattedTitle || '', t: c.t || 0, naoLidas: c.unreadCount || 0, grupo: !!c.isGroup, ult };
  }).filter((x) => x.id);
}`;
const LER_MENSAGENS = `(id, n) => {
  const c = window.Store && window.Store.Chat && window.Store.Chat.get(id);
  if (!c || !c.msgs) return [];
  return c.msgs.getModelsArray().slice(-n).map((m) => ({ id: m.id && m.id._serialized, fromMe: !!(m.id && m.id.fromMe), body: m.body || m.caption || '', type: m.type, t: m.t }));
}`;
const comoMsg = (x, idConversa) => ({ id: { _serialized: x.id }, fromMe: x.fromMe, from: x.fromMe ? '' : idConversa, to: x.fromMe ? idConversa : '', body: x.body, type: x.type, timestamp: x.t });

async function sincronizar(tentativa = 1) {
  if (!cliente || estado.estado !== 'conectado') return;
  try {
    const pagina = cliente.pupPage;
    let chats = await pagina.evaluate(new Function(`return (${LER_CONVERSAS})()`));
    if (!chats.length) {
      const diag = await pagina.evaluate(() => ({ store: Object.keys(window.Store || {}).length, chat: !!(window.Store && window.Store.Chat), wwebjs: typeof window.WWebJS }));
      logWa(`leitura rápida vazia (Store: ${diag.store} chaves, Chat: ${diag.chat}, WWebJS: ${diag.wwebjs}); usando getChats()`);
      const completos = await cliente.getChats();
      chats = completos.map((c) => ({
        id: c.id._serialized, nome: c.name || '', t: c.timestamp || 0, naoLidas: c.unreadCount || 0, grupo: !!c.isGroup,
        ult: c.lastMessage ? { id: c.lastMessage.id?._serialized, fromMe: !!c.lastMessage.fromMe, body: c.lastMessage.body || '', type: c.lastMessage.type, t: c.lastMessage.timestamp } : null,
      }));
    }
    logWa(`sincronizando ${chats.length} conversas`);
    if (!chats.length && tentativa < 8) {
      // logo depois de conectar o WhatsApp Web ainda está puxando as conversas do celular
      setTimeout(() => sincronizar(tentativa + 1), 20000);
      return;
    }
    const recentes = chats.filter((ch) => !ignorar(ch.id)).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 200);
    for (const ch of recentes) {
      const jid = ch.grupo ? ch.id : await jidDaConversa(ch.id);
      const c = (loja.conversas[jid] ||= { jid, nome: '', numero: numeroDoJid(jid), ultimaMensagem: '', naoLidas: 0, quando: 0, grupo: ch.grupo });
      if (ch.nome) c.nome = ch.nome;
      c.naoLidas = Math.max(0, ch.naoLidas || 0);
      const ts = (ch.t || 0) * 1000;
      if (ts > (c.quando || 0)) c.quando = ts;
      if (ch.ult) await guardarMensagem(comoMsg(ch.ult, ch.id), { jidPronto: jid });
    }
    marcar();
    logWa(`conversas carregadas: ${recentes.length}`);
    // histórico curto das 40 conversas individuais mais recentes
    for (const ch of recentes.filter((x) => !x.grupo).slice(0, 40)) {
      if (!cliente || estado.estado !== 'conectado') break;
      try {
        const jid = await jidDaConversa(ch.id);
        let msgs = await pagina.evaluate(new Function('id', 'n', `return (${LER_MENSAGENS})(id, n)`), ch.id, 30);
        if (msgs.length) {
          for (const m of msgs) await guardarMensagem(comoMsg(m, ch.id), { jidPronto: jid });
        } else {
          const chat = await cliente.getChatById(ch.id);
          for (const m of await chat.fetchMessages({ limit: 30 })) await guardarMensagem(m, { jidPronto: jid });
        }
      } catch {}
    }
    marcar();
    logWa('sincronização concluída');
  } catch (e) {
    logWa(`erro na sincronização (tentativa ${tentativa}): ${e.message}`);
    if (tentativa < 4) setTimeout(() => sincronizar(tentativa + 1), 45000 * tentativa);
  }
}

// ---------------- conexão ----------------
async function iniciarCliente({ telefonePareamento } = {}) {
  clearTimeout(timerReconexao);
  if (!CHROME) {
    estado.estado = 'desconectado';
    estado.erro = 'Chrome não encontrado neste PC (o WhatsApp Web roda num Chrome escondido)';
    return;
  }
  estado.estado = 'conectando';
  estado.erro = null;
  estado.qr = null;
  fs.mkdirSync(DADOS_DIR, { recursive: true });
  // Versão do WhatsApp Web: a do dia, salvo se config.json tiver "waWebVersao" (lista em github.com/wppconnect-team/wa-version).
  const versaoCfg = process.env.NAGI_WA_VERSAO || lerJSON('config.json', {}).waWebVersao || VERSAO_WA_PADRAO;
  const c = new Client({
    authStrategy: new LocalAuth({ clientId: 'nagi', dataPath: DADOS_DIR }),
    authTimeoutMs: 90000,
    ...(versaoCfg !== 'atual' ? {
      webVersion: versaoCfg,
      webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html' },
    } : {}),
    puppeteer: {
      headless: true,
      executablePath: CHROME,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check'],
      protocolTimeout: 600000,
    },
    ...(telefonePareamento ? { pairWithPhoneNumber: { phoneNumber: telefonePareamento, showNotification: true, intervalMs: 180000 } } : {}),
  });
  cliente = c;
  logWa(`iniciando WhatsApp Web (Chrome: ${CHROME})${telefonePareamento ? ' com código de pareamento' : ''}`);

  c.on('qr', async (qr) => {
    if (cliente !== c) return;
    try {
      estado.qr = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      estado.estado = 'qr';
      logWa('QR novo');
    } catch (e) {
      estado.erro = 'falha ao gerar QR: ' + e.message;
    }
  });
  c.on('code', (codigo) => {
    estado.codigo = codigo;
    logWa('código de pareamento emitido');
  });
  c.on('authenticated', () => {
    logWa('autenticado pelo celular');
    estado.estado = 'conectando';
    estado.qr = null;
  });
  c.on('auth_failure', (msg) => {
    logWa('falha de autenticação: ' + msg);
    estado.erro = 'o WhatsApp recusou a sessão: ' + msg;
  });
  c.on('ready', async () => {
    if (cliente !== c) return;
    tentativas = 0;
    estado.estado = 'conectado';
    estado.qr = null;
    estado.codigo = null;
    const wid = c.info?.wid?._serialized || '';
    estado.eu = { numero: numeroDoJid(paraLoja(wid)), nome: c.info?.pushname || '' };
    logWa(`conectado como ${estado.eu.nome} (${estado.eu.numero})`);
    console.log(`[wa] conectado como ${estado.eu.nome} (${estado.eu.numero})`);
    sincronizar();
  });
  c.on('disconnected', (motivo) => {
    if (cliente !== c) return;
    logWa('desconectado: ' + motivo);
    cliente = null;
    estado.qr = null;
    estado.eu = null;
    if (motivo === 'LOGOUT' || parado) {
      estado.estado = 'desconectado';
      if (motivo === 'LOGOUT') apagarSessao();
      try { c.destroy(); } catch {}
      return;
    }
    tentativas += 1;
    estado.estado = 'conectando';
    estado.erro = 'conexão caiu: ' + motivo;
    const espera = Math.min(60000, 3000 * 2 ** Math.min(tentativas, 4));
    try { c.destroy(); } catch {}
    timerReconexao = setTimeout(() => iniciarCliente().catch((e) => (estado.erro = e.message)), espera);
  });
  c.on('message_create', async (m) => {
    try { await guardarMensagem(m); } catch {}
  });
  c.on('message', async (m) => {
    // só mensagens recebidas (o message_create já guardou)
    try {
      if (m.fromMe || ehGrupo(m.from) || ignorar(m.from)) return;
      const jid = await jidDaConversa(m.from);
      const conv = loja.conversas[jid];
      if (conv) { conv.naoLidas = (conv.naoLidas || 0) + 1; marcar(); }
      const texto = textoDaMensagem(m);
      if (!texto) return;
      for (const f of ouvintes) {
        try {
          await f({ jid, numero: numeroDoJid(jid), texto, nome: m._data?.notifyName || nomeDe(jid), quando: (m.timestamp || Date.now() / 1000) * 1000 });
        } catch (e) {
          console.error('[wa] erro no ouvinte de mensagem:', e.message);
        }
      }
    } catch {}
  });

  try {
    await c.initialize();
  } catch (e) {
    logWa('erro ao iniciar: ' + e.message);
    if (cliente === c) {
      cliente = null;
      estado.estado = 'desconectado';
      estado.erro = 'não consegui abrir o WhatsApp Web: ' + e.message.split('\n')[0];
    }
  }
}

function apagarSessao() {
  try { fs.rmSync(DADOS_DIR, { recursive: true, force: true }); } catch {}
}

export async function conectar() {
  parado = false;
  if (cliente && ['conectado', 'qr', 'conectando'].includes(estado.estado)) return status();
  iniciarCliente().catch((e) => (estado.erro = e.message)); // abrir o Chrome demora; a UI acompanha pelo status
  await new Promise((r) => setTimeout(r, 300));
  return status();
}

/** Alternativa ao QR: código de 8 caracteres para "Conectar com número de telefone" no celular. */
export async function codigoPareamento(numero) {
  const digitos = String(numero || '').replace(/\D/g, '');
  if (digitos.length < 12) throw new Error('informe o número com DDI e DDD, ex.: 5583999670561');
  if (estado.estado === 'conectado') throw new Error('o WhatsApp já está conectado');
  parado = false;
  if (!cliente) {
    iniciarCliente().catch((e) => (estado.erro = e.message));
  }
  // espera o WhatsApp Web carregar a tela de login (primeiro QR)
  for (let i = 0; i < 120 && estado.estado !== 'qr'; i++) await new Promise((r) => setTimeout(r, 500));
  if (estado.estado !== 'qr' || !cliente) throw new Error('o WhatsApp Web ainda não abriu; tente de novo em alguns segundos');
  const codigo = await cliente.requestPairingCode(digitos, true);
  logWa(`código de pareamento pedido para ${digitos.slice(0, 4)}…${digitos.slice(-2)}`);
  return codigo;
}

export async function sair() {
  parado = true;
  clearTimeout(timerReconexao);
  const c = cliente;
  cliente = null;
  if (c) {
    try { if (estado.estado === 'conectado') await c.logout(); } catch {}
    try { await c.destroy(); } catch {}
  }
  apagarSessao();
  estado.estado = 'desconectado';
  estado.qr = null;
  estado.eu = null;
  estado.cap = null;
  return status();
}

export async function retomarSeHouverSessao() {
  if (fs.existsSync(DADOS_DIR) && fs.readdirSync(DADOS_DIR).length) {
    parado = false;
    iniciarCliente().catch((e) => (estado.erro = e.message));
  }
}

/** Diagnóstico: print da tela escondida do WhatsApp Web + o que a página tem carregado. */
export async function diagnostico() {
  if (!cliente?.pupPage) return { erro: 'o WhatsApp Web não está aberto' };
  const p = cliente.pupPage;
  await p.screenshot({ path: caminho('wa-debug.png') });
  const info = await p.evaluate(() => ({
    titulo: document.title,
    texto: (document.body.innerText || '').slice(0, 400),
    store: Object.keys(window.Store || {}).length,
    chats: window.Store && window.Store.Chat && window.Store.Chat.getModelsArray ? window.Store.Chat.getModelsArray().length : null,
    wwebjs: typeof window.WWebJS,
    versao: window.Debug && window.Debug.VERSION,
  }));
  return { ...info, print: caminho('wa-debug.png') };
}

export function status() {
  return { estado: estado.estado, qr: estado.qr, eu: estado.eu, erro: estado.erro, cap: estado.cap };
}

export function conectado() {
  return estado.estado === 'conectado' && !!cliente;
}

export function aoReceber(f) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

// ---------------- leitura ----------------
export function conversas({ limite = 40, grupos = false } = {}) {
  return Object.values(loja.conversas)
    .filter((c) => grupos || !c.grupo)
    .sort((a, b) => (b.quando || 0) - (a.quando || 0))
    .slice(0, Math.max(1, Math.min(200, Number(limite) || 40)))
    .map((c) => ({
      jid: c.jid,
      nome: c.nome || nomeDe(c.jid) || '',
      numero: c.numero || numeroDoJid(c.jid),
      ultimaMensagem: c.ultimaMensagem || '',
      naoLidas: c.naoLidas || 0,
      quando: c.quando || 0,
      ...(c.grupo ? { grupo: true } : {}),
    }));
}

export async function mensagens(jid, limite = 50) {
  let j = String(jid || '');
  if (/^\d+$/.test(j)) j = `${j}@s.whatsapp.net`;
  // conversa aberta: busca as mais recentes direto no WhatsApp Web (pega o que chegou por outros aparelhos)
  if (conectado() && !ehGrupo(j)) {
    try {
      const chat = await cliente.getChatById(paraWweb(j));
      const msgs = await chat.fetchMessages({ limit: Math.min(60, Number(limite) || 50) });
      for (const m of msgs) await guardarMensagem(m, { jidPronto: j });
    } catch {}
  }
  if (loja.conversas[j]) {
    loja.conversas[j].naoLidas = 0;
    marcar();
  }
  return (loja.mensagens[j] || []).slice(-Math.max(1, Math.min(200, Number(limite) || 50)));
}

export function temHistoricoCom(numero) {
  return variantesWhatsApp(numero).some((v) => (loja.mensagens[`${v}@s.whatsapp.net`] || []).length > 0);
}

export function nomeDoNumero(numero) {
  for (const v of variantesWhatsApp(numero)) {
    const n = nomeDe(`${v}@s.whatsapp.net`);
    if (n) return n;
  }
  return '';
}

// ---------------- envio (sem travas: quem chama é o envio.js) ----------------
export async function resolverJid(para) {
  if (!conectado()) throw new Error('WhatsApp não está conectado');
  const s = String(para || '');
  if (s.includes('@')) return paraLoja(s);
  const vs = variantesWhatsApp(s);
  if (!vs.length) throw new Error('número inválido');
  for (const v of vs) {
    try {
      const r = await cliente.getNumberId(v);
      if (r?._serialized) return paraLoja(r._serialized);
    } catch {}
  }
  return null;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function enviarTexto(jid, texto) {
  if (!conectado()) throw new Error('WhatsApp não está conectado');
  const idW = paraWweb(jid);
  try {
    const chat = await cliente.getChatById(idW);
    await chat.sendStateTyping();
    await esperar(Math.min(6000, 2000 + texto.length * 25) + Math.random() * 800);
    await chat.clearState();
  } catch {}
  const m = await cliente.sendMessage(idW, texto);
  if (m) await guardarMensagem(m, { jidPronto: paraLoja(jid) });
  return m?.id?._serialized || null;
}

export function capWhatsAppEsgotado() {
  return false; // o WhatsApp Web não informa o limite de novas conversas
}
