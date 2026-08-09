import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { BUCKETS, type Bucket, type Manifest, type SetSummary } from "./types";

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

/** So para os testes — o cache e proposital em producao. */
export function resetManifestCache(): void {
  manifestCache = null;
}

/**
 * Ordem de exibicao das colecoes. O manifest nao guarda data de lancamento
 * (a spec de assets nao a inclui), entao a ordem sai do prefixo do setId —
 * familias das mais novas para as mais antigas — e, dentro da familia, numerica:
 * sv1, sv2, ..., sv10 (nunca sv1, sv10, sv2).
 */
const FAMILY_ORDER = ["me", "zsv", "rsv", "sv", "pgo", "base"];

function sortKey(setId: string): [number, number, string] {
  const family = FAMILY_ORDER.find((f) => setId.startsWith(f)) ?? "";
  const familyRank = family ? FAMILY_ORDER.indexOf(family) : FAMILY_ORDER.length;
  const digits = setId.slice(family.length).match(/^\d+/);
  return [familyRank, digits ? -Number(digits[0]) : 0, setId];
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
