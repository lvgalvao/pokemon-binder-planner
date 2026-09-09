"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { webUrl } from "@/lib/assets";
import { cardNumber } from "@/lib/cards";
import { useListaAtiva } from "@/lib/listaAtiva";
import { nomeVariante } from "@/lib/types";
import type { ListaDeDesejos as Lista } from "@/lib/types";
import type { Estrela } from "@/lib/listas";
import BlocoDeImpressao from "./BlocoDeImpressao";

/**
 * As listas de desejo, no topo da tela inicial.
 *
 * Existem aqui, e nao dentro de uma colecao, porque a pergunta que respondem
 * atravessa as colecoes: "quais sao as cartas que eu quero?". No fichario cada
 * colecao e um mundo fechado; a vontade da crianca nao e.
 *
 * Eram uma so — todas as estrelas num balaio — e agora sao quantas ele quiser,
 * cada uma com a sua folha. Mas com UMA lista a tela e exatamente a de antes:
 * nenhuma aba, nenhum seletor, so um convite discreto para criar a segunda. O
 * controle nasce junto com o motivo dele.
 *
 * Nao aparece enquanto nao ha lista nenhuma — a tela inicial e a de primeiro
 * uso, e um bloco vazio explicando um gesto que ele ainda nao tem motivo de usar
 * so atrasaria a escolha da colecao.
 */
