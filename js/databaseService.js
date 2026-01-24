import { get, post, patch, remove } from './api.js';
import { mostrarLoadingOverlay, esconderLoadingOverlay } from './utils.js';

/**
 * Camada de Serviço de Persistência (Service Layer)
 * Abstrai a lógica de banco de dados. Atualmente usa localStorage,
 * mas está pronto para ser migrado para uma API/Cloudflare D1.
 */

/*
    SCHEMA D1 (SQLite) - Worker Híbrido:
    
    Todas as tabelas possuem uma coluna 'dados' que armazena o objeto JSON completo.
    Colunas explícitas são usadas apenas para indexação e busca rápida.

    Table: clientes (id, nome, dados, data_criacao)
    Table: projetos (id, cliente_id, nome_projeto, status, dados, data_criacao)
    Table: propostas (id, projeto_id, cliente_id, status, dados, data_criacao)
    Table: configuracoes (chave, dados)
*/

const db = {
    // Cache em memória para evitar JSON.parse repetitivo
    _cache: {},

    /**
     * INICIALIZAÇÃO: Sincroniza D1 -> Memória
     * Deve ser chamado no login ou carregamento do dashboard.
     */
    sincronizarTudo: async () => {
        console.log("🔄 Sincronizando dados com Cloudflare D1...");
        try {
            // Carrega tabelas em paralelo
            const [cli, proj, prop, conf, cat] = await Promise.all([
                get('/clientes'),
                get('/projetos'),
                get('/propostas'),
                get('/configuracoes/premissas_globais'),
                get('/configuracoes/catalogo_belenus')
            ]);

            if (cli.sucesso) db._cache['clientes'] = cli.dados || [];
            if (proj.sucesso) db._cache['projetos'] = proj.dados || [];
            if (prop.sucesso) db._cache['propostas'] = prop.dados || [];
            
            // Configurações vêm como objeto único, não array
            if (conf.sucesso && conf.dados) {
                db._cache['config_premissas_globais'] = conf.dados;
            }
            
            if (cat.sucesso && cat.dados) {
                db._cache['config_catalogo_belenus'] = cat.dados;
            }

            console.log("✅ Sincronização concluída.");
            return true;
        } catch (e) {
            console.error("Erro na sincronização D1:", e);
            return false;
        }
    },

    /**
     * Lista todos os registros de uma "tabela".
     * @param {string} tabela - O nome da tabela (ex: 'clientes').
     */
    listar: (tabela) => { 
        // Retorna do cache (memória) para manter compatibilidade síncrona
        return db._cache[tabela] || [];
    },
    
    /**
     * Salva um novo registro, gerando um ID único.
     * @param {string} tabela - O nome da tabela.
     * @param {object} dados - O objeto a ser salvo.
     */
    salvar: async (tabela, dados) => {
        mostrarLoadingOverlay();
        
        // UUID Polyfill (Garante ID mesmo em contextos não seguros)
        const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? 
            crypto.randomUUID() : 
            'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });

        const novoRegistro = { 
            id: uuid, 
            dataCriacao: new Date().toISOString(),
            ...dados 
        };
        
        try {
            // Persiste no D1 (AWAIT - Garante integridade antes de prosseguir)
            const res = await post(`/${tabela}`, novoRegistro);
            if(!res.sucesso && !res.success) {
                console.warn(`[D1] Recusa ao salvar em ${tabela}:`, res); // Log para debug
                throw new Error(res.mensagem || res.error || "Erro desconhecido no D1");
            }
            
            // SUCESSO: Só agora atualiza o cache local (Evita Fantasmas)
            const registros = db.listar(tabela);
            registros.push(novoRegistro);
            db._cache[tabela] = registros;
            
            console.log(`${tabela} salvo com sucesso no D1! ID: ${novoRegistro.id}`);
        } catch(err) {
            console.error(`Erro de rede ao salvar em ${tabela}:`, err);
            throw err; // Lança o erro para o controller tratar
        } finally {
            esconderLoadingOverlay();
        }

        return novoRegistro;
    },

    /**
     * Atualiza um registro existente.
     * @param {string} tabela - O nome da tabela.
     * @param {string} id - O ID do registro.
     * @param {object} dados - Os novos dados (serão mesclados).
     */
    atualizar: async (tabela, id, dados) => {
        mostrarLoadingOverlay();
        const registros = db.listar(tabela);
        const index = registros.findIndex(r => r.id === id);
        if (index === -1) { esconderLoadingOverlay(); return null; }
        
        const registroOriginal = { ...registros[index] }; // Backup para rollback
        const registroAtualizado = { ...registros[index], ...dados };
        registros[index] = registroAtualizado;
        db._cache[tabela] = registros; // Atualiza cache

        try {
            // Persiste no D1 (AWAIT)
            const res = await patch(`/${tabela}/${id}`, dados);
            if(!res.sucesso && !res.success) throw new Error(res.mensagem || res.error);
            console.log(`${tabela} atualizado com sucesso no D1! ID: ${id}`);
        } catch(err) {
            console.error(`Erro de rede ao atualizar ${tabela}:`, err);
            
            // ROLLBACK: Restaura o registro original
            registros[index] = registroOriginal;
            db._cache[tabela] = registros;
            throw err;
        } finally {
            esconderLoadingOverlay();
        }

        return registroAtualizado;
    },

    /**
     * Busca registros com base em um campo relacional.
     * @param {string} tabela - O nome da tabela.
     * @param {string} campo - O nome do campo (ex: 'clienteId').
     * @param {string} valor - O valor a ser buscado.
     */
    buscarPorRelacao: (tabela, campo, valor) =>
        db.listar(tabela).filter(item => item[campo] === valor),

    /**
     * Busca um único registro pelo seu ID.
     * @param {string} tabela - O nome da tabela.
     * @param {string} id - O ID do registro a ser buscado.
     */
    buscarPorId: (tabela, id) => db.listar(tabela).find(item => item.id === id),

    /**
     * Exclui um registro de uma tabela pelo seu ID.
     * @param {string} tabela - O nome da tabela.
     * @param {string} id - O ID do registro a ser excluído.
     * @returns {boolean} - Retorna true se a exclusão foi bem-sucedida, false caso contrário.
     */
    excluir: async (tabela, id) => {
        mostrarLoadingOverlay();
        let registros = db.listar(tabela);
        const registroBackup = registros.find(item => item.id === id); // Backup
        const registrosFiltrados = registros.filter(item => item.id !== id);
        if (registros.length === registrosFiltrados.length) { esconderLoadingOverlay(); return false; }
        db._cache[tabela] = registrosFiltrados; // Atualiza cache

        try {
            const res = await remove(`/${tabela}/${id}`);
            if (!res.sucesso) {
                // TRATAMENTO DE FANTASMAS: Se for 404, o item já não existe no servidor.
                // Consideramos sucesso para confirmar a limpeza local.
                if (res.status === 404) {
                    console.warn(`[D1] Item ${id} não encontrado (404). Confirmando exclusão local.`);
                    return true;
                }
                throw new Error(res.mensagem || "Erro ao excluir no servidor");
            }
        } catch(e) {
            console.error("Erro ao excluir no D1", e);
            
            // ROLLBACK: Restaura a lista original
            // 'registros' ainda contém a lista completa original (pois filter cria um novo array).
            // Apenas restauramos o ponteiro do cache para a lista original.
            db._cache[tabela] = registros;
            throw e;
        } finally {
            esconderLoadingOverlay();
        }

        return true;
    },

    /**
     * Salva ou atualiza um objeto de configuração único.
     * @param {string} chave - A chave da configuração (ex: 'premissas_globais').
     * @param {object} dados - O objeto de configuração a ser salvo.
     * @returns {boolean} - Retorna true se foi salvo com sucesso.
     */
    salvarConfiguracao: async (chave, dados) => {
        mostrarLoadingOverlay();
        db._cache[`config_${chave}`] = dados; // Cache para configs também
        
        try {
            await post(`/configuracoes`, { chave, dados });
        } catch(e) {
            console.error("Erro ao salvar config", e);
        } finally {
            esconderLoadingOverlay();
        }

        return true;
    },

    /**
     * Busca um objeto de configuração.
     * @param {string} chave - A chave da configuração.
     * @returns {object|null} O objeto de configuração ou null.
     */
    buscarConfiguracao: (chave) => {
        const cacheKey = `config_${chave}`;
        return db._cache[cacheKey] || null;
    },

    /**
     * Versão Async para compatibilidade futura com API
     */
    listarAsync: async (tabela) => {
        // Simula delay de rede
        await new Promise(r => setTimeout(r, 50));
        return db.listar(tabela);
    },

    /**
     * GERA BACKUP COMPLETO (DUMP)
     * Prepara todos os dados para exportação (Excel/Migração D1)
     */
    backupCompleto: () => {
        const dump = {
            metadata: {
                versao: '1.0',
                dataExportacao: new Date().toISOString(),
                origem: 'BelEnergy ERP Local'
            },
            tabelas: {
                clientes: db.listar('clientes'),
                projetos: db.listar('projetos'),
                propostas: db.listar('propostas')
            },
            configuracoes: {
                premissas_globais: db.buscarConfiguracao('premissas_globais')
            }
        };
        return dump;
    },

    /**
     * Limpa o banco local (Útil para testes ou restauração limpa)
     */
    limparTudo: () => {
        localStorage.removeItem('db_clientes');
        localStorage.removeItem('db_projetos');
        localStorage.removeItem('db_propostas');
        db._cache = {};
    }
};

export default db;