import { describe, it, expect } from "vitest";
import {
  binderCapacity,
  pagesNeeded,
  generateSlots,
  missingCards,
  progress,
  findCardPage,
} from "@/lib/binder";
import { cardNumber } from "@/lib/cards";
import {
  LAYOUTS,
  layoutKey,
  temReverseHolo,
  variantesDe,
  rotuloVariante,
  expandirVariantes,
  itemKey,
  parseItemKey,
  type Card,
} from "@/lib/types";
import { getManifest } from "@/lib/manifests";

const cards = (n: number): Card[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `x-${i + 1}`,
    name: `Carta ${i + 1}`,
    rarityRaw: "Common",
    bucket: "01_comum" as const,
    collectionNumber: i + 1,
    imagePath: `x/01_comum/x-${i + 1}.jpg`,
  }));

describe("binderCapacity", () => {
  it("4 x 3 x 20 = 240", () => expect(binderCapacity(4, 3, 20)).toBe(240));
  it("3 x 3 x 20 = 180", () => expect(binderCapacity(3, 3, 20)).toBe(180));
});

describe("pagesNeeded", () => {
  it("set mediano de 188 cartas ocupa 21 paginas em 3x3", () =>
    expect(pagesNeeded(188, 3, 3)).toBe(21));
  it("o maior set (me2pt5, 295) ocupa 33 paginas em 3x3 e 25 em 4x3", () => {
    expect(pagesNeeded(295, 3, 3)).toBe(33);
    expect(pagesNeeded(295, 4, 3)).toBe(25);
  });
  it("arredonda para cima, nunca descarta carta", () => expect(pagesNeeded(10, 3, 3)).toBe(2));
  it("colecao vazia nao gera pagina", () => expect(pagesNeeded(0, 3, 3)).toBe(0));
});

