import { buscarEnderecoPorCEP, obterCidadesPorUF } from './model.js';
import db from './databaseService.js';
import { mostrarLoadingOverlay, esconderLoadingOverlay, customAlert, customConfirm } from './utils.js';

// Trava de Segurança
if (!sessionStorage.getItem('auth_belenergy')) {
    window.location.href = 'central-belenergy.html';
}

const form = document.getElementById('form-cliente');
const cepInput = document.getElementById('cep_cliente');
const ufSelect = document.getElementById('uf_cliente');
const cidadeSelect = document.getElementById('cidade_cliente');
const logradouroInput = document.getElementById('logradouro_cliente');
const numeroInput = document.getElementById('numero_cliente');
const bairroInput = document.getElementById('bairro_cliente');
const complementoInput = document.getElementById('complemento_cliente');
const emailInput = document.getElementById('email_cliente');
const documentoInput = document.getElementById('documento_cliente');
const whatsappInput = document.getElementById('whatsapp_cliente');

// --- VERIFICAÇÃO DE EDIÇÃO ---
const clienteIdEdicao = sessionStorage.getItem('cliente_id_edicao');
const clienteIdVisualizacao = sessionStorage.getItem('cliente_id_visualizacao');

document.addEventListener('DOMContentLoaded', async () => {
    // Sincronização Inicial com D1 (Garante que os dados existam)
    mostrarLoadingOverlay();
    await db.sincronizarTudo();
    esconderLoadingOverlay();

    const idParaCarregar = clienteIdEdicao || clienteIdVisualizacao;
    if (idParaCarregar) {
        const cliente = db.buscarPorId('clientes', idParaCarregar);
        if (cliente) {
            document.getElementById('nome_cliente').value = cliente.nome;
            documentoInput.value = cliente.documento;
            whatsappInput.value = cliente.whatsapp;
            emailInput.value = cliente.email;
            
            cepInput.value = cliente.endereco.cep;
            logradouroInput.value = cliente.endereco.logradouro;
            numeroInput.value = cliente.endereco.numero;
            bairroInput.value = cliente.endereco.bairro;
            complementoInput.value = cliente.endereco.complemento;
            
            // Popula UFs e Cidades
            ufSelect.value = cliente.endereco.uf;
            await carregarCidades(cliente.endereco.uf, cliente.endereco.cidade);
            
            // Carrega a lista de projetos associados
            carregarProjetosDoCliente(cliente.id);

            if (clienteIdVisualizacao) {
                // MODO VISUALIZAÇÃO
                
                // Desabilita campos de forma discreta
                const inputs = document.querySelectorAll('input, select');
                inputs.forEach(input => {
                    input.disabled = true;
                    input.style.backgroundColor = '#f8fafc'; // Fundo muito leve
                    input.style.color = '#475569'; // Texto legível
                    input.style.border = '1px solid #e2e8f0'; // Borda suave
                    input.style.cursor = 'default';
                    input.style.opacity = '1'; // Remove opacidade padrão do browser
                });

                // --- PADRONIZAÇÃO DE BOTÕES NO HEADER ---
                const headerModulo = document.querySelector('.header-modulo');
                if (headerModulo) {
                    // Limpa botões antigos do header (como o Voltar padrão) para reconstruir
                    headerModulo.innerHTML = `
                        <div><h2><i class="fas fa-user"></i> Dados do Cliente</h2></div>
                        <div class="header-actions" style="display: flex; gap: 10px; align-items: center;">
                            <button class="btn-secundario" onclick="window.voltarCliente()">
                                <i class="fas fa-arrow-left"></i> Voltar para Lista
                            </button>
                            <button class="btn-perigo" onclick="window.excluirClienteAtual('${cliente.id}')">
                                <i class="fas fa-trash"></i> Excluir
                            </button>
                            <button class="btn-primary" onclick="window.habilitarEdicao('${cliente.id}')">
                                <i class="fas fa-pencil-alt"></i> Editar Cliente
                            </button>
                        </div>
                    `;
                }

                // Remove a barra de botões inferior no modo visualização
                const containerBotoes = document.querySelector('.botoes-fluxo');
                if (containerBotoes) containerBotoes.style.display = 'none';

            } else {
                // MODO EDIÇÃO
                
                // Atualiza botões para modo edição (Cancelar Edição na esquerda, Salvar na direita)
                const containerBotoes = document.querySelector('.botoes-fluxo');
                if (containerBotoes) containerBotoes.style.display = 'none'; // Remove botões inferiores
                
                // Atualiza Header para modo edição
                const headerModulo = document.querySelector('.header-modulo');
                if (headerModulo) {
                    headerModulo.innerHTML = `
                        <div><h2><i class="fas fa-user-edit"></i> Editando Cliente</h2></div>
                        <div class="header-actions" style="display: flex; gap: 10px; align-items: center;">
                            <button type="button" class="btn-secundario" onclick="window.cancelarEdicao('${cliente.id}')">
                                <i class="fas fa-times"></i> Cancelar
                            </button>
                            <button type="button" class="btn-primary" onclick="document.getElementById('form-cliente').dispatchEvent(new Event('submit'))">
                                <i class="fas fa-save"></i> Salvar Alterações
                            </button>
                        </div>
                    `;
                }
            }
        }
    }
});

