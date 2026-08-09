import { updateBinder } from "@/lib/db";
import { getManifest } from "@/lib/manifests";
import { LAYOUTS, type SortRule } from "@/lib/types";

/** Guarda a escolha de formato e de ordem, para o fichario abrir igual da proxima vez. */
export async function POST(request: Request) {
  let body: { setId?: string; layout?: string; sortRule?: SortRule };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { setId, layout, sortRule } = body;
  if (typeof setId !== "string" || !getManifest(setId)) {
    return Response.json({ error: "Coleção não encontrada" }, { status: 404 });
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

  updateBinder(setId, patch);
  return Response.json({ ok: true });
}
