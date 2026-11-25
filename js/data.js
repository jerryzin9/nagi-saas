/**
 * Nagi SaaS — Seed Data, Prompt Library, Scripts & Treg Presets
 */

export const TREG_ENDPOINTS = [
  {
    id: 'treg.companies.search',
    label: 'Empresas & Negócios (treg.companies.search)',
    method: 'POST',
    cost: '$0.01 - $0.12 / chamada',
    providers: '25 provedores roteados',
    desc: 'Busca empresas por nicho, nome, tecnologia ou domínio com roteamento automático.'
  },
  {
    id: 'treg.people.search',
    label: 'Decisores & Sócios (treg.people.search)',
    method: 'POST',
    cost: '$0.01 - $0.10 / hit',
    providers: '25 provedores roteados',
    desc: 'Encontra fundadores, diretores e donos por segmento, cargo ou empresa.'
  },
  {
    id: 'bravesearch.places.search',
    label: 'Negócios Locais / Mapas (bravesearch.places.search)',
    method: 'GET',
    cost: '$0.005 / chamada',
    providers: 'Brave Places',
    desc: 'Extrai estabelecimentos locais (churrascarias, clínicas, lojas) com endereço e avaliações.'
  },
  {
    id: 'treg.people.email.find',
    label: 'Enriquecer E-mail (treg.people.email.find)',
    method: 'POST',
    cost: '$0.02 / hit',
    providers: '33 provedores roteados',
    desc: 'Descobre e valida e-mail corporativo do decisor para abordagem direta.'
  },
  {
    id: 'treg.companies.enrich',
    label: 'Raio-X Completo (treg.companies.enrich)',
    method: 'POST',
    cost: '$0.03 / hit',
    providers: '32 provedores roteados',
    desc: 'Enriquece domínio, LinkedIn, stack tecnológica e faturamento estimado.'
  }
];

