/** Um dos 7 buckets de raridade fixos da spec de assets (.llm/spec-download-assets.md §2). */
export const BUCKETS = [
  "01_comum",
  "02_incomum",
  "03_raras",
  "04_duplo_raras",
  "05_arte_secreta",
  "06_duplo_arte_secreta",
  "07_legendaria",
] as const;

export type Bucket = (typeof BUCKETS)[number];

/** Nomes legiveis dos buckets, para a interface. */
export const BUCKET_LABELS: Record<Bucket, string> = {
  "01_comum": "Comum",
  "02_incomum": "Incomum",
  "03_raras": "Rara",
  "04_duplo_raras": "Dupla rara",
  "05_arte_secreta": "Arte secreta",
  "06_duplo_arte_secreta": "Dupla arte secreta",
  "07_legendaria": "Lendária",
};

/** Uma carta, exatamente como vem do manifest. Dado externo, somente leitura. */
export type Card = {
  id: string;
  name: string;
  rarityRaw: string;
  bucket: Bucket;
  collectionNumber: number;
  imagePath: string;
};

export type Manifest = {
  setId: string;
  setName: string;
  generatedAt: string;
  downloaderVersion: string;
  totalSet: number;
  cards: Card[];
  totalsByBucket: Record<Bucket, number>;
  unmapped: { id: string; name: string; rarityRaw: string }[];
};

/** Resumo de uma colecao para a tela de escolha. */
export type SetSummary = {
  setId: string;
  setName: string;
  totalSet: number;
  coverPath: string;
};

export type SortRule = "number" | "rarity";
export type Layout = { rows: number; columns: number };

/**
 * Formatos de folha de fichario, na convencao impressa na embalagem:
 * **colunas x linhas**. "4x3" e uma folha com 4 bolsos de largura e 3 de altura,
 * nao o contrario — foi exatamente essa inversao que saiu errada na primeira versao.
 */
export const LAYOUTS: Record<string, Layout> = {
  "2x2": { columns: 2, rows: 2 }, // 4 bolsos
  "3x3": { columns: 3, rows: 3 }, // 9 bolsos — o mais comum
  "4x3": { columns: 4, rows: 3 }, // 12 bolsos
  "4x4": { columns: 4, rows: 4 }, // 16 bolsos
};

/** Chave do formato a partir das dimensoes. Sempre colunas primeiro. */
export function layoutKey(columns: number, rows: number): string {
  return `${columns}x${rows}`;
}

/** Uma carta comum/incomum/rara existe em duas versoes fisicas distintas. */
export type Variant = "normal" | "holo";

/** Uma posicao do fichario: uma carta numa versao especifica. */
export type SlotItem = { card: Card; variant: Variant };

/**
 * Sets sem reverse holo. O reverse holo so surge por volta de 2002 (Legendary
 * Collection); nas colecoes de 1999 a carta existe numa versao unica, entao criar
 * o par ali produziria bolsos impossiveis de preencher.
 */
const SETS_SEM_REVERSE_HOLO = new Set(["base1", "base2", "base3"]);

/** So comum, incomum e rara (incluindo Rare Holo) tem reverse. */
const BUCKETS_COM_REVERSE: ReadonlySet<Bucket> = new Set<Bucket>([
  "01_comum",
  "02_incomum",
  "03_raras",
]);

export function temReverseHolo(setId: string, card: Card): boolean {
  return !SETS_SEM_REVERSE_HOLO.has(setId) && BUCKETS_COM_REVERSE.has(card.bucket);
}

/**
 * Chave de identidade de uma posicao. A versao normal usa o proprio id da carta,
 * entao todo dado gravado antes das variantes continua valendo como "normal" —
 * nada precisou ser reinterpretado.
 */
export function itemKey(cardId: string, variant: Variant): string {
  return variant === "holo" ? `${cardId}#holo` : cardId;
}

export function parseItemKey(key: string): { cardId: string; variant: Variant } {
  return key.endsWith("#holo")
    ? { cardId: key.slice(0, -5), variant: "holo" }
    : { cardId: key, variant: "normal" };
}

/**
 * Expande a lista ja ordenada em posicoes do fichario, com a versao brilhante
 * logo ao lado da simples — que e como a crianca guarda: as duas juntas.
 */
export function expandirVariantes(cards: readonly Card[], setId: string): SlotItem[] {
  const out: SlotItem[] = [];
  for (const card of cards) {
    out.push({ card, variant: "normal" });
    if (temReverseHolo(setId, card)) out.push({ card, variant: "holo" });
  }
  return out;
}
