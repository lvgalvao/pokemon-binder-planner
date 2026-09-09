import { createClient } from "./supabase/server";
import {
  LAYOUTS,
  layoutKey,
  type Alvo,
  type Layout,
  type ListaDeDesejos,
  type SortRule,
} from "./types";
import type { Arranjo } from "./arranjo";

/**
 * Estado do usuario, em Postgres com RLS (migracoes em supabase/migrations/).
 *
 * Tres tabelas e meia duzia de consultas — a mesma forma que o SQLite tinha,
 * agora com dono. Sem ORM pelo mesmo motivo de antes: seria mais peca movel que
 * problema resolvido.
 *
 * Todo mundo aqui recebe `userId` explicito em vez de ir buscar a sessao por
 * dentro. E o que deixa "sem sessao = fichario vazio" visivel em cada chamada,
 * em vez de escondido numa camada — e este app abre sem sessao de proposito.
 */

export type BinderState = { setId: string } & Layout & { sortRule: SortRule };

const PADRAO = { ...LAYOUTS["3x3"], sortRule: "number" as const };

/**
 * O fichario da colecao, ou os padroes.
 *
 * Nao cria linha na leitura, ao contrario da versao SQLite: abrir uma colecao
 * viraria uma escrita a cada visita, por rede, para gravar exatamente os valores
 * padrao. A linha nasce quando a crianca de fato muda o formato.
 */
export async function getBinder(
  userId: string | null,
  setId: string,
): Promise<BinderState> {
  if (!userId) return { setId, ...PADRAO };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("binder")
    .select("rows, columns, sort_rule")
    .eq("user_id", userId)
    .eq("set_id", setId)
    .maybeSingle();

  if (error) throw new Error(`getBinder(${setId}): ${error.message}`);
  if (!data) return { setId, ...PADRAO };

  // Registros gravados antes da correcao de orientacao podem trazer uma
  // combinacao que nao existe mais (ex.: 3 colunas x 4 linhas). Cai no formato
  // padrao em vez de renderizar um fichario que nenhum botao consegue selecionar.
  const conhecido = LAYOUTS[layoutKey(data.columns, data.rows)] ?? LAYOUTS["3x3"];

  return {
    setId,
    rows: conhecido.rows,
    columns: conhecido.columns,
    sortRule: data.sort_rule === "rarity" ? "rarity" : "number",
  };
}

export async function updateBinder(
  userId: string,
  setId: string,
  patch: Partial<Layout & { sortRule: SortRule }>,
): Promise<void> {
  const atual = await getBinder(userId, setId);
  const supabase = await createClient();

  // Upsert em vez de update: a linha pode nao existir, porque a leitura nao a
  // cria. Mandar o estado inteiro deixa o insert e o update com o mesmo corpo.
  const { error } = await supabase.from("binder").upsert(
    {
      user_id: userId,
      set_id: setId,
      rows: patch.rows ?? atual.rows,
      columns: patch.columns ?? atual.columns,
      sort_rule: patch.sortRule ?? atual.sortRule,
    },
    { onConflict: "user_id,set_id" },
  );

  if (error) throw new Error(`updateBinder(${setId}): ${error.message}`);
}

/**
 * O teto de linhas de uma consulta de marcacao.
 *
 * Era 5.000, calibrado para UMA colecao (a maior, `me2pt5`, tem 651 bolsos). O
 * arranjo manual mudou a conta: uma carta pode vir de qualquer colecao, entao a
 * consulta passa a varrer todos os sets presentes — e as 27 colecoes somam 7.735
 * bolsos. Alguem com tudo marcado batia no teto, e o codigo LANCA ao bater: a
 * pagina daria 500 em vez de mostrar o fichario.
 *
 * Continua explicito, e nao implicito, pelo motivo de sempre: passar do teto do
 * PostgREST em silencio faria cartas marcadas sumirem da tela sem erro nenhum.
 */
const TETO_DE_LINHAS = 20000;

