"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sortCards, cardNumber } from "@/lib/cards";
import {
  generateSlots,
  generateSlotsByGroup,
  missingCards,
  progress,
  findCardPage,
} from "@/lib/binder";
import {
  congelarEstado,
  chaveDe,
  puxar,
  serializar,
  tirar,
  tocar,
  type Arranjo,
  type Estado,
  type Relatorio,
} from "@/lib/arranjo";
import {
  LAYOUTS,
  BUCKET_LABELS,
  BUCKETS,
  layoutKey,
  itemKey,
  expandirVariantes,
  bucketEspecial,
  atalhoEspeciaisSeparaAlgo,
  type Alvo,
  type Bucket,
  type Card,
  type ListaDeDesejos,
  type Posicao,
  type SetSummary,
  type SlotItem,
  type SortRule,
} from "@/lib/types";
import { useListaAtiva } from "@/lib/listaAtiva";
import BlocoDeImpressao from "./BlocoDeImpressao";
import CardSlot from "./CardSlot";
import EscolherLista from "./EscolherLista";
import CardViewer from "./CardViewer";
import FindCard from "./FindCard";
import Gaveta from "./Gaveta";
import MaoDeCartas from "./MaoDeCartas";
import Raridades from "./Raridades";

/** Uma colecao dentro do fichario, na ordem em que ela entra nas folhas. */
export type ColecaoNoFichario = { setId: string; setName: string; cards: Card[] };

/**
 * De onde o fichario veio, que e o que decide onde ele grava e de onde saem as
 * folhas. Uma colecao aberta direto (`/binder/sv7`) e um fichario montado a mao
 * com varias colecoes (`/fichario/<id>`) sao a MESMA tela — a diferenca cabe
 * nestes dois campos, e nao numa segunda copia do fichario.
 */
export type Origem = Alvo;

type Props = {
  /** O nome no alto: a colecao, ou o fichario que ele montou. */
  titulo: string;
  /** Uma, quando se abre uma colecao; varias, num fichario montado. */
  colecoes: ColecaoNoFichario[];
  origem: Origem;
  initialOwned: string[];
  /**
   * As estrelas com a LISTA de cada uma: `[chave, listaId]`.
   *
   * Par e nao chave solta porque o bolso faz duas perguntas diferentes sobre a
   * mesma marca — acende por ela existir, e o visualizador precisa dizer em qual
   * lista ela esta. Um conjunto de chaves respondia so a primeira.
   */
  initialStarred: [string, string][];
  initialRows: number;
  initialColumns: number;
  initialSortRule: SortRule;

  /**
   * O fichario arrumado a mao, ja reconciliado pelo servidor — ou `null`, e ai
   * as posicoes sao as derivadas de sempre.
   */
  arranjo: {
    bolsos: (Posicao | null)[];
    fora: Posicao[];
    mao: Posicao | null;
    relatorio: Relatorio;
  } | null;
  /** As 27 colecoes, para a gaveta. So capas e nomes; as cartas vem sob demanda. */
  catalogo: SetSummary[];
  /**
   * As listas de desejo dele. Vazio ate a primeira estrela: a lista nasce no
   * servidor, dentro da primeira marcacao, e nao de um cadastro previo.
   */
  listas: ListaDeDesejos[];
};

/**
 * Quatro olhares sobre a mesma colecao:
 *  - `full`    o fichario inteiro, faltantes em cinza — e onde se faz a varredura
 *  - `mine`    so o que ele tem, sem buracos — o fichario como esta na mesa
 *  - `missing` so o que falta, sem buracos — a lista de caca
 *  - `star`    so as que ele quer muito, tenha ou nao — a lista de desejos
 *
 * A estrela nao e um quinto estado da carta: e uma marca por cima dos outros.
 * Por isso este modo mostra tambem as que ele ja conquistou — ver a estrela ja
 * verde e metade da graca de ter marcado.
 */
type View = "full" | "mine" | "missing" | "star";

/**
 * Toda gravacao de marcacao passa por aqui, uma de cada vez.
 *
 * Nao e capricho: a conta anonima nasce dentro do primeiro POST que chega sem
 * sessao (lib/session.ts). Dois toques quase juntos — duas cartas seguidas, ou
 * um "tenho todas" logo apos uma marcacao — mandam dois POSTs sem sessao, e
 * CADA UM cria a sua conta. A ultima resposta grava o cookie por cima da
 * primeira, e as cartas da conta perdedora somem da tela sem erro nenhum.
 *
 * Isso aconteceu de verdade: duas contas nascidas com 35 ms de diferenca, 55
 * cartas presas na que perdeu o cookie. A fila custa um round-trip de espera
 * na primeira marcacao — a interface ja mudou de cor antes disso — e elimina a
 * corrida na origem, sem precisar detectar se ja existe sessao.
 */
let filaDeGravacao: Promise<unknown> = Promise.resolve();

function enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
  const proxima = filaDeGravacao.then(tarefa, tarefa);
  // A fila nunca pode ficar rejeitada, senao uma falha travaria as seguintes.
  filaDeGravacao = proxima.catch(() => {});
  return proxima;
}

/** Tem de bater com a animacao `.folha-virando` do globals.css. */
const DURACAO_DA_VIRADA = 433;

