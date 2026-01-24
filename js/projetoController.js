import db from './databaseService.js';
import { baseDadosAlagoas, obterHSPBruto, buscarCoordenadas, carregarDadosSolar, encontrarHSPMaisProximo, calcularAnaliseFinanceira, obterPercentualFioB } from './model.js';
import { mostrarLoadingOverlay, esconderLoadingOverlay, customAlert, customConfirm, higienizarParaCalculo } from './utils.js';

// TRAVA DE SEGURANÇA: Verifica se o usuário está logado
if (!sessionStorage.getItem('auth_belenergy')) {
    window.location.href = 'central-belenergy.html';
}

document.addEventListener('DOMContentLoaded', async () => {
    // Sincronização Inicial com D1
    mostrarLoadingOverlay();
    await db.sincronizarTudo();
    esconderLoadingOverlay();

    // Busca o ID do cliente ativo que foi salvo na sessão pela tela de listagem
    const projetoIdEdicao = sessionStorage.getItem('projeto_id_edicao');
    
    // Se estiver editando, o clienteId vem do projeto existente
    // Se for novo, vem da sessão 'cliente_ativo_id'
    const clienteIdAtivo = sessionStorage.getItem('cliente_ativo_id');
    if (!clienteIdAtivo) {
        await customAlert("Nenhum cliente selecionado. Por favor, volte à lista de clientes.", "Erro");
        window.location.href = 'clientes-lista.html';
        return;
    }

    // Busca os dados completos do cliente usando o ID
    const todosClientes = db.listar('clientes');
    const cliente = todosClientes.find(c => c.id === clienteIdAtivo);

    if (cliente) {
        prepararNovoProjeto(cliente);
        
        // Se for edição, carrega os dados
        if (projetoIdEdicao) {
            const projeto = db.buscarPorId('projetos', projetoIdEdicao);
            if (projeto) {
                document.getElementById('nome_projeto').value = projeto.nome_projeto;
                document.getElementById('projeto_consumo').value = projeto.consumo;
                document.getElementById('projeto_concessionaria').value = projeto.concessionaria;
                document.getElementById('tipo_telhado').value = projeto.tipoTelhado;
                document.getElementById('projeto_tipo_ligacao').value = projeto.tipoLigacao;
                document.getElementById('tarifa_grupo_b').value = projeto.tarifaGrupoB || '';
                document.getElementById('iluminacao_publica').value = projeto.iluminacaoPublica || '';
                if (document.getElementById('projeto_origem_venda')) {
                    document.getElementById('projeto_origem_venda').value = projeto.origemVenda;
                }
            }
        }
    } else {
        await customAlert("Erro: Cliente não encontrado no banco de dados local.", "Erro");
        window.location.href = 'clientes-lista.html';
    }

    // Alterado para async para suportar o fluxo de modal
    document.getElementById('btn-salvar-projeto').addEventListener('click', async (e) => {
        if (e) e.preventDefault(); // IMPEDE O RECARREGAMENTO DA PÁGINA

        const nomeProjeto = document.getElementById('nome_projeto').value;
        const consumo = document.getElementById('projeto_consumo').value;

        // --- VALIDAÇÃO DE CAMPOS OBRIGATÓRIOS ---
        if (!nomeProjeto || nomeProjeto.trim() === "") {
            await customAlert("Por favor, informe um Título para o Projeto.");
            document.getElementById('nome_projeto').focus();
            return;
        }

        if (!consumo || parseFloat(consumo) <= 0) {
            await customAlert("Por favor, informe um Consumo Médio válido (maior que zero).");
            document.getElementById('projeto_consumo').focus();
            return;
        }

        const dadosProjeto = {
            clienteId: clienteIdAtivo, // VÍNCULO RELACIONAL
            nome_projeto: nomeProjeto,
            cidade: cliente.endereco.cidade, // Usa dado direto do objeto cliente (Segurança)
            uf: cliente.endereco.uf,         // Usa dado direto do objeto cliente
            concessionaria: document.getElementById('projeto_concessionaria').value,
            tipoTelhado: document.getElementById('tipo_telhado').value,
            // NOVOS CAMPOS: Dados da UC centralizados no projeto
            consumo: consumo,
            tipoLigacao: document.getElementById('projeto_tipo_ligacao').value || 'monofasico',
            origemVenda: document.getElementById('projeto_origem_venda')?.value || 'nenhum',
            hsp: parseFloat(higienizarParaCalculo(document.getElementById('display_hsp').innerText)) || 0,
            tarifaGrupoB: parseFloat(higienizarParaCalculo(document.getElementById('tarifa_grupo_b').value)) || 0,
            iluminacaoPublica: parseFloat(higienizarParaCalculo(document.getElementById('iluminacao_publica').value)) || 0,
        };

        // --- VERIFICAÇÃO DE CONSISTÊNCIA (SNAPSHOT) ---
        if (projetoIdEdicao) {
            const projetoOriginal = db.buscarPorId('projetos', projetoIdEdicao);
            
            // Verifica se o projeto já foi VENDIDO (Bloqueio de Segurança)
            if (projetoOriginal.status === 'VENDIDO') {
                // Verifica se houve mudança em dados críticos que afetariam o contrato
                if (houveMudancaCritica(projetoOriginal, dadosProjeto)) {
                    await customAlert("Este projeto já possui uma Venda Confirmada.<br>Não é permitido alterar Consumo, Tarifas ou Localização pois isso invalida o contrato gerado.<br><br>Para alterações, crie um novo projeto.", "Bloqueio de Segurança", "erro");
                    return;
                }
            }

            // Verifica impacto em propostas ABERTAS
            const propostas = db.buscarPorRelacao('propostas', 'projetoId', projetoIdEdicao);
            const propostasAbertas = propostas.filter(p => p.status !== 'VENDIDA' && p.status !== 'PERDIDA');

            if (propostasAbertas.length > 0 && houveMudancaCritica(projetoOriginal, dadosProjeto)) {
                // Dispara o fluxo de decisão (Modal)
                await mostrarModalConflitoProjeto(propostasAbertas, projetoIdEdicao, dadosProjeto);
                return; // Interrompe o fluxo normal, o modal cuidará do resto
            }

            // Se não houver conflitos, salva direto
            await salvarEFinalizar(projetoIdEdicao, dadosProjeto, false);
        } else {
            // Novo Projeto (Sem conflitos)
            await salvarEFinalizar(null, dadosProjeto, false);
        }
    });

    // --- LIVE PREVIEW DE FATURA ---
    const inputsTarifa = ['projeto_consumo', 'tarifa_grupo_b', 'iluminacao_publica', 'projeto_tipo_ligacao'];
    inputsTarifa.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', atualizarPreviewFatura);
            el.addEventListener('change', atualizarPreviewFatura);
        }
    });

    // --- PADRONIZAÇÃO DE BOTÕES (HEADER) ---
    // Remove botões inferiores e injeta no header
    const containerBotoes = document.querySelector('.botoes-fluxo');
    if (containerBotoes) {
        containerBotoes.style.display = 'none';
    }

    const headerModulo = document.querySelector('.header-modulo');
    if (headerModulo) {
        // Limpa e recria ações do header
        const titulo = headerModulo.querySelector('div h2').parentElement.innerHTML;
        headerModulo.innerHTML = `
            <div>${titulo}</div>
            <div class="header-actions" style="display: flex; gap: 10px; align-items: center;">
                <button class="btn-secundario" onclick="window.voltar()"><i class="fas fa-times"></i> Cancelar</button>
                <button class="btn-primary" onclick="document.getElementById('btn-salvar-projeto').click()"><i class="fas fa-save"></i> Salvar Projeto</button>
            </div>
        `;
    }
});

