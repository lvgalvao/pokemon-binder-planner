/**
 * Gera os derivados das cartas e sobe para o bucket `cards` do Supabase Storage.
 *
 * As 4.590 imagens de assets/ somam 881 MB e nao cabem nem no repositorio nem no
 * bundle. Mas o navegador e a impressora querem coisas diferentes do mesmo arquivo,
 * e hoje ambos recebem os mesmos ~190 KB. Entao sao dois derivados:
 *
 *   web/<setId>/<cardId>.webp   400w     WebP q72   ~34 KB   grade do fichario
 *   print/<setId>/<cardId>.jpg  <=733x1024 JPEG q78 ~113 KB   PDF e carta em tela cheia
 *   capa/<setId>.webp           366w     WebP q82   ~60 KB   tela inicial
 *
 * Total medido: ~660 MB contra 881 MB da origem.
 *
 * O print e normalizado em 733x1024, que a 63x88 mm da 296 DPI — a resolucao que
 * tests/pdf.test.ts afere. A origem NAO e uniforme: sv7 vem em 1423x1984 (574 DPI,
 * o dobro do que o papel usa) e base1-3 em 600x825. Por isso `fit: inside` com
 * `withoutEnlargement`: corta o excesso do sv7 sem inventar pixel nos sets antigos.
 *
 * As qualidades sairam de medicao sobre 100-150 cartas reais espalhadas pelos 25
 * sets, nao de chute — ver o historico deste commit.
 *
 * Uso:
 *   node tools/upload-assets.mjs             sobe o que falta
 *   node tools/upload-assets.mjs --force     regera e sobrescreve tudo
 *   node tools/upload-assets.mjs --set sv7   um set so
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL || !SECRET) {
  console.error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY em .env.local.\n" +
      "A secret key sai do dashboard em Settings > API Keys. Ela ignora RLS —\n" +
      "nunca vai para o projeto da Vercel nem para o navegador.",
  );
  process.exit(1);
}

const BUCKET = "cards";

/** Calibrados por medicao, nao por chute. Mexer aqui move o custo de Storage. */
const WEB_Q = 72;
const PRINT_Q = 78;
const PRINT_MAX = { width: 733, height: 1024 }; // 296 DPI a 63x88 mm

/**
 * O Storage sobe tudo com `cache-control: no-cache` por padrao, o que faz cada
 * uma das 18 cartas de uma pagina dupla revalidar contra a origem a cada visita
 * (`cf-cache-status: REVALIDATED`) — o CDN vira enfeite e o egress conta duas
 * vezes. O conteudo de um arquivo de carta nunca muda, entao um ano e immutable.
 *
 * Immutable so e seguro porque o caminho e imutavel junto: mudar a qualidade dos
 * derivados exige trocar o prefixo (web2/, print2/), nunca sobrescrever no lugar.
 */
const CACHE_CONTROL = "31536000, immutable";
const ASSETS = path.join(process.cwd(), "assets");
const MANIFESTS = path.join(process.cwd(), "data", "manifests");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const SO_ESTE_SET = args[args.indexOf("--set") + 1] ?? null;
const CONCORRENCIA = 8;

// Sem sessao e sem refresh: e um script de linha de comando, nao um app.
const supabase = createClient(URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Lista tudo que ja esta no bucket, para nao regerar 4.590 imagens a cada retomada. */
async function jaSubido(prefixo) {
  const nomes = new Set();
  const PAGINA = 1000;
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefixo, { limit: PAGINA, offset });
    if (error) throw new Error(`list ${prefixo}: ${error.message}`);
    for (const o of data) nomes.add(o.name);
    if (data.length < PAGINA) break;
  }
  return nomes;
}

async function subir(destino, corpo, contentType) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(destino, corpo, { contentType, upsert: true, cacheControl: CACHE_CONTROL });
  if (error) throw new Error(`upload ${destino}: ${error.message}`);
}

/** Roda `tarefa` sobre `itens` com um teto de paralelismo. */
async function emLotes(itens, tarefa) {
  let i = 0;
  let feitos = 0;
  const trabalhador = async () => {
    while (i < itens.length) {
      const meu = itens[i++];
      await tarefa(meu);
      feitos++;
      if (feitos % 100 === 0 || feitos === itens.length) {
        process.stdout.write(`\r  ${feitos}/${itens.length}`);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCORRENCIA, itens.length) }, trabalhador),
  );
  if (itens.length) process.stdout.write("\n");
}

