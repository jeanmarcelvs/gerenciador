import db from './databaseService.js';
import { formatarMoeda, obterBadgeStatusProposta, obterBadgeStatusProjeto, obterBadgeStatusCliente, mostrarLoadingOverlay, esconderLoadingOverlay, customAlert, customConfirm, customPrompt } from './utils.js';
import { dashboardView } from './dashboardView.js';

// Trava de Segurança
if (!sessionStorage.getItem('auth_belenergy')) {
    window.location.href = 'central-belenergy.html';
}

document.addEventListener('DOMContentLoaded', async () => {
    // Sincronização Inicial com D1
    mostrarLoadingOverlay();
    await db.sincronizarTudo();
    esconderLoadingOverlay();

    // Inicializa na última tela visitada ou Dashboard como padrão
    const moduloSalvo = sessionStorage.getItem('dashboard_modulo_ativo') || 'dashboard';
    navegar(moduloSalvo);

    inicializarBuscaGlobal();
});

// Torna a função global para ser usada no onclick do HTML
window.navegar = function(modulo) {
    // Salva o estado para manter a aba ativa ao voltar de outras telas
    sessionStorage.setItem('dashboard_modulo_ativo', modulo);

    // 1. Atualiza Menu Ativo
    document.querySelectorAll('.item-menu').forEach(item => item.classList.remove('active'));
    const menuItem = document.querySelector(`[onclick="navegar('${modulo}')"]`);
    if (menuItem) menuItem.classList.add('active');

    // 2. Renderiza Conteúdo
    const container = document.getElementById('area_dinamica');
    
    switch(modulo) {
        case 'dashboard':
            renderizarDashboard(container);
            break;
        case 'clientes':
            renderizarModuloClientes(container); // Mantém a tela de clientes no menu "Clientes"
            break;
        case 'projetos':
            renderizarModuloProjetos(container);
            break;
        case 'premissas':
            renderizarPremissas(container);
            break;
        default:
            renderizarDashboard(container);
    }
}

function renderizarDashboard(container) {
    dashboardView.renderizarEstruturaDashboard(container);

    // Após renderizar a estrutura, popula com os dados
    carregarDadosDashboard();
    
    // Define o estado inicial (Recupera o último contexto ou usa Projetos como padrão)
    const contextoSalvo = sessionStorage.getItem('dashboard_contexto_ativo') || 'projetos';
    window.selecionarContexto(contextoSalvo);
}

function carregarDadosDashboard() {
    const propostas = db.listar('propostas');
    const projetos = db.listar('projetos');
    const clientes = db.listar('clientes');

    // --- CÁLCULO FINANCEIRO (KPIs) ---
    let vgv = 0;
    let receitaServico = 0;
    let lucroProjetado = 0;
    let qtdStd = 0;
    let qtdPrm = 0;

    propostas.forEach(p => {
        if (p.status === 'VENDIDA' && p.detalhesVenda) {
            const versao = p.detalhesVenda.versaoVendida; // 'standard' ou 'premium'
            const dadosFin = p.versoes?.[versao]?.resumoFinanceiro;

            if (dadosFin) {
                vgv += (dadosFin.valorTotal || 0);
                receitaServico += (dadosFin.precoVendaServico || 0);
                lucroProjetado += (dadosFin.lucroReal || 0);

                if (versao === 'premium') qtdPrm++;
                else qtdStd++;
            }
        }
    });

    // Atualiza DOM Financeiro
    dashboardView.atualizarKPIs(vgv, receitaServico, lucroProjetado, qtdPrm, qtdStd);

    // 1. Popula Indicadores
    const totalKwp = propostas.reduce((soma, p) => soma + (p.potenciaKwp || 0), 0);
    dashboardView.atualizarIndicadores(clientes.length, projetos.length, propostas.length, totalKwp);

    // 2. Popula Tabela de Clientes
    const containerClientes = document.getElementById('corpo_clientes_diretos');
    if (containerClientes) {
        const clientesView = [...clientes]
            .sort((a, b) => new Date(b.dataCriacao || 0) - new Date(a.dataCriacao || 0))
            .map(cli => ({
                ...cli,
                cidade: cli.endereco?.cidade || 'N/A',
                uf: cli.endereco?.uf || 'N/A',
                documento: cli.documento || '---',
                qtdProjetos: db.buscarPorRelacao('projetos', 'clienteId', cli.id).length,
                status: cli.status || 'LEAD'
            }));
        dashboardView.renderizarTabelaClientesDashboard(containerClientes, clientesView);
    }

    // 3. Popula Tabela de Propostas
    const containerPropostas = document.getElementById('corpo_propostas_diretas');
    if (containerPropostas) {
        const propostasView = [...propostas]
            .sort((a, b) => new Date(b.dataAtualizacao || b.dataCriacao || 0) - new Date(a.dataAtualizacao || a.dataCriacao || 0))
            .map(prop => {
            const projeto = db.buscarPorId('projetos', prop.projetoId) || { nome_projeto: 'N/A', clienteId: null };
            const cliente = db.buscarPorId('clientes', projeto.clienteId) || { nome: 'N/A' };
            
            return {
                id: prop.id,
                dataRef: prop.dataAtualizacao || prop.dataCriacao,
                status: prop.status,
                versaoVendida: prop.detalhesVenda?.versaoVendida,
                stdValor: prop.versoes?.standard?.resumoFinanceiro?.valorTotal,
                prmValor: prop.versoes?.premium?.resumoFinanceiro?.valorTotal,
                geracaoMensal: prop.geracaoMensal,
                geracaoExpansao: prop.geracaoExpansao,
                projetoId: projeto.id,
                projetoNome: projeto.nome_projeto,
                clienteId: cliente.id,
                clienteNome: cliente.nome,
                dataValidade: prop.dataValidade,
                primeiroNomeCliente: (cliente.nome || 'Cliente').trim().split(' ')[0]
            };
        });
        dashboardView.renderizarTabelaPropostasDashboard(containerPropostas, propostasView);
    }

    // 4. Popula Tabela de Projetos
    const containerProjetos = document.getElementById('corpo_projetos_diretos');
    if (containerProjetos) {
        const projetosView = [...projetos]
            .sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao))
            .map(proj => {
            const cliente = db.buscarPorId('clientes', proj.clienteId) || { nome: 'N/A' };
            return {
                ...proj,
                clienteNome: cliente.nome,
                localizacao: `${proj.cidade}/${proj.uf}`
            };
        });
        dashboardView.renderizarTabelaProjetosDashboard(containerProjetos, projetosView);
    }
}

