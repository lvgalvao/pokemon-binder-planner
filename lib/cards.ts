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

/** O que vem depois do ultimo hifen do id: "117", "TG01", "H12", "182a". */
function sufixo(card: Pick<Card, "id">): string {
  return card.id.slice(card.id.lastIndexOf("-") + 1);
}

/**
 * O numero como esta impresso na carta, para o selo do bolso.
 *
 * Nas colecoes de 2023 em diante todo numero e so digito e isto devolve o mesmo
 * "007" de sempre. Nas mais antigas ha numeracao que nao e numero — `TG01` da
 * Trainer Gallery, `H12` das holo de Aquapolis, `SV001` do Shiny Vault, as
 * letras do Unown — e mostrar so os digitos poria dois "01" na mesma pagina.
 * O `_A` do Classic Collection e marca da fonte, nao esta na carta, e sai.
 */
export function rotuloNumero(card: Pick<Card, "id" | "collectionNumber">, largura: number): string {
  const s = sufixo(card).replace(/_.*$/, "");
  return /^\d+$/.test(s) ? s.padStart(largura, "0") : s.toUpperCase();
}

/**
 * Posicao da carta dentro da colecao, em quatro criterios:
 *
 *   1. o set principal antes das subcolecoes (a Trainer Gallery recomeca do 01
 *      e se misturaria com as cartas 1 a 30);
 *   2. numeracao comum antes da que leva letra na frente (as `H1`–`H32` de
 *      Aquapolis vem depois das 147 numeradas, como na lista oficial);
 *   3. o numero;
 *   4. o sufixo inteiro, que desempata `182a` de `182b`.
 */
function ordem(card: Card): [number, number, number, string] {
  const s = sufixo(card);
  const digitos = s.match(/\d+/);
  return [
    card.subset ? 1 : 0,
    /^\d/.test(s) ? 0 : 1,
    digitos ? Number(digitos[0]) : card.collectionNumber,
    s,
  ];
}

function porOrdem(a: Card, b: Card): number {
  const oa = ordem(a);
  const ob = ordem(b);
  return oa[0] - ob[0] || oa[1] - ob[1] || oa[2] - ob[2] || oa[3].localeCompare(ob[3]);
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
      return ra !== rb ? ra - rb : porOrdem(a, b);
    });
  } else {
    out.sort(porOrdem);
  }
  return out;
}
