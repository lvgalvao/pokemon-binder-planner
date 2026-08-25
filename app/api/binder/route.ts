import { updateBinder, updateFichario } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { getManifest } from "@/lib/manifests";
import { LAYOUTS, type SortRule } from "@/lib/types";

/**
 * Guarda a escolha de formato e de ordem, para o fichario abrir igual da proxima vez.
 *
 * Serve os dois ficharios que a tela sabe abrir — a colecao (`setId`) e o
 * montado a mao (`ficharioId`) — porque a pergunta e a mesma: em que formato de
 * folha esta pasta fica. Duas rotas seriam a mesma validacao escrita duas vezes.
 */
export async function POST(request: Request) {
  let body: {
    setId?: string;
    ficharioId?: string;
    layout?: string;
    sortRule?: SortRule;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { setId, ficharioId, layout, sortRule } = body;
  const alvo =
    typeof ficharioId === "string"
      ? ({ tipo: "montado", id: ficharioId } as const)
      : typeof setId === "string" && getManifest(setId)
        ? ({ tipo: "colecao", setId } as const)
        : null;
  if (!alvo) {
    return Response.json({ error: "Fichário não encontrado" }, { status: 404 });
  }

  const patch: { rows?: number; columns?: number; sortRule?: SortRule } = {};

  if (layout !== undefined) {
    const chosen = LAYOUTS[layout];
    if (!chosen) return Response.json({ error: "Layout inválido" }, { status: 400 });
    patch.rows = chosen.rows;
    patch.columns = chosen.columns;
  }

  if (sortRule !== undefined) {
    if (sortRule !== "number" && sortRule !== "rarity") {
      return Response.json({ error: "Ordem inválida" }, { status: 400 });
    }
    patch.sortRule = sortRule;
  }

  const userId = await requireUserId();
  if (alvo.tipo === "colecao") {
    await updateBinder(userId, alvo.setId, patch);
  } else {
    // Sem checar se o fichario existe: a RLS ja recusa o que nao e dele, e um id
    // inventado vira um update de zero linhas — nao ha o que vazar aqui.
    await updateFichario(userId, alvo.id, patch);
  }
  return Response.json({ ok: true });
}
