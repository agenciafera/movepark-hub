-- Seed de catálogo/pricing extraído do banco vivo (sem dados de cliente/PII).

SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict 7Gn0pcrLTPNXDQS9iaNSvYGej7bvuOt3NezIuYMHeAaRePTNVRhkvxQhSpMgOT2

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: company; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."company" ("id", "name", "slug", "legal_name", "tax_id", "status", "created_at", "updated_at", "deleted_at", "onboarding_status", "logo_url") VALUES
	('8a4e2589-996c-4aef-a797-a5f3632eed82', 'Virapark', 'virapark', NULL, NULL, 'active', '2026-05-25 14:44:10.135186+00', '2026-06-03 17:27:57.689029+00', NULL, 'active', NULL),
	('2783dc63-0ece-47c9-aeeb-e7ea44e7c7dc', 'Garageinn', 'garageinn', NULL, NULL, 'active', '2026-05-25 14:44:10.135186+00', '2026-06-03 17:27:57.689029+00', NULL, 'active', NULL),
	('6a06f828-e756-4536-b40f-fd1d3d087fb1', 'Abbapark', 'abbapark', NULL, NULL, 'active', '2026-05-25 14:44:10.135186+00', '2026-06-03 17:27:57.689029+00', NULL, 'active', NULL),
	('5cbced79-070b-4a0c-8fef-e6f4f1e2558b', 'Nationpark', 'nationpark', NULL, NULL, 'active', '2026-05-25 14:44:10.135186+00', '2026-06-03 17:27:57.689029+00', NULL, 'active', NULL),
	('fee1f0d3-ac69-44a6-b7d9-fcbdf7a6a21a', 'Aerovalet', 'aerovalet', NULL, NULL, 'active', '2026-05-25 14:44:10.135186+00', '2026-06-03 17:27:57.689029+00', NULL, 'active', NULL),
	('48a7af0a-3a0e-4660-8acf-d4df7698e4f1', 'Plenty Park', 'plenty', NULL, NULL, 'active', '2026-05-25 14:44:10.135186+00', '2026-06-03 17:27:57.689029+00', NULL, 'active', NULL),
	('6a657ec9-6d65-4844-8483-1444ff67977f', 'Bandeirapark', 'bandeirapark', 'Bandeirapark Estacionamentos', NULL, 'active', '2026-05-25 14:44:10.135186+00', '2026-06-03 17:27:57.689029+00', NULL, 'active', NULL),
	('9d1db89a-adce-447d-abaf-5cd2274c7fc7', 'Airpark', 'airpark', 'Airpark Portugal', NULL, 'active', '2026-05-27 16:58:38.742614+00', '2026-06-03 17:27:57.689029+00', NULL, 'active', NULL),
	('e5fba2c7-fe29-45bf-a212-aef7f185554f', 'Ferapark', 'ferapark', 'Fera Park', NULL, 'active', '2026-05-27 16:58:38.742614+00', '2026-06-03 17:27:57.689029+00', NULL, 'active', NULL),
	('a73eec79-5c21-45fc-842f-58d552c93819', 'Moveparking', 'moveparking', 'Moveparking Estacionamentos', NULL, 'active', '2026-05-27 16:58:38.742614+00', '2026-06-03 17:27:57.689029+00', NULL, 'active', NULL),
	('f8f321cd-5265-4a6a-94f7-f1eae58d23a9', 'Nine', 'nine', 'Nine Estacionamentos', NULL, 'active', '2026-05-27 16:58:38.742614+00', '2026-06-03 17:27:57.689029+00', NULL, 'active', NULL),
	('e0b69229-08b9-4f67-9455-381f84649506', 'Redpark', 'redpark', 'Redpark Portugal', NULL, 'active', '2026-05-27 16:58:38.742614+00', '2026-06-03 17:27:57.689029+00', NULL, 'active', NULL),
	('55c3e046-ecac-4ead-99e1-483ecb2d3e6e', 'Skypark', 'skypark', 'Skypark Portugal', NULL, 'active', '2026-05-27 16:58:38.742614+00', '2026-06-03 17:27:57.689029+00', NULL, 'active', NULL),
	('eed2420f-b1b4-436f-9f3b-945415c898fb', 'KallefPark', 'kallefpark', NULL, '12312312321313', 'inactive', '2026-06-03 20:07:53.95096+00', '2026-06-08 13:59:23.037421+00', NULL, 'approved', NULL),
	('c54ce364-25c4-4c22-bbcd-1a97deb7715d', 'Go2Park Estacionamento', 'go2park-estacionamento', NULL, '17163995000104', 'inactive', '2026-06-08 13:51:51.325064+00', '2026-06-08 14:50:25.734145+00', NULL, 'approved', NULL);


--
-- Data for Name: add_on_service; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: amenity; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."amenity" ("code", "name", "description", "icon", "category", "sort_order") VALUES
	('cameras_24h', 'Câmeras 24h', 'Monitoramento por câmeras durante todo o tempo', 'Camera', 'security', 10),
	('on_site_24h', 'Atendimento 24 horas', 'Equipe presente 24/7', 'Clock', 'security', 20),
	('gated_access', 'Portaria controlada', 'Entrada controlada com porteiro ou cancela', 'ShieldCheck', 'security', 30),
	('insured', 'Estacionamento segurado', 'Seguro contra danos durante a estadia', 'Shield', 'security', 40),
	('shuttle_free', 'Transfer gratuito', 'Transporte gratuito até o terminal', 'Bus', 'service', 10),
	('valet', 'Valet', 'Manobrista recebe e entrega o veículo', 'KeyRound', 'service', 20),
	('self_park', 'Self-park', 'Você estaciona o veículo', 'Car', 'service', 30),
	('car_wash', 'Lavagem disponível', 'Serviço de lavagem mediante cobrança', 'Droplets', 'service', 40),
	('cover_protection', 'Capa de proteção', 'Cobre o veículo durante a estadia', 'Umbrella', 'service', 50),
	('battery_service', 'Manutenção de bateria', 'Aciona o motor periodicamente pra manter a carga', 'BatteryFull', 'service', 60),
	('motorcycle', 'Vagas para motos', 'Suporta motocicletas', 'Bike', 'access', 20),
	('pcd', 'Acessibilidade PCD', 'Vagas preferenciais para pessoas com deficiência', 'Accessibility', 'access', 30),
	('ev_charger', 'Carregador elétrico', 'Tomadas para veículos elétricos', 'Plug', 'access', 40),
	('walking_distance', 'Próximo ao terminal', 'Acesso a pé sem precisar de transfer', 'Footprints', 'access', 50),
	('restroom', 'Banheiros', 'Banheiros disponíveis para clientes', 'Toilet', 'extras', 10),
	('wifi', 'Wi-Fi gratuito', 'Internet sem fio na área de espera', 'Wifi', 'extras', 20),
	('lounge', 'Área de espera', 'Sala de estar climatizada', 'Sofa', 'extras', 30),
	('flight_insurance', 'Seguro voo', 'Cobertura para atraso ou cancelamento', 'PlaneTakeoff', 'extras', 40);


--
-- Data for Name: parking_type; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."parking_type" ("id", "code", "name", "description", "created_at", "updated_at") VALUES
	('b76d7767-72a8-43ee-8039-3a208b933ba8', 'covered', 'Vaga Coberta', 'Vaga em área coberta, protegida de intempéries', '2026-05-25 14:35:31.868846+00', '2026-05-25 14:35:31.868846+00'),
	('2a0e4481-fa03-409e-8093-076a77e2c1c6', 'uncovered', 'Vaga Descoberta', 'Vaga em área aberta, sem cobertura', '2026-05-25 14:35:31.868846+00', '2026-05-25 14:35:31.868846+00'),
	('c680867a-3dd4-4926-80df-f60b0a507ba2', 'valet', 'Valet', 'Operação valet — manobrista recebe e entrega o veículo', '2026-05-25 14:35:31.868846+00', '2026-05-25 14:35:31.868846+00'),
	('c0e95498-b3da-4951-ae96-bcc6246ea170', 'premium', 'Vaga Premium', 'Vaga premium / VIP, próxima ao embarque ou diferenciada', '2026-05-25 14:35:31.868846+00', '2026-05-25 14:35:31.868846+00'),
	('37b4a1e6-2559-4552-9dc3-6c127311d92b', 'garage', 'Garagem / Box', 'Garagem privativa ou box individual', '2026-05-25 14:35:31.868846+00', '2026-05-25 14:35:31.868846+00'),
	('19358bfb-5a45-4d10-8007-c9122cd2e0c4', 'motorcycle', 'Vaga de Moto', 'Vaga dedicada a motocicletas', '2026-05-25 14:35:31.868846+00', '2026-05-25 14:35:31.868846+00');


