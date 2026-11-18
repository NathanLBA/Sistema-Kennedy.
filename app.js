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
// UTILITÁRIOS DE STORAGE
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

    load() {
        State.usuarios = JSON.parse(localStorage.getItem(this.keys.usuarios) || '[]');
        State.professores = JSON.parse(localStorage.getItem(this.keys.professores) || '[]');
        State.turmas = JSON.parse(localStorage.getItem(this.keys.turmas) || '[]');
        State.alunos = JSON.parse(localStorage.getItem(this.keys.alunos) || '[]');
        State.notas = JSON.parse(localStorage.getItem(this.keys.notas) || '[]');
        
        // Restaura sessão se houver
        const session = JSON.parse(localStorage.getItem(this.keys.session) || 'null');
        if (session && session.usuarioId) {
            const usuario = State.usuarios.find(u => u.id === session.usuarioId);
            if (usuario) {
                State.usuarioAtual = usuario;
            }
        }
    },

    save() {
        localStorage.setItem(this.keys.usuarios, JSON.stringify(State.usuarios));
        localStorage.setItem(this.keys.professores, JSON.stringify(State.professores));
        localStorage.setItem(this.keys.turmas, JSON.stringify(State.turmas));
        localStorage.setItem(this.keys.alunos, JSON.stringify(State.alunos));
        localStorage.setItem(this.keys.notas, JSON.stringify(State.notas));
    },

    saveSession() {
        if (State.usuarioAtual) {
            localStorage.setItem(this.keys.session, JSON.stringify({ usuarioId: State.usuarioAtual.id }));
        } else {
            localStorage.removeItem(this.keys.session);
        }
    },

    clear() {
        Object.values(this.keys).forEach(key => localStorage.removeItem(key));
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

        const usuario = State.usuarios.find(u => u.email === email);
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
        // Inicializa todos os módulos
        Professores.init();
        Turmas.init();
        Notas.init();
        Relatorios.init();
        this.bindGlobalEvents();
    },

    bindGlobalEvents() {
        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => UI.setActiveTab(btn.dataset.tab));
        });

        // Modal confirmação
        document.getElementById('modal-confirm-btn').addEventListener('click', () => {
            if (UI.deleteCallback) {
                UI.deleteCallback();
                UI.deleteCallback = null;
            }
            UI.hideModal('modal-confirm');
        });

        document.getElementById('modal-cancel-btn').addEventListener('click', () => {
            UI.deleteCallback = null;
            UI.hideModal('modal-confirm');
        });

        document.getElementById('modal-confirm').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                UI.deleteCallback = null;
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
        const professor = {
            id: id || generateId(),
            nome: document.getElementById('professor-nome').value.trim(),
            disciplina: document.getElementById('professor-disciplina').value.trim(),
            email: document.getElementById('professor-email').value.trim()
        };

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
        this.render();
        Turmas.render();
        Notas.render();
    },

    delete(id) {
        const turmasVinculadas = State.turmas.filter(t => t.professorId === id);
        if (turmasVinculadas.length > 0) {
            UI.toast('Não é possível excluir: professor vinculado a turmas', 'error');
            return;
        }

        State.professores = State.professores.filter(p => p.id !== id);
        Storage.save();
        this.render();
        Turmas.render();
        Notas.render();
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
                UI.showModal('modal-confirm');
                UI.deleteCallback = () => this.delete(btn.dataset.id);
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
        this.render();
        Notas.render();
        Relatorios.render();
    },

    delete(id) {
        const alunosNaTurma = State.alunos.filter(a => a.turmaId === id);
        if (alunosNaTurma.length > 0) {
            UI.toast('Não é possível excluir: turma possui alunos matriculados', 'error');
            return;
        }

        State.turmas = State.turmas.filter(t => t.id !== id);
        Storage.save();
        this.render();
        Notas.render();
        Relatorios.render();
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
        this.render();
        Notas.render();
        Relatorios.render();
    },

    deleteAluno(id) {
        State.notas = State.notas.filter(n => n.alunoId !== id);
        State.alunos = State.alunos.filter(a => a.id !== id);
        Storage.save();
        this.render();
        Notas.render();
        Relatorios.render();
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
                UI.showModal('modal-confirm');
                UI.deleteCallback = () => this.delete(btn.dataset.id);
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
                UI.showModal('modal-confirm');
                UI.deleteCallback = () => this.deleteAluno(btn.dataset.id);
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
        UI.populateSelect('filtro-disciplina', [...new Set(State.professores.map(p => p.disciplina))].map(d => ({ id: d, nome: d })), 'id', 'nome');
    },

    openForm(alunoId, turmaId, disciplina, bimestre, notaExistente = null) {
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
                    const classe = nota.valor >= 7 ? 'nota-alta' : (nota.valor >= 5 ? 'nota-media' : 'nota-baixa');
                    html += `<td class="nota-cell ${classe}">${nota.valor.toFixed(1)}</td>`;
                    soma += nota.valor;
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
                UI.showModal('modal-confirm');
                UI.deleteCallback = () => this.delete(btn.dataset.id);
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
        this.bindEvents();
        this.renderFiltros();
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
                        const classe = nota.valor >= 7 ? 'nota-alta' : (nota.valor >= 5 ? 'nota-media' : 'nota-baixa');
                        html += `<td class="nota-cell ${classe}">${nota.valor.toFixed(1)}</td>`;
                        somaDisc += nota.valor;
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