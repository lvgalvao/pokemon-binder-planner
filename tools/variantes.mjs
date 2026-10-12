/**
 * Descobre, carta a carta, quais existem em reverse holo, e grava `reverse` no
 * manifest de assets/<setId>/.
 *
 * O app nasceu com uma regra por raridade (`temReverseHolo`, lib/types.ts):
 * comum, incomum e rara tem reverse, o resto nao. Ela acerta de 2023 para ca e
 * erra nas colecoes antigas dos dois lados — em Legendary Collection ate a rara
 * holo tem reverse, em Celebrations nenhuma carta tem, em Aquapolis as holo
 * `H1`–`H32` nao tem e as outras raras tem, e antes de 2002 o reverse nem
 * existia. Regra nenhuma cobre isso; a resposta esta nas fontes.
 *
 * Tres fontes, porque nenhuma sozinha da conta:
 *
 *   tcgdex      `variants.reverse`, curado a mao. Uma consulta GraphQL por
 *               colecao. O problema: onde ninguem preencheu, vem o padrao
 *               (`normal: true` e mais nada) — EX Delta Species, toda a era
 *               Sun & Moon e XY chegam assim, como se nao tivessem reverse.
 *   pokemontcg  as chaves de `tcgplayer.prices`: `reverseHolofoil` presente quer
 *               dizer que aquela impressao ja foi vendida. Instavel (500/502),
 *               entao e opcional: se nao responder, as outras duas decidem.
 *   tcgplayer   os anuncios de hoje filtrados por impressao "Reverse Holofoil".
 *               E a unica que conhece a colecao que saiu mes passado, e o
 *               mesmo caminho que o PokeTCG usa para os precos.
 *
 * A carta tem reverse se QUALQUER fonte disser que sim. O erro que cada uma
 * comete e sempre para o lado do "nao" (dado que falta), nunca do "sim" — com
 * duas excecoes conhecidas, ambas da tcgdex, que por isso nao decide sozinha:
 * subcolecao (Trainer Gallery, Shiny Vault, Classic Collection) e numeracao com
 * letra na frente (`H21`), que por definicao sao impressao unica.
 *
 * Conferido nas 41 colecoes trazidas do PokeTCG: fora os buracos da tcgdex, as
 * fontes so divergem em 34 cartas, todas "so a tcgdex diz sim" em colecoes de
 * 2002–2003 (Legendary Collection, Expedition, Skyridge) cujo reverse existe
 * mas quase nao aparece mais a venda.
 *
 * `--set` e obrigatorio, e de proposito. As 27 colecoes originais nao tem
 * `reverse` no manifest e NAO devem ganhar: ha posse gravada em `#holo` la, e
 * tirar o bolso de baixo de uma marcacao e pior que um bolso a mais.
 *
 * As respostas ficam em .cache/variantes/<setId>.json; `--force` busca de novo.
 *
 * Uso:
 *   node tools/variantes.mjs --set me55
 *   node tools/variantes.mjs --set base4,base5,base6 --force
 *
 * Depois: `node tools/sync-manifests.mjs`.
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

/** setId daqui (o da pokemontcg.io) -> id do set na tcgdex, onde diverge. */
const TCGDEX = {
  base6: "lc",
  swsh35: "swsh3.5",
  swsh45: "swsh4.5",
  swsh12pt5: "swsh12.5",
  me55: "30th",
};

