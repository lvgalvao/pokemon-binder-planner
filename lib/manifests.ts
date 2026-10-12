import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  BUCKETS,
  expandirVariantes,
  itemKey,
  type Bucket,
  type Manifest,
  type Posicao,
  type SetSummary,
} from "./types";
import { sortCards } from "./cards";

/**
 * Os manifests sao os unicos 740 KB de assets/ que ficam versionados. As imagens
 * (881 MB) vivem no Storage; estes aqui o servidor precisa ter em maos para montar
 * o fichario, e sao dado que nunca muda — disco local bate qualquer cache remoto.
 * Populados por `node tools/sync-manifests.mjs`.
 */
export const MANIFESTS_DIR = path.join(process.cwd(), "data", "manifests");

/** Ainda usado pelo PDF e pela rota de imagem enquanto elas leem do disco local. */
export const ASSETS_DIR = path.join(process.cwd(), "assets");

const BUCKET_SET: ReadonlySet<string> = new Set(BUCKETS);

/**
 * Validacoes que a spec de assets (§8) manda o cliente fazer ao ler um manifest.
 * Um manifest torto e melhor descoberto no boot que no meio do fichario.
 */
function validate(m: Manifest): Manifest {
  const seen = new Set<string>();
  for (const c of m.cards) {
    if (!c.id) throw new Error(`${m.setId}: carta sem id`);
    if (seen.has(c.id)) throw new Error(`${m.setId}: id duplicado ${c.id}`);
    seen.add(c.id);
    if (!BUCKET_SET.has(c.bucket)) {
      throw new Error(`${m.setId}: bucket invalido "${c.bucket}" em ${c.id}`);
    }
    if (!c.imagePath.includes(`/${c.bucket}/`)) {
      throw new Error(`${m.setId}: imagePath nao bate com o bucket em ${c.id}`);
    }
    if (!Number.isInteger(c.collectionNumber) || c.collectionNumber < 0) {
      throw new Error(`${m.setId}: collectionNumber invalido em ${c.id}`);
    }
  }
  return m;
}

let manifestCache: Map<string, Manifest> | null = null;

