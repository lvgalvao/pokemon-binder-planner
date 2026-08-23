import { describe, it, expect, beforeAll } from "vitest";
import { inflateSync } from "node:zlib";
import sharp from "sharp";
import { PDFDocument, PDFArray, PDFRawStream } from "pdf-lib";
import {
  buildCardsPdf as build,
  pdfFilename,
  sheetsNeeded,
  FOLHA,
  A4,
  CARD,
  MM,
} from "@/lib/pdf";
import { getManifest } from "@/lib/manifests";
import { sortCards } from "@/lib/cards";
import type { SlotItem } from "@/lib/types";

const cards = sortCards(getManifest("sv7")!.cards, "number");

/**
 * Em producao a arte vem do Storage por rede. Estes testes medem GEOMETRIA — a
 * carta tem de sair com 63 x 88 mm no papel, e isso independe de quais pixels
 * estao dentro do JPEG. Entao injetamos um JPEG sintetico e a suite fica
 * hermetica: sem rede, sem assets/ em disco, sem depender do upload.
 */
let jpegDeTeste: Uint8Array;

beforeAll(async () => {
  jpegDeTeste = new Uint8Array(
    await sharp({
      create: { width: 733, height: 1024, channels: 3, background: "#c0d0e0" },
    })
      .jpeg()
      .toBuffer(),
  );
});

/**
 * O `setId` acompanha cada carta na folha — ela pode misturar colecoes. Nos
 * testes de geometria ele e sempre o mesmo, entao o helper o cola aqui.
 */
const buildMissingPdf = (
  itens: readonly SlotItem[],
  setId = "sv7",
  escala: "real" | "reduzida" = "real",
) =>
  build(
    itens.map((i) => ({ ...i, setId })),
    { escala, buscarArte: async () => jpegDeTeste },
  );

/** Posicoes na versao simples — o caso comum dos testes de geometria. */
const itens = cards.map((card) => ({ card, variant: "normal" as const }));

/**
 * As posicoes reais das imagens vivem no content stream da pagina, como matrizes
 * `w 0 0 h x y cm`. E la que o tamanho fisico se confirma — o resto e promessa.
 * pdf-lib grava o stream com FlateDecode, entao inflamos antes de ler.
 */
type Placement = { w: number; h: number; x: number; y: number };

async function placements(bytes: Uint8Array, pageIndex = 0): Promise<Placement[]> {
  const pdf = await PDFDocument.load(bytes);
  const contents = pdf.getPage(pageIndex).node.Contents();
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((ref) => pdf.context.lookup(ref) as PDFRawStream)
      : [contents as unknown as PDFRawStream];

  const text = streams
    .map((s) => {
      const raw = Buffer.from(s.getContents());
      try {
        return inflateSync(raw).toString("latin1");
      } catch {
        return raw.toString("latin1");
      }
    })
    .join("\n");

  // pdf-lib emite um bloco `q ... Do ... Q` por imagem, e dentro dele a translacao
  // e a escala vem em matrizes separadas, intercaladas por matrizes identidade:
  //   q / 1 0 0 1 X Y cm / 1 0 0 1 0 0 cm / W 0 0 H 0 0 cm / ... /Img Do / Q
  // Por isso o parse e por bloco: pegar a identidade como escala daria 1x1.
  const out: Placement[] = [];

  for (const block of text.split(/\bq\b/)) {
    if (!/\bDo\b/.test(block)) continue;

    const translate = block.match(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm/);
    const scale = [...block.matchAll(/([\d.]+) 0 0 ([\d.]+) 0 0 cm/g)].find(
      (m) => Number(m[1]) !== 1 || Number(m[2]) !== 1,
    );
    if (!translate || !scale) continue;

    out.push({
      x: Number(translate[1]),
      y: Number(translate[2]),
      w: Number(scale[1]),
      h: Number(scale[2]),
    });
  }

  return out;
}

describe("constantes fisicas", () => {
  it("a carta tem 63 x 88 mm em pontos", () => {
    expect(CARD.width).toBeCloseTo(178.58, 1);
    expect(CARD.height).toBeCloseTo(249.45, 1);
    expect(CARD.width / MM).toBeCloseTo(63, 4);
    expect(CARD.height / MM).toBeCloseTo(88, 4);
  });

  it("a folha e A4", () => {
    expect(A4.width).toBeCloseTo(595.28, 1);
    expect(A4.height).toBeCloseTo(841.89, 1);
  });

  it("a grade 3x3 com folga cabe na folha", () => {
    expect(3 * 63 + 2 * 2).toBeLessThan(210); // 193 mm
    expect(3 * 88 + 2 * 2).toBeLessThan(297); // 268 mm
  });
});

