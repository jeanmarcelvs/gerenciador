import db from './databaseService.js';
import { obterInversoresHuawei } from './model.js';
import { mostrarLoadingOverlay, esconderLoadingOverlay, customAlert, customConfirm } from './utils.js';
import { WORKER_URL } from './api.js'; // Importa URL para chamada direta de segurança

// Trava de Segurança
if (!sessionStorage.getItem('auth_belenergy')) {
    window.location.href = 'central-belenergy.html';
}

document.addEventListener('DOMContentLoaded', async () => {
    // Sincronização Inicial com D1
    mostrarLoadingOverlay();
    await db.sincronizarTudo();
    esconderLoadingOverlay();

    // 1. Pega o ID da proposta pela URL ou Sessão
    const urlParams = new URLSearchParams(window.location.search);
    const propostaId = urlParams.get('id') || sessionStorage.getItem('proposta_ativa_id');

    if (!propostaId) {
        await customAlert("Nenhuma proposta selecionada.", "Erro", "erro");
        window.location.href = 'dashboard-admin.html';
        return;
    }

    // 2. Busca os dados no banco
    const proposta = db.buscarPorId('propostas', propostaId);
    
    if (!proposta) {
        await customAlert("Proposta não encontrada.", "Erro", "erro");
        window.location.href = 'dashboard-admin.html';
        return;
    }

    const projeto = db.buscarPorId('projetos', proposta.projetoId);
    const cliente = db.buscarPorId('clientes', proposta.clienteId);

    inicializarVisualizacao(proposta, projeto, cliente);
});

// --- NAVEGAÇÃO INTELIGENTE (BOTÃO VOLTAR) ---
window.voltar = function() {
    const origem = sessionStorage.getItem('origem_voltar') || 'dashboard';
    const projetoId = sessionStorage.getItem('projeto_ativo_id');

    if (origem === 'projeto_detalhes' && projetoId) {
        window.location.href = `projeto-detalhes.html?id=${projetoId}`;
    } else {
        window.location.href = 'dashboard-admin.html';
    }
};

function inicializarVisualizacao(proposta, projeto, cliente) {
    // Renderiza os dados
    renderizarDadosVersao(proposta, projeto, cliente);
    
    // Renderiza Controle de Segurança (Novo)
    renderizarGestaoDispositivos(proposta.id, proposta);
}

