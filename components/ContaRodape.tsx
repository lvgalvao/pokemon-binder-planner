"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * A conta, no rodape.
 *
 * Fica no fim e em voz baixa de proposito, no mesmo registro do botao de PDF:
 * e acao de adulto. A crianca nunca precisa passar por aqui — ela abre o app e
 * ja esta marcando carta.
 *
 * Sao tres estados, e a criacao preguiçosa da conta e o que os deixa simples:
 * como a conta anonima so nasce na primeira carta marcada, "anonima" ja
 * significa "tem fichario para perder".
 *
 *   sem sessao  -> "Ja tem um fichario? Entrar"        (aparelho novo)
 *   anonima     -> "Guardado so neste aparelho" + Guardar
 *   permanente  -> "Guardado em <e-mail>" + Sair
 */
type Props = {
  autenticado: boolean;
  anonima: boolean;
  email: string | null;
};

type Estado =
  | { tipo: "parado" }
  | { tipo: "formulario" }
  | { tipo: "enviando" }
  | { tipo: "enviado"; email: string }
  | { tipo: "jaExiste"; email: string }
  | { tipo: "erro"; mensagem: string };

export default function ContaRodape({ autenticado, anonima, email }: Props) {
  const [estado, setEstado] = useState<Estado>({ tipo: "parado" });
  const [valor, setValor] = useState("");
  const router = useRouter();

  const permanente = autenticado && !anonima;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const endereco = valor.trim();
    if (!endereco) return;

    setEstado({ tipo: "enviando" });
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/confirm?proximo=${encodeURIComponent(
      window.location.pathname,
    )}`;

    // Conta anonima: vincular o e-mail A ELA preserva o user_id, e com ele todas
    // as cartas. Sem sessao: e um aparelho novo querendo alcancar um fichario
    // que ja existe, entao e login.
    const { error } = anonima
      ? await supabase.auth.updateUser({ email: endereco }, { emailRedirectTo: redirectTo })
      : await supabase.auth.signInWithOtp({
          email: endereco,
          options: { emailRedirectTo: redirectTo },
        });

    if (!error) return setEstado({ tipo: "enviado", email: endereco });

    // O e-mail ja pertence a outra conta. Nao da para fundir os dois ficharios
    // sem adivinhar qual carta vale — e adivinhar errado apaga colecao. Entao
    // pergunta, e diz em voz alta o que se perde.
    if (/already|registered|exists/i.test(error.message)) {
      return setEstado({ tipo: "jaExiste", email: endereco });
    }
    setEstado({ tipo: "erro", mensagem: error.message });
  }

  async function entrarNaContaExistente(endereco: string) {
    setEstado({ tipo: "enviando" });
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: endereco,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
        shouldCreateUser: false,
      },
    });
    setEstado(
      error ? { tipo: "erro", mensagem: error.message } : { tipo: "enviado", email: endereco },
    );
  }

  async function sair() {
    await createClient().auth.signOut();
    router.refresh();
  }

  return (
    <footer className="mx-auto mt-12 max-w-md border-t border-(--color-vinco) px-5 pt-6 pb-10 text-center text-sm text-(--color-tinta-fraca)">
      {estado.tipo === "enviado" ? (
        <p>
          Enviamos um link para <strong className="font-semibold">{estado.email}</strong>.
          <br />
          Abra no aparelho onde você quer usar o fichário.
        </p>
      ) : estado.tipo === "jaExiste" ? (
        <div className="space-y-3">
          <p>
            <strong className="font-semibold">{estado.email}</strong> já tem um fichário
            guardado.
          </p>
          <p>
            Dá para entrar nele, mas as cartas marcadas{" "}
            <strong className="font-semibold">neste aparelho</strong> ficam para trás.
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => entrarNaContaExistente(estado.email)}
              className="min-h-11 rounded-full bg-(--color-tinta) px-4 font-medium text-(--color-mesa)"
            >
              Entrar naquele fichário
            </button>
            <button
              type="button"
              onClick={() => setEstado({ tipo: "parado" })}
              className="min-h-11 rounded-full px-4 font-medium"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : permanente ? (
        <p>
          Fichário guardado em <strong className="font-semibold">{email}</strong>.{" "}
          <button type="button" onClick={sair} className="underline underline-offset-2">
            Sair
          </button>
        </p>
      ) : estado.tipo === "formulario" || estado.tipo === "enviando" || estado.tipo === "erro" ? (
        <form onSubmit={enviar} className="space-y-3">
          <label htmlFor="email-conta" className="block">
            {anonima
              ? "E-mail de um adulto, para guardar o fichário:"
              : "E-mail do fichário que você quer abrir:"}
          </label>
          <div className="flex justify-center gap-2">
            <input
              id="email-conta"
              type="email"
              required
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="nome@exemplo.com"
              className="min-h-11 min-w-0 flex-1 rounded-full bg-(--color-folha) px-4 ring-1 ring-black/10"
            />
            <button
              type="submit"
              disabled={estado.tipo === "enviando"}
              className="min-h-11 rounded-full bg-(--color-tinta) px-4 font-medium text-(--color-mesa) disabled:opacity-50"
            >
              {estado.tipo === "enviando" ? "Enviando…" : "Enviar link"}
            </button>
          </div>
          {estado.tipo === "erro" && (
            <p className="text-(--color-falta)">{estado.mensagem}</p>
          )}
        </form>
      ) : anonima ? (
        <p>
          Seu fichário está guardado só neste aparelho.{" "}
          <button
            type="button"
            onClick={() => setEstado({ tipo: "formulario" })}
            className="font-medium text-(--color-tinta) underline underline-offset-2"
          >
            Guardar em outro aparelho
          </button>
        </p>
      ) : (
        <p>
          Já tem um fichário guardado?{" "}
          <button
            type="button"
            onClick={() => setEstado({ tipo: "formulario" })}
            className="font-medium text-(--color-tinta) underline underline-offset-2"
          >
            Entrar
          </button>
        </p>
      )}
    </footer>
  );
}
