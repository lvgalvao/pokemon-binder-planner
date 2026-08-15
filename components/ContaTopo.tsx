"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * O caminho de volta, no topo.
 *
 * So aparece para quem NAO tem sessao — que e exatamente quem pode estar
 * perdido: aparelho novo, navegador novo, ou o cookie que sumiu. Para essa
 * pessoa o fichario aparece vazio, e um link discreto no rodape nao e achado.
 * Quem ja esta dentro nunca ve esta faixa, entao ela nao custa nada a quem
 * chegou para marcar carta.
 *
 * Entrar e por SENHA, nao por link magico: o link depende do SMTP do projeto
 * entregar o e-mail, e o SMTP compartilhado do Supabase limita a 2 por hora e
 * so alcanca membros da organizacao. Senha nao depende de nada chegar.
 */
export default function ContaTopo() {
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);

    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });

    if (error) {
      setEnviando(false);
      // A mensagem crua da API vem em ingles e fala de "credentials".
      setErro(
        /invalid/i.test(error.message)
          ? "E-mail ou senha não conferem."
          : error.message,
      );
      return;
    }

    // O layout inteiro depende da sessao (rodape, contagens, cartas marcadas),
    // e ela acabou de mudar no cookie. refresh() rebusca do servidor sem
    // recarregar a pagina.
    router.refresh();
  }

  if (!aberto) {
    return (
      <div className="border-b border-(--color-vinco) bg-(--color-mesa-fundo)">
        <p className="mx-auto max-w-6xl px-5 py-3 text-center text-sm text-(--color-tinta-fraca) sm:px-8">
          Já tem um fichário guardado?{" "}
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="font-semibold text-(--color-tinta) underline underline-offset-2"
          >
            Entrar
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="border-b border-(--color-vinco) bg-(--color-mesa-fundo)">
      <form
        onSubmit={entrar}
        className="mx-auto flex max-w-md flex-col gap-2 px-5 py-4 sm:px-8"
      >
        <label htmlFor="entrar-email" className="text-sm text-(--color-tinta-fraca)">
          Entre para abrir o seu fichário:
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="entrar-email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@exemplo.com"
            className="min-h-11 min-w-0 flex-1 rounded-full bg-(--color-folha) px-4 ring-1 ring-black/10"
          />
          <input
            id="entrar-senha"
            type="password"
            required
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="senha"
            className="min-h-11 min-w-0 flex-1 rounded-full bg-(--color-folha) px-4 ring-1 ring-black/10"
          />
          <button
            type="submit"
            disabled={enviando}
            className="min-h-11 rounded-full bg-(--color-tinta) px-5 font-medium text-(--color-mesa) disabled:opacity-50"
          >
            {enviando ? "Entrando…" : "Entrar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAberto(false);
              setErro(null);
            }}
            className="min-h-11 rounded-full px-3 text-sm text-(--color-tinta-fraca)"
          >
            Cancelar
          </button>
        </div>
        {erro && <p className="text-sm text-(--color-falta)">{erro}</p>}
      </form>
    </div>
  );
}
