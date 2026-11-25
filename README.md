# NAGI 凪 — SaaS para Desenvolvedores Freelancers

Plataforma SaaS inspirada em ondas japonesas (Ukiyo-e / Seigaiha / Kintsugi) com oceanos 3D interativos em **Three.js (WebGL)**, **HTML**, **CSS**, **JavaScript** e **Tailwind CSS**.

## Funcionalidades
- **Login & Conta Freelancer** integrado ao gateway de prospecção **Treg (`treg.to`)** via `X-Treg-Token` (ou Modo Sandbox Demo).
- **Dashboard de Métricas**: leads prospectados, mensagens do robô, Landing Pages vendidas, automações n8n vendidas, faturamento e meta mensal com gráficos interativos (`Chart.js`).
- **Radar de Prospecção Treg**: busca por segmento e cidade usando `treg.companies.search`, `treg.people.search`, `bravesearch.places.search` e consulta ao catálogo público real de `treg.to`.
- **Gestão de Leads & Robô de Abordagem**: filtros por segmento/status, diagnóstico de dor, scripts dinâmicos e envio direto para o WhatsApp.
- **Estúdio de Prompts & Gerador Ao Vivo**: biblioteca de prompts prontos (Churrascaria, Clínica, Barbearia, Imobiliária, n8n), preview ao vivo da Landing Page dentro da ferramenta, download em `.html` e exportação de workflow `.json` para o **n8n**.

## Como rodar localmente com Proxy Treg (evita CORS)
```bash
npm start
```
Acesse `http://localhost:3456`.
