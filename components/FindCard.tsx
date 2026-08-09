"use client";

import { useState } from "react";

/**
 * "Achar carta" — o modo dia a dia inteiro.
 * O inventario completo acontece uma vez; depois disso o uso real e "comprei a 117".
 * Teclado numerico grande em vez de campo de texto: nada de teclado de sistema
 * cobrindo metade da tela, e alvo de toque folgado para dedo de crianca.
 */
export default function FindCard({
  max,
  onGo,
  onClose,
}: {
  max: number;
  onGo: (n: number) => boolean;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [notFound, setNotFound] = useState(false);

  const press = (digit: string) => {
    setNotFound(false);
    setValue((v) => (v.length >= 4 ? v : (v + digit).replace(/^0+(?=\d)/, "")));
  };

  const go = () => {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || !onGo(n)) {
      setNotFound(true);
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Achar carta pelo número"
    >
      <div
        className="w-full max-w-xs rounded-3xl bg-(--color-folha) p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-base text-(--color-tinta-fraca)">
          Qual é o número da carta?
        </p>

        <div className="tabular mt-3 mb-1 text-center text-5xl font-semibold">
          {value || <span className="text-(--color-tinta-tenue)">—</span>}
        </div>

        <p className="tabular h-5 text-center text-sm text-(--color-tinta-fraca)">
          {notFound ? (
            <span className="font-medium text-(--color-tinta)">
              Não existe carta {value} aqui
            </span>
          ) : (
            <>de 1 a {max}</>
          )}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => press(d)}
              className="tabular h-14 rounded-2xl bg-(--color-mesa) text-2xl font-medium active:scale-95"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setNotFound(false);
              setValue((v) => v.slice(0, -1));
            }}
            aria-label="Apagar"
            className="h-14 rounded-2xl bg-(--color-mesa) text-xl active:scale-95"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => press("0")}
            className="tabular h-14 rounded-2xl bg-(--color-mesa) text-2xl font-medium active:scale-95"
          >
            0
          </button>
          <button
            type="button"
            onClick={go}
            disabled={value === ""}
            aria-label="Ir para a carta"
            className="h-14 rounded-2xl bg-(--color-tenho) text-xl font-semibold text-white disabled:opacity-35 active:scale-95"
          >
            Ir
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 h-11 w-full rounded-2xl text-base text-(--color-tinta-fraca)"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
