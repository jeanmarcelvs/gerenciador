-- ATUALIZAÇÃO INTEGRAL DO CATÁLOGO BELENUS (MÓDULOS EXPANDIDOS + INVERSORES TÉCNICOS + FRETE)
-- Versão com Modelo Real Huawei, MPPTs e Diluição de Frete para Arapiraca/AL.

UPDATE configuracoes 
SET dados = '{
  "fornecedor": "Belenus/BelEnergy",
  "data_atualizacao": "2026-01-22",
  "regras_calculo": {
    "desconto_kit_padrao": 0.0659,
    "margem_seguranca_estrutura": 0,
    "fator_suporte_fixacao": 1.0,
    "fator_cabo_por_painel": 7.5,
    "frete_diluicao": [
      {"max_kwp": 5.5, "percentual": 0.1506},
      {"max_kwp": 15.0, "percentual": 0.1050},
      {"max_kwp": 30.0, "percentual": 0.0850},
      {"max_kwp": 999.0, "percentual": 0.0650}
    ]
  },
  "modulos": [
    {"cod": "MFRO-1.2-BF-144-585W", "desc": "Ronma 585W N-Type Bifacial", "custo_kit": 510.54, "wp": 585},
    {"cod": "MFMA-1.3-BF-115-540W", "desc": "Maxeon 540W PERC Bifacial", "custo_kit": 513.00, "wp": 540},
    {"cod": "MFMA-1.3-BF-115-545W", "desc": "Maxeon 545W PERC Bifacial", "custo_kit": 517.75, "wp": 545},
    {"cod": "MFGK-1.2-BF-132-605W", "desc": "Gokin 605W N-Type Bifacial", "custo_kit": 527.98, "wp": 605},
    {"cod": "MFRO-1.2-BF-132-610W", "desc": "Ronma 610W N-Type Bifacial", "custo_kit": 532.34, "wp": 610},
    {"cod": "MFSP-0.3-BF-132-610W", "desc": "Solar N Plus 610W (Compósito)", "custo_kit": 535.00, "wp": 610},
    {"cod": "MFTC-1.2-BF-132-610W", "desc": "TCL Solar 610W N-Type Bifacial", "custo_kit": 532.34, "wp": 610},
    {"cod": "MFTC-1.2-BF-132-620W", "desc": "TCL Solar 620W N-Type Bifacial", "custo_kit": 541.07, "wp": 620},
    {"cod": "MFRI-1.4-HJ-132-700W", "desc": "Risen 700W HJT Bifacial", "custo_kit": 616.00, "wp": 700},
    {"cod": "MFAS-1.4-BF-132-605W", "desc": "Astronergy 605W N-Type Bifacial", "custo_kit": 527.98, "wp": 605},
    {"cod": "MFJA-1.5-BF-132-615W", "desc": "JA Solar 615W N-Type Bifacial", "custo_kit": 536.70, "wp": 615},
    {"cod": "MFJA-1.4-BF-132-625W", "desc": "JA Solar 625W N-Type Bifacial", "custo_kit": 545.43, "wp": 625},
    {"cod": "MFTR-1.4-BF-132-715W", "desc": "Trina 715W N-Type Bifacial", "custo_kit": 624.04, "wp": 715},
    {"cod": "MFRI-1.4-HJ-132-715W", "desc": "Risen 715W HJT Bifacial", "custo_kit": 629.20, "wp": 715}
  ],
  "inversores_huawei": [
    {"cod": "INVHW-MO-220V-3KW", "mod": "SUN2000-3KTL-L1", "nom": 3000, "mppt": 1, "tipo": "monofásico", "custo_kit": 1831.26},
    {"cod": "INVHW-MO-220V-4KW", "mod": "SUN2000-4KTL-L1", "nom": 4000, "mppt": 2, "tipo": "monofásico", "custo_kit": 2439.17},
    {"cod": "INVHW-MO-220V-5KW", "mod": "SUN2000-5KTL-L1", "nom": 5000, "mppt": 2, "tipo": "monofásico", "custo_kit": 2651.81},
    {"cod": "INVHW-MO-220V-6KW", "mod": "SUN2000-6KTL-L1", "nom": 6000, "mppt": 2, "tipo": "monofásico", "custo_kit": 2751.87},
    {"cod": "INVHW-MO-220V-7.5KW", "mod": "SUN2000-7.5K-LC0", "nom": 7500, "mppt": 3, "tipo": "monofásico", "custo_kit": 3869.84},
    {"cod": "INVHW-MO-220V-8KW", "mod": "SUN2000-8K-LC0", "nom": 8000, "mppt": 3, "tipo": "monofásico", "custo_kit": 4127.82},
    {"cod": "INVHW-MO-220V-10KW", "mod": "SUN2000-10K-LC0", "nom": 10000, "mppt": 3, "tipo": "monofásico", "custo_kit": 4418.00},
    {"cod": "INVHW-TR-380V-12KW", "mod": "SUN2000-12K-MB0", "nom": 12000, "mppt": 2, "tipo": "trifásico", "custo_kit": 5100.00},
    {"cod": "INVHW-TR-380V-50KW", "mod": "SUN2000-50KTL-M3", "nom": 50000, "mppt": 4, "tipo": "trifásico", "custo_kit": 14200.00},
    {"cod": "INVHW-TR-380V-75KTL", "mod": "SUN2000-75KTL-M1", "nom": 75000, "mppt": 10, "tipo": "trifásico", "custo_kit": 19500.00},
    {"cod": "INVHW-TR-380V-330KTL", "mod": "SUN2000-330KTL-H1", "nom": 300000, "mppt": 6, "tipo": "trifásico", "custo_kit": 68000.00}
  ],
  "infraestrutura": [
    {"cod": "PERFIL2.36AL", "item": "Perfil Alumínio 2.36m", "un": "m", "custo_kit": 24.12},
    {"cod": "SUPL2A", "item": "Suporte L Fibrocimento", "un": "un", "custo_kit": 12.72},
    {"cod": "CBSOLBE-4MM-PT", "item": "Cabo Solar 4mm Preto", "un": "m", "custo_kit": 5.61},
    {"cod": "CBSOLBE-4MM-VM", "item": "Cabo Solar 4mm Vermelho", "un": "m", "custo_kit": 5.61},
    {"cod": "CONECSOLAR-01", "item": "Conector MC4 (Par)", "un": "par", "custo_kit": 6.83},
    {"cod": "ATERRA2A", "item": "Garra Aterramento", "un": "un", "custo_kit": 5.36},
    {"cod": "JUNPERF1A", "item": "Junção Perfil", "un": "un", "custo_kit": 8.50},
    {"cod": "GRFN304A", "item": "Grampo Final", "un": "un", "custo_kit": 4.80},
    {"cod": "GRINT2A", "item": "Grampo Intermediário", "un": "un", "custo_kit": 4.20}
  ],
  "protecao_premium": [
    {"cod": "SBCL-1E1S", "desc": "String Box Clamper 1E/1S", "custo_kit": 385.29},
    {"cod": "SBCL-1/2E2S", "desc": "String Box Clamper 1-2E/2S", "custo_kit": 524.30},
    {"cod": "SBCL-3E3S", "desc": "String Box Clamper 3E/3S", "custo_kit": 892.97},
    {"cod": "DPS-CA-60KA", "desc": "DPS Clamper VCL Slim 60kA", "custo_kit": 89.44}
  ]
}'
WHERE chave = 'catalogo_belenus';