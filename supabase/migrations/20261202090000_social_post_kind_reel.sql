-- Reel na fila do Instagram (E3.6, extensão de 10/11/2026): o tipo novo.
--
-- Fica sozinho nesta migration porque o Postgres não deixa usar um valor de enum na mesma
-- transação que o criou. As regras do reel estão na seguinte, 20261202090500_social_post_reel.sql.

alter type public.social_post_kind add value if not exists 'reel';
