insert into public.parking_type (code, name, description) values
  ('covered',    'Vaga Coberta',     'Vaga em área coberta, protegida de intempéries'),
  ('uncovered',  'Vaga Descoberta',  'Vaga em área aberta, sem cobertura'),
  ('valet',      'Valet',            'Operação valet — manobrista recebe e entrega o veículo'),
  ('premium',    'Vaga Premium',     'Vaga premium / VIP, próxima ao embarque ou diferenciada'),
  ('garage',     'Garagem / Box',    'Garagem privativa ou box individual'),
  ('motorcycle', 'Vaga de Moto',     'Vaga dedicada a motocicletas')
on conflict (code) do nothing;
