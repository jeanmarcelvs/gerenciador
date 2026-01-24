-- ATUALIZAÇÃO DAS PREMISSAS TARIFÁRIAS (ANEEL 2026)
-- Remove custo de disponibilidade estático e insere componentes tarifárias detalhadas.
-- O sistema agora usará o tipo de ligação do projeto (Mono/Bi/Tri) para definir 30/50/100 kWh.

UPDATE configuracoes 
SET dados = json_patch(dados, '{
  "viabilidade": {
    "tarifas": {
      "tusd_base_mwh": 569.27,
      "te_base_mwh": 238.80,
      "te_ajuste_scee_mwh": -1.94,
      "fio_b_vigente_mwh": 315.20,
      "aliquota_impostos": 0.25
    },
    "inflacaoEnergetica": 7.0,
    "taxaDescontoVPL": 12.0,
    "simultaneidade": 30,
    "degradacaoAnual": 0.8,
    "custoLimpezaAnual": 0.5
  }
}')
WHERE chave = 'premissas_globais';
