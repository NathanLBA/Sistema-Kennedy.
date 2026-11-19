/**
 * Sistema de Avaliação - Escola Kennedy
 * Com autenticação (login/cadastro) e armazenamento em localStorage
 */

// ========================================
// ESTADO GLOBAL
// ========================================
const State = {
    // Auth
    usuarioAtual: null,
    usuarios: [],
    
    // Dados do sistema
    professores: [],
    turmas: [],
    alunos: [],
    notas: [],
    
    // UI state
    editId: null,
    deleteCallback: null,
    currentAlunoTurmaId: null
};

// ========================================
// BANCO DE DADOS (localStorage)
// ========================================
// Todos os dados ficam em UMA única chave, com versão, validação e
// migração automática do formato antigo (várias chaves separadas).
const Storage = {
    // Chaves antigas (usadas apenas para migração)
    keys: {
        usuarios: 'kennedy_usuarios',
        professores: 'kennedy_professores',
        turmas: 'kennedy_turmas',
        alunos: 'kennedy_alunos',
        notas: 'kennedy_notas',
        session: 'kennedy_session'
    },

    dbKey: 'kennedy_db',
    version: 2,

    // ---------- leitura / escrita seguras ----------
    readRaw(key) {
        try {
            return localStorage.getItem(key);
        } catch (err) {
            console.error('localStorage indisponível:', err);
            return null;
        }
    },

    parseRaw(raw, fallback = null) {
        if (!raw) return fallback;
        try {
            return JSON.parse(raw);
        } catch (err) {
            return fallback;
        }
    },

    write(db) {
        try {
            localStorage.setItem(this.dbKey, JSON.stringify(db));
            return true;
        } catch (err) {
            console.error('Falha ao gravar no banco:', err);
            UI.toast('Não foi possível salvar os dados. Verifique o espaço livre do navegador.', 'error');
            return false;
        }
    },

    // Guarda uma cópia dos dados corrompidos para não perder nada
    quarantine(raw) {
        try {
            localStorage.setItem(`kennedy_db_corrupted_${Date.now()}`, raw);
        } catch (err) {
            console.error('Não foi possível guardar a cópia corrompida:', err);
        }
    },

    emptyDb() {
        return {
            version: this.version,
            usuarios: [],
            professores: [],
            turmas: [],
            alunos: [],
            notas: [],
            session: null
        };
    },

    readLegacy() {
        const usuarios = this.parseRaw(this.readRaw(this.keys.usuarios));
        const professores = this.parseRaw(this.readRaw(this.keys.professores));
        const turmas = this.parseRaw(this.readRaw(this.keys.turmas));
        const alunos = this.parseRaw(this.readRaw(this.keys.alunos));
        const notas = this.parseRaw(this.readRaw(this.keys.notas));
        const session = this.parseRaw(this.readRaw(this.keys.session));

        const nenhumDado = !usuarios && !professores && !turmas && !alunos && !notas;
        if (nenhumDado) return null;

        return {
            version: 1,
            usuarios: usuarios || [],
            professores: professores || [],
            turmas: turmas || [],
            alunos: alunos || [],
            notas: notas || [],
            session
        };
    },

    // ---------- validação / normalização ----------
    normalize(db) {
        const lista = (valor) => (Array.isArray(valor) ? valor : []);

        const normalized = {
            version: this.version,
            usuarios: lista(db.usuarios).filter(u => u && u.id && u.email),
            professores: lista(db.professores).filter(p => p && p.id),
            turmas: lista(db.turmas).filter(t => t && t.id),
            alunos: lista(db.alunos).filter(a => a && a.id),
            notas: lista(db.notas)
                .filter(n => n && n.id && n.alunoId)
                .map(n => ({
                    ...n,
                    valor: Number(n.valor),
                    bimestre: Number(n.bimestre)
                }))
                .filter(n => Number.isFinite(n.valor)),
            session: db.session && db.session.usuarioId ? { usuarioId: db.session.usuarioId } : null
        };

        return normalized;
    },

    apply(db) {
        State.usuarios = db.usuarios;
        State.professores = db.professores;
        State.turmas = db.turmas;
        State.alunos = db.alunos;
        State.notas = db.notas;

        State.usuarioAtual = null;
        if (db.session && db.session.usuarioId) {
            const usuario = State.usuarios.find(u => u.id === db.session.usuarioId);
            if (usuario) State.usuarioAtual = usuario;
        }
    },

    // ---------- API usada pelo sistema ----------
    load() {
        const raw = this.readRaw(this.dbKey);
        let db = null;
        let corrompido = false;

        if (raw) {
            db = this.parseRaw(raw);
            if (!db || typeof db !== 'object' || !Array.isArray(db.usuarios)) {
                this.quarantine(raw);
                db = null;
                corrompido = true;
            }
        }

        // Migra automaticamente do formato antigo, se existir
        if (!db) db = this.readLegacy();
        if (!db) db = this.emptyDb();

        db = this.normalize(db);
        this.apply(db);

        // Regrava já normalizado (conclui a migração e descarta lixo)
        this.write(this.serialize());

        if (corrompido) {
            UI.toast('Os dados locais estavam corrompidos. Uma cópia foi guardada e o sistema foi recuperado.', 'error');
        }
    },

    serialize() {
        return {
            version: this.version,
            usuarios: State.usuarios,
            professores: State.professores,
            turmas: State.turmas,
            alunos: State.alunos,
            notas: State.notas,
            session: State.usuarioAtual ? { usuarioId: State.usuarioAtual.id } : null
        };
    },

    save() {
        return this.write(this.serialize());
    },

    saveSession() {
        return this.save();
    },

    replace(data) {
        if (!data || typeof data !== 'object' || !Array.isArray(data.usuarios)) {
            throw new Error('Arquivo de backup inválido');
        }
        const db = this.normalize(data);
        this.apply(db);
        return this.write(this.serialize());
    },

    exportJSON() {
        return JSON.stringify(this.serialize(), null, 2);
    },

    clear() {
        Object.values(this.keys).forEach(key => {
            try { localStorage.removeItem(key); } catch (err) { /* ignora */ }
        });
        try {
            localStorage.removeItem(this.dbKey);
        } catch (err) { /* ignora */ }

        State.usuarios = [];
        State.professores = [];
        State.turmas = [];
        State.alunos = [];
        State.notas = [];
        State.usuarioAtual = null;
    }
};

