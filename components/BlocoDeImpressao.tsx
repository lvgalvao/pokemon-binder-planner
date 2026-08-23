import { sheetsNeeded } from "@/lib/sheet";

/**
 * Um destino de impressao, com as duas escalas.
 *
 * Sao sempre QUATRO folhas possiveis no fichario — faltantes e estrelas, cada
 * uma em tamanho real e menor — e cada botao precisa dizer sozinho o que traz.
 * A primeira versao chamava as duas listas de "as que ainda faltam", porque as
 * estrelas impressas tambem sao faltantes; os dois blocos ficaram com o mesmo
 * nome e a diferenca sumiu. Agora o titulo diz QUAL lista e o subtitulo diz o
 * que entra nela, em voz de crianca.
 *
 * Dois botoes explicitos em vez de um botao mais um interruptor de tamanho: a
 * escolha e rara e esconder metade dela atras de um estado obrigaria a lembrar
 * em que posicao o interruptor ficou. Cada botao ja diz quantas folhas vai
 * gastar — que e a informacao que de fato decide entre um e outro.
 */
export default function BlocoDeImpressao({
  titulo,
  subtitulo,
  href,
  quantidade,
  estrela = false,
  vazio,
}: {
  titulo: string;
  /** O que entra nesta folha. E o que separa uma lista da outra. */
  subtitulo: string;
  href: string;
  quantidade: number;
  estrela?: boolean;
  /**
   * O que dizer quando nao ha nada a imprimir nesta lista. Presente, o bloco
   * continua na tela apagado, em vez de sumir: as quatro folhas ficam sempre
   * visiveis, e a frase ensina como encher a que esta vazia.
   */
  vazio?: string;
}) {
  const folhas = (n: number) => `${n} ${n === 1 ? "folha" : "folhas"}`;
  const reduzido = `${href}${href.includes("?") ? "&" : "?"}escala=reduzida`;
  const semNada = quantidade === 0;

  return (
    <div
      className={`rounded-2xl bg-(--color-folha) p-4 shadow-sm ring-1 ring-black/5 ${
        semNada ? "opacity-55" : ""
      }`}
    >
      <p
        className={`text-center text-base font-semibold ${
          estrela ? "text-(--color-estrela)" : ""
        }`}
      >
        {titulo}
      </p>
      <p className="tabular mt-0.5 text-center text-xs text-(--color-tinta-fraca)">
        {semNada ? vazio : subtitulo}
      </p>

      <div className="mt-3 grid gap-2">
        <Botao
          href={href}
          rotulo="Tamanho real"
          detalhe={`${folhas(sheetsNeeded(quantidade))} · 9 por folha · 63 × 88 mm`}
          estrela={estrela}
          inerte={semNada}
        />
        <Botao
          href={reduzido}
          rotulo="Menores"
          detalhe={`${folhas(sheetsNeeded(quantidade, "reduzida"))} · 25 por folha · 37 × 52 mm`}
          inerte={semNada}
        />
      </div>

      {!semNada && (
        <p className="mt-2.5 text-center text-xs text-(--color-tinta-fraca)">
          Abre numa aba para conferir antes de salvar.
        </p>
      )}
    </div>
  );
}

/**
 * O botao de uma escala. Sem folha para gerar ele vira `span`: um link que
 * responde "não falta nenhuma carta" com uma pagina de erro seria pior que um
 * botao que nao convida ao toque.
 */
function Botao({
  href,
  rotulo,
  detalhe,
  estrela = false,
  inerte,
}: {
  href: string;
  rotulo: string;
  detalhe: string;
  estrela?: boolean;
  inerte: boolean;
}) {
  const conteudo = (
    <>
      <span className="flex items-center gap-2 text-base font-semibold">
        <IconeBaixar /> {rotulo}
      </span>
      <span
        className={`tabular mt-0.5 text-xs ${
          estrela && !inerte ? "opacity-80" : "text-(--color-tinta-fraca)"
        }`}
      >
        {detalhe}
      </span>
    </>
  );

  const forma = "flex min-h-14 flex-col items-center justify-center rounded-xl px-4 py-2 leading-tight";
  const cor = estrela
    ? "bg-(--color-estrela) text-white"
    : "bg-(--color-tinta) text-(--color-mesa)";

  if (inerte) {
    return (
      <span
        aria-disabled
        className={`${forma} bg-(--color-mesa) text-(--color-tinta-tenue) ring-1 ring-black/5`}
      >
        {conteudo}
      </span>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener" className={`${forma} ${rotulo === "Menores" ? "bg-(--color-mesa) ring-1 ring-black/5" : cor}`}>
      {conteudo}
    </a>
  );
}

export function IconeBaixar() {
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
