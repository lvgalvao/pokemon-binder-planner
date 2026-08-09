import { setHidden } from "@/lib/db";
import { getManifest } from "@/lib/manifests";
import { parseItemKey, temReverseHolo } from "@/lib/types";

/**
 * Esconde ou revela cartas. Escondida = "nao tenho e nao quero": some do fichario,
 * nao conta como faltante e nao entra no PDF de impressao.
 */
export async function POST(request: Request) {
  let body: { setId?: string; cardIds?: string[]; hidden?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { setId, cardIds, hidden } = body;
  if (typeof setId !== "string" || !Array.isArray(cardIds) || typeof hidden !== "boolean") {
    return Response.json({ error: "setId, cardIds e hidden sao obrigatorios" }, { status: 400 });
  }

  const manifest = getManifest(setId);
  if (!manifest) return Response.json({ error: "Coleção não encontrada" }, { status: 404 });

  // Aceita chaves de item: "sv7-2" (normal) e "sv7-2#holo" (brilhante). A versao
  // brilhante so vale para cartas que de fato tem reverse holo naquele set.
  const porId = new Map(manifest.cards.map((c) => [c.id, c]));
  const accepted = cardIds.filter((key) => {
    const { cardId, variant } = parseItemKey(key);
    const card = porId.get(cardId);
    if (!card) return false;
    return variant === "normal" || temReverseHolo(setId, card);
  });
  if (accepted.length === 0) {
    return Response.json({ error: "Nenhuma carta válida" }, { status: 400 });
  }

  setHidden(setId, accepted, hidden);
  return Response.json({ ok: true, count: accepted.length });
}
