"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cardNumber } from "@/lib/cards";
import { webUrl, CARD_BACK_URL } from "@/lib/assets";
import { rotuloVariante, nomeVariante, type SlotItem } from "@/lib/types";

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
  /** Preciso para o selo: onde ha dois reverses, ele nomeia QUAL. */
  setId: string;
  owned: boolean;
  highlighted: boolean;
  /** "Quero MUITO essa": segue no fichario e segue contando como faltante. */
  starred: boolean;
  numberWidth: number;
  /** Toque duplo: marca ou desmarca. */
  onToggle: (item: SlotItem) => void;
  /** Toque triplo: poe ou tira a estrela. */
  onToggleStar: (item: SlotItem) => void;
  /** Toque simples: abre a carta grande. */
  onOpen: (item: SlotItem) => void;
};

export default function CardSlot({
  item,
  setId,
  owned,
  highlighted,
  starred,
  numberWidth,
  onToggle,
  onToggleStar,
  onOpen,
}: Props) {
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Bolso sem carta: acontece de verdade na ultima pagina. Fica vazio mesmo —
  // o fichario fisico e assim, e preencher seria mentira.
  if (!item) return <div className="bolso bolso-vazio" aria-hidden />;

  const { card, variant } = item;
  const holo = variant !== "normal";
  // Onde a colecao tem os dois reverses, o selo nomeia o padrao (ENERGIA /
  // POKEBOLA); onde ha um so, segue "HOLO", que e como a crianca ja o chama.
  const selo = rotuloVariante(setId, variant);
  const porExtenso = nomeVariante(setId, variant);
  const label = String(cardNumber(card)).padStart(numberWidth, "0");

  /**
   * Um clique abre, dois marcam, tres poem estrela. O `detail` do evento ja traz
   * a contagem da sequencia, entao os tres casos saem de um unico handler — sem
   * precisar somar cliques na mao.
   *
   * Marcar continua agindo no ato (sem espera). O terceiro clique nao desfaz o
   * segundo de proposito: quem toca tres vezes numa carta que acabou de marcar
   * fica com ela marcada E com estrela, que sao respostas a perguntas
   * diferentes ("ja tenho?" e "quero muito?").
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
      onToggleStar(item);
    }
  };

  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={owned}
      aria-label={`${label} ${card.name}${porExtenso ? " " + porExtenso : ""} — ${
        owned ? "você tem" : "está faltando"
      }${starred ? ", você quer muito essa" : ""}`}
      // `manipulation` evita que o toque duplo vire zoom no celular.
      className={`bolso bolso-botao min-h-11 cursor-pointer touch-manipulation select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-tenho) ${
        starred ? "bolso-estrela" : ""
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
          className={`carta ${owned ? "carta-tenho" : "carta-falta"}`}
        />
      )}

      {/* Selo discreto de falta. Nos modos filtrados ele continua util: e por ele
          que a crianca identifica a carta na lista de caca. */}
      {!owned && (
        <span className="tabular pointer-events-none absolute bottom-1 left-1 z-10 rounded-md bg-black/62 px-1.5 py-0.5 text-[0.68rem] leading-none font-semibold text-white">
          {label}
        </span>
      )}

      {/* A imagem e a mesma em todas as versoes; o selo e o que diz qual bolso e qual. */}
      {holo && (
        <span className="pointer-events-none absolute top-1 right-1 z-10 rounded-md bg-white/85 px-1.5 py-0.5 text-[0.62rem] leading-none font-bold tracking-wide text-slate-800 shadow-sm">
          {selo}
        </span>
      )}

      {/* A estrela vai no canto de cima a ESQUERDA: o de cima a direita e do selo
          da versao brilhante, e as duas marcas coexistem no mesmo bolso. */}
      {starred && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 left-1 z-10 grid h-5 w-5 place-items-center rounded-full bg-(--color-estrela) text-[0.7rem] leading-none text-white shadow-sm"
        >
          ★
        </span>
      )}
    </button>
  );
}