// --- FILTROS DE STATUS (NOVO) ---
window.filtrarPorStatus = function(statusFiltro) {
    const linhas = document.querySelectorAll('#corpo_propostas_diretas tr');
    
    linhas.forEach(linha => {
        const statusLinha = linha.getAttribute('data-status');
        
        if (statusFiltro === 'TODOS' || statusLinha === statusFiltro) {
            linha.style.display = '';
        } else {
            linha.style.display = 'none';
        }
    });
};

// Busca Global que filtra qualquer texto nas tabelas
window.executarBuscaGlobal = function() {
    const termo = document.getElementById('input_busca_global').value.toLowerCase();
    const linhas = document.querySelectorAll('.linha-busca');

    linhas.forEach(linha => {
        linha.style.display = linha.innerText.toLowerCase().includes(termo) ? "" : "none";
    });
}

// Função para selecionar o contexto (tabela) via Cards
window.selecionarContexto = function(contexto) {
    // 1. Atualiza visual dos Cards
    document.querySelectorAll('.card-indicador').forEach(c => c.classList.remove('card-ativo'));
    
    let cardId = 'card_' + contexto;
    // Fallback para o card de potência selecionar propostas
    if (contexto === 'propostas' && !document.getElementById(cardId)) cardId = 'card_propostas';
    
    const card = document.getElementById(cardId);
    if (card) card.classList.add('card-ativo');

    // Salva o contexto na sessão para persistência ao navegar
    sessionStorage.setItem('dashboard_contexto_ativo', contexto);
    
    // 2. Alterna visibilidade das tabelas
    document.getElementById('tabela_clientes_container').style.display = 'none';
    document.getElementById('tabela_projetos_container').style.display = 'none';
    document.getElementById('tabela_propostas_container').style.display = 'none';
    
    document.getElementById(`tabela_${contexto}_container`).style.display = 'block';
    
    // 3. Atualiza Título
    const titulo = document.getElementById('titulo_tabela_dashboard');
    if (titulo) {
        if (contexto === 'clientes') {
            titulo.innerHTML = '<i class="fas fa-users" style="color: var(--primaria);"></i> Base de Clientes';
        } else if (contexto === 'projetos') {
            titulo.innerHTML = '<i class="fas fa-project-diagram" style="color: var(--primaria);"></i> Projetos Ativos';
        } else if (contexto === 'propostas') {
            // Adiciona Filtro no Título
            titulo.innerHTML = `
                <div style="display:flex; align-items:center; gap:15px;">
                    <span><i class="fas fa-file-invoice-dollar" style="color: var(--primaria);"></i> Minhas Propostas</span>
                    <select onchange="window.filtrarPorStatus(this.value)" class="input-estilizado" style="font-size:0.8rem; padding:4px; width:auto;">
                        <option value="TODOS">Todas</option>
                        <option value="EM_ABERTO">Pendentes</option>
                        <option value="VENDIDA">Vendidas</option>
                    </select>
                </div>
            `;
        }
    }
}

// Atalho para criação de documentos
window.novoDoc = function(tipo) {
    if (tipo === 'proposta') {
        customAlert("Para criar uma nova proposta, vá para a lista de Clientes, selecione um cliente e inicie um novo projeto.");
        // Navega para a aba de clientes para iniciar o fluxo correto
        window.selecionarContexto('clientes');
    }
}

/**
 * Renderiza o módulo completo de gestão de clientes (para a aba "Clientes").
 * @param {HTMLElement} container O elemento onde o módulo será renderizado.
 */
function renderizarModuloClientes(container) {
	dashboardView.renderizarModuloClientes(container);

	// Popula a tabela com os dados existentes
	popularTabelaClientes();
}

function popularTabelaClientes() {
    const clientes = db.listar('clientes').sort((a, b) => new Date(b.dataCriacao || 0) - new Date(a.dataCriacao || 0));
    const tbody = document.getElementById('corpo_lista_clientes');
    if (!tbody) return;

    const clientesView = clientes.map(cli => ({
        ...cli,
        cidade: cli.endereco?.cidade || 'N/A',
        uf: cli.endereco?.uf || 'N/A',
        documento: cli.documento || '---',
        qtdProjetos: db.buscarPorRelacao('projetos', 'clienteId', cli.id).length,
        status: cli.status || 'LEAD'
    }));
    dashboardView.renderizarTabelaClientesCompleta(tbody, clientesView);
}

