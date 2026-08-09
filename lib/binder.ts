import { cardNumber } from "./cards";
import type { Card } from "./types";

/** Quantas cartas cabem num fichario inteiro. */
export function binderCapacity(rows: number, columns: number, pageCount: number): number {
  return rows * columns * pageCount;
}

/**
 * Quantas paginas a colecao exige. Calculado, nunca perguntado — e o que elimina
 * o caso "a colecao nao cabe no fichario" do PRD §12.
 */
export function pagesNeeded(total: number, rows: number, columns: number): number {
  const perPage = rows * columns;
  if (perPage <= 0) return 0;
  return Math.ceil(total / perPage);
}

/**
 * Distribui as cartas ja ordenadas em paginas.
 * A ultima pagina fica com `null` nos bolsos que sobram — bolso vazio de verdade,
 * como no fichario fisico. Nada de preenchimento falso.
 */
export function generateSlots<T>(
  sortedCards: readonly T[],
  rows: number,
  columns: number,
): (T | null)[][] {
  const perPage = rows * columns;
  const pageCount = pagesNeeded(sortedCards.length, rows, columns);
  const pages: (T | null)[][] = [];
  for (let p = 0; p < pageCount; p++) {
    const page: (T | null)[] = [];
    for (let s = 0; s < perPage; s++) {
      page.push(sortedCards[p * perPage + s] ?? null);
    }
    pages.push(page);
  }
  return pages;
}

/** As faltantes, preservando a ordem vigente do fichario. */
export function missingCards<T>(
  sorted: readonly T[],
  ownedIds: ReadonlySet<string>,
  chave: (item: T) => string,
): T[] {
  return sorted.filter((item) => !ownedIds.has(chave(item)));
}

export type Progress = { total: number; owned: number; missing: number; percent: number };

export function progress(total: number, ownedCount: number): Progress {
  const owned = Math.min(ownedCount, total);
  return {
    total,
    owned,
    missing: total - owned,
    percent: total === 0 ? 0 : Math.round((owned / total) * 100),
  };
}

/**
 * Em que pagina (base 0) esta a carta de numero `n`. Usado pelo "achar carta":
 * digitou 117, o fichario pula para la.
 */
export function findCardPage<T extends { card: Card }>(
  sorted: readonly T[],
  n: number,
  rows: number,
  columns: number,
): { page: number; slot: number; item: T } | null {
  const index = sorted.findIndex((i) => cardNumber(i.card) === n);
  if (index < 0) return null;
  const perPage = rows * columns;
  return {
    page: Math.floor(index / perPage),
    slot: index % perPage,
    item: sorted[index],
  };
}