export const INITIAL_LEADS = [
  {
    id: 'lead-101',
    company: 'Churrascaria Brasa Nobre',
    segment: 'Churrascaria',
    city: 'São Paulo, SP',
    contactName: 'Roberto Fagundes',
    role: 'Sócio-Proprietário',
    phone: '5511998421104',
    email: 'contato@brasanobre.com.br',
    instagram: '@brasanobresp',
    website: 'Sem landing page (só linktree)',
    rating: '4.8 ★ (612 avaliações)',
    painPoint: 'Depende só do iFood/Linktree e perde reservas de rodízio e eventos corporativos por falta de página própria e robô de reserva no WhatsApp.',
    potentialTicket: 2400,
    offerType: 'Landing Page + Bot WhatsApp',
    status: 'Respondeu',
    source: 'treg.companies.search',
    createdAt: '2026-11-22T14:20:00Z',
    messages: [
      { sender: 'bot', text: 'Olá Roberto! Vi que a Brasa Nobre tem 4.8 estrelas no Google em SP, mas o link do Instagram vai só para um agregador simples. Criei um protótipo de Landing Page com reserva automática no WhatsApp pra vocês. Posso te mandar o link?', time: 'Ontem, 15:10' },
      { sender: 'lead', text: 'Opa! Manda sim, a gente tá precisando melhorar o agendamento de mesas de sexta e sábado.', time: 'Ontem, 16:42' }
    ]
  },
  {
    id: 'lead-102',
    company: 'Odonto Lumière Studio',
    segment: 'Clínica Odontológica',
    city: 'Curitiba, PR',
    contactName: 'Dra. Camila Vasconcelos',
    role: 'Diretora Clínica',
    phone: '5541991237781',
    email: 'camila@odontolumiere.com.br',
    instagram: '@odontolumiere.cwb',
    website: 'Site antigo não responsivo (2019)',
    rating: '4.9 ★ (340 avaliações)',
    painPoint: 'Anuncia no Meta Ads jogando tráfego direto pro WhatsApp sem qualificação; recepção demora 40 min pra responder e perde pacientes de implante/lentes.',
    potentialTicket: 3800,
    offerType: 'Automação n8n + LP',
    status: 'Proposta',
    source: 'bravesearch.places.search',
    createdAt: '2026-11-21T10:15:00Z',
    messages: [
      { sender: 'bot', text: 'Dra. Camila, tudo bem? Analisei os anúncios da Odonto Lumière e notei que a página atual demora no celular. Montei uma estrutura com Landing Page de alta conversão + fluxo n8n que pré-qualifica o paciente em 10 segundos no WhatsApp.', time: '21/11, 11:05' },
      { sender: 'lead', text: 'Interessante! Qual o investimento para colocar isso rodando ainda este mês?', time: '21/11, 14:30' }
    ]
  },
  {
    id: 'lead-103',
    company: 'Barbearia Ronin Club',
    segment: 'Barbearia',
    city: 'Belo Horizonte, MG',
    contactName: 'Lucas Moura',
    role: 'Fundador',
    phone: '5531987445520',
    email: 'lucas@roninclub.barber',
    instagram: '@roninclub.bh',
    website: 'Sem site próprio',
    rating: '4.7 ★ (289 avaliações)',
    painPoint: 'Quer lançar plano de assinatura mensal (clube de corte ilimitado), mas não tem página de vendas nem checkout recorrente integrado.',
    potentialTicket: 1850,
    offerType: 'Landing Page',
    status: 'Vendido - LP',
    source: 'treg.companies.search',
    createdAt: '2026-11-18T09:00:00Z',
    messages: [
      { sender: 'bot', text: 'Fala Lucas! Curti demais a estética oriental da Ronin Club. Preparei uma ideia de página para vender seu plano de assinatura mensal sem depender de comissão de app.', time: '18/11, 10:12' },
      { sender: 'lead', text: 'Fechado! Acabei de aprovar, vamos subir essa LP semana que vem.', time: '19/11, 17:40' }
    ]
  },
  {
    id: 'lead-104',
    company: 'Horizonte Prime Imóveis',
    segment: 'Imobiliária',
    city: 'Florianópolis, SC',
    contactName: 'Henrique Tavares',
    role: 'Head Comercial',
    phone: '5548996102234',
    email: 'henrique@horizonteprime.com.br',
    instagram: '@horizonteprime.sc',
    website: 'Portal genérico de imobiliária',
    rating: '4.6 ★ (145 avaliações)',
    painPoint: 'Leads chegam de portais e ficam espalhados em planilhas; precisa de automação n8n distribuindo para corretores e enviando follow-up automático.',
    potentialTicket: 4200,
    offerType: 'Automação n8n',
    status: 'Vendido - Automação',
    source: 'treg.people.search',
    createdAt: '2026-11-15T16:40:00Z',
    messages: [
      { sender: 'bot', text: 'Henrique, implementei um fluxo no n8n que captura o lead do anúncio, enriquece o perfil e distribui em 3 segundos no WhatsApp do corretor da vez.', time: '15/11, 17:00' },
      { sender: 'lead', text: 'Era exatamente esse gargalo que queríamos resolver. Contrato assinado!', time: '17/11, 11:20' }
    ]
  },
  {
    id: 'lead-105',
    company: 'Kurogane Burger & Grill',
    segment: 'Hamburgueria',
    city: 'Campinas, SP',
    contactName: 'Thiago Nogueira',
    role: 'Proprietário',
    phone: '5519994028812',
    email: 'thiago@kuroganeburger.com.br',
    instagram: '@kuroganeburger',
    website: 'Cardápio em PDF no Drive',
    rating: '4.8 ★ (420 avaliações)',
    painPoint: 'Cardápio em PDF pesado no celular e zero automação para cupons de recompra em dias de movimento baixo.',
    potentialTicket: 1900,
    offerType: 'Landing Page',
    status: 'Contatado',
    source: 'bravesearch.places.search',
    createdAt: '2026-11-23T18:10:00Z',
    messages: [
      { sender: 'bot', text: 'Fala Thiago! Vi o cardápio da Kurogane — os burgers têm um visual absurdo, mas o PDF no Drive trava no 4G. Posso te mostrar como ficaria uma Landing Page interativa com pedido direto no WhatsApp?', time: '23/11, 18:30' }
    ]
  },
  {
    id: 'lead-106',
    company: 'Bastos & Nakano Advocacia',
    segment: 'Advocacia',
    city: 'São Paulo, SP',
    contactName: 'Dr. Kenji Nakano',
    role: 'Sócio Fundador',
    phone: '5511983329011',
    email: 'kenji@bastosnakano.adv.br',
    instagram: '@bastosnakano.adv',
    website: 'Institucional estático sem captação',
    rating: '5.0 ★ (78 avaliações)',
    painPoint: 'Recebe indicações mas não possui página focada em Direito Empresarial/Tributário com agendamento integrado.',
    potentialTicket: 3200,
    offerType: 'Landing Page + Automação',
    status: 'Novo',
    source: 'treg.people.search',
    createdAt: '2026-11-24T09:30:00Z',
    messages: []
  }
];