/** setId -> nome do set no TCGplayer. Mesma tabela do PokeTCG (tools/prices_tcgplayer). */
const TCGPLAYER = {
  me55: "ME: 30th Celebration",
  swsh12pt5: "SWSH: Crown Zenith",
  swsh12: "SWSH12: Silver Tempest",
  swsh11: "SWSH11: Lost Origin",
  swsh10: "SWSH10: Astral Radiance",
  swsh9: "SWSH09: Brilliant Stars",
  swsh8: "SWSH08: Fusion Strike",
  cel25: "Celebrations",
  swsh7: "SWSH07: Evolving Skies",
  swsh6: "SWSH06: Chilling Reign",
  swsh45: "Shining Fates",
  swsh4: "SWSH04: Vivid Voltage",
  swsh35: "Champion's Path",
  sm12: "SM - Cosmic Eclipse",
  sm115: "Hidden Fates",
  sm10: "SM - Unbroken Bonds",
  sm9: "SM - Team Up",
  sm3: "SM - Burning Shadows",
  xy12: "XY - Evolutions",
  xy6: "XY - Roaring Skies",
  xy2: "XY - Flashfire",
  ex15: "EX Dragon Frontiers",
  ex13: "EX Holon Phantoms",
  ex11: "EX Delta Species",
  ex10: "EX Unseen Forces",
  ex8: "EX Deoxys",
  ex7: "EX Team Rocket Returns",
  ex6: "EX FireRed & LeafGreen",
  ex1: "EX Ruby and Sapphire",
  ecard3: "Skyridge",
  ecard2: "Aquapolis",
  ecard1: "Expedition",
  base6: "Legendary Collection",
  neo4: "Neo Destiny",
  neo3: "Neo Revelation",
  neo2: "Neo Discovery",
  neo1: "Neo Genesis",
  gym2: "Gym Challenge",
  gym1: "Gym Heroes",
  base5: "Team Rocket",
  base4: "Base Set 2",
};

const args = process.argv.slice(2);
const opcao = (nome, padrao = null) => {
  const i = args.indexOf(nome);
  return i === -1 ? padrao : args[i + 1];
};
const SETS = (opcao("--set") ?? "").split(",").filter(Boolean);
const FORCE = args.includes("--force");
const ASSETS = path.join(process.cwd(), "assets");
const CACHE = path.join(process.cwd(), ".cache", "variantes");

if (SETS.length === 0) {
  console.error("Uso: node tools/variantes.mjs --set <setId>[,<setId>...] [--force]");
  process.exit(2);
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(url, { corpo = null, cabecalhos = {}, tentativas = 6 } = {}) {
  let ultimo = null;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, {
        method: corpo ? "POST" : "GET",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...cabecalhos },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(60_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      ultimo = e;
      if (i < tentativas - 1) await espera(Math.min(30_000, 1000 * 2 ** i));
    }
  }
  throw new Error(`${url}: ${ultimo?.message}`);
}

/** "001", "1/107" e "TG01" viram "1", "1" e "tg01": a mesma carta nas tres fontes. */
const numero = (s) => String(s).split("/")[0].trim().toLowerCase().replace(/^0+(?=.)/, "");
const sufixo = (id) => id.slice(id.lastIndexOf("-") + 1);

/** numero -> tem reverse, segundo a tcgdex. */
async function daTcgdex(setId) {
  const alvo = TCGDEX[setId] ?? setId;
  const out = new Map();
  for (let pagina = 1; ; pagina++) {
    const query = `{ cards(filters:{id:"${alvo}-"}, pagination:{page:${pagina},itemsPerPage:250}) { localId set{id} variants{reverse} } }`;
    const lote = (await pedir("https://api.tcgdex.net/v2/graphql", { corpo: { query } }))?.data?.cards ?? [];
    // O filtro e por prefixo de id: "swsh9-" tambem traz "swsh9tg-". Fica so o set.
    for (const c of lote) if (c.set?.id === alvo) out.set(numero(c.localId), Boolean(c.variants?.reverse));
    if (lote.length < 250) break;
  }
  return out;
}

/** id -> tem preco de reverse. Carta sem preco nenhum fica de fora: nao e um "nao". */
async function daPokemontcg(setId) {
  const out = new Map();
  for (let pagina = 1; ; pagina++) {
    const url = `https://api.pokemontcg.io/v2/cards?q=set.id:${setId}&page=${pagina}&pageSize=250&select=id,tcgplayer`;
    const lote = (await pedir(url, { tentativas: 10 }))?.data ?? [];
    for (const c of lote) {
      const chaves = Object.keys(c.tcgplayer?.prices ?? {});
      if (chaves.length) out.set(c.id, chaves.includes("reverseHolofoil"));
    }
    if (lote.length < 250) break;
  }
  return out;
}

