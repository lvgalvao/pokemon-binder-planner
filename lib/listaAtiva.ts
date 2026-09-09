"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Qual lista de desejos esta na frente — e, no fichario, para onde vai a proxima
 * estrela.
 *
 * Mora no `localStorage` e nao no banco de proposito. Nao e estado da colecao
 * nem do fichario: e onde a crianca esta olhando agora, a mesma natureza do
 * filtro de raridade, que tambem nao e persistido. Guardar no banco faria a
 * escolha atravessar aparelhos e voltar dias depois — e ai a estrela cairia numa
 * lista que ela nao lembra de ter escolhido.
 *
 * O primeiro render usa sempre a primeira lista, nunca o que esta guardado: ler
 * `localStorage` antes da hidratacao daria marcacao diferente no servidor e no
 * cliente. A escolha guardada entra logo depois, no efeito.
 */
const CHAVE = "pokemon-binder:lista-ativa";

export function useListaAtiva(
  listas: readonly { id: string }[],
): [string | null, (id: string) => void] {
  const [ativa, setAtiva] = useState<string | null>(listas[0]?.id ?? null);

  useEffect(() => {
    let guardada: string | null = null;
    try {
      guardada = localStorage.getItem(CHAVE);
    } catch {
      // Navegador com armazenamento bloqueado: a primeira lista serve.
    }
    // Uma lista apagada continua guardada aqui. Cair na primeira e melhor que
    // ficar com nenhuma selecionada e a estrela sem destino visivel.
    setAtiva((atual) => {
      const valida = (id: string | null) => id !== null && listas.some((l) => l.id === id);
      if (valida(guardada)) return guardada;
      return valida(atual) ? atual : (listas[0]?.id ?? null);
    });
  }, [listas]);

  const escolher = useCallback((id: string) => {
    setAtiva(id);
    try {
      localStorage.setItem(CHAVE, id);
    } catch {
      // Sem armazenamento a escolha vale so nesta tela — o que ja e o suficiente
      // para o gesto que ela acabou de fazer.
    }
  }, []);

  return [ativa, escolher];
}
