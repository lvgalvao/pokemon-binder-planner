import type { Card } from "./types";

/**
 * Onde vive a arte das cartas.
 *
 * As 4.589 imagens somam 881 MB e nao entram no repositorio nem no bundle. Ficam
 * no bucket publico `cards` do Supabase Storage, em dois derivados por carta
 * (ver tools/upload-assets.mjs):
 *
 *   web/   400w WebP q72     ~34 KB   a grade, onde 18 cartas aparecem juntas
 *   print/ <=733x1024 q78   ~113 KB   o PDF e a carta em tela cheia
 *
 * Nao passam pelo otimizador de imagem da Vercel: ja saem no tamanho certo, e
 * 4.589 cartas estourariam a cota de transformacoes sozinhas. O navegador busca
 * o arquivo direto do CDN.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!SUPABASE_URL) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL nao definida. Sem ela nao ha de onde carregar as " +
      "cartas. Veja .env.example.",
  );
}

const BASE = `${SUPABASE_URL}/storage/v1/object/public/cards`;

/**
 * O caminho no Storage e por setId, mas Card nao carrega setId — carrega
 * `imagePath`, cujo primeiro segmento E a pasta do set. Verificado igual ao
 * setId nas 4.589 cartas dos 25 sets; ha teste em tests/assets.test.ts.
 */
function setIdDe(card: Card): string {
  return card.imagePath.slice(0, card.imagePath.indexOf("/"));
}

/** A carta na grade do fichario. */
export function webUrl(card: Card): string {
  return `${BASE}/web/${setIdDe(card)}/${card.id}.webp`;
}

/**
 * A carta em resolucao de impressao. Serve tanto o PDF quanto o visualizador em
 * tela cheia — sao o mesmo pedido de "quero ver grande", num caso em papel.
 */
export function printUrl(card: Card): string {
  return `${BASE}/print/${setIdDe(card)}/${card.id}.jpg`;
}

/** A capa da colecao, na tela de escolha. */
export function coverUrl(setId: string): string {
  return `${BASE}/capa/${setId}.webp`;
}

/** Verso da carta: bolso vazio e imagem que nao carregou. Nunca icone quebrado. */
export const CARD_BACK_URL = `${BASE}/web/card-back.webp`;