export const PROMPT_TEMPLATES = [
  {
    id: 'prompt-churrascaria',
    category: 'Landing Page',
    segment: 'Churrascaria',
    badge: 'Alta Conversão',
    title: 'Landing Page Premium para Churrascaria & Rodízio',
    description: 'Estrutura completa com hero imersivo de fogo & brasa, cardápio de cortes nobres, pacote de eventos corporativos e botão direto de reserva no WhatsApp.',
    targetTool: 'Lovable / v0 / Bolt / Nagi Preview',
    previewTemplateKey: 'churrascaria',
    promptText: `Crie uma Landing Page de altíssima conversão e estética editorial premium (dark steakhouse & brasa dourada) para a "{{EMPRESA}}" localizada em {{CIDADE}}.

Objetivo principal: Converter visitantes em reservas de mesa para o rodízio premium e pedidos de eventos corporativos via WhatsApp.

Seções obrigatórias:
1. Hero cinematográfico com título de impacto sobre cortes nobres na brasa, selo de avaliação 4.8★, CTA primário "Reservar Mesa Agora" e CTA secundário "Ver Cardápio de Cortes".
2. Diferenciais da casa: {{DIFERENCIAL}} (ex: Cortes Angus certificados, fogo de chão 8h, carta de vinhos e chope trincando).
3. Vitrine interativa dos principais cortes (Picanha na Brasa, Ancho Maturado, Costela Fogo de Chão, Tomahawk) com descrições sensoriais.
4. Oferta especial da semana: {{OFERTA}}.
5. Seção de Prova Social (depoimentos reais do Google Maps) + Mapa/Horários + Botão flutuante conectado ao WhatsApp.`
  },
  {
    id: 'prompt-clinica',
    category: 'Landing Page',
    segment: 'Clínica Odontológica',
    badge: 'Tráfego Pago',
    title: 'Landing Page de Agendamento para Clínica Odontológica / Estética',
    description: 'Desenhada para receber cliques de Meta Ads e Google Ads, com foco em autoridade clínica, antes/depois e triagem rápida.',
    targetTool: 'Lovable / Cursor / Nagi Preview',
    previewTemplateKey: 'clinica',
    promptText: `Desenvolva uma Landing Page moderna, clean e confiável (paleta marfim, azul-petróleo e detalhes dourados) para a clínica "{{EMPRESA}}" em {{CIDADE}}.

Objetivo: Capturar pacientes qualificados para avaliação odontológica/estética.

Seções:
1. Hero com foto/visual acolhedor, promessa clara de atendimento humanizado e tecnologia 3D, botão "Agendar Avaliação".
2. Especialidades em cards 3D sutis (Implantes, Lentes em Resina/Porcelana, Harmonização, Ortodontia Invisível).
3. Diferencial competitivo: {{DIFERENCIAL}}.
4. Condição especial para novos pacientes: {{OFERTA}}.
5. Formulário inteligente que envia nome, procedimento desejado e melhor horário direto para o WhatsApp e webhook do n8n.`
  },
  {
    id: 'prompt-barbearia',
    category: 'Landing Page',
    segment: 'Barbearia',
    badge: 'Clube Recorrente',
    title: 'Landing Page + Clube de Assinatura para Barbearia',
    description: 'Foco em receita recorrente (clube de corte ilimitado), lifestyle masculino e agendamento rápido sem atrito.',
    targetTool: 'v0 / Tailwind / Nagi Preview',
    previewTemplateKey: 'barbearia',
    promptText: `Crie uma Landing Page estilosa e urbana (dark charcoal, âmbar e tipografia forte) para a barbearia "{{EMPRESA}}" em {{CIDADE}}.

Objetivo: Vender planos mensais de assinatura ("Clube de Corte & Barba") e agendamentos avulsos.

Estrutura:
1. Hero impactante com atmosfera de barbearia clássica moderna, destaque "{{OFERTA}}".
2. Tabela comparativa de Planos Mensais (Plano Corte, Plano Corte + Barba Ilimitado, Plano VIP).
3. Galeria de serviços e diferenciais: {{DIFERENCIAL}}.
4. FAQ rápido quebrando objeções sobre cancelamento e agendamento + CTA direto para WhatsApp.`
  },
  {
    id: 'prompt-imobiliaria',
    category: 'Landing Page',
    segment: 'Imobiliária',
    badge: 'Alto Ticket',
    title: 'Landing Page para Lançamentos Imobiliários & Alto Padrão',
    description: 'Página focada em captura de leads de alto padrão com simulador de entrada, ficha técnica do empreendimento e envio imediato para CRM.',
    targetTool: 'Antigravity / Lovable / Nagi Preview',
    previewTemplateKey: 'imobiliaria',
    promptText: `Construa uma Landing Page arquitetônica de alto padrão para "{{EMPRESA}}" em {{CIDADE}}.

Objetivo: Captar leads compradores interessados em imóveis selecionados e lançamentos exclusivos.

Seções:
1. Hero arquitetônico com headline elegante, destaque de localização privilegiada e CTA "Receber Book e Tabela Exclusiva".
2. Destaques do portfólio: {{DIFERENCIAL}}.
3. Condição exclusiva de lançamento/negociação: {{OFERTA}}.
4. Formulário de qualificação (faixa de investimento + objetivo: morar ou investir) pronto para integração com n8n.`
  },
  {
    id: 'prompt-n8n-whatsapp',
    category: 'Automação n8n',
    segment: 'Todos os Segmentos',
    badge: 'Workflow n8n',
    title: 'Agente IA de Atendimento & Agendamento no WhatsApp (n8n)',
    description: 'Prompt de sistema + arquitetura n8n para atender leads da Landing Page em 5 segundos, qualificar e agendar automaticamente.',
    targetTool: 'n8n + Evolution API / WhatsApp Cloud',
    previewTemplateKey: 'n8n_whatsapp',
    promptText: `Configure um fluxo de Automação no n8n para "{{EMPRESA}}" ({{CIDADE}}) seguindo esta arquitetura:

1. Gatilho: Webhook POST vindo da Landing Page ou Evolution API (nova mensagem no WhatsApp).
2. Filtro & Contexto: Identificar se o lead já existe no Supabase/Google Sheets.
3. Agente de IA (Gemini / OpenAI) com o seguinte System Prompt:
   - Papel: Concierge comercial da {{EMPRESA}}.
   - Objetivo: Responder em até 10 segundos com tom cordial e direto, entender a necessidade do cliente e conduzir para agendamento ou fechamento da oferta: {{OFERTA}}.
   - Diferencial para reforçar: {{DIFERENCIAL}}.
4. Ação Final: Se o cliente confirmar interesse, criar card no CRM/Planilha e notificar o dono no WhatsApp pessoal.`
  },
  {
    id: 'prompt-n8n-treg',
    category: 'Automação n8n',
    segment: 'Prospecção B2B',
    badge: 'Treg + n8n',
    title: 'Pipeline Automático de Prospecção Treg -> Qualificação IA -> WhatsApp',
    description: 'Fluxo n8n que consulta a API do Treg (treg.to), filtra empresas sem site ou com baixa presença e gera abordagem personalizada.',
    targetTool: 'n8n + Treg Gateway',
    previewTemplateKey: 'n8n_treg',
    promptText: `Crie um workflow n8n de prospecção outbound usando o Treg (treg.to):

1. Trigger: Schedule diário às 08h30 ou Webhook manual com parâmetro {nicho, cidade}.
2. HTTP Request para https://treg.to/call/treg.companies.search com header "X-Treg-Token" e body {"industry": "{{SEGMENTO}}", "country": "BR", "limit": 15}.
3. Loop nos resultados: chamar treg.people.email.find ou verificar website.
4. Nó de IA: Gerar diagnóstico personalizado citando "{{DIFERENCIAL}}" e proposta "{{OFERTA}}" para "{{EMPRESA}}".
5. Salvar no CRM Nagi / Google Sheets e enfileirar envio controlado.`
  }
];

