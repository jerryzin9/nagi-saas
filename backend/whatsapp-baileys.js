// Ponte com o WhatsApp pessoal do Jerry via Baileys (WhatsApp Web, conexão por QR).
// Sessão em data/wa-auth (fora do Git). Conversas recentes guardadas em data/wa-store.json.
import fs from 'node:fs';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
  extractMessageContent,
  isJidGroup,
  isLidUser,
  isPnUser,
  isJidBroadcast,
  isJidNewsletter,
} from '@whiskeysockets/baileys';
import { caminho, lerJSON, gravarJSON } from './store.js';
import { numeroDoJid, variantesWhatsApp } from './telefone.js';

const AUTH_DIR = caminho('wa-auth');
fs.mkdirSync(caminho(''), { recursive: true });
const logger = pino({ level: 'warn' }, pino.destination({ dest: caminho('wa.log'), sync: false, mkdir: true }));
function logWa(msg) {
  try { fs.appendFileSync(caminho('wa.log'), `${new Date().toISOString()} ${msg}
`); } catch {}
}

const MAX_CONVERSAS = 400;
const MAX_MSGS = 60;

const estado = {
  estado: 'desconectado', // desconectado | qr | conectando | conectado
  qr: null,
  eu: null,
  cap: null,              // limite de novas conversas informado pelo próprio WhatsApp (message-capping)
  erro: null,
};

let sock = null;
let parado = true;        // true = o Jerry mandou sair / nunca conectou; não reconecta sozinho
let tentativas = 0;
let timerReconexao = null;
const ouvintes = new Set(); // callbacks de mensagem recebida

// ---------------- armazenamento local das conversas ----------------
const loja = lerJSON('wa-store.json', { conversas: {}, mensagens: {}, nomes: {}, lidPn: {} });
let sujo = false;
setInterval(() => {
  if (!sujo) return;
  sujo = false;
  try {
    // corta o excesso antes de gravar
    const chaves = Object.values(loja.conversas).sort((a, b) => (b.quando || 0) - (a.quando || 0));
    if (chaves.length > MAX_CONVERSAS) {
      for (const c of chaves.slice(MAX_CONVERSAS)) {
        delete loja.conversas[c.jid];
        delete loja.mensagens[c.jid];
      }
    }
    gravarJSON('wa-store.json', loja);
  } catch (e) {
    console.error('[wa] erro ao gravar wa-store:', e.message);
  }
}, 4000).unref();

function marcar() {
  sujo = true;
}

/** Converte qualquer JID de pessoa (LID ou PN) para o JID de telefone, quando souber. */
async function paraPn(jid, alt) {
  if (!jid) return jid;
  const j = jidNormalizedUser(jid);
  if (isPnUser(j)) return j;
  if (alt && isPnUser(jidNormalizedUser(alt))) {
    loja.lidPn[j] = jidNormalizedUser(alt);
    return loja.lidPn[j];
  }
  if (isLidUser(j)) {
    if (loja.lidPn[j]) return loja.lidPn[j];
    try {
      const pn = await sock?.signalRepository?.lidMapping?.getPNForLID(j);
      if (pn) {
        loja.lidPn[j] = jidNormalizedUser(pn);
        marcar();
        return loja.lidPn[j];
      }
    } catch {}
  }
  return j;
}

function ignorar(jid) {
  return !jid || isJidBroadcast(jid) || isJidNewsletter(jid) || jid === 'status@broadcast';
}

export function textoDaMensagem(m) {
  const c = extractMessageContent(m?.message);
  if (!c) return '';
  if (c.conversation) return c.conversation;
  if (c.extendedTextMessage?.text) return c.extendedTextMessage.text;
  if (c.imageMessage) return `[imagem]${c.imageMessage.caption ? ' ' + c.imageMessage.caption : ''}`;
  if (c.videoMessage) return `[vídeo]${c.videoMessage.caption ? ' ' + c.videoMessage.caption : ''}`;
  if (c.audioMessage) return '[áudio]';
  if (c.documentMessage) return `[documento] ${c.documentMessage.fileName || ''}`.trim();
  if (c.stickerMessage) return '[figurinha]';
  if (c.contactMessage) return `[contato] ${c.contactMessage.displayName || ''}`.trim();
  if (c.locationMessage) return '[localização]';
  if (c.buttonsResponseMessage) return c.buttonsResponseMessage.selectedDisplayText || '';
  if (c.listResponseMessage) return c.listResponseMessage.title || '';
  if (c.reactionMessage) return '';
  if (c.protocolMessage) return '';
  return '';
}

