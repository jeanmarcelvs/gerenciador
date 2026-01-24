import { formatarMoeda, obterBadgeStatusProposta, obterBadgeStatusProjeto, obterBadgeStatusCliente } from './utils.js';

export const dashboardView = {

    renderizarEstruturaDashboard(container) {
        container.innerHTML = `
            <style>
                .card-indicador { transition: all 0.2s; border: 2px solid transparent; cursor: pointer; }
                .card-indicador:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
                .card-ativo { border-color: var(--primaria) !important; background-color: #f0f9ff !important; }
            </style>

            <div class="area-trabalho-engenharia" style="margin-top: 20px;">
                <div class="header-modulo">
                    <h2><i class="fas fa-chart-line"></i> Visão Geral de Engenharia</h2>
                </div>

                <!-- DASHBOARD FINANCEIRO (NOVO) -->
                <div class="grid-financeiro-kpi" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px;">
                    <div class="card-kpi" style="background: #fff; padding: 15px; border-radius: 8px; border-left: 4px solid #0ea5e9; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        <span style="font-size: 0.8rem; color: #64748b; text-transform: uppercase; font-weight: 600;">VGV (Total Vendido)</span>
                        <div style="font-size: 1.4rem; font-weight: 800; color: #0f172a; margin-top: 5px;" id="kpi_vgv">R$ 0,00</div>
                        <small style="font-size: 0.75rem; color: #94a3b8;">Soma dos contratos fechados</small>
                    </div>
                    <div class="card-kpi" style="background: #fff; padding: 15px; border-radius: 8px; border-left: 4px solid #8b5cf6; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        <span style="font-size: 0.8rem; color: #64748b; text-transform: uppercase; font-weight: 600;">Receita de Serviços</span>
                        <div style="font-size: 1.4rem; font-weight: 800; color: #0f172a; margin-top: 5px;" id="kpi_receita_servico">R$ 0,00</div>
                        <small style="font-size: 0.75rem; color: #94a3b8;">Excluindo custo de Kits</small>
                    </div>
                    <div class="card-kpi" style="background: #fff; padding: 15px; border-radius: 8px; border-left: 4px solid #16a34a; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        <span style="font-size: 0.8rem; color: #64748b; text-transform: uppercase; font-weight: 600;">Lucro Projetado</span>
                        <div style="font-size: 1.4rem; font-weight: 800; color: #16a34a; margin-top: 5px;" id="kpi_lucro">R$ 0,00</div>
                        <small style="font-size: 0.75rem; color: #94a3b8;">Margem estimada na venda</small>
                    </div>
                    <div class="card-kpi" style="background: #fff; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        <span style="font-size: 0.8rem; color: #64748b; text-transform: uppercase; font-weight: 600;">Mix de Vendas</span>
                        <div style="display: flex; justify-content: space-between; margin-top: 8px;">
                            <div><strong style="color: #b45309;" id="kpi_qtd_prm">0</strong> <span style="font-size: 0.8rem;">Premium</span></div>
                            <div><strong style="color: #475569;" id="kpi_qtd_std">0</strong> <span style="font-size: 0.8rem;">Standard</span></div>
                        </div>
                        <small style="font-size: 0.75rem; color: #94a3b8;">Contratos assinados</small>
                    </div>
                </div>

                <div class="grid-resumo-dashboard">
                    <div class="card-indicador" id="card_clientes" onclick="window.selecionarContexto('clientes')">
                        <div class="icon-indicador icon-clientes"><i class="fas fa-users"></i></div>
                        <div class="info-indicador">
                            <span>Clientes Ativos</span>
                            <strong id="contagem_clientes">0</strong>
                        </div>
                    </div>
                    <div class="card-indicador" id="card_projetos" onclick="window.selecionarContexto('projetos')">
                        <div class="icon-indicador icon-projetos"><i class="fas fa-solar-panel"></i></div>
                        <div class="info-indicador">
                            <span>Projetos Criados</span>
                            <strong id="contagem_projetos">0</strong>
                        </div>
                    </div>
                    <div class="card-indicador" id="card_propostas" onclick="window.selecionarContexto('propostas')">
                        <div class="icon-indicador icon-financeiro"><i class="fas fa-file-invoice-dollar"></i></div>
                        <div class="info-indicador">
                            <span>Propostas Geradas</span>
                            <strong id="contagem_propostas">0</strong>
                        </div>
                    </div>
                    <div class="card-indicador" id="card_potencia" onclick="window.selecionarContexto('propostas')">
                        <div class="icon-indicador icon-financeiro" style="background: rgba(255, 100, 100, 0.1); color: #ff6464;"><i class="fas fa-bolt"></i></div>
                        <div class="info-indicador">
                            <span>Potência Total</span>
                            <strong id="soma_kwp">0.00</strong>
                        </div>
                    </div>
                </div>

                <div class="card-tecnico">
                    <div class="secao-header" style="display: flex; justify-content: space-between; align-items: center;">
                        <div id="titulo_tabela_dashboard">
                            <i class="fas fa-project-diagram" style="color: var(--primaria);"></i> Projetos Ativos
                        </div>
                    </div>

                    <div id="tabela_clientes_container" style="display: none;">
                        <div style="margin-bottom: 10px; display: flex; justify-content: flex-end;">
                             <button class="btn-novo-atalho" onclick="window.novoCliente()">+ Novo Cliente</button>
                        </div>
                        <table class="tabela-tecnica">
                            <thead>
                                <tr>
                                    <th style="width: 25%;">Nome</th>
                                    <th style="width: 15%;">Status</th>
                                    <th style="width: 20%;">Localização</th>
                                    <th style="width: 15%;">Documento</th>
                                    <th style="width: 10%; text-align: center;">Projetos</th>
                                    <th style="width: 15%; text-align: right;">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="corpo_clientes_diretos"></tbody>
                        </table>
                    </div>

                    <div id="tabela_projetos_container">
                        <table class="tabela-tecnica">
                            <thead>
                                <tr>
                                    <th style="width: 10%;">Data</th>
                                    <th style="width: 15%;">Status</th>
                                    <th style="width: 25%;">Projeto</th>
                                    <th style="width: 25%;">Cliente</th>
                                    <th style="width: 15%;">Localização</th>
                                    <th style="width: 10%; text-align: right;">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="corpo_projetos_diretos"></tbody>
                        </table>
                    </div>

                    <div id="tabela_propostas_container" style="display: none;">
                        <table class="tabela-tecnica">
                            <thead>
                                <tr>
                                    <th style="width: 12%;">Atualização</th>
                                    <th style="width: 10%;">Status</th>
                                    <th style="width: 18%;">Valores (STD / PRM)</th>
                                    <th style="width: 15%;">Geração (Est. / Max)</th>
                                    <th style="width: 15%;">Projeto</th>
                                    <th style="width: 15%;">Cliente</th>
                                    <th style="width: 10%;">Validade</th>
                                    <th style="width: 5%; text-align: right;">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="corpo_propostas_diretas"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    atualizarKPIs(vgv, receitaServico, lucroProjetado, qtdPrm, qtdStd) {
        const elVgv = document.getElementById('kpi_vgv');
        if (elVgv) {
            elVgv.innerText = formatarMoeda(vgv);
            document.getElementById('kpi_receita_servico').innerText = formatarMoeda(receitaServico);
            document.getElementById('kpi_lucro').innerText = formatarMoeda(lucroProjetado);
            document.getElementById('kpi_qtd_prm').innerText = qtdPrm;
            document.getElementById('kpi_qtd_std').innerText = qtdStd;
        }
    },

    atualizarIndicadores(nClientes, nProjetos, nPropostas, totalKwp) {
        document.getElementById('contagem_clientes').innerText = nClientes;
        document.getElementById('contagem_projetos').innerText = nProjetos;
        document.getElementById('contagem_propostas').innerText = nPropostas;
        document.getElementById('soma_kwp').innerText = totalKwp.toFixed(2);
    },

    renderizarTabelaClientesDashboard(container, clientes) {
        if (!container) return;
        container.innerHTML = clientes.map(cli => `
            <tr class="linha-busca">
                <td><strong>${cli.nome}</strong></td>
                <td>${obterBadgeStatusCliente(cli.status)}</td>
                <td>${cli.cidade} / ${cli.uf}</td>
                <td>${cli.documento}</td>
                <td style="text-align: center;"><span class="tag-projeto" style="display: inline-block; min-width: 30px;">${cli.qtdProjetos}</span></td>
                <td style="text-align: right;">
                    <button class="btn-icon" onclick="window.abrirPerfil('${cli.id}')" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
                    <button class="btn-icon" onclick="window.editarCliente('${cli.id}')" title="Editar Cliente"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn-icon btn-add-proj" onclick="window.iniciarNovoProjeto('${cli.id}')" title="Novo Projeto"><i class="fas fa-folder-plus"></i></button>
                </td>
            </tr>
        `).join('');
    },

    renderizarTabelaPropostasDashboard(container, propostas) {
        if (!container) return;
        
        // Agrupamento por Cliente
        const grupos = {};
        propostas.forEach(p => {
            if (!grupos[p.clienteId]) {
                grupos[p.clienteId] = {
                    clienteNome: p.clienteNome,
                    clienteId: p.clienteId,
                    propostas: []
                };
            }
            grupos[p.clienteId].propostas.push(p);
        });

        let html = '';
        Object.values(grupos).forEach(grupo => {
            if (grupo.propostas.length === 1) {
                html += this._gerarLinhaProposta(grupo.propostas[0]);
            } else {
                const groupId = `group_prop_${grupo.clienteId}`;
                const count = grupo.propostas.length;
                // Data mais recente
                const latestDate = new Date(Math.max(...grupo.propostas.map(p => new Date(p.dataRef))));
                // Soma total estimada (Premium ou Standard)
                const totalValue = grupo.propostas.reduce((acc, p) => acc + (p.prmValor || p.stdValor || 0), 0);
                
                html += `
                    <tr class="linha-grupo" onclick="window.toggleGrupo('${groupId}')" style="background-color: #f8fafc; cursor: pointer; font-weight: 600; border-bottom: 1px solid #e2e8f0;">
                        <td>${latestDate.toLocaleDateString()} <div style="font-size:0.7rem; font-weight:normal; color:#64748b;">(Última)</div></td>
                        <td><span class="badge" style="background:#e2e8f0; color:#475569;">${count} Propostas</span></td>
                        <td colspan="2">
                            <div style="display:flex; flex-direction:column;">
                                <span style="color:#1e293b;"><i class="fas fa-user" style="color:#3b82f6; margin-right:5px;"></i> ${grupo.clienteNome}</span>
                                <span style="font-size:0.75rem; color:#64748b; font-weight:normal;">Total em Propostas: ${formatarMoeda(totalValue)}</span>
                            </div>
                        </td>
                        <td style="color:#64748b; font-style:italic;">${count} Propostas</td>
                        <td style="text-align:center; color:#94a3b8;">-</td>
                        <td style="text-align:center; color:#94a3b8;">-</td>
                        <td style="text-align: right;"><i class="fas fa-chevron-down" id="icon_${groupId}" style="color:#94a3b8;"></i></td>
                    </tr>
                `;
                
                grupo.propostas.forEach(prop => {
                    html += this._gerarLinhaProposta(prop, true, groupId);
                });
            }
        });
        
        container.innerHTML = html;
    },

    _gerarLinhaProposta(prop, isChild = false, groupId = '') {
        // Lógica de Validade
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
            
            let corValidade = '#15803d'; // Verde
            if (diffDias < 0) corValidade = '#ef4444'; // Vermelho (Vencida)
            else if (diffDias <= 2) corValidade = '#f59e0b'; // Laranja (Vencendo)
            
            const textoValidade = diffDias < 0 ? `Venceu há ${Math.abs(diffDias)} dias` : (diffDias === 0 ? 'Vence hoje' : `Vence em ${diffDias} dias`);
            const btnRenovar = (prop.status === 'VENDIDA') ? '' : `<button class="btn-icon-sm" onclick="window.renovarValidade('${prop.id}')" title="Renovar Validade"><i class="fas fa-sync-alt"></i></button>`;
            
            htmlValidade = `<div style="display:flex; align-items:center; gap:5px;"><span style="color:${corValidade}; font-size:0.8rem; font-weight:500;">${textoValidade}</span> ${btnRenovar}</div>`;
        }

        const statusBadge = obterBadgeStatusProposta(prop.status || 'EM_ABERTO', prop.versaoVendida);
        const isVendida = prop.status === 'VENDIDA';
        const btnEditar = isVendida ? '' : `<button class="btn-icon" onclick="window.editarProposta('${prop.id}')" title="Editar Proposta"><i class="fas fa-pencil-alt"></i></button>`;
        const btnExcluir = isVendida ? '' : `<button class="btn-icon" onclick="window.excluirProposta('${prop.id}')" title="Excluir Proposta"><i class="fas fa-trash"></i></button>`;

        const htmlResumo = `
            <div style="display:flex; flex-direction:column; gap:4px; font-size:0.85rem;">
                <div style="display:flex; gap:8px; align-items:center;"><span style="color:#64748b; min-width:35px;">STD:</span> <strong>${prop.stdValor ? formatarMoeda(prop.stdValor) : '---'}</strong></div>
                <div style="display:flex; gap:8px; align-items:center;"><span style="color:#b45309; min-width:35px;">PRM:</span> <strong>${prop.prmValor ? formatarMoeda(prop.prmValor) : '---'}</strong></div>
            </div>
        `;
        const htmlGeracao = `<div style="color:#15803d; font-weight:600; font-size:0.85rem;">${prop.geracaoMensal || 0} <span style="color:#94a3b8; font-size:0.75rem; font-weight:400;">/ ${prop.geracaoExpansao || 0} kWh</span></div>`;

        const style = isChild ? `display: none; background-color: #f8fafc; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);` : '';
        const classChild = isChild ? `linha-filho ${groupId}` : 'linha-busca';
        
        // Design discreto e elegante para filhos (Espaçamento e Hierarquia)
        const tdStyle = isChild ? 'padding-top: 15px; padding-bottom: 15px; border-bottom: 1px solid #e2e8f0;' : '';
        const firstTdStyle = isChild ? `padding-left: 40px; border-left: 4px solid #94a3b8; ${tdStyle}` : tdStyle;
        const iconTree = isChild ? '<i class="fas fa-level-up-alt fa-rotate-90" style="color: #94a3b8; margin-right: 15px; font-size: 0.9rem;"></i>' : '';

        return `
            <tr class="${classChild}" data-status="${prop.status || 'EM_ABERTO'}" style="${style}">
                <td style="${firstTdStyle}">
                    <div style="display: flex; align-items: center;">
                        ${iconTree}
                        <div>
                            ${new Date(prop.dataRef).toLocaleDateString()}
                            <div style="font-size: 0.7rem; color: #94a3b8; font-family: monospace;">ID: ${prop.id.substring(0,8)}</div>
                        </div>
                    </div>
                </td>
                <td style="${tdStyle}">${statusBadge}</td>
                <td style="${tdStyle}">${htmlResumo}</td>
                <td style="${tdStyle}">${htmlGeracao}</td>
                <td style="${tdStyle}">
                    <a href="javascript:void(0)" onclick="window.visualizarProjeto('${prop.projetoId}')" style="text-decoration: none; color: #475569; font-weight: 500; display: inline-flex; align-items: center; gap: 5px;"><i class="fas fa-folder" style="color: #94a3b8;"></i> ${prop.projetoNome}</a>
                    <div style="font-size: 0.7rem; color: #94a3b8; margin-left: 20px; font-family: monospace;">Proj: ${prop.projetoId.substring(0,8)}</div>
                </td>
                <td style="${tdStyle}"><a href="javascript:void(0)" onclick="window.abrirPerfil('${prop.clienteId}')" style="text-decoration: none; color: #475569; font-weight: 500; display: inline-flex; align-items: center; gap: 5px;"><i class="fas fa-user"></i> ${prop.clienteNome}</a></td>
                <td style="${tdStyle}">${htmlValidade}</td>
                <td style="text-align: right; ${tdStyle}">
                    <button class="btn-icon" onclick="window.copiarLinkProposta('${prop.id.substring(0,8)}', '${prop.primeiroNomeCliente}')" title="Copiar Link"><i class="fas fa-link"></i></button>
                    <button class="btn-icon" onclick="window.visualizarProposta('${prop.id}')" title="Visualizar Proposta"><i class="fas fa-eye"></i></button>
                    ${btnEditar}
                    ${btnExcluir}
                </td>
            </tr>
        `;
    },

    renderizarTabelaProjetosDashboard(container, projetos) {
        if (!container) return;

        // Agrupamento por Cliente
        const grupos = {};
        projetos.forEach(p => {
            if (!grupos[p.clienteId]) {
                grupos[p.clienteId] = {
                    clienteNome: p.clienteNome,
                    clienteId: p.clienteId,
                    projetos: []
                };
            }
            grupos[p.clienteId].projetos.push(p);
        });

        let html = '';
        Object.values(grupos).forEach(grupo => {
            if (grupo.projetos.length === 1) {
                html += this._gerarLinhaProjeto(grupo.projetos[0]);
            } else {
                const groupId = `group_proj_${grupo.clienteId}`;
                const count = grupo.projetos.length;
                const latestDate = new Date(Math.max(...grupo.projetos.map(p => new Date(p.dataCriacao))));
                
                html += `
                    <tr class="linha-grupo" onclick="window.toggleGrupo('${groupId}')" style="background-color: #f8fafc; cursor: pointer; font-weight: 600; border-bottom: 1px solid #e2e8f0;">
                        <td>${latestDate.toLocaleDateString()} <div style="font-size:0.7rem; font-weight:normal; color:#64748b;">(Último)</div></td>
                        <td><span class="badge" style="background:#e2e8f0; color:#475569;">${count} Projetos</span></td>
                        <td colspan="2"><i class="fas fa-folder" style="color:#fbbf24; margin-right:5px;"></i> ${grupo.clienteNome}</td>
                        <td style="color:#64748b; font-style:italic;">${count} Projetos</td>
                        <td style="text-align: right;"><i class="fas fa-chevron-down" id="icon_${groupId}" style="color:#94a3b8;"></i></td>
                    </tr>
                `;
                
                grupo.projetos.forEach(proj => {
                    html += this._gerarLinhaProjeto(proj, true, groupId);
                });
            }
        });
        
        container.innerHTML = html;
    },

    _gerarLinhaProjeto(proj, isChild = false, groupId = '') {
        const style = isChild ? `display: none; background-color: #f8fafc; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);` : '';
        const classChild = isChild ? `linha-filho ${groupId}` : 'linha-busca';
        
        // Design discreto e elegante para filhos (Espaçamento e Hierarquia)
        const tdStyle = isChild ? 'padding-top: 15px; padding-bottom: 15px; border-bottom: 1px solid #e2e8f0;' : '';
        const firstTdStyle = isChild ? `padding-left: 40px; border-left: 4px solid #94a3b8; ${tdStyle}` : tdStyle;
        const iconTree = isChild ? '<i class="fas fa-level-up-alt fa-rotate-90" style="color: #94a3b8; margin-right: 15px; font-size: 0.9rem;"></i>' : '';

        return `
            <tr class="${classChild}" style="${style}">
                <td style="${firstTdStyle}">
                    <div style="display: flex; align-items: center;">
                        ${iconTree}
                        <span>${new Date(proj.dataCriacao).toLocaleDateString()}</span>
                    </div>
                </td>
                <td style="${tdStyle}">${obterBadgeStatusProjeto(proj.status || 'EM_COTACAO')}</td>
                <td style="${tdStyle}">
                    <strong>${proj.nome_projeto}</strong>
                    <div style="font-size: 0.7rem; color: #94a3b8; font-family: monospace;">ID: ${proj.id.substring(0,8)}</div>
                </td>
                <td style="${tdStyle}"><a href="javascript:void(0)" onclick="window.abrirPerfil('${proj.clienteId}')" style="text-decoration: none; color: #475569; font-weight: 500; display: inline-flex; align-items: center; gap: 5px;"><i class="fas fa-user"></i> ${proj.clienteNome}</a></td>
                <td style="${tdStyle}">${proj.localizacao}</td>
                <td style="text-align: right; white-space: nowrap; ${tdStyle}">
                    <button class="btn-icon" onclick="window.visualizarProjeto('${proj.id}')" title="Visualizar Detalhes do Projeto"><i class="fas fa-eye"></i></button>
                    <button class="btn-icon" onclick="window.editarProjeto('${proj.id}')" title="Editar Dados do Projeto"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn-icon" onclick="window.excluirProjeto('${proj.id}')" title="Excluir Projeto"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    },

    renderizarModuloClientes(container) {
        container.innerHTML = `
            <div id="modulo_clientes" class="painel-modulo">
                <div class="header-modulo">
                    <h2><i class="fas fa-users"></i> Gestão de Clientes</h2>
                    <div class="acoes-header">
                        <button class="btn-primary btn-auto-width" onclick="window.novoCliente()">
                            <i class="fas fa-plus"></i> Novo Cliente
                        </button>
                    </div>
                </div>

                <div class="card-tecnico card-lista">
                    <div class="busca-interna">
                        <i class="fas fa-search"></i>
                        <input type="text" id="busca_cliente_lista" placeholder="Filtrar por nome, cidade ou documento..." onkeyup="window.filtrarTabelaLocal('tabela_clientes', this.value)">
                    </div>
                    <table id="tabela_clientes" class="tabela-transversal">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Status</th>
                                <th>Localização</th>
                                <th>Documento</th>
                                <th>Projetos</th>
                                <th style="text-align: right;">Ações</th>
                            </tr>
                        </thead>
                        <tbody id="corpo_lista_clientes"></tbody>
                    </table>
                </div>
            </div>
        `;
    },

    renderizarTabelaClientesCompleta(tbody, clientes) {
        if (!tbody) return;
        if (clientes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem;">Nenhum cliente cadastrado. Clique em "+ Novo Cliente" para começar.</td></tr>`;
            return;
        }
        tbody.innerHTML = clientes.map(cli => `
            <tr>
                <td><strong>${cli.nome}</strong></td>
                <td>${obterBadgeStatusCliente(cli.status)}</td>
                <td>${cli.cidade} / ${cli.uf}</td>
                <td>${cli.documento}</td>
                <td><span class="tag-projeto">${cli.qtdProjetos}</span></td>
                <td class="coluna-acoes">
                    <button class="btn-icon" onclick="window.abrirPerfil('${cli.id}')" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
                    <button class="btn-icon" onclick="window.editarCliente('${cli.id}')" title="Editar Cliente"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn-icon btn-add-proj" onclick="window.iniciarNovoProjeto('${cli.id}')" title="Novo Projeto"><i class="fas fa-folder-plus"></i></button>
                </td>
            </tr>
        `).join('');
    },

    renderizarModuloProjetos(container) {
        container.innerHTML = `
            <div id="modulo_projetos" class="painel-modulo">
                <div class="header-modulo">
                    <h2><i class="fas fa-project-diagram"></i> Gestão de Projetos</h2>
                    <div class="acoes-header">
                        <button class="btn-primary btn-auto-width" onclick="window.navegar('clientes')">
                            <i class="fas fa-plus"></i> Novo Projeto (via Cliente)
                        </button>
                    </div>
                </div>

                <div class="card-tecnico card-lista">
                    <div class="busca-interna">
                        <i class="fas fa-search"></i>
                        <input type="text" id="busca_projeto_lista" placeholder="Filtrar por nome, cidade ou cliente..." onkeyup="window.filtrarTabelaLocal('tabela_projetos', this.value)">
                    </div>
                    <table id="tabela_projetos" class="tabela-transversal">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Status</th>
                                <th>Projeto</th>
                                <th>Cliente</th>
                                <th>Localização</th>
                                <th style="text-align: right;">Ações</th>
                            </tr>
                        </thead>
                        <tbody id="corpo_lista_projetos"></tbody>
                    </table>
                </div>
            </div>
        `;
    },

    renderizarTabelaProjetosCompleta(tbody, projetos) {
        if (!tbody) return;
        if (projetos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem;">Nenhum projeto cadastrado.</td></tr>`;
            return;
        }
        tbody.innerHTML = projetos.map(proj => `
            <tr>
                <td>${new Date(proj.dataCriacao).toLocaleDateString()}</td>
                <td>${obterBadgeStatusProjeto(proj.status || 'EM_COTACAO')}</td>
                <td><strong>${proj.nome_projeto}</strong></td>
                <td><a href="javascript:void(0)" onclick="window.abrirPerfil('${proj.clienteId}')" style="text-decoration: none; color: #475569; font-weight: 500; display: inline-flex; align-items: center; gap: 5px;"><i class="fas fa-user"></i> ${proj.clienteNome}</a></td>
                <td>${proj.localizacao}</td>
                <td class="coluna-acoes">
                    <button class="btn-icon" onclick="window.visualizarProjeto('${proj.id}')" title="Visualizar Detalhes"><i class="fas fa-eye"></i></button>
                    <button class="btn-icon" onclick="window.editarProjeto('${proj.id}')" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn-icon" onclick="window.excluirProjeto('${proj.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    },

    renderizarPremissas(container, config, optionsOversizing) {
        // Helper para renderizar linhas de tabela
        const renderRows = (items, type) => (items || []).map(f => `
            <tr>
                <td><input type="number" value="${f.limite}" class="input-estilizado" style="height:28px; padding:4px;"></td>
                <td><input type="number" value="${type === 'mo' ? f.unitario : f.custo}" class="input-estilizado" style="height:28px; padding:4px;"></td>
                <td><button onclick="window.removerLinhaTabela(this)" class="btn-icon"><i class="fas fa-times"></i></button></td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div class="card-tecnico">
                <div class="header-modulo">
                    <h2><i class="fas fa-sliders-h"></i> Painel de Premissas de Engenharia</h2>
                    <div style="display:flex; gap:10px;">
                        <button class="btn-secundario" onclick="window.baixarBackupDados()" title="Baixar Backup Completo">
                            <i class="fas fa-download"></i> Backup Dados
                        </button>
                        <button class="btn-primary" onclick="salvarNovasPremissas()">
                            <i class="fas fa-save"></i> SALVAR CONFIGURAÇÕES
                        </button>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    
                    <!-- COLUNA ESQUERDA: PARÂMETROS -->
                    <div style="display: flex; flex-direction: column; gap: 20px;">
                        
                        <!-- Componentes Premium -->
                        <div class="secao-config">
                            <h3 style="color:var(--primaria); border-bottom: 2px solid #eee; padding-bottom:10px;">
                                <i class="fas fa-gem"></i> Componentes Premium
                            </h3>
                            <div class="grid-inputs">
                                <div class="form-group">
                                    <label>QDG Trifásico (R$)</label>
                                    <input type="number" id="va_qdg_trif_premum" value="${config.materiaisPremium?.va_qdg_trif_premum || 300}" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>QDG Monofásico (R$)</label>
                                    <input type="number" id="va_qdg_mono_premium" value="${config.materiaisPremium?.va_qdg_mono_premium || 150}" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Eletrocalha 100mm (R$)</label>
                                    <input type="number" id="va_eletrocalha_100" value="${config.materiaisPremium?.va_eletrocalha_100 || 158}" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Eletrocalha 50mm (R$)</label>
                                    <input type="number" id="va_eletrocalha_50" value="${config.materiaisPremium?.va_eletrocalha_50 || 85}" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Tampa Acrílico (R$)</label>
                                    <input type="number" id="va_tampa_acrilico" value="${config.materiaisPremium?.va_tampa_acrilico || 335}" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Bloco Distribuição (R$)</label>
                                    <input type="number" id="va_bloco_distribuicao" value="${config.materiaisPremium?.va_bloco_distribuicao || 90}" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Diária Instalador (R$)</label>
                                    <input type="number" id="va_diaria_instalador" value="${config.materiaisPremium?.va_diaria_instalador || 390}" class="input-estilizado">
                                </div>
                            </div>
                        </div>

                        <!-- Custos de Estrutura (Extras) -->
                        <div class="secao-config">
                            <h3 style="color:var(--primaria); border-bottom: 2px solid #eee; padding-bottom:10px;">
                                <i class="fas fa-hammer"></i> Custos de Estrutura (Extras)
                            </h3>
                            <div class="grid-inputs">
                                <div class="form-group">
                                    <label>Solo: Custo Extra (R$/mód)</label>
                                    <input type="number" id="va_estrutura_solo" value="${config.estruturas?.va_estrutura_solo || 125.00}" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Laje: Custo Extra (R$/mód)</label>
                                    <input type="number" id="va_estrutura_laje" value="${config.estruturas?.va_estrutura_laje || 55.00}" class="input-estilizado">
                                </div>
                            </div>
                        </div>

                        <!-- Logística -->
                        <div class="secao-config">
                            <h3 style="color:var(--primaria); border-bottom: 2px solid #eee; padding-bottom:10px;">
                                <i class="fas fa-truck"></i> Logística e Deslocamento
                            </h3>
                            <div class="grid-inputs">
                                <div class="form-group">
                                    <label>Preço Combustível (R$/L)</label>
                                    <input type="number" id="p_preco_combustivel" value="${config.logistica?.precoCombustivel || 6.29}" step="0.01" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Consumo Veículo (km/L)</label>
                                    <input type="number" id="p_consumo_veiculo" value="${config.logistica?.consumoVeiculo || 8.7}" step="0.1" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Adicional Fixo (R$)</label>
                                    <input type="number" id="p_adicional_logistica" value="${config.logistica?.adicionalLogistica || 20}" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Produtividade (Mód/Dia)</label>
                                    <input type="number" id="p_modulos_dia" value="${config.financeiro?.modulosPorDia || 10}" class="input-estilizado">
                                </div>
                            </div>
                        </div>

                        <!-- Financeiro & Comissões -->
                        <div class="secao-config">
                            <h3 style="color:var(--primaria); border-bottom: 2px solid #eee; padding-bottom:10px;">
                                <i class="fas fa-hand-holding-usd"></i> Financeiro & Comissões
                            </h3>
                            <div class="grid-inputs">
                                <div class="form-group">
                                    <label>Fator Lucro Standard</label>
                                    <input type="number" id="p_lucro_standard" value="${config.financeiro?.fatorLucroStandard || 1.1}" step="0.01" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Fator Lucro Premium</label>
                                    <input type="number" id="p_lucro_premium" value="${config.financeiro?.fatorLucroPremium || 1.2}" step="0.01" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Validade Proposta (Dias)</label>
                                    <input type="number" id="p_validade_proposta" value="${config.financeiro?.validadeProposta || 3}" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Piso de Lucro (R$)</label>
                                    <input type="number" id="p_lucro_minimo" value="${config.financeiro?.lucroMinimo || 0}" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Imposto (%)</label>
                                    <input type="number" id="p_imposto" value="${config.financeiro?.imposto || 15}" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Comissão Indicação (%)</label>
                                    <input type="number" id="p_comissao_indicador" value="${config.financeiro?.taxasComissao?.indicador || 3}" step="0.1" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Comissão Representante (%)</label>
                                    <input type="number" id="p_comissao_representante" value="${config.financeiro?.taxasComissao?.representante || 5}" step="0.1" class="input-estilizado">
                                </div>
                            </div>
                        </div>

                        <!-- Análise de Viabilidade -->
                        <div class="secao-config">
                            <h3 style="color:var(--primaria); border-bottom: 2px solid #eee; padding-bottom:10px;">
                                <i class="fas fa-chart-area"></i> Estrutura Tarifária (ANEEL 2026)
                            </h3>
                            <div class="grid-inputs">
                                <div class="form-group">
                                    <label>TUSD Base (R$/MWh)</label>
                                    <input type="number" id="p_tusd_base" value="${config.viabilidade?.tarifas?.tusd_base_mwh || 0}" step="0.01" class="input-estilizado" placeholder="Ex: 569.27">
                                </div>
                                <div class="form-group">
                                    <label>TE Base (R$/MWh)</label>
                                    <input type="number" id="p_te_base" value="${config.viabilidade?.tarifas?.te_base_mwh || 0}" step="0.01" class="input-estilizado" placeholder="Ex: 238.80">
                                </div>
                                <div class="form-group">
                                    <label>Ajuste SCEE (R$/MWh)</label>
                                    <input type="number" id="p_scee_ajuste" value="${config.viabilidade?.tarifas?.te_ajuste_scee_mwh || 0}" step="0.01" class="input-estilizado" placeholder="Ex: -1.94">
                                </div>
                                <div class="form-group">
                                    <label>Fio B Vigente (R$/MWh)</label>
                                    <input type="number" id="p_fio_b_vigente" value="${config.viabilidade?.tarifas?.fio_b_vigente_mwh || 0}" step="0.01" class="input-estilizado" placeholder="Já escalonado">
                                </div>
                                <div class="form-group" style="grid-column: span 2;">
                                    <label style="color: #64748b; font-size: 0.8rem;"><i class="fas fa-info-circle"></i> Nota Técnica</label>
                                    <div style="font-size: 0.8rem; color: #64748b; background: #f1f5f9; padding: 8px; border-radius: 4px;">O Custo de Disponibilidade (30/50/100 kWh) é aplicado automaticamente conforme o tipo de rede (Mono/Bi/Tri) do projeto.</div>
                                </div>
                                <div class="form-group">
                                    <label>Alíquota Impostos (%)</label>
                                    <input type="number" id="p_impostos_perc" value="${config.viabilidade?.tarifas?.aliquota_impostos ? config.viabilidade.tarifas.aliquota_impostos * 100 : (config.viabilidade?.impostosPerc || 25)}" step="0.1" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Inflação Energética (% a.a.)</label>
                                    <input type="number" id="p_inflacao_energetica" value="${config.viabilidade?.inflacaoEnergetica || 7.0}" step="0.1" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Custo Troca Inv. (% do Kit)</label>
                                    <input type="number" id="p_custo_troca_inversor" value="${config.viabilidade?.custoTrocaInversorPerc || 15}" step="0.1" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Taxa de Desconto (VPL %)</label>
                                    <input type="number" id="p_taxa_desconto" value="${config.viabilidade?.taxaDescontoVPL || 12.0}" step="0.1" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Simultaneidade Padrão (%)</label>
                                    <input type="number" id="p_simultaneidade" value="${config.viabilidade?.simultaneidade || 30}" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Ilum. Pública Padrão (% do Total)</label>
                                    <input type="number" id="p_ilum_publica" value="${config.viabilidade?.iluminacaoPublica || 5.0}" step="0.1" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Manutenção Preventiva (% do Capex)</label>
                                    <input type="number" id="p_custo_limpeza" value="${config.viabilidade?.custoLimpezaAnual || 0}" step="0.1" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Degradação Sistêmica (% a.a.)</label>
                                    <input type="number" id="p_degradacao_anual" value="${config.viabilidade?.degradacaoAnual || 0.8}" step="0.01" class="input-estilizado">
                                </div>
                            </div>
                        </div>

                    </div>

                    <!-- COLUNA DIREITA: TABELAS -->
                    <div style="display: flex; flex-direction: column; gap: 20px;">
                        
                        <!-- NOVA SEÇÃO: ENGENHARIA & PERDAS -->
                        <div class="secao-config">
                            <h3 style="color:var(--primaria); border-bottom: 2px solid #eee; padding-bottom:10px;">
                                <i class="fas fa-solar-panel"></i> Engenharia & Perdas (Padrão)
                            </h3>
                            <div class="grid-inputs">
                                <div class="form-group">
                                    <label>Azimute Padrão (°)</label>
                                    <input type="number" id="eng_azimute" value="${config.engenharia?.azimute ?? 0}" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Inclinação Padrão (°)</label>
                                    <input type="number" id="eng_inclinacao" value="${config.engenharia?.inclinacao ?? 10}" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Eficiência Máx. Inv. (%)</label>
                                    <input type="number" id="eng_eficiencia_inv" value="${config.engenharia?.eficienciaInversor ?? 98}" step="0.1" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Perda Temp. Inv. (%)</label>
                                    <input type="number" id="eng_perda_temp_inv" value="${config.engenharia?.perdaTempInversor ?? 1.5}" step="0.1" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Perda Temp. Módulos (%)</label>
                                    <input type="number" id="eng_perda_temp_mod" value="${config.engenharia?.perdaTempModulos ?? 10.13}" step="0.01" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Perdas Cabos (%)</label>
                                    <input type="number" id="eng_cabos" value="${config.engenharia?.cabos ?? 2.0}" step="0.1" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Sujidade/Outros (%)</label>
                                    <input type="number" id="eng_outros" value="${config.engenharia?.outros ?? 2.0}" step="0.1" class="input-estilizado">
                                </div>
                                <div class="form-group">
                                    <label>Indisponibilidade (%)</label>
                                    <input type="number" id="eng_indisp" value="${config.engenharia?.indisponibilidade ?? 0.5}" step="0.1" class="input-estilizado">
                                </div>
                                 <div class="form-group">
                                    <label>Oversizing Padrão (%)</label>
                                    <select id="eng_oversizing" class="input-estilizado">
                                        ${optionsOversizing}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- Tabela Mão de Obra (Terceirizada) -->
                        <div class="secao-config">
                            <div class="secao-header" style="display:flex; justify-content:space-between; align-items:center;">
                                <h3 style="margin:0; color:var(--primaria);"><i class="fas fa-users-cog"></i> Tabela M.O. (Terceirizada)</h3>
                                <button class="btn-icon" onclick="window.adicionarLinhaTabela('corpo_mo', 'mo')" title="Adicionar Faixa"><i class="fas fa-plus"></i></button>
                            </div>
                            <div class="tabela-container" style="max-height: 300px; overflow-y: auto;">
                                <table class="tabela-tecnica">
                                    <thead>
                                        <tr><th>Até (Módulos)</th><th>Valor (R$/mód)</th><th></th></tr>
                                    </thead>
                                    <tbody id="corpo_mo">
                                        ${renderRows(config.tabelas?.maoDeObra, 'mo')}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Tabela Materiais -->
                        <div class="secao-config">
                            <div class="secao-header" style="display:flex; justify-content:space-between; align-items:center;">
                                <h3 style="margin:0; color:var(--primaria);"><i class="fas fa-box-open"></i> Tabela Materiais Base</h3>
                                <button class="btn-icon" onclick="window.adicionarLinhaTabela('corpo_materiais', 'mat')" title="Adicionar Faixa"><i class="fas fa-plus"></i></button>
                            </div>
                            <div class="tabela-container" style="max-height: 300px; overflow-y: auto;">
                                <table class="tabela-tecnica">
                                    <thead>
                                        <tr><th>Até (Módulos)</th><th>Custo Total (R$)</th><th></th></tr>
                                    </thead>
                                    <tbody id="corpo_materiais">
                                        ${renderRows(config.tabelas?.materiais, 'mat')}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        `;
    },

    renderizarResultadosBusca(container, resultados) {
        if (resultados.length === 0) {
            container.innerHTML = `<div class="search-result-item" style="cursor:default; color:#94a3b8;">Nenhum resultado encontrado.</div>`;
        } else {
            container.innerHTML = resultados.map(res => `
                <div class="search-result-item" onclick="window.navegarParaResultado('${res.tipo}', '${res.id}')">
                    <div class="result-icon" style="background:${res.cor}; color:${res.texto};"><i class="fas ${res.icone}"></i></div>
                    <div class="result-info">
                        <span class="result-title">${res.titulo}</span>
                        <span class="result-subtitle">${res.sub}</span>
                    </div>
                </div>
            `).join('');
        }
        container.style.display = 'block';
    }
};