function renderizarDadosVersao(proposta, projeto, cliente) {
    const fmtMoney = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const premissasGlobais = db.buscarConfiguracao('premissas_globais') || {};

    // Helper para evitar crash se o ID não existir no HTML
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
        // else console.warn(`Elemento ${id} não encontrado.`); // Debug silencioso
    };

    // Dados Técnicos são comuns
    const versoes = proposta.versoes || {};
    const dadosTecnicos = versoes.standard?.dados || versoes.premium?.dados || {};
    const resStd = versoes.standard?.resumoFinanceiro || {};
    const resPrm = versoes.premium?.resumoFinanceiro || {};

    // PRIORIDADE DE PREMISSAS:
    // 1. Premissas específicas da versão (se salvas independentemente)
    // 2. Premissas globais da proposta (Snapshot)
    // FIX: Mescla os objetos para garantir que dados faltantes em um sejam pegos no outro
    const premissas = { ...proposta.premissasSnapshot, ...(dadosTecnicos.premissasTecnicas || {}) };

    // --- IDENTIFICAÇÃO ---
    setText('view_cliente_nome', cliente?.nome || "Cliente não identificado");
    setText('view_localidade', `${projeto?.cidade || '---'} / ${projeto?.uf || '---'}`);
    setText('view_projeto_id', `Prop: #${proposta.id.substring(0,8)} | Proj: #${projeto.id.substring(0,8)}`);

    // --- DATAS ---
    setText('view_data_criacao', proposta.dataCriacao ? new Date(proposta.dataCriacao).toLocaleDateString('pt-BR') : '---');
    setText('view_data_atualizacao', proposta.dataAtualizacao ? new Date(proposta.dataAtualizacao).toLocaleDateString('pt-BR') : '---');

    // --- VALIDADE E CONTAGEM REGRESSIVA ---
    const elValidade = document.getElementById('view_validade');
    if (elValidade) {
        if (proposta.dataValidade) {
            let dataLimite;
            // Verifica se é formato ISO completo (com horário) ou legado (YYYY-MM-DD)
            if (proposta.dataValidade.includes('T')) {
                dataLimite = new Date(proposta.dataValidade);
            } else {
                const partes = proposta.dataValidade.split('-');
                dataLimite = new Date(partes[0], partes[1] - 1, partes[2], 23, 59, 59);
            }
            
            const agora = new Date();
            
            const diffMs = dataLimite - agora;
            
            if (diffMs < 0) {
                elValidade.innerHTML = `<span style="color: #ef4444;">Expirada em ${dataLimite.toLocaleDateString('pt-BR')}</span>`;
            } else {
                const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                const horas = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                
                let contagem = "";
                if (dias > 0) {
                    contagem = `${dias} dias`;
                    if (horas > 0) contagem += `, ${horas}h`;
                } else if (horas > 0) {
                    contagem = `${horas}h e ${minutos}min`;
                } else {
                    contagem = `${minutos}min`;
                }
                
                const corTexto = dias < 2 ? "#f59e0b" : "#0f172a"; // Alerta laranja se faltar < 2 dias
                const dataFormatada = dataLimite.toLocaleDateString('pt-BR');
                
                elValidade.innerHTML = `<span style="color: ${corTexto}">${dataFormatada}</span> <span style="font-size:0.75rem; font-weight:400; color:#64748b;">(expira em ${contagem})</span>`;
            }
        } else {
            elValidade.innerText = "Indefinida";
        }
    }

    // --- PREMISSAS TÉCNICAS ---
    setText('view_consumo', (premissas.consumo || projeto?.consumo || 0) + ' kWh');
    setText('view_hsp', (premissas.hsp || 0).toFixed(2));
    setText('view_tipo_rede', (premissas.tipoRede || projeto?.tipoLigacao) === 'monofasico' ? 'Monofásico' : 'Trifásico');
    setText('view_estrutura', projeto?.tipoTelhado || 'Não Informado');
    
    // Geometria (Trata modo composto ou simples)
    const elGeo = document.getElementById('view_geometria');
    if (elGeo) {
        if (premissas.modoOrientacao === 'composto' && premissas.orientacoes) {
            // Renderização Detalhada de Multi-String
            let htmlGeo = '<div style="display:flex; flex-direction:column; gap:4px;">';
            htmlGeo += '<span style="font-size:0.8rem; font-weight:bold; color:var(--primaria);">Múltiplas Águas (Multi-String)</span>';
            
            premissas.orientacoes.forEach((or, idx) => {
                htmlGeo += `
                    <div style="font-size:0.75rem; color:#475569; background:#f1f5f9; padding:2px 6px; border-radius:4px; display:flex; justify-content:space-between;">
                        <span><strong>${or.perc}%</strong> Pot.</span>
                        <span>Az: <strong>${or.az}°</strong></span>
                        <span>Inc: <strong>${or.inc}°</strong></span>
                    </div>
                `;
            });
            htmlGeo += '</div>';
            elGeo.innerHTML = htmlGeo;
        } else {
            // Modo Simples
            elGeo.innerHTML = `<span style="font-size:1.1rem; font-weight:600; color:var(--texto-header);">${premissas.azimute || 0}° (N) / ${premissas.inclinacao || 0}° (Inc)</span>`;
        }
    }
    
    setText('view_pr', ((premissas.pr || 0.80) * 100).toFixed(2) + "%");
    
    // Potência Necessária: Usa o valor salvo ou recalcula estimativa se ausente
    const kwpNecessario = premissas.kwpNecessario || (premissas.consumo / ((premissas.hsp || 5) * 30.4 * (premissas.pr || 0.80))) || 0;
    setText('view_kwp_calculado', kwpNecessario.toFixed(2) + " kWp");

    // --- DETALHAMENTO DE PERDAS (Novo) ---
    const containerPerdas = document.getElementById('container_detalhes_perdas');
    if (containerPerdas && premissas.perdas) {
        containerPerdas.style.display = 'block';
        const p = premissas.perdas;
        
        // Função auxiliar para formatar percentual
        const fmtPerc = (val) => (parseFloat(val) || 0).toFixed(2) + '%';

        containerPerdas.innerHTML = `
            <p class="info-label" style="margin-bottom: 8px;"><i class="fas fa-chart-pie"></i> Detalhamento de Perdas (Memória de Cálculo)</p>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; font-size: 0.85rem; color: #475569;">
                <div style="background: #f8fafc; padding: 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
                    <span style="display:block; font-size:0.7rem; color:#94a3b8;">Eficiência Inv.</span> <strong>${fmtPerc(p.eficiencia)}</strong>
                </div>
                <div style="background: #f8fafc; padding: 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
                    <span style="display:block; font-size:0.7rem; color:#94a3b8;">Temp. Módulos</span> <strong>${fmtPerc(p.tempMod)}</strong>
                </div>
                <div style="background: #f8fafc; padding: 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
                    <span style="display:block; font-size:0.7rem; color:#94a3b8;">Cabos CC/CA</span> <strong>${fmtPerc(p.cabos)}</strong>
                </div>
                <div style="background: #f8fafc; padding: 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
                    <span style="display:block; font-size:0.7rem; color:#94a3b8;">Sujidade/Outros</span> <strong>${fmtPerc(p.extras)}</strong>
                </div>
                <div style="background: #f8fafc; padding: 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
                    <span style="display:block; font-size:0.7rem; color:#94a3b8;">Indisponibilidade</span> <strong>${fmtPerc(p.indisp)}</strong>
                </div>
            </div>
        `;
    }

    // --- EQUIPAMENTOS (Módulos) ---
    const mod = dadosTecnicos.modulo || {};
    setText('view_modelo_modulo', mod.watts ? `Módulo ${mod.watts}W` : '---');
    setText('view_qtd_modulo', mod.qtd || 0);
    
    const potTotalCalculada = (mod.watts && mod.qtd) ? (mod.watts * mod.qtd / 1000) : 0;
    setText('view_potencia_total', (resPrm.potenciaTotal || resStd.potenciaTotal || potTotalCalculada).toFixed(2));

    // --- INVERSORES ---
    const containerInv = document.getElementById('container_inversores_view');
    const inversores = dadosTecnicos.inversores || [];

    // Potência Nominal Inversores (AC)
    const potInversoresAC = inversores.reduce((acc, i) => acc + (i.nominal * i.qtd), 0) / 1000;
    setText('view_potencia_inversores', potInversoresAC.toFixed(2) + " kW");
    
    // Carga Efetiva (Movido para seção de Inversores)
    setText('view_carga_efetiva', (premissas.cargaEfetiva || 0).toFixed(1) + "%");
    
    if (containerInv && inversores.length > 0) {
        let totalMppts = 0;

        containerInv.innerHTML = inversores.map(inv => {
            // Recupera MPPT (salvo ou do catálogo para retrocompatibilidade)
            let mppt = inv.mppt;
            if (!mppt) {
                const catalogoInversores = obterInversoresHuawei();
                const itemCatalogo = catalogoInversores.find(c => c.mod === inv.modelo);
                mppt = itemCatalogo ? itemCatalogo.mppt : 0;
            }
            totalMppts += (mppt * inv.qtd);

            return `
            <div style="margin-bottom: 8px; padding: 10px; background: #f1f5f9; border-radius: 6px; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-check-circle" style="color: var(--primaria)"></i> 
                <div style="flex: 1;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong style="color: #334155;">${inv.modelo}</strong>
                        <span style="color: #64748b; font-size: 0.9rem;">${inv.qtd}x</span>
                    </div>
                    <div style="font-size: 0.8rem; color: #64748b; margin-top: 2px; display: flex; gap: 10px;">
                        <span>Nominal: <strong>${(inv.nominal/1000).toFixed(1)} kW</strong></span>
                        <span>MPPTs: <strong>${mppt}</strong></span>
                    </div>
                </div>
            </div>
        `}).join('');

        // Adiciona Totalizador de MPPTs
        containerInv.innerHTML += `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; font-size: 0.85rem; color: #475569;">
                <span>Total MPPTs do Sistema:</span>
                <strong style="color: #0f172a;">${totalMppts}</strong>
            </div>
        `;
    } else if (containerInv) {
        containerInv.innerHTML = '<p style="color: #94a3b8;">Nenhum inversor registrado.</p>';
    }

    // --- EXPANSÃO E GERAÇÃO FUTURA ---
    const geracaoAtual = parseFloat(proposta.geracaoMensal) || 0;
    const geracaoMax = parseFloat(proposta.geracaoExpansao) || geracaoAtual;
    
    setText('view_geracao_atual', Math.round(geracaoAtual) + ' kWh');

    // Calcula módulos extras baseados na diferença de geração (estimativa reversa simples ou dados salvos se houver)
    // Prioriza o dado salvo nas premissas (mais preciso), senão usa estimativa
    let modulosExtras = premissas.qtdModulosExpansao;
    if (modulosExtras === undefined) {
        const wattsMod = mod.watts || 550;
        const deltaGeracao = Math.max(0, geracaoMax - geracaoAtual);
        modulosExtras = (geracaoAtual > 0 && mod.qtd > 0) ? Math.floor(deltaGeracao / (geracaoAtual / mod.qtd)) : 0;
    }
    
    // Atualiza geração máxima somando a expansão salva (se houver) ou usando o total salvo
    const geracaoExpansaoSalva = premissas.geracaoExpansao || (geracaoMax - geracaoAtual);
    setText('view_geracao_max', Math.round(geracaoAtual + geracaoExpansaoSalva) + ' kWh');
    
    setText('view_capacidade_extra', `+${modulosExtras} módulos`);

    // --- FINANCEIRO ---
    const containerFinanceiro = document.getElementById('container_financeiro_comparativo');
    if (containerFinanceiro) {
        
        const renderCardFinanceiro = (tipo, dados) => {
            if (!dados || !dados.valorTotal) return '';
            
            const isPremium = tipo === 'Premium';
            const corBorda = isPremium ? '#fcd34d' : '#e2e8f0';
            const bgHeader = isPremium ? '#fffbeb' : '#f8fafc';
            const corIcone = isPremium ? '#b45309' : '#475569';
            const icone = isPremium ? 'fa-crown' : 'fa-bolt';
            const badgeRecomendado = isPremium ? '<div style="position: absolute; top: -10px; right: 10px; background: #fcd34d; color: #92400e; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 4px;">RECOMENDADO</div>' : '';

            // Função auxiliar para linha financeira (mesmo estilo do gerador)
            const linha = (label, valor, destaque = false, suffix = '') => {
                const moeda = fmtMoney(valor);
                const styleLabel = destaque ? 'font-weight: 700; color: #0f172a;' : 'color: #334155;';
                const styleValor = destaque ? 'font-weight: 700; color: #0f172a;' : 'font-weight: 600; color: #0f172a;';
                
                // Percentuais (se disponíveis os dados base)
                let htmlPerc = '';
                if (dados.precoVendaServico && dados.valorTotal) {
                    const percServico = dados.precoVendaServico > 0 ? ((valor / dados.precoVendaServico) * 100).toFixed(1) : '0.0';
                    const percTotal = dados.valorTotal > 0 ? ((valor / dados.valorTotal) * 100).toFixed(1) : '0.0';
                    
                    // Só mostra percentual se não for o valor total ou kit (que distorcem a base de serviço)
                    if (!destaque && label !== 'Kit Gerador') {
                         htmlPerc = `
                            <span style="font-size: 0.7rem; color: #64748b; background: #f1f5f9; padding: 1px 4px; border-radius: 4px; margin-left: 6px;" title="% sobre Serviço">${percServico}% Srv</span>
                            <span style="font-size: 0.7rem; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; padding: 0px 4px; border-radius: 4px; margin-left: 4px;" title="% sobre Total">${percTotal}% Tot</span>
                        `;
                    }
                }

                return `
                    <div class="linha-custo" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <div style="display: flex; align-items: center;">
                            <span style="${styleLabel}">${label}</span>
                            ${suffix}
                            ${htmlPerc}
                        </div>
                        <span style="${styleValor}">${moeda}</span>
                    </div>
                `;
            };

            return `
                <div class="card-fin-coluna" style="background: #fff; border: 1px solid ${corBorda}; border-radius: 8px; padding: 15px; position: relative;">
                    ${badgeRecomendado}
                    <h4 style="color: ${corIcone}; border-bottom: 2px solid ${corBorda}; padding-bottom: 8px; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas ${icone}"></i> Configuração ${tipo}
                    </h4>
                    
                    <div class="painel-detalhamento-cascata" style="margin-top: 15px; background: ${bgHeader}; padding: 10px; border-radius: 6px;">
                        ${linha('Kit Gerador', dados.valorKit, true)}
                        ${linha('Materiais de Inst:', dados.custoMateriais)}
                        ${linha('M.O.:', dados.custoMO, false, `<span style="font-size: 0.85em; color: #94a3b8; font-weight: normal; margin-left: 5px;">(${dados.diasObra || 0}d)</span>`)}
                        ${linha('Logística:', dados.custoLogistica)}
                        
                        ${dados.comissao > 0 ? linha('Comissão:', dados.comissao) : ''}

                        <hr style="margin: 10px 0; border-color: #e2e8f0;">
                        ${linha('Lucro:', dados.lucroReal, true)}
                        ${linha('Imposto:', dados.impostoReal, true)}
                        <hr style="margin: 10px 0; border-color: #e2e8f0;">
                        ${linha('Serviço:', dados.precoVendaServico, true)}

                        <div class="total-geral-proposta" style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 2px solid #e2e8f0;">
                            <span style="font-weight: 800; color: #0f172a; font-size: 1.1rem;">Total Proposta:</span>
                            <strong style="font-weight: 800; color: #16a34a; font-size: 1.2rem;">${fmtMoney(dados.valorTotal)}</strong>
                        </div>
                    </div>
                </div>
            `;
        };

        containerFinanceiro.innerHTML = `
            <div class="grid-financeiro-comparativo" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                ${renderCardFinanceiro('Standard', resStd)}
                ${renderCardFinanceiro('Premium', resPrm)}
            </div>
        `;

        // Exibe Análise de Viabilidade se disponível
        if (proposta.analiseFinanceira) {
            const af = proposta.analiseFinanceira;
            const containerViabilidade = document.createElement('div');
            containerViabilidade.className = 'card-tecnico';
            containerViabilidade.style.marginTop = '20px';
            containerViabilidade.innerHTML = `
                <div class="secao-header"><i class="fas fa-chart-line"></i> <span>Análise de Viabilidade Econômica</span></div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: center;">
                    <div>
                        <h5 style="color:#475569; margin-bottom:5px;">Standard</h5>
                        <p>Payback: <strong>${af.standard?.paybackSimples || '-'} anos</strong> <small style="color:#94a3b8;">(${af.standard?.paybackDescontado} desc.)</small><br>VPL: <strong>${(af.standard?.vpl || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</strong></p>
                    </div>
                    <div style="border-left: 1px solid #e2e8f0;">
                        <h5 style="color:#166534; margin-bottom:5px;">Premium</h5>
                        <p>Payback: <strong>${af.premium?.paybackSimples || '-'} anos</strong> <small style="color:#94a3b8;">(${af.premium?.paybackDescontado} desc.)</small><br>VPL: <strong>${(af.premium?.vpl || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</strong></p>
                    </div>
                </div>
            `;
            containerFinanceiro.parentNode.insertBefore(containerViabilidade, containerFinanceiro.nextSibling);

            // --- DEMONSTRATIVO DETALHADO E COMPARATIVO DE FATURA ---
            const containerDemo = document.getElementById('container_demonstrativo_financeiro');
            if (containerDemo) {
                // Recalcula estimativa de fatura baseada nos dados salvos
                // Usa os dados detalhados salvos na análise financeira (Premium)
                const detalhes = af.premium?.detalhes || {};
                const fluxo = af.premium?.fluxoDeCaixa || [];
                
                // Usa os valores mensais do Ano 1 para o comparativo visual
                const faturaSemSolar = (detalhes.faturaSemSolarAno1 || 0);
                const faturaComSolar = (detalhes.faturaComSolarAno1 || 0);
                
                const tarifaCheia = (projeto.tarifaGrupoB && projeto.tarifaGrupoB > 0)
                    ? projeto.tarifaGrupoB
                    : (premissas.viabilidade?.tarifaGrupoB || 0);

                containerDemo.innerHTML = `
                    <section class="card-tecnico">
                        <div class="secao-header"><i class="fas fa-file-invoice-dollar"></i> <span>Demonstrativo de Economia e Fatura</span></div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 20px;">
                            <div style="background: #fff1f2; padding: 15px; border-radius: 8px; border: 1px solid #fecdd3;">
                                <h5 style="margin:0 0 10px 0; color:#9f1239;">Fatura Atual (Média Ano 1)</h5>
                                <div style="font-size: 1.5rem; font-weight: 800; color: #be123c;">${fmtMoney(faturaSemSolar)}</div>
                                <small style="color: #881337;">Considerando Inflação Energética</small>
                            </div>
                            <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border: 1px solid #bbf7d0;">
                                <h5 style="margin:0 0 10px 0; color:#166534;">Nova Fatura (Média Ano 1)</h5>
                                <div style="font-size: 1.5rem; font-weight: 800; color: #15803d;">${fmtMoney(faturaComSolar)}</div>
                                <small style="color: #14532d;">Considerando Lei 14.300 (Fio B/Mínimo)</small>
                            </div>
                        </div>

                        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                            <h5 style="margin:0 0 10px 0; color:#334155;">Parâmetros de Cálculo (Transparência)</h5>
                            <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 0.9rem; display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                                <li><strong>Tarifa Grupo B:</strong> ${tarifaCheia.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4})}/kWh</li>
                                <li><strong>Impostos:</strong> ${(premissas.viabilidade?.impostosPerc || premissasGlobais.viabilidade?.impostosPerc || 0)}%</li>
                                <li><strong>Ilum. Pública:</strong> ${projeto.iluminacaoPublica || 0}%</li>
                                <li><strong>Inflação Energética:</strong> ${(premissas.viabilidade?.inflacaoEnergetica || premissasGlobais.viabilidade?.inflacaoEnergetica || 7)}% a.a.</li>
                                <li><strong>Simultaneidade:</strong> ${(premissas.viabilidade?.simultaneidade || premissasGlobais.viabilidade?.simultaneidade || 30)}%</li>
                                <li><strong>Manutenção Prev.:</strong> ${(premissas.viabilidade?.custoLimpezaAnual || premissasGlobais.viabilidade?.custoLimpezaAnual || 0)}% (Capex)</li>
                                <li><strong>Degradação Sistêmica:</strong> ${(premissas.viabilidade?.degradacaoAnual || premissasGlobais.viabilidade?.degradacaoAnual || 0.8)}% a.a.</li>
                            </ul>
                        </div>

                        <div style="margin-top: 20px;">
                            <h5 style="color: #334155; margin-bottom: 10px;"><i class="fas fa-table"></i> Fluxo de Caixa Detalhado (25 Anos)</h5>
                            <div class="tabela-scroll-engenharia" style="max-height: 300px;">
                                <table class="tabela-tecnica" style="font-size: 0.8rem;">
                                    <thead>
                                        <tr>
                                            <th>Ano</th>
                                            <th>Geração (kWh)</th>
                                            <th>Fatura Sem Solar</th>
                                            <th>Economia Líquida</th>
                                            <th>Fluxo Acumulado (Desc.)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${fluxo.map(row => {
                                            let style = '';
                                            let aviso = '';
                                            if (row.ano === 0) style = 'background:#fef2f2;';
                                            else if (row.acumuladoDesc > 0 && fluxo[row.ano-1]?.acumuladoDesc < 0) style = 'background:#dcfce7; font-weight:bold;';
                                            else if (row.isTrocaInversor) {
                                                style = 'background:#fff7ed; border-left: 3px solid #f59e0b;';
                                                aviso = `<i class="fas fa-tools" style="color:#f59e0b; margin-left:5px; cursor:help;" title="Substituição de Inversor (Despesa: ${fmtMoney(row.despesa)})"></i>`;
                                            }
                                            return `
                                            <tr style="${style}">
                                                <td>${row.ano} ${aviso}</td>
                                                <td>${Math.round(row.geracao)}</td>
                                                <td>${fmtMoney(row.faturaSemSolar)}</td>
                                                <td>${fmtMoney(row.faturaComSolar)}</td>
                                                <td style="color:${row.fluxoLiquido > 0 ? '#16a34a' : '#dc2626'}">${fmtMoney(row.fluxoLiquido)}</td>
                                                <td style="color:${row.acumuladoDesc > 0 ? '#16a34a' : '#dc2626'}">${fmtMoney(row.acumuladoDesc)}</td>
                                            </tr>
                                        `}).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                `;
            }
        }

        // --- TRAVA DE SEGURANÇA VISUAL ---
        // Se a proposta já foi vendida, remove botões de edição da tela de visualização
        if (proposta.status === 'VENDIDA') {
            const editBtns = document.querySelectorAll('[onclick*="acionarEdicao"], #btn_editar_proposta, .btn-editar-flutuante');
            editBtns.forEach(btn => btn.style.display = 'none');
        }
    }
}

