
[Documentação oficial da Pokémon TCG API](https://docs.pokemontcg.io/?utm_source=chatgpt.com)

# PRD Técnico — Pokémon Binder Planner

## 1. Visão do produto

Construir uma aplicação web para **planejar, organizar e acompanhar coleções de Pokémon TCG dentro de um binder físico**.

O usuário seleciona uma coleção oficial de Pokémon TCG e o sistema:

1. importa todas as cartas da coleção;
2. baixa/cacheia suas imagens;
3. cria automaticamente um layout de binder;
4. permite visualizar o binder página por página;
5. permite reorganizar manualmente as cartas;
6. permite marcar quais cartas o usuário já possui;
7. identifica automaticamente as cartas faltantes;
8. gera uma lista de compras;
9. permite imprimir a lista;
10. permite gerar futuramente placeholders das cartas faltantes no tamanho físico aproximado da carta Pokémon.

### Objetivo principal

Transformar:

> **“Tenho uma coleção de Pokémon e quero completar meu binder.”**

em:

> **“Escolho a coleção → o sistema monta meu binder → organizo → marco o que tenho → descubro o que falta → imprimo minha lista.”**

---

# 2. Escopo do MVP

### Entram no MVP

* catálogo de coleções;
* integração com Pokémon TCG API;
* importação de cartas;
* armazenamento local das informações;
* criação de binder;
* binder 3×3;
* binder 4×3;
* quantidade de páginas configurável;
* organização automática;
* ordenação por número oficial;
* visualização das páginas;
* navegação entre páginas;
* drag-and-drop para troca de cartas;
* troca manual entre posições;
* marcação `Tenho / Não tenho`;
* dashboard de progresso;
* lista de cartas faltantes;
* lista de compras;
* impressão A4;
* persistência dos dados.

### Fora do MVP

Não implementar inicialmente:

* múltiplas coleções dentro do mesmo binder;
* marketplace;
* preços das cartas;
* integração com lojas;
* scanner de cartas;
* reconhecimento por câmera;
* condição da carta;
* localização física da carta;
* controle de cartas repetidas;
* usuários sociais;
* compartilhamento público;
* sincronização entre dispositivos.

Esses recursos podem entrar posteriormente.

---

# 3. Conceito principal

O sistema possui três conceitos diferentes:

### Coleção

É o conjunto oficial de cartas obtido da API.

Exemplo:

```text
Mega Evolution
```

Contém:

```text
001
002
003
...
200
```

### Binder

É a representação virtual do fichário físico.

Exemplo:

```text
Binder
Formato: 4 × 3
Páginas: 20
Slots: 240
Coleção: Mega Evolution
```

### Carta

É uma carta pertencente à coleção.

Exemplo:

```text
ID: x1-001
Número: 001
Nome: Pokémon X
Imagem: ...
```

---

# 4. Fonte de dados

Utilizar a **Pokémon TCG API v2** como fonte oficial dos dados das cartas e coleções.

A API possui:

```http
GET /v2/sets
```

para consultar coleções e:

```http
GET /v2/cards
```

para consultar cartas. Os objetos retornam informações como `id`, `name`, `number`, `set`, `rarity` e `images`. ([Pokémon TCG API Docs][1])

A API também possui `printedTotal` e `total` no objeto de coleção. Isso é importante porque algumas coleções possuem cartas secretas além do número originalmente impresso na coleção. ([Pokémon TCG API Docs][2])

### Regra do MVP

Utilizar as cartas retornadas pela API pertencentes ao `set.id` selecionado.

Não tentar inferir manualmente quais cartas pertencem à coleção.

---

# 5. Arquitetura recomendada

Para o MVP, utilizar uma arquitetura web simples:

```text
Frontend
   ↓
Backend/API
   ↓
Database
   ↓
Pokémon TCG API
```

### Stack sugerida

Se o projeto ainda não possui stack definida:

**Frontend**

* Next.js
* React
* TypeScript
* Tailwind CSS

**Backend**

* Next.js API Routes / Server Actions

**Banco**

* PostgreSQL
* Prisma ORM

**Storage**

* S3-compatible storage ou storage da plataforma utilizada.

**Deploy**

* plataforma compatível com Next.js.

Se o ambiente já possui uma stack definida, **não trocar a stack sem necessidade**.

---

# 6. Modelo de dados

## `sets`

```text
id
external_id
name
series
printed_total
total
release_date
symbol_url
logo_url
created_at
updated_at
```

`external_id` deve guardar o ID da API.

Exemplo:

```text
external_id = "sv8pt5"
```

---

## `cards`

```text
id
external_id
set_id
number
name
rarity
supertype
image_small_url
image_large_url
created_at
updated_at
```

Relacionamento:

```text
Set 1 ───── N Cards
```

### Importante

Não utilizar o número da carta como chave primária.

A chave deve ser o `external_id`, porque existem diferentes sets que podem possuir uma carta com o mesmo número.

---

# 7. Binder

Tabela:

```text
binders
```

Campos:

```text
id
name
set_id
layout
rows
columns
page_count
created_at
updated_at
```

Exemplo:

```json
{
  "name": "Mega Evolution",
  "layout": "4x3",
  "rows": 4,
  "columns": 3,
  "pageCount": 20
}
```

---

# 8. Slots do binder

Tabela:

```text
binder_slots
```

Campos:

```text
id
binder_id
page_number
slot_index
card_id
position_locked
created_at
updated_at
```

Exemplo:

```text
Binder
 ├── Página 1
 │    ├── Slot 1 → Carta 001
 │    ├── Slot 2 → Carta 002
 │    ├── Slot 3 → Carta 003
 │    └── ...
 ├── Página 2
 │    └── ...
```

### Regra

`slot_index` começa em 0 ou 1, mas deve ser consistente em todo o sistema.

Recomendação:

```text
1 → primeiro slot
2 → segundo slot
...
12 → último slot
```

---

# 9. Coleção física do usuário

Criar tabela:

```text
collection_cards
```

Campos:

```text
id
binder_id
card_id
owned
created_at
updated_at
```

No MVP:

```text
owned = true
owned = false
```

Isso permite separar:

**posição no binder**

de:

**posse física da carta**.

Essa separação é importante.

Uma carta pode estar na posição 25 do binder e ainda estar marcada como `Não tenho`.

---

# 10. Regra de criação automática

Quando o usuário selecionar:

```text
Mega Evolution
```

e criar:

```text
Binder 4 × 3
20 páginas
```

o sistema deverá:

### Passo 1

Buscar todas as cartas da coleção.

### Passo 2

Ordenar pela numeração oficial.

A ordenação precisa tratar números como strings.

Exemplo:

```text
001
002
003
...
010
011
...
100
```

Não fazer simplesmente uma ordenação alfabética.

### Passo 3

Distribuir sequencialmente:

```text
Carta 001 → Slot 1
Carta 002 → Slot 2
Carta 003 → Slot 3
...
```

### Passo 4

Quando uma página estiver cheia:

```text
Página 1 → 001–012
Página 2 → 013–024
Página 3 → 025–036
```

E assim por diante.

---

# 11. Capacidade do binder

Fórmula:

```text
slotsPorPagina = rows × columns

capacidadeTotal =
rows × columns × pageCount
```

### Binder 4×3

```text
4 × 3 = 12 cartas/página
```

20 páginas:

```text
12 × 20 = 240 cartas
```

### Binder 3×3

```text
3 × 3 = 9 cartas/página
```

20 páginas:

```text
9 × 20 = 180 cartas
```

O sistema deve calcular isso dinamicamente.

---

# 12. Caso a coleção seja maior que o binder

Exemplo:

```text
Coleção: 200 cartas
Binder: 3×3
20 páginas
Capacidade: 180
```

O sistema **não deve apagar cartas**.

Deve mostrar:

> ⚠️ Este binder possui 180 espaços, mas a coleção possui 200 cartas.

E oferecer:

```text
Aumentar páginas
```

ou

```text
Continuar mesmo assim
```

Se o usuário continuar, as cartas excedentes ficam em uma área:

> **Cartas não posicionadas**

Exemplo:

```text
Cartas não posicionadas
181
182
183
...
200
```

---

# 13. Interface principal

Criar uma interface visual que represente um binder real.

### Header

```text
← Coleções

Mega Evolution

[4 × 3] [20 páginas]

Progresso
████████░░ 78%

156 / 200 cartas
```

---

# 14. Visualização do binder

A tela principal deve mostrar duas páginas abertas simultaneamente, simulando um binder físico.

Exemplo:

```text
┌─────────────────────┬─────────────────────┐
│                     │                     │
│  001  002  003      │  013  014  015      │
│  004  005  006      │  016  017  018      │
│  007  008  009      │  019  020  021      │
│  010  011  012      │  022  023  024      │
│                     │                     │
└─────────────────────┴─────────────────────┘

        Página 1        Página 2
```

Para binder 3×3:

```text
001 002 003
004 005 006
007 008 009
```

---

# 15. Navegação

Adicionar:

```text
← Página anterior
Página 3 / 20
Próxima página →
```

Também permitir:

```text
Ir para página [10]
```

---

# 16. Carta

Cada carta deve aparecer com sua imagem.

Usar inicialmente:

```text
images.large
```

para a visualização do binder.

A API disponibiliza imagens `small` e `large`. ([Pokémon TCG API Docs][3])

Para thumbnails, utilizar:

```text
images.small
```

para reduzir consumo de banda.

---

# 17. Interação manual

O usuário deve conseguir mover cartas.

### Exemplo

Arrastar:

```text
001
```

para:

```text
005
```

Resultado:

```text
001 ↔ 005
```

### Regra

O sistema deve **trocar as posições**, e não simplesmente sobrescrever a carta.

Isso evita perda acidental.

---

# 18. Alternativa para troca manual

Ao clicar em uma carta:

```text
Carta #001
```

abrir menu:

```text
Mover carta

Escolher posição:

Página: [3]
Slot: [7]

[Confirmar]
```

Isso atende usuários que não utilizam drag-and-drop facilmente.

---

# 19. Regras de organização

Criar uma camada de regras.

No MVP, implementar:

### Regra 1 — Ordem oficial

```text
number ASC
```

Essa é a regra padrão.

Arquitetar o código para futuramente suportar:

```text
Organizar por número
Organizar por nome
Organizar por tipo
Organizar por Pokémon
Organizar por raridade
```

Mas **não implementar essas regras adicionais agora**.

---

# 20. Reset da organização

Adicionar:

```text
Reorganizar automaticamente
```

Antes de executar:

> Isso irá reorganizar as cartas seguindo a ordem oficial da coleção. Suas alterações manuais serão perdidas.

Botões:

```text
Cancelar
Reorganizar
```

---

# 21. Modo coleção física

Adicionar uma ação:

```text
Minha coleção
```

Nesse modo, cada carta possui um checkbox:

```text
☑ Tenho
```

ou:

```text
☐ Não tenho
```

Ao marcar:

```text
owned = true
```

---

# 22. Indicadores visuais

No binder, cartas que o usuário possui podem aparecer normalmente.

Cartas que faltam devem ter um indicador discreto:

```text
┌─────────────┐
│             │
│    CARTA    │
│             │
│ ⚠ FALTA     │
└─────────────┘
```

Não esconder a imagem da carta.

O objetivo é o usuário conseguir visualizar **como o binder ficará quando completo**.

---

# 23. Dashboard da coleção

Exibir:

```text
Mega Evolution

200 cartas na coleção

156 cartas possuídas
44 cartas faltantes

78% completa
```

Também:

```text
[Ver binder]

[Ver cartas faltantes]

[Lista de compras]

[Imprimir]
```

---

# 24. Lista de cartas faltantes

Tela:

```text
Cartas faltantes

44 cartas

☐ #017 — Nome
☐ #023 — Nome
☐ #034 — Nome
☐ #041 — Nome
...
```

Permitir:

```text
Buscar carta
```

e:

```text
Filtrar por número
```

---

# 25. Lista de compras

A lista deve ser gerada automaticamente a partir de:

```text
owned = false
```

Não criar uma segunda fonte de verdade.

Exemplo:

```text
LISTA DE COMPRAS
Mega Evolution

44 cartas faltantes

#017 — Pokémon X
#023 — Pokémon Y
#034 — Pokémon Z

Total: 44 cartas
```

---

# 26. Impressão

Criar uma versão específica para impressão.

Endpoint/rota:

```text
/collections/:id/print
```

CSS:

```css
@media print
```

A página deve remover:

* menu;
* botões;
* navegação;
* elementos interativos;
* backgrounds desnecessários.

E mostrar apenas a lista.

---

# 27. Formato A4

Configurar:

```css
@page {
  size: A4;
  margin: 12mm;
}
```

A lista deve ser otimizada para:

* A4;
* impressão doméstica;
* preto e branco;
* leitura fácil.

---

# 28. Placeholder físico

Preparar arquitetura para:

```text
Imprimir cartas faltantes
```

A aplicação deve gerar uma página A4 contendo representações das cartas faltantes.

Cada placeholder deverá manter a **proporção de uma carta Pokémon**.

Importante:

**não redimensionar a imagem de forma que distorça a proporção.**

Adicionar futuramente opção:

```text
☐ Mostrar nome
☐ Mostrar número
☐ Mostrar imagem
```

No MVP, pode simplesmente gerar:

```text
imagem
número
nome
```

---

# 29. Sincronização com API

Criar um serviço:

```text
PokemonTcgService
```

Responsabilidades:

```text
getSets()
getSet(id)
getCardsBySet(id)
getCard(id)
```

Nunca chamar a API diretamente de componentes React.

Fluxo:

```text
React
 ↓
Backend
 ↓
PokemonTcgService
 ↓
Pokémon TCG API
```

A API suporta paginação e `pageSize` de até 250, portanto o serviço deve tratar corretamente respostas paginadas. ([Pokémon TCG API Docs][1])

---

# 30. Cache da API

Não consultar a API toda vez que o usuário abrir o binder.

Fluxo:

```text
Usuário seleciona coleção
        ↓
Existe no banco?
        ↓
SIM ───────→ utilizar banco
        ↓
NÃO
        ↓
Consultar API
        ↓
Salvar Set
        ↓
Salvar Cards
        ↓
Criar Binder
```

---

# 31. Sincronização

Adicionar futuramente:

```text
Atualizar coleção
```

O sistema pode consultar novamente a API e verificar se houve alterações.

Não sobrescrever:

* posição do binder;
* `owned`;
* customizações do usuário.

A sincronização deve atualizar somente os dados externos da carta.

---

# 32. API key

A chave da Pokémon TCG API deve ficar exclusivamente no servidor.

Nunca:

```text
NEXT_PUBLIC_POKEMON_API_KEY
```

Nunca colocar a chave:

* no frontend;
* em JavaScript enviado ao navegador;
* no GitHub;
* em arquivos públicos.

A própria documentação alerta que a API key deve ser mantida segura e enviada pelo header `X-Api-Key`. ([Pokémon TCG API Docs][4])

Usar:

```env
POKEMON_TCG_API_KEY=
DATABASE_URL=
```

---

# 33. Tratamento de erros

Tratar:

### API indisponível

Mostrar:

> Não conseguimos carregar essa coleção agora. Tente novamente.

### Rate limit

A API pode retornar:

```text
429 Too Many Requests
```

e isso deve ser tratado explicitamente. ([Pokémon TCG API Docs][5])

Mensagem:

> Estamos recebendo muitas solicitações. Aguarde alguns segundos e tente novamente.

### Set inexistente

```text
Coleção não encontrada.
```

### Imagem indisponível

Mostrar placeholder:

```text
Imagem indisponível
```

Sem quebrar o layout do binder.

---

# 34. Performance

O binder pode conter centenas de imagens.

Não carregar todas as imagens em alta resolução simultaneamente.

Implementar:

* thumbnails usando `small`;
* `large` apenas na visualização adequada;
* lazy loading;
* cache;
* otimização de imagens;
* skeleton loading.

---

# 35. Responsividade

O sistema precisa funcionar em:

* desktop;
* tablet;
* celular.

Porém, a prioridade de UX deve ser:

### Desktop/tablet

Porque o planejamento do binder funciona melhor em uma tela maior.

No celular:

```text
Página esquerda
↓
Página direita
```

pode ser exibida verticalmente ou através de swipe.

---

# 36. Estrutura de rotas

Sugestão:

```text
/
```

Dashboard.

```text
/sets
```

Lista de coleções.

```text
/sets/:setId
```

Detalhes da coleção.

```text
/binders
```

Binders criados.

```text
/binders/:binderId
```

Editor do binder.

```text
/binders/:binderId/collection
```

Modo coleção física.

```text
/binders/:binderId/missing
```

Cartas faltantes.

```text
/binders/:binderId/shopping-list
```

Lista de compras.

```text
/binders/:binderId/print
```

Impressão.

---

# 37. Fluxo principal do usuário

```text
ABRIR SISTEMA
      ↓
ESCOLHER COLEÇÃO
      ↓
"MEGA EVOLUTION"
      ↓
IMPORTAR CARTAS
      ↓
CRIAR BINDER
      ↓
3×3 ou 4×3
      ↓
ESCOLHER PÁGINAS
      ↓
ORGANIZAÇÃO AUTOMÁTICA
      ↓
VISUALIZAR BINDER
      ↓
FAZER AJUSTES MANUAIS
      ↓
SALVAR
      ↓
"MINHA COLEÇÃO"
      ↓
MARCAR CARTAS POSSUÍDAS
      ↓
SISTEMA CALCULA FALTANTES
      ↓
LISTA DE COMPRAS
      ↓
IMPRIMIR
```

---

# 38. Critérios de aceite

### Coleção

* [ ] Usuário consegue pesquisar uma coleção.
* [ ] Sistema mostra nome e logo.
* [ ] Sistema consegue importar todas as cartas.
* [ ] Cartas possuem número e imagem.
* [ ] Cartas são ordenadas corretamente.

### Binder

* [ ] Usuário consegue criar binder 3×3.
* [ ] Usuário consegue criar binder 4×3.
* [ ] Usuário consegue definir páginas.
* [ ] Sistema calcula capacidade.
* [ ] Sistema alerta quando a coleção não cabe.

### Organização

* [ ] Organização automática funciona.
* [ ] Ordem padrão é numérica.
* [ ] Usuário consegue trocar duas cartas.
* [ ] Usuário consegue mover carta manualmente.
* [ ] Alterações são persistidas.

### Coleção física

* [ ] Usuário consegue marcar carta como possuída.
* [ ] Estado é persistido.
* [ ] Progresso é calculado.
* [ ] Cartas faltantes são identificadas.

### Compras

* [ ] Lista é gerada automaticamente.
* [ ] Apenas cartas faltantes aparecem.
* [ ] Usuário consegue visualizar a lista.
* [ ] Lista pode ser impressa.

### Impressão

* [ ] Formato A4.
* [ ] Layout adequado para impressão.
* [ ] Botões não aparecem no papel.
* [ ] Lista permanece legível em preto e branco.

---

# 39. Testes

Criar testes unitários para:

```text
calculateBinderCapacity()
sortCardsByNumber()
generateSlots()
calculateMissingCards()
calculateCollectionProgress()
swapBinderSlots()
```

### Exemplo

```text
4 × 3 × 20 = 240
```

deve retornar:

```text
240
```

### Ordenação

Entrada:

```text
1
10
2
20
3
```

Resultado:

```text
1
2
3
10
20
```

### Faltantes

Entrada:

```text
001 owned
002 owned
003 not owned
004 owned
005 not owned
```

Resultado:

```text
003
005
```

---

# 40. Estrutura de componentes

Sugestão:

```text
components/
  binder/
    BinderViewer
    BinderPage
    BinderSlot
    BinderNavigation
    BinderToolbar
    BinderSettings

  cards/
    CardThumbnail
    CardPreview
    CardStatus

  collection/
    CollectionHeader
    CollectionProgress
    MissingCardsList
    ShoppingList

  print/
    PrintableShoppingList
    PrintableCardPlaceholder

  sets/
    SetSelector
    SetCard
    SetSearch
```

---

# 41. Princípio importante de arquitetura

**Separar completamente três coisas:**

```text
CARD
 ↓
dados oficiais da API

BINDER SLOT
 ↓
onde a carta está

OWNERSHIP
 ↓
se o usuário possui a carta
```

Não misturar esses conceitos.

Isso permitirá futuramente adicionar:

```text
quantidade
condição
duplicatas
carta em outro binder
carta para troca
preço
```

sem precisar refazer o sistema.

---

# 42. Roadmap

## MVP — V1

```text
API
↓
Coleções
↓
Cartas
↓
Binder
↓
3×3 / 4×3
↓
Organização automática
↓
Drag & drop
↓
Minha coleção
↓
Faltantes
↓
Lista de compras
↓
Impressão
```

## V2

```text
Vários binders
↓
Várias coleções no mesmo binder
↓
Regras avançadas
↓
Duplicatas
↓
Condição das cartas
↓
Filtros
```

## V3

```text
Scanner por câmera
↓
Reconhecimento automático
↓
Importação da coleção física
↓
Preços
↓
Lista de compras inteligente
↓
Marketplace
```

---

# 43. Prompt de implementação para o agente de código

Eu colocaria **esta parte diretamente no Cloud Code**, depois do PRD acima:

> **Implemente este projeto como uma aplicação web funcional, não apenas como um protótipo visual.**
>
> Antes de escrever código, analise o repositório existente e identifique a stack, estrutura, banco e padrões já utilizados. Não substitua tecnologias existentes sem necessidade.
>
> Implemente o MVP descrito neste PRD de forma incremental.
>
> Primeiro implemente:
>
> 1. integração com Pokémon TCG API;
> 2. persistência de sets e cards;
> 3. seleção de coleção;
> 4. criação de binder;
> 5. layouts 3×3 e 4×3;
> 6. cálculo de capacidade;
> 7. organização automática por número;
> 8. visualização do binder;
> 9. troca manual de cartas;
> 10. persistência das posições;
> 11. controle `owned`;
> 12. cálculo de progresso;
> 13. cartas faltantes;
> 14. lista de compras;
> 15. página de impressão A4.
>
> Não implemente funcionalidades fora do MVP sem necessidade.
>
> A aplicação deve possuir boa experiência visual, ser responsiva e representar visualmente um binder físico de Pokémon TCG.
>
> Todas as operações críticas devem possuir tratamento de erro.
>
> A integração com a Pokémon TCG API deve ocorrer exclusivamente no backend. Nunca exponha a API key no frontend.
>
> Crie testes para as funções de ordenação, cálculo de capacidade, criação de slots, troca de cartas e cálculo de cartas faltantes.
>
> Ao terminar cada etapa, valide a aplicação e corrija erros antes de avançar.
>
> **Não faça mock permanente dos dados da Pokémon TCG API.** Utilize a API real através de variável de ambiente.
>
> Se alguma decisão técnica não estiver especificada neste PRD, escolha a solução mais simples, robusta e consistente com a arquitetura existente.
>
> Não adicione autenticação, marketplace, preços, scanner ou funcionalidades sociais nesta primeira versão.

### Uma decisão que eu tomaria já

Eu **não começaria tentando fazer o sistema “inteligente” demais**. O coração do produto é muito simples e muito bom:

**coleção → binder → ordem → ajuste manual → tenho/não tenho → faltantes → impressão.**

Se essa experiência ficar extremamente boa, depois dá para colocar todas as outras camadas em cima dela. E a separação `Card → Slot → Ownership` que coloquei no PRD é justamente o que deixa o sistema preparado para evoluir sem precisar reconstruir o banco.

[1]: https://docs.pokemontcg.io/api-reference/sets/search-sets/?utm_source=chatgpt.com "Search sets | Pokémon TCG API Documentation"
[2]: https://docs.pokemontcg.io/api-reference/sets/set-object/?utm_source=chatgpt.com "The set object | Pokémon TCG API Documentation"
[3]: https://docs.pokemontcg.io/api-reference/cards/card-object/?utm_source=chatgpt.com "The card object | Pokémon TCG API Documentation"
[4]: https://docs.pokemontcg.io/getting-started/authentication/?utm_source=chatgpt.com "Authentication | Pokémon TCG API Documentation"
[5]: https://docs.pokemontcg.io/getting-started/errors/?utm_source=chatgpt.com "Errors | Pokémon TCG API Documentation"
