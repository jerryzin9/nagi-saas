# Nagi 凪

Painel pessoal de prospecção do Jerry. Roda só no PC, em `http://127.0.0.1:3456`.

O visual é a Grande Onda de Kanagawa de Hokusai, recolorida em azuis da noite, sobre um oceano noturno em WebGL. O
oceano roda a 60 quadros por segundo em resolução reduzida e pausa quando a aba fica oculta.

## O que faz

| Tela | Para quê |
|---|---|
| **Painel** | Leads, abordados no dia, respostas, reuniões, fechados e faturamento. Mostra o gráfico de envios × respostas e as próximas ações. |
| **Prospectar** | Busca empresas reais no Google Maps pelo treg, com telefone, site e nota. Nada é inventado: o que não vier fica em branco. |
| **Leads** | Quadro por etapa (novo → abordado → respondeu → reunião → proposta → fechado/perdido), com gaveta de detalhes, histórico e valor. |
| **WhatsApp** | Seu WhatsApp pessoal pelo QR (Baileys): conversas, histórico e envio. |
| **Fila de envio** | O que a IA (pelo MCP) ou você preparou espera aprovação. Limite de conversas novas por dia, intervalo e horário valem sempre. |
| **Instagram** | A IA prepara a DM e você copia e abre a conversa com um clique. Envio automático a frio no Instagram arrisca a conta. |
| **Estúdio** | Prévia de página para o lead, fluxo n8n de partida e prompts prontos. |
| **Ajustes** | Modo aprovação ou automático, travas, assinatura, token do treg e ligação com o Antigravity e o Codex. |

## Rodar

```bash
cd C:\Users\WIN11\OneDrive\Documentos\nagi
npm install   # só na primeira vez
npm start
```

## Ligar na IA (MCP)

- **Antigravity:** já configurado em `%USERPROFILE%\.gemini\antigravity\mcp_config.json`.
- **Codex:**
  ```bash
  codex mcp add nagi -- node "C:\Users\WIN11\OneDrive\Documentos\nagi\mcp\nagi-mcp.mjs"
  ```

O guia completo do WhatsApp, das travas e das ferramentas MCP está em [docs/WHATSAPP-MCP.md](docs/WHATSAPP-MCP.md).

## Dados

Tudo fica em `data/`, fora do Git:

- sessão do WhatsApp;
- leads;
- fila;
- configuração;
- registro de envios.

O repositório no GitHub é público. Nada pessoal pode subir.

## A onda

- **Obra:** Katsushika Hokusai, *Sob a onda ao largo de Kanagawa* (c. 1831). The Metropolitan Museum of Art, objeto
  45434, domínio público.
- **Arquivo original:** `assets/onda/hokusai-great-wave-met-dp130155.jpg`.
- **Geração:** `ferramentas/tratar_onda.py` produz `assets/onda/onda-azul.webp`. Ele recorta o céu pelo contorno da
  gravura e recolore em azuis.