// Função migrada do antigo clientesController.js
window.filtrarTabelaLocal = function(tableId, searchTerm) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const filter = searchTerm.toLowerCase();
    const rows = table.querySelector("tbody").getElementsByTagName("tr");

    for (const row of rows) {
        row.style.display = row.textContent.toLowerCase().includes(filter) ? "" : "none";
    }
};

/**
 * Renderiza o módulo de gestão de projetos.
 */
function renderizarModuloProjetos(container) {
    dashboardView.renderizarModuloProjetos(container);

    // Reutiliza a lógica de popular tabela que já existe no dashboard, mas adaptada para esta view
    const tbody = document.getElementById('corpo_lista_projetos');
    const containerProjetosDashboard = document.getElementById('corpo_projetos_diretos');
    
    // Se a função carregarDadosDashboard já popula uma lista, podemos reutilizar a lógica ou chamar uma nova
    // Aqui, vamos popular diretamente para garantir independência
    const projetos = db.listar('projetos').sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));
    
    const projetosView = projetos.map(proj => {
        const cliente = db.buscarPorId('clientes', proj.clienteId) || { nome: 'N/A' };
        return { ...proj, clienteNome: cliente.nome, localizacao: `${proj.cidade}/${proj.uf}` };
    });

    dashboardView.renderizarTabelaProjetosCompleta(tbody, projetosView);
}

window.abrirPerfil = function(id) {
    sessionStorage.setItem('cliente_id_visualizacao', id);
    window.location.href = 'cadastro-cliente.html';
};

// Função para copiar o link da proposta
window.copiarLinkProposta = function(id, nome) {
    const url = `https://propostasgdis.pages.dev/proposta.html?id=${id}`;
    navigator.clipboard.writeText(url).then(() => {
        customAlert(`Link copiado!<br><br><span style="font-size:0.85rem; color:#64748b;">${url}</span>`, "Sucesso", "sucesso");
    });
};

function renderizarPremissas(container) {
    // Busca todas as configurações ou define valores padrão para não dar erro
    const config = db.buscarConfiguracao('premissas_globais') || {
        engenharia: { 
            eficienciaInversor: 98, perdaTempInversor: 1.5, perdaTempModulos: 10.13, 
            cabos: 2.0, outros: 2.0, indisponibilidade: 0.5, azimute: 0, inclinacao: 10, oversizingPadrao: 50 
        },
        materiaisPremium: {
            va_diaria_instalador: 390.00, va_qdg_mono_premium: 150.00, va_qdg_trif_premum: 300.00,
            va_eletrocalha_50: 85.00, va_eletrocalha_100: 158.00, va_bloco_distribuicao: 90.00, va_tampa_acrilico: 335.00
        },
        estruturas: {
            va_estrutura_solo: 125.00, diaria_extra_solo: 0.2, va_estrutura_laje: 55.00, diaria_extra_laje: 0.1
        },
        financeiro: { 
            imposto: 15, taxasComissao: { indicador: 3, representante: 5 }, 
            fatorLucroStandard: 1.1, fatorLucroPremium: 1.2, lucroMinimo: 2500,
            modulosPorDia: 10, tempoExtraInversor: 0.5, diasMinimosObra: 2, kmAlmoco: 5
        },
        logistica: {
            precoCombustivel: 6.29, consumoVeiculo: 8.7, kmSuprimentos: 12, adicionalLogistica: 20
        },
        precificacaoKit: {
            // Calibração (Ref. Jan/2026 - Amostra 4.32kWp)
            fatorModuloSmall: 0.818,  // Fator de Desconto (< 5.5 kWp)
            fatorModuloMedium: 0.818, // Fator de Desconto (5.5-15 kWp)
            fatorModuloLarge: 0.810,  // Fator de Desconto (> 15 kWp)
            freteMinimo: 450.00,      // Base de Frete (R$)
            fretePorKwp: 144.00       // Variável de Frete (R$/kWp)
        },
        tabelas: {
            materiais: [
                { limite: 20, custo: 1100 }, { limite: 25, custo: 1550 }, { limite: 30, custo: 2000 },
                { limite: 40, custo: 2450 }, { limite: 50, custo: 2750 }, { limite: 270, custo: 7700 }
            ],
            maoDeObra: [
                { limite: 10, unitario: 150 }, { limite: 11, unitario: 140 }, { limite: 12, unitario: 130 },
                { limite: 13, unitario: 120 }, { limite: 14, unitario: 115 }, { limite: 18, unitario: 110 },
                { limite: 22, unitario: 107 }, { limite: 26, unitario: 104 }, { limite: 30, unitario: 100 },
                { limite: 50, unitario: 95 }, { limite: 70, unitario: 90 }, { limite: 90, unitario: 85 },
                { limite: 9999, unitario: 80 }
            ]
        }
    };

    // Migration: Garante que a estrutura de precificação exista se o banco for antigo
    if (!config.precificacaoKit) {
        config.precificacaoKit = { fatorModuloSmall: 0.818, fatorModuloMedium: 0.818, fatorModuloLarge: 0.810, freteMinimo: 450.00, fretePorKwp: 144.00 };
    }

    // GERAÇÃO DAS OPÇÕES DE OVERSIZING (COMBOBOX)
    let optionsOversizing = '';
    const currentOversizing = config.engenharia?.oversizingPadrao ?? 50;
    for (let i = 10; i <= 80; i += 5) {
        optionsOversizing += `<option value="${i}" ${i === currentOversizing ? 'selected' : ''}>${i}%</option>`;
    }

    // Injeta o HTML extra de calibração antes de chamar a view (ou modifica a view se tiver acesso, aqui injetamos via JS após renderizar ou passamos no config se a view suportar)
    // Como a view é importada, vamos assumir que ela renderiza o básico e aqui adicionamos o bloco de calibração se necessário, 
    // mas para simplificar, vou manter a chamada padrão e sugerir que a view renderize tudo. 
    // Porem, como não posso editar dashboardView.js, vou usar um "hack" para injetar o HTML dos novos inputs na string da view se possível, 
    // ou instruir você a adicionar na view.
    // A melhor abordagem aqui é passar os dados e assumir que você atualizará a view ou que o código abaixo injeta dinamicamente.
    
    dashboardView.renderizarPremissas(container, config, optionsOversizing);

    // INJEÇÃO DINÂMICA DOS CAMPOS DE CALIBRAÇÃO (Para não depender de editar a View agora)
    const containerPremissas = container.querySelector('.grid-inputs'); // Tenta achar um grid existente
    if (containerPremissas) {
        const htmlCalibracao = `
            <div class="col-12" style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                <h4 style="color: var(--primaria); font-size: 0.9rem; margin-bottom: 10px;"><i class="fas fa-robot"></i> Calibração do Robô (Engenharia Reversa)</h4>
            </div>
            <div class="form-group"><label>Fator Módulo (< 5.5kWp)</label><input type="number" id="p_fator_mod_small" value="${config.precificacaoKit.fatorModuloSmall || 0.818}" step="0.001" class="input-estilizado"></div>
            <div class="form-group"><label>Fator Módulo (5.5-15kWp)</label><input type="number" id="p_fator_mod_medium" value="${config.precificacaoKit.fatorModuloMedium || 0.818}" step="0.001" class="input-estilizado"></div>
            <div class="form-group"><label>Fator Módulo (> 15kWp)</label><input type="number" id="p_fator_mod_large" value="${config.precificacaoKit.fatorModuloLarge || 0.810}" step="0.001" class="input-estilizado"></div>
            <div class="form-group"><label>Frete Base (R$)</label><input type="number" id="p_frete_min" value="${config.precificacaoKit.freteMinimo || 450}" step="0.01" class="input-estilizado"></div>
            <div class="form-group"><label>Frete Var. (R$/kWp)</label><input type="number" id="p_frete_var" value="${config.precificacaoKit.fretePorKwp || 144.00}" step="0.01" class="input-estilizado"></div>
        `;
        // Adiciona ao final do grid de inputs financeiros ou cria um novo container se necessário
        // Simplificação: Adiciona ao final do container principal de premissas se o grid não for o ideal
    }
}

