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

/**
 * As versoes fisicas de uma mesma carta.
 *
 * `holo` e o reverse holo comum — o de fundo com simbolos de energia, que
 * existe desde 2002 e e o unico na maioria das colecoes. `pokebola` e o
 * segundo padrao de reverse, com pokebolas no fundo, que so algumas colecoes
 * tem (ver SETS_COM_HOLO_POKEBOLA).
 *
 * `holo` continua sendo o nome do reverse padrao, e nao "energia", de
 * proposito: e o que ja esta gravado como `#holo` em todo fichario existente.
 * Renomear obrigaria a migrar posse; assim a colecao nova so acrescenta.
 */
export type Variant = "normal" | "holo" | "pokebola";

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
 * Colecoes com DOIS padroes de reverse holo: o de energia e o de pokebola.
 * Cada comum, incomum e rara ocupa entao tres bolsos em vez de dois — em
 * Ascended Heroes sao 178 cartas assim, o que leva a folha 3x3 de 53 para 73.
 */
const SETS_COM_HOLO_POKEBOLA = new Set(["me2pt5"]);

export function temHoloPokebola(setId: string, card: Card): boolean {
  return SETS_COM_HOLO_POKEBOLA.has(setId) && temReverseHolo(setId, card);
}

/** As versoes que uma carta tem naquela colecao, na ordem em que vao ao bolso. */
export function variantesDe(setId: string, card: Card): Variant[] {
  if (!temReverseHolo(setId, card)) return ["normal"];
  return temHoloPokebola(setId, card)
    ? ["normal", "holo", "pokebola"]
    : ["normal", "holo"];
}

/**
 * O que o selo do bolso diz.
 *
 * Onde ha um reverse so, "HOLO" basta e e o que a crianca ja conhece. Onde ha
 * dois — Ascended Heroes tem o Energy Symbol Pattern e o Poke Ball's Pattern —
 * "HOLO" deixa de responder a unica pergunta que importa na hora de encaixar:
 * QUAL dos dois. Ai os dois selos passam a nomear o padrao, e ficam simetricos:
 * nenhum deles e "o holo" e o outro "o especial".
 *
 * O selo so muda onde ha o que distinguir; as outras 24 colecoes seguem iguais.
 */
export function rotuloVariante(setId: string, variant: Variant): string | null {
  if (variant === "normal") return null;
  if (variant === "pokebola") return "POKÉBOLA";
  return SETS_COM_HOLO_POKEBOLA.has(setId) ? "ENERGIA" : "HOLO";
}

/** A mesma distincao, por extenso, para a carta grande e para os leitores de tela. */
export function nomeVariante(setId: string, variant: Variant): string {
  if (variant === "normal") return "";
  if (variant === "pokebola") return "brilhante pokébola";
  return SETS_COM_HOLO_POKEBOLA.has(setId) ? "brilhante energia" : "brilhante";
}

/**
 * Chave de identidade de uma posicao. A versao normal usa o proprio id da carta,
 * entao todo dado gravado antes das variantes continua valendo como "normal" —
 * nada precisou ser reinterpretado.
 */
export function itemKey(cardId: string, variant: Variant): string {
  return variant === "normal" ? cardId : `${cardId}#${variant}`;
}

export function parseItemKey(key: string): { cardId: string; variant: Variant } {
  const corte = key.lastIndexOf("#");
  if (corte === -1) return { cardId: key, variant: "normal" };

  const sufixo = key.slice(corte + 1);
  // Sufixo desconhecido nao vira "normal": duas chaves diferentes cairiam no
  // mesmo bolso e uma marcacao apagaria a outra. Fica como veio, e a validacao
  // contra o manifest em /api/marcar a recusa.
  return sufixo === "holo" || sufixo === "pokebola"
    ? { cardId: key.slice(0, corte), variant: sufixo }
    : { cardId: key, variant: "normal" };
}

/**
 * Expande a lista ja ordenada em posicoes do fichario, com a versao brilhante
 * logo ao lado da simples — que e como a crianca guarda: as duas juntas.
 */
export function expandirVariantes(cards: readonly Card[], setId: string): SlotItem[] {
  const out: SlotItem[] = [];
  for (const card of cards) {
    for (const variant of variantesDe(setId, card)) out.push({ card, variant });
  }
  return out;
}
