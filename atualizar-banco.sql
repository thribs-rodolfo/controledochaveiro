-- ============================================================
-- CONTROLE DO CHAVEIRO (MyKey) — MIGRACAO UNICA PARA A V4
-- ============================================================
-- Use este script para ATUALIZAR um banco que JA EXISTE.
-- Para banco NOVO, use criar-banco.sql.
--
-- Funciona para qualquer estado anterior, SEM apagar dados:
--   * versao antes da correcao de ativacao no banco (ex.: Luciano)
--   * versao depois da correcao de ativacao no banco (ex.: Ricardinho)
--   * versao final da exportacao (ex.: Joel)
-- Tudo idempotente (auto-detecta o estado) e seguro re-executar.
--
-- Composto de 3 partes, nesta ordem:
--   PARTE 1 — leva de v1/v2/v3 ate v4 (tabelas, licenca/ativacao,
--             equivalencias, produtos, categorias, estoque fonte-unica)
--   PARTE 2 — consolida 'chaves' + 'produtos' duplicadas (se houver)
--   PARTE 3 — corrige 'produtos' uuid residual (se houver)
-- ============================================================

-- ============ PARTE 1 — atualizar tudo para a v4 ============
-- ============================================================
-- CONTROLE DO CHAVEIRO (MyKey) - ATUALIZACAO COMPLETA ATE A V4
-- ============================================================
-- UM SO SCRIPT que leva o banco de QUALQUER versao (1, 2 ou 3)
-- direto para a versao 4. Junta as migracoes 07 + 08 + 09.
--
-- NAO APAGA NADA. Auto-detecta o estado do banco. Idempotente
-- (seguro rodar mais de uma vez). Cole no Supabase > SQL Editor > RUN.
--
-- Inclui:
--   v2: estoque com fonte unica (movimentacoes_estoque + trigger)
--   v3: tabela renomeada para 'produtos' + coluna tipo_produto
--   v4: tabela de categorias
-- ============================================================


-- ===== Conteudo de 07-atualizar-para-v2.sql =====
alter table funcionarios add column if not exists permissoes text;


-- ------------------------------------------------------------
-- 2) Colunas de ENDERECO em clientes (versoes antigas nao tinham)
-- ------------------------------------------------------------
alter table clientes add column if not exists bairro text;
alter table clientes add column if not exists cep text;
alter table clientes add column if not exists cidade text;
alter table clientes add column if not exists estado text;


-- ------------------------------------------------------------
-- 3) Tabela de LICENCAS (caso ainda nao exista)
-- ------------------------------------------------------------
create table if not exists licencas (
  id bigint generated always as identity primary key,
  codigo_instalacao text unique not null,
  codigo_liberacao text not null,
  nome_chaveiro text,
  cidade text,
  whatsapp text,
  termo_aceito boolean default false,
  termo_aceito_em timestamptz,
  data_ativacao timestamptz not null default now(),
  criado_em timestamptz not null default now()
);
alter table licencas add column if not exists termo_aceito boolean default false;
alter table licencas add column if not exists termo_aceito_em timestamptz;


-- ------------------------------------------------------------
-- 4) Tabela CONFIGURACOES (caso nao exista) + chaves padrao
-- ------------------------------------------------------------
create table if not exists configuracoes (
  chave text primary key,
  valor text
);
insert into configuracoes (chave, valor) values
  ('nome_empresa', 'Meu Chaveiro'),
  ('telefone_empresa', ''),
  ('documento_empresa', ''),
  ('endereco_empresa', ''),
  ('garantia_dias', '90'),
  ('codigo_pais', '55')
on conflict (chave) do nothing;


-- ------------------------------------------------------------
-- 5) Tabela de EQUIVALENCIAS (cria e popula se estiver vazia/ausente)
-- ------------------------------------------------------------
create table if not exists equivalencias (
  id bigint generated always as identity primary key,
  marca text, modelo text, dovale text, gold text, land text, jas text
);
create index if not exists idx_equiv_marca  on equivalencias (lower(marca));
create index if not exists idx_equiv_dovale on equivalencias (lower(dovale));
create index if not exists idx_equiv_gold   on equivalencias (lower(gold));
create index if not exists idx_equiv_land   on equivalencias (lower(land));
create index if not exists idx_equiv_jas    on equivalencias (lower(jas));

