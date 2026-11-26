// Números brasileiros: forma canônica 55 + DDD + número (celular com o 9º dígito).
// No WhatsApp, contas antigas de alguns DDDs ainda usam o número SEM o 9º dígito no JID,
// por isso o envio testa as duas variantes com onWhatsApp().

export function soDigitos(v) {
  return String(v ?? '').replace(/\D/g, '');
}

/** Retorna 55DDDNNNNNNNNN (13 dígitos para celular, 12 para fixo) ou '' se não parecer número BR. */
export function normalizarBR(v) {
  let d = soDigitos(v);
  if (!d) return '';
  d = d.replace(/^0+/, '');            // 0xx83..., 083...
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (!d.startsWith('55')) return d.length >= 10 ? d : ''; // estrangeiro: devolve como veio
  if (d.length === 12) {
    // 55 + DDD + 8 dígitos: celular antigo (começa com 6-9) ganha o 9; fixo (2-5) fica.
    const local = d.slice(4);
    if (/^[6-9]/.test(local)) d = d.slice(0, 4) + '9' + local;
  }
  if (d.length !== 12 && d.length !== 13) return '';
  return d;
}

/** Variantes para checar no WhatsApp: com e sem o 9º dígito (só para celular BR). */
export function variantesWhatsApp(v) {
  const n = normalizarBR(v);
  if (!n) return [];
  if (n.startsWith('55') && n.length === 13 && n[4] === '9') {
    return [n, n.slice(0, 4) + n.slice(5)];
  }
  return [n];
}

export function numeroDoJid(jid) {
  const m = /^(\d+)@s\.whatsapp\.net$/.exec(String(jid || ''));
  return m ? m[1] : '';
}

/** Mesma pessoa? Compara pela forma canônica (resolve a diferença do 9º dígito). */
export function mesmoNumero(a, b) {
  const na = normalizarBR(a);
  const nb = normalizarBR(b);
  return !!na && na === nb;
}

export function formatarBR(v) {
  const n = normalizarBR(v);
  if (!n.startsWith('55')) return n;
  const ddd = n.slice(2, 4);
  const resto = n.slice(4);
  return resto.length === 9
    ? `+55 ${ddd} ${resto.slice(0, 5)}-${resto.slice(5)}`
    : `+55 ${ddd} ${resto.slice(0, 4)}-${resto.slice(4)}`;
}
