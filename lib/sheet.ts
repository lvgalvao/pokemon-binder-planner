/**
 * Geometria da folha impressa. Modulo puro de proposito: a interface precisa
 * saber quantas folhas vao sair, e importar isso de `pdf.ts` arrastaria `node:fs`
 * para o bundle do navegador.
 *
 * Tudo em pontos PostScript, que e a unidade do PDF.
 *
 * Carta Pokemon: 63 x 88 mm, padrao desde 1996 (tolerancia +-0,5 mm).
 * As imagens tem 733x1024 px, o que da 295 DPI nesse tamanho e proporcao
 * 0,7158 contra 63/88 = 0,7159 — imprime sem distorcer.
 */
export const MM = 2.834645; // 1 mm em pontos (72 / 25.4)
export const A4 = { width: 210 * MM, height: 297 * MM }; // 595,28 x 841,89 pt
export const CARD = { width: 63 * MM, height: 88 * MM }; // 178,58 x 249,45 pt
export const GRID = { columns: 3, rows: 3 };
export const GUTTER = 2 * MM; // folga para a tesoura, sem alterar o tamanho da carta
export const PER_PAGE = GRID.columns * GRID.rows;

const CONTENT_W = GRID.columns * CARD.width + (GRID.columns - 1) * GUTTER;
const CONTENT_H = GRID.rows * CARD.height + (GRID.rows - 1) * GUTTER;

export const MARGIN_X = (A4.width - CONTENT_W) / 2; // 8,5 mm
export const MARGIN_Y = (A4.height - CONTENT_H) / 2; // 14,5 mm

export function sheetsNeeded(cardCount: number): number {
  return Math.ceil(cardCount / PER_PAGE);
}

/** Posicao da i-esima carta da folha, com o Y ja convertido para a origem do PDF. */
export function slotPosition(indexInSheet: number): { x: number; y: number } {
  const column = indexInSheet % GRID.columns;
  const row = Math.floor(indexInSheet / GRID.columns);
  return {
    x: MARGIN_X + column * (CARD.width + GUTTER),
    // PDF conta o Y de baixo para cima; a primeira linha fica no topo.
    y: A4.height - MARGIN_Y - (row + 1) * CARD.height - row * GUTTER,
  };
}