// ======================================================================
// 🛡️ GESTÃO DE DISPOSITIVOS (SEGURANÇA)
// ======================================================================

function renderizarGestaoDispositivos(propostaId, dadosProposta) {
    // Cria o container se não existir (insere antes do rodapé ou no final)
    let container = document.getElementById('container-seguranca-dispositivos');
    if (!container) {
        container = document.createElement('div');
        container.id = 'container-seguranca-dispositivos';
        container.className = 'container-principal'; // Usa classe de layout padrão
        container.style.marginTop = '20px';
        document.body.appendChild(container);
    }

    const dispositivos = dadosProposta.dispositivos_autorizados || [];

    container.innerHTML = `
        <div class="card-tecnico card-seguranca">
            <div class="secao-header" style="justify-content: space-between;">
                <div><i class="fas fa-shield-alt"></i> <span>Controle de Acessos à Proposta</span></div>
                <small style="color: #64748b;">${dispositivos.length} registro(s)</small>
            </div>
            <div class="lista-dispositivos">
                ${dispositivos.length === 0 ? '<p style="padding:15px; color:#94a3b8; text-align:center;">Nenhum acesso registrado ainda.</p>' : 
                dispositivos.map(d => `
                    <div class="dispositivo-item ${d.status}">
                        <div class="info">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <strong style="color:#1e293b;">${d.dispositivo || 'Dispositivo Desconhecido'}</strong>
                                <span class="badge-status status-${d.status}">${d.status}</span>
                            </div>
                            <small style="color:#64748b; display:block; margin-top:4px;">
                                <i class="fas fa-map-marker-alt"></i> ${d.local || 'Local N/A'} • 
                                <i class="far fa-clock"></i> ${new Date(d.data).toLocaleString()}
                            </small>
                        </div>
                        <div class="acoes" style="display:flex; gap:5px;">
                            ${d.status === 'pendente' || d.status === 'bloqueado'
                                ? `<button class="btn-acao btn-autorizar" onclick="window.alterarAcesso('${propostaId}', '${d.hash}', 'dono')"><i class="fas fa-check"></i> Autorizar</button>`
                                : `<button class="btn-acao btn-bloquear" onclick="window.alterarAcesso('${propostaId}', '${d.hash}', 'bloqueado')"><i class="fas fa-ban"></i> Bloquear</button>`
                            }
                            <button class="btn-acao" onclick="window.removerDispositivo('${propostaId}', '${d.hash}')" title="Remover Registro (Resetar)" style="background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Função Global de Ação
window.alterarAcesso = async (propostaId, hash, novoStatus) => {
    const acao = novoStatus === 'dono' ? 'AUTORIZAR' : 'BLOQUEAR';
    if (!(await customConfirm(`Deseja realmente <strong>${acao}</strong> este dispositivo?`, "Controle de Acesso", novoStatus === 'dono' ? 'sucesso' : 'perigo'))) return;

    mostrarLoadingOverlay();
    try {
        const response = await fetch(`${WORKER_URL}/erp/propostas/${propostaId}/alterar-status-dispositivo`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hash, novoStatus })
        });

        if (response.ok) {
            // Sincroniza o banco local do ERP para refletir a mudança
            await db.sincronizarTudo();
            location.reload(); 
        } else {
            customAlert("Erro ao atualizar status.", "Erro", "erro");
        }
    } catch (error) {
        console.error("Erro na requisição:", error);
        customAlert("Erro de conexão.", "Erro", "erro");
    } finally {
        esconderLoadingOverlay();
    }
};

