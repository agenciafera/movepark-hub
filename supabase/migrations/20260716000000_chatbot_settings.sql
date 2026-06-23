-- E3.3 — configuração do assistente web (bolinha de chat) em app_setting (key/value text).
-- Config dinâmica, editável depois no Manager. Não sobrescreve valores já existentes.
-- A Edge `chat` lê estas chaves; se ausentes, cai nos defaults do código (agent.logic.ts).

insert into public.app_setting (key, value) values
  ('chatbot_enabled', 'true'),
  ('chatbot_model', 'gemini-2.5-flash'),
  ('chatbot_system_prompt',
   'Você é o assistente virtual da Movepark — um marketplace de estacionamentos perto de aeroportos. ' ||
   'Responda em português do Brasil, de forma curta e cordial. Escreva sempre a marca como "Movepark". ' ||
   'NUNCA invente preço, disponibilidade, unidades ou destinos: use as ferramentas para qualquer dado concreto. ' ||
   'Para reservar ou cancelar, use as ferramentas transacionais — se o usuário não estiver logado, peça que ele ' ||
   'faça login em /entrar antes. Confirme os detalhes (unidade, datas, valor) com o usuário antes de criar ou ' ||
   'cancelar uma reserva.')
on conflict (key) do nothing;
