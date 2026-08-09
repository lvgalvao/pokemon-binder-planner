import { getBinder, getOwnedIds, getHiddenIds } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { getManifest } from "@/lib/manifests";
import { sortCards } from "@/lib/cards";
import { missingCards } from "@/lib/binder";
import { buildMissingPdf, pdfFilename } from "@/lib/pdf";
import { expandirVariantes, itemKey } from "@/lib/types";

/**
 * PDF A4 das cartas faltantes em tamanho real (63 x 88 mm), 9 por folha.
 * Montado em coordenadas absolutas de proposito — imprimir HTML pelo navegador
 * passa por "ajustar a pagina" e a carta sai fora de escala.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ setId: string }> },
) {
  const { setId } = await params;
  const manifest = getManifest(setId);
  if (!manifest) return new Response("Coleção não encontrada", { status: 404 });

  // getUserId e nao requireUserId: baixar o PDF nao e motivo para criar conta.
  // Sem sessao, nada esta marcado e a folha sai com a colecao inteira — que e
  // exatamente o que alguem sem nenhuma carta precisa imprimir.
  const userId = await getUserId();

  // Mesma ordem escolhida no fichario, para a folha impressa sair na sequencia
  // em que a crianca vai encaixar as cartas.
  // Cartas escondidas sao as que ele nao quer ter: nao entram na folha de impressao.
  const [binder, escondidas, possuidas] = await Promise.all([
    getBinder(userId, setId),
    getHiddenIds(userId, setId),
    getOwnedIds(userId, setId),
  ]);
  // Cada posicao faltante vira uma carta na folha: faltando a simples E a
  // brilhante, a mesma arte sai duas vezes — sao dois bolsos a preencher.
  const chave = (i: { card: { id: string }; variant: "normal" | "holo" }) =>
    itemKey(i.card.id, i.variant);
  const posicoes = expandirVariantes(
    sortCards(manifest.cards, binder.sortRule),
    setId,
  ).filter((i) => !escondidas.has(chave(i)));
  const missing = missingCards(posicoes, possuidas, chave);

  const bytes = await buildMissingPdf(missing);
  if (!bytes) {
    // Colecao completa: nao existe folha em branco para gerar.
    return new Response("Não falta nenhuma carta.", { status: 409 });
  }

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFilename(manifest.setName)}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
