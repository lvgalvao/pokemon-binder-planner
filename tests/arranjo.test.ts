import { describe, it, expect } from "vitest";
import {
  congelar,
  serializar,
  resolver,
  tocar,
  tirar,
  puxar,
  chaveDe,
  VAZIO,
  type Arranjo,
} from "@/lib/arranjo";
import type { Bucket, Card, Posicao, Variant } from "@/lib/types";

/**
 * Um universo de mentira, para os testes nao dependerem de assets/ sincronizados.
 * Ids no formato real (`<setId>-<n>`), porque e dele que sai o numero da carta.
 */
const carta = (setId: string, n: number, bucket: Bucket = "01_comum"): Card => ({
  id: `${setId}-${n}`,
  name: `Carta ${n}`,
  rarityRaw: "Common",
  bucket,
  collectionNumber: n,
  imagePath: `${setId}/${bucket}/${setId}-${n}.jpg`,
});

const pos = (setId: string, n: number, variant: Variant = "normal"): Posicao => ({
  card: carta(setId, n),
  variant,
  setId,
  setName: setId.toUpperCase(),
});

/** Um universo: n cartas de uma colecao, todas na versao simples. */
const universo = (setId: string, n: number): Posicao[] =>
  Array.from({ length: n }, (_, i) => pos(setId, i + 1));

/** O `buscar` de `resolver`, montado a partir de um universo conhecido. */
const buscadorDe = (...listas: Posicao[][]) => {
  const mapa = new Map(listas.flat().map((p) => [chaveDe(p), p]));
  return (key: string) => mapa.get(key) ?? null;
};

const chaves = (r: { bolsos: (Posicao | null)[] }) =>
  r.bolsos.map((p) => (p ? chaveDe(p) : null));

/**
 * As transicoes sao genericas: o banco guarda chaves e a tela mexe em cartas,
 * com a mesma implementacao. Aqui os "itens" ja sao as proprias chaves, entao a
 * funcao de chave e a identidade.
 */
const id = (k: string) => k;

describe("congelar", () => {
  it("achata as paginas na ordem em que estao no fichario", () => {
    const u = universo("sv7", 4);
    const paginas = [
      [u[0], u[1]],
      [u[2], u[3]],
    ];
    expect(congelar(paginas).bolsos).toEqual(["sv7-1", "sv7-2", "sv7-3", "sv7-4"]);
  });

  it("guarda os bolsos vazios da fronteira entre colecoes — eles sao o arranjo como ele esta", () => {
    const a = universo("sv7", 1);
    const b = universo("me5", 1);
    // Uma folha 2x2 por colecao: a primeira sobra 3 bolsos antes de a outra comecar.
    const paginas = [
      [a[0], null, null, null],
      [b[0], null, null, null],
    ];
    expect(congelar(paginas).bolsos).toEqual([
      "sv7-1",
      null,
      null,
      null,
      "me5-1",
    ]);
  });

  it("apara os nulos do fim: a ultima pagina incompleta nao vira bolso deliberado", () => {
    const u = universo("sv7", 2);
    expect(congelar([[u[0], u[1], null, null]]).bolsos).toEqual(["sv7-1", "sv7-2"]);
  });

  it("um fichario inteiro de nulos congela num arranjo vazio", () =>
    expect(congelar([[null, null], [null]])).toEqual(VAZIO));

  it("nasce sem nada em fora e sem nada na mao", () => {
    const c = congelar([universo("sv7", 2)]);
    expect(c.fora).toEqual([]);
    expect(c.mao).toBeNull();
  });
});