async function idsDaTabela(
  tabela: "owned_card" | "starred_card",
  userId: string | null,
  setIds: readonly string[],
): Promise<Set<string>> {
  if (!userId || setIds.length === 0) return new Set();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(tabela)
    .select("card_id")
    .eq("user_id", userId)
    .in("set_id", setIds as string[])
    .limit(TETO_DE_LINHAS);

  const alvo = setIds.length === 1 ? setIds[0] : `${setIds.length} colecoes`;
  if (error) throw new Error(`${tabela}(${alvo}): ${error.message}`);
  if (data.length === TETO_DE_LINHAS) {
    throw new Error(
      `${tabela}(${alvo}) bateu o teto de ${TETO_DE_LINHAS} linhas — ` +
        `o fichario estaria incompleto na tela.`,
    );
  }
  return new Set(data.map((r) => r.card_id));
}

export function getOwnedIds(userId: string | null, setId: string): Promise<Set<string>> {
  return idsDaTabela("owned_card", userId, [setId]);
}

/** As cartas que ele mais quer, nesta colecao. */
export function getStarredIds(userId: string | null, setId: string): Promise<Set<string>> {
  return idsDaTabela("starred_card", userId, [setId]);
}

/**
 * As mesmas duas perguntas, para VARIAS colecoes de uma vez.
 *
 * Existem porque o arranjo manual quebrou a premissa de que o fichario conhece
 * as suas colecoes de antemao: uma carta puxada da gaveta traz a colecao dela
 * junto, e a posse dela vive no set de ORIGEM. Sem isto, a carta trazida de fora
 * apareceria como "nao tenho" mesmo estando marcada — e um `in` custa o mesmo
 * round-trip que um `eq`.
 */
export function ownedIdsDeSets(
  userId: string | null,
  setIds: readonly string[],
): Promise<Set<string>> {
  return idsDaTabela("owned_card", userId, setIds);
}

export function starredIdsDeSets(
  userId: string | null,
  setIds: readonly string[],
): Promise<Set<string>> {
  return idsDaTabela("starred_card", userId, setIds);
}

/**
 * Todas as estrelas, de todas as colecoes, para a lista de desejos da tela
 * inicial. Uma consulta so: a lista e curta por natureza — sao as cartas que a
 * crianca escolheu a dedo, nao uma colecao inteira — e ir set a set custaria um
 * round-trip por colecao para juntar tudo numa tela.
 *
 * Traz a lista de cada estrela junto, e nao numa segunda consulta: a tela nao
 * mostra "as estrelas" e sim as estrelas SEPARADAS por lista, entao a lista e
 * parte da estrela na unica pergunta que se faz aqui.
 */
export async function starredBySet(
  userId: string | null,
): Promise<Map<string, { cardId: string; listaId: string }[]>> {
  if (!userId) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("starred_card")
    .select("set_id, card_id, wishlist_id")
    .eq("user_id", userId)
    .limit(TETO_DE_LINHAS);

  if (error) throw new Error(`starredBySet: ${error.message}`);

  const out = new Map<string, { cardId: string; listaId: string }[]>();
  for (const { set_id, card_id, wishlist_id } of data) {
    const estrela = { cardId: card_id, listaId: wishlist_id };
    const lista = out.get(set_id);
    lista ? lista.push(estrela) : out.set(set_id, [estrela]);
  }
  return out;
}

/**
 * As estrelas destas colecoes, com a lista de cada uma — o que o fichario carrega.
 *
 * Devolve Map e nao Set porque o bolso precisa de duas respostas diferentes: a
 * estrela ACENDE por existir (a marca e uma so, tenha a carta a lista que
 * tiver), e o visualizador precisa dizer EM QUAL lista ela esta. Um Set daria a
 * primeira e perderia a segunda.
 */