// ========================================
// UTILITÁRIOS DE UI
// ========================================
const UI = {
    toast(message, type = 'info') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 3500);
    },

    showModal(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
    },

    hideModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
    },

    confirmDelete(message, callback) {
        document.getElementById('modal-message').textContent =
            message || 'Tem certeza que deseja excluir este item?';
        State.deleteCallback = callback;
        this.showModal('modal-confirm');
    },

    setActiveTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `tab-${tabName}`);
        });
    },

    populateSelect(selectId, options, valueKey = 'id', labelKey = 'nome', placeholder = 'Selecione') {
        const select = document.getElementById(selectId);
        const currentValue = select.value;
        select.innerHTML = `<option value="">${placeholder}</option>`;
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt[valueKey];
            option.textContent = opt[labelKey];
            select.appendChild(option);
        });
        select.value = currentValue;
    },

    showAuthError(message) {
        const el = document.getElementById('auth-error');
        el.textContent = message;
        el.classList.remove('hidden');
        document.getElementById('auth-success').classList.add('hidden');
    },

    showAuthSuccess(message) {
        const el = document.getElementById('auth-success');
        el.textContent = message;
        el.classList.remove('hidden');
        document.getElementById('auth-error').classList.add('hidden');
    },

    clearAuthMessages() {
        document.getElementById('auth-error').classList.add('hidden');
        document.getElementById('auth-success').classList.add('hidden');
    },

    switchAuthTab(tabName) {
        document.querySelectorAll('.auth-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.authTab === tabName);
        });
        document.querySelectorAll('.auth-form').forEach(form => {
            form.classList.toggle('active', form.id === `form-${tabName}`);
        });
        this.clearAuthMessages();
    },

    showApp() {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        document.getElementById('user-display').textContent = State.usuarioAtual?.nome || '';
    },

    showAuth() {
        document.getElementById('app-screen').classList.add('hidden');
        document.getElementById('auth-screen').classList.remove('hidden');
    }
};

