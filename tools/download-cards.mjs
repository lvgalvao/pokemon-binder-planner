/**
 * Baixa as cartas de uma colecao para assets/<setId>/, no contrato da spec de
 * assets (.llm/spec-download-assets.md §2 e §5).
 *
 * A spec descreve um `tools/download_cards.py` (Python, requests + Pillow) que
 * vive no projeto PokeTCG e foi quem populou as 25 colecoes originais. Aqui ele
 * virou Node por dois motivos concretos, nao por gosto:
 *
 *   1. sharp ja e dependencia (tools/upload-assets.mjs), entao converter para JPG
 *      nao custa venv, Pillow, nem um segundo runtime na maquina de quem repovoa.
 *   2. Promo nao existe na pokemontcg.io. As cartas promo da era Mega Evolution
 *      so estao na TCGdex, e o downloader Python fala uma fonte so.
 *
 * Duas fontes, uma saida. O que sai daqui e indistinguivel do que saiu de la —
 * ha teste de forma em tests/manifests.test.ts.
 *
 *   pokemontcg  api.pokemontcg.io/v2 — as 25 colecoes originais e o me5.
 *               Instavel: hoje 3 de 8 chamadas voltaram 500/502, dai o retry.
 *   tcgdex      api.tcgdex.net/v2/en — unica com as promos (`mep`, 89 cartas,
 *               das quais 40 tem arte publicada; as outras 49 dao 404 no CDN).
 *
 * Uso:
 *   node tools/download-cards.mjs --set me5
 *   node tools/download-cards.mjs --set mep --fonte tcgdex --nome "Promos Mega Evolution"
 *   node tools/download-cards.mjs --set me5 --force
 *
 * Depois: `node tools/sync-manifests.mjs` e `node tools/upload-assets.mjs --set <id>`.
 */
import { mkdirSync, existsSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const VERSAO = "0.2.0";

/** Os 8 buckets de raridade. O 08_promo e nosso — ver lib/types.ts. */
const BUCKETS = [
  "01_comum",
  "02_incomum",
  "03_raras",
  "04_duplo_raras",
  "05_arte_secreta",
  "06_duplo_arte_secreta",
  "07_legendaria",
  "08_promo",
];

/**
 * Raridade da fonte -> bucket local (spec §4, NON-NEGOTIABLE), em minusculas.
 * Raridade que nao esta aqui NAO e baixada: vai para `unmapped[]` do manifest,
 * que e o mecanismo de deteccao quando a Pokemon Company inventa a proxima.
 */
const RARIDADE_PARA_BUCKET = {
  common: "01_comum",
  uncommon: "02_incomum",
  rare: "03_raras",
  "rare holo": "03_raras",
  "double rare": "04_duplo_raras",
  "rare ultra": "04_duplo_raras",
  "ultra rare": "04_duplo_raras",
  "rare holo ex": "04_duplo_raras",
  "rare holo gx": "04_duplo_raras",
  "rare holo v": "04_duplo_raras",
  "rare holo vmax": "04_duplo_raras",
  "rare holo vstar": "04_duplo_raras",
  "radiant rare": "04_duplo_raras",
  "shiny rare": "04_duplo_raras",
  "illustration rare": "05_arte_secreta",
  "special illustration rare": "06_duplo_arte_secreta",
  "shiny ultra rare": "06_duplo_arte_secreta",
  "rare rainbow": "06_duplo_arte_secreta",
  "rare secret": "06_duplo_arte_secreta",
  "hyper rare": "07_legendaria",
  "ace spec rare": "07_legendaria",
  "black white rare": "07_legendaria",
  mega_attack_rare: "07_legendaria",
  "mega hyper rare": "07_legendaria",
  promo: "08_promo",
};

/** O id vira caminho de arquivo e vem de fonte externa (spec §6). */
const ID_SEGURO = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

// --------------------------------------------------------------------- CLI

const args = process.argv.slice(2);
const opcao = (nome, padrao = null) => {
  const i = args.indexOf(nome);
  return i === -1 ? padrao : args[i + 1];
};

const SET_ID = opcao("--set");
const FONTE = opcao("--fonte", "pokemontcg");
const FONTE_ID = opcao("--fonte-id", SET_ID);
const NOME = opcao("--nome");
const QUALIDADE = Number(opcao("--qualidade", "85"));
const FORCE = args.includes("--force");

if (!SET_ID) {
  console.error("Uso: node tools/download-cards.mjs --set <setId> [--fonte pokemontcg|tcgdex]");
  process.exit(2);
}
if (!ID_SEGURO.test(SET_ID)) {
  console.error(`setId invalido: ${SET_ID}`);
  process.exit(2);
}
if (FONTE !== "pokemontcg" && FONTE !== "tcgdex") {
  console.error(`--fonte precisa ser "pokemontcg" ou "tcgdex", veio "${FONTE}"`);
  process.exit(2);
}

const DESTINO = path.join(process.cwd(), "assets", SET_ID);
const CONCORRENCIA = 6;

// ------------------------------------------------------------------- rede

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET com backoff. As duas fontes caem: a pokemontcg.io devolve 500/502 em ~1 de
 * cada 3 chamadas, e a tcgdex passou a manha inteira alternando 502 e timeout de
 * conexao. Sem retry, meia colecao some sem erro visivel. O teto de 30 s por
 * espera existe porque a janela ruim dura minutos, nao segundos.
 */
async function buscar(url, { tentativas = 8, binario = false } = {}) {
  let ultimo = null;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (r.status === 404) return null; // ausencia e resposta, nao falha
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return binario ? Buffer.from(await r.arrayBuffer()) : await r.json();
    } catch (e) {
      ultimo = e;
      if (i < tentativas - 1) await espera(Math.min(30_000, 1000 * 2 ** i));
    }
  }
  throw new Error(`${url}: falhou apos ${tentativas} tentativas (${ultimo?.message})`);
}

