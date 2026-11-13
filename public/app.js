'use strict';
/* AS Control — front-end sem frameworks. Todas as permissões são verificadas também no servidor. */
(() => {
  const S = { usuario: null, perms: new Set(), meta: null, usuarios: [], categorias: [], naoLidas: 0, acoes: {} };

  // ---------- Ícones ----------
  const ICON = {
    painel: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
    contas: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    calendario: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    servicos: '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/>',
    cobrancas: '<path d="M4 4h16v12H5.2L4 17.2z"/><path d="M8 9h8M8 12h5"/>',
    documentos: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
    relatorios: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    sino: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    usuarios: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-4-5.6"/>',
    config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    auditoria: '<path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/>',
    mais: '<path d="M12 5v14M5 12h14"/>', menu: '<path d="M3 6h18M3 12h18M3 18h18"/>', fechar: '<path d="M18 6 6 18M6 6l12 12"/>',
    voltar: '<path d="M15 18l-6-6 6-6"/>', avancar: '<path d="M9 18l6-6-6-6"/>', baixar: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    clipe: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
    whatsapp: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"/>',
    balanca: '<path d="M12 3v18M5 21h14M6 7h12M3 15l3-8 3 8a3 3 0 0 1-6 0zM15 15l3-8 3 8a3 3 0 0 1-6 0z"/>',
    imprimir: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  };
  const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ''}</svg>`;
  const LOGO = '<svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#1D4FC4"/><path d="M8 22 L14 9 L20 22" stroke="white" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23.5" cy="20.5" r="2.5" fill="#93C5FD"/></svg>';

  // ---------- Formatação ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (c) => (c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const moeda = (c, m) => (c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: m || 'BRL' }));
  const paraInput = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
  const dataBR = (s) => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
  const dataHoraBR = (s) => { if (!s) return '—'; const d = new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`); return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }); };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const compCurta = (c) => { const [y, m] = c.split('-'); return `${MESES[m - 1]}/${y.slice(2)}`; };
  const compLonga = (c) => { const [y, m] = c.split('-'); return `${MESES_LONGO[m - 1]} de ${y}`; };
  const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const addDias = (s, n) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const diff = (a, b) => Math.round((new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 864e5);
  const tamanho = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

  const STATUS = {
    aguardando_fatura: 'Aguardando fatura', fatura_recebida: 'Fatura recebida', pendente_conferencia: 'Pendente de conferência',
    aguardando_pagamento: 'Aguardando pagamento', aprovado: 'Aprovado', pago: 'Pago', atrasado: 'Atrasado', cancelado: 'Cancelado',
  };
  const STATUS_SERV = { ativo: 'Ativo', pausado: 'Pausado', cancelado: 'Cancelado' };
  const PERIODO = { mensal: 'Mensal', bimestral: 'Bimestral', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', personalizada: 'Personalizada' };
  const TIPO_DOC = { boleto: 'Boleto', fatura: 'Fatura', nota_fiscal: 'Nota fiscal', comprovante: 'Comprovante', contrato: 'Contrato', proposta: 'Proposta', renovacao: 'Renovação', outro: 'Outro' };
  const TIPO_DOC_JUR = {
    peticao_inicial: 'Petição inicial', contestacao: 'Contestação / defesa', citacao_intimacao: 'Citação / intimação', procuracao_preposicao: 'Procuração / carta de preposição',
    ata_audiencia: 'Ata de audiência', sentenca_decisao: 'Sentença / decisão', acordo: 'Termo de acordo', reclamacao: 'Reclamação do cliente', resposta: 'Resposta enviada', comprovante: 'Comprovante', outro: 'Outro',
  };
  const tipoDocTxt = (d) => (d.tipo_juridico ? TIPO_DOC_JUR[d.tipo_juridico] : TIPO_DOC[d.tipo]);
  const PERFIL = { administrador: 'Administrador', financeiro: 'Financeiro', gestor: 'Gestor', consulta: 'Consulta' };
  const FORMAS = ['Boleto', 'Cartão de crédito', 'PIX', 'Débito automático', 'Transferência', 'Fatura no cartão corporativo'];
  const etq = (s, rot) => `<span class="etiqueta s-${esc(s)}">${esc(rot || STATUS[s] || STATUS_SERV[s] || s)}</span>`;
  const periodoTxt = (s) => (s.periodicidade === 'personalizada' ? `A cada ${s.intervalo_qtd} ${s.intervalo_unidade}` : PERIODO[s.periodicidade]);
  const pode = (p) => S.perms.has(p);
  const iniciais = (n) => String(n || '?').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  // ---------- API ----------
  async function api(metodo, url, corpo) {
    const op = { method: metodo, headers: { 'X-AS-Control': '1' }, credentials: 'same-origin' };
    if (corpo instanceof FormData) op.body = corpo;
    else if (corpo !== undefined) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(corpo); }
    const r = await fetch(`/api${url}`, op);
    const json = await r.json().catch(() => ({}));
    if (r.status === 401 && !url.startsWith('/login') && !url.startsWith('/setup')) { S.usuario = null; await iniciar(); throw new Error(json.erro || 'Sessão expirada.'); }
    if (!r.ok) throw new Error(json.erro || `Erro ${r.status}`);
    return json;
  }
  const qs = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o || {})) if (v !== '' && v != null) p.set(k, v); const s = p.toString(); return s ? `?${s}` : ''; };

  function toast(msg, erro = false) {
    const t = document.createElement('div');
    t.className = `toast${erro ? ' erro' : ''}`; t.textContent = msg;
    document.getElementById('toasts').append(t);
    setTimeout(() => t.remove(), erro ? 6000 : 3500);
  }

  // Coleta campos de um formulário (checkbox com name terminando em [] vira lista)
  function coletar(form) {
    const o = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (el.type === 'checkbox') {
        if (el.name.endsWith('[]')) { const k = el.name.slice(0, -2); o[k] = o[k] || []; if (el.checked) o[k].push(el.value); }
        else o[el.name] = el.checked;
      } else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else if (el.type !== 'file') o[el.name] = el.value;
    }
    return o;
  }

  function modal({ titulo, corpo, botao = 'Salvar', largo = false, perigo = false, aoEnviar, aoAbrir, semRodape = false }) {
    const fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    fundo.innerHTML = `<form class="modal${largo ? ' largo' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" novalidate>
      <div class="modal-cab"><h2>${esc(titulo)}</h2><button type="button" class="btn fantasma icone" data-fechar aria-label="Fechar">${ic('fechar')}</button></div>
      <div class="modal-corpo"><div class="erro-form oculto"></div>${corpo}</div>
      ${semRodape ? '' : `<div class="modal-rodape"><button type="button" class="btn" data-fechar>Voltar</button><button type="submit" class="btn ${perigo ? 'perigo' : 'primario'}">${esc(botao)}</button></div>`}
    </form>`;
    const anterior = document.activeElement;
    const fechar = () => { fundo.remove(); document.removeEventListener('keydown', tecla); anterior?.focus?.(); };
    const tecla = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', tecla);
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-fechar]')) fechar(); });
    const form = fundo.querySelector('form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const erro = form.querySelector('.erro-form');
      const btn = form.querySelector('[type=submit]');
      erro.classList.add('oculto'); btn.disabled = true;
      try { await aoEnviar(coletar(form), form); fechar(); } catch (err) { erro.textContent = err.message; erro.classList.remove('oculto'); erro.scrollIntoView({ block: 'nearest' }); } finally { btn.disabled = false; }
    });
    document.body.append(fundo);
    aoAbrir?.(form);
    (form.querySelector('input:not([type=hidden]),select,textarea') || form.querySelector('[type=submit]'))?.focus();
    return { fechar, form };
  }
  const confirmar = (titulo, texto, botao, perigo = true, comMotivo = false) => new Promise((resolve) => {
    let ok = false;
    const m = modal({
      titulo, botao, perigo,
      corpo: `<p class="mudo">${esc(texto)}</p>${comMotivo ? '<label class="campo" style="margin-top:14px"><span>Motivo</span><textarea name="motivo" required maxlength="500"></textarea></label>' : ''}`,
      aoEnviar: async (d) => { if (comMotivo && !d.motivo.trim()) throw new Error('Informe o motivo.'); ok = true; resolve(comMotivo ? d.motivo : true); },
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.form)) { obs.disconnect(); if (!ok) resolve(false); } });
    obs.observe(document.body, { childList: true });
  });

  const campo = (rotulo, html, extra = '') => `<label class="campo ${extra}"><span>${esc(rotulo)}</span>${html}</label>`;
  const opcoes = (mapa, sel, vazio) => `${vazio !== undefined ? `<option value="">${esc(vazio)}</option>` : ''}${Object.entries(mapa).map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}`;
  const opcoesUsuarios = (sel, vazio = 'Sem responsável') => opcoes(Object.fromEntries(S.usuarios.map((u) => [u.id, u.nome])), sel, vazio);
  const vazio = (titulo, texto, botao = '') => `<div class="vazio"><strong>${esc(titulo)}</strong>${esc(texto)}${botao}</div>`;

  // Dica flutuante (régua e gráficos)
  let dica;
  document.addEventListener('pointerover', (e) => {
    const alvo = e.target.closest('[data-dica]');
    if (!alvo) { dica?.remove(); dica = null; return; }
    if (!dica) { dica = document.createElement('div'); dica.className = 'dica-flutuante'; document.body.append(dica); }
    dica.textContent = alvo.dataset.dica;
    const r = alvo.getBoundingClientRect();
    dica.style.left = `${Math.min(window.innerWidth - 270, Math.max(8, r.left + r.width / 2 - 100))}px`;
    dica.style.top = `${r.top - dica.offsetHeight - 10}px`;
  });

  // ---------- Autenticação ----------
  function telaAuth(modo) {
    const barras = Array.from({ length: 24 }, (_, i) => `<span class="${i === 9 ? 'hoje' : ''}" style="height:${[30, 52, 18, 64, 40, 22, 70, 35, 48, 100, 26, 58, 44, 20, 66, 38, 54, 28, 46, 72, 24, 50, 34, 60][i]}%"></span>`).join('');
    const setup = modo === 'setup';
    document.getElementById('app').innerHTML = `<div class="auth">
      <div class="auth-lado"><div class="marca">${LOGO}<div><strong>AS Control</strong><span>AS Brasil</span></div></div>
        <div><h1>Nenhum vencimento esquecido.</h1><p>Assinaturas, contratos e contas a pagar da AS Brasil em um só lugar, com alertas antes de cada cobrança.</p><div class="auth-regua" aria-hidden="true">${barras}</div></div>
        <p class="fraco" style="color:#8EA3C8">Uso interno e exclusivo da equipe AS Brasil.</p></div>
      <div class="auth-form"><form novalidate>
        <div><h2>${setup ? 'Configurar o primeiro acesso' : 'Entrar'}</h2><p class="mudo" style="margin-top:6px">${setup ? 'Crie a conta de administrador. Depois você cadastra o restante da equipe.' : 'Use o e-mail e a senha cadastrados pelo administrador.'}</p></div>
        <div class="erro-form oculto"></div>
        ${setup ? campo('Seu nome', '<input type="text" name="nome" autocomplete="name" required>') : ''}
        ${campo('E-mail', '<input type="email" name="email" autocomplete="username" required>')}
        ${campo('Senha', `<input type="password" name="senha" autocomplete="${setup ? 'new-password' : 'current-password'}" required minlength="${setup ? 10 : 1}">${setup ? '<small>Mínimo de 10 caracteres.</small>' : ''}`)}
        <button class="btn primario" type="submit" style="justify-content:center;padding:10px">${setup ? 'Criar administrador e entrar' : 'Entrar'}</button>
      </form></div></div>`;
    const form = document.querySelector('.auth-form form');
    form.querySelector('input').focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const erro = form.querySelector('.erro-form'); erro.classList.add('oculto');
      try { await api('POST', setup ? '/setup' : '/login', coletar(form)); await iniciar(); }
      catch (err) { erro.textContent = err.message; erro.classList.remove('oculto'); }
    });
  }

  // ---------- Estrutura ----------
  // Duas faces: Contas e Jurídico. Notificações e administração são comuns.
  const MODULOS = {
    contas: { nome: 'Contas', inicio: '#/', itens: [
      ['#/', 'painel', 'Painel', 'lancamentos.ver'], ['#/lancamentos', 'contas', 'Contas a pagar', 'lancamentos.ver'],
      ['#/calendario', 'calendario', 'Calendário', 'lancamentos.ver'], ['#/servicos', 'servicos', 'Serviços e contratos', 'servicos.ver'],
      ['#/cobrancas', 'cobrancas', 'Cobranças recebidas', 'cobrancas.conferir'], ['#/documentos', 'documentos', 'Documentos', 'documentos.ver'],
      ['#/relatorios', 'relatorios', 'Relatórios', 'relatorios.ver'],
    ] },
    juridico: { nome: 'Jurídico', inicio: '#/juridico', itens: [
      ['#/juridico', 'painel', 'Painel jurídico', 'juridico.ver'], ['#/juridico/demandas', 'balanca', 'Demandas', 'juridico.ver'],
      ['#/juridico/agenda', 'calendario', 'Prazos e audiências', 'juridico.ver'],
    ] },
  };
  const COMUNS = [['#/notificacoes', 'sino', 'Notificações', null]];
  const ADMIN = [['#/usuarios', 'usuarios', 'Usuários', 'usuarios.gerenciar'], ['#/configuracoes', 'config', 'Alertas e integrações', 'config.gerenciar'], ['#/auditoria', 'auditoria', 'Auditoria', 'auditoria.ver']];
  const modulosDisponiveis = () => Object.keys(MODULOS).filter((m) => MODULOS[m].itens.some((i) => pode(i[3])));
  const linkNav = ([h, i, t]) => `<a href="${h}" data-nav="${h}">${ic(i)}<span>${esc(t)}</span>${h === '#/notificacoes' ? '<span class="contador oculto" data-contador></span>' : ''}</a>`;
  function renderNav(modulo) {
    const disp = modulosDisponiveis();
    const m = MODULOS[modulo] || MODULOS[disp[0]];
    const itens = m ? m.itens.filter((i) => pode(i[3])) : [];
    const admin = ADMIN.filter((i) => pode(i[3]));
    document.querySelector('[data-navs]').innerHTML = `
      ${disp.length > 1 ? `<div class="seletor-modulo" role="tablist" aria-label="Área do sistema">${disp.map((k) => `<a href="${MODULOS[k].inicio}" role="tab" aria-selected="${k === modulo}">${esc(MODULOS[k].nome)}</a>`).join('')}</div>` : ''}
      <nav class="nav">${itens.map(linkNav).join('')}${COMUNS.map(linkNav).join('')}</nav>
      ${admin.length ? `<div class="nav-grupo">Administração</div><nav class="nav">${admin.map(linkNav).join('')}</nav>` : ''}`;
    S.modulo = modulo;
  }
  function montarShell() {
    const u = S.usuario;
    document.getElementById('app').innerHTML = `<div class="shell">
      <aside class="lateral" aria-label="Menu principal">
        <div class="marca">${LOGO}<div><strong>AS Control</strong><span>AS Brasil</span></div></div>
        <div data-navs></div>
        <div class="lateral-rodape"><a href="#/perfil" style="color:#fff;font-weight:600">${esc(u.nome)}</a><div class="fraco" style="color:#8EA3C8">${esc(PERFIL[u.perfil])}</div>
          <button type="button" data-acao="sair" style="margin-top:8px">Sair</button></div>
      </aside>
      <div class="principal">
        <header class="topo">
          <button class="btn fantasma icone menu-movel" data-acao="menu" aria-label="Abrir menu">${ic('menu')}</button>
          <span class="topo-titulo" data-titulo></span><span class="espaco"></span>
          <a class="btn fantasma icone sino" href="#/notificacoes" aria-label="Notificações">${ic('sino')}<span class="bolinha oculto" data-bolinha></span></a>
          <a class="usuario-chip" href="#/perfil"><span class="avatar">${esc(iniciais(u.nome))}</span><span>${esc(u.nome.split(' ')[0])}</span></a>
        </header>
        <main class="conteudo" id="conteudo" tabindex="-1"></main>
      </div></div>`;
    renderNav(S.modulo || modulosDisponiveis()[0] || 'contas');
  }
  async function atualizarContador() {
    if (!S.usuario) return;
    try {
      const r = await api('GET', '/notificacoes?nao_lidas=1');
      S.naoLidas = r.nao_lidas;
      for (const el of document.querySelectorAll('[data-contador],[data-bolinha]')) { el.textContent = r.nao_lidas > 99 ? '99+' : r.nao_lidas; el.classList.toggle('oculto', !r.nao_lidas); }
    } catch { /* silencioso */ }
  }
  setInterval(atualizarContador, 60000);

  S.acoes.sair = async () => { await api('POST', '/logout'); S.usuario = null; location.hash = '#/'; iniciar(); };
  S.acoes.menu = () => document.querySelector('.shell')?.classList.toggle('menu-aberto');

  document.addEventListener('click', (e) => {
    const shell = document.querySelector('.shell.menu-aberto');
    if (shell && !e.target.closest('.lateral') && !e.target.closest('[data-acao="menu"]')) shell.classList.remove('menu-aberto');
    const a = e.target.closest('[data-acao]');
    if (a && S.acoes[a.dataset.acao]) { e.preventDefault(); S.acoes[a.dataset.acao](a, e); return; }
    const linha = e.target.closest('[data-ir]');
    if (linha && !e.target.closest('a,button,input,select,label')) location.hash = linha.dataset.ir;
  });
  document.addEventListener('keydown', (e) => {
    const linha = e.target.closest?.('[data-ir]');
    if (linha && e.key === 'Enter' && e.target === linha) location.hash = linha.dataset.ir;
  });

  // ---------- Roteador ----------
  const ROTAS = [];
  const rota = (re, perm, titulo, fn) => ROTAS.push({ re, perm, titulo, fn });
  async function navegar() {
    if (!S.usuario) return;
    const [caminho, busca] = (location.hash.slice(1) || '/').split('?');
    const params = Object.fromEntries(new URLSearchParams(busca || ''));
    const r = ROTAS.find((x) => x.re.test(caminho)) || ROTAS[0];
    const alvo = document.getElementById('conteudo');
    const modulo = caminho.startsWith('/juridico') ? 'juridico' : MODULOS.contas.itens.some((i) => i[0] !== '#/' && caminho.startsWith(i[0].slice(1))) || caminho === '/' ? 'contas' : S.modulo;
    if (modulo !== S.modulo) { renderNav(modulo); atualizarContador(); }
    for (const a of document.querySelectorAll('[data-nav]')) {
      const h = a.dataset.nav.slice(1);
      a.classList.toggle('ativo', h === '/' || h === '/juridico' ? caminho === h : caminho.startsWith(h));
    }
    document.querySelector('.shell')?.classList.remove('menu-aberto');
    document.querySelector('[data-titulo]').textContent = r.titulo;
    document.title = `${r.titulo} | AS Control`;
    if (r.perm && !pode(r.perm)) { alvo.innerHTML = vazio('Sem acesso a esta área', 'Seu perfil não tem permissão para abrir esta página. Fale com o administrador.'); return; }
    alvo.innerHTML = '<div class="vazio">Carregando…</div>';
    try { await r.fn(alvo, caminho.match(r.re), params); } catch (err) { alvo.innerHTML = vazio('Não foi possível carregar', err.message); }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', navegar);

  async function iniciar() {
    const est = await api('GET', '/estado').catch(() => null);
    if (!est) { document.getElementById('app').innerHTML = vazio('Servidor indisponível', 'Não foi possível falar com o AS Control. Verifique se o servidor está no ar.'); return; }
    S.meta = est;
    if (est.precisa_configurar) return telaAuth('setup');
    if (!est.usuario) return telaAuth('login');
    S.usuario = est.usuario; S.perms = new Set(est.usuario.permissoes);
    [S.usuarios, S.categorias] = await Promise.all([api('GET', '/usuarios/opcoes'), api('GET', '/servicos/categorias')]);
    montarShell();
    atualizarContador();
    if (!pode('lancamentos.ver') && (location.hash === '' || location.hash === '#/')) {
      location.hash = pode('juridico.ver') ? '#/juridico' : pode('servicos.ver') ? '#/servicos' : '#/notificacoes';
    }
    navegar();
  }

  window.ASC = { S, api, qs, toast, modal, confirmar, coletar, campo, opcoes, opcoesUsuarios, vazio, etq, esc, brl, moeda, paraInput, dataBR, dataHoraBR,
    compCurta, compLonga, hojeSP, addDias, diff, tamanho, ic, pode, rota, navegar, STATUS, STATUS_SERV, PERIODO, TIPO_DOC, TIPO_DOC_JUR, tipoDocTxt, PERFIL, FORMAS, periodoTxt, iniciar, atualizarContador, iniciais };
  document.addEventListener('DOMContentLoaded', () => { /* telas registradas em views.js */ });
})();