describe("sheetsNeeded", () => {
  it("9 cartas cabem numa folha; 10 exigem duas", () => {
    expect(sheetsNeeded(9)).toBe(1);
    expect(sheetsNeeded(10)).toBe(2);
  });
  it("44 faltantes = 5 folhas", () => expect(sheetsNeeded(44)).toBe(5));

  it("na folha reduzida a mesma lista cabe em bem menos papel", () => {
    expect(sheetsNeeded(25, "reduzida")).toBe(1);
    expect(sheetsNeeded(26, "reduzida")).toBe(2);
    expect(sheetsNeeded(44, "reduzida")).toBe(2);
  });
});

/**
 * A folha reduzida existe para caber na mao, nao no bolso do fichario. O que ela
 * NAO pode fazer e distorcer a carta: se a proporcao escorregar, a arte deforma.
 */
describe("folha reduzida", () => {
  const folha = FOLHA.reduzida;

  it("poe 5 cartas por linha e 25 na folha", () => {
    expect(folha.grid.columns).toBe(5);
    expect(folha.grid.rows).toBe(5);
    expect(folha.perPage).toBe(25);
  });

  it("mantem a proporcao 63:88 da carta", () => {
    expect(folha.card.width / folha.card.height).toBeCloseTo(63 / 88, 6);
    expect(folha.fator).toBeCloseTo(folha.card.width / CARD.width, 6);
  });

  it("desenha as 25 cartas do mesmo tamanho, sem vazar da folha", async () => {
    const found = await placements(
      (await buildMissingPdf(itens.slice(0, 25), "sv7", "reduzida"))!,
    );
    expect(found).toHaveLength(25);
    for (const p of found) {
      expect(p.w).toBeCloseTo(folha.card.width, 2);
      expect(p.h).toBeCloseTo(folha.card.height, 2);
      expect(p.w / p.h).toBeCloseTo(63 / 88, 4);
      // A margem minima e o que garante que a impressora domestica alcance.
      expect(p.x / MM).toBeGreaterThanOrEqual(7.99);
      expect((A4.width - p.x - p.w) / MM).toBeGreaterThanOrEqual(7.99);
      expect(p.y / MM).toBeGreaterThanOrEqual(7.99);
      expect((A4.height - p.y - p.h) / MM).toBeGreaterThanOrEqual(7.99);
    }
    expect(new Set(found.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)).size).toBe(25);
  });

  it("quebra a folha na 26a carta", async () => {
    const bytes = (await buildMissingPdf(itens.slice(0, 26), "sv7", "reduzida"))!;
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it("nao mexe na folha real: la a carta continua com 63 x 88 mm", async () => {
    const found = await placements((await buildMissingPdf(itens.slice(0, 9)))!);
    for (const p of found) expect(p.w / MM).toBeCloseTo(63, 3);
  });
});

describe("buildMissingPdf", () => {
  it("colecao completa nao gera PDF em branco", async () => {
    expect(await buildMissingPdf([])).toBeNull();
  });

  it("gera A4 com a carta em tamanho fisico exato", async () => {
    const bytes = await buildMissingPdf(itens.slice(0, 9));
    const pdf = await PDFDocument.load(bytes!);
    expect(pdf.getPageCount()).toBe(1);

    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
  });

  it("coloca 9 imagens por folha e quebra a partir da decima", async () => {
    const bytes = await buildMissingPdf(itens.slice(0, 10));
    const pdf = await PDFDocument.load(bytes!);
    expect(pdf.getPageCount()).toBe(2);
  });

  it("desenha cada carta com 63 x 88 mm exatos no papel", async () => {
    const found = await placements((await buildMissingPdf(itens.slice(0, 9)))!);
    expect(found).toHaveLength(9);
    for (const p of found) {
      expect(p.w).toBeCloseTo(CARD.width, 2);
      expect(p.h).toBeCloseTo(CARD.height, 2);
      expect(p.w / MM).toBeCloseTo(63, 3);
      expect(p.h / MM).toBeCloseTo(88, 3);
    }
  });

  it("as 9 posicoes sao distintas e nenhuma vaza da folha", async () => {
    const found = await placements((await buildMissingPdf(itens.slice(0, 9)))!);
    for (const p of found) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(A4.width + 0.01);
      expect(p.y + p.h).toBeLessThanOrEqual(A4.height + 0.01);
    }
    expect(new Set(found.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)).size).toBe(9);
  });

  it("monta a grade 3x3 com folga de 2 mm entre as cartas", async () => {
    const found = await placements((await buildMissingPdf(itens.slice(0, 9)))!);
    const xs = [...new Set(found.map((p) => Number(p.x.toFixed(2))))].sort((a, b) => a - b);
    const ys = [...new Set(found.map((p) => Number(p.y.toFixed(2))))].sort((a, b) => a - b);
    expect(xs).toHaveLength(3);
    expect(ys).toHaveLength(3);
    expect(xs[1] - xs[0]).toBeCloseTo(CARD.width + 2 * MM, 1);
    expect(ys[1] - ys[0]).toBeCloseTo(CARD.height + 2 * MM, 1);
  });

  it("a primeira carta comeca na margem de 8,5 mm, a partir do topo", async () => {
    const found = await placements((await buildMissingPdf(itens.slice(0, 9)))!);
    const topLeft = found.reduce((a, b) => (b.y > a.y || (b.y === a.y && b.x < a.x) ? b : a));
    expect(topLeft.x / MM).toBeCloseTo(8.5, 1);
    expect((A4.height - topLeft.y - topLeft.h) / MM).toBeCloseTo(14.5, 1);
  });

  it("uma carta so fica na primeira posicao da grade, nao encostada no canto", async () => {
    const found = await placements((await buildMissingPdf(itens.slice(0, 1)))!);
    expect(found).toHaveLength(1);
    expect(found[0].x / MM).toBeCloseTo(8.5, 1);
  });
});

