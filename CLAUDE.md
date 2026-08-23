# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

App web local para planejar um fichário físico de Pokémon TCG: escolher a coleção, ver como o
fichário vai ficar, marcar as cartas que já se tem, e baixar um PDF A4 com as faltantes em
tamanho real para imprimir e encaixar nos bolsos.

O usuário-alvo é uma criança. Isso é requisito de design, não enfeite: qualquer coisa que
exija explicação está errada.

Especificações de origem em `.llm/` — `project.md` (PRD) e `spec-download-assets.md` (pipeline
de imagens). Ambas precedem o app e divergem dele em pontos registrados abaixo.

## Comandos

```bash
npm run dev              # http://localhost:3000
npm run build            # build de produção
npm test                 # Vitest, uma vez
npm run test:watch       # Vitest em watch
npx vitest run tests/pdf.test.ts              # um arquivo
npx vitest run -t "regressao zsv10pt5"        # um teste pelo nome
npx tsc --noEmit         # typecheck
```

Repovoar uma coleção (precisa de `assets/`, ver `.llm/spec-download-assets.md` §11):

```bash
node tools/download-cards.mjs --set me5                       # de api.pokemontcg.io
node tools/download-cards.mjs --set mep --fonte tcgdex \
  --nome "Promos Mega Evolution"                              # só a tcgdex tem promo
node tools/capa-promos.mjs --set mep --carta mep-29           # capa de quem não tem pacote
node tools/sync-manifests.mjs                                 # assets/ -> data/manifests/
node tools/upload-assets.mjs --set me5                        # derivados -> Supabase Storage
```

Não há passo de banco: o SQLite se cria sozinho em `data/binder.db` na primeira execução.

## Arquitetura

**Sem Pokémon TCG API em tempo de execução.** Os dados vêm de `assets/<setId>/manifest.json`,
lidos do disco e cacheados em memória (`lib/manifests.ts`). Sem chave, sem rate limit, funciona
offline. Os 27 sets têm `unmapped = 0` e `totalSet == len(cards)`. O PRD §29–§33 descreve um
`PokemonTcgService` que **não existe** e não deve ser criado sem necessidade nova.

**A API só aparece no downloader**, `tools/download-cards.mjs`, rodado à mão. Ele fala duas
fontes porque nenhuma sozinha dá conta:

- `pokemontcg` (api.pokemontcg.io/v2) — as 26 coleções normais, imagens 733×1024. **Instável**:
  numa medição de 8 chamadas, 3 voltaram 500/502. Daí o retry com backoff.
- `tcgdex` (api.tcgdex.net/v2/en) — a única com as promos. Imagens 600×825, os mesmos 242 DPI
  já aceitos em `base1`–`base3` e `sv6pt5`. Cai por períodos longos, não por chamadas isoladas.

A spec de assets §11 manda usar um `download_cards.py` que vive no projeto `PokeTCG`. Aqui ele
virou Node porque `sharp` já é dependência (dispensa venv e Pillow) e porque o script Python
fala uma fonte só. A saída é a mesma da spec §2 e §5 — `tests/manifests.test.ts` cobre a forma.

**Sem ORM.** `node:sqlite` embutido no Node 22 (`lib/db.ts`). Duas tabelas, só estado do usuário:
`binder` (layout e ordem por coleção) e `owned_card` (presença da linha = possui). O PRD sugeria
Prisma; o Prisma 7 exige `prisma.config.ts` mais driver adapter nativo, o que é mais peça móvel
que problema resolvido para duas tabelas.

**A separação que sustenta tudo** (PRD §41), preservada:

```
Card       → entrada do manifest — dado externo, somente leitura
SlotItem   → { card, variant } — a POSIÇÃO no fichário, derivada, nunca persistida
Ownership  → banco, chaveado por SlotItem
```

