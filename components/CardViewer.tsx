"use client";

import { useEffect } from "react";
import Image from "next/image";
import { printUrl } from "@/lib/assets";
import { cardNumber } from "@/lib/cards";
import { BUCKET_LABELS, type Card, type SlotItem } from "@/lib/types";

/**
 * A carta grande. Um toque simples abre daqui — e a parte divertida: a crianca
 * quer ver a arte, nao so administrar uma lista.
 *
 * Tambem e o caminho de marcacao com um toque so: quem nao acerta o toque duplo
 * abre a carta e usa o botao. O toque duplo continua sendo o atalho da varredura.
 */
export default function CardViewer({
  item,
  owned,
  hidden,
  numberWidth,
  onToggle,
  onToggleHidden,
  onClose,
}: {
  item: SlotItem;
  owned: boolean;
  hidden: boolean;
  numberWidth: number;
  onToggle: (item: SlotItem) => void;
  onToggleHidden: (item: SlotItem) => void;
  onClose: () => void;
}) {
  const { card, variant } = item;
  const holo = variant === "holo";
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", aoTeclar);
    // Trava a rolagem do fichario enquanto a carta esta aberta.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [onClose]);

  const label = String(cardNumber(card)).padStart(numberWidth, "0");

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-black/85 p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${label} ${card.name}`}
    >
      <div
        className="flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/*
          Dimensoes intrinsecas com `max-h` e `w-auto`, em vez de `fill`: assim a
          proporcao 63x88 se mantem quando a altura da tela e quem limita, sem
          distorcer a carta em telas baixas.
        */}
        {/* O derivado de impressao, nao o da grade: aqui a carta ocupa metade da
            tela e os 400w da grade ficariam borrados. E o mesmo arquivo que vai
            para o PDF — "ver grande" e "imprimir" pedem a mesma resolucao. */}
        <Image
          src={printUrl(card)}
          alt={card.name}
          width={733}
          height={1024}
          unoptimized
          priority
          draggable={false}
          className="h-auto max-h-[58vh] w-auto max-w-[82vw] rounded-xl shadow-2xl"
        />

        <p className="tabular text-center text-white">
          <span className="text-lg font-semibold">
            {label} · {card.name}
          </span>
          <span className="mt-0.5 block text-sm text-white/60">
            {BUCKET_LABELS[card.bucket]}
            {holo && " · versão brilhante (holo)"}
          </span>
        </p>

        <button
          type="button"
          disabled={hidden}
          onClick={() => {
            onToggle(item);
            onClose();
          }}
          className={`min-h-14 w-full min-w-64 rounded-2xl px-6 text-base font-semibold transition-colors disabled:opacity-35 ${
            owned
              ? "bg-white/12 text-white ring-1 ring-white/25"
              : "bg-(--color-tenho) text-white"
          }`}
        >
          {owned ? "Não tenho mais essa" : "Tenho essa!"}
        </button>

        {/* Caminho de um toque so para o que o toque triplo faz no fichario. */}
        <button
          type="button"
          onClick={() => {
            onToggleHidden(item);
            onClose();
          }}
          className="min-h-11 px-5 text-sm text-white/55 underline underline-offset-4"
        >
          {hidden ? "Quero essa carta de volta" : "Não quero essa carta"}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="min-h-11 px-5 text-base text-white/60"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
