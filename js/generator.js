/**
 * Nagi Studio — Live Landing Page HTML & n8n Workflow JSON Generator
 */

const THEMES = {
  churrascaria: {
    bg: '#0c0806',
    surface: '#17100c',
    accent: '#f59e0b',
    accent2: '#dc2626',
    text: '#fef3c7',
    muted: '#d6c3a5',
    badge: 'CHURRASCARIA & CORTES NOBRES',
    headline: 'O Sabor Autêntico da Brasa em',
    sub: 'Cortes Angus maturados, costela fogo de chão por 8 horas e atendimento VIP para sua família ou evento corporativo.',
    cta: 'Reservar Mesa no WhatsApp',
    items: [
      { title: 'Picanha Nobre na Brasa', price: 'Rodízio Premium', desc: 'Tira de picanha argentina assada lentamente no carvão de acácia.' },
      { title: 'Costela Fogo de Chão', price: '8h de Cocção', desc: 'Desmanchando no garfo, temperada apenas com sal de parrilla.' },
      { title: 'Tomahawk & Ancho Gold', price: 'Corte Especial', desc: 'Marmoreio intenso finalizado na manteiga de ervas e alho negro.' }
    ]
  },
  clinica: {
    bg: '#07131a',
    surface: '#0e202b',
    accent: '#2dd4bf',
    accent2: '#38bdf8',
    text: '#f0fdfa',
    muted: '#99c2cc',
    badge: 'ODONTOLOGIA & ESTÉTICA AVANÇADA',
    headline: 'Seu Sorriso Projetado em 3D em',
    sub: 'Escaneamento intraoral sem moldes, lentes de contato ultra-finas e atendimento acolhedor sem dor.',
    cta: 'Agendar Avaliação VIP',
    items: [
      { title: 'Lentes em Porcelana', price: 'Design Digital', desc: 'Planejamento facial em 3D para naturalidade e harmonia perfeita.' },
      { title: 'Implantes Guiados', price: 'Sem Cortes', desc: 'Cirurgia computadorizada com recuperação rápida e precisão milimétrica.' },
      { title: 'Clareamento Laser Dual', price: 'Sessão Única', desc: 'Tecnologia dessensibilizante para até 4 tons mais claros.' }
    ]
  },
  barbearia: {
    bg: '#0a0a0c',
    surface: '#16161a',
    accent: '#eab308',
    accent2: '#ef4444',
    text: '#fafafa',
    muted: '#a1a1aa',
    badge: 'CLUBE DE ASSINATURA & BARBEARIA',
    headline: 'Estilo Afiado Toda Semana em',
    sub: 'Entre para o Clube de Corte & Barba ilimitados, toalha quente, cerveja artesanal e zero fila.',
    cta: 'Entrar no Clube Mensal',
    items: [
      { title: 'Plano Ronin Corte', price: 'R$ 89/mês', desc: 'Cortes ilimitados de segunda a quinta + lavagem premium.' },
      { title: 'Plano Shogun Full', price: 'R$ 139/mês', desc: 'Corte + Barba terapia com toalha quente ilimitados todos os dias.' },
      { title: 'Visagismo & Barba', price: 'Avulso', desc: 'Consultoria de formato de rosto, navalha e hidratação.' }
    ]
  },
  imobiliaria: {
    bg: '#060c18',
    surface: '#0f1a2e',
    accent: '#f5b942',
    accent2: '#38bdf8',
    text: '#f8fafc',
    muted: '#94a3b8',
    badge: 'IMÓVEIS DE ALTO PADRÃO',
    headline: 'Endereços Exclusivos para Morar ou Investir em',
    sub: 'Curadoria de lançamentos e coberturas com atendimento consultivo e simulação personalizada em minutos.',
    cta: 'Receber Tabela & Book VIP',
    items: [
      { title: 'Residencial Kaze', price: 'A partir de R$ 980k', desc: '3 suítes, varanda gourmet panorâmica e lazer resort completo.' },
      { title: 'Cobertura Horizon', price: 'Pronto para Morar', desc: '240m² privativos com piscina aquecida e vista definitiva.' },
      { title: 'Studios Rentáveis', price: 'Renda 1.1% a.m.', desc: 'Alta liquidez para Airbnb e locação executiva na região nobre.' }
    ]
  }
};