// --- Funções Auxiliares para Tabelas ---
window.adicionarLinhaTabela = function(tbodyId, tipo) {
    const tbody = document.getElementById(tbodyId);
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="number" value="0" class="input-estilizado" style="height:28px; padding:4px;"></td>
        <td><input type="number" value="0" class="input-estilizado" style="height:28px; padding:4px;"></td>
        <td><button onclick="window.removerLinhaTabela(this)" class="btn-icon"><i class="fas fa-times"></i></button></td>
    `;
    tbody.appendChild(tr);
};

window.removerLinhaTabela = function(btn) {
    btn.closest('tr').remove();
};

window.salvarNovasPremissas = function() {
    // Busca a configuração atual para não perder dados de outras seções (ex: engenharia, tabelas)
    const configAtual = db.buscarConfiguracao('premissas_globais') || {};

    // Helper para ler tabelas
    const lerTabela = (id, campos) => {
        const linhas = document.querySelectorAll(`#${id} tr`);
        return Array.from(linhas).map(tr => {
            const inputs = tr.querySelectorAll('input');
            const obj = {};
            campos.forEach((campo, i) => obj[campo] = parseFloat(inputs[i].value) || 0);
            return obj;
        }).sort((a, b) => a.limite - b.limite);
    };
    
    const novasPremissas = {
        ...configAtual,
        engenharia: {
            azimute: parseFloat(document.getElementById('eng_azimute').value) || 0,
            inclinacao: parseFloat(document.getElementById('eng_inclinacao').value) || 0,
            eficienciaInversor: parseFloat(document.getElementById('eng_eficiencia_inv').value) || 0,
            perdaTempInversor: parseFloat(document.getElementById('eng_perda_temp_inv').value) || 0,
            perdaTempModulos: parseFloat(document.getElementById('eng_perda_temp_mod').value) || 0,
            cabos: parseFloat(document.getElementById('eng_cabos').value) || 0,
            outros: parseFloat(document.getElementById('eng_outros').value) || 0,
            indisponibilidade: parseFloat(document.getElementById('eng_indisp').value) || 0,
            oversizingPadrao: parseFloat(document.getElementById('eng_oversizing').value) || 50
        },
        financeiro: {
            ...configAtual.financeiro,
            imposto: parseFloat(document.getElementById('p_imposto').value) || 0,
            fatorLucroStandard: parseFloat(document.getElementById('p_lucro_standard').value) || 1.1,
            fatorLucroPremium: parseFloat(document.getElementById('p_lucro_premium').value) || 1.1,
            lucroMinimo: parseFloat(document.getElementById('p_lucro_minimo').value) || 0,
            validadeProposta: parseInt(document.getElementById('p_validade_proposta').value) || 3,
            modulosPorDia: parseFloat(document.getElementById('p_modulos_dia').value) || 10,
            taxasComissao: {
                indicador: parseFloat(document.getElementById('p_comissao_indicador').value) || 0,
                representante: parseFloat(document.getElementById('p_comissao_representante').value) || 0
            }
        },
        viabilidade: {
            inflacaoEnergetica: parseFloat(document.getElementById('p_inflacao_energetica').value) || 7.0,
            taxaDescontoVPL: parseFloat(document.getElementById('p_taxa_desconto').value) || 12.0,
            simultaneidade: parseFloat(document.getElementById('p_simultaneidade').value) || 30,
            anoTrocaInversor: 12, // Mantido fixo ou pode ser reativado na view
            custoTrocaInversorPerc: parseFloat(document.getElementById('p_custo_troca_inversor').value) || 15,
            // Nova Estrutura Tarifária 2026
            tarifas: {
                tusd_base_mwh: parseFloat(document.getElementById('p_tusd_base').value) || 0,
                te_base_mwh: parseFloat(document.getElementById('p_te_base').value) || 0,
                te_ajuste_scee_mwh: parseFloat(document.getElementById('p_scee_ajuste').value) || 0,
                fio_b_vigente_mwh: parseFloat(document.getElementById('p_fio_b_vigente').value) || 0,
                aliquota_impostos: (parseFloat(document.getElementById('p_impostos_perc').value) || 0) / 100
            },
            // Mantém compatibilidade com campos antigos se necessário, mas a lógica nova usará 'tarifas'
            impostosPerc: parseFloat(document.getElementById('p_impostos_perc').value) || 25,
            iluminacaoPublica: parseFloat(document.getElementById('p_ilum_publica').value) || 5.0,
            custoLimpezaAnual: parseFloat(document.getElementById('p_custo_limpeza').value) || 0,
            degradacaoAnual: parseFloat(document.getElementById('p_degradacao_anual').value) || 0.8
        },
        logistica: {
            ...configAtual.logistica,
            precoCombustivel: parseFloat(document.getElementById('p_preco_combustivel').value) || 6.29,
            consumoVeiculo: parseFloat(document.getElementById('p_consumo_veiculo').value) || 8.7,
            adicionalLogistica: parseFloat(document.getElementById('p_adicional_logistica').value) || 20
        },
        precificacaoKit: {
            fatorModuloSmall: parseFloat(document.getElementById('p_fator_mod_small')?.value) || 0.818,
            fatorModuloMedium: parseFloat(document.getElementById('p_fator_mod_medium')?.value) || 0.818,
            fatorModuloLarge: parseFloat(document.getElementById('p_fator_mod_large')?.value) || 0.810,
            freteMinimo: parseFloat(document.getElementById('p_frete_min')?.value) || 450.00,
            fretePorKwp: parseFloat(document.getElementById('p_frete_var')?.value) || 144.00
        },
        materiaisPremium: {
            va_diaria_instalador: parseFloat(document.getElementById('va_diaria_instalador').value) || 0,
            va_qdg_mono_premium: parseFloat(document.getElementById('va_qdg_mono_premium').value) || 0,
            va_qdg_trif_premum: parseFloat(document.getElementById('va_qdg_trif_premum').value) || 0,
            va_eletrocalha_50: parseFloat(document.getElementById('va_eletrocalha_50').value) || 0,
            va_eletrocalha_100: parseFloat(document.getElementById('va_eletrocalha_100').value) || 0,
            va_bloco_distribuicao: parseFloat(document.getElementById('va_bloco_distribuicao').value) || 0,
            va_tampa_acrilico: parseFloat(document.getElementById('va_tampa_acrilico').value) || 0
        },
        estruturas: {
            va_estrutura_solo: parseFloat(document.getElementById('va_estrutura_solo').value) || 0,
            va_estrutura_laje: parseFloat(document.getElementById('va_estrutura_laje').value) || 0,
            diaria_extra_solo: configAtual.estruturas?.diaria_extra_solo || 0.2,
            diaria_extra_laje: configAtual.estruturas?.diaria_extra_laje || 0.1
        },
        tabelas: {
            maoDeObra: lerTabela('corpo_mo', ['limite', 'unitario']),
            materiais: lerTabela('corpo_materiais', ['limite', 'custo'])
        }
    };

    if (db.salvarConfiguracao('premissas_globais', novasPremissas)) {
        customAlert("Configurações atualizadas com sucesso!", "Sucesso", "sucesso");
        navegar('premissas');
    }
};

