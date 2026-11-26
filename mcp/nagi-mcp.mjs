#!/usr/bin/env node
// Servidor MCP do Nagi (stdio): deixa o Antigravity / Codex prospectar, cuidar dos leads e
// preparar mensagens no WhatsApp pessoal do Jerry e DMs do Instagram.
// Fala com o Nagi rodando em http://127.0.0.1:3456 (abra antes: `npm start` na pasta do Nagi).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = process.env.NAGI_URL || 'http://127.0.0.1:3456';

const REGRAS =
  'Regras de abordagem: mensagem personalizada (cite algo real do negócio: nome, cidade, o que viu no Maps/Instagram/site), ' +
  'curta (2 a 4 frases), uma pergunta no fim, sem link, sem preço no primeiro contato, sem spam e sem mensagem em massa igual para todos. ' +
  'Se a pessoa recusar ou pedir para parar, não insista: o Nagi bloqueia o número sozinho.';

async function api(metodo, rota, corpo) {
  let r;
  try {
    r = await fetch(BASE + rota, {
      method: metodo,
      headers: corpo !== undefined || metodo !== 'GET' ? { 'Content-Type': 'application/json' } : {},
      body: corpo !== undefined ? JSON.stringify(corpo) : metodo !== 'GET' ? '{}' : undefined,
    });
  } catch {
    throw new Error('O Nagi não está aberto. Abra o Nagi: rode `npm start` na pasta C:\\Users\\WIN11\\OneDrive\\Documentos\\nagi e tente de novo.');
  }
  const txt = await r.text();
  let json;
  try {
    json = JSON.parse(txt);
  } catch {
    json = { bruto: txt };
  }
  if (!r.ok) throw new Error(json?.erro || `erro HTTP ${r.status}`);
  return json;
}

const ok = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });
const falha = (e) => ({ content: [{ type: 'text', text: `Erro: ${e.message}` }], isError: true });
const seguro = (fn) => async (args) => {
  try {
    return ok(await fn(args || {}));
  } catch (e) {
    return falha(e);
  }
};

const server = new McpServer({ name: 'nagi', version: '1.0.0' });

server.registerTool(
  'whatsapp_status',
  {
    title: 'Status do WhatsApp',
    description: 'Mostra se o WhatsApp pessoal do Jerry está conectado ao Nagi, o modo de envio (aprovacao/auto), quantas conversas novas já saíram hoje e o limite do dia.',
    inputSchema: {},
  },
  seguro(async () => {
    const s = await api('GET', '/api/wa/status');
    delete s.qr;
    return s;
  }),
);

server.registerTool(
  'whatsapp_conversas',
  {
    title: 'Conversas recentes do WhatsApp',
    description: 'Lista as conversas mais recentes do WhatsApp do Jerry (nome, número, última mensagem, não lidas). Use para ver quem respondeu.',
    inputSchema: { limite: z.number().int().min(1).max(100).optional().describe('quantas conversas (padrão 20)') },
  },
  seguro(async ({ limite }) => api('GET', `/api/wa/conversas?limite=${limite || 20}`)),
);

server.registerTool(
  'whatsapp_ler_conversa',
  {
    title: 'Ler uma conversa',
    description: 'Lê as últimas mensagens de uma conversa do WhatsApp (pelo jid de whatsapp_conversas ou pelo número com DDD). Leia antes de responder alguém.',
    inputSchema: {
      jid: z.string().describe('jid (ex.: 5583999999999@s.whatsapp.net) ou número com DDD'),
      limite: z.number().int().min(1).max(100).optional(),
    },
  },
  seguro(async ({ jid, limite }) => {
    const j = jid.includes('@') ? jid : jid.replace(/\D/g, '');
    return api('GET', `/api/wa/mensagens?jid=${encodeURIComponent(j)}&limite=${limite || 30}`);
  }),
);

server.registerTool(
  'whatsapp_enviar',
  {
    title: 'Enviar mensagem no WhatsApp (vai para a fila)',
    description:
      'Prepara uma mensagem para um número no WhatsApp do Jerry. No modo "aprovacao" (padrão) ela entra na FILA e só sai quando o Jerry aprovar no Nagi; ' +
      'no modo "auto" sai sozinha respeitando as travas (limite diário de conversas novas, intervalo entre envios, horário comercial, bloqueio de quem recusou, sem texto repetido). ' +
      REGRAS,
    inputSchema: {
      para: z.string().describe('telefone com DDD (ex.: 83 99999-9999) ou jid'),
      texto: z.string().min(2).max(1500).describe('a mensagem, já personalizada'),
      leadId: z.string().optional().describe('id do lead no Nagi, se houver'),
    },
  },
  seguro(async ({ para, texto, leadId }) => api('POST', '/api/wa/enviar', { para, texto, leadId, origem: 'mcp' })),
);