-- So insere os dados se a tabela estiver vazia (nao duplica em re-execucao)
insert into equivalencias (marca,modelo,dovale,gold,land,jas)
select * from (values
('Yale','Yale','D1','1','','3'),
('Yale','Yale','D2','2','23','1'),
('Ueme','Yale','D5','5','','6'),
('Ueme','Yale','D6','6','41','4'),
('Ueme','Yale','D7','7','34','7'),
('Ueme','Yale','D8','8','',''),
('Ueme','Yale','D9','','',''),
('Ueme','Yale','D10','10','21','5'),
('Ueme','Yale','D11','11','11','8'),
('Ueme','Yale','D12','12','','8'),
('Ueme','Yale','D13','13','276','9'),
('Lafonte','Yale','D14','14','71','14'),
('Lafonte','Yale','D15','15','48','13'),
('Lafonte','Yale','D16','16','15','186'),
('Brasil','Yale','D18','18','73','23'),
('Brasil','Yale','D20','20','72',''),
('Brasil','Yale','D21','21','','92'),
('Brasil','Yale','D22','22','136','170'),
('Brasil','Yale','D23','23','14','29'),
('Brasil','Yale','D24','24','141','24'),
('Arouca','Yale','D26','26','19','10'),
('Arouca','Yale','D27','27','5','12'),
('Yamaha','Plástica','28','919','732','983'),
('Fama','Yale','D29','29','10','26'),
('Fama','Yale','D30','30','7','184'),
('Aliança','Yale','D31','31','117','178'),
('Brasil','Yale','32','','',''),
('Brasil','Yale','33','','',''),
('Stam','Yale','34','','',''),
('Pado','Yale','D35','35','12','110'),
('Brasil','Yale','36','','',''),
('Stam','Yale','37','','1038',''),
('Brasil','Yale','38','','',''),
('Stam','Yale','39','','1039',''),
('Bonotti','Yale','40','40','130','50'),
('Milano','Pinatel','41','41','16','54'),
('Milano','Pinatel','42','42','17','49'),
('Milano','Pinatel','43','43','26','104'),
('Brasil','Yale','44','','',''),
('Brasil','Yale','45','','',''),
('Brasil','Yale','48','707','459','606'),
('Master','Yale','49','68','',''),
('Yale','Yale','50','3','20','2'),
('Brasil','Yale','52','','76','831'),
('Haga','Yale','D54','54','131','317'),
('Haga','Yale','D55','55','97','74'),
('Haga','Yale','D56','56','98','44'),
('Pado','Yale','D57','57','44','28'),
('Pado','Yale','D58','58','45','48'),
('Pado','Yale','D61','61','','31'),
('Fama','Yale','68','','137',''),
('Pado','Yale','D69','69','39','137'),
('Mult','Yale','D70','70','99','169'),
('Papaiz','Yale','D71','71','112','247'),
('Aliança','Yale','D72','72','280','316'),
('Corbim','Yale','D74','74','394','292'),
('Brasil','Yale','D75','75','14','238'),
('Brasil','Yale','76','708','460','607'),
('Ueme','Yale','D78','78','77','134'),
('Fama','Pinatel','84','160 LY','','118'),
('Fama','Pinatel','85','160 LU','','181'),
('Papaiz','Tetra','D86','86','',''),
('Pacri','Yale','D87','87','30','149'),
('Papaiz','Tetra','D88','88','600','1'),
('Aliança','Gorje','90','','',''),
('Ford','Plástica','D92','92','296','293'),
('Ford','Plástica','D93','93','64','206'),
('Mult','Yale','D94','94','108','88'),
('Papaiz','Yale','99','','',''),
('Soprano','Yale','101','1169','','1089'),
('VW','Plástica','106','106','9','80'),
('Haga','Tetra','107','819','651','841'),
('Pacri','Yale','D109','109','91','262'),
('Pado','Yale','D110','110','13','108'),
('Arouca','Gorje','111','','',''),
('Arouca','Gorje','112','','',''),
('Arouca','Gorje','114','','',''),
('Arouca','Gorje','115','','',''),
('Stam','Gorje','116','','',''),
('Arouca','Gorje','117','','',''),
('Arouca','Gorje','118','','',''),
('Arouca','Gorje','119','','',''),
('Soprano','Gorje','120','','',''),
('Soprano','Gorje','122','','',''),
('Soprano','Gorje','123','','',''),
('Soprano','Gorje','124','','',''),
('Soprano','Gorje','125','','',''),
('Arouca','Yale','127','817','642','806'),
('RAH','Yale','134','847','712','652'),
('Papaiz','Yale','D142','142','2','38'),
('Haga','Gorje','145','','',''),
('Haga','Gorje','147','','',''),
('Haga','Gorje','148','','',''),
('Haga','Gorje','149','','',''),
('Papaiz','Yale','D150','150','3','175'),
('GM','Plástica','D151','151','170','113'),
('Soprano','Multiponto','152','810','',''),
('Soprano','Multiponto','153','857','','920'),
('Soprano','Multiponto','157','938','',''),
('GM','Plástica','D159','159','171','114'),
('Soprano','Yale','162','','',''),
('GM','Plástica','D163','163','172','123'),
('Pado','Yale','D164','164','','121'),
('VW','Plástica','D166','166 R','188','287'),
('Pado','Yale','D170','170','39','140'),
('Mult','Yale','171','271','27','144'),
('Soprano','Yale','173','','',''),
('Pado','Yale','D175','175','4','122'),
('VW','Plástica','D176','176','173','305'),
('Pado','Yale','D177','177','40','160'),
('Pado','Yale','D179','179','8','135'),
('Papaiz','Tetra','D183','183','129','1'),
('Stam','Tetra','184','','',''),
('Stam','Tetra','186','933','','105'),
('Meroni','Yale','187','809','640','939'),
('Muller','Yale','188','798','',''),
('Meroni','Yale','189','808','639','1007'),
('Meroni','Yale','190','873','','104'),
('Stam','Tetra','191','','207',''),
('Stam','Tetra','192','672','530','27'),
('Stam','Tetra','192','','',''),
('Stam','Tetra','193','713','','4'),
('Stam','Tetra','194','','',''),
('Stam','Tetra','195','','',''),
('Stam','Tetra','196','665','531','28'),
('Stam','Tetra','197','667','432','22'),
('Empilhadeira','Plástica','198','','',''),
('Papaiz','Multiponto','199','846','',''),
('Stam','Yale','200','795','643','793'),
('Forjada','Gorje','201','9','425','6'),
('Forjada','Gorje','202','2','224','0007'),
('Stam','Yale','203','846','670','818'),
('Forjada','Gorje','204','4','221','724'),
('Stam','Yale','206','838','687','1013'),
('Forjada','Gorje','207','7','223','5'),
('Stam','Yale','208','870','692','1012'),
('Mult','Yale','210','885','',''),
('Stam','Yale','216','837','627','809'),
('Stam','Yale','218','856','683','845'),
('Papaiz','Multiponto','219','918','748','898'),
('Stam','Gorje','221','','',''),
('Stam','Gorje','222','','',''),
('Stam','Gorje','223','','',''),
('Stam','Gorje','224','','',''),
('Stam','Gorje','225','','',''),
('Stam','Gorje','226','','',''),
('Arouca','Yale','227','832','658','823'),
('Stam','Gorje','229','','',''),
('Banheiro','Gorje','230','','',''),
('Lockwell','Gorje','231','','',''),
('Lockwell','Gorje','232','','',''),
('Lockwell','Gorje','233','','',''),
('Lockwell','Gorje','234','','',''),
('Lockwell','Gorje','235','','',''),
('Lockwell','Gorje','236','','',''),
('Lafonte','Yale','237','860','691','802'),
('Lafonte','Yale','238','858','685','803'),
('Lafonte','Yale','239','861','697','804'),
('Lafonte','Yale','240','862','698','805'),
('Aliança','Gorje','241','','',''),
('Aliança','Gorje','242','','',''),
('Aliança','Gorje','243','','',''),
('Aliança','Gorje','244','','',''),
('Aliança','Gorje','245','','',''),
('Aliança','Gorje','246','','',''),
('Pado','Yale','D249','249','43','97'),
('G. Roupa','Gorje','250','','',''),
('G. Roupa','Gorje','251','','',''),
('G. Roupa','Gorje','253','','',''),
('Pado','Yale','D254','254','','159'),
('G. Roupa','Gorje','255','','',''),
('Lafonte','Yale','D256','256','18','191'),
('Brasil','Pinatel','D257','257','29','96'),
('Haga','Pinatel','D258','258','131','75'),
('Tampa comb.','Plástica','D259','259','33','101'),
('G. Roupa','Gorje','260','','',''),
('G. Roupa','Gorje','262','2005','',''),
('G. Roupa','Gorje','264','','',''),
('Currao','Yale','265','797','',''),
('Haga','Yale','D266','266','85','11'),
('Haga','Yale','D267','267','86','73'),
('Brasil','Yale','D268','268','50','136'),
('Brasil','Yale','D269','269','6','90'),
('Lafonte','Yale','D270','270','35','192'),
('Papaiz','Yale','D273','273','1','103'),
('Lockwell','Yale','D278','278','42','105'),
('Brasil','Yale','D280','280','49','89'),
('Fama','Yale','D281','281','','106'),
('Pado','Yale','D283','283','363','313'),
('Pado','Yale','D286','286','364','314'),
('Brasil','Yale','D289','289','136',''),
('Aliança','Yale','D290','290','100','357'),
('Mult','Yale','D291','291','109','198'),
('Rocha','Yale','292','891','707',''),
('Rocha','Yale','293','903','710','847'),
('VW','Plástica','D294','294 N','168','304'),
('Pado','Yale','D295','295','663','199'),
('Pado','Yale','D296','296','664','203'),
('Pado','Yale','D297','297','25','202'),
('VW','Plástica','D298','298','82','245'),
('Imesca','Yale','D299','299','126','179'),
('Pado','Yale','D300','300','24','205'),
('Stam','Yale','D302','302','46','266'),
('Fama','Yale','D303','303','142','27'),
('Stam','Yale','D304','304','47','217'),
('Brasil','Yale','D308','308','116','229'),
('Brasil','Yale','D309','309','76','228'),
('Pado','Tetra','D310','310','133','1'),
('Brasil','Yale','D312','312','75','242'),
('Mult','Yale','D317','317','153','93'),
('Ford','Plástica','D318','318','65','225'),
('Arouca','Pinatel','D321','321','113','230'),
('Stam','Yale','D323','323','37','239'),
('Stam','Yale','D325','325','38','250'),
('Papaiz','Tetra','D327','327','435','4'),
('Stam','Yale','D328','328','115','695'),
('Polyforte','Tetra','333','912','748',''),
('Soprano','Yale','336','836','677','922'),
('Motta','Yale','D337','337','128','345'),
('Ford','Plástica','D339','339','179','267'),
('Papaiz','Yale','D340','340','106','85'),
('Pacri','Yale','342','','',''),
('Amelco','Yale','348','848','686','834'),
('Ford','Plástica','D350','350','175','281'),
('Amelco','Yale','351','951','763','281'),
('VW','Plástica','D352','352','89','278'),
('Fama','Yale','D355','355','104','280'),
('Fama','Yale','D356','356','101','279'),
('Honda','Plástica','D357','357','174','272'),
('Honda','Plástica','D358','358','190','270'),
('Cial','Yale','D359','359','31','62'),
('Honda','Plástica','D360','360','197','289'),
('VW','Plástica','D362','362','167','288'),
('Papaiz','Tetra','D364','364','','4'),
('Fama','Yale','D365','365','137','142'),
('Lafonte','Pinatel','D366','366','','143'),
('Fiat','Plástica','D367','367','184','294'),
('GM','Plástica','D368','368','180','299'),
('Haga','Yale','D371','371','103','282'),
('Honda','Plástica','D373','373','174','862'),
('Fama','Yale','D374','374','105','297'),
('Fama','Yale','D375','375','102','296'),
('Papaiz','Tetra','D377','377','289','3'),
('Pado','Tetra','D378','378','134','6'),
('Haga','Yale','D380','380','94','284'),
('Haga','Yale','D381','381','95','68'),
('Riomeão','Yale','D382','382','87','320'),
('Riomeão','Yale','D383','383','88','311'),
('Stam','Pinatel','D384','384','67',''),
('Stam','Yale','D385','385','218','218'),
('Papaiz','Yale','D386','386','347','347'),
('Meroni','Yale','D388','388','107','308'),
('Mult','Yale','D390','390','158','306'),
('Soprano','Yale','D397','397','125','312'),
('Lockwell','Yale','D398','398','110','310'),
('Lockwell','Tetra','D403','403','145','7'),
('Papaiz','Yale','D405','405','124','327'),
('GM','Plástica','D407','407','200','183'),
('Papaiz','Yale','D408','408','215','343'),
('Papaiz','Yale','D409','409','216','365'),
('GM','Plástica','D410','410','198','331'),
('Lockwell','Tetra','D413','413','206','4'),
('Haga','Pinatel','D414','414','204','317'),
('VW','Plástica','D417','417','214','336'),
('Lockwell','Tetra','D418','418','208','8'),
('G. Roupa','Gorje','419','419','224','194'),
('Pacri','Yale','D420','420','157','171'),
('Aliança','Yale','D421','421','293','307'),
('Mercedes','Plástica','D422','422','209','341'),
('Brasil','Yale','D423','423','296','293'),
('VW','Plástica','D426','426','282','366'),
('papaiz','Yale','D428','428','135','290'),
('Haga','Yale','D429','429','622','302'),
('Porta Aço','Tetra','D430','430','393','37'),
('Mercedes','Plástica','D431','431','271','583'),
('Soprano','Yale','D432','671','418','548'),
('BMW Pant.','Plástica','433','471','303','414'),
('Soprano','Pinatel','434','689','437','675'),
('Imab','Multiponto','435','725','','725'),
('VW','Plástica','D439','439','278','81'),
('Soprano','Yale','445','952','759','925'),
('Ford','Plástica','D447','447','281','371'),
('Haga','Yale','D451','451','291','586'),
('GM','Plástica','D452','452','290','390'),
('VW','Plástica','D453','453','284','393'),
('Motta','Yale','D454','454','283','325'),
('Stam','Yale','D455','455','92','67'),
('Yale','Yale','456','956','803','624'),
('Arouca','Pinatel','D458','458','297','214'),
('Papaiz','Yale','D460','460','298','367'),
('PORSCHE','Plástica','461','537','356','633'),
('VW','Plástica','D468','468','282','569'),
('maffei','Yale','469','669','532',''),
('Meroni','Yale','D470','470','294','255'),
('Haga','Pinatel','D473','473','302','360'),
('Aliança','Yale','D477','477','301','358'),
('Brasil','Yale','D478','478','347',''),
('Lockwell','Yale','D483','483','378','348'),
('Fama','Yale','D497','497','317','363'),
('Fama','Yale','D498','498','316','333'),
('Fama','Yale','D499','499','315','362'),
('Mercedes','Plástica','D500','500','337','423'),
('Ford','Plástica','D501','501','339','424'),
('PORSCHE','Plástica','510','','',''),
('HYUNDAI','Plástica','511','','',''),
('Brasil','Yale','D512','512','341','428'),
('LN','Yale','D514','514','285','442'),
('RENAULT','Plástica','515','','',''),
('Vouga','Yale','D518','518','','359'),
('Papaiz','Yale','D519','519','299','354'),
('VW','Plástica','522','','',''),
('VW','Plástica','D523','523','333','434'),
('Brasil','Tetra','D524','524','332','15'),
('Yamaha','Plástica','D527','527','350','459'),
('VW','Plástica','529','','',''),
('Importado','Yale','D531','531','420','420'),
('Importado','Yale','D532','532','422','430'),
('Importado','Yale','D533','533','421','431'),
('Mercedes','Plástica','D535','535','','439'),
('Soprano','Yale','539','953','769','919'),
('Fiat','Plástica','541','645','411L','599'),
('VW','Plástica','D542','542','373','446'),
('Stam','Yale','D543','543','346','429'),
('Stam','Yale','D544','544','637','466'),
('Pacri','Yale','D548','548','357','587'),
('Lockwell','Tetra','D549','549','','4'),
('Pacri','Yale','D550','550','','554'),
('Ford','Plástica','D551','551','361','503'),
('GM','Plástica','D552','552','362','469'),
('Vouga','Yale','D554','554','370','364'),
('Yamaha','Plástica','D557','557','428','553'),
('Milano','Pinatel','D558','558','473','329'),
('Pado','Yale','D563','563','381','514'),
('Pado','Yale','D564','564','382','534'),
('VW','Plástica','D565','565','403L','527'),
('Hafele','Yale','567','678','534','630'),
('S. Salvador','Tetra','D568','568','435','912'),
('GM','Plástica','D569','569','415','662'),
('Multitec','Yale','D570','570','395',''),
('Soprano','Yale','D571','571','323','473'),
('Soprano','Yale','D574','574','322','338'),
('PPA','Yale','577','774','',''),
('Honda','Plástica','D579','579','430','509'),
('Aliança','Tetra','D580','853','380','981'),
('Soprano','Yale','D581','581','374','543'),
('Papaiz','Yale','D582','582','439','355'),
('Soprano','Yale','D583','583','325','476'),
('Soprano','Yale','D584','584','401','475'),
('Soprano','Yale','D585','585','324','474'),
('Cial','Yale','D586','586','340','691'),
('VW','Plástica','D587','587','405L','559'),
('CHRYSLER','Plástica','588','517','354','427'),
('Ford','Plástica','D589','589','01IT','1'),
('Importado','Yale','593','594','407','580'),
('Importado','Yale','D595','595','662','515'),
('Importado','Yale','D596','596','406','533'),
('Fiat','Plástica','D597','597','383','523'),
('Ford','Plástica','D598','598','400','581'),
('VW','Plástica','D600','600','447','497'),
('VW','Plástica','D602','602','365L','522'),
('Quarup','Yale','D603','603','389','526'),
('Honda','Plástica','604','854','684','849'),
('Stam','Yale','D605','605','74','99'),
('Importada','Tetra','606','','',''),
('Stam','Pinatel','D607','607','397','539'),
('Pado','Tetra','D608','608','','18'),
('Pado','Tetra','D609','609','479','928'),
('Stam','Yale','D611','611','399','531'),
('Pado','Tetra','D612','612','402','31'),
('Yamaha','Plástica','D613','613','489','551'),
('Ford','Plástica','D614','614','404','549'),
('Yamaha','Plástica','D616','616','427','552'),
('Pado','Tetra','D618','618','480','19'),
('Pado','Yale','D619','619','416','513'),
('Pado','Yale','D620','620','417','563'),
('GM','Plástica','D621','621','414L','568'),
('Mercedes','Plástica','622','631','408','616'),
('Soprano','Yale','D625','625','412','579'),
('Mercedes','Plástica','630','720','487','779'),
('Papaiz','Yale','D638','638','','649'),
('Pado','Tetra','D639','639','402','35'),
('Ueme','Yale','D649','649','','540'),
('Muller','Yale','D650','650','524',''),
('Brasil','Yale','D651','651','413','538'),
('HDL','Yale','D652','652','456','602'),
('VW','Plástica','D654','654','469',''),
('Papaiz','Yale','D656','656','','651'),
('arouca','Tetra','659','659','',''),
('Lider','Tetra','665','865','767','731'),
('Importada','Tetra','667','572','396','25'),
('Franzmar','Yale','672','855','674','801'),
('Franzmar','Yale','D673','673','431','593'),
('Pacri','Yale','D675','675','474','603'),
('Pacri','Yale','D676','676','494','618'),
('Franzmar','Tetra','681','947','768','944'),
('Pado','Yale','D682','682','442','590'),
('Pado','Yale','D687','687','452','585'),
('Pado','Yale','D688','688','453','605'),
('Polyforte','Tetra','D690','690','482','2'),
('Pado','Yale','D691','691','454','591'),
('Pado','Yale','D693','693','441','604'),
('Pado','Yale','D694','694','451','592'),
('Milano','Pinatel','D695','695','473','329'),
('Honda','Plástica','D696','696','430','626'),
('Brasil','Yale','D698','698','','681'),
('Lockwell','Tetra','D700','700','457','38'),
('Soprano','Yale','D701','701','438','643'),
('MGM','Yale','D702','1007','825','994'),
('Baú Moto','Plástica','703','897','743',''),
('Ueme','Yale','D704','704','478','640'),
('Honda','Plástica','D705','705','592','683'),
('Baú Moto','Plástica','706','835','672','861'),
('Pado','Yale','D707','707','459','606'),
('Pado','Yale','D708','708','460','607'),
('Lafonte','Yale','D710','710','481','624'),
('Ford','Plástica','712','412','196','277'),
('Vouga','Yale','713','913','723','184'),
('HDL','Yale','D714','714','461','682'),
('Pacri','Multiponto','715','777','604','891'),
('Papaiz','Yale','D716','716','490','819'),
('Lockwell','Tetra','D717','717','','4'),
('ML','Tetra','D718','718','510','912'),
('Unilock','Yale','D719','719','485','600'),
('Imab','Yale','D721','721','496','739'),
('Imab','Yale','D722','722','497','749'),
('Lafonte','Yale','D723','723','498','705'),
('Porta Aço','Tetra','D724','724','506','912'),
('Pacri','Multiponto','725','785','605','892'),
('Fiat','Plástica','D726','726','499','620'),
('Soprano','Yale','D727','727','501','783'),
('Amelco','Yale','728','1024','','937'),
('GM','plastica','729','','',''),
('Lockwell','Yale','730','1039','836',''),
('Lafonte','Yale','D732','732','503',''),
('Globe','Yale','D733','733','505','657'),
('Papaiz','Yale','734','990','',''),
('Importado','Yale','D735','735','507','429'),
('Papaiz','Yale','736','991','',''),
('Soprano','Yale','D737','737','541','859'),
('Soprano','Yale','738','','',''),
('Silvana','Yale','739','1002','',''),
('Imab','Yale','D740','740','518','855'),
('Tri - Circle','Yale','D742','742','',''),
('Tri - Circle','Yale','D743','743','395',''),
('Tri - Circle','Yale','D744','744','520',''),
('Tri - Circle','Yale','D745','745','521',''),
('Tri - Circle','Yale','D746','746','392','489'),
('Soprano','Tetra','748','748','436','16'),
('Soprano','Yale','D749','749','545','750'),
('Aliança','Yale','D750','750','542','611'),
('Burgo','Yale','753','1029','','194'),
('Aliança','Yale','754','978','798',''),
('Aliança','Yale','755','980','799',''),
('Lafonte','Yale','756','1123','970','1142'),
('GM','Plástica','D757','757','546',''),
('Pado','Tetra','D759','759','','784'),
('Pado','Yale','D760','760','561','761'),
('Fiat','Plástica','D761','761','555L',''),
('Yamaha','Plástica','762','855','674','801'),
('HDL','Yale','D763','763','566','754'),
('Currao','Yale','D764','764','616','833'),
('Burgo','Yale','765','1034','',''),
('Importada','Tetra','766','660','488',''),
('3F','Yale','769','1049','',''),
('3F','Yale','770','1050','',''),
('Soprano','Yale','771','971','','844'),
('Soprano','Yale','D772','772','501','771'),
('Dovale','Tetra','773','','',''),
('Yamaha','Plástica','D775','775','614','900'),
('Ueme','Yale','776','791','632','641'),
('Soprano','Yale','777','772','603','771'),
('Soprano','Yale','778','','',''),
('Ueme','Yale','779','864','701',''),
('Soprano','Yale','D780','780','594','777'),
('Soprano','Yale','D782','782','595','908'),
('Soprano','Yale','D783','783','597','820'),
('Soprano','Yale','D784','784','598','830'),
('3F','Yale','785','985','',''),
('3F','Yale','786','986','',''),
('3F','Yale','790','','',''),
('Soprano','Yale','792','','',''),
('Haga','Tetra','794','','',''),
('Stam','Yale','D799','799','627','800'),
('Haga','Yale','D800','800','615','789'),
('MSS','Tetra','801','931','','40'),
('Soprano','Yale','D802','802','636','829'),
('3F','Yale','D804','804','563','773'),
('Papaiz','Yale','805','1021','819','1014'),
('Cash Box','Yale','807','970','',''),
('Imab','Yale','811','906','717','846'),
('Imab','Yale','812','1005','',''),
('Imab','Yale','813','1008','',''),
('Soprano','Yale','D814','814','656','807'),
('Papaiz','Yale','815','1022','','1011'),
('Soprano','Yale','','','',''),
('Pado','Yale','818','886','731','648'),
('Pado','Yale','819','877','702',''),
('Honda','Plástica','821','833','732','984'),
('Honda','Plástica','822','692','484','664'),
('Globe','Yale','823','787','624','653'),
('Globe','Yale','824','789','623','941'),
('Globe','Yale','825','868','706','858'),
('3F','Yale','D826','826','646','812'),
('Pacri','Yale','827','697','471','668'),
('Pacri','Yale','828','875','715','824'),
('Sinter','Yale','830','945','760','913'),
('Papaiz','Yale','831','781','',''),
('Papaiz','Yale','834','788','644','342'),
('Yamaha','Plástica','835','926','747','880'),
('Profield','Yale','840','1014','',''),
('Haga','Yale','843','1003','785','1004'),
('Haga','Yale','844','1006','824','1006'),
('Riomeão','Yale','848','768','449','836'),
('Soprano','Yale','849','820','655','837'),
('HDL','Yale','850','LT','',''),
('3F','Yale','851','1040','807','1006'),
('3F','Yale','852','829','','980'),
('3F','Yale','853','867','666',''),
('3F','Yale','854','878','699',''),
('Yamaha','Plástica','859','712','509',''),
('Soprano','Yale','863','983','',''),
('Soprano','Yale','866','888','711','582'),
('Haga','Tetra','869','1009','757','774'),
('Yamaha','Plástica','871','658','429','791'),
('Hela','Tetra','872','1013','',''),
('VW','Plástica','874','824','779','835'),
('Soprano','Yale','876','1001','',''),
('Aliança','Yale','879','839','675','811'),
('Aliança','Tetra','880','580','380','981'),
('Yamaha','Plástica','881','946','764','856'),
('Aliança','Yale','882','930','727','814'),
('Haga','Yale','884','949','641','797'),
('Haga','Yale','885','950','622','684'),
('Aliança','Multiponto','887','1015','',''),
('Hela','Yale','888','1010','',''),
('Hela','Yale','889','942','',''),
('Hela','Yale','890','960','770','977'),
('Yaltres','Multiponto','892','822','','911'),
('Papaiz','Tetra','D893','893','129','1'),
('Honda','Plástica','894','1000','','1008'),
('Honda','Plástica','895','915','592',''),
('Haga','Yale','896','842','679','1005'),
('Haga','Yale','897','843','680','910'),
('Haga','Yale','898','844','681','1005'),
('Haga','Yale','899','940','797','978'),
('Haga','Yale','900','1025','',''),
('Hela','Yale','901','941','','973'),
('Haga','Yale','902','1011','',''),
('Metal Davi','Yale','904','902','716',''),
('Globe','Yale','907','957','792','765'),
('Fiat','Plástica','908','948','771',''),
('Haga','Yale','909','961','796','923'),
('Haga','Yale','910','962','773','621'),
('Bisa','Yale','911','923','751','622'),
('Bisa','Yale','914','927','810','621'),
('Importado','Yale','916','851','693','917'),
('Importado','Yale','917','876','745',''),
('Importado','Yale','920','894','',''),
('Importado','Yale','921','898','',''),
('Importado','Yale','922','899','722','917'),
('Importado','Yale','923','900','721','918'),
('Importado','Yale','924','901','720','918'),
('Importado','Yale','925','921','745',''),
('Pacri','Yale','927','875','',''),
('Currao','Yale','928','967','616','833'),
('Lider','Pinatel','929','958','803','948'),
('Suzuki','Plástica','931','916','795','987'),
('Suzuki','Plástica','932','936','',''),
('Sega Tools','Yale','933','963','738','988'),
('Sega Tools','Yale','934','964','737','461'),
('Sega Tools','Yale','935','965','736','903'),
('Honda','Plástica','936','823','659',''),
('Haga','Yale','937','987','',''),
('RENAULT','Plástica','938','776','516',''),
('Haga','Yale','939','1031','',''),
('Brasilia','Tetra','940','959','','901'),
('VW','Plástica','941','751','593',''),
('Silvana','Yale','942','907','762','992'),
('Stam','Yale','943','1030','835',''),
('Stam','Yale','944','999','793',''),
('Fiat','Plástica','950','830','729L',''),
('Fiat','Plástica','951','','',''),
('Haga','Yale','954','1026','','1015'),
('Sinter','Yale','956','1032','',''),
('3F','Yale','959','1041','860','1082'),
('Kwikset','Yale','966','1042','',''),
('Hela','Yale','968','1117','962','1114'),
('Hela','Yale','969','1118','961','1115'),
('Lider','Tetra','970','1070','',''),
('Dovale','Yale','971','','',''),
('Dovale','Yale','972','','',''),
('Dovale','Yale','973','','',''),
('3F','tetra','975','1096','1078',''),
('HDL','Yale','974','1064','',''),
('Haga','Yale','976','1054','',''),
('','','979','1059','',''),
('Haga','Yale','980','1052','','930'),
('Soprano','Yale','982','1062','886','925'),
('Dovale','Tetra','983','','',''),
('Soprano','Yale','985','1100','','1111'),
('Honda','Plástica','986','1056','','1102'),
('3F','Yale','987','1101','','1092'),
('3F','Yale','988','','',''),
('MGM','Yale','989','1080','919','1063'),
('Papaiz','Tetra','990','','',''),
('Sega Tools','Yale','991','1083','907','1087'),
('Sinter','Yale','992','1032','',''),
('Dovale','Tetra','993','','',''),
('Pado','Tetra','1000','845','',''),
('Dovale','Multiponto','1002','','',''),
('Haga','Yale','1003','','',''),
('Haga','Yale','1004','1130','',''),
('Haga','Yale','1005','1131','',''),
('Haga','Yale','1006','1128','','1118'),
('Haga','Yale','1007','1129','','1119'),
('Forjada','Gorje','1008','8','253','44'),
('3f','Yale','1010','1125','','1141'),
('Soprano','Yale','1013','','','1112'),
('Imab','Yale','1018','1018','',''),
('Forjada','Gorje','1024','216','','32'),
('Forjada','Gorje','1031','31','252','29'),
('Cofre dupla','Gorje','1032','32','268',''),
('Haga','Yale','1053','','',''),
('Sinter','Yale','1060','','',''),
('Sinter','Yale','1061','','',''),
('Mult','Yale','1070','276','','169'),
('Pado','Tetra','1078','1095','','1085'),
('Sega Tools','Yale','1084','1084','920','1088'),
('MGM','Yale','D1085','1085','903','1134'),
('Stam','Yale','D1086','1086','',''),
('3f','Yale','1087','1124','','1109'),
('VW','Plástica','1106','','',''),
('Stam','Yale','1109','1109','','1012'),
('Stam','Yale','1110','1110','','793'),
('Stam','Yale','1111','1111','',''),
('Stam','Yale','1112','1112','','818'),
('Gold','yale','1120','1120','',''),
('3f','yale','1127','1170','1065','1250'),
('VW','Plástica','1176','','173','305'),
('Cofre padrão','Gorje','1184','184','262','28'),
('Stam','Tetra','1197','','',''),
('G. Roupa','Gorje','1199','199','236','27'),
('Pado','Gorje','1220','','',''),
('Aliança','Gorje','1241','','',''),
('Aliança','Gorje','1242','','',''),
('Aliança','Gorje','1243','','',''),
('Aliança','Gorje','1244','','',''),
('Aliança','Gorje','1245','','',''),
('Aliança','Gorje','1246','','',''),
('VW','Plástica','1294','294 R','199','525'),
('Mult','Yale','1317','883','695','601'),
('VW','Plástica','1362','','',''),
('G. Roupa','Gorje','1419','','424','236'),
('VW','Plástica','1426','','',''),
('Papaiz','Yale','1428','','',''),
('GM','Plástica','1452','685','388L','127'),
('Brasil','Gorje','1484','','',''),
('Importado','Yale','1531','','',''),
('Importado','Yale','1532','','',''),
('Importado','Yale','1533','','',''),
('Soprano','Yale','1585','','',''),
('VW','Plástica','1602','','',''),
('Honda','Plástica','1604','','',''),
('Ford','Gaveta','1614','','',''),
('G. Roupa','Gorje','1824','','',''),
('Ford','Gaveta','2020','','',''),
('Pado','Gorje','2021','','',''),
('Pado','Gorje','2022','','',''),
('Pado','Gorje','2023','','',''),
('Pado','Gorje','2024','','',''),
('Pado','Gorje','2025','','',''),
('Pado','Gorje','2026','294','59',''),
('Papaiz','Gorje','2031','','',''),
('Papaiz','Gorje','2032','','',''),
('Papaiz','Gorje','2033','','',''),
('Papaiz','Gorje','2034','','',''),
('Papaiz','Gorje','3035','','',''),
('Papaiz','Gorje','2036','','',''),
('Papaiz','Gorje','2037','','',''),
('Fama','Gorje','2051','','',''),
('Fama','Gorje','2052','','',''),
('Fama','Gorje','2053','','',''),
('Fama','Gorje','2054','','',''),
('Imab','Gorje','2060','','',''),
('Imab','Gorje','2061','','',''),
('Imab','Gorje','2062','','',''),
('Imab','Gorje','2063','','',''),
('Brasil','Gorje','2081','','',''),
('Brasil','Gorje','2082','','',''),
('Brasil','Gorje','2083','','',''),
('Brasil','Gorje','2084','','',''),
('Brasil','Gorje','2085','','',''),
('Brasil','Gorje','2086','','',''),
('Aliança','Gorje','2090','','',''),
('Pado','Gorje','2091','','',''),
('Pado','Gorje','2092','','',''),
('Pado','Gorje','2093','','',''),
('Pado','Gorje','2094','','',''),
('Pado','Gorje','2095','','',''),
('Pado','Gorje','2096','','',''),
('VW','Plástica','2106','','',''),
('Soprano','Gorje','2120','','',''),
('Soprano','Gorje','2121','','',''),
('Soprano','Gorje','2122','','',''),
('Soprano','Gorje','2123','','',''),
('Soprano','Gorje','2124','','',''),
('Soprano','Gorje','2125','','',''),
('Soprano','Gorje','2126','','',''),
('GM','Plástica','2151','','',''),
('VW','Plástica','2166','166','58',''),
('VW','Plástica','2176','176','54',''),
('Forjada','Gorje','2201','1','425','175'),
('Forjada','Gorje','2207','7','223','5'),
('Pado','Gorje','2220','','',''),
('G. Roupa','Gorje','2229','229','45','423'),
('Papaiz','Gorje','2231','','',''),
('Papaiz','Gorje','2232','','',''),
('Papaiz','Gorje','2233','','',''),
('Papaiz','Gorje','2234','','',''),
('Papaiz','Gorje','2235','','',''),
('Papaiz','Gorje','2236','','',''),
('Aliança','Gorje','2241','','',''),
('Aliança','Gorje','2242','','',''),
('Aliança','Gorje','2243','','',''),
('Aliança','Gorje','2244','','',''),
('Fama','Gorje','2251','','',''),
('Fama','Gorje','2252','','',''),
('Fama','Gorje','2253','','',''),
('3F','Gorje','2260c','','',''),
('3F','Gorje','2261c','','',''),
('Lafonte','Gorje','2270','','',''),
('Lafonte','Gorje','2280','','',''),
('Lafonte','Gorje','2281','','',''),
('Lafonte','Gorje','2282','','',''),
('Lafonte','Gorje','2283','','',''),
('GM','Rei do Gado','2293','','',''),
('VW','Plástica','2294','AT0096','','1002'),
('VW','Rei do Gado','2314','AT0099','590','0004'),
('VW','Rei do Gado','2315','AT0101','588','0005'),
('VW','Rei do Gado','2316','AT0100','610','1004'),
('Cintroen','Gaveta','2320','AT2003','648TA',''),
('Ford','Rei do Gado','2326','AT0138','',''),
('VW','Rei do Gado','2386','AT0098','586','1003'),
('VW','Gaveta','2411','','',''),
('GM','Rei do Gado','2416','','',''),
('G. Roupa','Gorje','2419','419','424','194'),
('Forjada','Gorje','2484','','',''),
('VW','Plástica','2253','','',''),
('Ford','Gaveta','2589','','',''),
('Honda','Plástica','2604','','',''),
('','','2614','AT2035','669TC','875'),
('Forjada','Gorje','3003','3','','23'),
('Ford','Rei do Gado','3022','','',''),
('GM','Rei do Gado','3027','','',''),
('Soprano','Gorje','3120','','',''),
('Ford','Gaveta','3205','AT2019','629TC','865'),
('Peugeot','Gaveta','3206','AT2024','660G','883'),
('GM','Gaveta','3407','AT2011','671G','929'),
('GM','Gaveta','3410','AT2012','588G','974'),
('G. Roupa','Gorje','3419','','',''),
('VW','Gaveta','3426','AT1006','583G','872'),
('GM','Gaveta','3452','AT2013','574G','888'),
('Mitsubishi','Gaveta','3457','','',''),
('Peugeot','Gaveta','3461','AT2016','660G','882'),
('Cintroen','Gaveta','3505','AT2021','667G',''),
('Peugeot','Gaveta','3506','AT2028','',''),
('Nissan','Gaveta','3507','AT2030','777G',''),
('Honda','Gaveta','3513','AT2033','765G',''),
('Honda','Gaveta','3520','AT1013','766G',''),
('Toyota','Gaveta','3526','AT0127','654TC','881'),
('Ford','Gaveta','3551','AT2019','638TC',''),
('VW','Gaveta','3565','AT1005','582G','871'),
('VW','Gaveta','3587','AT1008','608G','873'),
('Ford','Gaveta','3589','AT2004','626TC','985'),
('Ford','Gaveta','3597','AT1001','613TA','868'),
('VW','Gaveta','3600','AT2002','631G','863'),
('VW','Gaveta','3602','AT1004','365L','522'),
('Honda','Plástica','3604','','',''),
('Ford','Gaveta','3614','AT2005','630TC','866'),
('Mercedes','Gaveta','3622','AT1014','408','772G'),
('GM','Gaveta','3757','AT2009','611G','876'),
('Ford','Gaveta','3761','AT2025','729',''),
('Ford','Gaveta','3895','AT2026','742','864'),
('Ford','Gaveta','3908','AT2001','647TA','869'),
('Ford','Gaveta','3911','','',''),
('Honda','Gaveta','3936','AT2033','659',''),
('Renault','Gaveta','3938','AT1011','71T',''),
('Renault','Gaveta','3941','AT1012','51T','877'),
('VW','Plástica','4426','','',''),
('G. Roupa','Gorje','4484','','',''),
('VW','Plástica','4542','','',''),
('GM','Gaveta','11410','','',''),
('GM','Rei do Gado','16410','AT0070','576','0001'),
('GM','Rei do Gado','16452','AT0071','578','0003'),
('GM','Gaveta','18452','','',''),
('Fiat','Gaveta','18895','AT2041','',''),
('Fiat','Gaveta','18911','AT2040','',''),
('Fiat','Gaveta','19895','','',''),
('Fiat','Gaveta','19911','','',''),
('Mercedes','Gaveta','3816','AT2031','',''),
('3F','yale','1126','1126','','1141'),
('Pacif','yale','62','62','132','72'),
('arouca','yale','1107','1107','','1135'),
('Fgv','yale','796','','',''),
('Fgv','Escomoteavel Pvc','1796','','',''),
('frontier','yale','1150','','','1179'),
('Haga','yale','1129','1189','830','1213'),
('Haga','yale','1131','1190','1060',''),
('Haga','yale','1939','1090','909','1027'),
('Halefe','yale','108','','',''),
('Halefe','yale','158','1189','',''),
('Halefe','yale','637','','','155'),
('Halefe','Artigo Pvc','1108','','',''),
('Halefe','Escomoteavel Pvc','1158','','',''),
('Halefe','Escomoteavel Pvc','1736','','',''),
('Hela','Yale','2968','1195','','1251'),
('Hela','Yale','2969','1196','','1252'),
('Jmck','Yale','154','','','1156'),
('Lockwell','Yale','1062','1162','','1168'),
('Mgm','Yale','1083','1183','','1249'),
('Novare','Yale','1039','','',''),
('Novare','Yale','1139','1187','1044','1181'),
('Pado','Yale','1428','','','1214'),
('Papaiz','Yale','404','1172','','1248'),
('Papaiz','Yale','450','','','1253'),
('Papaiz','Yale','801','','',''),
('Rodrigues','Yale','1081','1081','910','1049'),
('Silvana','Yale','1082','1173','',''),
('soprano','Yale','576','576','409','472'),
('soprano','Yale','1014','1151','1068','1090'),
('Soprano','Yale','1104','1194','',''),
('John Deere','Yale','3019','1019','867',''),
('Soprano','Yale','1125','','','1178'),
('Ueme','Yale','648','1143','1069','1148'),
('Ueme','Yale','779','864','',''),
('Ueme','Yale','1979','1178','1018','1211'),
('União','Yale','167','1174','','1192'),
('Yale','Yale','1144','','',''),
('Yale','Yale','1145','','',''),
('Yale','Yale','1146','','',''),
('Yale','Yale','1147','','',''),
('Yale','Yale','1148','','',''),
('Trator','Auto','1329','329','','233'),
('Trator','Auto','1330','','',''),
('Agl','Yale','1174','','',''),
('arouca','Tetra','1055','1055','880','1055'),
('arouca','Tetra','1445','445','476','45'),
('China','Tetra','1171','','',''),
('3 circulos','Tetra','1048','1048','','8668'),
('Feida','Tetra','1118','','',''),
('King Dovale','Tetra','2665','','',''),
('Franzmar','Tetra','684','','',''),
('Pacri','Tetra','1633','633','','36'),
('Salvador','Tetra','1124','','',''),
('Tri Combo','Tetra','1170','','',''),
('Arouca','Multiponto','1041','828','914','1256'),
('keso','Multiponto','1771','771','602',''),
('Pacri','Multiponto','657','','606','893'),
('Pado','Multiponto','1040','1188','',''),
('Papaiz','Plastica','1219','1140','','1158'),
('Porta de vidro','Multiponto','1989','989','828',''),
('Yaltres','Multiponto','1728','728','500','943'),
('Mitsubishi','Plastica','457','457','314','389'),
('Mitsubishi','Plastica','664','664','527','700'),
('Scania','Plastica','662','662','491','530'),
('Scania','Plastica','670','670','448',''),
('Scania','Plastica','768','765','565','843'),
('Colheitadeira','auto','2939','938','','')
) as v(marca,modelo,dovale,gold,land,jas)
where not exists (select 1 from equivalencias);