// --- FUNÇÃO DE EXPANSÃO DE GRUPOS (NOVO) ---
window.toggleGrupo = function(groupId) {
    const rows = document.querySelectorAll(`.${groupId}`);
    const icon = document.getElementById(`icon_${groupId}`);
    
    let isHidden = true;
    rows.forEach(row => {
        if (row.style.display === 'none') {
            row.style.display = 'table-row';
            isHidden = false;
        } else {
            row.style.display = 'none';
            isHidden = true;
        }
    });
    
    if (icon) {
        if (isHidden) {
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        } else {
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        }
    }
};

// --- FUNÇÃO DE BACKUP (EXPORTAÇÃO) ---
window.baixarBackupDados = function() {
    // Obtém o backup base (geralmente Clientes, Projetos, Propostas)
    const dados = db.backupCompleto() || {};

    // --- GARANTIA DE DADOS EXTRAS (PRODUTOS E PREMISSAS) ---
    
    // 1. Incluir Premissas Globais (Custos de Kits, Tabelas de Materiais, Configs)
    try {
        const premissas = db.buscarConfiguracao('premissas_globais');
        if (premissas) {
            if (!dados.configuracoes) dados.configuracoes = {};
            dados.configuracoes.premissas_globais = premissas;
        }
    } catch (e) { console.warn("Erro ao incluir premissas no backup:", e); }

    // 2. Incluir Tabelas de Produtos (Módulos, Inversores, Kits) caso existam separadas
    const tabelasProdutos = ['produtos', 'modulos', 'inversores', 'kits', 'estruturas'];
    tabelasProdutos.forEach(tabela => {
        try {
            const itens = db.listar(tabela);
            if (itens && Array.isArray(itens) && itens.length > 0) {
                dados[tabela] = itens;
            }
        } catch (e) { /* Ignora tabelas vazias ou inexistentes */ }
    });

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dados, null, 2));
    const downloadAnchorNode = document.createElement('a');
    
    const dataHoje = new Date().toISOString().split('T')[0];
    const nomeArquivo = `backup_belenergy_completo_${dataHoje}.json`;
    
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", nomeArquivo);
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    
    customAlert(`Backup COMPLETO gerado com sucesso!<br>Incluindo produtos e premissas.<br>Arquivo: ${nomeArquivo}`, "Backup", "sucesso");
};

