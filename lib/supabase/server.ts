import { createServerClient } from "@supabase/ssr";
import type { Database } from "../database.types";
import { cookies } from "next/headers";

/**
 * Cliente do Supabase para o servidor, amarrado aos cookies DESTE pedido.
 *
 * Um por pedido, sempre: no servidor o cliente e essencialmente um `fetch`
 * pre-configurado com os cookies de quem esta pedindo. Reaproveitar entre
 * pedidos entregaria a sessao de um usuario para outro.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component nao pode gravar cookie. Nao e problema: quem
            // renova a sessao e o proxy.ts, que roda antes e grava na resposta.
          }
        },
      },
    },
  );
}
