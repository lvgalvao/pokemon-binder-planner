import { getUserId } from "@/lib/session";
import { getManifest } from "@/lib/manifests";
import { itensDaColecao, type Lista } from "@/lib/listas";
import { buildCardsPdf, pdfFilename, type Escala } from "@/lib/pdf";

/**
 * A folha A4 de uma colecao, nas quatro combinacoes possiveis:
 *
 *   ?lista=faltantes|estrelas   o que entra na folha (padrao: faltantes)
 *   ?escala=real|reduzida       63 x 88 mm, 9 por folha (padrao), ou ~59%, 25 por folha
 *
 * Montada em coordenadas absolutas de proposito — imprimir HTML pelo navegador
 * passa por "ajustar a pagina" e a carta sai fora de escala.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ setId: string }> },
) {
  const { setId } = await params;
  const manifest = getManifest(setId);
  if (!manifest) return new Response("Coleção não encontrada", { status: 404 });

  const query = new URL(request.url).searchParams;
  const lista: Lista = query.get("lista") === "estrelas" ? "estrelas" : "faltantes";
  const escala: Escala = query.get("escala") === "reduzida" ? "reduzida" : "real";

  // getUserId e nao requireUserId: baixar o PDF nao e motivo para criar conta.
  // Sem sessao, nada esta marcado e a folha das faltantes sai com a colecao
  // inteira — que e exatamente o que alguem sem nenhuma carta precisa imprimir.
  const itens = await itensDaColecao(await getUserId(), setId, lista);
  if (!itens) return new Response("Coleção não encontrada", { status: 404 });

  const bytes = await buildCardsPdf(itens, {
    escala,
    titulo: lista === "estrelas" ? "Cartas que eu mais quero" : "Cartas faltantes",
  });
  if (!bytes) {
    // Nada a imprimir: nao existe folha em branco para gerar.
    return new Response(
      lista === "estrelas"
        ? "Você já tem todas as cartas que marcou com estrela."
        : "Não falta nenhuma carta.",
      { status: 409 },
    );
  }

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      // `inline`: a folha abre no visualizador antes de virar arquivo. Conferir
      // ANTES de salvar importa porque o que entra nela e derivado do que esta
      // marcado — e um PDF errado so se descobre depois de imprimir.
      "Content-Disposition": `inline; filename="${pdfFilename(manifest.setName, { lista, escala })}"`,
      "Content-Length": String(bytes.byteLength),
      // A URL e sempre a mesma e o conteudo muda a cada marcacao. Sem isto o
      // navegador reaproveita a folha antiga por heuristica de frescor, e o PDF
      // passa a discordar da tela — foi exatamente o que apareceu em uso.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
