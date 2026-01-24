/**
 * Funções utilitárias de Interface (UI) compartilhadas entre os controladores.
 */

// Injeta estilos críticos para o Loading Overlay e correções visuais
(function injetarEstilosCriticos() {
    const styleId = 'estilos-criticos-utils';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
        /* Loading Overlay Fixo e Garantido */
        .loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(4px);
            z-index: 999999; /* Z-index altíssimo */
            display: flex;
            justify-content: center;
            align-items: center;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
        }
        .loading-overlay:not(.oculto) {
            opacity: 1;
            pointer-events: all;
        }
        .loading-spinner {
            width: 50px;
            height: 50px;
            border: 5px solid #e2e8f0;
            border-top: 5px solid var(--primaria, #16a34a);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        /* Ocultar menu Clientes preventivamente */
        .menu-principal a[onclick*="clientes"] { display: none !important; }
    `;
    document.head.appendChild(style);

    // Cria o elemento do overlay se não existir
    if (!document.querySelector('.loading-overlay')) {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay oculto';
        overlay.innerHTML = '<div class="loading-spinner"></div>';
        document.body.appendChild(overlay);
    }
})();

export function mostrarLoadingOverlay() {
    const overlay = document.querySelector('.loading-overlay');
    const mainContent = document.querySelector('main');

    if (mainContent) {
        mainContent.classList.add('main-oculto');
        mainContent.classList.remove('main-visivel');
    }

    if (overlay) {
        overlay.classList.remove('oculto');
    }
}

export function esconderLoadingOverlay() {
    const overlay = document.querySelector('.loading-overlay');
    const mainContent = document.querySelector('main');

    if (mainContent) {
        mainContent.classList.remove('main-oculto');
        mainContent.classList.add('main-visivel');
    }

    if (overlay) {
        overlay.classList.add('oculto');
    }
}

/**
 * Higieniza inputs para aceitar apenas números e vírgula/ponto.
 * Converte automaticamente para ponto para o JS.
 * @param {string} valor O valor do input.
 * @returns {string} O valor limpo e normalizado.
 */
export function higienizarParaCalculo(valor) {
    if (typeof valor !== 'string') return '';
    // Remove tudo que não for número, ponto, vírgula ou sinal de menos
    let cleanValue = valor.replace(/[^\d.,-]/g, '');
    
    // Converte vírgula em ponto
    cleanValue = cleanValue.replace(',', '.');
    
    // Garante apenas um ponto decimal
    const partes = cleanValue.split('.');
    if (partes.length > 2) {
        cleanValue = partes[0] + '.' + partes.slice(1).join('');
    }
    
    return cleanValue;
}

/**
 * Escapa strings para uso seguro em innerHTML.
 * @param {string} str String não confiável.
 * @returns {string} String escapada.
 */
export function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag]));
}

/**
 * Formata um número para moeda BRL padrão.
 * @param {number} valor Valor numérico.
 * @returns {string} String formatada (ex: R$ 1.200,00).
 */
export function formatarMoeda(valor) {
    return (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Gera o HTML do badge de status para Propostas.
 * @param {string} status - Status da proposta (EM_ABERTO, VENDIDA, PERDIDA).
 * @param {string|null} versao - Versão vendida ('standard' ou 'premium'), opcional.
 * @returns {string} HTML do badge.
 */
export function obterBadgeStatusProposta(status, versao = null) {
    switch (status) {
        case 'VENDIDA':
            let label = 'Vendida';
            let icon = 'fa-check-circle';
            let style = 'background:#dcfce7; color:#166534; border:1px solid #bbf7d0;'; // Verde (Padrão)

            if (versao === 'premium') {
                label = 'Vendida (Premium)';
                icon = 'fa-crown';
                style = 'background:#fffbeb; color:#b45309; border:1px solid #fcd34d;'; // Gold
            } else if (versao === 'standard') {
                label = 'Vendida (Standard)';
            }
            
            return `<span class="badge" style="${style}"><i class="fas ${icon}"></i> ${label}</span>`;
        case 'PERDIDA':
            return `<span class="badge" style="background:#fef2f2; color:#991b1b; border:1px solid #fecaca;"><i class="fas fa-times-circle"></i> Perdida</span>`;
        case 'EM_ABERTO':
        default:
            return `<span class="badge" style="background:#eff6ff; color:#1e40af; border:1px solid #dbeafe;"><i class="fas fa-clock"></i> Pendente</span>`;
    }
}

/**
 * Gera o HTML do badge de status para Projetos.
 * @param {string} status - Status do projeto (EM_COTACAO, VENDIDO, CANCELADO).
 * @returns {string} HTML do badge.
 */
export function obterBadgeStatusProjeto(status) {
    switch (status) {
        case 'VENDIDO':
            return `<span class="badge" style="background:#dcfce7; color:#166534; border:1px solid #bbf7d0;"><i class="fas fa-hard-hat"></i> Em Execução</span>`;
        case 'CANCELADO':
            return `<span class="badge" style="background:#f1f5f9; color:#64748b; border:1px solid #e2e8f0;">Cancelado</span>`;
        case 'EM_COTACAO':
        default:
            return `<span class="badge" style="background:#fff7ed; color:#9a3412; border:1px solid #ffedd5;"><i class="fas fa-calculator"></i> Em Cotação</span>`;
    }
}

/**
 * Gera o HTML do badge de status para Clientes.
 * @param {string} status - Status do cliente (LEAD, CLIENTE).
 * @returns {string} HTML do badge.
 */
export function obterBadgeStatusCliente(status) {
    if (status === 'CLIENTE') {
        return `<span class="badge" style="background:#d1fae5; color:#065f46; font-weight:700; letter-spacing:0.5px;">CLIENTE ATIVO</span>`;
    }
    return `<span class="badge" style="background:#f3f4f6; color:#4b5563;">LEAD / PROSPECT</span>`;
}

// ======================================================================
// MODAIS PERSONALIZADOS (SUBSTITUIÇÃO DE ALERT/CONFIRM/PROMPT)
// ======================================================================

function criarEstruturaModal(titulo, conteudoHtml, tipo = 'info') {
    return new Promise((resolve) => {
        const modalId = 'modal_custom_' + Date.now();
        const overlay = document.createElement('div');
        overlay.id = modalId;
        overlay.className = 'modal-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.6); display: flex; justify-content: center;
            align-items: center; z-index: 100000; backdrop-filter: blur(2px);
            animation: fadeIn 0.2s ease-out;
        `;

        const corIcone = tipo === 'erro' ? '#ef4444' : (tipo === 'sucesso' ? '#16a34a' : (tipo === 'perigo' ? '#ef4444' : '#3b82f6'));
        const icone = tipo === 'erro' || tipo === 'perigo' ? 'fa-exclamation-circle' : (tipo === 'sucesso' ? 'fa-check-circle' : 'fa-info-circle');

        overlay.innerHTML = `
            <div class="modal-content" style="background: white; padding: 25px; border-radius: 12px; width: 90%; max-width: 450px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); transform: scale(0.95); animation: scaleUp 0.2s ease-out forwards;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="background: ${corIcone}15; width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px;">
                        <i class="fas ${icone}" style="font-size: 30px; color: ${corIcone};"></i>
                    </div>
                    <h3 style="color: #1e293b; margin: 0; font-size: 1.25rem;">${titulo}</h3>
                </div>
                <div style="color: #64748b; font-size: 0.95rem; text-align: center; margin-bottom: 25px; line-height: 1.5;">
                    ${conteudoHtml}
                </div>
                <div id="${modalId}_actions" style="display: flex; gap: 10px; justify-content: center;">
                </div>
            </div>
            <style>
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scaleUp { from { transform: scale(0.95); } to { transform: scale(1); } }
            </style>
        `;

        document.body.appendChild(overlay);
        
        // Retorna elementos para configuração dos botões
        resolve({ overlay, actions: document.getElementById(`${modalId}_actions`) });
    });
}