// --- FUNÇÕES DE CONTROLE DE VERSÃO E CONSISTÊNCIA ---

function houveMudancaCritica(original, novo) {
    // Compara campos que afetam o dimensionamento ou financeiro
    return (
        original.consumo != novo.consumo ||
        original.tarifaGrupoB != novo.tarifaGrupoB ||
        original.hsp != novo.hsp ||
        original.tipoLigacao != novo.tipoLigacao ||
        original.iluminacaoPublica != novo.iluminacaoPublica
    );
}

async function salvarEFinalizar(id, dados, atualizarPropostas) {
    mostrarLoadingOverlay();
    let projetoSalvo;
    
    try {
        if (id) {
            projetoSalvo = await db.atualizar('projetos', id, dados);
            
            if (atualizarPropostas) {
                // Sincroniza as propostas abertas com os novos dados do projeto
                const propostas = db.buscarPorRelacao('propostas', 'projetoId', id);
                for (const prop of propostas) {
                    if (prop.status !== 'VENDIDA' && prop.status !== 'PERDIDA') {
                        // Atualiza o Snapshot da proposta para refletir o novo cenário
                        const novoSnapshot = {
                            ...prop.premissasSnapshot,
                            consumo: parseFloat(dados.consumo),
                            hsp: parseFloat(dados.hsp),
                            tarifaGrupoB: parseFloat(dados.tarifaGrupoB),
                            tipoRede: dados.tipoLigacao,
                            viabilidade: {
                                ...(prop.premissasSnapshot?.viabilidade || {}),
                                tarifaGrupoB: parseFloat(dados.tarifaGrupoB),
                                iluminacaoPublica: parseFloat(dados.iluminacaoPublica)
                            }
                        };
                        
                        await db.atualizar('propostas', prop.id, { 
                            premissasSnapshot: novoSnapshot,
                            dataAtualizacao: new Date().toISOString()
                        });
                    }
                }
            }
            
            sessionStorage.removeItem('projeto_id_edicao');
            esconderLoadingOverlay();
            await customAlert(`Projeto atualizado com sucesso! ${atualizarPropostas ? '<br>As propostas em aberto foram sincronizadas.' : '<br>As propostas existentes mantiveram os dados originais.'}`, "Sucesso", "sucesso");
        } else {
            projetoSalvo = await db.salvar('projetos', dados);
            esconderLoadingOverlay();
            await customAlert(`Projeto criado com sucesso!`, "Sucesso", "sucesso");
        }

        sessionStorage.setItem('projeto_ativo_id', projetoSalvo.id);
        window.location.href = `projeto-detalhes.html?id=${projetoSalvo.id}`;

    } catch (error) {
        esconderLoadingOverlay();
        console.error("Falha ao salvar projeto:", error);
        await customAlert(`Erro ao salvar o projeto. O servidor retornou um erro.<br><br><small>${error.message}</small>`, "Erro de Gravação", "erro");
    }
}