describe("generateSlots", () => {
  it("preenche sequencialmente: 1-9 na pagina 1, 10-18 na pagina 2", () => {
    const pages = generateSlots(cards(20), 3, 3);
    expect(pages[0].map((c) => c && cardNumber(c))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(pages[1].map((c) => c && cardNumber(c))).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it("4x3 poe 12 por pagina", () => {
    const pages = generateSlots(cards(24), 4, 3);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(12);
    expect(pages[0][11] && cardNumber(pages[0][11]!)).toBe(12);
  });

  it("a ultima pagina fica com bolsos vazios de verdade, sem preenchimento falso", () => {
    const pages = generateSlots(cards(20), 3, 3);
    expect(pages).toHaveLength(3);
    expect(pages[2].slice(0, 2).every((c) => c !== null)).toBe(true);
    expect(pages[2].slice(2)).toEqual([null, null, null, null, null, null, null]);
  });

  it("nao perde nenhuma carta", () => {
    const all = generateSlots(cards(295), 3, 3).flat().filter(Boolean);
    expect(all).toHaveLength(295);
  });
});

describe("missingCards", () => {
  it("001 ok, 002 ok, 003 falta, 004 ok, 005 falta -> [003, 005]", () => {
    const list = cards(5);
    const owned = new Set(["x-1", "x-2", "x-4"]);
    expect(missingCards(list, owned, (c) => c.id).map((c) => cardNumber(c))).toEqual([3, 5]);
  });

  it("preserva a ordem vigente do fichario", () => {
    const list = [...cards(5)].reverse();
    expect(
      missingCards(list, new Set<string>(), (c) => c.id).map((c) => cardNumber(c)),
    ).toEqual([5, 4, 3, 2, 1]);
  });

  it("colecao completa devolve lista vazia", () => {
    const list = cards(3);
    expect(missingCards(list, new Set(list.map((c) => c.id)), (c) => c.id)).toEqual([]);
  });
});

describe("progress", () => {
  it("156 de 200 = 78%", () => {
    expect(progress(200, 156)).toEqual({ total: 200, owned: 156, missing: 44, percent: 78 });
  });
  it("colecao vazia nao divide por zero", () => expect(progress(0, 0).percent).toBe(0));
  it("completa da 100%", () => expect(progress(175, 175).percent).toBe(100));
});

describe("findCardPage", () => {
  const list = cards(188);

  it("acha a carta 117 na pagina certa em 3x3", () => {
    const itens = list.map((card) => ({ card, variant: "normal" as const }));
    const hit = findCardPage(itens, 117, 3, 3);
    expect(hit).not.toBeNull();
    expect(hit!.page).toBe(12); // indice 116 / 9
    expect(hit!.slot).toBe(8);
    expect(cardNumber(hit!.item.card)).toBe(117);
  });

  it("a mesma carta cai noutra pagina em 4x3", () => {
    const itens = list.map((card) => ({ card, variant: "normal" as const }));
    expect(findCardPage(itens, 117, 4, 3)!.page).toBe(9); // 116 / 12
  });

  it("numero inexistente devolve null em vez de explodir", () => {
    const itens = list.map((card) => ({ card, variant: "normal" as const }));
    expect(findCardPage(itens, 9999, 3, 3)).toBeNull();
  });
});

describe("formatos de fichario", () => {
  it("sao declarados como colunas x linhas, na convencao da embalagem", () => {
    // Regressao: a primeira versao rotulava "4x3" mas renderizava 3 colunas
    // por 4 linhas — vertical e horizontal invertidos.
    expect(LAYOUTS["4x3"]).toEqual({ columns: 4, rows: 3 });
    expect(LAYOUTS["2x2"]).toEqual({ columns: 2, rows: 2 });
    expect(LAYOUTS["3x3"]).toEqual({ columns: 3, rows: 3 });
    expect(LAYOUTS["4x4"]).toEqual({ columns: 4, rows: 4 });
  });

  it("a chave sempre poe as colunas primeiro", () => {
    expect(layoutKey(4, 3)).toBe("4x3");
    expect(layoutKey(3, 4)).toBe("3x4"); // combinacao que nao e oferecida
  });

  it("cada formato rende a quantidade de bolsos da folha fisica", () => {
    const bolsos = (k: string) => LAYOUTS[k].columns * LAYOUTS[k].rows;
    expect(bolsos("2x2")).toBe(4);
    expect(bolsos("3x3")).toBe(9);
    expect(bolsos("4x3")).toBe(12);
    expect(bolsos("4x4")).toBe(16);
  });

  it("generateSlots respeita a orientacao: 4x3 poe 4 cartas na primeira linha", () => {
    const { columns, rows } = LAYOUTS["4x3"];
    const pages = generateSlots(cards(24), rows, columns);
    expect(pages[0]).toHaveLength(12);
    // os 4 primeiros bolsos sao a linha de cima, entao vao de 1 a 4
    expect(pages[0].slice(0, 4).map((c) => c && cardNumber(c))).toEqual([1, 2, 3, 4]);
    expect(pages[1][0] && cardNumber(pages[1][0]!)).toBe(13);
  });

  it("2x2 quebra a cada 4 cartas e 4x4 a cada 16", () => {
    expect(generateSlots(cards(10), 2, 2)).toHaveLength(3);
    expect(generateSlots(cards(33), 4, 4)).toHaveLength(3);
  });

  it("paginas necessarias por formato para um set de 175 cartas", () => {
    expect(pagesNeeded(175, 2, 2)).toBe(44);
    expect(pagesNeeded(175, 3, 3)).toBe(20);
    expect(pagesNeeded(175, 3, 4)).toBe(15); // 4x3 = 12 bolsos
    expect(pagesNeeded(175, 4, 4)).toBe(11);
  });
});

describe("versões simples e brilhante", () => {
  const comum = (id: string, bucket: Card["bucket"] = "01_comum"): Card => ({
    id,
    name: id,
    rarityRaw: "Common",
    bucket,
    collectionNumber: Number(id.split("-")[1]),
    imagePath: `x/${bucket}/${id}.jpg`,
  });

  it("comum, incomum e rara ganham par nos sets modernos", () => {
    for (const b of ["01_comum", "02_incomum", "03_raras"] as const) {
      expect(temReverseHolo("sv7", comum("sv7-1", b)), b).toBe(true);
    }
  });

  it("as raridades acima da rara não têm reverse", () => {
    for (const b of [
      "04_duplo_raras",
      "05_arte_secreta",
      "06_duplo_arte_secreta",
      "07_legendaria",
    ] as const) {
      expect(temReverseHolo("sv7", comum("sv7-1", b)), b).toBe(false);
    }
  });

  it("Base Set, Jungle e Fossil (1999) não têm reverse holo", () => {
    // Reverse holo só aparece por volta de 2002; criar o par nesses sets geraria
    // bolsos impossíveis de preencher.
    for (const set of ["base1", "base2", "base3"]) {
      expect(temReverseHolo(set, comum(`${set}-1`)), set).toBe(false);
    }
    expect(temReverseHolo("pgo", comum("pgo-1"))).toBe(true);
  });

  it("a brilhante fica no bolso ao lado da simples", () => {
    const itens = expandirVariantes([comum("sv7-1"), comum("sv7-2")], "sv7");
    expect(itens.map((i) => `${i.card.id}:${i.variant}`)).toEqual([
      "sv7-1:normal",
      "sv7-1:holo",
      "sv7-2:normal",
      "sv7-2:holo",
    ]);
  });

  it("carta sem reverse ocupa um bolso só", () => {
    const itens = expandirVariantes([comum("sv7-1", "07_legendaria")], "sv7");
    expect(itens).toHaveLength(1);
    expect(itens[0].variant).toBe("normal");
  });

  it("a chave da versão normal é o próprio id — dados antigos seguem válidos", () => {
    expect(itemKey("sv7-2", "normal")).toBe("sv7-2");
    expect(itemKey("sv7-2", "holo")).toBe("sv7-2#holo");
    expect(parseItemKey("sv7-2")).toEqual({ cardId: "sv7-2", variant: "normal" });
    expect(parseItemKey("sv7-2#holo")).toEqual({ cardId: "sv7-2", variant: "holo" });
  });

  it("dados reais: sv7 vai de 175 cartas para 300 bolsos", () => {
    const m = getManifest("sv7")!;
    expect(expandirVariantes(m.cards, "sv7")).toHaveLength(300);
    // base1 não ganha nenhum bolso extra
    const b = getManifest("base1")!;
    expect(expandirVariantes(b.cards, "base1")).toHaveLength(b.cards.length);
  });

  it("Ascended Heroes tem os dois reverses: energia e pokébola", () => {
    for (const b of ["01_comum", "02_incomum", "03_raras"] as const) {
      expect(variantesDe("me2pt5", comum("me2pt5-1", b)), b).toEqual([
        "normal",
        "holo",
        "pokebola",
      ]);
    }
    // A pokébola não vaza para as raridades sem reverse...
    expect(variantesDe("me2pt5", comum("me2pt5-1", "07_legendaria"))).toEqual(["normal"]);
    // ...nem para as outras coleções.
    expect(variantesDe("sv7", comum("sv7-1"))).toEqual(["normal", "holo"]);
  });

  it("os três bolsos de Ascended Heroes ficam lado a lado", () => {
    const itens = expandirVariantes([comum("me2pt5-1"), comum("me2pt5-2")], "me2pt5");
    expect(itens.map((i) => `${i.card.id}:${i.variant}`)).toEqual([
      "me2pt5-1:normal",
      "me2pt5-1:holo",
      "me2pt5-1:pokebola",
      "me2pt5-2:normal",
      "me2pt5-2:holo",
      "me2pt5-2:pokebola",
    ]);
  });

  it("a chave da pokébola não colide com a do holo", () => {
    expect(itemKey("me2pt5-4", "pokebola")).toBe("me2pt5-4#pokebola");
    expect(parseItemKey("me2pt5-4#pokebola")).toEqual({
      cardId: "me2pt5-4",
      variant: "pokebola",
    });
    // O que já estava gravado continua sendo o reverse de energia.
    expect(parseItemKey("me2pt5-4#holo")).toEqual({
      cardId: "me2pt5-4",
      variant: "holo",
    });
  });

  it("o selo nomeia o padrão só onde há dois — nas outras coleções segue HOLO", () => {
    // Ascended Heroes: Energy Symbol Pattern e Poké Ball's Pattern. "HOLO" ali
    // não responderia a única pergunta que importa ao encaixar: qual dos dois.
    expect(rotuloVariante("me2pt5", "holo")).toBe("ENERGIA");
    expect(rotuloVariante("me2pt5", "pokebola")).toBe("POKÉBOLA");
    // Onde há um reverse só, "HOLO" basta e é como a criança já o chama.
    expect(rotuloVariante("sv7", "holo")).toBe("HOLO");
    // A versão simples não leva selo nenhum.
    expect(rotuloVariante("me2pt5", "normal")).toBeNull();
    expect(rotuloVariante("sv7", "normal")).toBeNull();
  });

  it("dados reais: Ascended Heroes vai de 295 cartas para 651 bolsos", () => {
    const m = getManifest("me2pt5")!;
    // 295 cartas + 178 com reverse × 2 versões brilhantes.
    expect(expandirVariantes(m.cards, "me2pt5")).toHaveLength(651);
  });
});