export default function Binder({
  titulo,
  colecoes,
  origem,
  initialOwned,
  initialStarred,
  initialRows,
  initialColumns,
  initialSortRule,
  arranjo: arranjoInicial,
  catalogo,
  listas,
}: Props) {
  const [owned, setOwned] = useState<Set<string>>(() => new Set(initialOwned));
  /** chave do bolso -> id da lista em que a estrela esta. */
  const [starred, setStarred] = useState<Map<string, string>>(
    () => new Map(initialStarred),
  );
  const [listaAtiva, escolherLista] = useListaAtiva(listas);
  const [escolhendoLista, setEscolhendoLista] = useState(false);
  const [rows, setRows] = useState(initialRows);
  const [columns, setColumns] = useState(initialColumns);
  const [sortRule, setSortRule] = useState<SortRule>(initialSortRule);
  const [aberta, setAberta] = useState<Posicao | null>(null);
  const [view, setView] = useState<View>("full");
  /**
   * Quais raridades estao a vista. `null` = todas, que e o fichario de sempre.
   *
   * Nao e persistido de proposito: o filtro e uma lente que a crianca pega e
   * larga ("deixa eu ver so as boas"), nao um jeito de o fichario ficar. Voltar
   * e reabrir devolve a colecao inteira, sem ninguem precisar lembrar de limpar.
   */
  const [raridades, setRaridades] = useState<Set<Bucket> | null>(null);
  const [escolhendoRaridades, setEscolhendoRaridades] = useState(false);
  const [spread, setSpread] = useState(0); // par de paginas aberto
  type Flip = {
    de: number;
    para: number;
    dir: "frente" | "tras";
    faceDeFora: (Posicao | null)[];
    faceDeDentro: (Posicao | null)[];
    /** Caixa medida da folha, em px relativos ao fichario. */
    caixa: { left: number; top: number; width: number; height: number; recuo: number };
  };
  const [flip, setFlip] = useState<Flip | null>(null);
  const flipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [finding, setFinding] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoDesfazer, setConfirmandoDesfazer] = useState(false);
  const router = useRouter();

  /**
   * O fichario arrumado a mao. `null` = automatico, que e como todo fichario
   * comeca. Guarda `Posicao` e nao chave: a tela ja tem as cartas em maos, e
   * assim um gesto nao precisa consultar indice nenhum para saber o que moveu.
   */
  const [arranjo, setArranjo] = useState<Estado<Posicao> | null>(
    arranjoInicial
      ? { bolsos: arranjoInicial.bolsos, fora: arranjoInicial.fora, mao: arranjoInicial.mao }
      : null,
  );
  /**
   * Comeca ligado quando ha carta na mao gravada: ele recarregou no meio de uma
   * troca, e a continuacao exata de onde parou e a mao ainda cheia. Fora do modo
   * a carta nao apareceria em canto nenhum — nem no bolso, nem na faixa — e o
   * fichario pareceria ter comido uma carta.
   */
  const [arrumando, setArrumando] = useState(arranjoInicial?.mao != null);
  const [gaveta, setGaveta] = useState(false);
  /** De onde a carta na mao saiu — so nesta sessao, para o bolso se marcar. */
  const [origemDaMao, setOrigemDaMao] = useState<number | null>(null);
  const [confirmandoAutomatico, setConfirmandoAutomatico] = useState(false);
  const [avisoDaCauda, setAvisoDaCauda] = useState(
    arranjoInicial?.relatorio.acrescentadas ?? 0,
  );
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fichRef = useRef<HTMLDivElement>(null);
  const ladoEsqRef = useRef<HTMLDivElement>(null);
  const ladoDirRef = useRef<HTMLDivElement>(null);
  const argolasRef = useRef<HTMLDivElement>(null);

  /**
   * Todos os bolsos do fichario, na ordem: colecao por colecao, e dentro de cada
   * uma a ordem escolhida.
   *
   * A ordenacao acontece DENTRO da colecao, nunca no fichario inteiro: juntar
   * tres colecoes e po-las em sequencia, nao embaralhar as tres pela raridade —
   * o numero 1 da segunda colecao vem depois da ultima carta da primeira, como
   * na pasta de verdade.
   *
   * Cada carta comum/incomum/rara ocupa DOIS bolsos (a simples e a brilhante), e
   * a expansao vem depois da ordenacao, entao o par fica junto nas duas ordens.
   */
  const automaticas = useMemo<Posicao[]>(() => {
    const out: Posicao[] = [];
    for (const c of colecoes) {
      for (const item of expandirVariantes(sortCards(c.cards, sortRule), c.setId)) {
        out.push({ ...item, setId: c.setId, setName: c.setName });
      }
    }
    return out;
  }, [colecoes, sortRule]);

  /**
   * Os BOLSOS do fichario, com os vazios no lugar deles.
   *
   * Arrumado a mao, sao os bolsos que ele montou — inclusive os vazios de
   * proposito. Automatico, e a sequencia derivada de sempre, e a paginacao
   * cuida dos vazios da ultima folha.
   */
  const bolsos = useMemo<(Posicao | null)[]>(
    () => arranjo?.bolsos ?? automaticas,
    [arranjo, automaticas],
  );

  /** As cartas que estao no fichario, sem os bolsos vazios — para as contas. */
  const posicoes = useMemo<Posicao[]>(
    () => bolsos.filter((b): b is Posicao => b !== null),
    [bolsos],
  );

  const chave = (i: SlotItem) => itemKey(i.card.id, i.variant);
  const varias = colecoes.length > 1;

  /**
   * As chaves das colecoes DESTE fichario — o universo que "tirar do fichario"
   * conhece. Uma carta puxada da gaveta, de colecao estranha, nao entra em
   * `fora`: nada iria repo-la, entao guardar seria so engordar o array.
   */
  const universoKeys = useMemo(
    () => new Set(automaticas.map(chaveDe)),
    [automaticas],
  );

  /**
   * "O que eu tenho" remonta o fichario apenas com as cartas que ele possui,
   * fechando os buracos. E o fichario como esta de verdade na mesa: a crianca
   * encaixa as cartas em sequencia, nao deixa bolso reservado para o que falta.
   */
  /**
   * As posicoes que sobraram do filtro de raridade — a colecao inteira, quando
   * nao ha filtro. Vem ANTES dos quatro olhares porque as duas perguntas sao
   * independentes: "so as especiais" e "o que falta" combinam, e o resultado e
   * o que falta entre as especiais.
   */
  /**
   * As duas lentes juntas, como um teste sobre um bolso. Sao independentes: "so
   * as especiais" e "o que falta" combinam, e o resultado e o que falta entre as
   * especiais.
   *
   * No modo arrumar nao ha lente nenhuma — nao se coloca carta num bolso que nao
   * esta a vista.
   */
  const passa = useCallback(
    (i: Posicao) => {
      if (arrumando) return true;
      if (raridades && !raridades.has(i.card.bucket)) return false;
      if (view === "mine") return owned.has(chave(i));
      if (view === "missing") return !owned.has(chave(i));
      if (view === "star") return starred.has(chave(i));
      return true;
    },
    [arrumando, raridades, view, owned, starred],
  );

  /**
   * O que vai para as folhas.
   *
   * Arrumado a mao, a lente APAGA em vez de compactar: o bolso que nao passa
   * fica vazio no lugar dele. Compactar destruiria as posicoes que ele escolheu
   * — e "o que falta" vira o fichario com os buracos de verdade, que e mais
   * honesto que a lista corrida. Automatico, compacta como sempre: ali a posicao
   * nao e de ninguem, e um fichario cheio de buracos so atrapalharia a caca.
   */
  const naPagina = useMemo<(Posicao | null)[]>(
    () =>
      arranjo
        ? bolsos.map((b) => (b !== null && passa(b) ? b : null))
        : automaticas.filter(passa),
    [arranjo, bolsos, automaticas, passa],
  );

  /** Quantos bolsos a lente deixou — o que decide se a tela tem o que mostrar. */
  const quantosAVista = useMemo(
    () => naPagina.reduce((n, b) => (b === null ? n : n + 1), 0),
    [naPagina],
  );

  /**
   * Quantos BOLSOS cada raridade ocupa nesta colecao, na ordem do fichario.
   *
   * Bolsos e nao cartas: e o que a crianca ve e o que a folha vai gastar — uma
   * comum com reverse ocupa dois. So as raridades presentes entram, entao a
   * colecao de promos abre um painel de uma linha so em vez de sete zeros.
   */
  const contagens = useMemo(() => {
    const n = new Map<Bucket, number>();
    for (const i of posicoes) n.set(i.card.bucket, (n.get(i.card.bucket) ?? 0) + 1);
    return BUCKETS.filter((b) => n.has(b)).map((b) => ({ bucket: b, n: n.get(b)! }));
  }, [posicoes]);

  /** O que o botao do rodape diz quando ha filtro: o nome da lente, nao "filtro". */
  const rotuloRaridades = useMemo(() => {
    if (!raridades) return null;
    const escolhidas = contagens.filter((c) => raridades.has(c.bucket));
    const especiais = contagens.filter((c) => bucketEspecial(c.bucket));
    if (
      atalhoEspeciaisSeparaAlgo(contagens.map((c) => c.bucket)) &&
      escolhidas.length === especiais.length &&
      especiais.every((c) => raridades.has(c.bucket))
    ) {
      return "Só as especiais";
    }
    if (escolhidas.length === 1) return BUCKET_LABELS[escolhidas[0].bucket];
    return `${escolhidas.length} raridades`;
  }, [raridades, contagens]);

  const trocarRaridades = (next: Set<Bucket> | null) => {
    setRaridades(next);
    // O fichario encolheu ou cresceu: a pagina 7 do filtro anterior nao e a
    // mesma pagina 7 deste. Voltar ao comeco e o unico ponto que se sustenta.
    setSpread(0);
  };
  /**
   * Cada colecao comeca numa pagina nova — ver `generateSlotsByGroup`. Com uma
   * colecao so a funcao devolve exatamente o que `generateSlots` devolvia, entao
   * o fichario de sempre nao muda em nada.
   */
  const pages = useMemo(
    () =>
      // Arrumado a mao, a fronteira de colecao por pagina deixa de valer: quem
      // decide onde cada carta fica e ele. `generateSlots` ja aceita bolso vazio,
      // porque devolve `sortedCards[i] ?? null` — nao ha paginacao nova aqui.
      arranjo
        ? generateSlots(naPagina, rows, columns)
        : generateSlotsByGroup(
            naPagina as Posicao[],
            rows,
            columns,
            (i) => i.setId,
          ),
    [arranjo, naPagina, rows, columns],
  );
  /**
   * As folhas SEM lente nenhuma — o fichario como ele e, e nao como se esta
   * olhando para ele agora.
   *
   * E o que entra no modo arrumar: congelar a partir de `pages` guardaria o
   * fichario filtrado, e entrar no modo estando em "o que falta" apagaria de uma
   * vez todas as cartas que ele ja tem.
   */
  const paginasSemLente = useMemo(
    () =>
      arranjo
        ? generateSlots(arranjo.bolsos, rows, columns)
        : generateSlotsByGroup(automaticas, rows, columns, (i) => i.setId),
    [arranjo, automaticas, rows, columns],
  );

  const missing = useMemo(() => missingCards(posicoes, owned, chave), [posicoes, owned]);
  /** As estrelas que ainda faltam — as unicas que precisam de recorte. */
  const estrelasFaltando = useMemo(
    () => missing.filter((i) => starred.has(chave(i))),
    [missing, starred],
  );
  /**
   * Quantas estrelas DESTE fichario ja estao em cada lista — o numero que o
   * painel mostra ao lado de cada nome. Sai do que esta na tela, e nao do banco:
   * a pergunta e "onde eu estava pondo as desta colecao".
   */
  const estrelasPorLista = useMemo(() => {
    const conta = new Map<string, number>();
    for (const listaId of starred.values()) {
      conta.set(listaId, (conta.get(listaId) ?? 0) + 1);
    }
    return conta;
  }, [starred]);

  /**
   * A conta sai de `missing`, nao de `owned.size`: o conjunto gravado pode conter
   * chave que o fichario nao mostra mais (uma carta que saiu do manifest, ou um
   * `#holo` de colecao que perdeu o reverse). Contando o gravado, o cabecalho
   * dizia um numero e o botao do PDF, outro — e a folha e quem tem razao.
   */
  const stats = progress(posicoes.length, posicoes.length - missing.length);
  const numberWidth = Math.max(
    ...colecoes.map((c) => String(c.cards.length).length),
    2,
  );

  const spreadCount = Math.max(1, Math.ceil(pages.length / 2));
  const current = Math.min(spread, spreadCount - 1);

  /**
   * O fichario aberto mostra SEMPRE duas paginas. Quando a colecao termina numa
   * pagina impar, a da direita vem em branco — que e o que acontece no fichario
   * fisico, porque a folha tem dois lados. Renderizar so um lado fazia a pagina
   * esticar para a largura toda e as cartas dobrarem de tamanho.
   */
  const paginaVazia = useMemo(
    () => Array<Posicao | null>(rows * columns).fill(null),
    [rows, columns],
  );
  const paginaEsquerda = pages[current * 2] ?? paginaVazia;
  const paginaDireita = pages[current * 2 + 1];
  const ultimaPaginaDoFichario = paginaDireita === undefined;

  /**
   * O que fica ATRAS da folha em movimento. O lado que a folha esta cobrindo
   * continua exibindo a pagina antiga; o lado que ela esta liberando ja mostra a
   * nova. Sem isso, a pagina de destino apareceria por baixo antes da hora e o
   * giro pareceria um corte.
   */
  const paginaEm = (i: number) => pages[i] ?? paginaVazia;
  const fundoEsquerda = flip?.dir === "frente" ? paginaEm(flip.de * 2) : paginaEsquerda;
  const fundoDireita =
    flip?.dir === "tras" ? paginaEm(flip.de * 2 + 1) : (paginaDireita ?? paginaVazia);
  const fundoEsquerdaNumero =
    flip?.dir === "frente" ? flip.de * 2 + 1 : current * 2 + 1;
  const fundoDireitaNumero =
    flip?.dir === "tras"
      ? flip.de * 2 + 2
      : ultimaPaginaDoFichario
        ? null
        : current * 2 + 2;

  const avisarFalha = useCallback(() => {
    setErro("Não consegui salvar. Tente de novo.");
    setTimeout(() => setErro(null), 3500);
  }, []);

  /**
   * As chaves agrupadas pela colecao a que pertencem.
   *
   * A rota de marcacao valida cada chave contra o manifest de UM set — e assim
   * que ela garante que nunca se grava posse de um bolso que o fichario nao
   * mostra. Entao um fichario com tres colecoes manda ate tres pedidos. Na
   * pratica quase sempre e um so: o toque marca uma carta, e o "tenho todas
   * desta pagina" opera numa pagina, que nunca mistura colecoes.
   */
  const porColecao = (itens: readonly Posicao[]) => {
    const out = new Map<string, string[]>();
    for (const i of itens) {
      const lista = out.get(i.setId);
      lista ? lista.push(chave(i)) : out.set(i.setId, [chave(i)]);
    }
    return out;
  };

  /** Grava por tras; a interface ja mudou. Se falhar, desfaz e avisa. */
  const persistOwned = useCallback(
    async (itens: readonly Posicao[], value: boolean) => {
      // So as chaves da colecao que falhou voltam atras: com o pedido de uma
      // colecao gravado e o da outra perdido, desfazer as duas apagaria da tela
      // uma marcacao que esta no banco.
      const perdidas: string[] = [];
      for (const [setId, cardIds] of porColecao(itens)) {
        try {
          const res = await enfileirar(() =>
            fetch("/api/marcar", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ setId, cardIds, marca: "tenho", valor: value }),
            }),
          );
          if (!res.ok) throw new Error();
        } catch {
          perdidas.push(...cardIds);
        }
      }
      if (perdidas.length === 0) return;

      setOwned((prev) => {
        const next = new Set(prev);
        for (const id of perdidas) value ? next.delete(id) : next.add(id);
        return next;
      });
      avisarFalha();
    },
    [avisarFalha],
  );

  /**
   * Grava a estrela: `destino` e a lista onde ela deve ficar, ou `null` para
   * tirar. A tela ja mudou antes desta chamada; aqui e so a gravacao, com o
   * desfazer no bolso caso a rede recuse.
   *
   * A resposta traz `listaId` porque o servidor pode ter decidido por conta: sem
   * nenhuma lista criada, a primeira estrela CRIA a primeira lista. Sem ler isso
   * de volta, a carta ficaria acesa apontando para uma lista que o cliente nao
   * conhece.
   */
  const gravarEstrela = useCallback(
    (item: Posicao, destino: string | null, anterior: string | null) => {
      const k = itemKey(item.card.id, item.variant);
      void enfileirar(async () => {
        const res = await fetch("/api/marcar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            setId: item.setId,
            cardIds: [k],
            marca: "estrela",
            valor: destino !== null,
            ...(destino ? { listaId: destino } : {}),
          }),
        });
        if (!res.ok) throw new Error();
        return (await res.json()) as { listaId?: string };
      })
        .then((corpo) => {
          if (!corpo.listaId || corpo.listaId === destino) return;
          // A lista nasceu agora, no servidor. Corrige o bolso e pede a tela de
          // volta: e a unica vez que isso acontece na vida do usuario.
          setStarred((prev) => new Map(prev).set(k, corpo.listaId!));
          router.refresh();
        })
        .catch(() => {
          setStarred((prev) => {
            const next = new Map(prev);
            anterior === null ? next.delete(k) : next.set(k, anterior);
            return next;
          });
          avisarFalha();
        });
    },
    [router, avisarFalha],
  );

  /**
   * Poe ou tira a estrela. Nao mexe na posse, ao contrario do esconder que
   * existia aqui: "quero muito" e "ja tenho" convivem, e a carta continua no
   * fichario e na conta das faltantes.
   *
   * O gesto e binario de proposito — acende na lista ativa, ou apaga. Uma carta
   * ja marcada em OUTRA lista nao muda de lugar sozinha: tres toques rapidos
   * mudando a carta de lista seria uma troca invisivel, e ele so descobriria na
   * folha impressa. Mudar de lista tem gesto proprio, no visualizador, onde da
   * para ver que carta esta mudando.
   */
  const toggleStar = useCallback(
    (item: Posicao) => {
      const k = itemKey(item.card.id, item.variant);
      const anterior = starred.get(k) ?? null;
      // `listaAtiva` e null so enquanto nao existe lista nenhuma; ai o destino
      // fica em branco na tela e o servidor devolve qual lista criou.
      const destino = anterior === null ? (listaAtiva ?? "") : null;

      setStarred((prev) => {
        const next = new Map(prev);
        destino === null ? next.delete(k) : next.set(k, destino);
        return next;
      });
      gravarEstrela(item, destino, anterior);
    },
    [starred, listaAtiva, gravarEstrela],
  );

  /** Mudar a carta de lista, do visualizador — sem passar por tirar e repor. */
  const moverEstrela = useCallback(
    (item: Posicao, listaId: string) => {
      const k = itemKey(item.card.id, item.variant);
      const anterior = starred.get(k) ?? null;
      if (anterior === listaId) return;

      setStarred((prev) => new Map(prev).set(k, listaId));
      gravarEstrela(item, listaId, anterior);
    },
    [starred, gravarEstrela],
  );

  const toggle = useCallback(
    (item: Posicao) => {
      const k = itemKey(item.card.id, item.variant);
      const has = owned.has(k);
      setOwned((prev) => {
        const next = new Set(prev);
        has ? next.delete(k) : next.add(k);
        return next;
      });
      void persistOwned([item], !has);
    },
    [owned, persistOwned],
  );

  /** "Tenho todas desta pagina": o atalho que torna a varredura viavel. */
  const togglePage = useCallback(
    (page: (Posicao | null)[]) => {
      const present = page.filter(Boolean) as Posicao[];
      if (present.length === 0) return;
      const ids = present.map((i) => itemKey(i.card.id, i.variant));
      const allOwned = ids.every((k) => owned.has(k));
      setOwned((prev) => {
        const next = new Set(prev);
        for (const id of ids) (allOwned ? next.delete(id) : next.add(id));
        return next;
      });
      void persistOwned(present, !allOwned);
    },
    [owned, persistOwned],
  );

  // ------------------------------------------------------------ modo arrumar
  //
  // O gesto e um so — "a carta do bolso vai para a sua mao; a da sua mao fica
  // nele" — e dele saem pegar, colocar, trocar e devolver sem nenhum modo
  // escondido. `lib/arranjo.ts` tem as transicoes; aqui e a costura com a tela.

  /**
   * A gravacao do arranjo e COALESCIDA: uma rajada de toques vira um POST so.
   *
   * O corpo e o estado inteiro, e nao o gesto (ver `/api/arranjo`), entao a
   * ultima gravacao sempre esta certa — e por isso da para simplesmente esperar
   * a mao parar. Sem isto, arrumar uma pagina mandaria trinta pedidos com o
   * fichario inteiro em cada um.
   */
  const ATRASO_DA_GRAVACAO = 700;
  const arranjoPendente = useRef<Estado<Posicao> | null>(null);
  const timerDoArranjo = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enviarArranjo = useCallback(() => {
    const estado = arranjoPendente.current;
    if (!estado) return;
    arranjoPendente.current = null;

    // Os vazios do FIM sao a sobra da ultima folha, nao bolso reservado — a
    // mesma distincao que `congelar` faz. Sem aparar, cada troca perto do fim
    // engordaria o array gravado com nulos que ninguem escolheu.
    const bolsos = [...estado.bolsos];
    while (bolsos.length > 0 && bolsos[bolsos.length - 1] === null) bolsos.pop();
    const corpo = serializar({ ...estado, bolsos }, chaveDe);
    void enfileirar(async () => {
      const res = await fetch("/api/arranjo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(origem.tipo === "colecao"
            ? { setId: origem.setId }
            : { ficharioId: origem.id }),
          // O arranjo e de UMA folha: 3x3 e 4x3 sao dois desenhos diferentes.
          layout: layoutKey(columns, rows),
          ...corpo,
        }),
      });
      if (!res.ok) throw new Error();
    }).catch(avisarFalha);
  }, [origem, columns, rows, avisarFalha]);

  const gravarArranjo = useCallback(
    (estado: Estado<Posicao>) => {
      arranjoPendente.current = estado;
      if (timerDoArranjo.current) clearTimeout(timerDoArranjo.current);
      timerDoArranjo.current = setTimeout(enviarArranjo, ATRASO_DA_GRAVACAO);
    },
    [enviarArranjo],
  );

  /**
   * O que estiver pendente vai embora ao sair da tela.
   *
   * Nao e detalhe: a espera de 700 ms cabe inteira dentro de um toque em
   * "‹ Coleções", e sem isto o ultimo gesto — justamente o que ele acabou de
   * fazer — seria o unico a nao ser gravado. Mesma razao do `marcacaoPendente`
   * do CardSlot.
   */
  useEffect(
    () => () => {
      if (timerDoArranjo.current) clearTimeout(timerDoArranjo.current);
      enviarArranjo();
    },
    [enviarArranjo],
  );

  /**
   * O servidor mandou outro arranjo — trocou o formato da folha, ou ele voltou
   * ao automatico. So vale FORA do modo: no meio de um gesto, uma revalidacao
   * (a que nasce ao criar a primeira lista de desejos, por exemplo) atropelaria
   * a carta que esta na mao.
   */
  useEffect(() => {
    if (arrumando) return;
    setArranjo(
      arranjoInicial
        ? {
            bolsos: arranjoInicial.bolsos,
            fora: arranjoInicial.fora,
            mao: arranjoInicial.mao,
          }
        : null,
    );
    setOrigemDaMao(null);
    setAvisoDaCauda(arranjoInicial?.relatorio.acrescentadas ?? 0);
    // `arrumando` de proposito fora das dependencias: o efeito reage ao arranjo
    // que chegou, e so consulta o modo para decidir se e hora de aceita-lo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arranjoInicial]);

  /**
   * Ele mexeu em alguma coisa nesta visita? E o que separa "arrumou" de "abriu
   * o modo para ver como e" — ver `sairDoModo`.
   */
  const mexeuNoArranjo = useRef(false);

  /** Muda a tela e agenda a gravacao — todo gesto do modo passa por aqui. */
  const aplicarArranjo = useCallback(
    (proximo: Estado<Posicao>) => {
      mexeuNoArranjo.current = true;
      setArranjo(proximo);
      gravarArranjo(proximo);
    },
    [gravarArranjo],
  );

  /**
   * Entrar no modo CONGELA o fichario como ele esta — inclusive os bolsos vazios
   * da fronteira entre colecoes. Nao grava nada ainda: entrar e sair sem mexer em
   * nada tem de deixar o fichario automatico como estava, senao a curiosidade
   * custaria um fichario "arrumado a mao" que ele nunca arrumou.
   */
  const entrarNoModo = () => {
    if (!arranjo) setArranjo(congelarEstado(paginasSemLente));
    setArrumando(true);
  };

  /**
   * Guarda a carta que ficou na mao: no bolso de onde ela saiu, se ainda estiver
   * vazio; senao no primeiro vazio; senao no fim.
   *
   * Sair com a carta na mao a faria sumir da tela normal, onde nao existe mao
   * nenhuma. A coluna `mao` do banco continua existindo para o outro caso — o
   * recarregar no meio de uma troca, que e acidente e nao gesto.
   */
  const guardarMao = (estado: Estado<Posicao>): Estado<Posicao> => {
    if (estado.mao === null) return estado;
    if (origemDaMao !== null && estado.bolsos[origemDaMao] === null) {
      return tocar(estado, origemDaMao);
    }
    const vazio = estado.bolsos.indexOf(null);
    if (vazio >= 0) return tocar(estado, vazio);
    return { ...estado, bolsos: [...estado.bolsos, estado.mao], mao: null };
  };

  const sairDoModo = () => {
    setGaveta(false);
    setConfirmandoAutomatico(false);
    setArrumando(false);
    setOrigemDaMao(null);

    if (arranjo?.mao) {
      aplicarArranjo(guardarMao(arranjo));
      return;
    }
    // Entrou, olhou e saiu: o congelamento vai embora com ele. Ficar com um
    // arranjo em memoria que nunca foi gravado deixaria a tela diferente da que
    // um F5 traria — e, pior, mudaria a lente por baixo: arrumado a mao "o que
    // falta" APAGA os bolsos no lugar, e automatico ele compacta.
    if (!mexeuNoArranjo.current && !arranjoInicial) setArranjo(null);
  };

  /**
   * O gesto, na tela: tocar num bolso. `i` e o indice no fichario inteiro, nao
   * na pagina — o arranjo e uma sequencia so, e a pagina e recorte dela.
   */
  const tocarBolso = (i: number) => {
    if (!arranjo) return;

    // A ultima folha tem bolsos ALEM do fim do arranjo — a sobra da paginacao.
    // Eles estao na tela, entao sao bolsos de verdade: com a mao cheia, o
    // fichario cresce ate ali em vez de o toque nao fazer nada. Sem isto, os
    // ultimos bolsos da ultima pagina seriam os unicos onde nao da para guardar
    // uma carta, e nada explicaria por que.
    const base =
      i < arranjo.bolsos.length
        ? arranjo
        : arranjo.mao === null
          ? arranjo
          : {
              ...arranjo,
              bolsos: [
                ...arranjo.bolsos,
                ...Array<Posicao | null>(i - arranjo.bolsos.length + 1).fill(null),
              ],
            };

    const proximo = tocar(base, i);
    // A carta que acabou de ir para a mao veio DESTE bolso, seja ele o de uma
    // troca ou o de um simples pegar. Mao vazia depois do gesto: nao ha origem.
    setOrigemDaMao(proximo.mao === null ? null : i);
    aplicarArranjo(proximo);
  };

  /** Devolver: volta ao bolso de onde saiu. Veio da gaveta, volta para a gaveta. */
  const devolverMao = () => {
    if (!arranjo?.mao) return;
    if (origemDaMao !== null) return tocarBolso(origemDaMao);
    aplicarArranjo(tirar(arranjo, universoKeys, chaveDe));
    setOrigemDaMao(null);
  };

  const tirarDaMao = () => {
    if (!arranjo?.mao) return;
    aplicarArranjo(tirar(arranjo, universoKeys, chaveDe));
    setOrigemDaMao(null);
  };

  /** Puxar da gaveta. Se a carta ja ocupa um bolso, e mudanca de lugar, nao copia. */
  const puxarCarta = (item: Posicao) => {
    if (!arranjo) return;
    aplicarArranjo(puxar(arranjo, item, chaveDe));
    setOrigemDaMao(null);
  };

  /**
   * "Arrumar de novo": volta ao automatico, em dois toques.
   *
   * Apaga o arranjo de TODOS os formatos (ver `apagarArranjo`) e nao toca em
   * posse nem em estrela — as cartas continuam marcadas, e e isso que a frase
   * embaixo do botao promete.
   */
  const voltarAoAutomatico = async () => {
    if (!confirmandoAutomatico) {
      setConfirmandoAutomatico(true);
      return;
    }
    setConfirmandoAutomatico(false);
    // Cancela o que estava pendente: gravar depois do DELETE ressuscitaria
    // exatamente o arranjo que ele acabou de mandar embora.
    if (timerDoArranjo.current) clearTimeout(timerDoArranjo.current);
    arranjoPendente.current = null;

    setArranjo(null);
    setArrumando(false);
    setOrigemDaMao(null);
    setGaveta(false);

    const query =
      origem.tipo === "colecao"
        ? `setId=${encodeURIComponent(origem.setId)}`
        : `ficharioId=${encodeURIComponent(origem.id)}`;
    const res = await fetch(`/api/arranjo?${query}`, { method: "DELETE" });
    if (!res.ok) return avisarFalha();
    router.refresh();
  };

  /** As chaves que ja ocupam um bolso — a gaveta nao pode oferecer uma segunda. */
  const jaNoFichario = useMemo(
    () => new Set(bolsos.filter((b): b is Posicao => b !== null).map(chaveDe)),
    [bolsos],
  );

  /**
   * Mede a folha em pixels reais, em vez de chutar 50%.
   *
   * A dobradica e o CENTRO das argolas, nao a borda da pagina: girando 180° em
   * torno do centro do vinco, a folha aterrissa exatamente sobre a pagina do outro
   * lado.
   *
   * A medida sai da GRADE, nao da pagina. A pagina carrega um `px-5` assimetrico
   * (`first:pl-0` / `last:pr-0`) que a folha nao reproduzia — dava 20 px a mais de
   * largura util, ou seja 5 px por coluna, e a carta "crescia" no instante em que
   * a folha sumia.
   */
  const medirFolha = (dir: "frente" | "tras") => {
    const fich = fichRef.current;
    const arg = argolasRef.current;
    const lado = (dir === "frente" ? ladoDirRef : ladoEsqRef).current;
    if (!fich || !arg || !lado) return null;

    const cf = fich.getBoundingClientRect();
    const ca = arg.getBoundingClientRect();
    const cl = lado.getBoundingClientRect();
    if (ca.width === 0) return null; // argolas escondidas = layout empilhado

    const vinco = ca.left + ca.width / 2 - cf.left;
    const top = cl.top - cf.top;

    if (dir === "frente") {
      const direita = cl.right - cf.left;
      return {
        left: vinco,
        top,
        width: direita - vinco,
        height: cl.height,
        recuo: cl.left - cf.left - vinco,
      };
    }
    const esquerda = cl.left - cf.left;
    return {
      left: esquerda,
      top,
      width: vinco - esquerda,
      height: cl.height,
      recuo: vinco - (cl.right - cf.left),
    };
  };

  /**
   * Vira a folha. O fundo ja mostra o destino; por cima dele a folha gira.
   *
   * Indo para a frente, a folha que vira e a da direita: a face de fora e a
   * pagina que estava a direita, e a de dentro (que aparece depois dos 90°) e a
   * nova pagina da esquerda. Voltando, tudo espelhado.
   */
  const turn = (to: number, dir: "frente" | "tras") => {
    const destino = Math.max(0, Math.min(to, spreadCount - 1));
    if (destino === current) return;

    const paginaDe = (i: number) => pages[i] ?? paginaVazia;
    const caixa = medirFolha(dir);
    if (!caixa) {
      // Sem geometria (celular, onde as paginas empilham): troca direto, sem giro.
      setSpread(destino);
      return;
    }

    setFlip({
      de: current,
      para: destino,
      dir,
      faceDeFora: dir === "frente" ? paginaDe(current * 2 + 1) : paginaDe(current * 2),
      faceDeDentro: dir === "frente" ? paginaDe(destino * 2) : paginaDe(destino * 2 + 1),
      caixa,
    });
    setSpread(destino);

    if (flipTimer.current) clearTimeout(flipTimer.current);
    flipTimer.current = setTimeout(() => setFlip(null), DURACAO_DA_VIRADA);
  };

  const saveBinder = (patch: { layout?: string; sortRule?: SortRule }) =>
    void fetch("/api/binder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        origem.tipo === "colecao"
          ? { setId: origem.setId, ...patch }
          : { ficharioId: origem.id, ...patch },
      ),
    }).catch(() => {});

  const applyLayout = (key: string) => {
    const escolhido = LAYOUTS[key];
    if (!escolhido) return;
    setRows(escolhido.rows);
    setColumns(escolhido.columns);
    setSpread(0);
    saveBinder({ layout: key });

    // Uma folha de 4 bolsos e outra folha: reflowar um arranjo de 3x3 para 4x3
    // preservaria o dado e destruiria o desenho. A tela volta ao automatico e o
    // servidor diz se ha um arranjo GRAVADO para este formato — e por isso
    // voltar ao formato anterior restaura o que ele tinha arrumado la.
    if (arranjo) {
      if (timerDoArranjo.current) clearTimeout(timerDoArranjo.current);
      enviarArranjo();
      setArranjo(null);
      setArrumando(false);
      setOrigemDaMao(null);
      router.refresh();
    }
  };

  const applySort = (rule: SortRule) => {
    setSortRule(rule);
    setSpread(0);
    saveBinder({ sortRule: rule });
  };

  const goToCard = (n: number) => {
    let hit = findCardPage(naPagina, n, rows, columns);

    // Fora do modo Total, ou com filtro de raridade, a carta pode nao estar a
    // vista. Em vez de dizer que ela nao existe, desfaz as duas lentes e leva
    // ate o lugar dela — quem digitou o numero quer a carta, nao o filtro.
    if (!hit && (view !== "full" || raridades)) {
      const noCompleto = findCardPage(posicoes, n, rows, columns);
      if (noCompleto) {
        setView("full");
        trocarRaridades(null);
        hit = noCompleto;
      }
    }
    if (!hit) return false;
    turn(Math.floor(hit.page / 2), "frente");
    setHighlight(itemKey(hit.item.card.id, hit.item.variant));
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(null), 2400);
    return true;
  };

  /**
   * Setas do teclado viram a pagina; Home e End vao para as pontas.
   *
   * Fica quieto enquanto a carta grande ou o teclado numerico estao abertos —
   * la as setas e o Escape pertencem ao dialogo, nao ao fichario.
   */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (aberta || finding || escolhendoRaridades) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          turn(current - 1, "tras");
          break;
        case "ArrowRight":
        case "PageDown":
        case " ":
          e.preventDefault();
          turn(current + 1, "frente");
          break;
        case "Home":
          e.preventDefault();
          turn(0, "tras");
          break;
        case "End":
          e.preventDefault();
          turn(spreadCount - 1, "frente");
          break;
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
    // Sem array de dependencias de proposito: reassina a cada render para que o
    // handler enxergue sempre a pagina atual. Trocar um listener por render e
    // barato perto do risco de virar a pagina errada por closure velha.
  });

  const completa = stats.missing === 0;

  /**
   * A folha desta tela. Sao sempre as mesmas quatro — o que muda e se elas saem
   * de uma colecao ou do fichario montado inteiro.
   */
  const folhaDe = (lista?: "estrelas") => {
    const base =
      origem.tipo === "colecao"
        ? `/api/pdf/${origem.setId}`
        : `/api/pdf/fichario/${origem.id}`;
    return lista ? `${base}?lista=${lista}` : base;
  };

  /**
   * Desfazer o fichario montado. Dois toques, e o segundo diz o que continua
   * existindo: a crianca precisa saber que nao vai perder as cartas marcadas —
   * elas nunca foram do fichario, sempre foram da colecao.
   */
  const desfazer = async () => {
    if (origem.tipo !== "montado") return;
    if (!confirmandoDesfazer) {
      setConfirmandoDesfazer(true);
      setTimeout(() => setConfirmandoDesfazer(false), 6000);
      return;
    }
    try {
      const res = await fetch(`/api/fichario?id=${origem.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/");
      router.refresh();
    } catch {
      setConfirmandoDesfazer(false);
      avisarFalha();
    }
  };

  /** So a grade, sem rotulo nem botao: e o que a folha em movimento precisa mostrar. */
  const gradeDaPagina = (page: (Posicao | null)[]) => (
    <div
      className="pointer-events-none grid gap-2 sm:gap-2.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      aria-hidden
    >
      {page.map((item, slot) => (
        <CardSlot
          key={item ? chave(item) : `folha-${slot}`}
          item={item}
          setId={item?.setId ?? ""}
          owned={item ? owned.has(chave(item)) : false}
          highlighted={false}
          starred={item ? starred.has(chave(item)) : false}
          numberWidth={numberWidth}
          onToggle={() => {}}
          onToggleStar={() => {}}
          onOpen={() => {}}
        />
      ))}
    </div>
  );

  const renderPage = (
    page: (Posicao | null)[],
    pageNumber: number | null,
    ref?: React.RefObject<HTMLDivElement | null>,
  ) => {
    const present = page.filter(Boolean) as Posicao[];
    const allOwned = present.length > 0 && present.every((i) => owned.has(chave(i)));
    // Num fichario montado, o rodape da pagina diz de que colecao ela e. A
    // pagina nunca mistura duas (ver `generateSlotsByGroup`), entao o nome do
    // primeiro bolso vale para a pagina inteira.
    const colecaoDaPagina = varias ? present[0]?.setName : undefined;

    return (
      <div className="flex-1 sm:px-5 sm:first:pl-0 sm:last:pr-0">
        <div
          ref={ref}
          className="grid gap-2 sm:gap-2.5"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {page.map((item, slot) => {
            // O indice do bolso no fichario INTEIRO: o arranjo e uma sequencia
            // so, e a pagina e um recorte dela. `pageNumber` e 1-based e a
            // pagina em branco do outro lado nao existe no arranjo (null).
            const indice =
              pageNumber === null ? null : (pageNumber - 1) * rows * columns + slot;
            return (
              <CardSlot
                key={item ? chave(item) : `vazio-${pageNumber}-${slot}`}
                item={item}
                setId={item?.setId ?? ""}
                owned={item ? owned.has(chave(item)) : false}
                highlighted={item ? chave(item) === highlight : false}
                numberWidth={numberWidth}
                starred={item ? starred.has(chave(item)) : false}
                onToggle={toggle}
                onToggleStar={toggleStar}
                onOpen={setAberta}
                arrumando={arrumando && indice !== null}
                origem={arrumando && indice !== null && indice === origemDaMao}
                alvo={arrumando && arranjo?.mao != null}
                onArrumar={indice === null ? undefined : () => tocarBolso(indice)}
              />
            );
          })}
        </div>

        {/* min-h fixa: sem ela, o lado em branco fica mais curto e desalinha o vinco. */}
        <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
          <span className="tabular min-w-0 truncate text-sm text-(--color-tinta-fraca)">
            {pageNumber !== null ? `página ${pageNumber}` : ""}
            {pageNumber !== null && colecaoDaPagina ? ` · ${colecaoDaPagina}` : ""}
          </span>
          {present.length > 0 && view === "full" && (
            <button
              type="button"
              onClick={() => togglePage(page)}
              className={`min-h-11 rounded-full px-4 text-sm font-medium transition-colors ${
                allOwned
                  ? "bg-(--color-tenho-fraco) text-(--color-tenho)"
                  : "bg-(--color-mesa) text-(--color-tinta-fraca) hover:text-(--color-tinta)"
              }`}
            >
              {allOwned ? "✓ tenho todas" : "tenho todas"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <main
      className={`mx-auto flex min-h-dvh max-w-6xl flex-col px-4 sm:px-7 ${
        arrumando && arranjo?.mao ? "pb-44" : "pb-6"
      }`}
    >
      {/* Cabecalho: so o numero que importa. */}
      <header className="flex items-baseline justify-between gap-4 pt-6 pb-5">
        <div className="min-w-0">
          <Link
            href="/"
            className="text-sm text-(--color-tinta-fraca) hover:text-(--color-tinta)"
          >
            ‹ Coleções
          </Link>
          <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
            {titulo}
          </h1>
          {/* Quais colecoes estao aqui dentro, na ordem das folhas. E a unica
              coisa que o nome do fichario nao consegue dizer sozinho. */}
          {varias && (
            <p className="mt-0.5 truncate text-sm text-(--color-tinta-fraca)">
              {colecoes.map((c) => c.setName).join(" · ")}
            </p>
          )}
        </div>

        <p className="tabular shrink-0 text-right">
          {completa ? (
            <span className="text-xl font-semibold text-(--color-tenho) sm:text-2xl">
              Completa!
            </span>
          ) : (
            <>
              <span className="block text-2xl leading-none font-semibold sm:text-3xl">
                faltam {stats.missing}
              </span>
              <span className="mt-1 block text-sm text-(--color-tinta-fraca)">
                tenho {stats.owned} de {stats.total}
              </span>
            </>
          )}
        </p>
      </header>

      {/*
        O fichario arrumado a mao mudou sem ele pedir: cartas que ainda nao
        estavam em lugar nenhum entraram no FIM (ver a regra 2 de `resolver`).
        Repovoar uma colecao so acrescenta — as 49 promos que ainda dao 404 vao
        chegar um dia — mas acrescentar em silencio faria o fichario crescer sem
        explicacao. A linha e discreta e ele a dispensa com um toque.
      */}
      {arranjo && avisoDaCauda > 0 && (
        <p className="mb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl bg-(--color-folha) px-4 py-2.5 text-center text-sm text-(--color-tinta-fraca) shadow-sm ring-1 ring-black/5">
          <span>
            {avisoDaCauda === 1
              ? "1 carta nova entrou no fim do fichário."
              : `${avisoDaCauda} cartas novas entraram no fim do fichário.`}
          </span>
          <button
            type="button"
            onClick={() => setAvisoDaCauda(0)}
            className="min-h-9 rounded-full px-3 font-medium hover:text-(--color-tinta)"
          >
            ok
          </button>
        </p>
      )}

      {/*
        Modos filtrados podem ficar sem nenhuma carta. Mostrar um fichario de
        bolsos vazios ali nao explicaria nada — e o caso de "o que falta" vazio e
        justamente o momento de maior orgulho do app.
      */}
      {naPagina.length === 0 ? (
        <div className="rounded-3xl bg-(--color-folha) px-6 py-16 text-center shadow-sm ring-1 ring-black/5">
          {view === "missing" ? (
            <>
              <p className="text-2xl font-semibold text-(--color-tenho)">
                {rotuloRaridades
                  ? `Não falta nenhuma: ${rotuloRaridades.toLowerCase()}!`
                  : "Não falta nenhuma carta!"}
              </p>
              <p className="mt-2 text-(--color-tinta-fraca)">
                {rotuloRaridades
                  ? "Você já tem todas as cartas dessas raridades."
                  : "Essa coleção está completa."}
              </p>
            </>
          ) : view === "star" ? (
            <>
              <p className="text-xl font-semibold">
                <span className="text-(--color-estrela)">★</span> Nenhuma carta com
                estrela ainda
              </p>
              <p className="mt-2 text-(--color-tinta-fraca)">
                Toque <strong className="font-medium text-(--color-tinta)">três vezes</strong>{" "}
                numa carta para dizer que você quer muito essa. Elas ficam aqui, e viram
                uma folha só delas.
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-semibold">
                {rotuloRaridades && view === "mine"
                  ? "Você ainda não tem nenhuma dessas"
                  : "Você ainda não marcou nenhuma carta"}
              </p>
              <p className="mt-2 text-(--color-tinta-fraca)">
                Vá em <strong className="font-medium text-(--color-tinta)">Total</strong> e
                toque duas vezes nas cartas que você já tem.
              </p>
            </>
          )}
          {/* Uma saida so, que desfaz as DUAS lentes: quem chegou a um fichario
              vazio nao precisa descobrir qual delas o trouxe ate aqui. */}
          <button
            type="button"
            onClick={() => {
              setView("full");
              trocarRaridades(null);
            }}
            className="mt-6 min-h-12 rounded-full bg-(--color-tinta) px-6 text-base font-semibold text-(--color-mesa)"
          >
            Ver o fichário completo
          </button>
        </div>
      ) : (
      <div className={`relative ${arrumando ? "bancada p-2 sm:p-3" : ""}`}>
        {/*
          Virar pela borda da pagina. E o gesto do objeto real: pega-se a beirada
          da folha, nao um controle longe dela. A barra de baixo continua existindo
          para quem preferir — e e o unico caminho no celular, onde as duas paginas
          ficam empilhadas e "a lateral" nao quer dizer nada.
        */}
        <BordaDeVirar
          lado="esquerda"
          onClick={() => turn(current - 1, "tras")}
          disabled={current === 0}
        />
        <BordaDeVirar
          lado="direita"
          onClick={() => turn(current + 1, "frente")}
          disabled={current >= spreadCount - 1}
        />

        <div className="relative [perspective:2400px]">
          <div
            ref={fichRef}
            className="flex flex-col gap-6 rounded-3xl bg-(--color-folha) p-4 shadow-sm ring-1 ring-black/5 sm:flex-row sm:items-stretch sm:gap-0 sm:p-6"
          >
            {renderPage(fundoEsquerda, fundoEsquerdaNumero, ladoEsqRef)}

            {/* Argolas ENTRE as duas paginas: e o vinco que faz a tela ler como
                fichario aberto, e nao como uma grade unica de 6 colunas. */}
            <div
              ref={argolasRef}
              className="argolas hidden w-9 shrink-0 flex-col justify-evenly self-stretch px-2 sm:flex"
            >
              {Array.from({ length: rows + 1 }).map((_, i) => (
                <span key={i} className="argola" />
              ))}
            </div>

            {renderPage(fundoDireita, fundoDireitaNumero, ladoDirRef)}
          </div>

          {/*
            A folha que vira. Num fichario nao gira o conjunto: gira UMA folha,
            presa na lombada. Indo para a frente, a folha da direita passa para a
            esquerda; voltando, o contrario. Ela tem duas faces de verdade — a de
            fora e a pagina que sai, a de dentro e a pagina que chega — e o
            `backface-visibility` faz a troca acontecer sozinha ao cruzar os 90°.
          */}
          {flip && (
            <div
              key={`${flip.de}-${flip.para}`}
              className={`folha-virando ${flip.dir === "frente" ? "para-frente" : "para-tras"}`}
              style={{
                left: flip.caixa.left,
                top: flip.caixa.top,
                width: flip.caixa.width,
                height: flip.caixa.height,
              }}
            >
              <div
                className="folha-face"
                style={
                  flip.dir === "frente"
                    ? { paddingLeft: flip.caixa.recuo }
                    : { paddingRight: flip.caixa.recuo }
                }
              >
                {gradeDaPagina(flip.faceDeFora)}
              </div>
              <div
                className="folha-face folha-verso"
                style={
                  flip.dir === "frente"
                    ? { paddingRight: flip.caixa.recuo }
                    : { paddingLeft: flip.caixa.recuo }
                }
              >
                {gradeDaPagina(flip.faceDeDentro)}
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Navegacao. Some junto com o fichario quando o modo filtrado esta vazio. */}
      {pages.length > 0 && (
      <nav className="mt-5 flex items-center justify-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => turn(0, "tras")}
          disabled={current === 0}
          aria-label="Primeira página"
          title="Primeira página"
          className="grid h-12 w-12 place-items-center rounded-full bg-(--color-folha) shadow-sm ring-1 ring-black/5 disabled:opacity-30"
        >
          <IconeSeta direcao="esquerda" dupla />
        </button>
        <button
          type="button"
          onClick={() => turn(current - 1, "tras")}
          disabled={current === 0}
          aria-label="Página anterior"
          className="grid h-12 w-12 place-items-center rounded-full bg-(--color-folha) text-xl shadow-sm ring-1 ring-black/5 disabled:opacity-30"
        >
          <IconeSeta direcao="esquerda" />
        </button>
        <p className="tabular min-w-40 text-center text-base text-(--color-tinta-fraca)">
          {ultimaPaginaDoFichario
            ? `página ${current * 2 + 1}`
            : `páginas ${current * 2 + 1} e ${current * 2 + 2}`}{" "}
          de {pages.length}
        </p>
        <button
          type="button"
          onClick={() => turn(current + 1, "frente")}
          disabled={current >= spreadCount - 1}
          aria-label="Próxima página"
          className="grid h-12 w-12 place-items-center rounded-full bg-(--color-folha) text-xl shadow-sm ring-1 ring-black/5 disabled:opacity-30"
        >
          <IconeSeta direcao="direita" />
        </button>
        <button
          type="button"
          onClick={() => turn(spreadCount - 1, "frente")}
          disabled={current >= spreadCount - 1}
          aria-label="Última página"
          title="Última página"
          className="grid h-12 w-12 place-items-center rounded-full bg-(--color-folha) shadow-sm ring-1 ring-black/5 disabled:opacity-30"
        >
          <IconeSeta direcao="direita" dupla />
        </button>
      </nav>
      )}

      {/* Controles: o que antes era decisao antecipada, agora e interruptor com efeito imediato. */}
      {!arrumando && (
      <section className="mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-3">
        <Switch
          options={[
            { key: "full", label: "Total" },
            { key: "mine", label: "O que eu tenho" },
            { key: "missing", label: "O que falta" },
            { key: "star", label: `★ Quero muito${starred.size ? ` (${starred.size})` : ""}` },
          ]}
          value={view}
          onChange={(v) => setView(v as View)}
        />
        <Switch
          options={Object.keys(LAYOUTS).map((key) => ({
            key,
            label: key.replace("x", "×"),
          }))}
          value={layoutKey(columns, rows)}
          onChange={applyLayout}
        />
        <Switch
          options={[
            { key: "number", label: "Número" },
            { key: "rarity", label: "Raridade" },
          ]}
          value={sortRule}
          onChange={(v) => applySort(v as SortRule)}
        />
        {/*
          O filtro de raridade mora atras de um botao, e nao num quarto
          interruptor: sao ate 8 raridades, e a fileira ja tem tres. Com filtro
          ligado o botao passa a dizer QUAL lente esta na frente — "raridades"
          nao contaria o que mudou no fichario — e ganha o × que a desfaz.
        */}
        <div
          className={`inline-flex items-center rounded-full shadow-sm ring-1 ring-black/5 ${
            rotuloRaridades
              ? "bg-(--color-tinta) text-(--color-mesa)"
              : "bg-(--color-folha)"
          }`}
        >
          <button
            type="button"
            onClick={() => setEscolhendoRaridades(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium"
          >
            <IconeRaridade /> {rotuloRaridades ?? "raridades"}
          </button>
          {rotuloRaridades && (
            <button
              type="button"
              onClick={() => trocarRaridades(null)}
              aria-label="Ver todas as raridades"
              title="Ver todas as raridades"
              className="min-h-11 rounded-full pr-3.5 pl-1 text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>

        {/*
          Para onde vai a proxima estrela. So aparece a partir da SEGUNDA lista:
          com uma so nao ha escolha, e o botao seria um controle que nao muda
          nada — a mesma regra do atalho "so as especiais", que some onde nao
          separa nada.
        */}
        {listas.length > 1 && (
          <button
            type="button"
            onClick={() => setEscolhendoLista(true)}
            className="inline-flex min-h-11 max-w-[15rem] items-center gap-2 rounded-full bg-(--color-folha) px-4 text-sm font-medium shadow-sm ring-1 ring-black/5"
          >
            <span aria-hidden className="text-(--color-estrela)">
              ★
            </span>
            <span className="truncate">
              vai para: {listas.find((l) => l.id === listaAtiva)?.nome ?? listas[0].nome}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setFinding(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-(--color-folha) px-4 text-sm font-medium shadow-sm ring-1 ring-black/5"
        >
          <IconeLupa /> achar carta
        </button>

        {/*
          Arrumar fica na mesma fileira dos outros interruptores, e nao num botao
          grande: e uma das coisas que se faz com o fichario, nao a principal. O
          rotulo muda quando ja ha arranjo — "continuar" diz que o desenho dele
          esta la esperando, e nao que vai comecar de novo.
        */}
        <button
          type="button"
          onClick={entrarNoModo}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-(--color-folha) px-4 text-sm font-medium shadow-sm ring-1 ring-black/5"
        >
          <IconeArrumar /> {arranjo ? "continuar arrumando" : "arrumar do meu jeito"}
        </button>
      </section>
      )}

      {/*
        Os controles do modo substituem os outros em vez de conviver com eles.
        Dentro do modo nao ha lente, nem formato, nem ordem: as tres perguntas
        que eles respondem sao sobre COMO OLHAR o fichario, e aqui a crianca esta
        mexendo nele. Deixa-los na tela seria oferecer um gesto que o modo ignora.
      */}
      {arrumando && (
        <section className="mt-7">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={sairDoModo}
              className="min-h-11 rounded-full bg-(--color-tinta) px-6 text-sm font-semibold text-(--color-mesa)"
            >
              ✓ pronto
            </button>
            <button
              type="button"
              onClick={() => setGaveta(true)}
              disabled={arranjo?.mao != null}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-(--color-folha) px-4 text-sm font-medium shadow-sm ring-1 ring-black/5 disabled:opacity-45"
            >
              <span className="text-base leading-none">+</span> pegar carta
            </button>
            <button
              type="button"
              onClick={voltarAoAutomatico}
              className={`min-h-11 rounded-full px-4 text-sm font-medium ${
                confirmandoAutomatico
                  ? "bg-(--color-tinta) text-(--color-mesa)"
                  : "text-(--color-tinta-fraca) hover:text-(--color-tinta)"
              }`}
            >
              {confirmandoAutomatico
                ? "Tocar de novo para desarrumar"
                : "arrumar de novo"}
            </button>
          </div>

          {/* A unica frase do modo, e ela responde "e agora?". Com a carta na
              mao quem responde e a faixa de baixo, entao esta some. */}
          {arranjo?.mao == null && (
            <p className="mt-2 text-center text-sm text-(--color-tinta-fraca)">
              Toque numa carta para pegar. Toque num bolso para colocar.
            </p>
          )}
          {confirmandoAutomatico && (
            <p className="mt-1 text-center text-xs text-(--color-tinta-fraca)">
              O fichário volta a se montar sozinho. As cartas continuam marcadas.
            </p>
          )}
        </section>
      )}

      {/*
        Impressao: acao do adulto, nao da crianca. Fica no fim, e explicada.

        Duas secoes, quatro folhas, sempre as mesmas quatro. A lista de estrelas
        tambem e feita de cartas que faltam, entao chamar as duas de "as que
        faltam" apagava a diferenca — cada secao agora diz o nome dela e o que
        entra nela.
      */}
      {!arrumando && (
      <section className="mt-8 border-t border-(--color-vinco) pt-6">
        {completa ? (
          <p className="text-center text-lg font-medium text-(--color-tenho)">
            {varias
              ? "Fichário completo — não falta nenhuma carta."
              : "Coleção completa — não falta nenhuma carta."}
          </p>
        ) : (
          <>
            <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
              <BlocoDeImpressao
                titulo="As que faltam"
                subtitulo={`${stats.missing} ${
                  stats.missing === 1 ? "carta que falta" : "cartas que faltam"
                } ${varias ? "neste fichário" : "nesta coleção"}`}
                href={folhaDe()}
                quantidade={missing.length}
              />

              {/*
                Fica na tela mesmo sem nenhuma estrela, apagada: as quatro folhas
                sao sempre as mesmas quatro, e a frase do vazio e onde a crianca
                descobre o gesto que enche esta.
              */}
              <BlocoDeImpressao
                titulo="★ As que eu mais quero"
                subtitulo={`${estrelasFaltando.length} ${
                  estrelasFaltando.length === 1 ? "carta marcada" : "cartas marcadas"
                } com estrela, que ainda faltam`}
                href={folhaDe("estrelas")}
                quantidade={estrelasFaltando.length}
                estrela
                vazio="Toque três vezes numa carta para marcar ★"
              />
            </div>

            <p className="mx-auto mt-5 max-w-md text-center text-sm text-(--color-tinta-fraca)">
              Ao imprimir, escolha <strong className="font-semibold">Tamanho real (100%)</strong>{" "}
              — não use “Ajustar à página”.
            </p>
          </>
        )}
      </section>
      )}

      {origem.tipo === "montado" && (
        <section className="mt-8 border-t border-(--color-vinco) pt-6 text-center">
          <button
            type="button"
            onClick={desfazer}
            className={`min-h-11 rounded-full px-5 text-sm font-medium ${
              confirmandoDesfazer
                ? "bg-(--color-tinta) text-(--color-mesa)"
                : "text-(--color-tinta-fraca) hover:text-(--color-tinta)"
            }`}
          >
            {confirmandoDesfazer ? "Tocar de novo para desfazer" : "Desfazer este fichário"}
          </button>
          <p className="mt-1.5 text-xs text-(--color-tinta-fraca)">
            As coleções continuam onde estão, com tudo o que você já marcou.
          </p>
        </section>
      )}

      {aberta && (
        <CardViewer
          item={aberta}
          setId={aberta.setId}
          owned={owned.has(chave(aberta))}
          starred={starred.has(chave(aberta))}
          numberWidth={numberWidth}
          onToggle={toggle}
          onToggleStar={toggleStar}
          onClose={() => setAberta(null)}
          /* Aqui, e so aqui, a carta muda de lista: e a unica tela em que da
             para ver QUAL carta esta mudando de lugar. */
          listas={listas}
          listaDaCarta={starred.get(chave(aberta)) ?? null}
          onMover={moverEstrela}
        />
      )}

      {/*
        A carta na mao numa faixa FIXA, e nao presa a um bolso: ela sobrevive a
        virada de pagina, e e isso que faz o gesto funcionar num fichario de 300
        bolsos — pegar na pagina 3, virar, e soltar na 12. Arrastar nunca daria
        isso: o dedo teria de soltar para virar a folha.
      */}
      {arrumando && arranjo?.mao && (
        <MaoDeCartas
          item={arranjo.mao}
          numberWidth={numberWidth}
          podeTirar={universoKeys.has(chaveDe(arranjo.mao))}
          onDevolver={devolverMao}
          onTirar={tirarDaMao}
        />
      )}

      {gaveta && arranjo && (
        <Gaveta
          colecoes={catalogo}
          fora={arranjo.fora}
          jaNoFichario={jaNoFichario}
          numberWidth={numberWidth}
          onPuxar={puxarCarta}
          onClose={() => setGaveta(false)}
        />
      )}

      {escolhendoLista && (
        <EscolherLista
          listas={listas}
          ativa={listaAtiva}
          contagens={estrelasPorLista}
          onChange={escolherLista}
          onClose={() => setEscolhendoLista(false)}
        />
      )}

      {escolhendoRaridades && (
        <Raridades
          contagens={contagens}
          selecionadas={raridades}
          onChange={trocarRaridades}
          onClose={() => setEscolhendoRaridades(false)}
        />
      )}

      {finding && (
        <FindCard
          max={Math.max(...posicoes.map((i) => cardNumber(i.card)))}
          onGo={goToCard}
          onClose={() => setFinding(false)}
        />
      )}

      {erro && (
        <p
          role="status"
          className="fixed inset-x-0 bottom-5 mx-auto w-fit rounded-full bg-(--color-tinta) px-5 py-3 text-sm font-medium text-(--color-mesa) shadow-lg"
        >
          {erro}
        </p>
      )}
    </main>
  );
}

function Switch({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-(--color-folha) p-1 shadow-sm ring-1 ring-black/5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`min-h-10 rounded-full px-4 text-sm font-medium transition-colors ${
            value === o.key
              ? "bg-(--color-tinta) text-(--color-mesa)"
              : "text-(--color-tinta-fraca) hover:text-(--color-tinta)"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Duas cartas trocando de lugar: o gesto do modo arrumar, inteiro, num desenho.
 * Nao e uma mao — a mao aparece na faixa de baixo com a carta de verdade, e um
 * segundo simbolo de mao aqui diria a mesma coisa duas vezes.
 */
function IconeArrumar() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="1.4"
        y="2.6"
        width="5"
        height="7"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="9.6"
        y="6.4"
        width="5"
        height="7"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M8 3.6h3.4M9.9 2.1 11.6 3.6 9.9 5.1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 12.4H4.6M6.5 10.9 4.8 12.4l1.7 1.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Um losango: o simbolo que a propria carta usa para dizer a raridade. */
function IconeRaridade() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.8l6.2 6.2L8 14.2 1.8 8 8 1.8z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconeLupa() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconeSeta({
  direcao,
  dupla = false,
}: {
  direcao: "esquerda" | "direita";
  dupla?: boolean;
}) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      style={direcao === "esquerda" ? { transform: "scaleX(-1)" } : undefined}
    >
      <path
        d={dupla ? "m3 3 5 5-5 5M9 3l5 5-5 5" : "m6 3 5 5-5 5"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Seta grudada na beirada do fichario. Fica sobre a margem da folha, entao virar
 * a pagina e pegar a propria borda — nao mirar num controle a dez centimetros dali.
 * Escondida no celular, onde as paginas empilham e "lateral" nao significa nada.
 */
function BordaDeVirar({
  lado,
  onClick,
  disabled,
}: {
  lado: "esquerda" | "direita";
  onClick: () => void;
  disabled: boolean;
}) {
  if (disabled) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={lado === "esquerda" ? "Página anterior" : "Próxima página"}
      className={`absolute top-1/2 z-20 hidden h-16 w-9 -translate-y-1/2 place-items-center rounded-full bg-(--color-folha)/85 text-(--color-tinta-fraca) shadow-md ring-1 ring-black/10 backdrop-blur-sm transition hover:text-(--color-tinta) hover:shadow-lg active:scale-95 sm:grid ${
        lado === "esquerda" ? "-left-3" : "-right-3"
      }`}
    >
      <IconeSeta direcao={lado} />
    </button>
  );
}