async function mostrarModalConflitoProjeto(propostasAfetadas, idProjeto, dadosNovos) {
    const modalId = 'modal_conflito_projeto';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.6); display: flex; justify-content: center;
        align-items: center; z-index: 10000;
    `;

    modal.innerHTML = `
        <div class="modal-content" style="background: white; padding: 25px; border-radius: 12px; width: 90%; max-width: 550px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);">
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="background: #fff7ed; width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 30px; color: #d97706;"></i>
                </div>
                <h3 style="color: #1e293b; margin: 0;">Alteração de Dados Mestre</h3>
                <p style="color: #64748b; margin-top: 10px;">
                    Você alterou dados críticos do projeto (Consumo, Tarifa ou Local).<br>
                    Existem <strong>${propostasAfetadas.length} propostas em aberto</strong> baseadas nos dados antigos.
                </p>
            </div>

            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 25px; font-size: 0.9rem; color: #475569;">
                <strong>O que você deseja fazer?</strong>
                <ul style="margin: 10px 0 0 20px; padding: 0;">
                    <li style="margin-bottom: 8px;">Atualizar as propostas para usar os novos dados (pode alterar valores).</li>
                    <li>Manter as propostas como estão (cria histórico de versão).</li>
                </ul>
            </div>

            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="btn_manter_originais" class="btn-secundario" style="flex: 1;">
                    Manter Originais
                </button>
                <button id="btn_atualizar_propostas" class="btn-primary" style="flex: 1;">
                    Atualizar Propostas
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn_manter_originais').onclick = async () => {
        modal.remove();
        await salvarEFinalizar(idProjeto, dadosNovos, false); // False = Não atualiza propostas
    };

    document.getElementById('btn_atualizar_propostas').onclick = async () => {
        modal.remove();
        await salvarEFinalizar(idProjeto, dadosNovos, true); // True = Atualiza snapshots
    };
}

