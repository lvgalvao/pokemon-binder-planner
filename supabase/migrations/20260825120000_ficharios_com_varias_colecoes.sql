-- Um fichario que junta varias colecoes numa sequencia so.
--
-- E o fichario fisico como ele existe na mesa: a crianca nao guarda uma pasta
-- por colecao, ela guarda "o fichario do Mega" com Mega Evolution, Ascended
-- Heroes e Mega Evolution 2 uma depois da outra. Ate aqui o app so sabia abrir
-- uma colecao por vez, e a sequencia real nao tinha onde existir.
--
-- Guarda so a MONTAGEM: quais colecoes, em que ordem, com que formato de folha.
-- Posse e estrela continuam em owned_card/starred_card, chaveadas por set_id —
-- desfazer o agrupamento nao pode custar uma carta marcada, e nao custa: as
-- cartas nunca foram do fichario, sempre foram da colecao.
create table public.binder_group (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  nome       text        not null check (length(trim(nome)) between 1 and 60),
  -- A ORDEM do array e a ordem das colecoes no fichario, e por isso e array e
  -- nao tabela de ligacao: a sequencia e o dado, e uma tabela filha exigiria uma
  -- coluna de posicao para reconstruir exatamente o que o array ja guarda.
  set_ids    text[]      not null check (
                           array_length(set_ids, 1) between 2 and 12
                           and array_position(set_ids, null) is null
                         ),
  rows       smallint    not null default 3,
  columns    smallint    not null default 3,
  sort_rule  text        not null default 'number' check (sort_rule in ('number', 'rarity')),
  created_at timestamptz not null default now()
);

-- A tela inicial lista os ficharios do usuario a cada visita.
create index binder_group_user_idx on public.binder_group (user_id, created_at);

-- ---------------------------------------------------------------- RLS
--
-- Mesmo desenho das outras tres tabelas: predicado de posse, `to authenticated`
-- nunca sozinho, e `(select auth.uid())` embrulhado para o planner avaliar uma
-- vez por consulta em vez de uma vez por linha.
alter table public.binder_group enable row level security;

create policy "dono le os ficharios" on public.binder_group
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono monta fichario" on public.binder_group
  for insert to authenticated with check ((select auth.uid()) = user_id);
-- using E with check: so o using deixaria reatribuir user_id para outra pessoa.
create policy "dono altera o fichario montado" on public.binder_group
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "dono desfaz o fichario" on public.binder_group
  for delete to authenticated using ((select auth.uid()) = user_id);