describe("resolver", () => {
  it("devolve cada bolso com a carta da chave gravada, na ordem gravada", () => {
    const u = universo("sv7", 3);
    const r = resolver(
      { bolsos: ["sv7-3", null, "sv7-1", "sv7-2"], fora: [], mao: null },
      u,
      buscadorDe(u),
    );
    expect(chaves(r)).toEqual(["sv7-3", null, "sv7-1", "sv7-2"]);
    expect(r.relatorio).toEqual({ acrescentadas: 0, esvaziadas: 0 });
  });

  it("chave que sumiu do manifest esvazia o bolso e nao desloca os seguintes", () => {
    const u = universo("sv7", 2);
    const r = resolver(
      { bolsos: ["sv7-1", "sv7-999", "sv7-2"], fora: [], mao: null },
      u,
      buscadorDe(u),
    );
    expect(chaves(r)).toEqual(["sv7-1", null, "sv7-2"]);
    expect(r.relatorio.esvaziadas).toBe(1);
  });

  it("chave com variante que a colecao nao tem esvazia o bolso", () => {
    // Universo de uma carta so, na versao simples: "#holo" nao resolve, e nao ha
    // cauda para confundir o que este teste esta provando.
    const u = universo("sv7", 1);
    const r = resolver(
      { bolsos: ["sv7-1", "sv7-1#holo"], fora: [], mao: null },
      u,
      buscadorDe(u),
    );
    expect(chaves(r)).toEqual(["sv7-1", null]);
  });

  it("chave repetida em dois bolsos fica no primeiro e esvazia o segundo", () => {
    const u = universo("sv7", 2);
    const r = resolver(
      { bolsos: ["sv7-1", "sv7-2", "sv7-1"], fora: [], mao: null },
      u,
      buscadorDe(u),
    );
    expect(chaves(r)).toEqual(["sv7-1", "sv7-2", null]);
  });

  it("carta da colecao que nao esta em bolsos nem em fora entra no fim", () => {
    const u = universo("sv7", 3);
    const r = resolver({ bolsos: ["sv7-2"], fora: [], mao: null }, u, buscadorDe(u));
    expect(chaves(r)).toEqual(["sv7-2", "sv7-1", "sv7-3"]);
    expect(r.relatorio.acrescentadas).toBe(2);
  });

  it("as cartas repovoadas entram no fim na ordem do universo, nunca embaralhadas", () => {
    const u = universo("mep", 5);
    const r = resolver({ bolsos: ["mep-3"], fora: [], mao: null }, u, buscadorDe(u));
    expect(chaves(r)).toEqual(["mep-3", "mep-1", "mep-2", "mep-4", "mep-5"]);
  });

  it("carta tirada de proposito nao volta ao fim", () => {
    const u = universo("sv7", 3);
    const r = resolver(
      { bolsos: ["sv7-1", "sv7-3"], fora: ["sv7-2"], mao: null },
      u,
      buscadorDe(u),
    );
    expect(chaves(r)).toEqual(["sv7-1", "sv7-3"]);
    expect(r.fora.map(chaveDe)).toEqual(["sv7-2"]);
  });

  it("carta na mao nao entra no fim: ela esta segurada, nao perdida", () => {
    const u = universo("sv7", 3);
    const r = resolver(
      { bolsos: ["sv7-1", null, "sv7-3"], fora: [], mao: "sv7-2" },
      u,
      buscadorDe(u),
    );
    expect(chaves(r)).toEqual(["sv7-1", null, "sv7-3"]);
    expect(r.mao && chaveDe(r.mao)).toBe("sv7-2");
  });

  it("carta de colecao estranha ao fichario fica no bolso e nao e reposta ao sair", () => {
    const u = universo("sv7", 2);
    const estranha = universo("base1", 1);
    const comEla = resolver(
      { bolsos: ["sv7-1", "base1-1", "sv7-2"], fora: [], mao: null },
      u,
      buscadorDe(u, estranha),
    );
    expect(chaves(comEla)).toEqual(["sv7-1", "base1-1", "sv7-2"]);
    // A `Posicao` dela carrega o setId de origem — e ele que decide o selo da
    // variante e contra qual manifest a marcacao e validada.
    expect(comEla.bolsos[1]?.setId).toBe("base1");

    const semEla = resolver(
      { bolsos: ["sv7-1", "sv7-2"], fora: [], mao: null },
      u,
      buscadorDe(u, estranha),
    );
    expect(chaves(semEla)).toEqual(["sv7-1", "sv7-2"]);
  });

  it("fora so vale para as colecoes do fichario: chave estranha e esquecida", () => {
    const u = universo("sv7", 1);
    const estranha = universo("base1", 1);
    const r = resolver(
      { bolsos: ["sv7-1"], fora: ["base1-1"], mao: null },
      u,
      buscadorDe(u, estranha),
    );
    expect(r.fora).toEqual([]);
    expect(r.arranjo.fora).toEqual([]);
  });

  it("resolver o resultado de resolver da exatamente o mesmo arranjo", () => {
    const u = universo("sv7", 5);
    const buscar = buscadorDe(u);
    const gravado: Arranjo = {
      bolsos: ["sv7-4", null, "sv7-999", "sv7-4"],
      fora: ["sv7-1"],
      mao: "sv7-2",
    };
    const uma = resolver(gravado, u, buscar);
    const duas = resolver(uma.arranjo, u, buscar);
    expect(duas.arranjo).toEqual(uma.arranjo);
    expect(duas.relatorio).toEqual({ acrescentadas: 0, esvaziadas: 0 });
  });

  it("arranjo vazio devolve o fichario automatico inteiro, na ordem do universo", () => {
    const u = universo("sv7", 4);
    const r = resolver(VAZIO, u, buscadorDe(u));
    expect(chaves(r)).toEqual(["sv7-1", "sv7-2", "sv7-3", "sv7-4"]);
    expect(r.relatorio.acrescentadas).toBe(4);
  });

  it("relata quantos bolsos esvaziaram e quantas cartas entraram no fim", () => {
    const u = universo("sv7", 4);
    const r = resolver(
      { bolsos: ["sv7-1", "sv7-98", "sv7-99"], fora: [], mao: null },
      u,
      buscadorDe(u),
    );
    expect(r.relatorio).toEqual({ acrescentadas: 3, esvaziadas: 2 });
  });
});