-- ------------------------------------------------------------
-- 6) ESTOQUE FONTE UNICA
--    Renomeia movimentacoes -> movimentacoes_estoque,
--    cria trigger que mantem chaves.estoque sempre correto.
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='movimentacoes')
     and not exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='movimentacoes_estoque') then
    -- so renomeia se 'movimentacoes' for TABELA (nao view)
    if (select table_type from information_schema.tables
        where table_schema='public' and table_name='movimentacoes') = 'BASE TABLE' then
      alter table movimentacoes rename to movimentacoes_estoque;
    end if;
  end if;
end $$;

create table if not exists movimentacoes_estoque (
  id bigint generated always as identity primary key,
  chave_id bigint references chaves(id),
  tipo text not null,
  quantidade integer not null,
  motivo text,
  servico_id bigint,
  funcionario_id bigint references funcionarios(id),
  criado_em timestamptz not null default now()
);

-- View de compatibilidade: nome antigo continua funcionando
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='movimentacoes') then
    execute 'create view movimentacoes as select * from movimentacoes_estoque';
  end if;
end $$;

-- ------------------------------------------------------------
-- 6.0) NORMALIZACAO: garante que movimentacoes_estoque tenha as
--      colunas com os nomes corretos, qualquer que seja o estado
--      anterior do banco. Conserta variacoes de nome (chave->chave_id).
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='movimentacoes_estoque') then
    if exists (select 1 from information_schema.columns
               where table_name='movimentacoes_estoque' and column_name='chave')
       and not exists (select 1 from information_schema.columns
               where table_name='movimentacoes_estoque' and column_name='chave_id') then
      alter table movimentacoes_estoque rename column chave to chave_id;
    end if;
    alter table movimentacoes_estoque add column if not exists chave_id bigint;
    alter table movimentacoes_estoque add column if not exists tipo text;
    alter table movimentacoes_estoque add column if not exists quantidade integer;
    alter table movimentacoes_estoque add column if not exists motivo text;
    alter table movimentacoes_estoque add column if not exists servico_id bigint;
    alter table movimentacoes_estoque add column if not exists funcionario_id bigint;
    alter table movimentacoes_estoque add column if not exists criado_em timestamptz default now();
  end if;
