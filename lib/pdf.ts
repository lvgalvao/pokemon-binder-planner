import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { printUrl } from "./assets";
import { A4, CARD, MM, PER_PAGE, slotPosition } from "./sheet";
import type { Card, SlotItem, Variant } from "./types";

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
  buscarArte: BuscarArte = baixarDoStorage,
): Promise<Uint8Array | null> {
  if (itens.length === 0) return null;

  const pdf = await PDFDocument.create();
  pdf.setTitle("Cartas faltantes");
  pdf.setCreator("Pokémon Binder Planner");
  const fonte = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Faltando a simples E a brilhante, a mesma arte sai duas vezes na folha — mas
  // e um download so, e um embed so.
  const distintas = [...new Map(itens.map((i) => [i.card.id, i.card])).values()];
  const bytesPorCarta = await baixarTudo(distintas, buscarArte);

  // Cache de embed: pdf-lib guarda o objeto ja dentro do documento.
  const embutidas = new Map<string, Awaited<ReturnType<typeof pdf.embedJpg>>>();

  for (let i = 0; i < itens.length; i += PER_PAGE) {
    const page = pdf.addPage([A4.width, A4.height]);
    const batch = itens.slice(i, i + PER_PAGE);

    for (let j = 0; j < batch.length; j++) {
      const { card, variant } = batch[j];
      let image = embutidas.get(card.id);
      if (!image) {
        image = await pdf.embedJpg(bytesPorCarta.get(card.id)!);
        embutidas.set(card.id, image);
      }

      const { x, y } = slotPosition(j);
      page.drawImage(image, { x, y, width: CARD.width, height: CARD.height });

      // A arte das versoes e identica; sem o selo, os recortes ficariam
      // indistinguiveis e a crianca nao saberia qual bolso preencher com qual.
      if (variant !== "normal") desenharSeloHolo(page, fonte, x, y, variant);
    }
  }

  return pdf.save();
}

/**
 * Quantos downloads simultaneos. As imagens vem do CDN do Supabase, nao mais do
 * disco: sv7 inteiro sao 175 arquivos, 18 MB. Sequencial — como era em disco
 * local, onde custava zero — viraria a soma dos RTTs.
 *
 * Medido nos 175 arquivos de sv7: 8 simultaneos levam 3,3 s, 16 levam 0,8 s, e
 * 32 nao melhoram mais (0,8 s). Dezesseis e onde a curva dobra, sem forcar o
 * CDN a mais conexoes do que ele agradece.
 */
const DOWNLOADS_SIMULTANEOS = 16;

/**
 * De onde sai o JPEG de uma carta. Injetavel para que os testes de geometria —
 * que so precisam de um JPEG qualquer para medir milimetros — nao dependam de
 * rede nem de assets/ em disco.
 */
export type BuscarArte = (card: Card) => Promise<Uint8Array>;

/** O caminho de producao: o derivado `print/` no CDN do Supabase. */
async function baixarDoStorage(card: Card): Promise<Uint8Array> {
  const res = await fetch(printUrl(card), { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`Nao consegui buscar a arte de ${card.id} (HTTP ${res.status})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Busca a arte de cada carta, com um teto de paralelismo.
 *
 * Uma falha aqui derruba o PDF inteiro de proposito: uma folha com um bolso
 * vazio no meio e pior que um erro claro — a crianca so descobriria depois de
 * recortar.
 */
async function baixarTudo(
  cards: readonly Card[],
  buscarArte: BuscarArte,
): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  let proximo = 0;

  async function trabalhador(): Promise<void> {
    while (proximo < cards.length) {
      const card = cards[proximo++];
      out.set(card.id, await buscarArte(card));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DOWNLOADS_SIMULTANEOS, cards.length) }, trabalhador),
  );
  return out;
}

/**
 * Selo no canto superior direito da carta. Sai junto no recorte, de proposito.
 *
 * Onde ha dois reverses (Ascended Heroes), o selo tem de dizer QUAL: tres
 * recortes da mesma arte chegam a tesoura, e "HOLO" em dois deles mandaria a
 * crianca decidir no chute qual bolso e de qual.
 */
function desenharSeloHolo(
  page: ReturnType<PDFDocument["addPage"]>,
  fonte: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  cardX: number,
  cardY: number,
  variant: Exclude<Variant, "normal">,
): void {
  const texto = variant === "pokebola" ? "POKEBOLA" : "HOLO";
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
