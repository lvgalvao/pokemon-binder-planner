import {
  criarFichario,
  apagarFichario,
  MAX_COLECOES_NO_FICHARIO,
  MIN_COLECOES_NO_FICHARIO,
} from "@/lib/db";
import { getManifest } from "@/lib/manifests";
import { requireUserId } from "@/lib/session";

/**
 * Montar e desfazer um fichario de varias colecoes.
 *
 * Formato e ordem nao passam por aqui — sao a mesma pergunta que a colecao ja
 * responde em /api/binder, que aceita `ficharioId`.
 */
export async function POST(request: Request) {
  let body: { nome?: string; setIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalido" }, { status: 400 });
  }

  const setIds = Array.isArray(body.setIds) ? body.setIds : [];
  // Sem repetidas: a mesma colecao duas vezes daria dois trechos identicos de
  // folhas, marcados pela mesma chave — marcar num apagaria no outro.
  const unicas = [...new Set(setIds)];
  if (
    unicas.length !== setIds.length ||
    unicas.length < MIN_COLECOES_NO_FICHARIO ||
    unicas.length > MAX_COLECOES_NO_FICHARIO ||
    unicas.some((id) => typeof id !== "string" || !getManifest(id))
  ) {
    return Response.json(
      {
        error: `Escolha de ${MIN_COLECOES_NO_FICHARIO} a ${MAX_COLECOES_NO_FICHARIO} coleções diferentes`,
      },
      { status: 400 },
    );
  }

  const nome = typeof body.nome === "string" ? body.nome.trim().slice(0, 60) : "";
  if (nome.length === 0) {
    return Response.json({ error: "O fichário precisa de um nome" }, { status: 400 });
  }

  // Aqui a conta nasce, como em toda gravacao: montar um fichario e o mesmo
  // gesto deliberado que marcar a primeira carta.
  const userId = await requireUserId();
  const fichario = await criarFichario(userId, nome, unicas);
  return Response.json({ id: fichario.id });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório" }, { status: 400 });

  // requireUserId e nao getUserId por simetria com as outras gravacoes; sem
  // sessao nao ha fichario para apagar, e a RLS cuida do resto.
  const userId = await requireUserId();
  await apagarFichario(userId, id);
  return Response.json({ ok: true });
}
