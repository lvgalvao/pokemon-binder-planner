import { getUserId } from "@/lib/session";
import { listarListas } from "@/lib/db";
import { itensDasEstrelas } from "@/lib/listas";
import { buildCardsPdf, pdfFilename, type Escala } from "@/lib/pdf";

/**
 * A folha das estrelas de TODAS as colecoes — a lista de desejos numa folha so.
 * E a rota da tela inicial, onde a pergunta nao e "o que falta nesta colecao" e
 * sim "quais sao as cartas que eu quero".
 *
 * Com `?lista=<id>`, so as daquela lista. Sem ele, todas as listas juntas: e a
 * folha do "tudo junto", que so aparece na tela quando ha mais de uma lista para
 * juntar. As duas escalas de sempre valem para as duas.
 *
 * Rota estatica antes da dinamica `[setId]`: o Next resolve `/api/pdf/estrelas`
 * aqui e nunca como uma colecao chamada "estrelas".
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const escala: Escala = params.get("escala") === "reduzida" ? "reduzida" : "real";
  const listaId = params.get("lista") ?? undefined;

  const userId = await getUserId();

  // O nome da lista vira o titulo do PDF e o nome do arquivo: uma folha impressa
  // que nao diz de que lista saiu vira um monte de papel igual na mesa.
  let nome: string | null = null;
  if (listaId) {
    nome = (await listarListas(userId)).find((l) => l.id === listaId)?.nome ?? null;
    if (nome === null) return new Response("Lista não encontrada.", { status: 404 });
  }

  const itens = await itensDasEstrelas(userId, listaId);
  const bytes = await buildCardsPdf(itens, {
    escala,
    titulo: nome ?? "Cartas que eu mais quero",
  });
  if (!bytes) {
    return new Response(
      nome
        ? `Não falta nenhuma carta da lista “${nome}”.`
        : "Você ainda não marcou nenhuma carta com estrela.",
      { status: 409 },
    );
  }

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      // Sem nome de colecao: a folha mistura varias, e dizer uma so seria mentira.
      // O nome da LISTA entra quando ha uma — e ai o arquivo se identifica sozinho.
      // `inline` para poder conferir antes de salvar — ver a rota [setId].
      "Content-Disposition": `inline; filename="${pdfFilename(nome ?? "", {
        lista: "estrelas",
        escala,
      })}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
