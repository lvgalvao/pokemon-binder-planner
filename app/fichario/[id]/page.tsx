import { notFound } from "next/navigation";
import { getManifest } from "@/lib/manifests";
import {
  getFichario,
  listarListas,
  ownedIdsDeSets,
  starredComLista,
} from "@/lib/db";
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

  // Uma consulta para as posses de TODAS as colecoes e outra para as estrelas —
  // um `in` custa o mesmo round-trip que um `eq`, e as tres vao em paralelo.
  const setIds = colecoes.map((c) => c.setId);
  const [owned, starred, listas] = await Promise.all([
    ownedIdsDeSets(userId, setIds),
    starredComLista(userId, setIds),
    listarListas(userId),
  ]);

  return (
    <Binder
      titulo={fichario.nome}
      colecoes={colecoes}
      origem={{ tipo: "montado", id: fichario.id }}
      initialOwned={[...owned]}
      initialStarred={[...starred]}
      listas={listas}
      initialRows={fichario.rows}
      initialColumns={fichario.columns}
      initialSortRule={fichario.sortRule}
    />
  );
}
