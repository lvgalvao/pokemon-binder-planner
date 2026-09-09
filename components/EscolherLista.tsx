"use client";

import type { ListaDeDesejos } from "@/lib/types";

/**
 * "Para qual lista vai a estrela?" — o painel do fichario.
 *
 * So existe a partir da SEGUNDA lista: com uma so nao ha escolha a fazer, e o
 * botao que abre isto seria um controle que nao muda nada. Criar lista tambem
 * nao mora aqui, e sim na tela inicial: dentro do fichario a crianca esta
 * marcando cartas, e um campo de texto no meio da varredura e uma parada.
 *
 * A escolha vale para as PROXIMAS estrelas. As que ja estao marcadas nao se
 * mexem — mudar uma de lista e gesto da propria carta, no visualizador, onde da
 * para ver qual carta esta mudando de lugar.
 */
export default function EscolherLista({
  listas,
  ativa,
  contagens,
  onChange,
  onClose,
}: {
  listas: ListaDeDesejos[];
  ativa: string | null;
  /** Quantas estrelas deste fichario ja estao em cada lista. */
  contagens: Map<string, number>;
  onChange: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Escolher a lista da estrela"
    >
      <div
        className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-3xl bg-(--color-folha) p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-base text-(--color-tinta-fraca)">
          A estrela vai para qual lista?
        </p>

        <ul className="mt-3">
          {listas.map((l) => {
            const n = contagens.get(l.id) ?? 0;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(l.id);
                    onClose();
                  }}
                  aria-pressed={l.id === ativa}
                  className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-2 text-left active:scale-[0.99]"
                >
                  <span
                    aria-hidden
                    className={`text-xl ${
                      l.id === ativa
                        ? "text-(--color-estrela)"
                        : "text-(--color-tinta-fraca) opacity-40"
                    }`}
                  >
                    ★
                  </span>
                  <span className="flex-1 text-base font-medium">{l.nome}</span>
                  {/* A contagem e das cartas DESTE fichario que ja estao nela —
                      e o que responde "onde eu estava pondo as desta colecao". */}
                  <span className="tabular text-sm text-(--color-tinta-fraca)">
                    {n > 0 ? n : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 h-12 w-full rounded-2xl bg-(--color-tinta) text-base font-semibold text-(--color-mesa)"
        >
          Pronto
        </button>
      </div>
    </div>
  );
}