function quandoMs(ts) {
  if (!ts) return Date.now();
  const n = typeof ts === 'object' && ts.toNumber ? ts.toNumber() : Number(ts);
  return n < 1e12 ? n * 1000 : n;
}

async function guardarMensagem(m, { contarNaoLida = false } = {}) {
  const key = m.key || {};
  if (ignorar(key.remoteJid)) return null;
  const grupo = isJidGroup(key.remoteJid);
  const jid = grupo ? key.remoteJid : await paraPn(key.remoteJid, key.remoteJidAlt);
  const texto = textoDaMensagem(m);
  if (!texto) return null;
  const quando = quandoMs(m.messageTimestamp);
  const lista = (loja.mensagens[jid] ||= []);
  if (lista.some((x) => x.id === key.id)) return null;
  const msg = { id: key.id, deMim: !!key.fromMe, texto, quando };
  lista.push(msg);
  lista.sort((a, b) => a.quando - b.quando);
  if (lista.length > MAX_MSGS) lista.splice(0, lista.length - MAX_MSGS);
  if (!key.fromMe && m.pushName && !grupo) loja.nomes[jid] = loja.nomes[jid] || m.pushName;
  const c = (loja.conversas[jid] ||= { jid, nome: '', numero: numeroDoJid(jid), ultimaMensagem: '', naoLidas: 0, quando: 0, grupo });
  if (quando >= (c.quando || 0)) {
    c.ultimaMensagem = (key.fromMe ? 'Você: ' : '') + texto.slice(0, 160);
    c.quando = quando;
  }
  if (contarNaoLida && !key.fromMe) c.naoLidas = (c.naoLidas || 0) + 1;
  marcar();
  return { jid, msg, grupo };
}

function nomeDe(jid) {
  return loja.nomes[jid] || loja.conversas[jid]?.nome || '';
}