end $$;

-- Funcao que calcula o estoque real de uma chave
create or replace function calcular_estoque_chave(p_chave_id bigint)
returns integer language sql stable as $$
  select coalesce(sum(case when tipo='entrada' then quantidade
                           when tipo='saida' then -quantidade else 0 end),0)::integer
  from movimentacoes_estoque where chave_id = p_chave_id;
$$;

-- Trigger que recalcula chaves.estoque a cada movimentacao
create or replace function trg_atualizar_estoque_chave()
returns trigger language plpgsql as $$
declare v_chave bigint;
begin
  v_chave := coalesce(new.chave_id, old.chave_id);
  if v_chave is not null then
    update chaves set estoque = calcular_estoque_chave(v_chave) where id = v_chave;
  end if;
  return null;
end $$;

drop trigger if exists tg_mov_estoque on movimentacoes_estoque;
create trigger tg_mov_estoque
  after insert or update or delete on movimentacoes_estoque
  for each row execute function trg_atualizar_estoque_chave();

-- Reconciliacao: chaves com saldo mas sem historico ganham entrada inicial
insert into movimentacoes_estoque (chave_id, tipo, quantidade, motivo, criado_em)
select k.id, 'entrada', k.estoque, 'Saldo inicial (migracao fonte unica)', now()
from chaves k
where coalesce(k.estoque,0) > 0
  and not exists (select 1 from movimentacoes_estoque m where m.chave_id = k.id);

-- Recalcula todas as chaves a partir do historico
update chaves k set estoque = calcular_estoque_chave(k.id);


-- ------------------------------------------------------------
-- 7) SEGURANCA (RLS) nas tabelas (idempotente)
-- ------------------------------------------------------------
alter table equivalencias        enable row level security;
alter table movimentacoes_estoque enable row level security;
alter table licencas             enable row level security;
drop policy if exists "acesso_total" on equivalencias;
drop policy if exists "acesso_total" on movimentacoes_estoque;
drop policy if exists "acesso_total" on licencas;
create policy "acesso_total" on equivalencias        for all using (true) with check (true);
create policy "acesso_total" on movimentacoes_estoque for all using (true) with check (true);
create policy "acesso_total" on licencas             for all using (true) with check (true);


-- ------------------------------------------------------------
-- 8) VERSAO DO SCHEMA = 2
-- ------------------------------------------------------------
insert into configuracoes (chave, valor) values ('schema_version', '2')
on conflict (chave) do update set valor = excluded.valor;


-- ============================================================
-- PRONTO! Banco atualizado para a versao 2 sem perder dados.
-- ============================================================

-- Recarrega o cache de esquema do PostgREST (Supabase) para que
-- as colunas/tabelas novas fiquem visiveis ao app imediatamente.
notify pgrst, 'reload schema';


-- ===== Conteudo de 08-atualizar-para-v3.sql =====
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='chaves'
               and table_type='BASE TABLE')
     and not exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='produtos') then
    alter table chaves rename to produtos;
  end if;
end $$;

-- Garante a tabela em banco novo (se nunca existiu)
create table if not exists produtos (
  id bigint generated always as identity primary key,
  fabricante_id bigint references fabricantes(id),
  codigo text not null,
  descricao text not null,
  tipo text not null default 'residencial',
  categoria text,
  preco_venda numeric not null default 0,
  preco_custo numeric not null default 0,
  estoque integer not null default 0,
  estoque_min integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 2) Nova coluna TIPO_PRODUTO: chave | fechadura | peca | servico
--    Itens antigos viram 'chave' por padrao.
-- ------------------------------------------------------------
alter table produtos add column if not exists tipo_produto text not null default 'chave';
-- unidade de medida do produto (un/g/kg/m/l/cx/pct/sv) — usada no cupom e na OS
alter table produtos add column if not exists unidade_medida text not null default 'un';
-- IMPORTANTE: a view 'chaves' e 'select * from produtos', mas o '*' e expandido
-- na criacao da view. Apos adicionar colunas em produtos, e preciso recriar a view
-- para que a coluna nova (unidade_medida) apareça e seja gravável.
create or replace view chaves as select * from produtos;


-- ------------------------------------------------------------
-- 3) VIEW de compatibilidade: o nome 'chaves' continua valendo
--    (a view e atualizavel: aceita insert/update/delete)
--    IMPORTANTE: recria SEMPRE, para a view refletir colunas novas
--    (ex: tipo_produto). Uma view 'select *' congela as colunas de
--    quando foi criada; sem recriar, a coluna nova nao aparece nela.
-- ------------------------------------------------------------
do $$
begin
  -- so recria se 'chaves' for VIEW (nunca derruba uma tabela chamada chaves)
  if exists (select 1 from information_schema.views
             where table_schema='public' and table_name='chaves') then
    execute 'drop view chaves';
  end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='chaves') then
    execute 'create view chaves as select * from produtos';
  end if;
end $$;


-- ------------------------------------------------------------
-- 4) Seguranca (RLS) na tabela produtos
-- ------------------------------------------------------------
alter table produtos enable row level security;
drop policy if exists "acesso_total" on produtos;
create policy "acesso_total" on produtos for all using (true) with check (true);


-- ------------------------------------------------------------
-- 5) RESSINCRONIZA as sequencias de ID (identity)
--    Backups que inserem IDs fixos deixam a sequencia atrasada,
--    o que causa erro "duplicate key" ao cadastrar algo novo.
--    Este bloco acerta a sequencia de cada tabela com o maior id.
-- ------------------------------------------------------------
do $$
declare
  r record;
  v_max bigint;
  v_seq text;
begin
  for r in
    select t.table_name from information_schema.tables t
    where t.table_schema='public' and t.table_type='BASE TABLE'
      and exists (
        select 1 from information_schema.columns c
        where c.table_schema='public' and c.table_name=t.table_name
          and c.column_name='id'
      )
  loop
    v_seq := pg_get_serial_sequence('public.'||r.table_name, 'id');
    if v_seq is not null then
      execute format('select coalesce(max(id),0) from %I', r.table_name) into v_max;
      perform setval(v_seq, greatest(v_max, 1), v_max > 0);
    end if;
  end loop;