export function generateLandingPageHTML({ company, segment, city, diferencial, oferta, phone }) {
  const segLower = (segment || '').toLowerCase();
  let themeKey = 'churrascaria';
  if (segLower.includes('odonto') || segLower.includes('clínica') || segLower.includes('clinica') || segLower.includes('estét')) {
    themeKey = 'clinica';
  } else if (segLower.includes('barbear')) {
    themeKey = 'barbearia';
  } else if (segLower.includes('imob')) {
    themeKey = 'imobiliaria';
  }

  const t = THEMES[themeKey];
  const safeCompany = escapeHtml(company || 'Sua Empresa Premium');
  const safeCity = escapeHtml(city || 'São Paulo, SP');
  const safeDif = escapeHtml(diferencial || 'Atendimento de excelência, estrutura moderna e garantia de qualidade.');
  const safeOferta = escapeHtml(oferta || 'Condição especial para novos clientes agendando hoje pelo site.');
  const cleanPhone = (phone || '5511999999999').replace(/\D/g, '');
  const waMsg = encodeURIComponent(`Olá! Vim pela nova Landing Page da ${company || 'empresa'} e gostaria de saber mais sobre: ${oferta || 'atendimento'}.`);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeCompany} — ${safeCity}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;800&family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { background: ${t.bg}; color: ${t.text}; font-family: 'Plus Jakarta Sans', sans-serif; }
    .font-head { font-family: 'Cinzel', serif; }
    .glow-btn { background: linear-gradient(135deg, ${t.accent}, ${t.accent2}); box-shadow: 0 12px 30px -8px ${t.accent}80; }
  </style>
</head>
<body class="antialiased selection:bg-amber-500/30">
  <header class="border-b border-white/10 backdrop-blur-md sticky top-0 z-30" style="background:${t.bg}dd">
    <div class="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-black" style="background:${t.accent}">${safeCompany.charAt(0)}</span>
        <div>
          <p class="font-bold text-base leading-tight">${safeCompany}</p>
          <p class="text-[11px] opacity-65">${safeCity}</p>
        </div>
      </div>
      <a href="https://wa.me/${cleanPhone}?text=${waMsg}" target="_blank" class="glow-btn text-black font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl transition hover:scale-105">
        ${t.cta}
      </a>
    </div>
  </header>

  <section class="relative overflow-hidden py-16 sm:py-24 px-5">
    <div class="absolute inset-0 opacity-25 pointer-events-none" style="background: radial-gradient(circle at 75% 20%, ${t.accent}, transparent 55%), radial-gradient(circle at 20% 80%, ${t.accent2}, transparent 55%)"></div>
    <div class="max-w-5xl mx-auto relative z-10 text-center">
      <span class="inline-block px-3.5 py-1 rounded-full text-[11px] font-bold tracking-widest uppercase border border-white/15 mb-5" style="background:${t.surface}; color:${t.accent}">
        ${t.badge} • ★ 4.9 AVALIAÇÃO GOOGLE
      </span>
      <h1 class="font-head text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight mb-5">
        ${t.headline} <span style="color:${t.accent}">${safeCity}</span>
      </h1>
      <p class="max-w-2xl mx-auto text-sm sm:text-lg mb-8" style="color:${t.muted}">
        ${t.sub}
      </p>
      <div class="p-4 rounded-2xl border border-white/10 max-w-xl mx-auto mb-8 text-sm" style="background:${t.surface}">
        <strong style="color:${t.accent}">🔥 Oferta Exclusiva:</strong> ${safeOferta}
      </div>
      <div class="flex flex-col sm:flex-row gap-3 justify-center">
        <a href="https://wa.me/${cleanPhone}?text=${waMsg}" target="_blank" class="glow-btn text-black font-extrabold px-7 py-4 rounded-xl text-sm sm:text-base transition hover:scale-105">
          ${t.cta} →
        </a>
        <a href="#destaques" class="px-7 py-4 rounded-xl text-sm sm:text-base font-semibold border border-white/15 hover:bg-white/5 transition">
          Conhecer Diferenciais
        </a>
      </div>
    </div>
  </section>

  <section id="destaques" class="py-14 px-5 border-t border-white/10" style="background:${t.surface}">
    <div class="max-w-6xl mx-auto">
      <div class="text-center mb-10">
        <h2 class="font-head text-2xl sm:text-3xl font-bold mb-2">Destaques ${safeCompany}</h2>
        <p class="text-sm max-w-xl mx-auto" style="color:${t.muted}">${safeDif}</p>
      </div>
      <div class="grid md:grid-cols-3 gap-6">
        ${t.items
          .map(
            (item) => `
          <div class="p-6 rounded-2xl border border-white/10 hover:border-white/25 transition" style="background:${t.bg}">
            <span class="text-xs font-bold uppercase tracking-wider" style="color:${t.accent}">${item.price}</span>
            <h3 class="text-xl font-bold mt-2 mb-2">${item.title}</h3>
            <p class="text-sm leading-relaxed" style="color:${t.muted}">${item.desc}</p>
          </div>`
          )
          .join('')}
      </div>
    </div>
  </section>

  <footer class="py-10 px-5 border-t border-white/10 text-center text-xs" style="color:${t.muted}">
    <p class="font-semibold text-white mb-1">${safeCompany} — ${safeCity}</p>
    <p>Landing Page prototipada no Nagi Studio • Pronta para tráfego pago e automação WhatsApp/n8n</p>
  </footer>
