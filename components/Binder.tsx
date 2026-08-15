"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { sortCards, cardNumber } from "@/lib/cards";
import { generateSlots, missingCards, progress, findCardPage } from "@/lib/binder";
import { sheetsNeeded } from "@/lib/sheet";
import {
  LAYOUTS,
  layoutKey,
  itemKey,
  expandirVariantes,
  type Card,
  type SlotItem,
  type SortRule,
} from "@/lib/types";
import CardSlot from "./CardSlot";
import CardViewer from "./CardViewer";
import FindCard from "./FindCard";

type Props = {
  setId: string;
  setName: string;
  cards: Card[];
  initialOwned: string[];
  initialHidden: string[];
  initialRows: number;
  initialColumns: number;
  initialSortRule: SortRule;
};

/**
 * Tres olhares sobre a mesma colecao:
 *  - `full`    o fichario inteiro, faltantes em cinza — e onde se faz a varredura
 *  - `mine`    so o que ele tem, sem buracos — o fichario como esta na mesa
 *  - `missing` so o que falta, sem buracos — a lista de caca, e o que vai no PDF
 */
type View = "full" | "mine" | "missing";

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
  setId,
  setName,
  cards,
  initialOwned,
  initialHidden,
  initialRows,
  initialColumns,
  initialSortRule,
}: Props) {
  const [owned, setOwned] = useState<Set<string>>(() => new Set(initialOwned));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(initialHidden));
  const [revelarEscondidas, setRevelarEscondidas] = useState(false);
  const [rows, setRows] = useState(initialRows);
  const [columns, setColumns] = useState(initialColumns);
  const [sortRule, setSortRule] = useState<SortRule>(initialSortRule);
  const [aberta, setAberta] = useState<SlotItem | null>(null);
  const [view, setView] = useState<View>("full");
  const [spread, setSpread] = useState(0); // par de paginas aberto
  type Flip = {
    de: number;
    para: number;
    dir: "frente" | "tras";
    faceDeFora: (SlotItem | null)[];
    faceDeDentro: (SlotItem | null)[];
    /** Caixa medida da folha, em px relativos ao fichario. */
    caixa: { left: number; top: number; width: number; height: number; recuo: number };
  };
  const [flip, setFlip] = useState<Flip | null>(null);
  const flipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [finding, setFinding] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fichRef = useRef<HTMLDivElement>(null);
  const ladoEsqRef = useRef<HTMLDivElement>(null);
  const ladoDirRef = useRef<HTMLDivElement>(null);
  const argolasRef = useRef<HTMLDivElement>(null);

  /**
   * Escondidas ("nao tenho e nao quero") somem da colecao antes de qualquer
   * ordenacao — some por numero e por raridade igual. So reaparecem quando ele
   * pede para revelar, para poder desfazer.
   */
  const ordenadas = useMemo(() => sortCards(cards, sortRule), [cards, sortRule]);

  /**
   * Cada carta comum/incomum/rara ocupa DOIS bolsos: a simples e a brilhante,
   * lado a lado. A expansao acontece depois da ordenacao, entao o par fica junto
   * em qualquer das duas ordens.
   */
  const posicoes = useMemo(
    () => expandirVariantes(ordenadas, setId),
    [ordenadas, setId],
  );

  const chave = (i: SlotItem) => itemKey(i.card.id, i.variant);

  const ordered = useMemo(
    () => (revelarEscondidas ? posicoes : posicoes.filter((i) => !hidden.has(chave(i)))),
    [posicoes, hidden, revelarEscondidas],
  );

  /**
   * "O que eu tenho" remonta o fichario apenas com as cartas que ele possui,
   * fechando os buracos. E o fichario como esta de verdade na mesa: a crianca
   * encaixa as cartas em sequencia, nao deixa bolso reservado para o que falta.
   */
  const naPagina = useMemo(() => {
    if (view === "mine") return ordered.filter((i) => owned.has(chave(i)));
    if (view === "missing") return ordered.filter((i) => !owned.has(chave(i)));
    return ordered;
  }, [ordered, view, owned]);
  const pages = useMemo(
    () => generateSlots(naPagina, rows, columns),
    [naPagina, rows, columns],
  );
  const missing = useMemo(() => missingCards(ordered, owned, chave), [ordered, owned]);
  const stats = progress(posicoes.length - hidden.size, owned.size);
  const numberWidth = Math.max(String(cards.length).length, 2);

  const spreadCount = Math.max(1, Math.ceil(pages.length / 2));
  const current = Math.min(spread, spreadCount - 1);

  /**
   * O fichario aberto mostra SEMPRE duas paginas. Quando a colecao termina numa
   * pagina impar, a da direita vem em branco — que e o que acontece no fichario
   * fisico, porque a folha tem dois lados. Renderizar so um lado fazia a pagina
   * esticar para a largura toda e as cartas dobrarem de tamanho.
   */
  const paginaVazia = useMemo(
    () => Array<SlotItem | null>(rows * columns).fill(null),
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

  /** Grava por tras; a interface ja mudou. Se falhar, desfaz e avisa. */
  const persistOwned = useCallback(
    async (ids: string[], value: boolean) => {
      try {
        const res = await enfileirar(() =>
          fetch("/api/marcar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ setId, cardIds: ids, marca: "tenho", valor: value }),
          }),
        );
        if (!res.ok) throw new Error();
      } catch {
        setOwned((prev) => {
          const next = new Set(prev);
          for (const id of ids) value ? next.delete(id) : next.add(id);
          return next;
        });
        setErro("Não consegui salvar. Tente de novo.");
        setTimeout(() => setErro(null), 3500);
      }
    },
    [setId],
  );

  const toggleHidden = useCallback(
    (item: SlotItem) => {
      const k = itemKey(item.card.id, item.variant);
      const escondida = hidden.has(k);
      setHidden((prev) => {
        const next = new Set(prev);
        escondida ? next.delete(k) : next.add(k);
        return next;
      });
      // Esconder tambem tira a posse: e "nao tenho E nao quero".
      if (!escondida) {
        setOwned((prev) => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
      }
      void enfileirar(async () => {
        const res = await fetch("/api/marcar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setId, cardIds: [k], marca: "escondida", valor: !escondida }),
        });
        if (!res.ok) throw new Error();
      }).catch(() => {
        setHidden((prev) => {
          const next = new Set(prev);
          escondida ? next.add(k) : next.delete(k);
          return next;
        });
        setErro("Não consegui salvar. Tente de novo.");
        setTimeout(() => setErro(null), 3500);
      });
    },
    [hidden, setId],
  );

  const toggle = useCallback(
    (item: SlotItem) => {
      const k = itemKey(item.card.id, item.variant);
      const has = owned.has(k);
      setOwned((prev) => {
        const next = new Set(prev);
        has ? next.delete(k) : next.add(k);
        return next;
      });
      void persistOwned([k], !has);
    },
    [owned, persistOwned],
  );

  /** "Tenho todas desta pagina": o atalho que torna a varredura viavel. */
  const togglePage = useCallback(
    (page: (SlotItem | null)[]) => {
      const present = (page.filter(Boolean) as SlotItem[]).filter(
        (i) => !hidden.has(itemKey(i.card.id, i.variant)),
      );
      if (present.length === 0) return;
      const ids = present.map((i) => itemKey(i.card.id, i.variant));
      const allOwned = ids.every((k) => owned.has(k));
      setOwned((prev) => {
        const next = new Set(prev);
        for (const id of ids) (allOwned ? next.delete(id) : next.add(id));
        return next;
      });
      void persistOwned(ids, !allOwned);
    },
    [owned, hidden, persistOwned],
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
      body: JSON.stringify({ setId, ...patch }),
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

    // Fora do modo Total a carta pode nao estar a vista (ja tenho / ja falta).
    // Em vez de dizer que ela nao existe, volta para o Total e leva ate o lugar dela.
    if (!hit && view !== "full") {
      const noCompleto = findCardPage(ordered, n, rows, columns);
      if (noCompleto) {
        setView("full");
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
      if (aberta || finding) return;
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

  /** So a grade, sem rotulo nem botao: e o que a folha em movimento precisa mostrar. */
  const gradeDaPagina = (page: (SlotItem | null)[]) => (
    <div
      className="pointer-events-none grid gap-2 sm:gap-2.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      aria-hidden
    >
      {page.map((item, slot) => (
        <CardSlot
          key={item ? chave(item) : `folha-${slot}`}
          item={item}
          owned={item ? owned.has(chave(item)) : false}
          highlighted={false}
          hidden={item ? hidden.has(chave(item)) : false}
          numberWidth={numberWidth}
          onToggle={() => {}}
          onToggleHidden={() => {}}
          onOpen={() => {}}
        />
      ))}
    </div>
  );

  const renderPage = (
    page: (SlotItem | null)[],
    pageNumber: number | null,
    ref?: React.RefObject<HTMLDivElement | null>,
  ) => {
    const present = page.filter(Boolean) as SlotItem[];
    const allOwned = present.length > 0 && present.every((i) => owned.has(chave(i)));

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
              owned={item ? owned.has(chave(item)) : false}
              highlighted={item ? chave(item) === highlight : false}
              numberWidth={numberWidth}
              hidden={item ? hidden.has(chave(item)) : false}
              onToggle={toggle}
              onToggleHidden={toggleHidden}
              onOpen={setAberta}
            />
          ))}
        </div>

        {/* min-h fixa: sem ela, o lado em branco fica mais curto e desalinha o vinco. */}
        <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
          <span className="tabular text-sm text-(--color-tinta-fraca)">
            {pageNumber !== null ? `página ${pageNumber}` : ""}
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
            {setName}
          </h1>
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
        So aparece quando ha escondidas — controle que nao existe enquanto nao
        serve para nada. E o unico caminho de volta: escondida some do fichario,
        entao sem revelar nao daria para desfazer.
      */}
      {hidden.size > 0 && (
        <p className="-mt-2 mb-4 text-sm text-(--color-tinta-fraca)">
          {hidden.size === 1 ? "1 carta que você não quer" : `${hidden.size} cartas que você não quer`}
          {" · "}
          <button
            type="button"
            onClick={() => setRevelarEscondidas((v) => !v)}
            className="font-medium text-(--color-tinta) underline underline-offset-2"
          >
            {revelarEscondidas ? "esconder de novo" : "mostrar"}
          </button>
          {revelarEscondidas && (
            <span className="ml-1">— toque três vezes para trazer de volta</span>
          )}
        </p>
      )}

      {/*
        Modos filtrados podem ficar sem nenhuma carta. Mostrar um fichario de
        bolsos vazios ali nao explicaria nada — e o caso de "o que falta" vazio e
        justamente o momento de maior orgulho do app.
      */}
      {naPagina.length === 0 && view !== "full" ? (
        <div className="rounded-3xl bg-(--color-folha) px-6 py-16 text-center shadow-sm ring-1 ring-black/5">
          {view === "missing" ? (
            <>
              <p className="text-2xl font-semibold text-(--color-tenho)">
                Não falta nenhuma carta!
              </p>
              <p className="mt-2 text-(--color-tinta-fraca)">
                Essa coleção está completa.
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-semibold">Você ainda não marcou nenhuma carta</p>
              <p className="mt-2 text-(--color-tinta-fraca)">
                Vá em <strong className="font-medium text-(--color-tinta)">Total</strong> e
                toque duas vezes nas cartas que você já tem.
              </p>
            </>
          )}
          <button
            type="button"
            onClick={() => setView("full")}
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
        <button
          type="button"
          onClick={() => setFinding(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-(--color-folha) px-4 text-sm font-medium shadow-sm ring-1 ring-black/5"
        >
          <IconeLupa /> achar carta
        </button>
      </section>

      {/* Impressao: acao do adulto, nao da crianca. Fica no fim, e explicada. */}
      <section className="mt-8 border-t border-(--color-vinco) pt-6 text-center">
        {completa ? (
          <p className="text-lg font-medium text-(--color-tenho)">
            Coleção completa — não falta nenhuma carta.
          </p>
        ) : (
          <>
            <a
              href={`/api/pdf/${setId}`}
              className="inline-flex min-h-12 items-center gap-2.5 rounded-full bg-(--color-tinta) px-6 text-base font-semibold text-(--color-mesa)"
            >
              <IconeBaixar />
              PDF {stats.missing === 1 ? "da carta que falta" : `das ${stats.missing} faltantes`}
            </a>
            <p className="tabular mx-auto mt-3 max-w-md text-sm text-(--color-tinta-fraca)">
              {sheetsNeeded(missing.length)}{" "}
              {sheetsNeeded(missing.length) === 1 ? "folha A4" : "folhas A4"}, 9 cartas por
              folha em tamanho real.
              <br />
              Ao imprimir, escolha <strong className="font-semibold">Tamanho real (100%)</strong>{" "}
              — não use “Ajustar à página”.
            </p>
          </>
        )}
      </section>

      {aberta && (
        <CardViewer
          item={aberta}
          owned={owned.has(chave(aberta))}
          hidden={hidden.has(chave(aberta))}
          numberWidth={numberWidth}
          onToggle={toggle}
          onToggleHidden={toggleHidden}
          onClose={() => setAberta(null)}
        />
      )}

      {finding && (
        <FindCard
          max={Math.max(...ordered.map((i) => cardNumber(i.card)))}
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

function IconeLupa() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconeBaixar() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2v8m0 0L4.8 6.8M8 10l3.2-3.2M2.5 13h11"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
