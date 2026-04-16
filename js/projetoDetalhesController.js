import db from './databaseService.js';
import { obterBadgeStatusProposta, formatarMoeda, mostrarLoadingOverlay, esconderLoadingOverlay, customAlert, customConfirm, customPrompt, abrirPropostaParaEdicao } from './utils.js';

// Trava de Segurança
if (!sessionStorage.getItem('auth_belenergy')) {
    window.location.href = 'central-belenergy.html';
}

let projetoId; // Armazena o ID do projeto para uso nas funções de ação

document.addEventListener('DOMContentLoaded', async () => {
    // Sincronização Inicial com D1
    mostrarLoadingOverlay();
    await db.sincronizarTudo();
    esconderLoadingOverlay();

    const urlParams = new URLSearchParams(window.location.search);
    projetoId = urlParams.get('id');

    if (!projetoId) {
        await customAlert("ID do projeto não encontrado na URL.", "Erro", "erro");
        window.location.href = 'dashboard-admin.html';
        return;
    }

    carregarDetalhesProjeto(projetoId);
});

function carregarDetalhesProjeto(id) {
    const projeto = db.buscarPorId('projetos', id);
    if (!projeto) {
        // O alert aqui é redundante se o redirecionamento for rápido, mas mantemos por segurança
        window.location.href = 'dashboard-admin.html';
        return;
    }

    const cliente = db.buscarPorId('clientes', projeto.clienteId);
    if (!cliente) {
        customAlert("Cliente associado ao projeto não encontrado.", "Erro", "erro");
        window.location.href = 'dashboard-admin.html';
        return;
    }

    // Preenche os detalhes do projeto
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

    // --- FIX: Injeta campo de Consumo se não existir no HTML ---
    if (!document.getElementById('detalhe_consumo')) {
        const ref = document.getElementById('detalhe_concessionaria') || document.getElementById('detalhe_estrutura');
        if (ref) {
            // Tenta encontrar o container do grupo (geralmente o pai imediato)
            const container = ref.parentElement; 
            if (container && container.parentElement) {
                const novo = container.cloneNode(true);
                
                const lbl = novo.querySelector('label');
                if (lbl) lbl.innerText = "Consumo Médio (UC)";
                
                const inp = novo.querySelector('input, select');
                if (inp) {
                    if (inp.tagName === 'SELECT') {
                        // Se clonou um select, troca por input text readonly
                        const textInput = document.createElement('input');
                        textInput.type = 'text';
                        textInput.className = inp.className;
                        textInput.readOnly = true;
                        inp.replaceWith(textInput);
                        textInput.id = 'detalhe_consumo';
                    } else {
                        inp.id = 'detalhe_consumo';
                        inp.value = '';
                    }
                }
                container.parentElement.insertBefore(novo, container.nextSibling);
            }
        }
    }

    setVal('detalhe_nome_projeto', projeto.nome_projeto);
    setVal('detalhe_id_projeto', projeto.id);
    
    // Transforma o input de cliente em um grupo com botão de link
    const inputCliente = document.getElementById('detalhe_cliente_nome');
    if (inputCliente && !inputCliente.parentElement.querySelector('.btn-link-cliente')) {
        const btnLink = document.createElement('button');
        btnLink.className = 'btn-icon-sm btn-link-cliente';
        btnLink.innerHTML = '<i class="fas fa-external-link-alt"></i>';
        btnLink.title = "Ver cadastro do cliente";
        btnLink.style.cssText = "position: absolute; right: 5px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--primaria);";
        btnLink.onclick = () => {
            sessionStorage.setItem('origem_voltar', 'projeto_detalhes'); // Define origem para voltar pra cá
            sessionStorage.setItem('cliente_id_visualizacao', cliente.id);
            window.location.href = 'cadastro-cliente.html';
        };
        
        // Ajusta o container para posicionamento relativo
        inputCliente.parentElement.style.position = 'relative';
        inputCliente.parentElement.appendChild(btnLink);
        inputCliente.style.paddingRight = '30px'; // Espaço para o ícone
    }
    setVal('detalhe_cliente_nome', cliente.nome);

    setVal('detalhe_localizacao', `${projeto.cidade} / ${projeto.uf}`);
    setVal('detalhe_concessionaria', projeto.concessionaria);
    setVal('detalhe_estrutura', projeto.tipoTelhado);
    setVal('detalhe_consumo', (projeto.consumo || 0) + ' kWh');
    
    const origemMap = {
        'nenhum': 'Venda Direta',
        'venda_direta': 'Venda Direta',
        'indicador': 'Indicação',
        'representante': 'Representante'
    };
    setVal('detalhe_origem', origemMap[projeto.origemVenda] || 'Venda Direta');

    // --- DADOS TARIFÁRIOS (NOVO) ---
    // Injeta container se não existir
    if (!document.getElementById('detalhe_tarifas_container')) {
        const gridForm = document.querySelector('.grid-form');
        const divTarifas = document.createElement('div');
        divTarifas.id = 'detalhe_tarifas_container';
        divTarifas.className = 'form-group col-12';
        divTarifas.style.marginTop = '15px';
        divTarifas.style.borderTop = '1px solid #e2e8f0';
        divTarifas.style.paddingTop = '15px';
        
        const fmt = (v) => (v||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        
        divTarifas.innerHTML = `
            <h4 style="color: var(--primaria); font-size: 0.9rem; margin-bottom: 10px;"><i class="fas fa-receipt"></i> Dados Tarifários Cadastrados</h4>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 0.9rem; color: #334155;">
                <div style="background: #f8fafc; padding: 8px; border-radius: 4px;">Tarifa Cheia: <strong>${fmt(projeto.tarifaGrupoB)}</strong></div>
                <div style="background: #f8fafc; padding: 8px; border-radius: 4px;">CIP: <strong>${projeto.iluminacaoPublica || 0}%</strong></div>
            </div>
        `;
        gridForm.appendChild(divTarifas);
    }

    // --- INJEÇÃO DO BOTÃO EDITAR E PADRONIZAÇÃO DE AÇÕES ---
    const headerModulo = document.querySelector('.header-modulo');
    if (headerModulo) {
        // 1. Garante que existe um container para as ações
        let actionsContainer = headerModulo.querySelector('.header-actions');
        if (!actionsContainer) {
            actionsContainer = document.createElement('div');
            actionsContainer.className = 'header-actions';
            actionsContainer.style.cssText = 'display: flex; gap: 10px; align-items: center;';
            
            // Cria o botão Voltar padronizado
            const btnVoltar = document.createElement('button');
            btnVoltar.className = 'btn-secundario';
            btnVoltar.innerHTML = '<i class="fas fa-arrow-left"></i> Voltar para Lista';
            btnVoltar.onclick = window.voltar;
            actionsContainer.appendChild(btnVoltar);
            
            // Limpa botões antigos soltos no header (se houver)
            const oldButtons = headerModulo.querySelectorAll('button');
            oldButtons.forEach(b => b.remove());

            headerModulo.appendChild(actionsContainer);
        }

        // 2. Injeta o botão de Editar se não existir
        if (!document.getElementById('btn-editar-projeto-view')) {
            const btnEdit = document.createElement('button');
            btnEdit.id = 'btn-editar-projeto-view';
            btnEdit.className = 'btn-primary';
            btnEdit.innerHTML = '<i class="fas fa-pencil-alt"></i> Editar Projeto';
            btnEdit.onclick = window.editarProjetoAtual;
            
            // Adiciona ao container de ações
            actionsContainer.appendChild(btnEdit);
        }
    }

    // --- RENDERIZAÇÃO CONDICIONAL (ABAS) ---
    // Se o projeto estiver vendido, mostra as abas de gestão
    if (projeto.status === 'VENDIDO' || projeto.status === 'FINALIZADO') {
        renderizarAbasGestao(projeto);
        return; // O renderizarAbasGestao cuidará do resto
    }

    // Carrega a lista de propostas associadas
    carregarPropostasDoProjeto(id);
}

// --- NOVO: SISTEMA DE ABAS PARA PROJETOS VENDIDOS ---
function renderizarAbasGestao(projeto) {
    const containerPrincipal = document.querySelector('.card-tecnico'); // Onde está a lista de propostas hoje
    
    // Cria estrutura de abas se não existir
    if (!document.getElementById('nav_abas_projeto')) {
        const nav = document.createElement('div');
        nav.id = 'nav_abas_projeto';
        nav.className = 'nav-abas';
        nav.innerHTML = `
            <button class="aba-item active" onclick="window.trocarAbaProjeto('execucao')"><i class="fas fa-hard-hat"></i> Gestão de Obra</button>
            <button class="aba-item" onclick="window.trocarAbaProjeto('propostas')"><i class="fas fa-file-contract"></i> Comercial</button>
        `;
        
        // Insere antes do container principal
        containerPrincipal.parentNode.insertBefore(nav, containerPrincipal);
        
        // Adiciona estilos inline para as abas (ou mover para CSS)
        nav.style.cssText = "display: flex; gap: 10px; margin-bottom: 15px; border-bottom: 2px solid #e2e8f0;";
        const style = document.createElement('style');
        style.innerHTML = `
            .aba-item { background: none; border: none; padding: 10px 20px; cursor: pointer; font-weight: 600; color: #64748b; border-bottom: 3px solid transparent; transition: all 0.2s; }
            .aba-item:hover { color: var(--primaria); }
            .aba-item.active { color: var(--primaria); border-bottom-color: var(--primaria); }
            .conteudo-aba { display: none; animation: fadeIn 0.3s; }
            .conteudo-aba.active { display: block; }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `;
        document.head.appendChild(style);
    }

    // Reestrutura o conteúdo existente para ser a aba "Propostas"
    let abaPropostas = document.getElementById('aba_propostas');
    if (!abaPropostas) {
        // Envolve a tabela atual em uma div de aba
        const tabelaAtual = document.getElementById('corpo_lista_propostas').closest('table');
        const wrapperTabela = tabelaAtual.parentElement; // .tabela-scroll ou similar
        
        abaPropostas = document.createElement('div');
        abaPropostas.id = 'aba_propostas';
        abaPropostas.className = 'conteudo-aba';
        
        // Move o conteúdo original para dentro da aba
        // Nota: Precisamos mover os botões de ação também se houver
        wrapperTabela.parentNode.insertBefore(abaPropostas, wrapperTabela);
        abaPropostas.appendChild(wrapperTabela);
    }

    // Cria a aba "Execução"
    let abaExecucao = document.getElementById('aba_execucao');
    if (!abaExecucao) {
        abaExecucao = document.createElement('div');
        abaExecucao.id = 'aba_execucao';
        abaExecucao.className = 'conteudo-aba active'; // Começa ativa
        abaPropostas.classList.remove('active'); // Esconde a outra
        
        abaPropostas.parentNode.insertBefore(abaExecucao, abaPropostas);
    }

    renderizarPainelExecucao(projeto, abaExecucao);
    
    // Carrega as propostas para a aba comercial (sem recarregar o cabeçalho)
    carregarPropostasDoProjeto(projeto.id);
}

window.trocarAbaProjeto = function(aba) {
    document.querySelectorAll('.aba-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.conteudo-aba').forEach(c => c.classList.remove('active'));
    
    const btn = document.querySelector(`[onclick="window.trocarAbaProjeto('${aba}')"]`);
    const content = document.getElementById(`aba_${aba}`);
    
    if (btn) btn.classList.add('active');
    if (content) content.classList.add('active');
};

function renderizarPainelExecucao(projeto, container) {
    const exec = projeto.execucao || {};
    const checklist = exec.checklist || {};
    const financeiro = exec.financeiroReal || { receitas: [], despesas: [] };
    
    // Busca a proposta vendida para referência de orçamento
    const propostas = db.buscarPorRelacao('propostas', 'projetoId', projeto.id);
    const propVendida = propostas.find(p => p.status === 'VENDIDA');
    const orcamento = propVendida ? propVendida.versoes[propVendida.detalhesVenda.versaoVendida].resumoFinanceiro : {};

    // Cálculos em Tempo Real
    const totalDespesas = financeiro.despesas.reduce((acc, d) => acc + d.valor, 0);
    const lucroRealAtual = (orcamento.precoVendaServico || 0) - totalDespesas;
    
    // Status Visual
    const getCheck = (key) => checklist[key] ? 'checked' : '';
    const getDisabled = projeto.status === 'FINALIZADO' ? 'disabled' : '';

    // Helper para renderizar item do checklist com estilo
    const renderCheck = (key, label) => {
        const isChecked = checklist[key];
        const styleBg = isChecked ? 'background-color: #f0fdf4; border-color: #bbf7d0;' : 'background-color: #fff; border-color: #e2e8f0;';
        const styleText = isChecked ? 'color: #166534; font-weight: 600;' : 'color: #475569;';
        const iconCheck = isChecked ? '<i class="fas fa-check-circle" style="color: #16a34a;"></i>' : '<i class="far fa-circle" style="color: #cbd5e1;"></i>';
        
        return `
        <label style="display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid; border-radius: 8px; cursor: pointer; transition: all 0.2s; ${styleBg}">
            <input type="checkbox" style="display: none;" ${isChecked ? 'checked' : ''} ${getDisabled} onchange="window.atualizarChecklist('${projeto.id}', '${key}', this.checked)">
            <div style="font-size: 1.2rem;">${iconCheck}</div>
            <div style="display: flex; flex-direction: column;">
                <span style="font-size: 0.9rem; ${styleText}">${label}</span>
            </div>
        </label>`;
    };

    container.innerHTML = `
        <div style="display: grid; grid-template-columns: 320px 1fr; gap: 25px; margin-top: 20px; align-items: start;">
            
            <!-- COLUNA 1: CHECKLIST E STATUS (DESIGN RENOVADO) -->
            <div style="background: #fff; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #f1f5f9;">
                    <div style="background: #eff6ff; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-tasks" style="color: var(--primaria); font-size: 1.1rem;"></i>
                    </div>
                    <h4 style="color: #1e293b; margin: 0; font-size: 1rem; font-weight: 600;">Marcos da Obra</h4>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    ${renderCheck('visitaTecnica', 'Visita Técnica Realizada')}
                    ${renderCheck('projetoElaborado', 'Projeto de Engenharia Elaborado')}
                    ${renderCheck('acessoSolicitado', 'Solicitação de Acesso (Protocolo)')}
                    ${renderCheck('parecerAcesso', 'Parecer de Acesso Emitido')}
                    ${renderCheck('pedidoCompra', 'Pedido de Compra do Kit')}
                    ${renderCheck('pagamentoKit', 'Pagamento do Kit Confirmado')}
                    ${renderCheck('kitExpedido', 'Kit Expedido')}
                    ${renderCheck('kitEntregue', 'Kit Entregue na Obra')}
                    ${renderCheck('instalacaoAgendada', 'Instalação Iniciada')}
                    ${renderCheck('vistoriaSolicitada', 'Vistoria Solicitada')}
                    ${renderCheck('vistoriaAprovada', 'Vistoria Aprovada')}
                </div>

                <div style="margin-top: 25px; padding-top: 20px; border-top: 1px dashed #cbd5e1;">
                    ${projeto.status === 'FINALIZADO' 
                        ? `<div class="alerta-sucesso" style="text-align:center; padding: 15px; border-radius: 8px; background: #ecfdf5; border: 1px solid #a7f3d0;">
                                <i class="fas fa-check-circle" style="font-size: 1.5rem; color: #059669; margin-bottom: 8px;"></i>
                                <div style="color: #065f46; font-weight: 700;">PROJETO FINALIZADO</div>
                                <div style="margin-top:5px; font-size:0.9rem; color: #047857;">Lucro Real: ${formatarMoeda(exec.kpis?.lucroFinal || lucroRealAtual)}</div>
                           </div>`
                        : `<button class="btn-primary" style="width:100%; justify-content: center; padding: 12px; font-size: 0.95rem; box-shadow: 0 4px 6px -1px rgba(var(--primaria-rgb), 0.3);" onclick="window.finalizarObra('${projeto.id}')">
                                <i class="fas fa-flag-checkered" style="margin-right: 8px;"></i> Encerrar Projeto
                           </button>`
                    }
                </div>
            </div>

            <!-- COLUNA 2: FINANCEIRO REALIZADO -->
            <div style="background: #fff; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #f1f5f9;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="background: #f0fdf4; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-wallet" style="color: #16a34a; font-size: 1.1rem;"></i>
                        </div>
                        <h4 style="color: #1e293b; margin: 0; font-size: 1rem; font-weight: 600;">Diário Financeiro (Realizado)</h4>
                    </div>
                    <button class="btn-secundario-sm" onclick="window.abrirModalDespesa('${projeto.id}')" ${getDisabled} style="display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-plus"></i> Registrar Despesa
                    </button>
                </div>

                <div class="card-resumo-real" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <div class="mini-card" style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
                        <span style="display: block; font-size: 0.8rem; color: #64748b; margin-bottom: 5px; text-transform: uppercase; font-weight: 600;">Orçamento Serviço</span>
                        <strong style="font-size: 1.2rem; color: #334155;">${formatarMoeda(orcamento.precoVendaServico)}</strong>
                    </div>
                    <div class="mini-card" style="background: #fff1f2; padding: 15px; border-radius: 8px; border: 1px solid #fecdd3; text-align: center;">
                        <span style="display: block; font-size: 0.8rem; color: #9f1239; margin-bottom: 5px; text-transform: uppercase; font-weight: 600;">Despesas Totais</span>
                        <strong style="font-size: 1.2rem; color: #e11d48;">${formatarMoeda(totalDespesas)}</strong>
                    </div>
                    <div class="mini-card" style="background: #f0fdf4; padding: 15px; border-radius: 8px; border: 1px solid #bbf7d0; text-align: center;">
                        <span style="display: block; font-size: 0.8rem; color: #166534; margin-bottom: 5px; text-transform: uppercase; font-weight: 600;">Lucro Real (Atual)</span>
                        <strong style="font-size: 1.2rem; color: #16a34a;">${formatarMoeda(lucroRealAtual)}</strong>
                    </div>
                </div>

                <div class="tabela-scroll-engenharia" style="max-height: 400px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <table class="tabela-tecnica" style="width: 100%; border-collapse: collapse;">
                        <thead style="background: #f8fafc; position: sticky; top: 0;">
                            <tr>
                                <th style="padding: 12px; text-align: left; color: #64748b; font-weight: 600; font-size: 0.85rem;">Data</th>
                                <th style="padding: 12px; text-align: left; color: #64748b; font-weight: 600; font-size: 0.85rem;">Categoria</th>
                                <th style="padding: 12px; text-align: left; color: #64748b; font-weight: 600; font-size: 0.85rem;">Descrição</th>
                                <th style="padding: 12px; text-align: right; color: #64748b; font-weight: 600; font-size: 0.85rem;">Valor</th>
                                <th style="padding: 12px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${financeiro.despesas.map((d, idx) => `
                                <tr style="border-bottom: 1px solid #f1f5f9;">
                                    <td style="padding: 12px; color: #334155; font-size: 0.9rem;">${new Date(d.data).toLocaleDateString()}</td>
                                    <td style="padding: 12px;"><span class="badge" style="font-size:0.75rem; background: #f1f5f9; color: #475569; padding: 4px 8px; border-radius: 4px;">${d.categoria}</span></td>
                                    <td style="padding: 12px; color: #334155; font-size: 0.9rem;">${d.descricao}</td>
                                    <td style="padding: 12px; text-align: right; color: #ef4444; font-weight: 600; font-size: 0.9rem;">- ${formatarMoeda(d.valor)}</td>
                                    <td style="padding: 12px; text-align: center;"><button class="btn-icon-sm" onclick="window.removerDespesa('${projeto.id}', ${idx})" ${getDisabled} style="color: #94a3b8; cursor: pointer; background: none; border: none;"><i class="fas fa-trash hover:text-red-500"></i></button></td>
                                </tr>
                            `).join('')}
                            ${financeiro.despesas.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 30px; color:#94a3b8;">Nenhuma despesa lançada.</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// --- AÇÕES DE EXECUÇÃO ---

window.atualizarChecklist = async function(projetoId, item, valor) {
    const projeto = db.buscarPorId('projetos', projetoId);
    if (!projeto.execucao) projeto.execucao = { checklist: {}, financeiroReal: { despesas: [] } };
    
    projeto.execucao.checklist[item] = valor;
    await db.atualizar('projetos', projetoId, { execucao: projeto.execucao });
    
    // Re-renderiza o painel para atualizar o visual (ícones e cores)
    const container = document.getElementById('aba_execucao');
    if (container) {
        renderizarPainelExecucao(projeto, container);
    }
};

window.abrirModalDespesa = function(projetoId) {
    const modalId = 'modal_nova_despesa';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000;";
    
    modal.innerHTML = `
        <div class="modal-content" style="background: white; padding: 25px; border-radius: 8px; width: 400px;">
            <h3>Nova Despesa</h3>
            <div class="form-group">
                <label>Categoria</label>
                <select id="desp_cat" class="input-estilizado">
                    <option value="MO">Mão de Obra</option>
                    <option value="MATERIAIS">Materiais Extras</option>
                    <option value="PROJETO">Engenharia/CREA</option>
                    <option value="IMPOSTO">Impostos (DAS/NF)</option>
                    <option value="LOGISTICA">Logística/Frete</option>
                </select>
            </div>
            <div class="form-group">
                <label>Descrição</label>
                <input type="text" id="desp_desc" class="input-estilizado" placeholder="Ex: Pagamento 1ª Parcela Instalador">
            </div>
            <div class="form-group">
                <label>Valor (R$)</label>
                <input type="number" id="desp_valor" class="input-estilizado" step="0.01">
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                <button class="btn-secundario" onclick="document.getElementById('${modalId}').remove()">Cancelar</button>
                <button class="btn-primary" onclick="window.salvarDespesa('${projetoId}')">Salvar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.salvarDespesa = async function(projetoId) {
    const cat = document.getElementById('desp_cat').value;
    const desc = document.getElementById('desp_desc').value;
    const valor = parseFloat(document.getElementById('desp_valor').value);

    if (!desc || isNaN(valor) || valor <= 0) return customAlert("Preencha os dados corretamente.");

    const projeto = db.buscarPorId('projetos', projetoId);
    if (!projeto.execucao) projeto.execucao = { checklist: {}, financeiroReal: { despesas: [] } };
    if (!projeto.execucao.financeiroReal) projeto.execucao.financeiroReal = { despesas: [] };

    projeto.execucao.financeiroReal.despesas.push({
        categoria: cat,
        descricao: desc,
        valor: valor,
        data: new Date().toISOString()
    });

    await db.atualizar('projetos', projetoId, { execucao: projeto.execucao });
    document.getElementById('modal_nova_despesa').remove();
    renderizarPainelExecucao(projeto, document.getElementById('aba_execucao'));
};

window.removerDespesa = async function(projetoId, index) {
    if(!(await customConfirm("Excluir este lançamento?"))) return;
    const projeto = db.buscarPorId('projetos', projetoId);
    projeto.execucao.financeiroReal.despesas.splice(index, 1);
    await db.atualizar('projetos', projetoId, { execucao: projeto.execucao });
    renderizarPainelExecucao(projeto, document.getElementById('aba_execucao'));
};

window.finalizarObra = async function(projetoId) {
    const projeto = db.buscarPorId('projetos', projetoId);
    if (!projeto.execucao?.checklist?.vistoriaAprovada) {
        return customAlert("A vistoria precisa estar marcada como APROVADA para finalizar o projeto.", "Atenção");
    }
    
    if(await customConfirm("Confirma o encerramento do projeto? Isso irá congelar os custos e calcular o Lucro Real final.")) {
        // Calcula KPIs Finais
        const financeiro = projeto.execucao.financeiroReal;
        const totalDespesas = financeiro.despesas.reduce((acc, d) => acc + d.valor, 0);
        
        // Busca orçamento original
        const propostas = db.buscarPorRelacao('propostas', 'projetoId', projetoId);
        const propVendida = propostas.find(p => p.status === 'VENDIDA');
        const orcamento = propVendida.versoes[propVendida.detalhesVenda.versaoVendida].resumoFinanceiro;
        
        const lucroFinal = orcamento.precoVendaServico - totalDespesas;
        const potKwp = propVendida.potenciaKwp || 0;

        // Salva KPIs
        projeto.execucao.kpis = {
            lucroFinal: lucroFinal,
            margemReal: (lucroFinal / orcamento.precoVendaServico) * 100,
            custoMoPorKwp: financeiro.despesas.filter(d => d.categoria === 'MO').reduce((a,b)=>a+b.valor,0) / potKwp,
            dataFinalizacao: new Date().toISOString()
        };

        await db.atualizar('projetos', projetoId, { 
            status: 'FINALIZADO',
            execucao: projeto.execucao
        });
        
        await customAlert("Projeto finalizado com sucesso! Parabéns.", "Sucesso", "sucesso");
        window.location.reload();
    }
};

function carregarPropostasDoProjeto(projetoId) {
    const propostas = db.buscarPorRelacao('propostas', 'projetoId', projetoId)
                        .sort((a, b) => new Date(b.dataAtualizacao || b.dataCriacao || 0) - new Date(a.dataAtualizacao || a.dataCriacao || 0));
    
    const tbody = document.getElementById('corpo_lista_propostas');
    if (!tbody) return;

    if (propostas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;">Nenhuma proposta encontrada para este projeto.</td></tr>`;
        return;
    }

    tbody.innerHTML = propostas.map(prop => {
        const fmtMoney = v => (v||0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        const dataRef = prop.dataAtualizacao || prop.dataCriacao;
        
        const status = prop.status || 'EM_ABERTO';
        const std = prop.versoes?.standard?.resumoFinanceiro;
        const prm = prop.versoes?.premium?.resumoFinanceiro;
        
        const modoApres = prop.tipoApresentacao || 'estimativa';
        const modoIcone = modoApres === 'definitiva' ? 'fa-toggle-on' : 'fa-toggle-off';
        const modoCor = modoApres === 'definitiva' ? '#16a34a' : '#94a3b8';
        const modoLabel = modoApres === 'definitiva' ? 'Definitiva' : 'Estimativa';

        const htmlPotencia = `<strong>${(prop.potenciaKwp || 0).toFixed(2)} kWp</strong>`;
        const htmlGeracao = `<div style="color:#15803d;">${prop.geracaoMensal || 0} <span style="color:#94a3b8; font-size:0.75rem;">/ ${prop.geracaoExpansao || 0} kWh</span></div>`;

        const htmlValor = `
            <div style="display:flex; flex-direction:column; gap:2px; font-size:0.85rem;">
                <div><span style="color:#64748b; font-size:0.7rem;">STD:</span> ${std ? fmtMoney(std.valorTotal) : '-'}</div>
                <div><span style="color:#b45309; font-size:0.7rem;">PRM:</span> ${prm ? fmtMoney(prm.valorTotal) : '-'}</div>
            </div>
        `;

        // Lógica de Validade (Replicada para consistência visual)
        let htmlValidade = '<span style="color:#94a3b8;">Indefinida</span>';
        if (prop.dataValidade) {
            const hoje = new Date();
            let validade;
            if (prop.dataValidade.includes('T')) {
                validade = new Date(prop.dataValidade);
            } else {
                const partes = prop.dataValidade.split('-');
                validade = new Date(partes[0], partes[1] - 1, partes[2], 23, 59, 59);
            }
            
            const diffDias = Math.ceil((validade - hoje) / (1000 * 60 * 60 * 24));
            
            let corValidade = '#15803d';
            if (diffDias < 0) corValidade = '#ef4444';
            else if (diffDias <= 2) corValidade = '#f59e0b';
            
            const textoValidade = diffDias < 0 ? `Venceu há ${Math.abs(diffDias)}d` : (diffDias === 0 ? 'Vence hoje' : `Vence em ${diffDias}d`);
            
            htmlValidade = `<div style="display:flex; align-items:center; gap:5px;"><span style="color:${corValidade}; font-size:0.8rem; font-weight:500;">${textoValidade}</span> <button class="btn-icon-sm" onclick="window.renovarValidade('${prop.id}')" title="Renovar Validade"><i class="fas fa-sync-alt"></i></button></div>`;
        }

        // Botões de Ação (Condicionais baseados no Status)
        let botoesAcao = '';
        if (status === 'VENDIDA') {
            botoesAcao = `
                <span style="font-size:0.8rem; color:#166534; font-weight:600; margin-right:10px;"><i class="fas fa-lock"></i> Fechada</span>
                <button class="btn-icon-perigo" onclick="window.cancelarVenda('${prop.id}')" title="Cancelar Venda / Estornar"><i class="fas fa-undo"></i></button>
                <button class="btn-icon" onclick="window.gerarPDFPropostaExecutiva('${prop.id}')" title="Gerar PDF Executivo"><i class="fas fa-file-pdf"></i></button>
                <button class="btn-icon" onclick="window.visualizarProposta('${prop.id}')" title="Ver Contrato/Detalhes"><i class="fas fa-file-contract"></i></button>
            `;
        } else {
            botoesAcao = `
                <button class="btn-icon-sucesso" onclick="window.abrirModalFechamento('${prop.id}')" title="Fechar Venda / Dar Baixa"><i class="fas fa-handshake"></i></button>
                <button class="btn-icon" onclick="window.alternarModoApresentacao('${prop.id}')" title="Alternar Modo: Atualmente ${modoLabel}"><i class="fas ${modoIcone}" style="color:${modoCor}"></i></button>
                <button class="btn-icon" onclick="window.visualizarProposta('${prop.id}')" title="Visualizar Proposta"><i class="fas fa-eye"></i></button>
                <button class="btn-icon" onclick="window.gerarPDFPropostaExecutiva('${prop.id}')" title="Gerar PDF Executivo"><i class="fas fa-file-pdf"></i></button>
                <button class="btn-icon" onclick="window.editarPropostaDoProjeto('${prop.id}')" title="Editar Proposta"><i class="fas fa-pencil-alt"></i></button>
                <button class="btn-icon" onclick="window.excluirPropostaDoProjeto('${prop.id}')" title="Excluir Proposta"><i class="fas fa-trash"></i></button>
            `;
        }

        return `
            <tr class="linha-dado" style="${status === 'VENDIDA' ? 'background-color:#f0fdf4;' : ''}">
                <td>
                    ${new Date(dataRef).toLocaleDateString()}
                    <div style="font-size: 0.75rem; color: #94a3b8; font-family: monospace;">ID: ${prop.id.substring(0,8)}</div>
                </td>
                <td>${status === 'VENDIDA' ? obterBadgeStatusProposta('VENDIDA', prop.detalhesVenda?.versaoVendida) : htmlValidade}</td>
                <td>${htmlPotencia}</td>
                <td>${htmlGeracao}</td>
                <td>${htmlValor}</td>
                <td style="text-align: right;">${botoesAcao}</td>
            </tr>
        `;
    }).join('');
}

// Ações de CRUD para propostas dentro do projeto

window.editarProjetoAtual = function() {
    const projeto = db.buscarPorId('projetos', projetoId);
    if (!projeto) return;

    sessionStorage.setItem('cliente_ativo_id', projeto.clienteId);
    sessionStorage.setItem('projeto_id_edicao', projetoId);
    sessionStorage.setItem('origem_voltar', 'projeto_detalhes'); // Define retorno para a visualização
    window.location.href = 'cadastro-projeto.html';
};

window.novaPropostaParaProjeto = function() {
    const projeto = db.buscarPorId('projetos', projetoId);
    if (!projeto) return;
    sessionStorage.setItem('cliente_ativo_id', projeto.clienteId);
    sessionStorage.setItem('projeto_ativo_id', projeto.id);
    sessionStorage.removeItem('proposta_ativa_id'); // Garante que é uma NOVA proposta
    sessionStorage.setItem('url_origem_gerador', window.location.href); // Salva origem
    window.location.href = 'gerador-proposta.html';
};

window.editarPropostaDoProjeto = function(propostaId) {
    const projeto = db.buscarPorId('projetos', projetoId);
    if (!projeto) return;
    
    sessionStorage.setItem('cliente_ativo_id', projeto.clienteId);
    sessionStorage.setItem('projeto_ativo_id', projeto.id);
    sessionStorage.setItem('proposta_ativa_id', propostaId); // Define qual proposta carregar
    sessionStorage.removeItem('modo_visualizacao'); // Garante modo edição
    sessionStorage.setItem('url_origem_gerador', window.location.href); // Salva origem
    window.location.href = 'gerador-proposta.html';
};

window.excluirPropostaDoProjeto = async function(propostaId) {
    const proposta = db.buscarPorId('propostas', propostaId);
    if (proposta && proposta.status === 'VENDIDA') {
        await customAlert("Esta proposta está vendida. Para excluí-la, primeiro cancele a venda clicando no botão de estorno (ícone de desfazer).", "Ação Bloqueada", "erro");
        return;
    }
    if (await customConfirm('Tem certeza que deseja excluir esta proposta? Esta ação não pode ser desfeita.')) {
        mostrarLoadingOverlay();
        if (await db.excluir('propostas', propostaId)) {
            esconderLoadingOverlay();
            await customAlert('Proposta excluída.', "Sucesso", "sucesso");
            carregarPropostasDoProjeto(projetoId); // Recarrega a lista
        } else {
            esconderLoadingOverlay();
            await customAlert('Erro ao excluir a proposta.', "Erro", "erro");
        }
    }
};

window.visualizarProposta = async function(propostaId) {
    const proposta = db.buscarPorId('propostas', propostaId);
    if (!proposta) return customAlert('Proposta não encontrada.');
    const projeto = db.buscarPorId('projetos', proposta.projetoId);
    if (!projeto) return customAlert('Projeto associado não encontrado.');
    
    sessionStorage.setItem('cliente_ativo_id', projeto.clienteId);
    sessionStorage.setItem('projeto_ativo_id', projeto.id);
    sessionStorage.setItem('proposta_ativa_id', propostaId);
    sessionStorage.setItem('origem_voltar', 'projeto_detalhes'); // Define origem correta
    // Redireciona para a página dedicada de visualização (Leitura Limpa)
    window.location.href = 'visualizar-proposta.html?id=' + propostaId;
};

// Função Global para Renovar Validade (Contexto Projeto)
window.renovarValidade = async function(id) {
    const proposta = db.buscarPorId('propostas', id);
    if (proposta && proposta.status === 'VENDIDA') {
        await customAlert('Não é possível alterar a validade de uma proposta já vendida.', "Ação Bloqueada", "erro");
        return;
    }

    const diasStr = await customPrompt("Informe o novo prazo de validade (em dias) a partir de hoje:", "3");
    if (diasStr === null) return;
    
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
    carregarPropostasDoProjeto(projetoId); // Recarrega a lista local
};

// Função para alternar entre proposta Estimativa e Definitiva
window.alternarModoApresentacao = async function(id) {
    const proposta = db.buscarPorId('propostas', id);
    if (!proposta) return;

    const novoModo = proposta.tipoApresentacao === 'definitiva' ? 'estimativa' : 'definitiva';
    
    mostrarLoadingOverlay();
    await db.atualizar('propostas', id, { tipoApresentacao: novoModo });
    esconderLoadingOverlay();

    const msg = novoModo === 'definitiva' ? 
        'Modo DEFINITIVO ativado. (A apresentação mostrará todos os detalhes técnicos)' : 
        'Modo ESTIMATIVA ativado. (A apresentação será simplificada)';
    
    await customAlert(msg, "Modo de Apresentação", "sucesso");
    carregarPropostasDoProjeto(projetoId);
};

// ======================================================================
// 💰 LÓGICA DE FECHAMENTO DE VENDA (DAR BAIXA)
// ======================================================================

window.abrirModalFechamento = function(propostaId) {
    const proposta = db.buscarPorId('propostas', propostaId);
    if (!proposta) return;

    // Cria o Modal Dinamicamente
    const modalId = 'modal_fechamento_venda';
    let modal = document.getElementById(modalId);
    
    if (modal) modal.remove(); // Remove anterior se existir

    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    
    // FIX: Estilos inline para garantir renderização correta (Overlay Fixo e Centralizado)
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
    `;

    modal.innerHTML = `
        <div class="modal-content" style="background: white; padding: 25px; border-radius: 12px; width: 90%; max-width: 500px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); position: relative;">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                <h3 style="margin: 0; font-size: 1.2rem; color: #1e293b;"><i class="fas fa-handshake" style="color:var(--primaria);"></i> Confirmar Venda</h3>
                <button class="btn-close-modal" onclick="document.getElementById('${modalId}').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #64748b;">&times;</button>
            </div>
            <div class="modal-body">
                <p style="color:#64748b; font-size:0.9rem; margin-bottom:15px;">
                    Ao confirmar, a proposta será congelada e o projeto marcado como "Vendido".
                </p>

                <div class="form-group">
                    <label>Qual versão foi vendida?</label>
                    <select id="venda_versao_escolhida" class="input-estilizado">
                        <option value="premium">Premium (Recomendado)</option>
                        <option value="standard">Standard</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Forma de Pagamento</label>
                    <select id="venda_forma_pagamento" class="input-estilizado" onchange="window.toggleCamposPagamento()">
                        <option value="financiamento">Financiamento Bancário (100%)</option>
                        <option value="avista">À Vista (Recursos Próprios)</option>
                        <option value="hibrido">Híbrido (Entrada + Financiamento)</option>
                    </select>
                </div>

                <div id="campos_financiamento" class="grupo-condicional">
                    <div class="form-group">
                        <label>Instituição Financeira</label>
                        <input type="text" id="venda_banco" class="input-estilizado" placeholder="Ex: Santander, BV, Solfácil">
                    </div>
                </div>

                <div id="campos_avista" class="grupo-condicional" style="display:none;">
                    <div class="form-group">
                        <label>Condição de Parcelamento (Interno)</label>
                        <input type="text" id="venda_condicao_avista" class="input-estilizado" placeholder="Ex: 50% Entrada + 50% Entrega">
                    </div>
                </div>

                <div class="form-group">
                    <label>Observações / Detalhes do Fechamento</label>
                    <textarea id="venda_obs" class="input-estilizado" rows="3" placeholder="Detalhes adicionais sobre a negociação..."></textarea>
                </div>

                <div style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn-secundario" onclick="document.getElementById('${modalId}').remove()">Cancelar</button>
                    <button class="btn-primary" onclick="window.confirmarVenda('${propostaId}')">Confirmar Venda</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.toggleCamposPagamento = function() {
    const tipo = document.getElementById('venda_forma_pagamento').value;
    const divFin = document.getElementById('campos_financiamento');
    const divAvista = document.getElementById('campos_avista');

    if (tipo === 'financiamento') {
        divFin.style.display = 'block';
        divAvista.style.display = 'none';
    } else if (tipo === 'avista') {
        divFin.style.display = 'none';
        divAvista.style.display = 'block';
    } else {
        divFin.style.display = 'block';
        divAvista.style.display = 'block';
    }
};

window.confirmarVenda = async function(propostaId) {
    const versao = document.getElementById('venda_versao_escolhida').value;
    const formaPagamento = document.getElementById('venda_forma_pagamento').value;
    const banco = document.getElementById('venda_banco').value;
    const condicao = document.getElementById('venda_condicao_avista').value;
    const obs = document.getElementById('venda_obs').value;

    mostrarLoadingOverlay();
    // 1. Atualiza a Proposta (Congela e Marca Vendida)
    const dadosVenda = {
        status: 'VENDIDA',
        dataVenda: new Date().toISOString(),
        detalhesVenda: {
            versaoVendida: versao, // 'standard' ou 'premium'
            formaPagamento,
            banco,
            condicao,
            observacoes: obs
        }
    };
    await db.atualizar('propostas', propostaId, dadosVenda);

    // 2. Atualiza o Projeto (Cascata)
    const projeto = db.buscarPorId('projetos', projetoId);
    if (projeto) {
        // INICIALIZA ESTRUTURA DE EXECUÇÃO
        const estruturaExecucao = {
            checklist: {
                kitExpedido: false, kitEntregue: false, instalacaoAgendada: false,
                vistoriaSolicitada: false, vistoriaAprovada: false
            },
            financeiroReal: { despesas: [], receitas: [] },
            historico: []
        };
        db.atualizar('projetos', projetoId, { status: 'VENDIDO', execucao: estruturaExecucao });
        await db.atualizar('projetos', projetoId, { status: 'VENDIDO', execucao: estruturaExecucao });

        // 3. Atualiza o Cliente (Cascata)
        const cliente = db.buscarPorId('clientes', projeto.clienteId);
        if (cliente && cliente.status !== 'CLIENTE') {
            await db.atualizar('clientes', projeto.clienteId, { status: 'CLIENTE' }); // De Lead para Cliente
        }
    }

    // 4. Feedback e Refresh
    document.getElementById('modal_fechamento_venda').remove();
    esconderLoadingOverlay();
    await customAlert("Parabéns! Venda registrada com sucesso. <br>O projeto agora está em execução.", "Venda Confirmada", "sucesso");
    
    // Recarrega a tela para atualizar status visual
    window.location.reload();
};

// ======================================================================
// ↩️ LÓGICA DE CANCELAMENTO DE VENDA (ESTORNO)
// ======================================================================

window.cancelarVenda = async function(propostaId) {
    const proposta = db.buscarPorId('propostas', propostaId);
    if (!proposta) return;

    if (!(await customConfirm("⚠️ ATENÇÃO: Cancelamento de Venda<br><br>Esta ação irá:<br>1. Reverter a proposta para 'Em Aberto'.<br>2. Estornar o status do Projeto para 'Em Cotação'.<br>3. Reverter o Cliente para 'Lead'.<br><br>Confirma o cancelamento e o estorno dos valores financeiros?", "Confirmar Estorno", "perigo"))) {
        return;
    }

    mostrarLoadingOverlay();
    // 1. Reverte Proposta
    await db.atualizar('propostas', propostaId, {
        status: 'EM_ABERTO',
        dataVenda: null,
        detalhesVenda: null
    });

    // 2. Verifica Projeto (Se não tem outras vendas, volta para Em Cotação)
    const projetoId = proposta.projetoId;
    const propostasDoProjeto = db.buscarPorRelacao('propostas', 'projetoId', projetoId);
    // Verifica se existe ALGUMA proposta vendida (excluindo a atual que acabamos de reverter na memória lógica, mas o db.atualizar já persistiu)
    // Como db.atualizar já rodou, a proposta atual já é EM_ABERTO no banco.
    const temOutraVendaNoProjeto = propostasDoProjeto.some(p => p.status === 'VENDIDA');

    if (!temOutraVendaNoProjeto) {
        await db.atualizar('projetos', projetoId, { status: 'EM_COTACAO' });
    }

    // 3. Verifica Cliente (Se não tem projetos vendidos, volta para Lead)
    const clienteId = proposta.clienteId;
    const projetosDoCliente = db.buscarPorRelacao('projetos', 'clienteId', clienteId);
    
    // Verifica status atualizado dos projetos
    const temProjetoVendido = projetosDoCliente.some(p => p.status === 'VENDIDO');

    if (!temProjetoVendido) {
        await db.atualizar('clientes', clienteId, { status: 'LEAD' });
    }

    esconderLoadingOverlay();
    await customAlert("Venda cancelada com sucesso. Os status foram revertidos e a exclusão agora é permitida.", "Sucesso", "sucesso");
    // Recarrega a tela para atualizar status visual
    window.location.reload();
};

// --- NAVEGAÇÃO INTELIGENTE (BOTÃO VOLTAR) ---
window.voltar = function() {
    const origem = sessionStorage.getItem('origem_voltar') || 'dashboard';
    const projeto = db.buscarPorId('projetos', projetoId);
    
    // Limpa a flag de origem para não afetar navegações futuras
    sessionStorage.removeItem('origem_voltar');

    if (origem === 'cliente' && projeto) {
        // Volta para a ficha do cliente (Modo Visualização)
        sessionStorage.setItem('cliente_id_visualizacao', projeto.clienteId);
        sessionStorage.removeItem('cliente_id_edicao');
        window.location.href = 'cadastro-cliente.html';
    } else {
        // Padrão: Volta para o Dashboard
        window.location.href = 'dashboard-admin.html';
    }
};

// Vincula a função voltar ao botão de voltar do navegador ou botão físico da página se houver
// (Opcional: Se houver um botão com id 'btn-voltar' no HTML, vincula automaticamente)
const btnVoltar = document.getElementById('btn-voltar');
if (btnVoltar) {
    btnVoltar.onclick = window.voltar;
}

// ======================================================================
// 📄 GERADOR DE DOCUMENTO EXECUTIVO (EDITÁVEL)
// ======================================================================
window.gerarPDFPropostaExecutiva = function(propostaId) {
    const proposta = db.buscarPorId('propostas', propostaId);
    if (!proposta) return customAlert("Proposta não encontrada.");

    const projeto = db.buscarPorId('projetos', proposta.projetoId);
    const cliente = db.buscarPorId('clientes', proposta.clienteId);

    abrirPropostaParaEdicao(proposta, projeto, cliente);
};