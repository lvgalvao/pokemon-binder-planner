import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * `proxy.ts`, nao `middleware.ts`: o Next 16 renomeou o convention. A doc do
 * Supabase ja usa este nome; o middleware.js continua funcionando mas esta
 * deprecado.
 *
 * O papel aqui e um so: renovar o token de quem JA tem sessao e devolver os
 * cookies atualizados. Nunca criar sessao.
 *
 * Criar aqui seria o caminho obvio — o proxy roda em toda rota, entao "todo
 * mundo ja chega com sessao". Seria tambem um usuario novo por prefetch e por
 * passada de robo, num app publico. A conta nasce no primeiro POST, em
 * lib/session.ts, quando existe de fato uma carta para guardar.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // A chamada em si e o que dispara o refresh quando o token esta perto de
  // vencer. getClaims e nao getSession: getSession nao revalida, e aqui o
  // insumo e um cookie, que o cliente controla.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    /*
     * Tudo, menos o que nunca carrega sessao: estaticos do Next e o favicon.
     * As imagens das cartas nao entram aqui — vem do CDN do Supabase, em outro
     * dominio, e nunca passam por este processo.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
