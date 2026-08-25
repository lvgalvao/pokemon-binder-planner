import { notFound } from "next/navigation";
import { getManifest } from "@/lib/manifests";
import { getBinder, getOwnedIds, getStarredIds } from "@/lib/db";
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

  // Tres consultas independentes: em paralelo elas custam um round-trip, nao
  // tres. Sem sessao, todas devolvem vazio sem tocar o banco.
  const userId = await getUserId();
  const [binder, owned, starred] = await Promise.all([
    getBinder(userId, setId),
    getOwnedIds(userId, setId),
    getStarredIds(userId, setId),
  ]);

  return (
    <Binder
      titulo={manifest.setName}
      colecoes={[
        { setId: manifest.setId, setName: manifest.setName, cards: manifest.cards },
      ]}
      origem={{ tipo: "colecao", setId: manifest.setId }}
      initialOwned={[...owned]}
      initialStarred={[...starred]}
      initialRows={binder.rows}
      initialColumns={binder.columns}
      initialSortRule={binder.sortRule}
    />
  );
}