// ========================================
// ID GENERATOR
// ========================================
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ========================================
// HASH DE SENHA (simples - para demo)
// ========================================
function hashSenha(senha) {
    // Em produção, use bcrypt ou similar no backend
    // Aqui usamos um hash simples para demonstração
    let hash = 0;
    for (let i = 0; i < senha.length; i++) {
        const char = senha.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return 'knd_' + Math.abs(hash).toString(36) + senha.length.toString(36);
}

// ========================================
// AUTENTICAÇÃO
// ========================================
const Auth = {
    init() {
        this.bindEvents();
        this.checkSession();
    },

    bindEvents() {
        // Abas login/cadastro
        document.querySelectorAll('.auth-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => UI.switchAuthTab(btn.dataset.authTab));
        });

        // Botões de troca no rodapé dos formulários
        document.querySelectorAll('.link-btn[data-switch]').forEach(btn => {
            btn.addEventListener('click', () => UI.switchAuthTab(btn.dataset.switch));
        });

        // Formulário de login
        document.getElementById('form-login').addEventListener('submit', (e) => this.login(e));

        // Formulário de cadastro
        document.getElementById('form-register').addEventListener('submit', (e) => this.register(e));

        // Botão sair
        document.getElementById('btn-sair').addEventListener('click', () => this.logout());
    },

    checkSession() {
        if (State.usuarioAtual) {
            UI.showApp();
            App.init();
        } else {
            UI.showAuth();
        }
    },

    login(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim().toLowerCase();
        const senha = document.getElementById('login-senha').value;

        if (!email || !senha) {
            UI.showAuthError('Preencha todos os campos');
            return;
        }

        const usuario = State.usuarios.find(u => (u.email || '').toLowerCase() === email);
        if (!usuario) {
            UI.showAuthError('E-mail não cadastrado');
            return;
        }

        if (usuario.senha !== hashSenha(senha)) {
            UI.showAuthError('Senha incorreta');
            return;
        }

        State.usuarioAtual = usuario;
        Storage.saveSession();
        UI.showAuthSuccess('Login realizado com sucesso!');
        
        setTimeout(() => {
            UI.showApp();
            App.init();
        }, 500);
    },

    register(e) {
        e.preventDefault();
        const nome = document.getElementById('register-nome').value.trim();
        const email = document.getElementById('register-email').value.trim().toLowerCase();
        const senha = document.getElementById('register-senha').value;
        const confirmar = document.getElementById('register-confirmar').value;

        if (!nome || !email || !senha || !confirmar) {
            UI.showAuthError('Preencha todos os campos');
            return;
        }

        if (senha.length < 6) {
            UI.showAuthError('A senha deve ter pelo menos 6 caracteres');
            return;
        }

        if (senha !== confirmar) {
            UI.showAuthError('As senhas não coincidem');
            return;
        }

        if (State.usuarios.some(u => u.email === email)) {
            UI.showAuthError('Este e-mail já está cadastrado');
            return;
        }

        const usuario = {
            id: generateId(),
            nome,
            email,
            senha: hashSenha(senha),
            dataCriacao: new Date().toISOString()
        };

        State.usuarios.push(usuario);
        Storage.save();

        State.usuarioAtual = usuario;
        Storage.saveSession();
        
        UI.showAuthSuccess('Conta criada com sucesso!');
        
        setTimeout(() => {
            UI.showApp();
            App.init();
        }, 500);
    },

    logout() {
        State.usuarioAtual = null;
        Storage.saveSession();
        UI.showAuth();
        
        // Reset forms
        document.getElementById('form-login').reset();
        document.getElementById('form-register').reset();
        UI.switchAuthTab('login');
        
        UI.toast('Você saiu do sistema', 'info');
    }
};

