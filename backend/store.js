// Armazenamento local em JSON (pasta data/, fora do Git).
// Escrita atômica: grava num .tmp e renomeia, para não corromper o arquivo se o processo cair no meio.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(AQUI, '..');
export const DATA = process.env.NAGI_DATA ? path.resolve(process.env.NAGI_DATA) : path.join(RAIZ, 'data');

fs.mkdirSync(DATA, { recursive: true });

export function caminho(nome) {
  return path.join(DATA, nome);
}

export function lerJSON(nome, padrao) {
  try {
    return JSON.parse(fs.readFileSync(caminho(nome), 'utf8'));
  } catch {
    return structuredClone(padrao);
  }
}

export function gravarJSON(nome, valor) {
  const alvo = caminho(nome);
  const tmp = `${alvo}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(valor, null, 2), 'utf8');
  fs.renameSync(tmp, alvo);
}

export function anexarJSONL(nome, obj) {
  fs.appendFileSync(caminho(nome), JSON.stringify(obj) + '\n', 'utf8');
}

export function lerJSONL(nome) {
  try {
    return fs
      .readFileSync(caminho(nome), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function novoId(prefixo = '') {
  return prefixo + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
}

// Dia no fuso de São Paulo (AAAA-MM-DD) e hora local, para limite diário e horário comercial.
const FMT_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const FMT_HORA = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false });

export function diaBR(ms = Date.now()) {
  return FMT_DIA.format(new Date(ms));
}

export function horaBR(ms = Date.now()) {
  return Number(FMT_HORA.format(new Date(ms))) % 24;
}
