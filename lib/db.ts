import { createClient } from "./supabase/server";
import { LAYOUTS, layoutKey, type Layout, type SortRule } from "./types";

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
 * Um set expandido chega a ~500 posicoes (sv7 vai de 175 cartas a 300 bolsos).
 * O teto padrao de resposta do PostgREST e 1.000 linhas, e passar dele
 * silenciosamente faria cartas marcadas sumirem da tela. O limite explicito
 * deixa o teto visivel aqui em vez de virar bug de dado faltando.
 */
const TETO_DE_LINHAS = 5000;

async function idsDaTabela(
  tabela: "owned_card" | "starred_card",
  userId: string | null,
  setId: string,
): Promise<Set<string>> {
  if (!userId) return new Set();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(tabela)
    .select("card_id")
    .eq("user_id", userId)
    .eq("set_id", setId)
    .limit(TETO_DE_LINHAS);

  if (error) throw new Error(`${tabela}(${setId}): ${error.message}`);
  if (data.length === TETO_DE_LINHAS) {
    throw new Error(
      `${tabela}(${setId}) bateu o teto de ${TETO_DE_LINHAS} linhas — ` +
        `o fichario estaria incompleto na tela.`,
    );
  }
  return new Set(data.map((r) => r.card_id));
}

export function getOwnedIds(userId: string | null, setId: string): Promise<Set<string>> {
  return idsDaTabela("owned_card", userId, setId);
}

/** As cartas que ele mais quer, nesta colecao. */
export function getStarredIds(userId: string | null, setId: string): Promise<Set<string>> {
  return idsDaTabela("starred_card", userId, setId);
}

/**
 * Todas as estrelas, de todas as colecoes, para a lista de desejos da tela
 * inicial. Uma consulta so: a lista e curta por natureza — sao as cartas que a
 * crianca escolheu a dedo, nao uma colecao inteira — e ir set a set custaria um
 * round-trip por colecao para juntar tudo numa tela.
 */
export async function starredBySet(
  userId: string | null,
): Promise<Map<string, string[]>> {
  if (!userId) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("starred_card")
    .select("set_id, card_id")
    .eq("user_id", userId)
    .limit(TETO_DE_LINHAS);

  if (error) throw new Error(`starredBySet: ${error.message}`);

  const out = new Map<string, string[]>();
  for (const { set_id, card_id } of data) {
    const lista = out.get(set_id);
    lista ? lista.push(card_id) : out.set(set_id, [card_id]);
  }
  return out;
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
): Promise<void> {
  if (cardIds.length === 0) return;
  const supabase = await createClient();

  const { error } = starred
    ? await supabase.from("starred_card").upsert(
        cardIds.map((card_id) => ({ user_id: userId, set_id: setId, card_id })),
        { onConflict: "user_id,set_id,card_id", ignoreDuplicates: true },
      )
    : await supabase
        .from("starred_card")
        .delete()
        .eq("user_id", userId)
        .eq("set_id", setId)
        .in("card_id", cardIds as string[]);

  if (error) throw new Error(`setStarred(${setId}): ${error.message}`);
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