function atualizarPreviewFatura() {
    const consumo = parseFloat(document.getElementById('projeto_consumo').value) || 0;
    const tarifaB = parseFloat(document.getElementById('tarifa_grupo_b').value) || 0;
    const cipPerc = parseFloat(document.getElementById('iluminacao_publica').value) || 0;

    if (consumo > 0 && tarifaB > 0) {
        // Busca premissas globais para cálculo preciso (Simultaneidade e Fio B)
        const config = db.buscarConfiguracao('premissas_globais') || {};
        const viabilidade = config.viabilidade || {};
        const tarifas = viabilidade.tarifas || {};
        
        const simultaneidade = (viabilidade.simultaneidade || 30) / 100;
        
        let T_CHEIA, T_FIO_B;

        if (tarifas.tusd_base_mwh) {
            // Lógica Nova 2026
            const aliquota = tarifas.aliquota_impostos || 0;
            const divisor = (1 - aliquota) > 0 ? (1 - aliquota) : 1;
            
            T_CHEIA = ((tarifas.tusd_base_mwh + tarifas.te_base_mwh) / 1000) / divisor;
            T_FIO_B = (tarifas.fio_b_vigente_mwh / 1000) / divisor;
        } else {
            // Fallback
            T_CHEIA = tarifaB;
            const anoAtual = new Date().getFullYear();
            const percFioB = obterPercentualFioB(anoAtual);
            T_FIO_B = (viabilidade.fioB_valor || 0.30) * percFioB;
        }

        const cipValor = (consumo * T_CHEIA) * (cipPerc / 100);
        const faturaAtual = (consumo * T_CHEIA) + cipValor;

        // Simulação Precisa (Considerando Simultaneidade e Lei 14.300)
        // Assumindo Geração = Consumo (100% de cobertura para estimativa)
        const autoconsumo = consumo * simultaneidade;
        const injecao = consumo - autoconsumo;
        
        // Custo Fio B sobre a injeção compensada
        const custoFioB = injecao * T_FIO_B;

        const tipoLigacao = document.getElementById('projeto_tipo_ligacao')?.value || 'bifasico';
        
        let kwhMinimo = 50;
        if (tipoLigacao === 'monofasico') kwhMinimo = 30;
        else if (tipoLigacao === 'trifasico') kwhMinimo = 100;

        const custoDisponibilidade = kwhMinimo * T_CHEIA; 
        
        // Paga o maior entre (Fio B) e (Disponibilidade) + CIP
        // Nota: Na lógica nova, o imposto já está no gross-up das tarifas
        const custoEnergiaFinal = Math.max(custoFioB, custoDisponibilidade);
        const faturaEstimadaSolar = custoEnergiaFinal + cipValor;

        const economia = faturaAtual - faturaEstimadaSolar;

        // Injeta ou atualiza o card de preview
        let preview = document.getElementById('preview_fatura_live');
        if (!preview) {
            preview = document.createElement('div');
            preview.id = 'preview_fatura_live';
            preview.className = 'card-tecnico'; // Usa estilo de card padrão para alinhamento
            preview.style.marginTop = '20px';
            preview.style.padding = '15px';
            preview.style.background = '#fff';
            preview.style.border = '1px solid #e2e8f0';
            
            const container = document.querySelector('.grid-form');
            container.appendChild(preview);
        }

        const fmt = (v) => v.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

        preview.innerHTML = `
            <h4 style="color: var(--primaria); font-size: 0.9rem; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">
                <i class="fas fa-calculator"></i> Estimativa Inicial de Economia (Ano 0)
            </h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; text-align: center;">
                <div style="background: #fff1f2; padding: 10px; border-radius: 6px; border: 1px solid #fecdd3;">
                    <span style="display:block; font-size:0.75rem; color:#9f1239; text-transform:uppercase;">Fatura Atual</span>
                    <strong style="font-size: 1.1rem; color: #be123c;">${fmt(faturaAtual)}</strong>
                </div>
                <div style="background: #f0fdf4; padding: 10px; border-radius: 6px; border: 1px solid #bbf7d0;">
                    <span style="display:block; font-size:0.75rem; color:#166534; text-transform:uppercase;">Nova Fatura (Est.)</span>
                    <strong style="font-size: 1.1rem; color: #15803d;">~${fmt(faturaEstimadaSolar)}</strong>
                </div>
                <div style="background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <span style="display:block; font-size:0.75rem; color:#334155; text-transform:uppercase;">Economia Mensal</span>
                    <strong style="font-size: 1.1rem; color: #0f172a;">~${fmt(economia)}</strong>
                </div>
            </div>
            
        `;
    }
}

