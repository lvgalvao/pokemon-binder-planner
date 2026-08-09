-- rls_auto_enable() e a event trigger `ensure_rls` do Supabase: liga RLS sozinha
-- em toda tabela nova de public. Ela e SECURITY DEFINER e o Postgres da EXECUTE
-- a PUBLIC por padrao em toda funcao nova, o que faz o linter marca-la como
-- endpoint publico.
--
-- Na pratica ela nao e exploravel: chamar direto devolve 0A000 "trigger functions
-- can only be called as triggers". Mas o grant nao serve para nada — o mecanismo
-- de event trigger nao consulta EXECUTE — entao revogar e de graca. Verificado
-- depois do revoke que `create table` continua ligando RLS sozinho.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
