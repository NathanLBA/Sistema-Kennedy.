/**
 * Sistema de Avaliação - Colégio Kennedy
 * Com autenticação (login/cadastro) e armazenamento em localStorage
 *
 * Estrutura de dados:
 * - professores: { id, nome, email }
 * - turmas: { id, nome, tipo }  (tipo: fundamental | medio_regular | medio_tecnico)
 * - alunos: { id, turmaId, nome, matricula }
 * - materiasTurma: { id, turmaId, materia, professorId }
 * - notas: { id, alunoId, materiasTurmaId, trimestre, valor, dataLancamento }
 */

// ========================================
// ESTADO GLOBAL
// ========================================
const State = {
    usuarioAtual: null,
    usuarios: [],
    professores: [],
    turmas: [],
    alunos: [],
    materiasTurma: [],
    notas: [],
    editId: null,
    deleteCallback: null,
    currentAlunoTurmaId: null,
    currentTurmaId: null
};

// ========================================
// BANCO DE DADOS (localStorage)
// ========================================
const Storage = {
    keys: {
        usuarios: 'kennedy_usuarios',
        professores: 'kennedy_professores',
        turmas: 'kennedy_turmas',
        alunos: 'kennedy_alunos',
        notas: 'kennedy_notas',
        session: 'kennedy_session'
    },

    dbKey: 'kennedy_db',
    version: 3,

    readRaw(key) {
        try { return localStorage.getItem(key); } catch (err) { return null; }
    },

    parseRaw(raw, fallback = null) {
        if (!raw) return fallback;
        try { return JSON.parse(raw); } catch (err) { return fallback; }
    },

    write(db) {
        try {
            localStorage.setItem(this.dbKey, JSON.stringify(db));
            return true;
        } catch (err) {
            console.error('Falha ao gravar no banco:', err);
            if (typeof UI !== 'undefined' && UI.toast) {
                UI.toast('Não foi possível salvar os dados. Verifique o espaço livre do navegador.', 'error');
            }
            return false;
        }
    },

    quarantine(raw) {
        try {
            localStorage.setItem(`kennedy_db_corrupted_${Date.now()}`, raw);
        } catch (err) { console.error('Não foi possível guardar a cópia corrompida:', err); }
    },

    emptyDb() {
        return {
            version: this.version,
            usuarios: [],
            professores: [],
            turmas: [],
            alunos: [],
            materiasTurma: [],
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
            materiasTurma: [],
            notas: notas || [],
            session
        };
    },

    normalize(db) {
        const lista = (valor) => (Array.isArray(valor) ? valor : []);

        const normalized = {
            version: this.version,
            usuarios: lista(db.usuarios).filter(u => u && u.id && u.email),
            professores: lista(db.professores).filter(p => p && p.id),
            turmas: lista(db.turmas).filter(t => t && t.id),
            alunos: lista(db.alunos).filter(a => a && a.id),
            materiasTurma: lista(db.materiasTurma).filter(m => m && m.id && m.turmaId && m.materia),
            notas: lista(db.notas)
                .filter(n => n && n.id && n.alunoId && n.materiasTurmaId)
                .map(n => ({
                    ...n,
                    valor: Number(n.valor),
                    trimestre: Number(n.trimestre)
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
        State.materiasTurma = db.materiasTurma;
        State.notas = db.notas;

        State.usuarioAtual = null;
        if (db.session && db.session.usuarioId) {
            const usuario = State.usuarios.find(u => u.id === db.session.usuarioId);
            if (usuario) State.usuarioAtual = usuario;
        }
    },

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

        if (!db) db = this.readLegacy();
        if (!db) db = this.emptyDb();

        db = this.normalize(db);
        this.apply(db);

        // Seed de turmas apenas se o banco estiver vazio (primeiro uso)
        if (db.turmas.length === 0 && db.professores.length === 0 && db.alunos.length === 0 && db.notas.length === 0) {
            this.seedTurmas();
            db = this.serialize();
        }

        this.write(db);

        if (corrompido && typeof UI !== 'undefined' && UI.toast) {
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
            materiasTurma: State.materiasTurma,
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
        try { localStorage.removeItem(this.dbKey); } catch (err) { /* ignora */ }

        State.usuarios = [];
        State.professores = [];
        State.turmas = [];
        State.alunos = [];
        State.materiasTurma = [];
        State.notas = [];
        State.usuarioAtual = null;
    },

    // ---------- SEED DE TURMAS (primeiro uso) ----------
    seedTurmas() {
        const turmas = [];

        // Fundamental: 6° ao 9° ano (A, B, C)
        for (let ano = 6; ano <= 9; ano++) {
            ['A', 'B', 'C'].forEach(turma => {
                turmas.push({ id: generateId(), nome: `${ano}°${turma}`, tipo: 'fundamental' });
            });
        }

        // Ensino Médio Regular: 1°, 2°, 3° (A, B, C)
        for (let ano = 1; ano <= 3; ano++) {
            ['A', 'B', 'C'].forEach(turma => {
                turmas.push({ id: generateId(), nome: `${ano}°${turma}`, tipo: 'medio_regular' });
            });
        }

        // Ensino Médio Técnico Integrado
        turmas.push({ id: generateId(), nome: '1°DS B', tipo: 'medio_tecnico' });
        turmas.push({ id: generateId(), nome: '1°ADM', tipo: 'medio_tecnico' });

        State.turmas = turmas;

        // Matérias sugeridas por tipo de turma (professor responsável fica vazio até o usuário cadastrar)
        const materiasFundamental = [
            'Língua Portuguesa', 'Matemática', 'Ciências', 'História', 'Geografia',
            'Língua Inglesa', 'Arte', 'Educação Física'
        ];

        const materiasMedioRegular = [
            'Língua Portuguesa', 'Matemática', 'Física', 'Química', 'Biologia',
            'História', 'Geografia', 'Língua Inglesa', 'Educação Física', 'Filosofia',
            'Sociologia', 'Arte'
        ];

        const materiasDS = [
            'ARTES', 'BIOLOGIA', 'ED. DIG COMP PROG E IA', 'EDUCAÇÃO FISÍCA', 'GEOGRAFIA',
            'LÍNGUA INGLESA', 'LÍNGUA PORTUGUESA', 'MATEMÁTICA', 'QUÍMICA', 'BANCO DE DADOS',
            'INTROD. A COMPUTAÇÃO', 'INTROD. A PROGRAMAÇÃO', 'LÓGICA COMPUTACIONAL',
            'ANÁLISE E METODO PARA SISTEMAS'
        ];

        const materiasADM = [
            'Língua Portuguesa', 'Matemática', 'Língua Inglesa', 'Educação Física', 'Artes',
            'História', 'Geografia', 'Biologia', 'Filosofia', 'Sociologia',
            'Fundamentos de Administração', 'Teoria da Administração', 'Gestão de Pessoas',
            'Marketing', 'Ética Profissional', 'Informática Aplicada', 'Contabilidade Básica',
            'Rotinas Administrativas', 'Noções de Economia', 'Empreendedorismo e Inovação'
        ];

        const materiasPorTipo = {
            fundamental: materiasFundamental,
            medio_regular: materiasMedioRegular,
            medio_tecnico: {}
        };

        // Vincula matérias às turmas (sem professor responsável ainda)
        State.turmas.forEach(turma => {
            let lista = [];
            if (turma.tipo === 'fundamental') {
                lista = materiasFundamental;
            } else if (turma.tipo === 'medio_regular') {
                lista = materiasMedioRegular;
            } else if (turma.tipo === 'medio_tecnico') {
                if (turma.nome === '1°DS B') {
                    lista = materiasDS;
                } else if (turma.nome === '1°ADM') {
                    lista = materiasADM;
                }
            }

            lista.forEach(materia => {
                State.materiasTurma.push({
                    id: generateId(),
                    turmaId: turma.id,
                    materia,
                    professorId: null
                });
            });
        });
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
    },

    confirmDelete(message, callback) {
        document.getElementById('modal-message').textContent =
            message || 'Tem certeza que deseja excluir este item?';
        State.deleteCallback = callback;
        this.showModal('modal-confirm');
    },

    escapeHtml(text) {
        if (text == null) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
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
        document.querySelectorAll('.auth-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => UI.switchAuthTab(btn.dataset.authTab));
        });
        document.querySelectorAll('.link-btn[data-switch]').forEach(btn => {
            btn.addEventListener('click', () => UI.switchAuthTab(btn.dataset.switch));
        });
        document.getElementById('form-login').addEventListener('submit', (e) => this.login(e));
        document.getElementById('form-register').addEventListener('submit', (e) => this.register(e));
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
        if (State.usuarios.some(u => (u.email || '').toLowerCase() === email)) {
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
        document.getElementById('form-login').reset();
        document.getElementById('form-register').reset();
        UI.switchAuthTab('login');
        UI.toast('Você saiu do sistema', 'info');
    }
};

// ========================================
// PROFESSORES
// ========================================
const Professores = {
    _inited: false,
    init() {
        if (this._inited) { this.render(); return; }
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
        const email = document.getElementById('professor-email').value.trim();

        if (!nome || !email) {
            UI.toast('Preencha nome e e-mail do professor', 'error');
            return;
        }

        const professor = { id: id || generateId(), nome, email };

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
        const vinculadas = State.materiasTurma.filter(m => m.professorId === id);
        if (vinculadas.length > 0) {
            UI.toast('Não é possível excluir: professor é responsável por matéria(s) em turma(s)', 'error');
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
                    <h3>${UI.escapeHtml(p.nome)}</h3>
                    <div class="card-actions">
                        <button class="btn btn-icon btn-edit" data-id="${p.id}" title="Editar">✏️</button>
                        <button class="btn btn-icon btn-delete" data-id="${p.id}" title="Excluir">🗑️</button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="card-row">
                        <span class="card-row-label">E-mail</span>
                        <span class="card-row-value">${UI.escapeHtml(p.email)}</span>
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
    }
};

// ========================================
// TURMAS
// ========================================
const Turmas = {
    _inited: false,
    init() {
        if (this._inited) { this.render(); return; }
        this._inited = true;
        this.bindEvents();
        this.render();
    },

    bindEvents() {
        // Delegação para os botões dos cards de turma (renderizados dinamicamente)
        document.getElementById('lista-turmas').addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const turmaId = btn.dataset.turma;
            if (!turmaId) return;

            if (btn.classList.contains('btn-ver-turma')) {
                this.abrirDetalhes(turmaId);
            } else if (btn.classList.contains('btn-editar-turma')) {
                const turma = State.turmas.find(t => t.id === turmaId);
                if (turma) this.editarTurma(turma);
            } else if (btn.classList.contains('btn-excluir-turma')) {
                const turma = State.turmas.find(t => t.id === turmaId);
                UI.confirmDelete(`Excluir a turma ${turma ? turma.nome : ''}?`, () => this.excluirTurma(turmaId));
            }
        });
    },

    render() {
        const container = document.getElementById('lista-turmas');
        if (State.turmas.length === 0) {
            container.innerHTML = '<p class="empty-state">Nenhuma turma cadastrada</p>';
            return;
        }

        const tipoLabel = {
            fundamental: 'Ensino Fundamental',
            medio_regular: 'Ensino Médio Regular',
            medio_tecnico: 'Ensino Médio Técnico'
        };

        container.innerHTML = State.turmas.map(turma => {
            const qtdAlunos = State.alunos.filter(a => a.turmaId === turma.id).length;
            const qtdMaterias = State.materiasTurma.filter(m => m.turmaId === turma.id).length;
            return `
                <div class="card">
                    <div class="card-header">
                        <h3>${UI.escapeHtml(turma.nome)}</h3>
                        <div class="card-actions">
                            <button class="btn btn-primary btn-small btn-ver-turma" data-turma="${turma.id}" title="Ver detalhes">Detalhes</button>
                            <button class="btn btn-icon btn-editar-turma" data-turma="${turma.id}" title="Editar turma">✏️</button>
                            <button class="btn btn-icon btn-excluir-turma" data-turma="${turma.id}" title="Excluir turma">🗑️</button>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="card-row">
                            <span class="card-row-label">Tipo</span>
                            <span class="card-row-value">${tipoLabel[turma.tipo] || turma.tipo}</span>
                        </div>
                        <div class="card-row">
                            <span class="card-row-label">Alunos</span>
                            <span class="card-row-value">${qtdAlunos} matriculado(s)</span>
                        </div>
                        <div class="card-row">
                            <span class="card-row-label">Matérias</span>
                            <span class="card-row-value">${qtdMaterias} cadastrada(s)</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    abrirDetalhes(turmaId) {
        State.currentTurmaId = turmaId;
        const turma = State.turmas.find(t => t.id === turmaId);
        document.getElementById('modal-turma-titulo').textContent = `Turma ${UI.escapeHtml(turma.nome)}`;
        document.getElementById('turma-view-nome').textContent = turma.nome;
        document.getElementById('turma-view-tipo').textContent = {
            fundamental: 'Ensino Fundamental',
            medio_regular: 'Ensino Médio Regular',
            medio_tecnico: 'Ensino Médio Técnico'
        }[turma.tipo] || turma.tipo;

        this.renderAlunos(turmaId);
        this.renderMaterias(turmaId);
        UI.showModal('modal-turma');
    },

    renderAlunos(turmaId) {
        const container = document.getElementById('lista-alunos-turma');
        const alunos = State.alunos.filter(a => a.turmaId === turmaId);
        if (alunos.length === 0) {
            container.innerHTML = '<p class="empty-state">Nenhum aluno matriculado nesta turma</p>';
            return;
        }
        container.innerHTML = alunos.map(a => `
            <div class="card card-small">
                <div class="card-body">
                    <div class="card-row">
                        <span class="card-row-label">Nome</span>
                        <span class="card-row-value">${UI.escapeHtml(a.nome)}</span>
                    </div>
                    <div class="card-row">
                        <span class="card-row-label">Matrícula</span>
                        <span class="card-row-value">${UI.escapeHtml(a.matricula)}</span>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-icon btn-editar-aluno" data-id="${a.id}" title="Editar">✏️</button>
                        <button class="btn btn-icon btn-excluir-aluno" data-id="${a.id}" title="Excluir">🗑️</button>
                    </div>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.btn-editar-aluno').forEach(btn => {
            btn.addEventListener('click', () => {
                const aluno = State.alunos.find(a => a.id === btn.dataset.id);
                if (aluno) Alunos.openForm(aluno);
            });
        });
        container.querySelectorAll('.btn-excluir-aluno').forEach(btn => {
            btn.addEventListener('click', () => {
                const aluno = State.alunos.find(a => a.id === btn.dataset.id);
                UI.confirmDelete(`Excluir o aluno ${aluno ? aluno.nome : ''}?`, () => Alunos.excluir(btn.dataset.id));
            });
        });
    },

    renderMaterias(turmaId) {
        const container = document.getElementById('lista-materias-turma');
        const materias = State.materiasTurma.filter(m => m.turmaId === turmaId);
        if (materias.length === 0) {
            container.innerHTML = '<p class="empty-state">Nenhuma matéria cadastrada nesta turma</p>';
            return;
        }
        container.innerHTML = materias.map(m => {
            const prof = State.professores.find(p => p.id === m.professorId);
            return `
                <div class="card card-small">
                    <div class="card-body">
                        <div class="card-row">
                            <span class="card-row-label">Matéria</span>
                            <span class="card-row-value">${UI.escapeHtml(m.materia)}</span>
                        </div>
                        <div class="card-row">
                            <span class="card-row-label">Professor Responsável</span>
                            <span class="card-row-value">${prof ? UI.escapeHtml(prof.nome) : 'Não definido'}</span>
                        </div>
                        <div class="card-actions">
                            <button class="btn btn-icon btn-editar-materia" data-id="${m.id}" title="Editar matéria">✏️</button>
                            <button class="btn btn-icon btn-definir-prof" data-id="${m.id}" title="Definir/alterar professor">👤</button>
                            <button class="btn btn-icon btn-excluir-materia" data-id="${m.id}" title="Remover matéria da turma">🗑️</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.btn-editar-materia').forEach(btn => {
            btn.addEventListener('click', () => {
                const mt = State.materiasTurma.find(m => m.id === btn.dataset.id);
                if (mt) MateriasTurma.openForm(mt);
            });
        });
        container.querySelectorAll('.btn-definir-prof').forEach(btn => {
            btn.addEventListener('click', () => {
                const mt = State.materiasTurma.find(m => m.id === btn.dataset.id);
                if (mt) MateriasTurma.editarProfessor(mt);
            });
        });
        container.querySelectorAll('.btn-excluir-materia').forEach(btn => {
            btn.addEventListener('click', () => {
                const mt = State.materiasTurma.find(m => m.id === btn.dataset.id);
                if (mt) {
                    const notasVinculadas = State.notas.filter(n => n.materiasTurmaId === mt.id);
                    if (notasVinculadas.length > 0) {
                        UI.toast('Não é possível remover: há notas lançadas para esta matéria', 'error');
                        return;
                    }
                    UI.confirmDelete(`Remover a matéria ${UI.escapeHtml(mt.materia)} desta turma?`, () => MateriasTurma.excluir(mt.id));
                }
            });
        });
    },

    // ---------- CRUD da própria turma ----------
    editarTurma(turma) {
        const novoNome = prompt('Novo nome da turma:', turma.nome);
        if (!novoNome || novoNome.trim() === '') return;
        turma.nome = novoNome.trim();
        Storage.save();
        this.render();
        if (State.currentTurmaId === turma.id) {
            document.getElementById('turma-view-nome').textContent = turma.nome;
        }
        UI.toast('Turma atualizada', 'success');
    },

    excluirTurma(turmaId) {
        const alunosNaTurma = State.alunos.filter(a => a.turmaId === turmaId);
        if (alunosNaTurma.length > 0) {
            UI.toast('Não é possível excluir: turma possui alunos matriculados', 'error');
            return;
        }
        const materiasNaTurma = State.materiasTurma.filter(m => m.turmaId === turmaId);
        if (materiasNaTurma.length > 0) {
            UI.toast('Não é possível excluir: turma possui matérias cadastradas', 'error');
            return;
        }
        State.turmas = State.turmas.filter(t => t.id !== turmaId);
        Storage.save();
        this.render();
        UI.toast('Turma excluída', 'success');
    },

    renderTodasTurmasMaterias() {
        const container = document.getElementById('lista-todas-turmas-materias');
        if (State.turmas.length === 0) {
            container.innerHTML = '<p class="empty-turmas">Nenhuma turma cadastrada</p>';
            return;
        }

        const tipoLabel = {
            fundamental: 'Ensino Fundamental',
            medio_regular: 'Ensino Médio Regular',
            medio_tecnico: 'Ensino Médio Técnico'
        };

        container.innerHTML = State.turmas.map(turma => {
            const materias = State.materiasTurma.filter(m => m.turmaId === turma.id);
            const qtdAlunos = State.alunos.filter(a => a.turmaId === turma.id).length;

            let materiasHtml = '';
            if (materias.length === 0) {
                materiasHtml = '<p style="text-align:center;color:var(--texto-secundario);padding:1rem;">Nenhuma matéria cadastrada</p>';
            } else {
                materiasHtml = materias.map(m => {
                    const prof = State.professores.find(p => p.id === m.professorId);
                    return `
                        <div class="materia-item">
                            <div>
                                <div class="materia-nome">${UI.escapeHtml(m.materia)}</div>
                                <div class="materia-prof">Prof: ${prof ? UI.escapeHtml(prof.nome) : 'Não definido'}</div>
                            </div>
                            <button class="btn-editar-materia-turma" data-id="${m.id}" data-turma="${turma.id}" title="Editar professor">✏️ Editar</button>
                        </div>
                    `;
                }).join('');
            }

            return `
                <div class="card-turma-materias">
                    <div class="card-header-turma">
                        ${UI.escapeHtml(turma.nome)} <span style="font-weight:400;font-size:0.85rem;opacity:0.9;">(${tipoLabel[turma.tipo] || turma.tipo})</span>
                        <span style="float:right;font-size:0.75rem;">${qtdAlunos} aluno(s)</span>
                    </div>
                    <div class="card-body-turma">
                        ${materiasHtml}
                    </div>
                </div>
            `;
        }).join('');

        // Vincula eventos aos botões de editar
        container.querySelectorAll('.btn-editar-materia-turma').forEach(btn => {
            btn.addEventListener('click', () => {
                const mt = State.materiasTurma.find(m => m.id === btn.dataset.id);
                if (mt) {
                    MateriasTurma.openForm(mt);
                }
            });
        });
    }
};

// ========================================
// ALUNOS
// ========================================
const Alunos = {
    _inited: false,
    init() {
        if (this._inited) return;
        this._inited = true;
        this.bindEvents();
    },

    bindEvents() {
        document.getElementById('btn-add-aluno').addEventListener('click', () => this.openForm());
        document.getElementById('btn-cancelar-aluno').addEventListener('click', () => this.closeForm());
        document.getElementById('form-aluno').addEventListener('submit', (e) => this.save(e));
        document.getElementById('btn-fechar-modal-aluno').addEventListener('click', () => this.closeForm());
        document.getElementById('modal-aluno').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeForm();
        });
    },

    openForm(aluno = null) {
        const form = document.getElementById('form-aluno');
        form.reset();
        document.getElementById('aluno-id').value = '';
        document.getElementById('aluno-turma-id').value = State.currentTurmaId;
        if (aluno) {
            document.getElementById('aluno-id').value = aluno.id;
            document.getElementById('aluno-nome').value = aluno.nome;
            document.getElementById('aluno-matricula').value = aluno.matricula;
            document.getElementById('modal-aluno-titulo').textContent = 'Editar Aluno';
        } else {
            document.getElementById('modal-aluno-titulo').textContent = 'Adicionar Aluno';
        }
        UI.showModal('modal-aluno');
    },

    closeForm() {
        UI.hideModal('modal-aluno');
    },

    save(e) {
        e.preventDefault();
        const turmaId = document.getElementById('aluno-turma-id').value;
        const id = document.getElementById('aluno-id').value;
        const nome = document.getElementById('aluno-nome').value.trim();
        const matricula = document.getElementById('aluno-matricula').value.trim();

        if (!nome || !matricula) {
            UI.toast('Preencha nome e matrícula', 'error');
            return;
        }

        const existe = State.alunos.some(a =>
            a.matricula === matricula && a.id !== id && a.turmaId === turmaId
        );
        if (existe) {
            UI.toast('Matrícula já cadastrada nesta turma', 'error');
            return;
        }

        const aluno = { id: id || generateId(), turmaId, nome, matricula };

        if (id) {
            const idx = State.alunos.findIndex(a => a.id === id);
            if (idx !== -1) State.alunos[idx] = aluno;
            UI.toast('Aluno atualizado com sucesso', 'success');
        } else {
            State.alunos.push(aluno);
            UI.toast('Aluno matriculado com sucesso', 'success');
        }

        Storage.save();
        this.closeForm();
        Turmas.renderAlunos(State.currentTurmaId);
        Turmas.render();
    },

    excluir(id) {
        State.notas = State.notas.filter(n => n.alunoId !== id);
        State.alunos = State.alunos.filter(a => a.id !== id);
        Storage.save();
        Turmas.renderAlunos(State.currentTurmaId);
        Turmas.render();
        UI.toast('Aluno removido', 'success');
    }
};

// ========================================
// MATÉRIAS DA TURMA (matéria + professor responsável)
// ========================================
const MateriasTurma = {
    _inited: false,
    init() {
        if (this._inited) return;
        this._inited = true;
        this.bindEvents();
    },

    bindEvents() {
        document.getElementById('btn-add-materia').addEventListener('click', () => this.openForm());
        document.getElementById('btn-cancelar-materia').addEventListener('click', () => this.closeForm());
        document.getElementById('form-materia').addEventListener('submit', (e) => this.save(e));
        document.getElementById('btn-fechar-modal-materia').addEventListener('click', () => this.closeForm());
        document.getElementById('modal-materia').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeForm();
        });

        document.getElementById('btn-cancelar-materia-prof').addEventListener('click', () => this.closeFormProf());
        document.getElementById('form-materia-prof').addEventListener('submit', (e) => this.saveProfessor(e));
        document.getElementById('btn-fechar-modal-materia-prof').addEventListener('click', () => this.closeFormProf());
        document.getElementById('modal-materia-prof').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeFormProf();
        });
    },

    openForm(materiaTurma = null) {
        const form = document.getElementById('form-materia');
        form.reset();
        document.getElementById('materia-id').value = '';

        // Usa a turma da matéria quando estiver editando (pode ser de outra turma)
        const turmaId = materiaTurma ? materiaTurma.turmaId : State.currentTurmaId;
        document.getElementById('materia-turma-id').value = turmaId;

        // Monta lista de matérias já usadas nesta turma para não duplicar
        const usadas = State.materiasTurma
            .filter(m => m.turmaId === turmaId && (!materiaTurma || m.id !== materiaTurma.id))
            .map(m => m.materia);

        const todas = this.todasMateriasDisponiveis();
        const disponiveis = todas.filter(m => !usadas.includes(m));

        const select = document.getElementById('materia-nome');
        select.innerHTML = '';
        disponiveis.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            select.appendChild(opt);
        });

        UI.populateSelect('materia-professor', State.professores, 'id', 'nome', 'Selecione um professor');

        if (materiaTurma) {
            document.getElementById('materia-id').value = materiaTurma.id;
            document.getElementById('materia-nome').value = materiaTurma.materia;
            document.getElementById('materia-professor').value = materiaTurma.professorId || '';
            document.getElementById('modal-materia-titulo').textContent = 'Editar Matéria da Turma';
        } else {
            document.getElementById('modal-materia-titulo').textContent = 'Adicionar Matéria à Turma';
        }
        UI.showModal('modal-materia');
    },

    closeForm() {
        UI.hideModal('modal-materia');
    },

    save(e) {
        e.preventDefault();
        const turmaId = document.getElementById('materia-turma-id').value;
        const id = document.getElementById('materia-id').value;
        const materia = document.getElementById('materia-nome').value.trim();
        const professorId = document.getElementById('materia-professor').value || null;

        if (!materia) {
            UI.toast('Informe a matéria', 'error');
            return;
        }

        const mt = { id: id || generateId(), turmaId, materia, professorId };

        if (id) {
            const idx = State.materiasTurma.findIndex(m => m.id === id);
            if (idx !== -1) State.materiasTurma[idx] = mt;
            UI.toast('Matéria atualizada com sucesso', 'success');
        } else {
            State.materiasTurma.push(mt);
            UI.toast('Matéria adicionada à turma com sucesso', 'success');
        }

        Storage.save();
        this.closeForm();
        Turmas.renderMaterias(State.currentTurmaId);
        Turmas.render();
        Notas.renderFiltros();
        Relatorios.renderFiltros();
        // Atualiza também a visão "Editar Matérias" de todas as turmas, se estiver aberta
        const modalTodas = document.getElementById('modal-editar-materias');
        if (modalTodas && !modalTodas.classList.contains('hidden')) {
            Turmas.renderTodasTurmasMaterias();
        }
    },

    editarProfessor(materiaTurma) {
        document.getElementById('materia-prof-id').value = materiaTurma.id;
        document.getElementById('materia-professor-select').value = materiaTurma.professorId || '';
        document.getElementById('modal-materia-prof-titulo').textContent =
            `Professor responsável - ${UI.escapeHtml(materiaTurma.materia)}`;
        UI.populateSelect('materia-professor-select', State.professores, 'id', 'nome', 'Selecione um professor');
        UI.showModal('modal-materia-prof');
    },

    closeFormProf() {
        UI.hideModal('modal-materia-prof');
    },

    saveProfessor(e) {
        e.preventDefault();
        const id = document.getElementById('materia-prof-id').value;
        const professorId = document.getElementById('materia-professor-select').value || null;

        const mt = State.materiasTurma.find(m => m.id === id);
        if (mt) {
            mt.professorId = professorId;
            Storage.save();
            this.closeFormProf();
            Turmas.renderMaterias(State.currentTurmaId);
            // Atualiza também a visão "Editar Matérias" de todas as turmas, se estiver aberta
            const modalTodas = document.getElementById('modal-editar-materias');
            if (modalTodas && !modalTodas.classList.contains('hidden')) {
                Turmas.renderTodasTurmasMaterias();
            }
            UI.toast('Professor responsável atualizado', 'success');
        }
    },

    excluir(id) {
        State.materiasTurma = State.materiasTurma.filter(m => m.id !== id);
        State.notas = State.notas.filter(n => n.materiasTurmaId !== id);
        Storage.save();
        Turmas.renderMaterias(State.currentTurmaId);
        Turmas.render();
        Notas.renderFiltros();
        Relatorios.renderFiltros();
        UI.toast('Matéria removida da turma', 'success');
    },

    todasMateriasDisponiveis() {
        const tipo = State.turmas.find(t => t.id === State.currentTurmaId)?.tipo;
        if (tipo === 'fundamental') {
            return ['Língua Portuguesa', 'Matemática', 'Ciências', 'História', 'Geografia', 'Língua Inglesa', 'Arte', 'Educação Física'];
        }
        if (tipo === 'medio_regular') {
            return ['Língua Portuguesa', 'Matemática', 'Física', 'Química', 'Biologia', 'História', 'Geografia', 'Língua Inglesa', 'Educação Física', 'Filosofia', 'Sociologia', 'Arte'];
        }
        if (tipo === 'medio_tecnico') {
            const nome = State.turmas.find(t => t.id === State.currentTurmaId)?.nome;
            if (nome === '1°DS B') {
                return ['ARTES', 'BIOLOGIA', 'ED. DIG COMP PROG E IA', 'EDUCAÇÃO FISÍCA', 'GEOGRAFIA', 'LÍNGUA INGLESA', 'LÍNGUA PORTUGUESA', 'MATEMÁTICA', 'QUÍMICA', 'BANCO DE DADOS', 'INTROD. A COMPUTAÇÃO', 'INTROD. A PROGRAMAÇÃO', 'LÓGICA COMPUTACIONAL', 'ANÁLISE E METODO PARA SISTEMAS'];
            }
            if (nome === '1°ADM') {
                return ['Língua Portuguesa', 'Matemática', 'Língua Inglesa', 'Educação Física', 'Artes', 'História', 'Geografia', 'Biologia', 'Filosofia', 'Sociologia', 'Fundamentos de Administração', 'Informática Aplicada', 'Contabilidade Básica', 'Rotinas Administrativas', 'Noções de Economia', 'Empreendedorismo e Inovação'];
            }
        }
        return [];
    }
};

// ========================================
// NOTAS
// ========================================
const Notas = {
    _inited: false,
    init() {
        if (this._inited) { this.render(); return; }
        this._inited = true;
        this.bindEvents();
        this.renderFiltros();
        this.render();
    },

    bindEvents() {
        document.getElementById('filtro-turma').addEventListener('change', () => {
            this.renderFiltros();
            this.render();
        });
        document.getElementById('filtro-materia').addEventListener('change', () => this.render());
        document.getElementById('filtro-trimestre').addEventListener('change', () => this.render());
        document.getElementById('btn-cancelar-nota').addEventListener('click', () => this.closeForm());
        document.getElementById('form-nota').addEventListener('submit', (e) => this.save(e));
    },

    renderFiltros() {
        UI.populateSelect('filtro-turma', State.turmas, 'id', 'nome');
        const turmaId = document.getElementById('filtro-turma').value;
        const selectMateria = document.getElementById('filtro-materia');
        selectMateria.innerHTML = '<option value="">Selecione uma matéria</option>';
        if (turmaId) {
            const materias = State.materiasTurma.filter(m => m.turmaId === turmaId);
            materias.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.materia;
                selectMateria.appendChild(opt);
            });
        }
    },

    openForm(alunoId, turmaMateriaId, notaExistente = null) {
        const form = document.getElementById('form-nota');
        form.reset();
        document.getElementById('nota-id').value = '';
        document.getElementById('nota-aluno-id').value = alunoId;
        document.getElementById('nota-turmamateria-id').value = turmaMateriaId;

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
        const id = document.getElementById('nota-id').value;
        const alunoId = document.getElementById('nota-aluno-id').value;
        const materiasTurmaId = document.getElementById('nota-turmamateria-id').value;
        const valor = parseFloat(document.getElementById('nota-valor').value);

        if (isNaN(valor) || valor < 0 || valor > 10) {
            UI.toast('Nota deve ser entre 0 e 10', 'error');
            return;
        }

        const nota = {
            id: id || generateId(),
            alunoId,
            materiasTurmaId,
            trimestre: parseInt(document.getElementById('filtro-trimestre').value),
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
                n.materiasTurmaId === materiasTurmaId &&
                n.trimestre === nota.trimestre
            );
            if (existe) {
                UI.toast('Já existe nota para este aluno nesta matéria/trimestre', 'error');
                return;
            }
            State.notas.push(nota);
            UI.toast('Nota lançada com sucesso', 'success');
        }

        Storage.save();
        this.closeForm();
        this.render();
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
        const materiasTurmaId = document.getElementById('filtro-materia').value;
        const trimestre = document.getElementById('filtro-trimestre').value;

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

        if (!materiasTurmaId) {
            container.innerHTML = '<p class="empty-state">Selecione uma matéria para lançar notas</p>';
            return;
        }

        const mt = State.materiasTurma.find(m => m.id === materiasTurmaId);
        const trimestreFiltro = trimestre ? parseInt(trimestre) : null;
        const trimestres = trimestreFiltro ? [trimestreFiltro] : [1, 2, 3];

        const prof = mt.professorId ? State.professores.find(p => p.id === mt.professorId) : null;

        let html = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Aluno</th>
                            <th>Matrícula</th>
                            <th>Matéria</th>
                            <th>Professor</th>
        `;
        trimestres.forEach(b => {
            html += `<th>${b}º Trimestre</th>`;
        });
        html += `
                            <th>Média Final</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        alunos.forEach(aluno => {
            html += `<tr>
                <td>${UI.escapeHtml(aluno.nome)}</td>
                <td>${UI.escapeHtml(aluno.matricula)}</td>
                <td>${UI.escapeHtml(mt.materia)}</td>
                <td>${prof ? UI.escapeHtml(prof.nome) : 'Não definido'}</td>
            `;

            trimestres.forEach(b => {
                const nota = State.notas.find(n =>
                    n.alunoId === aluno.id &&
                    n.materiasTurmaId === materiasTurmaId &&
                    n.trimestre === b
                );
                if (nota) {
                    const classe = nota.valor >= 7 ? 'nota-alta' : (nota.valor >= 5 ? 'nota-media' : 'nota-baixa');
                    html += `<td class="nota-cell ${classe}">${nota.valor.toFixed(1)}
                        <button class="btn btn-icon btn-edit-nota" data-id="${nota.id}" title="Editar" style="margin-left:4px;vertical-align:middle;">✏️</button>
                        <button class="btn btn-icon btn-delete-nota" data-id="${nota.id}" title="Excluir" style="margin-left:4px;vertical-align:middle;">🗑️</button>
                    </td>`;
                } else {
                    html += `<td>
                        <button class="btn btn-primary btn-small btn-add-nota"
                            data-aluno="${aluno.id}"
                            data-turmamateria="${materiasTurmaId}"
                            data-trimestre="${b}">
                            +
                        </button>
                    </td>`;
                }
            });

            // Média final: só aparece depois que as 3 notas do trimestre foram lançadas
            const notasAluno = [1, 2, 3].map(t => State.notas.find(n =>
                n.alunoId === aluno.id &&
                n.materiasTurmaId === materiasTurmaId &&
                n.trimestre === t
            ));
            if (notasAluno.every(Boolean)) {
                const media = notasAluno.reduce((soma, n) => soma + Number(n.valor), 0) / 3;
                const classeMedia = media >= 7 ? 'nota-alta' : (media >= 5 ? 'nota-media' : 'nota-baixa');
                html += `<td class="nota-cell media-final-nota ${classeMedia}" title="Média dos 3 trimestres">${media.toFixed(1)}</td>`;
            } else {
                html += `<td class="media-pendente" title="A média aparece após o lançamento das 3 notas">—</td>`;
            }

            html += `</tr>`;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;
        container.innerHTML = html;

        container.querySelectorAll('.btn-add-nota').forEach(btn => {
            btn.addEventListener('click', () => this.openForm(btn.dataset.aluno, btn.dataset.turmamateria));
        });
        container.querySelectorAll('.btn-edit-nota').forEach(btn => {
            btn.addEventListener('click', () => {
                const nota = State.notas.find(n => n.id === btn.dataset.id);
                if (nota) this.openForm(nota.alunoId, nota.materiasTurmaId, nota);
            });
        });
        container.querySelectorAll('.btn-delete-nota').forEach(btn => {
            btn.addEventListener('click', () => {
                UI.confirmDelete('Excluir esta nota?', () => this.delete(btn.dataset.id));
            });
        });
    }
};

// ========================================
// RELATÓRIOS / BOLETIM
// ========================================
const Relatorios = {
    _inited: false,
    init() {
        if (this._inited) { this.render(); return; }
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
        const alunos = turmaId ? State.alunos.filter(a => a.turmaId === turmaId) : [];
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
        let alunos = State.alunos.filter(a => a.turmaId === turmaId);
        if (alunoId) alunos = alunos.filter(a => a.id === alunoId);
        if (alunos.length === 0) {
            container.innerHTML = '<p class="empty-state">Nenhum aluno encontrado</p>';
            return;
        }

        const materiasTurma = State.materiasTurma.filter(m => m.turmaId === turmaId);

        let html = `
            <div class="report-header">
                <h3>Boletim - ${UI.escapeHtml(turma.nome)}</h3>
                <p>Tipo: ${{
                    fundamental: 'Ensino Fundamental',
                    medio_regular: 'Ensino Médio Regular',
                    medio_tecnico: 'Ensino Médio Técnico'
                }[turma.tipo] || turma.tipo}</p>
            </div>
            <div class="report-table">
                <table>
                    <thead>
                        <tr>
                            <th>Aluno</th>
                            <th>Matrícula</th>
        `;

        materiasTurma.forEach(mt => {
            for (let b = 1; b <= 3; b++) {
                html += `<th>${UI.escapeHtml(mt.materia)}<br><small>${b}º Trimestre</small></th>`;
            }
            html += `<th>${UI.escapeHtml(mt.materia)}<br><small>Média</small></th>`;
        });

        html += `
                        </tr>
                    </thead>
                    <tbody>
        `;

        alunos.forEach(aluno => {
            html += `<tr>
                <td>${UI.escapeHtml(aluno.nome)}</td>
                <td>${UI.escapeHtml(aluno.matricula)}</td>
            `;

            materiasTurma.forEach(mt => {
                let soma = 0;
                let count = 0;
                for (let b = 1; b <= 3; b++) {
                    const nota = State.notas.find(n =>
                        n.alunoId === aluno.id &&
                        n.materiasTurmaId === mt.id &&
                        n.trimestre === b
                    );
                    if (nota) {
                        const valorNota = Number(nota.valor);
                        const classe = valorNota >= 7 ? 'nota-alta' : (valorNota >= 5 ? 'nota-media' : 'nota-baixa');
                        html += `<td class="nota-cell ${classe}">${valorNota.toFixed(1)}</td>`;
                        soma += valorNota;
                        count++;
                    } else {
                        html += `<td>-</td>`;
                    }
                }
                const media = count > 0 ? (soma / count) : 0;
                const mediaClasse = media >= 7 ? 'nota-alta' : (media >= 5 ? 'nota-media' : 'nota-baixa');
                html += `<td class="nota-cell ${mediaClasse}">${count > 0 ? media.toFixed(1) : '-'}</td>`;
            });

            html += `</tr>`;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;
        container.innerHTML = html;
    }
};

// ========================================
// APP PRINCIPAL
// ========================================
const App = {
    _bound: false,
    init() {
        Professores.init();
        Turmas.init();
        Alunos.init();
        MateriasTurma.init();
        Notas.init();
        Relatorios.init();
        this.bindGlobalEvents();
        this.refreshData();
    },

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

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => UI.setActiveTab(btn.dataset.tab));
        });

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

        document.getElementById('btn-reiniciar').addEventListener('click', () => this.resetSystem());
        document.getElementById('btn-fechar-modal-turma').addEventListener('click', () => UI.hideModal('modal-turma'));
        document.getElementById('btn-fechar-modal-turma2').addEventListener('click', () => UI.hideModal('modal-turma'));
        document.getElementById('btn-salvar-turma').addEventListener('click', () => {
            Storage.save();
            UI.toast('Alterações salvas com sucesso', 'success');
            UI.hideModal('modal-turma');
        });
        document.getElementById('btn-editar-materias-turma').addEventListener('click', () => {
            Turmas.renderTodasTurmasMaterias();
            UI.showModal('modal-editar-materias');
        });
        document.getElementById('btn-fechar-modal-editar-materias').addEventListener('click', () => UI.hideModal('modal-editar-materias'));
        document.getElementById('btn-fechar-modal-editar-materias2').addEventListener('click', () => UI.hideModal('modal-editar-materias'));
        document.getElementById('modal-editar-materias').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) UI.hideModal('modal-editar-materias');
        });
        document.getElementById('modal-turma').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) UI.hideModal('modal-turma');
        });

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
        if (confirm('ATENÇÃO: Isso apagará TODOS os dados escolares (turmas, alunos, matérias, notas, professores).\n\nSeu usuário será mantido.\n\nTem certeza?')) {
            if (confirm('Esta ação é IRREVERSÍVEL. Confirma a exclusão completa dos dados escolares?')) {
                const usuarios = State.usuarios;
                const usuarioAtual = State.usuarioAtual;
                Storage.clear();
                State.usuarios = usuarios;
                State.usuarioAtual = usuarioAtual;
                // Re-seed turmas pois o banco foi limpo
                Storage.seedTurmas();
                Storage.save();
                Storage.saveSession();
                UI.toast('Dados do sistema apagados com sucesso', 'success');
                setTimeout(() => location.reload(), 1000);
            }
        }
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