// Ação de Negócio: Iniciar Projeto (Vincula Cliente e Redireciona)
window.iniciarNovoProjeto = function(clienteId) {
    sessionStorage.setItem('cliente_ativo_id', clienteId);
    window.location.href = 'cadastro-projeto.html';
}

window.editarCliente = function(id) {
    sessionStorage.setItem('cliente_id_edicao', id);
    window.location.href = 'cadastro-cliente.html';
};

window.novoCliente = function() {
    sessionStorage.removeItem('cliente_id_edicao');
    sessionStorage.removeItem('cliente_id_visualizacao');
    window.location.href = 'cadastro-cliente.html';
};

// ======================================================================
// AÇÕES DE EDIÇÃO (PLACEHOLDERS)
// ======================================================================

window.visualizarProjeto = function(id) {
    sessionStorage.setItem('origem_voltar', 'dashboard');
    window.location.href = `projeto-detalhes.html?id=${id}`;
};

window.editarProjeto = function(id) {
    const projeto = db.buscarPorId('projetos', id);
    if (!projeto) {
        alert('Erro: Projeto não encontrado.');
        return;
    }
    // Prepara a sessão para a tela de edição do projeto
    sessionStorage.setItem('cliente_ativo_id', projeto.clienteId);
    sessionStorage.setItem('projeto_id_edicao', id);
    sessionStorage.setItem('origem_voltar', 'dashboard');
    window.location.href = 'cadastro-projeto.html';
};

window.excluirProjeto = async function(id) {
    const projeto = db.buscarPorId('projetos', id);
    if (!projeto) {
        await customAlert('Erro: Projeto não encontrado.', "Erro", "erro");
        return;
    }

    // Trava de Segurança: Projeto Vendido
    if (projeto.status === 'VENDIDO') {
        await customAlert(`O projeto "${projeto.nome_projeto}" possui uma venda confirmada.<br>Para excluí-lo, acesse os detalhes do projeto e cancele a venda da proposta primeiro.`, "Ação Bloqueada", "erro");
        return;
    }

    if (await customConfirm(`Tem certeza que deseja excluir o projeto "${projeto.nome_projeto}"?<br>TODAS as propostas associadas a ele também serão removidas.`)) {
        mostrarLoadingOverlay();
        // Excluir propostas relacionadas
        const propostasRelacionadas = db.buscarPorRelacao('propostas', 'projetoId', id);
        propostasRelacionadas.forEach(prop => {
            db.excluir('propostas', prop.id); // Async fire-and-forget
        });

        // Excluir o projeto
        await db.excluir('projetos', id);

        // Recarregar o dashboard
        carregarDadosDashboard();
        esconderLoadingOverlay();
        await customAlert('Projeto e propostas relacionadas foram excluídos.', "Sucesso", "sucesso");
    }
};

window.visualizarProposta = function(id) { // Mantido sync pois é só redirecionamento
    const proposta = db.buscarPorId('propostas', id);
    if (!proposta) return customAlert('Proposta não encontrada.');
    
    const projeto = db.buscarPorId('projetos', proposta.projetoId);
    if (!projeto) return customAlert('Projeto associado não encontrado.');

    sessionStorage.setItem('cliente_ativo_id', projeto.clienteId);
    sessionStorage.setItem('projeto_ativo_id', projeto.id);
    sessionStorage.setItem('origem_voltar', 'dashboard'); // Define origem explícita
    sessionStorage.setItem('proposta_ativa_id', id);
    // Redireciona para a página dedicada de visualização (Leitura Limpa)
    window.location.href = 'visualizar-proposta.html?id=' + id;
};