/** Roda `tarefa` sobre `itens` com teto de paralelismo, mostrando progresso. */
async function emLotes(itens, tarefa) {
  let i = 0;
  let feitos = 0;
  const trabalhador = async () => {
    while (i < itens.length) {
      await tarefa(itens[i++]);
      feitos++;
      if (feitos % 10 === 0 || feitos === itens.length) {
        process.stdout.write(`\r  ${feitos}/${itens.length}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, itens.length) }, trabalhador));
  if (itens.length) process.stdout.write("\n");
}

// ----------------------------------------------------------------- fontes

/**
 * Cada fonte devolve a mesma forma: { nome, cartas: [{ id, name, rarityRaw,
 * numero, imagem }] }. `imagem` e a URL da maior versao disponivel.
 */
const FONTES = {
  /** Uma chamada pagina 250 cartas e ja traz raridade, numero e imagem. */
  async pokemontcg(id) {
    const cartas = [];
    let nome = null;
    for (let pagina = 1; ; pagina++) {
      const url = `https://api.pokemontcg.io/v2/cards?q=set.id:${id}&page=${pagina}&pageSize=250`;
      const body = await buscar(url);
      const lote = body?.data ?? [];
      nome ??= lote[0]?.set?.name ?? null;
      for (const c of lote) {
        cartas.push({
          id: c.id,
          name: c.name ?? "",
          rarityRaw: c.rarity ?? "",
          numero: c.number ?? "0",
          imagem: c.images?.large ?? c.images?.small ?? null,
          // Energia basica moderna vem sem raridade — ver fallback em bucketDe().
          supertype: c.supertype ?? "",
          subtypes: c.subtypes ?? [],
        });
      }
      if (lote.length < 250 || cartas.length >= (body?.totalCount ?? cartas.length)) break;
    }
    return { nome, cartas };
  },

  /**
   * O set lista id/localId/name e nada mais; raridade sai de uma chamada por
   * carta. A URL da imagem e montada a partir da serie — o campo `image` da
   * carta vem ausente justamente nas promos que ainda nao tem arte publicada.
   */
  async tcgdex(id) {
    const set = await buscar(`https://api.tcgdex.net/v2/en/sets/${id}`);
    if (!set) throw new Error(`set ${id} nao existe na tcgdex`);
    const serie = set.serie?.id ?? "";
    const cartas = [];
    await emLotes(set.cards, async (resumo) => {
      const c = (await buscar(`https://api.tcgdex.net/v2/en/cards/${resumo.id}`)) ?? resumo;
      cartas.push({
        id: c.id,
        name: c.name ?? "",
        rarityRaw: c.rarity ?? "",
        numero: c.localId ?? "0",
        imagem: `https://assets.tcgdex.net/en/${serie}/${id}/${c.localId}/high.png`,
        supertype: c.category === "Energy" ? "Energy" : "",
        subtypes: [],
      });
    });
    cartas.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return { nome: set.name, cartas };
  },
};

// ---------------------------------------------------------------- trabalho

/** Raridade -> bucket, com o fallback da energia basica sem raridade (spec §4). */
function bucketDe(carta) {
  const bruta = (carta.rarityRaw ?? "").trim().toLowerCase();
  const direto = RARIDADE_PARA_BUCKET[bruta];
  if (direto) return direto;
  if (!bruta && carta.supertype === "Energy" && carta.subtypes.some((s) => /basic/i.test(s))) {
    return "01_comum";
  }
  return null;
}

/** Escrita atomica: nenhuma interrupcao deixa arquivo truncado no lugar certo. */
function gravar(destino, conteudo) {
  const tmp = `${destino}.tmp`;
  writeFileSync(tmp, conteudo);
  renameSync(tmp, destino);
}

console.log(`[cartas] ${SET_ID} <- ${FONTE}:${FONTE_ID}`);
const { nome: nomeDaFonte, cartas } = await FONTES[FONTE](FONTE_ID);
if (cartas.length === 0) {
  // Spec §3: falha total nao gera manifest. Um manifest vazio sobrescrevendo um
  // bom e pior que erro nenhum — a colecao sumiria da tela sem explicacao.
  console.error(`[cartas] ${FONTE} nao listou nenhuma carta para ${FONTE_ID}. Manifest intacto.`);
  process.exit(3);
}
const setName = NOME ?? nomeDaFonte ?? SET_ID;
console.log(`[cartas] "${setName}": ${cartas.length} cartas na fonte`);

// Os buckets nascem sob demanda: uma colecao normal nao tem promo, e uma pasta
// `08_promo` vazia em cada um dos 27 sets seria ruido em disco e no manifest.
mkdirSync(DESTINO, { recursive: true });

const noManifest = [];
const unmapped = [];
const semArte = [];
const falhas = [];
let baixadas = 0;
let pulos = 0;

await emLotes(cartas, async (carta) => {
  if (!ID_SEGURO.test(carta.id) || carta.id.includes("..")) {
    return void falhas.push([carta.id, "id inseguro"]);
  }

  const bucket = bucketDe(carta);
  if (!bucket) {
    return void unmapped.push({ id: carta.id, name: carta.name, rarityRaw: carta.rarityRaw });
  }

  const entrada = {
    id: carta.id,
    name: carta.name,
    rarityRaw: carta.rarityRaw,
    bucket,
    collectionNumber: Number.parseInt(String(carta.numero).replace(/[^0-9]/g, ""), 10) || 0,
    imagePath: `${SET_ID}/${bucket}/${carta.id}.jpg`,
  };
  const arquivo = path.join(process.cwd(), "assets", entrada.imagePath);

  if (existsSync(arquivo) && !FORCE) {
    pulos++;
    return void noManifest.push(entrada);
  }

  try {
    const bruto = carta.imagem ? await buscar(carta.imagem, { binario: true }) : null;
    if (!bruto) {
      // 404 no CDN: a carta existe no catalogo, a arte ainda nao foi publicada.
      // Ficar de fora do manifest e o certo — o manifest reflete o disco.
      return void semArte.push(carta.id);
    }
    mkdirSync(path.dirname(arquivo), { recursive: true });
    gravar(
      arquivo,
      await sharp(bruto).flatten({ background: "#ffffff" }).jpeg({ quality: QUALIDADE }).toBuffer(),
    );
    baixadas++;
    noManifest.push(entrada);
  } catch (e) {
    falhas.push([carta.id, e.message]);
  }
});

noManifest.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.collectionNumber - b.collectionNumber);

const totalsByBucket = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
for (const c of noManifest) totalsByBucket[c.bucket]++;

gravar(
  path.join(DESTINO, "manifest.json"),
  JSON.stringify(
    {
      setId: SET_ID,
      setName,
      generatedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
      downloaderVersion: VERSAO,
      totalSet: noManifest.length,
      cards: noManifest,
      totalsByBucket,
      unmapped,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  `[cartas] baixadas=${baixadas}  ja tinha=${pulos}  sem arte na fonte=${semArte.length}  ` +
    `raridade nao mapeada=${unmapped.length}  falhas=${falhas.length}`,
);
console.log(`[cartas] manifest: ${path.join(DESTINO, "manifest.json")} (${noManifest.length} cartas)`);

// O sufixo do id e a chave de ordenacao do app (lib/cards.ts) — se ele nao for
// numerico, a carta cai no fim da folha sem explicacao. Melhor descobrir aqui.
const semNumero = noManifest.filter((c) => !/^\d+$/.test(c.id.slice(c.id.lastIndexOf("-") + 1)));
if (semNumero.length) {
  console.log(`[cartas] AVISO: id sem numero no sufixo: ${semNumero.map((c) => c.id).join(", ")}`);
}
if (semArte.length) console.log(`[cartas] sem arte: ${semArte.join(", ")}`);
if (unmapped.length) {
  for (const u of unmapped) console.log(`[cartas] nao mapeada: ${u.id} "${u.name}" (${u.rarityRaw})`);
}
if (falhas.length) {
  for (const [id, motivo] of falhas) console.log(`[cartas] FALHA ${id}: ${motivo}`);
  process.exit(2);
}
