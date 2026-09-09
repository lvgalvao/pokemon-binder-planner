import { itemKey, type Posicao } from "./types";

/**
 * O arranjo manual: o fichario arrumado a mao.
 *
 * Ate aqui toda posicao era DERIVADA (`sortCards` -> `expandirVariantes` ->
 * `generateSlots`) e nada de posicao era gravado. Isso deu o fichario que se
 * monta sozinho, mas fechava a porta para a unica coisa que a crianca faz de
 * verdade com um fichario fisico: arrumar do jeito dela. Trocar duas cartas de
 * lugar. Deixar um bolso reservado para a que ainda vai chegar. Fazer uma pagina
 * so de favoritos.
 *
 * Este modulo e PURO — sem `node:fs`, sem banco — pela mesma razao que
 * `lib/sheet.ts` e puro: o navegador importa isto, e um `node:fs` no caminho faz
 * o Turbopack falhar com "chunking context does not support external modules".
 *
 * ## O invariante
 *
 * **A mesma chave nunca ocupa dois bolsos.** Nao e regra arbitraria: posse e
 * estrela sao chaveadas por `itemKey`, entao duas posicoes com a mesma chave
 * fariam UMA marcacao acender as duas — e desmarcar uma apagaria a outra. E o
 * mesmo perigo que faz `parseItemKey` recusar sufixo desconhecido. Toda funcao
 * daqui preserva isso, e o banco repete a checagem por baixo.
 */

/**
 * O fichario arrumado, seja de que forem os bolsos.
 *
 * Generico porque os dois lados precisam das MESMAS transicoes sobre materiais
 * diferentes: o banco guarda chaves (`Estado<string>`, o alias `Arranjo`), e a
 * tela mexe em cartas (`Estado<Posicao>`, que e o que ela ja tem em maos e
 * consegue desenhar). Uma implementacao so, e a tela nunca precisa consultar um
 * indice para saber que carta acabou de mover.
 */
export type Estado<T> = {
  /** A ORDEM e o dado. `null` = bolso vazio de proposito. */
  bolsos: (T | null)[];
  /** As que ele TIROU. Sem isto a reconciliacao as devolveria no fim toda vez. */
  fora: T[];
  /**
   * A carta na mao.
   *
   * Gravada, e nao so estado de tela: entre um gesto e o seguinte ela nao esta
   * em `bolsos` nem em `fora`, e sem esta coluna recarregar no meio de uma troca
   * faria a reconciliacao le-la como "nunca esteve" e teleporta-la para o fim do
   * fichario. Trocar duas cartas e recarregar perderia uma delas de vista.
   */
  mao: T | null;
};

/** O arranjo na forma em que ele e gravado e viaja: chaves de item. */
export type Arranjo = Estado<string>;

/**
 * Teto de bolsos. As 27 colecoes somam 7.735 posicoes; um fichario de 12
 * colecoes chega a 4.960. O teto existe para o estouro aparecer como recusa em
 * vez de dado truncado em silencio — e o banco repete o mesmo numero.
 */
export const MAX_BOLSOS = 8000;

export const VAZIO: Arranjo = { bolsos: [], fora: [], mao: null };

export const chaveDe = (p: Posicao): string => itemKey(p.card.id, p.variant);

/** O que a reconciliacao mexeu, para o fichario poder dizer em voz baixa. */
export type Relatorio = {
  /** Cartas que entraram no fim por ainda nao estarem em lugar nenhum. */
  acrescentadas: number;
  /** Bolsos que esvaziaram porque a chave nao resolve mais. */
  esvaziadas: number;
};

/**
 * Congela o fichario como ele esta na tela.
 *
 * Recebe as PAGINAS, e nao a lista corrida, porque os bolsos vazios da fronteira
 * entre colecoes fazem parte do arranjo: entrar no modo nao pode reflowar o
 * fichario debaixo do dedo. Os nulos do FIM sao outra coisa — sao a sobra da
 * ultima folha, nao escolha de ninguem — e por isso sao aparados.
 */
export function congelar(paginas: readonly (readonly (Posicao | null)[])[]): Arranjo {
  const bolsos: (string | null)[] = [];
  for (const pagina of paginas) {
    for (const item of pagina) bolsos.push(item ? chaveDe(item) : null);
  }
  while (bolsos.length > 0 && bolsos[bolsos.length - 1] === null) bolsos.pop();
  return { bolsos, fora: [], mao: null };
}

/**
 * O arranjo gravado, confrontado com as colecoes como elas estao hoje.
 *
 * Devolve o arranjo JA NORMALIZADO junto com a vista resolvida, e os dois tem os
 * mesmos indices — e o que permite ao cliente guardar o arranjo em chaves,
 * renderizar as posicoes e usar o indice do bolso tocado nos dois.
 *
 * Tres coisas podem ter mudado desde a ultima gravacao, e cada uma tem uma regra:
 *
 *  1. **A chave nao resolve mais** (a carta saiu do manifest, o sufixo e
 *     invalido, ou ela ja apareceu num bolso anterior) -> o bolso vira vazio.
 *     Nunca desloca: um deslocamento silencioso bagunçaria o fichario inteiro.
 *  2. **Uma carta das colecoes deste fichario nao esta em lugar nenhum** (nem em
 *     bolso, nem em `fora`, nem na mao) -> entra no FIM, na ordem automatica.
 *     E o que garante que repovoar uma colecao so acrescente: as 49 promos que
 *     ainda dao 404 no CDN vao chegar um dia, e nao podem sumir do fichario
 *     arrumado. A ordem da cauda vem de `universo`, entao duas leituras dao
 *     sempre o mesmo fichario.
 *  3. **`fora` so vale para as colecoes do proprio fichario.** Uma carta puxada
 *     de colecao estranha e depois tirada e esquecida: a regra 2 nunca a reporia,
 *     entao guarda-la so engordaria o array.
 *
 * Nao grava nada — uma leitura nunca deve escrever, pela mesma razao que
 * `getBinder` nao cria linha ao abrir a colecao. O preco e recalcular a cauda a
 * cada leitura ate a crianca tocar em algo, e por isso a funcao e idempotente:
 * resolver o resultado de resolver da exatamente o mesmo arranjo.
 */
