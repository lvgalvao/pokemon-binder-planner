-- O fichario arrumado a mao.
--
-- Ate aqui toda posicao era DERIVADA (sortCards -> expandirVariantes ->
-- generateSlots) e nada de posicao era gravado. Isso deu o fichario que se monta
-- sozinho, mas fechava a porta para a unica coisa que a crianca faz de verdade
-- com um fichario fisico: arrumar do jeito dela. Trocar duas cartas de lugar.
-- Deixar um bolso reservado para a que ainda vai chegar.
--
-- Guarda so o ARRANJO. Posse e estrela continuam em owned_card/starred_card,
-- chaveadas por itemKey e nao por posicao — mover uma carta nao pode custar uma
-- marcacao, e nao custa: elas nunca souberam onde a carta estava.

-- A rede de seguranca do invariante que lib/arranjo.ts mantem: a mesma chave
-- nunca ocupa dois bolsos. Nao e regra arbitraria — duas posicoes com a mesma
-- chave fariam UMA marcacao acender as duas, e desmarcar uma apagaria a outra.
-- O cliente ja garante isso; aqui a garantia sobrevive a um bug de cliente.
create function public.arranjo_sem_duplicata(bolsos text[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select count(*) = count(distinct b)
  from unnest(bolsos) as b
  where b is not null
$$;

create table public.binder_arranjo (
  user_id  uuid not null references auth.users (id) on delete cascade,

  -- Duas colunas em vez de um par alvo_tipo/alvo generico: o `on delete cascade`
  -- sai de graca, e desfazer o fichario montado nao deixa arranjo orfao atras.
  set_id   text null,
  group_id uuid null references public.binder_group (id) on delete cascade,

  -- O arranjo e de UM formato de folha, e por isso o formato entra na chave.
  -- Uma folha de 4 bolsos e outra folha: reflowar um arranjo de 3x3 para 4x3
  -- preserva o dado e destroi o desenho (a pagina de 9 vira os 9 primeiros de
  -- uma de 12). Assim, trocar de formato recongela do automatico e VOLTAR
  -- restaura o que ele arrumou. No maximo 4 linhas por fichario — sao 4 formatos.
  rows     smallint not null,
  columns  smallint not null,

  -- A ORDEM e o dado, e por isso e array e nao tabela de ligacao: uma tabela
  -- filha exigiria uma coluna de posicao para reconstruir o que o array ja
  -- guarda. NULL dentro do array = bolso vazio de proposito.
  bolsos   text[] not null,

  -- As que ele TIROU do fichario. Sem esta coluna a reconciliacao nao teria como
  -- distinguir "tirei de proposito" de "nunca esteve", e devolveria a carta no
  -- fim do fichario a cada leitura.
  fora     text[] not null default '{}',

  -- A carta na mao. Gravada, e nao so estado de tela: entre um gesto e o
  -- seguinte ela nao esta em `bolsos` nem em `fora`, e sem isto recarregar no
  -- meio de uma troca faria a reconciliacao le-la como "nunca esteve" e
  -- teleporta-la para o fim do fichario.
  mao      text null,

  atualizado_em timestamptz not null default now(),

  -- Um alvo e um so: a colecao aberta, ou o fichario montado.
  constraint binder_arranjo_um_alvo check (num_nonnulls(set_id, group_id) = 1),
  -- As 27 colecoes somam 7.735 bolsos; um fichario de 12 chega a 4.960. O teto
  -- existe para o estouro aparecer como recusa em vez de dado truncado calado.
  constraint binder_arranjo_tamanho check (coalesce(array_length(bolsos, 1), 0) <= 8000),
  constraint binder_arranjo_sem_duplicata check (public.arranjo_sem_duplicata(bolsos))
);

-- Um arranjo por alvo e por formato de folha. Indices parciais porque a coluna
-- do outro alvo e sempre NULL, e um unique comum trataria dois NULLs como
-- distintos — deixando passar duas linhas para o mesmo fichario.
create unique index binder_arranjo_colecao_idx
  on public.binder_arranjo (user_id, set_id, rows, columns)
  where set_id is not null;
create unique index binder_arranjo_montado_idx
  on public.binder_arranjo (user_id, group_id, rows, columns)
  where group_id is not null;

-- A tela inicial pergunta quais ficharios estao arrumados a mao.
create index binder_arranjo_user_idx on public.binder_arranjo (user_id);

-- ---------------------------------------------------------------- RLS
--
-- Mesmo desenho das outras tabelas: predicado de posse, `to authenticated` nunca
-- sozinho, e `(select auth.uid())` embrulhado para o planner avaliar uma vez por
-- consulta em vez de uma vez por linha.
alter table public.binder_arranjo enable row level security;

create policy "dono le o arranjo" on public.binder_arranjo
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono arruma o fichario" on public.binder_arranjo
  for insert to authenticated with check ((select auth.uid()) = user_id);
-- using E with check: so o using deixaria reatribuir user_id para outra pessoa.
create policy "dono muda o arranjo" on public.binder_arranjo
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "dono volta ao automatico" on public.binder_arranjo
  for delete to authenticated using ((select auth.uid()) = user_id);
