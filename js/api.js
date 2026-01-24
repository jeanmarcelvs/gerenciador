// A URL base agora é a do seu Worker, não mais a API externa.
export const WORKER_URL = 'https://gdis-api-service.jeanmarcel-vs.workers.dev';

// Função para obter os headers dinamicamente, incluindo o token de autenticação se disponível.
function getHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };
    const token = localStorage.getItem('authToken');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

// As funções agora são simples wrappers para chamar o seu Worker
export async function get(endpoint) {
    try {
        // Usa o prefixo /erp/ para rotas de banco de dados
        const fullUrl = `${WORKER_URL}/erp${endpoint}`;
        
        const response = await fetch(fullUrl, { headers: getHeaders() });

        if (!response.ok) {
            // Se a resposta não for OK, logamos o erro e o corpo da resposta, se possível.
            const errorBody = await response.text();
            console.error(`Erro na requisição GET para ${endpoint}: ${response.status}. Corpo:`, errorBody);
            if (response.status === 401) {
                window.location.href = 'index.html?erro=acesso-negado';
                return { sucesso: false, dados: null, mensagem: 'Não autorizado. Redirecionando para login.' };
            }
            return { sucesso: false, dados: null, mensagem: `Erro na API: ${response.statusText}` };
        }

        const dados = await response.json();
        
        return { sucesso: true, dados: dados };

    } catch (error) {
        return { sucesso: false, dados: null, mensagem: 'Erro na requisição GET.' };
    }
}

export async function post(endpoint, dados) {
    try {
        const fullUrl = `${WORKER_URL}/erp${endpoint}`;
        
        const response = await fetch(fullUrl, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(dados)
        });

        // Ponto de depuração: Logando o status e o texto do status da resposta

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Erro na requisição POST para ${endpoint}: ${response.status}. Corpo:`, errorBody);
            if (response.status === 401) {
                window.location.href = 'index.html?erro=acesso-negado';
                throw new Error('Não autorizado. Redirecionando para login.');
            }
            throw new Error(`Erro na requisição POST para ${endpoint}: ${response.statusText}`);
        }
        
        const responseData = await response.json();
        return responseData;
    } catch (error) {
        throw error;
    }
}

export async function patch(endpoint, dados) {
    try {
        const fullUrl = `${WORKER_URL}/erp${endpoint}`;
        
        const response = await fetch(fullUrl, {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify(dados)
        });

        // Ponto de depuração: Logando o status e o texto do status da resposta

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Erro na requisição PATCH para ${endpoint}: ${response.status}. Corpo:`, errorBody);
            if (response.status === 401) {
                window.location.href = 'index.html?erro=acesso-negado';
                return { sucesso: false, mensagem: 'Não autorizado. Redirecionando para login.' };
            }
            return { sucesso: false, mensagem: `Erro na API: ${response.statusText}` };
        }
        
        const responseData = await response.json();
        return { sucesso: true, dados: responseData };
        
    } catch (error) {
        return { sucesso: false, mensagem: 'Ocorreu um erro ao tentar atualizar o status de visualização.' };
    }
}

export async function remove(endpoint) {
    try {
        const fullUrl = `${WORKER_URL}/erp${endpoint}`;
        
        const response = await fetch(fullUrl, {
            method: 'DELETE',
            headers: getHeaders()
        });

        if (!response.ok) {
            const errorBody = await response.text();
            // SILENCIAR ERRO 404: Se não achou, é porque já foi excluído. Loga como aviso apenas.
            if (response.status === 404) {
                console.warn(`Aviso na requisição DELETE para ${endpoint}: 404 (Não encontrado).`);
            } else {
                console.error(`Erro na requisição DELETE para ${endpoint}: ${response.status}. Corpo:`, errorBody);
            }
            
            if (response.status === 401) {
                window.location.href = 'index.html?erro=acesso-negado';
                return { sucesso: false, mensagem: 'Não autorizado.' };
            }
            return { sucesso: false, mensagem: `Erro na API: ${response.statusText}`, status: response.status };
        }
        
        return { sucesso: true, status: response.status };
    } catch (error) {
        return { sucesso: false, mensagem: 'Erro ao tentar excluir o registro.' };
    }
}

export async function getSelicTaxa() {
    try {
        const fullUrl = `${WORKER_URL}/selic`;
        
        // A rota da Selic é pública, não precisa enviar o token de autenticação.
        const response = await fetch(fullUrl, { headers: {
            'Content-Type': 'application/json'
        } });
        
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Falha ao buscar a taxa Selic: ${response.status}. Corpo:`, errorBody);
            if (response.status === 401) {
                window.location.href = 'index.html?erro=acesso-negado';
                return null;
            }
            return null;
        }

        const dados = await response.json();
        
        return parseFloat(dados[0].valor);
    } catch (error) {
        return null;
    }
}

/**
 * NOVO: Validação de Hardware (Fingerprint)
 * Esta função chama a rota específica de segurança que criamos no Worker.
 */
export async function validarDispositivoHardware(dadosDispositivo) {
    try {
        const fullUrl = `${WORKER_URL}/security/validate-hardware`;
        const response = await fetch(fullUrl, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(dadosDispositivo)
        });

        return await response.json();
    } catch (error) {
        console.error("Falha na conexão de segurança:", error);
        return { sucesso: false, erro: "Falha na conexão de segurança." };
    }
}