export async function starredComLista(
  userId: string | null,
  setIds: readonly string[],
): Promise<Map<string, string>> {
  if (!userId || setIds.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("starred_card")
    .select("card_id, wishlist_id")
    .eq("user_id", userId)
    .in("set_id", setIds as string[])
    .limit(TETO_DE_LINHAS);

  if (error) throw new Error(`starredComLista(${setIds.length}): ${error.message}`);
  return new Map(data.map((r) => [r.card_id, r.wishlist_id]));
}

/** Marca ou desmarca varias cartas de uma vez — usado pelo "tenho todas desta pagina". */
export async function setOwned(
  userId: string,
  setId: string,
  cardIds: readonly string[],
  owned: boolean,
): Promise<void> {
  if (cardIds.length === 0) return;
  const supabase = await createClient();

  const { error } = owned
    ? await supabase.from("owned_card").upsert(
        cardIds.map((card_id) => ({ user_id: userId, set_id: setId, card_id })),
        { onConflict: "user_id,set_id,card_id", ignoreDuplicates: true },
      )
    : await supabase
        .from("owned_card")
        .delete()
        .eq("user_id", userId)
        .eq("set_id", setId)
        .in("card_id", cardIds as string[]);

  if (error) throw new Error(`setOwned(${setId}): ${error.message}`);
}

/**
 * Poe ou tira a estrela — "quero muito essa".
 *
 * Ao contrario do esconder que existia aqui antes, estrela NAO mexe na posse: as
 * duas marcas respondem perguntas diferentes ("ja tenho?" e "quero muito?") e
 * uma estrela numa carta que ele acabou de conseguir e a melhor noticia do app,
 * nao uma contradicao a resolver.
 */
export async function setStarred(
  userId: string,
  setId: string,
  cardIds: readonly string[],
  starred: boolean,
  listaId?: string,
): Promise<void> {
  if (cardIds.length === 0) return;
  const supabase = await createClient();

  if (!starred) {
    // Tirar a estrela nao pergunta de que lista ela era: a marca e uma so, e o
    // gesto que a apaga e o mesmo esteja ela onde estiver.
    const { error } = await supabase
      .from("starred_card")
      .delete()
      .eq("user_id", userId)
      .eq("set_id", setId)
      .in("card_id", cardIds as string[]);
    if (error) throw new Error(`setStarred(${setId}): ${error.message}`);
    return;
  }

  if (!listaId) throw new Error("setStarred: pos estrela sem dizer em que lista");

  // `ignoreDuplicates` FALSE de proposito, ao contrario de `setOwned`: o conflito
  // aqui nao e ruido a descartar, e o gesto de MUDAR a carta de lista. Ignorando,
  // por a estrela numa carta que ja esta em outra lista nao faria nada — e a
  // crianca veria a estrela acesa na lista errada, sem erro nenhum.
  const { error } = await supabase.from("starred_card").upsert(
    cardIds.map((card_id) => ({
      user_id: userId,
      set_id: setId,
      card_id,
      wishlist_id: listaId,
    })),
    { onConflict: "user_id,set_id,card_id" },
  );

  if (error) throw new Error(`setStarred(${setId}): ${error.message}`);
}

/**
 * Uma lista de desejos: um nome, e as estrelas que apontam para ela.
 *
 * A estrela era uma marca global — "quero muito", todas no mesmo balaio. Mas o
 * desejo ja vinha separado na cabeca da crianca ("as do aniversario", "as que eu
 * troco com o primo") e nao tinha onde existir. A lista e esse rotulo, e so isso:
 * as cartas continuam em `starred_card`, com a mesma chave de sempre.
 */
export type { ListaDeDesejos } from "./types";

/** O nome que a primeira lista recebe: o mesmo que a tela sempre usou. */
export const NOME_DA_PRIMEIRA_LISTA = "As que eu mais quero";

/** Quantas listas cabem. Passar disso e ter uma gaveta de gavetas. */
export const MAX_LISTAS = 12;

/** As listas do usuario, da mais antiga para a mais nova — a ordem em que ele as fez. */
export async function listarListas(userId: string | null): Promise<ListaDeDesejos[]> {
  if (!userId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wishlist")
    .select("id, nome")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`listarListas: ${error.message}`);
  return data;
}

export async function criarLista(userId: string, nome: string): Promise<ListaDeDesejos> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wishlist")
    .insert({ user_id: userId, nome })
    .select("id, nome")
    .single();

  if (error) throw new Error(`criarLista: ${error.message}`);
  return data;
}