end $$;


-- ------------------------------------------------------------
-- 6) Versao do schema = 3
-- ------------------------------------------------------------
insert into configuracoes (chave, valor) values ('schema_version', '3')
on conflict (chave) do update set valor = excluded.valor;


-- ============================================================
-- PRONTO! "Produtos" com tipos chave/fechadura/peca/servico.
-- O nome antigo 'chaves' continua funcionando via view.
-- ============================================================

-- Recarrega o cache de esquema do PostgREST (Supabase) para que
-- as colunas/tabelas novas fiquem visiveis ao app imediatamente.
notify pgrst, 'reload schema';


-- ===== Conteudo de 09-atualizar-para-v4.sql =====
create table if not exists categorias (
  id bigint generated always as identity primary key,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Evita categorias com nome repetido (ignorando maiusc/minusc)
create unique index if not exists idx_categorias_nome_unico
  on categorias (lower(nome));


-- ------------------------------------------------------------
-- 2) Seguranca (RLS)
-- ------------------------------------------------------------
alter table categorias enable row level security;
drop policy if exists "acesso_total" on categorias;
create policy "acesso_total" on categorias for all using (true) with check (true);


-- ------------------------------------------------------------
-- 3) Ressincroniza sequencias (seguranca, caso backup antigo)
-- ------------------------------------------------------------
do $$
declare r record; v_max bigint; v_seq text;
begin
  for r in
    select t.table_name from information_schema.tables t
    where t.table_schema='public' and t.table_type='BASE TABLE'
      and exists (select 1 from information_schema.columns c
        where c.table_schema='public' and c.table_name=t.table_name and c.column_name='id')
  loop
    v_seq := pg_get_serial_sequence('public.'||r.table_name, 'id');
    if v_seq is not null then
      execute format('select coalesce(max(id),0) from %I', r.table_name) into v_max;
      perform setval(v_seq, greatest(v_max,1), v_max > 0);
    end if;
  end loop;
end $$;


-- ------------------------------------------------------------
-- 4) Versao do schema = 4
-- ------------------------------------------------------------
insert into configuracoes (chave, valor) values ('schema_version', '4')
on conflict (chave) do update set valor = excluded.valor;


-- ============================================================
-- PRONTO! Tabela de categorias criada.
-- ============================================================

-- Recarrega o cache de esquema do PostgREST (Supabase) para que
-- as colunas/tabelas novas fiquem visiveis ao app imediatamente.
notify pgrst, 'reload schema';


-- ============ PARTE 2 — consolidar chaves/produtos ============
-- ============================================================
-- CORRECAO: consolidar tabelas 'chaves' e 'produtos' duplicadas
-- ============================================================
-- Em alguns bancos a migracao deixou DUAS tabelas: 'chaves' (antiga,
-- com os dados) e 'produtos' (nova, vazia). Este script move os
-- dados para 'produtos', remove a 'chaves' antiga e cria a view
-- 'chaves' apontando para 'produtos'. NAO PERDE DADOS.
--
-- So faz algo se AMBAS forem tabelas. Se ja estiver consolidado
-- (chaves = view), nao faz nada. Idempotente.
-- ============================================================
do $$
declare
  v_chaves_tabela boolean;
  v_produtos_tabela boolean;
  v_produtos_vazia boolean;
begin
  select exists(select 1 from information_schema.tables
    where table_schema='public' and table_name='chaves' and table_type='BASE TABLE')
    into v_chaves_tabela;
  select exists(select 1 from information_schema.tables
    where table_schema='public' and table_name='produtos' and table_type='BASE TABLE')
    into v_produtos_tabela;

  -- So age se as DUAS sao tabelas (estado duplicado)
  if v_chaves_tabela and v_produtos_tabela then

    -- garante a coluna tipo_produto em produtos
    alter table produtos add column if not exists tipo_produto text not null default 'chave';

    execute 'select not exists(select 1 from produtos)' into v_produtos_vazia;

    if v_produtos_vazia then
      -- copia os dados de chaves -> produtos PRESERVANDO os ids
      insert into produtos (id, fabricante_id, codigo, descricao, tipo, categoria,
                            preco_venda, preco_custo, estoque, estoque_min, ativo, criado_em, tipo_produto)
      overriding system value
      select id, fabricante_id, codigo, descricao, tipo, categoria,
             preco_venda, preco_custo, estoque, estoque_min, ativo, criado_em, 'chave'
      from chaves;
    end if;

    -- remove a tabela chaves antiga (dados ja estao em produtos)
    drop table chaves cascade;

    -- ressincroniza a sequencia de produtos com o maior id copiado
    perform setval(pg_get_serial_sequence('produtos','id'),
                   greatest((select coalesce(max(id),0) from produtos),1),
                   (select count(*) from produtos) > 0);

    -- cria a view de compatibilidade
    execute 'create view chaves as select * from produtos';
  end if;
end $$;

-- Recria a view se 'chaves' for view mas estiver sem colunas novas
do $$
begin
  if exists (select 1 from information_schema.views
             where table_schema='public' and table_name='chaves') then
    execute 'drop view chaves';
    execute 'create view chaves as select * from produtos';
  end if;
end $$;

-- RLS em produtos
alter table produtos enable row level security;
drop policy if exists "acesso_total" on produtos;
create policy "acesso_total" on produtos for all using (true) with check (true);

-- recarrega o cache do PostgREST
notify pgrst, 'reload schema';

-- ============ PARTE 3 — corrigir produtos uuid residual ============
-- ============================================================
-- CORRECAO: banco onde 'chaves' (bigint) e a tabela boa e existe
-- uma 'produtos' (uuid) RESIDUAL de outra versao atrapalhando.
-- ============================================================
-- Estrategia:
--   - A tabela 'chaves' (bigint) e a correta e atual (tem os dados).
--   - A 'produtos' (uuid) e de outra versao; sai do caminho SEM
--     ser apagada (renomeada para produtos_legado_uuid p/ seguranca).
--   - Adiciona 'tipo_produto' na 'chaves'.
--   - Renomeia 'chaves' -> 'produtos' e cria view 'chaves'.
-- NAO APAGA DADOS. Idempotente.
-- ============================================================
do $$
declare
  v_chaves_tabela boolean;
  v_produtos_tabela boolean;
  v_produtos_id_tipo text;
begin
  select exists(select 1 from information_schema.tables
    where table_schema='public' and table_name='chaves' and table_type='BASE TABLE') into v_chaves_tabela;
  select exists(select 1 from information_schema.tables
    where table_schema='public' and table_name='produtos' and table_type='BASE TABLE') into v_produtos_tabela;

  -- Detecta o tipo do id da produtos (uuid = residual de outra versao)
  if v_produtos_tabela then
    select data_type into v_produtos_id_tipo from information_schema.columns
      where table_name='produtos' and column_name='id';
  end if;

  -- CASO: chaves(bigint) boa + produtos(uuid) residual
  if v_chaves_tabela and v_produtos_tabela and v_produtos_id_tipo = 'uuid' then
    -- arquiva a produtos uuid (nao apaga)
    execute 'alter table produtos rename to produtos_legado_uuid';
    -- garante tipo_produto na chaves boa
    execute 'alter table chaves add column if not exists tipo_produto text not null default ''chave''';
    -- renomeia chaves -> produtos (agora o nome esta livre)
    execute 'alter table chaves rename to produtos';
    -- cria a view de compatibilidade
    execute 'create view chaves as select * from produtos';
  end if;
end $$;

-- Se chaves ainda for tabela (caso ja tivesse so a boa), garante coluna + rename + view
do $$
declare v_chaves_tabela boolean; v_produtos_existe boolean;
begin
  select exists(select 1 from information_schema.tables
    where table_schema='public' and table_name='chaves' and table_type='BASE TABLE') into v_chaves_tabela;
  select exists(select 1 from information_schema.tables
    where table_schema='public' and table_name='produtos') into v_produtos_existe;
  if v_chaves_tabela and not v_produtos_existe then
    execute 'alter table chaves add column if not exists tipo_produto text not null default ''chave''';
    execute 'alter table chaves rename to produtos';
    execute 'create view chaves as select * from produtos';
  end if;
end $$;

-- Garante tipo_produto na produtos final e recria a view (reflete colunas novas)
alter table produtos add column if not exists tipo_produto text not null default 'chave';
do $$
begin
  if exists (select 1 from information_schema.views where table_schema='public' and table_name='chaves') then
    execute 'drop view chaves';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='chaves') then
    execute 'create view chaves as select * from produtos';
  end if;
end $$;

-- RLS
alter table produtos enable row level security;
drop policy if exists "acesso_total" on produtos;
create policy "acesso_total" on produtos for all using (true) with check (true);

notify pgrst, 'reload schema';

-- ============ PARTE 4 — cadastro completo de fabricante (colunas novas) ============
-- Adiciona campos de fabricante (CNPJ, IE, contato, endereco). Idempotente.
alter table fabricantes add column if not exists cnpj text;
alter table fabricantes add column if not exists inscricao_estadual text;
alter table fabricantes add column if not exists telefone text;
alter table fabricantes add column if not exists email text;
alter table fabricantes add column if not exists contato text;
alter table fabricantes add column if not exists endereco text;
alter table fabricantes add column if not exists cidade text;
alter table fabricantes add column if not exists uf text;
alter table fabricantes add column if not exists cep text;
alter table fabricantes add column if not exists observacoes text;

-- Desconto no total da venda/OS (venda rapida do PDV e desconto fixo da OS)
alter table servicos add column if not exists desconto numeric not null default 0;

-- #23: o codigo do produto passa a ser OPCIONAL. Ele representa o codigo de
-- barras (leitor); a identificacao/descritivo fica no Nome (coluna descricao).
-- Produtos sem codigo de barras sao identificados so pelo Nome. (idempotente:
-- rodar de novo num codigo ja anulavel nao dá erro.)
alter table produtos alter column codigo drop not null;

-- Imagens (fotos) de produtos e de servicos/OS, numa tabela unica e simples.
-- tipo = 'produto' | 'servico'; referencia_id = id do produto ou do servico.
-- Carregada SOB DEMANDA (a listagem de produtos nao puxa a imagem).
create table if not exists imagens (
  id bigint generated always as identity primary key,
  tipo text not null,
  referencia_id bigint not null,
  imagem text not null,
  criado_em timestamptz not null default now()
);
create index if not exists idx_imagens_ref on imagens(tipo, referencia_id);
alter table imagens enable row level security;
drop policy if exists "acesso_total" on imagens;
create policy "acesso_total" on imagens for all using (true) with check (true);

-- Comissao do vendedor (funcionario): % fixo sobre o valor das vendas dele
alter table funcionarios add column if not exists comissao_percentual numeric not null default 0;

-- #628: Historico da OS — linha do tempo de acoes (criada, editada, concluida,
-- pagamento, baixa). Append-only; some junto com a OS (on delete cascade).
create table if not exists os_historico (
  id bigint generated always as identity primary key,
  os_id bigint not null references servicos(id) on delete cascade,
  usuario text,
  acao text not null,
  observacao text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_os_historico_os on os_historico(os_id);
alter table os_historico enable row level security;
drop policy if exists "acesso_total" on os_historico;
create policy "acesso_total" on os_historico for all using (true) with check (true);

-- ------------------------------------------------------------
-- 5) Versao do schema = 5 (comissao, desconto, imagens, historico da OS,
--    codigo do produto opcional). Mantem o banner de "desatualizado" correto.
-- ------------------------------------------------------------
insert into configuracoes (chave, valor) values ('schema_version', '5')
on conflict (chave) do update set valor = excluded.valor;

notify pgrst, 'reload schema';


-- ============ PARTE 6 — tipos de produto no banco (v6) ============
-- ============================================================
-- Tira os tipos de produto da lista fixa do codigo e passa para uma
-- tabela editavel (igual as categorias). Idempotente: cria se nao existir
-- e so semeia os 6 padroes se a tabela estiver vazia.
-- ============================================================
create table if not exists tipos_produto (
  id bigint generated always as identity primary key,
  chave text not null,
  rotulo text not null,
  icone text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Evita tipos com a mesma chave (ignorando maiusc/minusc)
create unique index if not exists idx_tipos_produto_chave_unica
  on tipos_produto (lower(chave));

-- Tipos padrao. So semeia se a tabela estiver vazia (idempotente).
insert into tipos_produto (chave, rotulo, icone)
select v.chave, v.rotulo, v.icone from (values
  ('chave', 'Chave', '🔑'),
  ('fechadura', 'Fechadura', '🔒'),
  ('peca', 'Peça', '⚙️'),
  ('servico', 'Serviço', '🛠️'),
  ('gas', 'Gás', '❄️'),
  ('ferramentas', 'Ferramentas', '🔧')
) as v(chave, rotulo, icone)
where not exists (select 1 from tipos_produto);

-- Seguranca (RLS)
alter table tipos_produto enable row level security;
drop policy if exists "acesso_total" on tipos_produto;
create policy "acesso_total" on tipos_produto for all using (true) with check (true);

-- ------------------------------------------------------------
-- 6) Versao do schema = 6 (tipos de produto editaveis no banco).
-- ------------------------------------------------------------
insert into configuracoes (chave, valor) values ('schema_version', '6')
on conflict (chave) do update set valor = excluded.valor;

notify pgrst, 'reload schema';


