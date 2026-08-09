import { notFound } from "next/navigation";
import { getManifest } from "@/lib/manifests";
import { getBinder, getOwnedIds, getHiddenIds } from "@/lib/db";
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
  const [binder, owned, hidden] = await Promise.all([
    getBinder(userId, setId),
    getOwnedIds(userId, setId),
    getHiddenIds(userId, setId),
  ]);

  return (
    <Binder
      setId={manifest.setId}
      setName={manifest.setName}
      cards={manifest.cards}
      initialOwned={[...owned]}
      initialHidden={[...hidden]}
      initialRows={binder.rows}
      initialColumns={binder.columns}
      initialSortRule={binder.sortRule}
    />
  );
}
