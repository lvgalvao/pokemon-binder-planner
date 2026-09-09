import { notFound } from "next/navigation";
import { findPosicao, getManifest, listSets, posicoesDoSet } from "@/lib/manifests";
import {
  getArranjo,
  getBinder,
  getOwnedIds,
  listarListas,
  starredComLista,
} from "@/lib/db";
import { resolver } from "@/lib/arranjo";
import { getUserId } from "@/lib/session";
import Binder from "@/components/Binder";

export const dynamic = "force-dynamic";

/**
 * Tela 2 — o fichario.
 * Abre ja montado, com 3x3 e ordem por numero. Sem tela intermediaria e sem botao
 * de confirmar: layout e ordem viram interruptores dentro da propria tela, onde a
 * crianca ve a consequencia em vez de imaginar.
 */
export default async function BinderPage({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  const manifest = getManifest(setId);
  if (!manifest) notFound();

  // Consultas independentes: em paralelo elas custam um round-trip, nao quatro.
  // Sem sessao, todas devolvem vazio sem tocar o banco.
  const userId = await getUserId();
  const [binder, owned, starred, listas] = await Promise.all([
    getBinder(userId, setId),
    getOwnedIds(userId, setId),
    starredComLista(userId, [setId]),
    listarListas(userId),
  ]);

  // O arranjo manual depende do formato da folha (uma folha de 4 bolsos e outra
  // folha), entao so da para pedi-lo depois de saber o layout — dai a segunda
  // ida ao banco, e nao uma quinta dentro do Promise.all.
  const alvo = { tipo: "colecao", setId: manifest.setId } as const;
  const gravado = await getArranjo(userId, alvo, binder);
  // Reconciliado AQUI, e nao no cliente: e o servidor que conhece as 27 colecoes
  // e consegue resolver uma chave puxada de qualquer uma delas.
  const arranjo = gravado
    ? resolver(gravado, posicoesDoSet(setId, binder.sortRule), findPosicao)
    : null;

  return (
    <Binder
      titulo={manifest.setName}
      colecoes={[
        { setId: manifest.setId, setName: manifest.setName, cards: manifest.cards },
      ]}
      origem={{ tipo: "colecao", setId: manifest.setId }}
      initialOwned={[...owned]}
      initialStarred={[...starred]}
      listas={listas}
      initialRows={binder.rows}
      initialColumns={binder.columns}
      initialSortRule={binder.sortRule}
      arranjo={arranjo}
      catalogo={listSets()}
    />
  );
}