-- ============ PARTE 7 — formas de pagamento no banco (v7) ============
-- ============================================================
-- Cria a tabela formas_pagamento (corrige o erro PGRST205
-- "Could not find the table public.formas_pagamento"). Idempotente:
-- cria se nao existir e so semeia os 4 padroes se a tabela estiver vazia.
-- Colunas usadas pelo index.html: id, nome, ativo.
-- ============================================================
create table if not exists formas_pagamento (
  id bigint generated always as identity primary key,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Seguranca (RLS)
alter table formas_pagamento enable row level security;
drop policy if exists "acesso_total" on formas_pagamento;
create policy "acesso_total" on formas_pagamento for all using (true) with check (true);

-- Formas padrao (Dinheiro, Pix, Cartao, Transferencia) so quando a tabela
-- estiver vazia. Assim nao ressuscita formas que o usuario apagou/inativou.
insert into formas_pagamento (nome)
select nome
from (values ('Dinheiro'), ('Pix'), ('Cartão'), ('Transferência')) as padrao(nome)
where not exists (select 1 from formas_pagamento);

-- ------------------------------------------------------------
-- 7) Versao do schema = 7 (formas de pagamento no banco).
-- ------------------------------------------------------------
insert into configuracoes (chave, valor) values ('schema_version', '7')
on conflict (chave) do update set valor = excluded.valor;

notify pgrst, 'reload schema';

-- ============================================================
-- ============ escrita atomica no servidor ============
-- ============================================================
-- Cria as funcoes de escrita ATOMICA (pdv_finalizar_venda, os_dar_baixa,
-- os_salvar): gravam OS + movimentacoes de estoque + transacao financeira numa
-- UNICA transacao, com rollback automatico se qualquer parte falhar. Fim dos
-- registros orfaos (OS concluida sem baixa; OS paga sem lancamento).
-- Idempotente: create or replace. Fallback no cliente: se a funcao ainda nao
-- existe no banco, o app cai no caminho antigo (com os if(error) throw).
-- ============================================================

