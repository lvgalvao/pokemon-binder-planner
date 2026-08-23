import { getUserId } from "@/lib/session";
import { itensDasEstrelas } from "@/lib/listas";
import { buildCardsPdf, pdfFilename, type Escala } from "@/lib/pdf";

/**
 * A folha das estrelas de TODAS as colecoes — a lista de desejos inteira numa
 * folha so. E a rota da tela inicial, onde a pergunta nao e "o que falta nesta
 * colecao" e sim "quais sao as cartas que eu quero".
 *
 * Rota estatica antes da dinamica `[setId]`: o Next resolve `/api/pdf/estrelas`
 * aqui e nunca como uma colecao chamada "estrelas".
 */
export async function GET(request: Request) {
  const escala: Escala =
    new URL(request.url).searchParams.get("escala") === "reduzida" ? "reduzida" : "real";

  const itens = await itensDasEstrelas(await getUserId());
  const bytes = await buildCardsPdf(itens, {
    escala,
    titulo: "Cartas que eu mais quero",
  });
  if (!bytes) {
    return new Response("Você ainda não marcou nenhuma carta com estrela.", {
      status: 409,
    });
  }

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      // Sem nome de colecao: a folha mistura varias, e dizer uma so seria mentira.
      "Content-Disposition": `attachment; filename="${pdfFilename("", { lista: "estrelas", escala })}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
