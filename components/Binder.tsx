"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sortCards, cardNumber } from "@/lib/cards";
import {
  generateSlotsByGroup,
  missingCards,
  progress,
  findCardPage,
} from "@/lib/binder";
import {
  LAYOUTS,
  BUCKET_LABELS,
  BUCKETS,
  layoutKey,
  itemKey,
  expandirVariantes,
  bucketEspecial,
  atalhoEspeciaisSeparaAlgo,
  type Bucket,
  type Card,
  type SlotItem,
  type SortRule,
} from "@/lib/types";
import BlocoDeImpressao from "./BlocoDeImpressao";
import CardSlot from "./CardSlot";
import CardViewer from "./CardViewer";
import FindCard from "./FindCard";
import Raridades from "./Raridades";

/** Uma colecao dentro do fichario, na ordem em que ela entra nas folhas. */
export type ColecaoNoFichario = { setId: string; setName: string; cards: Card[] };

/**
 * De onde o fichario veio, que e o que decide onde ele grava e de onde saem as
 * folhas. Uma colecao aberta direto (`/binder/sv7`) e um fichario montado a mao
 * com varias colecoes (`/fichario/<id>`) sao a MESMA tela — a diferenca cabe
 * nestes dois campos, e nao numa segunda copia do fichario.
 */
export type Origem =
  | { tipo: "colecao"; setId: string }
  | { tipo: "montado"; id: string };

type Props = {
  /** O nome no alto: a colecao, ou o fichario que ele montou. */
  titulo: string;
  /** Uma, quando se abre uma colecao; varias, num fichario montado. */
  colecoes: ColecaoNoFichario[];
  origem: Origem;
  initialOwned: string[];
  initialStarred: string[];
  initialRows: number;
  initialColumns: number;
  initialSortRule: SortRule;
};

/**
 * Uma posicao do fichario que sabe de que colecao veio.
 *
 * Num fichario com tres colecoes, "o setId" deixa de ser propriedade da tela e
 * passa a ser propriedade do BOLSO: e ele que decide o selo da variante (so
 * `me2pt5` tem dois reverses), a que manifest a marcacao vai ser validada e em
 * que pagina a colecao seguinte comeca.
 */
type Posicao = SlotItem & { setId: string; setName: string };

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
}: Props) {
  const [owned, setOwned] = useState<Set<string>>(() => new Set(initialOwned));
  const [starred, setStarred] = useState<Set<string>>(() => new Set(initialStarred));
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
  const posicoes = useMemo<Posicao[]>(() => {
    const out: Posicao[] = [];
    for (const c of colecoes) {
      for (const item of expandirVariantes(sortCards(c.cards, sortRule), c.setId)) {
        out.push({ ...item, setId: c.setId, setName: c.setName });
      }
    }
    return out;
  }, [colecoes, sortRule]);

  const chave = (i: SlotItem) => itemKey(i.card.id, i.variant);
  const varias = colecoes.length > 1;

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
  const visiveis = useMemo(
    () => (raridades ? posicoes.filter((i) => raridades.has(i.card.bucket)) : posicoes),
    [posicoes, raridades],
  );
  const naPagina = useMemo(() => {
    if (view === "mine") return visiveis.filter((i) => owned.has(chave(i)));
    if (view === "missing") return visiveis.filter((i) => !owned.has(chave(i)));
    if (view === "star") return visiveis.filter((i) => starred.has(chave(i)));
    return visiveis;
  }, [visiveis, view, owned, starred]);

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
    () => generateSlotsByGroup(naPagina, rows, columns, (i) => i.setId),
    [naPagina, rows, columns],
  );
  const missing = useMemo(() => missingCards(posicoes, owned, chave), [posicoes, owned]);
  /** As estrelas que ainda faltam — as unicas que precisam de recorte. */
  const estrelasFaltando = useMemo(
    () => missing.filter((i) => starred.has(chave(i))),
    [missing, starred],
  );
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
   * Poe ou tira a estrela. Nao mexe na posse, ao contrario do esconder que
   * existia aqui: "quero muito" e "ja tenho" convivem, e a carta continua no
   * fichario e na conta das faltantes.
   */
  const toggleStar = useCallback(
    (item: Posicao) => {
      const k = itemKey(item.card.id, item.variant);
      const tinha = starred.has(k);
      setStarred((prev) => {
        const next = new Set(prev);
        tinha ? next.delete(k) : next.add(k);
        return next;
      });
      void enfileirar(async () => {
        const res = await fetch("/api/marcar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            setId: item.setId,
            cardIds: [k],
            marca: "estrela",
            valor: !tinha,
          }),
        });
        if (!res.ok) throw new Error();
      }).catch(() => {
        setStarred((prev) => {
          const next = new Set(prev);
          tinha ? next.add(k) : next.delete(k);
          return next;
        });
        avisarFalha();
      });
    },
    [starred, avisarFalha],
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
          {page.map((item, slot) => (
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
            />
          ))}
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
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-6 sm:px-7">
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
      <div className="relative">
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

        <button
          type="button"
          onClick={() => setFinding(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-(--color-folha) px-4 text-sm font-medium shadow-sm ring-1 ring-black/5"
        >
          <IconeLupa /> achar carta
        </button>
      </section>

      {/*
        Impressao: acao do adulto, nao da crianca. Fica no fim, e explicada.

        Duas secoes, quatro folhas, sempre as mesmas quatro. A lista de estrelas
        tambem e feita de cartas que faltam, entao chamar as duas de "as que
        faltam" apagava a diferenca — cada secao agora diz o nome dela e o que
        entra nela.
      */}
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
