import {
  apagarLista,
  criarLista,
  listarListas,
  renomearLista,
  MAX_LISTAS,
} from "@/lib/db";
import { requireUserId } from "@/lib/session";

/**
 * Criar, renomear e apagar uma lista de desejos.
 *
 * Que cartas estao em cada lista NAO passa por aqui: isso e a estrela, e a
 * estrela ja tem a sua rota (/api/marcar, marca "estrela", agora com a lista de
 * destino). Aqui mora so o rotulo.
 */

/** O mesmo teto do check da tabela. */
const MAX_NOME = 40;

function nomeValido(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const nome = bruto.trim().slice(0, MAX_NOME);
  return nome.length === 0 ? null : nome;
}

export async function POST(request: Request) {
  let body: { nome?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalido" }, { status: 400 });
  }

  const nome = nomeValido(body.nome);
  if (!nome) return Response.json({ error: "A lista precisa de um nome" }, { status: 400 });

  // Aqui a conta nasce, como em toda gravacao.
  const userId = await requireUserId();

  // O teto e conferido aqui e nao no banco: um check com subconsulta na tabela
  // seria um gatilho, e a resposta que interessa e a frase na tela.
  if ((await listarListas(userId)).length >= MAX_LISTAS) {
    return Response.json(
      { error: `Você já tem ${MAX_LISTAS} listas — apague uma para criar outra.` },
      { status: 409 },
    );
  }

  const lista = await criarLista(userId, nome);
  return Response.json(lista);
}

export async function PATCH(request: Request) {
  let body: { id?: string; nome?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalido" }, { status: 400 });
  }

  const nome = nomeValido(body.nome);
  if (typeof body.id !== "string" || !nome) {
    return Response.json({ error: "id e nome sao obrigatorios" }, { status: 400 });
  }

  const userId = await requireUserId();
  await renomearLista(userId, body.id, nome);
  return Response.json({ ok: true });
}

/**
 * Apagar a lista leva as estrelas dela junto (cascade). E o unico DELETE do app
 * que custa marcacao — desfazer um fichario nao custa — e por isso a tela
 * pergunta com o numero de cartas na frase, antes de chegar aqui.
 */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório" }, { status: 400 });

  const userId = await requireUserId();
  await apagarLista(userId, id);
  return Response.json({ ok: true });
}