export async function renomearLista(
  userId: string,
  id: string,
  nome: string,
): Promise<void> {
  const supabase = await createClient();
  // `eq(user_id)` alem da RLS para que um id de outra pessoa nao vire um update
  // de zero linhas silencioso — mesma defesa de `updateFichario`.
  const { error } = await supabase
    .from("wishlist")
    .update({ nome })
    .eq("user_id", userId)
    .eq("id", id);

  if (error) throw new Error(`renomearLista(${id}): ${error.message}`);
}

/**
 * Apaga a lista E as estrelas dela (o `on delete cascade` da FK composta).
 *
 * Ao contrario de desfazer um fichario montado, aqui a marca MORRE junto — e
 * tem de morrer: a estrela era o desejo daquela lista, e sobreviver a ela
 * significaria reaparecer numa lista que a crianca nao escolheu. Quem chama
 * avisa quantas cartas vao junto antes de perguntar.
 */
export async function apagarLista(userId: string, id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("wishlist")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);

  // 22P02 = o id nem e um uuid. Nao existe lista com esse id, entao apagar "ja
  // esta feito" — mesma leitura de `apagarFichario`.
  if (error && error.code !== "22P02") {
    throw new Error(`apagarLista(${id}): ${error.message}`);
  }
}

/**
 * A lista onde a estrela cai quando ninguem disse qual — e a cria, se for a
 * primeira de todas.
 *
 * E o que preserva o gesto de sempre: tres toques numa carta continuam
 * funcionando sem que a crianca tenha de criar nada antes. A lista nasce da
 * primeira estrela, como a conta anonima nasce da primeira marcacao.
 */
export async function listaPadrao(userId: string): Promise<string> {
  const existentes = await listarListas(userId);
  if (existentes.length > 0) return existentes[0].id;
  return (await criarLista(userId, NOME_DA_PRIMEIRA_LISTA)).id;
}

/**
 * A lista pertence mesmo a ele?
 *
 * A FK composta do banco ja recusaria a estrela na lista alheia, mas ali o erro
 * chega como violacao de constraint — e a rota precisa responder 404 antes de
 * gravar coisa nenhuma.
 */
export async function listaExiste(userId: string, id: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wishlist")
    .select("id")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (error.code === "22P02") return false;
    throw new Error(`listaExiste(${id}): ${error.message}`);
  }
  return data !== null;
}

/** Quantas cartas o usuario tem em cada colecao — para a tela inicial. */
export async function ownedCountBySet(userId: string | null): Promise<Map<string, number>> {
  if (!userId) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("owned_count_by_set");
  if (error) throw new Error(`ownedCountBySet: ${error.message}`);

  return new Map((data ?? []).map((r) => [r.set_id, Number(r.n)]));
}

/**
 * Um fichario montado: varias colecoes numa sequencia so.
 *
 * A ordem de `setIds` E o fichario — e a ordem em que as colecoes se sucedem nas
 * folhas. Layout e ordenacao vivem aqui pelo mesmo motivo que vivem em `binder`:
 * sao escolhas sobre a pasta fisica, nao sobre as cartas.
 */
export type Fichario = {
  id: string;
  nome: string;
  setIds: string[];
} & Layout & { sortRule: SortRule };

/** Quantas colecoes cabem num fichario montado — o mesmo teto do check da tabela. */
export const MIN_COLECOES_NO_FICHARIO = 2;
export const MAX_COLECOES_NO_FICHARIO = 12;

type LinhaDeFichario = {
  id: string;
  nome: string;
  set_ids: string[];
  rows: number;
  columns: number;
  sort_rule: string;
};

function paraFichario(linha: LinhaDeFichario): Fichario {
  // Mesma defesa de getBinder: uma combinacao que nao existe mais cai no padrao
  // em vez de renderizar um fichario que nenhum botao consegue selecionar.
  const conhecido = LAYOUTS[layoutKey(linha.columns, linha.rows)] ?? LAYOUTS["3x3"];
  return {
    id: linha.id,
    nome: linha.nome,
    setIds: linha.set_ids,
    rows: conhecido.rows,
    columns: conhecido.columns,
    sortRule: linha.sort_rule === "rarity" ? "rarity" : "number",
  };
}