/** numero -> ha anuncio de reverse hoje. ~1 pedido por segundo, como o PokeTCG faz. */
async function doTcgplayer(setId) {
  const nome = TCGPLAYER[setId];
  if (!nome) return null;
  const out = new Map();
  for (let de = 0; ; de += 50) {
    const corpo = {
      algorithm: "sales_synonym_v2",
      from: de,
      size: 50,
      filters: { term: { productLineName: ["pokemon"], setName: [nome], productTypeName: ["Cards"] } },
      sort: { field: "product-sorting-name", order: "asc" },
      listingSearch: { filters: { term: { printing: ["Reverse Holofoil"] } } },
    };
    const r = (
      await pedir("https://mp-search-api.tcgplayer.com/v1/search/request?q=&isList=false", {
        corpo,
        cabecalhos: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      })
    )?.results?.[0];
    for (const p of r?.results ?? []) {
      const n = p.customAttributes?.number;
      if (!n) continue;
      const chave = numero(n);
      out.set(chave, out.get(chave) || (p.listings ?? []).length > 0);
    }
    await espera(1000);
    if (!r?.results?.length || de + 50 >= r.totalResults) break;
  }
  return out;
}

/**
 * Aquapolis tem quatro cartas em duas impressoes (`50a` e `50b`) que aqui sao
 * uma so, a `50`. As duas existem em reverse, entao a `a` responde pelas duas.
 */
function achar(mapa, n) {
  return mapa?.get(n) ?? mapa?.get(`${n}a`);
}

function gravar(destino, conteudo) {
  const tmp = `${destino}.tmp`;
  writeFileSync(tmp, conteudo);
  renameSync(tmp, destino);
}

/** O que cada fonte disse de cada carta: { [id]: { tcgdex?, pokemontcg?, tcgplayer? } }. */
async function fontesDe(setId, cards) {
  const arquivo = path.join(CACHE, `${setId}.json`);
  if (existsSync(arquivo) && !FORCE) return JSON.parse(readFileSync(arquivo, "utf8"));

  const [dex, ptcg, tcgp] = await Promise.all(
    [daTcgdex, daPokemontcg, doTcgplayer].map((f) =>
      f(setId).catch((e) => {
        console.log(`  ${setId}: fonte indisponivel (${e.message})`);
        return null;
      }),
    ),
  );
  if (!dex && !ptcg && !tcgp) throw new Error(`${setId}: nenhuma fonte respondeu, manifest intacto`);

  const out = {};
  for (const c of cards) {
    const n = numero(sufixo(c.id));
    const visto = {};
    // Subcolecao tem numeracao propria (TG01, SV001): o numero dela nao e o do set.
    if (!c.subset) {
      const d = achar(dex, n);
      const t = achar(tcgp, n);
      if (d !== undefined) visto.tcgdex = d;
      if (t !== undefined) visto.tcgplayer = t;
    }
    if (ptcg?.has(c.id)) visto.pokemontcg = ptcg.get(c.id);
    out[c.id] = visto;
  }
  mkdirSync(CACHE, { recursive: true });
  gravar(arquivo, JSON.stringify(out));
  return out;
}

function temReverse(card, visto) {
  if (card.subset) return false;
  if (visto.pokemontcg || visto.tcgplayer) return true;
  // A tcgdex so decide sozinha na numeracao comum — ver o cabecalho.
  return Boolean(visto.tcgdex) && /^\d/.test(sufixo(card.id));
}

for (const setId of SETS) {
  const arquivo = path.join(ASSETS, setId, "manifest.json");
  if (!existsSync(arquivo)) {
    console.error(`${setId}: sem manifest em assets/. Baixe ou clone a colecao antes.`);
    process.exit(1);
  }
  const m = JSON.parse(readFileSync(arquivo, "utf8"));
  const fontes = await fontesDe(setId, m.cards);

  let com = 0;
  let semFonte = 0;
  for (const c of m.cards) {
    const visto = fontes[c.id] ?? {};
    if (!c.subset && Object.keys(visto).length === 0) semFonte++;
    c.reverse = temReverse(c, visto);
    if (c.reverse) com++;
  }
  gravar(arquivo, JSON.stringify(m, null, 2) + "\n");
  console.log(
    `${setId} (${m.setName}): ${com} de ${m.cards.length} com reverse` +
      (semFonte ? ` — ${semFonte} sem resposta de fonte nenhuma, ficam sem` : ""),
  );
}
