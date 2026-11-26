/** Nagi — chamadas ao servidor local (http://127.0.0.1:3456/api/*). */
let avisoAberto = false;

function aviso(mostrar) {
  if (mostrar === avisoAberto) return;
  avisoAberto = mostrar;
  document.getElementById('aviso-servidor').hidden = !mostrar;
}

export async function api(caminho, { metodo = 'GET', corpo } = {}) {
  let r;
  try {
    const escrita = metodo !== 'GET';
    r = await fetch(`/api${caminho}`, {
      method: metodo,
      headers: escrita ? { 'Content-Type': 'application/json' } : undefined,
      body: escrita ? JSON.stringify(corpo ?? {}) : undefined,
    });
  } catch (e) {
    aviso(true);
    throw new Error('Servidor do Nagi desligado');
  }
  aviso(false);
  const texto = await r.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = { erro: texto }; }
  if (!r.ok || (dados && dados.erro && !dados.fila)) {
    throw new Error((dados && (dados.erro || dados.error)) || `Erro ${r.status}`);
  }
  return dados;
}

export const get = (c) => api(c);
export const post = (c, corpo = {}) => api(c, { metodo: 'POST', corpo });
export const patch = (c, corpo = {}) => api(c, { metodo: 'PATCH', corpo });
export const del = (c) => api(c, { metodo: 'DELETE' });