// ========================================
// APP PRINCIPAL (após login)
// ========================================
const App = {
    init() {
        // Inicializa todos os módulos (cada um protege contra bind duplicado)
        Professores.init();
        Turmas.init();
        Notas.init();
        Relatorios.init();
        this.bindGlobalEvents();
        this.refreshData();
    },

    // Reconstrói filtros e listas depois de qualquer alteração nos dados
    refreshData() {
        Notas.renderFiltros();
        Relatorios.renderFiltros();
        Relatorios.renderAlunosFilter();
        Professores.render();
        Turmas.render();
        Notas.render();
        Relatorios.render();
    },

    bindGlobalEvents() {
        if (this._bound) return;
        this._bound = true;

        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => UI.setActiveTab(btn.dataset.tab));
        });

        // Modal confirmação
        document.getElementById('modal-confirm-btn').addEventListener('click', () => {
            if (State.deleteCallback) {
                State.deleteCallback();
                State.deleteCallback = null;
            }
            UI.hideModal('modal-confirm');
        });

        document.getElementById('modal-cancel-btn').addEventListener('click', () => {
            State.deleteCallback = null;
            UI.hideModal('modal-confirm');
        });

        document.getElementById('modal-confirm').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                State.deleteCallback = null;
                UI.hideModal('modal-confirm');
            }
        });

        document.getElementById('modal-aluno').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                UI.hideModal('modal-aluno');
            }
        });

        // Reiniciar sistema
        document.getElementById('btn-reiniciar').addEventListener('click', () => this.resetSystem());

        // Backup: exportar / importar
        document.getElementById('btn-exportar').addEventListener('click', () => this.exportBackup());
        document.getElementById('btn-importar').addEventListener('click', () => {
            document.getElementById('input-importar').click();
        });
        document.getElementById('input-importar').addEventListener('change', (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (file) this.importBackup(file);
        });
    },

    exportBackup() {
        try {
            const blob = new Blob([Storage.exportJSON()], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `kennedy-backup-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            UI.toast('Backup exportado com sucesso', 'success');
        } catch (err) {
            console.error(err);
            UI.toast('Não foi possível exportar o backup', 'error');
        }
    },

    importBackup(file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                if (!confirm('Importar este backup substituirá TODOS os dados atuais. Continuar?')) return;
                Storage.replace(data);
                Storage.save();
                this.refreshData();
                UI.toast('Backup importado com sucesso', 'success');
                if (!State.usuarioAtual) {
                    Auth.logout();
                } else {
                    Auth.checkSession();
                }
            } catch (err) {
                console.error(err);
                UI.toast('Arquivo de backup inválido', 'error');
            }
        };
        reader.readAsText(file);
    },

    resetSystem() {
        if (confirm('ATENÇÃO: Isso apagará TODOS os dados do sistema (professores, turmas, alunos, notas).\n\nSeu usuário será mantido.\n\nTem certeza?')) {
            if (confirm('Esta ação é IRREVERSÍVEL. Confirma a exclusão completa dos dados escolares?')) {
                // Mantém usuários, limpa o resto
                const usuarios = State.usuarios;
                const usuarioAtual = State.usuarioAtual;
                
                Storage.clear();
                
                State.usuarios = usuarios;
                State.usuarioAtual = usuarioAtual;
                Storage.save();
                Storage.saveSession();
                
                UI.toast('Dados do sistema apagados com sucesso', 'success');
                setTimeout(() => location.reload(), 1000);
            }
        }
    }
};

// ========================================
// PROFESSORES
// ========================================
const Professores = {
    init() {
        if (this._inited) {
            this.render();
            return;
        }
        this._inited = true;
        this.bindEvents();
        this.render();
    },

    bindEvents() {
        document.getElementById('btn-add-professor').addEventListener('click', () => this.openForm());
        document.getElementById('btn-cancelar-professor').addEventListener('click', () => this.closeForm());
        document.getElementById('form-professor').addEventListener('submit', (e) => this.save(e));
    },

    openForm(professor = null) {
        const form = document.getElementById('form-professor');
        form.reset();
        document.getElementById('professor-id').value = '';

        if (professor) {
            document.getElementById('professor-id').value = professor.id;
            document.getElementById('professor-nome').value = professor.nome;
            document.getElementById('professor-disciplina').value = professor.disciplina;
            document.getElementById('professor-email').value = professor.email;
        }

        form.classList.remove('hidden');
    },

    closeForm() {
        document.getElementById('form-professor').classList.add('hidden');
        document.getElementById('form-professor').reset();
    },

    save(e) {
        e.preventDefault();
        const id = document.getElementById('professor-id').value;
        const nome = document.getElementById('professor-nome').value.trim();
        const disciplina = document.getElementById('professor-disciplina').value.trim();
        const email = document.getElementById('professor-email').value.trim();

        if (!nome || !disciplina || !email) {
            UI.toast('Preencha todos os campos do professor', 'error');
            return;
        }

        const professor = { id: id || generateId(), nome, disciplina, email };

        if (id) {
            const idx = State.professores.findIndex(p => p.id === id);
            if (idx !== -1) State.professores[idx] = professor;
            UI.toast('Professor atualizado com sucesso', 'success');
        } else {
            State.professores.push(professor);
            UI.toast('Professor cadastrado com sucesso', 'success');
        }

        Storage.save();
        this.closeForm();
        App.refreshData();
    },

    delete(id) {
        const turmasVinculadas = State.turmas.filter(t => t.professorId === id);
        if (turmasVinculadas.length > 0) {
            UI.toast('Não é possível excluir: professor vinculado a turmas', 'error');
            return;
        }

        State.professores = State.professores.filter(p => p.id !== id);
        Storage.save();
        App.refreshData();
        UI.toast('Professor excluído', 'success');
    },

    render() {
        const container = document.getElementById('lista-professores');
        
        if (State.professores.length === 0) {
            container.innerHTML = '<p class="empty-state">Nenhum professor cadastrado</p>';
            return;
        }

        container.innerHTML = State.professores.map(p => `
            <div class="card">
                <div class="card-header">
                    <h3>${this.escapeHtml(p.nome)}</h3>
                    <div class="card-actions">
                        <button class="btn btn-icon btn-edit" data-id="${p.id}" title="Editar">✏️</button>
                        <button class="btn btn-icon btn-delete" data-id="${p.id}" title="Excluir">🗑️</button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="card-row">
                        <span class="card-row-label">Disciplina</span>
                        <span class="card-row-value">${this.escapeHtml(p.disciplina)}</span>
                    </div>
                    <div class="card-row">
                        <span class="card-row-label">E-mail</span>
                        <span class="card-row-value">${this.escapeHtml(p.email)}</span>
                    </div>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const prof = State.professores.find(p => p.id === btn.dataset.id);
                if (prof) this.openForm(prof);
            });
        });

        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                const prof = State.professores.find(p => p.id === btn.dataset.id);
                UI.confirmDelete(`Excluir o professor ${prof ? prof.nome : ''}?`, () => this.delete(btn.dataset.id));
            });
        });
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ========================================
// TURMAS & ALUNOS
// ========================================
const Turmas = {
    init() {
        if (this._inited) {
            this.render();
            return;
        }
        this._inited = true;
        this.bindEvents();
        this.render();
    },

    bindEvents() {
        document.getElementById('btn-add-turma').addEventListener('click', () => this.openForm());
        document.getElementById('btn-cancelar-turma').addEventListener('click', () => this.closeForm());
        document.getElementById('form-turma').addEventListener('submit', (e) => this.save(e));
        document.getElementById('btn-cancelar-aluno').addEventListener('click', () => UI.hideModal('modal-aluno'));
        document.getElementById('form-aluno').addEventListener('submit', (e) => this.saveAluno(e));
    },

    openForm(turma = null) {
        const form = document.getElementById('form-turma');
        form.reset();
        document.getElementById('turma-id').value = '';

        UI.populateSelect('turma-professor', State.professores, 'id', 'nome', 'Selecione um professor');

        if (turma) {
            document.getElementById('turma-id').value = turma.id;
            document.getElementById('turma-nome').value = turma.nome;
            document.getElementById('turma-professor').value = turma.professorId || '';
        }

        form.classList.remove('hidden');
    },

    closeForm() {
        document.getElementById('form-turma').classList.add('hidden');
        document.getElementById('form-turma').reset();
    },

    save(e) {
        e.preventDefault();
        const id = document.getElementById('turma-id').value;
        const professorId = document.getElementById('turma-professor').value;

        if (!professorId) {
            UI.toast('Selecione um professor responsável', 'error');
            return;
        }

        const turma = {
            id: id || generateId(),
            nome: document.getElementById('turma-nome').value.trim(),
            professorId
        };

        if (!turma.nome) {
            UI.toast('Informe o nome da turma', 'error');
            return;
        }

        if (id) {
            const idx = State.turmas.findIndex(t => t.id === id);
            if (idx !== -1) State.turmas[idx] = turma;
            UI.toast('Turma atualizada com sucesso', 'success');
        } else {
            State.turmas.push(turma);
            UI.toast('Turma cadastrada com sucesso', 'success');
        }

        Storage.save();
        this.closeForm();
        App.refreshData();
    },

    delete(id) {
        const alunosNaTurma = State.alunos.filter(a => a.turmaId === id);
        if (alunosNaTurma.length > 0) {
            UI.toast('Não é possível excluir: turma possui alunos matriculados', 'error');
            return;
        }

        State.turmas = State.turmas.filter(t => t.id !== id);
        Storage.save();
        App.refreshData();
        UI.toast('Turma excluída', 'success');
    },

    openAlunoModal(turmaId, aluno = null) {
        this.currentAlunoTurmaId = turmaId;
        const form = document.getElementById('form-aluno');
        form.reset();
        document.getElementById('aluno-turma-id').value = turmaId;
        document.getElementById('aluno-id').value = '';

        if (aluno) {
            document.getElementById('aluno-id').value = aluno.id;
            document.getElementById('aluno-nome').value = aluno.nome;
            document.getElementById('aluno-matricula').value = aluno.matricula;
        }

        UI.showModal('modal-aluno');
    },

    saveAluno(e) {
        e.preventDefault();
        const turmaId = document.getElementById('aluno-turma-id').value;
        const id = document.getElementById('aluno-id').value;
        const matricula = document.getElementById('aluno-matricula').value.trim();

        const matriculaExiste = State.alunos.some(a => 
            a.matricula === matricula && a.id !== id
        );
        if (matriculaExiste) {
            UI.toast('Matrícula já cadastrada', 'error');
            return;
        }

        const aluno = {
            id: id || generateId(),
            turmaId,
            nome: document.getElementById('aluno-nome').value.trim(),
            matricula
        };

        if (id) {
            const idx = State.alunos.findIndex(a => a.id === id);
            if (idx !== -1) State.alunos[idx] = aluno;
            UI.toast('Aluno atualizado com sucesso', 'success');
        } else {
            State.alunos.push(aluno);
            UI.toast('Aluno matriculado com sucesso', 'success');
        }

        Storage.save();
        UI.hideModal('modal-aluno');
        App.refreshData();
    },

    deleteAluno(id) {
        State.notas = State.notas.filter(n => n.alunoId !== id);
        State.alunos = State.alunos.filter(a => a.id !== id);
        Storage.save();
        App.refreshData();
        UI.toast('Aluno removido', 'success');
    },

    render() {
        const container = document.getElementById('lista-turmas');

        if (State.turmas.length === 0) {
            container.innerHTML = '<p class="empty-state">Nenhuma turma cadastrada</p>';
            return;
        }

        container.innerHTML = State.turmas.map(turma => {
            const professor = State.professores.find(p => p.id === turma.professorId);
            const alunosTurma = State.alunos.filter(a => a.turmaId === turma.id);

            return `
                <div class="card">
                    <div class="card-header">
                        <h3>${this.escapeHtml(turma.nome)}</h3>
                        <div class="card-actions">
                            <button class="btn btn-primary btn-small btn-add-aluno" data-turma="${turma.id}">+ Aluno</button>
                            <button class="btn btn-icon btn-edit-turma" data-id="${turma.id}" title="Editar">✏️</button>
                            <button class="btn btn-icon btn-delete-turma" data-id="${turma.id}" title="Excluir">🗑️</button>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="card-row">
                            <span class="card-row-label">Professor</span>
                            <span class="card-row-value">${professor ? this.escapeHtml(professor.nome) : 'Não definido'}</span>
                        </div>
                        <div class="card-row">
                            <span class="card-row-label">Alunos</span>
                            <span class="card-row-value">${alunosTurma.length} matriculado(s)</span>
                        </div>
                    </div>
                    ${alunosTurma.length > 0 ? `
                        <div class="card-body" style="padding-top: 0; border-top: 1px solid var(--cinza-medio);">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Matrícula</th>
                                        <th>Nome</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${alunosTurma.map(aluno => `
                                        <tr>
                                            <td>${this.escapeHtml(aluno.matricula)}</td>
                                            <td>${this.escapeHtml(aluno.nome)}</td>
                                            <td>
                                                <button class="btn btn-icon btn-edit-aluno" data-id="${aluno.id}" data-turma="${turma.id}" title="Editar">✏️</button>
                                                <button class="btn btn-icon btn-delete-aluno" data-id="${aluno.id}" title="Excluir">🗑️</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        container.querySelectorAll('.btn-add-aluno').forEach(btn => {
            btn.addEventListener('click', () => this.openAlunoModal(btn.dataset.turma));
        });

        container.querySelectorAll('.btn-edit-turma').forEach(btn => {
            btn.addEventListener('click', () => {
                const turma = State.turmas.find(t => t.id === btn.dataset.id);
                if (turma) this.openForm(turma);
            });
        });

        container.querySelectorAll('.btn-delete-turma').forEach(btn => {
            btn.addEventListener('click', () => {
                const turma = State.turmas.find(t => t.id === btn.dataset.id);
                UI.confirmDelete(`Excluir a turma ${turma ? turma.nome : ''}?`, () => this.delete(btn.dataset.id));
            });
        });

        container.querySelectorAll('.btn-edit-aluno').forEach(btn => {
            btn.addEventListener('click', () => {
                const aluno = State.alunos.find(a => a.id === btn.dataset.id);
                if (aluno) this.openAlunoModal(btn.dataset.turma, aluno);
            });
        });

        container.querySelectorAll('.btn-delete-aluno').forEach(btn => {
            btn.addEventListener('click', () => {
                const aluno = State.alunos.find(a => a.id === btn.dataset.id);
                UI.confirmDelete(`Excluir o aluno ${aluno ? aluno.nome : ''}? As notas dele também serão removidas.`, () => this.deleteAluno(btn.dataset.id));
            });
        });
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ========================================
// NOTAS
// ========================================
const Notas = {
    init() {
        if (this._inited) {
            this.render();
            return;
        }
        this._inited = true;
        this.bindEvents();
        this.renderFiltros();
        this.render();
    },

    bindEvents() {
        document.getElementById('filtro-turma').addEventListener('change', () => this.render());
        document.getElementById('filtro-disciplina').addEventListener('change', () => this.render());
        document.getElementById('filtro-bimestre').addEventListener('change', () => this.render());
        document.getElementById('btn-cancelar-nota').addEventListener('click', () => this.closeForm());
        document.getElementById('form-nota').addEventListener('submit', (e) => this.save(e));
    },

    renderFiltros() {
        UI.populateSelect('filtro-turma', State.turmas, 'id', 'nome');
        const disciplinas = [...new Set(
            State.professores
                .map(p => (p.disciplina || '').trim())
                .filter(Boolean)
        )].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        UI.populateSelect('filtro-disciplina', disciplinas.map(d => ({ id: d, nome: d })), 'id', 'nome');
    },

    openForm(alunoId, turmaId, disciplina, bimestre, notaExistente = null) {
        if (!disciplina) {
            UI.toast('Esta turma não possui professor/disciplina definido', 'error');
            return;
        }

        const form = document.getElementById('form-nota');
        form.reset();
        document.getElementById('nota-id').value = '';
        document.getElementById('nota-aluno-id').value = alunoId;

        form.dataset.turmaId = turmaId;
        form.dataset.disciplina = disciplina;
        form.dataset.bimestre = bimestre;

        if (notaExistente) {
            document.getElementById('nota-id').value = notaExistente.id;
            document.getElementById('nota-valor').value = notaExistente.valor;
        }

        form.classList.remove('hidden');
        document.getElementById('nota-valor').focus();
    },

    closeForm() {
        document.getElementById('form-nota').classList.add('hidden');
        document.getElementById('form-nota').reset();
    },

    save(e) {
        e.preventDefault();
        const form = document.getElementById('form-nota');
        const id = document.getElementById('nota-id').value;
        const alunoId = document.getElementById('nota-aluno-id').value;
        const valor = parseFloat(document.getElementById('nota-valor').value);

        if (isNaN(valor) || valor < 0 || valor > 10) {
            UI.toast('Nota deve ser entre 0 e 10', 'error');
            return;
        }

        const nota = {
            id: id || generateId(),
            alunoId,
            turmaId: form.dataset.turmaId,
            disciplina: form.dataset.disciplina,
            bimestre: parseInt(form.dataset.bimestre),
            valor,
            dataLancamento: new Date().toISOString()
        };

        if (id) {
            const idx = State.notas.findIndex(n => n.id === id);
            if (idx !== -1) State.notas[idx] = nota;
            UI.toast('Nota atualizada com sucesso', 'success');
        } else {
            const existe = State.notas.some(n => 
                n.alunoId === alunoId && 
                n.disciplina === nota.disciplina && 
                n.bimestre === nota.bimestre
            );
            if (existe) {
                UI.toast('Já existe nota para este aluno nesta disciplina/bimestre', 'error');
                return;
            }
            State.notas.push(nota);
            UI.toast('Nota lançada com sucesso', 'success');
        }

        Storage.save();
        this.closeForm();
        App.refreshData();
    },

    delete(id) {
        State.notas = State.notas.filter(n => n.id !== id);
        Storage.save();
        this.render();
        UI.toast('Nota excluída', 'success');
    },

    render() {
        const container = document.getElementById('lista-notas');
        const turmaId = document.getElementById('filtro-turma').value;
        const disciplina = document.getElementById('filtro-disciplina').value;
        const bimestre = document.getElementById('filtro-bimestre').value;

        if (!turmaId) {
            container.innerHTML = '<p class="empty-state">Selecione uma turma para lançar notas</p>';
            return;
        }

        const turma = State.turmas.find(t => t.id === turmaId);
        const alunos = State.alunos.filter(a => a.turmaId === turmaId);
        
        if (alunos.length === 0) {
            container.innerHTML = '<p class="empty-state">Nenhum aluno matriculado nesta turma</p>';
            return;
        }

        let disciplinaFiltro = disciplina;
        if (!disciplinaFiltro && turma) {
            const prof = State.professores.find(p => p.id === turma.professorId);
            if (prof) disciplinaFiltro = prof.disciplina;
        }
        disciplinaFiltro = (disciplinaFiltro || '').trim();

        if (!disciplinaFiltro) {
            container.innerHTML = '<p class="empty-state">Esta turma não tem disciplina definida. Edite a turma e defina um professor responsável.</p>';
            return;
        }

        const bimestreFiltro = bimestre ? parseInt(bimestre) : null;
        const bimestres = bimestreFiltro ? [bimestreFiltro] : [1, 2, 3, 4];

        let html = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Aluno</th>
                            <th>Matrícula</th>
        `;

        bimestres.forEach(b => {
            html += `<th>${b}º Bim</th>`;
        });

        html += `
                            <th>Média</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        alunos.forEach(aluno => {
            html += `<tr>
                <td>${this.escapeHtml(aluno.nome)}</td>
                <td>${this.escapeHtml(aluno.matricula)}</td>`;

            let soma = 0;
            let count = 0;

            bimestres.forEach(b => {
                const nota = State.notas.find(n => 
                    n.alunoId === aluno.id && 
                    n.disciplina === disciplinaFiltro && 
                    n.bimestre === b
                );
                
                if (nota) {
                    const valorNota = Number(nota.valor);
                    const classe = valorNota >= 7 ? 'nota-alta' : (valorNota >= 5 ? 'nota-media' : 'nota-baixa');
                    html += `<td class="nota-cell ${classe}">${valorNota.toFixed(1)}</td>`;
                    soma += valorNota;
                    count++;
                } else {
                    html += `<td>
                        <button class="btn btn-primary btn-small btn-add-nota" 
                            data-aluno="${aluno.id}" 
                            data-turma="${turmaId}" 
                            data-disciplina="${disciplinaFiltro || ''}" 
                            data-bimestre="${b}">
                            +
                        </button>
                    </td>`;
                }
            });

            const media = count > 0 ? (soma / count) : 0;
            const mediaClasse = media >= 7 ? 'nota-alta' : (media >= 5 ? 'nota-media' : 'nota-baixa');
            html += `<td class="nota-cell ${mediaClasse}">${count > 0 ? media.toFixed(1) : '-'}</td>`;

            html += `<td>
                ${bimestres.map(b => {
                    const nota = State.notas.find(n => 
                        n.alunoId === aluno.id && 
                        n.disciplina === disciplinaFiltro && 
                        n.bimestre === b
                    );
                    return nota ? `
                        <button class="btn btn-icon btn-edit-nota" data-id="${nota.id}" title="Editar">✏️</button>
                        <button class="btn btn-icon btn-delete-nota" data-id="${nota.id}" title="Excluir">🗑️</button>
                    ` : '';
                }).join('')}
            </td></tr>`;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;

        container.querySelectorAll('.btn-add-nota').forEach(btn => {
            btn.addEventListener('click', () => this.openForm(
                btn.dataset.aluno,
                btn.dataset.turma,
                btn.dataset.disciplina,
                btn.dataset.bimestre
            ));
        });

        container.querySelectorAll('.btn-edit-nota').forEach(btn => {
            btn.addEventListener('click', () => {
                const nota = State.notas.find(n => n.id === btn.dataset.id);
                if (nota) this.openForm(nota.alunoId, nota.turmaId, nota.disciplina, nota.bimestre, nota);
            });
        });

        container.querySelectorAll('.btn-delete-nota').forEach(btn => {
            btn.addEventListener('click', () => {
                UI.confirmDelete('Excluir esta nota?', () => this.delete(btn.dataset.id));
            });
        });
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ========================================
// RELATÓRIOS / BOLETIM
// ========================================
const Relatorios = {
    init() {
        if (this._inited) {
            this.render();
            return;
        }
        this._inited = true;
        this.bindEvents();
        this.renderFiltros();
        this.renderAlunosFilter();
    },

    bindEvents() {
        document.getElementById('rel-turma').addEventListener('change', () => {
            this.renderAlunosFilter();
            this.render();
        });
        document.getElementById('rel-aluno').addEventListener('change', () => this.render());
    },

    renderFiltros() {
        UI.populateSelect('rel-turma', State.turmas, 'id', 'nome');
    },

    renderAlunosFilter() {
        const turmaId = document.getElementById('rel-turma').value;
        const alunos = turmaId 
            ? State.alunos.filter(a => a.turmaId === turmaId)
            : [];
        UI.populateSelect('rel-aluno', alunos, 'id', 'nome', 'Todos os alunos');
    },

    render() {
        const container = document.getElementById('relatorio-container');
        const turmaId = document.getElementById('rel-turma').value;
        const alunoId = document.getElementById('rel-aluno').value;

        if (!turmaId) {
            container.innerHTML = '<p class="empty-state">Selecione uma turma para visualizar o boletim</p>';
            return;
        }

        const turma = State.turmas.find(t => t.id === turmaId);
        const professor = turma ? State.professores.find(p => p.id === turma.professorId) : null;
        
        let alunos = State.alunos.filter(a => a.turmaId === turmaId);
        if (alunoId) {
            alunos = alunos.filter(a => a.id === alunoId);
        }

        if (alunos.length === 0) {
            container.innerHTML = '<p class="empty-state">Nenhum aluno encontrado</p>';
            return;
        }

        const disciplinasComNotas = [...new Set(
            State.notas
                .filter(n => alunos.some(a => a.id === n.alunoId))
                .map(n => n.disciplina)
        )];

        let html = `
            <div class="report-header">
                <h3>Boletim - ${this.escapeHtml(turma?.nome || '')}</h3>
                <p>Professor: ${this.escapeHtml(professor?.nome || 'Não definido')} | Disciplina: ${this.escapeHtml(professor?.disciplina || 'Todas')}</p>
            </div>
            <div class="report-table">
                <table>
                    <thead>
                        <tr>
                            <th>Aluno</th>
                            <th>Matrícula</th>
        `;

        disciplinasComNotas.forEach(disc => {
            for (let b = 1; b <= 4; b++) {
                html += `<th>${disc}<br><small>${b}º Bim</small></th>`;
            }
            html += `<th>${disc}<br><small>Média</small></th>`;
        });

        html += `
                        </tr>
                    </thead>
                    <tbody>
        `;

        alunos.forEach(aluno => {
            html += `<tr>
                <td>${this.escapeHtml(aluno.nome)}</td>
                <td>${this.escapeHtml(aluno.matricula)}</td>`;

            disciplinasComNotas.forEach(disc => {
                let somaDisc = 0;
                let countDisc = 0;

                for (let b = 1; b <= 4; b++) {
                    const nota = State.notas.find(n => 
                        n.alunoId === aluno.id && 
                        n.disciplina === disc && 
                        n.bimestre === b
                    );
                    
                    if (nota) {
                        const valorNota = Number(nota.valor);
                        const classe = valorNota >= 7 ? 'nota-alta' : (valorNota >= 5 ? 'nota-media' : 'nota-baixa');
                        html += `<td class="nota-cell ${classe}">${valorNota.toFixed(1)}</td>`;
                        somaDisc += valorNota;
                        countDisc++;
                    } else {
                        html += `<td>-</td>`;
                    }
                }

                const mediaDisc = countDisc > 0 ? (somaDisc / countDisc) : 0;
                const mediaClasse = mediaDisc >= 7 ? 'nota-alta' : (mediaDisc >= 5 ? 'nota-media' : 'nota-baixa');
                html += `<td class="nota-cell ${mediaClasse}">${countDisc > 0 ? mediaDisc.toFixed(1) : '-'}</td>`;
            });

            html += `</tr>`;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ========================================
// INICIALIZAÇÃO
// ========================================
function init() {
    Storage.load();
    Auth.init();
}

document.addEventListener('DOMContentLoaded', init);