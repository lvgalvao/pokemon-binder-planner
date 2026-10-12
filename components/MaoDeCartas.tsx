"use client";

import Image from "next/image";
import { printUrl } from "@/lib/assets";
import { rotuloNumero } from "@/lib/cards";
import { nomeVariante, type Posicao } from "@/lib/types";

/**
 * A carta na mao.
 *
 * E a peca que faz o gesto do modo arrumar funcionar num fichario de 300 bolsos:
 * a faixa e fixa e SOBREVIVE A VIRADA DE PAGINA, entao da para pegar a carta na
 * pagina 3, virar o fichario e solta-la na 12. Arrastar nunca conseguiria isso —
 * o dedo teria de soltar para virar a folha, e ai a carta ja teria caido.
 *
 * A carta aparece GRANDE, no derivado de impressao que o `CardViewer` usa. Nao e
 * enfeite: pegar a carta e tambem como se ve a arte de perto, e e por isso que o
 * modo pode desligar o toque simples que abre a carta sem tirar nada de ninguem.
 */
export default function MaoDeCartas({
  item,
  numberWidth,
  podeTirar,
  onDevolver,
  onTirar,
}: {
  item: Posicao;
  numberWidth: number;
  /**
   * Se "tirar do fichario" faz sentido para esta carta. Uma carta puxada da
   * gaveta, de colecao que nao e deste fichario, nao tem para onde ser tirada —
   * soltar a mao ja a faz sumir, porque nada iria repo-la.
   */
  podeTirar: boolean;
  onDevolver: () => void;
  onTirar: () => void;
}) {
  const { card, variant, setId, setName } = item;
  const label = rotuloNumero(card, numberWidth);
  const versao = nomeVariante(setId, variant);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-(--color-vinco) bg-(--color-folha)/96 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.10)] backdrop-blur sm:px-6"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-4">
        <Image
          src={printUrl(card)}
          alt=""
          width={733}
          height={1024}
          unoptimized
          priority
          draggable={false}
          className="carta-na-mao h-24 w-auto shrink-0 rounded-lg sm:h-32"
        />

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-(--color-tinta-fraca) uppercase">
            na mão
          </p>
          <p className="tabular truncate text-base leading-snug font-semibold sm:text-lg">
            {label} · {card.name}
          </p>
          <p className="truncate text-sm text-(--color-tinta-fraca)">
            {setName}
            {versao ? ` · ${versao}` : ""}
          </p>
          {/* A instrucao aparece porque o gesto e novo, e some junto com a mao.
              E a unica frase do modo, e ela responde "e agora?". */}
          <p className="mt-1 text-sm text-(--color-tinta-fraca)">
            Toque num bolso para colocar.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          <button
            type="button"
            onClick={onDevolver}
            className="min-h-11 rounded-full bg-(--color-mesa) px-4 text-sm font-medium text-(--color-tinta-fraca) hover:text-(--color-tinta)"
          >
            devolver
          </button>
          {podeTirar && (
            <button
              type="button"
              onClick={onTirar}
              className="min-h-11 rounded-full px-4 text-sm font-medium text-(--color-tinta-fraca) hover:text-(--color-tinta)"
            >
              tirar do fichário
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
