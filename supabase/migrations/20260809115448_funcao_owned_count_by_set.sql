-- Quantas cartas o usuario tem em cada colecao — o subtitulo de cada capa na
-- tela inicial.
--
-- Existe como funcao porque o PostgREST nao faz `group by`, e a alternativa
-- seria trazer as ate 4.589 linhas do usuario para contar no Node — o que
-- ainda esbarraria no teto de 1.000 linhas por resposta.
--
-- SECURITY INVOKER (o padrao, explicito aqui por ser o ponto): roda com os
-- privilegios de quem chama, entao a RLS de owned_card continua valendo e o
-- filtro por auth.uid() e defesa em profundidade, nao a unica barreira.
--
-- `set search_path = ''` com nomes qualificados: sem isso, um search_path
-- manipulado poderia apontar `owned_card` para outra tabela.
create function public.owned_count_by_set()
returns table (set_id text, n bigint)
language sql
security invoker
stable
set search_path = ''
as $$
  select o.set_id, count(*)
    from public.owned_card o
   where o.user_id = (select auth.uid())
   group by o.set_id;
$$;

-- O Postgres da EXECUTE a PUBLIC por padrao. Aqui so faz sentido para quem tem
-- sessao — anon receberia sempre vazio, entao e ruido na superficie da API.
revoke execute on function public.owned_count_by_set() from public, anon;
grant execute on function public.owned_count_by_set() to authenticated;
