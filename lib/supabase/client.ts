import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../database.types";

/**
 * Cliente do Supabase no navegador. Usado so pelo fluxo de e-mail (mandar o link
 * magico) — marcar carta continua passando pelas rotas, que validam a chave de
 * item contra o manifest antes de gravar.
 *
 * `createBrowserClient` ja e singleton internamente, entao chamar varias vezes
 * nao cria varias conexoes.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
