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

// Com a chave do time de prospecção salva na config (Ajustes → Token do treg), chama o treg direto por HTTP:
// POST https://treg.to/call/<id> com X-Treg-Token. Sem chave, cai no CLI logado neste PC.
async function chamarTregHttp(id, corpo, token) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(`https://treg.to/call/${id}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Treg-Token': token,
        'X-Treg-Route-Max-Cost': '0.01',
        'X-Treg-Route-Waterfall': '0',
        'User-Agent': 'nagi-local',
      },
      body: JSON.stringify(corpo),
    });
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch {}
    const custo = Number(r.headers.get('x-treg-cost-micro'));
    const servidoPor = r.headers.get('x-treg-served-by') || '';
    if (!r.ok) {
      const det = json?.detail;
      if (r.status === 402 || det?.error === 'insufficient_balance') {
        return { erro: `saldo do treg insuficiente${det?.balance_micro != null ? ` (saldo US$ ${(det.balance_micro / 1e6).toFixed(4)})` : ''}. Recarregue a conta do time de prospecção em treg.to.` };
      }
      if (r.status === 401 || r.status === 403) return { erro: 'a chave do treg salva em Ajustes não foi aceita' };
      return { erro: `treg ${r.status}: ${(det?.message || det?.error || texto || '').toString().slice(0, 160)}` };
    }
    if (!json) return { erro: 'resposta do treg não é JSON' };
    return { json, custoMicro: Number.isFinite(custo) ? custo : null, servidoPor };
  } catch (e) {
    return { erro: e.name === 'AbortError' ? 'o treg demorou mais de 60 s' : `treg: ${e.message}` };
  } finally {
    clearTimeout(t);
  }
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
    site: limparSite(primeiro(p, 'website', 'site', 'url', 'domain')),
    endereco: String(primeiro(p, 'address', 'full_address', 'formatted_address', 'address_info.address')),
    nota: Number(primeiro(p, 'rating.value', 'rating')) || null,
    avaliacoes: Number(primeiro(p, 'reviews', 'reviews_count', 'user_ratings_total', 'ratingCount', 'rating.votes_count')) || null,
    categoria: String(primeiro(p, 'category', 'type') || (Array.isArray(tipos) ? tipos[0] : '') || ''),
    mapsUrl: String(primeiro(p, 'mapsUrl', 'maps_url', 'link', 'url', 'check_url') || ''),
  };
  // site que é perfil do Instagram vira o @ do lead (ótimo para DM) e deixa de contar como site
  r.instagram = '';
  const ig = r.site.match(/instagram\.com\/?([A-Za-z0-9._]+)?/i);
  if (ig) {
    r.instagram = ig[1] && !/^(p|reel|explore|accounts)$/i.test(ig[1]) ? ig[1] : '';
    r.site = '';
  }
  if (r.mapsUrl && !/google\.[a-z.]+\/maps|maps\.google|goo\.gl\/maps|g\.page|cid=/i.test(r.mapsUrl)) r.mapsUrl = '';
  if (r.site && r.site === r.mapsUrl) r.site = '';
  return r;
}

export async function prospectarMaps({ busca, cidade, limite = 20 }) {
  const b = String(busca || '').trim();
  const c = String(cidade || '').trim();
  if (!b) return { erro: 'informe o que buscar (ex.: barbearia)' };
  const q = c ? `${b} em ${c}` : b;
  const token = dados.config().tregToken;
  const r = token
    ? await chamarTregHttp('treg.google.serp.maps', { q, country: 'br', language: 'pt' }, token)
    : await rodarTreg([
    'call', 'treg.google.serp.maps',
    '--method', 'POST',
    '--data', JSON.stringify({ q, country: 'br', language: 'pt' }),
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
    servidoPor: r.servidoPor || meta.served_by || meta.provider || meta.endpoint || meta.route?.provider || '',
    custoUSD: r.custoMicro != null ? r.custoMicro / 1e6 : meta.charged_micro != null ? meta.charged_micro / 1e6 : meta.cost_usd ?? null,
    conta: token ? 'time de prospecção (chave do Nagi)' : 'login do CLI',
  };
}

// ---------------- Instagram ----------------
// Perfis públicos por palavra-chave (treg.instagram.search.users, ~US$ 0,002 por busca). Só leitura: o Nagi
// nunca manda DM sozinho; a DM vira rascunho e o Jerry envia com um clique.
function normalizarPerfil(p) {
  const url = String(primeiro(p, 'profile_url', 'url', 'link') || '');
  const doUrl = (url.match(/instagram\.com\/([A-Za-z0-9._]+)/i) || [])[1] || '';
  const usuario = String(primeiro(p, 'username', 'handle', 'user.username') || doUrl).replace(/^@/, '');
  return {
    usuario,
    nome: String(primeiro(p, 'full_name', 'fullName', 'name', 'title', 'user.full_name') || ''),
    bio: String(primeiro(p, 'biography', 'bio', 'description', 'passage', 'snippet', 'text') || '').replace(/\s+/g, ' ').slice(0, 300),
    seguidores: Number(primeiro(p, 'follower_count', 'followers', 'followers_count', 'edge_followed_by.count', 'user.follower_count')) || null,
    link: limparSite(primeiro(p, 'external_url', 'bio_link', 'website', 'externalUrl')),
    verificado: !!primeiro(p, 'is_verified', 'verified'),
    privado: !!primeiro(p, 'is_private', 'private'),
  };
}

export async function prospectarInstagram({ busca, cidade, limite = 30 }) {
  const b = String(busca || '').trim();
  const c = String(cidade || '').trim();
  if (!b) return { erro: 'informe o que buscar (ex.: barbearia)' };
  const token = dados.config().tregToken;
  if (!token) return { erro: 'salve a chave do treg em Ajustes (conta de prospecção) para buscar no Instagram' };
  const q = c ? `${b} ${c}` : b;
  const r = await chamarTregHttp('treg.instagram.search.users', { q }, token);
  if (r.erro) return { erro: r.erro };
  const o = r.json?.output ?? r.json;
  const lista = [o?.users, o?.results, o?.items, o?.profiles, Array.isArray(o) ? o : null].find((x) => Array.isArray(x) && x.length) || [];
  const leads = dados.todosLeadsCompletos();
  const vistos = new Set();
  const resultados = lista
    .map(normalizarPerfil)
    .filter((x) => x.usuario && !vistos.has(x.usuario.toLowerCase()) && vistos.add(x.usuario.toLowerCase()))
    .slice(0, Math.max(1, Math.min(60, Number(limite) || 30)))
    .map((x) => ({
      ...x,
      jaEhLead: leads.some((l) => String(l.instagram || '').replace(/^@/, '').toLowerCase() === x.usuario.toLowerCase()),
    }));
  return { busca: q, resultados, servidoPor: r.servidoPor, custoUSD: r.custoMicro != null ? r.custoMicro / 1e6 : null };
}

// ---------------- checagem antes de abordar ----------------
// Pedido do Jerry em 26/11: "tenha certeza que eles não tenham sites e o número ou Instagram seja realmente do lugar"
// (2 barbearias da primeira rodada já tinham site e 1 não era do lugar). Nada é abordado sem passar aqui.
const SEM_ACENTO = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const NAO_E_SITE = /instagram\.com|facebook\.com|fb\.com|fb\.me|google\.|goo\.gl|g\.page|wa\.me|whatsapp\.com|tiktok\.com|youtube\.com|threads\.net|x\.com|twitter\.com|kwai|ifood|guiamais|apontador|telelistas|cnpj|econodata|solutudo|encontra|yelp|tripadvisor|reclameaqui|jusbrasil|escavador|consultas?|casadosdados|empresaqui|cylex|hotfrog|waze|moovit|maps\.|doctoralia|olx|mercadolivre|shopee|bing\.com|wikipedia/i;
const PAGINA_AGENDA = /tuaagenda|minhaagenda|agendamento|booksy|trinks|inbarber|barberapp|appbarber|avec\.|linktr\.ee|bio\.link|beacons\.ai|w\.app|linkme|lnk\.bio|hotmart|wixsite|webnode|negocio\.site|business\.site|ueniweb/i;
const DDD_UF = { PB: ['83'], PE: ['81', '87'], RN: ['84'], CE: ['85', '88'], AL: ['82'], PI: ['86', '89'], BA: ['71', '73', '74', '75', '77'], SE: ['79'], MA: ['98', '99'] };

function tokensNome(nome) {
  const fora = new Set(['barbearia', 'barber', 'barbershop', 'shop', 'studio', 'estudio', 'salao', 'the', 'dos', 'das', 'de', 'da', 'do', 'e', 'lanchonete', 'confeitaria', 'escritorio', 'advocacia', 'advogados', 'cabeleireiro', 'barbeiro', 'ltda', 'me']);
  return SEM_ACENTO(nome).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length >= 4 && !fora.has(t));
}
const dominio = (u) => SEM_ACENTO(String(u || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]);

/** Confere se o lead é mesmo da cidade/estado buscados e se NÃO tem site nem página própria. Custa ~US$ 0,0004 (Google). */
export async function verificarLead({ nome, cidade, endereco, telefone, site, instagram, bio, linkBio }) {
  const motivos = [];
  const cid = SEM_ACENTO(String(cidade || '').replace(/\s+[A-Z]{2}$/, ''));
  const uf = (String(cidade || '').match(/\b([A-Z]{2})$/) || [])[1];
  // 1) lugar
  let local = null;
  if (endereco) {
    local = SEM_ACENTO(endereco).includes(cid);
    if (!local) motivos.push(`endereço fora de ${cidade}: ${endereco}`);
  } else if (bio || nome) {
    const t = SEM_ACENTO(`${nome} ${bio}`);
    local = !!cid && t.includes(cid);
    if (!local) motivos.push(`nada no nome/bio diz que é de ${cidade}`);
  }
  const ddd = String(telefone || '').replace(/\D/g, '').replace(/^55/, '').slice(0, 2);
  if (telefone && uf && DDD_UF[uf] && !DDD_UF[uf].includes(ddd)) {
    local = false;
    motivos.push(`DDD ${ddd} não é de ${uf}`);
  }
  // 2a) bio que manda para link/cardápio/loja online = já vende por página própria
  const BIO_COM_PAGINA = /link (abaixo|na bio|da bio|aba)|card[aá]pio (on-?line|no link|digital|virtual)|pedidos? (on-?line|no link|pelo link|via link|pelo site)|loja (on-?line|virtual)|nosso site|acesse o site|encomendas no link|pe[cç]a pelo link/i;
  if (bio && BIO_COM_PAGINA.test(bio)) motivos.push('a bio manda para um link/cardápio/loja online (já tem página)');
  // 2b) franquia: tem o site da rede
  const FRANQUIA = /milky ?moo|bob'?s|mc ?donald|burger king|subway|cacau show|chiquinho|kopenhagen|botic[aá]rio|giraffas|spoleto|habib|china in box|ki-?sabor|sodi[eê] doces|amor aos peda[cç]os|o rei do mate|barbearia ?vip/i;
  if (FRANQUIA.test(`${nome} ${bio}`)) motivos.push('franquia de rede (já tem o site da marca)');
  // 2) site já conhecido (Maps / bio do Instagram)
  let temSite = false, pagina = '';
  for (const u of [site, linkBio].filter(Boolean)) {
    if (PAGINA_AGENDA.test(u)) { pagina = u; }
    else if (!NAO_E_SITE.test(u)) { temSite = true; motivos.push(`já tem site: ${u}`); }
  }
  if (pagina) motivos.push(`já tem página de agendamento/links: ${pagina}`);
  // 3) Google: "<nome> <cidade>"
  const token = dados.config().tregToken;
  let googleChecado = false;
  if (!temSite && !pagina && token && nome) {
    const r = await chamarTregHttp('treg.google.serp.organic', { q: `${nome} ${String(cidade || '').replace(/\s+[A-Z]{2}$/, '')}`, country: 'br', language: 'pt', limit: 10 }, token);
    if (!r.erro) {
      googleChecado = true;
      const o = r.json?.output ?? r.json;
      const linhas = [o?.results, o?.organic, o?.organic_results, o?.items, Array.isArray(o) ? o : null].find((x) => Array.isArray(x)) || [];
      const tk = tokensNome(nome);
      for (const l of linhas) {
        const url = String(l.url || l.link || l.href || '');
        const titulo = SEM_ACENTO(l.title || l.name || '');
        if (!url) continue;
        const dom = dominio(url);
        const casa = tk.length ? tk.some((t) => dom.replace(/[^a-z0-9]/g, '').includes(t) || titulo.includes(t)) : false;
        if (!casa) continue;
        if (PAGINA_AGENDA.test(url)) { pagina = pagina || url; continue; }
        if (!NAO_E_SITE.test(url) && tk.some((t) => dom.replace(/[^a-z0-9]/g, '').includes(t))) {
          temSite = true; motivos.push(`já tem site (Google): ${url}`); break;
        }
      }
      if (pagina && !motivos.some((m) => m.includes(pagina))) motivos.push(`já tem página de agendamento/links (Google): ${pagina}`);
    } else {
      motivos.push(`não deu para checar no Google: ${r.erro}`);
    }
  }
  const barrado = motivos.some((m) => /link\/card[aá]pio|franquia/.test(m));
  const aprovado = local !== false && !temSite && !pagina && !barrado && (googleChecado || !token ? true : false);
  return { aprovado, local, temSite, pagina, googleChecado, motivos };
}

/** Perfil público do Instagram: bio, link da bio, seguidores (para checar site e cidade). ~US$ 0,001–0,002. */
export async function perfilInstagram(usuario) {
  const u = String(usuario || '').replace(/^@/, '').trim();
  if (!u) return { erro: 'informe o usuário' };
  const token = dados.config().tregToken;
  if (!token) return { erro: 'salve a chave do treg em Ajustes' };
  const r = await chamarTregHttp('treg.instagram.user.profile', { username: u }, token);
  if (r.erro) return { erro: r.erro };
  const o = r.json?.output ?? r.json;
  const p = o?.user || o?.profile || o?.data?.user || o?.data || o;
  const links = Array.isArray(p?.bio_links) ? p.bio_links.map((x) => x?.url).filter(Boolean) : [];
  return {
    usuario: u,
    nome: String(primeiro(p, 'full_name', 'fullName', 'name') || ''),
    bio: String(primeiro(p, 'biography', 'bio', 'description') || '').replace(/\s+/g, ' '),
    linkBio: String(primeiro(p, 'external_url', 'externalUrl', 'website') || links[0] || ''),
    seguidores: Number(primeiro(p, 'follower_count', 'edge_followed_by.count', 'followers_count', 'followers')) || null,
    categoria: String(primeiro(p, 'category_name', 'business_category_name', 'category') || ''),
    privado: !!primeiro(p, 'is_private'),
    empresa: !!primeiro(p, 'is_business_account', 'is_professional_account'),
    telefone: String(primeiro(p, 'public_phone_number', 'contact_phone_number', 'business_phone_number') || ''),
    cidadeNegocio: String(primeiro(p, 'city_name', 'business_address_json.city_name', 'address_street') || ''),
    custoUSD: r.custoMicro != null ? r.custoMicro / 1e6 : null,
  };
}
