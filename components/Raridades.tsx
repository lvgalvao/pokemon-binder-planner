"use client";

import {
  BUCKET_LABELS,
  bucketEspecial,
  atalhoEspeciaisSeparaAlgo,
  type Bucket,
} from "@/lib/types";

/**
 * "Quais cartas voce quer ver?" — o filtro por raridade.
 *
 * Painel e nao mais um interruptor no rodape: sao ate 8 raridades, e a fileira
 * de baixo ja carrega tres interruptores. Aqui elas cabem com alvo de dedo de
 * crianca, contagem ao lado e o nome por extenso.
 *
 * Duas portas, em ordem de frequencia:
 *
 *   Todas            desliga o filtro. E o estado normal do fichario.
 *   So as especiais  tira comum, incomum e rara da frente de uma vez. E o pedido
 *                    real ("quero ver so as boas"), e resolver isso com tres
 *                    toques de desmarcar seria transformar um desejo em tarefa.
 *
 * As raridades soltas continuam embaixo para quem quiser escolher a dedo. O
 * efeito e imediato, como todo interruptor deste app: o "Ver" so fecha o painel.
 *
 * Nunca existe selecao vazia — desmarcar a ultima raridade volta para "Todas".
 * Um fichario de zero bolsos nao ensina nada e nao tem saida obvia.
 */
export default function Raridades({
  contagens,
  selecionadas,
  onChange,
  onClose,
}: {
  /** Quantos BOLSOS cada raridade ocupa, na ordem do fichario. So as presentes. */
  contagens: { bucket: Bucket; n: number }[];
  /** `null` = todas. Nunca um conjunto vazio. */
  selecionadas: ReadonlySet<Bucket> | null;
  onChange: (next: Set<Bucket> | null) => void;
  onClose: () => void;
}) {
  const presentes = contagens.map((c) => c.bucket);
  const total = contagens.reduce((s, c) => s + c.n, 0);
  const especiais = contagens.filter((c) => bucketEspecial(c.bucket));
  const totalEspeciais = especiais.reduce((s, c) => s + c.n, 0);
  const ofereceEspeciais = atalhoEspeciaisSeparaAlgo(presentes);

  const ativa = (b: Bucket) => selecionadas === null || selecionadas.has(b);
  const soEspeciais =
    ofereceEspeciais &&
    selecionadas !== null &&
    selecionadas.size === especiais.length &&
    especiais.every((c) => selecionadas.has(c.bucket));

  const alternar = (b: Bucket) => {
    const base = new Set(selecionadas ?? presentes);
    base.has(b) ? base.delete(b) : base.add(b);
    // Vazio ou completo sao o mesmo fichario de sempre: melhor guardar isso como
    // "sem filtro" do que como uma selecao que por acaso contem tudo.
    onChange(base.size === 0 || base.size === presentes.length ? null : base);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Escolher raridades"
    >
      <div
        className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-3xl bg-(--color-folha) p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-base text-(--color-tinta-fraca)">
          Quais cartas você quer ver?
        </p>

        <div className={`mt-3 grid gap-2 ${ofereceEspeciais ? "grid-cols-2" : ""}`}>
          <Atalho
            titulo="Todas"
            detalhe={`${total} bolsos`}
            ativo={selecionadas === null}
            onClick={() => onChange(null)}
          />
          {ofereceEspeciais && (
            <Atalho
              titulo="Só as especiais"
              detalhe={`${totalEspeciais} bolsos`}
              ativo={soEspeciais}
              onClick={() => onChange(new Set(especiais.map((c) => c.bucket)))}
            />
          )}
        </div>

        {ofereceEspeciais && (
          <p className="mt-2 text-center text-xs text-(--color-tinta-fraca)">
            Especiais são as de dupla rara para cima — sem comum, incomum e rara.
          </p>
        )}

        <ul className="mt-4 border-t border-(--color-vinco) pt-2">
          {contagens.map(({ bucket, n }) => (
            <li key={bucket}>
              <button
                type="button"
                onClick={() => alternar(bucket)}
                aria-pressed={ativa(bucket)}
                className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-2 text-left active:scale-[0.99]"
              >
                <Caixa marcada={ativa(bucket)} />
                <span className="flex-1 text-base font-medium">
                  {BUCKET_LABELS[bucket]}
                </span>
                <span className="tabular text-sm text-(--color-tinta-fraca)">{n}</span>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 h-12 w-full rounded-2xl bg-(--color-tinta) text-base font-semibold text-(--color-mesa)"
        >
          Ver
        </button>
      </div>
    </div>
  );
}

function Atalho({
  titulo,
  detalhe,
  ativo,
  onClick,
}: {
  titulo: string;
  detalhe: string;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`flex min-h-16 flex-col items-center justify-center rounded-2xl px-3 leading-tight transition-colors ${
        ativo
          ? "bg-(--color-tinta) text-(--color-mesa)"
          : "bg-(--color-mesa) text-(--color-tinta)"
      }`}
    >
      <span className="text-base font-semibold">{titulo}</span>
      <span className={`tabular mt-0.5 text-xs ${ativo ? "opacity-75" : "text-(--color-tinta-fraca)"}`}>
        {detalhe}
      </span>
    </button>
  );
}

/** Marca visivel de longe: o painel e lido a distancia de braco de crianca. */
function Caixa({ marcada }: { marcada: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 transition-colors ${
        marcada
          ? "bg-(--color-tenho) text-white ring-transparent"
          : "bg-(--color-mesa) text-transparent ring-black/10"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M3.5 8.5l3 3 6-6.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
