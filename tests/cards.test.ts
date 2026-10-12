import { describe, it, expect } from "vitest";
import { cardNumber, sortCards, formatCardNumber, rotuloNumero } from "@/lib/cards";
import { getManifest, listSets } from "@/lib/manifests";
import { BUCKETS, type Bucket, type Card } from "@/lib/types";

function card(id: string, bucket: Bucket = "01_comum", collectionNumber = -1): Card {
  const n = collectionNumber >= 0 ? collectionNumber : Number(id.split("-")[1]);
  return {
    id,
    name: id,
    rarityRaw: "Common",
    bucket,
    collectionNumber: n,
    imagePath: `x/${bucket}/${id}.jpg`,
  };
}

describe("cardNumber", () => {
  it("le o numero do sufixo do id", () => {
    expect(cardNumber(card("sv7-2"))).toBe(2);
    expect(cardNumber(card("sv7-175"))).toBe(175);
  });

  it("ignora o collectionNumber do manifest quando eles divergem", () => {
    // Exatamente o caso do zsv10pt5-80, que vem com collectionNumber 60.
    expect(cardNumber({ id: "zsv10pt5-80", collectionNumber: 60 })).toBe(80);
  });
});

describe("sortCards por numero", () => {
  it("ordena numericamente, nao alfabeticamente", () => {
    const input = ["x-1", "x-10", "x-2", "x-20", "x-3"].map((id) => card(id));
    expect(sortCards(input, "number").map((c) => cardNumber(c))).toEqual([1, 2, 3, 10, 20]);
  });

  it("nao muta a entrada", () => {
    const input = [card("x-3"), card("x-1")];
    sortCards(input, "number");
    expect(input.map((c) => c.id)).toEqual(["x-3", "x-1"]);
  });
});

describe("sortCards por raridade", () => {
  it("agrupa comum -> lendaria e ordena por numero dentro do grupo", () => {
    const input = [
      card("x-9", "07_legendaria"),
      card("x-2", "01_comum"),
      card("x-5", "03_raras"),
      card("x-1", "01_comum"),
    ];
    const out = sortCards(input, "rarity");
    expect(out.map((c) => c.id)).toEqual(["x-1", "x-2", "x-5", "x-9"]);
    expect(out.map((c) => c.bucket)).toEqual([
      "01_comum",
      "01_comum",
      "03_raras",
      "07_legendaria",
    ]);
  });

  it("cobre os 7 buckets na ordem declarada", () => {
    const input = BUCKETS.map((b, i) => card(`x-${BUCKETS.length - i}`, b));
    expect(sortCards(input, "rarity").map((c) => c.bucket)).toEqual([...BUCKETS]);
  });
});

describe("regressao zsv10pt5 (dados reais)", () => {
  const m = getManifest("zsv10pt5");

  it("o manifest realmente tem a colisao de collectionNumber que motivou a regra", () => {
    expect(m).not.toBeNull();
    const colliding = m!.cards.filter((c) => c.collectionNumber === 60);
    expect(colliding.map((c) => c.id).sort()).toEqual(["zsv10pt5-60", "zsv10pt5-80"]);
  });

  it("ordenar pelo sufixo do id da 172 posicoes unicas, sem colisao", () => {
    const numbers = m!.cards.map(cardNumber);
    expect(new Set(numbers).size).toBe(m!.cards.length);
    expect(new Set(numbers).size).toBe(172);
  });

  it("a carta 80 existe na sequencia (por collectionNumber ela sumiria)", () => {
    expect(m!.cards.map(cardNumber)).toContain(80);
    expect(m!.cards.map((c) => c.collectionNumber)).not.toContain(80);
  });
});

describe("formatCardNumber", () => {
  it("preenche com zeros conforme o tamanho da colecao", () => {
    expect(formatCardNumber(card("x-7"), 175)).toBe("007");
    expect(formatCardNumber(card("x-117"), 175)).toBe("117");
    expect(formatCardNumber(card("x-7"), 62)).toBe("07");
  });
});

describe("numeracao que nao e so numero (colecoes antigas)", () => {
  const sub = (id: string, subset: string, bucket: Bucket = "01_comum"): Card => ({
    ...card(id, bucket, 1),
    subset,
  });

  it("a subcolecao vem depois do set principal, mesmo recomecando do 01", () => {
    // Trainer Gallery: TG01 nao pode cair entre a carta 1 e a carta 2.
    const input = [sub("swsh9tg-TG02", "swsh9tg"), card("swsh9-2"), sub("swsh9tg-TG01", "swsh9tg"), card("swsh9-1")];
    expect(sortCards(input, "number").map((c) => c.id)).toEqual([
      "swsh9-1",
      "swsh9-2",
      "swsh9tg-TG01",
      "swsh9tg-TG02",
    ]);
  });

  it("numero com letra na frente vem depois dos numerados (as H de Aquapolis)", () => {
    const input = [card("ecard2-H2", "03_raras", 2), card("ecard2-147", "03_raras"), card("ecard2-H1", "03_raras", 1)];
    expect(sortCards(input, "rarity").map((c) => c.id)).toEqual([
      "ecard2-147",
      "ecard2-H1",
      "ecard2-H2",
    ]);
  });

  it("a letra depois do numero desempata sem tirar a carta do lugar", () => {
    const input = [card("sm10-183", "01_comum"), card("sm10-182b", "01_comum", 182), card("sm10-182a", "01_comum", 182), card("sm10-182", "01_comum")];
    expect(sortCards(input, "number").map((c) => c.id)).toEqual([
      "sm10-182",
      "sm10-182a",
      "sm10-182b",
      "sm10-183",
    ]);
  });

  it("o selo mostra o que esta impresso na carta", () => {
    expect(rotuloNumero(card("sv7-7"), 3)).toBe("007");
    expect(rotuloNumero(card("swsh9tg-TG01", "01_comum", 1), 3)).toBe("TG01");
    expect(rotuloNumero(card("ecard2-H12", "01_comum", 12), 3)).toBe("H12");
    expect(rotuloNumero(card("sm10-182a", "01_comum", 182), 3)).toBe("182A");
    // O `_A` do Classic Collection e marca da fonte, nao da carta.
    expect(rotuloNumero(card("cel25c-15_A1", "01_comum", 15), 2)).toBe("15");
  });

  it("dados reais: em toda colecao, nenhuma subcolecao aparece antes do fim do set principal", () => {
    for (const s of listSets()) {
      const ordem = sortCards(getManifest(s.setId)!.cards, "number");
      const primeiraSub = ordem.findIndex((c) => c.subset);
      if (primeiraSub === -1) continue;
      expect(ordem.slice(primeiraSub).every((c) => c.subset), s.setId).toBe(true);
    }
  });
});
