"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { coverUrl, webUrl } from "@/lib/assets";
import { cardNumber } from "@/lib/cards";
import { itemKey, nomeVariante, type Posicao, type SetSummary } from "@/lib/types";

/**
 * A gaveta: de onde vem uma carta que ainda nao esta no fichario.
 *
 * Duas portas, na ordem em que a crianca precisa delas:
 *
 *   Fora deste fichario  o que ela tirou. Vem PRIMEIRO porque por-de-volta e o
 *                        caso comum — tirar e olhar e um gesto de tentativa.
 *   As colecoes          as 27, para trazer qualquer carta de qualquer lugar.
 *                        E o que permite a pagina so de favoritos.
 *
 * Carta que ja ocupa um bolso aparece marcada e nao e selecionavel: a mesma
 * chave em dois bolsos faria UMA marcacao acender os dois. Nao e regra
 * arbitraria, e consequencia de a posse ser chaveada pela carta.
 */
export default function Gaveta({
  colecoes,
  fora,
  jaNoFichario,
  numberWidth,
  onPuxar,
  onClose,
}: {
  colecoes: SetSummary[];
  /** As que ele tirou deste fichario, prontas para voltar. */
  fora: Posicao[];
  /** As chaves que ja ocupam um bolso — nao podem ser puxadas de novo. */
  jaNoFichario: ReadonlySet<string>;
  numberWidth: number;
  onPuxar: (key: string) => void;
  onClose: () => void;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [cartas, setCartas] = useState<Posicao[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!aberta) return;
    let vivo = true;
    setCarregando(true);
    setErro(false);
    fetch(`/api/cartas?setId=${encodeURIComponent(aberta)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { cartas: Posicao[] }) => {
        if (vivo) setCartas(d.cartas);
      })
      .catch(() => vivo && setErro(true))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [aberta]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onClose]);

  const pegar = (p: Posicao) => {
    const k = itemKey(p.card.id, p.variant);
    if (jaNoFichario.has(k)) return;
    onPuxar(k);
    onClose();
  };

  const grade = (lista: Posicao[]) => (
    <ul className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-5 lg:grid-cols-6">
      {lista.map((p) => {
        const k = itemKey(p.card.id, p.variant);
        const dentro = jaNoFichario.has(k);
        const versao = nomeVariante(p.setId, p.variant);
        return (
          <li key={k}>
            <button
              type="button"
              onClick={() => pegar(p)}
              disabled={dentro}
              aria-label={`${cardNumber(p.card)} ${p.card.name}${
                versao ? " " + versao : ""
              }${dentro ? " — já está no fichário" : ""}`}
              className="bolso bolso-botao w-full cursor-pointer touch-manipulation disabled:cursor-default"
            >
              <Image
                src={webUrl(p.card)}
                alt=""
                fill
                unoptimized
                draggable={false}
                className={`carta ${dentro ? "carta-falta" : "carta-tenho"}`}
              />
              <span className="tabular pointer-events-none absolute bottom-1 left-1 z-10 rounded-md bg-black/62 px-1.5 py-0.5 text-[0.68rem] leading-none font-semibold text-white">
                {String(cardNumber(p.card)).padStart(numberWidth, "0")}
              </span>
              {dentro && (
                <span className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[var(--radius-carta)] bg-black/45 text-xs font-semibold text-white">
                  já está
                </span>
              )}
              {versao && (
                <span className="pointer-events-none absolute top-1 right-1 z-10 rounded-md bg-white/85 px-1.5 py-0.5 text-[0.62rem] leading-none font-bold text-slate-800">
                  {p.variant === "pokebola" ? "POKÉBOLA" : "HOLO"}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Escolher uma carta"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-(--color-mesa) shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-baseline justify-between gap-4 px-5 pt-5 pb-3 sm:px-7">
          <h2 className="text-xl font-semibold">
            {aberta ? (
              <button
                type="button"
                onClick={() => {
                  setAberta(null);
                  setCartas(null);
                }}
                className="text-(--color-tinta-fraca) hover:text-(--color-tinta)"
              >
                ‹ Coleções
              </button>
            ) : (
              "Pegar uma carta"
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-3 text-base text-(--color-tinta-fraca) hover:text-(--color-tinta)"
          >
            fechar
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 sm:px-7">
          {!aberta && (
            <>
              {/* O que ele tirou vem antes das colecoes: por de volta e o gesto
                  frequente, e procurar a carta de novo nas 27 seria uma punicao
                  por ter experimentado. Some quando nao ha nada tirado. */}
              {fora.length > 0 && (
                <section className="mb-7">
                  <h3 className="text-sm font-semibold tracking-wide text-(--color-tinta-fraca) uppercase">
                    Fora deste fichário
                  </h3>
                  {grade(fora)}
                </section>
              )}

              <h3 className="text-sm font-semibold tracking-wide text-(--color-tinta-fraca) uppercase">
                Coleções
              </h3>
              <ul className="mt-3 grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-5 lg:grid-cols-6">
                {colecoes.map((s) => (
                  <li key={s.setId}>
                    <button
                      type="button"
                      onClick={() => setAberta(s.setId)}
                      className="group block w-full text-left"
                    >
                      <Image
                        src={coverUrl(s.setId)}
                        alt=""
                        width={366}
                        height={670}
                        unoptimized
                        className="aspect-[366/670] w-full rounded-xl object-cover shadow-sm ring-1 ring-black/5 transition-transform duration-200 group-hover:-translate-y-1"
                      />
                      <p className="mt-2 text-sm leading-snug font-medium">{s.setName}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {aberta && carregando && (
            <p className="py-10 text-center text-(--color-tinta-fraca)">Abrindo…</p>
          )}
          {aberta && erro && (
            <p className="py-10 text-center text-(--color-tinta-fraca)">
              Não consegui abrir essa coleção. Tente de novo.
            </p>
          )}
          {aberta && cartas && grade(cartas)}
        </div>
      </div>
    </div>
  );
}