export function resolver(
  gravado: Arranjo,
  universo: readonly Posicao[],
  buscar: (key: string) => Posicao | null,
): {
  arranjo: Arranjo;
  bolsos: (Posicao | null)[];
  fora: Posicao[];
  mao: Posicao | null;
  relatorio: Relatorio;
} {
  const universoKeys = new Set(universo.map(chaveDe));
  const usadas = new Set<string>();
  const bolsos: (Posicao | null)[] = [];
  const chaves: (string | null)[] = [];
  let esvaziadas = 0;

  for (const key of gravado.bolsos) {
    // A chave repetida cai aqui pelo `usadas`: vale a PRIMEIRA ocorrencia, e a
    // segunda vira bolso vazio em vez de um segundo bolso da mesma carta.
    const p = key === null || usadas.has(key) ? null : buscar(key);
    if (key !== null && p === null) esvaziadas++;
    if (p !== null && key !== null) usadas.add(key);
    bolsos.push(p);
    chaves.push(p === null ? null : key);
  }

  // A mao sai antes da cauda: sem isto a carta que ele esta segurando entraria
  // tambem no fim do fichario, e existiria em dois lugares.
  const chaveNaMao = gravado.mao;
  const mao =
    chaveNaMao === null || usadas.has(chaveNaMao) ? null : buscar(chaveNaMao);
  if (mao !== null && chaveNaMao !== null) usadas.add(chaveNaMao);

  const fora: Posicao[] = [];
  const foraKeys: string[] = [];
  for (const key of gravado.fora) {
    if (usadas.has(key) || !universoKeys.has(key)) continue;
    const p = buscar(key);
    if (!p) continue;
    usadas.add(key);
    fora.push(p);
    foraKeys.push(key);
  }

  let acrescentadas = 0;
  for (const p of universo) {
    const key = chaveDe(p);
    if (usadas.has(key)) continue;
    usadas.add(key);
    bolsos.push(p);
    chaves.push(key);
    acrescentadas++;
  }

  return {
    arranjo: { bolsos: chaves, fora: foraKeys, mao: mao === null ? null : chaveNaMao },
    bolsos,
    fora,
    mao,
    relatorio: { acrescentadas, esvaziadas },
  };
}

/**
 * O gesto, inteiro.
 *
 * > Tocar num bolso: a carta que estava nele vai para a sua mao; a carta que
 * > estava na sua mao fica nele.
 *
 * Uma troca, uma linha — e dela saem os quatro casos sem nenhum modo escondido:
 * pegar (mao vazia + bolso cheio), colocar (mao cheia + bolso vazio), trocar
 * (as duas cheias) e devolver (tocar de novo no bolso de onde ela saiu). Mao
 * vazia em bolso vazio nao faz nada, o que tambem sai de graca.
 *
 * O invariante se sustenta porque isto e uma PERMUTACAO: nenhuma chave nasce
 * nem morre aqui, so trocam de lugar.
 */
export function tocar<T>(estado: Estado<T>, i: number): Estado<T> {
  if (i < 0 || i >= estado.bolsos.length) return estado;
  const bolsos = [...estado.bolsos];
  const naquele = bolsos[i];
  bolsos[i] = estado.mao;
  return { ...estado, bolsos, mao: naquele };
}

/**
 * Tira do fichario a carta que esta na mao: o bolso de onde ela saiu ja esta
 * vazio, e ela vai para a gaveta em vez de voltar.
 *
 * So entra em `fora` a carta das colecoes do proprio fichario — ver a regra 3 de
 * `resolver`. A de fora e simplesmente esquecida, porque nada iria repo-la.
 */
export function tirar<T>(
  estado: Estado<T>,
  universoKeys: ReadonlySet<string>,
  chave: (item: T) => string,
): Estado<T> {
  if (estado.mao === null) return estado;
  return {
    ...estado,
    mao: null,
    fora: universoKeys.has(chave(estado.mao))
      ? [...estado.fora, estado.mao]
      : estado.fora,
  };
}

/**
 * Puxa uma carta para a mao — da gaveta das 27 colecoes, ou de volta de `fora`.
 *
 * Se ela ja ocupa um bolso, o bolso e esvaziado em vez de a carta ser duplicada:
 * puxar uma carta que ja esta no fichario e MOVE-LA, e essa e a unica leitura
 * que preserva o invariante.
 *
 * So com a mao vazia. Com a mao cheia nao ha o que fazer que nao seja perder uma
 * das duas, entao a gaveta trava o gesto em vez de escolher por ele.
 */
export function puxar<T>(
  estado: Estado<T>,
  item: T,
  chave: (item: T) => string,
): Estado<T> {
  if (estado.mao !== null) return estado;
  const key = chave(item);
  return {
    bolsos: estado.bolsos.map((b) => (b !== null && chave(b) === key ? null : b)),
    fora: estado.fora.filter((f) => chave(f) !== key),
    mao: item,
  };
}

/** O estado da tela na forma que viaja e e gravada. */
export function serializar<T>(estado: Estado<T>, chave: (item: T) => string): Arranjo {
  return {
    bolsos: estado.bolsos.map((b) => (b === null ? null : chave(b))),
    fora: estado.fora.map(chave),
    mao: estado.mao === null ? null : chave(estado.mao),
  };
}