describe("pdfFilename", () => {
  const date = new Date("2026-08-08T12:00:00Z");

  it("gera um nome reconhecivel meses depois", () => {
    expect(pdfFilename("Stellar Crown", { date })).toBe(
      "faltantes-stellar-crown-2026-08-08.pdf",
    );
  });
  it("remove acentos e pontuacao", () => {
    expect(pdfFilename("Pokémon GO", { date })).toBe("faltantes-pokemon-go-2026-08-08.pdf");
  });
  it("diz na cara qual das quatro folhas e", () => {
    expect(pdfFilename("Stellar Crown", { date, escala: "reduzida" })).toBe(
      "faltantes-stellar-crown-menores-2026-08-08.pdf",
    );
    expect(pdfFilename("Stellar Crown", { date, lista: "estrelas" })).toBe(
      "quero-muito-stellar-crown-2026-08-08.pdf",
    );
  });
  it("sem colecao — a folha que mistura varias — nao inventa um nome de set", () => {
    expect(pdfFilename("", { date, lista: "estrelas", escala: "reduzida" })).toBe(
      "quero-muito-menores-2026-08-08.pdf",
    );
  });
});

describe("selo HOLO na folha", () => {
  /** Conta operadores de texto no content stream. */
  async function textos(bytes: Uint8Array): Promise<string[]> {
    const pdf = await PDFDocument.load(bytes);
    const contents = pdf.getPage(0).node.Contents();
    const streams =
      contents instanceof PDFArray
        ? contents.asArray().map((ref) => pdf.context.lookup(ref) as PDFRawStream)
        : [contents as unknown as PDFRawStream];
    const texto = streams
      .map((st) => {
        const raw = Buffer.from(st.getContents());
        try {
          return inflateSync(raw).toString("latin1");
        } catch {
          return raw.toString("latin1");
        }
      })
      .join("\n");
    // pdf-lib grava o texto em hexadecimal: `<484F4C4F> Tj` e "HOLO".
    return [...texto.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((m) =>
      (m[1].match(/../g) ?? []).map((par) => String.fromCharCode(parseInt(par, 16))).join(""),
    );
  }

  it("a versão simples sai sem selo", async () => {
    const bytes = (await buildMissingPdf(itens.slice(0, 3)))!;
    expect(await textos(bytes)).toEqual([]);
  });

  it("cada versão brilhante ganha um selo HOLO", async () => {
    const holos = cards.slice(0, 3).map((card) => ({ card, variant: "holo" as const }));
    expect(await textos((await buildMissingPdf(holos))!)).toEqual(["HOLO", "HOLO", "HOLO"]);
  });

  it("num par simples + brilhante, só a brilhante recebe o selo", async () => {
    const par = [
      { card: cards[0], variant: "normal" as const },
      { card: cards[0], variant: "holo" as const },
    ];
    const bytes = (await buildMissingPdf(par))!;
    expect(await textos(bytes)).toEqual(["HOLO"]);
    // a mesma arte aparece nos dois bolsos
    expect(await placements(bytes)).toHaveLength(2);
  });

  it("o selo não altera o tamanho físico da carta", async () => {
    const holos = cards.slice(0, 2).map((card) => ({ card, variant: "holo" as const }));
    for (const p of await placements((await buildMissingPdf(holos))!)) {
      expect(p.w / MM).toBeCloseTo(63, 3);
      expect(p.h / MM).toBeCloseTo(88, 3);
    }
  });
});
