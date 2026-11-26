"""tratar_onda.py <gravura.jpg> -> assets/onda/
Pega a gravura original "Sob a onda ao largo de Kanagawa" (Hokusai, ~1831; Met Museum, domínio público / CC0,
objeto 45434, imagem DP130155) e gera:
  - onda-azul.webp : a onda recortada (céu da gravura transparente), recolorida em azuis da noite
  - onda-azul-mascara.png : só a máscara (prévia/depuração)
O céu (papel bege + degradê cinza do horizonte) é achado por crescimento a partir do canto superior direito, só por
pixels "de papel" (pouca saturação); os contornos azuis da onda seguram o preenchimento, então a espuma (que também
é papel) fica dentro da onda.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ORIG = Path(sys.argv[1])
SAI = Path(__file__).resolve().parent.parent / "assets" / "onda"
SAI.mkdir(parents=True, exist_ok=True)
LARG = int(sys.argv[2]) if len(sys.argv) > 2 else 2600

im = Image.open(ORIG).convert("RGB")
# tira a moldura fina da borda da gravura (~1% de cada lado)
mx_, my_ = round(im.width * 0.011), round(im.height * 0.013)
im = im.crop((mx_, my_, im.width - mx_, im.height - my_))
im = im.resize((LARG, round(im.height * LARG / im.width)), Image.LANCZOS)
a = np.asarray(im).astype(np.float32) / 255.0
r, g, b = a[..., 0], a[..., 1], a[..., 2]
mx, mn = a.max(-1), a.min(-1)
sat = (mx - mn) / (mx + 1e-4)
lum = 0.299 * r + 0.587 * g + 0.114 * b

# "papel": pouco azul relativo (b <= r) e pouca saturação, ou cinza do degradê do horizonte
azulado = (b - r) > 0.04
papel = (~azulado) & (sat < 0.38) & (lum > 0.22)
papel = ndimage.binary_opening(papel, iterations=1)

h, w = papel.shape
VED = int(sys.argv[3]) if len(sys.argv) > 3 else 5   # quanto engrossar os contornos para vedar as frestas
barreira = ndimage.binary_dilation(~papel, iterations=VED)
livre = papel & ~barreira
# cartela do título e assinatura (canto superior esquerdo) entram no céu: tira a caixa flutuante
cy0, cy1, cx0, cx1 = int(h * 0.03), int(h * 0.33), int(w * 0.005), int(w * 0.11)
rot, n = ndimage.label(livre)
sementes = [(int(h * 0.08), int(w * 0.95)), (int(h * 0.30), int(w * 0.70)), (int(h * 0.55), int(w * 0.52)),
            (int(h * 0.12), int(w * 0.55))]
ids = {rot[y, x] for y, x in sementes if rot[y, x] > 0}
ceu = np.isin(rot, list(ids))
# devolve a faixa que a vedação comeu, sem passar dos contornos de verdade
ceu = ndimage.binary_dilation(ceu, iterations=VED) & papel | ceu
ceu[cy0:cy1, cx0:cx1] = True
# fecha furinhos de gotas de espuma soltas no céu (ficam como respingo) e suaviza borda
ceu = ndimage.binary_closing(ceu, iterations=2)
# bordas: abertura/fechamento morfológicos deixam um fio opaco colado na borda da imagem; nas faixas sem onda vira céu
ceu[: int(h * 0.025), :] = True                      # topo (a crista mais alta fica em ~9%)
ceu[: int(h * 0.32), : int(w * 0.015)] = True         # borda esquerda acima da onda da esquerda
ceu[: int(h * 0.30), int(w * 0.985):] = True          # borda direita acima das ondas da direita
alfa = (~ceu).astype(np.float32)
alfa_img = Image.fromarray((alfa * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
alfa = np.asarray(alfa_img).astype(np.float32) / 255.0

# recolorir: mapa de luminância -> rampa de azuis da noite (papel vira espuma azul-gelo, prussiano vira azul profundo)
paleta = np.array([
    [0.0, (3, 10, 28)],
    [0.18, (8, 32, 78)],
    [0.38, (20, 74, 160)],
    [0.58, (58, 130, 220)],
    [0.78, (150, 196, 245)],
    [1.0, (232, 243, 255)],
], dtype=object)
pos = np.array([p[0] for p in paleta], dtype=np.float32)
cores = np.array([p[1] for p in paleta], dtype=np.float32) / 255.0
L = np.clip((lum - 0.08) / 0.84, 0, 1)
out = np.zeros_like(a)
for c in range(3):
    out[..., c] = np.interp(L, pos, cores[:, c])
# mantém um pouco do desenho original (textura do papel e da madeira) no canal de luminância
out = np.clip(out * (0.85 + 0.3 * (lum[..., None] - lum.mean())), 0, 1)

rgba = np.dstack([out, alfa])
Image.fromarray((rgba * 255).astype(np.uint8), "RGBA").save(SAI / "onda-azul.webp", quality=88, method=6)
# (máscara de depuração: descomente para conferir)
# Image.fromarray((alfa * 255).astype(np.uint8)).save(SAI / "onda-azul-mascara.png")
print("ok", SAI / "onda-azul.webp", (SAI / "onda-azul.webp").stat().st_size // 1024, "KB", "componentes céu:", ids)
