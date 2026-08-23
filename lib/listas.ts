import { getBinder, getOwnedIds, getStarredIds, starredBySet } from "./db";
import { getManifest, listSets } from "./manifests";
import { sortCards } from "./cards";
import { missingCards } from "./binder";
import { expandirVariantes, itemKey, type SlotItem } from "./types";
import type { ItemImpresso } from "./pdf";

/**
 * Uma estrela como ela aparece na tela inicial: a carta, de que colecao veio e
 * se ele ja conseguiu. Carrega o nome da colecao porque ali a pergunta nao e
 * "o que falta nesta colecao" — sao cartas de varias, lado a lado.
 */
export type Estrela = SlotItem & { setId: string; setName: string; owned: boolean };

/**
 * O que vai para a folha.
 *
 *   faltantes  os bolsos vazios do fichario — o PDF de sempre.
 *   estrelas   as cartas marcadas com "quero muito" que ele AINDA nao tem. Uma
 *              estrela ja conquistada esta no bolso; o recorte dela nao serve
 *              mais para nada, e a contagem na tela diz quantas ficaram de fora.
 */
export type Lista = "faltantes" | "estrelas";

const chave = (i: SlotItem) => itemKey(i.card.id, i.variant);

/**
 * As posicoes de uma colecao que entram na folha, na mesma ordem em que estao no
 * fichario — a folha impressa segue a sequencia em que a crianca vai encaixar.
 *
 * Devolve `null` quando a colecao nao existe, para a rota responder 404 em vez
 * de uma folha vazia.
 */
export async function itensDaColecao(
  userId: string | null,
  setId: string,
  lista: Lista,
): Promise<ItemImpresso[] | null> {
  const manifest = getManifest(setId);
  if (!manifest) return null;

  const [binder, possuidas, estrelas] = await Promise.all([
    getBinder(userId, setId),
    getOwnedIds(userId, setId),
    lista === "estrelas" ? getStarredIds(userId, setId) : Promise.resolve(new Set<string>()),
  ]);

  const posicoes = expandirVariantes(sortCards(manifest.cards, binder.sortRule), setId);
  const alvo =
    lista === "estrelas" ? posicoes.filter((i) => estrelas.has(chave(i))) : posicoes;

  // Cada posicao faltante vira uma carta na folha: faltando a simples E as
  // brilhantes, a mesma arte sai uma vez por bolso a preencher.
  return missingCards(alvo, possuidas, chave).map((i) => ({ ...i, setId }));
}

/**
 * As estrelas de TODAS as colecoes, na ordem da tela inicial.
 *
 * E a lista de desejos do jeito que ela existe na cabeca da crianca: nao e o
 * fichario de uma colecao, sao as cartas que ela quer, de onde quer que venham.
 */
export async function estrelasDoUsuario(userId: string | null): Promise<Estrela[]> {
  const porSet = await starredBySet(userId);
  if (porSet.size === 0) return [];

  // Um round-trip por colecao COM estrela, em paralelo — nao por colecao existente.
  const setIds = listSets()
    .map((s) => s.setId)
    .filter((id) => porSet.has(id));
  const possuidasPorSet = new Map(
    await Promise.all(
      setIds.map(async (id) => [id, await getOwnedIds(userId, id)] as const),
    ),
  );

  const out: Estrela[] = [];
  for (const setId of setIds) {
    const manifest = getManifest(setId);
    if (!manifest) continue; // colecao que saiu do disco: a estrela fica orfa, sem quebrar a tela

    const estrelas = new Set(porSet.get(setId));
    const possuidas = possuidasPorSet.get(setId)!;

    for (const item of expandirVariantes(sortCards(manifest.cards, "number"), setId)) {
      const k = chave(item);
      if (!estrelas.has(k)) continue;
      out.push({ ...item, setId, setName: manifest.setName, owned: possuidas.has(k) });
    }
  }
  return out;
}

/** As estrelas que vao para a folha: as que ele ainda nao tem. */
export async function itensDasEstrelas(userId: string | null): Promise<ItemImpresso[]> {
  const estrelas = await estrelasDoUsuario(userId);
  return estrelas
    .filter((e) => !e.owned)
    .map(({ card, variant, setId }) => ({ card, variant, setId }));
}
