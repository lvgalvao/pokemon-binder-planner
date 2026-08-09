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
  tabela: "owned_card" | "hidden_card",
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

export function getHiddenIds(userId: string | null, setId: string): Promise<Set<string>> {
  return idsDaTabela("hidden_card", userId, setId);
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
 * Esconde ou revela cartas. Esconder tambem apaga a posse: "nao tenho e nao
 * quero" — assim, se a carta voltar a aparecer um dia, nao volta marcada por
 * engano.
 */
export async function setHidden(
  userId: string,
  setId: string,
  cardIds: readonly string[],
  hidden: boolean,
): Promise<void> {
  if (cardIds.length === 0) return;
  const supabase = await createClient();

  if (hidden) {
    const { error } = await supabase.from("hidden_card").upsert(
      cardIds.map((card_id) => ({ user_id: userId, set_id: setId, card_id })),
      { onConflict: "user_id,set_id,card_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(`setHidden(${setId}): ${error.message}`);
    await setOwned(userId, setId, cardIds, false);
    return;
  }

  const { error } = await supabase
    .from("hidden_card")
    .delete()
    .eq("user_id", userId)
    .eq("set_id", setId)
    .in("card_id", cardIds as string[]);
  if (error) throw new Error(`setHidden(${setId}): ${error.message}`);
}

/** Quantas cartas o usuario tem em cada colecao — para a tela inicial. */
export async function ownedCountBySet(userId: string | null): Promise<Map<string, number>> {
  if (!userId) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("owned_count_by_set");
  if (error) throw new Error(`ownedCountBySet: ${error.message}`);

  return new Map((data ?? []).map((r) => [r.set_id, Number(r.n)]));
}
