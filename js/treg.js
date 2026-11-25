/**
 * Nagi — Treg Gateway Integration Client (treg.to)
 * Supports:
 * 1) Live public catalog search (`GET https://treg.to/catalog/search?q=...`)
 * 2) Authenticated `/call/{endpoint_id}` via `X-Treg-Token` header
 *    (Routes via local `/api/treg/call/...` when running Node server.js,
 *     custom CORS proxy URL if configured, or direct fetch)
 * 3) Realistic Brazilian B2B Sandbox engine when in Demo mode or CORS-restricted static hosting.
 */

export class TregClient {
  constructor() {
    this.baseUrl = 'https://treg.to';
  }

  async searchCatalog(query = 'leads') {
    const url = `${this.baseUrl}/catalog/search?q=${encodeURIComponent(query)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Executes a real Treg endpoint call if token is provided,
   * otherwise runs realistic Sandbox prospecting.
   */
  async prospect({ query, city, endpointId, limit = 8, token = '', proxyUrl = '' }) {
    const startTime = performance.now();
    const logs = [];

    const payload = this.buildPayload(endpointId, query, city, limit);
    logs.push(`[NAGI -> TREG] Endpoint: ${endpointId}`);
    logs.push(`[PAYLOAD] ${JSON.stringify(payload)}`);

    if (token && token.trim().length > 4) {
      const cleanToken = token.trim();
      const isLocalProxy =
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

      let targetUrl = `${this.baseUrl}/call/${endpointId}`;
      if (proxyUrl && proxyUrl.trim()) {
        targetUrl = `${proxyUrl.replace(/\/$/, '')}/call/${endpointId}`;
        logs.push(`[ROUTE] Usando proxy customizado: ${proxyUrl}`);
      } else if (isLocalProxy && window.location.port === '3456') {
        targetUrl = `/api/treg/call/${endpointId}`;
        logs.push(`[ROUTE] Usando proxy local Node.js (/api/treg)`);
      } else {
        logs.push(`[ROUTE] Chamada direta HTTPS para treg.to (X-Treg-Token)`);
      }

      try {
        const isGet = endpointId.startsWith('bravesearch.') || endpointId.startsWith('litescrape.');
        const fetchUrl = isGet
          ? `${targetUrl}?q=${encodeURIComponent(`${query} ${city}`)}`
          : targetUrl;

        const res = await fetch(fetchUrl, {
          method: isGet ? 'GET' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Treg-Token': cleanToken,
            'X-Treg-Route-Max-Cost': '0.50'
          },
          body: isGet ? undefined : JSON.stringify(payload)
        });

        const elapsed = Math.round(performance.now() - startTime);
        const json = await res.json().catch(() => ({}));

        if (res.ok) {
          logs.push(`[TREG 200 OK] ${elapsed}ms • Served-By: ${res.headers.get('X-Treg-Served-By') || 'treg-router'}`);
          const normalized = this.normalizeTregResponse(json, query, city, endpointId);
          if (normalized.length > 0) {
            return { mode: 'live', leads: normalized, logs, raw: json, elapsed };
          }
          logs.push(`[INFO] Resposta vazia do provedor — complementando com leads locais.`);
        } else {
          logs.push(`[TREG ${res.status}] ${json.detail || json.error || 'Falha na chamada'}`);
        }
      } catch (err) {
        logs.push(`[CORS / REDE] Navegador bloqueou chamada direta (${err.message}).`);
        logs.push(`[DICA] Rode 'npm start' na pasta Nagi ou configure um Proxy URL para bypass CORS.`);
      }
    } else {
      logs.push(`[SANDBOX] Modo Demo Vivo ativo (sem X-Treg-Token configurado).`);
    }

    // Realistic Sandbox simulation
    await new Promise((r) => setTimeout(r, 750));
    const elapsed = Math.round(performance.now() - startTime);
    const simulated = this.generateRealisticProspects(query, city, endpointId, limit);
    logs.push(`[TREG SIMULATOR] ${simulated.length} leads qualificados extraídos em ${elapsed}ms • Custo estimado: $0.04`);

    return { mode: 'sandbox', leads: simulated, logs, elapsed };
  }

  buildPayload(endpointId, query, city, limit) {
    if (endpointId === 'treg.people.search') {
      return { q: `Dono ou sócio de ${query} em ${city}`, country: 'BR', limit };
    }
    if (endpointId === 'treg.companies.enrich') {
      return { name: query, country: 'BR' };
    }
    return {
      q: `${query} em ${city}`,
      industry: query,
      country: 'BR',
      limit
    };
  }

  normalizeTregResponse(json, query, city, endpointId) {
    const out = json.output || json;
    const rows = out.companies || out.people || out.results || out.places || [];
    if (!Array.isArray(rows)) return [];

    return rows.slice(0, 12).map((row, idx) => {
      const name = row.name || row.company_name || row.title || `${query} #${idx + 1}`;
      const domain = row.domain || row.website || row.url || '';
      const contact = row.full_name || row.owner || 'Decisor Comercial';
      return {
        id: `treg-${Date.now()}-${idx}`,
        company: name,
        segment: query,
        city: row.location || row.city || city,
        contactName: contact,
        role: row.title && row.full_name ? row.title : 'Proprietário / Sócio',
        phone: row.phone || `55119${Math.floor(81000000 + Math.random() * 18999999)}`,
        email: row.email || (domain ? `contato@${domain.replace(/^https?:\/\//, '').split('/')[0]}` : 'contato@empresa.com.br'),
        instagram: `@${name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14)}`,
        website: domain || 'Sem Landing Page própria',
        rating: row.rating ? `${row.rating} ★` : '4.7 ★ (Google)',
        painPoint: domain
          ? `Site atual (${domain}) sem funil de conversão direta e sem atendimento automático no WhatsApp.`
          : `Sem página própria de conversão; depende de redes sociais e atendimento manual.`,
        potentialTicket: 1800 + Math.floor(Math.random() * 24) * 100,
        offerType: idx % 2 === 0 ? 'Landing Page + Bot WhatsApp' : 'Automação n8n',
        source: endpointId,
        status: 'Novo'
      };
    });
  }

  generateRealisticProspects(query, city, endpointId, limit = 6) {
    const cleanNiche = (query || 'Negócio Local').trim();
    const cleanCity = (city || 'São Paulo, SP').trim();
    const nicheLower = cleanNiche.toLowerCase();

    const prefixes = [
      'Casa', 'Grupo', 'Studio', 'Espaço', 'Império', 'Vila', 'Bistrô', 'Prime', 'Norte', 'Ouro'
    ];
    const suffixesByNiche = nicheLower.includes('churras')
      ? ['da Brasa', 'Fogo de Chão', 'Pampa Grill', 'Cortes Nobres', 'Boi Dourado', 'Gaúcha Premium']
      : nicheLower.includes('odonto') || nicheLower.includes('clínica') || nicheLower.includes('clinica')
      ? ['Sorriso & Arte', 'Odonto Prime', 'Estética Facial', 'Saúde Integrada', 'Vita Care', 'Lumière']
      : nicheLower.includes('barbear')
      ? ['Navalha Clássica', 'Barber Club', 'Cortes & Estilo', 'Old School', 'Senhor Bigode', 'Samurai Barber']
      : nicheLower.includes('imob')
      ? ['Imóveis Select', 'Patrimônio', 'Alto Padrão', 'Consultoria Imobiliária', 'Horizon', 'Capital']
      : ['Pro', 'Express', 'Master', 'Select', 'Premium', 'Digital'];

    const firstNames = ['Marcelo', 'Fernanda', 'Rafael', 'Juliana', 'Gustavo', 'Patrícia', 'Bruno', 'Camila', 'Eduardo', 'Larissa'];
    const lastNames = ['Almeida', 'Cardoso', 'Siqueira', 'Mendes', 'Ribeiro', 'Teixeira', 'Oliveira', 'Nakamura', 'Costa', 'Duarte'];

    const painPoints = [
      `Não possui Landing Page dedicada — tráfego do Instagram cai direto num Linktree genérico e perde leads.`,
      `Demora mais de 30 minutos para responder orçamentos no WhatsApp; ideal para automação n8n + IA.`,
      `Site atual lento no 4G e sem botão de agendamento/reserva imediata.`,
      `Excelente nota no Google Maps, mas não captura contatos para campanhas de recompra automática.`,
      `Anuncia no Google/Meta enviando para home institucional confusa, desperdiçando verba de tráfego.`
    ];

    const siteStates = [
      'Sem Landing Page (apenas Linktree)',
      'Site lento em WordPress (2018)',
      'Apenas Instagram ativo',
      'Cardápio/Portfólio em PDF',
      'Página sem SSL / não responsiva'
    ];

    const count = Math.min(Math.max(Number(limit) || 6, 3), 12);
    const list = [];

    for (let i = 0; i < count; i++) {
      const fName = firstNames[i % firstNames.length];
      const lName = lastNames[(i * 3 + 2) % lastNames.length];
      const suffix = suffixesByNiche[i % suffixesByNiche.length];
      const prefix = prefixes[(i * 2) % prefixes.length];

      const companyName =
        nicheLower.includes('churras')
          ? `Churrascaria ${suffix}`
          : nicheLower.includes('barbear')
          ? `Barbearia ${suffix}`
          : `${cleanNiche} ${prefix} ${suffix}`.replace(/\s+/g, ' ');

      const slug = companyName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 16);

      const ddd = cleanCity.includes('RJ') ? '21' : cleanCity.includes('MG') ? '31' : cleanCity.includes('PR') ? '41' : '11';
      const phone = `55${ddd}9${Math.floor(81000000 + Math.random() * 18999999)}`;
      const ratingVal = (4.5 + Math.random() * 0.48).toFixed(1);
      const reviewsCount = Math.floor(85 + Math.random() * 540);
      const ticket = 1600 + Math.floor(Math.random() * 26) * 100;

      list.push({
        id: `treg-sim-${Date.now()}-${i}`,
        company: companyName,
        segment: cleanNiche,
        city: cleanCity,
        contactName: `${fName} ${lName}`,
        role: i % 2 === 0 ? 'Sócio-Proprietário' : 'Diretor Comercial',
        phone,
        email: `${fName.toLowerCase()}@${slug}.com.br`,
        instagram: `@${slug}`,
        website: siteStates[i % siteStates.length],
        rating: `${ratingVal} ★ (${reviewsCount} avaliações)`,
        painPoint: painPoints[i % painPoints.length],
        potentialTicket: ticket,
        offerType: i % 3 === 0 ? 'Automação n8n + LP' : i % 2 === 0 ? 'Landing Page' : 'Automação n8n',
        source: endpointId,
        status: 'Novo'
      });
    }

    return list;
  }
}
