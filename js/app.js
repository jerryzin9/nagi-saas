/**
 * Nagi 凪 — painel pessoal de prospecção do Jerry.
 * Consome o servidor local (server.js + backend/) em /api/*: leads, WhatsApp (Baileys), fila de aprovação,
 * rascunhos do Instagram, métricas, config e prospecção pelo treg. Nada de dado inventado nesta tela.
 */
import { Oceano } from './ocean.js';
import { get, post, patch, del } from './api.js';
import { PROMPT_TEMPLATES } from './data.js';
import { generateLandingPageHTML, generateN8nWorkflowJSON } from './generator.js';

const ETAPAS = [
  ['novo', 'Novos', '新'], ['abordado', 'Abordados', '声'], ['respondeu', 'Responderam', '返'],
  ['reuniao', 'Reunião', '会'], ['proposta', 'Proposta', '案'], ['fechado', 'Fechados', '成'], ['perdido', 'Perdidos', '散'],
];
const NOME_ETAPA = Object.fromEntries(ETAPAS.map(([k, n]) => [k, n]));

const E = {
  tela: 'painel', leads: [], fila: [], rascunhos: [], config: {}, wa: {}, metricas: null,
  conversas: [], chatJid: null, filtroFila: 'pendente', buscaLeads: '', buscaConversas: '',
  resultados: [], ultimaBusca: null, grafico: null, previaHTML: '', previaDados: null,
};

