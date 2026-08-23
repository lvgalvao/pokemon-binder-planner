import Link from "next/link";
import Image from "next/image";
import { listSets } from "@/lib/manifests";
import { ownedCountBySet } from "@/lib/db";
import { estrelasDoUsuario } from "@/lib/listas";
import { getUserId } from "@/lib/session";
import { coverUrl } from "@/lib/assets";
import ListaDeDesejos from "@/components/ListaDeDesejos";

export const dynamic = "force-dynamic";

/**
 * Tela 1 — escolher a colecao.
 * A grade de capas e a interface. Sem busca, sem filtro, sem ordenacao: 27 itens
 * cabem numa tela rolavel e a capa e reconhecivel de longe. Instrucao seria desculpa.
 *
 * E tambem a tela de primeiro uso — nao existe estado vazio porque nao existe
 * nada para criar antes. Sem sessao ela renderiza igual, com todas as colecoes
 * zeradas: visitar nao cria conta.
 */
export default async function Home() {
  const sets = listSets();
  const userId = await getUserId();
  const [owned, estrelas] = await Promise.all([
    ownedCountBySet(userId),
    estrelasDoUsuario(userId),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Meu Fichário Pokémon
      </h1>
      <p className="mt-2 text-lg text-(--color-tinta-fraca)">
        Escolha uma coleção para começar.
      </p>

      {/* A lista de desejos vem antes das colecoes quando existe: e a resposta a
          pergunta mais quente ("cade as minhas?"), e some por completo quando
          nao ha nenhuma estrela. */}
      <ListaDeDesejos estrelas={estrelas} />

      <ul className="mt-9 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {sets.map((set, i) => {
          const tenho = owned.get(set.setId) ?? 0;
          const completa = tenho >= set.totalSet;

          return (
            <li key={set.setId}>
              <Link
                href={`/binder/${set.setId}`}
                className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--color-tenho)"
              >
                <div className="overflow-hidden rounded-2xl bg-(--color-mesa-fundo) shadow-sm ring-1 ring-black/5 transition-transform duration-200 group-hover:-translate-y-1 group-active:translate-y-0">
                  {/* As capas tem 366x670. O derivado WebP tem ~43 KB contra os
                      926 KB do PNG de origem — 27 capas nesta tela. */}
                  <Image
                    src={coverUrl(set.setId)}
                    alt=""
                    width={366}
                    height={670}
                    unoptimized
                    priority={i < 4}
                    className="aspect-[366/670] w-full object-cover"
                  />
                </div>

                <div className="mt-3">
                  <p className="text-base leading-snug font-medium">{set.setName}</p>
                  <p className="tabular mt-0.5 text-sm text-(--color-tinta-fraca)">
                    {completa ? (
                      <span className="font-medium text-(--color-tenho)">
                        Completa · {set.totalSet} cartas
                      </span>
                    ) : tenho > 0 ? (
                      <>
                        {tenho} de {set.totalSet} cartas
                      </>
                    ) : (
                      <>{set.totalSet} cartas</>
                    )}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
