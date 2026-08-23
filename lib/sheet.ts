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
export const GUTTER = 2 * MM; // folga para a tesoura, sem alterar o tamanho da carta

/**
 * As duas folhas.
 *
 *   real      63 x 88 mm, 3x3. E a folha que serve ao proposito do app: recorta
 *             e encaixa no bolso do fichario.
 *   reduzida  a mesma carta em escala menor, 5 por linha. Nao encaixa em bolso
 *             nenhum — serve para levar a lista na mao sem gastar 6 folhas.
 *
 * A escala da reduzida nao e um numero escolhido: e o que faz 5 colunas caberem
 * na largura do A4 com a margem minima. A proporcao 63:88 nunca muda, entao a
 * carta continua sendo a carta, so menor.
 */
export type Escala = "real" | "reduzida";

export type Folha = {
  escala: Escala;
  /** Quanto a carta encolheu. 1 na folha real. */
  fator: number;
  card: { width: number; height: number };
  grid: { columns: number; rows: number };
  perPage: number;
  marginX: number;
  marginY: number;
};

/**
 * Margem que qualquer impressora domestica alcanca. Nao e enfeite: e o teto de
 * quanto a folha reduzida pode encolher a carta — quem manda no fator e ela.
 */
const MARGEM_MINIMA = 8 * MM;

/** Quantas linhas dessa altura cabem na folha sem invadir a margem minima. */
function linhasQueCabem(alturaDaCarta: number): number {
  const util = A4.height - 2 * MARGEM_MINIMA + GUTTER;
  return Math.floor(util / (alturaDaCarta + GUTTER));
}

function montar(escala: Escala, columns: number, fator: number): Folha {
  const card = { width: CARD.width * fator, height: CARD.height * fator };
  const rows = linhasQueCabem(card.height);
  const larguraDoBloco = columns * card.width + (columns - 1) * GUTTER;
  const alturaDoBloco = rows * card.height + (rows - 1) * GUTTER;

  return {
    escala,
    fator,
    card,
    grid: { columns, rows },
    perPage: columns * rows,
    // Centralizado: a margem sobrante se divide igual dos dois lados.
    marginX: (A4.width - larguraDoBloco) / 2,
    marginY: (A4.height - alturaDoBloco) / 2,
  };
}

/** O fator que faz `columns` cartas caberem na largura do A4. */
function fatorPara(columns: number): number {
  const util = A4.width - 2 * MARGEM_MINIMA - (columns - 1) * GUTTER;
  return util / (columns * CARD.width);
}

const COLUNAS_REDUZIDA = 5;

export const FOLHA: Record<Escala, Folha> = {
  // 3x3, fator 1: margens de 8,5 x 14,5 mm, exatamente como sempre foi.
  real: montar("real", 3, 1),
  // 5x5 a ~59%: carta de 37,2 x 52,0 mm, 25 por folha.
  reduzida: montar("reduzida", COLUNAS_REDUZIDA, fatorPara(COLUNAS_REDUZIDA)),
};

export const GRID = FOLHA.real.grid;
export const PER_PAGE = FOLHA.real.perPage;
export const MARGIN_X = FOLHA.real.marginX;
export const MARGIN_Y = FOLHA.real.marginY;

export function sheetsNeeded(cardCount: number, escala: Escala = "real"): number {
  return Math.ceil(cardCount / FOLHA[escala].perPage);
}

/** Posicao da i-esima carta da folha, com o Y ja convertido para a origem do PDF. */
export function slotPosition(
  indexInSheet: number,
  folha: Folha = FOLHA.real,
): { x: number; y: number } {
  const column = indexInSheet % folha.grid.columns;
  const row = Math.floor(indexInSheet / folha.grid.columns);
  return {
    x: folha.marginX + column * (folha.card.width + GUTTER),
    // PDF conta o Y de baixo para cima; a primeira linha fica no topo.
    y: A4.height - folha.marginY - (row + 1) * folha.card.height - row * GUTTER,
  };
}
