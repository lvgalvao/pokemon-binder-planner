/**
 * Traz colecoes ja baixadas em OUTRA pasta de assets para assets/ daqui.
 *
 * O projeto PokeTCG (o abridor de pacotes) usa o mesmo contrato de assets — a
 * spec e a mesma, .llm/spec-download-assets.md — e ja tem em disco dezenas de
 * colecoes que este app nao tem. Baixar tudo de novo custaria 6.400 imagens de
 * uma API que devolve 500 em uma de cada tres chamadas, para chegar nos mesmos
 * arquivos. Aqui elas sao copiadas.
 *
 * O manifest NAO e copiado como esta. Um abridor de pacotes e um fichario
 * querem coisas diferentes da mesma colecao:
 *
 *   - `packOnly` sai. Sao as 8 energias basicas (`sve-9` a `sve-16`) que o
 *     PokeTCG poe em toda colecao moderna porque vem no pacote. No fichario
 *     elas nao sao da colecao — e o mesmo `sve-9` em dez manifests quebraria a
 *     regra de que a chave de item e unica no app inteiro (`lib/manifests.ts`).
 *   - `subset` fica. Trainer Gallery, Shiny Vault e Classic Collection saem
 *     dos mesmos pacotes e a crianca guarda junto; a ordenacao as poe depois
 *     do set principal (`lib/cards.ts`).
 *
 * Colecao que ja existe em assets/ nao e tocada, a menos de `--force`: os
 * manifests daqui tem posse gravada em cima, e trocar a lista de cartas por
 * baixo dela nao e coisa que se faca de passagem.
 *
 * Uso:
 *   node tools/clonar-colecoes.mjs --origem ../PokeTCG/assets            todas as que faltam
 *   node tools/clonar-colecoes.mjs --origem ../PokeTCG/assets --set me55 uma so
 *
 * Depois: `node tools/variantes.mjs`, `node tools/sync-manifests.mjs` e
 * `node tools/upload-assets.mjs`.
 */
import { readdirSync, readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";

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

/** O id vira caminho de arquivo e vem de fora (spec §6). */
const ID_SEGURO = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const args = process.argv.slice(2);
const opcao = (nome, padrao = null) => {
  const i = args.indexOf(nome);
  return i === -1 ? padrao : args[i + 1];
};

const ORIGEM = opcao("--origem");
const SO_ESTE_SET = opcao("--set");
const FORCE = args.includes("--force");
const DESTINO = path.join(process.cwd(), "assets");

if (!ORIGEM || !existsSync(ORIGEM)) {
  console.error("Uso: node tools/clonar-colecoes.mjs --origem <pasta de assets> [--set <setId>] [--force]");
  process.exit(2);
}

function gravar(destino, conteudo) {
  const tmp = `${destino}.tmp`;
  writeFileSync(tmp, conteudo);
  renameSync(tmp, destino);
}

const pastas = readdirSync(ORIGEM, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(path.join(ORIGEM, e.name, "manifest.json")))
  .map((e) => e.name)
  .filter((nome) => !SO_ESTE_SET || nome === SO_ESTE_SET)
  .sort();

if (pastas.length === 0) {
  console.error(`Nenhuma colecao com manifest em ${ORIGEM}${SO_ESTE_SET ? ` para "${SO_ESTE_SET}"` : ""}.`);
  process.exit(1);
}

let clonadas = 0;
let cartasCopiadas = 0;
const avisos = [];

for (const pasta of pastas) {
  const fonte = JSON.parse(readFileSync(path.join(ORIGEM, pasta, "manifest.json"), "utf8"));
  const setId = fonte.setId;
  if (!ID_SEGURO.test(setId)) {
    avisos.push(`${pasta}: setId inseguro "${setId}", pulada`);
    continue;
  }
  if (existsSync(path.join(DESTINO, setId, "manifest.json")) && !FORCE) continue;

  const cards = [];
  const faltando = [];
  for (const c of fonte.cards) {
    if (c.packOnly) continue;
    if (!ID_SEGURO.test(c.id) || !BUCKETS.includes(c.bucket)) {
      avisos.push(`${setId}: carta fora do contrato (${c.id}, ${c.bucket}), pulada`);
      continue;
    }
    // O caminho e remontado daqui, e nao lido do manifest de fora: e o unico
    // jeito de garantir que nada e escrito fora de assets/<setId>/.
    const imagePath = `${setId}/${c.bucket}/${c.id}.jpg`;
    const de = path.join(ORIGEM, imagePath);
    if (!existsSync(de)) {
      // O manifest reflete o disco: carta sem imagem nao entra.
      faltando.push(c.id);
      continue;
    }
    const para = path.join(DESTINO, imagePath);
    if (!existsSync(para) || FORCE) {
      mkdirSync(path.dirname(para), { recursive: true });
      copyFileSync(de, para);
      cartasCopiadas++;
    }
    cards.push({
      id: c.id,
      name: c.name,
      rarityRaw: c.rarityRaw,
      bucket: c.bucket,
      collectionNumber: c.collectionNumber,
      imagePath,
      ...(c.subset ? { subset: c.subset } : {}),
    });
  }

  if (cards.length === 0) {
    avisos.push(`${setId}: nenhuma carta aproveitavel, manifest nao gravado`);
    continue;
  }
  if (faltando.length) avisos.push(`${setId}: ${faltando.length} sem imagem na origem (${faltando.slice(0, 5).join(", ")}…)`);

  const capa = path.join(ORIGEM, pasta, "capa.png");
  if (existsSync(capa)) copyFileSync(capa, path.join(DESTINO, setId, "capa.png"));
  else avisos.push(`${setId}: sem capa.png na origem`);

  const totalsByBucket = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  for (const c of cards) totalsByBucket[c.bucket]++;

  gravar(
    path.join(DESTINO, setId, "manifest.json"),
    JSON.stringify(
      {
        setId,
        setName: fonte.setName,
        generatedAt: fonte.generatedAt,
        downloaderVersion: fonte.downloaderVersion,
        totalSet: cards.length,
        cards,
        totalsByBucket,
        unmapped: fonte.unmapped ?? [],
      },
      null,
      2,
    ) + "\n",
  );
  clonadas++;
  console.log(`${setId} (${fonte.setName}): ${cards.length} cartas`);
}

console.log(`\n${clonadas} colecoes clonadas, ${cartasCopiadas} imagens copiadas`);
if (avisos.length) {
  console.log(`\n${avisos.length} avisos:`);
  for (const a of avisos) console.log(`  ${a}`);
}