**Variantes simples e brilhante.** Comum, incomum e rara (incluindo Rare Holo)
existem em mais de uma versão física, então ocupam bolsos lado a lado. A expansão
acontece em `expandirVariantes` (`lib/types.ts`), **depois** da ordenação, para as
versões ficarem juntas tanto por número quanto por raridade. `base1`, `base2` e
`base3` ficam de fora: reverse holo só surge por volta de 2002 e criar o par ali
geraria bolsos impossíveis de preencher. sv7 vai de 175 cartas para 300 bolsos.

**`me2pt5` (Ascended Heroes) tem DOIS reverses**, o de energia e o de pokébola,
então cada comum/incomum/rara ocupa três bolsos: 295 cartas viram 651 bolsos, e a
folha 3×3 vai de 53 para 73. Quem decide é `variantesDe(setId, card)` — use ela,
não `temReverseHolo`, que só responde se há reverse *algum*. O nome da variante
padrão continua `holo` e não `energia` de propósito: é o que já está gravado como
`#holo` em todo fichário existente, e renomear obrigaria a migrar posse.

**Promo é o 8º bucket, e uma coleção inteira.** A spec de assets §2 declara 7 buckets fixos e
§4 manda descartar raridade não mapeada — foi por isso que promo nunca apareceu. Mas promo não
é uma raridade dentro de uma coleção: é uma coleção própria por era (as *Black Star Promos*),
sem vínculo com nenhum set em fonte nenhuma. Daí `08_promo` em `BUCKETS` (`lib/types.ts`), que
fica **por último** e **fora de `BUCKETS_COM_REVERSE`**: promo existe numa versão única, e o par
só criaria bolso impossível de preencher — a coleção inteira em dobro. Numa coleção só de promos
todas as cartas caem no mesmo bucket, então a ordenação por raridade vira a numérica, que é o
que se quer.

**A chave de posse embute a variante**: `"sv7-2"` para a normal, `"sv7-2#holo"`
para a brilhante e `"me2pt5-4#pokebola"` para o segundo reverse (`itemKey` /
`parseItemKey`). Foi essa escolha que dispensou migração — tudo que já estava
gravado era, por definição, a versão normal. `parseItemKey` recusa sufixo
desconhecido em vez de tratá-lo como normal: duas chaves diferentes cairiam no
mesmo bolso e uma marcação apagaria a outra.

`assets/` fica **fora de `public/`** (830 MB). É servido por `app/img/[...path]/route.ts`, que
valida o caminho contra a whitelist dos 7 buckets antes de tocar o disco.

## Armadilhas reais deste código

**Nunca ordenar por `collectionNumber`.** O campo é derivado no downloader com
`int(re.sub(r"[^0-9]", "", card.number))` e tem colisão nos dados: em `zsv10pt5`, a carta
`zsv10pt5-80` ("Antique Cover Fossil") recebeu `collectionNumber: 60`, batendo com
`zsv10pt5-60` ("Escavalier") — e o 80 sumiu da sequência. Use `cardNumber()` de `lib/cards.ts`,
que lê o sufixo do `id`: verificado único e 100% numérico nas 4.589 cartas dos 25 sets.
Há teste de regressão em `tests/cards.test.ts`.

**`lib/sheet.ts` é puro; `lib/pdf.ts` não.** A interface precisa de `sheetsNeeded()`, e importar
isso de `pdf.ts` arrasta `node:fs` para o bundle do navegador — o Turbopack falha com
*"chunking context does not support external modules"*. Geometria pura vive em `sheet.ts`.

**O PDF é montado em coordenadas absolutas, não impresso via CSS.** Imprimir HTML pelo navegador
passa por "ajustar à página" e destrói o tamanho físico. Carta = 63 × 88 mm (padrão desde 1996);
as imagens de 733×1024 px dão 295 DPI nesse tamanho, com proporção 0,7158 contra 63/88 = 0,7159.
`tests/pdf.test.ts` lê o content stream do PDF gerado e afere a geometria em milímetros.

