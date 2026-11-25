import { NagiOcean3D } from './ocean3d.js';
import { NagiBrazilGlobe3D } from './globe3d.js';
import { TREG_ENDPOINTS, INITIAL_LEADS, PROMPT_TEMPLATES, SCRIPT_TEMPLATES } from './data.js';
import { TregClient } from './treg.js';
import { generateLandingPageHTML, generateN8nWorkflowJSON } from './generator.js';

const STORAGE_KEY = 'nagi_saas_state_v1';

const defaultState = {
  user: null, // { name, email, specialty, goal, avatarLetter }
  treg: {
    token: '',
    proxyUrl: '',
    lastStatus: 'sandbox'
  },
  leads: INITIAL_LEADS,
  discoveredLeads: [],
  selectedLeadId: INITIAL_LEADS[0].id,
  selectedPromptId: PROMPT_TEMPLATES[0].id,
  metrics: {
    totalProspectedRuns: 18,
    messagesSent: 27
  },
  activities: [
    { id: 1, text: 'Venda fechada: Barbearia Ronin Club (Landing Page — R$ 1.850)', time: 'Há 2 horas', type: 'sale' },
    { id: 2, text: 'Lead respondeu no Robô: Churrascaria Brasa Nobre', time: 'Ontem', type: 'reply' },
    { id: 3, text: 'Treg Gateway prospectou 6 leads em São Paulo, SP', time: 'Ontem', type: 'treg' }
  ]
};

class NagiApp {
  constructor() {
    this.state = this.loadState();
    this.treg = new TregClient();
    this.ocean = null;
    this.globe = null;
    this.charts = {};
    this.currentView = 'dashboard';
    this.studioTab = 'lp'; // 'lp' | 'n8n'
    this.previewViewport = 'desktop'; // 'desktop' | 'mobile'
    this.lastGeneratedHTML = '';
    this.lastGeneratedJSON = '';

    this.init();
  }

  loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      return {
        ...structuredClone(defaultState),
        ...parsed,
        treg: { ...defaultState.treg, ...(parsed.treg || {}) },
        metrics: { ...defaultState.metrics, ...(parsed.metrics || {}) }
      };
    } catch {
      return structuredClone(defaultState);
    }
  }

  saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  init() {
    this.ocean = new NagiOcean3D('nagi-canvas');
    this.bindAuth();
    this.bindNavigation();
    this.bindModals();
    this.bindDashboard();
    this.bindProspecting();
    this.bindLeadsAndBot();
    this.bindStudio();
    this.bind3DTilt();

    if (this.state.user) {
      this.enterApp();
    } else {
      this.showAuth();
    }

    if (window.lucide) window.lucide.createIcons();
  }

  /* ==================== AUTH ==================== */
  bindAuth() {
    const tabLogin = document.getElementById('tab-auth-login');
    const tabRegister = document.getElementById('tab-auth-register');
    const registerFields = document.getElementById('register-extra-fields');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authForm = document.getElementById('auth-form');
    const demoBtn = document.getElementById('auth-demo-btn');

    let mode = 'login';

    const setMode = (next) => {
      mode = next;
      if (mode === 'register') {
        registerFields.classList.remove('hidden');
        tabRegister.classList.add('bg-teal-400/20', 'text-teal-300', 'border-teal-400/40');
        tabLogin.classList.remove('bg-teal-400/20', 'text-teal-300', 'border-teal-400/40');
        authSubmitBtn.innerHTML = '<i data-lucide="sparkles" class="w-4 h-4"></i> Criar Conta & Conectar Treg';
      } else {
        registerFields.classList.add('hidden');
        tabLogin.classList.add('bg-teal-400/20', 'text-teal-300', 'border-teal-400/40');
        tabRegister.classList.remove('bg-teal-400/20', 'text-teal-300', 'border-teal-400/40');
        authSubmitBtn.innerHTML = '<i data-lucide="waves" class="w-4 h-4"></i> Entrar no Nagi SaaS';
      }
      if (window.lucide) window.lucide.createIcons();
    };

    tabLogin?.addEventListener('click', () => setMode('login'));
    tabRegister?.addEventListener('click', () => setMode('register'));

    authForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email').value.trim() || 'dev@nagi.studio';
      const nameInput = document.getElementById('auth-name').value.trim();
      const specialty = document.getElementById('auth-specialty').value;
      const tregToken = document.getElementById('auth-treg-token').value.trim();

      const displayName =
        nameInput ||
        email
          .split('@')[0]
          .replace(/[._-]/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase());

      this.state.user = {
        name: displayName,
        email,
        specialty: specialty || 'Landing Pages & Automações n8n',
        goal: 15000
      };
      if (tregToken) {
        this.state.treg.token = tregToken;
        this.state.treg.lastStatus = 'connected';
      }
      this.saveState();
      this.ocean?.triggerSurge(1.8);
      this.enterApp();
      this.toast(`Bem-vindo(a) ao Nagi, ${displayName}!`, 'success');
    });

    demoBtn?.addEventListener('click', () => {
      const tregToken = document.getElementById('auth-treg-token').value.trim();
      this.state.user = {
        name: 'Kenji Dev',
        email: 'kenji@nagi.studio',
        specialty: 'Landing Pages & Automações n8n',
        goal: 15000
      };
      if (tregToken) {
        this.state.treg.token = tregToken;
        this.state.treg.lastStatus = 'connected';
      }
      this.saveState();
      this.ocean?.triggerSurge(1.8);
      this.enterApp();
      this.toast('Sessão Demo iniciada com Treg Sandbox ativo!', 'success');
    });

    document.getElementById('logout-btn')?.addEventListener('click', () => {
      this.state.user = null;
      this.saveState();
      this.showAuth();
      this.toast('Você saiu da sua conta Nagi.', 'info');
    });
  }

  showAuth() {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
  }

  enterApp() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    this.renderUserHeader();
    this.switchView(this.currentView);
    this.renderAll();
  }

  renderUserHeader() {
    if (!this.state.user) return;
    document.getElementById('user-name-label').textContent = this.state.user.name;
    document.getElementById('user-role-label').textContent = this.state.user.specialty;
    document.getElementById('user-avatar-letter').textContent = this.state.user.name.charAt(0).toUpperCase();

    const pill = document.getElementById('treg-status-pill');
    const hasToken = Boolean(this.state.treg.token);
    if (hasToken) {
      pill.innerHTML = `<span class="relative w-2 h-2 rounded-full bg-teal-400 live-dot"></span><span>Treg Conectado</span>`;
      pill.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-teal-500/15 text-teal-300 border border-teal-400/30 cursor-pointer hover:bg-teal-500/25 transition';
    } else {
      pill.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400"></span><span>Treg Sandbox (Configurar)</span>`;
      pill.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-400/30 cursor-pointer hover:bg-amber-500/25 transition';
    }
  }

  /* ==================== NAVIGATION ==================== */
  bindNavigation() {
    document.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-nav');
        this.switchView(view);
        // Close mobile sidebar if open
        document.getElementById('mobile-sidebar')?.classList.add('-translate-x-full');
      });
    });

    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
      document.getElementById('mobile-sidebar')?.classList.toggle('-translate-x-full');
    });
    document.getElementById('close-mobile-sidebar')?.addEventListener('click', () => {
      document.getElementById('mobile-sidebar')?.classList.add('-translate-x-full');
    });
  }

  switchView(viewId) {
    this.currentView = viewId;
    document.querySelectorAll('.view-section').forEach((sec) => {
      sec.classList.toggle('active', sec.id === `view-${viewId}`);
    });
    document.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-nav') === viewId);
    });

    if (viewId === 'dashboard') this.renderDashboard();
    if (viewId === 'prospecting') {
      if (!this.globe) {
        this.globe = new NagiBrazilGlobe3D('brazil-globe-canvas');
      } else {
        setTimeout(() => this.globe?.resize(), 50);
      }
    }
    if (viewId === 'leads') this.renderLeadsView();
    if (viewId === 'studio') this.renderStudio();
    if (window.lucide) window.lucide.createIcons();
  }

  /* ==================== MODALS (TREG CONFIG & CATALOG) ==================== */
  bindModals() {
    const modal = document.getElementById('treg-modal');
    const openModal = () => {
      document.getElementById('modal-treg-token').value = this.state.treg.token || '';
      document.getElementById('modal-treg-proxy').value = this.state.treg.proxyUrl || '';
      modal.classList.remove('hidden');
    };

    document.getElementById('treg-status-pill')?.addEventListener('click', openModal);
    document.getElementById('open-treg-settings')?.addEventListener('click', openModal);
    document.getElementById('close-treg-modal')?.addEventListener('click', () => modal.classList.add('hidden'));

    document.getElementById('save-treg-config')?.addEventListener('click', () => {
      this.state.treg.token = document.getElementById('modal-treg-token').value.trim();
      this.state.treg.proxyUrl = document.getElementById('modal-treg-proxy').value.trim();
      this.saveState();
      this.renderUserHeader();
      modal.classList.add('hidden');
      this.toast(
        this.state.treg.token ? 'Token Treg salvo com sucesso!' : 'Modo Sandbox Treg ativado.',
        'success'
      );
    });

    document.getElementById('reset-demo-data')?.addEventListener('click', () => {
      const currentUser = this.state.user;
      this.state = structuredClone(defaultState);
      this.state.user = currentUser;
      this.saveState();
      this.renderAll();
      modal.classList.add('hidden');
      this.toast('Dados de demonstração restaurados.', 'info');
    });
  }

  /* ==================== DASHBOARD ==================== */
  bindDashboard() {
    document.getElementById('quick-go-prospect')?.addEventListener('click', () => this.switchView('prospecting'));
    document.getElementById('quick-go-studio')?.addEventListener('click', () => this.switchView('studio'));
  }

  renderDashboard() {
    const leads = this.state.leads;
    const totalProspected = leads.length + this.state.metrics.totalProspectedRuns;
    const soldLP = leads.filter((l) => l.status === 'Vendido - LP' || l.status === 'Vendido - LP + Automação');
    const soldAuto = leads.filter((l) => l.status === 'Vendido - Automação' || l.status === 'Vendido - LP + Automação');

    const revenueClosed = leads
      .filter((l) => l.status.startsWith('Vendido'))
      .reduce((acc, l) => acc + (Number(l.potentialTicket) || 0), 0);

    const openPipeline = leads
      .filter((l) => !l.status.startsWith('Vendido'))
      .reduce((acc, l) => acc + (Number(l.potentialTicket) || 0), 0);

    document.getElementById('kpi-prospected').textContent = totalProspected;
    document.getElementById('kpi-messages').textContent = this.state.metrics.messagesSent;
    document.getElementById('kpi-lp-sold').textContent = soldLP.length;
    document.getElementById('kpi-auto-sold').textContent = soldAuto.length;
    document.getElementById('kpi-revenue').textContent = `R$ ${revenueClosed.toLocaleString('pt-BR')}`;
    document.getElementById('kpi-pipeline').textContent = `R$ ${openPipeline.toLocaleString('pt-BR')} em aberto`;

    // Goal progress
    const goal = this.state.user?.goal || 15000;
    const pct = Math.min(100, Math.round((revenueClosed / goal) * 100));
    document.getElementById('goal-progress-bar').style.width = `${pct}%`;
    document.getElementById('goal-progress-label').textContent = `${pct}% da meta mensal (R$ ${goal.toLocaleString('pt-BR')})`;

    // Activity feed
    const feed = document.getElementById('dashboard-activity-feed');
    feed.innerHTML = this.state.activities
      .slice(0, 6)
      .map((act) => {
        const badge =
          act.type === 'sale'
            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
            : act.type === 'treg'
            ? 'bg-sky-500/15 text-sky-300 border-sky-400/30'
            : 'bg-amber-500/15 text-amber-300 border-amber-400/30';
        return `
          <div class="flex items-start gap-3 p-3 rounded-xl bg-slate-950/50 border border-white/5">
            <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${badge}">${act.type}</span>
            <div class="flex-1 min-w-0">
              <p class="text-xs sm:text-sm text-slate-200 leading-snug">${act.text}</p>
              <span class="text-[11px] text-slate-400">${act.time}</span>
            </div>
          </div>`;
      })
      .join('');

    this.renderCharts(leads);
  }

  renderCharts(leads) {
    if (typeof Chart === 'undefined') return;

    const ctxWave = document.getElementById('chart-wave-metrics')?.getContext('2d');
    if (ctxWave) {
      if (this.charts.wave) this.charts.wave.destroy();
      const grad = ctxWave.createLinearGradient(0, 0, 0, 240);
      grad.addColorStop(0, 'rgba(45, 212, 191, 0.35)');
      grad.addColorStop(1, 'rgba(45, 212, 191, 0.0)');

      const gradRed = ctxWave.createLinearGradient(0, 0, 0, 240);
      gradRed.addColorStop(0, 'rgba(245, 185, 66, 0.32)');
      gradRed.addColorStop(1, 'rgba(245, 185, 66, 0.0)');

      this.charts.wave = new Chart(ctxWave, {
        type: 'line',
        data: {
          labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Hoje'],
          datasets: [
            {
              label: 'Leads Prospectados',
              data: [4, 7, 5, 9, 6, 8, leads.length + 4],
              borderColor: '#2dd4bf',
              backgroundColor: grad,
              fill: true,
              tension: 0.42,
              borderWidth: 2.5,
              pointRadius: 4,
              pointBackgroundColor: '#2dd4bf'
            },
            {
              label: 'Propostas & Vendas',
              data: [1, 2, 1, 3, 2, 3, leads.filter((l) => l.status !== 'Novo').length],
              borderColor: '#f5b942',
              backgroundColor: gradRed,
              fill: true,
              tension: 0.42,
              borderWidth: 2.5,
              pointRadius: 4,
              pointBackgroundColor: '#f5b942'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
          },
          scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.08)' } },
            y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.08)' } }
          }
        }
      });
    }

    const ctxSeg = document.getElementById('chart-segments')?.getContext('2d');
    if (ctxSeg) {
      if (this.charts.segments) this.charts.segments.destroy();
      const map = {};
      leads.forEach((l) => {
        map[l.segment] = (map[l.segment] || 0) + 1;
      });
      this.charts.segments = new Chart(ctxSeg, {
        type: 'doughnut',
        data: {
          labels: Object.keys(map),
          datasets: [
            {
              data: Object.values(map),
              backgroundColor: ['#2dd4bf', '#38bdf8', '#f5b942', '#e11d48', '#818cf8', '#fb923c'],
              borderColor: '#071121',
              borderWidth: 3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '66%',
          plugins: {
            legend: { position: 'bottom', labels: { color: '#cbd5e1', boxWidth: 10, font: { size: 11 } } }
          }
        }
      });
    }
  }

  /* ==================== PROSPECTING (TREG) ==================== */
  bindProspecting() {
    const select = document.getElementById('treg-endpoint-select');
    if (select) {
      select.innerHTML = TREG_ENDPOINTS.map(
        (ep) => `<option value="${ep.id}">${ep.label} — ${ep.cost}</option>`
      ).join('');
    }

    document.querySelectorAll('.niche-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.getElementById('prospect-niche').value = chip.dataset.niche;
      });
    });

    document.getElementById('btn-focus-brazil')?.addEventListener('click', () => {
      this.globe?.focusBrazil(true);
    });

    document.getElementById('prospect-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const query = document.getElementById('prospect-niche').value.trim() || 'Churrascaria';
      const city = document.getElementById('prospect-city').value.trim() || 'São Paulo, SP';
      const endpointId = document.getElementById('treg-endpoint-select').value;
      const limit = Number(document.getElementById('prospect-limit').value) || 6;

      const btn = document.getElementById('btn-run-prospect');
      const terminal = document.getElementById('treg-terminal-log');
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Varrendo Estados no Globo...`;
      if (window.lucide) window.lucide.createIcons();

      this.ocean?.triggerSurge(2.0);
      terminal.textContent = `> Conectando ao gateway treg.to...\n> Iniciando varredura orbital no Brasil (${city}) para "${query}"...`;

      const [res] = await Promise.all([
        this.treg.prospect({
          query,
          city,
          endpointId,
          limit,
          token: this.state.treg.token,
          proxyUrl: this.state.treg.proxyUrl
        }),
        this.globe
          ? this.globe.runProspectingScan(query, city, (st) => {
              terminal.textContent += `\n[SAT-BRASIL] Escaneando ${st.name} (${st.uf})...`;
              terminal.scrollTop = terminal.scrollHeight;
            })
          : Promise.resolve()
      ]);

      terminal.textContent = res.logs.join('\n');
      this.state.discoveredLeads = res.leads;
      this.state.metrics.totalProspectedRuns += res.leads.length;
      this.addActivity(`Prospecção Treg (${endpointId}): ${res.leads.length} leads de "${query}" em ${city}`, 'treg');
      this.saveState();

      this.renderDiscoveredLeads();
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="radar" class="w-4 h-4"></i> Prospectar via Treg`;
      if (window.lucide) window.lucide.createIcons();
      this.toast(`${res.leads.length} leads encontrados via ${res.mode === 'live' ? 'Treg API Real' : 'Treg Sandbox'}!`, 'success');
    });

    document.getElementById('btn-fetch-treg-catalog')?.addEventListener('click', async () => {
      const q = document.getElementById('prospect-niche').value.trim() || 'leads';
      const box = document.getElementById('treg-catalog-results');
      box.classList.remove('hidden');
      box.innerHTML = `<p class="text-xs text-sky-300">Consultando catálogo público real em https://treg.to/catalog/search?q=${encodeURIComponent(q)}...</p>`;

      const result = await this.treg.searchCatalog(q);
      if (!result.ok) {
        box.innerHTML = `<p class="text-xs text-rose-300">Não foi possível consultar o catálogo agora (${result.error}).</p>`;
        return;
      }
      const items = (result.data.results || []).slice(0, 6);
      if (!items.length) {
        box.innerHTML = `<p class="text-xs text-slate-400">Nenhum endpoint encontrado para "${q}". Tente "leads" ou "places".</p>`;
        return;
      }
      box.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold text-teal-300">Catálogo Real Treg.to (${result.data.total || items.length} ferramentas encontradas)</span>
          <button id="close-catalog-box" class="text-xs text-slate-400 hover:text-white">Fechar</button>
        </div>
        <div class="grid sm:grid-cols-2 gap-2">
          ${items
            .map(
              (it) => `
            <div class="p-2.5 rounded-lg bg-slate-950/70 border border-white/10 text-xs">
              <div class="flex items-center justify-between gap-2">
                <code class="text-teal-300 font-mono-code">${it.id}</code>
                <span class="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px]">${it.method || 'POST'}</span>
              </div>
              <p class="text-slate-300 mt-1 line-clamp-2">${it.summary || it.name}</p>
            </div>`
            )
            .join('')}
        </div>`;
      document.getElementById('close-catalog-box')?.addEventListener('click', () => box.classList.add('hidden'));
    });

    document.getElementById('btn-save-all-discovered')?.addEventListener('click', () => {
      if (!this.state.discoveredLeads.length) return;
      let added = 0;
      this.state.discoveredLeads.forEach((dl) => {
        if (!this.state.leads.some((l) => l.company === dl.company && l.city === dl.city)) {
          this.state.leads.unshift({ ...dl, messages: [], createdAt: new Date().toISOString() });
          added++;
        }
      });
      this.saveState();
      this.renderLeadsView();
      this.toast(`${added} leads salvos no seu pipeline!`, 'success');
    });
  }

  renderDiscoveredLeads() {
    const container = document.getElementById('discovered-leads-grid');
    const saveAllBtn = document.getElementById('btn-save-all-discovered');
    const list = this.state.discoveredLeads;

    if (!list.length) {
      saveAllBtn?.classList.add('hidden');
      container.innerHTML = `
        <div class="col-span-full nagi-card rounded-2xl p-8 text-center border-dashed">
          <p class="font-jp text-2xl text-teal-300/70 mb-2">開拓</p>
          <p class="text-sm text-slate-300">Escolha um nicho (ex: <strong>Churrascaria</strong>) e cidade acima e clique em <strong>Prospectar via Treg</strong>.</p>
        </div>`;
      return;
    }

    saveAllBtn?.classList.remove('hidden');
    container.innerHTML = list
      .map(
        (lead, idx) => `
      <div class="nagi-card tilt-card rounded-2xl p-5 flex flex-col justify-between gap-4">
        <div>
          <div class="flex items-start justify-between gap-2">
            <div>
              <span class="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-teal-500/15 text-teal-300 border border-teal-400/25 mb-1.5">${lead.segment}</span>
              <h4 class="font-bold text-base text-white leading-tight">${lead.company}</h4>
              <p class="text-xs text-slate-400 mt-0.5">${lead.city} • ${lead.rating}</p>
            </div>
            <span class="text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-400/20 px-2 py-1 rounded-lg">R$ ${lead.potentialTicket.toLocaleString('pt-BR')}</span>
          </div>

          <div class="mt-3 space-y-1.5 text-xs text-slate-300">
            <p><strong class="text-slate-400">Decisor:</strong> ${lead.contactName} (${lead.role})</p>
            <p><strong class="text-slate-400">Site:</strong> <span class="text-rose-300">${lead.website}</span></p>
            <p class="text-slate-300/90 bg-slate-950/60 p-2.5 rounded-xl border border-white/5 leading-relaxed">
              <strong class="text-sky-300">Oportunidade:</strong> ${lead.painPoint}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 pt-2 border-t border-white/10">
          <button data-save-lead="${idx}" class="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-teal-500/20 text-teal-200 border border-teal-400/30 hover:bg-teal-500/30 transition">
            + Salvar Lead
          </button>
          <button data-bot-lead="${idx}" class="px-3 py-2 rounded-xl text-xs font-semibold bg-sky-500/20 text-sky-200 border border-sky-400/30 hover:bg-sky-500/30 transition">
            Abrir Robô
          </button>
          <button data-lp-lead="${idx}" class="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/30 hover:bg-amber-500/30 transition">
            Gerar LP
          </button>
        </div>
      </div>`
      )
      .join('');

    container.querySelectorAll('[data-save-lead]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lead = this.saveDiscoveredToPipeline(Number(btn.dataset.saveLead));
        this.toast(`${lead.company} salvo em Meus Leads!`, 'success');
      });
    });

    container.querySelectorAll('[data-bot-lead]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lead = this.saveDiscoveredToPipeline(Number(btn.dataset.botLead));
        this.state.selectedLeadId = lead.id;
        this.saveState();
        this.switchView('leads');
      });
    });

    container.querySelectorAll('[data-lp-lead]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lead = this.saveDiscoveredToPipeline(Number(btn.dataset.lpLead));
        this.state.selectedLeadId = lead.id;
        this.saveState();
        this.switchView('studio');
        this.fillStudioFromLead(lead);
      });
    });

    this.bind3DTilt();
  }

  saveDiscoveredToPipeline(idx) {
    const dl = this.state.discoveredLeads[idx];
    const existing = this.state.leads.find((l) => l.company === dl.company && l.city === dl.city);
    if (existing) return existing;
    const saved = { ...dl, messages: [], createdAt: new Date().toISOString() };
    this.state.leads.unshift(saved);
    this.saveState();
    return saved;
  }

  /* ==================== LEADS & ROBÔ DE ABORDAGEM ==================== */
  bindLeadsAndBot() {
    document.getElementById('leads-search')?.addEventListener('input', () => this.renderLeadsList());
    document.getElementById('leads-filter-segment')?.addEventListener('change', () => this.renderLeadsList());
    document.getElementById('leads-filter-status')?.addEventListener('change', () => this.renderLeadsList());

    document.getElementById('bot-script-style')?.addEventListener('change', (e) => {
      const lead = this.getSelectedLead();
      if (!lead) return;
      const fn = SCRIPT_TEMPLATES[e.target.value] || SCRIPT_TEMPLATES.consultivo;
      document.getElementById('bot-message-input').value = fn(lead);
    });

    document.getElementById('bot-generate-script')?.addEventListener('click', () => {
      const lead = this.getSelectedLead();
      if (!lead) return;
      const style = document.getElementById('bot-script-style').value;
      document.getElementById('bot-message-input').value = (SCRIPT_TEMPLATES[style] || SCRIPT_TEMPLATES.consultivo)(lead);
      this.toast('Script personalizado gerado pelo Robô Nagi!', 'info');
    });

    document.getElementById('bot-send-msg')?.addEventListener('click', () => {
      this.sendBotMessage(false);
    });

    document.getElementById('bot-open-whatsapp')?.addEventListener('click', () => {
      this.sendBotMessage(true);
    });

    document.getElementById('bot-copy-script')?.addEventListener('click', () => {
      const txt = document.getElementById('bot-message-input').value;
      if (!txt) return;
      navigator.clipboard.writeText(txt);
      this.toast('Script copiado para a área de transferência!', 'success');
    });

    document.getElementById('lead-status-select')?.addEventListener('change', (e) => {
      const lead = this.getSelectedLead();
      if (!lead) return;
      const prev = lead.status;
      lead.status = e.target.value;
      if (lead.status.startsWith('Vendido') && !prev.startsWith('Vendido')) {
        this.ocean?.triggerSurge(2.2);
        this.addActivity(`Venda fechada: ${lead.company} (${lead.status} — R$ ${lead.potentialTicket.toLocaleString('pt-BR')})`, 'sale');
        this.toast(`Parabéns! Venda registrada para ${lead.company}!`, 'success');
      }
      this.saveState();
      this.renderLeadsList();
      this.renderDashboard();
    });

    document.getElementById('btn-lead-to-studio')?.addEventListener('click', () => {
      const lead = this.getSelectedLead();
      if (!lead) return;
      this.switchView('studio');
      this.fillStudioFromLead(lead);
    });
  }

  getSelectedLead() {
    return this.state.leads.find((l) => l.id === this.state.selectedLeadId) || this.state.leads[0];
  }

  sendBotMessage(openWhatsApp = false) {
    const lead = this.getSelectedLead();
    const input = document.getElementById('bot-message-input');
    const text = input.value.trim();
    if (!lead || !text) return;

    lead.messages = lead.messages || [];
    lead.messages.push({
      sender: 'bot',
      text,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });
    if (lead.status === 'Novo') lead.status = 'Contatado';

    this.state.metrics.messagesSent += 1;
    this.addActivity(`Robô enviou abordagem para ${lead.company} (${lead.segment})`, 'bot');
    this.saveState();
    this.renderLeadDetail();
    this.renderLeadsList();

    if (openWhatsApp) {
      const phone = (lead.phone || '').replace(/\D/g, '');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    } else {
      this.toast(`Mensagem registrada e enviada no simulador para ${lead.contactName}!`, 'success');
    }
  }

  renderLeadsView() {
    // Populate segment filter
    const segSelect = document.getElementById('leads-filter-segment');
    if (segSelect) {
      const current = segSelect.value;
      const segs = [...new Set(this.state.leads.map((l) => l.segment))];
      segSelect.innerHTML = `<option value="">Todos Segmentos</option>` + segs.map((s) => `<option value="${s}">${s}</option>`).join('');
      if (segs.includes(current)) segSelect.value = current;
    }

    this.renderLeadsList();
    this.renderLeadDetail();
  }

  renderLeadsList() {
    const q = (document.getElementById('leads-search')?.value || '').toLowerCase();
    const seg = document.getElementById('leads-filter-segment')?.value || '';
    const st = document.getElementById('leads-filter-status')?.value || '';

    const filtered = this.state.leads.filter((l) => {
      const matchQ =
        !q ||
        l.company.toLowerCase().includes(q) ||
        l.contactName.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q);
      const matchSeg = !seg || l.segment === seg;
      const matchSt = !st || l.status === st;
      return matchQ && matchSeg && matchSt;
    });

    const container = document.getElementById('leads-list-container');
    if (!filtered.length) {
      container.innerHTML = `<p class="text-xs text-slate-400 p-4 text-center">Nenhum lead encontrado com esses filtros.</p>`;
      return;
    }

    container.innerHTML = filtered
      .map((lead) => {
        const active = lead.id === this.state.selectedLeadId;
        const statusColor = lead.status.startsWith('Vendido')
          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
          : lead.status === 'Respondeu' || lead.status === 'Proposta'
          ? 'bg-amber-500/20 text-amber-300 border-amber-400/30'
          : lead.status === 'Contatado'
          ? 'bg-sky-500/20 text-sky-300 border-sky-400/30'
          : 'bg-slate-700/40 text-slate-300 border-white/10';

        return `
          <button data-select-lead="${lead.id}" class="w-full text-left p-3.5 rounded-xl border transition ${
          active
            ? 'bg-teal-500/15 border-teal-400/45 shadow-lg'
            : 'bg-slate-950/50 border-white/10 hover:border-sky-400/30'
        }">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="font-bold text-sm text-white truncate">${lead.company}</p>
                <p class="text-xs text-slate-400 truncate">${lead.segment} • ${lead.city}</p>
              </div>
              <span class="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold border ${statusColor}">${lead.status}</span>
            </div>
            <div class="flex items-center justify-between mt-2 text-[11px] text-slate-400">
              <span>${lead.contactName}</span>
              <span class="text-amber-300 font-semibold">R$ ${Number(lead.potentialTicket).toLocaleString('pt-BR')}</span>
            </div>
          </button>`;
      })
      .join('');

    container.querySelectorAll('[data-select-lead]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.state.selectedLeadId = btn.dataset.selectLead;
        this.saveState();
        this.renderLeadsList();
        this.renderLeadDetail();
      });
    });
  }

  renderLeadDetail() {
    const lead = this.getSelectedLead();
    if (!lead) return;

    document.getElementById('detail-company').textContent = lead.company;
    document.getElementById('detail-meta').textContent = `${lead.segment} • ${lead.city} • ${lead.rating}`;
    document.getElementById('detail-contact').textContent = `${lead.contactName} (${lead.role}) • ${lead.instagram || ''}`;
    document.getElementById('detail-pain').textContent = lead.painPoint;
    document.getElementById('lead-status-select').value = lead.status;

    const style = document.getElementById('bot-script-style').value;
    document.getElementById('bot-message-input').value = (SCRIPT_TEMPLATES[style] || SCRIPT_TEMPLATES.consultivo)(lead);

    const chatBox = document.getElementById('bot-chat-thread');
    const msgs = lead.messages || [];
    if (!msgs.length) {
      chatBox.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">Nenhuma mensagem enviada ainda. Use o script abaixo para iniciar a prospecção!</p>`;
    } else {
      chatBox.innerHTML = msgs
        .map(
          (m) => `
        <div class="flex ${m.sender === 'bot' ? 'justify-end' : 'justify-start'}">
          <div class="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
            m.sender === 'bot'
              ? 'bg-teal-500/20 border border-teal-400/30 text-teal-50 rounded-br-sm'
              : 'bg-slate-800/80 border border-white/10 text-slate-200 rounded-bl-sm'
          }">
            <p class="whitespace-pre-line">${m.text}</p>
            <span class="block text-[10px] opacity-60 mt-1 text-right">${m.sender === 'bot' ? 'Robô Nagi' : lead.contactName} • ${m.time}</span>
          </div>
        </div>`
        )
        .join('');
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  }

  /* ==================== ESTÚDIO DE PROMPTS & GERADOR ==================== */
  bindStudio() {
    document.getElementById('studio-lead-autofill')?.addEventListener('change', (e) => {
      const lead = this.state.leads.find((l) => l.id === e.target.value);
      if (lead) this.fillStudioFromLead(lead);
    });

    ['var-empresa', 'var-cidade', 'var-segmento', 'var-diferencial', 'var-oferta'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', () => this.updateStudioPromptText());
    });

    document.getElementById('btn-copy-prompt')?.addEventListener('click', () => {
      const txt = document.getElementById('studio-prompt-output').value;
      navigator.clipboard.writeText(txt);
      this.toast('Prompt copiado! Cole no Lovable, v0, Cursor ou Antigravity.', 'success');
    });

    document.getElementById('btn-generate-inside')?.addEventListener('click', () => {
      this.ocean?.triggerSurge(1.8);
      this.generateInsideNagi();
    });

    document.getElementById('tab-studio-lp')?.addEventListener('click', () => {
      this.studioTab = 'lp';
      this.renderStudioOutputTabs();
    });

    document.getElementById('tab-studio-n8n')?.addEventListener('click', () => {
      this.studioTab = 'n8n';
      this.renderStudioOutputTabs();
    });

    document.getElementById('btn-viewport-desktop')?.addEventListener('click', () => {
      this.previewViewport = 'desktop';
      document.getElementById('studio-iframe').style.width = '100%';
    });

    document.getElementById('btn-viewport-mobile')?.addEventListener('click', () => {
      this.previewViewport = 'mobile';
      document.getElementById('studio-iframe').style.width = '390px';
    });

    document.getElementById('btn-download-lp')?.addEventListener('click', () => {
      if (!this.lastGeneratedHTML) this.generateInsideNagi();
      const empresa = document.getElementById('var-empresa').value || 'landing-page';
      this.downloadFile(`${empresa.toLowerCase().replace(/[^a-z0-9]/g, '-')}.html`, this.lastGeneratedHTML, 'text/html');
    });

    document.getElementById('btn-copy-n8n')?.addEventListener('click', () => {
      if (!this.lastGeneratedJSON) this.generateInsideNagi();
      navigator.clipboard.writeText(this.lastGeneratedJSON);
      this.toast('JSON do Workflow n8n copiado! Importe direto no seu n8n.', 'success');
    });

    document.getElementById('btn-download-n8n')?.addEventListener('click', () => {
      if (!this.lastGeneratedJSON) this.generateInsideNagi();
      this.downloadFile('nagi-workflow-n8n.json', this.lastGeneratedJSON, 'application/json');
    });
  }

  renderStudio() {
    // Populate lead autofill select
    const autoSel = document.getElementById('studio-lead-autofill');
    if (autoSel) {
      autoSel.innerHTML =
        `<option value="">Selecionar um lead salvo para preencher automático...</option>` +
        this.state.leads.map((l) => `<option value="${l.id}">${l.company} (${l.segment} — ${l.city})</option>`).join('');
    }

    // Render prompt library cards
    const listEl = document.getElementById('prompt-library-list');
    listEl.innerHTML = PROMPT_TEMPLATES.map((p) => {
      const active = p.id === this.state.selectedPromptId;
      return `
        <button data-prompt-id="${p.id}" class="w-full text-left p-3.5 rounded-xl border transition ${
        active
          ? 'bg-teal-500/15 border-teal-400/45'
          : 'bg-slate-950/55 border-white/10 hover:border-sky-400/35'
      }">
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-400/25">${p.category}</span>
            <span class="text-[10px] text-teal-300 font-semibold">${p.badge}</span>
          </div>
          <p class="font-bold text-sm text-white leading-snug">${p.title}</p>
          <p class="text-xs text-slate-400 mt-1 line-clamp-2">${p.description}</p>
        </button>`;
    }).join('');

    listEl.querySelectorAll('[data-prompt-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.state.selectedPromptId = btn.dataset.promptId;
        this.saveState();
        this.renderStudio();
      });
    });

    this.updateStudioPromptText();
    if (!this.lastGeneratedHTML) this.generateInsideNagi();
    this.renderStudioOutputTabs();
  }

  fillStudioFromLead(lead) {
    document.getElementById('var-empresa').value = lead.company;
    document.getElementById('var-cidade').value = lead.city;
    document.getElementById('var-segmento').value = lead.segment;
    document.getElementById('var-diferencial').value = lead.painPoint;
    document.getElementById('var-oferta').value = `Atendimento VIP e condição especial (${lead.offerType})`;

    // Pick matching prompt template automatically
    const segLower = lead.segment.toLowerCase();
    const match = PROMPT_TEMPLATES.find((p) => segLower.includes(p.segment.toLowerCase().split(' ')[0]));
    if (match) this.state.selectedPromptId = match.id;

    this.renderStudio();
    this.generateInsideNagi();
    this.toast(`Estúdio preenchido com os dados de ${lead.company}!`, 'info');
  }

  updateStudioPromptText() {
    const tpl = PROMPT_TEMPLATES.find((p) => p.id === this.state.selectedPromptId) || PROMPT_TEMPLATES[0];
    const empresa = document.getElementById('var-empresa').value || 'Churrascaria Brasa Nobre';
    const cidade = document.getElementById('var-cidade').value || 'São Paulo, SP';
    const segmento = document.getElementById('var-segmento').value || tpl.segment;
    const diferencial = document.getElementById('var-diferencial').value || 'Cortes Angus na brasa e reserva rápida sem fila';
    const oferta = document.getElementById('var-oferta').value || 'Drink ou sobremesa cortesia reservando pelo site';

    const filled = tpl.promptText
      .replaceAll('{{EMPRESA}}', empresa)
      .replaceAll('{{CIDADE}}', cidade)
      .replaceAll('{{SEGMENTO}}', segmento)
      .replaceAll('{{DIFERENCIAL}}', diferencial)
      .replaceAll('{{OFERTA}}', oferta);

    document.getElementById('studio-prompt-output').value = filled;
  }

  generateInsideNagi() {
    const empresa = document.getElementById('var-empresa').value || 'Churrascaria Brasa Nobre';
    const cidade = document.getElementById('var-cidade').value || 'São Paulo, SP';
    const segmento = document.getElementById('var-segmento').value || 'Churrascaria';
    const diferencial = document.getElementById('var-diferencial').value || 'Cortes nobres na brasa e atendimento VIP';
    const oferta = document.getElementById('var-oferta').value || 'Reserva prioritária + entrada cortesia hoje';

    const lead = this.getSelectedLead();
    this.lastGeneratedHTML = generateLandingPageHTML({
      company: empresa,
      segment: segmento,
      city: cidade,
      diferencial,
      oferta,
      phone: lead?.phone || '5511998421104'
    });

    this.lastGeneratedJSON = generateN8nWorkflowJSON({
      company: empresa,
      segment: segmento,
      city: cidade,
      oferta
    });

    const iframe = document.getElementById('studio-iframe');
    if (iframe) iframe.srcdoc = this.lastGeneratedHTML;

    const jsonPre = document.getElementById('studio-n8n-json');
    if (jsonPre) jsonPre.textContent = this.lastGeneratedJSON;

    this.toast('Preview ao vivo & Workflow n8n gerados dentro do Nagi!', 'success');
  }

  renderStudioOutputTabs() {
    const lpWrap = document.getElementById('studio-lp-preview-wrap');
    const n8nWrap = document.getElementById('studio-n8n-preview-wrap');
    const tabLp = document.getElementById('tab-studio-lp');
    const tabN8n = document.getElementById('tab-studio-n8n');

    if (this.studioTab === 'lp') {
      lpWrap.classList.remove('hidden');
      n8nWrap.classList.add('hidden');
      tabLp.classList.add('bg-teal-500/20', 'text-teal-200', 'border-teal-400/40');
      tabN8n.classList.remove('bg-teal-500/20', 'text-teal-200', 'border-teal-400/40');
    } else {
      lpWrap.classList.add('hidden');
      n8nWrap.classList.remove('hidden');
      tabN8n.classList.add('bg-teal-500/20', 'text-teal-200', 'border-teal-400/40');
      tabLp.classList.remove('bg-teal-500/20', 'text-teal-200', 'border-teal-400/40');
    }
  }

  /* ==================== HELPERS ==================== */
  renderAll() {
    this.renderDashboard();
    this.renderDiscoveredLeads();
    this.renderLeadsView();
    this.renderStudio();
  }

  addActivity(text, type = 'info') {
    this.state.activities.unshift({
      id: Date.now(),
      text,
      time: 'Agora',
      type
    });
    this.state.activities = this.state.activities.slice(0, 12);
  }

  bind3DTilt() {
    document.querySelectorAll('.tilt-card').forEach((card) => {
      if (card.dataset.tiltBound) return;
      card.dataset.tiltBound = '1';
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const rx = ((y / rect.height) - 0.5) * -7;
        const ry = ((x / rect.width) - 0.5) * 7;
        card.style.setProperty('--mouse-x', `${(x / rect.width) * 100}%`);
        card.style.setProperty('--mouse-y', `${(y / rect.height) * 100}%`);
        card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(4px)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
      });
    });
  }

  downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  toast(message, type = 'info') {
    const host = document.getElementById('toast-container');
    if (!host) return;
    const el = document.createElement('div');
    const border =
      type === 'success'
        ? 'border-teal-400/40 bg-slate-900/95 text-teal-200'
        : 'border-sky-400/40 bg-slate-900/95 text-sky-200';
    el.className = `px-4 py-3 rounded-xl border shadow-2xl text-xs sm:text-sm font-medium backdrop-blur-md transition-all duration-300 ${border}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(() => el.remove(), 300);
    }, 3400);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.nagiApp = new NagiApp();
});
