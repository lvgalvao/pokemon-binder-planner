import { setOwned, setHidden } from "@/lib/db";
import { getManifest } from "@/lib/manifests";
import { requireUserId } from "@/lib/session";
import { parseItemKey, variantesDe } from "@/lib/types";

/**
 * As duas marcacoes que a crianca faz num bolso, numa rota so.
 *
 *   tenho     toque duplo. Aceita lista para o "tenho todas desta pagina" ir num
 *             round-trip so.
 *   escondida toque triplo. "Nao tenho e NAO QUERO": some do fichario, nao conta
 *             como faltante e nao entra no PDF. Esconder tambem apaga a posse.
 *
 * Eram duas rotas, e a diferenca entre os arquivos era o nome do campo e a funcao
 * chamada no fim — mesma validacao, mesmo formato, mesmos erros. Duas copias de
 * uma validacao e duas chances de so uma delas ser corrigida.
 *
 * A interface ja mudou de cor antes desta resposta chegar; aqui e so a gravacao.
 */

const MARCAS = ["tenho", "escondida"] as const;
type Marca = (typeof MARCAS)[number];

export async function POST(request: Request) {
  let body: { setId?: string; cardIds?: string[]; marca?: Marca; valor?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { setId, cardIds, marca, valor } = body;
  if (
    typeof setId !== "string" ||
    !Array.isArray(cardIds) ||
    typeof valor !== "boolean" ||
    !MARCAS.includes(marca as Marca)
  ) {
    return Response.json(
      { error: "setId, cardIds, marca e valor sao obrigatorios" },
      { status: 400 },
    );
  }

  const manifest = getManifest(setId);
  if (!manifest) return Response.json({ error: "Coleção não encontrada" }, { status: 404 });

  // Aceita chaves de item: "sv7-2" (normal), "sv7-2#holo" (brilhante) e
  // "me2pt5-4#pokebola" (o segundo reverse, so onde a colecao o tem). A conta e
  // feita pela mesma funcao que monta os bolsos, entao nunca se grava posse de
  // uma posicao que o fichario nao mostra.
  const porId = new Map(manifest.cards.map((c) => [c.id, c]));
  const accepted = cardIds.filter((key) => {
    const { cardId, variant } = parseItemKey(key);
    const card = porId.get(cardId);
    if (!card) return false;
    return variantesDe(setId, card).includes(variant);
  });
  if (accepted.length === 0) {
    return Response.json({ error: "Nenhuma carta válida" }, { status: 400 });
  }

  // So aqui a conta nasce, e so depois da validacao: um pedido com carta
  // inexistente e recusado sem ter criado usuario nenhum.
  const userId = await requireUserId();
  const gravar = marca === "tenho" ? setOwned : setHidden;
  await gravar(userId, setId, accepted, valor);

  return Response.json({ ok: true, count: accepted.length });
}
