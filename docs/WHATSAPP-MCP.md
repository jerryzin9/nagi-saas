# Nagi: WhatsApp pessoal + MCP (Antigravity / Codex)

O Nagi roda **só no seu PC** (`http://127.0.0.1:3456`). Ele faz quatro coisas:

- conecta no seu WhatsApp pessoal pelo QR, do mesmo jeito que o WhatsApp Web;
- guarda os leads;
- mantém uma **fila de mensagens** que você aprova;
- expõe tudo isso como **servidor MCP**, para o Antigravity ou o Codex prospectar e preparar as abordagens.

## 1. Iniciar

```bash
cd C:\Users\WIN11\OneDrive\Documentos\nagi
npm install   # só na primeira vez
npm start     # http://127.0.0.1:3456
```

O MCP só funciona com o Nagi aberto. Se ele estiver fechado, as ferramentas respondem
"O Nagi não está aberto".

## 2. Conectar o WhatsApp

1. No Nagi, clique em conectar. O QR também aparece no terminal.
2. No celular, abra o WhatsApp → **Aparelhos conectados** → **Conectar aparelho** e escaneie.
3. A sessão fica em `data/wa-auth`. Quando o Nagi reinicia, ele reconecta sozinho.
4. **Sair** (`POST /api/wa/sair`) desconecta o aparelho e apaga a sessão.

> Risco: o WhatsApp não autoriza automação em número pessoal. Mandar muita mensagem para
> desconhecidos pode **banir o número**. Por isso as travas abaixo vêm ligadas, e o padrão é
> você aprovar cada mensagem. Se for prospectar em volume, use um segundo chip.

## 3. Travas de envio (valem para a tela, o MCP e a fila)

| Trava | Padrão |
|---|---|
| Novas conversas por dia (`limiteDia`) | 25 |
| Intervalo mínimo entre novas conversas (`intervaloSeg`), com +0 a 60% de variação aleatória | 90 s |
| Horário para conversa nova | 8h às 19h (fuso de São Paulo) |
| Limite de conversas novas informado pelo próprio WhatsApp (message-capping) | respeitado |
| Mesmo texto para o mesmo número | nunca |
| Quem recusar ("não tenho interesse", "pare", "sair", "não quero", "remove"…) | vai para a lista de bloqueio, o lead vira "perdido" e a fila dele é cancelada |
| Número sem WhatsApp | checado antes, com e sem o 9º dígito |
| "Digitando…" antes de enviar | 2 a 6 s |

Responder alguém que **já conversa com você**, clicando na tela, sai na hora: não conta no
limite e não tem trava de horário nem de intervalo.

**Modos:**
- **aprovacao** (padrão): o que o MCP pede vai para a fila como `pendente` e só sai quando
  você aprova no Nagi.
- **auto**: o que o MCP pede entra como `aprovado` e sai sozinho quando as travas deixam. A fila é
  checada a cada 20 s.

Todo envio, negado ou feito, fica registrado em `data/envios.jsonl`.

## 4. Instagram

O Nagi **não envia DM sozinho**. Automação de DM fria fere as regras do Instagram e derruba a
conta. O MCP só prepara o **rascunho**, e a tela mostra "copiar texto e abrir `ig.me/m/<usuario>`".
Você cola, envia e marca como feito.

## 5. Ligar no Antigravity

O Antigravity já está configurado em `C:\Users\WIN11\.gemini\antigravity\mcp_config.json`:

```json
{
  "mcpServers": {
    "nagi": {
      "command": "node",
      "args": ["C:\\Users\\WIN11\\OneDrive\\Documentos\\nagi\\mcp\\nagi-mcp.mjs"]
    }
  }
}
```

Para refazer: `node mcp/instalar-antigravity.mjs`. Ele faz backup do arquivo, se já existir.
Depois **reinicie o Antigravity** ou recarregue os servidores MCP.

## 6. Ligar no Codex

O `~/.codex/config.toml` **não foi alterado automaticamente**, porque ele também pode ser usado
por outra pessoa no PC. Para ligar:

```bash
codex mcp add nagi -- node "C:\Users\WIN11\OneDrive\Documentos\nagi\mcp\nagi-mcp.mjs"
```

Ou acrescente no `config.toml`:

```toml
[mcp_servers.nagi]
command = "node"
args = ['C:\Users\WIN11\OneDrive\Documentos\nagi\mcp\nagi-mcp.mjs']
```

## 7. Ferramentas do MCP

| Ferramenta | O que faz |
|---|---|
| `whatsapp_status` | conectado ou não, modo, conversas novas hoje e limite |
| `whatsapp_conversas` | conversas recentes (quem respondeu) |
| `whatsapp_ler_conversa` | últimas mensagens de uma conversa |
| `whatsapp_enviar` | prepara a mensagem: vai para a fila no modo aprovação |
| `fila_listar` | fila (pendente, aprovado, enviado, rejeitado, erro) |
| `leads_listar` | leads com filtro de status e busca |
| `leads_adicionar` | adiciona leads em lote, sem duplicar telefone, Instagram ou site |
| `leads_atualizar` | status, valor, dados e nota no histórico |
| `instagram_preparar_dm` | rascunho de DM (envio manual) |
| `prospectar_maps` | negócios reais do Google Maps pelo treg (cerca de US$ 0,002 por busca) |
| `metricas` | números da prospecção |

Exemplo de pedido para o Antigravity ou o Codex:

> Use o Nagi. Busque barbearias em Cajazeiras PB, salve as que não têm site como leads e prepare
> uma mensagem curta e personalizada para cada uma, oferecendo site com agendamento. Não envie
> nada sem a minha aprovação.

## 8. API local (para a tela)

Todas as rotas são JSON, só em 127.0.0.1. `POST`, `PATCH` e `DELETE` exigem
`Content-Type: application/json`. Pedidos com Host ou Origin de outro site são recusados.

- `GET /api/wa/status`
- `POST /api/wa/conectar`
- `POST /api/wa/sair`
- `GET /api/wa/conversas?limite=40` (com `&grupos=1` inclui grupos)
- `GET /api/wa/mensagens?jid=…&limite=50`
- `POST /api/wa/enviar {para, texto, leadId?, origem}`
- `GET /api/fila?status=` · `POST /api/fila` · `POST /api/fila/:id/aprovar` · `POST /api/fila/:id/rejeitar` · `PATCH /api/fila/:id {texto}`
- `GET /api/config` · `POST /api/config` (o token do treg volta mascarado)
- `GET /api/leads?status=&busca=` · `POST /api/leads` · `GET /api/leads/:id` · `PATCH /api/leads/:id` · `DELETE /api/leads/:id`
- `POST /api/instagram/rascunho` · `GET /api/instagram/rascunhos` · `POST /api/instagram/rascunho/:id/feito`
- `POST /api/prospectar {busca, cidade, limite?}`: usa o CLI `treg` já logado no PC e nunca inventa
  telefone ou site
- `GET /api/metricas`
- `/api/treg/*`: proxy para treg.to (usa o token salvo na config se o header não vier)

## 9. Dados

Tudo fica em `data/`, que **não vai para o Git**. O repositório no GitHub é público.

| Arquivo | Conteúdo |
|---|---|
| `wa-auth/` | sessão do WhatsApp |
| `wa-store.json` | conversas recentes |
| `leads.json` | leads |
| `fila.json` | fila de mensagens |
| `config.json` | configurações |
| `bloqueio.json` | lista de bloqueio |
| `instagram.json` | rascunhos de DM |
| `envios.jsonl` | registro de envios |
