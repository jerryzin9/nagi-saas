// Registra (ou atualiza) o servidor MCP "nagi" no Antigravity: ~/.gemini/antigravity/mcp_config.json
// Faz backup do arquivo se ele já existir. Rodar: node mcp/instalar-antigravity.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const alvo = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json');
const servidor = path.join(path.dirname(fileURLToPath(import.meta.url)), 'nagi-mcp.mjs');

let cfg = { mcpServers: {} };
if (fs.existsSync(alvo)) {
  fs.copyFileSync(alvo, `${alvo}.bak-${Date.now()}`);
  cfg = JSON.parse(fs.readFileSync(alvo, 'utf8'));
  cfg.mcpServers ||= {};
}
cfg.mcpServers.nagi = { command: 'node', args: [servidor] };
fs.mkdirSync(path.dirname(alvo), { recursive: true });
fs.writeFileSync(alvo, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
console.log(`ok: ${alvo}\n` + fs.readFileSync(alvo, 'utf8'));