--
-- Data for Name: company_parking_type; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."company_parking_type" ("id", "company_id", "parking_type_id", "base_price", "default_capacity", "is_active", "created_at", "updated_at") VALUES
	('ba1f7cc3-b8ef-455f-9e83-a39603cc60f2', '9d1db89a-adce-447d-abaf-5cd2274c7fc7', 'b76d7767-72a8-43ee-8039-3a208b933ba8', 0.00, 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00'),
	('f878351e-5675-4f95-bd20-74aa67e52c7e', '9d1db89a-adce-447d-abaf-5cd2274c7fc7', '2a0e4481-fa03-409e-8093-076a77e2c1c6', 0.00, 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00'),
	('67038ffc-287d-40d0-aaf6-7d51305d5745', 'e5fba2c7-fe29-45bf-a212-aef7f185554f', 'b76d7767-72a8-43ee-8039-3a208b933ba8', 0.00, 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00'),
	('720976df-5712-4672-9f47-67a10b2747e1', 'e5fba2c7-fe29-45bf-a212-aef7f185554f', '2a0e4481-fa03-409e-8093-076a77e2c1c6', 0.00, 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00'),
	('43c065b5-6a64-4bb3-8e3a-65b76397a406', 'a73eec79-5c21-45fc-842f-58d552c93819', '2a0e4481-fa03-409e-8093-076a77e2c1c6', 0.00, 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00'),
	('059e47c4-9563-496b-bc66-fa16d6c340e9', 'a73eec79-5c21-45fc-842f-58d552c93819', '19358bfb-5a45-4d10-8007-c9122cd2e0c4', 0.00, 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00'),
	('4342ed56-1ced-4f7a-bd12-4d658da9a752', 'f8f321cd-5265-4a6a-94f7-f1eae58d23a9', 'b76d7767-72a8-43ee-8039-3a208b933ba8', 0.00, 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00'),
	('9b819287-7df0-4cae-a685-8f0e962e1f14', 'e0b69229-08b9-4f67-9455-381f84649506', 'b76d7767-72a8-43ee-8039-3a208b933ba8', 0.00, 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00'),
	('1cc072c7-1569-4d9a-bb45-1c99e6c49ac3', 'e0b69229-08b9-4f67-9455-381f84649506', '2a0e4481-fa03-409e-8093-076a77e2c1c6', 0.00, 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00'),
	('b9aa04d8-e77b-42e8-8acb-1d38d7e141f4', '55c3e046-ecac-4ead-99e1-483ecb2d3e6e', 'b76d7767-72a8-43ee-8039-3a208b933ba8', 0.00, 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00'),
	('029f3dc8-87ac-47fe-8cc0-7d85c8d70946', '55c3e046-ecac-4ead-99e1-483ecb2d3e6e', '2a0e4481-fa03-409e-8093-076a77e2c1c6', 0.00, 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00'),
	('e4586aab-2c54-4c32-bcdb-1292b077f275', '8a4e2589-996c-4aef-a797-a5f3632eed82', 'b76d7767-72a8-43ee-8039-3a208b933ba8', 0.00, 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00'),
	('69462a09-e46d-4fc3-af0f-29536426af95', '2783dc63-0ece-47c9-aeeb-e7ea44e7c7dc', '2a0e4481-fa03-409e-8093-076a77e2c1c6', 0.00, 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00'),
	('46e60435-2e37-48ea-9e49-ce12112a4deb', '6a657ec9-6d65-4844-8483-1444ff67977f', 'b76d7767-72a8-43ee-8039-3a208b933ba8', 0.00, 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00'),
	('edb3d56f-0244-4d6e-8c5e-8eaba8717987', '6a657ec9-6d65-4844-8483-1444ff67977f', '2a0e4481-fa03-409e-8093-076a77e2c1c6', 0.00, 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00'),
	('ff464343-3cfe-48c4-b5b4-76137c4a881f', '6a657ec9-6d65-4844-8483-1444ff67977f', 'c680867a-3dd4-4926-80df-f60b0a507ba2', 0.00, 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00'),
	('12a48c46-5004-4a9b-81d3-b53275ac64fb', '6a06f828-e756-4536-b40f-fd1d3d087fb1', 'b76d7767-72a8-43ee-8039-3a208b933ba8', 0.00, 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00'),
	('6b73473f-6c11-4a57-9cc3-397b31b5795d', '6a06f828-e756-4536-b40f-fd1d3d087fb1', '2a0e4481-fa03-409e-8093-076a77e2c1c6', 0.00, 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00'),
	('2dc69bb5-b257-4e3b-aa84-24137fd105f9', '6a06f828-e756-4536-b40f-fd1d3d087fb1', 'c0e95498-b3da-4951-ae96-bcc6246ea170', 0.00, 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00'),
	('c696b0d8-d9a6-4b20-90c2-cd93eb8a07af', '5cbced79-070b-4a0c-8fef-e6f4f1e2558b', 'b76d7767-72a8-43ee-8039-3a208b933ba8', 0.00, 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00'),
	('eddad237-7193-441f-bf49-7f72cda1489e', '5cbced79-070b-4a0c-8fef-e6f4f1e2558b', '2a0e4481-fa03-409e-8093-076a77e2c1c6', 0.00, 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00'),
	('f7b88e51-6e30-4ea4-866e-a4a55a02754c', '5cbced79-070b-4a0c-8fef-e6f4f1e2558b', 'c0e95498-b3da-4951-ae96-bcc6246ea170', 0.00, 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00'),
	('f59e2eb9-5a21-40dd-8566-efc38d9cf517', 'fee1f0d3-ac69-44a6-b7d9-fcbdf7a6a21a', 'b76d7767-72a8-43ee-8039-3a208b933ba8', 0.00, 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00'),
	('bb95148f-e7da-4570-90fa-cab91cb66f17', 'fee1f0d3-ac69-44a6-b7d9-fcbdf7a6a21a', '2a0e4481-fa03-409e-8093-076a77e2c1c6', 0.00, 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00'),
	('eee4060d-291f-49b2-ad46-d8e374c18e6d', 'fee1f0d3-ac69-44a6-b7d9-fcbdf7a6a21a', 'c680867a-3dd4-4926-80df-f60b0a507ba2', 0.00, 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00'),
	('53079988-429e-4c7e-95c2-8e9b1ee64698', '48a7af0a-3a0e-4660-8acf-d4df7698e4f1', 'b76d7767-72a8-43ee-8039-3a208b933ba8', 0.00, 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00');


--
-- Data for Name: coupon; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: destination; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."destination" ("id", "code", "name", "slug", "short_name", "type", "city", "state", "country", "latitude", "longitude", "is_popular", "sort_order", "created_at", "updated_at") VALUES
	('3a572f42-24ee-4aa8-b209-afada25d14ec', 'GRU', 'Aeroporto Internacional de São Paulo–Guarulhos', 'aeroporto-internacional-de-sao-paulo-guarulhos', 'Guarulhos (GRU)', 'airport', 'Guarulhos', 'SP', 'BR', -23.4356, -46.4731, true, 10, '2026-05-28 18:31:15.592092+00', '2026-05-28 18:31:15.592092+00'),
	('ede0de4e-bdc9-4c36-96c8-a7a9e72a4edc', 'CGH', 'Aeroporto de Congonhas', 'aeroporto-de-congonhas', 'Congonhas (CGH)', 'airport', 'São Paulo', 'SP', 'BR', -23.6261, -46.6564, true, 20, '2026-05-28 18:31:15.592092+00', '2026-05-28 18:31:15.592092+00'),
	('da58673f-5dfd-4130-999b-5c987f353330', 'VCP', 'Aeroporto de Viracopos', 'aeroporto-de-viracopos', 'Viracopos (VCP)', 'airport', 'Campinas', 'SP', 'BR', -23.0072, -47.1346, true, 30, '2026-05-28 18:31:15.592092+00', '2026-05-28 18:31:15.592092+00'),
	('3b386587-5fa0-45a1-b2b5-c7ebc71ea1c6', 'SDU', 'Aeroporto Santos Dumont', 'aeroporto-santos-dumont', 'Santos Dumont (SDU)', 'airport', 'Rio de Janeiro', 'RJ', 'BR', -22.9106, -43.1633, false, 40, '2026-05-28 18:31:15.592092+00', '2026-05-28 18:31:15.592092+00'),
	('cdf91ad4-91b5-425d-9709-131e7421d2b2', 'GIG', 'Aeroporto do Galeão', 'aeroporto-do-galeao', 'Galeão (GIG)', 'airport', 'Rio de Janeiro', 'RJ', 'BR', -22.8089, -43.2436, false, 50, '2026-05-28 18:31:15.592092+00', '2026-05-28 18:31:15.592092+00'),
	('c07e27e1-09d7-4499-afeb-fa84671ced3c', 'CWB', 'Aeroporto Afonso Pena', 'aeroporto-afonso-pena', 'Afonso Pena (CWB)', 'airport', 'Curitiba', 'PR', 'BR', -25.5285, -49.1758, true, 60, '2026-05-28 18:31:15.592092+00', '2026-05-28 18:31:15.592092+00'),
	('0310460e-a00f-4895-8e4c-a23f06e639e3', 'BSB', 'Aeroporto de Brasília', 'aeroporto-de-brasilia', 'Brasília (BSB)', 'airport', 'Brasília', 'DF', 'BR', -15.8697, -47.9208, false, 70, '2026-05-28 18:31:15.592092+00', '2026-05-28 18:31:15.592092+00'),
	('f6e92fc2-b253-405f-9a25-b3fea2491295', 'CNF', 'Aeroporto de Confins', 'aeroporto-de-confins', 'Confins (CNF)', 'airport', 'Lagoa Santa', 'MG', 'BR', -19.6336, -43.9686, false, 80, '2026-05-28 18:31:15.592092+00', '2026-05-28 18:31:15.592092+00'),
	('1e8b522c-31b1-4165-ad71-59bb86706325', 'POA', 'Aeroporto Salgado Filho', 'aeroporto-salgado-filho', 'Salgado Filho (POA)', 'airport', 'Porto Alegre', 'RS', 'BR', -29.9939, -51.1711, false, 90, '2026-05-28 18:31:15.592092+00', '2026-05-28 18:31:15.592092+00'),
	('38cfb07a-b785-4803-97a7-7308163f9756', 'LIS', 'Aeroporto Humberto Delgado', 'aeroporto-humberto-delgado', 'Lisboa (LIS)', 'airport', 'Lisboa', NULL, 'PT', 38.7813, -9.1359, true, 100, '2026-05-28 18:31:15.592092+00', '2026-05-28 18:31:15.592092+00'),
	('26376325-e00e-4d89-9993-edff5e50c266', 'FAO', 'Aeroporto de Faro', 'aeroporto-de-faro', 'Faro (FAO)', 'airport', 'Faro', NULL, 'PT', 37.0144, -7.9659, true, 110, '2026-05-28 18:31:15.592092+00', '2026-05-28 18:31:15.592092+00'),
	('cfccf184-6d7d-4853-8779-2321a46ac66f', 'OPO', 'Aeroporto Francisco Sá Carneiro', 'aeroporto-francisco-sa-carneiro', 'Porto (OPO)', 'airport', 'Porto', NULL, 'PT', 41.2481, -8.6814, false, 120, '2026-05-28 18:31:15.592092+00', '2026-05-28 18:31:15.592092+00'),
	('63dadc64-a3ba-4e87-8d70-1f3f9b06df8e', 'tiete', 'Terminal Rodoviário Tietê', 'terminal-rodoviario-tiete', 'Tietê', 'bus_terminal', 'São Paulo', 'SP', 'BR', -23.5158, -46.6258, false, 200, '2026-05-28 18:31:15.592092+00', '2026-05-28 18:31:15.592092+00'),
	('d7bc75c4-9960-49df-a092-a31f79ff0751', 'centro-sp', 'Centro de São Paulo', 'centro-de-sao-paulo', 'Centro SP', 'city_center', 'São Paulo', 'SP', 'BR', -23.5505, -46.6333, false, 300, '2026-05-28 18:31:15.592092+00', '2026-05-28 18:31:15.592092+00'),
	('9c6b2537-f712-4320-9143-ebae0a7a5c76', 'jardim-paulista', 'Jardim Paulista', 'jardim-paulista', 'Jardim Paulista', 'district', 'São Paulo', 'SP', 'BR', -23.5694, -46.6603, false, 310, '2026-05-28 18:31:15.592092+00', '2026-05-28 18:31:15.592092+00'),
	('e87f47d2-36f1-477a-aed4-360f80d2197c', 'nova-iguacu', 'Centro de Nova Iguaçu', 'centro-de-nova-iguacu', 'Nova Iguaçu', 'city_center', 'Nova Iguaçu', 'RJ', 'BR', -22.7589, -43.4503, false, 320, '2026-05-28 18:31:15.592092+00', '2026-05-28 18:31:15.592092+00');


--
-- Data for Name: destination_point; Type: TABLE DATA; Schema: public; Owner: postgres
-- DAT-05 — terminais do GRU (único multi-terminal). Geo por code (não cravar id).
--

INSERT INTO "public"."destination_point" ("destination_id", "name", "type", "latitude", "longitude", "sort_order")
SELECT d.id, v.name, 'terminal', v.lat, v.lng, v.sort
FROM "public"."destination" d
CROSS JOIN (VALUES
	('Terminal 1', -23.4336::numeric, -46.4806::numeric, 1),
	('Terminal 2', -23.4327::numeric, -46.4730::numeric, 2),
	('Terminal 3', -23.4316::numeric, -46.4690::numeric, 3)
) AS v(name, lat, lng, sort)
WHERE d.code = 'GRU'
ON CONFLICT (destination_id, name) DO NOTHING;


--
-- Data for Name: faq_category; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."faq_category" ("id", "slug", "label", "sort_order", "created_at", "updated_at") VALUES
	('7731a6c4-987a-4b5e-b0f0-8b1b651b4688', 'reservas', 'Reservas', 1, '2026-06-01 14:55:11.936422+00', '2026-06-01 14:55:11.936422+00'),
	('f31d19cd-29a7-488d-8d55-5fd5605a33ec', 'pagamentos', 'Pagamentos', 2, '2026-06-01 14:55:11.936422+00', '2026-06-01 14:55:11.936422+00'),
	('9f0ee48d-97ef-4fea-99c2-792b3221ef21', 'cancelamento', 'Cancelamento', 3, '2026-06-01 14:55:11.936422+00', '2026-06-01 14:55:11.936422+00'),
	('cbb45b76-baa7-41a2-b0d3-3e005d931d26', 'check-in', 'Check-in / Acesso', 4, '2026-06-01 14:55:11.936422+00', '2026-06-01 14:55:11.936422+00'),
	('927df5ac-7737-47c1-b538-d7aa8db1bc95', 'veiculos', 'Veículos', 5, '2026-06-01 14:55:11.936422+00', '2026-06-01 14:55:11.936422+00');


--
-- Data for Name: location; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."location" ("id", "company_id", "name", "slug", "address", "latitude", "longitude", "timezone", "status", "created_at", "updated_at", "deleted_at", "has_pcd_config", "has_passenger_quantity", "reservation_policy", "has_notice", "notice", "phone", "email", "photos") VALUES
	('a542e161-b0b6-4cf5-b4ff-6052b1d164b5', '8a4e2589-996c-4aef-a797-a5f3632eed82', 'Virapark', 'virapark', 'Antiga Rod. Santos Dumont, Km 64 - Jardim Santa Maria II, Campinas - SP', -23.0141330, -47.1244986, 'America/Sao_Paulo', 'active', '2026-05-25 14:44:10.135186+00', '2026-05-28 18:59:59.355142+00', NULL, false, false, NULL, false, NULL, NULL, NULL, '[]'),
	('c82d2dc0-7304-4bb3-9989-bf99886cd698', '2783dc63-0ece-47c9-aeeb-e7ea44e7c7dc', 'Aeroporto de Viracopos', 'aeroporto-viracopos', 'Rod. Santos Dumont, km 66 - Vila Aeroporto, Campinas - SP', -23.0042603, -47.1349853, 'America/Sao_Paulo', 'active', '2026-05-25 14:44:10.135186+00', '2026-05-28 18:59:59.355142+00', NULL, false, false, NULL, false, NULL, NULL, NULL, '[]'),
	('ef6a2dd5-35a3-4c6c-8b1b-b03f7369c242', '6a657ec9-6d65-4844-8483-1444ff67977f', 'Aeroporto de Guarulhos', 'aeroporto-guarulhos', 'Av. Novo Brasil, 954 - Cidade Industrial Satélite, Guarulhos - SP', -23.4394587, -46.4674880, 'America/Sao_Paulo', 'active', '2026-05-25 14:44:10.135186+00', '2026-05-28 18:59:59.355142+00', NULL, false, false, NULL, false, NULL, NULL, NULL, '[]'),
	('263e8063-ce1e-46a6-9ad6-68cf1bf58860', '6a06f828-e756-4536-b40f-fd1d3d087fb1', 'Aeroporto Afonso Pena', 'aeroporto-afonso-pena', 'Av. Rocha Pombo, s/n - Águas Belas, São José dos Pinhais - PR', -25.5238991, -49.1784884, 'America/Sao_Paulo', 'active', '2026-05-25 14:44:10.135186+00', '2026-05-28 18:59:59.355142+00', NULL, false, false, NULL, false, NULL, NULL, NULL, '[]'),
	('70fd4973-b39c-497c-a423-541c8a3f148f', '5cbced79-070b-4a0c-8fef-e6f4f1e2558b', 'Aeroporto Afonso Pena', 'aeroporto-afonso-pena', 'Av. Rocha Pombo, s/n - Águas Belas, São José dos Pinhais - PR', -25.5258688, -49.1799869, 'America/Sao_Paulo', 'active', '2026-05-25 14:44:10.135186+00', '2026-05-28 18:59:59.355142+00', NULL, false, false, NULL, false, NULL, NULL, NULL, '[]'),
	('0d9bf7bf-811f-42df-959d-8accbe92b76b', 'fee1f0d3-ac69-44a6-b7d9-fcbdf7a6a21a', 'Aeroporto de Guarulhos', 'aeroporto-guarulhos', 'Av. Novo Brasil, 954 - Cidade Industrial Satélite, Guarulhos - SP', -23.4342951, -46.4686512, 'America/Sao_Paulo', 'active', '2026-05-25 14:44:10.135186+00', '2026-05-28 18:59:59.355142+00', NULL, false, false, NULL, false, NULL, NULL, NULL, '[]'),
	('e08bf622-eb9f-41eb-8fe3-9c9f2c124938', 'fee1f0d3-ac69-44a6-b7d9-fcbdf7a6a21a', 'Terminal Rodoviário Tietê', 'terminal-rodoviario-tiete', 'Av. Cruzeiro do Sul, 1800 - Santana, São Paulo - SP', -23.5179111, -46.6244699, 'America/Sao_Paulo', 'active', '2026-05-25 14:44:10.135186+00', '2026-05-28 18:59:59.355142+00', NULL, false, false, NULL, false, NULL, NULL, NULL, '[]'),
	('a8764272-51a8-4fda-bbba-ee19b345deb5', 'fee1f0d3-ac69-44a6-b7d9-fcbdf7a6a21a', 'Aeroporto de Congonhas', 'aeroporto-congonhas', 'Av. Washington Luís, 7059 - Campo Belo, São Paulo - SP', -23.6286429, -46.6569157, 'America/Sao_Paulo', 'active', '2026-05-25 14:44:10.135186+00', '2026-05-28 18:59:59.355142+00', NULL, false, false, NULL, false, NULL, NULL, NULL, '[]'),
	('1e9f8228-2d2e-4ca8-8dd6-093999578908', '48a7af0a-3a0e-4660-8acf-d4df7698e4f1', 'Aeroporto de Congonhas', 'aeroporto-congonhas', 'Av. Washington Luís, 7059 - Campo Belo, São Paulo - SP', -23.6284735, -46.6554441, 'America/Sao_Paulo', 'active', '2026-05-25 14:44:10.135186+00', '2026-05-28 18:59:59.355142+00', NULL, false, false, NULL, false, NULL, NULL, NULL, '[]'),
	('fd6290d0-615e-47c2-a9af-38b64d49448d', '9d1db89a-adce-447d-abaf-5cd2274c7fc7', 'Faro', 'faro', 'Rua José Dias Rato Montenegro - Faro', 37.0189591, -7.9626445, 'Europe/Lisbon', 'active', '2026-05-27 16:58:38.742614+00', '2026-05-28 18:59:59.355142+00', NULL, false, false, NULL, false, NULL, '+351218206188', 'info@airpark.pt', '[]'),
	('6e60b2d3-4de9-4385-bab2-920ca4bdf257', '9d1db89a-adce-447d-abaf-5cd2274c7fc7', 'Lisboa', 'lisboa', 'R. Particular 7 Armazém 12, 2685-583 Camarate, Portugal', 38.7871071, -9.1375497, 'Europe/Lisbon', 'active', '2026-05-27 16:58:38.742614+00', '2026-05-28 18:59:59.355142+00', NULL, false, false, NULL, false, NULL, '+351218206188', 'info@airpark.pt', '[]'),
	('32abd148-da4e-4aa9-b91c-542f7f69ef99', 'e5fba2c7-fe29-45bf-a212-aef7f185554f', 'Unidade Aeroporto', 'unidade-aeroporto', 'Rua Tito 153, Perdizes - São Paulo - SP', -23.4427632, -46.4817788, 'America/Sao_Paulo', 'active', '2026-05-27 16:58:38.742614+00', '2026-05-28 18:59:59.355142+00', NULL, false, false, NULL, false, NULL, '+551133333333', 'contato@fera.ag', '[]'),
	('ee498126-1a0a-427f-945f-50b141b7bbcb', 'a73eec79-5c21-45fc-842f-58d552c93819', 'Nova Iguaçu', 'nova-iguacu', 'Av. Gov. Amaral Peixoto, 507 - Centro, Nova Iguaçu - RJ, 26210-060', -22.7530997, -43.4454083, 'America/Sao_Paulo', 'active', '2026-05-27 16:58:38.742614+00', '2026-05-28 18:59:59.355142+00', NULL, false, false, NULL, false, NULL, '+5521973212002', 'contato@moveparking.com.br', '[]'),
	('4c7be617-e5ea-4f8f-b247-7d9475827663', 'f8f321cd-5265-4a6a-94f7-f1eae58d23a9', 'Estacionamento Av. 9 de Julho', 'estacionamento', 'Av. Nove de Julho, 3186 - Jardim Paulista, São Paulo - SP', -23.5734764, -46.6558784, 'America/Sao_Paulo', 'active', '2026-05-27 16:58:38.742614+00', '2026-05-28 18:59:59.355142+00', NULL, false, false, NULL, false, NULL, '+5519991104651', 'nine@garageinn.com.br', '[]'),
	('54acabaa-2292-4999-9100-fc301cb3fad1', 'e0b69229-08b9-4f67-9455-381f84649506', 'Lisboa', 'lisboa', 'Rua Particular, nº 12 - Camarate, 2680-583', 38.7802933, -9.1320082, 'Europe/Lisbon', 'active', '2026-05-27 16:58:38.742614+00', '2026-05-28 18:59:59.355142+00', NULL, false, false, NULL, false, NULL, '+351966687677', NULL, '[]'),
	('f4a03216-b186-4cf2-8202-fbb0238b22e3', '55c3e046-ecac-4ead-99e1-483ecb2d3e6e', 'Lisboa', 'lisboa', 'R. B 45, Quinta do Carmo - 2685-129 Sacavém', 38.7826706, -9.1402197, 'Europe/Lisbon', 'active', '2026-05-27 16:58:38.742614+00', '2026-05-28 18:59:59.355142+00', NULL, false, false, NULL, false, NULL, '+351962406952', NULL, '[]');


--
-- Data for Name: faq; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."faq" ("id", "scope", "location_id", "category_id", "question", "answer", "sort_order", "is_published", "created_by", "updated_by", "created_at", "updated_at", "deleted_at") VALUES
	('8bdb6626-5139-486c-8dbf-b29f24d3bbc7', 'global', NULL, '7731a6c4-987a-4b5e-b0f0-8b1b651b4688', 'Como faço uma reserva?', 'É só buscar pelo destino e datas na home, escolher um estacionamento, confirmar o veículo e pagar. A confirmação chega por e-mail e WhatsApp em segundos.', 1, true, NULL, NULL, '2026-06-01 14:55:11.936422+00', '2026-06-01 14:55:11.936422+00', NULL),
	('096b9c4d-58b8-4de0-ab20-7844da65cac1', 'global', NULL, '7731a6c4-987a-4b5e-b0f0-8b1b651b4688', 'Posso reservar pra outra pessoa dirigir?', 'Pode. No checkout você informa a placa do veículo que vai estacionar; o cartão pode ser de outra pessoa também.', 2, true, NULL, NULL, '2026-06-01 14:55:11.936422+00', '2026-06-01 14:55:11.936422+00', NULL),
	('568e77c2-ea44-43cb-b67e-05656de852a0', 'global', NULL, 'f31d19cd-29a7-488d-8d55-5fd5605a33ec', 'Quais formas de pagamento aceitam?', 'Hoje aceitamos cartão de crédito (Visa, Mastercard, Elo, Amex) e PIX. O pagamento é processado na hora da reserva.', 1, true, NULL, NULL, '2026-06-01 14:55:11.936422+00', '2026-06-01 14:55:11.936422+00', NULL),
	('ec563008-fa5c-45e3-92f1-412f48078b50', 'global', NULL, 'f31d19cd-29a7-488d-8d55-5fd5605a33ec', 'O PIX expira em quanto tempo?', 'O QR Code do PIX tem validade de 15 minutos. Se expirar é só refazer o checkout.', 2, true, NULL, NULL, '2026-06-01 14:55:11.936422+00', '2026-06-01 14:55:11.936422+00', NULL),
	('d2bcbf89-4916-4680-81e7-c79cf3866a5e', 'global', NULL, '9f0ee48d-97ef-4fea-99c2-792b3221ef21', 'Como cancelo uma reserva?', 'Em "Minhas reservas" cada uma confirmada tem o botão "Cancelar". Cancelamentos até 24h antes do check-in têm reembolso integral. Depois desse prazo a política varia por estacionamento.', 1, true, NULL, NULL, '2026-06-01 14:55:11.936422+00', '2026-06-01 14:55:11.936422+00', NULL),
	('78966001-59a8-479b-b8d6-f251a9cee978', 'global', NULL, 'cbb45b76-baa7-41a2-b0d3-3e005d931d26', 'O que apresentar na chegada ao estacionamento?', 'Mostre o QR Code do voucher (em "Minhas reservas") ou informe o código MP- da reserva. Em alguns locais a leitura é automática pela placa.', 1, true, NULL, NULL, '2026-06-01 14:55:11.936422+00', '2026-06-01 14:55:11.936422+00', NULL),
	('870f5782-b012-4817-b7e9-f72fbdf8f7c7', 'global', NULL, 'cbb45b76-baa7-41a2-b0d3-3e005d931d26', 'Posso chegar antes ou sair depois do horário?', 'Tolerância de 30 minutos antes e 60 minutos depois sem cobrança. Períodos maiores podem gerar diária adicional na saída.', 2, true, NULL, NULL, '2026-06-01 14:55:11.936422+00', '2026-06-01 14:55:11.936422+00', NULL),
	('c0192e76-ff13-45a8-9236-56e521ffa5a6', 'global', NULL, '927df5ac-7737-47c1-b538-d7aa8db1bc95', 'Posso trocar o veículo depois da reserva?', 'Sim. Em "Minhas reservas" > "Editar veículo" você muda a placa até a hora do check-in.', 1, true, NULL, NULL, '2026-06-01 14:55:11.936422+00', '2026-06-01 14:55:11.936422+00', NULL);

-- FAQ por destino (scope='destination', GEO-07 / ADR-002) — Viracopos.
-- Fonte do conteúdo: gestao/conteudo-onda1.md §2.1 (baseline, revisar com parceiro).
INSERT INTO "public"."faq" ("scope", "destination_id", "category_id", "question", "answer", "sort_order", "is_published") VALUES
	('destination', 'da58673f-5dfd-4130-999b-5c987f353330', 'cbb45b76-baa7-41a2-b0d3-3e005d931d26', 'O estacionamento em Viracopos oferece traslado até o terminal?', 'Depende do estacionamento. Em Viracopos os lotes ficam a poucos minutos do terminal e muitos oferecem traslado (transfer) de ida e volta — em vários casos já incluído na diária. Na página de cada estacionamento você vê se o traslado está incluso, o horário e a distância até o terminal. Reserve o que melhor encaixa no seu voo.', 1, true),
	('destination', 'da58673f-5dfd-4130-999b-5c987f353330', '7731a6c4-987a-4b5e-b0f0-8b1b651b4688', 'E se meu voo atrasar ou eu voltar antes do previsto?', 'Sua vaga fica garantida pelo período reservado. Se o voo atrasar e você buscar o carro depois, ou se voltar antes, fale com o estacionamento na chegada — a maioria acomoda mudanças de horário. Cobranças por período adicional, quando houver, seguem a tabela do próprio estacionamento.', 2, true),
	('destination', 'da58673f-5dfd-4130-999b-5c987f353330', '927df5ac-7737-47c1-b538-d7aa8db1bc95', 'As vagas em Viracopos são cobertas ou descobertas?', 'Varia por estacionamento e por tipo de vaga. Há opções cobertas (protegidas de sol e chuva) e descobertas, geralmente mais econômicas. O tipo de vaga e as comodidades aparecem na página de cada estacionamento — escolha pelo que preferir antes de reservar.', 3, true),
	('destination', 'da58673f-5dfd-4130-999b-5c987f353330', 'cbb45b76-baa7-41a2-b0d3-3e005d931d26', 'Tem valet ou é self-park (você mesmo estaciona)?', 'Os dois modelos existem em Viracopos. No valet, a equipe estaciona o carro por você; no self-park, você mesmo deixa na vaga. Cada página de estacionamento indica o modelo e as comodidades (traslado, lavagem, etc.).', 4, true),
	('destination', 'da58673f-5dfd-4130-999b-5c987f353330', '927df5ac-7737-47c1-b538-d7aa8db1bc95', 'Os estacionamentos de Viracopos são seguros? Têm monitoramento?', 'Os estacionamentos parceiros listam suas comodidades de segurança — como monitoramento por câmeras (CCTV), controle de acesso e equipe no local — na própria página. Confira os itens de cada estacionamento antes de reservar.', 5, true),
	('destination', 'da58673f-5dfd-4130-999b-5c987f353330', '927df5ac-7737-47c1-b538-d7aa8db1bc95', 'Existe limite de altura (gabarito) para SUVs, vans ou furgões?', 'Vagas descobertas costumam não ter limite de altura; áreas cobertas podem ter gabarito. Se você dirige um veículo alto (SUV grande, van, furgão), confira as comodidades e observações do estacionamento ou fale com a unidade antes de reservar para garantir o encaixe.', 6, true);

-- FAQ por destino — GRU, CGH, SDU, GIG (gestao/conteudo-onda1.md §2.2–2.5).
INSERT INTO "public"."faq" ("scope", "destination_id", "category_id", "question", "answer", "sort_order", "is_published") VALUES
	-- GRU · Guarulhos
	('destination', '3a572f42-24ee-4aa8-b209-afada25d14ec', 'cbb45b76-baa7-41a2-b0d3-3e005d931d26', 'O estacionamento em Guarulhos oferece traslado até o terminal?', 'Depende do estacionamento. O GRU tem três terminais (T1, T2 e T3) e os estacionamentos parceiros costumam ficar a poucos minutos deles, a maioria com traslado (transfer) de ida e volta — em vários casos já incluído na diária. A página de cada estacionamento mostra se o traslado está incluso, o horário e para qual terminal ele leva. Confira o do seu voo antes de reservar.', 1, true),
	('destination', '3a572f42-24ee-4aa8-b209-afada25d14ec', '7731a6c4-987a-4b5e-b0f0-8b1b651b4688', 'E se meu voo atrasar ou eu voltar antes do previsto?', 'Sua vaga fica garantida pelo período reservado. Se o voo atrasar e você buscar o carro depois, ou se voltar antes, fale com o estacionamento na chegada — a maioria acomoda mudanças de horário. Cobranças por período adicional, quando houver, seguem a tabela do próprio estacionamento.', 2, true),
	('destination', '3a572f42-24ee-4aa8-b209-afada25d14ec', '927df5ac-7737-47c1-b538-d7aa8db1bc95', 'As vagas em Guarulhos são cobertas ou descobertas?', 'Varia por estacionamento e por tipo de vaga. Em Guarulhos há opções cobertas (protegidas de sol e chuva) e descobertas, geralmente mais econômicas. O tipo de vaga e as comodidades aparecem na página de cada estacionamento — escolha pelo que preferir antes de reservar.', 3, true),
	('destination', '3a572f42-24ee-4aa8-b209-afada25d14ec', 'cbb45b76-baa7-41a2-b0d3-3e005d931d26', 'Tem valet ou é self-park (você mesmo estaciona)?', 'Os dois modelos existem em Guarulhos. No valet, a equipe estaciona o carro por você; no self-park, você mesmo deixa na vaga. Cada página de estacionamento indica o modelo e as comodidades (traslado, lavagem, etc.).', 4, true),
	('destination', '3a572f42-24ee-4aa8-b209-afada25d14ec', '927df5ac-7737-47c1-b538-d7aa8db1bc95', 'Os estacionamentos de Guarulhos são seguros? Têm monitoramento?', 'Os estacionamentos parceiros em Guarulhos listam suas comodidades de segurança — como monitoramento por câmeras (CCTV), controle de acesso e equipe no local — na própria página. Confira os itens de cada estacionamento antes de reservar.', 5, true),
	('destination', '3a572f42-24ee-4aa8-b209-afada25d14ec', '927df5ac-7737-47c1-b538-d7aa8db1bc95', 'Existe limite de altura (gabarito) para SUVs, vans ou furgões?', 'Vagas descobertas costumam não ter limite de altura; áreas cobertas podem ter gabarito. Se você dirige um veículo alto (SUV grande, van, furgão), confira as comodidades e observações do estacionamento ou fale com a unidade antes de reservar para garantir o encaixe.', 6, true),
	-- CGH · Congonhas
	('destination', 'ede0de4e-bdc9-4c36-96c8-a7a9e72a4edc', 'cbb45b76-baa7-41a2-b0d3-3e005d931d26', 'O estacionamento em Congonhas oferece traslado até o terminal?', 'Depende do estacionamento. Congonhas fica dentro de São Paulo, então os lotes parceiros costumam ser bem próximos do terminal — muitos com traslado (transfer) de ida e volta, em vários casos já incluso na diária. A página de cada estacionamento mostra se o traslado está incluído, o horário e a distância até o terminal.', 1, true),
	('destination', 'ede0de4e-bdc9-4c36-96c8-a7a9e72a4edc', '7731a6c4-987a-4b5e-b0f0-8b1b651b4688', 'E se meu voo atrasar ou eu voltar antes do previsto?', 'Sua vaga fica garantida pelo período reservado. Se o voo atrasar e você buscar o carro depois, ou se voltar antes, fale com o estacionamento na chegada — a maioria acomoda mudanças de horário. Cobranças por período adicional, quando houver, seguem a tabela do próprio estacionamento.', 2, true),
	('destination', 'ede0de4e-bdc9-4c36-96c8-a7a9e72a4edc', '927df5ac-7737-47c1-b538-d7aa8db1bc95', 'As vagas em Congonhas são cobertas ou descobertas?', 'Varia por estacionamento e por tipo de vaga. Em Congonhas há opções cobertas (protegidas de sol e chuva) e descobertas, geralmente mais econômicas. O tipo de vaga e as comodidades aparecem na página de cada estacionamento — escolha pelo que preferir antes de reservar.', 3, true),
	('destination', 'ede0de4e-bdc9-4c36-96c8-a7a9e72a4edc', 'cbb45b76-baa7-41a2-b0d3-3e005d931d26', 'Tem valet ou é self-park (você mesmo estaciona)?', 'Os dois modelos existem em Congonhas. No valet, a equipe estaciona o carro por você; no self-park, você mesmo deixa na vaga. Cada página de estacionamento indica o modelo e as comodidades (traslado, lavagem, etc.).', 4, true),
	('destination', 'ede0de4e-bdc9-4c36-96c8-a7a9e72a4edc', '927df5ac-7737-47c1-b538-d7aa8db1bc95', 'Os estacionamentos de Congonhas são seguros? Têm monitoramento?', 'Os estacionamentos parceiros em Congonhas listam suas comodidades de segurança — como monitoramento por câmeras (CCTV), controle de acesso e equipe no local — na própria página. Confira os itens de cada estacionamento antes de reservar.', 5, true),
	('destination', 'ede0de4e-bdc9-4c36-96c8-a7a9e72a4edc', '927df5ac-7737-47c1-b538-d7aa8db1bc95', 'Existe limite de altura (gabarito) para SUVs, vans ou furgões?', 'Vagas descobertas costumam não ter limite de altura; áreas cobertas podem ter gabarito. Se você dirige um veículo alto (SUV grande, van, furgão), confira as comodidades e observações do estacionamento ou fale com a unidade antes de reservar para garantir o encaixe.', 6, true),
	-- SDU · Santos Dumont
	('destination', '3b386587-5fa0-45a1-b2b5-c7ebc71ea1c6', 'cbb45b76-baa7-41a2-b0d3-3e005d931d26', 'O estacionamento no Santos Dumont oferece traslado até o terminal?', 'Depende do estacionamento. O Santos Dumont fica no centro do Rio, junto à orla, e os lotes parceiros costumam ser bem próximos — muitos com traslado (transfer) de ida e volta, às vezes já incluso na diária. Veja na página de cada estacionamento se o traslado está incluído, o horário e a distância até o terminal.', 1, true),
	('destination', '3b386587-5fa0-45a1-b2b5-c7ebc71ea1c6', '7731a6c4-987a-4b5e-b0f0-8b1b651b4688', 'E se meu voo atrasar ou eu voltar antes do previsto?', 'Sua vaga fica garantida pelo período reservado. Se o voo atrasar e você buscar o carro depois, ou se voltar antes, fale com o estacionamento na chegada — a maioria acomoda mudanças de horário. Cobranças por período adicional, quando houver, seguem a tabela do próprio estacionamento.', 2, true),
	('destination', '3b386587-5fa0-45a1-b2b5-c7ebc71ea1c6', '927df5ac-7737-47c1-b538-d7aa8db1bc95', 'As vagas no Santos Dumont são cobertas ou descobertas?', 'Varia por estacionamento e por tipo de vaga. No Santos Dumont há opções cobertas (protegidas de sol e chuva) e descobertas, geralmente mais econômicas. O tipo de vaga e as comodidades aparecem na página de cada estacionamento — escolha pelo que preferir antes de reservar.', 3, true),
	('destination', '3b386587-5fa0-45a1-b2b5-c7ebc71ea1c6', 'cbb45b76-baa7-41a2-b0d3-3e005d931d26', 'Tem valet ou é self-park (você mesmo estaciona)?', 'Os dois modelos existem no Santos Dumont. No valet, a equipe estaciona o carro por você; no self-park, você mesmo deixa na vaga. Cada página de estacionamento indica o modelo e as comodidades (traslado, lavagem, etc.).', 4, true),
	('destination', '3b386587-5fa0-45a1-b2b5-c7ebc71ea1c6', '927df5ac-7737-47c1-b538-d7aa8db1bc95', 'Os estacionamentos do Santos Dumont são seguros? Têm monitoramento?', 'Os estacionamentos parceiros do Santos Dumont listam suas comodidades de segurança — como monitoramento por câmeras (CCTV), controle de acesso e equipe no local — na própria página. Confira os itens de cada estacionamento antes de reservar.', 5, true),
	('destination', '3b386587-5fa0-45a1-b2b5-c7ebc71ea1c6', '927df5ac-7737-47c1-b538-d7aa8db1bc95', 'Existe limite de altura (gabarito) para SUVs, vans ou furgões?', 'Vagas descobertas costumam não ter limite de altura; áreas cobertas podem ter gabarito. Se você dirige um veículo alto (SUV grande, van, furgão), confira as comodidades e observações do estacionamento ou fale com a unidade antes de reservar para garantir o encaixe.', 6, true),
	-- GIG · Galeão
	('destination', 'cdf91ad4-91b5-425d-9709-131e7421d2b2', 'cbb45b76-baa7-41a2-b0d3-3e005d931d26', 'O estacionamento no Galeão oferece traslado até o terminal?', 'Depende do estacionamento. O Galeão tem dois terminais (T1 e T2) e os lotes parceiros ficam a poucos minutos deles, a maioria com traslado (transfer) de ida e volta — em vários casos já incluído na diária. A página de cada estacionamento mostra se o traslado está incluso, o horário e para qual terminal ele leva.', 1, true),
	('destination', 'cdf91ad4-91b5-425d-9709-131e7421d2b2', '7731a6c4-987a-4b5e-b0f0-8b1b651b4688', 'E se meu voo atrasar ou eu voltar antes do previsto?', 'Sua vaga fica garantida pelo período reservado. Se o voo atrasar e você buscar o carro depois, ou se voltar antes, fale com o estacionamento na chegada — a maioria acomoda mudanças de horário. Cobranças por período adicional, quando houver, seguem a tabela do próprio estacionamento.', 2, true),
	('destination', 'cdf91ad4-91b5-425d-9709-131e7421d2b2', '927df5ac-7737-47c1-b538-d7aa8db1bc95', 'As vagas no Galeão são cobertas ou descobertas?', 'Varia por estacionamento e por tipo de vaga. No Galeão há opções cobertas (protegidas de sol e chuva) e descobertas, geralmente mais econômicas. O tipo de vaga e as comodidades aparecem na página de cada estacionamento — escolha pelo que preferir antes de reservar.', 3, true),
	('destination', 'cdf91ad4-91b5-425d-9709-131e7421d2b2', 'cbb45b76-baa7-41a2-b0d3-3e005d931d26', 'Tem valet ou é self-park (você mesmo estaciona)?', 'Os dois modelos existem no Galeão. No valet, a equipe estaciona o carro por você; no self-park, você mesmo deixa na vaga. Cada página de estacionamento indica o modelo e as comodidades (traslado, lavagem, etc.).', 4, true),
	('destination', 'cdf91ad4-91b5-425d-9709-131e7421d2b2', '927df5ac-7737-47c1-b538-d7aa8db1bc95', 'Os estacionamentos do Galeão são seguros? Têm monitoramento?', 'Os estacionamentos parceiros do Galeão listam suas comodidades de segurança — como monitoramento por câmeras (CCTV), controle de acesso e equipe no local — na própria página. Confira os itens de cada estacionamento antes de reservar.', 5, true),
	('destination', 'cdf91ad4-91b5-425d-9709-131e7421d2b2', '927df5ac-7737-47c1-b538-d7aa8db1bc95', 'Existe limite de altura (gabarito) para SUVs, vans ou furgões?', 'Vagas descobertas costumam não ter limite de altura; áreas cobertas podem ter gabarito. Se você dirige um veículo alto (SUV grande, van, furgão), confira as comodidades e observações do estacionamento ou fale com a unidade antes de reservar para garantir o encaixe.', 6, true);


--
-- Data for Name: location_add_on_service; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: location_amenity; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."location_amenity" ("location_id", "amenity_code", "notes") VALUES
	('0d9bf7bf-811f-42df-959d-8accbe92b76b', 'cameras_24h', NULL),
	('0d9bf7bf-811f-42df-959d-8accbe92b76b', 'on_site_24h', NULL),
	('0d9bf7bf-811f-42df-959d-8accbe92b76b', 'gated_access', NULL),
	('0d9bf7bf-811f-42df-959d-8accbe92b76b', 'restroom', NULL),
	('0d9bf7bf-811f-42df-959d-8accbe92b76b', 'shuttle_free', NULL),
	('0d9bf7bf-811f-42df-959d-8accbe92b76b', 'valet', NULL),
	('0d9bf7bf-811f-42df-959d-8accbe92b76b', 'battery_service', NULL),
	('0d9bf7bf-811f-42df-959d-8accbe92b76b', 'cover_protection', NULL),
	('0d9bf7bf-811f-42df-959d-8accbe92b76b', 'flight_insurance', NULL),
	('1e9f8228-2d2e-4ca8-8dd6-093999578908', 'cameras_24h', NULL),
	('1e9f8228-2d2e-4ca8-8dd6-093999578908', 'on_site_24h', NULL),
	('1e9f8228-2d2e-4ca8-8dd6-093999578908', 'gated_access', NULL),
	('1e9f8228-2d2e-4ca8-8dd6-093999578908', 'restroom', NULL),
	('1e9f8228-2d2e-4ca8-8dd6-093999578908', 'shuttle_free', NULL),
	('1e9f8228-2d2e-4ca8-8dd6-093999578908', 'flight_insurance', NULL),
	('263e8063-ce1e-46a6-9ad6-68cf1bf58860', 'cameras_24h', NULL),
	('263e8063-ce1e-46a6-9ad6-68cf1bf58860', 'on_site_24h', NULL),
	('263e8063-ce1e-46a6-9ad6-68cf1bf58860', 'gated_access', NULL),
	('263e8063-ce1e-46a6-9ad6-68cf1bf58860', 'restroom', NULL),
	('263e8063-ce1e-46a6-9ad6-68cf1bf58860', 'shuttle_free', NULL),
	('263e8063-ce1e-46a6-9ad6-68cf1bf58860', 'self_park', NULL),
	('263e8063-ce1e-46a6-9ad6-68cf1bf58860', 'flight_insurance', NULL),
	('32abd148-da4e-4aa9-b91c-542f7f69ef99', 'cameras_24h', NULL),
	('32abd148-da4e-4aa9-b91c-542f7f69ef99', 'on_site_24h', NULL),
	('32abd148-da4e-4aa9-b91c-542f7f69ef99', 'gated_access', NULL),
	('32abd148-da4e-4aa9-b91c-542f7f69ef99', 'restroom', NULL),
	('32abd148-da4e-4aa9-b91c-542f7f69ef99', 'shuttle_free', NULL),
	('32abd148-da4e-4aa9-b91c-542f7f69ef99', 'self_park', NULL),
	('32abd148-da4e-4aa9-b91c-542f7f69ef99', 'flight_insurance', NULL),
	('4c7be617-e5ea-4f8f-b247-7d9475827663', 'cameras_24h', NULL),
	('4c7be617-e5ea-4f8f-b247-7d9475827663', 'on_site_24h', NULL),
	('4c7be617-e5ea-4f8f-b247-7d9475827663', 'gated_access', NULL),
	('4c7be617-e5ea-4f8f-b247-7d9475827663', 'restroom', NULL),
	('4c7be617-e5ea-4f8f-b247-7d9475827663', 'shuttle_free', NULL),
	('54acabaa-2292-4999-9100-fc301cb3fad1', 'cameras_24h', NULL),
	('54acabaa-2292-4999-9100-fc301cb3fad1', 'on_site_24h', NULL),
	('54acabaa-2292-4999-9100-fc301cb3fad1', 'gated_access', NULL),
	('54acabaa-2292-4999-9100-fc301cb3fad1', 'restroom', NULL),
	('54acabaa-2292-4999-9100-fc301cb3fad1', 'shuttle_free', NULL),
	('54acabaa-2292-4999-9100-fc301cb3fad1', 'self_park', NULL),
	('6e60b2d3-4de9-4385-bab2-920ca4bdf257', 'cameras_24h', NULL),
	('6e60b2d3-4de9-4385-bab2-920ca4bdf257', 'on_site_24h', NULL),
	('6e60b2d3-4de9-4385-bab2-920ca4bdf257', 'gated_access', NULL),
	('6e60b2d3-4de9-4385-bab2-920ca4bdf257', 'restroom', NULL),
	('6e60b2d3-4de9-4385-bab2-920ca4bdf257', 'shuttle_free', NULL),
	('6e60b2d3-4de9-4385-bab2-920ca4bdf257', 'self_park', NULL),
	('70fd4973-b39c-497c-a423-541c8a3f148f', 'cameras_24h', NULL),
	('70fd4973-b39c-497c-a423-541c8a3f148f', 'on_site_24h', NULL),
	('70fd4973-b39c-497c-a423-541c8a3f148f', 'gated_access', NULL),
	('70fd4973-b39c-497c-a423-541c8a3f148f', 'restroom', NULL),
	('70fd4973-b39c-497c-a423-541c8a3f148f', 'shuttle_free', NULL),
	('70fd4973-b39c-497c-a423-541c8a3f148f', 'self_park', NULL),
	('70fd4973-b39c-497c-a423-541c8a3f148f', 'flight_insurance', NULL),
	('a542e161-b0b6-4cf5-b4ff-6052b1d164b5', 'cameras_24h', NULL),
	('a542e161-b0b6-4cf5-b4ff-6052b1d164b5', 'on_site_24h', NULL),
	('a542e161-b0b6-4cf5-b4ff-6052b1d164b5', 'gated_access', NULL),
	('a542e161-b0b6-4cf5-b4ff-6052b1d164b5', 'restroom', NULL),
	('a542e161-b0b6-4cf5-b4ff-6052b1d164b5', 'shuttle_free', NULL),
	('a8764272-51a8-4fda-bbba-ee19b345deb5', 'cameras_24h', NULL),
	('a8764272-51a8-4fda-bbba-ee19b345deb5', 'on_site_24h', NULL),
	('a8764272-51a8-4fda-bbba-ee19b345deb5', 'gated_access', NULL),
	('a8764272-51a8-4fda-bbba-ee19b345deb5', 'restroom', NULL),
	('a8764272-51a8-4fda-bbba-ee19b345deb5', 'shuttle_free', NULL),
	('a8764272-51a8-4fda-bbba-ee19b345deb5', 'flight_insurance', NULL),
	('c82d2dc0-7304-4bb3-9989-bf99886cd698', 'cameras_24h', NULL),
	('c82d2dc0-7304-4bb3-9989-bf99886cd698', 'on_site_24h', NULL),
	('c82d2dc0-7304-4bb3-9989-bf99886cd698', 'gated_access', NULL),
	('c82d2dc0-7304-4bb3-9989-bf99886cd698', 'restroom', NULL),
	('c82d2dc0-7304-4bb3-9989-bf99886cd698', 'shuttle_free', NULL),
	('c82d2dc0-7304-4bb3-9989-bf99886cd698', 'self_park', NULL),
	('c82d2dc0-7304-4bb3-9989-bf99886cd698', 'flight_insurance', NULL),
	('e08bf622-eb9f-41eb-8fe3-9c9f2c124938', 'cameras_24h', NULL),
	('e08bf622-eb9f-41eb-8fe3-9c9f2c124938', 'on_site_24h', NULL),
	('e08bf622-eb9f-41eb-8fe3-9c9f2c124938', 'gated_access', NULL),
	('e08bf622-eb9f-41eb-8fe3-9c9f2c124938', 'restroom', NULL),
	('e08bf622-eb9f-41eb-8fe3-9c9f2c124938', 'shuttle_free', NULL),
	('ee498126-1a0a-427f-945f-50b141b7bbcb', 'cameras_24h', NULL),
	('ee498126-1a0a-427f-945f-50b141b7bbcb', 'on_site_24h', NULL),
	('ee498126-1a0a-427f-945f-50b141b7bbcb', 'gated_access', NULL),
	('ee498126-1a0a-427f-945f-50b141b7bbcb', 'restroom', NULL),
	('ee498126-1a0a-427f-945f-50b141b7bbcb', 'shuttle_free', NULL),
	('ee498126-1a0a-427f-945f-50b141b7bbcb', 'self_park', NULL),
	('ee498126-1a0a-427f-945f-50b141b7bbcb', 'motorcycle', NULL),
	('ef6a2dd5-35a3-4c6c-8b1b-b03f7369c242', 'cameras_24h', NULL),
	('ef6a2dd5-35a3-4c6c-8b1b-b03f7369c242', 'on_site_24h', NULL),
	('ef6a2dd5-35a3-4c6c-8b1b-b03f7369c242', 'gated_access', NULL),
	('ef6a2dd5-35a3-4c6c-8b1b-b03f7369c242', 'restroom', NULL),
	('ef6a2dd5-35a3-4c6c-8b1b-b03f7369c242', 'shuttle_free', NULL),
	('ef6a2dd5-35a3-4c6c-8b1b-b03f7369c242', 'valet', NULL),
	('ef6a2dd5-35a3-4c6c-8b1b-b03f7369c242', 'battery_service', NULL),
	('ef6a2dd5-35a3-4c6c-8b1b-b03f7369c242', 'cover_protection', NULL),
	('ef6a2dd5-35a3-4c6c-8b1b-b03f7369c242', 'flight_insurance', NULL),
	('f4a03216-b186-4cf2-8202-fbb0238b22e3', 'cameras_24h', NULL),
	('f4a03216-b186-4cf2-8202-fbb0238b22e3', 'on_site_24h', NULL),
	('f4a03216-b186-4cf2-8202-fbb0238b22e3', 'gated_access', NULL),
	('f4a03216-b186-4cf2-8202-fbb0238b22e3', 'restroom', NULL),
	('f4a03216-b186-4cf2-8202-fbb0238b22e3', 'shuttle_free', NULL),
	('f4a03216-b186-4cf2-8202-fbb0238b22e3', 'self_park', NULL),
	('fd6290d0-615e-47c2-a9af-38b64d49448d', 'cameras_24h', NULL),
	('fd6290d0-615e-47c2-a9af-38b64d49448d', 'on_site_24h', NULL),
	('fd6290d0-615e-47c2-a9af-38b64d49448d', 'gated_access', NULL),
	('fd6290d0-615e-47c2-a9af-38b64d49448d', 'restroom', NULL),
	('fd6290d0-615e-47c2-a9af-38b64d49448d', 'shuttle_free', NULL),
	('fd6290d0-615e-47c2-a9af-38b64d49448d', 'self_park', NULL);


--
-- Data for Name: location_parking_type; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."location_parking_type" ("id", "location_id", "company_parking_type_id", "capacity", "is_active", "created_at", "updated_at", "near_capacity_threshold", "near_capacity_message", "has_minimum_stay", "minimum_stay_value", "minimum_stay_unit", "has_minimum_date", "minimum_date") VALUES
	('b19a4ecc-a201-4574-b662-b03e36127efd', '263e8063-ce1e-46a6-9ad6-68cf1bf58860', '12a48c46-5004-4a9b-81d3-b53275ac64fb', 80, true, '2026-05-25 14:44:10.135186+00', '2026-05-26 17:37:34.989497+00', 10, NULL, false, NULL, NULL, false, NULL),
	('b2839617-413d-40e8-87fc-39c2bec7431f', '263e8063-ce1e-46a6-9ad6-68cf1bf58860', '6b73473f-6c11-4a57-9cc3-397b31b5795d', 120, true, '2026-05-25 14:44:10.135186+00', '2026-05-26 17:37:34.989497+00', 12, NULL, false, NULL, NULL, false, NULL),
	('64f3ee49-3924-456c-902e-d3f884cf49aa', '263e8063-ce1e-46a6-9ad6-68cf1bf58860', '2dc69bb5-b257-4e3b-aa84-24137fd105f9', 15, true, '2026-05-25 14:44:10.135186+00', '2026-05-26 17:37:34.989497+00', 3, NULL, false, NULL, NULL, false, NULL),
	('d4408204-da31-4d82-ba4a-d0e273e7eab7', 'ef6a2dd5-35a3-4c6c-8b1b-b03f7369c242', '46e60435-2e37-48ea-9e49-ce12112a4deb', 320, true, '2026-05-25 14:44:10.135186+00', '2026-05-26 17:37:34.989497+00', 30, NULL, false, NULL, NULL, false, NULL),
	('ec92b4c0-6355-4e6a-a813-0bebe12439a4', 'ef6a2dd5-35a3-4c6c-8b1b-b03f7369c242', 'edb3d56f-0244-4d6e-8c5e-8eaba8717987', 300, true, '2026-05-25 14:44:10.135186+00', '2026-05-26 17:37:34.989497+00', 30, NULL, false, NULL, NULL, false, NULL),
	('6b468aae-d8aa-41cb-9953-898f4b2c22fc', 'a8764272-51a8-4fda-bbba-ee19b345deb5', 'f59e2eb9-5a21-40dd-8566-efc38d9cf517', 150, true, '2026-05-25 14:44:10.135186+00', '2026-05-26 17:37:34.989497+00', 15, NULL, false, NULL, NULL, false, NULL),
	('1477579e-9fd6-4134-ac2d-8ca001e1c464', '0d9bf7bf-811f-42df-959d-8accbe92b76b', 'bb95148f-e7da-4570-90fa-cab91cb66f17', 500, true, '2026-05-25 14:44:10.135186+00', '2026-05-26 17:37:34.989497+00', 50, NULL, false, NULL, NULL, false, NULL),
	('0a30a8f3-8a28-4889-982e-c568787cdada', 'e08bf622-eb9f-41eb-8fe3-9c9f2c124938', 'f59e2eb9-5a21-40dd-8566-efc38d9cf517', 400, true, '2026-05-25 14:44:10.135186+00', '2026-05-26 17:37:34.989497+00', 40, NULL, false, NULL, NULL, false, NULL),
	('489fcd06-64a1-4c99-96e4-e255e7d5af68', 'c82d2dc0-7304-4bb3-9989-bf99886cd698', '69462a09-e46d-4fc3-af0f-29536426af95', 370, true, '2026-05-25 14:44:10.135186+00', '2026-05-26 17:37:34.989497+00', 37, NULL, false, NULL, NULL, false, NULL),
	('f1d6debb-456a-4925-96b7-98b654c3ceb4', '70fd4973-b39c-497c-a423-541c8a3f148f', 'f7b88e51-6e30-4ea4-866e-a4a55a02754c', 15, true, '2026-05-25 14:44:10.135186+00', '2026-05-26 17:37:34.989497+00', 3, NULL, false, NULL, NULL, false, NULL),
	('742562fa-3a9c-4690-a610-8d203ed63a70', '1e9f8228-2d2e-4ca8-8dd6-093999578908', '53079988-429e-4c7e-95c2-8e9b1ee64698', 300, true, '2026-05-25 14:44:10.135186+00', '2026-05-26 17:37:34.989497+00', 30, NULL, false, NULL, NULL, false, NULL),
	('9c332d01-4d2a-44e1-9785-e6d375745f19', 'a542e161-b0b6-4cf5-b4ff-6052b1d164b5', 'e4586aab-2c54-4c32-bcdb-1292b077f275', 1100, true, '2026-05-25 14:44:10.135186+00', '2026-05-26 17:37:34.989497+00', 110, NULL, false, NULL, NULL, false, NULL),
	('9e5eef7a-6333-486d-9178-f7586e2202c1', 'fd6290d0-615e-47c2-a9af-38b64d49448d', 'f878351e-5675-4f95-bd20-74aa67e52c7e', 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('c006c33a-070b-47b1-b645-e851569ed71f', '6e60b2d3-4de9-4385-bab2-920ca4bdf257', 'f878351e-5675-4f95-bd20-74aa67e52c7e', 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('5b117eac-0faf-429c-b957-1fa6229a5c99', '6e60b2d3-4de9-4385-bab2-920ca4bdf257', 'ba1f7cc3-b8ef-455f-9e83-a39603cc60f2', 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('9b346114-2a39-4149-a05c-7a0d472d5aef', '32abd148-da4e-4aa9-b91c-542f7f69ef99', '720976df-5712-4672-9f47-67a10b2747e1', 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('30af35e0-5fa5-41ef-b4ed-0cd5e8b0f6b3', '32abd148-da4e-4aa9-b91c-542f7f69ef99', '67038ffc-287d-40d0-aaf6-7d51305d5745', 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('8e74a6c0-09db-4c39-8e2b-152d3a40a86e', 'ee498126-1a0a-427f-945f-50b141b7bbcb', '059e47c4-9563-496b-bc66-fa16d6c340e9', 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('443e0a9c-14d8-4b9b-9e7a-f90d125c2790', 'ee498126-1a0a-427f-945f-50b141b7bbcb', '43c065b5-6a64-4bb3-8e3a-65b76397a406', 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('c52c5553-5c92-43fb-bc6a-d0e4a3c72070', '4c7be617-e5ea-4f8f-b247-7d9475827663', '4342ed56-1ced-4f7a-bd12-4d658da9a752', 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('244e6a06-d3ce-4086-9159-8ec5d1188811', '54acabaa-2292-4999-9100-fc301cb3fad1', '1cc072c7-1569-4d9a-bb45-1c99e6c49ac3', 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('d0e3d12e-ad7f-458c-8076-2152bbe074cd', '54acabaa-2292-4999-9100-fc301cb3fad1', '9b819287-7df0-4cae-a685-8f0e962e1f14', 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('ec3fbbdc-09ef-48db-8f49-c22d5a579292', 'f4a03216-b186-4cf2-8202-fbb0238b22e3', '029f3dc8-87ac-47fe-8cc0-7d85c8d70946', 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('0d63d45d-c687-409e-8eff-c337ec33fc70', 'f4a03216-b186-4cf2-8202-fbb0238b22e3', 'b9aa04d8-e77b-42e8-8acb-1d38d7e141f4', 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('7be9ac1f-cc8d-4a79-839e-85ce11fd6992', 'ef6a2dd5-35a3-4c6c-8b1b-b03f7369c242', 'ff464343-3cfe-48c4-b5b4-76137c4a881f', 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('4f9c7601-0a3b-4794-9be9-34705b21930f', '70fd4973-b39c-497c-a423-541c8a3f148f', 'c696b0d8-d9a6-4b20-90c2-cd93eb8a07af', 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('82d0d247-363d-4fe0-bfba-a0eed52ca93c', '70fd4973-b39c-497c-a423-541c8a3f148f', 'eddad237-7193-441f-bf49-7f72cda1489e', 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('7c9d7b27-51e2-4f97-96cf-5d2cb15d8fbc', '0d9bf7bf-811f-42df-959d-8accbe92b76b', 'f59e2eb9-5a21-40dd-8566-efc38d9cf517', 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('e04e65d0-fc1e-4aa1-ad34-2e5905c6785c', '0d9bf7bf-811f-42df-959d-8accbe92b76b', 'eee4060d-291f-49b2-ad46-d8e374c18e6d', 100, true, '2026-05-25 14:44:10.135186+00', '2026-05-27 16:58:38.742614+00', NULL, NULL, false, NULL, NULL, false, NULL),
	('dcc2cdc2-e912-4345-98cc-0a5a90f56270', 'fd6290d0-615e-47c2-a9af-38b64d49448d', 'ba1f7cc3-b8ef-455f-9e83-a39603cc60f2', 100, true, '2026-05-27 16:58:38.742614+00', '2026-05-28 22:04:26.363266+00', NULL, NULL, false, NULL, NULL, false, NULL);


--
-- Data for Name: location_photo; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: pricing_rule; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."pricing_rule" ("id", "location_parking_type_id", "strategy", "fractional_day_policy", "fractional_day_tolerance", "old_price_strategy", "old_price_multiplier", "incremental_one_day_price", "incremental_two_days_price", "incremental_base", "incremental_multiplier", "monthly_fixed_price", "monthly_daily_rate", "hourly_initial_rate", "hourly_one_hour_rate", "hourly_fraction_rate", "hourly_daily_rate", "hourly_hours_per_day", "surcharge_source_id", "surcharge_multiplier", "advance_booking_minutes", "operating_hours", "created_at", "updated_at") VALUES
	('196a60c7-25b7-4c00-aa57-debb5967457b', 'b19a4ecc-a201-4574-b662-b03e36127efd', 'tiered_progressive', 'threshold_with_minutes', NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-26 14:49:35.961797+00'),
	('7fd22a07-48cc-4591-b7ff-a1cfb0aa5ef7', 'b2839617-413d-40e8-87fc-39c2bec7431f', 'tiered_progressive', 'threshold_with_minutes', NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-26 14:49:35.961797+00'),
	('cdd14bac-72e3-4159-acca-9f6c4430efb5', 'd4408204-da31-4d82-ba4a-d0e273e7eab7', 'uniform_by_duration', 'any_extra', NULL, 'multiplier', 1.2000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-26 14:49:35.961797+00'),
	('28b41941-cb2b-456d-ba83-1ab32c007623', '7be9ac1f-cc8d-4a79-839e-85ce11fd6992', 'fixed_bracket', 'any_extra', NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-26 14:49:35.961797+00'),
	('e6893298-9619-4098-8653-5a669f9ed3d8', '742562fa-3a9c-4690-a610-8d203ed63a70', 'uniform_by_duration', 'any_extra', NULL, 'own_table', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-26 14:49:35.961797+00'),
	('c1db06a3-1357-4cef-a86c-57ad2761667d', '6b468aae-d8aa-41cb-9953-898f4b2c22fc', 'uniform_by_duration', 'any_extra', NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-26 18:01:53.535059+00'),
	('3c01b0ba-9b44-49ee-8343-e6a6e893c5ff', '7c9d7b27-51e2-4f97-96cf-5d2cb15d8fbc', 'uniform_by_duration', 'any_extra', NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-26 18:01:53.535059+00'),
	('8b020701-0b9c-4168-9682-5172b81256d2', '0a30a8f3-8a28-4889-982e-c568787cdada', 'uniform_by_duration', 'any_extra', NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-26 18:01:53.535059+00'),
	('4d7bb576-1352-40dc-8d86-1fdd3564a39d', '1477579e-9fd6-4134-ac2d-8ca001e1c464', 'uniform_by_duration', 'any_extra', NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-26 18:01:53.535059+00'),
	('0c71c63d-95b5-4896-bd5e-c628d5d6e9d3', '489fcd06-64a1-4c99-96e4-e255e7d5af68', 'fixed_bracket', 'hour_tolerance', 1.00, 'own_table', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-26 18:01:53.535059+00'),
	('2a403205-3781-4a4d-a6e7-2db2d7a11fb7', '9c332d01-4d2a-44e1-9785-e6d375745f19', 'fixed_bracket', 'hour_tolerance', 1.00, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-26 18:01:53.535059+00'),
	('770df66f-53f9-4b75-b470-7e3a3fb166fc', '64f3ee49-3924-456c-902e-d3f884cf49aa', 'fixed_bracket', 'none', NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'b19a4ecc-a201-4574-b662-b03e36127efd', 1.3000, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-26 18:06:48.066538+00'),
	('b6033f7b-5c10-4f14-af9b-c27fbb4d2657', 'e04e65d0-fc1e-4aa1-ad34-2e5905c6785c', 'surcharge', 'none', NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '7be9ac1f-cc8d-4a79-839e-85ce11fd6992', 1.0000, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-26 20:28:03.17933+00'),
	('42b2b3af-3700-4bf1-9750-021b2748b512', '4f9c7601-0a3b-4794-9be9-34705b21930f', 'fixed_bracket', 'any_extra', NULL, 'multiplier', 1.1000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-27 12:17:47.753634+00'),
	('1ce1e5f5-d193-48a2-b196-34fa4ea4f5d7', '82d0d247-363d-4fe0-bfba-a0eed52ca93c', 'fixed_bracket', 'any_extra', NULL, 'multiplier', 1.1000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-27 12:17:47.753634+00'),
	('915d9b99-7f32-4868-879a-392e0e347288', 'f1d6debb-456a-4925-96b7-98b654c3ceb4', 'uniform_by_duration', 'none', NULL, 'multiplier', 1.1000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '4f9c7601-0a3b-4794-9be9-34705b21930f', 1.2500, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-27 12:17:47.753634+00'),
	('c7b108c3-149c-41e6-8cdb-1a956225fccd', 'ec92b4c0-6355-4e6a-a813-0bebe12439a4', 'uniform_by_duration', 'any_extra', NULL, 'multiplier', 1.2000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-26 14:49:35.961797+00', '2026-05-28 21:59:09.107586+00'),
	('e9721d08-5600-4629-a8f7-8dafebde0778', 'dcc2cdc2-e912-4345-98cc-0a5a90f56270', 'incremental_formula', 'time_of_day', 1.00, 'none', NULL, 25.00, 28.00, 10.00, 9.0000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-28 21:59:09.107586+00', '2026-05-28 21:59:09.107586+00'),
	('d26f7537-25b4-4d15-91f8-e7ef7fb6010e', '9e5eef7a-6333-486d-9178-f7586e2202c1', 'incremental_formula', 'time_of_day', 1.00, 'none', NULL, 20.00, 20.00, 10.00, 5.0000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-28 21:59:09.107586+00', '2026-05-28 21:59:09.107586+00'),
	('153a7366-41f6-4675-85ba-6fb28a5ae4d4', '5b117eac-0faf-429c-b957-1fa6229a5c99', 'incremental_formula', 'time_of_day', 1.00, 'none', NULL, 25.00, 28.00, 10.00, 9.0000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-28 21:59:09.107586+00', '2026-05-28 21:59:09.107586+00'),
	('787c598c-4c92-4e62-a7c8-9852c1cee3fd', 'c006c33a-070b-47b1-b645-e851569ed71f', 'incremental_formula', 'time_of_day', 1.00, 'none', NULL, 20.00, 24.00, 10.00, 7.0000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-28 21:59:09.107586+00', '2026-05-28 21:59:09.107586+00'),
	('01776207-f8e2-4ae0-815c-7530a11bfcfb', 'd0e3d12e-ad7f-458c-8076-2152bbe074cd', 'incremental_formula', 'time_of_day', 1.00, 'none', NULL, 25.00, 26.00, 10.00, 8.0000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-28 21:59:09.107586+00', '2026-05-28 21:59:09.107586+00'),
	('535d7bc4-0094-4367-8dbc-5c875c109306', '244e6a06-d3ce-4086-9159-8ec5d1188811', 'incremental_formula', 'time_of_day', 1.00, 'none', NULL, 20.00, 22.00, 10.00, 6.0000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-28 21:59:09.107586+00', '2026-05-28 21:59:09.107586+00'),
	('e9bf93dd-8395-4a27-b9fb-e5e33552d7b6', '0d63d45d-c687-409e-8eff-c337ec33fc70', 'incremental_formula', 'time_of_day', 1.00, 'none', NULL, 25.00, 24.00, 10.00, 7.0000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-28 21:59:09.107586+00', '2026-05-28 21:59:09.107586+00'),
	('243cb5de-ad90-4432-a5b7-46de38ff21cf', 'ec3fbbdc-09ef-48db-8f49-c22d5a579292', 'incremental_formula', 'time_of_day', 1.00, 'none', NULL, 20.00, 20.00, 10.00, 5.0000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-28 21:59:09.107586+00', '2026-05-28 21:59:09.107586+00'),
	('fc7a46aa-fea1-43fa-b311-a5cdbea1a15f', '30af35e0-5fa5-41ef-b4ed-0cd5e8b0f6b3', 'monthly_remainder', 'any_extra', NULL, 'none', NULL, NULL, NULL, NULL, NULL, 310.00, 21.99, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-28 21:59:09.107586+00', '2026-05-28 21:59:09.107586+00'),
	('59b9100c-2a01-435b-b5c7-2946484d1b2d', '9b346114-2a39-4149-a05c-7a0d472d5aef', 'monthly_remainder', 'any_extra', NULL, 'none', NULL, NULL, NULL, NULL, NULL, 220.00, 14.99, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-28 21:59:09.107586+00', '2026-05-28 21:59:09.107586+00'),
	('b289120d-d15f-4d24-aa31-c15ae61e8e7b', '443e0a9c-14d8-4b9b-9e7a-f90d125c2790', 'hourly_capped', 'none', NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7.00, 10.00, 3.00, 20.00, 13, NULL, NULL, NULL, '{"sunday": null, "mon-fri": {"open": "07:00", "close": "20:00"}, "saturday": {"open": "08:00", "close": "17:00"}}', '2026-05-28 21:59:09.107586+00', '2026-05-28 21:59:09.107586+00'),
	('b64dac3e-b06c-47e9-a270-9d1080dff6f5', '8e74a6c0-09db-4c39-8e2b-152d3a40a86e', 'hourly_capped', 'none', NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3.50, 5.00, 1.50, 10.00, 13, NULL, NULL, NULL, '{"sunday": null, "mon-fri": {"open": "07:00", "close": "20:00"}, "saturday": {"open": "08:00", "close": "17:00"}}', '2026-05-28 21:59:09.107586+00', '2026-05-28 21:59:09.107586+00'),
	('c88e168e-8ac5-4cfa-ab88-dfaea50f86a6', 'c52c5553-5c92-43fb-bc6a-d0e4a3c72070', 'tiered_progressive', 'any_extra', NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-28 21:59:09.107586+00', '2026-05-28 21:59:09.107586+00');


--
-- Data for Name: pricing_hourly_bracket; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: pricing_tier; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."pricing_tier" ("id", "pricing_rule_id", "from_day", "to_day", "unit_price", "total_price", "is_old_price") VALUES
	('6773d081-cc67-4d3f-af1b-6a4fa87e8151', '196a60c7-25b7-4c00-aa57-debb5967457b', 1, 6, 19.90, NULL, false),
	('cbc1d08a-eb38-47e7-ada4-21998f42a760', '196a60c7-25b7-4c00-aa57-debb5967457b', 7, 14, 21.90, NULL, false),
	('c5af5fe2-5940-4ca8-9599-a88facf37cab', '196a60c7-25b7-4c00-aa57-debb5967457b', 15, NULL, 23.90, NULL, false),
	('b79d45ac-abcc-43e6-bbb2-1e55e02529dc', '7fd22a07-48cc-4591-b7ff-a1cfb0aa5ef7', 1, 6, 16.90, NULL, false),
	('79d1a231-bb3f-46ba-bb6f-72a6df4218d0', '7fd22a07-48cc-4591-b7ff-a1cfb0aa5ef7', 7, 14, 18.90, NULL, false),
	('6351294c-f9c5-4da2-8588-2f78b0469097', '7fd22a07-48cc-4591-b7ff-a1cfb0aa5ef7', 15, NULL, 20.90, NULL, false),
	('cfcd058d-e808-40b2-b81f-5a8a811e5a0c', 'cdd14bac-72e3-4159-acca-9f6c4430efb5', 1, 5, 27.90, NULL, false),
	('150cd38c-e2a0-408b-b97b-4fe158f020e9', 'cdd14bac-72e3-4159-acca-9f6c4430efb5', 6, 15, 23.90, NULL, false),
	('b06c28ab-e635-4e8b-9758-db65f6e36b18', 'cdd14bac-72e3-4159-acca-9f6c4430efb5', 16, NULL, 20.90, NULL, false),
	('b4434a41-96ab-47b4-a660-8de096f9db0e', '28b41941-cb2b-456d-ba83-1ab32c007623', 1, 1, NULL, 149.00, false),
	('5530a5a8-c6b7-4c41-81bc-3a8de9631039', '28b41941-cb2b-456d-ba83-1ab32c007623', 2, 2, NULL, 198.00, false),
	('df82ed7d-abec-4858-81eb-0c9e511febf8', '28b41941-cb2b-456d-ba83-1ab32c007623', 3, 3, NULL, 297.00, false),
	('9b5f98a4-c764-4dc5-9a5d-17d23b05ebbf', '28b41941-cb2b-456d-ba83-1ab32c007623', 4, 4, NULL, 396.00, false),
	('c86abee2-f498-4a78-a0f5-e18cc3835880', '28b41941-cb2b-456d-ba83-1ab32c007623', 5, 5, NULL, 495.00, false),
	('71844602-c612-4fb0-95f4-2392232cb005', '28b41941-cb2b-456d-ba83-1ab32c007623', 6, 10, NULL, 594.00, false),
	('e1f0e214-31bc-4ceb-b3e6-203c227d1a6a', '28b41941-cb2b-456d-ba83-1ab32c007623', 11, 17, NULL, 693.00, false),
	('d7720968-160f-472f-9d45-00f8a5009a58', '28b41941-cb2b-456d-ba83-1ab32c007623', 18, 30, NULL, 792.00, false),
	('6b85f4b4-2ab3-45aa-8aa9-49276e81be51', '28b41941-cb2b-456d-ba83-1ab32c007623', 31, NULL, 26.40, NULL, false),
	('743e7fe6-c62f-49f4-b487-ec076dfde68f', '3c01b0ba-9b44-49ee-8343-e6a6e893c5ff', 1, 5, 26.90, NULL, false),
	('0c46eb24-f724-40e6-9fb8-050eed46320f', '3c01b0ba-9b44-49ee-8343-e6a6e893c5ff', 6, 14, 22.90, NULL, false),
	('43b0650d-c626-481b-aa18-79afe1899266', '3c01b0ba-9b44-49ee-8343-e6a6e893c5ff', 15, NULL, 19.90, NULL, false),
	('f66f08e1-e89d-456f-83d2-f1aa0252bc93', '4d7bb576-1352-40dc-8d86-1fdd3564a39d', 1, 5, 18.90, NULL, false),
	('4db9f284-f5dd-4742-94be-b60d2ac115f1', '4d7bb576-1352-40dc-8d86-1fdd3564a39d', 6, 14, 15.90, NULL, false),
	('7ea55e07-3f45-48df-83d0-3b44ab4638d9', '4d7bb576-1352-40dc-8d86-1fdd3564a39d', 15, NULL, 13.90, NULL, false),
	('9de574c6-e7e6-48b0-b960-fa5bc4d589a7', '0c71c63d-95b5-4896-bd5e-c628d5d6e9d3', 1, 1, NULL, 59.99, false),
	('8a26a913-c20a-43ee-8aac-e18252a37417', '0c71c63d-95b5-4896-bd5e-c628d5d6e9d3', 2, NULL, 38.00, NULL, false),
	('c94638ff-ea30-49d6-a670-3da10b749fce', '42b2b3af-3700-4bf1-9750-021b2748b512', 1, 1, NULL, 48.90, false),
	('7a10f461-bc8e-4690-ae7c-37137aca9fa7', '42b2b3af-3700-4bf1-9750-021b2748b512', 2, 2, NULL, 74.90, false),
	('d8ac4ef5-7731-43bd-ae81-150187bbca98', '42b2b3af-3700-4bf1-9750-021b2748b512', 3, 5, 29.90, NULL, false),
	('c7840e9f-9478-4aae-92da-7a4bdc0e5369', '42b2b3af-3700-4bf1-9750-021b2748b512', 6, 15, 24.90, NULL, false),
	('b2a6816a-f0b7-4179-922c-b15da3f441f0', '42b2b3af-3700-4bf1-9750-021b2748b512', 16, NULL, 21.90, NULL, false),
	('537ce35a-b055-449d-8c44-8bc57965cf3e', '1ce1e5f5-d193-48a2-b196-34fa4ea4f5d7', 1, 1, NULL, 38.90, false),
	('0465ee8c-e6b4-4405-9a13-edd4ab95e152', '1ce1e5f5-d193-48a2-b196-34fa4ea4f5d7', 2, 2, NULL, 58.90, false),
	('77451e80-75c9-4e45-ad2b-f5b302f95cc3', '1ce1e5f5-d193-48a2-b196-34fa4ea4f5d7', 3, 5, 20.90, NULL, false),
	('d8893ddd-2828-4151-b3f2-ffc772310619', '1ce1e5f5-d193-48a2-b196-34fa4ea4f5d7', 6, 15, 19.90, NULL, false),
	('e2ab456a-f2af-4754-8d6e-d0cd7d398102', '1ce1e5f5-d193-48a2-b196-34fa4ea4f5d7', 16, NULL, 17.90, NULL, false),
	('0dd69c1a-21a5-4e99-981e-175a98f03a6d', 'e6893298-9619-4098-8653-5a669f9ed3d8', 1, 6, 30.00, NULL, false),
	('fd770176-135a-4ace-adf7-3d49ce06cb34', 'e6893298-9619-4098-8653-5a669f9ed3d8', 7, 14, 25.00, NULL, false),
	('6e5ba6ca-fc3e-4738-a406-a45652ee5285', 'e6893298-9619-4098-8653-5a669f9ed3d8', 15, NULL, 20.00, NULL, false),
	('9202a5fe-7e93-454a-baeb-db6822956608', '2a403205-3781-4a4d-a6e7-2db2d7a11fb7', 1, 1, NULL, 40.00, false),
	('20ea2f26-fb9c-44b4-b174-a1c050402e35', '2a403205-3781-4a4d-a6e7-2db2d7a11fb7', 2, 6, 29.90, NULL, false),
	('84f8b861-dea8-4ca3-92e1-f56aa024d7c8', '2a403205-3781-4a4d-a6e7-2db2d7a11fb7', 7, 14, 17.90, NULL, false),
	('9d7b9b99-c191-45d8-afc2-d14fb2505f0d', '2a403205-3781-4a4d-a6e7-2db2d7a11fb7', 15, NULL, 19.90, NULL, false),
	('0cc0a000-cd49-4bda-9310-7f2e3db2621d', '915d9b99-7f32-4868-879a-392e0e347288', 1, NULL, 26.90, NULL, false),
	('a6d86022-bc7b-4d77-ac7f-29248cca2a4b', '770df66f-53f9-4b75-b470-7e3a3fb166fc', 1, 1, NULL, 38.90, false),
	('ccca1a5e-8d8f-421b-ae0f-81707ae643ae', '770df66f-53f9-4b75-b470-7e3a3fb166fc', 2, 2, NULL, 61.80, false),
	('ec3ab0ca-3d80-47c6-9bd1-1e4faf1241da', '770df66f-53f9-4b75-b470-7e3a3fb166fc', 3, 3, NULL, 80.70, false),
	('e6fae7e4-d0bd-46e4-96af-ed7bb6575c03', '770df66f-53f9-4b75-b470-7e3a3fb166fc', 4, 4, NULL, 99.60, false),
	('a106de0c-e989-4ae0-bda3-79fe9c5aef15', '770df66f-53f9-4b75-b470-7e3a3fb166fc', 5, 6, 23.90, NULL, false),
	('10ce09e0-9312-4af8-8b0f-8873ce367743', '770df66f-53f9-4b75-b470-7e3a3fb166fc', 7, 14, 25.90, NULL, false),
	('e8b19b11-3dcd-471a-a3a1-937a3d1ab21d', '770df66f-53f9-4b75-b470-7e3a3fb166fc', 15, NULL, 27.90, NULL, false),
	('20a297c2-dd48-45cf-9012-dc10c99a2901', 'c1db06a3-1357-4cef-a86c-57ad2761667d', 1, 6, 31.90, NULL, false),
	('7e23b8c1-6384-4a3f-8e56-9a2b0ce75010', 'c1db06a3-1357-4cef-a86c-57ad2761667d', 7, 14, 28.90, NULL, false),
	('9b95c740-0f59-4c79-a27c-389ee3c29215', 'c1db06a3-1357-4cef-a86c-57ad2761667d', 15, NULL, 24.90, NULL, false),
	('51f7bb59-4155-4cbe-94fd-a87e50f9a0f0', '8b020701-0b9c-4168-9682-5172b81256d2', 1, NULL, 24.99, NULL, false),
	('ac70fd17-20b3-48ed-9da4-78cd05782447', 'c7b108c3-149c-41e6-8cdb-1a956225fccd', 1, 5, 19.90, NULL, false),
	('acd8cb71-8c78-41c5-9e9f-c12fc8366949', 'c7b108c3-149c-41e6-8cdb-1a956225fccd', 6, 15, 17.90, NULL, false),
	('4c8ed13b-bab7-4219-8c75-8b4c7820cafd', 'c7b108c3-149c-41e6-8cdb-1a956225fccd', 16, NULL, 14.90, NULL, false),
	('2ec3138a-7e56-4b78-be1f-e6db87976431', 'c88e168e-8ac5-4cfa-ab88-dfaea50f86a6', 1, 2, 28.00, NULL, false),
	('347e7d12-2650-43ca-be88-7525bf2622c2', 'c88e168e-8ac5-4cfa-ab88-dfaea50f86a6', 3, 7, 22.00, NULL, false),
	('5b1dc57a-386b-4782-aa18-c0f526323ff6', 'c88e168e-8ac5-4cfa-ab88-dfaea50f86a6', 8, NULL, 18.00, NULL, false);


--
-- PostgreSQL database dump complete
--

-- \unrestrict 7Gn0pcrLTPNXDQS9iaNSvYGej7bvuOt3NezIuYMHeAaRePTNVRhkvxQhSpMgOT2

RESET ALL;
