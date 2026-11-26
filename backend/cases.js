// Trabalhos do Jerry por nicho: cada abordagem leva o case do mesmo ramo do lead (pedido dele em 26/11).
// Todos os links conferidos no ar em 26/11. Sem nicho reconhecido, vai o portfólio completo.

export const PORTFOLIO = { nome: 'Portfólio Jerry Silva', url: 'https://jerrysilva.vercel.app' };

export const NICHOS = [
  {
    chave: 'barbearia', rotulo: 'barbearia',
    palavras: /barbe|barber|cabeleireir|sal[aã]o masculino|corte masculino/i,
    cases: [
      { nome: 'Luan Styles', url: 'https://luanstyles-previa.vercel.app', resumo: 'site de barbearia com status de aberto ao vivo, galeria de cortes e agendamento' },
      { nome: 'Barbearia Hope', url: 'https://hope-previa.vercel.app', resumo: 'barbearia por assinatura, com horários dos dois turnos e planos' },
    ],
  },
  {
    chave: 'advocacia', rotulo: 'escritório de advocacia',
    palavras: /advog|advocacia|jur[ií]dic|direito|escrit[oó]rio de advocacia/i,
    cases: [{ nome: 'Ronzinério Oliveira Advocacia', url: 'https://ronzinerio-landing.vercel.app', resumo: 'página de advocacia com áreas de atuação, perguntas frequentes e contato' }],
  },
  {
    chave: 'lanchonete', rotulo: 'lanchonete',
    palavras: /lanchonete|hamb[uú]rg|burg|lanche|pizzaria|pizza|a[cç]a[ií]|delivery|restaurante|espetinho|pastel/i,
    cases: [{ nome: 'RY Burguer', url: 'https://ryburguer-previa.vercel.app', resumo: 'cardápio online com comanda que manda o pedido pronto no WhatsApp' }],
  },
  {
    chave: 'confeitaria', rotulo: 'confeitaria',
    palavras: /confeit|doceria|doces?\b|bolos?\b|brigadeiro|padaria|cake|sobremesa/i,
    cases: [{ nome: 'Chocosag', url: 'https://chocosag.com.br', resumo: 'catálogo de 67 doces com preço, pedido e Pix, aparecendo no Google' }],
  },
  {
    chave: 'contabilidade', rotulo: 'escritório de contabilidade',
    palavras: /cont[aá]bil|contador|contabilidade/i,
    cases: [{ nome: 'Brasileiro Contador', url: 'https://brasileirocontador.com.br', resumo: 'site de contador com atendimento ao vivo e domínio próprio' }],
  },
  {
    chave: 'fotografia', rotulo: 'fotografia',
    palavras: /fot[oó]graf|fotografia|ensaio|filmagem/i,
    cases: [{ nome: 'Camilly França', url: 'https://camilly-franca-portfolio.vercel.app', resumo: 'portfólio de fotógrafa com galeria e pedido de orçamento' }],
  },
  {
    chave: 'loja', rotulo: 'loja',
    palavras: /joia|semijoia|loja|moda|roupa|boutique|acess[oó]rio|cal[cç]ado/i,
    cases: [{ nome: 'H Jóias', url: 'https://hjoias.store', resumo: 'loja virtual com catálogo por categoria e pedido em poucos toques' }],
  },
  {
    chave: 'educacao', rotulo: 'escola',
    palavras: /escola|creche|curso|educa[cç][aã]o|refor[cç]o|professor/i,
    cases: [{ nome: 'Gabriela Otaviano', url: 'https://gabriela-creche-bloom.vercel.app', resumo: 'plataforma de materiais e cursos de educação infantil' }],
  },
  {
    chave: 'atelie', rotulo: 'ateliê',
    palavras: /ateli[eê]|papelaria|personalizad|artesanato|lembrancinha/i,
    cases: [{ nome: 'Cria e Recria', url: 'https://cria-e-recria.vercel.app/a/', resumo: 'site de ateliê com catálogo e pedido de orçamento' }],
  },
  {
    chave: 'consultoria', rotulo: 'empresa',
    palavras: /consultoria|assessoria|empresa/i,
    cases: [{ nome: 'Luz Consultoria', url: 'https://luz-consultoria.vercel.app', resumo: 'site institucional de consultoria' }],
  },
];

/** Nicho pelo segmento/categoria/nome/bio do lead. */
export function nichoDe(...textos) {
  const t = textos.filter(Boolean).join(' ');
  return NICHOS.find((n) => n.palavras.test(t)) || null;
}

/** Cases para mandar a um lead: os do nicho, ou o portfólio completo. */
export function casesPara(...textos) {
  const n = nichoDe(...textos);
  return n
    ? { nicho: n.chave, rotulo: n.rotulo, cases: n.cases, portfolio: PORTFOLIO }
    : { nicho: null, rotulo: null, cases: [], portfolio: PORTFOLIO };
}

/** Linha pronta para a mensagem: "dá uma olhada: <link>" (1 case do nicho, ou o portfólio). */
export function linhaDeCase(...textos) {
  const c = casesPara(...textos);
  if (!c.cases.length) return `Alguns trabalhos meus: ${PORTFOLIO.url}`;
  const k = c.cases[0];
  return `Olha um que eu fiz pra ${c.rotulo}: ${k.url}`;
}

export function mapaPublico() {
  return { portfolio: PORTFOLIO, nichos: NICHOS.map((n) => ({ chave: n.chave, rotulo: n.rotulo, palavras: n.palavras.source, cases: n.cases })) };
}