**Duas folhas, quatro downloads.** `FOLHA.real` é a de sempre — 63 × 88 mm, 3×3, para recortar e
encaixar. `FOLHA.reduzida` é a mesma carta a ~59%: 37,2 × 52,0 mm, 5×5, 25 por folha, para levar
a lista na mão sem gastar seis folhas. **O fator não é escolhido, é derivado**: é o que faz 5
colunas caberem na largura do A4 com a margem mínima de 8 mm que a impressora doméstica alcança
(`fatorPara()` em `sheet.ts`), e as linhas são as que couberem com esse mesmo fator. Escolher um
número redondo como 60% empurraria a margem para 6,5 mm, dentro da faixa que muita impressora
não imprime. A proporção 63:88 nunca muda — o teste exige isso, porque uma carta esticada é pior
que uma carta pequena. Cada folha existe para as faltantes e para as estrelas: `?lista=estrelas`
e `?escala=reduzida` em `/api/pdf/[setId]`, mais `/api/pdf/estrelas` para todas as coleções
juntas (rota estática antes da dinâmica, senão "estrelas" seria lido como um setId).

**As cartas usam `next/image` com `loading="eager"`.** Servir os JPEGs crus custava 6 MB por par
de páginas e ~13 s até a última pintar, mesmo em cache; com `sizes`, cai para 535 KB e 186 ms.
E `eager` porque só o par de páginas aberto é renderizado — toda carta no DOM já está na tela,
então lazy só atrasaria.

**Formatos de fichário são `colunas × linhas`** (`lib/types.ts`), na convenção impressa na
embalagem: `4x3` são 4 bolsos de largura por 3 de altura. A primeira versão invertia isso, e
nada quebrava porque a contagem de bolsos é a mesma nos dois sentidos — por isso
`tests/binder.test.ts` exige que a primeira linha de um 4×3 seja `001, 002, 003, 004`.

**As gravações de marcação são serializadas** (`enfileirar`, em `Binder.tsx`), e
isso não é capricho. A conta anônima nasce dentro do primeiro POST que chega sem
sessão (`requireUserId`, `lib/session.ts`). Dois toques quase juntos mandam dois
POSTs sem sessão, e **cada um cria a sua conta**: a última resposta grava o cookie
por cima da primeira e as cartas da conta perdedora somem da tela, sem erro
nenhum. Aconteceu de verdade — duas contas nascidas com 35 ms de diferença
(`01:00:04.228` e `01:00:04.263`), 55 cartas presas na que perdeu o cookie. Era
isso, e não cookie expirando, que fazia o fichário "perder tudo" ao voltar.

**O toque simples é adiado em 260 ms** (`CardSlot.tsx`) para poder ser cancelado pelo toque duplo.
Sem essa janela, o primeiro dos dois toques da marcação abriria a carta grande.

**`e.detail` vem 0 quando o clique não veio do mouse** — Enter/Espaço no botão focado ou
`.click()` por código. Sem o `e.detail || 1` em `CardSlot.tsx`, a ativação por teclado não
abre a carta.

**A folha que vira é medida, não estimada.** `medirFolha` lê a caixa da GRADE (não da página,
que tem um `px-5` assimétrico) e usa o centro das argolas como dobradiça. Com largura estimada
a carta mudava ~5 px por coluna e "pulava" no instante em que a folha sumia. `DURACAO_DA_VIRADA`
em `Binder.tsx` tem de bater com a animação `.folha-virando` do `globals.css`.

**Tema escuro precisa ser `:root` dentro do `@media`, não um segundo `@theme`.** O Tailwind 4
iça qualquer `@theme` para o topo, e a paleta escura passa a valer sempre.

## Decisões de design

- **Duas telas.** Tocar na coleção abre o fichário já montado em 3×3. O formato é um interruptor
  dentro da tela, com efeito imediato — não uma pergunta antes de mostrar qualquer coisa.
