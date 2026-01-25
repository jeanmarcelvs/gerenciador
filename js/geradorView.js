import { formatarMoeda } from './utils.js';

export const geradorView = {

    // Injeta estilos específicos para seleção se não existirem
    injetarEstilosSelecao() {
        if (document.getElementById('estilo-selecao-dinamico')) return;
        const style = document.createElement('style');
        style.id = 'estilo-selecao-dinamico';
        style.innerHTML = `
            .selecionado-usuario {
                border: 2px solid #3b82f6 !important; /* Azul */
                background-color: #eff6ff !important; /* Azul claro suave */
                box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1) !important;
                transform: translateY(-2px);
            }
        `;
        document.head.appendChild(style);
    },

    renderizarBotaoCancelar(onClickHandler) {
        // Verifica se já existe para não duplicar
        if (document.getElementById('btn_cancelar_global')) return;

        const headerContainer = document.querySelector('.header-engenharia-fixo .header-container');
        if (headerContainer) {
            const btn = document.createElement('button');
            btn.id = 'btn_cancelar_global';
            btn.className = 'btn-voltar'; // Reusa classe do visualizar
            btn.innerHTML = '<i class="fas fa-times"></i> Cancelar';
            btn.onclick = onClickHandler;
            
            // Estilos inline para garantir visibilidade no header escuro (match visualizar-proposta)
            btn.style.background = 'transparent';
            btn.style.border = '1px solid transparent';
            btn.style.cursor = 'pointer';
            btn.style.color = '#ffffff';
            btn.style.fontWeight = '600';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.gap = '5px';
            btn.style.marginRight = '15px';
            btn.style.padding = '6px 12px';
            btn.style.borderRadius = '6px';
            btn.style.transition = 'all 0.2s';

            // Efeito Hover (Aspecto de Cancelar)
            btn.onmouseover = () => {
                btn.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'; // Vermelho translúcido
                btn.style.color = '#fca5a5'; // Vermelho claro
            };
            btn.onmouseout = () => {
                btn.style.backgroundColor = 'transparent';
                btn.style.color = '#ffffff';
            };

            // Insere antes do primeiro filho (geralmente a logo)
            headerContainer.insertBefore(btn, headerContainer.firstChild);
        }
    },

    renderizarMenuNavegacao(container, labels, indiceAtual, maxAlcancado) {
        // --- BOTÃO VOLTAR (ESQUERDA) ---
        const btnVoltarHTML = `
            <button class="btn-nav-wizard voltar" onclick="window.voltarEtapa()" ${indiceAtual === 0 ? 'disabled style="opacity:0.5; cursor:default;"' : ''}>
                <i class="fas fa-arrow-left"></i> Voltar
            </button>
        `;

        // --- LISTA DE ETAPAS (CENTRO) ---
        let etapasHTML = '<div class="lista-etapas-scroll">';
        labels.forEach((label, index) => {
            const isAtivo = index === indiceAtual;
            const isAcessivel = index <= maxAlcancado;
            const isPassado = index < indiceAtual;

            let classe = 'item-etapa ' + (isAtivo ? 'ativo' : (isAcessivel ? 'acessivel' : 'bloqueado'));
            const onclick = isAcessivel ? `onclick="window.navegarPeloMenu(${index})"` : '';
            const icone = isPassado ? '<i class="fas fa-check" style="font-size: 0.7rem; margin-right: 5px;"></i>' : `<span style="margin-right: 5px; opacity: 0.7;">${index + 1}.</span>`;

            etapasHTML += `<div class="${classe}" ${onclick}>${icone}${label}</div>`;

            if (index < labels.length - 1) {
                etapasHTML += `<div class="separador-etapa"><i class="fas fa-chevron-right"></i></div>`;
            }
        });
        etapasHTML += '</div>';

        // --- BOTÃO AVANÇAR (DIREITA) ---
        const btnAvancarHTML = `
            <button id="btn_nav_avancar" class="btn-nav-wizard avancar" disabled>
                Avançar <i class="fas fa-arrow-right"></i>
            </button>
        `;

        container.innerHTML = btnVoltarHTML + etapasHTML + btnAvancarHTML;
    },

    renderizarSugestoesModulos(container, top4Campeoes, restante, pMinimaKwp, estadoSelecaoModulo) {
        // Garante que os estilos existam
        this.injetarEstilosSelecao();

        let htmlSugestoes = `
            <div class="secao-header">
                <i class="fas fa-check-circle" style="color: #ffcc00;"></i>
                <span>Sugestões de Módulos (Top 4)</span>
            </div>
            <div class="grid-sugestoes">
        `;

        top4Campeoes.forEach((mod, index) => {
            const isMelhor = index === 0;
            const isSelecionado = Number(estadoSelecaoModulo.watts) === Number(mod.watts) && Number(estadoSelecaoModulo.qtd) === Number(mod.quantidade);
            let classesCard = 'card-modulo bloco-animado' + (isSelecionado ? ' selecionado-usuario' : '');
            if (isMelhor) classesCard += ' recomendado-ia';
            if (isSelecionado) classesCard += ' selecionado-usuario';

            htmlSugestoes += `
                <div class="${classesCard}" id="card_mod_${mod.watts}_${mod.quantidade}">
                    ${!isMelhor ? `<div class="selo-opcao" style="font-size:0.7rem; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin-bottom:5px;">Opção ${index + 1}</div>` : ''}
                    <span class="label-potencia">${mod.watts}W</span>
                    <div class="dados-resumo">
                        <p>Quantidade: <strong>${mod.quantidade} un</strong></p>
                        <p>Potência Total: <strong>${mod.potenciaTotal.toFixed(2)} kWp</strong></p>
                        <small style="color: #64748b; font-size: 0.8rem;">Sobra: +${mod.excedente.toFixed(2)} kWp</small>
                    </div>
                    <button class="btn-selecionar-campeao" onclick="window.validarEConfirmarModulo(${mod.watts}, ${mod.quantidade}, ${pMinimaKwp})">
                        ${isMelhor ? 'Confirmar Sugestão' : 'Selecionar Este'}
                    </button>
                </div>
            `;
        });

        htmlSugestoes += `</div>`;

        if (restante.length > 0) {
            htmlSugestoes += `
                <div class="area-expansao-modulos">
                    <button class="btn-ver-todos" onclick="window.toggleListaCompleta()">
                        <i class="fas fa-list"></i> Ver outras ${restante.length} opções de módulos
                    </button>
                    <div id="lista_completa_scroll" class="lista-oculta-scroll" style="display: none;"></div>
                </div>
            `;
        }

        container.innerHTML = htmlSugestoes;
    },

    renderizarListaCompletaModulos(container, listaRestante, pMinimaKwp) {
        if (!container) return;
        let tableHTML = '<table class="tabela-tecnica"><thead><tr><th>Modelo</th><th>Qtd</th><th>Pot. Total</th><th>Ação</th></tr></thead><tbody>';
        listaRestante.forEach((mod, index) => {
            // Adiciona lógica para destacar se estiver selecionado (embora seja menos comum na lista completa, ajuda na consistência)
            tableHTML += `
                <tr>
                    <td>${mod.watts}W</td>
                    <td>${mod.quantidade} un</td>
                    <td>${mod.potenciaTotal.toFixed(2)} kWp</td>
                    <td><button class="btn-selecionar" onclick="window.validarEConfirmarModulo(${mod.watts}, ${mod.quantidade}, ${pMinimaKwp})">Selecionar</button></td>
                </tr>
            `;
        });
        tableHTML += '</tbody></table>';
        container.innerHTML = tableHTML;
    },

    renderizarResumoSuperiorFinanceiro(container, modulosTxt, invsTxt, expansaoTxt, kitStd, kitPrm) {
        if (!container) return;

        const renderTableRows = (kitData) => {
             return kitData && kitData.itens ? kitData.itens.map(item => `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 5px;">${item.item}</td>
                    <td style="text-align: center; padding: 5px;">${item.qtd} ${item.un}</td>
                    <td style="text-align: right; padding: 5px;">${formatarMoeda(item.total)}</td>
                </tr>
            `).join('') : '<tr><td colspan="3">Sem dados</td></tr>';
        };

        const renderTableFooter = (kitData) => {
             // Lógica de exibição do Ajuste (Pode ser Desconto ou Acréscimo)
             const ajuste = kitData?.ajusteCalibracao || 0;
             const isDesconto = ajuste > 0;
             const labelAjuste = isDesconto ? "Desconto Kit" : "Ajuste Técnico (Kit)";
             const valorAjuste = isDesconto ? `- ${formatarMoeda(ajuste)}` : `+ ${formatarMoeda(Math.abs(ajuste))}`;
             const corAjuste = isDesconto ? "#16a34a" : "#ea580c"; // Verde ou Laranja

             return `
                <tr style="font-weight: 600; background: #f0fdf4;">
                    <td style="padding: 5px;">Subtotal Produtos</td>
                    <td></td>
                    <td style="text-align: right; padding: 5px;">${formatarMoeda(kitData?.custoBruto)}</td>
                </tr>
                <tr>
                    <td style="padding: 5px; color: ${corAjuste};">${labelAjuste}</td>
                    <td></td>
                    <td style="text-align: right; padding: 5px; color: ${corAjuste};">${valorAjuste}</td>
                </tr>
                <tr>
                    <td style="padding: 5px;">Frete CIF</td>
                    <td></td>
                    <td style="text-align: right; padding: 5px;">${formatarMoeda(kitData?.frete)}</td>
                </tr>
                <tr style="font-weight: 700; color: #0f172a; font-size: 0.9rem;">
                    <td style="padding: 5px;">Total Custo</td>
                    <td></td>
                    <td style="text-align: right; padding: 5px;">${formatarMoeda(kitData?.total)}</td>
                </tr>
             `;
        };

        container.innerHTML = `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid var(--primaria); padding: 12px 20px; margin-bottom: 25px; border-radius: 6px; display: flex; flex-wrap: wrap; gap: 20px; align-items: center; justify-content: space-between; font-size: 0.9rem; color: #475569; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                <div>
                    <div style="display:flex; align-items:center; gap:5px;"><span style="display:block; font-size:0.7rem; text-transform:uppercase; color:#94a3b8; font-weight:700; letter-spacing:0.5px;">Módulos</span> <button class="btn-icon-sm" onclick="window.navegarPeloMenu(1)" title="Editar Módulos"><i class="fas fa-pencil-alt"></i></button></div>
                    <strong style="color:#0f172a; font-size:1rem;">${modulosTxt}</strong>
                </div>
                <div style="flex: 1; min-width: 200px;">
                    <div style="display:flex; align-items:center; gap:5px;"><span style="display:block; font-size:0.7rem; text-transform:uppercase; color:#94a3b8; font-weight:700; letter-spacing:0.5px;">Inversores</span> <button class="btn-icon-sm" onclick="window.navegarPeloMenu(2)" title="Editar Inversores"><i class="fas fa-pencil-alt"></i></button></div>
                    <strong style="color:#0f172a; font-size:1rem;">${invsTxt}</strong>
                </div>
                 <div>
                    <span style="display:block; font-size:0.7rem; text-transform:uppercase; color:#94a3b8; font-weight:700; letter-spacing:0.5px;">Expansão Futura</span>
                    <strong style="color:#0f172a; font-size:1rem;">${expansaoTxt}</strong>
                </div>
            </div>
        `;
    },

    renderizarTabelaHuawei(corpoSugestoes, corpoManual, sugestoesOrdenadas, listaProcessada, estadoSelecaoInversor, dadosContexto) {
        // Garante que os estilos existam
        this.injetarEstilosSelecao();

        // --- SUGESTÕES INTELIGENTES ---
        if (corpoSugestoes) {
            const htmlRows = sugestoesOrdenadas.map((sug, index) => {
                const htmlComposicao = sug.itens.map(it => 
                    `<div class="composicao-item" style="display:flex; align-items:center; gap:5px; margin-bottom:2px;">
                        <span class="modelo-txt" style="font-size:13px;">${it.qtd}x ${it.mod}</span>
                    </div>`
                ).join('');

                const isIdeal = index === 0;
                const isSelecionado = estadoSelecaoInversor.tipo === 'SUGESTAO' && Number(estadoSelecaoInversor.id) === index;
                let classesLinha = 'inversor-sugerido' + (isIdeal ? ' ideal' : '') + (isSelecionado ? ' selecionado-usuario' : '');

                return `
                    <tr class="${classesLinha}">
                        <td class="col-detalhe-inv" style="vertical-align: middle; padding: 12px;">
                            <div style="margin-bottom: 6px; display: flex; gap: 5px; flex-wrap: wrap;">
                                ${isIdeal ? '<span class="badge-recomendado"><i class="fas fa-star"></i>custo-benefício</span>' : ''}
                                ${sug.badgeEficiencia}
                            </div>
                            ${htmlComposicao}
                        </td>
                        <td style="padding: 12px 15px; vertical-align: middle;">
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                <span style="font-weight: 700; color: #334155; font-size: 0.9rem;">${(sug.potNominalTotal / 1000).toFixed(1)} kW</span>
                                <span class="tag-tipo" style="font-size: 0.7rem; color: #64748b; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; width: fit-content; border: 1px solid #e2e8f0;">${sug.tipoDesc}</span>
                            </div>
                        </td>
                        <td style="text-align: center; color: #64748b;">${sug.totalMPPTs}</td>
                        <td style="color: #94a3b8; font-size: 0.85em;">${(sug.capTotal / 1000).toFixed(1)} kWp</td>
                        <td style="text-align: center;">
                            <span class="badge-expansao">+${sug.numPlacasExp} un</span>
                            <div style="font-size: 0.65rem; margin-top: 2px;" title="Sobrecarga DC/AC Resultante (STC)">${sug.labelExpansao}</div>
                        </td>
                        <td style="text-align: center; font-weight: 600; color: #15803d;">
                            ${Math.round(sug.geracaoPotencial)} kWh
                        </td>
                        <td style="text-align: center;">
                            <button class="btn-primary-sm" onclick="window.aplicarComposicao('${encodeURIComponent(JSON.stringify(sug.itens))}', ${index})">
                                <i class="fas fa-check"></i> Selecionar
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            corpoSugestoes.innerHTML = htmlRows || `<tr><td colspan="4" style="text-align:center; color:#64748b;">Nenhuma combinação automática encontrada. Use o catálogo abaixo.</td></tr>`;
        }

        // --- TABELA MANUAL ---
        if (corpoManual) {
            let htmlManual = '';
            if (listaProcessada.length === 0) {
                htmlManual = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">
                    Nenhum inversor Huawei compatível encontrado para ${(dadosContexto.potDCInstaladaWp / 1000).toFixed(1)} kWp.
                </td></tr>`;
            } else {
                htmlManual = listaProcessada.map((inv) => {
                    const isSelecionado = estadoSelecaoInversor.tipo === 'MANUAL' && estadoSelecaoInversor.id === inv.mod;
                    const classeManual = 'item-inversor-manual' + (isSelecionado ? ' selecionado-usuario' : '');

                    return `
                    <tr class="${classeManual}" style="background-color: ${isSelecionado ? '#eff6ff' : '#ffffff'}; border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 12px 15px; vertical-align: middle;">
                            <strong style="color: #0f172a; font-size: 0.95rem;">${inv.mod}</strong>
                        </td>
                        <td style="padding: 12px 15px; vertical-align: middle;">
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                <span style="font-weight: 700; color: #334155; font-size: 0.9rem;">${(inv.nom / 1000).toFixed(1)} kW</span>
                                <span class="tag-tipo" style="font-size: 0.7rem; color: #64748b; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; width: fit-content; border: 1px solid #e2e8f0;">${inv.tipo}</span>
                            </div>
                        </td>
                        <td style="text-align: center; padding: 12px; vertical-align: middle; color: #64748b;">${inv.mppt}</td>
                        <td style="padding: 12px; vertical-align: middle; color: #94a3b8; font-size: 0.85em;">${(inv.capMaxUnit / 1000).toFixed(1)} kWp</td>
                        
                        <td style="text-align: center; padding: 12px; vertical-align: middle;">
                            <span class="badge-expansao">+${inv.numPlacasExp} un</span>
                            <div style="font-size: 0.65rem; margin-top: 2px;" title="Sobrecarga DC/AC Resultante (STC)">${inv.labelExpansao}</div>
                        </td>

                        <td style="text-align: center; padding: 12px; vertical-align: middle;">
                            <input type="number" id="qtd_${inv.mod.replace(/\s/g, '')}" value="${inv.qtdCalculada}" min="1" max="10" class="input-qtd-tabela" style="width: 60px; text-align: center; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 600; color: #0f172a;" oninput="window.atualizarPotencialLinha('${inv.mod}', ${inv.nom})">
                        </td>

                        <td style="text-align: center; font-weight: 700; color: #15803d; padding: 12px; vertical-align: middle;">
                            <span id="potencial_${inv.mod.replace(/\s/g, '')}">${Math.round(inv.geracaoTotal)} kWh</span>
                        </td>
                        
                        <td style="text-align: center; padding: 12px; vertical-align: middle;">
                            <button class="btn-secundario-sm" style="background: white; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; color: #475569; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"
                                onmouseover="this.style.borderColor='#94a3b8'; this.style.color='#1e293b'; this.style.transform='translateY(-1px)'"
                                onmouseout="this.style.borderColor='#cbd5e1'; this.style.color='#475569'; this.style.transform='translateY(0)'"
                                onclick="window.adicionarAoCarrinho('${inv.mod}', ${inv.nom}, '${inv.tipo}', ${inv.mppt})">
                                <i class="fas fa-plus" style="color: var(--primaria); margin-right: 4px;"></i> Adicionar
                            </button>
                        </td>
                    </tr>
                `;
                }).join('');
            }
            corpoManual.innerHTML = htmlManual;
        }
    },

    renderizarOpcionaisPremium(containerWrapper, itens, estadoAnterior) {
        let html = `
            <div class="card-tecnico" style="margin-top: 10px; padding: 10px 15px;">
                <h4 style="color: #334155; font-size: 0.9rem; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;"><i class="fas fa-microchip" style="color: #ffcc00;"></i> Composição Técnica Premium</h4>
                <table class="tabela-transversal" style="font-size: 0.85rem;">
                    <thead>
                        <tr>
                            <th style="width: 30px; text-align: center; padding: 4px;">Inc.</th>
                            <th style="padding: 4px;">Item de Infraestrutura</th>
                            <th style="padding: 4px;">Dimensionamento</th>
                            <th style="text-align: center; padding: 4px;">Qtd</th>
                            <th style="text-align: right; padding: 4px;">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        html += itens.map(item => {
            let isChecked = item.selecionadoPadrao;
            if (Object.keys(estadoAnterior).length > 0) {
                isChecked = !!estadoAnterior[item.id];
            }
            if (item.obrigatorio) isChecked = true;

            const checkedAttr = isChecked ? 'checked' : '';
            const isDisabled = item.obrigatorio ? 'disabled' : '';
            const qtdDisplay = item.qtd ? `${item.qtd} un` : '1 un';
            const valorDisplay = item.valor.toLocaleString('pt-br', {style: 'currency', currency: 'BRL'});

            return `
                <tr style="height: 32px;">
                    <td style="text-align: center; padding: 2px;">
                        <input type="checkbox" class="chk-opcional input-financeiro" style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--primaria, #16a34a);" data-id="${item.id}" data-valor="${item.valor}" ${checkedAttr} ${isDisabled} onchange="window.calcularEngenhariaFinanceira()">
                    </td>
                    <td style="color: #334155; font-weight: 500; padding: 2px 5px;">${item.nome}</td>
                    <td style="padding: 2px 5px;"><span class="badge" style="background: #f1f5f9; padding: 1px 6px; border-radius: 4px; font-size: 0.7rem;">${item.badge}</span></td>
                    <td style="text-align: center; color: #64748b; padding: 2px 5px;">${qtdDisplay}</td>
                    <td style="text-align: right; color: #0f172a; font-weight: 600; padding: 2px 5px;">${valorDisplay}</td>
                </tr>
            `;
        }).join('');

        html += `</tbody></table></div>`;
        containerWrapper.innerHTML = html;
    },

    renderizarListaInversoresSelecionados(listaContainer, carrinhoInversores, overAlvo) {
        let htmlCarrinho = "";
        carrinhoInversores.forEach((inv, idx) => {
            const capDC = inv.nominal * overAlvo * inv.qtd;
            htmlCarrinho += `
                <li class="tag-inversor-selecionado">
                    <strong>${inv.qtd}x</strong>&nbsp;${inv.modelo}
                    <span style="font-weight:normal; margin-left:5px; font-size:0.8em; color:#64748b;">
                        (${(capDC / 1000).toFixed(1)} kWp)
                    </span>
                    <i class="fas fa-times-circle" onclick="window.removerDoCarrinho(${idx})" title="Remover"></i>
                </li>`;
        });
        listaContainer.innerHTML = htmlCarrinho;
    },

    renderizarResumoTecnico(resumoContainer, geracaoX_Projeto, numPlacasExp, geracaoMaximaTotal, avisos) {
        resumoContainer.innerHTML = `
            <div class="grid-resumo" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 0.9rem;">
                <div>Geração Atual:<br><strong>${geracaoX_Projeto.toFixed(0)} kWh</strong></div>
                <div>Expansão:<br><strong>+${numPlacasExp} un.</strong></div>
                <div style="color: #15803d;">Geração Máxima:<br><strong id="gen_max_txt">${geracaoMaximaTotal.toFixed(0)} kWh</strong></div>
            </div>
            ${avisos.length > 0 ? `<div class="avisos-tecnicos" style="margin-top: 10px;">${avisos.join('')}</div>` : ''}
        `;
    },

    renderizarPainelFinanceiro(container, res, origemVenda) {
        if (!container) return;

        const formatarLinha = (label, valor, destaque = false, mostrarPerc = true, suffix = '') => {
            const moeda = formatarMoeda(valor);
            const percServico = res.precoVendaServico > 0 ? ((valor / res.precoVendaServico) * 100).toFixed(1) : '0.0';
            const percTotal = res.valorTotal > 0 ? ((valor / res.valorTotal) * 100).toFixed(1) : '0.0';
            
            const styleLabel = destaque ? 'font-weight: 700; color: #0f172a;' : 'color: #334155;';
            const styleValor = destaque ? 'font-weight: 700; color: #0f172a;' : 'font-weight: 600; color: #0f172a;';
            
            let htmlPerc = '';
            if (mostrarPerc) {
                htmlPerc = `
                    <span style="font-size: 0.7rem; color: #64748b; background: #f1f5f9; padding: 1px 4px; border-radius: 4px; margin-left: 6px;" title="% sobre Serviço">${percServico}% Srv</span>
                    <span style="font-size: 0.7rem; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; padding: 0px 4px; border-radius: 4px; margin-left: 4px;" title="% sobre Total">${percTotal}% Tot</span>
                `;
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

        let html = ``;
        html += formatarLinha('Materiais de Inst:', res.custoMateriais);
        
        const suffixDias = `<span style="font-size: 0.85em; color: #94a3b8; font-weight: normal; margin-left: 5px;">(${res.diasObra}d)</span>`;
        html += `
            <div class="linha-custo" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <div style="display: flex; align-items: center;">
                    <span style="color: #334155;">M.O.:</span>
                    ${suffixDias}
                    <span style="font-size: 0.7rem; color: #64748b; background: #f1f5f9; padding: 1px 4px; border-radius: 4px; margin-left: 6px;" title="% sobre Serviço">${res.precoVendaServico > 0 ? ((res.custoMO / res.precoVendaServico) * 100).toFixed(1) : '0.0'}% Srv</span>
                    <span style="font-size: 0.7rem; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; padding: 0px 4px; border-radius: 4px; margin-left: 4px;" title="% sobre Total">${res.valorTotal > 0 ? ((res.custoMO / res.valorTotal) * 100).toFixed(1) : '0.0'}% Tot</span>
                </div>
                <span style="font-weight: 600; color: #0f172a;">${formatarMoeda(res.custoMO)}</span>
            </div>
        `;
        
        html += formatarLinha('Logística:', res.custoLogistica);
        
        if (res.comissao > 0) {
            const labelComissao = `Comissão (${origemVenda === 'indicador' ? 'Ind.' : 'Rep.'}):`;
            html += formatarLinha(labelComissao, res.comissao);
        }

        html += `<hr style="margin: 10px 0; border-color: #e2e8f0;">`;
        html += formatarLinha('Lucro:', res.lucroReal, true);
        html += formatarLinha('Imposto:', res.impostoReal, true);
        html += `<hr style="margin: 10px 0; border-color: #e2e8f0;">`;
        html += formatarLinha('Serviço:', res.precoVendaServico, true, true);

        html += `
            <div class="total-geral-proposta" style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 2px solid #e2e8f0;">
                <span style="font-weight: 800; color: #0f172a; font-size: 1.1rem;">Total Proposta:</span>
                <strong style="font-weight: 800; color: #16a34a; font-size: 1.2rem;">${formatarMoeda(res.valorTotal)}</strong>
            </div>
        `;

        container.innerHTML = html;
    },

    renderizarResumoExecutivo(secao, dados, projetoCompleto) {
        if (!secao) return;

        const clienteNome = projetoCompleto.nome || 'Cliente';
        const projNome = projetoCompleto.projeto.nome_projeto || 'Projeto';
        const local = `${projetoCompleto.projeto.cidade}/${projetoCompleto.projeto.uf}`;
        const consumo = projetoCompleto.projeto.consumo || 0;
        const tipoTelhado = projetoCompleto.projeto.tipoTelhado || 'Não informado';

        const potSistema = ((dados.qtdModulos * dados.potenciaModulo) / 1000).toFixed(2);
        const modulosDesc = `${dados.qtdModulos}x ${dados.potenciaModulo}W`;
        const potInversoresAC = dados.inversores.reduce((acc, i) => acc + (i.nominal * i.qtd), 0) / 1000;

        const invDesc = dados.inversores.map(i => {
            const manualTag = dados.isManual ? '<span style="color:#f59e0b; font-size:0.8em;">(Manual)</span>' : '';
            return `<div><strong>${i.qtd}x</strong> ${i.modelo} ${manualTag}</div>`;
        }).join('');
        
        let tempoObraHtml = '';
        if (dados.std.diasObra === dados.prm.diasObra) {
            tempoObraHtml = `Tempo estimado de obra: <strong>${dados.prm.diasObra} dias</strong>`;
        } else {
            tempoObraHtml = `
                <div style="display:flex; justify-content:center; gap:20px; font-size: 0.9rem;">
                    <span>Std: <strong>${dados.std.diasObra} dias</strong></span>
                    <span style="border-left: 1px solid #bbf7d0; padding-left: 20px;">Prm: <strong>${dados.prm.diasObra} dias</strong></span>
                </div>
            `;
        }

        const html = `
            <div class="resumo-geral-card" style="background: white; border: 1px solid #cbd5e1; border-radius: 12px; padding: 30px; margin-top: 30px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
                
                <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 15px; margin-bottom: 25px; text-align: center;">
                    <h3 style="color: #0f172a; font-size: 1.2rem; margin: 0;"><i class="fas fa-clipboard-list" style="color: var(--primaria);"></i> Resumo Geral da Proposta</h3>
                    <p style="color: #64748b; margin-top: 5px; font-size: 0.9rem;">Confira os dados antes de salvar</p>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px;">
                    
                    <!-- Coluna 1: Contexto -->
                    <div style="background: #f8fafc; padding: 20px; border-radius: 10px; border: 1px solid #e2e8f0;">
                        <h4 style="color: #334155; font-size: 1rem; margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
                            <i class="fas fa-user-tag"></i> Dados do Projeto
                        </h4>
                        <div style="display: grid; grid-template-columns: 1fr; gap: 10px; font-size: 0.9rem; color: #475569;">
                            <div style="display: flex; justify-content: space-between;"><span>Cliente:</span> <strong style="color: #0f172a;">${clienteNome}</strong></div>
                            <div style="display: flex; justify-content: space-between;"><span>Projeto:</span> <strong style="color: #0f172a;">${projNome}</strong></div>
                            <div style="display: flex; justify-content: space-between;"><span>Local:</span> <strong style="color: #0f172a;">${local}</strong></div>
                            <div style="display: flex; justify-content: space-between;"><span>Consumo:</span> <strong style="color: #0f172a;">${consumo} kWh</strong></div>
                            <div style="display: flex; justify-content: space-between;"><span>Estrutura:</span> <strong style="color: #0f172a;">${tipoTelhado}</strong></div>
                        </div>
                    </div>

                    <!-- Coluna 2: Engenharia -->
                    <div style="background: #f8fafc; padding: 20px; border-radius: 10px; border: 1px solid #e2e8f0;">
                        <h4 style="color: #334155; font-size: 1rem; margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
                            <i class="fas fa-microchip"></i> Solução Técnica
                        </h4>
                        <div style="display: grid; grid-template-columns: 1fr; gap: 10px; font-size: 0.9rem; color: #475569;">
                            <div style="display: flex; justify-content: space-between;"><span>Potência DC:</span> <strong style="color: #0f172a;">${potSistema} kWp</strong></div>
                            <div style="display: flex; justify-content: space-between;"><span>Módulos:</span> <strong style="color: #0f172a;">${modulosDesc}</strong></div>
                            <div style="display: flex; justify-content: space-between;"><span>Potência Nominal Inversores:</span> <strong style="color: #0f172a;">${potInversoresAC.toFixed(2)} kW</strong></div>
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;"><span>Inversores:</span> <div style="text-align: right; color: #0f172a;">${invDesc}</div></div>
                            <div style="display: flex; justify-content: space-between;"><span>Oversizing (DC/AC):</span> <strong style="color: #0f172a;">${dados.oversizing}</strong></div>
                            <div style="display: flex; justify-content: space-between; align-items: center;"><span>Eficiência Energética:</span> <div>${dados.badgeEficiencia}</div></div>
                            <div style="display: flex; justify-content: space-between;"><span>Geração Estimada:</span> <strong style="color: #16a34a;">${dados.geracaoMensal} kWh/mês</strong></div>
                            <div style="display: flex; justify-content: space-between;"><span>Expansão (Energia):</span> <strong style="color: #0f172a;">${dados.geracaoMax}</strong></div>
                            <div style="display: flex; justify-content: space-between;"><span>Expansão (Módulos):</span> <strong style="color: #0f172a;">+${dados.qtdModulosExpansao} un</strong></div>
                        </div>
                    </div>
                </div>

                <!-- Bloco Financeiro -->
                <div style="background: #f0fdf4; padding: 25px; border-radius: 10px; border: 1px solid #bbf7d0; text-align: center; margin-bottom: 30px;">
                    <h4 style="color: #166534; font-size: 1.1rem; margin-bottom: 20px;">Comparativo de Investimento</h4>
                    <div style="display: flex; justify-content: center; gap: 40px; align-items: flex-end;">
                        <div>
                            <span style="display: block; font-size: 0.85rem; color: #475569; margin-bottom: 5px;">Standard</span>
                            <span style="font-size: 1.3rem; font-weight: 800; color: #475569; line-height: 1;">${(dados.std.valorTotal || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</span>
                        </div>
                        <div style="padding-left: 40px; border-left: 1px solid #bbf7d0;">
                            <span style="display: block; font-size: 0.85rem; color: #15803d; margin-bottom: 5px;">Premium</span>
                            <span style="font-size: 1.5rem; font-weight: 800; color: #16a34a; line-height: 1;">${(dados.prm.valorTotal || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</span>
                        </div>
                    </div>
                    <div style="margin-top: 15px; font-size: 0.9rem; color: #166534;">
                        ${tempoObraHtml}
                    </div>
                </div>

                <!-- Container para o Botão -->
                <div id="container_botao_salvar_final" style="display: flex; justify-content: center;">
                    <!-- Botão será injetado aqui -->
                </div>

            </div>
        `;

        secao.innerHTML = html;
    }
};