export default function ListaDeDesejos({
  estrelas,
  listas,
}: {
  estrelas: Estrela[];
  listas: Lista[];
}) {
  const router = useRouter();
  const [ativa, escolher] = useListaAtiva(listas);
  const [editando, setEditando] = useState(false);

  if (listas.length === 0) return null;

  const lista = listas.find((l) => l.id === ativa) ?? listas[0];
  const daLista = estrelas.filter((e) => e.listaId === lista.id);
  const faltando = daLista.filter((e) => !e.owned);
  const conquistadas = daLista.length - faltando.length;
  const varias = listas.length > 1;

  return (
    <section className="mt-8 rounded-3xl bg-(--color-folha) p-5 shadow-sm ring-1 ring-black/5 sm:p-6">
      {editando ? (
        <EditarLista
          lista={lista}
          cartas={daLista.length}
          podeApagar={varias}
          onPronto={() => {
            setEditando(false);
            router.refresh();
          }}
          onCancelar={() => setEditando(false)}
        />
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="flex items-baseline gap-2 text-xl font-semibold">
            <span className="text-(--color-estrela)">★</span> {lista.nome}
            {/* O lapis fica junto do nome porque e o nome que ele muda — e some
                no modo de edicao, onde o campo ja diz o que esta acontecendo. */}
            <button
              type="button"
              onClick={() => setEditando(true)}
              aria-label={`Mudar o nome da lista ${lista.nome}`}
              title="Mudar o nome desta lista"
              className="text-base text-(--color-tinta-fraca) hover:text-(--color-tinta)"
            >
              ✎
            </button>
          </h2>
          <p className="tabular text-sm text-(--color-tinta-fraca)">
            {daLista.length === 0 ? (
              "nenhuma carta ainda"
            ) : conquistadas > 0 ? (
              <>
                já consegui {conquistadas} de {daLista.length}
              </>
            ) : (
              <>
                {daLista.length} {daLista.length === 1 ? "carta" : "cartas"}
              </>
            )}
          </p>
        </div>
      )}

      {/* As listas lado a lado, no mesmo interruptor do rodape do fichario. Com
          uma lista so nao ha o que escolher, e a fileira daria de cara com a
          crianca um controle que nao muda nada — sobra o convite de criar a
          segunda, discreto, na ponta. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {varias &&
          listas.map((l) => {
            const n = estrelas.filter((e) => e.listaId === l.id).length;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  escolher(l.id);
                  setEditando(false);
                }}
                aria-pressed={l.id === lista.id}
                className={`tabular min-h-10 rounded-full px-4 text-sm font-medium ${
                  l.id === lista.id
                    ? "bg-(--color-tinta) text-(--color-mesa)"
                    : "bg-(--color-mesa-fundo) text-(--color-tinta-fraca) hover:text-(--color-tinta)"
                }`}
              >
                {l.nome}
                {n > 0 && <span className="opacity-70"> · {n}</span>}
              </button>
            );
          })}
        <NovaLista
          quantasJaExistem={listas.length}
          onCriada={(id) => {
            escolher(id);
            router.refresh();
          }}
        />
      </div>

      {daLista.length === 0 ? (
        <p className="mt-5 text-center text-base text-(--color-tinta-fraca)">
          Abra uma coleção e toque <strong className="font-semibold">três vezes</strong> numa
          carta para pôr ★ nesta lista.
        </p>
      ) : (
        <>
          {/* As cartas em fila, pequenas: aqui elas sao o cartaz do desejo, nao um
              fichario — nao ha bolso, nem numeracao a respeitar. Cada uma leva a
              colecao de onde veio. */}
          <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-2.5">
            {daLista.map((e, i) => {
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
            /* Com varias listas ha duas folhas possiveis: a desta lista e a de
               todas juntas. A segunda so aparece quando existe mais de uma lista
               para juntar — antes disso ela seria a mesma folha com outro nome. */
            <div
              className={`mt-5 grid gap-5 ${
                varias ? "sm:grid-cols-2" : "sm:mx-auto sm:max-w-sm"
              }`}
            >
              <BlocoDeImpressao
                titulo={`★ ${lista.nome}`}
                subtitulo={`${faltando.length} ${
                  faltando.length === 1 ? "carta" : "cartas"
                } com estrela que ainda faltam, de ${
                  new Set(faltando.map((e) => e.setId)).size
                } ${new Set(faltando.map((e) => e.setId)).size === 1 ? "coleção" : "coleções"}`}
                href={`/api/pdf/estrelas?lista=${lista.id}`}
                quantidade={faltando.length}
                estrela
              />

              {varias && <BlocoDeTudoJunto estrelas={estrelas} />}
            </div>
          ) : (
            <p className="mt-5 text-center text-base font-medium text-(--color-tenho)">
              Você já conseguiu todas as cartas desta lista!
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** A folha com as estrelas de todas as listas — a lista de desejos inteira. */
function BlocoDeTudoJunto({ estrelas }: { estrelas: Estrela[] }) {
  const faltando = estrelas.filter((e) => !e.owned);
  return (
    <BlocoDeImpressao
      titulo="★ Todas as listas juntas"
      subtitulo={`${faltando.length} ${
        faltando.length === 1 ? "carta" : "cartas"
      } com estrela que ainda faltam, de todas as suas listas`}
      href="/api/pdf/estrelas"
      quantidade={faltando.length}
      estrela
      vazio="Você já conseguiu tudo o que queria!"
    />
  );
}

/**
 * Criar a proxima lista.
 *
 * O nome ja vem pronto, como vem no fichario montado: escrever antes de ver a
 * coisa existir e a parte chata: ela renomeia depois, no lapis, se quiser.
 */
function NovaLista({
  quantasJaExistem,
  onCriada,
}: {
  quantasJaExistem: number;
  onCriada: (id: string) => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const criar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/listas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: `Minha lista ${quantasJaExistem + 1}` }),
      });
      const corpo = await res.json();
      if (!res.ok) throw new Error(corpo?.error ?? "Não deu para criar a lista.");
      onCriada(corpo.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para criar a lista.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={criar}
        disabled={salvando}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-(--color-mesa-fundo) px-4 text-sm font-medium text-(--color-tinta-fraca) hover:text-(--color-tinta) disabled:opacity-50"
      >
        <span className="text-base leading-none">+</span> nova lista
      </button>
      {erro && <span className="text-sm text-(--color-tinta-fraca)">{erro}</span>}
    </>
  );
}

/**
 * Mudar o nome — e apagar.
 *
 * O apagar mora aqui dentro, e nao ao lado do nome na tela normal, porque e o
 * unico gesto do app que custa marcacao: as estrelas da lista vao junto. Fica
 * atras do lapis, em dois toques, e a frase diz quantas cartas se perdem antes
 * do segundo. A ultima lista nao pode ser apagada: sem nenhuma, a proxima
 * estrela criaria outra sozinha e a tela pareceria ter esquecido tudo.
 */
function EditarLista({
  lista,
  cartas,
  podeApagar,
  onPronto,
  onCancelar,
}: {
  lista: Lista;
  cartas: number;
  podeApagar: boolean;
  onPronto: () => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(lista.nome);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const salvar = async () => {
    const limpo = nome.trim();
    if (limpo.length === 0 || limpo === lista.nome) return onCancelar();
    setOcupado(true);
    await fetch("/api/listas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lista.id, nome: limpo }),
    });
    onPronto();
  };

  const apagar = async () => {
    if (!confirmando) return setConfirmando(true);
    setOcupado(true);
    await fetch(`/api/listas?id=${encodeURIComponent(lista.id)}`, { method: "DELETE" });
    onPronto();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="text-xl text-(--color-estrela)">
          ★
        </span>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void salvar();
            if (e.key === "Escape") onCancelar();
          }}
          maxLength={40}
          autoFocus
          aria-label="Nome da lista"
          className="min-h-11 min-w-0 flex-1 rounded-2xl bg-(--color-mesa-fundo) px-4 text-lg font-semibold ring-1 ring-black/5 focus:outline-2 focus:outline-offset-2 focus:outline-(--color-estrela)"
        />
        <button
          type="button"
          onClick={salvar}
          disabled={ocupado}
          className="min-h-11 rounded-full bg-(--color-tinta) px-5 text-sm font-medium text-(--color-mesa) disabled:opacity-50"
        >
          pronto
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="min-h-11 rounded-full px-3 text-sm font-medium text-(--color-tinta-fraca) hover:text-(--color-tinta)"
        >
          cancelar
        </button>
      </div>

      {podeApagar && (
        <p className="mt-2 text-sm">
          <button
            type="button"
            onClick={apagar}
            disabled={ocupado}
            className={`min-h-9 rounded-full px-3 font-medium ${
              confirmando
                ? "bg-(--color-tinta) text-(--color-mesa)"
                : "text-(--color-tinta-fraca) hover:text-(--color-tinta)"
            }`}
          >
            {confirmando
              ? cartas > 0
                ? `Tocar de novo para apagar a lista e as ${cartas} ★`
                : "Tocar de novo para apagar a lista"
              : "Apagar esta lista"}
          </button>
        </p>
      )}
    </div>
  );
}