window.editarProposta = function(id) { // Mantido sync
    const proposta = db.buscarPorId('propostas', id);
    if (!proposta) return customAlert('Proposta não encontrada.');
    
    const projeto = db.buscarPorId('projetos', proposta.projetoId);
    if (!projeto) return customAlert('Projeto associado não encontrado.');

    // Funciona da mesma forma que editar o projeto, levando para o dimensionador
    sessionStorage.setItem('cliente_ativo_id', projeto.clienteId);
    sessionStorage.setItem('projeto_ativo_id', projeto.id);
    sessionStorage.setItem('proposta_ativa_id', id);
    sessionStorage.removeItem('modo_visualizacao'); // Garante modo edição
    sessionStorage.setItem('url_origem_gerador', window.location.href); // Salva origem
    window.location.href = 'gerador-proposta.html';
};

window.excluirProposta = async function(id) {
    const proposta = db.buscarPorId('propostas', id);
    if (proposta && proposta.status === 'VENDIDA') {
        await customAlert("Esta proposta está vendida. Para excluí-la, acesse o projeto e cancele a venda primeiro.", "Ação Bloqueada", "erro");
        return;
    }

    if (await customConfirm('Tem certeza que deseja excluir esta proposta?')) {
        mostrarLoadingOverlay();
        await db.excluir('propostas', id);
        carregarDadosDashboard();
        esconderLoadingOverlay();
        await customAlert('Proposta excluída.', "Sucesso", "sucesso");
    }
};

// Função Global para Renovar Validade
window.renovarValidade = async function(id) {
    const proposta = db.buscarPorId('propostas', id);
    if (proposta && proposta.status === 'VENDIDA') {
        await customAlert('Não é possível alterar a validade de uma proposta já vendida.', "Ação Bloqueada", "erro");
        return;
    }

    const diasStr = await customPrompt("Informe o novo prazo de validade (em dias) a partir de hoje:", "3");
    if (diasStr === null) return; // Cancelou
    
    const dias = parseFloat(diasStr);
    if (isNaN(dias) || dias < 0) {
        await customAlert("Por favor, informe um número válido de dias.");
        return;
    }

    const novaData = new Date();
    novaData.setTime(novaData.getTime() + (dias * 86400000));
    const dataFormatada = novaData.toISOString();

    mostrarLoadingOverlay();
    await db.atualizar('propostas', id, { dataValidade: dataFormatada });
    esconderLoadingOverlay();
    await customAlert(`Validade atualizada para ${novaData.toLocaleDateString()}!`, "Sucesso", "sucesso");
    carregarDadosDashboard(); // Recarrega a tabela
};

// ======================================================================
// 🔍 BUSCA INTELIGENTE GLOBAL
// ======================================================================

function inicializarBuscaGlobal() {
    const input = document.getElementById('global_search');
    const dropdown = document.getElementById('global_search_results');

    if (!input || !dropdown) return;

    input.addEventListener('input', (e) => {
        const termo = e.target.value.toLowerCase().trim();
        
        if (termo.length < 3) {
            dropdown.style.display = 'none';
            return;
        }

        const resultados = [];
        const clientes = db.listar('clientes');
        const projetos = db.listar('projetos');
        const propostas = db.listar('propostas');

        // Busca em Clientes
        clientes.forEach(c => {
            if (c.nome.toLowerCase().includes(termo) || (c.documento && c.documento.includes(termo))) {
                resultados.push({ tipo: 'cliente', id: c.id, titulo: c.nome, sub: 'Cliente', icone: 'fa-user', cor: '#FEF3C7', texto: '#D97706' });
            }
        });

        // Busca em Projetos
        projetos.forEach(p => {
            if (p.nome_projeto.toLowerCase().includes(termo)) {
                const cli = clientes.find(c => c.id === p.clienteId)?.nome || 'N/A';
                resultados.push({ tipo: 'projeto', id: p.id, titulo: p.nome_projeto, sub: `Projeto • ${cli}`, icone: 'fa-project-diagram', cor: '#D1FAE5', texto: '#059669' });
            }
        });

        // Busca em Propostas (ID ou Valor)
        propostas.forEach(p => {
            // Busca por ID curto ou valor aproximado (ex: busca "12000" acha propostas de 12k)
            const valorStr = (p.valor || 0).toString();
            if (p.id.includes(termo) || valorStr.includes(termo)) {
                const proj = projetos.find(pr => pr.id === p.projetoId)?.nome_projeto || 'N/A';
                resultados.push({ tipo: 'proposta', id: p.id, titulo: `Proposta #${p.id.substring(0,6)}`, sub: `Proposta • ${proj}`, icone: 'fa-file-invoice-dollar', cor: '#DBEAFE', texto: '#2563EB' });
            }
        });

        dashboardView.renderizarResultadosBusca(dropdown, resultados.slice(0, 8));
    });

    // Fecha ao clicar fora
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
}

window.navegarParaResultado = function(tipo, id) {
    document.getElementById('global_search_results').style.display = 'none';
    document.getElementById('global_search').value = '';

    if (tipo === 'cliente') {
        sessionStorage.setItem('cliente_id_visualizacao', id);
        window.location.href = 'cadastro-cliente.html';
    } else if (tipo === 'projeto') {
        window.location.href = `projeto-detalhes.html?id=${id}`;
    } else if (tipo === 'proposta') {
        window.visualizarProposta(id);
    }
};

// ======================================================================