export async function customAlert(mensagem, titulo = 'Atenção', tipo = 'info') {
    const { overlay, actions } = await criarEstruturaModal(titulo, mensagem, tipo);
    
    return new Promise((resolve) => {
        const btn = document.createElement('button');
        btn.innerText = 'Entendido';
        btn.className = 'btn-primary';
        btn.style.cssText = "min-width: 120px; justify-content: center;";
        btn.onclick = () => {
            overlay.remove();
            resolve(true);
        };
        actions.appendChild(btn);
        btn.focus();
    });
}

export async function customConfirm(mensagem, titulo = 'Confirmação', tipo = 'perigo') {
    const { overlay, actions } = await criarEstruturaModal(titulo, mensagem, tipo);
    
    return new Promise((resolve) => {
        const btnCancel = document.createElement('button');
        btnCancel.innerText = 'Cancelar';
        btnCancel.className = 'btn-secundario';
        btnCancel.onclick = () => {
            overlay.remove();
            resolve(false);
        };

        const btnConfirm = document.createElement('button');
        btnConfirm.innerText = 'Confirmar';
        btnConfirm.className = tipo === 'perigo' ? 'btn-perigo' : 'btn-primary';
        btnConfirm.onclick = () => {
            overlay.remove();
            resolve(true);
        };

        actions.appendChild(btnCancel);
        actions.appendChild(btnConfirm);
        btnConfirm.focus();
    });
}

export async function customPrompt(mensagem, valorPadrao = '', titulo = 'Informe o valor') {
    const inputHtml = `<input type="text" id="prompt_input" value="${valorPadrao}" class="input-estilizado" style="width: 100%; margin-top: 10px;">`;
    const { overlay, actions } = await criarEstruturaModal(titulo, mensagem + inputHtml, 'info');
    
    const input = overlay.querySelector('#prompt_input');
    
    return new Promise((resolve) => {
        const btnCancel = document.createElement('button');
        btnCancel.innerText = 'Cancelar';
        btnCancel.className = 'btn-secundario';
        btnCancel.onclick = () => {
            overlay.remove();
            resolve(null);
        };

        const btnConfirm = document.createElement('button');
        btnConfirm.innerText = 'OK';
        btnConfirm.className = 'btn-primary';
        btnConfirm.onclick = () => {
            const val = input.value;
            overlay.remove();
            resolve(val);
        };

        // Enter para confirmar
        input.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') btnConfirm.click();
        });

        actions.appendChild(btnCancel);
        actions.appendChild(btnConfirm);
        
        setTimeout(() => {
            input.focus();
            input.select();
        }, 100);
    });
}