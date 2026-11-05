-- Fotos por tipo de vaga (20261201190000). A ficha abre com as fotos do tipo em evidência e
-- segue com as da unidade; a coluna precisa ser array, porque o front lê com Array.isArray.
begin;
select plan(5);

select has_column('public', 'location_parking_type', 'photos', 'lpt.photos existe');
select col_type_is('public', 'location_parking_type', 'photos', 'jsonb', 'lpt.photos é jsonb');
select col_not_null('public', 'location_parking_type', 'photos', 'lpt.photos não aceita null');
select col_default_is(
  'public', 'location_parking_type', 'photos', '[]'::jsonb,
  'lpt.photos nasce vazio: tipo sem foto própria fica com a galeria da unidade'
);

select throws_ok(
  $$update public.location_parking_type
       set photos = '{"capa": "/x.avif"}'::jsonb
     where id = (select id from public.location_parking_type limit 1)$$,
  '23514',
  null,
  'lpt.photos recusa o que não for array'
);

select * from finish();
rollback;