// ---------- utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icones = () => window.lucide && window.lucide.createIcons();
const reais = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const quando = (ms) => {
  if (!ms) return '';
  const d = new Date(ms), hoje = new Date();
  return d.toDateString() === hoje.toDateString()
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};
const iniciais = (n) => esc((n || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase());
const fone = (n) => {
  const d = String(n || '').replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  return n || '';
};
const nomeLead = (l) => l.empresa || l.nome || fone(l.telefone) || 'Sem nome';
const usuarioIg = (s) => String(s || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/.*$/, '');

function toast(msg, tipo = '') {
  const t = document.createElement('div');
  t.className = `toast ${tipo}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), tipo === 'erro' ? 7000 : 4200);
}
async function tentar(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg, 'ok'); return r; }
  catch (e) { toast(e.message, 'erro'); return null; }
}

// ---------- modelos de mensagem ----------
const MODELOS = {
  site: { nome: 'Site', texto: (l, a) => l.site
    ? `Oi, tudo bem? Aqui é o ${a}, eu desenvolvo sites e automações. Dei uma olhada no site da ${nomeLead(l)} e vi uns ajustes rápidos que trazem mais cliente pelo celular (velocidade, botão direto para o WhatsApp e aparecer melhor no Google). Posso te mostrar em 2 minutos?`
    : `Oi, tudo bem? Aqui é o ${a}, eu desenvolvo sites. Vi a ${nomeLead(l)} no Google${l.nota ? ` (${l.nota}★)` : ''} e reparei que vocês ainda não têm um site próprio. Faço páginas rápidas, com botão direto para o WhatsApp e que aparecem no Google. Posso te mostrar um exemplo de ${l.segmento || 'negócio parecido'}?` },
  atendimento: { nome: 'Atendimento automático', texto: (l, a) =>
    `Oi, tudo bem? Aqui é o ${a}. Eu monto atendimento automático para negócios como a ${nomeLead(l)}: responde na hora, a qualquer hora, tira as dúvidas mais comuns e passa para vocês quando o cliente quer fechar. Faz sentido eu te mostrar como ficaria para ${l.segmento || 'vocês'}?` },
  previa: { nome: 'Prévia pronta', texto: (l, a) =>
    `Oi, tudo bem? Aqui é o ${a}. Montei uma prévia de página para a ${nomeLead(l)}, sem compromisso, para vocês verem como ficaria com os serviços e o botão do WhatsApp. Posso te mandar?` },
  retomar: { nome: 'Retomar', texto: (l, a) =>
    `Oi, tudo bem? Passando só para saber se você viu minha mensagem sobre a ${nomeLead(l)}. Se não for o momento, sem problema, é só me dizer.` },
};
const MODELO_IG = (l, a) =>
  `Oi! Aqui é o ${a}, desenvolvo sites e automações. Curti o perfil da ${nomeLead(l)}${l.cidade ? ` aqui de ${l.cidade}` : ''}. Vocês já têm um site ou atendimento automático? Tenho uma ideia rápida que pode trazer mais cliente pelo celular. Posso te mostrar?`;

// ---------- navegação ----------
function irPara(tela) {
  E.tela = tela;
  $('#gaveta').hidden = true;
  fecharModal();
  document.body.className = `tela-${tela}`;
  $$('.menu button').forEach((b) => b.classList.toggle('ativo', b.dataset.tela === tela));
  $$('.tela').forEach((s) => (s.hidden = s.id !== `tela-${tela}`));
  window.oceano && window.oceano.setCalmo(tela === 'painel' ? 0 : 1);
  ({ painel: renderPainel, prospectar: renderProspeccao, leads: renderKanban, whatsapp: abrirWhatsApp,
     fila: carregarFila, instagram: carregarIg, estudio: renderEstudio, ajustes: renderAjustes })[tela]?.();
  scrollTo({ top: 0 });
}

// ---------- carregamento ----------
async function carregarLeads() { E.leads = (await get('/leads')) || []; atualizarBadges(); }
async function carregarMetricas() { E.metricas = await get('/metricas'); }
async function carregarStatusWa() {
  const antes = E.wa?.estado;
  try { E.wa = await get('/wa/status'); } catch { E.wa = { estado: 'desligado' }; }
  pintarStatusWa();
  if (E.tela === 'whatsapp' && antes && antes !== E.wa.estado) abrirWhatsApp();
}
async function contarFila() {
  try { const p = await get('/fila?status=pendente'); $('#badge-fila').textContent = p.length || ''; $('#badge-fila').classList.toggle('quente', p.length > 0); return p; } catch { return []; }
}
function atualizarBadges() {
  const resp = E.leads.filter((l) => l.status === 'respondeu').length;
  $('#badge-leads').textContent = resp || '';
  $('#badge-leads').classList.toggle('quente', resp > 0);
}

function pintarStatusWa() {
  const el = $('#status-wa-lateral'), w = E.wa || {};
  el.className = `status-wa ${w.estado === 'conectado' ? 'on' : w.estado === 'qr' ? 'qr' : ''}`;
  const txt = { conectado: w.eu ? `${w.eu.nome || 'conectado'} · ${fone(w.eu.numero)}` : 'conectado', qr: 'esperando o QR', conectando: 'conectando…', desconectado: 'desconectado', desligado: 'servidor desligado' };
  $('.t2', el).textContent = txt[w.estado] || w.estado || '—';
  $('#cota-lateral').textContent = w.limiteDia ? `Hoje: ${w.enviadosHoje || 0} de ${w.limiteDia} conversas novas · modo ${w.modo === 'auto' ? 'automático' : 'aprovação'}` : '';
  $('#badge-wa').textContent = w.estado === 'qr' ? '!' : '';
}

// ---------- PAINEL ----------
async function renderPainel() {
  const h = new Date().getHours();
  const [jp, oi] = h < 12 ? ['おはよう', 'Bom dia'] : h < 18 ? ['こんにちは', 'Boa tarde'] : ['こんばんは', 'Boa noite'];
  $('#hero-jp').textContent = jp;
  $('#hero-saudacao').textContent = `${oi}, Jerry`;
  await Promise.all([tentar(carregarMetricas), tentar(carregarLeads)]);
  const m = E.metricas || { porStatus: {}, enviadosPorDia: [] };
  const ps = m.porStatus || {};
  const novos = ps.novo || 0, resp = ps.respondeu || 0;
  const pend = (await contarFila()).length;
  $('#hero-frase').textContent = resp
    ? `${resp} ${resp === 1 ? 'lead respondeu' : 'leads responderam'} e ${resp === 1 ? 'espera' : 'esperam'} você. ${pend ? `Mais ${pend} na fila para aprovar.` : ''}`
    : novos ? `O mar está calmo. ${novos} ${novos === 1 ? 'lead novo espera' : 'leads novos esperam'} a primeira mensagem.`
    : 'O mar está calmo. Que tal buscar novos leads hoje?';

  const k = [
    ['Leads', '縁', m.leads ?? E.leads.length, `${novos} sem abordagem`],
    ['Abordados hoje', '声', m.abordadosHoje ?? 0, E.wa.limiteDia ? `limite ${E.wa.limiteDia}/dia` : 'WhatsApp'],
    ['Responderam', '返', m.respostas ?? resp, 'no total'],
    ['Reuniões', '会', m.reunioes ?? ps.reuniao ?? 0, 'marcadas'],
    ['Fechados', '成', m.fechados ?? ps.fechado ?? 0, 'projetos'],
    ['Faturamento', '金', reais(m.faturamento), 'soma dos fechados'],
  ];
  $('#kpis').innerHTML = k.map(([r, j, n, d], i) => `<div class="kpi ${i === 5 ? 'destaque' : ''}"><p class="rot">${r}<span>${j}</span></p><p class="num">${esc(n)}</p><p class="det">${esc(d)}</p></div>`).join('');

  const total = Math.max(1, ...ETAPAS.map(([s]) => ps[s] || 0));
  $('#funil').innerHTML = ETAPAS.map(([s, n]) => `<div class="funil-linha"><span>${n}</span><div class="barra"><i style="width:${((ps[s] || 0) / total) * 100}%"></i></div><b>${ps[s] || 0}</b></div>`).join('');

  desenharGrafico(m.enviadosPorDia || []);
  renderProximas(pend);
}

function desenharGrafico(dias) {
  if (!window.Chart) return;
  const ctx = $('#graf-envios');
  const rot = dias.map((d) => d.dia?.slice(5).split('-').reverse().join('/') || '');
  E.grafico?.destroy();
  E.grafico = new Chart(ctx, {
    type: 'line',
    data: { labels: rot, datasets: [
      { label: 'Enviadas', data: dias.map((d) => d.enviados), borderColor: '#7cc7ff', backgroundColor: 'rgba(124,199,255,.12)', fill: true, tension: .38, pointRadius: 2 },
      { label: 'Respostas', data: dias.map((d) => d.respostas), borderColor: '#e7effc', backgroundColor: 'transparent', borderDash: [5, 4], tension: .38, pointRadius: 2 },
    ] },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#93a8c9', boxWidth: 12, font: { family: 'Plus Jakarta Sans' } } } },
      scales: {
        x: { ticks: { color: '#5f7499' }, grid: { color: 'rgba(130,175,255,.06)' } },
        y: { beginAtZero: true, ticks: { color: '#5f7499', precision: 0 }, grid: { color: 'rgba(130,175,255,.06)' } },
      },
    },
  });
}

function renderProximas(pend) {
  const acoes = [];
  const resp = E.leads.filter((l) => l.status === 'respondeu');
  resp.slice(0, 4).forEach((l) => acoes.push({ ic: 'message-circle-reply', t: `${nomeLead(l)} respondeu`, d: 'Responda rápido: quem responde em minutos fecha mais.', fn: () => abrirLead(l.id) }));
  if (pend) acoes.push({ ic: 'list-checks', t: `${pend} ${pend === 1 ? 'mensagem' : 'mensagens'} na fila`, d: 'Preparadas pela IA ou por você, esperando aprovação.', fn: () => irPara('fila') });
  const novos = E.leads.filter((l) => l.status === 'novo');
  if (novos.length) acoes.push({ ic: 'send', t: `${novos.length} ${novos.length === 1 ? 'lead novo' : 'leads novos'} sem mensagem`, d: 'Abra o quadro e escolha quem abordar hoje.', fn: () => irPara('leads') });
  if (E.wa.estado && E.wa.estado !== 'conectado') acoes.push({ ic: 'qr-code', t: 'Conectar o WhatsApp', d: 'Escaneie o QR com o celular para o Nagi e a IA usarem seu número.', fn: () => irPara('whatsapp') });
  $('#proximas').innerHTML = acoes.length
    ? acoes.map((a, i) => `<div class="acao" data-i="${i}"><div class="ic"><i data-lucide="${a.ic}"></i></div><div><p class="t">${esc(a.t)}</p><p class="d">${esc(a.d)}</p></div></div>`).join('')
    : '<div class="vazio"><p class="jp">静</p><p>Nada pendente. Bom momento para prospectar.</p></div>';
  $$('#proximas .acao').forEach((el) => (el.onclick = acoes[+el.dataset.i].fn));
  icones();
}

// ---------- PROSPECTAR ----------
function renderProspeccao() {
  const box = $('#resultados-prospeccao');
  if (!E.resultados.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `
    <div class="barra-acoes">
      <p class="dica">${E.resultados.length} resultados para <b>${esc(E.ultimaBusca?.busca)}</b> em <b>${esc(E.ultimaBusca?.cidade)}</b>${E.ultimaBusca?.custoUSD != null ? ` · custou US$ ${Number(E.ultimaBusca.custoUSD).toFixed(4)}` : ''}</p>
      <div class="linha-botoes">
        <button class="btn btn-vidro btn-pequeno" id="sel-todos">Marcar os que têm telefone</button>
        <button class="btn btn-claro btn-pequeno" id="add-sel"><i data-lucide="plus"></i>Adicionar aos leads</button>
      </div>
    </div>
    <table class="tabela"><thead><tr><th></th><th>Empresa</th><th>Nota</th><th>Telefone</th><th>Site</th><th>Endereço</th></tr></thead><tbody>
    ${E.resultados.map((r, i) => `<tr>
      <td><input type="checkbox" data-i="${i}" ${r.jaEhLead ? 'disabled' : ''} /></td>
      <td><p class="nome" style="margin:0">${esc(r.nome)}</p><p class="menor" style="margin:0">${esc(r.categoria || '')} ${r.jaEhLead ? '<span class="selo cinza">já é lead</span>' : ''}</p></td>
      <td>${r.nota ? `${esc(r.nota)}★ <span class="menor">(${esc(r.avaliacoes ?? 0)})</span>` : '<span class="menor">—</span>'}</td>
      <td>${r.telefone ? esc(fone(r.telefone)) : '<span class="menor">sem telefone</span>'}</td>
      <td>${r.site ? `<a href="${esc(/^https?:/i.test(r.site) ? r.site : 'https://' + r.site)}" target="_blank" rel="noopener">abrir</a>` : '<span class="selo alerta">sem site</span>'}${r.instagram ? `<br><span class="menor">@${esc(r.instagram)}</span>` : ''}</td>
      <td class="menor">${esc(r.endereco || '')}</td></tr>`).join('')}
    </tbody></table>`;
  $('#sel-todos').onclick = () => $$('input[type=checkbox]', box).forEach((c) => { if (!c.disabled) c.checked = !!E.resultados[+c.dataset.i].telefone; });
  $('#add-sel').onclick = async () => {
    const sel = $$('input[type=checkbox]:checked', box).map((c) => E.resultados[+c.dataset.i]);
    if (!sel.length) return toast('Marque pelo menos um resultado.');
    const novos = sel.map((r) => ({
      nome: r.nome, empresa: r.nome, telefone: r.telefone || '', site: r.site || '', instagram: r.instagram || '', cidade: E.ultimaBusca.cidade,
      segmento: E.ultimaBusca.busca, origem: 'Google Maps (treg)', nota: r.nota || null,
      notas: [r.categoria, r.endereco, r.nota ? `${r.nota}★ (${r.avaliacoes ?? 0} avaliações)` : ''].filter(Boolean).join(' · '),
    }));
    const r = await tentar(() => post('/leads', novos));
    if (r) {
      toast(`${Array.isArray(r.criados) ? r.criados.length : sel.length} leads adicionados`, 'ok');
      sel.forEach((x) => (x.jaEhLead = true));
      await carregarLeads(); renderProspeccao();
    }
  };
  icones();
}

// ---------- LEADS ----------
function leadsFiltrados() {
  const q = E.buscaLeads.trim().toLowerCase();
  return q ? E.leads.filter((l) => [l.nome, l.empresa, l.cidade, l.segmento, l.telefone, l.instagram].join(' ').toLowerCase().includes(q)) : E.leads;
}
async function renderKanban() {
  await tentar(carregarLeads);
  const lista = leadsFiltrados();
  $('#kanban').innerHTML = ETAPAS.map(([s, n, j]) => {
    const cards = lista.filter((l) => (l.status || 'novo') === s);
    return `<div class="coluna" data-st="${s}"><div class="coluna-topo"><h3><span class="kanji" style="font-family:var(--serifa);color:var(--apagado);margin-right:6px">${j}</span>${n}</h3><span>${cards.length}</span></div>
      ${cards.map((l) => `<div class="card-lead" draggable="true" data-id="${esc(l.id)}">
        <p class="n">${esc(nomeLead(l))}</p><p class="c">${esc([l.segmento, l.cidade].filter(Boolean).join(' · '))}${l.valor ? ` · ${reais(l.valor)}` : ''}</p>
        <div class="icones"><i data-lucide="phone" class="${l.telefone ? 'tem' : ''}"></i><i data-lucide="instagram" class="${l.instagram ? 'tem' : ''}"></i><i data-lucide="globe" class="${l.site ? 'tem' : ''}"></i></div>
      </div>`).join('')}</div>`;
  }).join('');
  $$('.card-lead').forEach((c) => {
    c.onclick = () => abrirLead(c.dataset.id);
    c.ondragstart = (e) => e.dataTransfer.setData('text/plain', c.dataset.id);
  });
  $$('.coluna').forEach((col) => {
    col.ondragover = (e) => { e.preventDefault(); col.classList.add('sobre'); };
    col.ondragleave = () => col.classList.remove('sobre');
    col.ondrop = async (e) => {
      e.preventDefault(); col.classList.remove('sobre');
      const id = e.dataTransfer.getData('text/plain');
      if (await tentar(() => patch(`/leads/${id}`, { status: col.dataset.st }))) renderKanban();
    };
  });
  icones();
}

async function abrirLead(id) {
  const l = await tentar(() => get(`/leads/${id}`));
  if (!l) return;
  const g = $('#gaveta');
  g.hidden = false;
  g.innerHTML = `
    <button class="btn btn-vidro btn-pequeno fechar" id="fechar-gaveta"><i data-lucide="x"></i></button>
    <p class="jp">縁 lead</p><h2>${esc(nomeLead(l))}</h2>
    <p class="sub">${esc([l.segmento, l.cidade, l.origem].filter(Boolean).join(' · '))}</p>
    <div class="linha-botoes" style="margin-top:14px">
      <button class="btn btn-claro" id="g-wa" ${l.telefone ? '' : 'disabled'}><i data-lucide="message-circle"></i>WhatsApp</button>
      <button class="btn btn-vidro" id="g-ig" ${l.instagram ? '' : 'disabled'}><i data-lucide="instagram"></i>DM no Instagram</button>
      <button class="btn btn-vidro" id="g-lp"><i data-lucide="sparkles"></i>Prévia de site</button>
    </div>
    <form class="campos" id="form-lead">
      <label>Empresa<input name="empresa" value="${esc(l.empresa)}" /></label>
      <label>Nome do contato<input name="nome" value="${esc(l.nome)}" /></label>
      <label>Telefone<input name="telefone" value="${esc(l.telefone)}" /></label>
      <label>Instagram<input name="instagram" value="${esc(l.instagram)}" placeholder="@perfil" /></label>
      <label>Site<input name="site" value="${esc(l.site)}" /></label>
      <label>Cidade<input name="cidade" value="${esc(l.cidade)}" /></label>
      <label>Segmento<input name="segmento" value="${esc(l.segmento)}" /></label>
      <label>Etapa<select name="status">${ETAPAS.map(([s, n]) => `<option value="${s}" ${l.status === s ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Valor (R$)<input name="valor" type="number" min="0" step="10" value="${esc(l.valor ?? '')}" /></label>
      <label class="largo">Notas<textarea name="notas">${esc(l.notas)}</textarea></label>
      <div class="largo linha-botoes"><button class="btn btn-ok" type="submit"><i data-lucide="check"></i>Salvar</button><button class="btn btn-perigo" type="button" id="g-apagar"><i data-lucide="trash-2"></i>Apagar</button></div>
    </form>
    <h3 style="margin:8px 0 4px;font-size:13px">Histórico</h3>
    <div class="historico">${(l.historico || []).slice().reverse().map((h) => `<div>${esc(h.texto)}<small>${esc(h.tipo || '')} · ${new Date(h.quando).toLocaleString('pt-BR')}</small></div>`).join('') || '<div class="dica">Sem histórico ainda.</div>'}</div>`;
  $('#fechar-gaveta').onclick = () => (g.hidden = true);
  $('#form-lead').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    d.valor = d.valor ? Number(d.valor) : null;
    if (await tentar(() => patch(`/leads/${l.id}`, d), 'Lead salvo')) { g.hidden = true; if (E.tela === 'leads') renderKanban(); }
  };
  $('#g-apagar').onclick = async () => {
    if (!confirm(`Apagar ${nomeLead(l)}?`)) return;
    if (await tentar(() => del(`/leads/${l.id}`), 'Lead apagado')) { g.hidden = true; renderKanban(); }
  };
  $('#g-wa').onclick = () => compor(l);
  $('#g-ig').onclick = () => comporIg(l);
  $('#g-lp').onclick = () => { g.hidden = true; E.previaDados = { company: nomeLead(l), segment: l.segmento, city: l.cidade, phone: l.telefone }; irPara('estudio'); };
  icones();
}

function modal(html) {
  const m = $('#modal');
  $('#modal-corpo').innerHTML = html;
  m.hidden = false;
  m.onclick = (e) => { if (e.target === m) m.hidden = true; };
  icones();
  return $('#modal-corpo');
}
const fecharModal = () => ($('#modal').hidden = true);

async function linhaCase(l) {
  try {
    const r = await get(`/cases/para?segmento=${encodeURIComponent([l.segmento, l.empresa, l.nome, l.notas].filter(Boolean).join(' '))}`);
    return r?.linha || '';
  } catch { return ''; }
}

async function compor(l) {
  const assinatura = E.config.assinatura || 'Jerry';
  const caso = await linhaCase(l);
  const comCase = (t) => (caso && !t.includes('http') ? `${t}\n\n${caso}` : t);
  const corpo = modal(`
    <h2>Mensagem para ${esc(nomeLead(l))}</h2>
    <p class="sub">${esc(fone(l.telefone))} · hoje: ${E.wa.enviadosHoje || 0} de ${E.wa.limiteDia || '—'} conversas novas</p>
    <div class="modelos">${Object.entries(MODELOS).map(([k, m]) => `<button class="btn btn-vidro btn-pequeno" data-m="${k}">${m.nome}</button>`).join('')}</div>
    <textarea id="txt-msg" style="width:100%;min-height:170px"></textarea>
    <p class="dica" id="conta-msg"></p>
    <div class="rodape">
      <button class="btn btn-vidro" id="m-cancelar">Cancelar</button>
      <button class="btn btn-vidro" id="m-fila"><i data-lucide="list-plus"></i>Pôr na fila</button>
      <button class="btn btn-claro" id="m-enviar" ${E.wa.estado === 'conectado' ? '' : 'disabled title="Conecte o WhatsApp primeiro"'}><i data-lucide="send"></i>Enviar agora</button>
    </div>`);
  const txt = $('#txt-msg', corpo);
  const conta = () => ($('#conta-msg', corpo).textContent = `${txt.value.length} caracteres · curta e pessoal funciona melhor`);
  $$('[data-m]', corpo).forEach((b) => (b.onclick = () => { txt.value = comCase(MODELOS[b.dataset.m].texto(l, assinatura)); conta(); }));
  txt.value = comCase(MODELOS[l.status === 'abordado' ? 'retomar' : 'site'].texto(l, assinatura)); conta();
  txt.oninput = conta;
  $('#m-cancelar', corpo).onclick = fecharModal;
  $('#m-fila', corpo).onclick = async () => {
    if (await tentar(() => post('/fila', { para: l.telefone, texto: txt.value, leadId: l.id, origem: 'ui' }), 'Mensagem na fila')) { fecharModal(); $('#gaveta').hidden = true; contarFila(); }
  };
  $('#m-enviar', corpo).onclick = async () => {
    const b = $('#m-enviar', corpo); b.disabled = true; b.textContent = 'Enviando…';
    const r = await tentar(() => post('/wa/enviar', { para: l.telefone, texto: txt.value, leadId: l.id, origem: 'ui' }));
    if (r && !r.erro) {
      toast('Mensagem enviada', 'ok');
      if ((l.status || 'novo') === 'novo') await tentar(() => patch(`/leads/${l.id}`, { status: 'abordado' }));
      fecharModal(); $('#gaveta').hidden = true; carregarStatusWa(); if (E.tela === 'leads') renderKanban();
    } else { b.disabled = false; b.textContent = 'Enviar agora'; }
  };
}

async function comporIg(l) {
  const caso = await linhaCase(l);
  const corpo = modal(`
    <h2>DM para @${esc(usuarioIg(l.instagram))}</h2>
    <p class="sub">O Nagi não envia DM sozinho (o Instagram bloqueia conta que faz isso). Guarde o rascunho e envie com um clique.</p>
    <textarea id="txt-ig" style="width:100%;min-height:170px">${esc(MODELO_IG(l, E.config.assinatura || 'Jerry') + (caso ? '\n\n' + caso : ''))}</textarea>
    <div class="rodape">
      <button class="btn btn-vidro" id="ig-cancelar">Cancelar</button>
      <button class="btn btn-vidro" id="ig-salvar"><i data-lucide="save"></i>Guardar rascunho</button>
      <button class="btn btn-claro" id="ig-abrir"><i data-lucide="external-link"></i>Copiar e abrir a DM</button>
    </div>`);
  $('#ig-cancelar', corpo).onclick = fecharModal;
  const salvar = () => post('/instagram/rascunho', { leadId: l.id, usuario: usuarioIg(l.instagram), texto: $('#txt-ig', corpo).value });
  $('#ig-salvar', corpo).onclick = async () => { if (await tentar(salvar, 'Rascunho guardado')) fecharModal(); };
  $('#ig-abrir', corpo).onclick = async () => {
    const r = await tentar(salvar);
    await copiarEAbrirIg(usuarioIg(l.instagram), $('#txt-ig', corpo).value, r?.id);
    fecharModal();
  };
}

async function copiarEAbrirIg(usuario, texto, id) {
  try { await navigator.clipboard.writeText(texto); toast('Texto copiado. Cole na conversa e envie.', 'ok'); } catch { toast('Não consegui copiar: selecione o texto e copie.', 'erro'); }
  window.open(`https://ig.me/m/${encodeURIComponent(usuario)}`, '_blank', 'noopener');
  if (id && confirm('Enviou a DM? Clique em OK para marcar como feita.')) { await tentar(() => post(`/instagram/rascunho/${id}/feito`)); if (E.tela === 'instagram') carregarIg(); }
}

function novoLead() {
  const corpo = modal(`
    <h2>Novo lead</h2>
    <form class="campos" id="form-novo">
      <label>Empresa<input name="empresa" required /></label><label>Contato<input name="nome" /></label>
      <label>Telefone<input name="telefone" placeholder="83 99999-9999" /></label><label>Instagram<input name="instagram" placeholder="@perfil" /></label>
      <label>Site<input name="site" /></label><label>Cidade<input name="cidade" /></label>
      <label class="largo">Segmento<input name="segmento" /></label>
      <label class="largo">Notas<textarea name="notas"></textarea></label>
      <div class="largo rodape" style="margin:0"><button type="button" class="btn btn-vidro" id="n-cancelar">Cancelar</button><button class="btn btn-claro">Adicionar</button></div>
    </form>`);
  $('#n-cancelar', corpo).onclick = fecharModal;
  $('#form-novo', corpo).onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    if (await tentar(() => post('/leads', { ...d, origem: 'manual' }), 'Lead adicionado')) { fecharModal(); renderKanban(); }
  };
}

function importar() {
  const corpo = modal(`
    <h2>Importar leads</h2>
    <p class="sub">Uma linha por lead, separando por ponto e vírgula:<br><code>empresa; telefone; cidade; segmento; instagram; site</code></p>
    <textarea id="txt-imp" style="width:100%;min-height:200px" placeholder="Barbearia Ronin; 83 99999-0000; Cajazeiras PB; barbearia; @barbeariaronin;"></textarea>
    <div class="rodape"><button class="btn btn-vidro" id="i-cancelar">Cancelar</button><button class="btn btn-claro" id="i-ok">Importar</button></div>`);
  $('#i-cancelar', corpo).onclick = fecharModal;
  $('#i-ok', corpo).onclick = async () => {
    const linhas = $('#txt-imp', corpo).value.split('\n').map((s) => s.trim()).filter(Boolean);
    const leads = linhas.map((s) => { const [empresa, telefone, cidade, segmento, instagram, site] = s.split(';').map((x) => (x || '').trim()); return { empresa, nome: empresa, telefone, cidade, segmento, instagram, site, origem: 'importado' }; }).filter((l) => l.empresa);
    if (!leads.length) return toast('Nada para importar.');
    const r = await tentar(() => post('/leads', leads));
    if (r) { toast(`${r.criados?.length ?? leads.length} importados${r.duplicados?.length ? `, ${r.duplicados.length} já existiam` : ''}`, 'ok'); fecharModal(); renderKanban(); }
  };
}

// ---------- WHATSAPP ----------
async function abrirWhatsApp() {
  await carregarStatusWa();
  renderConexao();
  if (E.wa.estado === 'conectado') await carregarConversas();
  else $('#wa-conversas').innerHTML = '';
}

function renderConexao() {
  const w = E.wa, box = $('#wa-conexao');
  if (w.estado === 'conectado') {
    E.codigoPar = null;
    box.innerHTML = `<div class="wa-eu"><div style="display:flex;gap:10px;align-items:center"><div class="avatar">${iniciais(w.eu?.nome || 'J')}</div><div><p style="margin:0;font-weight:700">${esc(w.eu?.nome || 'Conectado')}</p><p class="dica" style="margin:0">${esc(fone(w.eu?.numero))}</p></div></div><span class="selo ok">conectado</span></div>`;
  } else if (E.codigoPar) {
    box.innerHTML = `<div class="wa-qr"><p class="dica" style="margin:0">Digite este código no celular</p>
      <p style="font-family:var(--mono);font-size:30px;font-weight:600;letter-spacing:.12em;margin:8px 0">${esc(E.codigoPar.slice(0, 4))}-${esc(E.codigoPar.slice(4))}</p>
      <ol><li>WhatsApp → <b>⋮ → Aparelhos conectados → Conectar aparelho</b></li><li>Toque em <b>Conectar com número de telefone</b> (embaixo do leitor)</li><li>Digite o código acima</li></ol>
      <button class="btn btn-vidro btn-pequeno" id="wa-voltar-qr">Voltar para o QR</button></div>`;
    $('#wa-voltar-qr').onclick = () => { E.codigoPar = null; renderConexao(); };
  } else if (w.estado === 'qr' && w.qr) {
    box.innerHTML = `<div class="wa-qr"><img src="${esc(w.qr)}" alt="QR do WhatsApp" /><ol><li>No celular, abra o WhatsApp</li><li>Toque em <b>⋮ → Aparelhos conectados → Conectar aparelho</b></li><li>Aponte para este QR</li></ol>
      <p class="dica" style="margin:10px 0 6px">O QR não funciona? Conecte com código:</p>
      <form id="form-codigo" style="display:flex;gap:8px"><input name="numero" placeholder="5583999670561" style="flex:1;min-width:0" /><button class="btn btn-vidro btn-pequeno">Gerar código</button></form></div>`;
    $('#form-codigo').onsubmit = async (e) => {
      e.preventDefault();
      const numero = new FormData(e.target).get('numero');
      const b = $('button', e.target); b.disabled = true; b.textContent = 'Gerando…';
      const r = await tentar(() => post('/wa/codigo', { numero }));
      if (r?.codigo) { E.codigoPar = String(r.codigo).replace(/[^A-Z0-9]/gi, ''); renderConexao(); }
      else { b.disabled = false; b.textContent = 'Gerar código'; }
    };
  } else {
    box.innerHTML = `<div class="vazio" style="padding:18px 6px"><p class="jp">話</p><p>WhatsApp ${w.estado === 'conectando' ? 'conectando…' : 'desconectado'}.</p>
      <button class="btn btn-claro" id="wa-conectar"><i data-lucide="qr-code"></i>Conectar com QR</button>
      <p class="dica" style="margin-top:12px">Robô em número pessoal pode ser banido pelo WhatsApp. O Nagi segura no máximo ${E.config.limiteDia || 25} conversas novas por dia, com intervalo entre envios.</p></div>`;
    $('#wa-conectar').onclick = async () => { await tentar(() => post('/wa/conectar')); setTimeout(abrirWhatsApp, 1500); };
  }
  icones();
}

async function carregarConversas() {
  E.conversas = (await tentar(() => get('/wa/conversas?limite=60'))) || [];
  renderConversas();
}
function renderConversas() {
  const q = E.buscaConversas.toLowerCase();
  const lista = E.conversas.filter((c) => !q || `${c.nome} ${c.numero}`.toLowerCase().includes(q));
  $('#wa-conversas').innerHTML = lista.map((c) => `<div class="conversa ${c.jid === E.chatJid ? 'ativa' : ''}" data-jid="${esc(c.jid)}">
    <div class="avatar">${iniciais(c.nome || c.numero)}</div>
    <div class="meio"><p style="font-weight:700">${esc(c.nome || fone(c.numero))}</p><p class="ult">${esc(c.ultimaMensagem || '')}</p></div>
    <div class="lado">${quando(c.quando)}<br>${c.naoLidas ? `<em>${c.naoLidas}</em>` : ''}</div></div>`).join('') || '<p class="dica" style="padding:10px">Nenhuma conversa ainda.</p>';
  $$('#wa-conversas .conversa').forEach((el) => (el.onclick = () => abrirChat(el.dataset.jid)));
}

async function abrirChat(jid) {
  E.chatJid = jid;
  renderConversas();
  const c = E.conversas.find((x) => x.jid === jid) || { jid };
  const lead = E.leads.find((l) => String(l.telefone || '').replace(/\D/g, '').endsWith(String(c.numero || '').replace(/\D/g, '').slice(-8)) && c.numero);
  $('#wa-chat').innerHTML = `
    <div class="chat-topo"><div class="avatar">${iniciais(c.nome || c.numero)}</div><div style="flex:1"><p style="margin:0;font-weight:700">${esc(c.nome || fone(c.numero))}</p><p class="dica" style="margin:0">${esc(fone(c.numero))}${lead ? ` · lead: ${esc(NOME_ETAPA[lead.status] || lead.status)}` : ''}</p></div>
    ${lead ? `<button class="btn btn-vidro btn-pequeno" id="chat-lead"><i data-lucide="user"></i>Abrir lead</button>` : `<button class="btn btn-vidro btn-pequeno" id="chat-virar-lead"><i data-lucide="user-plus"></i>Virar lead</button>`}</div>
    <div class="mensagens" id="mensagens"></div>
    <form class="enviar" id="form-chat"><textarea id="txt-chat" placeholder="Escreva… (Enter envia, Shift+Enter quebra linha)"></textarea><button class="btn btn-claro"><i data-lucide="send"></i></button></form>`;
  if (lead) $('#chat-lead').onclick = () => abrirLead(lead.id);
  else $('#chat-virar-lead').onclick = async () => { if (await tentar(() => post('/leads', { nome: c.nome, empresa: c.nome, telefone: c.numero, origem: 'WhatsApp', status: 'respondeu' }), 'Virou lead')) { await carregarLeads(); abrirChat(jid); } };
  const txt = $('#txt-chat');
  txt.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#form-chat').requestSubmit(); } };
  $('#form-chat').onsubmit = async (e) => {
    e.preventDefault();
    const t = txt.value.trim(); if (!t) return;
    txt.value = '';
    if (await tentar(() => post('/wa/enviar', { para: jid, texto: t, leadId: lead?.id, origem: 'ui' }))) carregarMensagens();
    else txt.value = t;
  };
  icones();
  carregarMensagens();
}

async function carregarMensagens() {
  if (!E.chatJid) return;
  const box = $('#mensagens'); if (!box) return;
  const msgs = (await tentar(() => get(`/wa/mensagens?jid=${encodeURIComponent(E.chatJid)}&limite=60`))) || [];
  const noFim = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  box.innerHTML = msgs.map((m) => `<div class="bolha ${m.deMim ? 'minha' : 'dele'}">${esc(m.texto || '[mídia]')}<small>${quando(m.quando)}</small></div>`).join('') || '<p class="dica">Sem mensagens carregadas ainda.</p>';
  if (noFim || box.dataset.primeira !== '1') { box.scrollTop = box.scrollHeight; box.dataset.primeira = '1'; }
}

// ---------- FILA ----------
async function carregarFila() {
  $$('#abas-fila button').forEach((b) => b.classList.toggle('ativo', b.dataset.st === E.filtroFila));
  E.fila = (await tentar(() => get(`/fila?status=${E.filtroFila}`))) || [];
  contarFila();
  const lista = $('#lista-fila');
  if (!E.fila.length) { lista.innerHTML = `<div class="cartao vazio" style="grid-column:1/-1"><p class="jp">待</p><p>Nada ${E.filtroFila === 'pendente' ? 'esperando aprovação' : E.filtroFila === 'aprovado' ? 'aprovado esperando a vez' : 'aqui'}.</p></div>`; return; }
  const pend = E.filtroFila === 'pendente';
  const topoAprovar = pend && E.fila.length > 1
    ? `<div class="cartao" style="grid-column:1/-1;margin:0;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <p style="margin:0">${E.fila.length} mensagens esperando. Aprovando, elas saem uma por vez, com ${esc(E.config.intervaloSeg || 90)}s+ entre cada, só das ${esc(E.config.horarioInicio ?? 8)}h às ${esc(E.config.horarioFim ?? 19)}h e até ${esc(E.config.limiteDia || 25)} conversas novas por dia.</p>
        <button class="btn btn-ok" id="aprovar-todas"><i data-lucide="send"></i>Aprovar todas</button></div>`
    : '';
  lista.innerHTML = topoAprovar + E.fila.map((f) => `<div class="item-fila" data-id="${esc(f.id)}">
    <div class="topo"><div><p class="quem">${esc(f.nome || 'Contato')}</p><p class="num">${esc(fone(f.para))}</p></div>
      <span class="selo ${f.origem === 'mcp' ? '' : 'cinza'}">${f.origem === 'mcp' ? 'IA (MCP)' : 'você'}</span></div>
    ${pend ? `<textarea>${esc(f.texto)}</textarea>` : `<p style="margin:0;white-space:pre-wrap">${esc(f.texto)}</p>`}
    ${f.erro ? `<p class="dica" style="color:var(--erro)">${esc(f.erro)}</p>` : ''}
    <p class="dica" style="margin:0">${new Date(f.criadoEm).toLocaleString('pt-BR')}${f.enviadoEm ? ` · enviada ${new Date(f.enviadoEm).toLocaleString('pt-BR')}` : ''}</p>
    ${pend ? `<div class="linha-botoes"><button class="btn btn-ok btn-pequeno" data-a="aprovar"><i data-lucide="send"></i>Aprovar e enviar</button><button class="btn btn-vidro btn-pequeno" data-a="salvar">Salvar texto</button><button class="btn btn-perigo btn-pequeno" data-a="rejeitar">Rejeitar</button></div>` : ''}
  </div>`).join('');
  const bTodas = $('#aprovar-todas');
  if (bTodas) bTodas.onclick = async () => {
    if (!confirm(`Aprovar as ${E.fila.length} mensagens? Elas saem uma por vez, respeitando as travas.`)) return;
    bTodas.disabled = true;
    let ok = 0;
    for (const f of E.fila) {
      const el = lista.querySelector(`.item-fila[data-id="${f.id}"]`);
      const texto = el && $('textarea', el)?.value;
      try {
        if (texto && texto !== f.texto) await patch(`/fila/${f.id}`, { texto });
        await post(`/fila/${f.id}/aprovar`);
        ok++;
      } catch (e) { toast(`${f.nome || f.para}: ${e.message}`, 'erro'); }
    }
    toast(`${ok} aprovadas. Acompanhe nas abas Aprovadas e Enviadas.`, 'ok');
    carregarFila();
  };
  $$('.item-fila', lista).forEach((el) => {
    const id = el.dataset.id;
    $$('[data-a]', el).forEach((b) => (b.onclick = async () => {
      const texto = $('textarea', el)?.value;
      if (b.dataset.a === 'salvar') return tentar(() => patch(`/fila/${id}`, { texto }), 'Texto salvo');
      if (b.dataset.a === 'aprovar') {
        const f = E.fila.find((x) => x.id === id);
        if (texto !== f.texto) await tentar(() => patch(`/fila/${id}`, { texto }));
        b.disabled = true;
        if (await tentar(() => post(`/fila/${id}/aprovar`), 'Aprovada: sai respeitando o intervalo')) carregarFila();
        else b.disabled = false;
      }
      if (b.dataset.a === 'rejeitar' && (await tentar(() => post(`/fila/${id}/rejeitar`)))) carregarFila();
    }));
  });
  icones();
}

// ---------- INSTAGRAM ----------
async function carregarIg() {
  E.rascunhos = (await tentar(() => get('/instagram/rascunhos'))) || [];
  const feito = (r) => r.status === 'feito' || r.feito;
  const pend = E.rascunhos.filter((r) => !feito(r));
  $('#badge-ig').textContent = pend.length || '';
  const lista = $('#lista-ig');
  if (!E.rascunhos.length) { lista.innerHTML = '<div class="cartao vazio" style="grid-column:1/-1"><p class="jp">写</p><p>Sem rascunhos. Abra um lead com Instagram e clique em “DM no Instagram”, ou peça para a IA preparar pelo MCP.</p></div>'; return; }
  lista.innerHTML = E.rascunhos.map((r) => `<div class="item-fila" data-id="${esc(r.id)}">
    <div class="topo"><p class="quem"><a href="https://www.instagram.com/${esc(r.usuario)}/" target="_blank" rel="noopener">@${esc(r.usuario)}</a></p><span class="selo ${feito(r) ? 'ok' : 'alerta'}">${feito(r) ? 'enviada' : 'para enviar'}</span></div>
    <textarea>${esc(r.texto)}</textarea>
    ${feito(r) ? '' : '<div class="linha-botoes"><button class="btn btn-claro btn-pequeno" data-a="abrir"><i data-lucide="external-link"></i>Copiar e abrir a DM</button><button class="btn btn-vidro btn-pequeno" data-a="feito">Marcar como enviada</button><button class="btn btn-vidro btn-pequeno" data-a="salvar">Salvar texto</button><button class="btn btn-perigo btn-pequeno" data-a="descartar">Descartar</button></div>'}
  </div>`).join('');
  $$('.item-fila', lista).forEach((el) => {
    const r = E.rascunhos.find((x) => x.id === el.dataset.id);
    $$('[data-a]', el).forEach((b) => (b.onclick = async () => {
      if (b.dataset.a === 'abrir') return copiarEAbrirIg(r.usuario, $('textarea', el).value, r.id);
      if (b.dataset.a === 'salvar') return tentar(() => patch(`/instagram/rascunho/${r.id}`, { texto: $('textarea', el).value }), 'Texto salvo');
      if (b.dataset.a === 'descartar') { if (await tentar(() => del(`/instagram/rascunho/${r.id}`), 'DM descartada')) carregarIg(); return; }
      if (await tentar(() => post(`/instagram/rascunho/${r.id}/feito`), 'Marcada como enviada')) carregarIg();
    }));
  });
  icones();
}

// ---------- ESTÚDIO ----------
function renderEstudio() {
  const f = $('#form-estudio');
  if (E.previaDados) { Object.entries(E.previaDados).forEach(([k, v]) => { if (f.elements[k] && v) f.elements[k].value = v; }); E.previaDados = null; gerarPrevia(); }
  $('#lista-prompts').innerHTML = PROMPT_TEMPLATES.map((p, i) => `<div class="prompt"><span class="selo">${esc(p.category)} · ${esc(p.segment)}</span><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><button class="btn btn-vidro btn-pequeno" data-i="${i}"><i data-lucide="copy"></i>Copiar com os dados do formulário</button></div>`).join('');
  $$('#lista-prompts [data-i]').forEach((b) => (b.onclick = async () => {
    const d = Object.fromEntries(new FormData(f));
    const t = PROMPT_TEMPLATES[+b.dataset.i].promptText.replaceAll('{{EMPRESA}}', d.company || 'a empresa').replaceAll('{{CIDADE}}', d.city || 'sua cidade').replaceAll('{{DIFERENCIAL}}', d.diferencial || 'diferenciais do negócio').replaceAll('{{OFERTA}}', d.oferta || 'oferta da semana');
    try { await navigator.clipboard.writeText(t); toast('Prompt copiado', 'ok'); } catch { toast('Não consegui copiar', 'erro'); }
  }));
  icones();
}
function gerarPrevia() {
  const d = Object.fromEntries(new FormData($('#form-estudio')));
  E.previaHTML = generateLandingPageHTML(d);
  $('#previa-lp').srcdoc = E.previaHTML;
}
function baixar(nome, conteudo, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- AJUSTES ----------
async function renderAjustes() {
  E.config = (await tentar(() => get('/config'))) || E.config;
  const c = E.config;
  $('#form-config').innerHTML = `
    <div class="largo cartao-topo" style="margin:0"><h2>Travas do WhatsApp</h2><span class="dica">valem para você e para a IA</span></div>
    <div class="largo opcao-modo">
      <label><input type="radio" name="modo" value="aprovacao" ${c.modo !== 'auto' ? 'checked' : ''} /><span>Aprovação (recomendado)<small>A IA prepara e a mensagem espera você na fila.</small></span></label>
      <label><input type="radio" name="modo" value="auto" ${c.modo === 'auto' ? 'checked' : ''} /><span>Automático<small>A IA envia sozinha, dentro das travas abaixo.</small></span></label>
    </div>
    <label>Conversas novas por dia<input name="limiteDia" type="number" min="1" max="200" value="${esc(c.limiteDia ?? 25)}" /></label>
    <label>Intervalo mínimo entre envios (s)<input name="intervaloSeg" type="number" min="20" max="3600" value="${esc(c.intervaloSeg ?? 90)}" /></label>
    <label>Envia a partir de (hora)<input name="horarioInicio" type="number" min="0" max="23" value="${esc(c.horarioInicio ?? 8)}" /></label>
    <label>Até (hora)<input name="horarioFim" type="number" min="1" max="24" value="${esc(c.horarioFim ?? 19)}" /></label>
    <label>Assinatura nas mensagens<input name="assinatura" value="${esc(c.assinatura ?? 'Jerry')}" /></label>
    <label>Token do treg (opcional)<input name="tregToken" type="password" placeholder="${c.tregToken ? 'salvo: ' + esc(c.tregToken) : 'usa o login do treg deste PC'}" autocomplete="off" /></label>
    <div class="largo linha-botoes"><button class="btn btn-ok" type="submit"><i data-lucide="check"></i>Salvar ajustes</button><button class="btn btn-perigo" type="button" id="wa-sair"><i data-lucide="log-out"></i>Desconectar WhatsApp e apagar sessão</button></div>`;
  $('#form-config').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    ['limiteDia', 'intervaloSeg', 'horarioInicio', 'horarioFim'].forEach((k) => (d[k] = Number(d[k])));
    if (!d.tregToken) delete d.tregToken;
    if (await tentar(() => post('/config', d), 'Ajustes salvos')) { renderAjustes(); carregarStatusWa(); }
  };
  $('#wa-sair').onclick = async () => {
    if (!confirm('Desconectar o WhatsApp do Nagi e apagar a sessão salva neste PC?')) return;
    if (await tentar(() => post('/wa/sair'), 'WhatsApp desconectado')) carregarStatusWa();
  };
  const caminho = 'C:\\\\Users\\\\WIN11\\\\OneDrive\\\\Documentos\\\\nagi\\\\mcp\\\\nagi-mcp.mjs';
  const caminhoTxt = 'C:\\Users\\WIN11\\OneDrive\\Documentos\\nagi\\mcp\\nagi-mcp.mjs';
  $('#mcp-info').innerHTML = `
    <div class="cartao-topo"><h2>Ligar na sua IA (MCP)</h2><span class="dica">o Nagi precisa estar aberto</span></div>
    <p class="sub" style="margin:0 0 8px">Com o MCP, o Antigravity ou o Codex leem suas conversas, cadastram leads, buscam empresas no Maps e preparam mensagens. No modo aprovação, tudo que a IA quiser enviar cai na fila.</p>
    <p style="margin:12px 0 0;font-weight:700">Antigravity</p>
    <p class="dica" style="margin:2px 0">arquivo <code>%USERPROFILE%\\.gemini\\antigravity\\mcp_config.json</code></p>
    <pre class="codigo">{
  "mcpServers": {
    "nagi": { "command": "node", "args": ["${caminho}"] }
  }
}</pre>
    <p style="margin:12px 0 0;font-weight:700">Codex</p>
    <pre class="codigo">codex mcp add nagi -- node "${esc(caminhoTxt)}"</pre>
    <p class="dica">Depois peça, por exemplo: “use o nagi para buscar 20 barbearias em Cajazeiras PB, adicionar como leads e preparar uma mensagem curta para as que não têm site”.</p>`;
  icones();
}

// ---------- início ----------
function ligar() {
  $$('#menu button').forEach((b) => (b.onclick = () => irPara(b.dataset.tela)));
  $$('[data-ir]').forEach((b) => (b.onclick = () => irPara(b.dataset.ir)));
  $('#busca-leads').oninput = (e) => { E.buscaLeads = e.target.value; renderKanban(); };
  $('#busca-conversas').oninput = (e) => { E.buscaConversas = e.target.value; renderConversas(); };
  $('#btn-novo-lead').onclick = novoLead;
  $('#btn-importar').onclick = importar;
  $$('#abas-fila button').forEach((b) => (b.onclick = () => { E.filtroFila = b.dataset.st; carregarFila(); }));
  $('#form-prospectar').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const b = $('button', e.target); b.disabled = true; b.innerHTML = 'Buscando no Maps…';
    const r = await tentar(() => post('/prospectar', d));
    b.disabled = false; b.innerHTML = '<i data-lucide="search"></i>Buscar'; icones();
    if (r) { E.resultados = r.resultados || []; E.ultimaBusca = { ...d, servidoPor: r.servidoPor, custoUSD: r.custoUSD }; renderProspeccao(); if (!E.resultados.length) toast('Nenhum resultado. Tente outro termo ou cidade.'); }
  };
  $('#form-estudio').onsubmit = (e) => { e.preventDefault(); gerarPrevia(); };
  $('#baixar-lp').onclick = () => { if (!E.previaHTML) gerarPrevia(); baixar('pagina-nagi.html', E.previaHTML, 'text/html'); };
  $('#baixar-n8n').onclick = () => baixar('fluxo-nagi-n8n.json', generateN8nWorkflowJSON(Object.fromEntries(new FormData($('#form-estudio')))), 'application/json');
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { fecharModal(); $('#gaveta').hidden = true; } });
  // parallax suave da onda
  const onda = $('.hero-onda');
  addEventListener('pointermove', (e) => {
    onda.style.setProperty('--px', `${(e.clientX / innerWidth - 0.5) * -18}px`);
    onda.style.setProperty('--py', `${(e.clientY / innerHeight - 0.5) * -10}px`);
  });
}

async function iniciar() {
  window.oceano = new Oceano($('#mar'), { escala: 0.55 });
  ligar();
  icones();
  E.config = (await tentar(() => get('/config'))) || {};
  await carregarStatusWa();
  const inicial = location.hash.slice(1);
  irPara(['painel', 'prospectar', 'leads', 'whatsapp', 'fila', 'instagram', 'estudio', 'ajustes'].includes(inicial) ? inicial : 'painel');
  // atualizações periódicas
  setInterval(carregarStatusWa, 5000);
  setInterval(() => { contarFila(); if (E.tela === 'painel') renderPainel(); }, 30000);
  setInterval(() => {
    if (E.tela !== 'whatsapp' || E.wa.estado === 'conectado' || E.codigoPar) return;
    const campo = document.querySelector('#form-codigo input');
    if (campo && (campo.value || document.activeElement === campo)) return; // não apaga o que ele está digitando
    renderConexao();
  }, 5000);
  setInterval(() => { if (E.tela === 'whatsapp' && E.wa.estado === 'conectado') carregarConversas(); }, 9000);
  setInterval(() => { if (E.tela === 'whatsapp' && E.chatJid) carregarMensagens(); }, 4000);
}

iniciar();
