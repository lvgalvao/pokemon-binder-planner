import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Onde o link do e-mail cai.
 *
 * Dois fluxos chegam aqui e o resultado e o mesmo para quem usa:
 *
 *   email_change  a conta anonima ganha e-mail. MESMO user_id — e por isso que
 *                 nenhuma carta se perde no caminho.
 *   magiclink     um aparelho novo alcanca um fichario que ja existe.
 *
 * O `?proximo=` volta a pessoa para a pagina de onde ela pediu o link, em vez de
 * jogar todo mundo na tela inicial. So caminho relativo: aceitar URL absoluta
 * aqui seria um redirecionador aberto de brinde.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const bruto = url.searchParams.get("proximo") ?? "/";
  const proximo = bruto.startsWith("/") && !bruto.startsWith("//") ? bruto : "/";

  if (!token_hash || !type) {
    redirect("/auth/erro?motivo=incompleto");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  // O motivo mais comum e o link ter vencido ou ja ter sido usado — e a pagina
  // de erro tem um botao so: pedir outro.
  if (error) {
    redirect(`/auth/erro?motivo=${encodeURIComponent(error.message)}`);
  }

  redirect(proximo);
}