// Função Global para Remover Dispositivo (Reset de Acesso)
window.removerDispositivo = async (propostaId, hash) => {
    if (!(await customConfirm("Deseja remover este dispositivo da lista?<br><br>Isso liberará a vaga de 'Dono' para o próximo aparelho que acessar o link (útil para testes).", "Remover Acesso", "perigo"))) return;

    mostrarLoadingOverlay();
    try {
        const proposta = db.buscarPorId('propostas', propostaId);
        if (!proposta) throw new Error("Proposta não encontrada.");

        const novaLista = (proposta.dispositivos_autorizados || []).filter(d => d.hash !== hash);

        await db.atualizar('propostas', propostaId, { dispositivos_autorizados: novaLista });
        
        window.location.reload();
    } catch (error) {
        console.error("Erro ao remover dispositivo:", error);
        customAlert("Erro ao atualizar registro.", "Erro", "erro");
    } finally {
        esconderLoadingOverlay();
    }
};

// Função de Ponte para o Gerador (Edição)
window.acionarEdicao = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const propostaId = urlParams.get('id') || sessionStorage.getItem('proposta_ativa_id');
    
    if (propostaId) {
        const proposta = db.buscarPorId('propostas', propostaId);
        sessionStorage.setItem('cliente_ativo_id', proposta.clienteId);
        sessionStorage.setItem('projeto_ativo_id', proposta.projetoId);
        sessionStorage.setItem('proposta_ativa_id', propostaId);
        sessionStorage.setItem('url_origem_gerador', window.location.href); // Salva origem
        window.location.href = 'gerador-proposta.html';
    }
};