describe("tocar", () => {
  const u = universo("sv7", 3);
  const base: Arranjo = { bolsos: ["sv7-1", "sv7-2", null], fora: [], mao: null };

  it("mao vazia em bolso cheio: pega a carta e deixa o bolso vazio", () => {
    const r = tocar(base, 0);
    expect(r.mao).toBe("sv7-1");
    expect(r.bolsos).toEqual([null, "sv7-2", null]);
  });

  it("mao cheia em bolso vazio: coloca a carta e esvazia a mao", () => {
    const r = tocar(tocar(base, 0), 2);
    expect(r.mao).toBeNull();
    expect(r.bolsos).toEqual([null, "sv7-2", "sv7-1"]);
  });

  it("mao cheia em bolso cheio: as duas trocam de lugar", () => {
    const r = tocar(tocar(base, 0), 1);
    expect(r.mao).toBe("sv7-2");
    expect(r.bolsos).toEqual([null, "sv7-1", null]);
  });

  it("tocar de novo no bolso de onde ela saiu desfaz o gesto", () =>
    expect(tocar(tocar(base, 0), 0)).toEqual(base));

  it("mao vazia em bolso vazio nao muda nada", () =>
    expect(tocar(base, 2)).toEqual(base));

  it("indice fora do fichario nao muda nada", () => {
    expect(tocar(base, -1)).toEqual(base);
    expect(tocar(base, 3)).toEqual(base);
  });

  it("nenhuma chave aparece duas vezes depois de qualquer sequencia de toques", () => {
    let a = base;
    for (const i of [0, 1, 2, 0, 1, 2, 1, 0]) a = tocar(a, i);
    const presentes = [...a.bolsos.filter((k) => k !== null), a.mao].filter(Boolean);
    expect(new Set(presentes).size).toBe(presentes.length);
    // E a permutacao nao perde ninguem: as duas cartas continuam existindo.
    expect(new Set(presentes)).toEqual(new Set(["sv7-1", "sv7-2"]));
    expect(resolver(a, u, buscadorDe(u)).relatorio.acrescentadas).toBe(1); // so a sv7-3
  });
});