// --- FUNÇÕES DE LISTAGEM DE PROJETOS ---
function carregarProjetosDoCliente(clienteId) {
    const secao = document.getElementById('secao-projetos-cliente');
    const tbody = document.getElementById('corpo_lista_projetos_cliente');
    
    if (!secao || !tbody) return;

    // Mostra a seção apenas se estiver editando ou visualizando
    secao.style.display = 'block';

    const projetos = db.buscarPorRelacao('projetos', 'clienteId', clienteId)
                       .sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));

    if (projetos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 1.5rem; color: #64748b;">Nenhum projeto cadastrado para este cliente.</td></tr>`;
        return;
    }

    tbody.innerHTML = projetos.map(proj => {
        // Conta propostas para definir status simples
        const propostas = db.buscarPorRelacao('propostas', 'projetoId', proj.id);
        const statusBadge = propostas.length > 0 
            ? `<span class="badge" style="background:#dcfce7; color:#166534;">${propostas.length} Proposta(s)</span>` 
            : `<span class="badge" style="background:#f1f5f9; color:#475569;">Novo</span>`;

        return `
            <tr>
                <td>${new Date(proj.dataCriacao).toLocaleDateString()}</td>
                <td><strong>${proj.nome_projeto}</strong></td>
                <td>${proj.cidade}/${proj.uf}</td>
                <td>${statusBadge}</td>
                <td style="text-align: right;">
                    <button class="btn-icon" onclick="window.visualizarProjetoDoCliente('${proj.id}')" title="Visualizar Detalhes"><i class="fas fa-eye"></i></button>
                    <button class="btn-icon" onclick="window.editarProjetoDoCliente('${proj.id}')" title="Editar Projeto"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn-icon" onclick="window.excluirProjetoDoCliente('${proj.id}')" title="Excluir Projeto"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

// --- FUNÇÕES GLOBAIS PARA AÇÕES DO CLIENTE ---
window.habilitarEdicao = function(id) {
    sessionStorage.removeItem('cliente_id_visualizacao');
    sessionStorage.setItem('cliente_id_edicao', id);
    window.location.reload(); // Recarrega a página no modo edição
};

window.cancelarEdicao = function(id) {
    sessionStorage.removeItem('cliente_id_edicao');
    sessionStorage.setItem('cliente_id_visualizacao', id);
    window.location.reload(); // Recarrega a página no modo visualização
};

window.excluirClienteAtual = async function(id) {
    const cliente = db.buscarPorId('clientes', id);
    if (cliente && cliente.status === 'CLIENTE') {
        // Verifica se realmente tem projetos vendidos (dupla checagem)
        const projetos = db.buscarPorRelacao('projetos', 'clienteId', id);
        if (projetos.some(p => p.status === 'VENDIDO')) {
            await customAlert("Este cliente possui projetos com Vendas Confirmadas (Contratos Ativos).<br>Para excluir o cadastro, você deve primeiro cancelar as vendas nos respectivos projetos.", "Ação Bloqueada", "erro");
            return;
        }
    }

    if (await customConfirm('ATENÇÃO: Tem certeza que deseja excluir este cliente?<br><br>Todos os PROJETOS e PROPOSTAS vinculados a ele também serão removidos permanentemente.', "Excluir Cliente", "perigo")) {
        // Exclusão em cascata
        const projetos = db.buscarPorRelacao('projetos', 'clienteId', id);
        projetos.forEach(proj => {
             const propostas = db.buscarPorRelacao('propostas', 'projetoId', proj.id);
             propostas.forEach(prop => db.excluir('propostas', prop.id)); // Async mas sem await no loop para rapidez, ou Promise.all
             db.excluir('projetos', proj.id);
        });
        
        await db.excluir('clientes', id);
        await customAlert('Cliente e dados vinculados excluídos com sucesso.', "Sucesso", "sucesso");
        window.location.href = 'dashboard-admin.html';
    }
};

// --- NAVEGAÇÃO INTELIGENTE ---
window.voltarCliente = function() {
    sessionStorage.removeItem('cliente_id_edicao');
    sessionStorage.removeItem('cliente_id_visualizacao');
    window.location.href = 'dashboard-admin.html';
}

// --- AÇÕES DE PROJETO (CRUD) ---
window.novoProjetoParaCliente = function() {
    const id = sessionStorage.getItem('cliente_id_edicao') || sessionStorage.getItem('cliente_id_visualizacao');
    if(id) {
        sessionStorage.setItem('cliente_ativo_id', id);
        window.location.href = 'cadastro-projeto.html';
    }
};

window.visualizarProjetoDoCliente = function(id) {
    // Define a origem para que o botão "Voltar" do projeto saiba retornar para cá
    sessionStorage.setItem('origem_voltar', 'cliente');
    window.location.href = `projeto-detalhes.html?id=${id}`;
};

window.editarProjetoDoCliente = function(id) {
    const projeto = db.buscarPorId('projetos', id);
    if (!projeto) return;
    sessionStorage.setItem('cliente_ativo_id', projeto.clienteId);
    sessionStorage.setItem('projeto_id_edicao', id);
    // Define a origem para que o botão "Cancelar" da edição saiba retornar para cá
    sessionStorage.setItem('origem_voltar', 'cliente');
    window.location.href = 'cadastro-projeto.html';
};

window.excluirProjetoDoCliente = async function(id) {
    const projeto = db.buscarPorId('projetos', id);
    if (!projeto) return;

    if (projeto.status === 'VENDIDO') {
        await customAlert(`O projeto "${projeto.nome_projeto}" possui uma venda confirmada.<br>Cancele a venda na aba de propostas antes de excluir.`, "Ação Bloqueada", "erro");
        return;
    }
    
    if (await customConfirm(`Tem certeza que deseja excluir o projeto "${projeto.nome_projeto}"?<br>TODAS as propostas associadas a ele também serão removidas.`)) {
        try {
            const propostas = db.buscarPorRelacao('propostas', 'projetoId', id);
            propostas.forEach(prop => db.excluir('propostas', prop.id)); // Async fire-and-forget
            
            await db.excluir('projetos', id);
            
            // Recarrega a lista
            carregarProjetosDoCliente(projeto.clienteId);
            await customAlert('Projeto excluído.', "Sucesso", "sucesso");
        } catch (error) {
            await customAlert(`Erro ao excluir o projeto: ${error.message}`, "Erro", "erro");
        }
    }
};

// --- LÓGICA DE MÁSCARAS ---

function aplicarMascara(event) {
    const input = event.target;
    const mascara = input.dataset.mascara;
    if (!mascara) return;

    let valor = input.value.replace(/\D/g, '');
    let valorFormatado = '';

    switch (mascara) {
        case 'cpf-cnpj':
            if (valor.length <= 11) { // CPF
                valorFormatado = valor
                    .replace(/(\d{3})(\d)/, '$1.$2')
                    .replace(/(\d{3})(\d)/, '$1.$2')
                    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
            } else { // CNPJ
                valorFormatado = valor.slice(0, 14)
                    .replace(/(\d{2})(\d)/, '$1.$2')
                    .replace(/(\d{3})(\d)/, '$1.$2')
                    .replace(/(\d{3})(\d)/, '$1/$2')
                    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
            }
            break;
        case 'cep':
            valorFormatado = valor.slice(0, 8).replace(/(\d{5})(\d{1,3})/, '$1-$2');
            break;
        case 'celular':
            valor = valor.slice(0, 11);
            valorFormatado = valor.length > 10 
                ? valor.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') 
                : valor.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
            break;
    }
    input.value = valorFormatado;
}

// Lógica de CEP
cepInput.addEventListener('blur', async () => {
    const cep = cepInput.value.replace(/\D/g, '');
    if (cep.length === 8) {
        // Feedback visual de carregamento
        document.body.style.cursor = 'wait';
        cepInput.style.opacity = '0.6';

        try {
            const dados = await buscarEnderecoPorCEP(cep);
            if (dados && !dados.erro) {
                logradouroInput.value = dados.logradouro || '';
                bairroInput.value = dados.bairro || '';
                if (dados.complemento) complementoInput.value = dados.complemento;
                
                ufSelect.value = dados.uf;
                await carregarCidades(dados.uf, dados.localidade);
                numeroInput.focus(); // Foca no número para agilizar o preenchimento
            } else {
                customAlert("CEP não encontrado na base de dados.");
            }
        } catch (error) {
            console.error("Erro ao buscar CEP:", error);
            customAlert("Erro de comunicação ao buscar CEP. Verifique sua conexão.", "Erro", "erro");
        } finally {
            document.body.style.cursor = 'default';
            cepInput.style.opacity = '1';
        }
    }
});

// Mudança manual de UF
ufSelect.addEventListener('change', async () => {
    const uf = ufSelect.value;
    if (uf) {
        await carregarCidades(uf);
    } else {
        cidadeSelect.disabled = true;
        cidadeSelect.innerHTML = '<option value="">Selecione o Estado</option>';
    }
});

async function carregarCidades(uf, cidadePreSelecionada = null) {
    // Habilita o select e mostra loading
    cidadeSelect.disabled = false;
    cidadeSelect.innerHTML = '<option>Carregando...</option>';
    
    const cidades = await obterCidadesPorUF(uf);
    
    if (cidades && cidades.length > 0) {
        cidadeSelect.innerHTML = cidades.map(c => 
            `<option value="${c.nome}" ${cidadePreSelecionada === c.nome ? 'selected' : ''}>${c.nome}</option>`
        ).join('');

        // UX: Adiciona opção padrão se não houver cidade pré-selecionada (busca manual)
        if (!cidadePreSelecionada) {
            cidadeSelect.insertAdjacentHTML('afterbegin', '<option value="" selected>Selecione a Cidade</option>');
        }
    } else {
        cidadeSelect.innerHTML = '<option value="">Erro ao carregar lista</option>';
        customAlert("Não foi possível carregar a lista de cidades. Verifique sua conexão.", "Erro de Rede", "erro");
    }
}

// Salvar e Avançar
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cliente = {
        nome: document.getElementById('nome_cliente').value,
        documento: document.getElementById('documento_cliente').value,
        whatsapp: document.getElementById('whatsapp_cliente').value,
        email: emailInput.value,
        endereco: {
            cep: cepInput.value,
            logradouro: logradouroInput.value,
            numero: numeroInput.value,
            bairro: bairroInput.value,
            complemento: complementoInput.value,
            cidade: cidadeSelect.value,
            uf: ufSelect.value
        }
    };

    mostrarLoadingOverlay();
    let resultado;
    if (clienteIdEdicao) {
        resultado = await db.atualizar('clientes', clienteIdEdicao, cliente);
        sessionStorage.removeItem('cliente_id_edicao'); // Limpa flag
    } else {
        resultado = await db.salvar('clientes', cliente);
    }
    esconderLoadingOverlay();

    if (resultado) {
        const msg = clienteIdEdicao ? 'atualizado' : 'cadastrado';
        await customAlert(`Cliente "${resultado.nome}" ${msg} com sucesso!`, "Sucesso", "sucesso");
        // Redireciona para a visualização do cliente recém-salvo
        sessionStorage.setItem('cliente_id_visualizacao', resultado.id);
        window.location.href = 'cadastro-cliente.html';
    } else {
        await customAlert("Ocorreu um erro ao salvar o cliente.", "Erro", "erro");
    }
});

// --- INICIALIZAÇÃO DOS LISTENERS DE MÁSCARA ---
documentoInput.dataset.mascara = 'cpf-cnpj';
whatsappInput.dataset.mascara = 'celular';
cepInput.dataset.mascara = 'cep';

documentoInput.addEventListener('input', aplicarMascara);
whatsappInput.addEventListener('input', aplicarMascara);
cepInput.addEventListener('input', aplicarMascara);