// js/authController.js

document.getElementById('form-login-restrito').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const user = document.getElementById('usuario_admin').value;
    const pass = document.getElementById('senha_admin').value;
    const feedback = document.getElementById('login-feedback');
    const btn = document.getElementById('btn-entrar');

    // Validação Simples (Temporária para teste imediato)
    // Futuramente, isso será substituído por: await post('/api/auth/login', { user, pass })
    if (true) { // Bypass ativado para fase de desenvolvimento
        feedback.innerText = "Modo Dev: Acesso autorizado!";
        feedback.classList.add('show', 'success-msg');
        btn.disabled = true;
        
        // Criamos o "crachá" de acesso na sessão do navegador
        sessionStorage.setItem('auth_belenergy', 'logado_com_sucesso');
        
        setTimeout(() => {
            window.location.href = 'dashboard-admin.html';
        }, 1000);
    } else {
        feedback.innerText = "Credenciais inválidas.";
        feedback.classList.add('show', 'error-msg');
    }
});