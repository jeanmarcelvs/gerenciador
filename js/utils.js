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

/**
 * 📄 GERA HTML EXECUTIVO EDITÁVEL (TEMPLATE JEAN MARCEL)
 * Abre uma nova aba com o conteúdo populado e campos editáveis.
 */
export function abrirPropostaParaEdicao(proposta, projeto, cliente) {
    const v = proposta.versoes?.premium || proposta.versoes?.standard;
    if (!v) return alert("Dados da proposta incompletos.");

    const fin = v.resumoFinanceiro;
    const dados = v.dados;

    const dataEmissao = new Date(proposta.dataCriacao || Date.now()).toLocaleDateString('pt-BR', { 
        day: '2-digit', month: 'long', year: 'numeric' 
    });
    
    const refProp = `#${proposta.id.substring(0, 8).toUpperCase()}`;
    const potKwp = `${proposta.potenciaKwp.toFixed(2)} kWp`;
    const geracao = `${proposta.geracaoMensal} kWh/mês`;

    const logoSvg = `
            <svg viewBox="0 0 500 100" xmlns="http://www.w3.org/2000/svg" class="svg-logo">
                <g transform="translate(57, 20)">
                    <rect x="0" y="10" width="40" height="40" rx="4" fill="#f1c40f"/>
                    <path d="M0 23.3 H40 M0 36.6 H40 M13.3 10 V50 M26.6 10 V50" stroke="#1a1a1a" stroke-width="1.5"/>
                </g>
                <text x="117" y="65" font-family="Montserrat, sans-serif" font-weight="800" font-size="52" fill="#f1c40f">Jean</text>
                <text x="262" y="65" font-family="Montserrat, sans-serif" font-weight="800" font-size="52" fill="#ffffff">Marcel</text>
                <text x="120" y="85" font-family="Montserrat, sans-serif" font-weight="600" font-size="14" fill="#ffffff" letter-spacing="2.5" text-transform="uppercase">ENGENHEIRO ELETRICISTA</text>
            </svg>`;

    const iconSvg = `
            <svg viewBox="0 10 40 40" xmlns="http://www.w3.org/2000/svg" class="svg-icon">
                <rect x="0" y="10" width="40" height="40" rx="4" fill="#f1c40f"/>
                <path d="M0 23.3 H40 M0 36.6 H40 M13.3 10 V50 M26.6 10 V50" stroke="#1a1a1a" stroke-width="1.5"/>
            </svg>`;

    // Cálculo de Área Útil (Baseado nas dimensões padrão do model.js)
    const watts = dados.modulo.watts || 550;
    let dim = { comp: 2.278, larg: 1.134 }; // Fallback
    if (watts >= 530 && watts <= 585) dim = { comp: 2.278, larg: 1.134 };
    else if (watts >= 590 && watts <= 625) dim = { comp: 2.382, larg: 1.134 };
    else if (watts >= 630 && watts <= 735) dim = { comp: 2.384, larg: 1.303 };
    
    const areaUtil = (dim.comp * dim.larg * dados.modulo.qtd).toFixed(1);

    let componentesHtml = `
        <tr>
            <td style="text-align: center;" contenteditable="true">${dados.modulo.qtd}</td>
            <td contenteditable="true">Módulos Fotovoltaicos de ${dados.modulo.watts}Wp de Alta Eficiência.</td>
        </tr>
    `;

    dados.inversores.forEach(inv => {
        componentesHtml += `
            <tr>
                <td style="text-align: center;" contenteditable="true">${inv.qtd}</td>
                <td contenteditable="true">Inversor Huawei ${inv.modelo} com monitoramento via Wi-Fi.</td>
            </tr>
        `;
    });

    componentesHtml += `
        <tr><td style="text-align: center;" contenteditable="true">01</td><td contenteditable="true">Estrutura em Alumínio Anodizado e Fixadores em Aço Inox.</td></tr>
    `;

    const htmlFinal = `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>proposta-comercial-financiamento.html</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root { --primary: #002d5b; --gold: #a68966; --text-main: #2c3e50; --text-light: #7f8c8d; --bg-accent: #f8f9fa; --border: #e2e8f0; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { font-family: 'Montserrat', sans-serif; background: #f4f4f4; color: var(--text-main); line-height: 1.5; margin: 0; padding: 0; }
        
        @page { 
            size: A4; 
            margin: 20mm 15mm 20mm 15mm; /* Margens reais de documento Word */
        }

        /* Container de Visualização na Tela (Simula o papel) */
        .page-container { width: 210mm; margin: 10mm auto; background: white; box-shadow: 0 0 10px rgba(0,0,0,0.1); position: relative; min-height: 297mm; }
        .content-flow { padding: 45mm 15mm 30mm 15mm; min-height: 297mm; }

        @media print {
            body { background: white; }
            .page-container { margin: 0; box-shadow: none; width: 100%; }
            .content-flow { padding: 35mm 0 25mm 0; } /* Ajuste fino para o fluxo de impressão */
            #controles-impressao { display: none !important; }
            .page-break { page-break-before: always; }
        }
        [contenteditable="true"]:hover { background: rgba(166, 137, 102, 0.1); outline: 1px dashed var(--gold); cursor: text; }
        [contenteditable="true"]:focus { background: #fff; outline: 2px solid var(--primary); }
        .cover { justify-content: center; align-items: center; background: linear-gradient(135deg, #001a35 0%, var(--primary) 100%); color: white; text-align: center; }
        .cover-border { position: absolute; top: 10mm; left: 10mm; right: 10mm; bottom: 10mm; border: 1px solid rgba(166, 137, 102, 0.3); }
        .cover-logo-img { max-width: 250px; margin-bottom: 10mm; z-index: 1; filter: brightness(0) invert(1); }
        .cover-subtitle { font-size: 12pt; text-transform: uppercase; letter-spacing: 5px; color: var(--gold); margin-bottom: 30mm; z-index: 1; }
        .cover-main-box { background: rgba(255,255,255,0.05); padding: 15mm; border-left: 4px solid var(--gold); text-align: left; width: 80%; z-index: 1; }
        .cover-title { font-size: 26pt; font-weight: 700; margin-bottom: 4mm; }
        .cover-footer { position: absolute; bottom: 25mm; display: flex; gap: 20mm; font-size: 9pt; }
        .cover-footer b { color: var(--gold); text-transform: uppercase; display: block; }
        /* Cabeçalho e Rodapé Repetitivos (O Segredo da Perfeição) */
        .print-header {
            position: fixed; top: 0; left: 0; right: 0;
            height: 35mm;
            display: flex; justify-content: space-between; align-items: center;
            padding: 10mm 15mm;
            background: linear-gradient(135deg, #001a35 0%, var(--primary) 100%);
            border-bottom: 3px solid var(--gold);
            color: white;
            z-index: 1000;
        }
        .print-footer {
            position: fixed; bottom: 0; left: 0; right: 0;
            height: 20mm;
            display: flex; justify-content: space-between; align-items: center;
            padding: 5mm 15mm;
            background: white;
            border-top: 1px solid var(--border);
            font-size: 7pt; color: var(--text-light);
            z-index: 1000;
        }

        .header-left { display: flex; align-items: center; gap: 3mm; }
        .header-icon-container { width: 35px; }
        .header-icon-container .svg-icon { width: 100%; height: auto; }
        .header-data-box { line-height: 1.3; font-weight: 500; }
        .header-data-box b { color: var(--gold); display: block; margin-bottom: 2px; font-size: 9pt; }
        .header-right { text-align: right; }
        section { margin-bottom: 8mm; break-inside: avoid; page-break-inside: avoid; }
        .content { width: 100%; }
        .section-header { display: flex; align-items: center; margin-bottom: 4mm; border-bottom: 1px solid var(--border); padding-bottom: 2mm; }
        .section-number { font-size: 11pt; font-weight: 700; color: white; background: var(--primary); width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; margin-right: 10px; border-radius: 2px; }
        .section-title { font-size: 10pt; font-weight: 700; color: var(--primary); text-transform: uppercase; }
        .intro-text { font-size: 9.5pt; text-align: justify; color: var(--text-main); line-height: 1.6; margin-bottom: 10mm; }
        .stakeholder-row { background: #FFFFFF; padding: 4mm; border: 1px solid var(--border); border-left: 5px solid var(--gold); display: flex; flex-direction: column; margin-bottom: 10mm; break-inside: avoid; }
        .stakeholder-subtitle { font-size: 8.5pt; font-weight: 700; color: var(--gold); text-transform: uppercase; margin-bottom: 2mm; display: block; letter-spacing: 0.5px; }
        .stakeholder-row p { font-size: 9pt; line-height: 1.4; color: var(--text-main); }
        .stakeholder-grid { display: block; }
        .nf-badge { font-size: 6pt; font-weight: 700; padding: 0.8mm 2mm; border-radius: 2px; text-transform: uppercase; margin-bottom: 2mm; display: inline-block; letter-spacing: 0.3px; }
        .nf-servico { background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe; }
        .nf-produto { background: #fef3c7; color: #d97706; border: 1px solid #fde68a; }
        .rt-separator { margin-top: 3mm; padding-top: 3mm; border-top: 1px dashed #cbd5e0; }
        .rt-label { font-size: 7pt; font-weight: 700; color: var(--gold); text-transform: uppercase; margin-bottom: 1mm; display: block; }
        .generator-title-box { background: #eef2f7; padding: 3mm; border-radius: 4px; margin-bottom: 3mm; border: 1px solid var(--border); }
        .generator-name { color: var(--primary); font-weight: 700; font-size: 10pt; display: block; }
        .tech-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; margin-bottom: 4mm; }
        .tech-card { background: var(--primary); color: white; padding: 3mm; border-radius: 4px; text-align: center; }
        .tech-card label { font-size: 6.5pt; text-transform: uppercase; opacity: 0.8; display: block; }
        .tech-card span { font-size: 10pt; font-weight: 700; }
        .data-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
        .data-table th { background: var(--bg-accent); padding: 2mm 3mm; border: 1px solid var(--border); text-align: left; color: var(--primary); font-size: 8pt; text-transform: uppercase; }
        .data-table td { padding: 2mm 3mm; border: 1px solid var(--border); }
        .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15mm; margin-top: 8mm; }
        .sig-box { text-align: center; }
        .sig-box p { font-size: 8.5pt; font-weight: 700; margin-top: 1.5mm; color: var(--primary); }
        .sig-box span { font-size: 7pt; color: var(--text-light); text-transform: uppercase; font-weight: 600; display: block; }
        .sig-line { border-top: 1px solid #000; width: 80%; margin: 12mm auto 0 auto; }
        /* Estilização da Logo em Código */
        .logo-container { width: 100%; max-width: 350px; margin: 0 auto 10mm auto; z-index: 5; }
        .svg-logo { width: 100%; height: auto; filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.3)); }
        /* --- CRONOGRAMA DESIGN --- */
        .timeline { position: relative; margin-top: 5mm; padding-left: 25px; border-left: 2px dashed var(--border); }
        .timeline-item { position: relative; margin-bottom: 4mm; }
        .timeline-item::before { content: ''; position: absolute; left: -31px; top: 0; width: 10px; height: 10px; background: var(--primary); border: 2px solid white; border-radius: 50%; }
        .timeline-title { font-size: 8.5pt; font-weight: 700; color: var(--primary); text-transform: uppercase; margin-bottom: 0.5mm; }
        .timeline-desc { font-size: 8pt; color: var(--text-main); line-height: 1.3; }
        .timeline-days { font-size: 7.5pt; font-weight: 700; color: var(--gold); }
        .validity-box { margin-top: 5mm; padding: 4mm; background: var(--bg-accent); border-radius: 4px; font-size: 8pt; color: var(--text-main); text-align: justify; }
        
        /* Garante que o fundo escuro da logo e badges apareçam no PDF */
        @media print { 
            .print-header { -webkit-print-color-adjust: exact; }
            .tech-card { -webkit-print-color-adjust: exact; background-color: var(--primary) !important; }
        }
    </style>
</head>
<body>
    <div id="controles-impressao" style="position: fixed; bottom: 30px; right: 30px; display: flex; flex-direction: column; gap: 10px; z-index: 10000;">
        <div style="background: #fff; padding: 10px 15px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); font-size: 0.85rem; color: #1e293b; border-left: 4px solid var(--gold);">
            <i class="fas fa-edit"></i> <b>Modo de Edição Ativo:</b> Clique em qualquer texto para alterar os dados antes de imprimir.
        </div>
        <button onclick="window.print()" style="background: var(--primary); color: #fff; border: none; padding: 15px 25px; border-radius: 50px; cursor: pointer; font-weight: 700; box-shadow: 0 10px 20px rgba(0,45,91,0.3); display: flex; align-items: center; gap: 10px; font-size: 1rem; align-self: flex-end;">
            <i class="fas fa-file-pdf"></i> SALVAR EM PDF / IMPRIMIR
        </button>
    </div>

    <div class="page cover">
        <div class="cover-border"></div>
        <div class="logo-container">
            ${logoSvg}
        </div>
        <div class="cover-subtitle" contenteditable="true">Engenharia Elétrica & Energias Renováveis</div>
        <div class="cover-main-box">
            <h2 class="cover-title" contenteditable="true">Proposta Técnico-Comercial</h2>
            <p><b>BENEFICIÁRIO:</b> <span contenteditable="true">${cliente.nome.toUpperCase()}</span></p>
            <p style="font-size: 10pt; margin-top: 2mm; opacity: 0.8;" contenteditable="true">Sistema de Microgeração On-Grid - Alta Performance - ${potKwp}</p>
        </div>
        <div class="cover-footer">
            <div contenteditable="true"><b>Referência</b> ${refProp}</div>
            <div contenteditable="true"><b>Emissão</b> ${dataEmissao}</div>
        </div>
    </div>

    <div class="page">
        ${headerTemplate}
        <div class="content">
            <p class="intro-text" contenteditable="true">
                Apresentamos a solução executiva para implantação de um sistema de microgeração fotovoltaica de alto padrão técnico, projetada sob a ótica da <b>Engenharia de Alta Performance</b>. Esta proposta cumpre rigorosamente os requisitos para composição de dossiê de financiamento junto às instituições bancárias, garantindo conformidade com a Lei 14.300/22 e normas da ANEEL.
            </p>
            <section>
                <div class="section-header">
                    <div class="section-number">01</div>
                    <h2 class="section-title">Partes Envolvidas e Dados Cadastrais</h2>
                </div>
                <div class="stakeholder-grid">
                    <h3 class="stakeholder-subtitle" contenteditable="true">Proponente e Beneficiário (Correntista / Tomador do Crédito)</h3>
                    <div class="stakeholder-row">
                        <p contenteditable="true"><b>${cliente.nome.toUpperCase()}</b> | CPF/CNPJ: ${cliente.documento || '---'}</p>
                        <p contenteditable="true">Endereço: ${cliente.endereco.logradouro}, ${cliente.endereco.numero}, ${cliente.endereco.bairro} - ${cliente.endereco.cidade}/${cliente.endereco.uf}</p>
                    </div>

                    <h3 class="stakeholder-subtitle" contenteditable="true">Empresa Prestadora dos Serviços</h3>
                    <div class="stakeholder-row">
                        <span class="nf-badge nf-servico">Emissão de NF de Serviço</span>
                        <p contenteditable="true"><b>CAMILA SOUZA SILVA</b> | CNPJ: 64.065.082/0001-35</p>
                        <p contenteditable="true">Rod. IB Gatto Marinho Falcão, S/N - Mares do Sul, Marechal Deodoro/AL</p>
                        <p contenteditable="true"><b>Contato:</b> (82) 99121-1234 | camila.souza@eng.br</p>
                        <div class="rt-separator">
                            <span class="rt-label">Responsável Técnico (Projeto e ART)</span>
                            <p contenteditable="true"><b>Jean Marcel Vieira Silva</b></p>
                            <p contenteditable="true">Engenheiro Eletricista | CREA/AL: 210984849-0</p>
                        </div>
                    </div>

                    <h3 class="stakeholder-subtitle" contenteditable="true">Empresa Fornecedora dos Equipamentos</h3>
                    <div class="stakeholder-row">
                        <span class="nf-badge nf-produto">Emissão de NF de Produto</span>
                        <p contenteditable="true"><b>BELENUS LTDA (Distribuidora)</b> | CNPJ: 05.141.025/0001-06</p>
                        <p contenteditable="true">Estrada Municipal Belenus, 100 - Distrito Industrial, Vinhedo/SP</p>
                        <p contenteditable="true" style="margin-top: 2mm;"><b>Contato:</b> (19) 3826-8000</p>
                        <p contenteditable="true">solar@belenus.com.br</p>
                    </div>
                </div>
                <p style="font-size: 8pt; color: var(--text-light); margin-top: 4mm; line-height: 1.4;" contenteditable="true">
                    * O investimento global é composto pela NF de Serviços (Executora) e NF de Produtos (Fornecedora), garantindo transparência fiscal absoluta para o financiamento bancário.
                </p>
            </section>
        </div>
        <footer>
            <div contenteditable="true">contato@jeanmarcel.eng.br</div>
            <div contenteditable="true">Página 01 de 04</div>
        </footer>
    </div>

    <div class="page">
        ${headerTemplate}
        <div class="content">
            <section>
                <div class="section-header">
                    <div class="section-number">03</div>
                    <h2 class="section-title">Estrutura de Investimento (Capex)</h2>
                </div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 50px; text-align: center;">Qtd</th>
                            <th style="width: 50px; text-align: center;">Und</th>
                            <th>Discriminação para Financiamento</th>
                            <th style="text-align: right;">Valor (R$)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td style="text-align: center;" contenteditable="true">01</td><td style="text-align: center;" contenteditable="true">UN</td><td contenteditable="true"><b>Equipamentos:</b> Fornecimento de Gerador Fotovoltaico Belenus</td><td style="text-align: right;" contenteditable="true">${fin.valorKit.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td></tr>
                        <tr><td style="text-align: center;" contenteditable="true">01</td><td style="text-align: center;" contenteditable="true">GL</td><td contenteditable="true"><b>Serviços:</b> Engenharia, Instalação e Parecer de Acesso</td><td style="text-align: right;" contenteditable="true">${fin.precoVendaServico.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td></tr>
                        <tr style="background: var(--bg-accent); font-weight: 700; color: var(--gold);">
                            <td colspan="3" style="text-align: right; text-transform: uppercase; font-size: 8pt;" contenteditable="true">Valor Global da Proposta</td>
                            <td style="text-align: right;" contenteditable="true">${formatarMoeda(fin.valorTotal)}</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <section>
                <div class="section-header">
                    <div class="section-number">02</div>
                    <h2 class="section-title">Especificações Técnicas do Sistema</h2>
                </div>
                <div class="tech-summary">
                    <div class="tech-card"><label>Potência DC</label><span contenteditable="true">${potKwp}</span></div>
                    <div class="tech-card"><label>Produtividade</label><span contenteditable="true">${geracao}</span></div>
                    <div class="tech-card"><label>Instalação</label><span contenteditable="true">Telhado</span></div>
                    <div class="tech-card"><label>Área Útil</label><span contenteditable="true">~ ${areaUtil} m²</span></div>
                </div>
                <div class="generator-title-box">
                    <span class="generator-name" contenteditable="true">SISTEMA GERADOR FOTOVOLTAICO BELENUS - ${potKwp} (ITEM ÚNICO)</span>
                </div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 80px; text-align: center;">Qtd</th>
                            <th>Componente Integrante do Gerador</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${componentesHtml}
                    </tbody>
                </table>
            </section>

            <section>
                <div class="section-header">
                    <div class="section-number">03</div>
                    <h2 class="section-title">Estrutura de Investimento (Capex)</h2>
                </div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 50px; text-align: center;">Qtd</th>
                            <th style="width: 50px; text-align: center;">Und</th>
                            <th>Discriminação para Financiamento</th>
                            <th style="text-align: right;">Valor (R$)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td style="text-align: center;" contenteditable="true">01</td><td style="text-align: center;" contenteditable="true">UN</td><td contenteditable="true"><b>Equipamentos:</b> Fornecimento de Gerador Fotovoltaico Belenus</td><td style="text-align: right;" contenteditable="true">${fin.valorKit.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td></tr>
                        <tr><td style="text-align: center;" contenteditable="true">01</td><td style="text-align: center;" contenteditable="true">GL</td><td contenteditable="true"><b>Serviços:</b> Engenharia, Instalação e Parecer de Acesso</td><td style="text-align: right;" contenteditable="true">${fin.precoVendaServico.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td></tr>
                        <tr style="background: var(--bg-accent); font-weight: 700; color: var(--gold);">
                            <td colspan="3" style="text-align: right; text-transform: uppercase; font-size: 8pt;" contenteditable="true">Valor Global da Proposta</td>
                            <td style="text-align: right;" contenteditable="true">${formatarMoeda(fin.valorTotal)}</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <section>
                <div class="section-header">
                    <div class="section-number">04</div>
                    <h2 class="section-title">Cronograma de Execução e Estimativas</h2>
                </div>
                <div class="timeline">
                    <div class="timeline-item">
                        <div class="timeline-title" contenteditable="true">01. Aprovação Financeira</div>
                        <div class="timeline-desc" contenteditable="true">Início do fluxo após a aprovação do crédito e autorização formal junto à instituição financeira.</div>
                    </div>
                    <div class="timeline-item">
                        <div class="timeline-title" contenteditable="true">02. Engenharia e Projeto</div>
                        <div class="timeline-desc" contenteditable="true">Elaboração técnica do projeto executivo e diagramas para submissão à concessionária.</div>
                        <div class="timeline-days" contenteditable="true">Prazo: ~ 05 dias úteis</div>
                    </div>
                    <div class="timeline-item">
                        <div class="timeline-title" contenteditable="true">03. Parecer de Acesso (Equatorial)</div>
                        <div class="timeline-desc" contenteditable="true">Protocolo e análise técnica da concessionária para emissão do parecer autorizativo de conexão.</div>
                        <div class="timeline-days" contenteditable="true">Prazo: Até 15 dias úteis</div>
                    </div>
                    <div class="timeline-item">
                        <div class="timeline-title" contenteditable="true">04. Faturamento e Logística</div>
                        <div class="timeline-desc" contenteditable="true">Conferência, faturamento pelo distribuidor e transporte dos equipamentos até o local da obra.</div>
                        <div class="timeline-days" contenteditable="true">Prazo: ~ 28 dias úteis (Faturamento + Logística)</div>
                    </div>
                    <div class="timeline-item">
                        <div class="timeline-title" contenteditable="true">05. Instalação e Vistoria</div>
                        <div class="timeline-desc" contenteditable="true">Montagem física do sistema, solicitação de vistoria e substituição do medidor pela concessionária.</div>
                        <div class="timeline-days" contenteditable="true">Prazo: Até 22 dias úteis (Instalação + Homologação Final)</div>
                    </div>
                </div>
            </section>
        </div>
        <footer>
            <div contenteditable="true">Jean Marcel • Engenharia Fotovoltaica</div>
            <div contenteditable="true">Página 03 de 04</div>
        </footer>
    </div>

    <div class="page">
        ${headerTemplate}
        <div class="content">
            <section>
                <div class="section-header">
                    <div class="section-number">05</div>
                    <h2 class="section-title">Formalização e Aceite</h2>
                </div>
                <div class="validity-box">
                    <p contenteditable="true"><strong>Aceite dos Termos:</strong> O proponente declara ciência de que esta proposta integra o dossiê de financiamento. Os prazos de homologação são dependentes dos ritos regulamentares da concessionária local. Início da obra condicionado à liberação do crédito.</p>
                    <p style="margin-top: 3mm;" contenteditable="true"><strong>Validade da Proposta:</strong> 05 dias úteis ou enquanto durarem os estoques. Preços e prazos sujeitos a variações sem aviso prévio decorrentes de alterações tributárias, custos logísticos de frete ou oscilações no custo de combustíveis e insumos de mercado.</p>
                </div>

                <div class="sig-grid" style="margin-top: 10mm;">
                    <div class="sig-box">
                        <div class="sig-line"></div>
                        <span contenteditable="true">Beneficiário (Contratante)</span>
                        <p contenteditable="true">${cliente.nome.toUpperCase()}</p>
                    </div>
                    <div class="sig-box">
                        <div class="sig-line"></div>
                        <span contenteditable="true">Responsável Técnico / Engenharia</span>
                        <p contenteditable="true">JEAN MARCEL VIEIRA SILVA</p>
                    </div>
                </div>
            </section>
        </div>
        <footer>
            <div contenteditable="true">Documento gerado em ${new Date().toLocaleDateString()}</div>
            <div contenteditable="true">Página 04 de 04</div>
        </footer>
    </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(htmlFinal);
    win.document.close();
};