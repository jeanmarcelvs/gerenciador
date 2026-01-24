const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function fluxoJeanMarcelDefinitivo(potenciaMinimaKwp) {
    console.log("🚀 Iniciando Fluxo Jean Marcel - PERFIL EXCLUSIVO DO ROBÔ...");

    // Mudamos o final para 'User Data Robo' para evitar o erro de 'Already Running'
    const caminhoPerfilRobo = 'C:\\Users\\jeanm\\AppData\\Local\\Google\\Chrome\\User Data Robo';

    const browser = await puppeteer.launch({ 
        headless: false, 
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        userDataDir: caminhoPerfilRobo, 
        args: ['--start-maximized'] 
    });
    
    const [page] = await browser.pages();
    await page.setDefaultNavigationTimeout(60000); 

    try {
        // --- 1️⃣ PASSO: PÁGINA INICIAL ---
        console.log("1️⃣ Acessando a Home Page...");
        await page.goto("https://belenus.com.br/", { waitUntil: "domcontentloaded" });
        
        // Verifica se precisa logar
        const precisaLogar = await page.evaluate(() => {
            return document.body.innerText.includes('Entre') && !document.body.innerText.includes('Minha Conta');
        });

        if (precisaLogar) {
            console.log("🔐 Login necessário. Por favor, faça o login manualmente se for a primeira vez.");
            // --- 2️⃣ PASSO: ABRIR MODAL ---
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('a, span, button')).find(el => el.innerText.trim() === 'Entre');
                if (btn) btn.click();
            });

            // --- 3️⃣ PASSO: LOGIN (O Robô tenta, mas você pode ajudar na primeira vez) ---
            await page.waitForSelector('#signinModal-email', { visible: true, timeout: 10000 }).catch(() => {});
            const campoEmail = await page.$('#signinModal-email');
            if (campoEmail) {
                await page.type('#signinModal-email', "camila.arqeng@outlook.com", { delay: 50 });
                await page.type('input[type="password"]', "18192320Jm$", { delay: 50 });
                await page.evaluate(() => {
                    const b = Array.from(document.querySelectorAll('button')).find(el => el.innerText.includes('Entrar'));
                    if (b) b.click();
                });
            }
        } else {
            console.log("✅ Já logado com o perfil Jean Marcel.");
        }

        // --- 4️⃣ PASSO: NAVEGAÇÃO PARA MÓDULOS ---
        console.log("4️⃣ Indo para página de Módulos...");
        await page.goto("https://belenus.com.br/energy/modulo", { waitUntil: "networkidle2" });
        
        // --- 5️⃣ PASSO: POTÊNCIA ---
        console.log(`5️⃣ Inserindo potência: ${potenciaMinimaKwp}`);
        await page.waitForSelector('#inputPotencia', { visible: true });
        await page.click('#inputPotencia', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type('#inputPotencia', potenciaMinimaKwp.toString());
        await page.keyboard.press('Enter');

        console.log("⏳ Aguardando tabela (8s)...");
        await new Promise(r => setTimeout(r, 8000));

        // --- 6️⃣ PASSO: SELEÇÃO DO MÓDULO ---
        await page.evaluate((min) => {
            const rows = Array.from(document.querySelectorAll('tr.ng-star-inserted'));
            let melhorIdx = -1; let menorD = Infinity;
            rows.forEach((row, i) => {
                const cel = row.querySelector('.potencia-sistema');
                if (cel) {
                    const v = parseFloat(cel.innerText.replace(',', '.'));
                    if (v >= min && (v - min) < menorD) { menorD = v - min; melhorIdx = i; }
                }
            });
            const radios = document.querySelectorAll('input.modulo-radio');
            if (radios[melhorIdx]) radios[melhorIdx].click();
        }, potenciaMinimaKwp);

        await new Promise(r => setTimeout(r, 2000));

        // --- 7️⃣ PASSO: AVANÇAR (FORÇA BRUTA) ---
        console.log("7️⃣ Forçando avanço para Inversores...");
        await page.evaluate(() => {
            const btn = document.querySelector('button.btn-primary.btn-block');
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('disabled');
                btn.click();
            }
        });

        await new Promise(r => setTimeout(r, 5000));
        
        if (page.url().includes('inversor')) {
            console.log("🏁 SUCESSO! Chegamos na tela de Inversores.");
            // Aqui entraremos com a extração de preços na próxima etapa
        }

    } catch (err) {
        console.error("❌ Erro:", err.message);
    }
}

fluxoJeanMarcelDefinitivo(4.25);