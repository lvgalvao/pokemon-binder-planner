import { sheetsNeeded } from "@/lib/sheet";

/**
 * Um destino de impressao, com as duas escalas lado a lado.
 *
 * Dois botoes explicitos em vez de um botao mais um interruptor de tamanho: a
 * escolha e rara (a folha se baixa uma vez a cada varredura) e esconder metade
 * dela atras de um estado obrigaria a lembrar em que posicao o interruptor
 * ficou. Cada botao ja diz quantas folhas vai gastar — que e a informacao que
 * de fato decide entre um e outro.
 */
export default function BlocoDeImpressao({
  titulo,
  href,
  quantidade,
  estrela = false,
}: {
  titulo: string;
  href: string;
  quantidade: number;
  estrela?: boolean;
}) {
  const folhas = (n: number) => `${n} ${n === 1 ? "folha" : "folhas"}`;
  const reduzido = `${href}${href.includes("?") ? "&" : "?"}escala=reduzida`;

  return (
    <div className="rounded-2xl bg-(--color-folha) p-4 shadow-sm ring-1 ring-black/5">
      <p
        className={`text-center text-base font-semibold ${
          estrela ? "text-(--color-estrela)" : ""
        }`}
      >
        {titulo}
      </p>

      <div className="mt-3 grid gap-2">
        <a
          href={href}
          className={`flex min-h-14 flex-col items-center justify-center rounded-xl px-4 py-2 leading-tight ${
            estrela
              ? "bg-(--color-estrela) text-white"
              : "bg-(--color-tinta) text-(--color-mesa)"
          }`}
        >
          <span className="flex items-center gap-2 text-base font-semibold">
            <IconeBaixar /> Tamanho real
          </span>
          <span className="tabular mt-0.5 text-xs opacity-80">
            {folhas(sheetsNeeded(quantidade))} · 9 por folha · 63 × 88 mm
          </span>
        </a>

        <a
          href={reduzido}
          className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-(--color-mesa) px-4 py-2 leading-tight ring-1 ring-black/5"
        >
          <span className="flex items-center gap-2 text-base font-semibold">
            <IconeBaixar /> Menores
          </span>
          <span className="tabular mt-0.5 text-xs text-(--color-tinta-fraca)">
            {folhas(sheetsNeeded(quantidade, "reduzida"))} · 25 por folha · 37 × 52 mm
          </span>
        </a>
      </div>
    </div>
  );
}

export function IconeBaixar() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2v8m0 0L4.8 6.8M8 10l3.2-3.2M2.5 13h11"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