// ---------------- conexão ----------------
async function iniciarSocket() {
  clearTimeout(timerReconexao);
  estado.estado = 'conectando';
  estado.erro = null;
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  // versão que o WhatsApp Web usa hoje (a da lista do Baileys fica atrás e o celular recusa o pareamento)
  let version;
  try {
    ({ version } = await fetchLatestWaWebVersion({}));
  } catch {}
  if (!version) {
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {}
  }
  logWa(`socket: versão ${version ? version.join('.') : 'padrão'}`);

  sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    browser: Browsers.windows('Desktop'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });
  const atual = sock;

  atual.ev.on('creds.update', saveCreds);

  atual.ev.on('connection.update', async (u) => {
    if (atual !== sock) return; // socket antigo
    const { connection, lastDisconnect, qr } = u;
    if (connection || lastDisconnect) logWa(`connection.update: ${connection || ''} ${lastDisconnect?.error?.output?.statusCode || ''} ${lastDisconnect?.error?.message || ''}`.trim());
    if (u.isNewLogin) logWa('pareamento aceito pelo celular (isNewLogin)');
    if (qr) {
      try {
        estado.qr = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        estado.estado = 'qr'; // só depois que a imagem existe (a UI nunca vê 'qr' com qr null)
        const terminal = await QRCode.toString(qr, { type: 'terminal', small: true });
        console.log('\n[wa] Escaneie o QR no WhatsApp > Aparelhos conectados:\n' + terminal);
      } catch (e) {
        estado.erro = 'falha ao gerar QR: ' + e.message;
      }
    }
    if (connection === 'open') {
      tentativas = 0;
      estado.estado = 'conectado';
      estado.qr = null;
      const id = jidNormalizedUser(atual.user?.id || '');
      estado.eu = { numero: numeroDoJid(id), nome: atual.user?.name || atual.user?.verifiedName || '' };
      console.log(`[wa] conectado como ${estado.eu.nome} (${estado.eu.numero})`);
      try {
        const cap = await atual.fetchNewChatMessageCap?.();
        if (cap) estado.cap = cap;
      } catch {}
    }
    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode;
      estado.qr = null;
      if (codigo === DisconnectReason.loggedOut) {
        console.log('[wa] sessão encerrada no celular: apagando credenciais');
        apagarSessao();
        estado.estado = 'desconectado';
        estado.eu = null;
        parado = true;
        return;
      }
      if (parado) {
        estado.estado = 'desconectado';
        return;
      }
      // 515 (restartRequired) logo após escanear o QR é normal: reconecta na hora
      tentativas += 1;
      const espera = codigo === DisconnectReason.restartRequired ? 500 : Math.min(60000, 2000 * 2 ** Math.min(tentativas, 5));
      estado.estado = 'conectando';
      estado.erro = lastDisconnect?.error?.message || null;
      timerReconexao = setTimeout(() => iniciarSocket().catch((e) => (estado.erro = e.message)), espera);
    }
  });

  atual.ev.on('message-capping.update', (cap) => {
    estado.cap = { ...(estado.cap || {}), ...cap };
  });

  atual.ev.on('messaging-history.set', async ({ chats = [], contacts = [], messages = [], lidPnMappings = [] }) => {
    for (const mp of lidPnMappings || []) {
      if (mp?.lid && mp?.pn) loja.lidPn[jidNormalizedUser(mp.lid)] = jidNormalizedUser(mp.pn);
    }
    for (const ct of contacts) {
      const jid = await paraPn(ct.id, ct.phoneNumber);
      const nome = ct.name || ct.notify || ct.verifiedName;
      if (jid && nome) loja.nomes[jid] = nome;
    }
    for (const ch of chats) {
      if (ignorar(ch.id)) continue;
      const grupo = isJidGroup(ch.id);
      const jid = grupo ? ch.id : await paraPn(ch.id, ch.pnJid);
      const c = (loja.conversas[jid] ||= { jid, nome: '', numero: numeroDoJid(jid), ultimaMensagem: '', naoLidas: 0, quando: 0, grupo });
      if (ch.name) c.nome = ch.name;
      if (typeof ch.unreadCount === 'number') c.naoLidas = Math.max(0, ch.unreadCount);
      const ts = quandoMs(ch.conversationTimestamp || ch.lastMessageRecvTimestamp);
      if (ts > (c.quando || 0)) c.quando = ts;
    }
    for (const m of messages) await guardarMensagem(m);
    marcar();
  });

  atual.ev.on('contacts.upsert', async (lista) => {
    for (const ct of lista) {
      const jid = await paraPn(ct.id, ct.phoneNumber);
      const nome = ct.name || ct.notify || ct.verifiedName;
      if (jid && nome) loja.nomes[jid] = nome;
    }
    marcar();
  });

  atual.ev.on('chats.update', async (lista) => {
    for (const ch of lista) {
      if (ignorar(ch.id)) continue;
      const jid = isJidGroup(ch.id) ? ch.id : await paraPn(ch.id);
      const c = loja.conversas[jid];
      if (!c) continue;
      if (typeof ch.unreadCount === 'number') c.naoLidas = Math.max(0, ch.unreadCount);
      if (ch.name) c.nome = ch.name;
    }
    marcar();
  });

  atual.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const m of messages) {
      const r = await guardarMensagem(m, { contarNaoLida: type === 'notify' });
      if (r && type === 'notify' && !m.key.fromMe && !r.grupo) {
        for (const f of ouvintes) {
          try {
            await f({ jid: r.jid, numero: numeroDoJid(r.jid), texto: r.msg.texto, nome: m.pushName || nomeDe(r.jid), quando: r.msg.quando });
          } catch (e) {
            console.error('[wa] erro no ouvinte de mensagem:', e.message);
          }
        }
      }
    }
  });
}

function apagarSessao() {
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  } catch {}
}

export async function conectar() {
  parado = false;
  if (sock && (estado.estado === 'conectado' || estado.estado === 'qr' || estado.estado === 'conectando')) return status();
  await iniciarSocket();
  return status();
}

/** Alternativa ao QR: pede um código de 8 caracteres para digitar no celular
 *  (WhatsApp > Aparelhos conectados > Conectar aparelho > Conectar com número de telefone). */
