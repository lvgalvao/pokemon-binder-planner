"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { coverUrl } from "@/lib/assets";
import type { SetSummary } from "@/lib/types";

/**
 * Montar um fichario com varias colecoes.
 *
 * A tela e a mesma grade de capas da inicial, e o gesto e o unico que ela ja
 * ensina: tocar na capa. O que muda e que o toque agora NUMERA — 1, 2, 3 — em
 * vez de abrir, porque num fichario com tres colecoes a ordem e o dado: e a
 * ordem em que elas se sucedem nas folhas.
 *
 * Sem arrastar para reordenar: tocar de novo tira a colecao da sequencia e as
 * seguintes se renumeram sozinhas, que e a correcao que uma crianca de fato faz.
 */
export default function MontarFichario({
  sets,
  minimo,
  maximo,
}: {
  sets: SetSummary[];
  minimo: number;
  maximo: number;
}) {
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  /** `null` enquanto ele nao mexeu: ai o nome acompanha a primeira colecao. */
  const [nome, setNome] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();

  const porId = useMemo(() => new Map(sets.map((s) => [s.setId, s])), [sets]);
  const sugestao = escolhidas.length
    ? `Fichário ${porId.get(escolhidas[0])?.setName ?? ""}`.trim().slice(0, 60)
    : "";
  const nomeFinal = (nome ?? sugestao).trim();
  const podeMontar = escolhidas.length >= minimo && nomeFinal.length > 0;

  const alternar = (setId: string) => {
    setErro(null);
    setEscolhidas((atual) => {
      if (atual.includes(setId)) return atual.filter((id) => id !== setId);
      if (atual.length >= maximo) return atual;
      return [...atual, setId];
    });
  };

  const montar = async () => {
    if (!podeMontar || salvando) return;
    setSalvando(true);
    try {
      const res = await fetch("/api/fichario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nomeFinal, setIds: escolhidas }),
      });
      if (!res.ok) throw new Error();
      const { id } = (await res.json()) as { id: string };
      router.push(`/fichario/${id}`);
      router.refresh();
    } catch {
      setSalvando(false);
      setErro("Não consegui montar agora. Tente de novo.");
    }
  };

  return (
    // pb generoso: a barra de baixo e fixa e nao pode cobrir a ultima fileira.
    <main className="mx-auto max-w-6xl px-5 pt-10 pb-52 sm:px-8">
      <Link
        href="/"
        className="text-sm text-(--color-tinta-fraca) hover:text-(--color-tinta)"
      >
        ‹ Coleções
      </Link>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
        Juntar coleções
      </h1>
      <p className="mt-2 text-lg text-(--color-tinta-fraca)">
        Toque nas coleções na ordem em que elas ficam no seu fichário.
      </p>

      <ul className="mt-9 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {sets.map((set, i) => {
          const posicao = escolhidas.indexOf(set.setId);
          const escolhida = posicao >= 0;
          const cheio = escolhidas.length >= maximo && !escolhida;

          return (
            <li key={set.setId}>
              <button
                type="button"
                onClick={() => alternar(set.setId)}
                aria-pressed={escolhida}
                disabled={cheio}
                className="group block w-full text-left disabled:opacity-40"
              >
                <div
                  className={`relative overflow-hidden rounded-2xl bg-(--color-mesa-fundo) shadow-sm transition-transform duration-200 group-active:translate-y-0 ${
                    escolhida
                      ? "ring-3 ring-(--color-tenho)"
                      : "ring-1 ring-black/5 group-hover:-translate-y-1"
                  }`}
                >
                  <Image
                    src={coverUrl(set.setId)}
                    alt=""
                    width={366}
                    height={670}
                    unoptimized
                    priority={i < 4}
                    className={`aspect-[366/670] w-full object-cover transition-opacity ${
                      escolhida ? "opacity-100" : "opacity-95"
                    }`}
                  />
                  {escolhida && (
                    // O numero e a resposta a "em que ordem elas ficam" — sem ele,
                    // a marca diria so "esta entra", que e metade da escolha.
                    <span className="tabular absolute top-2 left-2 grid h-10 w-10 place-items-center rounded-full bg-(--color-tenho) text-lg font-bold text-white shadow-md">
                      {posicao + 1}
                    </span>
                  )}
                </div>

                <p className="mt-3 text-base leading-snug font-medium">{set.setName}</p>
                <p className="tabular mt-0.5 text-sm text-(--color-tinta-fraca)">
                  {set.totalSet} cartas
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      {/* A barra so aparece quando ja ha o que montar: antes disso ela seria um
          formulario cobrindo as capas sem ter o que dizer. */}
      {escolhidas.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-(--color-vinco) bg-(--color-folha)/95 px-5 py-4 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            <p className="truncate text-sm text-(--color-tinta-fraca)">
              {escolhidas
                .map((id, i) => `${i + 1}. ${porId.get(id)?.setName ?? id}`)
                .join("  ·  ")}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <input
                value={nome ?? sugestao}
                onChange={(e) => setNome(e.target.value)}
                maxLength={60}
                aria-label="Nome do fichário"
                className="min-h-12 min-w-0 flex-1 rounded-2xl bg-(--color-mesa) px-4 text-base ring-1 ring-black/5 outline-none focus:ring-2 focus:ring-(--color-tenho)"
              />
              <button
                type="button"
                onClick={montar}
                disabled={!podeMontar || salvando}
                className="min-h-12 rounded-2xl bg-(--color-tinta) px-6 text-base font-semibold text-(--color-mesa) disabled:opacity-40"
              >
                {salvando ? "Montando…" : "Montar fichário"}
              </button>
            </div>

            <p
              role={erro ? "status" : undefined}
              className="text-center text-sm text-(--color-tinta-fraca)"
            >
              {erro ??
                (escolhidas.length < minimo
                  ? `Escolha pelo menos ${minimo} coleções.`
                  : `${escolhidas.length} coleções neste fichário.`)}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
