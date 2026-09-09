import { apagarArranjo, salvarArranjo } from "@/lib/db";
import { findPosicao, getManifest } from "@/lib/manifests";
import { requireUserId } from "@/lib/session";
import { MAX_BOLSOS, type Arranjo } from "@/lib/arranjo";
import { LAYOUTS, type Alvo } from "@/lib/types";

/**
 * Gravar e desfazer o arranjo manual.
 *
 * O corpo e o ESTADO INTEIRO do fichario arrumado, e nao um gesto ("mova o bolso
 * 3 para o 40"). Um gesto exigiria que o servidor reconstituisse a sequencia
 * para saber o que o 3 e o 40 eram naquele instante — e dois gestos fora de
 * ordem dariam ficharios diferentes. Mandando o estado, a ultima gravacao sempre
 * ganha e sempre esta certa, que e exatamente o que a coalescencia do cliente
 * precisa para colapsar uma rajada de toques num POST so.
 *
 * O formato da folha faz parte do endereco: o arranjo e de UMA folha. Ver a
 * migracao 20260827120000.
 */

/** Quem e o alvo, com a mesma precedencia de /api/binder. */
function alvoDe(body: { setId?: unknown; ficharioId?: unknown }): Alvo | null {
  if (typeof body.ficharioId === "string") {
    return { tipo: "montado", id: body.ficharioId };
  }
  if (typeof body.setId === "string" && getManifest(body.setId)) {
    return { tipo: "colecao", setId: body.setId };
  }
  return null;
}

export async function POST(request: Request) {
  let body: {
    setId?: string;
    ficharioId?: string;
    layout?: string;
    bolsos?: unknown;
    fora?: unknown;
    mao?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalido" }, { status: 400 });
  }

  const alvo = alvoDe(body);
  if (!alvo) return Response.json({ error: "Fichário não encontrado" }, { status: 404 });

  const layout = typeof body.layout === "string" ? LAYOUTS[body.layout] : undefined;
  if (!layout) return Response.json({ error: "Layout inválido" }, { status: 400 });

  if (!Array.isArray(body.bolsos) || !Array.isArray(body.fora)) {
    return Response.json({ error: "bolsos e fora sao obrigatorios" }, { status: 400 });
  }
  if (body.bolsos.length > MAX_BOLSOS) {
    return Response.json(
      { error: `O fichário passa de ${MAX_BOLSOS} bolsos` },
      { status: 400 },
    );
  }

  // Cada chave e conferida contra o indice global, que so conhece as versoes que
  // a colecao de fato tem — e o mesmo crivo de /api/marcar, e e o que impede um
  // "#pokebola" numa colecao que nao tem o segundo reverse de virar um bolso
  // que a marcacao nunca vai conseguir acender.
  const vistas = new Set<string>();
  const bolsos: (string | null)[] = [];
  for (const b of body.bolsos) {
    if (b === null) {
      bolsos.push(null);
      continue;
    }
    if (typeof b !== "string" || !findPosicao(b)) {
      return Response.json({ error: `Carta desconhecida: ${b}` }, { status: 400 });
    }
    // A mesma chave em dois bolsos faria UMA marcacao acender os dois, e
    // desmarcar um apagaria o outro. O banco repete esta checagem por baixo.
    if (vistas.has(b)) {
      return Response.json({ error: `Carta repetida: ${b}` }, { status: 400 });
    }
    vistas.add(b);
    bolsos.push(b);
  }

  const fora: string[] = [];
  for (const f of body.fora) {
    if (typeof f !== "string" || !findPosicao(f)) {
      return Response.json({ error: `Carta desconhecida: ${f}` }, { status: 400 });
    }
    if (vistas.has(f)) {
      return Response.json({ error: `Carta repetida: ${f}` }, { status: 400 });
    }
    vistas.add(f);
    fora.push(f);
  }

  const mao = body.mao ?? null;
  if (mao !== null && (typeof mao !== "string" || !findPosicao(mao) || vistas.has(mao))) {
    return Response.json({ error: "Carta na mão inválida" }, { status: 400 });
  }

  // So aqui a conta nasce, e so depois da validacao — como em toda gravacao
  // deste app. E por isso que o cliente enfileira: dois gestos rapidos sem
  // sessao criariam duas contas, e a segunda gravaria o cookie por cima.
  const userId = await requireUserId();
  const arranjo: Arranjo = { bolsos, fora, mao };
  await salvarArranjo(userId, alvo, layout, arranjo);

  return Response.json({ ok: true, bolsos: bolsos.length });
}

/**
 * "Arrumar de novo": volta ao automatico.
 *
 * Nao toca em posse nem em estrela — as cartas continuam marcadas, e e isso que
 * a confirmacao de dois toques promete na tela.
 */
export async function DELETE(request: Request) {
  const query = new URL(request.url).searchParams;
  const alvo = alvoDe({
    setId: query.get("setId") ?? undefined,
    ficharioId: query.get("ficharioId") ?? undefined,
  });
  if (!alvo) return Response.json({ error: "Fichário não encontrado" }, { status: 404 });

  const userId = await requireUserId();
  await apagarArranjo(userId, alvo);
  return Response.json({ ok: true });
}