- **As promos são uma coleção, não um apêndice das outras.** Espalhá-las dentro de cada set
  quebraria o fichário físico, que segue a numeração impressa — e a promo não tem número dentro
  do set. Ela aparece como `mep` ("Promos Mega Evolution"), fechando a família na tela inicial.
  A coleção nasce **incompleta na origem**: das 89 promos catalogadas, só 40 têm arte publicada
  (conferido em 2026-08-23 — as outras 49 seguem dando 404 no CDN da tcgdex).
  As outras não entram no manifest (que reflete o disco), então o fichário não ganha bolso
  permanentemente vazio e "O que falta" ainda pode zerar. Repetir `download-cards.mjs` mais
  tarde só acrescenta. A capa não é pacote — promo não vem em pacote — e sim a carta mais
  reconhecível da coleção, montada por `tools/capa-promos.mjs`.
- **Ordem fixa por raridade**, sem opção: comuns primeiro, lendárias por último, número crescente
  dentro de cada raridade. É como o fichário é montado de verdade. `sortCards` ainda aceita
  `"number"` e é testada nos dois modos, mas a interface não oferece a escolha.
- **Quatro olhares sobre a coleção**, no interruptor do rodapé: `Total` (tudo, faltantes em cinza —
  é onde se faz a varredura e onde vive o "tenho todas"), `O que eu tenho`, `O que falta` (ambos
  compactados, sem buracos) e `★ Quero muito`. Os filtrados têm estado vazio próprio; "O que
  falta" vazio é o momento de comemoração do app.
- **Um toque abre a carta grande; dois marcam; três põem estrela.** Ver a arte é a parte divertida
  e ganha o gesto fácil; marcar é deliberado. O visualizador traz os dois botões equivalentes,
  para quem não acerta os gestos múltiplos.
- **A estrela substituiu o esconder, e inverte o sinal.** Era "não tenho e NÃO QUERO": a carta
  sumia do fichário, da conta das faltantes e do PDF. Agora é "QUERO MUITO": a carta continua
  no lugar, continua contando como faltante, e ganha folha própria. A tabela é a mesma — o
  `hidden_card` virou `starred_card` num rename, porque tinha zero linhas em produção: o esconder
  nunca foi usado por ninguém, o que já dizia que a marca útil era a outra. Estrela **não mexe na
  posse** (o esconder apagava): "já tenho" e "quero muito" são perguntas diferentes, e uma
  estrela conquistada é a melhor notícia do app, não uma contradição a resolver.
- **A lista de desejos vive na tela inicial**, acima das coleções, e só existe quando há estrela.
  É onde as estrelas de coleções diferentes ficam lado a lado — no fichário cada coleção é um
  mundo fechado, a vontade da criança não é. As já conquistadas continuam lá, com o visto verde;
  a folha impressa é só das que faltam, porque o recorte de uma carta que ele já tem não serve
  para nada.
- **Setas do teclado viram a página** (Home/End vão às pontas), e há setas na borda das páginas
  além da barra de baixo.
- **Marcação página a página**, espelhando o fichário físico aberto na mesa, com "tenho todas"
  por página. Sem isso, um set mediano exige julgar 188 cartas uma a uma.
- **As cartas são o colorido; a interface é silenciosa.** Neutros quentes e dois acentos, um por
  pergunta: verde (`--color-tenho`) responde "já tenho", dourado (`--color-estrela`) responde
  "quero muito". Não há um terceiro.
- **Sem drag-and-drop** (as posições são derivadas). Reintroduzir é aditivo: uma tabela
  `slot_overrides` aplicada por cima de `generateSlots`, não uma reescrita.
- **Número de páginas é calculado**, nunca perguntado — o que elimina junto o caso "a coleção
  não cabe no fichário" do PRD §12.

## Não versionar

`assets/` está no `.gitignore` (830 MB, 4.589 JPGs). Para repovoar, ver
`.llm/spec-download-assets.md` §11. `data/*.db` também fica de fora.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
