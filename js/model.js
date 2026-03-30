// ======================================================================
// MODELO DE DADOS E REGRAS DE NEGÓCIO - ERP BELENERGY
// ======================================================================
import db from './databaseService.js';

// ======================================================================
// FUNÇÕES DE DADOS GEOGRÁFICOS (CEP / IBGE)
// ======================================================================

// Busca de CEP via API pública (ViaCEP)
export async function buscarEnderecoPorCEP(cep) {
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        return data.erro ? null : data;
    } catch (error) {
        console.error("Erro ao buscar CEP", error);
        return null;
    }
}

// Busca de Cidades via API do IBGE
export async function obterCidadesPorUF(uf) {
    try {
        // Tenta IBGE (Fonte Primária)
        const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
        if (!response.ok) throw new Error("Erro na API do IBGE");
        return await response.json();
    } catch (error) {
        console.warn("API IBGE indisponível. Tentando BrasilAPI...", error);
        try {
            // Tenta BrasilAPI (Fallback)
            const responseBackup = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${uf}`);
            if (!responseBackup.ok) throw new Error("Erro na BrasilAPI");
            const dados = await responseBackup.json();
            // Ordena manualmente pois BrasilAPI pode não retornar ordenado por padrão
            return dados.sort((a, b) => a.nome.localeCompare(b.nome));
        } catch (erroFinal) {
            console.error("Falha crítica ao buscar cidades (Todas as fontes):", erroFinal);
            return [];
        }
    }
}

// ======================================================================
// INTEGRAÇÃO CRESESB (CSV) - MOTOR DE BUSCA GEOGRÁFICA
// ======================================================================

let cacheDadosSolar = null;

/**
 * Carrega e processa o arquivo CSV de irradiação solar.
 * @returns {Promise<Array>} Array de objetos com lat, lon e annual.
 */
export async function carregarDadosSolar() {
    if (cacheDadosSolar) return cacheDadosSolar;

    try {
        // Busca o arquivo CSV na raiz da aplicação
        const response = await fetch('tilted_latitude_means_AL.csv');
        const text = await response.text();
        
        // Processa as linhas (Ignora cabeçalho)
        const linhas = text.split('\n').filter(l => l.trim().length > 0);
        const dados = linhas.slice(1).map(linha => {
            const cols = linha.split(';');
            // Estrutura CSV: ID;UF;LON;LAT;ANNUAL;...
            return {
                lon: parseFloat(cols[2]),
                lat: parseFloat(cols[3]),
                annual: parseInt(cols[4]) // Ex: 5537 (Wh/m2/dia)
            };
        });
        
        cacheDadosSolar = dados;
        return dados;
    } catch (error) {
        console.error("Erro ao carregar base solar CSV:", error);
        return [];
    }
}

/**
 * Encontra o HSP mais próximo usando distância Euclidiana simples.
 * @param {number} lat Latitude do cliente.
 * @param {number} lon Longitude do cliente.
 * @param {Array} dados Array de dados do CSV.
 * @returns {number} O HSP em kWh/m2/dia (ex: 5.537).
 */
export function encontrarHSPMaisProximo(lat, lon, dados) {
    if (!dados || dados.length === 0) return 5.0; // Fallback seguro

    let menorDistancia = Infinity;
    let itemMaisProximo = null;

    // Varredura para encontrar a célula mais próxima
    for (const item of dados) {
        // Cálculo de distância simplificado (Pitágoras) - Suficiente para pequenas distâncias
        const dist = Math.sqrt(Math.pow(item.lat - lat, 2) + Math.pow(item.lon - lon, 2));
        
        if (dist < menorDistancia) {
            menorDistancia = dist;
            itemMaisProximo = item;
        }
    }

    // Retorna o valor ANNUAL dividido por 1000 (Wh -> kWh)
    return itemMaisProximo ? itemMaisProximo.annual / 1000 : 5.0;
}

// ======================================================================
// ENGENHARIA: MOTOR DE DIMENSIONAMENTO BELENERGY
// ======================================================================

const DIAS_MES_PRECISO = 30.4166666666666;

// Base de dados histórica BelEnergy para Alagoas (Fator de Geração Mensal - kWh/kWp.mês)
// A estrutura foi atualizada para incluir lat/lon, conforme solicitado.
export const baseDadosAlagoas = {
    "AGUA BRANCA": { fator: 126.7, lat: null, lon: null, dist: 300 }, "ANADIA": { fator: 121.21, lat: null, lon: null, dist: 90 },
    "ARAPIRACA": { fator: 122.46, lat: -9.751, lon: -36.660, dist: 130 }, "ATALAIA": { fator: 120.7, lat: null, lon: null, dist: 48 },
    "BARRA DE SANTO ANTONIO": { fator: 125.84, lat: null, lon: null, dist: 40 }, "BARRA DE SAO MIGUEL": { fator: 129.13, lat: null, lon: null, dist: 30 },
    "BATALHA": { fator: 122.95, lat: null, lon: null, dist: 190 }, "BELEM": { fator: 121.51, lat: null, lon: null, dist: 110 },
    "BELO MONTE": { fator: 124.45, lat: null, lon: null }, "BOCA DA MATA": { fator: 119.2, lat: null, lon: null },
    "BRANQUINHA": { fator: 119.75, lat: null, lon: null }, "CACIMBINHAS": { fator: 124.61, lat: null, lon: null },
    "CAJUEIRO": { fator: 118.32, lat: null, lon: null }, "CAMPESTRE": { fator: 119.2, lat: null, lon: null },
    "CAMPO ALEGRE": { fator: 121.3, lat: null, lon: null }, "CAMPO GRANDE": { fator: 122.74, lat: null, lon: null },
    "CANAPI": { fator: 128.09, lat: null, lon: null }, "CAPELA": { fator: 119.33, lat: null, lon: null },
    "CARNEIROS": { fator: 125.84, lat: null, lon: null }, "CHA PRETA": { fator: 119.82, lat: null, lon: null },
    "COITE DO NOIA": { fator: 123.64, lat: null, lon: null }, "COLONIA LEOPOLDINA": { fator: 115.98, lat: null, lon: null },
    "COQUEIRO SECO": { fator: 124.13, lat: null, lon: null, dist: 20 }, "CORURIPE": { fator: 126.49, lat: null, lon: null, dist: 90 },
    "CRAIBAS": { fator: 124.8, lat: null, lon: null }, "DELMIRO GOUVEIA": { fator: 128.34, lat: null, lon: null },
    "DOIS RIACHOS": { fator: 125.4, lat: null, lon: null }, "ESTRELA DE ALAGOAS": { fator: 126.14, lat: null, lon: null },
    "FEIRA GRANDE": { fator: 121.49, lat: null, lon: null }, "FELIZ DESERTO": { fator: 125.96, lat: null, lon: null },
    "FLEXEIRAS": { fator: 118.41, lat: null, lon: null }, "GIRAU DO PONCIANO": { fator: 122.51, lat: null, lon: null },
    "IBATEGUARA": { fator: 119.33, lat: null, lon: null }, "IGACI": { fator: 124.22, lat: null, lon: null },
    "IGREJA NOVA": { fator: 121.93, lat: null, lon: null }, "INHAPI": { fator: 127.95, lat: null, lon: null },
    "JACARE DOS HOMENS": { fator: 124.13, lat: null, lon: null }, "JACUIPE": { fator: 120.08, lat: null, lon: null },
    "JAPARATINGA": { fator: 127.79, lat: null, lon: null }, "JARAMATAIA": { fator: 122.02, lat: null, lon: null },
    "JEQUIA DA PRAIA": { fator: 126.33, lat: null, lon: null }, "JOAQUIM GOMES": { fator: 115.4, lat: null, lon: null },
    "JUNDIA": { fator: 119.2, lat: null, lon: null }, "JUNQUEIRO": { fator: 121.28, lat: null, lon: null },
    "LAGOA DA CANOA": { fator: 123.11, lat: null, lon: null }, "LIMOEIRO DE ANADIA": { fator: 122.51, lat: null, lon: null, dist: 110 },
    "MACEIO": { fator: 127.9, lat: -9.665, lon: -35.735, dist: 0 }, "MAJOR ISIDORO": { fator: 124.15, lat: null, lon: null },
    "MAR VERMELHO": { fator: 121.21, lat: null, lon: null }, "MARAGOGI": { fator: 123.94, lat: null, lon: null, dist: 125 },
    "MARAVILHA": { fator: 127.07, lat: null, lon: null }, "MARECHAL DEODORO": { fator: 126.24, lat: -9.701, lon: -35.849, dist: 28 },
    "MARIBONDO": { fator: 121.19, lat: null, lon: null }, "MATA GRANDE": { fator: 130.08, lat: null, lon: null },
    "MATRIZ DE CAMARAGIBE": { fator: 120.91, lat: null, lon: null }, "MESSIAS": { fator: 120.86, lat: null, lon: null },
    "MINADOR DO NEGRAO": { fator: 125.17, lat: null, lon: null }, "MONTEIROPOLIS": { fator: 124.13, lat: null, lon: null },
    "MURICI": { fator: 120.15, lat: null, lon: null }, "NOVO LINO": { fator: 117.69, lat: null, lon: null },
    "OLHO D'AGUA DAS FLORES": { fator: 125.4, lat: null, lon: null }, "OLHO D'AGUA DO CASADO": { fator: 127, lat: null, lon: null },
    "OLHO D'AGUA GRANDE": { fator: 123.23, lat: null, lon: null }, "OLIVENCA": { fator: 124.68, lat: null, lon: null },
    "OURO BRANCO": { fator: 127.07, lat: null, lon: null }, "PALESTINA": { fator: 123.69, lat: null, lon: null },
    "PALMEIRA DOS INDIOS": { fator: 124.68, lat: null, lon: null }, "PAO DE ACUCAR": { fator: 126.14, lat: null, lon: null },
    "PARICONHA": { fator: 127.93, lat: null, lon: null }, "PARIPUEIRA": { fator: 128.44, lat: null, lon: null },
    "PASSO DE CAMARAGIBE": { fator: 122.37, lat: null, lon: null }, "PAULO JACINTO": { fator: 121.21, lat: null, lon: null },
    "PENEDO": { fator: 123.62, lat: null, lon: null, dist: 160 }, "PIACABUCU": { fator: 126, lat: null, lon: null },
    "PILAR": { fator: 122.9, lat: null, lon: null, dist: 35 }, "PINDOBA": { fator: 119.1, lat: null, lon: null },
    "PIRANHAS": { fator: 126.65, lat: null, lon: null }, "POCO DAS TRINCHEIRAS": { fator: 126.33, lat: null, lon: null },
    "PORTO CALVO": { fator: 121.03, lat: null, lon: null, dist: 100 }, "PORTO DE PEDRAS": { fator: 125.47, lat: null, lon: null },
    "PORTO REAL DO COLEGIO": { fator: 125.84, lat: null, lon: null }, "QUEBRANGULO": { fator: 122.11, lat: null, lon: null },
    "RIO LARGO": { fator: 121.42, lat: null, lon: null }, "ROTEIRO": { fator: 125.01, lat: null, lon: null },
    "SANTA LUZIA DO NORTE": { fator: 124.13, lat: null, lon: null }, "SANTANA DO IPANEMA": { fator: 126.49, lat: null, lon: null },
    "SANTANA DO MUNDAU": { fator: 118.8, lat: null, lon: null }, "SAO BRAS": { fator: 123.23, lat: null, lon: null },
    "SAO JOSE DA LAJE": { fator: 117.64, lat: null, lon: null }, "SAO JOSE DA TAPERA": { fator: 125.17, lat: null, lon: null },
    "SAO LUIS DO QUITUNDE": { fator: 123.43, lat: null, lon: null }, "SAO MIGUEL DOS CAMPOS": { fator: 122.02, lat: null, lon: null },
    "SAO MIGUEL DOS MILAGRES": { fator: 129.57, lat: null, lon: null }, "SAO SEBASTIAO": { fator: 121.77, lat: null, lon: null },
    "SATUBA": { fator: 124.13, lat: null, lon: null }, "SENADOR RUI PALMEIRA": { fator: 125.59, lat: null, lon: null },
    "TANQUE D'ARCA": { fator: 122.39, lat: null, lon: null }, "TAQUARANA": { fator: 121.51, lat: null, lon: null },
    "TEOTONIO VILELA": { fator: 121.12, lat: null, lon: null, dist: 100 }, "TRAIPU": { fator: 126.51, lat: null, lon: null },
    "UNIAO DOS PALMARES": { fator: 119.75, lat: null, lon: null }, "VICOSA": { fator: 120.26, lat: null, lon: null }
};

// Gera lista de potências de painéis de 425W a 715W (passo de 5W)
export const listaPaineis = Array.from({ length: (715 - 540) / 5 + 1 }, (_, i) => 540 + i * 5);

// Lista padrão (Fallback)
const MODELOS_FOCO_PADRAO = [540, 545, 550, 560, 565, 570, 575, 580, 585, 590, 595, 600, 605, 610, 615, 620, 625, 650, 660, 690, 695, 700, 710, 715];

// Função para obter modelos disponíveis (DB ou Padrão)
export function obterModelosFoco() {
    const catalogo = db.buscarConfiguracao('catalogo_belenus');
    if (catalogo && catalogo.modulos && Array.isArray(catalogo.modulos)) {
        // 1. Filtra módulos >= 540W
        let modulosValidos = catalogo.modulos.filter(m => {
            const wp = parseInt(m.wp);
            return !isNaN(wp) && wp >= 540;
        });

        // 2. Agrupa por potência e escolhe o mais barato
        const mapaPotencia = new Map();
        modulosValidos.forEach(m => {
            const wp = parseInt(m.wp);
            if (!mapaPotencia.has(wp) || m.custo_kit < mapaPotencia.get(wp).custo_kit) {
                mapaPotencia.set(wp, m);
            }
        });

        // 3. Retorna apenas as potências únicas ordenadas
        const potenciasUnicas = Array.from(mapaPotencia.keys()).sort((a, b) => a - b);
        
        if (potenciasUnicas.length > 0) return potenciasUnicas;
    }
    return MODELOS_FOCO_PADRAO;
}

// Função para obter catálogo completo de módulos com preço
export function obterCatalogoModulos() {
    const catalogo = db.buscarConfiguracao('catalogo_belenus');
    return catalogo?.modulos || [];
}

// Função para calcular custo do kit (Módulos + Inversores + Estrutura + Cabos + Proteção + Frete)
export function calcularCustoKit(modulos, inversores, isPremium = false, tipoRede = 'monofasico') {
    // [TEMPORÁRIO] Funcionalidade desabilitada. Retorna 0 para forçar entrada manual.
    return { total: 0, itens: [], custoBruto: 0, ajusteCalibracao: 0, frete: 0 };

    const catalogo = db.buscarConfiguracao('catalogo_belenus');
    if (!catalogo) return { total: 0, itens: [] };

    // Regras de Montagem (Hardcoded ou do DB se existirem, mantendo defaults seguros)
    const margemEst = (modulos.qtd <= 10 ? 0 : 2);
    const fatorSup = (modulos.qtd <= 10 ? 1.0 : 1.5);
    const fatorCabo = 6.5; // Ajustado para 6.5m/painel (Ref. Belenus: 68un -> 221m cada cor)

    let custoBruto = 0;
    let itens = [];

    // Custo Módulos
    // Busca o módulo mais barato para a potência selecionada (mesma lógica do filtro)
    let modDB = null;
    if (catalogo.modulos) {
        const candidatos = catalogo.modulos.filter(m => parseInt(m.wp) === modulos.watts);
        if (candidatos.length > 0) {
            modDB = candidatos.reduce((prev, curr) => (prev.custo_kit < curr.custo_kit ? prev : curr));
        }
    }

    if (modDB) {
        const total = modDB.custo_kit * modulos.qtd;
        custoBruto += total;
        itens.push({ item: `Módulo ${modDB.desc}`, qtd: modulos.qtd, un: 'un', unit: modDB.custo_kit, total });
    }

    // Custo Inversores
    let potenciaTotalKWp = (modulos.watts * modulos.qtd) / 1000;
    
    if (inversores && Array.isArray(inversores)) {
        inversores.forEach(inv => {
            // Tenta encontrar pelo código ou pelo modelo comercial (que é o que está salvo no carrinho)
            const invDB = catalogo.inversores_huawei?.find(i => i.cod === inv.modelo || i.mod === inv.modelo);
            if (invDB) {
                const total = invDB.custo_kit * inv.qtd;
                custoBruto += total;
                itens.push({ item: `Inversor ${inv.modelo}`, qtd: inv.qtd, un: 'un', unit: invDB.custo_kit, total });
            }
        });
    }

    // 3. Estrutura (Fixação)
    const Np = modulos.qtd;
    const Nest = Np + margemEst;
    const larguraPainel = 1.134; // Largura padrão
    const Ltotal = (Nest * larguraPainel) * 2;
    const qtdBarras = Math.ceil(Ltotal / 2.36);
    
    // Busca itens de infraestrutura
    const perfilDB = catalogo.infraestrutura?.find(i => i.item.includes('Perfil'));
    if (perfilDB) {
        const metros = qtdBarras * 2.36;
        const total = perfilDB.custo_kit * metros;
        custoBruto += total;
        itens.push({ item: perfilDB.item, qtd: metros.toFixed(2), un: perfilDB.un || 'm', unit: perfilDB.custo_kit, total });
    }

    const qtdSuportes = Math.ceil(Nest * fatorSup);
    const suporteDB = catalogo.infraestrutura?.find(i => i.item.includes('Suporte'));
    if (suporteDB) {
        const total = suporteDB.custo_kit * qtdSuportes;
        custoBruto += total;
        itens.push({ item: suporteDB.item, qtd: qtdSuportes, un: suporteDB.un || 'un', unit: suporteDB.custo_kit, total });
    }

    const qtdGarras = Math.ceil(Np / 5);
    const garraDB = catalogo.infraestrutura?.find(i => i.item.includes('Garra'));
    if (garraDB) {
        const total = garraDB.custo_kit * qtdGarras;
        custoBruto += total;
        itens.push({ item: garraDB.item, qtd: qtdGarras, un: garraDB.un || 'un', unit: garraDB.custo_kit, total });
    }

    // 4. Cabos
    const metrosCabo = fatorCabo * Np;
    const metrosPorCor = metrosCabo / 2;
    
    // Tenta encontrar cabos preto e vermelho (4mm ou 6mm)
    // Prioriza 4mm conforme schema atual, mas pode ser ajustado
    const caboPreto = catalogo.infraestrutura?.find(i => i.item.includes('Cabo Solar') && i.item.includes('Preto'));
    const caboVermelho = catalogo.infraestrutura?.find(i => i.item.includes('Cabo Solar') && i.item.includes('Vermelho'));

    if (caboPreto) {
        const total = caboPreto.custo_kit * metrosPorCor;
        custoBruto += total;
        itens.push({ item: caboPreto.item, qtd: metrosPorCor.toFixed(2), un: caboPreto.un || 'm', unit: caboPreto.custo_kit, total });
    }
    if (caboVermelho) {
        const total = caboVermelho.custo_kit * metrosPorCor;
        custoBruto += total;
        itens.push({ item: caboVermelho.item, qtd: metrosPorCor.toFixed(2), un: caboVermelho.un || 'm', unit: caboVermelho.custo_kit, total });
    }

    // 5. Conectores MC4
    let totalMPPTs = 0;
    if (inversores && Array.isArray(inversores)) {
        inversores.forEach(inv => {
            const invDB = catalogo.inversores_huawei?.find(i => i.cod === inv.modelo || i.mod === inv.modelo);
            const mppt = invDB ? (invDB.mppt || 2) : (inv.mppt || 2);
            totalMPPTs += mppt * inv.qtd;
        });
    }

    // Regra: 1 par de kits (2 unidades) por MPPT (Totalizando 2 machos e 2 fêmeas por MPPT)
    const qtdParesMC4 = totalMPPTs > 0 ? (totalMPPTs * 2) : (potenciaTotalKWp <= 10 ? 2 : 4);

    const mc4DB = catalogo.infraestrutura?.find(i => i.item.includes('Conector MC4'));
    if (mc4DB) {
        const total = mc4DB.custo_kit * qtdParesMC4;
        custoBruto += total;
        itens.push({ item: mc4DB.item, qtd: qtdParesMC4, un: mc4DB.un || 'par', unit: mc4DB.custo_kit, total });
    }

    // 6. Premium (String Box + DPS)
    if (isPremium) {
        if (inversores && Array.isArray(inversores)) {
            inversores.forEach(inv => {
                 const invDB = catalogo.inversores_huawei?.find(i => i.cod === inv.modelo || i.mod === inv.modelo);
                 const mppt = invDB ? invDB.mppt : 2; // Default 2 MPPTs se não achar
                 
                 // Seleção de String Box baseada em MPPTs (Proteção Individual)
                 let sbModel = 'SBCL-1E1S'; // Padrão 1 MPPT
                 if (mppt === 2) sbModel = 'SBCL-1/2E2S';
                 else if (mppt >= 3) sbModel = 'SBCL-3E3S';
                 
                 const sbDB = catalogo.protecao_premium?.find(p => p.cod === sbModel);
                 if (sbDB) {
                     const total = sbDB.custo_kit * inv.qtd;
                     custoBruto += total;
                     itens.push({ item: sbDB.desc, qtd: inv.qtd, un: 'un', unit: sbDB.custo_kit, total });
                 }
            });
        }
        
        // DPS: 1 por fase (Monofásico = 1, Trifásico = 3 ou 4 dependendo do neutro, assumindo 3 fases + neutro = 4 ou apenas fases = 3)
        // Regra comum: 1 DPS por fase. Trifásico = 3 un. Monofásico = 1 un. (Verifica string 'trifasico' ou 'bifasico' se houver)
        const qtdDPS = (tipoRede && tipoRede.toLowerCase().includes('trif')) ? 3 : 1;
        const dpsDB = catalogo.protecao_premium?.find(p => p.cod === 'DPS-CA-60KA');
        if (dpsDB) {
            const total = dpsDB.custo_kit * qtdDPS;
            custoBruto += total;
            itens.push({ item: dpsDB.desc, qtd: qtdDPS, un: 'un', unit: dpsDB.custo_kit, total });
        }
    }

    // 7. Consolidação do Preço (RÉGUA DE CALIBRAÇÃO / INTEHIGÊNCIA DE PREÇO)
    // Substitui a lógica simples de desconto por fatores calibrados por faixa de potência
    
    const regras = catalogo.regras_calculo || {};
    
    // A. Desconto Progressivo (Kit Gerador)
    let percentualDesconto = 0.0659; // Fallback
    if (regras.descontos_kit_por_kwp && Array.isArray(regras.descontos_kit_por_kwp) && regras.descontos_kit_por_kwp.length > 0) {
        // Ordena as faixas e encontra a primeira que atende ao kWp do projeto
        const faixasOrdenadas = [...regras.descontos_kit_por_kwp].sort((a, b) => a.max_kwp - b.max_kwp);
        const faixaEncontrada = faixasOrdenadas.find(f => potenciaTotalKWp <= f.max_kwp);
        
        if (faixaEncontrada) {
            percentualDesconto = faixaEncontrada.percentual;
        } else {
            // Se ultrapassar a maior faixa definida, usa o último percentual disponível
            percentualDesconto = faixasOrdenadas[faixasOrdenadas.length - 1].percentual;
        }
    } else if (regras.desconto_kit_padrao) { // Mantém fallback para estrutura antiga
        percentualDesconto = regras.desconto_kit_padrao;
    }

    console.log(`[Cálculo Kit] Potência: ${potenciaTotalKWp.toFixed(2)}kWp | Desconto Aplicado: ${(percentualDesconto * 100).toFixed(2)}%`);
    const custoComDesconto = custoBruto * (1 - percentualDesconto);
    const valorDesconto = custoBruto - custoComDesconto;

    // B. Cálculo de Frete (Diluição no Total)
    let percentualFrete = 0.0650; // Fallback
    if (regras.frete_diluicao && Array.isArray(regras.frete_diluicao) && regras.frete_diluicao.length > 0) {
        const faixasFreteOrdenadas = [...regras.frete_diluicao].sort((a, b) => a.max_kwp - b.max_kwp);
        const faixaFreteEncontrada = faixasFreteOrdenadas.find(f => potenciaTotalKWp <= f.max_kwp);
        
        if (faixaFreteEncontrada) {
            percentualFrete = faixaFreteEncontrada.percentual;
        } else {
            // Se ultrapassar a maior faixa, usa o último percentual
            percentualFrete = faixasFreteOrdenadas[faixasFreteOrdenadas.length - 1].percentual;
        }
    }
    
    // Cálculo Reverso: Total = CustoComDesconto / (1 - %Frete)
    const valorTotal = custoComDesconto / (1 - percentualFrete);
    const valorFrete = valorTotal - custoComDesconto;
    
    return {
        total: valorTotal,
        custoBruto: custoBruto, // Mantém o valor original da soma dos itens para exibição
        ajusteCalibracao: valorDesconto, // Valor para exibir como "Desconto" ou "Ajuste"
        frete: valorFrete,
        itens
    };
}

// Função para obter inversores (Prioriza DB)
export function obterInversoresHuawei() {
    const catalogo = db.buscarConfiguracao('catalogo_belenus');
    if (catalogo && catalogo.inversores_huawei && Array.isArray(catalogo.inversores_huawei)) {
        return catalogo.inversores_huawei.map(dbInv => {
            // O objeto do banco já deve ter todas as propriedades necessárias conforme schema.sql
            // Mapeia para o formato interno da aplicação se necessário
            return {
                mod: dbInv.mod || dbInv.cod, // Usa 'mod' (modelo comercial) se existir, senão 'cod'
                nom: dbInv.nom || (dbInv.potencia * 1000), // Garante potência em Watts
                mppt: dbInv.mppt || 2,
                tipo: dbInv.tipo || (dbInv.potencia >= 12 ? 'trifásico' : 'monofásico'),
                custo: dbInv.custo_kit
            };
        });
    }
    console.warn("Catálogo de inversores vazio ou inválido. Usando fallback mínimo.");
    return [];
}

// Tabela de Dimensões de Módulos (Atualizada conforme solicitação)
export const DIMENSOES_MODULOS = [
    { min: 530, max: 585, comp: 2.278, larg: 1.134 },
    { min: 590, max: 625, comp: 2.382, larg: 1.134 },
    { min: 630, max: 735, comp: 2.384, larg: 1.303 }
];

export function obterDimensoesModulo(watts) {
    const dim = DIMENSOES_MODULOS.find(d => watts >= d.min && watts <= d.max);
    // Fallback para o maior se não encontrar (segurança) ou média
    return dim || { comp: 2.278, larg: 1.134 }; 
}

/**
 * Calcula o espaçamento entre fileiras (Pitch) para evitar sombreamento.
 * @param {number} watts - Potência do módulo selecionado.
 * @param {number} inclinacao - Ângulo de inclinação (graus).
 * @returns {object} Detalhes do cálculo.
 */
export function calcularEspacamentoFileiras(watts, inclinacao) {
    const dim = obterDimensoesModulo(watts);
    const L = dim.comp; // Comprimento em metros
    const betaRad = inclinacao * (Math.PI / 180); // Converte para radianos

    // Fator de segurança de sombra para latitude 10°S (Alagoas/Sergipe)
    // Garante zero sombra no solstício de inverno entre 10h e 14h.
    const FATOR_SOMBRA = 1.2;

    // 1. Projeção Horizontal (Ocupação no chão)
    const projecaoChao = L * Math.cos(betaRad);

    // 2. Altura da ponta superior (Sen(beta) * L)
    const alturaPonta = L * Math.sin(betaRad);

    // 3. Distância da Sombra (Altura * Fator)
    const sombra = alturaPonta * FATOR_SOMBRA;

    // 4. Distância Total (Pitch)
    const distanciaTotal = projecaoChao + sombra;

    return {
        comprimentoPainel: L,
        larguraPainel: dim.larg,
        projecaoChao: projecaoChao,
        sombra: sombra,
        distanciaTotal: distanciaTotal
    };
}

/**
 * Converte o fator de geração histórico (com perdas) para HSP Bruto (sem perdas).
 * @param {number} fatorMensalHistorico - Ex: 126.24 para Marechal Deodoro.
 * @returns {number} O HSP diário bruto (sem perdas).
 */
export function obterHSPBruto(fatorMensalHistorico) {
    const rendimentoPadrao = 0.7643; // 100% - 23.57% de perdas padrão
    return fatorMensalHistorico / (DIAS_MES_PRECISO * rendimentoPadrao);
}

/**
 * Calcula a Potência de Pico (kWp) necessária para atender um consumo.
 * @param {number} consumo - Consumo mensal em kWh.
 * @param {number} hspEfetivo - HSP diário já com as perdas aplicadas.
 * @returns {number} A potência de pico em kWp.
 */
export function calcularPpk(consumo, hspEfetivo) {
    if (hspEfetivo <= 0) return 0;
    // Ppk = Consumo / (HSP_Efetivo * Dias)
    return consumo / (hspEfetivo * DIAS_MES_PRECISO);
}

/**
 * Motor de Cálculo de Alta Precisão - Jean Marcel
 * @param {object} parametros - Objeto com { azimute, inclinacao, perdasExtras: { eficienciaInversor, perdaTempInversor, cabos, outros } }.
 * @returns {object} O Performance Ratio (PR) final e detalhes.
 */
export function calcularRendimentoCientifico(parametros) {
    // 1. PERDAS INTERNAS (Características Elétricas)
    // NOTA: Os valores devem vir das Premissas Gerais (DB). Não há valores padrão (hardcoded) aqui.
    const perdas = parametros.perdasExtras || {};
    const pEficienciaInv = (perdas.eficienciaInversor ?? 0) / 100;
    const pTempInv = (perdas.perdaTempInversor ?? 0) / 100;
    const pTempModulos = (perdas.perdaTempModulos ?? 0) / 100;
    const pCabos = (perdas.cabos ?? 0) / 100;
    const pOutros = (perdas.outros ?? 0) / 100; // Sombreamento/Sujidade
    const pIndisp = (perdas.indisponibilidade ?? 0) / 100;

    // Cálculo Multiplicativo (A perda de um recai sobre o que restou do outro)
    // CORREÇÃO: Todas as perdas são multiplicativas para refletir a cadeia de eficiência.
    let prBruto = pEficienciaInv * (1 - pTempInv) * (1 - pTempModulos) * (1 - pCabos) * (1 - pOutros) * (1 - pIndisp);

    // 2. PERDAS ANGULARES (MULTIPLICATIVO) - Calibrado para Nordeste (Jean Marcel)
    
    const latitudeLocal = parametros.latitude || -9.7; // Latitude de referência (Alagoas)
    const latMagnitude = Math.abs(latitudeLocal);
    
    // --- CÁLCULO DO DESVIO DE INCLINAÇÃO ---
    const incUsuario = parseFloat(parametros.inclinacao);
    // Se o usuário não informou (NaN), assume igual à latitude (desvio 0)
    const inclinacao = !isNaN(incUsuario) ? incUsuario : latMagnitude;
    const desvioInclinacao = Math.abs(inclinacao - latMagnitude);

    // Taxa de Inclinação: 0,25% de perda para cada 1° de desvio em relação à latitude local.
    const taxaPerdaInc = 0.0025;
    
    // --- CÁLCULO DO DESVIO DE AZIMUTE (PROGRESSIVO E CONSERVADOR) ---
    let azInput = parseFloat(parametros.azimute) || 0;
    // Normalização para -180 a 180 (Garante que 330° seja tratado como -30°)
    azInput = azInput % 360;
    if (azInput > 180) azInput -= 360;
    if (azInput <= -180) azInput += 360;
    const desvioAzimute = Math.abs(azInput); // Desvio absoluto em relação ao Norte (0°)

    // Lógica de Perda Acumulada por Faixa (Curva Nordeste Conservadora)
    let perdaAzimutal = 0;
    if (desvioAzimute <= 60) {
        // Faixa 1: 0.04% por grau
        perdaAzimutal = desvioAzimute * 0.0004;
    } else if (desvioAzimute <= 120) {
        // Faixa 2: Perda da Faixa 1 + 0.08% por grau excedente
        perdaAzimutal = (60 * 0.0004) + ((desvioAzimute - 60) * 0.0008);
    } else {
        // Faixa 3: Perda das Faixas 1 e 2 + 0.12% por grau excedente
        perdaAzimutal = (60 * 0.0004) + (60 * 0.0008) + ((desvioAzimute - 120) * 0.0012);
    }

    // Fatores de Correção (1 - Perda)
    const fatorCorrecaoInc = 1 - (desvioInclinacao * taxaPerdaInc);
    const fatorCorrecaoAzi = 1 - perdaAzimutal;
    
    // Aplica os fatores ao PR Bruto (Multiplicativo)
    // PR_Final = PR_Eletrico * Fator_Inc * Fator_Azi
    // Garantimos que o fator não seja negativo em casos extremos
    const fatorAngularTotal = Math.max(0, fatorCorrecaoInc * fatorCorrecaoAzi);
    
    let prGeografico = prBruto * fatorAngularTotal;

    // 3. TRAVA DE SEGURANÇA (O Ajuste de Engenharia)
    // APLICAÇÃO DA REGRA DE OURO: O PR Efetivo é o menor valor entre o PR calculado e o teto de 80%.
    const limitadorSeguranca = 0.80;
    const prFinal = Math.min(prGeografico, limitadorSeguranca);
    const valorAjuste = prFinal - prGeografico; // Será 0 ou um valor negativo (a perda do ajuste)

    return {
        prBruto: prBruto,
        prGeografico: prGeografico,
        valorAjuste: valorAjuste,
        prFinal: prFinal,
        // Mantém nomes antigos para compatibilidade com dimensionarSistema
        rendimentoFinal: prFinal,
        // Strings formatadas para UI
        brutoStr: (prBruto * 100).toFixed(2),
        geograficoStr: (prGeografico * 100).toFixed(2),
        ajusteStr: (valorAjuste * 100).toFixed(2),
        finalStr: (prFinal * 100).toFixed(2)
    };
}

/**
 * Dimensiona o sistema considerando apenas modelos viáveis comercialmente.
 * @param {Array} modelosPermitidos (Opcional) Lista de potências permitidas. Se null, usa lista geral.
 */
export function dimensionarSistema(consumoMensal, hspBruto, paramsTecnicos, modelosPermitidos = null) {
    // Usa a lista de foco se fornecida, senão usa a geral
    const listaWatts = (modelosPermitidos && modelosPermitidos.length > 0) ? modelosPermitidos : listaPaineis;

    const resultados = [];    
    // O rendimento final (PR) agora é pré-calculado no controller e passado via paramsTecnicos.
    const rendimentoFinal = paramsTecnicos.rendimentoFinal;
    const geracaoPorKwp = hspBruto * DIAS_MES_PRECISO * rendimentoFinal;
    
    // Evita divisão por zero
    const kwpNecessario = consumoMensal > 0 ? consumoMensal / geracaoPorKwp : 0;

    listaWatts.forEach(watts => {
        const wattsKw = watts / 1000;
        const qtdModulos = kwpNecessario > 0 ? Math.ceil(kwpNecessario / wattsKw) : 0;
        const potenciaRealSistema = qtdModulos * wattsKw;
        const sobra = potenciaRealSistema - kwpNecessario;
        const geracaoRealMensal = potenciaRealSistema * geracaoPorKwp;

        resultados.push({
            modelo: watts + "W",
            watts: watts,
            quantidade: qtdModulos,
            sobra: sobra,
            potenciaTotal: potenciaRealSistema,
            geracaoReal: geracaoRealMensal,
            atendimento: consumoMensal > 0 ? (geracaoRealMensal / consumoMensal) * 100 : 0
        });
    });

    // Lógica de Seleção Otimizada (Ranking de Engenharia):
    // 1. Ordena pela menor sobra (desvio positivo) para máxima precisão de dimensionamento.
    // 2. Como critério de desempate, prefere a menor quantidade de módulos (geralmente implica em módulos mais potentes, otimizando estrutura e M.O.).
    const sugestoesOrdenadas = [...resultados].sort((a, b) => {
        if (a.sobra !== b.sobra) {
            return a.sobra - b.sobra;
        }
        return a.quantidade - b.quantidade;
    });
    
    const melhorOpcaoTecnica = sugestoesOrdenadas.length > 0 ? sugestoesOrdenadas[0] : null;

    return {
        melhorSugestao: melhorOpcaoTecnica,
        // Retorna a lista já ordenada corretamente para o controller
        todosModelos: sugestoesOrdenadas,
        prCalculado: rendimentoFinal,
        kwpNecessario: kwpNecessario
    };
}

// ======================================================================
// ENGENHARIA: DADOS CLIMÁTICOS E GEOGRÁFICOS
// ======================================================================

// Busca coordenadas (Lat/Lon) da cidade para consultar a NASA
// Usa a API pública do OpenStreetMap (Nominatim)
export async function buscarCoordenadas(cidade, uf) {
    try {
        const query = `${cidade}, ${uf}, Brazil`;
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
        const data = await response.json();
        
        if (data && data.length > 0) {
            return { lat: data[0].lat, lon: data[0].lon };
        }
        return null;
    } catch (error) {
        console.error("Erro ao buscar coordenadas:", error);
        return null;
    }
}

// Busca dados de irradiação solar (HSP) da NASA POWER API
// Endpoint Climatology fornece médias históricas (ideal para dimensionamento)
export async function buscarHSPNasa(lat, lon) {
    try {
        const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`;
        const response = await fetch(url);
        const data = await response.json();
        
        // Retorna a média anual (ANN) do parâmetro ALLSKY_SFC_SW_DWN
        return data.properties.parameter.ALLSKY_SFC_SW_DWN.ANN;
    } catch (error) {
        console.error("Erro ao buscar dados da NASA:", error);
        return 5.0; // Fallback seguro (Média Brasil) caso a API falhe
    }
}

// ======================================================================
// ENGENHARIA: MOTOR DE CUSTOS PARAMETRIZADOS
// ======================================================================

/**
 * Calcula o custo base de materiais elétricos com base na quantidade de módulos.
 * Lógica de faixas de volume (SWITCH/CASE).
 * @param {number} quantidadeModulos - O número total de módulos no projeto.
 * @param {Array} tabelaPersonalizada - (Opcional) Array de objetos {limite, custo}.
 * @returns {number} O custo estimado dos materiais.
 */
export function calcularCustoMateriaisBasicos(quantidadeModulos, tabelaPersonalizada = null) {
    if (quantidadeModulos <= 0) return 0;

    // Se houver tabela personalizada, usa ela
    if (tabelaPersonalizada && Array.isArray(tabelaPersonalizada) && tabelaPersonalizada.length > 0) {
        // Encontra a faixa onde a quantidade se encaixa (assumindo ordenação por limite)
        const faixa = tabelaPersonalizada.find(f => quantidadeModulos <= f.limite);
        if (faixa) return faixa.custo;
        // Se for maior que o último limite, usa o último valor da tabela
        return tabelaPersonalizada[tabelaPersonalizada.length - 1].custo;
    }

    if (quantidadeModulos <= 20) return 1100;
    if (quantidadeModulos <= 25) return 1550;
    if (quantidadeModulos <= 30) return 2000;
    if (quantidadeModulos <= 40) return 2450;
    if (quantidadeModulos <= 50) return 2750;
    if (quantidadeModulos <= 70) return 3200;
    if (quantidadeModulos <= 90) return 3650;
    if (quantidadeModulos <= 110) return 4100;
    if (quantidadeModulos <= 130) return 4550;
    if (quantidadeModulos <= 150) return 5000;
    if (quantidadeModulos <= 170) return 5450;
    if (quantidadeModulos <= 190) return 5900;
    if (quantidadeModulos <= 210) return 6350;
    if (quantidadeModulos <= 230) return 6800;
    if (quantidadeModulos <= 250) return 7250;
    if (quantidadeModulos <= 270) return 7700;
    return quantidadeModulos * 33; // Custo variável para grandes usinas
}

/**
 * Calcula o custo base de mão de obra com base no custo unitário regressivo.
 * @param {number} qtdModulos - O número total de módulos no projeto.
 * @param {Array} tabelaPersonalizada - (Opcional) Array de objetos {limite, unitario}.
 * @returns {number} O custo base da mão de obra.
 */
export function calcularMaoObraBase(qtdModulos, tabelaPersonalizada = null) {
    if (qtdModulos <= 0) return 0;

    if (tabelaPersonalizada && Array.isArray(tabelaPersonalizada) && tabelaPersonalizada.length > 0) {
        const faixa = tabelaPersonalizada.find(f => qtdModulos <= f.limite);
        const valorUnitario = faixa ? faixa.unitario : tabelaPersonalizada[tabelaPersonalizada.length - 1].unitario;
        return qtdModulos * valorUnitario;
    }

    let valorPorModulo = 80; // Padrão para > 90

    const faixas = [
        { limite: 10, valor: 150 }, { limite: 11, valor: 140 }, { limite: 12, valor: 130 },
        { limite: 13, valor: 120 }, { limite: 14, valor: 115 }, { limite: 18, valor: 110 },
        { limite: 22, valor: 107 }, { limite: 26, valor: 104 }, { limite: 30, valor: 100 },
        { limite: 50, valor: 95 },  { limite: 70, valor: 90 },  { limite: 90, valor: 85 }
    ];

    const faixaEncontrada = faixas.find(f => qtdModulos <= f.limite);
    if (faixaEncontrada) {
        valorPorModulo = faixaEncontrada.valor;
    }

    return qtdModulos * valorPorModulo;
}

/**
 * Calcula a capacidade de expansão do inversor (Oversizing e Geração Futura).
 * @param {number} potenciaTotalCC - Potência total dos módulos selecionados (kWp).
 * @param {number} wattsModulo - Potência unitária do módulo (W).
 * @param {number} potenciaInvAC - Potência nominal do inversor (kW).
 * @param {number} qtdInv - Quantidade de inversores.
 * @param {number} oversizingLimite - Limite de oversizing (ex: 1.3 para 30%).
 * @param {number} hsp - HSP do local.
 * @param {number} pr - Performance Ratio (Rendimento final).
 */
export function calcularExpansaoInversor(potenciaTotalCC, wattsModulo, potenciaInvAC, qtdInv, oversizingLimite, hsp, pr) {
    const potenciaTotalAC = potenciaInvAC * qtdInv;
    
    if (potenciaTotalAC <= 0) return null;

    const oversizingAtual = (potenciaTotalCC / potenciaTotalAC); // Ratio (ex: 1.2)
    const potenciaMaxCC = potenciaTotalAC * oversizingLimite;
    
    // O quanto ainda cabe (em kWp)
    const potenciaDisponivel = Math.max(0, potenciaMaxCC - potenciaTotalCC);
    
    // Quantos módulos inteiros cabem nessa sobra
    const qtdModulosExtras = Math.floor((potenciaDisponivel * 1000) / wattsModulo);
    
    // Geração estimada desses módulos extras
    const geracaoExtra = (qtdModulosExtras * wattsModulo * hsp * 30.4166 * pr) / 1000;

    return {
        oversizingAtualPercentual: oversizingAtual * 100,
        potenciaMaxCC,
        potenciaDisponivel,
        qtdModulosExtras,
        geracaoExtra
    };
}

/**
 * Calcula o custo de logística e deslocamento.
 * @param {number} distanciaIda - Distância em KM da base até o cliente.
 * @param {number} qtdModulos - Quantidade de módulos.
 * @param {number} qtdInversores - Quantidade de inversores.
 * @param {object} premissas - Objeto com { precoCombustivel, consumoVeiculo, modulosPorDia, tempoExtraInversor, kmAlmoco, kmSuprimentos }.
 */
export function calcularCustoLogistica(distanciaIda, qtdModulos, qtdInversores, premissas) {
    // 1. Premissas Globais (com fallbacks)
    const precoCombustivel = premissas?.precoCombustivel || 6.10;
    const kmPorLitro = premissas?.consumoVeiculo || 8.5; // Carro popular carregado
    const modulosPorDia = premissas?.modulosPorDia || 12; // Produtividade padrão
    const tempoExtraInversor = premissas?.tempoExtraInversor || 0.5; // Dias a mais por inversor extra
    const kmSuprimentosMaceio = premissas?.kmSuprimentos || 15; // Média fixa para compra de materiais na cidade da empresa
    const kmAlmocoDiario = premissas?.kmAlmoco || 5;
    const diasMinimos = premissas?.diasMinimosObra || 2; // Piso de segurança parametrizado

    // 2. Estimativa de Dias de Obra (Diárias)
    // Fórmula: Teto(Módulos / Produtividade) + ((Qtd Inversores - 1) * Acréscimo Tempo)
    const diasBaseModulos = Math.ceil(qtdModulos / modulosPorDia);
    const diasExtrasInversores = qtdInversores > 1 ? (qtdInversores - 1) * tempoExtraInversor : 0;
    let diasDeObra = diasBaseModulos + diasExtrasInversores;

    // REGRA DE SEGURANÇA: Mínimo parametrizado para viabilidade de mobilização
    const diasCalculados = diasDeObra;
    diasDeObra = Math.max(diasMinimos, diasDeObra);
    const isMinimo = diasDeObra > diasCalculados;

    // 3. Cálculo de Quilometragem Total
    // Suprimentos (1x por obra) + [ (Ida + Volta + Almoço) * Dias ]
    const kmTotal = kmSuprimentosMaceio + (((distanciaIda * 2) + kmAlmocoDiario) * diasDeObra);

    // 4. Cálculo Financeiro
    const custoCombustivelTotal = (kmTotal / kmPorLitro) * precoCombustivel;

    return {
        kmTotal: kmTotal,
        diasObra: diasDeObra,
        isMinimo: isMinimo,
        custoFinanceiro: custoCombustivelTotal,
        detalhes: `Suprimentos (${kmSuprimentosMaceio}km) + Viagens (${diasDeObra}d x ${(distanciaIda * 2 + kmAlmocoDiario).toFixed(0)}km)`
    };
}

// ======================================================================
// ENGENHARIA: ANÁLISE DE VIABILIDADE FINANCEIRA (PAYBACK, VPL, TIR)
// ======================================================================

/**
 * Retorna o percentual de cobrança do Fio B para um determinado ano civil.
 * @param {number} ano - O ano civil (ex: 2026).
 * @returns {number} O percentual como decimal (ex: 0.60 para 60%).
 */
export function obterPercentualFioB(ano) {
    if (ano <= 2023) return 0.15;
    if (ano === 2024) return 0.30;
    if (ano === 2025) return 0.45;
    if (ano === 2026) return 0.60;
    if (ano === 2027) return 0.75;
    if (ano === 2028) return 0.90;
    return 1.0; // 2029 em diante
}

/**
 * Calcula o fluxo de caixa de 25 anos e as principais métricas financeiras.
 * @param {object} dadosInvestimento - { investimentoInicial, geracaoPrimeiroAno, valorKit }
 * @param {object} dadosProjeto - Dados da UC { tarifaTE, tarifaTUSD, impostosPerc, tipoLigacao, ilumPublica }
 * @param {object} premissasGlobais - Premissas da aplicação.
 * @returns {object} Objeto com { paybackSimples, paybackDescontado, vpl, tir, economiaTotal, fluxoDeCaixa }
 */
export function calcularAnaliseFinanceira(dadosInvestimento, dadosProjeto, premissasGlobais) {
    const { investimentoInicial, geracaoPrimeiroAno, valorKit } = dadosInvestimento;
    const { tipoLigacao, consumo: consumoMensal } = dadosProjeto;
    // Fallback seguro para premissasGlobais nulo
    const safePremissas = premissasGlobais || {};
    const viabilidade = safePremissas.viabilidade || {};
    const tarifas = viabilidade.tarifas || {};
    
    // --- 3.1. NORMALIZAÇÃO DE GRANDEZAS (MWh -> kWh e Gross-up) ---
    let T_CHEIA, T_COMPENSACAO, T_FIO_B_VIGENTE;
    
    // Verifica se a nova estrutura tarifária existe
    if (tarifas.tusd_base_mwh !== undefined) {
        const aliquota = tarifas.aliquota_impostos || 0;
        const divisorImposto = (1 - aliquota) > 0 ? (1 - aliquota) : 1;

        // Cálculo da Tarifa Cheia (Sem Solar)
        const t_base_kwh = (tarifas.tusd_base_mwh + tarifas.te_base_mwh) / 1000;
        T_CHEIA = t_base_kwh / divisorImposto;

        // Cálculo da Tarifa de Compensação (Com ajuste SCEE)
        const t_comp_kwh = (tarifas.tusd_base_mwh + tarifas.te_base_mwh + tarifas.te_ajuste_scee_mwh) / 1000;
        T_COMPENSACAO = t_comp_kwh / divisorImposto;

        // Cálculo do Fio B (Pedágio Vigente)
        T_FIO_B_VIGENTE = (tarifas.fio_b_vigente_mwh / 1000) / divisorImposto;
    } else {
        // Fallback para lógica antiga
        const tarifaAntiga = (dadosProjeto.tarifaGrupoB && dadosProjeto.tarifaGrupoB > 0) 
            ? dadosProjeto.tarifaGrupoB 
            : (viabilidade.tarifaGrupoB || 0.95);
        
        T_CHEIA = tarifaAntiga;
        T_COMPENSACAO = tarifaAntiga;
        T_FIO_B_VIGENTE = (viabilidade.fioB_valor || 0.30);
    }

    // Iluminação Pública: Se undefined no projeto, pega da global
    const iluminacaoPublica = (dadosProjeto.iluminacaoPublica !== undefined && dadosProjeto.iluminacaoPublica !== null)
        ? dadosProjeto.iluminacaoPublica
        : (viabilidade.iluminacaoPublica || 0);

    // Premissas de cálculo
    const degradacaoAnual = (viabilidade.degradacaoAnual || 0.8) / 100; // 0.8% padrão se não definido
    const anoTrocaInversor = viabilidade.anoTrocaInversor || 12;
    const custoTrocaInversorPerc = (viabilidade.custoTrocaInversorPerc || 15) / 100;
    
    // Custo de Manutenção Preventiva (antiga Limpeza) é percentual do CAPEX
    const custoManutencaoPerc = parseFloat(viabilidade.custoLimpezaAnual) || 0;
    const custoManutencaoBase = investimentoInicial * (custoManutencaoPerc / 100);

    const inflacaoEnergetica = (viabilidade.inflacaoEnergetica || 7) / 100;
    const taxaDesconto = (viabilidade.taxaDescontoVPL || 12) / 100;
    const simultaneidade = (viabilidade.simultaneidade || 30) / 100;
    
    // Proteção contra valores zerados/nulos
    const consumoAnual = (consumoMensal || 0) * 12;

    if (T_CHEIA <= 0 || investimentoInicial <= 0 || consumoAnual <= 0) return { paybackSimples: 0, paybackDescontado: 0, vpl: 0, tir: 0, economiaTotal: 0, fluxoDeCaixa: [], detalhes: {} };

    // --- LÓGICA DINÂMICA DE DISPONIBILIDADE (Baseada no Projeto) ---
    // Determina o custo de disponibilidade (30/50/100) baseado na fase da UC
    const tipoRedeNorm = (tipoLigacao || 'bifasico').toLowerCase();
    let kwhMinimo = 50; // Padrão Bifásico
    if (tipoRedeNorm.includes('mono')) kwhMinimo = 30;
    else if (tipoRedeNorm.includes('tri')) kwhMinimo = 100;

    let fluxoDeCaixa = [];
    let vpl = -investimentoInicial;
    let paybackSimples = 0;
    let paybackDescontado = 0;
    let saldoAcumulado = -investimentoInicial;
    let saldoAcumuladoDesc = -investimentoInicial;

    // Ano 0 (Investimento)
    fluxoDeCaixa.push({ ano: 0, geracao: 0, economia: 0, despesa: investimentoInicial, fluxoLiquido: -investimentoInicial, acumulado: -investimentoInicial, acumuladoDesc: -investimentoInicial });

    for (let ano = 1; ano <= 25; ano++) {
        // 1. Geração e Tarifa do Ano
        const geracaoAno = geracaoPrimeiroAno * Math.pow(1 - degradacaoAnual, ano - 1); // Geração Anual
        
        // APLICAÇÃO DA INFLAÇÃO ENERGÉTICA:
        const inflator = Math.pow(1 + inflacaoEnergetica, ano - 1);
        const tarifaCheiaAno = T_CHEIA * inflator;
        const tarifaCompensacaoAno = T_COMPENSACAO * inflator;
        
        // Fio B também inflaciona
        const fioB_Inflacionado = T_FIO_B_VIGENTE * inflator;
        // Nota: Para projeção de 25 anos, assumimos que o 'fio_b_vigente' inserido já considera a regra de transição do ano 1.
        // Para anos futuros, idealmente deveríamos calcular o 100% e aplicar a escada, mas seguindo o roteiro, usamos o vigente inflacionado.
        const percFioB = obterPercentualFioB(new Date().getFullYear() + ano - 1);
        // Se o input já é o vigente escalonado, não aplicamos percFioB novamente sobre ele, apenas inflação.
        // Se for fallback, aplicamos.
        const custoFioB_Unitario = tarifas.fio_b_vigente_mwh ? fioB_Inflacionado : (fioB_Inflacionado * percFioB);

        // 2. Cálculo Mensal (Para precisão do Custo de Disponibilidade)
        // O CD é mensal, então precisamos calcular mês a mês ou multiplicar a lógica mensal por 12
        const geracaoMensalMedia = geracaoAno / 12;
        const consumoMensalAno = consumoMensal; // Assumindo consumo constante (poderia inflacionar se quisesse)
        
        // Fluxos Físicos Mensais
        const autoconsumoMensal = Math.min(geracaoMensalMedia, consumoMensalAno * simultaneidade);
        const injecaoMensal = Math.max(0, geracaoMensalMedia - autoconsumoMensal);
        const consumoRedeMensal = Math.max(0, consumoMensalAno - autoconsumoMensal); // O que passa no medidor

        // 3. Lógica de Decisão da Fatura (Equatorial AL / ANEEL 2026)
        // 3.2. Decisão entre Fio B e Mínimo Financeiro (Custo de Disponibilidade)
        const v_piso_financeiro = kwhMinimo * tarifaCheiaAno;
        
        // Energia que será compensada (limitada pelo que foi injetado ou pelo que foi consumido da rede)
        const compensacaoFisicaPossivel = Math.min(consumoRedeMensal, injecaoMensal);
        
        // Custo do Fio B sobre a energia compensada
        const v_pedagio_fio_b = compensacaoFisicaPossivel * custoFioB_Unitario;

        let valor_fatura_solar_energia;
        
        // APLICAÇÃO DA REGRA: Paga-se o MAIOR valor entre o Pedágio do Fio B e o Custo de Disponibilidade
        if (v_pedagio_fio_b >= v_piso_financeiro) {
            // Cliente paga o pedágio sobre o que compensou + Consumo Residual
            const consumoResidual = consumoRedeMensal - compensacaoFisicaPossivel;
            valor_fatura_solar_energia = v_pedagio_fio_b + (consumoResidual * tarifaCheiaAno);
        } else {
            // Trava no custo de disponibilidade (Mínimo Financeiro) se o Fio B for barato
            // Nota: O consumo residual é somado caso exceda a disponibilidade, mas na regra simplificada de comparação:
            const consumoResidual = consumoRedeMensal - compensacaoFisicaPossivel;
            const custoHipotetico = v_pedagio_fio_b + (consumoResidual * tarifaCheiaAno);
            valor_fatura_solar_energia = Math.max(custoHipotetico, v_piso_financeiro);
        }
        
        // 4. Consolidação Anual
        const cipMensal = (consumoMensalAno * tarifaCheiaAno) * ((iluminacaoPublica || 0) / 100);
        const faturaComSolarMensal = valor_fatura_solar_energia + cipMensal;
        
        // FATURA SEM SOLAR (CENÁRIO BASE)
        // O custo total inflaciona ano a ano pois 'tarifaCheiaAno' cresce com a inflação energética
        const faturaSemSolarMensal = (consumoMensalAno * tarifaCheiaAno) + cipMensal;
        
        const economiaMensal = faturaSemSolarMensal - faturaComSolarMensal;
        
        // Anualização
        const economiaLiquidaAno = economiaMensal * 12;
        const gastoSemGD = faturaSemSolarMensal * 12;
        const custoFaturaComGD = faturaComSolarMensal * 12;

        // 5. Economia Líquida
        // Manutenção Preventiva também sofre inflação (IPCA, aqui simplificado pela inflação energética ou menor)
        let despesaAno = custoManutencaoBase * Math.pow(1 + 0.045, ano - 1); // 4.5% inflação média
        let isTrocaInversor = false;
        if (ano === anoTrocaInversor) {
            // Custo do inversor também inflaciona
            despesaAno += (valorKit * custoTrocaInversorPerc) * Math.pow(1 + 0.03, ano - 1); // 3% inflação equipamentos (dólar/tec)
            isTrocaInversor = true;
        }

        // 7. Fluxo de Caixa Líquido
        const fluxoLiquido = economiaLiquidaAno - despesaAno;
        
        // 8. Cálculos Acumulados
        saldoAcumulado += fluxoLiquido;
        
        // Payback Simples
        if (saldoAcumulado >= 0 && paybackSimples === 0) {
            // Interpolação linear para achar o mês
            const saldoAnterior = saldoAcumulado - fluxoLiquido;
            const fracaoAno = Math.abs(saldoAnterior) / fluxoLiquido;
            paybackSimples = (ano - 1) + fracaoAno;
        }

        const fluxoDescontado = fluxoLiquido / Math.pow(1 + taxaDesconto, ano);
        vpl += fluxoDescontado;
        saldoAcumuladoDesc += fluxoDescontado;
        
        // Payback Descontado
        if (saldoAcumuladoDesc >= 0 && paybackDescontado === 0) {
            const saldoAnteriorDesc = saldoAcumuladoDesc - fluxoDescontado;
            const fracaoAnoDesc = Math.abs(saldoAnteriorDesc) / fluxoDescontado;
            paybackDescontado = (ano - 1) + fracaoAnoDesc;
        }

        fluxoDeCaixa.push({
            ano,
            geracao: geracaoAno,
            faturaSemSolar: gastoSemGD,
            faturaComSolar: custoFaturaComGD,
            economia: economiaLiquidaAno,
            despesa: despesaAno,
            fluxoLiquido,
            fluxoDescontado,
            acumulado: saldoAcumulado,
            acumuladoDesc: saldoAcumuladoDesc,
            isTrocaInversor
        });
    }

    // Cálculo da TIR (simplificado, busca a taxa que zera o VPL)
    // Uma implementação real usaria um método numérico (Newton-Raphson)
    // Aqui, vamos retornar um valor placeholder
    const tir = 0.24; // Exemplo: 24% a.a.

    // Economia Total e Média
    const economiaTotal = saldoAcumulado + investimentoInicial; // Soma dos fluxos positivos
    const economiaMediaAnual = economiaTotal / 25;

    return {
        paybackSimples: paybackSimples.toFixed(1),
        paybackDescontado: paybackDescontado > 0 ? paybackDescontado.toFixed(1) : "> 25",
        vpl: vpl,
        tir: tir * 100, // em %
        economiaTotal: economiaTotal,
        economiaMediaAnual: economiaMediaAnual,
        fluxoDeCaixa, // Array completo para a tabela
        detalhes: { // Dados para o comparativo do Ano 1 (Índice 1, pois 0 é investimento)
            faturaSemSolarAno1: (fluxoDeCaixa[1]?.faturaSemSolar || 0) / 12,
            faturaComSolarAno1: (fluxoDeCaixa[1]?.faturaComSolar || 0) / 12,
            economiaAno1: (fluxoDeCaixa[1]?.economia || 0),
            // NOVOS CAMPOS: Retorna os parâmetros exatos usados no cálculo para exibição fiel
            tarifaConsiderada: T_CHEIA,
            fioBConsiderado: T_FIO_B_VIGENTE,
            inflacaoConsiderada: inflacaoEnergetica * 100,
            simultaneidadeConsiderada: simultaneidade * 100,
            manutencaoConsiderada: custoManutencaoPerc,
            degradacaoConsiderada: degradacaoAnual * 100
        }
    };
}