-- Venda rapida (PDV): cria a OS is_pdv, baixa o estoque de cada item fisico
-- (movimentacao de saida — o trigger recalcula o estoque) e, se paga, lanca a
-- entrada no financeiro. Retorna o id da OS criada. Tudo atomico.
create or replace function pdv_finalizar_venda(
  p_cliente_id bigint,
  p_total numeric,
  p_desconto numeric,
  p_status text,
  p_status_pagamento text,
  p_forma_pagamento text,
  p_valor_pago numeric,
  p_itens jsonb,
  p_funcionario_id bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $rpc$
declare
  v_os_id bigint;
  v_item jsonb;
begin
  -- 1. cria a OS (venda rapida)
  insert into servicos (
    cliente_id, tipo, titulo, status, mao_de_obra, total, desconto,
    status_pagamento, forma_pagamento, valor_pago, itens, is_pdv,
    funcionario_id, concluido_em
  ) values (
    p_cliente_id, 'residencial', 'Venda Rápida (Balcão)', p_status, 0, p_total,
    coalesce(p_desconto, 0), p_status_pagamento, p_forma_pagamento,
    coalesce(p_valor_pago, 0), coalesce(p_itens, '[]'::jsonb), true,
    p_funcionario_id,
    case when p_status_pagamento = 'pago' then now() else null end
  ) returning id into v_os_id;

  -- 2. baixa de estoque: uma movimentacao de saida por item COM chave_id.
  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    if (v_item->>'chave_id') is not null then
      insert into movimentacoes_estoque (
        chave_id, tipo, quantidade, motivo, servico_id, funcionario_id
      ) values (
        (v_item->>'chave_id')::bigint, 'saida',
        (v_item->>'quantidade')::integer,
        'Venda Rápida OS #' || v_os_id, v_os_id, p_funcionario_id
      );
    end if;
  end loop;

  -- 3. lancamento financeiro, se houve pagamento.
  if coalesce(p_valor_pago, 0) > 0 then
    insert into transacoes (
      servico_id, tipo, valor, descricao, forma_pagamento, funcionario_id
    ) values (
      v_os_id, 'entrada', p_valor_pago, 'Venda Rápida OS #' || v_os_id,
      p_forma_pagamento, p_funcionario_id
    );
  end if;

  return v_os_id;
end;
$rpc$;

-- Baixa/recebimento de OS ja existente: marca como paga (e conclui, baixando o
-- estoque, se ainda nao estava concluida), lancando o saldo recebido no
-- financeiro. Idempotente na baixa de estoque (nao baixa de novo se ja houve
-- saida para a OS). Retorna o id da OS. Tudo atomico.
create or replace function os_dar_baixa(
  p_os_id bigint,
  p_total numeric,
  p_saldo numeric,
  p_titulo text,
  p_forma_pagamento text,
  p_funcionario_id bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $rpc$
declare
  v_ja_concluida boolean;
  v_ja_baixou boolean;
  v_item jsonb;
  v_itens jsonb;
begin
  select (status = 'concluido'), itens
    into v_ja_concluida, v_itens
    from servicos where id = p_os_id
    for update;
  if not found then
    raise exception 'OS % nao encontrada', p_os_id;
  end if;

  -- marca pago/quitado; conclui se ainda nao estava.
  if v_ja_concluida then
    update servicos
       set status_pagamento = 'pago', valor_pago = p_total
     where id = p_os_id;
  else
    update servicos
       set status_pagamento = 'pago', valor_pago = p_total,
           status = 'concluido', concluido_em = now()
     where id = p_os_id;
  end if;

  -- baixa de estoque so se a OS ainda nao havia baixado (evita baixa dupla).
  if not v_ja_concluida then
    select exists(
      select 1 from movimentacoes_estoque
       where servico_id = p_os_id and tipo = 'saida'
    ) into v_ja_baixou;
    if not v_ja_baixou then
      for v_item in select * from jsonb_array_elements(coalesce(v_itens, '[]'::jsonb))
      loop
        if (v_item->>'chave_id') is not null then
          insert into movimentacoes_estoque (
            chave_id, tipo, quantidade, motivo, servico_id, funcionario_id
          ) values (
            (v_item->>'chave_id')::bigint, 'saida',
            (v_item->>'quantidade')::integer,
            'OS #' || p_os_id, p_os_id, p_funcionario_id
          );
        end if;
      end loop;
    end if;
  end if;

  -- lanca o saldo recebido no financeiro (se faltava receber).
  if coalesce(p_saldo, 0) > 0 then
    insert into transacoes (
      servico_id, tipo, valor, descricao, forma_pagamento, funcionario_id
    ) values (
      p_os_id, 'entrada', p_saldo,
      'Baixa OS #' || p_os_id || ' - ' || coalesce(p_titulo, 'recebimento'),
      coalesce(p_forma_pagamento, 'Dinheiro'), p_funcionario_id
    );
  end if;

  return p_os_id;
end;
$rpc$;

-- OS normal (criar/editar): grava a OS, e — se ela passou a concluida agora —
-- baixa o estoque das pecas e lanca (ou ajusta) o pagamento no financeiro, tudo
-- numa transacao. Para EDICAO passe p_os_id; para CRIACAO passe null.
-- p_pago_antigo = valor_pago anterior (0 na criacao) para calcular a diferenca
-- do lancamento. p_ja_concluida = a OS ja estava concluida antes (nao rebaixa
-- estoque). Retorna o id da OS. Tudo atomico.
create or replace function os_salvar(
  p_os_id bigint,
  p_dados jsonb,
  p_itens jsonb,
  p_pago_antigo numeric,
  p_ja_concluida boolean,
  p_funcionario_id bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $rpc$
declare
  v_os_id bigint;
  v_status text;
  v_pago numeric;
  v_forma text;
  v_diferenca numeric;
  v_item jsonb;
begin
  v_status := p_dados->>'status';
  v_pago := coalesce((p_dados->>'valor_pago')::numeric, 0);
  v_forma := p_dados->>'forma_pagamento';

  if p_os_id is null then
    insert into servicos (
      cliente_id, tipo, titulo, descricao, veiculo, endereco, status,
      mao_de_obra, total, desconto, status_pagamento, forma_pagamento,
      valor_pago, itens, funcionario_id
    ) values (
      nullif(p_dados->>'cliente_id','')::bigint, p_dados->>'tipo',
      p_dados->>'titulo', p_dados->>'descricao', p_dados->>'veiculo',
      p_dados->>'endereco', v_status,
      coalesce((p_dados->>'mao_de_obra')::numeric, 0),
      coalesce((p_dados->>'total')::numeric, 0),
      coalesce((p_dados->>'desconto')::numeric, 0),
      p_dados->>'status_pagamento', v_forma, v_pago,
      coalesce(p_itens, '[]'::jsonb), p_funcionario_id
    ) returning id into v_os_id;
  else
    v_os_id := p_os_id;
    update servicos set
      cliente_id = nullif(p_dados->>'cliente_id','')::bigint,
      tipo = p_dados->>'tipo', titulo = p_dados->>'titulo',
      descricao = p_dados->>'descricao', veiculo = p_dados->>'veiculo',
      endereco = p_dados->>'endereco', status = v_status,
      mao_de_obra = coalesce((p_dados->>'mao_de_obra')::numeric, 0),
      total = coalesce((p_dados->>'total')::numeric, 0),
      desconto = coalesce((p_dados->>'desconto')::numeric, 0),
      status_pagamento = p_dados->>'status_pagamento',
      forma_pagamento = v_forma, valor_pago = v_pago,
      itens = coalesce(p_itens, '[]'::jsonb)
    where id = v_os_id;
  end if;

  -- baixa estoque se a OS esta concluida e ainda nao havia baixado.
  if v_status = 'concluido' and not coalesce(p_ja_concluida, false) then
    for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
    loop
      if (v_item->>'chave_id') is not null then
        insert into movimentacoes_estoque (
          chave_id, tipo, quantidade, motivo, servico_id, funcionario_id
        ) values (
          (v_item->>'chave_id')::bigint, 'saida',
          (v_item->>'quantidade')::integer,
          'OS #' || v_os_id, v_os_id, p_funcionario_id
        );
      end if;
    end loop;
    update servicos set concluido_em = now() where id = v_os_id;
  end if;

  -- estorna estoque se a OS concluida foi CANCELADA (devolve as pecas).
  if v_status = 'cancelado' and coalesce(p_ja_concluida, false) then
    insert into movimentacoes_estoque (
      chave_id, tipo, quantidade, motivo, servico_id, funcionario_id
    )
    select m.chave_id, 'entrada', m.quantidade,
           'Estorno OS #' || v_os_id || ' (cancelada)', v_os_id, p_funcionario_id
      from movimentacoes_estoque m
     where m.servico_id = v_os_id and m.tipo = 'saida' and m.chave_id is not null;
  end if;

  -- lancamento financeiro pela diferenca de pagamento.
  v_diferenca := v_pago - coalesce(p_pago_antigo, 0);
  if v_diferenca <> 0 then
    insert into transacoes (
      servico_id, tipo, valor, descricao, forma_pagamento, funcionario_id
    ) values (
      v_os_id, case when v_diferenca > 0 then 'entrada' else 'saida' end,
      abs(v_diferenca),
      case when p_os_id is null then 'Recebimento' else 'Ajuste pagamento' end
        || ' OS #' || v_os_id,
      v_forma, p_funcionario_id
    );
  end if;

  return v_os_id;
end;
$rpc$;

-- ------------------------------------------------------------
-- EXTENSAO DE CRIPTOGRAFIA (precisa existir ANTES do login RPC, que ja
-- usa crypt(); o Postgres valida o corpo da funcao na criacao). pgcrypto da
-- crypt() + gen_salt('bf') = bcrypt. 'if not exists' = seguro reexecutar. No
-- Supabase cai em 'extensions'; em Postgres cru, em 'public' -- por isso as
-- funcoes declaram search_path = public, extensions.
-- ------------------------------------------------------------
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 9) LOGIN NO SERVIDOR (protecao de acesso por funcionario)
-- Move a comparacao de senha do NAVEGADOR para o SERVIDOR. Ate aqui o
-- index.html buscava a linha com .select("*") e comparava data.senha em JS,
-- o que trafegava a senha em texto puro e permitia brute-force por filtro de
-- URL do PostgREST (?usuario=eq.x&senha=eq.<chute>). Esta funcao recebe
-- usuario+senha e devolve SO os campos de sessao quando bate; nunca devolve a
-- coluna senha. a coluna guarda HASH bcrypt e a comparacao usa
-- crypt(p_senha, senha) = senha. security definer + search_path
-- public,extensions (acha crypt() esteja o pgcrypto em public ou extensions);
-- create or replace = idempotente. Nao amplia acesso (RLS ja e 'acesso_total').
-- Fase seguinte: ver .
-- ------------------------------------------------------------
create or replace function funcionario_login(
  p_usuario text,
  p_senha text
) returns table (
  id bigint,
  usuario text,
  nome text,
  perfil text,
  permissoes text
)
language sql
security definer
set search_path = public, extensions
as $rpc$
  select f.id, f.usuario, f.nome, f.perfil, f.permissoes
    from funcionarios f
   where f.usuario = p_usuario
     and f.ativo = true
     and crypt(p_senha, f.senha) = f.senha
   limit 1;
$rpc$;

-- ------------------------------------------------------------
-- 10) HASHEAR A SENHA E ESCONDER A COLUNA
-- (pgcrypto ja foi criado acima, antes do login RPC)
-- ------------------------------------------------------------
-- MIGRACAO das senhas existentes (texto puro -> bcrypt), idempotente e segura.
-- Como distinguir ja-hasheada de texto puro: bcrypt comeca com '$2'. So
-- re-hasheia quem NAO comeca com '$2'. Rodar de novo = no-op (ja todas '$2...').
-- Nao trava login: quem tinha texto puro passa a ter hash; o RPC ja compara com
-- crypt(). Feito ANTES de esconder a coluna (ainda temos escrita direta aqui).
update funcionarios
   set senha = crypt(senha, gen_salt('bf'))
 where senha is not null
   and senha not like '$2%';

-- CADASTRO/EDICAO NO SERVIDOR: o navegador nunca grava senha (texto nem hash)
-- direto na coluna; chama este RPC, que hasheia no servidor. p_id nulo/0 =
-- insere; com id = atualiza. p_senha nulo/vazio na edicao = mantem a atual.
-- security definer para gravar apos revogarmos o write direto da coluna senha.
create or replace function funcionario_salvar(
  p_id bigint,
  p_usuario text,
  p_senha text,
  p_nome text,
  p_perfil text,
  p_ativo boolean,
  p_permissoes text,
  p_comissao_percentual numeric
) returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $rpc$
declare
  v_id bigint;
  v_hash text;
begin
  if p_senha is not null and length(p_senha) > 0 then
    v_hash := crypt(p_senha, gen_salt('bf'));
  end if;

  if p_id is null or p_id = 0 then
    if v_hash is null then
      raise exception 'Senha obrigatoria para novo funcionario';
    end if;
    insert into funcionarios (usuario, senha, nome, perfil, ativo, permissoes, comissao_percentual)
    values (p_usuario, v_hash, p_nome, p_perfil, coalesce(p_ativo, true),
            p_permissoes, coalesce(p_comissao_percentual, 0))
    returning id into v_id;
  else
    update funcionarios
       set nome = p_nome,
           perfil = p_perfil,
           ativo = coalesce(p_ativo, ativo),
           permissoes = p_permissoes,
           comissao_percentual = coalesce(p_comissao_percentual, comissao_percentual),
           senha = coalesce(v_hash, senha)
     where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$rpc$;

-- ESCONDER A COLUNA senha DA CHAVE anon.
-- So 'revoke select (senha)' NAO basta quando ha um 'grant select' de tabela
-- inteira (caso do Supabase) -- provado em Postgres real: o grant amplo cobre
-- a coluna e o revoke de coluna nao surte efeito. A forma que realmente esconde:
-- REVOGAR o select de tabela e conceder select so na LISTA de colunas sem
-- senha. Assim ?select=senha e ?select=* sao recusados; o resto segue legivel.
-- Idempotente: revoke/grant repetidos = no-op; create or replace view idem.
do $seg$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end $seg$;

create or replace view funcionarios_visao as
  select id, usuario, nome, perfil, ativo, permissoes, comissao_percentual, criado_em
    from funcionarios;

revoke select on funcionarios from anon;
revoke select on funcionarios from authenticated;
grant select (id, usuario, nome, perfil, ativo, permissoes, comissao_percentual, criado_em)
  on funcionarios to anon;
grant select (id, usuario, nome, perfil, ativo, permissoes, comissao_percentual, criado_em)
  on funcionarios to authenticated;
revoke insert (senha) on funcionarios from anon;
revoke insert (senha) on funcionarios from authenticated;
revoke update (senha) on funcionarios from anon;
revoke update (senha) on funcionarios from authenticated;
grant select on funcionarios_visao to anon;
grant select on funcionarios_visao to authenticated;

-- ============================================================
-- 2026082201 - Paridade com a versao de computador (parte 1):
--   - E-MAIL do cliente (coluna clientes.email)
--   - DATA PREVISTA na Ordem de Servico (coluna servicos.data_prevista)
--   - Formas de pagamento: debito e cartao parcelado
-- Tudo idempotente e sem apagar dados. As colunas usam IF NOT EXISTS; as
-- formas so entram quando ainda nao existem (nao ressuscita as apagadas).
-- ============================================================

-- E-mail do cliente (antes so o fabricante tinha e-mail).
alter table clientes add column if not exists email text;

-- Data prevista de entrega/conclusao da OS.
alter table servicos add column if not exists data_prevista date;

-- Novas formas de pagamento (so insere as que faltam, uma a uma).
insert into formas_pagamento (nome)
select v.nome
from (values
  ('Cartão de Débito'), ('Cartão de Crédito'), ('Cartão Parcelado')
) as v(nome)
where not exists (
  select 1 from formas_pagamento f where f.nome = v.nome
);

-- os_salvar passa a gravar a data prevista da OS. Recriada por completo para
-- manter em sincronia com o criar-banco.sql (mesma logica + data_prevista).
create or replace function os_salvar(
  p_os_id bigint,
  p_dados jsonb,
  p_itens jsonb,
  p_pago_antigo numeric,
  p_ja_concluida boolean,
  p_funcionario_id bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $rpc$
declare
  v_os_id bigint;
  v_status text;
  v_pago numeric;
  v_forma text;
  v_diferenca numeric;
  v_item jsonb;
begin
  v_status := p_dados->>'status';
  v_pago := coalesce((p_dados->>'valor_pago')::numeric, 0);
  v_forma := p_dados->>'forma_pagamento';

  if p_os_id is null then
    insert into servicos (
      cliente_id, tipo, titulo, descricao, veiculo, endereco, status,
      mao_de_obra, total, desconto, status_pagamento, forma_pagamento,
      valor_pago, itens, funcionario_id, data_prevista
    ) values (
      nullif(p_dados->>'cliente_id','')::bigint, p_dados->>'tipo',
      p_dados->>'titulo', p_dados->>'descricao', p_dados->>'veiculo',
      p_dados->>'endereco', v_status,
      coalesce((p_dados->>'mao_de_obra')::numeric, 0),
      coalesce((p_dados->>'total')::numeric, 0),
      coalesce((p_dados->>'desconto')::numeric, 0),
      p_dados->>'status_pagamento', v_forma, v_pago,
      coalesce(p_itens, '[]'::jsonb), p_funcionario_id,
      nullif(p_dados->>'data_prevista','')::date
    ) returning id into v_os_id;
  else
    v_os_id := p_os_id;
    update servicos set
      cliente_id = nullif(p_dados->>'cliente_id','')::bigint,
      tipo = p_dados->>'tipo', titulo = p_dados->>'titulo',
      descricao = p_dados->>'descricao', veiculo = p_dados->>'veiculo',
      endereco = p_dados->>'endereco', status = v_status,
      mao_de_obra = coalesce((p_dados->>'mao_de_obra')::numeric, 0),
      total = coalesce((p_dados->>'total')::numeric, 0),
      desconto = coalesce((p_dados->>'desconto')::numeric, 0),
      status_pagamento = p_dados->>'status_pagamento',
      forma_pagamento = v_forma, valor_pago = v_pago,
      itens = coalesce(p_itens, '[]'::jsonb),
      data_prevista = nullif(p_dados->>'data_prevista','')::date
    where id = v_os_id;
  end if;

  -- baixa estoque se a OS esta concluida e ainda nao havia baixado.
  if v_status = 'concluido' and not coalesce(p_ja_concluida, false) then
    for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
    loop
      if (v_item->>'chave_id') is not null then
        insert into movimentacoes_estoque (
          chave_id, tipo, quantidade, motivo, servico_id, funcionario_id
        ) values (
          (v_item->>'chave_id')::bigint, 'saida',
          (v_item->>'quantidade')::integer,
          'OS #' || v_os_id, v_os_id, p_funcionario_id
        );
      end if;
    end loop;
    update servicos set concluido_em = now() where id = v_os_id;
  end if;

  -- estorna estoque se a OS concluida foi CANCELADA (devolve as pecas).
  if v_status = 'cancelado' and coalesce(p_ja_concluida, false) then
    insert into movimentacoes_estoque (
      chave_id, tipo, quantidade, motivo, servico_id, funcionario_id
    )
    select m.chave_id, 'entrada', m.quantidade,
           'Estorno OS #' || v_os_id || ' (cancelada)', v_os_id, p_funcionario_id
      from movimentacoes_estoque m
     where m.servico_id = v_os_id and m.tipo = 'saida' and m.chave_id is not null;
  end if;

  -- lancamento financeiro pela diferenca de pagamento.
  v_diferenca := v_pago - coalesce(p_pago_antigo, 0);
  if v_diferenca <> 0 then
    insert into transacoes (
      servico_id, tipo, valor, descricao, forma_pagamento, funcionario_id
    ) values (
      v_os_id, case when v_diferenca > 0 then 'entrada' else 'saida' end,
      abs(v_diferenca),
      case when p_os_id is null then 'Recebimento' else 'Ajuste pagamento' end
        || ' OS #' || v_os_id,
      v_forma, p_funcionario_id
    );
  end if;

  return v_os_id;
end;
$rpc$;

-- ============================================================
-- 2026082202 - Paridade com a versao de computador (parte 2): FINANCEIRO
--   - CATEGORIA da receita/despesa
--   - DATA DE VENCIMENTO e situacao PAGO/RECEBIDO (contas a pagar/receber)
--   - PARCELAMENTO (numero da parcela, total e grupo que liga as parcelas)
-- Colunas novas na tabela transacoes, idempotentes e sem apagar dados.
-- 'pago' entra com default true para que os lancamentos antigos continuem
-- contando como quitados (mesmo comportamento de antes).
-- ============================================================
alter table transacoes add column if not exists categoria text;
alter table transacoes add column if not exists data_vencimento date;
alter table transacoes add column if not exists pago boolean not null default true;
alter table transacoes add column if not exists parcela_num integer not null default 1;
alter table transacoes add column if not exists parcela_total integer not null default 1;
alter table transacoes add column if not exists grupo_parcela text;

-- ============================================================
-- 2026082203 - Equivalencia de chaves: paridade final de schema.
-- Os dois programas ja usam o MESMO modelo (marca, modelo, dovale, gold,
-- land, jas) com os mesmos 868 modelos semeados — a convergencia de dados ja
-- estava feita. Falta so a coluna criado_em (que a versao de computador tem)
-- para o schema ficar identico. Additiva e idempotente: nao altera nem apaga
-- nenhuma equivalencia existente.
-- ============================================================
alter table equivalencias add column if not exists criado_em timestamptz not null default now();

-- ============================================================
-- 2026082401 - TAXA DE CARTAO POR FORMA DE PAGAMENTO (valor liquido)
-- ============================================================
-- Ao marcar uma venda/OS como paga em credito/debito, a taxa da operadora era
-- ignorada. Agora cada forma de pagamento tem taxa_percentual e o lancamento
-- financeiro guarda tambem o valor liquido (total menos a taxa) em
-- transacoes.valor_liquido. Additivo e idempotente. Caminho de reserva no
-- cliente: se a coluna nao existir, o app trata como taxa 0 (liquido = valor).
-- ============================================================
alter table formas_pagamento add column if not exists taxa_percentual numeric not null default 0;
alter table transacoes add column if not exists valor_liquido numeric;

-- Valor liquido depois da taxa da forma de pagamento (ver criar-banco.sql).
create or replace function valor_liquido_forma(p_valor numeric, p_forma text)
returns numeric
language plpgsql
security definer
set search_path = public
as $vlf$
declare
  v_taxa numeric;
begin
  if p_valor is null then
    return null;
  end if;
  select taxa_percentual into v_taxa
    from formas_pagamento
   where lower(nome) = lower(coalesce(p_forma, ''))
   order by ativo desc, id
   limit 1;
  if v_taxa is null or v_taxa = 0 then
    return p_valor;
  end if;
  return round(p_valor - (p_valor * v_taxa / 100.0), 2);
end;
$vlf$;

-- Recria as 3 funcoes de escrita atomica gravando transacoes.valor_liquido.
-- create or replace: o corpo abaixo e o que vale (substitui os anteriores).
create or replace function pdv_finalizar_venda(
  p_cliente_id bigint,
  p_total numeric,
  p_desconto numeric,
  p_status text,
  p_status_pagamento text,
  p_forma_pagamento text,
  p_valor_pago numeric,
  p_itens jsonb,
  p_funcionario_id bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $rpc$
declare
  v_os_id bigint;
  v_item jsonb;
begin
  insert into servicos (
    cliente_id, tipo, titulo, status, mao_de_obra, total, desconto,
    status_pagamento, forma_pagamento, valor_pago, itens, is_pdv,
    funcionario_id, concluido_em
  ) values (
    p_cliente_id, 'residencial', 'Venda Rápida (Balcão)', p_status, 0, p_total,
    coalesce(p_desconto, 0), p_status_pagamento, p_forma_pagamento,
    coalesce(p_valor_pago, 0), coalesce(p_itens, '[]'::jsonb), true,
    p_funcionario_id,
    case when p_status_pagamento = 'pago' then now() else null end
  ) returning id into v_os_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    if (v_item->>'chave_id') is not null then
      insert into movimentacoes_estoque (
        chave_id, tipo, quantidade, motivo, servico_id, funcionario_id
      ) values (
        (v_item->>'chave_id')::bigint, 'saida',
        (v_item->>'quantidade')::integer,
        'Venda Rápida OS #' || v_os_id, v_os_id, p_funcionario_id
      );
    end if;
  end loop;

  if coalesce(p_valor_pago, 0) > 0 then
    insert into transacoes (
      servico_id, tipo, valor, valor_liquido, descricao, forma_pagamento,
      funcionario_id
    ) values (
      v_os_id, 'entrada', p_valor_pago,
      valor_liquido_forma(p_valor_pago, p_forma_pagamento),
      'Venda Rápida OS #' || v_os_id, p_forma_pagamento, p_funcionario_id
    );
  end if;

  return v_os_id;
end;
$rpc$;

create or replace function os_dar_baixa(
  p_os_id bigint,
  p_total numeric,
  p_saldo numeric,
  p_titulo text,
  p_forma_pagamento text,
  p_funcionario_id bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $rpc$
declare
  v_ja_concluida boolean;
  v_ja_baixou boolean;
  v_item jsonb;
  v_itens jsonb;
begin
  select (status = 'concluido'), itens
    into v_ja_concluida, v_itens
    from servicos where id = p_os_id
    for update;
  if not found then
    raise exception 'OS % nao encontrada', p_os_id;
  end if;

  if v_ja_concluida then
    update servicos
       set status_pagamento = 'pago', valor_pago = p_total
     where id = p_os_id;
  else
    update servicos
       set status_pagamento = 'pago', valor_pago = p_total,
           status = 'concluido', concluido_em = now()
     where id = p_os_id;
  end if;

  if not v_ja_concluida then
    select exists(
      select 1 from movimentacoes_estoque
       where servico_id = p_os_id and tipo = 'saida'
    ) into v_ja_baixou;
    if not v_ja_baixou then
      for v_item in select * from jsonb_array_elements(coalesce(v_itens, '[]'::jsonb))
      loop
        if (v_item->>'chave_id') is not null then
          insert into movimentacoes_estoque (
            chave_id, tipo, quantidade, motivo, servico_id, funcionario_id
          ) values (
            (v_item->>'chave_id')::bigint, 'saida',
            (v_item->>'quantidade')::integer,
            'OS #' || p_os_id, p_os_id, p_funcionario_id
          );
        end if;
      end loop;
    end if;
  end if;

  if coalesce(p_saldo, 0) > 0 then
    insert into transacoes (
      servico_id, tipo, valor, valor_liquido, descricao, forma_pagamento,
      funcionario_id
    ) values (
      p_os_id, 'entrada', p_saldo,
      valor_liquido_forma(p_saldo, coalesce(p_forma_pagamento, 'Dinheiro')),
      'Baixa OS #' || p_os_id || ' - ' || coalesce(p_titulo, 'recebimento'),
      coalesce(p_forma_pagamento, 'Dinheiro'), p_funcionario_id
    );
  end if;

  return p_os_id;
end;
$rpc$;

create or replace function os_salvar(
  p_os_id bigint,
  p_dados jsonb,
  p_itens jsonb,
  p_pago_antigo numeric,
  p_ja_concluida boolean,
  p_funcionario_id bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $rpc$
declare
  v_os_id bigint;
  v_status text;
  v_pago numeric;
  v_forma text;
  v_diferenca numeric;
  v_item jsonb;
begin
  v_status := p_dados->>'status';
  v_pago := coalesce((p_dados->>'valor_pago')::numeric, 0);
  v_forma := p_dados->>'forma_pagamento';

  if p_os_id is null then
    insert into servicos (
      cliente_id, tipo, titulo, descricao, veiculo, endereco, status,
      mao_de_obra, total, desconto, status_pagamento, forma_pagamento,
      valor_pago, itens, funcionario_id, data_prevista
    ) values (
      nullif(p_dados->>'cliente_id','')::bigint, p_dados->>'tipo',
      p_dados->>'titulo', p_dados->>'descricao', p_dados->>'veiculo',
      p_dados->>'endereco', v_status,
      coalesce((p_dados->>'mao_de_obra')::numeric, 0),
      coalesce((p_dados->>'total')::numeric, 0),
      coalesce((p_dados->>'desconto')::numeric, 0),
      p_dados->>'status_pagamento', v_forma, v_pago,
      coalesce(p_itens, '[]'::jsonb), p_funcionario_id,
      nullif(p_dados->>'data_prevista','')::date
    ) returning id into v_os_id;
  else
    v_os_id := p_os_id;
    update servicos set
      cliente_id = nullif(p_dados->>'cliente_id','')::bigint,
      tipo = p_dados->>'tipo', titulo = p_dados->>'titulo',
      descricao = p_dados->>'descricao', veiculo = p_dados->>'veiculo',
      endereco = p_dados->>'endereco', status = v_status,
      mao_de_obra = coalesce((p_dados->>'mao_de_obra')::numeric, 0),
      total = coalesce((p_dados->>'total')::numeric, 0),
      desconto = coalesce((p_dados->>'desconto')::numeric, 0),
      status_pagamento = p_dados->>'status_pagamento',
      forma_pagamento = v_forma, valor_pago = v_pago,
      itens = coalesce(p_itens, '[]'::jsonb),
      data_prevista = nullif(p_dados->>'data_prevista','')::date
    where id = v_os_id;
  end if;

  if v_status = 'concluido' and not coalesce(p_ja_concluida, false) then
    for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
    loop
      if (v_item->>'chave_id') is not null then
        insert into movimentacoes_estoque (
          chave_id, tipo, quantidade, motivo, servico_id, funcionario_id
        ) values (
          (v_item->>'chave_id')::bigint, 'saida',
          (v_item->>'quantidade')::integer,
          'OS #' || v_os_id, v_os_id, p_funcionario_id
        );
      end if;
    end loop;
    update servicos set concluido_em = now() where id = v_os_id;
  end if;

  if v_status = 'cancelado' and coalesce(p_ja_concluida, false) then
    insert into movimentacoes_estoque (
      chave_id, tipo, quantidade, motivo, servico_id, funcionario_id
    )
    select m.chave_id, 'entrada', m.quantidade,
           'Estorno OS #' || v_os_id || ' (cancelada)', v_os_id, p_funcionario_id
      from movimentacoes_estoque m
     where m.servico_id = v_os_id and m.tipo = 'saida' and m.chave_id is not null;
  end if;

  v_diferenca := v_pago - coalesce(p_pago_antigo, 0);
  if v_diferenca <> 0 then
    insert into transacoes (
      servico_id, tipo, valor, valor_liquido, descricao, forma_pagamento,
      funcionario_id
    ) values (
      v_os_id, case when v_diferenca > 0 then 'entrada' else 'saida' end,
      abs(v_diferenca),
      case when v_diferenca > 0
        then valor_liquido_forma(abs(v_diferenca), v_forma)
        else abs(v_diferenca) end,
      case when p_os_id is null then 'Recebimento' else 'Ajuste pagamento' end
        || ' OS #' || v_os_id,
      v_forma, p_funcionario_id
    );
  end if;

  return v_os_id;
end;
$rpc$;

-- ============================================================
-- 2026082701 - Data de vencimento na venda/OS pendente ou fiado.
-- Ate aqui so o lancamento manual do Financeiro tinha vencimento. Agora a
-- Venda Rapida (PDV) e a Ordem de Servico tambem guardam a DATA DE VENCIMENTO
-- da conta a receber quando o pagamento NAO e 'pago' integral (fiado/pendente/
-- parcial). Coluna nova em servicos (nullable) + as RPCs de escrita passam a
-- gravar o vencimento. Additiva e idempotente.
-- ============================================================
alter table servicos add column if not exists data_vencimento date;

-- pdv_finalizar_venda ganha o parametro p_data_vencimento (default null, para
-- manter compatibilidade). Como o novo parametro muda a assinatura, derruba a
-- versao antiga antes de recriar (evita ambiguidade no PostgREST).
drop function if exists pdv_finalizar_venda(bigint, numeric, numeric, text, text, text, numeric, jsonb, bigint);
create or replace function pdv_finalizar_venda(
  p_cliente_id bigint,
  p_total numeric,
  p_desconto numeric,
  p_status text,
  p_status_pagamento text,
  p_forma_pagamento text,
  p_valor_pago numeric,
  p_itens jsonb,
  p_funcionario_id bigint,
  p_data_vencimento date default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $rpc$
declare
  v_os_id bigint;
  v_item jsonb;
begin
  -- Vencimento so grava quando NAO esta pago integral (conta a receber).
  insert into servicos (
    cliente_id, tipo, titulo, status, mao_de_obra, total, desconto,
    status_pagamento, forma_pagamento, valor_pago, itens, is_pdv,
    funcionario_id, data_vencimento, concluido_em
  ) values (
    p_cliente_id, 'residencial', 'Venda Rápida (Balcão)', p_status, 0, p_total,
    coalesce(p_desconto, 0), p_status_pagamento, p_forma_pagamento,
    coalesce(p_valor_pago, 0), coalesce(p_itens, '[]'::jsonb), true,
    p_funcionario_id,
    case when p_status_pagamento = 'pago' then null else p_data_vencimento end,
    case when p_status_pagamento = 'pago' then now() else null end
  ) returning id into v_os_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    if (v_item->>'chave_id') is not null then
      insert into movimentacoes_estoque (
        chave_id, tipo, quantidade, motivo, servico_id, funcionario_id
      ) values (
        (v_item->>'chave_id')::bigint, 'saida',
        (v_item->>'quantidade')::integer,
        'Venda Rápida OS #' || v_os_id, v_os_id, p_funcionario_id
      );
    end if;
  end loop;

  if coalesce(p_valor_pago, 0) > 0 then
    insert into transacoes (
      servico_id, tipo, valor, valor_liquido, descricao, forma_pagamento,
      funcionario_id
    ) values (
      v_os_id, 'entrada', p_valor_pago,
      valor_liquido_forma(p_valor_pago, p_forma_pagamento),
      'Venda Rápida OS #' || v_os_id, p_forma_pagamento, p_funcionario_id
    );
  end if;

  return v_os_id;
end;
$rpc$;

-- os_salvar mantem a mesma assinatura: o vencimento vem dentro de p_dados
-- (chave 'data_vencimento'). Recriada por completo para gravar a coluna nova.
create or replace function os_salvar(
  p_os_id bigint,
  p_dados jsonb,
  p_itens jsonb,
  p_pago_antigo numeric,
  p_ja_concluida boolean,
  p_funcionario_id bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $rpc$
declare
  v_os_id bigint;
  v_status text;
  v_pago numeric;
  v_forma text;
  v_diferenca numeric;
  v_item jsonb;
begin
  v_status := p_dados->>'status';
  v_pago := coalesce((p_dados->>'valor_pago')::numeric, 0);
  v_forma := p_dados->>'forma_pagamento';

  if p_os_id is null then
    insert into servicos (
      cliente_id, tipo, titulo, descricao, veiculo, endereco, status,
      mao_de_obra, total, desconto, status_pagamento, forma_pagamento,
      valor_pago, itens, funcionario_id, data_prevista, data_vencimento
    ) values (
      nullif(p_dados->>'cliente_id','')::bigint, p_dados->>'tipo',
      p_dados->>'titulo', p_dados->>'descricao', p_dados->>'veiculo',
      p_dados->>'endereco', v_status,
      coalesce((p_dados->>'mao_de_obra')::numeric, 0),
      coalesce((p_dados->>'total')::numeric, 0),
      coalesce((p_dados->>'desconto')::numeric, 0),
      p_dados->>'status_pagamento', v_forma, v_pago,
      coalesce(p_itens, '[]'::jsonb), p_funcionario_id,
      nullif(p_dados->>'data_prevista','')::date,
      nullif(p_dados->>'data_vencimento','')::date
    ) returning id into v_os_id;
  else
    v_os_id := p_os_id;
    update servicos set
      cliente_id = nullif(p_dados->>'cliente_id','')::bigint,
      tipo = p_dados->>'tipo', titulo = p_dados->>'titulo',
      descricao = p_dados->>'descricao', veiculo = p_dados->>'veiculo',
      endereco = p_dados->>'endereco', status = v_status,
      mao_de_obra = coalesce((p_dados->>'mao_de_obra')::numeric, 0),
      total = coalesce((p_dados->>'total')::numeric, 0),
      desconto = coalesce((p_dados->>'desconto')::numeric, 0),
      status_pagamento = p_dados->>'status_pagamento',
      forma_pagamento = v_forma, valor_pago = v_pago,
      itens = coalesce(p_itens, '[]'::jsonb),
      data_prevista = nullif(p_dados->>'data_prevista','')::date,
      data_vencimento = nullif(p_dados->>'data_vencimento','')::date
    where id = v_os_id;
  end if;

  if v_status = 'concluido' and not coalesce(p_ja_concluida, false) then
    for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
    loop
      if (v_item->>'chave_id') is not null then
        insert into movimentacoes_estoque (
          chave_id, tipo, quantidade, motivo, servico_id, funcionario_id
        ) values (
          (v_item->>'chave_id')::bigint, 'saida',
          (v_item->>'quantidade')::integer,
          'OS #' || v_os_id, v_os_id, p_funcionario_id
        );
      end if;
    end loop;
    update servicos set concluido_em = now() where id = v_os_id;
  end if;

  if v_status = 'cancelado' and coalesce(p_ja_concluida, false) then
    insert into movimentacoes_estoque (
      chave_id, tipo, quantidade, motivo, servico_id, funcionario_id
    )
    select m.chave_id, 'entrada', m.quantidade,
           'Estorno OS #' || v_os_id || ' (cancelada)', v_os_id, p_funcionario_id
      from movimentacoes_estoque m
     where m.servico_id = v_os_id and m.tipo = 'saida' and m.chave_id is not null;
  end if;

  v_diferenca := v_pago - coalesce(p_pago_antigo, 0);
  if v_diferenca <> 0 then
    insert into transacoes (
      servico_id, tipo, valor, valor_liquido, descricao, forma_pagamento,
      funcionario_id
    ) values (
      v_os_id, case when v_diferenca > 0 then 'entrada' else 'saida' end,
      abs(v_diferenca),
      case when v_diferenca > 0
        then valor_liquido_forma(abs(v_diferenca), v_forma)
        else abs(v_diferenca) end,
      case when p_os_id is null then 'Recebimento' else 'Ajuste pagamento' end
        || ' OS #' || v_os_id,
      v_forma, p_funcionario_id
    );
  end if;

  return v_os_id;
end;
$rpc$;

-- ------------------------------------------------------------
-- Versao do schema no formato AAAAMMDDii (ano+mes+dia + indice 00-99 do dia).
-- 2026082201 = 22/08/2026 (2a do dia: e-mail do cliente, data prevista da OS,
-- formas de pagamento debito/parcelado).
-- 2026082202 = 22/08/2026 (3a do dia: financeiro com categoria, vencimento,
-- pago/recebido e parcelamento).
-- 2026082203 = 22/08/2026 (4a do dia: coluna criado_em na equivalencia).
-- 2026082401 = 24/08/2026 (taxa de cartao por forma de pagamento; valor liquido
--              no lancamento financeiro).
-- 2026082700 = 27/08/2026 (garantia impressa no orcamento/recibo; mudanca de
--              aplicacao, sem alteracao de estrutura. A versao do banco avanca
--              sempre a cada publicacao, mesmo sem mudar tabela).
-- 2026082701 = 27/08/2026 (2a do dia: data de vencimento na venda/OS pendente
--              ou fiado - coluna servicos.data_vencimento e RPCs gravando).
-- As proximas migracoes usam a data do dia; nao voltar para numero sequencial.
-- ------------------------------------------------------------
insert into configuracoes (chave, valor) values ('schema_version', '2026082701')
on conflict (chave) do update set valor = excluded.valor;

notify pgrst, 'reload schema';