const CAMPOS_DO_FICHARIO = "id, nome, set_ids, rows, columns, sort_rule";

/** Os ficharios montados, do mais antigo para o mais novo — a ordem em que ele os fez. */
export async function listarFicharios(userId: string | null): Promise<Fichario[]> {
  if (!userId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("binder_group")
    .select(CAMPOS_DO_FICHARIO)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`listarFicharios: ${error.message}`);
  return data.map(paraFichario);
}

export async function getFichario(
  userId: string | null,
  id: string,
): Promise<Fichario | null> {
  if (!userId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("binder_group")
    .select(CAMPOS_DO_FICHARIO)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  // Um id que nao e uuid faz o Postgres reclamar de sintaxe (22P02). Isso e uma
  // URL digitada errada, nao uma falha: vira 404 como qualquer fichario que nao
  // existe, em vez de derrubar a pagina.
  if (error) {
    if (error.code === "22P02") return null;
    throw new Error(`getFichario(${id}): ${error.message}`);
  }
  return data ? paraFichario(data) : null;
}

export async function criarFichario(
  userId: string,
  nome: string,
  setIds: readonly string[],
): Promise<Fichario> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("binder_group")
    .insert({ user_id: userId, nome, set_ids: setIds as string[] })
    .select(CAMPOS_DO_FICHARIO)
    .single();

  if (error) throw new Error(`criarFichario: ${error.message}`);
  return paraFichario(data);
}

export async function updateFichario(
  userId: string,
  id: string,
  patch: Partial<Layout & { sortRule: SortRule }>,
): Promise<void> {
  const supabase = await createClient();
  const campos: { rows?: number; columns?: number; sort_rule?: SortRule } = {};
  if (patch.rows !== undefined) campos.rows = patch.rows;
  if (patch.columns !== undefined) campos.columns = patch.columns;
  if (patch.sortRule !== undefined) campos.sort_rule = patch.sortRule;
  if (Object.keys(campos).length === 0) return;

  // Update e nao upsert: a linha ja existe — o fichario montado, ao contrario do
  // da colecao, nasce de um gesto explicito. `eq(user_id)` alem da RLS para que
  // um id de outra pessoa nao vire um update de zero linhas silencioso.
  const { error } = await supabase
    .from("binder_group")
    .update(campos)
    .eq("user_id", userId)
    .eq("id", id);

  if (error) throw new Error(`updateFichario(${id}): ${error.message}`);
}

/**
 * Desfaz o agrupamento. NAO toca em posse nem em estrela: as cartas sempre foram
 * da colecao, e o fichario montado era so a ordem em que elas apareciam juntas.
 */
export async function apagarFichario(userId: string, id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("binder_group")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);

  // 22P02 = o id nem e um uuid. Nao existe fichario com esse id, entao apagar
  // "ja esta feito" — mesma leitura de getFichario.
  if (error && error.code !== "22P02") {
    throw new Error(`apagarFichario(${id}): ${error.message}`);
  }
}

/**
 * O arranjo manual — o fichario arrumado a mao.
 *
 * Guarda so a ORDEM DOS BOLSOS. Posse e estrela continuam onde estavam,
 * chaveadas por `itemKey` e nao por posicao: mover uma carta nao pode custar uma
 * marcacao, e nao custa, porque `owned_card` nunca soube onde a carta estava.
 *
 * A chave inclui o FORMATO DA FOLHA. Uma folha de 4 bolsos e outra folha:
 * reflowar um arranjo de 3x3 para 4x3 preservaria o dado e destruiria o desenho.
 * Assim, trocar de formato recongela do automatico e VOLTAR restaura o que ele
 * arrumou — no maximo quatro linhas por fichario, uma por formato.
 */

/** Onde o arranjo e gravado, na forma em que a tabela o discrimina. */
function colunasDoAlvo(alvo: Alvo): { set_id: string | null; group_id: string | null } {
  return alvo.tipo === "colecao"
    ? { set_id: alvo.setId, group_id: null }
    : { set_id: null, group_id: alvo.id };
}

