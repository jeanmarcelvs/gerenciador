import db from './databaseService.js';
import { baseDadosAlagoas, obterHSPBruto, calcularRendimentoCientifico, dimensionarSistema, obterModelosFoco, obterInversoresHuawei, calcularCustoKit, calcularCustoMateriaisBasicos, calcularMaoObraBase, calcularCustoLogistica, calcularExpansaoInversor, calcularEspacamentoFileiras, calcularAnaliseFinanceira } from './model.js';
import { coordenadasEstados } from './coordenadasEstados.js'; // Mantido para fallback
import { higienizarParaCalculo, mostrarLoadingOverlay, esconderLoadingOverlay, customAlert, customConfirm, customPrompt } from './utils.js';
import { geradorView } from './geradorView.js';

// Trava de Segurança
if (!sessionStorage.getItem('auth_belenergy')) {
    window.location.href = 'central-belenergy.html';
}

// --- TRAVA DE AUTOMAÇÃO (IMPEDE RESETS EM CASCATA) ---
let isAutomating = false;

document.addEventListener('DOMContentLoaded', async () => {
    // Sincronização Inicial com D1
    mostrarLoadingOverlay();
    await db.sincronizarTudo();
    esconderLoadingOverlay();

    // Inicializa lista de inversores com dados do DB
    let inversoresHuawei = obterInversoresHuawei();
    let modelosUnicos = obterModelosFoco();
    console.log(`Catálogo carregado: ${inversoresHuawei.length} inversores, ${modelosUnicos.length} potências de módulos únicas.`);

    // --- LÓGICA DE CARGA RELACIONAL ---
    const clienteId = sessionStorage.getItem('cliente_ativo_id');
    const projetoId = sessionStorage.getItem('projeto_ativo_id');

    if (!clienteId || !projetoId) {
        await customAlert("Dados do cliente ou projeto não encontrados. Retornando para a lista.", "Erro", "erro");
        window.location.href = 'clientes-lista.html';
        return;
    }

    const cliente = db.listar('clientes').find(c => c.id === clienteId);
    const projeto = db.listar('projetos').find(p => p.id === projetoId);

    // Monta o objeto completo para o dimensionamento
    const projetoCompleto = { ...cliente, projeto: projeto };

    if (!projetoCompleto) {
        await customAlert("Dados do projeto não encontrados. Reinicie o processo.", "Erro", "erro");
        window.location.href = 'cadastro-cliente.html';
        return;
    }

    // --- Elementos da Interface ---
    const inputConsumo = document.getElementById('uc_consumo');
    const inputHSPBruto = document.getElementById('hsp_bruto');
    const pEficiInv = document.getElementById('p_efici_inv'); // Eficiência do Inversor
    const pTempInv = document.getElementById('p_temp_inv'); // Perda por Temperatura no Inversor
    const pTempMod = document.getElementById('p_temp_mod'); // Perda Temp. Módulos
    const pCabosTotal = document.getElementById('p_cabos_total'); // Perdas em Cabos
    const pExtras = document.getElementById('p_extras'); // Outras perdas (Sujidade, Sombreamento)
    const pIndisp = document.getElementById('p_indisp'); // Indisponibilidade
    const selectModulo = document.getElementById('select_modulo_comparativo');
    const totalModulosDisplay = document.getElementById('total_modulos_projeto');
    const btnGerarProposta = document.getElementById('btn_gerar_proposta');
    const msgValidacaoElement = document.getElementById('msg_validacao'); // FIX: Referência global para evitar perda no DOM
    const inputTipoLigacao = document.getElementById('uc_tipo_padrao');

    // Elementos da nova tabela
    const containerSugestaoPainel = document.getElementById('container_sugestao_painel'); // Agora um card
    const displayModuloSelecionado = document.getElementById('display_modulo_selecionado');
    const wrapperEtapaTecnica = document.getElementById('wrapper-etapa-tecnica');
    const wrapperEtapaFinanceira = document.getElementById('wrapper-etapa-financeira');

    // --- Elementos do Painel Fixo ---
    const fixoPotMinima = document.getElementById('fixo_p_minima');
    const fixoPotReal = document.getElementById('fixo_p_real');
    const fixoPotAC = document.getElementById('fixo_p_ac');
    const fixoRatio = document.getElementById('fixo_ratio');
    const fixoExpansaoMod = document.getElementById('fixo_expansao_mod');
    const fixoExpansaoGeracao = document.getElementById('fixo_expansao_geracao');
    const fixoGeracao = document.getElementById('fixo_geracao');
    const fixoPr = document.getElementById('fixo_pr_final');
    const fixoTipoRede = document.getElementById('fixo_tipo_rede');

    // --- PREENCHIMENTO AUTOMÁTICO (Dados do Projeto) ---
    // Injeta os dados de consumo e tipo de ligação nos inputs ocultos
    if (inputConsumo) {
        inputConsumo.value = projeto.consumo || 0;
    }
    if (inputTipoLigacao) {
        inputTipoLigacao.value = projeto.tipoLigacao || 'monofasico';
    }

    // --- CONFIGURAÇÃO DE DATAS (VALIDADE) ---
    const configGlobal = db.buscarConfiguracao('premissas_globais') || {};
    const diasValidade = configGlobal.financeiro?.validadeProposta || 3;
    
    // Define dias de validade padrão
    if (document.getElementById('dias_validade_proposta')) {
        document.getElementById('dias_validade_proposta').value = diasValidade;
    }

    // --- Variáveis de Estado ---
    // ESTRUTURA DE PROPOSTA DUPLA (PREPARADA PARA D1)
    let projetoGerenciador = {
        // Estado Unificado
        etapaIndex: 0,
        maxEtapaIndex: 0,
        precoCalculado: false,
        // Dados Financeiros Separados
        financeiro: { standard: {}, premium: {} }
    };

    let hspBruto = 0;
    let latitude = 0;
    let dimensionamentoCompleto = null;
    let modoOrientacao = 'simples'; // 'simples' ou 'composto'

    // Novo estado para o carrinho
    let carrinhoInversores = [];

    // Estado visual da seleção de inversores (UX)
    let estadoSelecaoInversor = { tipo: null, id: null }; // tipo: 'SUGESTAO' | 'MANUAL'
    let estadoSelecaoModulo = { watts: null, qtd: null }; // Estado visual dos módulos
    let statusTecnicoSistema = { valido: false, nivel: 'OK', mensagem: '' }; // Estado de integridade técnica

    // ======================================================================
    // 🔒 GERENCIADOR DE ETAPAS (SEGURANÇA EM CASCATA)
    // ======================================================================
    const gerenciadorEtapas = {
        // Mapeamento de índices para nomes lógicos das etapas
        ordem: ['premissas', 'modulos', 'inversores', 'financeiro', 'resumo'],
        labels: ['Premissas', 'Módulos', 'Inversores', 'Financeiro', 'Resumo'], // Labels para o menu

        etapas: {
            premissas: ['container_dimensionamento'],
            modulos: ['container_sugestao_painel'],
            inversores: ['card-dimensionamento-inversor'],
            financeiro: ['wrapper-etapa-financeira'],
            resumo: ['secao_resumo_executivo', 'container-acao-final']
        },

        // Armazena o estado dos dados ao entrar na edição para comparação posterior
        snapshotEstado: null,

        // Método de compatibilidade para chamadas antigas (evita TypeError)
        travar: function (etapa) {
            // Mapeia 'travar' para 'avancarPara' a próxima etapa lógica
            const indiceAtual = this.ordem.indexOf(etapa);
            if (indiceAtual > -1 && indiceAtual < this.ordem.length - 1) {
                this.avancarPara(this.ordem[indiceAtual + 1]);
            }
        },

        destravar: function (etapa) {
            this.recuarPara(etapa);
        },

        // Atualiza a interface baseada no índice da etapa atual da aba ativa (Lógica N-1)
        sincronizarVisual: function (rolarParaTopo = true) {
            const indiceAtual = projetoGerenciador.etapaIndex || 0;

            // FIX: Se a etapa atual for o resumo, garante que o conteúdo seja renderizado
            const nomeEtapaAtual = this.ordem[indiceAtual];
            if (nomeEtapaAtual === 'resumo') {
                // Esta chamada força a renderização do resumo e, consequentemente, do botão e do campo de validade.
                window.calcularEngenhariaFinanceira();
            }

            console.log("DEBUG: Sincronizando Visual. Etapa atual:", this.ordem[indiceAtual]);

            // FIX: Safeguard para garantir renderização dos módulos ao voltar
            if (this.ordem[indiceAtual] === 'modulos') {
                const container = document.getElementById('container_sugestao_painel');
                // Verifica se o container está vazio, sem cards ou com mensagem de aguardando
                if (container && (!container.querySelector('.card-modulo') || container.innerHTML.includes('Aguardando'))) {
                    console.log("Safeguard: Restaurando estrutura visual de módulos...");
                    if (dimensionamentoCompleto) {
                        processarEscolhaModulo(dimensionamentoCompleto);
                    }
                }
            }

            this.ordem.forEach((nomeEtapa, index) => {
                const ids = this.etapas[nomeEtapa];
                if (!ids) return;

                const isEtapaAtual = index === indiceAtual;
                let botaoVoltarAdicionado = false; // Flag para garantir apenas um botão voltar por etapa

                ids.forEach(id => {
                    const el = document.getElementById(id);
                    if (!el) return;

                    // Limpeza de estilos antigos de bloqueio/overlay
                    const overlayAntigo = el.querySelector('.overlay-desbloqueio');
                    if (overlayAntigo) overlayAntigo.remove();

                    // Limpeza de botões de navegação antigos (para evitar duplicação)
                    const navAntiga = el.querySelector('.nav-etapa-container');
                    if (navAntiga) navAntiga.remove();

                    // LÓGICA PRINCIPAL: Mostrar apenas a etapa atual
                    if (isEtapaAtual) {
                        // Substituição de style.display por classes do engenharia.css
                        el.classList.remove('etapa-oculta');
                        el.classList.add('etapa-ativa');
                        el.style.display = ''; // Remove display:none inline se houver

                        // Reseta estilos visuais de bloqueio (caso existam no CSS)
                        el.classList.remove('card-bloqueado', 'etapa-bloqueada');

                    } else {
                        // ETAPA FUTURA OU PASSADA: Oculta para focar na atual
                        el.classList.remove('etapa-ativa');
                        el.classList.add('etapa-oculta');
                    }
                });
            });

            // Rola para o topo para manter o foco na etapa atual
            if (rolarParaTopo) {
                setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
            }

            // Renderiza o menu de navegação atualizado
            this.renderizarMenuNavegacao();

            // --- REVALIDAÇÃO DE ESTADO DOS BOTÕES (FIX: Garante estado correto ao navegar) ---
            // const nomeEtapaAtual = this.ordem[indiceAtual]; // Já definido acima
            if (nomeEtapaAtual === 'premissas') {
                if (typeof atualizarEstadoBotaoPremissas === 'function') atualizarEstadoBotaoPremissas();
            } 
            else if (nomeEtapaAtual === 'modulos') {
                const temSelecao = !!(estadoSelecaoModulo.watts && estadoSelecaoModulo.qtd);
                if (typeof renderizarBotaoNavegacao === 'function') {
                    renderizarBotaoNavegacao('container_sugestao_painel', 'window.avancarParaInversores()', temSelecao ? 'Configuração de Módulos Definida' : 'Selecione um Módulo', 'Avançar para Inversores', temSelecao);
                }
            } 
            else if (nomeEtapaAtual === 'inversores') {
                if (typeof atualizarComposicaoFinal === 'function') atualizarComposicaoFinal();
            } 
            else if (nomeEtapaAtual === 'financeiro') {
                const isPrecoOk = projetoGerenciador.precoCalculado;
                if (typeof renderizarBotaoNavegacao === 'function') {
                    renderizarBotaoNavegacao('wrapper-etapa-financeira', 'window.avancarParaResumo()', isPrecoOk ? 'Análise Financeira Concluída' : 'Defina o Valor do Kit', 'Ver Resumo e Salvar', isPrecoOk);
                }
            }
        },

        // Avança para a próxima etapa (Forward)
        avancarPara: function (nomeEtapa) {
            const novoIndice = this.ordem.indexOf(nomeEtapa);
            if (novoIndice > -1) {
                // Garante que existe um índice numérico válido (fallback para 0)
                const indiceAtual = projetoGerenciador.etapaIndex || 0;

                // CORREÇÃO SCROLL: Só sincroniza visualmente (scroll top) se houver mudança real de etapa.
                // Isso evita que ações dentro da mesma etapa (como selecionar painel) rolem a tela.
                if (novoIndice > indiceAtual) {
                    // Atualiza o máximo alcançado se estiver avançando
                    if (novoIndice > (projetoGerenciador.maxEtapaIndex || 0)) {
                        projetoGerenciador.maxEtapaIndex = novoIndice;
                    }

                    projetoGerenciador.etapaIndex = novoIndice;
                    this.sincronizarVisual();

                    // A chamada para atualizarHeaderResumo foi movida para preencherResumoExecutivo para garantir que os elementos existam.
                }
            }
        },

        // Navegação direta via Menu (Salta para qualquer etapa permitida)
        irPara: function (indiceAlvo) {
            const maxPermitido = projetoGerenciador.maxEtapaIndex || 0;

            // Só permite ir se o índice alvo for menor ou igual ao máximo já alcançado
            if (indiceAlvo <= maxPermitido) {
                // FIX: Se estiver voltando para uma etapa anterior, captura o snapshot para detecção de mudanças
                const indiceAtual = projetoGerenciador.etapaIndex || 0;
                if (indiceAlvo < indiceAtual) {
                    const nomeEtapaAlvo = this.ordem[indiceAlvo];
                    this.snapshotEstado = this.capturarEstado(nomeEtapaAlvo);
                    console.log(`Navegação via Menu para ${nomeEtapaAlvo}. Snapshot criado.`);
                }

                projetoGerenciador.etapaIndex = indiceAlvo;
                this.sincronizarVisual();

                // A chamada para atualizarHeaderResumo foi movida para preencherResumoExecutivo.
            }
        },

        // Recua para uma etapa específica SEM resetar imediatamente (Snapshot para Dirty Check)
        recuarPara: function (nomeEtapa) {
            const novoIndice = this.ordem.indexOf(nomeEtapa);

            if (novoIndice > -1) {
                // 1. Captura o estado ATUAL da etapa para a qual estamos voltando
                // Isso serve para comparar depois se o usuário mudou algo ou não
                this.snapshotEstado = this.capturarEstado(nomeEtapa);
                console.log(`Voltando para ${nomeEtapa}. Snapshot criado para detecção de mudanças.`);

                // 2. Apenas recua o índice visualmente
                projetoGerenciador.etapaIndex = novoIndice;
                this.sincronizarVisual();

                // A chamada para atualizarHeaderResumo foi movida para preencherResumoExecutivo.
            }
        },

        // Limpa dados das etapas futuras (chamado apenas se houver alteração)
        limparCascataFutura: function (etapaAtual) {
            // --- TRAVA DE SEGURANÇA PARA AUTOMAÇÃO ---
            if (isAutomating) {
                console.log(`Automação ativa: Bloqueando reset em cascata disparado por ${etapaAtual}.`);
                return;
            }

            const indiceAtual = this.ordem.indexOf(etapaAtual);
            // Limpa tudo DA PRÓXIMA etapa em diante

            // Reseta o progresso máximo para a etapa atual, pois o futuro foi invalidado
            projetoGerenciador.maxEtapaIndex = indiceAtual;

            for (let i = this.ordem.length - 1; i > indiceAtual; i--) {
                const etapaNome = this.ordem[i];
                console.log(`Resetando etapa futura: ${etapaNome}`);
                if (etapaNome === 'modulos') {
                    console.error("DEBUG CRÍTICO: A etapa [" + etapaAtual + "] disparou um RESET na etapa [modulos]. Verifique se o snapshot de premissas está correto.");
                }
                this.limparDadosEtapa(etapaNome);
            }
        },

        // Captura uma "foto" dos dados críticos da etapa para comparação
        capturarEstado: function (etapa) {
            if (etapa === 'premissas') {
                return JSON.stringify({
                    consumo: document.getElementById('uc_consumo')?.value,
                    hsp: document.getElementById('hsp_bruto')?.innerText,
                    azimute: document.getElementById('azimute_geral')?.value,
                    inclinacao: document.getElementById('inclinacao_geral')?.value,
                    perdas: [
                        document.getElementById('p_efici_inv')?.value,
                        document.getElementById('p_temp_inv')?.value,
                        document.getElementById('p_temp_mod')?.value,
                        document.getElementById('p_cabos_total')?.value
                    ]
                });
            } else if (etapa === 'modulos') {
                return JSON.stringify(estadoSelecaoModulo);
            }
            return null;
        },

        // Verifica se o estado atual difere do snapshot salvo
        houveAlteracao: function (etapa) {
            const estadoAtual = this.capturarEstado(etapa);
            return estadoAtual !== this.snapshotEstado;
        },

        // Função auxiliar para limpar dados específicos de cada etapa
        limparDadosEtapa: function (etapa) {
            if (etapa === 'financeiro') {
                limparFinanceiro();
            } else if (etapa === 'inversores') {
                carrinhoInversores = [];
                estadoSelecaoInversor = { tipo: null, id: null };
                renderizarTabelaHuawei();
                atualizarComposicaoFinal();
            } else if (etapa === 'modulos') {
                limparSelecaoModulos();
                estadoSelecaoModulo = { watts: null, qtd: null };
                zerarInterfaceTecnica();
            }
        },

        // Renderiza o menu de navegação logo após o header fixo
        renderizarMenuNavegacao: function () {
            const indiceAtual = projetoGerenciador.etapaIndex || 0;
            const maxAlcancado = projetoGerenciador.maxEtapaIndex || 0;

            // Busca ou cria o container do menu
            let menuContainer = document.getElementById('menu_navegacao_etapas');

            // Busca o wrapper sticky criado pelo cabeçalho de contexto
            const stickyWrapper = document.getElementById('sticky_wrapper_contexto');

            if (!menuContainer) {
                menuContainer = document.createElement('div');
                menuContainer.id = 'menu_navegacao_etapas';

                if (stickyWrapper) {
                    // Se o wrapper existe, o menu vai dentro dele (abaixo do contexto)
                    stickyWrapper.appendChild(menuContainer);
                } else {
                    // Fallback: insere no topo do wrapper principal
                    const main = document.querySelector('main') || document.body;
                    main.insertBefore(menuContainer, main.firstChild);
                }
            } else if (stickyWrapper && menuContainer.parentNode !== stickyWrapper) {
                // Se o menu já existe mas não está no wrapper (ex: recarregamento), move ele
                stickyWrapper.appendChild(menuContainer);
            }

            // Delega a renderização para a View
            geradorView.renderizarMenuNavegacao(menuContainer, this.labels, indiceAtual, maxAlcancado);
        }
    };

    // NOVA FUNÇÃO: Gerencia a exibição do botão no header durante o resumo
    function atualizarHeaderResumo(isResumo) {
        const btn = document.getElementById('btn_gerar_proposta');
        const grupoAcoes = document.getElementById('grupo_botao_validade'); // Novo grupo unificado
        const headerContainer = document.querySelector('.header-container');

        if (!headerContainer || !grupoAcoes) {
            console.warn("Header ou grupo de ações não encontrado para atualização.");
            return;
        }

        if (isResumo) {
            // Força o layout para empurrar o grupo para a direita
            headerContainer.style.justifyContent = 'flex-start';

            // Move o botão para o header (Extremidade DIREITA)
            headerContainer.appendChild(grupoAcoes);
            
            grupoAcoes.style.marginLeft = 'auto'; // Empurra para a direita
            
            btn.classList.add('btn-header-destaque'); // Classe para estilizar no header
            
            // Ajuste de estilo do botão para caber no header
            btn.style.minWidth = 'auto';
            btn.style.padding = '8px 20px';
            btn.style.fontSize = '0.95rem';

            // Estilização Específica para o Header (Compacto e Branco)
            const containerValidade = document.getElementById('container_validade_input');
            if (containerValidade) {
                const label = containerValidade.querySelector('label');
                const input = containerValidade.querySelector('input');
                if (label) {
                    label.style.color = '#ffffff';
                    label.innerText = "Validade (Dias):";
                    label.style.marginBottom = '0';
                    label.style.marginRight = '8px';
                    label.style.fontSize = '0.9rem';
                    label.style.display = 'inline-block';
                }
                if (input) {
                    input.style.width = '60px';
                    input.style.height = '36px';
                    input.style.textAlign = 'center';
                    input.style.background = 'rgba(255,255,255,0.1)';
                    input.style.border = '1px solid rgba(255,255,255,0.3)';
                    input.style.color = '#fff';
                    input.style.borderRadius = '4px';
                }
                // Ajusta layout do container para linha
                containerValidade.style.display = 'flex';
                containerValidade.style.alignItems = 'center';
            }
        } else {
            // Restaura o layout do header
            headerContainer.style.justifyContent = '';

            // Devolve o botão para o final da página
            const wrapperAction = document.getElementById('wrapper_acao_final');
            if (wrapperAction) wrapperAction.appendChild(grupoAcoes);
            
            grupoAcoes.style.marginLeft = '';
            
            btn.classList.remove('btn-header-destaque');
            
            // Restaura estilo do botão para o rodapé
            btn.style.minWidth = '250px';
            btn.style.padding = '16px 32px';
            btn.style.fontSize = '1.1rem';

            // Restaura Estilização para o Rodapé (Padrão)
            const containerValidade = document.getElementById('container_validade_input');
            if (containerValidade) {
                const label = containerValidade.querySelector('label');
                const input = containerValidade.querySelector('input');
                if (label) {
                    label.style.color = '#334155';
                    label.innerText = "Validade da Proposta (Dias)";
                    label.style.marginBottom = '5px';
                    label.style.marginRight = '0';
                    label.style.fontSize = '';
                    label.style.display = 'block';
                }
                if (input) {
                    input.style.width = '100px';
                    input.style.height = '';
                    input.style.background = '';
                    input.style.border = '';
                    input.style.color = '';
                }
                containerValidade.style.display = 'block';
                containerValidade.style.alignItems = '';
            }
        }
    }

    // NOVA FUNÇÃO: Exposta globalmente para o onclick do HTML gerado
    window.navegarPeloMenu = function (index) {
        if (typeof gerenciadorEtapas !== 'undefined') {
            gerenciadorEtapas.irPara(index);
        }
    };

    // NOVA FUNÇÃO: Voltar Etapa (Genérica)
    window.voltarEtapa = function () {
        const indiceAtual = projetoGerenciador.etapaIndex;
        if (indiceAtual > 0) {
            const etapaAnterior = gerenciadorEtapas.ordem[indiceAtual - 1];
            gerenciadorEtapas.recuarPara(etapaAnterior);
        }
    };

    // --- NOVA FUNÇÃO: CONFIRMAR PREMISSAS E AVANÇAR ---
    window.confirmarPremissasEAvançar = function () {
        console.log("Iniciando transição: Premissas -> Módulos");

        // 1. Antes de qualquer coisa, sincronizamos o snapshot para evitar resets falsos
        if (gerenciadorEtapas.houveAlteracao('premissas')) {
            console.warn("Mudança real detectada. Limpando apenas se necessário.");
            // Se mudou, precisamos recalcular, mas não podemos deixar o container vazio
            recalcularDimensionamento();
            processarEscolhaModulo(dimensionamentoCompleto);
        }

        // 2. FORÇA A EXIBIÇÃO DA GRID ANTES DE AVANÇAR
        const container = document.getElementById('container_sugestao_painel');
        if (container && (!container.querySelector('.grid-sugestoes') || container.innerHTML.includes('Aguardando'))) {
            console.log("Recuperando cards antes do avanço...");
            processarEscolhaModulo(dimensionamentoCompleto);
        }

        // 3. Garante que o CSS não está escondendo o container
        const wrapper = document.getElementById('wrapper-etapa-paineis');
        if (wrapper) {
            wrapper.classList.remove('etapa-oculta');
            wrapper.classList.add('etapa-ativa');
            wrapper.classList.remove('card-bloqueado', 'disabled');
        }

        gerenciadorEtapas.avancarPara('modulos');
    };

    // ======================================================================
    //  GERENCIAMENTO DE ESTADO (UNIFICADO)
    // ======================================================================

    function salvarEstadoAbaAtual() {
        // Salva o estado global unificado
        const indiceAtual = projetoGerenciador.etapaIndex || 0;

        // Capture a snapshot of the UI/data state at the moment of saving
        const sugestoesModulosSnapshot = dimensionamentoCompleto ? dimensionamentoCompleto.todosModelos : [];
        const sugestoesInversoresSnapshot = gerarSugestoesCompostas();
        const resumoTecnicoHTMLSnapshot = document.getElementById('resumo_tecnico_combinado')?.innerHTML || '';
        const avisosTecnicosHTMLSnapshot = document.querySelector('.avisos-tecnicos')?.innerHTML || '';
        
        // Captura dados vitais de engenharia para restaurar o header sem recalcular
        const prSalvo = dimensionamentoCompleto?.prCalculado || (parseFloat(document.getElementById('fixo_pr_final')?.innerText)/100) || 0.80;
        const hspSalvo = hspBruto || parseFloat(document.getElementById('hsp_bruto')?.innerText) || 0;
        const consumoSalvo = parseFloat(document.getElementById('uc_consumo')?.value) || 0;
        const tipoRedeSalvo = document.getElementById('uc_tipo_padrao')?.value || 'monofasico';
        // Captura a potência necessária calculada (se disponível)
        const kwpNecessarioSalvo = dimensionamentoCompleto?.kwpNecessario || 0;
        
        // Captura dados de Carga e Expansão do Header (que já foram calculados em sincronizarEngenhariaUnica)
        const cargaEfetivaSalva = parseFloat(document.getElementById('fixo_ratio')?.innerText.replace('%', '')) || 0;
        const qtdExpansaoSalva = parseInt(document.getElementById('fixo_expansao_mod')?.innerText.replace('+','').replace(' mod','')) || 0;
        const geracaoExpansaoSalva = parseFloat(document.getElementById('fixo_expansao_geracao')?.innerText) || 0;

        // Captura Opcionais Selecionados
        const opcionais = [];
        document.querySelectorAll('.chk-opcional:checked').forEach(chk => {
            opcionais.push(chk.dataset.id);
        });

        // NOVO: Captura Snapshot das Premissas Técnicas DESTA ABA (Para independência Standard/Premium)
        let orientacoesSnapshot = [];
        if (modoOrientacao === 'composto') {
            document.querySelectorAll('.linha-orientacao').forEach(linha => {
                orientacoesSnapshot.push({
                    perc: linha.querySelector('.input-perc').value,
                    az: linha.querySelector('.input-az').value,
                    inc: linha.querySelector('.input-inc').value
                });
            });
        }
        
        const premissasTecnicasAba = {
            modoOrientacao: modoOrientacao,
            orientacoes: orientacoesSnapshot,
            azimute: document.getElementById('azimute_geral')?.value,
            inclinacao: document.getElementById('inclinacao_geral')?.value,
            // Dados vitais adicionados para persistência robusta
            hsp: hspSalvo,
            consumo: consumoSalvo,
            tipoRede: tipoRedeSalvo,
            pr: prSalvo,
            kwpNecessario: kwpNecessarioSalvo,
            cargaEfetiva: cargaEfetivaSalva,
            qtdModulosExpansao: qtdExpansaoSalva,
            geracaoExpansao: geracaoExpansaoSalva
            // As perdas também podem variar se o usuário editar entre abas
        };

        // Atualiza o objeto global
        projetoGerenciador.dadosTecnicos = {
             inversores: [...carrinhoInversores],
             modulo: { ...estadoSelecaoModulo },
             estadoSelecaoInversor: { ...estadoSelecaoInversor },
             opcionaisSelecionados: opcionais,
             premissasTecnicas: premissasTecnicasAba
        };
        
        // O financeiro é salvo separadamente no objeto global durante o cálculo
        // projetoGerenciador.financeiro já está sendo atualizado em calcularEngenhariaFinanceira
    }

    function carregarEstadoGeral() {
        // Limpa variáveis temporárias
        carrinhoInversores = [];
        estadoSelecaoInversor = { tipo: null, id: null };
        estadoSelecaoModulo = { watts: null, qtd: null };

        const dados = projetoGerenciador.dadosTecnicos;
        const fin = projetoGerenciador.financeiro;

        // --- 1. RESTAURAÇÃO FINANCEIRA (PRIORITÁRIA) ---
        // Restaura os inputs financeiros ANTES de qualquer lógica que possa disparar cálculos.
        // Isso evita que 'atualizarComposicaoFinal' calcule preços zerados por falta de input.
        if (document.getElementById('valor_kit_std')) {
            const val = fin?.standard?.valorKit;
            console.log(`[DEBUG] Restaurando Kit Std: ${val} (Tipo: ${typeof val})`);
            if (val !== undefined && val !== null) document.getElementById('valor_kit_std').value = val;
        }
        if (document.getElementById('fator_std')) document.getElementById('fator_std').value = fin?.standard?.fatorLucro || 1.1;

        if (document.getElementById('valor_kit_prm')) {
            const val = fin?.premium?.valorKit;
            console.log(`[DEBUG] Restaurando Kit Prm: ${val} (Tipo: ${typeof val})`);
            if (val !== undefined && val !== null) document.getElementById('valor_kit_prm').value = val;
        }
        if (document.getElementById('fator_prm')) document.getElementById('fator_prm').value = fin?.premium?.fatorLucro || 1.2;

        if (dados && dados.modulo && dados.modulo.watts) {
            // Restaura dados técnicos
            carrinhoInversores = [...dados.inversores];
            estadoSelecaoModulo = { ...dados.modulo };
            if (dados.estadoSelecaoInversor) {
                estadoSelecaoInversor = { ...dados.estadoSelecaoInversor };
            }

            // Restaura Opcionais
            // A função renderizarOpcionaisPremium lerá do estado se disponível
            // (Lógica implementada dentro da função renderizarOpcionaisPremium abaixo)

            // NOVO: Restaura Premissas Técnicas Específicas da Aba (Se existirem)
            if (dados.premissasTecnicas) {
                restaurarPremissasTecnicas(dados.premissasTecnicas);
            }

            // Restaura visual dos módulos.
            if (dimensionamentoCompleto) {
                processarEscolhaModulo(dimensionamentoCompleto);
            }

            // Restaura inputs ocultos se houver seleção
            if (estadoSelecaoModulo.watts) {
                selectModulo.value = estadoSelecaoModulo.watts;
                totalModulosDisplay.value = estadoSelecaoModulo.qtd;

                const potDC = (estadoSelecaoModulo.watts * estadoSelecaoModulo.qtd);
                document.getElementById('potencia_dc_total').innerText = (potDC / 1000).toFixed(2);

                // FIX: Atualiza o header fixo com os dados restaurados (Potência Real e Geração)
                const prSalvo = dados.premissasTecnicas?.pr || null;
                sincronizarEngenhariaUnica(prSalvo);
            }

            // Restaura visual dos inversores
            renderizarTabelaHuawei();
            atualizarComposicaoFinal();

            // Atualiza o resumo superior se estivermos na etapa financeira
            renderizarResumoSuperiorFinanceiro();

        } else {
            console.warn("[DEBUG] Dados técnicos incompletos ou ausentes. Resetando interface.");
            // Se não tem dados, reseta a interface técnica
            zerarInterfaceTecnica();
            // Garante que o PR e outros dados do header sejam atualizados mesmo sem módulos
            sincronizarEngenhariaUnica();

            // Carrega padrões
            carregarFatorLucroPadrao();

            // --- FIX: Zera Potência DC Total ---
            document.getElementById('potencia_dc_total').innerText = "0.00";

            // Re-renderiza módulos para remover qualquer seleção visual anterior
            if (dimensionamentoCompleto) {
                processarEscolhaModulo(dimensionamentoCompleto);
            }

            renderizarTabelaHuawei();
            atualizarComposicaoFinal();

            // --- FIX: Limpa Financeiro ---
            limparFinanceiro();

            // Limpa resumo superior
            const resumoDiv = document.getElementById('resumo-topo-financeiro');
            if (resumoDiv) resumoDiv.remove();
        }

        // Aplica as travas visuais corretas para esta aba
        gerenciadorEtapas.sincronizarVisual(false);
        gerenciadorEtapas.renderizarMenuNavegacao(); // Garante que o menu apareça ao trocar de aba

        // FIX: Se carregou na etapa de premissas, tira snapshot inicial para evitar falso positivo de alteração
        if (projetoGerenciador.etapaIndex === 0) {
            gerenciadorEtapas.snapshotEstado = gerenciadorEtapas.capturarEstado('premissas');
        }
    }

    // Helper para carregar o fator correto das premissas globais
    function carregarFatorLucroPadrao() {
        const premissas = db.buscarConfiguracao('premissas_globais');
        
        if (document.getElementById('fator_std')) document.getElementById('fator_std').value = premissas?.financeiro?.fatorLucroStandard || 1.1;
        if (document.getElementById('fator_prm')) document.getElementById('fator_prm').value = premissas?.financeiro?.fatorLucroPremium || 1.2;
    }

    // NOVO: Função auxiliar para restaurar premissas na tela
    function restaurarPremissasTecnicas(premissas) {
        if (!premissas) return;

        // Restaura Modo
        if (premissas.modoOrientacao === 'composto') {
            modoOrientacao = 'composto';
            const radio = document.getElementById('composto');
            if (radio) radio.checked = true;
            
            const container = document.getElementById('container_orientacoes_compostas');
            if (container && premissas.orientacoes && Array.isArray(premissas.orientacoes)) {
                container.innerHTML = ''; 
                premissas.orientacoes.forEach(or => {
                    const div = document.createElement('div');
                    div.className = 'linha-orientacao';
                    div.innerHTML = `
            <div class="grupo-form">
                <label>Distribuição (%)</label>
                <input type="number" class="input-perc input-monitorado" value="${or.perc}" oninput="window.validarSomaOrientacao(true)" placeholder="0-100">
            </div>
            <div class="grupo-form">
                <label>Azimute (°)</label>
                <input type="number" class="input-az input-monitorado" value="${or.az}" placeholder="-180 a 180">
            </div>
            <div class="grupo-form">
                <label>Inclinação (°)</label>
                <input type="number" class="input-inc input-monitorado" value="${or.inc}" placeholder="0 a 90">
            </div>
            <button class="btn-remover-linha" onclick="window.removerLinhaOrientacao(this)" title="Remover Orientação">
                <i class="fas fa-trash-alt"></i>
            </button>
                    `;
                    container.appendChild(div);
                    // Re-atribui listeners
                    div.querySelectorAll('.input-monitorado').forEach(input => input.addEventListener('change', handlePremiseChange));
                });
                window.alternarModoOrientacao('composto');
                window.validarSomaOrientacao(true);
            }
        } else {
            modoOrientacao = 'simples';
            const radio = document.getElementById('simples');
            if (radio) radio.checked = true;
            if (premissas.azimute) document.getElementById('azimute_geral').value = premissas.azimute;
            if (premissas.inclinacao) document.getElementById('inclinacao_geral').value = premissas.inclinacao;
            window.alternarModoOrientacao('simples');
        }
        
        atualizarResumosVisiveis();
    }

    // ======================================================================
    // 🛡️ MOTOR DE INTEGRIDADE DE DADOS (Gatilho de Invalidação)
    // ======================================================================

    /**
     * Gerencia o estado visual e funcional da página com base na validade dos cálculos.
     * @param {'VALIDAR' | 'INVALIDAR'} acao - A ação a ser tomada.
     */
    function gerenciarEstadoCalculo(acao) {
        // A lógica visual antiga foi substituída pela validação em tempo real
        // Mas mantemos o alerta de invalidação para feedback rápido
        if (acao === 'INVALIDAR') {
            projetoGerenciador.precoCalculado = false;

            // FIX: Oculta o resumo executivo visualmente para evitar dados fantasmas
            const secaoResumo = document.getElementById('secao_resumo_executivo');
            if (secaoResumo) secaoResumo.style.display = 'none';

            const secaoComparativo = document.getElementById('secao_comparativa_final');
            if (secaoComparativo) secaoComparativo.classList.add('etapa-oculta');

            validarBotaoFinal(); // Revalida para bloquear o botão
        } else if (acao === 'VALIDAR') {
            validarBotaoFinal(); // Revalida para tentar liberar
        }
    }

    /**
     * Limpa a seção de seleção de módulos.
     */
    function limparSelecaoModulos() {
        containerSugestaoPainel.innerHTML = `<div class="alerta-reset">Aguardando novos dados de consumo...</div>`;
        if (wrapperEtapaTecnica) wrapperEtapaTecnica.classList.add('etapa-bloqueada');
        if (displayModuloSelecionado) displayModuloSelecionado.value = '';
        if (totalModulosDisplay) totalModulosDisplay.value = '';
    }

    /**
     * Limpa a seção financeira.
     */
    function limparFinanceiro() {
        // Não limpa o valor do kit aqui, pois ele é um input do usuário
        
        // Limpa resumos dinâmicos
        const painelStd = document.getElementById('painel_resumo_std');
        const painelPrm = document.getElementById('painel_resumo_prm');
        if (painelStd) painelStd.innerHTML = '';
        if (painelPrm) painelPrm.innerHTML = '';

        projetoGerenciador.precoCalculado = false;
        
        // Oculta linha de comissão se existir
        // (Agora gerida dentro do HTML dinâmico)

        // FIX: Garante que o resumo da aba anterior não permaneça visível
        const secaoResumo = document.getElementById('secao_resumo_executivo');
        if (secaoResumo) secaoResumo.style.display = 'none';

        const secaoComparativo = document.getElementById('secao_comparativa_final');
        if (secaoComparativo) secaoComparativo.classList.add('etapa-oculta');

        validarBotaoFinal();
    }

    /**
     * Força o reset visual do Topo Fixo e dos inputs de seleção.
     * Usado quando a mudança de premissas invalida a escolha atual.
     */
    function zerarInterfaceTecnica() {
        // 1. Limpa inputs ocultos que guardam a seleção
        if (selectModulo) selectModulo.value = '';
        if (totalModulosDisplay) totalModulosDisplay.value = '';
        if (displayModuloSelecionado) displayModuloSelecionado.value = '';

        // 2. Zera o Topo Fixo imediatamente
        if (fixoPotReal) fixoPotReal.innerText = "0.00 kWp";
        if (fixoGeracao) fixoGeracao.innerText = "0 kWh";
    }

    // --- FUNÇÕES DE EVENTO (Declaradas antes do uso) ---
    function handlePremiseChange(event) {
        console.log("Alteração detectada em:", event.target.id);

        // Feedback visual imediato
        gerenciarEstadoCalculo('INVALIDAR');
        // Garante validação imediata do botão de avançar ao sair do campo
        atualizarEstadoBotaoPremissas();
        const btn = document.getElementById('btn_gerar_proposta');
        if (btn) btn.innerText = "Recalculando...";

        // Sincroniza o modo composto se a alteração for no modo simples
        if (event.target.id === 'azimute_geral' || event.target.id === 'inclinacao_geral') {
            sincronizarGeralParaComposto();
        }

        setTimeout(() => {
            // O recálculo agora decide se mantém ou limpa os dados
            recalcularDimensionamento();

            // Restaura texto do botão se ainda houver seleção válida
            if (estadoSelecaoModulo.watts && btn) btn.innerHTML = '<i class="fas fa-save"></i> Salvar Proposta';
        }, 500);

        // Se mudar premissa, destrava tudo para forçar novo fluxo
        // (Embora o botão de desbloqueio já faça isso, inputs diretos precisam invalidar)
    }

    // Função para atualizar os labels de resumo nos cards retráteis
    function atualizarResumosVisiveis() {
        console.log("Atualizando labels de resumo...");

        // 1. Resumo de Geometria
        const resumoGeo = document.getElementById('resumo_geo');
        if (resumoGeo) {
            if (modoOrientacao === 'composto') {
                resumoGeo.innerText = `(Múltiplas Orientações)`;
            } else {
                const az = document.getElementById('azimute_geral')?.value || '0';
                const inc = document.getElementById('inclinacao_geral')?.value || '0';
                resumoGeo.innerText = `(Az: ${az}° | Inc: ${inc}°)`;
            }
        }

        // 2. Resumo de Perdas (PR)
        const prElement = document.getElementById('fixo_pr_final');
        const resumoPerdas = document.getElementById('resumo_pr');
        if (resumoPerdas && prElement) {
            resumoPerdas.innerText = `(PR: ${prElement.innerText})`;
        }

        // Futuramente, pode-se adicionar o resumo da UC aqui também.
    }

    /**
    * Inicializa os componentes de interface e eventos da seção de Inversores
    */
    function initComponentesInversor() {
        const select = document.getElementById('sel_oversizing');
        if (!select) return;
        select.innerHTML = ''; // Limpa

        // LÊ O PADRÃO DAS PREMISSAS GLOBAIS (Conexão com Central BelEnergy)
        const premissas = db.buscarConfiguracao('premissas_globais');
        const padrao = premissas?.engenharia?.oversizingPadrao || 50; // Default 50% se não configurado

        for (let i = 10; i <= 80; i += 5) {
            const option = document.createElement('option');
            option.value = (1 + i / 100).toFixed(2);
            option.text = `${i}%`;
            if (i === padrao) option.selected = true;
            select.appendChild(option);
        }
        
        select.addEventListener('change', () => renderizarTabelaHuawei());
    }

    // --- REMOÇÃO DE ELEMENTOS REDUNDANTES (Limpeza de Interface) ---
    function limparInterfaceFinanceira() {
        const wrapper = document.getElementById('wrapper-etapa-financeira');
        if (wrapper) {
            // Remove títulos redundantes como "Formação de Preço"
            const titulos = wrapper.querySelectorAll('h2, h3, .titulo-secao');
            titulos.forEach(t => {
                if (t.innerText.includes('Formação de Preço') || t.innerText.includes('Engenharia de Custos')) {
                    t.style.display = 'none';
                }
            });
        }
    }

    // --- Funções de Inicialização ---
    function inicializarBaseDeDados() {
        // Restaura estilos críticos (CSS-in-JS) para garantir visualização dos cards
        injetarEstilosDinamicos();

        // PADRONIZAÇÃO DO HEADER (CANCELAR À ESQUERDA, SALVAR À DIREITA QUANDO DISPONÍVEL)
        // O botão cancelar já é injetado, vamos apenas garantir o estilo padrão secundário se possível,
        // mas como o header é escuro, mantemos o estilo adaptado mas na posição correta.
        
        // O botão de salvar (Gerar Proposta) é movido para o header dinamicamente na etapa de resumo.
        // A função atualizarHeaderResumo cuida disso.
        
        // Garante que o botão cancelar exista (Delegado para a View)
        geradorView.renderizarBotaoCancelar(window.voltar);

        // Esconde o botão de gerar proposta inicialmente para evitar que apareça nas premissas
        if (btnGerarProposta) btnGerarProposta.style.display = 'none';

        // FIX: Esconde o container estático da ação final para não poluir as premissas
        const containerFinal = document.querySelector('.container-acao-final');
        if (containerFinal) containerFinal.remove(); // Remove do DOM para evitar conflito de ID

        // --- POPULA A NOVA BARRA DE CONTEXTO ---
        const elCtxCliente = document.getElementById('ctx_cliente');
        const elCtxLocal = document.getElementById('ctx_local');
        const elCtxConsumo = document.getElementById('ctx_consumo');
        const elCtxEstrutura = document.getElementById('ctx_estrutura');
        const elCtxOrigem = document.getElementById('ctx_origem');

        if (elCtxCliente) elCtxCliente.innerText = projetoCompleto.nome;
        if (elCtxLocal) elCtxLocal.innerText = `${projetoCompleto.projeto.cidade}/${projetoCompleto.projeto.uf}`;
        if (elCtxConsumo) elCtxConsumo.innerText = `${projetoCompleto.projeto.consumo || 0} kWh (${projetoCompleto.projeto.tipoLigacao === 'monofasico' ? 'Mono' : 'Tri'})`;
        if (elCtxEstrutura) elCtxEstrutura.innerText = projetoCompleto.projeto.tipoTelhado || 'Telhado';
        
        const origemMap = {
            'nenhum': 'Venda Direta', 'venda_direta': 'Venda Direta',
            'indicador': 'Indicação', 'representante': 'Representante'
        };
        if (elCtxOrigem) elCtxOrigem.innerText = origemMap[projetoCompleto.projeto.origemVenda] || 'Venda Direta';

        if (typeof window.verificarTipoEstrutura === 'function') {
            window.verificarTipoEstrutura(true); // Atualiza visibilidade (Skip calc para não zerar financeiro)
        }

        const { cidade, uf } = projetoCompleto.projeto; // Usa o endereço do projeto
        const cidadeNormalizada = cidade.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const dadosCidade = baseDadosAlagoas[cidadeNormalizada];

        // 1. Obter Fator de Geração (Prioriza o HSP salvo no projeto)
        if (projetoCompleto.projeto.hsp && projetoCompleto.projeto.hsp > 0) {
            hspBruto = projetoCompleto.projeto.hsp;
        } else {
            const fatorHistorico = dadosCidade ? dadosCidade.fator : 126; // Fallback
            hspBruto = obterHSPBruto(fatorHistorico);
        }
        if (inputHSPBruto) inputHSPBruto.innerText = hspBruto.toFixed(2);

        // 2. Obter Latitude
        if (dadosCidade && dadosCidade.lat) {
            latitude = dadosCidade.lat;
        } else if (coordenadasEstados[uf]) {
            latitude = coordenadasEstados[uf].lat;
        } else {
            latitude = -15.0; // Fallback Brasil
        }

        // Inicializa componentes dinâmicos da proposta
        initComponentesInversor();

        // Inicializa os opcionais premium
        renderizarOpcionaisPremium();

        // Limpa elementos redundantes da interface financeira
        limparInterfaceFinanceira();

        // Força um recálculo inicial para garantir que o estado esteja limpo/pronto
        // FIX: Só recalcula se NÃO for visualização. Visualização deve ser estática.
        recalcularDimensionamento();
        sincronizarEngenhariaUnica();

        // Renderiza o botão de avançar na etapa de Premissas (sem scroll inicial)
        atualizarEstadoBotaoPremissas();
    }

    // --- CARGA DE PREMISSAS GLOBAIS ---
    const premissasGlobais = db.buscarConfiguracao('premissas_globais');
    if (premissasGlobais) {
        // Atualiza inputs de engenharia (Azimute/Inclinação)
        if (document.getElementById('azimute_geral')) document.getElementById('azimute_geral').value = premissasGlobais.engenharia?.azimute ?? 0;
        if (document.getElementById('inclinacao_geral')) document.getElementById('inclinacao_geral').value = premissasGlobais.engenharia?.inclinacao ?? 10;

        // Atualiza inputs de perdas detalhadas (se existirem na configuração)
        if (premissasGlobais.engenharia) {
            if (document.getElementById('p_efici_inv')) document.getElementById('p_efici_inv').value = premissasGlobais.engenharia.eficienciaInversor ?? 98;
            if (document.getElementById('p_temp_inv')) document.getElementById('p_temp_inv').value = premissasGlobais.engenharia.perdaTempInversor ?? 1.5;
            if (document.getElementById('p_temp_mod')) document.getElementById('p_temp_mod').value = premissasGlobais.engenharia.perdaTempModulos ?? 10.13;
            if (document.getElementById('p_cabos_total')) document.getElementById('p_cabos_total').value = premissasGlobais.engenharia.cabos ?? 2.0;
            if (document.getElementById('p_extras')) document.getElementById('p_extras').value = premissasGlobais.engenharia.outros ?? 2.0;
            if (document.getElementById('p_indisp')) document.getElementById('p_indisp').value = premissasGlobais.engenharia.indisponibilidade ?? 0.5;
        }

        // Atualiza inputs financeiros
        // Define o inicial como Standard por padrão
        if (document.getElementById('fator_std')) document.getElementById('fator_std').value = premissasGlobais.financeiro?.fatorLucroStandard || 1.1;
        if (document.getElementById('fator_prm')) document.getElementById('fator_prm').value = premissasGlobais.financeiro?.fatorLucroPremium || 1.2;
        if (document.getElementById('prem_lucro_minimo')) {
            document.getElementById('prem_lucro_minimo').value = premissasGlobais.financeiro?.lucroMinimo || 0;
        }
        if (document.getElementById('prem_aliquota_imposto')) document.getElementById('prem_aliquota_imposto').value = premissasGlobais.financeiro?.imposto || 15;
    }

    /**
     * UNIFICAÇÃO JEAN MARCEL: Sincroniza todos os dados no Header
     * Elimina blocos redundantes de PR no corpo da página.
     * @param {number|null} prOverride - (Opcional) Força um valor de PR atualizado antes de salvar no global.
     */
    function sincronizarEngenhariaUnica(prOverride = null) {
        // 1. Higienização e Captura das "Primícias"
        const valConsumo = inputConsumo ? inputConsumo.value : '0';
        const consumo = parseFloat(higienizarParaCalculo(valConsumo)) || 0;
        const hsp = hspBruto || (inputHSPBruto ? parseFloat(inputHSPBruto.innerText) : 0) || 0; // Usa variável global para precisão

        // 2. Cálculo do PR Real de Projeto (Unificado)
        // Se passarmos um override, usamos ele (tempo real), senão pegamos do último dimensionamento salvo
        // FIX: Adicionado fallback para 0.80 se tudo falhar, evitando divisão por zero no header
        const prFinal = prOverride !== null ? prOverride : (dimensionamentoCompleto?.prCalculado || 0.80);

        // 3. Potência Real (Módulos Selecionados)
        const wattsMod = parseFloat(selectModulo.value) || 0;
        const qtdTotal = parseInt(totalModulosDisplay.value) || 0;
        const potReal = (qtdTotal * wattsMod) / 1000;

        // 4. Potência Mínima Requerida
        const potMinima = hsp > 0 && prFinal > 0 ? consumo / (hsp * 30.4166 * prFinal) : 1;

        // 5. Atualização Visual no Header
        // --- DADOS AC (INVERSORES) ---
        const potTotalAC = carrinhoInversores.reduce((acc, i) => acc + (i.nominal * i.qtd), 0) / 1000; // kW
        let cargaEfetiva = 0;
        let numPlacasExp = 0;
        let geracaoExpansao = 0;
        
        if (potTotalAC > 0 && potReal > 0) {
            // Cálculo da Carga Efetiva (Considerando perdas térmicas dos módulos)
            const perdaTemp = parseFloat(document.getElementById('p_temp_mod')?.value) || 10.13;
            const fatorDerating = 1 - (perdaTemp / 100);
            const ratioNominal = (potReal * 1000) / (potTotalAC * 1000);
            cargaEfetiva = ratioNominal * fatorDerating * 100;

            // Cálculo de Expansão (Header)
            const overAlvo = parseFloat(document.getElementById('sel_oversizing')?.value) || 1.0;
            const limiteTecnicoExpansao = (potTotalAC * 1000) * overAlvo;
            const wattsExpansao = limiteTecnicoExpansao - (potReal * 1000);
            numPlacasExp = wattsMod > 0 ? Math.floor(Math.max(0, wattsExpansao) / wattsMod) : 0;
            
            // Estimativa de geração da expansão
            const geracaoAtual = potReal * hsp * 30.4166 * prFinal;
            const geracaoPorModulo = qtdTotal > 0 ? geracaoAtual / qtdTotal : 0;
            geracaoExpansao = numPlacasExp * geracaoPorModulo;
        }

        if (fixoPotAC) fixoPotAC.innerText = potTotalAC.toFixed(2) + " kW";
        if (fixoRatio) {
            fixoRatio.innerText = cargaEfetiva.toFixed(0) + "%";
            
            // Coloração dinâmica refinada para fundo escuro
            if (cargaEfetiva > 135) {
                fixoRatio.style.color = '#f87171'; // Vermelho Claro (Crítico)
            } else if (cargaEfetiva > 110) {
                fixoRatio.style.color = '#fbbf24'; // Amber (Atenção/Cheio)
            } else {
                fixoRatio.style.color = '#4ade80'; // Verde Claro (Ideal/Folga)
            }
        }
        if (fixoExpansaoMod) fixoExpansaoMod.innerText = `+${numPlacasExp} mod`;
        if (fixoExpansaoGeracao) fixoExpansaoGeracao.innerText = `+${Math.round(geracaoExpansao)} kWh`;

        if (fixoPotMinima) fixoPotMinima.innerText = potMinima.toFixed(2) + " kWp";
        if (fixoPotReal) fixoPotReal.innerText = potReal.toFixed(2) + " kWp";
        if (fixoPr) fixoPr.innerText = (prFinal * 100).toFixed(2) + "%";
        if (fixoGeracao) fixoGeracao.innerText = Math.round(potReal * hsp * 30.4166 * prFinal) + " kWh";

        // 6. Validação dos 4% (Status Dot)
        if (fixoPotReal) {
            fixoPotReal.classList.remove('valor-ok', 'valor-atencao', 'valor-critico'); // Limpa classes anteriores
            const diff = potMinima > 0 ? (potReal / potMinima) - 1 : 0;

            if (potReal > 0) {
                if (diff < -0.04) {
                    fixoPotReal.classList.add("valor-critico");
                } else if (diff < 0) {
                    fixoPotReal.classList.add("valor-atencao");
                } else {
                    fixoPotReal.classList.add("valor-ok");
                }
            }
        }
    }

    // --- Motor de Cálculo Dinâmico ---
    function recalcularDimensionamento() {
        // Invalida o estado sempre que um recálculo de base é iniciado.
        gerenciarEstadoCalculo('INVALIDAR');

        const consumo = parseFloat(higienizarParaCalculo(inputConsumo.value)) || 0;
        let prPonderado = 0;

        // Busca premissas globais do banco para fallback (evita hardcode no model.js)
        const configGlobal = db.buscarConfiguracao('premissas_globais') || {};
        const engPadrao = configGlobal.engenharia || {};

        const perdasExtras = {
            eficienciaInversor: parseFloat(higienizarParaCalculo(pEficiInv.value)) || engPadrao.eficienciaInversor || 98.0,
            perdaTempInversor: parseFloat(higienizarParaCalculo(pTempInv.value)) || engPadrao.perdaTempInversor || 1.5,
            perdaTempModulos: parseFloat(higienizarParaCalculo(pTempMod.value)) || engPadrao.perdaTempModulos || 10.13,
            cabos: parseFloat(higienizarParaCalculo(pCabosTotal.value)) || engPadrao.cabos || 2.0,
            outros: parseFloat(higienizarParaCalculo(pExtras.value)) || engPadrao.outros || 2.0,
            indisponibilidade: parseFloat(higienizarParaCalculo(pIndisp.value)) || engPadrao.indisponibilidade || 0.5
        };

        if (modoOrientacao === 'simples') {
            const azimute = parseFloat(higienizarParaCalculo(document.getElementById('azimute_geral').value)) || 0;
            const inclinacao = parseFloat(higienizarParaCalculo(document.getElementById('inclinacao_geral').value)) || 0;
            const resultadoPR = calcularRendimentoCientifico({ azimute, inclinacao, perdasExtras, latitude });
            prPonderado = resultadoPR.prFinal;
        } else { // Modo Composto
            const linhas = document.querySelectorAll('.linha-orientacao');
            linhas.forEach(linha => {
                const peso = (parseFloat(linha.querySelector('.input-perc').value) || 0) / 100;
                const azimute = parseFloat(linha.querySelector('.input-az').value) || 0;
                const inclinacao = parseFloat(linha.querySelector('.input-inc').value) || 0;

                if (peso > 0) {
                    const resultadoPR_n = calcularRendimentoCientifico({ azimute, inclinacao, perdasExtras, latitude });
                    prPonderado += (resultadoPR_n.prFinal * peso);
                }
            });
        }

        // 2. ATUALIZAÇÃO IMEDIATA DO TOPO (Correção do "Topo Fixo não mudou")
        // Passamos o PR calculado agora, sem esperar o resto do processo
        sincronizarEngenhariaUnica(prPonderado);

        // Atualiza o botão de avançar das premissas
        atualizarEstadoBotaoPremissas();

        // Atualiza sugestão de espaçamento se aplicável (Solo/Laje)
        if (typeof window.atualizarSugestaoEspacamento === 'function') {
            window.atualizarSugestaoEspacamento();
        }

        // 3. Executa o Dimensionamento Completo (Motor de Seleção 540W-715W)
        if (consumo > 0 && hspBruto > 0) {
            // Usa o PR PONDERADO para dimensionar
            const paramsDimensionamento = { rendimentoFinal: prPonderado }; // O model.js agora só precisa do PR final.
            // Passa MODELOS_FOCO para garantir que o cálculo matemático bata com o estoque
            dimensionamentoCompleto = dimensionarSistema(consumo, hspBruto, paramsDimensionamento, obterModelosFoco());

            // 3. Atualiza a Tabela e Seleção Inteligente
            processarEscolhaModulo(dimensionamentoCompleto);
        }

        // 4. VALIDAÇÃO DE CONTINUIDADE DOS MÓDULOS
        // Verifica se a seleção atual ainda é válida com as novas perdas
        if (estadoSelecaoModulo.watts && estadoSelecaoModulo.qtd) {
            const potReal = (estadoSelecaoModulo.qtd * estadoSelecaoModulo.watts) / 1000;
            const geracaoNova = potReal * hspBruto * 30.4166 * prPonderado;

            // Se a nova geração caiu abaixo do consumo (com tolerância de 1%), invalida tudo.
            if (geracaoNova < consumo * 0.99) {
                console.warn("Premissa alterada tornou a seleção atual insuficiente. Resetando.");

                // Limpeza Profunda de Estado
                estadoSelecaoModulo = { watts: null, qtd: null };

                // >>> CORREÇÃO: Zera o Topo Fixo e Inputs imediatamente <<<
                zerarInterfaceTecnica();

                // Limpeza Visual
                document.getElementById('container_selecionados').style.display = 'none';
                document.getElementById('potencia_dc_total').innerText = "0.00";

                // Força re-renderização limpa
                renderizarTabelaHuawei();
                atualizarComposicaoFinal(); // Isso vai limpar os textos de expansão/geração futura

                // FIX: Bloqueia navegação para etapas futuras (Inversores, Financeiro)
                // Define o máximo permitido como 1 (Módulos), forçando o usuário a resolver a pendência lá
                projetoGerenciador.maxEtapaIndex = 1;
                
                if (typeof gerenciadorEtapas !== 'undefined') gerenciadorEtapas.renderizarMenuNavegacao();

                // Avisa o usuário
                customAlert("A alteração nas premissas reduziu a geração abaixo do consumo. Por favor, selecione um novo conjunto de módulos.", "Atenção", "perigo");
            } else {
                // Se ainda for válido, atualiza os números mantendo a seleção
                sincronizarEngenhariaUnica(prPonderado); // Garante atualização com PR novo

                // Atualiza a composição para refletir novos cálculos (ex: Geração Máxima com novo PR)
                atualizarComposicaoFinal();

                if (carrinhoInversores.length > 0) {
                    window.calcularEngenhariaFinanceira();
                }
            }
        } else {
            // Se não tinha seleção, apenas sincroniza o básico
            sincronizarEngenhariaUnica(prPonderado);
        }

        atualizarResumosVisiveis();
    }

    /**
     * Calcula a Potência Mínima e gera a tabela de comparação de módulos
     * Usa a lista de foco de mercado + sugestão técnica
     */
    function processarEscolhaModulo(resultadoDimensionamento) {

        // console.warn("DEBUG: A função processarEscolhaModulo foi chamada. Gerando HTML...");

        if (!containerSugestaoPainel) {
            console.error("ERRO CRÍTICO: containerSugestaoPainel não encontrado no DOM!");
            return;
        }

        if (!resultadoDimensionamento || !resultadoDimensionamento.melhorSugestao) {
            containerSugestaoPainel.innerHTML = `<div class="alerta-reset">Aguardando dados de consumo e local...</div>`;
            return;
        }

        const pMinimaKwp = resultadoDimensionamento.kwpNecessario;

        // 1. OBTENÇÃO DOS DADOS: A lista de modelos já vem ordenada por precisão do model.js
        const candidatosSugeridos = resultadoDimensionamento.todosModelos;

        // Adiciona o campo 'excedente' para uso na UI, que é o mesmo que 'sobra' no model
        candidatosSugeridos.forEach(mod => {
            mod.excedente = mod.sobra;
        });

        // 4. SEPARAÇÃO: Top 4 Campeões e o Restante
        const top4Campeoes = candidatosSugeridos.slice(0, 4);
        const restante = candidatosSugeridos.slice(4);

        // Delega renderização para View
        geradorView.renderizarSugestoesModulos(containerSugestaoPainel, top4Campeoes, restante, pMinimaKwp, estadoSelecaoModulo);

        // Prepara a lista completa, mas deixa oculta
        if (restante.length > 0) {
            prepararListaCompleta(restante, pMinimaKwp);
        }

        // Renderiza o botão de avançar (Desabilitado inicialmente, pois nenhum módulo foi confirmado ainda)
        // Se já houver seleção (recalculo), verifica se é válida
        const temSelecao = !!(estadoSelecaoModulo.watts && estadoSelecaoModulo.qtd);
        
        const etapaAtual = gerenciadorEtapas.ordem[projetoGerenciador.etapaIndex] || 'desconhecida';
        
        // FIX: Só atualiza o botão se estivermos efetivamente na etapa de módulos
        if (etapaAtual === 'modulos') {
            renderizarBotaoNavegacao('container_sugestao_painel', 'window.avancarParaInversores()', temSelecao ? 'Configuração de Módulos Definida' : 'Selecione um Módulo', 'Avançar para Inversores', temSelecao);
        }
    }

    // NOVA FUNÇÃO: Valida a seleção antes de confirmar
    window.validarEConfirmarModulo = async function (watts, qtd, pMinima) {
        // 1. Atualiza o estado visual (DOM) imediatamente
        document.querySelectorAll('.card-modulo').forEach(card => {
            card.classList.remove('selecionado-usuario');
        });

        const cardId = `card_mod_${watts}_${qtd}`;
        const cardSelecionado = document.getElementById(cardId);
        if (cardSelecionado) {
            cardSelecionado.classList.add('selecionado-usuario');
        }

        // 2. Salva no estado persistente
        estadoSelecaoModulo = { watts: watts, qtd: qtd };

        const potenciaSelecionada = (watts * qtd) / 1000;
        const percentualAtendimento = (potenciaSelecionada / pMinima) * 100;

        if (percentualAtendimento >= 100) {
            confirmarModulo(watts, qtd); // Atendimento pleno, confirma direto
        }
        else if (percentualAtendimento >= 96) {
            // ZONA DE TOLERÂNCIA (4%)
            if (await customConfirm(`Atenção: Este sistema atende ${percentualAtendimento.toFixed(1)}% da necessidade (abaixo dos 100%). Deseja prosseguir com esta tolerância?`, "Tolerância de Geração", "perigo")) {
                 confirmarModulo(watts, qtd);
            }
        }
        else {
            customAlert("Erro: O sistema selecionado está abaixo da tolerância permitida de 4%. Por favor, selecione uma configuração mais potente.", "Erro Técnico", "erro");
        }
    }

    // Função interna que efetivamente seleciona o módulo
    function confirmarModulo(watts, qtd, auto = false) {
        // FIX: Atualiza o estado global para garantir consistência na automação e resumos
        estadoSelecaoModulo = { watts: watts, qtd: qtd };

        // 1. Define o inventário fixo do projeto
        selectModulo.value = watts; // Input hidden
        displayModuloSelecionado.value = `Módulo ${watts}W`;
        totalModulosDisplay.value = qtd;

        // 2. Destrava a etapa técnica e financeira, mas mantém o estado inválido até o cálculo financeiro ser refeito.
        if (wrapperEtapaTecnica) wrapperEtapaTecnica.classList.remove('etapa-bloqueada');
        if (wrapperEtapaFinanceira) wrapperEtapaFinanceira.classList.remove('etapa-bloqueada');

        // 🔒 SEGURANÇA: Trava as premissas anteriores
        // gerenciadorEtapas.travar('premissas'); // Removido para evitar scroll automático indesejado

        // ATUALIZADO: Atualiza o painel de inversores com a nova potência DC
        const potDCInstaladaWp = (watts * qtd);
        document.getElementById('potencia_dc_total').innerText = (potDCInstaladaWp / 1000).toFixed(2);

        // Sincroniza o painel fixo com a nova seleção
        sincronizarEngenhariaUnica(); // Aqui usa o PR salvo no dimensionamentoCompleto

        // FIX: Atualiza visualmente o botão de avançar para habilitado imediatamente
        renderizarBotaoNavegacao('container_sugestao_painel', 'window.avancarParaInversores()', 'Configuração de Módulos Definida', 'Avançar para Inversores', true);

        // Atualiza sugestão de espaçamento com o novo módulo
        if (typeof window.atualizarSugestaoEspacamento === 'function') {
            window.atualizarSugestaoEspacamento();
        }

        // VERIFICAÇÃO DE ALTERAÇÃO (DIRTY CHECK)
        if (typeof gerenciadorEtapas !== 'undefined') {
            if (gerenciadorEtapas.houveAlteracao('modulos')) {
                console.log("Módulos alterados. Resetando Inversores e Financeiro.");
                gerenciadorEtapas.limparCascataFutura('modulos');
            } else {
                console.log("Módulos mantidos. Preservando seleção de inversores.");
            }
        }

        // 3. GATILHO DE REAVALIAÇÃO EM CASCATA: Verifica se o carrinho atual ainda é válido
        atualizarComposicaoFinal();

        // Atualiza o resumo para a etapa financeira (mesmo que oculto ainda)
        renderizarResumoSuperiorFinanceiro();

        // Atualiza a tabela de sugestões (agora sem pré-seleção automática única)
        renderizarTabelaHuawei();

        // RESTAURANDO O AVANÇO AUTOMÁTICO
        // Se não for uma chamada automática, avança para a próxima etapa.
        if (typeof gerenciadorEtapas !== 'undefined' && !auto) {
            gerenciadorEtapas.avancarPara('inversores');
        }
    }

    // NOVA FUNÇÃO GENÉRICA: Atualiza o botão de navegação FIXO na barra de etapas
    function renderizarBotaoNavegacao(containerId, acaoGlobal, textoFeedback, textoBotao, isValid = false) {
        // Busca o botão na barra de navegação fixa
        const btnAvancar = document.getElementById('btn_nav_avancar');
        
        if (btnAvancar) {
            // Atualiza estado e ação
            btnAvancar.disabled = !isValid;
            btnAvancar.onclick = isValid ? new Function(acaoGlobal) : null;
            
            // Atualiza texto (opcional, pode manter apenas "Avançar" ou ser dinâmico)
            // Se for a última etapa (Resumo), o botão Avançar some ou vira Salvar?
            // Pela lógica atual, no resumo o botão de salvar vai pro header.
            // Então aqui podemos manter "Avançar" ou o texto específico.
            
            // Se estivermos no Resumo, o botão Avançar da barra deve sumir ou ficar desabilitado
            const indiceAtual = projetoGerenciador.etapaIndex || 0;
            if (gerenciadorEtapas.ordem[indiceAtual] === 'resumo') {
                btnAvancar.style.display = 'none';
            } else {
                btnAvancar.style.display = 'flex';
                btnAvancar.innerHTML = `${textoBotao} <i class="fas fa-arrow-right"></i>`;
            }
            
            // Tooltip de feedback (opcional, via title)
            btnAvancar.title = textoFeedback;
        }
    }

    // --- FUNÇÃO DE AUTOMAÇÃO (Cálculo + Seleção + Avanço) ---
    window.autoDimensionarCompleto = async function () {
        // console.log("🚀 INICIANDO FLUXO RÁPIDO...");
        isAutomating = true;

        // 1. Força o cálculo de engenharia (Síncrono)
        recalcularDimensionamento();

        if (!dimensionamentoCompleto || !dimensionamentoCompleto.melhorSugestao) {
            // console.warn("Automação abortada: Dimensionamento incompleto.");
            isAutomating = false;
            return;
        }

        const melhorMod = dimensionamentoCompleto.melhorSugestao;
        
        // 2. Renderiza e Seleciona Módulo (Síncrono)
        processarEscolhaModulo(dimensionamentoCompleto);
        
        // Seleciona o módulo (isso dispara atualizações de estado e renderização de inversores internamente)
        confirmarModulo(melhorMod.watts, melhorMod.quantidade, true);

        // 3. Seleciona Inversor Recomendado (Síncrono)
        const sugestoes = gerarSugestoesCompostas();
        
        if (sugestoes.length > 0) {
            const potDCInstaladaWp = (melhorMod.watts * melhorMod.quantidade);
            const wattsModulo = melhorMod.watts;
            
            const sugestoesOrdenadas = sugestoes.sort((a, b) => {
                const expA = Math.floor((a.capTotal - potDCInstaladaWp) / wattsModulo);
                const expB = Math.floor((b.capTotal - potDCInstaladaWp) / wattsModulo);
                return expA - expB;
            });
            const melhorInv = sugestoesOrdenadas[0];

            // Aplica a composição
            carrinhoInversores = [];
            melhorInv.itens.forEach(it => {
                carrinhoInversores.push({ modelo: it.mod, nominal: it.nom, tipo: it.tipo, qtd: it.qtd });
            });

            estadoSelecaoInversor = { tipo: 'SUGESTAO', id: 0 };
            renderizarTabelaHuawei();
            atualizarComposicaoFinal();
            
            // 4. Salto para Financeiro
            if (typeof gerenciadorEtapas !== 'undefined') {
                if (projetoGerenciador.maxEtapaIndex < 3) {
                    projetoGerenciador.maxEtapaIndex = 3;
                }
                gerenciadorEtapas.irPara(3); // 3 é Financeiro na ordem
            }
            
            // 5. Foco no Input (Pequeno delay para garantir que a aba trocou e o input está visível)
            setTimeout(() => {
                const inputKit = document.getElementById('valor_kit_std');
                if (inputKit) {
                    inputKit.focus();
                    inputKit.select();
                }
                isAutomating = false;
            }, 50);

        } else {
            // console.warn("⚠️ Inversor não encontrado automaticamente.");
            isAutomating = false;
        }
    };

    // --- FUNÇÃO DE RESUMO SUPERIOR (Design Leve) ---
    function renderizarResumoSuperiorFinanceiro() {
        const wrapper = document.getElementById('wrapper-etapa-financeira');
        if (!wrapper) return;

        let resumoDiv = document.getElementById('resumo-topo-financeiro');
        if (!resumoDiv) {
            resumoDiv = document.createElement('div');
            resumoDiv.id = 'resumo-topo-financeiro';
            // Insere no topo do wrapper financeiro
            wrapper.insertBefore(resumoDiv, wrapper.firstChild);
        }

        // Coleta dados atuais
        const modulosTxt = estadoSelecaoModulo.qtd ? `${estadoSelecaoModulo.qtd}x ${estadoSelecaoModulo.watts}W` : '---';
        
        // Cálculo de Potência AC Total (Inversores)
        const potTotalAC = carrinhoInversores.reduce((acc, i) => acc + (i.nominal * i.qtd), 0);
        const potTotalACTxt = potTotalAC > 0 ? (potTotalAC / 1000).toFixed(2) + ' kW' : '0 kW';

        const invsTxt = carrinhoInversores.length > 0
            ? carrinhoInversores.map(i => `${i.qtd}x ${i.modelo} (${(i.nominal/1000).toFixed(1)}kW)`).join(', ')
            : 'Nenhum selecionado';

        // CÁLCULO DE EXPANSÃO (Quantidade e Geração Futura)
        const wattsModulo = estadoSelecaoModulo.watts || 580;
        const qtdModulosAtual = estadoSelecaoModulo.qtd || 0;
        const potDCInstaladaWp = (wattsModulo * qtdModulosAtual);
        
        const potNominalTotalAC = carrinhoInversores.reduce((acc, i) => acc + (i.nominal * i.qtd), 0);
        
        // Limite técnico baseado no Oversizing configurado (ex: 150%)
        const overAlvo = parseFloat(document.getElementById('sel_oversizing')?.value) || 1.35;
        const limiteTecnicoExpansao = potNominalTotalAC * overAlvo;
        const wattsExpansao = limiteTecnicoExpansao - potDCInstaladaWp;
        const numPlacasExp = Math.floor(Math.max(0, wattsExpansao) / wattsModulo);
        
        const geracaoAtual = parseFloat(document.getElementById('fixo_geracao')?.innerText) || 0;
        const geracaoPorModulo = qtdModulosAtual > 0 ? geracaoAtual / qtdModulosAtual : 0;
        const geracaoExpansao = numPlacasExp * geracaoPorModulo;
        
        const expansaoTxt = `+${numPlacasExp} mod (+${Math.round(geracaoExpansao)} kWh)`;

        const tipoRedeAtual = document.getElementById('uc_tipo_padrao')?.value || 'monofasico';
        // Calcula BOM para exibição (Usa Standard como base)
        const kitStd = calcularCustoKit(estadoSelecaoModulo, carrinhoInversores, false, tipoRedeAtual);
        const kitPrm = calcularCustoKit(estadoSelecaoModulo, carrinhoInversores, true, tipoRedeAtual);

        geradorView.renderizarResumoSuperiorFinanceiro(resumoDiv, modulosTxt, invsTxt, expansaoTxt, kitStd, kitPrm);
    }

    window.avancarParaInversores = function () {
        if (typeof gerenciadorEtapas !== 'undefined') {
            gerenciadorEtapas.avancarPara('inversores');
            // Garante que o botão de navegação da próxima etapa seja renderizado
            atualizarComposicaoFinal();
        }
    };

    window.avancarParaFinanceiro = function () {
        if (typeof gerenciadorEtapas !== 'undefined') {
            gerenciadorEtapas.avancarPara('financeiro');
        }
    };

    window.avancarParaResumo = function () {
        if (typeof gerenciadorEtapas !== 'undefined') {
            gerenciadorEtapas.avancarPara('resumo');
        }
    };

    // ======================================================================
    // 🔌 MOTOR DE DIMENSIONAMENTO DE INVERSOR E EXPANSÃO
    // ======================================================================

    // --- ALGORITMO DE SUGESTÃO DE COMPOSIÇÕES ---
    // TODO: Mover lógica de engenharia para 'model.js' conforme documentacao_tecnica.md (Seção 5.2)
    function gerarSugestoesCompostas() {
        const potDCInstaladaWp = parseFloat(document.getElementById('potencia_dc_total').innerText) * 1000;
        if (!potDCInstaladaWp || potDCInstaladaWp <= 0) return [];

        const overAlvo = parseFloat(document.getElementById('sel_oversizing').value);
        const tipoRedeUC = document.getElementById('uc_tipo_padrao').value;
        const limiteExpansaoWp = potDCInstaladaWp * 2.1; // Limite de engenharia (2.1x)

        let sugestoes = [];

        // 1. Inversores Únicos
        inversoresHuawei.forEach(inv => {
            if (tipoRedeUC === "monofasico" && inv.tipo !== "monofásico") return;

            const capEntrada = inv.nom * overAlvo;
            
            // Aceita se cobrir a potência E não for absurdamente grande (max 1.5x o limite de expansão)
            // FIX: Garante que sistemas pequenos aceitem o menor inversor (buffer de 8000W)
            const tetoAceitavel = Math.max(limiteExpansaoWp * 1.5, 8000);

            if (capEntrada >= potDCInstaladaWp && capEntrada <= tetoAceitavel) {
                sugestoes.push({
                    itens: [{ ...inv, qtd: 1 }],
                    capTotal: capEntrada,
                    score: inv.nom // Menor potência nominal = melhor custo
                });
            }
        });

        // 2. Combinações de 2 Inversores (Para potências maiores ou monofásicos grandes)
        if (potDCInstaladaWp > 3000) {
            for (let i = 0; i < inversoresHuawei.length; i++) {
                for (let j = i; j < inversoresHuawei.length; j++) {
                    const inv1 = inversoresHuawei[i];
                    const inv2 = inversoresHuawei[j];

                    // Filtro de rede
                    if (tipoRedeUC === "monofasico" && (inv1.tipo !== "monofásico" || inv2.tipo !== "monofásico")) continue;

                    const capCombinada = (inv1.nom + inv2.nom) * overAlvo;

                    if (capCombinada >= potDCInstaladaWp && capCombinada <= limiteExpansaoWp) {
                        // Verifica se são iguais para agrupar a quantidade
                        const itens = (i === j)
                            ? [{ ...inv1, qtd: 2 }]
                            : [{ ...inv1, qtd: 1 }, { ...inv2, qtd: 1 }];

                        sugestoes.push({
                            itens: itens,
                            capTotal: capCombinada,
                            // Penalidade de 15% no score para desencorajar multi-inversor se um único resolver
                            score: (inv1.nom + inv2.nom) * 1.15
                        });
                    }
                }
            }
        }

        // Ordena pelo Score (Menor custo/complexidade primeiro) e pega top 5
        return sugestoes.sort((a, b) => a.score - b.score).slice(0, 5);
    }

    function renderizarTabelaHuawei() {
        const corpo = document.getElementById('corpo_tabela_huawei');
        const corpoSugestoes = document.getElementById('corpo_tabela_sugestoes_inteligentes');
        const areaSugestoes = document.getElementById('area_sugestoes_inteligentes');


        // Premissas para cálculo de Geração Potencial
        const elHsp = document.getElementById('hsp_bruto');
        const hsp = elHsp ? (parseFloat(elHsp.innerText) || 0) : 0;

        const elPr = document.getElementById('fixo_pr_final');
        const prTexto = elPr ? elPr.innerText.replace('%', '') : '80';
        const pr = parseFloat(prTexto) / 100 || 0.80;

        // --- DADOS PARA CÁLCULO LINEAR (PROJEÇÃO REAL) ---
        const elGeracao = document.getElementById('fixo_geracao');
        const geracaoAtual = elGeracao ? (parseFloat(elGeracao.innerText) || 0) : 0;

        const elQtdMod = document.getElementById('total_modulos_projeto');
        const qtdModulosAtual = elQtdMod ? (parseInt(elQtdMod.value) || 0) : 0;

        const elModComp = document.getElementById('select_modulo_comparativo');
        const wattsModulo = elModComp ? (parseFloat(elModComp.value) || 580) : 580;

        const geracaoPorModulo = (qtdModulosAtual > 0) ? (geracaoAtual / qtdModulosAtual) : 0;

        // 1. HERANÇA DE DADOS DO PROJETO (Sincronização total com o Painel Geral)
        const elPotDC = document.getElementById('potencia_dc_total');
        const potDCInstaladaWp = elPotDC ? (parseFloat(elPotDC.innerText) * 1000) : 0;

        // Controle de visibilidade das sugestões
        if (potDCInstaladaWp > 0) {
            areaSugestoes.style.display = 'block';

            // RENDERIZA SUGESTÕES INTELIGENTES
            const sugestoes = gerarSugestoesCompostas();

            // ORDENAÇÃO: Menor expansão para maior expansão (Custo-Benefício)
            const potDCInstaladaWp = parseFloat(document.getElementById('potencia_dc_total').innerText) * 1000;
            const sugestoesOrdenadas = sugestoes.sort((a, b) => {
                const expA = Math.floor((a.capTotal - potDCInstaladaWp) / wattsModulo);
                const expB = Math.floor((b.capTotal - potDCInstaladaWp) / wattsModulo);
                return expA - expB;
            });

            // Prepara dados enriquecidos para a View
            const sugestoesView = sugestoesOrdenadas.map((sug, index) => {
                // Transforma a composição em Badges visuais (ETIQUETAS)

                // Calcula Potência Nominal Total da Composição
                const potNominalTotal = sug.itens.reduce((acc, item) => acc + (item.nom * item.qtd), 0);

                // Calcula Total de MPPTs da Composição
                const totalMPPTs = sug.itens.reduce((acc, item) => acc + (item.mppt * item.qtd), 0);

                // Determina o Tipo de Rede da Composição (para exibição igual à tabela manual)
                const tiposUnicos = [...new Set(sug.itens.map(it => {
                    const inv = inversoresHuawei.find(i => i.mod === it.mod);
                    return inv ? inv.tipo : '';
                }))];
                const tipoDesc = tiposUnicos.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' + ');

                // CÁLCULO DE EFICIÊNCIA AJUSTADO (Jean Marcel)
                // Considera a perda térmica para definir se o inversor está realmente cheio ou ocioso
                const perdaTemp = parseFloat(document.getElementById('p_temp_mod')?.value) || 10.13;
                const fatorDerating = 1 - (perdaTemp / 100);
                
                const ratioNominal = potNominalTotal > 0 ? (potDCInstaladaWp / potNominalTotal) : 0;
                const ratioEfetivo = ratioNominal * fatorDerating; // Carga real estimada no inversor
                const pctEfetivo = ratioEfetivo * 100; // Percentual de carga REAL (O que o usuário quer ver)

                let badgeEficiencia = '';
                
                // Limites baseados na Carga Efetiva (após perdas):
                // Lógica Rigorosa (Fator 1.0): Ideal é apenas próximo de 100%
                if (ratioEfetivo > 1.30) badgeEficiencia = `<span class="badge-eficiencia critico" title="Risco de Segurança"><i class="fas fa-radiation-alt"></i> Crítico (${pctEfetivo.toFixed(0)}%)</span>`;
                else if (ratioEfetivo > 1.02) badgeEficiencia = `<span class="badge-eficiencia atencao" title="Carga acima da nominal (Sobrecarga)"><i class="fas fa-arrow-up"></i> Sobrecarga (${pctEfetivo.toFixed(0)}%)</span>`;
                else if (ratioEfetivo >= 0.98) badgeEficiencia = `<span class="badge-eficiencia ideal" title="Casamento Perfeito de Potência"><i class="fas fa-check-circle"></i> Ideal (${pctEfetivo.toFixed(0)}%)</span>`;
                else if (ratioEfetivo >= 0.80) badgeEficiencia = `<span class="badge-eficiencia info" title="Carga abaixo da nominal (Subcarga)"><i class="fas fa-arrow-down"></i> Subcarga (${pctEfetivo.toFixed(0)}%)</span>`;
                else badgeEficiencia = `<span class="badge-eficiencia ocioso" title="Inversor muito grande para os módulos"><i class="fas fa-battery-empty"></i> Ocioso (${pctEfetivo.toFixed(0)}%)</span>`;

                const numPlacasExp = Math.floor((sug.capTotal - potDCInstaladaWp) / wattsModulo);

                // CÁLCULO DO OVERSIZING RESULTANTE (STC) - Para a coluna de Expansão
                const potDCFutura = potDCInstaladaWp + (numPlacasExp * wattsModulo);
                const ratioFuturoSTC = potNominalTotal > 0 ? (potDCFutura / potNominalTotal) : 0;
                const pctOversizingSTC = Math.max(0, (ratioFuturoSTC - 1) * 100);
                
                // Classificação da Expansão
                // Visual Neutro conforme solicitado (sem alertas de cor)
                let labelExpansao = `<span style="color:#64748b;">Over: ${pctOversizingSTC.toFixed(0)}%</span>`;

                // Cálculo da Geração Potencial (Linear ou Teórico)
                let geracaoPotencial;
                if (geracaoPorModulo > 0) {
                    // Linear: (Módulos Atuais + Expansão) * Geração por Módulo
                    const totalModulosFuturo = qtdModulosAtual + numPlacasExp;
                    geracaoPotencial = totalModulosFuturo * geracaoPorModulo;
                } else {
                    geracaoPotencial = (sug.capTotal / 1000) * hsp * 30.4166 * pr;
                }

                return {
                    ...sug,
                    potNominalTotal,
                    totalMPPTs,
                    tipoDesc,
                    badgeEficiencia,
                    numPlacasExp,
                    labelExpansao,
                    geracaoPotencial
                };
            });

            // Renderiza Sugestões via View
            geradorView.renderizarTabelaHuawei(corpoSugestoes, null, sugestoesView, null, estadoSelecaoInversor, null);

        } else {
            areaSugestoes.style.display = 'none';
        }

        const overAlvo = parseFloat(document.getElementById('sel_oversizing').value);
        const tipoRedeUC = document.getElementById('uc_tipo_padrao').value;
        const termoFiltro = document.getElementById('filtro_huawei').value.toLowerCase();

        // 3. FILTRAGEM, PRÉ-CÁLCULO E ORDENAÇÃO
        const listaProcessada = inversoresHuawei
            .filter(inv => {
                const atendeTexto = termoFiltro ? (inv.mod.toLowerCase().includes(termoFiltro) || inv.nom.toString().includes(termoFiltro)) : true;
                if (tipoRedeUC === "monofasico" && inv.tipo !== "monofásico") return false;
                return atendeTexto;
            })
            .map(inv => {
                const capMaxUnit = inv.nom * overAlvo;
                // PRÉ-CÁLCULO: Quantidade necessária para cobrir a potência DC
                const qtdNecessaria = Math.ceil(potDCInstaladaWp / capMaxUnit) || 1;

                // Cálculo da Geração Potencial Total (Qtd * Unitário)
                let geracaoPotencialTotal;
                if (geracaoPorModulo > 0) {
                    const maxModulosCabem = Math.floor((capMaxUnit * qtdNecessaria) / wattsModulo);
                    geracaoPotencialTotal = maxModulosCabem * geracaoPorModulo;
                } else {
                    geracaoPotencialTotal = ((capMaxUnit * qtdNecessaria) / 1000) * hsp * 30.4166 * pr;
                }

                return {
                    ...inv,
                    qtdCalculada: qtdNecessaria,
                    geracaoTotal: geracaoPotencialTotal,
                    capMaxUnit: capMaxUnit
                };
            })
            // Regra 3: Limite superior visual (evita inversores gigantescos onde 1 já sobra muito)
            // Exibe se a capacidade total for razoável OU se for um inversor pequeno (para composição)
            .filter(inv => (inv.capMaxUnit * inv.qtdCalculada) <= (potDCInstaladaWp * 2.5) || inv.qtdCalculada > 1)
            .sort((a, b) => a.geracaoTotal - b.geracaoTotal); // ORDENAÇÃO: Geração Máxima Crescente

        // Prepara dados manuais enriquecidos
        const listaManualView = listaProcessada.map(inv => {
            const capTotalRow = inv.capMaxUnit * inv.qtdCalculada;
            const numPlacasExp = Math.floor((capTotalRow - potDCInstaladaWp) / wattsModulo);
            const potNominalTotalRow = inv.nom * inv.qtdCalculada;
            const potDCFutura = potDCInstaladaWp + (numPlacasExp * wattsModulo);
            const ratioFuturoSTC = potNominalTotalRow > 0 ? (potDCFutura / potNominalTotalRow) : 0;
            const pctOversizingSTC = Math.max(0, (ratioFuturoSTC - 1) * 100);
            const labelExpansao = `<span style="color:#64748b;">Over: ${pctOversizingSTC.toFixed(0)}%</span>`;

            return { ...inv, numPlacasExp, labelExpansao };
        });

        // Renderiza Manual via View
        geradorView.renderizarTabelaHuawei(null, corpo, null, listaManualView, estadoSelecaoInversor, { potDCInstaladaWp });

        // --- LÓGICA DE COLAPSO DA LISTA MANUAL (UX) ---
        // Segue o mesmo padrão da lista de módulos: Oculta por padrão e mostra botão de expansão
        const tabela = corpo.closest('table');
        if (tabela) {
            // Identifica o elemento a ser ocultado (Tabela ou seu Wrapper .tabela-container)
            const containerAlvo = (tabela.parentElement.classList.contains('tabela-container') || tabela.parentElement.classList.contains('tabela-scroll-engenharia')) ? tabela.parentElement : tabela;
            
            // Garante ID para manipulação
            if (!containerAlvo.id) containerAlvo.id = 'container_lista_inversores_manual';

            // Verifica/Cria o botão de expansão se não existir
            let btnContainer = document.getElementById('wrapper_btn_expandir_inv');
            if (!btnContainer) {
                btnContainer = document.createElement('div');
                btnContainer.id = 'wrapper_btn_expandir_inv';
                btnContainer.className = 'area-expansao-modulos'; // Reusa classe de estilo existente dos módulos
                
                // Insere antes da tabela
                containerAlvo.parentNode.insertBefore(btnContainer, containerAlvo);
                
                // Oculta a tabela por padrão
                containerAlvo.style.display = 'none';
            }

            // Atualiza o texto do botão com a contagem atual
            btnContainer.innerHTML = `
                <button class="btn-ver-todos" onclick="window.toggleListaInversores()">
                    <i class="fas fa-list"></i> Ver Catálogo Completo (${listaProcessada.length} opções)
                </button>
            `;

            // Auto-expandir se houver filtro ativo (UX: Se buscou, quer ver)
            const termoFiltro = document.getElementById('filtro_huawei')?.value;
            if (termoFiltro && containerAlvo.style.display === 'none') {
                containerAlvo.style.display = 'block';
            }
        }
    }

    // NOVA FUNÇÃO: Atualiza a coluna de Geração Máxima em tempo real ao digitar a quantidade
    window.atualizarPotencialLinha = function (modelo, nominal) {
        const idQtd = `qtd_${modelo.replace(/\s/g, '')}`;
        const idDestino = `potencial_${modelo.replace(/\s/g, '')}`;
        const elQtd = document.getElementById(idQtd);
        const elDestino = document.getElementById(idDestino);

        if (!elQtd || !elDestino) return;

        const qtd = parseInt(elQtd.value) || 0;
        const over = parseFloat(document.getElementById('sel_oversizing').value) || 1.0;
        
        const elHsp = document.getElementById('hsp_bruto');
        const hsp = elHsp ? (parseFloat(elHsp.innerText) || 0) : 0;

        const elPr = document.getElementById('fixo_pr_final');
        const pr = elPr ? (parseFloat(elPr.innerText.replace('%', '')) / 100 || 0.80) : 0.80;

        // Dados para cálculo linear
        const elGeracao = document.getElementById('fixo_geracao');
        const geracaoAtual = elGeracao ? (parseFloat(elGeracao.innerText) || 0) : 0;

        const elQtdMod = document.getElementById('total_modulos_projeto');
        const qtdModulosAtual = elQtdMod ? (parseInt(elQtdMod.value) || 0) : 0;

        const elModComp = document.getElementById('select_modulo_comparativo');
        const wattsModulo = elModComp ? (parseFloat(elModComp.value) || 580) : 580;

        const capMaxDC_Watts = nominal * qtd * over;

        let geracaoPotencial;
        if (qtdModulosAtual > 0 && geracaoAtual > 0) {
            const geracaoPorModulo = geracaoAtual / qtdModulosAtual;
            const maxModulosCabem = Math.floor(capMaxDC_Watts / wattsModulo);
            geracaoPotencial = maxModulosCabem * geracaoPorModulo;
        } else {
            geracaoPotencial = (capMaxDC_Watts / 1000) * hsp * 30.4166 * pr;
        }

        elDestino.innerText = Math.round(geracaoPotencial) + " kWh";
    }

    // ======================================================================
    // ⚙️ MOTOR DE OPCIONAIS PREMIUM (Instalação Industrial)
    // ======================================================================
    function renderizarOpcionaisPremium() {
        // Target the wrapper to replace the entire content with the new Clean Table design
        const containerWrapper = document.getElementById('container_opcionais_premium');
        if (!containerWrapper) return;

        const dadosTecnicos = projetoGerenciador.dadosTecnicos || {};

        // 1. Captura estado atual para preservar seleções durante re-renderização
        const estadoAnterior = {};
        
        // Se tiver dados salvos na aba (ex: carregou do banco), usa eles
        if (dadosTecnicos.opcionaisSelecionados) {
            dadosTecnicos.opcionaisSelecionados.forEach(id => estadoAnterior[id] = true);
        } else {
            // Senão, tenta ler do DOM atual
            containerWrapper.querySelectorAll('.chk-opcional').forEach(chk => {
                estadoAnterior[chk.dataset.id] = chk.checked;
            });
        }

        // 2. Dados do Projeto e Configuração
        const config = db.buscarConfiguracao('premissas_globais') || {};
        const pMatPrem = config.materiaisPremium || {};
        
        const tipoRede = document.getElementById('uc_tipo_padrao')?.value || 'monofasico';
        const isTrifasico = tipoRede.toLowerCase().includes('trif');
        
        // Quantidade de Inversores (Mínimo 1 para exibição inicial)
        const qtdInversores = Math.max(1, carrinhoInversores.reduce((acc, i) => acc + i.qtd, 0));
        
        // Potência Total (para decisão de eletrocalha)
        const potTotalAC_kW = carrinhoInversores.reduce((acc, i) => acc + (i.nominal * i.qtd), 0) / 1000;
        const limitePotencia = pMatPrem.limite_potencia_mono || 12;

        // 3. Definição Dinâmica dos Itens (Lógica de Engenharia)
        const itens = [];

        // A. QDG (Filtrado por Rede)
        if (isTrifasico) {
            itens.push({ 
                id: "qdg_trif", 
                nome: "QDG Trifásico", 
                badge: "Trifásico",
                valor: pMatPrem.va_qdg_trif_premum || 300.00, 
                obrigatorio: false, 
                selecionadoPadrao: true 
            });
        } else {
            itens.push({ 
                id: "qdg_mono", 
                nome: "QDG Monofásico", 
                badge: "Monofásico",
                valor: pMatPrem.va_qdg_mono_premium || 150.00, 
                obrigatorio: false, 
                selecionadoPadrao: true 
            });
        }

        // B. Eletrocalha (Decisão Técnica 50mm vs 100mm baseada em potência/qtd)
        // Regra: > Limite(12kW) OU > 1 Inversor usa 100mm
        const usa100mm = potTotalAC_kW > limitePotencia || qtdInversores > 1;
        const custoEletrocalhaUnit = usa100mm ? (pMatPrem.va_eletrocalha_100 || 158.00) : (pMatPrem.va_eletrocalha_50 || 85.00);
        const nomeEletrocalha = "Eletrocalha Galvanizada";
        const dimEletrocalha = usa100mm ? "100mm" : "50mm";
        
        itens.push({
            id: "eletrocalha_dinamica",
            nome: nomeEletrocalha,
            badge: dimEletrocalha,
            qtd: qtdInversores,
            valor: custoEletrocalhaUnit * qtdInversores,
            obrigatorio: false,
            selecionadoPadrao: true
        });

        // C. Bloco de Distribuição (Qtd baseada na rede: 3 para Mono/Bi, 5 para Tri)
        const qtdBlocos = isTrifasico ? 5 : 3;
        const custoBlocoUnit = pMatPrem.va_bloco_distribuicao || 90.00;
        
        itens.push({
            id: "bloco_dist",
            nome: "Blocos de Distribuição DIN",
            badge: isTrifasico ? "5 Polos" : "3 Polos",
            qtd: qtdBlocos,
            valor: custoBlocoUnit * qtdBlocos,
            obrigatorio: false,
            selecionadoPadrao: true
        });

        // D. Tampa Acrílico (1 Por Inversor)
        const custoTampaUnit = pMatPrem.va_tampa_acrilico || 335.00;
        
        itens.push({
            id: "tampa_acrilico",
            nome: "Proteção Acrílica (Inversor)", // Texto corrigido
            badge: "Padrão",
            qtd: qtdInversores,
            valor: custoTampaUnit * qtdInversores,
            obrigatorio: false,
            selecionadoPadrao: true
        });

        // Delega renderização para View
        geradorView.renderizarOpcionaisPremium(containerWrapper, itens, estadoAnterior);
    }

    // ======================================================================
    // 🛒 LÓGICA DO CARRINHO DE INVERSORES (MULTI-INVERSOR)
    // ======================================================================

    window.aplicarComposicao = function (itensJson, indexSugestao) {
        const itens = JSON.parse(decodeURIComponent(itensJson));
        carrinhoInversores = []; // Limpa o carrinho atual

        itens.forEach(it => {
            // Adiciona diretamente ao carrinho
            carrinhoInversores.push({ modelo: it.mod, nominal: it.nom, tipo: it.tipo, qtd: it.qtd, mppt: it.mppt });
        });

        // Atualiza estado visual
        estadoSelecaoInversor = { tipo: 'SUGESTAO', id: indexSugestao };
        renderizarTabelaHuawei(); // Re-renderiza para aplicar classes

        // REMOVIDO AVANÇO AUTOMÁTICO
        // gerenciadorEtapas.avancarPara('financeiro');

        atualizarComposicaoFinal();
    }

    window.adicionarAoCarrinho = function (modelo, nominal, tipo, mppt) {
        const qtdInput = document.getElementById(`qtd_${modelo.replace(/\s/g, '')}`);
        const qtd = parseInt(qtdInput ? qtdInput.value : 1) || 1;

        // Verifica se já existe, se sim aumenta a qtd, se não adiciona
        const index = carrinhoInversores.findIndex(i => i.modelo === modelo);
        if (index > -1) {
            carrinhoInversores[index].qtd += qtd;
        } else {
            carrinhoInversores.push({ modelo, nominal, tipo, qtd, mppt });
        }

        // Atualiza estado visual para Manual
        estadoSelecaoInversor = { tipo: 'MANUAL', id: modelo };
        renderizarTabelaHuawei(); // Re-renderiza para aplicar classes

        // REMOVIDO AVANÇO AUTOMÁTICO
        // gerenciadorEtapas.avancarPara('financeiro');

        atualizarComposicaoFinal();
    }

    window.removerDoCarrinho = function (index) {
        carrinhoInversores.splice(index, 1);
        atualizarComposicaoFinal();

        // Se esvaziar, limpa a seleção visual
        if (carrinhoInversores.length === 0) {
            estadoSelecaoInversor = { tipo: null, id: null };
            renderizarTabelaHuawei();
            // Se esvaziar, garante que estamos na etapa de Inversores e limpa o financeiro
            gerenciadorEtapas.recuarPara('inversores');
        }
    }

    function atualizarComposicaoFinal() {
        const container = document.getElementById('container_selecionados');
        const lista = document.getElementById('lista_inversores_escolhidos');
        const resumo = document.getElementById('resumo_tecnico_combinado');
        const overAlvo = parseFloat(document.getElementById('sel_oversizing').value);


        // Exibe ou oculta o container de itens selecionados
        if (carrinhoInversores.length === 0) {
            container.style.display = 'none';
            gerenciarEstadoCalculo('INVALIDAR');
        } else {
            container.style.display = 'block';
        }

        // 1. Dados do Projeto
        const elPotDC = document.getElementById('potencia_dc_total');
        const potDCInstaladaWp = elPotDC ? (parseFloat(elPotDC.innerText) * 1000) : 0;

        const elHsp = document.getElementById('hsp_bruto');
        const hsp = elHsp ? (parseFloat(elHsp.innerText) || 5.0) : 5.0;

        // Recalcula PR (Unificado)
        const elGeracao = document.getElementById('fixo_geracao');
        const geracaoX_Projeto = elGeracao ? (parseFloat(elGeracao.innerText) || 0) : 0;

        const prProjeto = geracaoX_Projeto > 0 && potDCInstaladaWp > 0 && hsp > 0
            ? (geracaoX_Projeto * 1000) / (potDCInstaladaWp * hsp * 30.4166)
            : 0.83;

        // Cálculo da Potência Nominal Total AC (Soma dos Inversores)
        const potNominalTotalAC = carrinhoInversores.reduce((acc, i) => acc + (i.nominal * i.qtd), 0);

        // Delega renderização da lista
        geradorView.renderizarListaInversoresSelecionados(lista, carrinhoInversores, overAlvo);

        // 3. Cálculos Combinados
        // CÁLCULO DE OVERLOADING REAL (DC/AC)
        const perdaTemp = parseFloat(document.getElementById('p_temp_mod')?.value) || 10.13;
        const fatorDerating = 1 - (perdaTemp / 100);

        const ratioNominal = potNominalTotalAC > 0 ? (potDCInstaladaWp / potNominalTotalAC) : 0;
        const ratioEfetivo = ratioNominal * fatorDerating;
        const percentualCarregamento = ratioEfetivo * 100; // Exibe a carga EFETIVA

        // CÁLCULO DE EXPANSÃO LINEAR
        const wattsModulo = parseFloat(document.getElementById('select_modulo_comparativo').value) || 580;
        const qtdModulosAtual = parseInt(document.getElementById('total_modulos_projeto').value) || 0;

        // A expansão é baseada no limite seguro do inversor (ex: 1.35x) menos o que já está instalado
        // Se o inversor já está saturado (Overloading alto), a expansão é zero.
        const limiteTecnicoExpansao = potNominalTotalAC * overAlvo; // Usa o limite configurado (ex: 150%)
        const wattsExpansao = limiteTecnicoExpansao - potDCInstaladaWp;
        const numPlacasExp = Math.floor(Math.max(0, wattsExpansao) / wattsModulo);

        // Cálculo Linear: (Geração Atual / Qtd Atual) * (Qtd Atual + Expansão)
        const geracaoMaximaTotal = qtdModulosAtual > 0 ? (geracaoX_Projeto / qtdModulosAtual) * (qtdModulosAtual + numPlacasExp) : 0;

        // 4. Validações Técnicas (Clipping e Overloading)
        let avisos = [];
        statusTecnicoSistema = { valido: true, nivel: 'OK', mensagem: '' };

        // 1. Validação de Bloqueio (Oversizing Selecionado)
        // Bloqueia APENAS se o oversizing nominal ultrapassar o limite que o usuário escolheu no dropdown
        if (ratioNominal > overAlvo) {
            const overAtual = (ratioNominal - 1) * 100;
            const overLimite = (overAlvo - 1) * 100;
            avisos.push(`<div class='alerta-critico'><i class="fas fa-ban"></i> <strong>Limite Excedido:</strong> O Oversizing atual (${overAtual.toFixed(1)}%) é maior que o limite selecionado (${overLimite.toFixed(0)}%). Aumente o limite na seleção ou adicione inversores. <strong>A proposta será bloqueada.</strong></div>`);
            statusTecnicoSistema = { valido: false, nivel: 'CRITICO', mensagem: 'Limite de Oversizing Excedido' };
        }

        // 2. Diagnóstico de Eficiência (Carga Efetiva) - Apenas Informativo/Referência
        if (ratioEfetivo > 1.40) {
            avisos.push(`<div class='alerta-atencao'><i class="fas fa-radiation-alt"></i> <strong>Alta Carga Efetiva (${percentualCarregamento.toFixed(0)}%):</strong> O inversor está operando com carga muito alta. Verifique se a corrente de entrada está dentro dos limites.</div>`);
        }
        else if (ratioEfetivo > 1.15) {
            avisos.push(`<div class='alerta-atencao'><i class="fas fa-exclamation-triangle"></i> <strong>Atenção: Overloading de ${percentualCarregamento.toFixed(0)}%</strong>. O sistema operará com Clipping (perda de energia) nos horários de pico. Verifique se isso é intencional.</div>`);
            if (statusTecnicoSistema.valido) statusTecnicoSistema = { valido: true, nivel: 'ATENCAO', mensagem: 'Risco de Clipping' };
        }
        else if (ratioEfetivo < 0.70) {
            avisos.push(`<div class='alerta-info'><i class="fas fa-info-circle"></i> <strong>Inversor Superdimensionado (${percentualCarregamento.toFixed(0)}%):</strong> O inversor está trabalhando com folga excessiva. Considere aumentar os painéis ou reduzir o inversor para otimizar o custo.</div>`);
            if (statusTecnicoSistema.valido) statusTecnicoSistema = { valido: true, nivel: 'INFO', mensagem: 'Inversor Ocioso' };
        }
        else {
            avisos.push(`<div class='alerta-sucesso'><i class="fas fa-check-circle"></i> <strong>Dimensionamento Ideal (${percentualCarregamento.toFixed(0)}%):</strong> Excelente relação custo-benefício. A carga efetiva no inversor está otimizada considerando as perdas térmicas.</div>`);
        }

        // Validação de Potência Absoluta (Caso o usuário force manual muito errado)
        if (potNominalTotalAC * 2 < potDCInstaladaWp / 1000) {
            avisos.push(`<div class='alerta-erro'><i class="fas fa-ban"></i> <strong>Erro Fatal:</strong> Potência DC é mais que o dobro da AC. Configuração inválida.</div>`);
            statusTecnicoSistema.valido = false;
        }

        // Aviso de Multi-Inversor
        const qtdTotalInversores = carrinhoInversores.reduce((acc, i) => acc + i.qtd, 0);
        if (qtdTotalInversores > 1) {
            avisos.push(`<div class='alerta-info-suave'><i class="fas fa-layer-group"></i> <strong>Sistema Multi-Inversor:</strong> Custos ajustados para ${qtdTotalInversores} equipamentos.</div>`);
        } else {
            // Limpa avisos antigos se voltou para 1 inversor
        }

        // Aviso de Seleção Manual
        if (estadoSelecaoInversor.tipo === 'MANUAL') {
            avisos.push(`<div class='alerta-aviso' style="color: #b45309; background: #fffbeb; border: 1px dashed #f59e0b; padding: 8px; border-radius: 6px; margin-top: 5px;"><i class="fas fa-hand-paper"></i> <strong>Seleção Manual:</strong> Esta configuração foi definida manualmente pelo engenheiro.</div>`);
        }

        // 5. Renderiza Resumo Técnico via View
        geradorView.renderizarResumoTecnico(resumo, geracaoX_Projeto, numPlacasExp, geracaoMaximaTotal, avisos);

        // ATUALIZAÇÃO DOS OPCIONAIS PREMIUM (Quantidades Dinâmicas baseadas nos inversores)
        renderizarOpcionaisPremium();

        // Chama a validação final
        validarBotaoFinal();

        // ATUALIZAÇÃO FINANCEIRA AUTOMÁTICA
        // Garante que mudanças nos inversores (complexidade) ou módulos (quantidade) reflitam no preço
        if (carrinhoInversores.length > 0) {
            window.calcularEngenhariaFinanceira();
        }

        // Renderiza o botão de avançar SEMPRE, mas desabilitado se vazio
        // Alvo alterado para 'card-dimensionamento-inversor' para ficar visível mesmo com carrinho vazio
        const temItens = carrinhoInversores.length > 0;
        
        // Força atualização do custo do kit sempre que a composição mudar
        window.calcularEngenhariaFinanceira();

        // Atualiza o resumo superior (caso esteja visível ou vá ficar)
        renderizarResumoSuperiorFinanceiro();

        // FIX: Só atualiza o botão se estivermos na etapa de inversores
        const etapaAtual = gerenciadorEtapas.ordem[projetoGerenciador.etapaIndex] || null;
        if (etapaAtual === 'inversores') {
            renderizarBotaoNavegacao('card-dimensionamento-inversor', 'window.avancarParaFinanceiro()', temItens ? 'Inversores Definidos' : 'Selecione os Inversores', 'Avançar para Financeiro', temItens);
        }

        // Sincroniza o Header Fixo com os novos dados de inversores (AC e Carga)
        sincronizarEngenhariaUnica();
    }

    window.filtrarTabelaHuawei = function () {
        renderizarTabelaHuawei();
    };

    window.toggleListaCompleta = function () {
        const lista = document.getElementById('lista_completa_scroll');
        if (lista.style.display === 'none') {
            lista.style.display = 'block';
        } else {
            lista.style.display = 'none';
        }
    }

    window.toggleListaInversores = function () {
        const container = document.getElementById('container_lista_inversores_manual');
        if (container) {
            container.style.display = container.style.display === 'none' ? 'block' : 'none';
        }
    }

    function prepararListaCompleta(listaRestante, pMinimaKwp) {
        const container = document.getElementById('lista_completa_scroll');
        if (!container) return;
        geradorView.renderizarListaCompletaModulos(container, listaRestante, pMinimaKwp);
    }

    // ======================================================================
    // 📐 MOTOR DE ORIENTAÇÃO COMPOSTA
    // ======================================================================
    window.alternarModoOrientacao = function (modo) {
        modoOrientacao = modo;
        const subSimples = document.getElementById('subsecao_simples');
        const subComposto = document.getElementById('subsecao_composto');

        if (modo === 'simples') {
            subSimples.style.display = 'block';
            subComposto.style.display = 'none';
        } else {
            subSimples.style.display = 'none';
            subComposto.style.display = 'block';
            // Se a tabela composta estiver vazia, cria a primeira linha espelhando o modo simples
            if (document.getElementById('container_orientacoes_compostas').children.length === 0) {
                window.adicionarLinhaOrientacao(true);
            }
        }
        recalcularDimensionamento();
    };

    window.adicionarLinhaOrientacao = function (primeira = false) {
        const container = document.getElementById('container_orientacoes_compostas');
        const azimuteGeral = document.getElementById('azimute_geral').value;
        const inclinacaoGeral = document.getElementById('inclinacao_geral').value;

        const div = document.createElement('div');
        div.className = 'linha-orientacao';
        div.innerHTML = `
            <div class="grupo-form">
                <label>% da Potência</label>
                <input type="number" class="input-perc input-monitorado" value="${primeira ? 100 : 0}" oninput="window.validarSomaOrientacao(true)">
            </div>
            <div class="grupo-form">
                <label>Azimute (°)</label>
                <input type="number" class="input-az input-monitorado" value="${azimuteGeral}">
            </div>
            <div class="grupo-form">
                <label>Inclinação (°)</label>
                <input type="number" class="input-inc input-monitorado" value="${inclinacaoGeral}">
            </div>
            <div class="grupo-form">
                <label>&nbsp;</label>
                <button class="btn-remover-linha" onclick="window.removerLinhaOrientacao(this)"><i class="fas fa-trash"></i></button>
            </div>
        `;
        container.appendChild(div);

        // Se não for a primeira linha, zera o 100% da linha anterior para forçar o usuário a redistribuir
        if (!primeira && container.children.length > 1) {
            const primeiraLinhaPercInput = container.children[0].querySelector('.input-perc');
            if (primeiraLinhaPercInput.value === '100') {
                primeiraLinhaPercInput.value = '';
            }
        }

        // Re-atribui listeners para os novos inputs
        div.querySelectorAll('.input-monitorado').forEach(input => {
            input.addEventListener('change', handlePremiseChange);
        });

        window.validarSomaOrientacao();
    };

    window.removerLinhaOrientacao = function (btn) {
        const container = document.getElementById('container_orientacoes_compostas');
        if (container.children.length > 1) {
            btn.closest('.linha-orientacao').remove();
            window.validarSomaOrientacao();
            recalcularDimensionamento();
        } else {
            customAlert("É necessário manter pelo menos uma orientação.");
        }
    };

    window.validarSomaOrientacao = function (apenasVisual = false) {
        if (modoOrientacao === 'simples') return true;

        const inputs = document.querySelectorAll('#container_orientacoes_compostas .input-perc');
        let soma = 0;
        inputs.forEach(input => {
            soma += parseFloat(input.value) || 0;
        });

        const statusEl = document.getElementById('status_soma_perc');
        statusEl.innerText = `Total: ${soma}%`;

        // Usa tolerância para float (ex: 99.999...)
        if (Math.abs(soma - 100) < 0.1) {
            statusEl.style.color = '#16a34a'; // Verde
            if (!apenasVisual) recalcularDimensionamento();
            atualizarEstadoBotaoPremissas(); // Atualiza botão em tempo real
            return true;
        } else {
            statusEl.style.color = '#dc2626'; // Vermelho
            gerenciarEstadoCalculo('INVALIDAR');
            atualizarEstadoBotaoPremissas(); // Atualiza botão em tempo real (bloqueia)
            return false;
        }
    };

    // --- NOVA FUNÇÃO: VERIFICAR TIPO DE ESTRUTURA (SOLO/LAJE) ---
    window.verificarTipoEstrutura = function (skipCalculation = false) {
        // CORREÇÃO: Usa dados do projeto em vez de input inexistente
        const tipo = (projetoCompleto.projeto.tipoTelhado || '').toLowerCase();
        const wrapperOrigem = document.getElementById('wrapper_origem_estrutura');

        const isSoloLaje = tipo.includes('solo') || tipo.includes('laje');

        // Lógica visual: Só mostra a origem se for Solo ou Laje
        if (isSoloLaje) {
            if (wrapperOrigem) wrapperOrigem.style.display = 'block';
            window.atualizarSugestaoEspacamento(); // Atualiza ao mostrar
        } else {
            if (wrapperOrigem) wrapperOrigem.style.display = 'none';
            const divSugestao = document.getElementById('sugestao_espacamento_dinamica');
            if (divSugestao) divSugestao.style.display = 'none';
        }

        // Chama o recálculo para atualizar diárias e custos de estrutura
        if (!skipCalculation && typeof window.calcularEngenhariaFinanceira === 'function') {
            window.calcularEngenhariaFinanceira();
        }
    };

    // NOVA FUNÇÃO: Calcula e exibe o espaçamento sugerido
    window.atualizarSugestaoEspacamento = function() {
        // CORREÇÃO: Usa dados do projeto
        const tipo = (projetoCompleto.projeto.tipoTelhado || '').toLowerCase();
        
        if (!tipo.includes('solo') && !tipo.includes('laje')) return;

        const watts = parseFloat(document.getElementById('select_modulo_comparativo')?.value) || 550;
        const inclinacao = parseFloat(document.getElementById('inclinacao_geral')?.value) || 10;

        const dados = calcularEspacamentoFileiras(watts, inclinacao);

        // Onde exibir? Vamos injetar um card informativo dentro do wrapper de origem
        const wrapperOrigem = document.getElementById('wrapper_origem_estrutura');
        if (!wrapperOrigem) return;

        let container = document.getElementById('sugestao_espacamento_dinamica');
        if (!container) {
            container = document.createElement('div');
            container.id = 'sugestao_espacamento_dinamica';
            container.className = 'alerta-info-suave'; // Usa classe existente do CSS
            container.style.marginTop = '15px';
            container.style.borderLeft = '4px solid #0ea5e9';
            container.style.backgroundColor = '#f0f9ff';
            wrapperOrigem.appendChild(container);
        }

        container.style.display = 'block';
        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:15px;">
                <i class="fas fa-ruler-combined" style="font-size:1.8rem; color:#0ea5e9;"></i>
                <div>
                    <strong style="color:#0f172a; display:block; font-size:0.95rem;">Sugestão de Espaçamento (Pitch)</strong>
                    <div style="font-size:0.9rem; color:#334155; margin-top:4px;">
                        Módulo <strong>${watts}W</strong> (${dados.comprimentoPainel.toFixed(3)}m) a <strong>${inclinacao}°</strong>
                    </div>
                    <div style="margin-top:6px; font-size:0.9rem;">
                        Distância entre pés: <strong style="color:#0ea5e9; font-size:1.1rem;">${dados.distanciaTotal.toFixed(2)} m</strong>
                        <span style="font-size:0.8rem; color:#64748b; margin-left:8px;">(Sombra projetada: ${dados.sombra.toFixed(2)}m)</span>
                    </div>
                </div>
            </div>
        `;
    };

    // Função para expandir/recolher seções
    window.toggleSecao = function (idConteudo, idIcone) {
        const conteudo = document.getElementById(idConteudo);
        const icone = document.getElementById(idIcone);

        if (conteudo.style.display === "block") {
            conteudo.style.display = "none";
            icone.classList.remove('rotated');
        } else {
            conteudo.style.display = "block";
            icone.classList.add('rotated');
        }
    };

    function sincronizarGeralParaComposto() {
        const linhas = document.querySelectorAll('#container_orientacoes_compostas .linha-orientacao');
        if (linhas.length === 1) {
            linhas[0].querySelector('.input-az').value = document.getElementById('azimute_geral').value;
            linhas[0].querySelector('.input-inc').value = document.getElementById('inclinacao_geral').value;
        }
    };

    // --- NOVA FUNÇÃO: Validação em Tempo Real das Premissas ---
    function atualizarEstadoBotaoPremissas() {
        // 1. Validação de Consumo
        const consumo = parseFloat(document.getElementById('uc_consumo')?.value) || 0;
        const consumoValido = consumo > 0;

        // 2. Validação de Orientação (Geometria)
        let orientacaoValida = true;
        if (modoOrientacao === 'composto') {
            const inputs = document.querySelectorAll('#container_orientacoes_compostas .input-perc');
            let soma = 0;
            inputs.forEach(input => soma += parseFloat(input.value) || 0);
            orientacaoValida = (Math.abs(soma - 100) < 0.1);
        } else {
            // Modo Simples: Verifica se Azimute e Inclinação estão preenchidos e são números
            const az = document.getElementById('azimute_geral')?.value;
            const inc = document.getElementById('inclinacao_geral')?.value;
            orientacaoValida = (az !== '' && inc !== '' && !isNaN(parseFloat(az)) && !isNaN(parseFloat(inc)));
        }

        // 3. Validação de Perdas (Campos Críticos)
        const efici = document.getElementById('p_efici_inv')?.value;
        const perdasValidas = (efici !== '' && !isNaN(parseFloat(efici)));

        const premissasValidas = consumoValido && orientacaoValida && perdasValidas;

        let textoFeedback = 'Premissas Definidas';
        if (!consumoValido) textoFeedback = 'Informe o Consumo';
        else if (!orientacaoValida) textoFeedback = 'Verifique Orientação/Inclinação';
        else if (!perdasValidas) textoFeedback = 'Verifique os Parâmetros de Perdas';

        // POSICIONAMENTO EXTERNO (Abaixo do Card de Perdas ou Geometria)
        // Atualiza o botão fixo na barra de navegação
        // FIX: Só atualiza se estivermos na etapa de premissas
        const etapaAtual = gerenciadorEtapas.ordem[projetoGerenciador.etapaIndex] || null;
        if (etapaAtual === 'premissas') {
            renderizarBotaoNavegacao(null, 'window.confirmarPremissasEAvançar()', textoFeedback, 'Avançar para Módulos', premissasValidas);
        }
    }

    // --- Event Listeners ---
    const inputsGatilho = document.querySelectorAll('.input-monitorado');
    inputsGatilho.forEach(input => {
        // Higieniza em tempo real
        input.addEventListener('input', (e) => {
            // Ignora elementos SELECT para evitar que o texto das opções seja apagado pela higienização numérica
            if (e.target.tagName === 'SELECT') return;

            const valorOriginal = e.target.value;
            const valorHigienizado = higienizarParaCalculo(valorOriginal);
            if (valorOriginal !== valorHigienizado) {
                e.target.value = valorHigienizado;
            }
            // Valida o botão de avançar em tempo real para evitar bloqueio indevido
            atualizarEstadoBotaoPremissas();
        });
        // Dispara o recálculo na mudança
        input.removeEventListener('change', handlePremiseChange); // Evita duplicatas
        input.addEventListener('change', handlePremiseChange);
    });

    // Listener específico para validação em tempo real do Consumo
    if (inputConsumo) {
        inputConsumo.addEventListener('input', atualizarEstadoBotaoPremissas);
    }

    // Listeners específicos para campos de perdas (Garantia de Reatividade)
    const inputsPerdas = [pEficiInv, pTempInv, pTempMod, pCabosTotal, pExtras, pIndisp];
    inputsPerdas.forEach(input => {
        if (input) {
            input.removeEventListener('change', handlePremiseChange);
            input.addEventListener('change', handlePremiseChange);
        }
    });

    // Listeners específicos para campos financeiros (não resetam engenharia)
    const inputsFinanceiros = document.querySelectorAll('.input-financeiro');
    inputsFinanceiros.forEach(input => {
        // Ao tocar no financeiro, garante que estamos na etapa financeira (se já passamos pelos inversores)
        // input.addEventListener('focus', () => gerenciadorEtapas.avancarPara('financeiro'));

        // Usa 'input' para cálculo em tempo real ou 'change' para cálculo ao sair
        input.addEventListener('input', () => window.calcularEngenhariaFinanceira());
    });

    // Garante que fator de lucro, imposto e kit disparem o recálculo explicitamente
    const idsFinanceiros = ['fator_std', 'fator_prm', 'prem_aliquota_imposto', 'valor_kit_std', 'valor_kit_prm', 'prem_lucro_minimo'];
    idsFinanceiros.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // el.addEventListener('focus', () => gerenciadorEtapas.avancarPara('financeiro'));
            el.addEventListener('input', () => window.calcularEngenhariaFinanceira());
        }
    });

    // Listeners para Estrutura (Correção do Erro ReferenceError)
    const selectOrigemListener = document.getElementById('select_origem_estrutura');
    if (selectOrigemListener) {
        selectOrigemListener.addEventListener('change', () => window.calcularEngenhariaFinanceira());
    }

    // Listener para Origem da Venda (Garante recálculo de comissão)
    const selectOrigemVendaListener = document.getElementById('origem_venda');
    if (selectOrigemVendaListener) {
        selectOrigemVendaListener.addEventListener('change', () => window.calcularEngenhariaFinanceira());
    }

    // ======================================================================
    // 💲 MOTOR DE ENGENHARIA FINANCEIRA (CÁLCULO DE PREÇO)
    // ======================================================================

    // TODO: Mover lógica financeira para 'model.js' conforme documentacao_tecnica.md (Seção 5.2)
    window.calcularEngenhariaFinanceira = function () {
        // Define a função de formatação no início do escopo para evitar ReferenceError
        const formatarMoeda = (val) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const premissas = db.buscarConfiguracao('premissas_globais');

        // Elementos DOM
        const elQtdModulos = document.getElementById('total_modulos_projeto');
        const elOrigemEstrutura = document.getElementById('select_origem_estrutura');
        const elImposto = document.getElementById('prem_aliquota_imposto');
        const elLucroMinimo = document.getElementById('prem_lucro_minimo');
        // Origem da venda vem do projeto, não mais de um input na tela
        const origemVenda = projetoCompleto.projeto.origemVenda || 'nenhum';

        const qtdModulos = parseInt(elQtdModulos?.value) || 0;
        // LÊ DIRETO DO PROJETO (Segurança de Dados)
        const tipoEstrutura = (projetoCompleto.projeto.tipoTelhado || 'Telhado').toLowerCase();
        const origemEstrutura = elOrigemEstrutura?.value || 'KIT';

        // --- CÁLCULO DE POTÊNCIA DC (Movido para o início para uso global na função) ---
        const potDCInstaladaWp = qtdModulos * (parseInt(document.getElementById('select_modulo_comparativo').value) || 0);

        // Premissas
        const pFin = premissas?.financeiro || {};
        const pEst = premissas?.estruturas || {};
        const pLog = premissas?.logistica || {}; // NOVO: Leitura correta da logística
        const pMatPrem = premissas?.materiaisPremium || {};
        const tabelaMat = premissas?.tabelas?.materiais;
        const tabelaMO = premissas?.tabelas?.maoDeObra;

        // Recupera o tipo de rede atualizado do input oculto ou do projeto
        const tipoRedeAtual = document.getElementById('uc_tipo_padrao')?.value || 'monofasico';

        // --- AUTO-PREENCHIMENTO DO CUSTO DO KIT (Se vazio) ---
        const inputKitStd = document.getElementById('valor_kit_std');
        const inputKitPrm = document.getElementById('valor_kit_prm');
        
        // Calcula separadamente para Standard e Premium
        const resKitStd = calcularCustoKit(estadoSelecaoModulo, carrinhoInversores, false, tipoRedeAtual);
        const resKitPrm = calcularCustoKit(estadoSelecaoModulo, carrinhoInversores, true, tipoRedeAtual);

        if (resKitStd.total > 0) {
            // Atualiza sempre se o valor for zero ou vazio, OU se for uma atualização automática forçada (ex: mudança de módulos)
            // Para evitar sobrescrever edições manuais, podemos checar uma flag ou apenas atualizar se estiver vazio/zero.
            // Mas o usuário pediu para atualizar quando muda a configuração. Vamos forçar a atualização se o valor atual for diferente do calculado E não tiver sido editado manualmente (difícil rastrear sem flag).
            // Por enquanto, vamos manter a lógica de "se vazio ou zero", mas adicionar uma lógica para atualizar se o usuário não tiver "travado" o valor.
            // Melhor abordagem: Atualizar o valor sugerido sempre que houver recálculo técnico, assumindo que a mudança de hardware DEVE refletir no preço.
            if (inputKitStd) {
                inputKitStd.value = resKitStd.total.toFixed(2);
            }
        }
        
        if (resKitPrm.total > 0) {
            if (inputKitPrm) {
                inputKitPrm.value = resKitPrm.total.toFixed(2);
            }
        }

        // =================================================================
        // 1. CÁLCULO DE MATERIAIS (Lógica Acumulada: Base + Estrutura + Premium)
        // =================================================================
        // Base (Sempre existe)
        let custoMateriais = calcularCustoMateriaisBasicos(qtdModulos, tabelaMat);

        // Adicional de Estrutura (Solo/Laje)
        // Afeta AMBAS as propostas (Standard e Premium)
        // CORREÇÃO: Aplica custo extra automaticamente para Solo/Laje (Premissas)
        if (tipoEstrutura.includes('solo')) {
            custoMateriais += (qtdModulos * (pEst.va_estrutura_solo || 125));
        } else if (tipoEstrutura.includes('laje')) {
            custoMateriais += (qtdModulos * (pEst.va_estrutura_laje || 55));
        }

        // =================================================================
        // 1.1 CÁLCULO DE OPCIONAIS PREMIUM (Tempo Real)
        // =================================================================
        let custoOpcionais = 0;
        document.querySelectorAll('.chk-opcional:checked').forEach(chk => {
            custoOpcionais += parseFloat(chk.dataset.valor || 0);
        });

        // =================================================================
        // 2. CÁLCULO DE DIAS E LOGÍSTICA (Tempo Acumulado)
        // =================================================================
        // Cálculo de Dias (Apenas para Logística e Extras)
        const modulosPorDia = pFin.modulosPorDia || 12;
        let diasBase = qtdModulos > 0 ? Math.ceil(qtdModulos / modulosPorDia) : 0;
        let diasExtras = 0;

        // Adicional Estrutura (Tempo) - Afeta AMBAS as propostas
        if (tipoEstrutura.includes('solo')) {
            diasExtras += (qtdModulos * (pEst.diaria_extra_solo || 0.2));
        } else if (tipoEstrutura.includes('laje')) {
            diasExtras += (qtdModulos * (pEst.diaria_extra_laje || 0.1));
        }

        // Adicional Premium (Tempo)
        // Premium geralmente tem mais detalhes, adicionamos tempo extra apenas no cálculo Premium?
        // O prompt diz que a técnica é igual. Mas o Premium tem opcionais.
        // Vamos calcular os dias base e adicionar o extra apenas na coluna Premium se necessário.

        const diasTotais = diasBase + diasExtras;

        // Mínimo e Arredondamento
        const diasMinimos = pFin.diasMinimosObra || 2;
        const diasParaLogistica = Math.max(diasTotais, diasMinimos);
        const diasFinais = Math.ceil(diasParaLogistica * 2) / 2;

        // --- CUSTO DE MÃO DE OBRA (Híbrido: Tabela Base + Extras por Tempo) ---
        const valorDiariaTecnica = pMatPrem.va_diaria_instalador || 390;

        // 1. M.O. Base: Busca da Tabela de Premissas (ex: R$ 150/módulo)
        // Isso corrige o erro de calcular apenas dias * diária para a base
        const custoMOBase = calcularMaoObraBase(qtdModulos, tabelaMO);

        // 2. M.O. Extra: Cobra apenas o tempo excedente (Solo/Laje/Premium)
        const custoMOExtra = diasExtras * valorDiariaTecnica;

        const custoMO = custoMOBase + custoMOExtra;

        // Logística (Baseada em KM e Dias)
        const cidadeNormalizada = (projetoCompleto?.projeto?.cidade || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const dadosCidade = baseDadosAlagoas[cidadeNormalizada];
        const distanciaIda = (dadosCidade && dadosCidade.dist !== undefined) ? dadosCidade.dist : 100;
        const kmSuprimentos = pFin.kmSuprimentos || 15;
        const kmDiario = (distanciaIda * 2) + (pFin.kmAlmoco || 5);
        const kmTotal = kmSuprimentos + (diasFinais * kmDiario);
        const custoLogistica = (kmTotal / (pLog.consumoVeiculo || 8.5)) * (pLog.precoCombustivel || 6.10);

        // =================================================================
        // 2.1 CÁLCULO DE COMISSÃO (Custo Variável de Venda)
         // 3. TOTALIZADOR FINAL (MARKUP POR ITEM)
        // =================================================================
        const lucroMinimo = parseFloat(elLucroMinimo?.value) || pFin.lucroMinimo || 0; // Piso de lucro
        const aliquotaImposto = (parseFloat(elImposto?.value) || 0) / 100;
        const divisorImposto = (1 - aliquotaImposto) > 0 ? (1 - aliquotaImposto) : 1;

        const taxasComissao = pFin.taxasComissao || { indicador: 2.0, representante: 5.0 };
        
        let taxaComissaoAplicada = 0;
        if (origemVenda === 'indicador') taxaComissaoAplicada = taxasComissao.indicador || 0;
        if (origemVenda === 'representante') taxaComissaoAplicada = taxasComissao.representante || 0;
        
        const taxaComissaoDecimal = taxaComissaoAplicada / 100;

        // --- FUNÇÃO DE CÁLCULO POR VERSÃO ---
        const calcularVersao = (tipo, valorKitInput, fatorInput, custoOpcionaisVersao, diasExtrasVersao) => {
            const valorKit = parseFloat(valorKitInput) || 0;
            const fator = parseFloat(fatorInput) || 1.1;
            
            // Ajuste de dias e MO para Premium
            const diasFinaisVersao = diasFinais + diasExtrasVersao;
            const custoMOVersao = custoMO + (diasExtrasVersao * valorDiariaTecnica);
            
            // Lucro
            let lucroNominal = custoMOVersao * fator;
            if (lucroNominal < lucroMinimo) lucroNominal = lucroMinimo;

            // Custos Fixos do Serviço
            const custosFixosServico = custoMOVersao + custoLogistica + custoMateriais + custoOpcionaisVersao + lucroNominal;
            
            // Denominador do Markup Global (Imposto + Comissão)
            const denominadorGlobal = (1 - aliquotaImposto - taxaComissaoDecimal);
            const divisorGlobal = denominadorGlobal > 0.01 ? denominadorGlobal : 0.01;

            // Preço de Venda do Serviço
            const precoVendaServico = (custosFixosServico + (valorKit * taxaComissaoDecimal)) / divisorGlobal;

            // Valor absoluto da comissão
            const valorComissao = (precoVendaServico + valorKit) * taxaComissaoDecimal;

            // Imposto Real
            const baseTotal = custoMOVersao + lucroNominal + custoLogistica + custoMateriais + custoOpcionaisVersao + valorComissao;
            const valorImposto = precoVendaServico - baseTotal;

            const valorTotalCliente = precoVendaServico + valorKit;

            return {
                valorTotal: valorTotalCliente,
                potenciaTotal: potDCInstaladaWp / 1000, // Salva a potência instalada (kWp)
                valorKit: valorKit,
                custoMateriais: custoMateriais + custoOpcionaisVersao,
                custoMO: custoMOVersao,
                custoLogistica: custoLogistica,
                lucroReal: lucroNominal,
                impostoReal: valorImposto,
                comissao: valorComissao,
                precoVendaServico: precoVendaServico,
                diasObra: diasFinaisVersao,
                fatorLucro: fator
            };
        };

        // CÁLCULO STANDARD
        const resStd = calcularVersao('standard', 
            document.getElementById('valor_kit_std')?.value, 
            document.getElementById('fator_std')?.value, 
            0, 0); // Sem opcionais, sem dias extras

        // CÁLCULO PREMIUM
        const resPrm = calcularVersao('premium', 
            document.getElementById('valor_kit_prm')?.value, 
            document.getElementById('fator_prm')?.value, 
            custoOpcionais, 1.0); // Com opcionais, +1 dia

        // VALIDAÇÃO: Ambos os Kits devem ter valor para avançar
        const isKitValido = resStd.valorKit > 0 && resPrm.valorKit > 0;

        // --- CÁLCULO DE DADOS TÉCNICOS PARA O RESUMO (Oversizing e Eficiência) ---
        const potNominalTotalAC = carrinhoInversores.reduce((acc, i) => acc + (i.nominal * i.qtd), 0);
        
        let pctOversizing = 0;
        let badgeEficiencia = '<span style="color:#94a3b8;">N/A</span>';

        if (potNominalTotalAC > 0) {
            const ratioNominal = potDCInstaladaWp / potNominalTotalAC;
            pctOversizing = Math.max(0, (ratioNominal - 1) * 100);

            // Eficiência (Mesma lógica da tabela de sugestões)
            const perdaTemp = parseFloat(document.getElementById('p_temp_mod')?.value) || 10.13;
            const fatorDerating = 1 - (perdaTemp / 100);
            const ratioEfetivo = ratioNominal * fatorDerating;
            const pctEfetivo = ratioEfetivo * 100;

            if (ratioEfetivo > 1.30) badgeEficiencia = `<span class="badge-eficiencia critico" title="Risco de Segurança"><i class="fas fa-radiation-alt"></i> Crítico (${pctEfetivo.toFixed(0)}%)</span>`;
            else if (ratioEfetivo > 1.02) badgeEficiencia = `<span class="badge-eficiencia atencao" title="Carga acima da nominal"><i class="fas fa-arrow-up"></i> Sobrecarga (${pctEfetivo.toFixed(0)}%)</span>`;
            else if (ratioEfetivo >= 0.98) badgeEficiencia = `<span class="badge-eficiencia ideal" title="Casamento Perfeito"><i class="fas fa-check-circle"></i> Ideal (${pctEfetivo.toFixed(0)}%)</span>`;
            else if (ratioEfetivo >= 0.80) badgeEficiencia = `<span class="badge-eficiencia info" title="Carga abaixo da nominal"><i class="fas fa-arrow-down"></i> Subcarga (${pctEfetivo.toFixed(0)}%)</span>`;
            else badgeEficiencia = `<span class="badge-eficiencia ocioso" title="Inversor muito grande"><i class="fas fa-battery-empty"></i> Ocioso (${pctEfetivo.toFixed(0)}%)</span>`;
        }
        
        // CÁLCULO DE EXPANSÃO (Módulos) para o Resumo
        const wattsModulo = parseInt(document.getElementById('select_modulo_comparativo').value) || 0;
        const overAlvo = parseFloat(document.getElementById('sel_oversizing').value) || 1.0;
        const limiteTecnicoExpansao = potNominalTotalAC * overAlvo;
        const wattsExpansao = limiteTecnicoExpansao - potDCInstaladaWp;
        const numPlacasExp = wattsModulo > 0 ? Math.floor(Math.max(0, wattsExpansao) / wattsModulo) : 0;

        // 4. ATUALIZAÇÃO UI

        // --- RECONSTRUÇÃO DO PAINEL FINANCEIRO (Layout Clean) ---
        geradorView.renderizarPainelFinanceiro(document.getElementById('painel_resumo_std'), resStd, origemVenda);
        geradorView.renderizarPainelFinanceiro(document.getElementById('painel_resumo_prm'), resPrm, origemVenda);

        // Atualiza Estado Global
        projetoGerenciador.financeiro.standard = resStd;
        projetoGerenciador.financeiro.premium = resPrm;

        // Estado
        projetoGerenciador.precoCalculado = isKitValido;

        // Atualiza o Resumo Executivo
        preencherResumoExecutivo({
            inversores: carrinhoInversores,
            qtdModulos: qtdModulos,
            potenciaModulo: parseInt(document.getElementById('select_modulo_comparativo').value) || 0,
            geracaoMensal: document.getElementById('fixo_geracao').innerText.replace(' kWh', ''),
            expansao: document.getElementById('gen_max_txt') ? parseInt(document.getElementById('gen_max_txt').innerText) : 0, // Simplificado
            geracaoMax: document.getElementById('gen_max_txt') ? document.getElementById('gen_max_txt').innerText : 'N/A',
            // Dados comparativos
            qtdModulosExpansao: numPlacasExp,
            std: resStd,
            prm: resPrm,
            oversizing: pctOversizing.toFixed(1) + '%',
            badgeEficiencia: badgeEficiencia
        });

        validarBotaoFinal();

        // Renderiza o botão de avançar padronizado se o preço foi calculado
        const containerBtnId = 'wrapper-etapa-financeira';
        const containerBtn = document.getElementById(containerBtnId);

        const isPrecoOk = projetoGerenciador.precoCalculado;
        
        // FIX: Só atualiza o botão se estivermos na etapa financeira
        const etapaAtual = gerenciadorEtapas.ordem[projetoGerenciador.etapaIndex] || null;
        if (etapaAtual === 'financeiro') {
            renderizarBotaoNavegacao(containerBtnId, 'window.avancarParaResumo()', isPrecoOk ? 'Análise Financeira Concluída' : 'Defina o Valor do Kit', 'Ver Resumo e Salvar', isPrecoOk);
        }
    };

    function preencherResumoExecutivo(dados) {
        const secao = document.getElementById('secao_resumo_executivo');
        if (!secao) return;

        // Só exibe se houver preço calculado
        if (!projetoGerenciador.precoCalculado) {
            secao.innerHTML = ''; // Limpa a seção se não for válida
            secao.classList.add('etapa-oculta');
            return;
        }

        // Só exibe se houver preço calculado
        if (projetoGerenciador.precoCalculado) {
            // CORREÇÃO: Só exibe se estivermos na etapa de Resumo
            const indiceAtual = projetoGerenciador.etapaIndex || 0;
            const isResumo = gerenciadorEtapas.ordem[indiceAtual] === 'resumo';
            
            // A visibilidade agora é controlada pelo gerenciadorEtapas via classe .etapa-oculta

            // --- DADOS COMPLETOS PARA O RESUMO ---
            // Adiciona flag de manual para a view
            dados.isManual = estadoSelecaoInversor.tipo === 'MANUAL';
            
            // Delega renderização para View
            geradorView.renderizarResumoExecutivo(secao, dados, projetoCompleto);

            // Move o botão de salvar para dentro do resumo
            // Usa a variável do escopo (btnGerarProposta) pois o elemento pode ter sido removido do DOM ao limpar o innerHTML
            const btnSalvar = btnGerarProposta;
            const msgValidacao = msgValidacaoElement; // Usa referência global
            const containerBtn = document.getElementById('container_botao_salvar_final');
            let containerValidade = document.getElementById('container_validade_input');

            if (btnSalvar && containerBtn) {
                containerBtn.innerHTML = ''; // Limpa container
                
                // Wrapper para alinhar botão e mensagem
                const wrapperAction = document.createElement('div');
                wrapperAction.id = 'wrapper_acao_final'; // ID para referência
                wrapperAction.style.cssText = "display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%;";
                containerBtn.appendChild(wrapperAction);

                // --- LÓGICA DE CRIAÇÃO DO GRUPO DE AÇÕES ---
                // PRESERVAÇÃO DO INPUT DE VALIDADE (Evita perder o valor ao recriar o HTML)
                if (!containerValidade) {
                    containerValidade = document.createElement('div');
                    containerValidade.id = 'container_validade_input';
                    containerValidade.className = 'grupo-form';
                    containerValidade.style.marginBottom = '0'; // Reset de margem do form-group
                    
                    const configGlobal = db.buscarConfiguracao('premissas_globais') || {};
                    const diasPadrao = configGlobal.financeiro?.validadeProposta || 3;
                    
                    containerValidade.innerHTML = `<label for="dias_validade_proposta" style="display:block; margin-bottom:5px; color:#334155;">Validade da Proposta (Dias)</label>
                                                   <input type="number" id="dias_validade_proposta" class="input-estilizado" value="${diasPadrao}" style="width:100px; text-align:center;">`;
                }

                let grupoAcoes = document.getElementById('grupo_botao_validade');
                if (!grupoAcoes) {
                    grupoAcoes = document.createElement('div');
                    grupoAcoes.id = 'grupo_botao_validade';
                    grupoAcoes.style.cssText = "display: flex; align-items: center; gap: 15px; flex-wrap: wrap; justify-content: center;";
                }
                
                // Limpa o grupo para remontar na ordem correta (validade, depois botão)
                grupoAcoes.innerHTML = '';
                grupoAcoes.appendChild(containerValidade);
                grupoAcoes.appendChild(btnSalvar);
                
                wrapperAction.appendChild(grupoAcoes);
                
                if (msgValidacao) {
                    wrapperAction.appendChild(msgValidacao);
                    msgValidacao.style.display = 'block';
                }

                // Estilização do botão para ficar imponente
                btnSalvar.style.width = 'auto';
                btnSalvar.style.minWidth = '250px';
                btnSalvar.style.padding = '16px 32px';
                btnSalvar.style.fontSize = '1.1rem';
                btnSalvar.style.display = 'inline-flex';
                btnSalvar.style.visibility = 'visible'; // Garante visibilidade
                btnSalvar.classList.remove('oculto'); // Remove classes de ocultação se houver
                btnSalvar.style.justifyContent = 'center';
                btnSalvar.style.alignItems = 'center';
                btnSalvar.style.gap = '10px';

                // Força atualização da posição (Header vs Footer) baseado na etapa atual
                const indiceAtual = projetoGerenciador.etapaIndex || 0;
                const isResumo = gerenciadorEtapas.ordem[indiceAtual] === 'resumo';
                atualizarHeaderResumo(isResumo);
            }

            // --- CÁLCULO E EXIBIÇÃO DA ANÁLISE FINANCEIRA ---
            const premissasGlobais = db.buscarConfiguracao('premissas_globais');
            const analiseStd = calcularAnaliseFinanceira(
                { investimentoInicial: dados.std.valorTotal, geracaoPrimeiroAno: parseFloat(dados.geracaoMensal) * 12, valorKit: dados.std.valorKit },
                projetoCompleto.projeto,
                premissasGlobais
            );
            const analisePrm = calcularAnaliseFinanceira(
                { investimentoInicial: dados.prm.valorTotal, geracaoPrimeiroAno: parseFloat(dados.geracaoMensal) * 12, valorKit: dados.prm.valorKit },
                projetoCompleto.projeto,
                premissasGlobais
            );

            // Salva a análise para persistência
            projetoGerenciador.analiseFinanceira = { standard: analiseStd, premium: analisePrm };

            // Injeta os resultados no resumo (exemplo com a versão Premium)
            let resumoFinanceiroDiv = document.getElementById('resumo-viabilidade-dinamico');
            if (!resumoFinanceiroDiv) {
                resumoFinanceiroDiv = document.createElement('div');
                resumoFinanceiroDiv.id = 'resumo-viabilidade-dinamico';
                containerBtn.parentNode.insertBefore(resumoFinanceiroDiv, containerBtn);
            }
            
            // Função auxiliar para formatar moeda
            const fmt = (v) => (v || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

            // Detalhamento Didático (Premium como referência)
            const det = analisePrm.detalhes; // Assume que calcularAnaliseFinanceira retorna 'detalhes'
            
            // Fallback visual para tarifa (mesma lógica do model.js)
            const tarifaCheia = (projetoCompleto.projeto.tarifaGrupoB && projetoCompleto.projeto.tarifaGrupoB > 0)
                ? projetoCompleto.projeto.tarifaGrupoB
                : (premissasGlobais.viabilidade?.tarifaGrupoB || 0);

            resumoFinanceiroDiv.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; text-align: center;">
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <h5 style="margin:0 0 10px 0; color:#475569;">Viabilidade Standard</h5>
                        <p style="font-size:0.9rem; margin:0;">Payback: <strong style="font-size:1.1rem; color:#0f172a;">${analiseStd.paybackSimples} anos</strong><br><span style="font-size:0.8rem; color:#64748b;">(Desc.: ${analiseStd.paybackDescontado} anos)</span> | VPL: <strong>${fmt(analiseStd.vpl)}</strong></p>
                    </div>
                    <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border: 1px solid #bbf7d0;">
                        <h5 style="margin:0 0 10px 0; color:#166534;">Viabilidade Premium</h5>
                        <p style="font-size:0.9rem; margin:0;">Payback: <strong style="font-size:1.1rem; color:#16a34a;">${analisePrm.paybackSimples} anos</strong><br><span style="font-size:0.8rem; color:#64748b;">(Desc.: ${analisePrm.paybackDescontado} anos)</span> | VPL: <strong>${fmt(analisePrm.vpl)}</strong></p>
                    </div>
                </div>

                <!-- Demonstrativo Didático (Premium) -->
                <div style="margin-top: 20px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; text-align: left;">
                    <h5 style="color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 10px;">
                        <i class="fas fa-calculator"></i> Demonstrativo de Economia (Mensal Estimada)
                    </h5>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 0.9rem;">
                        <div>
                            <p style="margin: 5px 0; color: #64748b;">Fatura Atual (Sem Solar)</p>
                            <strong style="font-size: 1.1rem; color: #ef4444;">${fmt(analisePrm.detalhes.faturaSemSolarAno1)}</strong>
                        </div>
                        <div>
                            <p style="margin: 5px 0; color: #64748b;">Nova Fatura (Com Solar)</p>
                            <strong style="font-size: 1.1rem; color: #16a34a;">${fmt(analisePrm.detalhes.faturaComSolarAno1)}</strong>
                        </div>
                    </div>
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e2e8f0; font-size: 0.85rem; color: #475569;">
                        <p style="margin: 0;"><strong>Parâmetros Considerados:</strong></p>
                        <ul style="margin: 5px 0 0 20px; padding: 0;">
                            <li>Tarifa Grupo B: ${(det.tarifaConsiderada || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4})}/kWh</li>
                            <li>Fio B: ${(det.fioBConsiderado || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}/kWh</li>
                            <li>Inflação Energética: ${(det.inflacaoConsiderada || 0).toFixed(1)}% a.a.</li>
                            <li>Simultaneidade: ${(det.simultaneidadeConsiderada || 0).toFixed(0)}%</li>
                            <li>Manutenção Prev.: ${(det.manutencaoConsiderada || 0).toFixed(1)}% (Capex)</li>
                            <li>Degradação Sistêmica: ${(det.degradacaoConsiderada || 0).toFixed(2)}% a.a.</li>
                        </ul>
                    </div>
                </div>

                <!-- Tabela de Fluxo de Caixa (Scroll) -->
                <div style="margin-top: 20px;">
                    <h5 style="color: #334155; margin-bottom: 10px;"><i class="fas fa-table"></i> Fluxo de Caixa (25 Anos)</h5>
                    <div class="tabela-scroll-engenharia" style="max-height: 300px;">
                        <table class="tabela-tecnica" style="font-size: 0.8rem;">
                            <thead>
                                <tr>
                                    <th>Ano</th>
                                    <th>Geração (kWh)</th>
                                    <th>Fatura Sem Solar (Infl.)</th>
                                    <th>Fatura Com Solar</th>
                                    <th>Economia Líquida</th>
                                    <th>Fluxo Acumulado (Desc.)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${analisePrm.fluxoDeCaixa.map(row => {
                                    let style = '';
                                    let aviso = '';
                                    if (row.ano === 0) style = 'background:#fef2f2;';
                                    else if (row.acumuladoDesc > 0 && analisePrm.fluxoDeCaixa[row.ano-1]?.acumuladoDesc < 0) style = 'background:#dcfce7; font-weight:bold;';
                                    else if (row.isTrocaInversor) {
                                        style = 'background:#fff7ed; border-left: 3px solid #f59e0b;';
                                        aviso = `<i class="fas fa-tools" style="color:#f59e0b; margin-left:5px; cursor:help;" title="Substituição de Inversor (Despesa: ${fmt(row.despesa)})"></i>`;
                                    }
                                    return `
                                    <tr style="${style}">
                                        <td>${row.ano} ${aviso}</td>
                                        <td>${Math.round(row.geracao)}</td>
                                        <td>${fmt(row.faturaSemSolar)}</td>
                                        <td>${fmt(row.faturaComSolar)}</td>
                                        <td style="color:${row.fluxoLiquido > 0 ? '#16a34a' : '#dc2626'}">${fmt(row.fluxoLiquido)}</td>
                                        <td style="color:${row.acumuladoDesc > 0 ? '#16a34a' : '#dc2626'}">${fmt(row.acumuladoDesc)}</td>
                                    </tr>
                                `}).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            // 5. Comparativo (Se ambas as abas estiverem preenchidas)
            atualizarComparativoFinal();

        }
    }

    // Função dummy para compatibilidade se chamada
    function atualizarComparativoFinal() {}

    // ======================================================================
    // 🔒 VALIDAÇÃO FINAL (GATEKEEPER)
    // ======================================================================
    function validarBotaoFinal() {
        const btn = btnGerarProposta; // Usa referência global
        const msg = msgValidacaoElement; // Usa referência global

        if (!btn || !msg) return; // Safeguard contra erros de renderização

        // Verifica se há inversores no carrinho
        const temInversor = carrinhoInversores.length > 0;

        // VALIDAÇÃO UNIFICADA
        const temPreco = projetoGerenciador.precoCalculado;

        const sistemaTecnicamenteValido = statusTecnicoSistema.valido;

        if (temInversor && temPreco && sistemaTecnicamenteValido) {
            btn.disabled = false;
            btn.className = "btn-proposta-ativo"; // CSS para botão habilitado
            msg.innerHTML = '<span style="color: #16a34a;"><i class="fas fa-check"></i> Tudo pronto para salvar!</span>';
        } else {
            btn.disabled = true;
            btn.className = "btn-proposta-desabilitado";

            let pendencias = [];
            if (!sistemaTecnicamenteValido) pendencias.push("Correção Técnica (Overloading)");
            if (!temInversor) pendencias.push("Inversor");
            if (!temPreco) pendencias.push("Custos (Kits)");

            msg.innerText = `* Pendente: ${pendencias.join(" e ")}`;
            if (!sistemaTecnicamenteValido) {
                msg.innerHTML += '<br><span style="color:#dc2626; font-weight:bold;">⚠️ O sistema possui erros críticos de dimensionamento.</span>';
            }
        }
    }

    // --- 5. GERAÇÃO E SALVAMENTO DA PROPOSTA ---
    if (btnGerarProposta) {
        btnGerarProposta.addEventListener('click', async () => {
            mostrarLoadingOverlay();
            // 1. Consolida os dados da aba atual
            salvarEstadoAbaAtual();

            // 2. Prepara dados unificados
            const dadosTecnicos = projetoGerenciador.dadosTecnicos;
            const finStd = projetoGerenciador.financeiro.standard;
            const finPrm = projetoGerenciador.financeiro.premium;

            // Cria objetos de versão compatíveis com o banco
            const versaoStd = {
                dados: dadosTecnicos, // Compartilha dados técnicos
                resumoFinanceiro: finStd,
                precoCalculado: true
            };
            
            const versaoPrm = {
                dados: dadosTecnicos, // Compartilha dados técnicos
                resumoFinanceiro: finPrm,
                precoCalculado: true
            };

            // Usa Premium como referência para listagem rápida
            const resumoCapa = finPrm;

            // Captura orientações compostas se houver
            let orientacoesSnapshot = [];
            if (modoOrientacao === 'composto') {
                document.querySelectorAll('.linha-orientacao').forEach(linha => {
                    orientacoesSnapshot.push({
                        perc: linha.querySelector('.input-perc').value,
                        az: linha.querySelector('.input-az').value,
                        inc: linha.querySelector('.input-inc').value
                    });
                });
            }

            // CORREÇÃO PR: Captura o PR visual (que já aplicou a regra de <80%) para garantir fidelidade
            const prVisual = parseFloat(document.getElementById('fixo_pr_final')?.innerText.replace('%', '')) / 100;
            const prParaSalvar = prVisual > 0 ? prVisual : (dimensionamentoCompleto?.prCalculado || 0.80);

            // Captura Datas
            let diasValidade = parseFloat(document.getElementById('dias_validade_proposta').value);
            if (isNaN(diasValidade)) diasValidade = 3;

            const dataAtual = new Date().toISOString();
            const dataValidadeCalc = new Date();
            dataValidadeCalc.setTime(dataValidadeCalc.getTime() + (diasValidade * 86400000)); // Soma milissegundos (dias * 24h)
            const dataValidadeISO = dataValidadeCalc.toISOString(); // Salva ISO completo com horário

            // 3. Prepara o objeto para o banco de dados (Estrutura compatível com D1)
            const propostaParaGravar = {
                projetoId: projetoCompleto.projeto.id, // Relacionamento com Projeto
                clienteId: projetoCompleto.id,         // Relacionamento com Cliente
                
                tipoApresentacao: modoEdicao ? (propostaSalva.tipoApresentacao || 'estimativa') : 'estimativa',
                // Campos de Resumo para Listagem Rápida (Desnormalização)
                valor: resumoCapa.valorTotal,
                potenciaKwp: (dadosTecnicos.modulo.watts * dadosTecnicos.modulo.qtd) / 1000,
                geracaoMensal: parseFloat(document.getElementById('fixo_geracao')?.innerText) || 0,
                geracaoExpansao: parseFloat(document.getElementById('gen_max_txt')?.innerText) || 0,
                
                // Datas de Controle
                dataValidade: dataValidadeISO,

                // Metadados da Proposta
                escopo: 'AMBAS', // Sempre AMBAS agora
                origemVenda: document.getElementById('origem_venda')?.value || projetoCompleto.projeto.origemVenda,
                
                // Estrutura de Versões (JSON B para futuro D1)
                configuracao: {
                    temStandard: true,
                    temPremium: true,
                    sincronizado: true
                },
                versoes: {
                    standard: versaoStd,
                    premium: versaoPrm
                },
                premissasSnapshot: {
                    consumo: parseFloat(higienizarParaCalculo(inputConsumo.value)),
                    cidade: projetoCompleto.projeto.cidade,
                    uf: projetoCompleto.projeto.uf,
                    hsp: hspBruto, // Salva o HSP usado no cálculo
                    pr: prParaSalvar, // Salva o PR exato da tela (respeitando teto 80% ou menor)
                    tipoRede: document.getElementById('uc_tipo_padrao')?.value || 'monofasico',
                    // NOVO: Persistência completa de premissas técnicas
                    modoOrientacao: modoOrientacao,
                    orientacoes: orientacoesSnapshot,
                    azimute: document.getElementById('azimute_geral')?.value,
                    inclinacao: document.getElementById('inclinacao_geral')?.value,
                    perdas: {
                        eficiencia: document.getElementById('p_efici_inv')?.value,
                        tempInv: document.getElementById('p_temp_inv')?.value,
                        tempMod: document.getElementById('p_temp_mod')?.value,
                        cabos: document.getElementById('p_cabos_total')?.value,
                        extras: document.getElementById('p_extras')?.value,
                        indisp: document.getElementById('p_indisp')?.value
                    },
                    viabilidade: premissasGlobais.viabilidade // Salva configurações financeiras (Simultaneidade, Fio B, etc)
                },
                analiseFinanceira: projetoGerenciador.analiseFinanceira || null, // Salva a análise calculada
                status: 'Gerada'
            };

            // 4. Salva usando o serviço centralizado
            if (modoEdicao && propostaIdEdicao) {
                // MODO EDIÇÃO: Atualiza registro existente
                propostaParaGravar.dataAtualizacao = dataAtual;
                // Mantém a data de criação original (não envia no update ou mescla no service)
                
                await db.atualizar('propostas', propostaIdEdicao, propostaParaGravar);
                esconderLoadingOverlay();
                await customAlert("Proposta atualizada com sucesso!", "Sucesso", "sucesso");
            } else {
                // MODO CRIAÇÃO: Novo registro
                propostaParaGravar.dataCriacao = dataAtual;
                propostaParaGravar.dataAtualizacao = dataAtual;
                await db.salvar('propostas', propostaParaGravar);
                esconderLoadingOverlay();
                await customAlert("Proposta criada com sucesso!", "Sucesso", "sucesso");
            }
            
            window.location.href = `projeto-detalhes.html?id=${projetoCompleto.projeto.id}`;
        });
    }

    // --- VERIFICAÇÃO DE EDIÇÃO DE PROPOSTA (MOVIDO PARA O FINAL PARA GARANTIR FUNÇÕES DEFINIDAS) ---
    const propostaIdEdicao = sessionStorage.getItem('proposta_ativa_id');
    let modoEdicao = false;

    if (propostaIdEdicao) {
        const propostaSalva = db.listar('propostas').find(p => p.id === propostaIdEdicao);
        if (propostaSalva) {
            console.log("Modo Edição: Carregando proposta", propostaIdEdicao);
            modoEdicao = true;

            // 1. Restaura Dados Unificados
            // Assume que a estrutura salva tem versoes.standard e versoes.premium
            // E que os dados técnicos são iguais (ou pega do standard como base)
            if (propostaSalva.versoes.standard) {
                console.log("[DEBUG] Carregando Financeiro Salvo:", propostaSalva.versoes.standard.resumoFinanceiro);
                projetoGerenciador.dadosTecnicos = propostaSalva.versoes.standard.dados;
                projetoGerenciador.financeiro.standard = propostaSalva.versoes.standard.resumoFinanceiro || {};
                projetoGerenciador.financeiro.premium = propostaSalva.versoes.premium?.resumoFinanceiro || {};
                projetoGerenciador.precoCalculado = true;

                // FIX: Libera navegação para todas as etapas se a proposta já foi calculada
                projetoGerenciador.maxEtapaIndex = 4; // Índice do Resumo
            }

            // 2. Restaura Premissas do Snapshot (Sempre que existirem)
            // Isso garante que Azimute, Inclinação e Perdas sejam os gravados, não os globais
            if (propostaSalva.premissasSnapshot) {
                const snap = propostaSalva.premissasSnapshot;
                
                // Restaura Perdas (Inputs) - FAZER ISSO PRIMEIRO
                if (snap.perdas) {
                    if (snap.perdas.eficiencia !== undefined && snap.perdas.eficiencia !== null) document.getElementById('p_efici_inv').value = snap.perdas.eficiencia;
                    if (snap.perdas.tempInv !== undefined && snap.perdas.tempInv !== null) document.getElementById('p_temp_inv').value = snap.perdas.tempInv;
                    if (snap.perdas.tempMod !== undefined && snap.perdas.tempMod !== null) document.getElementById('p_temp_mod').value = snap.perdas.tempMod;
                    if (snap.perdas.cabos !== undefined && snap.perdas.cabos !== null) document.getElementById('p_cabos_total').value = snap.perdas.cabos;
                    if (snap.perdas.extras !== undefined && snap.perdas.extras !== null) document.getElementById('p_extras').value = snap.perdas.extras;
                    if (snap.perdas.indisp !== undefined && snap.perdas.indisp !== null) document.getElementById('p_indisp').value = snap.perdas.indisp;
                }
                
                // A restauração da geometria agora é delegada para carregarEstadoAba -> restaurarPremissasTecnicas
                // Isso permite que cada aba tenha sua geometria se o sync estiver desligado.
                // O premissasSnapshot global serve apenas como fallback inicial.
            }

            // 3. Restaura Data de Validade Específica desta Proposta
            // Converte a data salva de volta para dias restantes (aproximado) ou mantém o padrão se já venceu
            if (propostaSalva.dataValidade) {
                const hoje = new Date();
                const validade = new Date(propostaSalva.dataValidade);
                const diffDias = (validade - hoje) / (1000 * 60 * 60 * 24); // Diferença exata em dias (float)
                const diasRestantes = diffDias > 0 ? diffDias.toFixed(1) : 3; // Se venceu, sugere 3 dias
                document.getElementById('dias_validade_proposta').value = diasRestantes;
            }
        }
    }

    // Oculta o campo de imposto da interface (Controlado via premissas globais)
    const elImpostoVisual = document.getElementById('prem_aliquota_imposto');
    if (elImpostoVisual) {
        const container = elImpostoVisual.closest('.grupo-form') || elImpostoVisual.parentElement;
        if (container) container.style.display = 'none';
    }

    // --- Execução Inicial ---
    inicializarBaseDeDados();
    
    if (!modoEdicao) {
        // FLUXO NOVO: Inicia do zero
        projetoGerenciador.etapaIndex = 0;
        gerenciadorEtapas.sincronizarVisual();
        window.alternarModoOrientacao('simples');
        
        // Inicia automação quase imediatamente
        setTimeout(() => {
            window.autoDimensionarCompleto();
        }, 100);
    } else {
        // FLUXO EDIÇÃO: Carrega estado salvo
        
        // 2. Carrega os dados (agora seguro, pois recalcularDimensionamento tem a trava)
        carregarEstadoGeral();

        // 3. Sincroniza visual (abas, etapas) - Sem recalcular engenharia pesada
        gerenciadorEtapas.sincronizarVisual();
        
        // 4. Atualiza APENAS totais financeiros (Matemática simples é permitida para exibir totais, 
        // mas engenharia pesada foi bloqueada)
        if (carrinhoInversores.length > 0) {
            window.calcularEngenhariaFinanceira();
        }
        renderizarResumoSuperiorFinanceiro();
    }
});

// ======================================================================
// 🎨 HELPER DE ESTILOS (Injeção de CSS Crítico - Fallback)
// ======================================================================
function injetarEstilosDinamicos() {
    const styleId = 'estilos-gerador-dinamicos';
    // Função esvaziada para usar apenas o CSS externo (engenharia.css)
    // Mantida vazia para evitar erros de referência se chamada em outros lugares
    if (document.getElementById(styleId)) return;
}

// --- NAVEGAÇÃO INTELIGENTE (BOTÃO CANCELAR) ---
window.voltar = async function() {
    const origem = sessionStorage.getItem('origem_voltar') || 'dashboard';
    const urlOrigem = sessionStorage.getItem('url_origem_gerador');
    const clienteId = sessionStorage.getItem('cliente_ativo_id') || sessionStorage.getItem('cliente_id_visualizacao');
    const projetoId = sessionStorage.getItem('projeto_ativo_id') || sessionStorage.getItem('projeto_id_edicao');
    
    // CAPTURA O ID DA PROPOSTA ANTES DE LIMPAR (Para saber se era edição)
    const propostaIdEdicao = sessionStorage.getItem('proposta_ativa_id');

    // Limpa flags de edição
    sessionStorage.removeItem('projeto_id_edicao');
    sessionStorage.removeItem('proposta_ativa_id'); // Limpa flag de edição de proposta
    sessionStorage.removeItem('modo_visualizacao'); // Limpa flag de visualização ao sair
    sessionStorage.removeItem('origem_voltar');
    sessionStorage.removeItem('url_origem_gerador');

    if (propostaIdEdicao) {
        // Se estava editando, volta para visualização da proposta
        window.location.href = `visualizar-proposta.html?id=${propostaIdEdicao}`;
        return;
    }

    if (urlOrigem) {
        window.location.href = urlOrigem;
    } else if (origem === 'cliente' && clienteId) {
        // Volta para a ficha do cliente
        sessionStorage.setItem('cliente_id_visualizacao', clienteId);
        window.location.href = 'cadastro-cliente.html';
    } else if (projetoId) {
        // Fallback: Volta para detalhes do projeto se tiver ID
        window.location.href = `projeto-detalhes.html?id=${projetoId}`;
    } else {
        // Padrão: Volta para o Dashboard
        window.location.href = 'dashboard-admin.html';
    }
};