if (!existsSync(ASSETS)) {
  console.error(`assets/ nao encontrada em ${ASSETS}. Veja .llm/spec-download-assets.md §11.`);
  process.exit(1);
}

const manifests = readdirSync(MANIFESTS)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path.join(MANIFESTS, f), "utf8")))
  .filter((m) => !SO_ESTE_SET || m.setId === SO_ESTE_SET);

if (SO_ESTE_SET && manifests.length === 0) {
  console.error(`Set "${SO_ESTE_SET}" nao encontrado em data/manifests/.`);
  process.exit(1);
}

let bytesAntes = 0;
let bytesDepois = 0;
const avisos = [];

// ---------------------------------------------------------------- capas
{
  const existentes = FORCE ? new Set() : await jaSubido("capa");
  const pendentes = manifests.filter((m) => !existentes.has(`${m.setId}.webp`));
  console.log(`capas: ${pendentes.length} a gerar (${manifests.length - pendentes.length} ja no bucket)`);
  await emLotes(pendentes, async (m) => {
    const origem = path.join(ASSETS, m.setId, "capa.png");
    if (!existsSync(origem)) return void avisos.push(`capa faltando: ${m.setId}`);
    const entrada = readFileSync(origem);
    const saida = await sharp(entrada).resize({ width: 366 }).webp({ quality: 82 }).toBuffer();
    bytesAntes += entrada.length;
    bytesDepois += saida.length;
    await subir(`capa/${m.setId}.webp`, saida, "image/webp");
  });
}

// ------------------------------------------------- verso (bolso sem imagem)
{
  const existentes = FORCE ? new Set() : await jaSubido("web");
  if (!existentes.has("card-back.webp")) {
    const entrada = readFileSync(path.join(ASSETS, "card-back.jpg"));
    const saida = await sharp(entrada).resize({ width: 400 }).webp({ quality: 72 }).toBuffer();
    await subir("web/card-back.webp", saida, "image/webp");
    console.log("verso da carta: 1 gerado");
  }
}

// ---------------------------------------------------------------- cartas
for (const m of manifests) {
  const [webExistentes, printExistentes] = FORCE
    ? [new Set(), new Set()]
    : await Promise.all([jaSubido(`web/${m.setId}`), jaSubido(`print/${m.setId}`)]);

  const pendentes = m.cards.filter(
    (c) => !webExistentes.has(`${c.id}.webp`) || !printExistentes.has(`${c.id}.jpg`),
  );
  console.log(
    `${m.setId} (${m.setName}): ${pendentes.length} de ${m.cards.length} cartas a gerar`,
  );
  if (pendentes.length === 0) continue;

  await emLotes(pendentes, async (c) => {
    const origem = path.join(ASSETS, c.imagePath);
    if (!existsSync(origem)) return void avisos.push(`imagem faltando: ${c.imagePath}`);
    const entrada = readFileSync(origem);
    bytesAntes += entrada.length;

    if (FORCE || !webExistentes.has(`${c.id}.webp`)) {
      const web = await sharp(entrada).resize({ width: 400 }).webp({ quality: WEB_Q }).toBuffer();
      bytesDepois += web.length;
      await subir(`web/${m.setId}/${c.id}.webp`, web, "image/webp");
    }

    if (FORCE || !printExistentes.has(`${c.id}.jpg`)) {
      const print = await sharp(entrada)
        .resize({ ...PRINT_MAX, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: PRINT_Q, mozjpeg: true })
        .toBuffer();
      const { width, height } = await sharp(print).metadata();
      // Passar do teto seria DPI jogado fora; ficar abaixo e a origem sendo menor
      // (base1-3, sv6pt5) e nao tem conserto — ampliar so inventaria pixel.
      if (width > PRINT_MAX.width || height > PRINT_MAX.height) {
        avisos.push(`${c.id}: print saiu ${width}x${height}, acima do teto`);
      }
      bytesDepois += print.length;
      await subir(`print/${m.setId}/${c.id}.jpg`, print, "image/jpeg");
    }
  });
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(0)} MB`;
console.log(`\nlido ${mb(bytesAntes)} → gerado ${mb(bytesDepois)}`);
if (avisos.length) {
  console.log(`\n${avisos.length} avisos:`);
  for (const a of avisos.slice(0, 20)) console.log(`  ${a}`);
  if (avisos.length > 20) console.log(`  ... e mais ${avisos.length - 20}`);
}