function prepararNovoProjeto(cliente) {
    // Preenche os textos informativos (Labels)
    const elCidade = document.getElementById('projeto_cidade_display');
    const elUF = document.getElementById('projeto_uf_display');
    if(elCidade) elCidade.value = cliente.endereco.cidade;
    if(elUF) elUF.value = cliente.endereco.uf;
    
    // --- CARGA DE PREMISSAS GLOBAIS (TARIFAS PADRÃO) ---
    const config = db.buscarConfiguracao('premissas_globais') || {};
    const viabilidade = config.viabilidade || {};
    const tarifas = viabilidade.tarifas || {};

    let valorTarifa = viabilidade.tarifaGrupoB || '';

    // CÁLCULO AUTOMÁTICO DA TARIFA CHEIA (TUSD + TE + IMPOSTOS)
    if (tarifas.tusd_base_mwh || tarifas.te_base_mwh) {
        const tusd = tarifas.tusd_base_mwh || 0;
        const te = tarifas.te_base_mwh || 0;
        const aliquota = tarifas.aliquota_impostos || 0; // Decimal (ex: 0.25)
        
        const divisor = (1 - aliquota) > 0 ? (1 - aliquota) : 1;
        const tarifaCalculada = ((tusd + te) / 1000) / divisor;
        
        if (tarifaCalculada > 0) valorTarifa = tarifaCalculada.toFixed(4);
    }

    if (document.getElementById('tarifa_grupo_b')) document.getElementById('tarifa_grupo_b').value = valorTarifa;
    if (document.getElementById('iluminacao_publica')) document.getElementById('iluminacao_publica').value = viabilidade.iluminacaoPublica || 5.0;

    // --- CÁLCULO INTELIGENTE DE HSP (CRESESB / CSV) ---
    const displayHsp = document.getElementById('display_hsp');
    if (displayHsp) displayHsp.innerText = "Buscando...";

    const cidadeNormalizada = cliente.endereco.cidade.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // 1. Tenta obter coordenadas reais da cidade (Geocodificação)
    buscarCoordenadas(cliente.endereco.cidade, cliente.endereco.uf).then(async (coords) => {
        if (coords) {
            // 2. Se achou coordenadas, carrega o CSV e busca o vizinho mais próximo
            console.log(`Coordenadas encontradas para ${cliente.endereco.cidade}:`, coords);
            const dadosCSV = await carregarDadosSolar();
            
            if (dadosCSV.length > 0) {
                const hspPreciso = encontrarHSPMaisProximo(coords.lat, coords.lon, dadosCSV);
                if (displayHsp) displayHsp.innerText = hspPreciso.toFixed(3); // Exibe com 3 casas decimais (ex: 5.537)
                console.log(`HSP CRESESB encontrado: ${hspPreciso}`);
                return;
            }
        }

        // 3. Fallback: Se falhar a geocodificação ou o CSV, usa a base manual antiga
        console.warn("Usando base manual de fallback para HSP.");
        const dadosCidade = baseDadosAlagoas[cidadeNormalizada];
        const fatorHistorico = dadosCidade ? dadosCidade.fator : 126;
        const hspManual = obterHSPBruto(fatorHistorico);
        if (displayHsp) displayHsp.innerText = hspManual.toFixed(2);
    });
    
    // Injeta o campo de Origem da Venda se ele não existir no HTML
    injetarCampoOrigemVenda();
    
    document.getElementById('nome_projeto').focus();
}

function injetarCampoOrigemVenda() {
    const consumoInput = document.getElementById('projeto_consumo');
    // Só injeta se o campo ainda não existir
    if (consumoInput && !document.getElementById('projeto_origem_venda')) {
        const container = consumoInput.closest('.form-group') || consumoInput.parentElement;
        if (container && container.parentElement) {
            const novoGrupo = document.createElement('div');
            novoGrupo.className = 'form-group col-6'; // Adiciona classe de coluna para alinhar no grid
            novoGrupo.innerHTML = `
                <label for="projeto_origem_venda">Origem da Venda / Comissão</label>
                <select id="projeto_origem_venda" class="input-estilizado">
                    <option value="nenhum">Venda Direta (Sem Comissão)</option>
                    <option value="indicador">Indicação (Parceiro)</option>
                    <option value="representante">Representante Comercial</option>
                </select>
            `;
            // Insere logo após o campo de consumo
            container.parentElement.insertBefore(novoGrupo, container.nextSibling);
        }
    }
}

// --- NAVEGAÇÃO INTELIGENTE (BOTÃO CANCELAR/VOLTAR) ---
window.voltar = function() {
    const origem = sessionStorage.getItem('origem_voltar') || 'dashboard';
    const clienteId = sessionStorage.getItem('cliente_ativo_id') || sessionStorage.getItem('cliente_id_visualizacao');
    const projetoId = sessionStorage.getItem('projeto_id_edicao'); // Captura ID antes de limpar
    
    // Limpa flags de edição
    sessionStorage.removeItem('projeto_id_edicao');
    sessionStorage.removeItem('origem_voltar');

    if (origem === 'projeto_detalhes' && projetoId) {
        // Volta para a visualização do projeto
        window.location.href = `projeto-detalhes.html?id=${projetoId}`;
    } else if (origem === 'cliente' && clienteId) {
        // Volta para a ficha do cliente
        sessionStorage.setItem('cliente_id_visualizacao', clienteId);
        sessionStorage.removeItem('cliente_id_edicao');
        window.location.href = 'cadastro-cliente.html';
    } else {
        // Padrão: Volta para o Dashboard
        window.location.href = 'dashboard-admin.html';
    }
};