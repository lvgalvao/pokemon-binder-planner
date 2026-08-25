import { notFound } from "next/navigation";
import { getManifest } from "@/lib/manifests";
import { getFichario, getOwnedIds, getStarredIds } from "@/lib/db";
import { getUserId } from "@/lib/session";
import Binder from "@/components/Binder";

export const dynamic = "force-dynamic";

/**
 * O fichario montado a mao: varias colecoes numa sequencia so.
 *
 * E a mesma tela 2, com a mesma logica de bolso, marcacao e folha — o que muda e
 * que as colecoes vem em serie, cada uma comecando numa pagina nova. Sem sessao
 * nao existe fichario montado (ele nasce de um gesto gravado), entao a rota da
 * 404 em vez de uma tela vazia sem explicacao.
 */
export default async function FicharioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await getUserId();
  const fichario = await getFichario(userId, id);
  if (!fichario) notFound();

  // Uma colecao que saiu do disco nao derruba o fichario inteiro: ela some da
  // sequencia e o resto continua de pe.
  const colecoes = fichario.setIds
    .map((setId) => getManifest(setId))
    .filter((m) => m !== null)
    .map((m) => ({ setId: m.setId, setName: m.setName, cards: m.cards }));
  if (colecoes.length === 0) notFound();

  // Um par de consultas por colecao, todas em paralelo: o custo e o round-trip
  // mais lento, nao a soma deles.
  const marcas = await Promise.all(
    colecoes.map(async (c) => ({
      owned: await getOwnedIds(userId, c.setId),
      starred: await getStarredIds(userId, c.setId),
    })),
  );

  return (
    <Binder
      titulo={fichario.nome}
      colecoes={colecoes}
      origem={{ tipo: "montado", id: fichario.id }}
      initialOwned={marcas.flatMap((m) => [...m.owned])}
      initialStarred={marcas.flatMap((m) => [...m.starred])}
      initialRows={fichario.rows}
      initialColumns={fichario.columns}
      initialSortRule={fichario.sortRule}
    />
  );
}
