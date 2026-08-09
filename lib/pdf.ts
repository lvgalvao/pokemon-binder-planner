import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ASSETS_DIR } from "./manifests";
import { A4, CARD, MM, PER_PAGE, slotPosition } from "./sheet";
import type { SlotItem } from "./types";

export { MM, A4, CARD, GRID, GUTTER, PER_PAGE, sheetsNeeded } from "./sheet";

/**
 * Gera o PDF das cartas faltantes em tamanho real, 9 por folha A4.
 *
 * As posicoes vao em coordenadas absolutas de proposito: imprimir uma pagina HTML
 * pelo navegador passa por "ajustar a pagina" e a carta sai fora de escala. Aqui o
 * tamanho fisico e propriedade do arquivo, nao do dialogo de impressao.
 *
 * Retorna `null` para lista vazia — colecao completa nao gera folha em branco;
 * quem chama transforma isso no momento de comemoracao.
 */
export async function buildMissingPdf(
  itens: readonly SlotItem[],
): Promise<Uint8Array | null> {
  if (itens.length === 0) return null;

  const pdf = await PDFDocument.create();
  pdf.setTitle("Cartas faltantes");
  pdf.setCreator("Pokémon Binder Planner");
  const fonte = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Cache: faltando as duas versoes, a mesma arte e embutida uma vez so.
  const embutidas = new Map<string, Awaited<ReturnType<typeof pdf.embedJpg>>>();

  for (let i = 0; i < itens.length; i += PER_PAGE) {
    const page = pdf.addPage([A4.width, A4.height]);
    const batch = itens.slice(i, i + PER_PAGE);

    for (let j = 0; j < batch.length; j++) {
      const { card, variant } = batch[j];
      let image = embutidas.get(card.imagePath);
      if (!image) {
        const bytes = await readFile(path.join(ASSETS_DIR, card.imagePath));
        image = await pdf.embedJpg(bytes);
        embutidas.set(card.imagePath, image);
      }

      const { x, y } = slotPosition(j);
      page.drawImage(image, { x, y, width: CARD.width, height: CARD.height });

      // A arte das duas versoes e identica; sem o selo, os dois recortes ficariam
      // indistinguiveis e a crianca nao saberia qual bolso preencher com qual.
      if (variant === "holo") desenharSeloHolo(page, fonte, x, y);
    }
  }

  return pdf.save();
}

/** Selo no canto superior direito da carta. Sai junto no recorte, de proposito. */
function desenharSeloHolo(
  page: ReturnType<PDFDocument["addPage"]>,
  fonte: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  cardX: number,
  cardY: number,
): void {
  const texto = "HOLO";
  const corpo = 6.5;
  const larguraTexto = fonte.widthOfTextAtSize(texto, corpo);
  const padX = 3;
  const padY = 2.5;
  const largura = larguraTexto + padX * 2;
  const altura = corpo + padY * 2;
  const recuo = 1.4 * MM;

  const x = cardX + CARD.width - largura - recuo;
  const y = cardY + CARD.height - altura - recuo;

  page.drawRectangle({
    x,
    y,
    width: largura,
    height: altura,
    color: rgb(1, 1, 1),
    opacity: 0.9,
    borderColor: rgb(0.25, 0.3, 0.42),
    borderWidth: 0.6,
  });
  page.drawText(texto, {
    x: x + padX,
    y: y + padY + 0.6,
    size: corpo,
    font: fonte,
    color: rgb(0.13, 0.16, 0.22),
  });
}

/** Nome que ainda faz sentido seis meses depois, na pasta de Downloads. */
export function pdfFilename(setName: string, date = new Date()): string {
  const slug = setName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const stamp = date.toISOString().slice(0, 10);
  return `faltantes-${slug}-${stamp}.pdf`;
}
