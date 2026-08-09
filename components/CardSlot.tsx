"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cardNumber } from "@/lib/cards";
import { webUrl, CARD_BACK_URL } from "@/lib/assets";
import type { SlotItem } from "@/lib/types";

/**
 * O bolso tem ~150 px no desktop e ~1/3 da viewport no celular. O arquivo `web/`
 * ja vem em 400w WebP (~34 KB), gerado por tools/upload-assets.mjs — nao passa
 * pelo otimizador do Next, entao nao ha `sizes` a declarar. Medido: 538 KB e
 * 1,5 s numa pagina dupla fria, 31 ms e zero bytes na revisita.
 */

/**
 * `eager`, nao `lazy`: so o par de paginas aberto e renderizado, entao toda carta
 * no DOM ja esta na tela. Adiar para o IntersectionObserver so atrasaria a pintura
 * e faria cada virada de pagina piscar vazia.
 */
const LOADING = "eager" as const;

/**
 * Janela para separar um toque de dois. O toque simples so age depois dela, senao
 * abriria a carta grande no primeiro dos dois toques da marcacao.
 */
const JANELA_TOQUE_DUPLO = 260;

type Props = {
  item: SlotItem | null;
  owned: boolean;
  highlighted: boolean;
  /** "Nao tenho e nao quero": some da colecao e do PDF. */
  hidden: boolean;
  numberWidth: number;
  /** Toque duplo: marca ou desmarca. */
  onToggle: (item: SlotItem) => void;
  /** Toque triplo: esconde ou revela. */
  onToggleHidden: (item: SlotItem) => void;
  /** Toque simples: abre a carta grande. */
  onOpen: (item: SlotItem) => void;
};

export default function CardSlot({
  item,
  owned,
  highlighted,
  hidden,
  numberWidth,
  onToggle,
  onToggleHidden,
  onOpen,
}: Props) {
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Bolso sem carta: acontece de verdade na ultima pagina. Fica vazio mesmo —
  // o fichario fisico e assim, e preencher seria mentira.
  if (!item) return <div className="bolso bolso-vazio" aria-hidden />;

  const { card, variant } = item;
  const holo = variant === "holo";
  const label = String(cardNumber(card)).padStart(numberWidth, "0");

  /**
   * Um clique abre, dois marcam, tres escondem. O `detail` do evento ja traz a
   * contagem da sequencia, entao os tres casos saem de um unico handler — sem
   * precisar somar cliques na mao.
   *
   * Marcar continua agindo no ato (sem espera): se vier um terceiro clique, o
   * `toggleHidden` apaga a posse de qualquer jeito, entao o efeito colateral do
   * segundo clique nao sobrevive.
   */
  const aoClicar = (e: React.MouseEvent) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // `detail` vem 0 quando o clique nao veio do mouse — Enter/Espaco no botao
    // focado, ou `.click()` por codigo. Nesses casos vale como um clique so.
    const cliques = e.detail || 1;
    if (cliques === 1) {
      timer.current = setTimeout(() => {
        timer.current = null;
        onOpen(item);
      }, JANELA_TOQUE_DUPLO);
    } else if (cliques === 2) {
      onToggle(item);
    } else if (cliques === 3) {
      onToggleHidden(item);
    }
  };

  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={owned}
      aria-label={`${label} ${card.name}${holo ? " brilhante" : ""} — ${
        hidden ? "escondida, você não quer essa" : owned ? "você tem" : "está faltando"
      }`}
      // `manipulation` evita que o toque duplo vire zoom no celular.
      className={`bolso bolso-botao min-h-11 cursor-pointer touch-manipulation select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-tenho) ${
        hidden ? "bolso-escondido" : ""
      } ${holo ? "bolso-holo" : ""} ${highlighted ? "pulsando" : ""}`}
    >
      {failed ? (
        /* Imagem indisponivel: verso com o numero por cima. Nunca icone quebrado. */
        <>
          <Image
            src={CARD_BACK_URL}
            alt=""
            fill
            unoptimized
            loading={LOADING}
            draggable={false}
            className="carta"
          />
          <span className="tabular absolute inset-0 grid place-items-center text-lg font-semibold text-white drop-shadow">
            {label}
          </span>
        </>
      ) : (
        <Image
          src={webUrl(card)}
          alt=""
          fill
          unoptimized
          loading={LOADING}
          draggable={false}
          onError={() => setFailed(true)}
          className={`carta ${
            hidden ? "carta-escondida" : owned ? "carta-tenho" : "carta-falta"
          }`}
        />
      )}

      {/* Selo discreto de falta. Nos modos filtrados ele continua util: e por ele
          que a crianca identifica a carta na lista de caca. */}
      {!owned && !hidden && (
        <span className="tabular pointer-events-none absolute bottom-1 left-1 z-10 rounded-md bg-black/62 px-1.5 py-0.5 text-[0.68rem] leading-none font-semibold text-white">
          {label}
        </span>
      )}

      {/* A imagem e a mesma nas duas versoes; o selo e o que diz qual bolso e qual. */}
      {holo && !hidden && (
        <span className="pointer-events-none absolute top-1 right-1 z-10 rounded-md bg-white/85 px-1.5 py-0.5 text-[0.62rem] leading-none font-bold tracking-wide text-slate-800 shadow-sm">
          HOLO
        </span>
      )}

      {hidden && (
        <span className="tabular pointer-events-none absolute bottom-1 left-1 z-10 rounded-md bg-(--color-tinta)/80 px-1.5 py-0.5 text-[0.68rem] leading-none font-semibold text-(--color-mesa)">
          {label} · não quero
        </span>
      )}
    </button>
  );
}