describe("tirar", () => {
  const u = universo("sv7", 2);
  const chavesDoUniverso = new Set(u.map(chaveDe));

  it("a carta da mao vai para fora e a mao esvazia, sem deslocar os bolsos", () => {
    const comMao = tocar({ bolsos: ["sv7-1", "sv7-2"], fora: [], mao: null }, 0);
    const r = tirar(comMao, chavesDoUniverso, id);
    expect(r.mao).toBeNull();
    expect(r.fora).toEqual(["sv7-1"]);
    expect(r.bolsos).toEqual([null, "sv7-2"]);
  });

  it("carta tirada nao volta ao fim na leitura seguinte", () => {
    const comMao = tocar({ bolsos: ["sv7-1", "sv7-2"], fora: [], mao: null }, 0);
    const r = resolver(tirar(comMao, chavesDoUniverso, id), u, buscadorDe(u));
    expect(chaves(r)).toEqual([null, "sv7-2"]);
  });

  it("carta de colecao estranha ao fichario e esquecida em vez de entrar em fora", () => {
    const estranha: Arranjo = { bolsos: [null], fora: [], mao: "base1-1" };
    expect(tirar(estranha, chavesDoUniverso, id).fora).toEqual([]);
  });

  it("com a mao vazia nao muda nada", () => {
    const a: Arranjo = { bolsos: ["sv7-1"], fora: [], mao: null };
    expect(tirar(a, chavesDoUniverso, id)).toEqual(a);
  });
});

describe("puxar", () => {
  it("traz para a mao uma carta de qualquer colecao", () => {
    const r = puxar({ bolsos: ["sv7-1", null], fora: [], mao: null }, "base1-4", id);
    expect(r.mao).toBe("base1-4");
    expect(r.bolsos).toEqual(["sv7-1", null]);
  });

  it("puxar uma carta que ja esta num bolso a tira de la, para nao haver duas", () => {
    const r = puxar({ bolsos: ["sv7-1", "sv7-2"], fora: [], mao: null }, "sv7-2", id);
    expect(r.mao).toBe("sv7-2");
    expect(r.bolsos).toEqual(["sv7-1", null]);
  });

  it("puxar de fora tira a chave de fora", () => {
    const r = puxar({ bolsos: [null], fora: ["sv7-9"], mao: null }, "sv7-9", id);
    expect(r.fora).toEqual([]);
    expect(r.mao).toBe("sv7-9");
  });

  it("com a mao cheia nao muda nada: nao ha o que fazer sem perder uma das duas", () => {
    const a: Arranjo = { bolsos: [null], fora: [], mao: "sv7-1" };
    expect(puxar(a, "sv7-2", id)).toEqual(a);
  });
});

describe("serializar", () => {
  it("a tela mexe em cartas e o banco recebe chaves, com os mesmos indices", () => {
    const u = universo("sv7", 3);
    const naTela = { bolsos: [u[0], null, u[2]], fora: [u[1]], mao: null };
    expect(serializar(naTela, chaveDe)).toEqual({
      bolsos: ["sv7-1", null, "sv7-3"],
      fora: ["sv7-2"],
      mao: null,
    });
  });

  it("um bolso vazio vira null e sobrevive a ida e volta", () => {
    const u = universo("sv7", 2);
    const naTela = { bolsos: [null, u[0], null], fora: [], mao: u[1] };
    const gravado = serializar(naTela, chaveDe);
    expect(gravado.bolsos).toEqual([null, "sv7-1", null]);
    expect(chaves(resolver(gravado, u, buscadorDe(u)))).toEqual([null, "sv7-1", null]);
  });

  it("nenhuma chave aparece duas vezes depois de qualquer sequencia de gestos", () => {
    const u = universo("sv7", 4);
    let e: { bolsos: (Posicao | null)[]; fora: Posicao[]; mao: Posicao | null } = {
      bolsos: [u[0], u[1], null, u[3]],
      fora: [],
      mao: null,
    };
    e = tocar(e, 0);
    e = tocar(e, 3);
    e = puxar(tirar(e, new Set(u.map(chaveDe)), chaveDe), u[2], chaveDe);
    e = tocar(e, 1);

    const g = serializar(e, chaveDe);
    const todas = [...g.bolsos.filter((k) => k !== null), ...g.fora, g.mao].filter(
      (k): k is string => k !== null,
    );
    expect(new Set(todas).size).toBe(todas.length);
  });
});
