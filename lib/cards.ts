import { BUCKETS, type Bucket, type Card, type SortRule } from "./types";

/**
 * Numero oficial da carta dentro da colecao.
 *
 * ATENCAO: NAO usar o campo `collectionNumber` do manifest. Ele e derivado com
 * `int(re.sub(r"[^0-9]", "", card.number))` no downloader e tem colisao real nos
 * assets: em `zsv10pt5`, a carta `zsv10pt5-80` ("Antique Cover Fossil") recebeu
 * `collectionNumber: 60`, batendo de frente com `zsv10pt5-60` ("Escavalier") — e o
 * numero 80 sumiu da sequencia. Ordenar por ele embaralha o fichario.
 *
 * O sufixo do `id` (`<setId>-<numero>`) foi verificado nas 4.589 cartas dos 25 sets:
 * unico e 100% numerico, zero colisoes. E essa a chave de ordenacao.
 */
export function cardNumber(card: Pick<Card, "id" | "collectionNumber">): number {
  const suffix = card.id.slice(card.id.lastIndexOf("-") + 1);
  const parsed = Number.parseInt(suffix, 10);
  return Number.isFinite(parsed) ? parsed : card.collectionNumber;
}

/** Numero como a crianca le: "007", "117". */
export function formatCardNumber(card: Card, total: number): string {
  const width = String(total).length;
  return String(cardNumber(card)).padStart(Math.max(width, 2), "0");
}

const BUCKET_ORDER = new Map<Bucket, number>(BUCKETS.map((b, i) => [b, i]));

/**
 * Ordena sem mutar a entrada.
 * - `number`: numero oficial crescente.
 * - `rarity`: comum -> lendaria, e dentro de cada raridade, numero crescente.
 */
export function sortCards(cards: readonly Card[], rule: SortRule): Card[] {
  const out = [...cards];
  if (rule === "rarity") {
    out.sort((a, b) => {
      const ra = BUCKET_ORDER.get(a.bucket) ?? BUCKETS.length;
      const rb = BUCKET_ORDER.get(b.bucket) ?? BUCKETS.length;
      return ra !== rb ? ra - rb : cardNumber(a) - cardNumber(b);
    });
  } else {
    out.sort((a, b) => cardNumber(a) - cardNumber(b));
  }
  return out;
}
