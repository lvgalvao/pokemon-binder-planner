import { getUserId } from "@/lib/session";
import { getFichario } from "@/lib/db";
import { itensDoFichario, type Lista } from "@/lib/listas";
import { buildCardsPdf, pdfFilename, type Escala } from "@/lib/pdf";

/**
 * A folha A4 de um fichario montado — as mesmas quatro combinacoes da colecao
 * (faltantes/estrelas x real/reduzida), so que atravessando todas as colecoes
 * dele, na ordem das folhas.
 *
 * getUserId e nao requireUserId em coerencia com a rota da colecao: baixar nao
 * cria conta. Sem sessao nao ha fichario montado, e a resposta e 404.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getUserId();
  const fichario = await getFichario(userId, id);
  if (!fichario) return new Response("Fichário não encontrado", { status: 404 });

  const query = new URL(request.url).searchParams;
  const lista: Lista = query.get("lista") === "estrelas" ? "estrelas" : "faltantes";
  const escala: Escala = query.get("escala") === "reduzida" ? "reduzida" : "real";

  const itens = await itensDoFichario(userId, fichario.setIds, lista);
  const bytes = await buildCardsPdf(itens, {
    escala,
    titulo: lista === "estrelas" ? "Cartas que eu mais quero" : "Cartas faltantes",
  });
  if (!bytes) {
    return new Response(
      lista === "estrelas"
        ? "Você já tem todas as cartas que marcou com estrela."
        : "Não falta nenhuma carta neste fichário.",
      { status: 409 },
    );
  }

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFilename(fichario.nome, { lista, escala })}"`,
      "Content-Length": String(bytes.byteLength),
      // Mesma razao da rota da colecao: a URL e fixa e o conteudo muda a cada
      // marcacao, entao o frescor por heuristica faria o PDF discordar da tela.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