server.registerTool(
  'fila_listar',
  {
    title: 'Fila de mensagens',
    description: 'Lista a fila de mensagens do WhatsApp (pendente = esperando o Jerry aprovar; aprovado = sai na próxima vez que as travas deixarem; enviado; rejeitado; erro).',
    inputSchema: { status: z.string().optional().describe('filtro, ex.: "pendente" ou "pendente,aprovado"') },
  },
  seguro(async ({ status }) => api('GET', `/api/fila${status ? `?status=${encodeURIComponent(status)}` : ''}`)),
);

server.registerTool(
  'leads_listar',
  {
    title: 'Listar leads',
    description: 'Lista os leads do Nagi (status: novo, abordado, respondeu, reuniao, proposta, fechado, perdido). Aceita busca por texto. Consulte antes de abordar para não repetir ninguém.',
    inputSchema: {
      status: z.string().optional().describe('um ou vários separados por vírgula'),
      busca: z.string().optional().describe('texto: nome, cidade, segmento, telefone...'),
    },
  },
  seguro(async ({ status, busca }) => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (busca) q.set('busca', busca);
    return api('GET', `/api/leads${q.toString() ? '?' + q : ''}`);
  }),
);

const leadSchema = z.object({
  nome: z.string().optional().describe('nome do negócio ou da pessoa'),
  empresa: z.string().optional(),
  segmento: z.string().optional().describe('ex.: barbearia, clínica, restaurante'),
  cidade: z.string().optional(),
  telefone: z.string().optional().describe('só se for real (veio do Maps/site/perfil); nunca invente'),
  instagram: z.string().optional().describe('usuário do Instagram, sem @'),
  site: z.string().optional(),
  origem: z.string().optional().describe('de onde veio: maps, instagram, site, indicação...'),
  notas: z.string().optional().describe('o que observou: sem site, site antigo, sem agendamento online, etc.'),
});

server.registerTool(
  'leads_adicionar',
  {
    title: 'Adicionar leads',
    description: 'Adiciona um ou vários leads ao Nagi. Duplicados (mesmo telefone, Instagram ou site) não são recriados. Nunca invente telefone, Instagram ou site: deixe vazio se não souber.',
    inputSchema: { leads: z.array(leadSchema).min(1).max(100) },
  },
  seguro(async ({ leads }) => api('POST', '/api/leads', leads)),
);

server.registerTool(
  'leads_atualizar',
  {
    title: 'Atualizar lead',
    description: 'Muda status, valor ou dados de um lead e/ou acrescenta uma nota ao histórico (campo "nota").',
    inputSchema: {
      id: z.string(),
      status: z.enum(['novo', 'abordado', 'respondeu', 'reuniao', 'proposta', 'fechado', 'perdido']).optional(),
      valor: z.number().optional().describe('valor do negócio em R$ (para fechado/proposta)'),
      nota: z.string().optional().describe('anotação para o histórico'),
      telefone: z.string().optional(),
      instagram: z.string().optional(),
      site: z.string().optional(),
      notas: z.string().optional(),
    },
  },
  seguro(async ({ id, ...resto }) => api('PATCH', `/api/leads/${encodeURIComponent(id)}`, resto)),
);

server.registerTool(
  'instagram_preparar_dm',
  {
    title: 'Preparar DM do Instagram',
    description:
      'Guarda um rascunho de DM para um perfil do Instagram. O Nagi NÃO envia nada no Instagram sozinho: o Jerry abre o link ig.me, cola o texto e envia à mão (automação de DM fria fere as regras do Instagram). ' +
      REGRAS,
    inputSchema: {
      usuario: z.string().describe('usuário do Instagram (com ou sem @)'),
      texto: z.string().min(2).max(1000),
      leadId: z.string().optional(),
    },
  },
  seguro(async (a) => api('POST', '/api/instagram/rascunho', a)),
);

server.registerTool(
  'prospectar_maps',
  {
    title: 'Prospectar no Google Maps',
    description:
      'Busca negócios reais no Google Maps (pelo treg) com nome, telefone, site, endereço, nota e avaliações. Custa cerca de US$ 0,002 por busca no saldo do treg. ' +
      'Resultados com jaEhLead=true já estão no Nagi. Depois de escolher, salve com leads_adicionar (origem "maps").',
    inputSchema: {
      busca: z.string().describe('o que procurar, ex.: "barbearia", "clínica odontológica"'),
      cidade: z.string().describe('cidade e UF, ex.: "Cajazeiras PB"'),
      limite: z.number().int().min(1).max(50).optional(),
    },
  },
  seguro(async (a) => api('POST', '/api/prospectar', a)),
);

server.registerTool(
  'metricas',
  {
    title: 'Métricas da prospecção',
    description: 'Números do Nagi: leads por status, conversas novas hoje, respostas, reuniões, fechados, faturamento, fila pendente e envios/respostas por dia (14 dias).',
    inputSchema: {},
  },
  seguro(async () => api('GET', '/api/metricas')),
);

await server.connect(new StdioServerTransport());
