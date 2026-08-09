import { createClient } from "./supabase/server";

export type Sessao = {
  userId: string;
  /** Conta criada sozinha na primeira marcacao, sem e-mail vinculado. */
  anonima: boolean;
  email: string | null;
};

/**
 * Quem esta pedindo, ou `null` se ninguem.
 *
 * `getClaims()` e nao `getSession()`: getSession devolve o que esta no cookie
 * sem revalidar, e cookie e coisa que o cliente controla. getClaims confere a
 * assinatura do JWT contra as chaves publicas do projeto.
 */
export async function getSessao(): Promise<Sessao | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;
  return {
    userId: data.claims.sub,
    anonima: data.claims.is_anonymous === true,
    email: data.claims.email ?? null,
  };
}

/** Atalho para quem so precisa saber de quem sao as cartas. */
export async function getUserId(): Promise<string | null> {
  return (await getSessao())?.userId ?? null;
}

/**
 * O userId de quem esta pedindo, criando uma conta anonima se ainda nao houver.
 *
 * Chamada SO pelos POSTs. E o coracao do desenho: a crianca abre o app e ja esta
 * usando, sem tela de login, e a conta nasce no instante em que ela marca a
 * primeira carta. Visitar nao cria nada — um robo que varre o site inteiro sai
 * sem ter criado um unico usuario.
 */
export async function requireUserId(): Promise<string> {
  const jaTem = await getUserId();
  if (jaTem) return jaTem;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(`Nao consegui criar a sessao anonima: ${error?.message ?? "sem usuario"}`);
  }
  return data.user.id;
}
