-- AIRVER delivery tariff -> Supabase table shipping_rates (wilaya_code, home_fee, office_fee)
-- home_fee = Domicile, office_fee = Stopdesk. NULL = no delivery for that mode.
-- Run in Supabase > SQL Editor. Wilayas 59-69 are not in the tariff, so they are removed (nothing is delivered there).
begin;
alter table shipping_rates alter column home_fee drop not null;
alter table shipping_rates alter column office_fee drop not null;
delete from shipping_rates;
insert into shipping_rates (wilaya_code, home_fee, office_fee) values
  (1, 1200, 900),  -- Adrar
  (2, 850, 450),  -- Chlef
  (3, 950, 550),  -- Laghouat
  (4, 850, 450),  -- Oum El Bouaghi
  (5, 900, 450),  -- Batna
  (6, 800, 450),  -- Bejaia
  (7, 950, 550),  -- Biskra
  (8, 1000, 650),  -- Bechar
  (9, 600, 400),  -- Blida
  (10, 800, 450),  -- Bouira
  (11, 1500, 1050),  -- Tamanrasset
  (12, 900, 500),  -- Tebessa
  (13, 900, 500),  -- Tlemcen
  (14, 850, 450),  -- Tiaret
  (15, 750, 450),  -- Tizi Ouzou
  (16, 450, 300),  -- Alger
  (17, 950, 500),  -- Djelfa
  (18, 900, 450),  -- Jijel
  (19, 800, 450),  -- Setif
  (20, 900, 450),  -- Saida
  (21, 900, 450),  -- Skikda
  (22, 900, 450),  -- Sidi Bel Abbes
  (23, 850, 450),  -- Annaba
  (24, 900, 450),  -- Guelma
  (25, 800, 450),  -- Constantine
  (26, 800, 450),  -- Medea
  (27, 900, 450),  -- Mostaganem
  (28, 850, 500),  -- M'Sila
  (29, 900, 450),  -- Mascara
  (30, 950, 600),  -- Ouargla
  (31, 800, 450),  -- Oran
  (32, 1000, 600),  -- El Bayadh
  (33, null, null),  -- Illizi
  (34, 800, 450),  -- Bordj Bou Arreridj
  (35, 700, 450),  -- Boumerdes
  (36, 850, 450),  -- El Tarf
  (37, null, null),  -- Tindouf
  (38, 900, 500),  -- Tissemsilt
  (39, 950, 600),  -- El Oued
  (40, 900, 450),  -- Khenchela
  (41, 900, 450),  -- Souk Ahras
  (42, 700, 450),  -- Tipaza
  (43, 900, 450),  -- Mila
  (44, 900, 450),  -- Ain Defla
  (45, 950, 650),  -- Naama
  (46, 900, 450),  -- Ain Temouchent
  (47, 950, 550),  -- Ghardaia
  (48, 900, 450),  -- Relizane
  (49, 1200, 900),  -- Timimoun
  (50, null, null),  -- Bordj Badji Mokhtar
  (51, 950, 550),  -- Ouled Djellal
  (52, 950, 900),  -- Beni Abbes
  (53, 1500, 1100),  -- In Salah
  (54, 1500, null),  -- In Guezzam
  (55, 950, 600),  -- Touggourt
  (56, null, null),  -- Djanet
  (57, 950, null),  -- M'Ghair
  (58, 950, 800)  -- Meniaa;
commit;
