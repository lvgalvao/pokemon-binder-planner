import { posicoesDoSet } from "@/lib/manifests";
import { itemKey } from "@/lib/types";

/**
 * As cartas de uma colecao, para a gaveta do modo arrumar.
 *
 * Sob demanda, e nao no payload da pagina: as 27 colecoes somam 7.735 posicoes,
 * e mandar todas para o navegador so porque a gaveta PODE ser aberta custaria
 * mais que o fichario inteiro. A crianca abre a gaveta, escolhe uma colecao, e
 * so entao esta lista viaja.
 *
 * Somente leitura e sem sessao: e o mesmo catalogo publico que a tela inicial ja
 * mostra. Nao cria conta, nao le marcacao — quem sabe o que ele tem e a tela.
 */
export async function GET(request: Request) {
  const setId = new URL(request.url).searchParams.get("setId");
  if (!setId) return Response.json({ error: "setId obrigatório" }, { status: 400 });

  // Sempre por numero: na gaveta a crianca procura "a 117", nao "as raras".
  const posicoes = posicoesDoSet(setId, "number");
  if (posicoes.length === 0) {
    return Response.json({ error: "Coleção não encontrada" }, { status: 404 });
  }

  return Response.json({
    setId,
    setName: posicoes[0].setName,
    cartas: posicoes.map((p) => ({
      key: itemKey(p.card.id, p.variant),
      card: p.card,
      variant: p.variant,
      setId: p.setId,
      setName: p.setName,
    })),
  });
}