</body>
</html>`;
}

export function generateN8nWorkflowJSON({ company, segment, city, oferta }) {
  return JSON.stringify(
    {
      name: `Nagi AI — Prospecção & Atendimento (${company || segment})`,
      nodes: [
        {
          parameters: { httpMethod: 'POST', path: 'nagi-lead-capture', responseMode: 'onReceived' },
          id: 'webhook-lp',
          name: 'Webhook Landing Page',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 2,
          position: [240, 300]
        },
        {
          parameters: {
            method: 'POST',
            url: 'https://treg.to/call/treg.companies.enrich',
            sendHeaders: true,
            headerParameters: {
              parameters: [{ name: 'X-Treg-Token', value: '={{$env.TREG_TOKEN}}' }]
            },
            sendBody: true,
            bodyParameters: {
              parameters: [{ name: 'name', value: '={{$json.company}}' }]
            }
          },
          id: 'treg-enrich',
          name: 'Treg Enrich Lead',
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 4,
          position: [480, 300]
        },
        {
          parameters: {
            model: 'gemini-2.5-flash',
            prompt: `Você é o concierge comercial da ${company || 'empresa'} (${segment} em ${city}). Cumprimente o lead, apresente a oferta "${oferta}" e convide para agendar pelo WhatsApp.`
          },
          id: 'ai-agent',
          name: 'Agente IA Nagi',
          type: '@n8n/n8n-nodes-langchain.chainLlm',
          typeVersion: 1.4,
          position: [720, 300]
        },
        {
          parameters: {
            method: 'POST',
            url: 'https://evolution-api.sua-instancia.com/message/sendText',
            sendBody: true,
            bodyParameters: {
              parameters: [
                { name: 'number', value: '={{$json.phone}}' },
                { name: 'text', value: '={{$json.ai_reply}}' }
              ]
            }
          },
          id: 'whatsapp-send',
          name: 'Enviar WhatsApp Automático',
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 4,
          position: [960, 300]
        }
      ],
      connections: {
        'Webhook Landing Page': { main: [[{ node: 'Treg Enrich Lead', type: 'main', index: 0 }]] },
        'Treg Enrich Lead': { main: [[{ node: 'Agente IA Nagi', type: 'main', index: 0 }]] },
        'Agente IA Nagi': { main: [[{ node: 'Enviar WhatsApp Automático', type: 'main', index: 0 }]] }
      }
    },
    null,
    2
  );
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