export const SCRIPT_TEMPLATES = {
  consultivo: (lead) =>
    `Olá ${lead.contactName.split(' ')[0]}, tudo bem? Vi a ${lead.company} aqui em ${lead.city} (${lead.rating}) e notei um ponto rápido: ${lead.painPoint}\n\nEu desenvolvo Landing Pages e automações sob medida para o segmento de ${lead.segment} e até rascunhei uma prévia de como a ${lead.company} poderia captar mais clientes direto no WhatsApp. Posso te enviar sem compromisso?`,
  auditoria: (lead) =>
    `Oi ${lead.contactName.split(' ')[0]}! Fiz uma análise rápida da presença digital da ${lead.company} (${lead.website}). Hoje vocês estão deixando reservas/orçamentos na mesa na região de ${lead.city}.\n\nGravei/montei uma ideia prática com página focada em conversão + resposta automática em 10s. Quer dar uma olhada em 1 minuto?`,
  automacao: (lead) =>
    `Olá ${lead.contactName.split(' ')[0]}, parabéns pelo trabalho na ${lead.company}! Você já usa algum robô no n8n/WhatsApp para atender quem chama fora do horário ou responder dúvidas repetidas de ${lead.segment}?\n\nTenho um modelo pronto que integra página de captação + atendimento automático 24h. Faz sentido conversarmos 5 min esta semana?`,
  followup: (lead) =>
    `Oi ${lead.contactName.split(' ')[0]}, passando só para saber se conseguiu ver a prévia que preparei para a ${lead.company}! Consigo colocar no ar ainda esta semana com condição especial para fechar o mês. Me avisa o que achou!`
};