export async function codigoPareamento(numero) {
  const digitos = String(numero || '').replace(/\D/g, '');
  if (digitos.length < 12) throw new Error('informe o número com DDI e DDD, ex.: 5583999670561');
  if (estado.estado === 'conectado') throw new Error('o WhatsApp já está conectado');
  parado = false;
  if (!sock) await iniciarSocket();
  // espera o socket ficar pronto (primeiro QR emitido = handshake feito)
  for (let i = 0; i < 60 && estado.estado !== 'qr'; i++) await new Promise((r) => setTimeout(r, 250));
  if (sock?.authState?.creds?.registered) throw new Error('já existe um aparelho registrado nesta sessão');
  const codigo = await sock.requestPairingCode(digitos);
  logWa(`código de pareamento pedido para ${digitos.slice(0, 4)}…${digitos.slice(-2)}`);
  return codigo;
}

/** Sai de verdade: desconecta o aparelho no WhatsApp e apaga a sessão local. */
export async function sair() {
  parado = true;
  clearTimeout(timerReconexao);
  const s = sock;
  sock = null;
  if (s) {
    try {
      if (estado.estado === 'conectado') await s.logout();
    } catch {}
    try {
      s.end(undefined);
    } catch {}
  }
  apagarSessao();
  estado.estado = 'desconectado';
  estado.qr = null;
  estado.eu = null;
  estado.cap = null;
  return status();
}

/** Ao subir o servidor: se já existe sessão salva, reconecta sozinho (sem pedir QR de novo). */
export async function retomarSeHouverSessao() {
  if (fs.existsSync(caminho('wa-auth/creds.json'))) {
    parado = false;
    try {
      await iniciarSocket();
    } catch (e) {
      estado.erro = e.message;
    }
  }
}

export function status() {
  return { estado: estado.estado, qr: estado.qr, eu: estado.eu, erro: estado.erro, cap: estado.cap };
}

export function conectado() {
  return estado.estado === 'conectado' && !!sock;
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
  if (isLidUser(j)) j = await paraPn(j);
  const lista = loja.mensagens[j] || [];
  // abrir a conversa zera o contador local de não lidas
  if (loja.conversas[j]) {
    loja.conversas[j].naoLidas = 0;
    marcar();
  }
  return lista.slice(-Math.max(1, Math.min(200, Number(limite) || 50)));
}

/** Já existe conversa com esse número (mensagem trocada)? Usado para saber se é conversa NOVA. */
export function temHistoricoCom(numero) {
  const vs = variantesWhatsApp(numero);
  return vs.some((v) => (loja.mensagens[`${v}@s.whatsapp.net`] || []).length > 0);
}

export function nomeDoNumero(numero) {
  for (const v of variantesWhatsApp(numero)) {
    const n = nomeDe(`${v}@s.whatsapp.net`);
    if (n) return n;
  }
  return '';
}

// ---------------- envio (sem travas: quem chama é o módulo envio.js) ----------------
/** Descobre o JID real no WhatsApp (testa com e sem o 9º dígito). */
export async function resolverJid(para) {
  if (!conectado()) throw new Error('WhatsApp não está conectado');
  const s = String(para || '');
  if (s.includes('@')) return jidNormalizedUser(s);
  const vs = variantesWhatsApp(s);
  if (!vs.length) throw new Error('número inválido');
  const r = (await sock.onWhatsApp(...vs)) || [];
  const achado = r.find((x) => x.exists);
  if (!achado) return null;
  return jidNormalizedUser(achado.jid);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function enviarTexto(jid, texto) {
  if (!conectado()) throw new Error('WhatsApp não está conectado');
  const s = sock;
  try {
    await s.presenceSubscribe(jid);
  } catch {}
  try {
    await s.sendPresenceUpdate('composing', jid);
    // "digitando" proporcional ao tamanho do texto: 2 a 6 s
    await esperar(Math.min(6000, 2000 + texto.length * 25) + Math.random() * 800);
    await s.sendPresenceUpdate('paused', jid);
  } catch {}
  const r = await s.sendMessage(jid, { text: texto });
  if (r) await guardarMensagem(r);
  return r?.key?.id || null;
}

export function capWhatsAppEsgotado() {
  return estado.cap?.capping_status === 'EXHAUSTED';
}