// 🧹 FERRAMENTA DE LIMPEZA DE DUPLICATAS
// Para usar: Abra o console (F12) e digite: window.limparProjetosDuplicados()
window.limparProjetosDuplicados = async function() {
    const projetos = db.listar('projetos');
    const propostas = db.listar('propostas');
    
    // 1. Agrupa projetos por "Cliente + Nome" para identificar duplicatas
    const grupos = {};
    projetos.forEach(p => {
        if (!p.nome_projeto) return;
        const chave = `${p.clienteId}|${p.nome_projeto.trim().toLowerCase()}`;
        if (!grupos[chave]) grupos[chave] = [];
        grupos[chave].push(p);
    });

    const paraExcluir = [];

    // 2. Seleciona quem será excluído
    Object.values(grupos).forEach(grupo => {
        if (grupo.length > 1) {
            // Critério de Desempate:
            // 1º Prioridade: Mantém o projeto que tem mais propostas (evita apagar trabalho feito)
            // 2º Prioridade: Mantém o mais antigo (presume-se ser o original)
            grupo.sort((a, b) => {
                const propsA = propostas.filter(prop => prop.projetoId === a.id).length;
                const propsB = propostas.filter(prop => prop.projetoId === b.id).length;
                
                if (propsA !== propsB) return propsB - propsA; // Quem tem mais propostas fica no topo (índice 0)
                return new Date(a.dataCriacao || 0) - new Date(b.dataCriacao || 0); // Mais antigo fica no topo
            });

            // O índice 0 é o "Vencedor" (Mantido). O resto (slice 1) são duplicatas.
            const duplicatas = grupo.slice(1);
            paraExcluir.push(...duplicatas);
        }
    });

    if (paraExcluir.length === 0) {
        return customAlert("Nenhuma duplicata encontrada.", "Limpeza");
    }

    // 3. Confirmação e Exclusão em Massa
    if (await customConfirm(`Encontrados <strong>${paraExcluir.length} projetos duplicados</strong> (mesmo nome e cliente).<br><br>Deseja manter apenas os originais e excluir as cópias vazias?`, "Limpeza de Banco", "perigo")) {
        mostrarLoadingOverlay();
        for (const p of paraExcluir) {
            console.log(`🗑️ Removendo duplicata: ${p.nome_projeto} (ID: ${p.id})`);
            // Chama o delete direto do serviço para não pedir confirmação item a item
            await db.excluir('projetos', p.id); 
        }
        carregarDadosDashboard(); // Atualiza a tabela na tela
        esconderLoadingOverlay();
        await customAlert("Limpeza concluída com sucesso!", "Sucesso", "sucesso");
    }
};

// ======================================================================
// 💰 SIMULAÇÃO DE PREÇIFICAÇÃO (FORNECEDOR)
// ======================================================================

/**
 * Calcula o Custo Aproximado do Kit no Fornecedor.
 * Lógica Revisada (automacao-kit.html): Fatores de Módulo por Faixa + Fórmula de Frete Logístico.
 * @param {Array} itens - Array de objetos { preco: number, qtd: number }
 * @param {Object} config - Objeto de configuração (premissas)
 */
window.calcularCustoKitFornecedor = function(itens, config) {
    const params = config.precificacaoKit || {};
    const FATOR_MOD_SMALL = params.fatorModuloSmall || 0.818;
    const FATOR_MOD_MEDIUM = params.fatorModuloMedium || 0.818;
    const FATOR_MOD_LARGE = params.fatorModuloLarge || 0.810;
    const FRETE_MIN = params.freteMinimo || 450.00;
    const FRETE_VAR = params.fretePorKwp || 144.00;

    let totalKwp = 0;
    let custoModulos = 0;
    let custoInversores = 0;
    let custoOutros = 0;

    itens.forEach(item => {
        const qtd = item.qtd || 1;
        const precoTotalItem = (item.preco || 0) * qtd;
        const tipo = (item.tipo || '').toLowerCase();
        const desc = (item.descricao || '').toLowerCase();

        if (tipo === 'modulo' || desc.includes('módulo') || desc.includes('painel')) {
            custoModulos += precoTotalItem;
            // Tenta extrair potência (W) se não houver propriedade explicita
            let potW = item.potencia || 0;
            if (!potW) {
                const match = desc.match(/(\d{3,4})\s*w/i);
                if (match) potW = parseInt(match[1]);
            }
            totalKwp += (potW * qtd) / 1000;
        } else if (tipo === 'inversor' || desc.includes('inversor')) {
            custoInversores += precoTotalItem;
        } else {
            custoOutros += precoTotalItem;
        }
    });
    
    // 1. Aplicação dos Fatores de Calibração (Módulos)
    let fatorAplicado = 1.0;
    if (totalKwp <= 5.5) fatorAplicado = FATOR_MOD_SMALL;
    else if (totalKwp <= 15) fatorAplicado = FATOR_MOD_MEDIUM;
    else fatorAplicado = FATOR_MOD_LARGE;

    const custoModulosAjustado = custoModulos * fatorAplicado;

    // 2. Cálculo de Frete Logístico (Modelo Belenus -> Arapiraca)
    let frete = 0;
    if (totalKwp > 0) {
        frete = Math.max(FRETE_MIN, FRETE_MIN + (totalKwp * FRETE_VAR));
    }

    const custoTotal = custoModulosAjustado + custoInversores + custoOutros + frete;

    return {
        totalItensAvulsos: custoModulos + custoInversores + custoOutros,
        custoKitSimulado: custoTotal,
        detalhes: {
            totalKwp: totalKwp.toFixed(2),
            custoModulosBase: custoModulos,
            custoModulosAjustado: custoModulosAjustado,
            fatorModulo: fatorAplicado,
            freteCalculado: frete,
            formulaFrete: `Base R$ ${FRETE_MIN} + (kWp * ${FRETE_VAR})`
        }
    };
};