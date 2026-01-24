/**
 * worker.js - VERSÃO INTEGRAL (SCRAPER + ERP COMPLETO + SEGURANÇA)
 * Mantém 100% da lógica original expandida para evitar conflitos.
 * Engenheiro: Jean Marcel
 */

import puppeteer from "@cloudflare/puppeteer";

export default {
    async fetch(request, env) {
        // ==========================================================
        // 0. CONFIGURAÇÃO CORS
        // ==========================================================
        const ALLOWED_ORIGINS = ["https://propostasgdis.pages.dev", "http://127.0.0.1:5500", "http://localhost:5500", "*"];
        const origin = request.headers.get("Origin") || "";
        const corsHeaders = {
            "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Max-Age": "86400",
            "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "Content-Type, Authorization",
        };

        const jsonResponse = (obj, status = 200) =>
            new Response(JSON.stringify(obj), {
                status,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });

        if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // ==========================================================
        // 1. ROTA: SCRAPER BELENUS (Novo Recurso)
        // ==========================================================
        if (path === "/scraper/paineis") {
            let browser;
            let page;
            try {
                browser = await puppeteer.launch(env.MYBROWSER);
                page = await browser.newPage();
                await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                await page.setDefaultNavigationTimeout(60000);
                await page.goto("https://belenus.com.br/", { waitUntil: "networkidle2" });

                try {
                    const cookieBtn = await page.waitForSelector('.aceitar-cookie-botao', { timeout: 3000 });
                    if (cookieBtn) await cookieBtn.click();
                } catch (e) { }

                await page.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('a, span, button')).find(el => el.innerText.includes('Entre'));
                    if (btn) btn.click();
                });

                await page.waitForSelector('#signinModal-email', { timeout: 15000 });
                await page.type('#signinModal-email', "camila.arqeng@outlook.com", { delay: 50 });
                await page.type('input[type="password"]', "18192320Jm$", { delay: 50 });

                await Promise.all([
                    page.click('button.login-session__button'),
                    page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => { })
                ]);

                await page.waitForSelector('.user-logged__info-text strong', { visible: true, timeout: 20000 });
                await new Promise(r => setTimeout(r, 2000));
                await page.goto("https://belenus.com.br/produtos/3/energia%20solar/painel%20fotovoltaico", { waitUntil: "networkidle2" });
                await page.waitForSelector('app-showcase-item', { timeout: 30000 });

                const dadosPaineis = await page.evaluate(() => {
                    const items = document.querySelectorAll('app-showcase-item');
                    return Array.from(items).map(item => {
                        const descricao = item.querySelector('.showcase-item__options-productName p')?.innerText.trim() || "";
                        const precoEl = item.querySelector('.showcase-item__name strong') || item.querySelector('.showcase-item__price');
                        const codigoRaw = item.querySelector('.showcase-item__code')?.innerText.trim() || "";
                        const matchPotencia = descricao.match(/(\d{3,4})\s*W/i);
                        return {
                            descricao,
                            potencia: matchPotencia ? parseInt(matchPotencia[1]) : null,
                            preco: precoEl ? precoEl.innerText.trim() : "Sob consulta",
                            codigo: codigoRaw.replace('Cód: ', '').trim(),
                            dataExtracao: new Date().toISOString()
                        };
                    }).filter(p => p.potencia !== null && p.codigo !== "");
                });

                await browser.close();
                return jsonResponse({ sucesso: true, total: dadosPaineis.length, dados: dadosPaineis });
            } catch (e) {
                if (browser) await browser.close();
                return jsonResponse({ erro: "Falha na extração", mensagem: e.message }, 500);
            }
        }

        // ==========================================================
        // 2. ROTA: TAXA SELIC
        // ==========================================================
        if (path === "/selic" || path === "/solarmarket/selic") {
            try {
                const bcbResponse = await fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/ultimos/1?formato=json");
                if (bcbResponse.ok) return jsonResponse(await bcbResponse.json());
            } catch (e) { }
            return jsonResponse([{ data: new Date().toLocaleDateString('pt-BR'), valor: "11.75" }]);
        }

        // ==========================================================
        // 3. ROTAS DO ERP (Onde estavam os problemas de edição/acesso)
        // ==========================================================
        if (path.startsWith("/erp/")) {
            const apiPath = path.replace("/erp/", "");
            const parts = apiPath.split("/").filter(p => p);
            const resource = parts[0];
            const id = parts[1];
            const action = parts[2];

            try {
                // --- SUB-ROTA CONFIGURAÇÕES ---
                if (resource === 'configuracoes') {
                    if (method === 'GET') {
                        // Aceita 'id' ou 'chave' para compatibilidade
                        const res = await env.DB.prepare("SELECT dados FROM configuracoes WHERE chave = ?").bind(id).first();
                        if (res) return jsonResponse(JSON.parse(res.dados));
                        if (id === 'premissas_globais') return jsonResponse({ fator_lucro_mo: 1.1, prazo_entrega_padrao: 15, validade_proposta: 7 });
                        return jsonResponse({});
                    }
                    if (method === 'POST' || method === 'PUT') {
                        const body = await request.json();
                        const chave = body.chave || id;
                        await env.DB.prepare("INSERT INTO configuracoes (chave, dados) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET dados = excluded.dados")
                            .bind(chave, JSON.stringify(body.dados || body)).run();
                        return jsonResponse({ success: true });
                    }
                }

                // --- CLIENTES ---
                if (resource === 'clientes') {
                    if (method === 'GET') {
                        if (id) {
                            const res = await env.DB.prepare("SELECT dados FROM clientes WHERE id = ?").bind(id).first();
                            return res ? jsonResponse(JSON.parse(res.dados)) : jsonResponse({ error: "Cliente não encontrado" }, 404);
                        }
                        const { results } = await env.DB.prepare("SELECT dados FROM clientes ORDER BY data_criacao DESC").all();
                        return jsonResponse(results.map(r => JSON.parse(r.dados)));
                    }
                    if (method === 'POST') {
                        const body = await request.json();
                        await env.DB.prepare("INSERT INTO clientes (id, nome, dados, data_criacao) VALUES (?, ?, ?, ?)").bind(body.id, body.nome, JSON.stringify(body), body.dataCriacao).run();
                        return jsonResponse({ success: true });
                    }
                    if (method === 'PATCH' && id) {
                        const body = await request.json();
                        const current = await env.DB.prepare("SELECT dados FROM clientes WHERE id = ?").bind(id).first();
                        if (!current) return jsonResponse({ error: "Cliente não encontrado" }, 404);
                        const newData = { ...JSON.parse(current.dados), ...body };
                        await env.DB.prepare("UPDATE clientes SET dados = ? WHERE id = ?").bind(JSON.stringify(newData), id).run();
                        return jsonResponse({ success: true });
                    }
                    if (method === 'DELETE' && id) {
                        await env.DB.prepare("DELETE FROM clientes WHERE id = ?").bind(id).run();
                        return jsonResponse({ success: true });
                    }
                }

                // --- PROJETOS ---
                if (resource === 'projetos') {
                    if (method === 'GET') {
                        if (id) {
                            const res = await env.DB.prepare("SELECT dados FROM projetos WHERE id = ?").bind(id).first();
                            return res ? jsonResponse(JSON.parse(res.dados)) : jsonResponse({ error: "Projeto não encontrado" }, 404);
                        }
                        const { results } = await env.DB.prepare("SELECT dados FROM projetos ORDER BY data_criacao DESC").all();
                        return jsonResponse(results.map(r => JSON.parse(r.dados)));
                    }
                    if (method === 'POST') {
                        const body = await request.json();
                        await env.DB.prepare("INSERT INTO projetos (id, cliente_id, nome_projeto, status, dados, data_criacao) VALUES (?, ?, ?, ?, ?, ?)")
                            .bind(body.id, body.clienteId || body.cliente_id, body.nome_projeto || body.nome, body.status || 'EM_COTACAO', JSON.stringify(body), body.dataCriacao).run();
                        return jsonResponse({ success: true });
                    }
                    if (method === 'PATCH' && id) {
                        const body = await request.json();
                        const current = await env.DB.prepare("SELECT dados, status, nome_projeto FROM projetos WHERE id = ?").bind(id).first();
                        if (!current) return jsonResponse({ error: "Projeto não encontrado" }, 404);
                        const currentData = JSON.parse(current.dados);
                        const newData = { ...currentData, ...body };
                        
                        const statusFinal = newData.status ?? currentData.status ?? current.status ?? 'EM_COTACAO';
                        const nomeFinal = newData.nome_projeto ?? currentData.nome_projeto ?? current.nome_projeto ?? 'Projeto Sem Nome';

                        await env.DB.prepare("UPDATE projetos SET dados = ?, status = ?, nome_projeto = ? WHERE id = ?")
                            .bind(JSON.stringify(newData), statusFinal, nomeFinal, id).run();
                        return jsonResponse({ success: true });
                    }

                    // CORREÇÃO: Rota DELETE para projetos (estava faltando)
                    if (method === 'DELETE' && id) {
                        await env.DB.prepare("DELETE FROM projetos WHERE id = ?").bind(id).run();
                        return jsonResponse({ success: true });
                    }
                }

                // --- PROPOSTAS (AQUI ESTAVA O ERRO DE EDIÇÃO E STATUS) ---
                if (resource === 'propostas') {
                    // Caso especial: Alterar status dispositivo
                    if (id && action === 'alterar-status-dispositivo' && method === 'PATCH') {
                        const { hash, novoStatus } = await request.json();
                        const res = await env.DB.prepare("SELECT dados FROM propostas WHERE id = ?").bind(id).first();
                        if (!res) return jsonResponse({ error: "Proposta não encontrada" }, 404);
                        let dados = JSON.parse(res.dados);
                        dados.dispositivos_autorizados = (dados.dispositivos_autorizados || []).map(d => (d.hash === hash ? { ...d, status: novoStatus } : d));
                        await env.DB.prepare("UPDATE propostas SET dados = ? WHERE id = ?").bind(JSON.stringify(dados), id).run();
                        return jsonResponse({ success: true, status: novoStatus });
                    }

                    if (method === 'GET') {
                        if (id) {
                            const res = await env.DB.prepare("SELECT dados FROM propostas WHERE id = ?").bind(id).first();
                            return res ? jsonResponse(JSON.parse(res.dados)) : jsonResponse({ error: "Proposta não encontrada" }, 404);
                        }
                        const projetoId = url.searchParams.get('projetoId');
                        const query = projetoId ? "SELECT dados FROM propostas WHERE projeto_id = ? ORDER BY data_criacao DESC" : "SELECT dados FROM propostas ORDER BY data_criacao DESC";
                        const { results } = projetoId ? await env.DB.prepare(query).bind(projetoId).all() : await env.DB.prepare(query).all();
                        return jsonResponse(results.map(r => JSON.parse(r.dados)));
                    }

                    if (method === 'POST') {
                        const body = await request.json();
                        await env.DB.prepare("INSERT INTO propostas (id, projeto_id, cliente_id, status, dados, data_criacao) VALUES (?, ?, ?, ?, ?, ?)")
                            .bind(body.id, body.projetoId, body.clienteId, body.status || 'EM_ABERTO', JSON.stringify(body), body.dataCriacao).run();
                        return jsonResponse({ success: true });
                    }

                    if (method === 'PATCH' && id) {
                        const body = await request.json();
                        const current = await env.DB.prepare("SELECT dados, status FROM propostas WHERE id = ?").bind(id).first();
                        if (!current) return jsonResponse({ error: "Proposta não encontrada" }, 404);
                        const currentData = JSON.parse(current.dados);
                        const newData = { ...currentData, ...body };
                        
                        const statusFinal = newData.status ?? currentData.status ?? current.status ?? 'EM_ABERTO';

                        await env.DB.prepare("UPDATE propostas SET dados = ?, status = ? WHERE id = ?")
                            .bind(JSON.stringify(newData), statusFinal, id).run();
                        return jsonResponse({ success: true });
                    }

                    if (method === 'DELETE' && id) {
                        await env.DB.prepare("DELETE FROM propostas WHERE id = ?").bind(id).run();
                        return jsonResponse({ success: true });
                    }
                }

                return jsonResponse({ erro: "Recurso não encontrado" }, 404);
            } catch (err) { return jsonResponse({ error: "Erro no Worker D1", details: err.message }, 500); }
        }

        // ==========================================================
        // 4. SEGURANÇA: BUSCA DE PROPOSTA (ESSENCIAL PARA O LINK DIRETO)
        // ==========================================================
        if (path === "/security/find-proposta" && method === "POST") {
            try {
                const body = await request.json().catch(() => ({}));
                const { propostaId } = body;
                if (!propostaId) return jsonResponse({ erro: "ID necessário" }, 400);
                const propDoc = await env.DB.prepare("SELECT dados FROM propostas WHERE id LIKE ?").bind(`${propostaId}%`).first();
                return propDoc ? jsonResponse({ sucesso: true, dadosProposta: JSON.parse(propDoc.dados) }) : jsonResponse({ erro: "Proposta não encontrada" }, 404);
            } catch (err) { return jsonResponse({ error: "Erro busca", details: err.message }, 500); }
        }

        // ==========================================================
        // 5. SEGURANÇA: VALIDAÇÃO DE HARDWARE
        // ==========================================================
        if (path === "/security/validate-hardware" && method === "POST") {
            try {
                const body = await request.json().catch(() => ({}));
                const idAlvo = body.propostaId || body.projectId;
                const { dispositivoNome, os, navegador, tipoDispositivo } = body;
                if (!idAlvo) return jsonResponse({ erro: "ID necessário" }, 400);

                const encoder = new TextEncoder();
                const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(`${os}-${navegador}-${tipoDispositivo}-${dispositivoNome}`));
                const fingerprint = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

                const propDoc = await env.DB.prepare("SELECT dados FROM propostas WHERE id LIKE ?").bind(`${idAlvo}%`).first();
                if (!propDoc) return jsonResponse({ erro: "Proposta não encontrada" }, 404);

                let dadosProp = JSON.parse(propDoc.dados);
                if (!dadosProp.dispositivos_autorizados) dadosProp.dispositivos_autorizados = [];
                const existente = dadosProp.dispositivos_autorizados.find(d => d.hash === fingerprint);

                if (existente) return jsonResponse({ sucesso: existente.status === "dono", status: existente.status });

                const novoStatus = dadosProp.dispositivos_autorizados.some(d => d.status === "dono") ? "pendente" : "dono";
                dadosProp.dispositivos_autorizados.push({
                    hash: fingerprint,
                    dispositivo: dispositivoNome,
                    status: novoStatus,
                    local: request.cf ? `${request.cf.city}, ${request.cf.region}` : 'Desconhecido',
                    data: new Date().toISOString()
                });

                await env.DB.prepare("UPDATE propostas SET dados = ? WHERE id = ?").bind(JSON.stringify(dadosProp), dadosProp.id).run();
                return jsonResponse({ sucesso: novoStatus === "dono", status: novoStatus });
            } catch (err) { return jsonResponse({ error: "Erro hardware", details: err.message }, 500); }
        }

        return jsonResponse({ erro: "Endpoint não encontrado" }, 404);
    },
};