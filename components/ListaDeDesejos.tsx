import Image from "next/image";
import Link from "next/link";
import { webUrl } from "@/lib/assets";
import { cardNumber } from "@/lib/cards";
import { nomeVariante } from "@/lib/types";
import type { Estrela } from "@/lib/listas";
import BlocoDeImpressao from "./BlocoDeImpressao";

/**
 * A lista de desejos, no topo da tela inicial.
 *
 * Existe aqui, e nao dentro de uma colecao, porque a pergunta que ela responde
 * atravessa as colecoes: "quais sao as cartas que eu quero?". No fichario cada
 * colecao e um mundo fechado; a vontade da crianca nao e.
 *
 * Nao aparece enquanto nao ha nenhuma estrela — a tela inicial e a de primeiro
 * uso, e um bloco vazio explicando um gesto que ele ainda nao tem motivo de usar
 * so atrasaria a escolha da colecao.
 */
export default function ListaDeDesejos({ estrelas }: { estrelas: Estrela[] }) {
  if (estrelas.length === 0) return null;

  const faltando = estrelas.filter((e) => !e.owned);
  const conquistadas = estrelas.length - faltando.length;

  return (
    <section className="mt-8 rounded-3xl bg-(--color-folha) p-5 shadow-sm ring-1 ring-black/5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-xl font-semibold">
          <span className="text-(--color-estrela)">★</span> As que eu mais quero
        </h2>
        <p className="tabular text-sm text-(--color-tinta-fraca)">
          {conquistadas > 0 ? (
            <>
              já consegui {conquistadas} de {estrelas.length}
            </>
          ) : (
            <>
              {estrelas.length} {estrelas.length === 1 ? "carta" : "cartas"}
            </>
          )}
        </p>
      </div>

      {/* As cartas em fila, pequenas: aqui elas sao o cartaz do desejo, nao um
          fichario — nao ha bolso, nem numeracao a respeitar. Cada uma leva a
          colecao de onde veio. */}
      <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-2.5">
        {estrelas.map((e, i) => {
          const versao = nomeVariante(e.setId, e.variant);
          return (
            <li key={`${e.setId}-${e.card.id}-${e.variant}`}>
              <Link
                href={`/binder/${e.setId}`}
                title={`${cardNumber(e.card)} · ${e.card.name}${
                  versao ? ` (${versao})` : ""
                } — ${e.setName}`}
                className="group block"
              >
                <div
                  className={`relative overflow-hidden rounded-lg ring-2 transition-transform group-hover:-translate-y-0.5 ${
                    e.owned ? "ring-(--color-tenho)" : "ring-(--color-estrela)"
                  }`}
                >
                  {/* O derivado `web/` tem 400w (~34 KB) e aqui a miniatura tem
                      ~58 px — nao ha derivado menor. Com a lista crescendo, o
                      que sobra e nao baixar o que esta fora da tela: as duas
                      primeiras filas vem no ato, o resto quando chegar a vez. */}
                  <Image
                    src={webUrl(e.card)}
                    alt={e.card.name}
                    width={400}
                    height={559}
                    unoptimized
                    loading={i < 24 ? "eager" : "lazy"}
                    className="aspect-[63/88] w-full object-cover"
                  />
                  {/* Estrela ja conquistada: continua na lista, com o visto. Tirar
                      da tela apagaria justamente a parte boa de ter marcado. */}
                  {e.owned && (
                    <span
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 bg-(--color-tenho) py-0.5 text-center text-[0.6rem] leading-none font-bold text-white"
                    >
                      ✓
                    </span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {faltando.length > 0 ? (
        <div className="mt-5 sm:mx-auto sm:max-w-sm">
          {/*
            Aqui a folha nao e "as que faltam" de colecao nenhuma: e a lista de
            desejos inteira, de todas juntas. O titulo repete o nome da secao de
            proposito — e o mesmo nome que aparece dentro de cada fichario, para
            a crianca reconhecer que e a mesma lista.
          */}
          <BlocoDeImpressao
            titulo="★ As que eu mais quero"
            subtitulo={`${faltando.length} ${
              faltando.length === 1 ? "carta" : "cartas"
            } com estrela que ainda faltam, de ${
              new Set(faltando.map((e) => e.setId)).size
            } ${new Set(faltando.map((e) => e.setId)).size === 1 ? "coleção" : "coleções"}`}
            href="/api/pdf/estrelas"
            quantidade={faltando.length}
            estrela
          />
        </div>
      ) : (
        <p className="mt-5 text-center text-base font-medium text-(--color-tenho)">
          Você já conseguiu todas as cartas que queria!
        </p>
      )}
    </section>
  );
}