/**
 * O arranjo gravado para este alvo NESTE formato de folha, ou `null` se ele
 * ainda nao arrumou nada — e ai o fichario e o automatico de sempre.
 *
 * Nao cria linha na leitura, como `getBinder` nao cria: abrir um fichario nunca
 * e uma escrita.
 */
export async function getArranjo(
  userId: string | null,
  alvo: Alvo,
  layout: Layout,
): Promise<Arranjo | null> {
  if (!userId) return null;

  const colunas = colunasDoAlvo(alvo);
  const supabase = await createClient();
  let q = supabase
    .from("binder_arranjo")
    .select("bolsos, fora, mao")
    .eq("user_id", userId)
    .eq("rows", layout.rows)
    .eq("columns", layout.columns);
  q = alvo.tipo === "colecao"
    ? q.eq("set_id", colunas.set_id!)
    : q.eq("group_id", colunas.group_id!);

  const { data, error } = await q.maybeSingle();

  // Um id que nao e uuid faz o Postgres reclamar de sintaxe (22P02). E URL
  // digitada errada, nao falha: vale como "nao ha arranjo", igual a getFichario.
  if (error) {
    if (error.code === "22P02") return null;
    throw new Error(`getArranjo: ${error.message}`);
  }
  if (!data) return null;

  // O gerador de tipos do Supabase nao sabe que um text[] pode ter NULL dentro,
  // e declara `string[]`. O NULL e o bolso vazio de proposito — o dado esta
  // certo, a declaracao e que e mais estreita que a coluna.
  return {
    bolsos: data.bolsos as unknown as (string | null)[],
    fora: data.fora,
    mao: data.mao,
  };
}

/** Grava o arranjo inteiro. O estado da tela E o corpo do pedido. */
export async function salvarArranjo(
  userId: string,
  alvo: Alvo,
  layout: Layout,
  arranjo: Arranjo,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("binder_arranjo").upsert(
    {
      user_id: userId,
      ...colunasDoAlvo(alvo),
      rows: layout.rows,
      columns: layout.columns,
      bolsos: arranjo.bolsos as unknown as string[],
      fora: arranjo.fora,
      mao: arranjo.mao,
      atualizado_em: new Date().toISOString(),
    },
    {
      onConflict:
        alvo.tipo === "colecao"
          ? "user_id,set_id,rows,columns"
          : "user_id,group_id,rows,columns",
    },
  );

  if (error) throw new Error(`salvarArranjo: ${error.message}`);
}

/**
 * Volta ao automatico. Apaga o arranjo de TODOS os formatos deste alvo: "arrumar
 * de novo" e uma frase sobre o fichario, nao sobre a folha que esta na tela —
 * apagar so o 3x3 e deixar o 4x3 arrumado seria uma surpresa guardada.
 */
export async function apagarArranjo(userId: string, alvo: Alvo): Promise<void> {
  const supabase = await createClient();
  const base = supabase.from("binder_arranjo").delete().eq("user_id", userId);
  const { error } =
    alvo.tipo === "colecao"
      ? await base.eq("set_id", alvo.setId)
      : await base.eq("group_id", alvo.id);

  if (error && error.code !== "22P02") {
    throw new Error(`apagarArranjo: ${error.message}`);
  }
}

/**
 * Quais ficharios estao arrumados a mao — para a tela inicial poder dizer isso
 * no cartao. E trabalho da crianca; merece aparecer.
 */
export async function alvosArrumados(
  userId: string | null,
): Promise<{ setIds: Set<string>; grupoIds: Set<string> }> {
  const vazio = { setIds: new Set<string>(), grupoIds: new Set<string>() };
  if (!userId) return vazio;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("binder_arranjo")
    .select("set_id, group_id")
    .eq("user_id", userId);

  if (error) throw new Error(`alvosArrumados: ${error.message}`);

  for (const r of data) {
    if (r.set_id) vazio.setIds.add(r.set_id);
    if (r.group_id) vazio.grupoIds.add(r.group_id);
  }
  return vazio;
}