function loadAll(): Map<string, Manifest> {
  if (manifestCache) return manifestCache;
  const cache = new Map<string, Manifest>();
  if (!existsSync(MANIFESTS_DIR)) {
    throw new Error(
      `Pasta data/manifests/ nao encontrada em ${MANIFESTS_DIR}. ` +
        `Rode \`node tools/sync-manifests.mjs\` (precisa de assets/ populada — ` +
        `veja .llm/spec-download-assets.md §11).`,
    );
  }
  for (const entry of readdirSync(MANIFESTS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const file = path.join(MANIFESTS_DIR, entry.name);
    const m = validate(JSON.parse(readFileSync(file, "utf8")) as Manifest);
    cache.set(m.setId, m);
  }
  manifestCache = cache;
  return cache;
}

/**
 * Toda posicao de todas as colecoes, indexada pela CHAVE DE ITEM.
 *
 * Por chave e nao por `cardId` de proposito: o arranjo manual guarda
 * `me2pt5-4#pokebola`, e so a chave inteira responde se aquela versao existe
 * naquela colecao. Um indice por id aceitaria um `#pokebola` numa colecao que
 * nao tem o segundo reverse — e duas chaves diferentes caindo no mesmo bolso e
 * exatamente o que `parseItemKey` recusa fazer.
 *
 * Sao ~17.900 entradas nas 68 colecoes. Construido uma vez, no mesmo cache
 * preguicoso dos manifests, porque quem precisa dele — resolver um arranjo —
 * precisa dele inteiro.
 */
let posicaoCache: Map<string, Posicao> | null = null;

function indice(): Map<string, Posicao> {
  if (posicaoCache) return posicaoCache;
  const out = new Map<string, Posicao>();
  for (const m of loadAll().values()) {
    for (const item of expandirVariantes(m.cards, m.setId)) {
      out.set(itemKey(item.card.id, item.variant), {
        ...item,
        setId: m.setId,
        setName: m.setName,
      });
    }
  }
  posicaoCache = out;
  return out;
}

/**
 * A posicao de uma chave de item, venha ela de que colecao vier.
 *
 * E o que permite o arranjo manual guardar so a chave: o `setId` sai daqui, e
 * NUNCA de cortar a string — o id e `<setId>-<numero>`, mas apostar nisso para
 * decidir contra qual manifest validar seria adivinhar onde da para consultar.
 */
export function findPosicao(key: string): Posicao | null {
  return indice().get(key) ?? null;
}

/**
 * Os bolsos que uma colecao ocupa, na ordem automatica — a mesma expansao que o
 * fichario faz na tela. E o universo contra o qual um arranjo e reconciliado:
 * o que esta aqui e nao esta no arranjo e carta que ainda nao foi colocada.
 */
export function posicoesDoSet(setId: string, rule: "number" | "rarity"): Posicao[] {
  const m = getManifest(setId);
  if (!m) return [];
  return expandirVariantes(sortCards(m.cards, rule), setId).map((item) => ({
    ...item,
    setId: m.setId,
    setName: m.setName,
  }));
}

/** So para os testes — o cache e proposital em producao. */
export function resetManifestCache(): void {
  manifestCache = null;
  posicaoCache = null;
}

/**
 * Ordem de exibicao das colecoes. O manifest nao guarda data de lancamento
 * (a spec de assets nao a inclui), entao a ordem sai do prefixo do setId —
 * familias das mais novas para as mais antigas — e, dentro da familia, numerica:
 * sv1, sv2, ..., sv10 (nunca sv1, sv10, sv2).
 *
 * `pgo` e `cel25` nao tem familia no id, mas tem lugar na estante: sao da era
 * Sword & Shield, e por isso vem logo depois dela.
 *
 * Id sem numero depois do prefixo — hoje so `mep`, as promos — fica no fim da
 * sua familia, que e onde ele deve estar: a promo nao e a colecao seguinte, e o
 * extra da era. Sai de graca do `?? 0`, ja que as demais pontuam negativo.
 */
const FAMILY_ORDER = [
  "me",
  "zsv",
  "rsv",
  "sv",
  "swsh",
  "pgo",
  "cel",
  "sm",
  "xy",
  "ex",
  "ecard",
  "neo",
  "gym",
  "base",
];

/**
 * Os ids que escrevem "e meio" sem separador. `swsh35` e a 3.5 (Champion's
 * Path), nao a trigesima quinta — lido como inteiro, iria para a frente de
 * todas as outras da familia. Os que usam `pt` (`sv3pt5`) nao precisam estar
 * aqui: o numero deles para no `p`.
 */
const MEIO: Record<string, number> = {
  me55: 5.5,
  swsh35: 3.5,
  swsh45: 4.5,
  sm115: 11.5,
};

function sortKey(setId: string): [number, number, string] {
  const family = FAMILY_ORDER.find((f) => setId.startsWith(f)) ?? "";
  const familyRank = family ? FAMILY_ORDER.indexOf(family) : FAMILY_ORDER.length;
  const digits = setId.slice(family.length).match(/^\d+/);
  const numero = MEIO[setId] ?? (digits ? Number(digits[0]) : 0);
  return [familyRank, numero ? -numero : 0, setId];
}

export function listSets(): SetSummary[] {
  return [...loadAll().values()]
    .map((m) => ({
      setId: m.setId,
      setName: m.setName,
      totalSet: m.totalSet,
      coverPath: `${m.setId}/capa.png`,
    }))
    .sort((a, b) => {
      const [fa, na, ia] = sortKey(a.setId);
      const [fb, nb, ib] = sortKey(b.setId);
      return fa - fb || na - nb || ia.localeCompare(ib);
    });
}

export function getManifest(setId: string): Manifest | null {
  return loadAll().get(setId) ?? null;
}

/** Contagem por raridade, ja com os 7 buckets garantidos. */
export function bucketTotals(m: Manifest): Record<Bucket, number> {
  const out = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  for (const c of m.cards) out[c.bucket] += 1;
  return out;
}
