import { listaExiste, listaPadrao, setOwned, setStarred } from "@/lib/db";
import { getManifest } from "@/lib/manifests";
import { requireUserId } from "@/lib/session";
import { parseItemKey, variantesDe } from "@/lib/types";

/**
 * As duas marcacoes que a crianca faz num bolso, numa rota so.
 *
 *   tenho    toque duplo. Aceita lista para o "tenho todas desta pagina" ir num
 *            round-trip so.
 *   estrela  toque triplo. "QUERO MUITO essa": a carta continua no fichario e
 *            continua contando como faltante — a estrela nao esconde nada, ela
 *            destaca. Ganha folha propria no PDF, sozinha ou junto com as
 *            estrelas das outras colecoes.
 *
 * A estrela cai na LISTA que o pedido disser (`listaId`). Sem lista dita, cai na
 * primeira do usuario — e se ele nao tiver nenhuma, ela nasce aqui: tres toques
 * numa carta continuam sendo o gesto inteiro, sem ter de criar nada antes.
 *
 * Eram duas rotas, e a diferenca entre os arquivos era o nome do campo e a funcao
 * chamada no fim — mesma validacao, mesmo formato, mesmos erros. Duas copias de
 * uma validacao e duas chances de so uma delas ser corrigida.
 *
 * A interface ja mudou de cor antes desta resposta chegar; aqui e so a gravacao.
 */

const MARCAS = ["tenho", "estrela"] as const;
type Marca = (typeof MARCAS)[number];

export async function POST(request: Request) {
  let body: {
    setId?: string;
    cardIds?: string[];
    marca?: Marca;
    valor?: boolean;
    listaId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { setId, cardIds, marca, valor, listaId } = body;
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

  if (marca === "tenho") {
    await setOwned(userId, setId, accepted, valor);
    return Response.json({ ok: true, count: accepted.length });
  }

  // Tirar a estrela nao pergunta de que lista ela era; por a estrela precisa
  // saber onde. Uma lista que nao e dele vira 404 antes de gravar — a FK
  // composta do banco tambem recusaria, mas ali o erro chegaria como violacao de
  // constraint, e o que a tela precisa saber e que a lista nao existe.
  let destino: string | undefined;
  if (valor) {
    if (listaId !== undefined) {
      if (typeof listaId !== "string" || !(await listaExiste(userId, listaId))) {
        return Response.json({ error: "Lista não encontrada" }, { status: 404 });
      }
      destino = listaId;
    } else {
      destino = await listaPadrao(userId);
    }
  }

  await setStarred(userId, setId, accepted, valor, destino);
  return Response.json({ ok: true, count: accepted.length, listaId: destino });
}
