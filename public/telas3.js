'use strict';
(() => {
  const A = window.ASC; const T = window.ASC_T;
  const { esc, brl, dataBR, etq, ic, pode, rota, api, qs, campo, opcoes, vazio, S } = A;

  // ================= RELATÓRIOS =================
  const AGRUPAR = { mes: 'Mês', categoria: 'Categoria', fornecedor: 'Fornecedor', servico: 'Serviço', responsavel: 'Responsável', status: 'Status' };
  rota(/^\/relatorios$/, 'relatorios.ver', 'Relatórios', async (el, _m, p) => {
    const ano = A.hojeSP().slice(0, 4);
    const f = { de: p.de || `${ano}-01-01`, ate: p.ate || `${ano}-12-31`, agrupar: p.agrupar || 'mes', categoria: p.categoria || '', fornecedor: p.fornecedor || '', responsavel_id: p.responsavel_id || '', status: p.status || '' };
    const [r, ind] = await Promise.all([api('GET', `/relatorios${qs(f)}`), api('GET', '/relatorios/indicadores')]);
    const maxProj = Math.max(1, ...ind.projecao.map((x) => x.total));
    el.innerHTML = `<div class="imprimir-cab"><h1>AS Control · Relatório de despesas</h1><p>AS Brasil · ${dataBR(r.de)} a ${dataBR(r.ate)} · agrupado por ${AGRUPAR[r.agrupar].toLowerCase()} · emitido em ${new Date().toLocaleString('pt-BR')}</p></div>
      <div class="cabecalho nao-imprimir"><div><h1>Relatórios</h1><p class="mudo">Gastos por período, fornecedor, categoria, responsável, status e serviço</p></div>
        <div class="acoes"><a class="btn" href="/api/relatorios/csv${qs(f)}">${ic('baixar')}Exportar CSV</a><button class="btn" data-acao="imprimir">${ic('imprimir')}Gerar PDF</button></div></div>
      <section class="painel mb"><form class="filtros nao-imprimir" data-filtros>
        ${campo('De', `<input type="date" name="de" value="${esc(f.de)}">`)}${campo('Até', `<input type="date" name="ate" value="${esc(f.ate)}">`)}
        ${campo('Agrupar por', `<select name="agrupar">${opcoes(AGRUPAR, f.agrupar)}</select>`)}
        ${campo('Categoria', `<select name="categoria">${opcoes(Object.fromEntries(S.categorias.map((c) => [c, c])), f.categoria, 'Todas')}</select>`)}
        ${campo('Fornecedor', `<input type="text" name="fornecedor" value="${esc(f.fornecedor)}">`)}
        ${campo('Responsável', `<select name="responsavel_id">${A.opcoesUsuarios(f.responsavel_id, 'Todos')}</select>`)}
        ${campo('Status', `<select name="status"><option value="">Todos (exceto cancelados)</option><option value="abertos"${f.status === 'abertos' ? ' selected' : ''}>Em aberto</option>${opcoes(A.STATUS, f.status)}</select>`)}
        <button class="btn primario" type="submit">Gerar</button></form>
        <div class="faixa-kpi" style="border-bottom:1px solid var(--linha)">
          <div class="kpi"><div class="rotulo">Total no período</div><div class="valor num">${brl(r.totais.total)}</div><div class="det">${r.totais.qtd} lançamento(s)</div></div>
          <div class="kpi"><div class="rotulo">Pago</div><div class="valor num">${brl(r.totais.pago)}</div></div>
          <div class="kpi"><div class="rotulo">Pendente</div><div class="valor num">${brl(r.totais.pendente)}</div></div>
          <div class="kpi"><div class="rotulo">Média por ${r.agrupar === 'mes' ? 'mês' : 'grupo'}</div><div class="valor num">${brl(r.grupos.length ? Math.round(r.totais.total / r.grupos.length) : 0)}</div></div></div>
        ${r.grupos.length ? `<div class="tabela-wrap"><table><thead><tr><th>${AGRUPAR[r.agrupar]}</th><th class="dir">Lançamentos</th><th class="dir">Total</th><th class="dir">Pago</th><th class="dir">Pendente</th><th style="width:22%"></th></tr></thead><tbody>
          ${r.grupos.map((g) => `<tr><td>${esc(r.agrupar === 'mes' ? A.compLonga(g.grupo) : (g.rotulo || g.grupo || '—'))}</td><td class="dir num">${g.qtd}</td><td class="dir num"><b>${brl(g.total)}</b></td><td class="dir num">${brl(g.pago)}</td><td class="dir num">${brl(g.pendente)}</td>
            <td><div class="barra-h"><div class="trilho"><div style="width:${(g.total / Math.max(1, ...r.grupos.map((x) => x.total))) * 100}%"></div></div></div></td></tr>`).join('')}
        </tbody><tfoot><tr><td>Total</td><td class="dir num">${r.totais.qtd}</td><td class="dir num">${brl(r.totais.total)}</td><td class="dir num">${brl(r.totais.pago)}</td><td class="dir num">${brl(r.totais.pendente)}</td><td></td></tr></tfoot></table></div>`
        : vazio('Sem lançamentos no período', 'Ajuste as datas ou os filtros.')}</section>
      <div class="grade g-2 mb">
        <section class="painel"><div class="painel-cab"><h2>Projeção dos próximos 12 meses</h2><span class="fraco">pelas recorrências ativas</span></div><div class="painel-corpo"><div class="barras-h">
          ${ind.projecao.map((x) => `<div class="barra-h"><div class="topo-b"><span>${A.compLonga(x.competencia)}</span><span class="num">${brl(x.total)}</span></div><div class="trilho"><div style="width:${(x.total / maxProj) * 100}%"></div></div></div>`).join('')}
          <div class="topo-b" style="display:flex;justify-content:space-between;border-top:1px solid var(--linha);padding-top:10px"><b>Total projetado</b><b class="num">${brl(ind.projecao.reduce((t, x) => t + x.total, 0))}</b></div></div></div></section>
        <section class="painel"><div class="painel-cab"><h2>Serviços mais caros</h2><span class="fraco">custo mensal</span></div>
          ${ind.mais_caros.length ? `<table><tbody>${ind.mais_caros.map((s, i) => `<tr><td class="fraco num" style="width:30px">${i + 1}</td><td><a href="#/servicos/${s.id}">${esc(s.nome)}</a><div class="fraco">${esc(s.fornecedor)}</div></td><td class="dir num">${brl(s.mensal)}</td></tr>`).join('')}</tbody></table>` : vazio('Sem serviços ativos', '')}</section>
      </div>
      <div class="grade g-2">
        <section class="painel"><div class="painel-cab"><h2>Aumentos de preço</h2></div>
          ${ind.aumentos.length ? `<div class="tabela-wrap"><table><thead><tr><th>Serviço</th><th class="dir">Antes</th><th class="dir">Depois</th><th class="dir">Variação</th><th>Quando</th></tr></thead><tbody>${ind.aumentos.map((a) =>
            `<tr><td><a href="#/servicos/${a.servico_id}">${esc(a.nome)}</a></td><td class="dir num">${brl(a.valor_anterior_centavos)}</td><td class="dir num">${brl(a.valor_novo_centavos)}</td>
            <td class="dir variacao-up">+${((a.valor_novo_centavos / a.valor_anterior_centavos - 1) * 100).toFixed(1).replace('.', ',')}%</td><td>${dataBR(a.detectado_em)}</td></tr>`).join('')}</tbody></table></div>` : vazio('Nenhum aumento registrado', '')}</section>
        <section class="painel"><div class="painel-cab"><h2>Serviços cancelados</h2></div>
          ${ind.cancelados.length ? `<table><tbody>${ind.cancelados.map((s) => `<tr><td><a href="#/servicos/${s.id}">${esc(s.nome)}</a><div class="fraco">${esc(s.fornecedor)} · ${esc(s.categoria)}</div></td><td class="dir num">${A.moeda(s.valor_centavos, s.moeda)}</td><td class="fraco">${dataBR(s.atualizado_em)}</td></tr>`).join('')}</tbody></table>` : vazio('Nenhum serviço cancelado', '')}</section>
      </div>`;
    el.querySelector('[data-filtros]').addEventListener('submit', (e) => { e.preventDefault(); location.hash = `#/relatorios${qs(A.coletar(e.target))}`; });
  });
  S.acoes.imprimir = () => window.print();

  // ================= NOTIFICAÇÕES =================
  const WPP = { pendente_conexao: 'WhatsApp: pendente de conexão', na_fila: 'WhatsApp: na fila', enviado: 'WhatsApp: enviado', entregue: 'WhatsApp: entregue', lido: 'WhatsApp: lido', falhou: 'WhatsApp: falhou' };
  const COR_TIPO = { vencimento: 'var(--pendente)', atraso: 'var(--atraso)', renovacao: 'var(--renov)', aumento: 'var(--atraso)', cobranca: 'var(--fatura)', prazo: 'var(--marca)', audiencia: 'var(--renov)' };
  rota(/^\/notificacoes$/, null, 'Notificações', async (el, _m, p) => {
    const r = await api('GET', `/notificacoes${p.nao_lidas ? '?nao_lidas=1' : ''}`);
    el.innerHTML = `<div class="cabecalho"><div><h1>Notificações</h1><p class="mudo">${r.nao_lidas} não lida(s)</p></div>
      <div class="acoes"><a class="btn" href="#/notificacoes${p.nao_lidas ? '' : '?nao_lidas=1'}">${p.nao_lidas ? 'Mostrar todas' : 'Só não lidas'}</a>${r.nao_lidas ? '<button class="btn" data-acao="lerTodas">Marcar todas como lidas</button>' : ''}<a class="btn fantasma" href="#/perfil">Preferências de alerta</a></div></div>
      <section class="painel">${r.itens.length ? `<div class="sinais">${r.itens.map((n) => `<div class="sinal" style="${n.lida_em ? 'opacity:.72' : ''}">
        <span class="marcador" style="background:${COR_TIPO[n.tipo] || 'var(--marca)'}"></span>
        <div style="flex:1;min-width:0"><b>${esc(n.titulo)}</b><div class="mudo">${esc(n.mensagem)}</div>
          <div class="fraco">${A.dataHoraBR(n.criado_em)}${n.whatsapp_status ? ` · ${esc(WPP[n.whatsapp_status])}` : ''}${n.lida_em ? ` · lida ${A.dataHoraBR(n.lida_em)}` : ''}</div></div>
        <div class="acoes">${n.lancamento_id ? `<a class="btn pequeno" href="#/lancamentos/${n.lancamento_id}" data-acao="abrirNotif" data-id="${n.id}" data-href="#/lancamentos/${n.lancamento_id}">Abrir lançamento</a>` : n.servico_id ? `<a class="btn pequeno" href="#/servicos/${n.servico_id}" data-acao="abrirNotif" data-id="${n.id}" data-href="#/servicos/${n.servico_id}">Abrir serviço</a>` : n.demanda_id ? `<a class="btn pequeno" href="#/juridico/demandas/${n.demanda_id}" data-acao="abrirNotif" data-id="${n.id}" data-href="#/juridico/demandas/${n.demanda_id}">Abrir demanda</a>` : ''}
          ${n.lida_em ? '' : `<button class="btn pequeno fantasma" data-acao="lerNotif" data-id="${n.id}">Marcar como lida</button>`}</div></div>`).join('')}</div>`
        : vazio('Nenhuma notificação', 'Os alertas de vencimentos, atrasos, renovações, aumentos, prazos e audiências aparecem aqui.')}</section>`;
  });
  S.acoes.lerNotif = async (b) => { await api('POST', `/notificacoes/${b.dataset.id}/lida`); A.atualizarContador(); A.navegar(); };
  S.acoes.abrirNotif = async (b) => { await api('POST', `/notificacoes/${b.dataset.id}/lida`).catch(() => {}); A.atualizarContador(); location.hash = b.dataset.href; };
  S.acoes.lerTodas = async () => { await api('POST', '/notificacoes/ler-todas'); A.atualizarContador(); A.navegar(); };

  // ================= USUÁRIOS =================
  function formUsuario(u) {
    const extras = u?.permissoes_extra || { add: [], remove: [] };
    const perms = S.meta.permissoes_disponiveis;
    return `<div class="form-grade">
      ${campo('Nome', `<input type="text" name="nome" required value="${esc(u?.nome)}">`)}
      ${campo('E-mail', `<input type="email" name="email" required value="${esc(u?.email)}" ${u ? 'disabled' : ''}>`)}
      ${campo('Perfil', `<select name="perfil" data-perfil>${opcoes(A.PERFIL, u?.perfil || 'consulta')}</select>`)}
      ${campo('WhatsApp', `<input type="tel" name="whatsapp" value="${esc(u?.whatsapp)}" placeholder="(21) 99999-9999"><small>Para receber alertas, se a integração estiver conectada.</small>`)}
      ${u ? `<label class="checar inteiro"><input type="checkbox" name="ativo" ${u.ativo ? 'checked' : ''}> Usuário ativo</label>` : campo('Senha inicial', '<input type="password" name="senha" required minlength="10" autocomplete="new-password"><small>Mínimo de 10 caracteres. Peça para a pessoa trocar no primeiro acesso.</small>', 'inteiro')}
      <div class="form-secao">Permissões personalizadas <span class="fraco" style="font-weight:400">— só altere o que for exceção ao perfil</span></div>
      <div class="inteiro tabela-wrap"><table><tbody>${Object.entries(perms).map(([k, t]) => {
        const v = extras.add.includes(k) ? 'add' : extras.remove.includes(k) ? 'remove' : '';
        return `<tr><td>${esc(t)}<div class="fraco" data-padrao="${k}"></div></td><td style="width:170px"><select name="perm_${k}">${opcoes({ add: 'Conceder', remove: 'Retirar' }, v, 'Padrão do perfil')}</select></td></tr>`;
      }).join('')}</tbody></table></div></div>`;
  }
  function atualizarPadroes(form) {
    const perfil = form.querySelector('[data-perfil]').value;
    for (const el of form.querySelectorAll('[data-padrao]')) el.textContent = S.meta.perfis[perfil].includes(el.dataset.padrao) ? 'Incluída no perfil' : 'Não incluída no perfil';
  }
  function dadosUsuario(d) {
    const permissoes_extra = { add: [], remove: [] };
    for (const [k, v] of Object.entries(d)) if (k.startsWith('perm_') && v) permissoes_extra[v].push(k.slice(5));
    return { nome: d.nome, email: d.email, perfil: d.perfil, whatsapp: d.whatsapp, senha: d.senha, ativo: d.ativo, permissoes_extra };
  }
  rota(/^\/usuarios$/, 'usuarios.gerenciar', 'Usuários', async (el) => {
    const lista = await api('GET', '/usuarios');
    el.innerHTML = `<div class="cabecalho"><div><h1>Usuários</h1><p class="mudo">Quem acessa o AS Control e o que cada pessoa pode fazer</p></div>
      <div class="acoes"><button class="btn primario" data-acao="novoUsuario">${ic('mais')}Novo usuário</button></div></div>
      <section class="painel mb"><div class="tabela-wrap"><table><thead><tr><th>Nome</th><th>Perfil</th><th>WhatsApp</th><th>Último acesso</th><th>Status</th><th></th></tr></thead><tbody>
        ${lista.map((u) => `<tr><td><div class="principal-txt">${esc(u.nome)}</div><div class="fraco">${esc(u.email)}</div></td><td>${esc(A.PERFIL[u.perfil])}${u.permissoes_extra.add.length || u.permissoes_extra.remove.length ? '<div class="fraco">com ajustes</div>' : ''}</td>
          <td>${esc(u.whatsapp || '—')}</td><td>${A.dataHoraBR(u.ultimo_acesso)}</td><td>${u.ativo ? etq('ativo') : etq('cancelado', 'Inativo')}</td>
          <td class="dir"><button class="btn pequeno" data-acao="editarUsuario" data-id="${u.id}">Editar</button> <button class="btn pequeno fantasma" data-acao="senhaUsuario" data-id="${u.id}">Redefinir senha</button></td></tr>`).join('')}
      </tbody></table></div></section>
      <section class="painel"><div class="painel-cab"><h2>O que cada perfil pode fazer</h2></div><div class="tabela-wrap"><table><thead><tr><th>Permissão</th>${Object.values(A.PERFIL).map((p) => `<th style="text-align:center">${p}</th>`).join('')}</tr></thead><tbody>
        ${Object.entries(S.meta.permissoes_disponiveis).map(([k, t]) => `<tr><td>${esc(t)}</td>${Object.keys(A.PERFIL).map((p) => `<td style="text-align:center">${S.meta.perfis[p].includes(k) ? '✓' : '<span class="fraco">—</span>'}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div></section>`;
    S.acoes.novoUsuario = () => A.modal({
      titulo: 'Novo usuário', largo: true, botao: 'Criar usuário', corpo: formUsuario(null),
      aoAbrir: (f) => { atualizarPadroes(f); f.querySelector('[data-perfil]').addEventListener('change', () => atualizarPadroes(f)); },
      aoEnviar: async (d) => { await api('POST', '/usuarios', dadosUsuario(d)); A.toast('Usuário criado.'); S.usuarios = await api('GET', '/usuarios/opcoes'); A.navegar(); },
    });
    S.acoes.editarUsuario = (b) => {
      const u = lista.find((x) => String(x.id) === b.dataset.id);
      A.modal({
        titulo: `Editar ${u.nome}`, largo: true, botao: 'Salvar alterações', corpo: formUsuario(u),
        aoAbrir: (f) => { atualizarPadroes(f); f.querySelector('[data-perfil]').addEventListener('change', () => atualizarPadroes(f)); },
        aoEnviar: async (d) => { await api('PUT', `/usuarios/${u.id}`, dadosUsuario(d)); A.toast('Usuário atualizado.'); S.usuarios = await api('GET', '/usuarios/opcoes'); A.navegar(); },
      });
    };
    S.acoes.senhaUsuario = (b) => A.modal({
      titulo: 'Redefinir senha', botao: 'Redefinir senha',
      corpo: `<p class="mudo" style="margin-bottom:14px">A pessoa será desconectada e precisará entrar com a nova senha.</p>${campo('Nova senha', '<input type="password" name="senha" required minlength="10" autocomplete="new-password">')}`,
      aoEnviar: async (d) => { await api('PUT', `/usuarios/${b.dataset.id}/senha`, d); A.toast('Senha redefinida.'); },
    });
  });

  // ================= ALERTAS E INTEGRAÇÕES =================
  const ENVIO = { pendente_conexao: ['cancelado', 'Pendente de conexão'], na_fila: ['aguardando_fatura', 'Na fila'], enviado: ['aprovado', 'Enviado'], entregue: ['pago', 'Entregue'], lido: ['pago', 'Lido'], falhou: ['atrasado', 'Falhou'] };
  rota(/^\/configuracoes$/, 'config.gerenciar', 'Alertas e integrações', async (el) => {
    const c = await api('GET', '/config');
    const tipos = c.tipos_alerta;
    const extras = c.whatsapp_destinatarios_extras || [];
    const linhaExtra = (d = {}) => `<div class="grade" data-extra style="grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;padding:12px 0;border-bottom:1px solid var(--linha)">
      ${campo('Nome', `<input type="text" data-k="nome" value="${esc(d.nome || '')}" placeholder="Ex.: Financeiro">`)}${campo('Número', `<input type="tel" data-k="numero" value="${esc(d.numero || '')}" placeholder="5521999999999">`)}
      <button type="button" class="btn pequeno perigo" data-acao="removerExtra">Remover</button>
      <div class="opcoes-checar" style="grid-column:1/-1">${Object.entries(tipos).map(([k, t]) => `<label class="checar"><input type="checkbox" data-tipo="${k}" ${(d.tipos || ['vencimento', 'atraso']).includes(k) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div></div>`;
    el.innerHTML = `<div class="cabecalho"><div><h1>Alertas e integrações</h1><p class="mudo">Prazos dos avisos, aprovação de pagamentos, cotações e WhatsApp</p></div>
      <div class="acoes"><button class="btn" data-acao="rodarRotinas">Executar verificação agora</button></div></div>
      <div class="grade g-2 mb">
        <form class="painel" data-cfg="alertas"><div class="painel-cab"><h2>Alertas de vencimento</h2></div><div class="painel-corpo form-grade">
          ${campo('Avisar quantos dias antes', `<input type="text" name="alertas_dias_antes" value="${esc((c.alertas_dias_antes || []).join(', '))}"><small>Separe por vírgula. 0 = no dia do vencimento.</small>`)}
          ${campo('Avisar antes da renovação (dias)', `<input type="text" name="alertas_renovacao_dias" value="${esc((c.alertas_renovacao_dias || []).join(', '))}">`)}
          <label class="checar inteiro"><input type="checkbox" name="alerta_atraso_diario" ${c.alerta_atraso_diario ? 'checked' : ''}> Avisar todos os dias enquanto uma conta estiver vencida</label>
          ${campo('Destacar aumento a partir de (%)', `<input type="text" name="aumento_minimo_percentual" value="${esc(String(c.aumento_minimo_percentual).replace('.', ','))}">`)}
          ${campo('Gerar vencimentos com antecedência de (dias)', `<input type="number" name="horizonte_geracao_dias" min="7" max="400" value="${esc(c.horizonte_geracao_dias)}">`)}
          <div class="inteiro"><button class="btn primario" type="submit">Salvar alertas</button></div></div></form>
        <form class="painel" data-cfg="aprovacao"><div class="painel-cab"><h2>Aprovação e moedas</h2></div><div class="painel-corpo form-grade">
          <label class="checar inteiro"><input type="checkbox" name="aprovacao_ativa" ${c.aprovacao_ativa ? 'checked' : ''}> Exigir aprovação antes de pagar valores altos</label>
          ${campo('Exigir aprovação a partir de', `<input type="text" name="aprovacao_acima" inputmode="decimal" value="${esc(A.paraInput(c.aprovacao_acima_centavos))}"><small>Despesas menores são pagas sem etapa de aprovação.</small>`)}
          <div></div>
          ${campo('Cotação do dólar (R$)', `<input type="text" name="usd" value="${esc(String(c.cotacoes?.USD ?? '').replace('.', ','))}"><small>Usada para serviços cobrados em US$.</small>`)}
          ${campo('Cotação do euro (R$)', `<input type="text" name="eur" value="${esc(String(c.cotacoes?.EUR ?? '').replace('.', ','))}">`)}
          <div class="inteiro"><button class="btn primario" type="submit">Salvar</button></div></div></form>
      </div>
      <form class="painel mb" data-cfg="juridico"><div class="painel-cab"><h2>Alertas jurídicos</h2></div><div class="painel-corpo form-grade tres">
        ${campo('Avisar prazos quantos dias antes', `<input type="text" name="juridico_alertas_prazo" value="${esc((c.juridico_alertas_prazo || []).join(', '))}"><small>0 = no dia. Prazos vencidos são avisados diariamente.</small>`)}
        ${campo('Avisar audiências quantos dias antes', `<input type="text" name="juridico_alertas_audiencia" value="${esc((c.juridico_alertas_audiencia || []).join(', '))}">`)}
        ${campo('Demanda parada depois de (dias sem andamento)', `<input type="number" name="juridico_dias_sem_andamento" min="5" max="365" value="${esc(c.juridico_dias_sem_andamento ?? 30)}">`)}
        <div class="inteiro"><button class="btn primario" type="submit">Salvar alertas jurídicos</button></div></div></form>
      <section class="painel mb"><div class="painel-cab"><h2>${ic('whatsapp').replace('<svg', '<svg width="18" height="18" style="vertical-align:-3px;margin-right:6px"')}WhatsApp</h2>${etq(c.whatsapp.conectado ? 'pago' : 'cancelado', c.whatsapp.conectado ? 'Conectado' : 'Pendente de conexão')}</div>
        <div class="painel-corpo">
          <div class="aviso ${c.whatsapp.conectado ? 'azul' : 'amarelo'} mb">${esc(c.whatsapp.mensagem)}${!c.whatsapp.conectado ? ' Os alertas continuam aparecendo dentro do sistema e ficam registrados como "pendente de conexão" — nenhum envio é simulado. As credenciais do provedor são configuradas no servidor (arquivo .env).' : ''}${c.whatsapp.conectado && c.whatsapp.usa_template === false ? ' Atenção: sem template aprovado, a Meta só entrega mensagens dentro da janela de 24h de conversa.' : ''}</div>
          <p class="mudo" style="margin-bottom:10px">Cada usuário informa o próprio número e escolhe os alertas em <a href="#/perfil">Meu perfil</a>. Abaixo, números adicionais que recebem alertas (ex.: celular do financeiro).</p>
          <form data-cfg="extras"><div data-lista-extras>${extras.map(linhaExtra).join('')}</div>
            <div class="acoes" style="margin-top:12px"><button type="button" class="btn" data-acao="addExtra">${ic('mais')}Adicionar número</button><button class="btn primario" type="submit">Salvar destinatários</button></div></form>
          <form data-cfg="teste" class="acoes" style="margin-top:20px;padding-top:16px;border-top:1px solid var(--linha);align-items:flex-end">
            ${campo('Enviar mensagem de teste para', `<input type="tel" name="numero" value="${esc(S.usuario.whatsapp || '')}" placeholder="5521999999999">`)}
            <button class="btn" type="submit" ${c.whatsapp.conectado ? '' : 'disabled title="Conecte um provedor primeiro"'}>Enviar teste</button></form>
        </div>
        ${c.envios_recentes.length ? `<div class="tabela-wrap"><table><thead><tr><th>Quando</th><th>Destino</th><th>Tipo</th><th>Situação</th><th>Detalhe</th></tr></thead><tbody>
          ${c.envios_recentes.map((e) => `<tr><td>${A.dataHoraBR(e.criado_em)}</td><td>${esc(e.destino_nome || '')}<div class="fraco">${esc(e.destino)}</div></td><td>${esc(tipos[e.tipo] || e.tipo)}</td>
            <td>${etq(ENVIO[e.status][0], ENVIO[e.status][1])}</td><td class="fraco">${esc(e.erro || (e.tentativas ? `${e.tentativas} tentativa(s)` : ''))}</td></tr>`).join('')}</tbody></table></div>` : ''}
      </section>
      <section class="painel"><div class="painel-cab"><h2>Entrada de cobranças por e-mail</h2>${etq(c.cobrancas_webhook_ativo ? 'pago' : 'cancelado', c.cobrancas_webhook_ativo ? 'Entrada ativa' : 'Não conectada')}</div>
        <div class="painel-corpo"><p class="mudo">Quando a caixa de cobranças for conectada (por exemplo, Gmail lido por uma automação), as cobranças identificadas entram na fila de conferência. Nada é lançado ou pago sem confirmação de uma pessoa.</p></div></section>
      ${c.ultima_rotina ? `<p class="fraco" style="margin-top:14px">Última verificação automática: ${A.dataHoraBR(c.ultima_rotina.em)} · ${c.ultima_rotina.alertas} alerta(s) novo(s).</p>` : ''}`;

    const salvar = async (corpo, msg) => { try { await api('PUT', '/config', corpo); A.toast(msg); A.navegar(); } catch (e) { A.toast(e.message, true); } };
    el.querySelector('[data-cfg="alertas"]').addEventListener('submit', (e) => { e.preventDefault(); const d = A.coletar(e.target); salvar(d, 'Alertas atualizados.'); });
    el.querySelector('[data-cfg="juridico"]').addEventListener('submit', (e) => { e.preventDefault(); salvar(A.coletar(e.target), 'Alertas jurídicos atualizados.'); });
    el.querySelector('[data-cfg="aprovacao"]').addEventListener('submit', (e) => {
      e.preventDefault(); const d = A.coletar(e.target);
      salvar({ aprovacao_ativa: d.aprovacao_ativa, aprovacao_acima: d.aprovacao_acima, cotacoes: { USD: d.usd, EUR: d.eur } }, 'Configurações salvas.');
    });
    el.querySelector('[data-cfg="extras"]').addEventListener('submit', (e) => {
      e.preventDefault();
      const lista = [...el.querySelectorAll('[data-extra]')].map((x) => ({
        nome: x.querySelector('[data-k=nome]').value, numero: x.querySelector('[data-k=numero]').value,
        tipos: [...x.querySelectorAll('[data-tipo]:checked')].map((i) => i.dataset.tipo),
      })).filter((x) => x.numero.trim());
      salvar({ whatsapp_destinatarios_extras: lista }, 'Destinatários salvos.');
    });
    el.querySelector('[data-cfg="teste"]').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { const r = await api('POST', '/config/whatsapp/teste', A.coletar(e.target)); A.toast(`Teste ${r.status === 'enviado' ? 'enviado ao provedor' : r.status}.`); A.navegar(); } catch (err) { A.toast(err.message, true); }
    });
    S.acoes.addExtra = () => el.querySelector('[data-lista-extras]').insertAdjacentHTML('beforeend', linhaExtra());
    S.acoes.removerExtra = (b) => b.closest('[data-extra]').remove();
  });
  S.acoes.rodarRotinas = async () => {
    try { const r = await api('POST', '/config/rotinas/executar'); A.toast(`Verificação concluída: ${r.gerados ?? 0} vencimento(s) gerado(s), ${r.alertas ?? 0} alerta(s) novo(s).`); A.atualizarContador(); A.navegar(); } catch (e) { A.toast(e.message, true); }
  };

  // ================= AUDITORIA =================
  const ROTULO_CAMPO = { valor_cobrado_centavos: 'Valor cobrado', valor_previsto_centavos: 'Valor previsto', valor_centavos: 'Valor', vencimento: 'Vencimento', status: 'Status', data_pagamento: 'Data de pagamento', responsavel_id: 'Responsável', perfil: 'Perfil', ativo: 'Ativo', nome: 'Nome', base_vencimento: 'Data-base', periodicidade: 'Periodicidade', observacoes: 'Observações', numero_fatura: 'Nº da fatura', pago_por: 'Pago por', aprovado_por: 'Aprovado por', data_renovacao: 'Renovação', fornecedor: 'Fornecedor', categoria: 'Categoria', moeda: 'Moeda', whatsapp: 'WhatsApp', permissoes_extra: 'Permissões' };
  const ignorar = new Set(['atualizado_em', 'criado_em', 'ultimo_acesso', 'aprovado_em', 'id']);
  function diferencas(antes, depois) {
    let a = {}; let d = {};
    try { a = JSON.parse(antes || '{}') || {}; d = JSON.parse(depois || '{}') || {}; } catch { return ''; }
    const nomeUsuario = (id) => S.usuarios.find((u) => u.id === Number(id))?.nome || `#${id}`;
    const fmt = (k, v) => {
      if (v == null || v === '') return '—';
      if (k.endsWith('_centavos')) return brl(v);
      if (k === 'status') return A.STATUS[v] || A.STATUS_SERV[v] || v;
      if (['pago_por', 'aprovado_por', 'responsavel_id'].includes(k)) return nomeUsuario(v);
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return dataBR(v);
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    };
    const chaves = [...new Set([...Object.keys(a), ...Object.keys(d)])].filter((k) => !ignorar.has(k) && JSON.stringify(a[k]) !== JSON.stringify(d[k]));
    if (!antes) return '';
    return chaves.slice(0, 8).map((k) => `<div class="fraco">${esc(ROTULO_CAMPO[k] || k)}: <s>${esc(fmt(k, a[k]))}</s> → <b style="color:var(--tinta)">${esc(fmt(k, d[k]))}</b></div>`).join('');
  }
  rota(/^\/auditoria$/, 'auditoria.ver', 'Auditoria', async (el, _m, p) => {
    const f = { busca: p.busca || '', entidade: p.entidade || '', usuario_id: p.usuario_id || '', de: p.de || '', ate: p.ate || '', pagina: p.pagina || '1' };
    const lista = await api('GET', `/auditoria${qs(f)}`);
    const pag = Number(f.pagina);
    const ENT = { servico: 'Serviço', lancamento: 'Lançamento', usuario: 'Usuário', documento: 'Documento', cobranca: 'Cobrança', configuracao: 'Configuração', sessao: 'Acesso', relatorio: 'Relatório', integracao: 'Integração', alteracao_preco: 'Aumento', sistema: 'Sistema', demanda: 'Demanda jurídica' };
    const link = (a) => (a.entidade === 'servico' ? `#/servicos/${a.entidade_id}` : a.entidade === 'lancamento' ? `#/lancamentos/${a.entidade_id}` : a.entidade === 'demanda' ? `#/juridico/demandas/${a.entidade_id}` : null);
    el.innerHTML = `<div class="cabecalho"><div><h1>Auditoria</h1><p class="mudo">Quem fez o quê, quando, e o que mudou</p></div></div>
      <section class="painel"><form class="filtros" data-filtros>
        ${campo('Buscar', `<input type="search" name="busca" value="${esc(f.busca)}" placeholder="Ação ou pessoa">`, 'largo')}
        ${campo('Registro', `<select name="entidade">${opcoes(ENT, f.entidade, 'Todos')}</select>`)}
        ${campo('Usuário', `<select name="usuario_id">${A.opcoesUsuarios(f.usuario_id, 'Todos')}</select>`)}
        ${campo('De', `<input type="date" name="de" value="${esc(f.de)}">`)}${campo('Até', `<input type="date" name="ate" value="${esc(f.ate)}">`)}
        <button class="btn" type="submit">Filtrar</button></form>
        ${lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data e hora</th><th>Usuário</th><th>Ação</th><th>Registro</th><th>Alterações</th></tr></thead><tbody>
          ${lista.map((a) => `<tr><td class="num">${A.dataHoraBR(a.criado_em)}</td><td>${esc(a.usuario_nome || 'Sistema')}</td><td>${esc(a.acao)}</td>
            <td>${esc(ENT[a.entidade] || a.entidade)}${a.entidade_id ? (link(a) ? ` <a href="${link(a)}">#${a.entidade_id}</a>` : ` #${a.entidade_id}`) : ''}</td><td>${diferencas(a.antes, a.depois)}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="acoes" style="padding:12px 18px;justify-content:flex-end">${pag > 1 ? `<a class="btn pequeno" href="#/auditoria${qs({ ...f, pagina: pag - 1 })}">Anterior</a>` : ''}${lista.length === 100 ? `<a class="btn pequeno" href="#/auditoria${qs({ ...f, pagina: pag + 1 })}">Próxima</a>` : ''}</div>`
        : vazio('Nenhum registro', 'Ajuste os filtros.')}</section>`;
    el.querySelector('[data-filtros]').addEventListener('submit', (e) => { e.preventDefault(); location.hash = `#/auditoria${qs(A.coletar(e.target))}`; });
  });

  // ================= MEU PERFIL =================
  rota(/^\/perfil$/, null, 'Meu perfil', async (el) => {
    const u = S.usuario; const pr = u.preferencias || {};
    const tiposWpp = pr.whatsapp_tipos ?? S.meta.tipos_wpp_padrao;
    const JUR = ['prazo', 'audiencia'];
    const tiposVisiveis = Object.entries(S.meta.tipos_alerta).filter(([k]) => (JUR.includes(k) ? pode('juridico.ver') : (k === 'cobranca' ? pode('cobrancas.conferir') : pode('lancamentos.ver'))));
    const recebeTodos = pr.receber_todos ?? (u.perfil === 'administrador' || u.perfil === 'financeiro');
    el.innerHTML = `<div class="cabecalho"><div><h1>Meu perfil</h1><p class="mudo">${esc(u.email)} · ${esc(A.PERFIL[u.perfil])}</p></div></div>
      <div class="grade g-2">
        <form class="painel" data-form="perfil"><div class="painel-cab"><h2>Dados e alertas</h2></div><div class="painel-corpo form-grade">
          ${campo('Nome', `<input type="text" name="nome" required value="${esc(u.nome)}">`)}
          ${campo('WhatsApp', `<input type="tel" name="whatsapp" value="${esc(u.whatsapp || '')}" placeholder="(21) 99999-9999">`)}
          <label class="checar inteiro"><input type="checkbox" name="receber_todos" ${recebeTodos ? 'checked' : ''}> Receber alertas de tudo a que tenho acesso (não só do que está sob minha responsabilidade)</label>
          <div class="inteiro"><div class="campo"><span>Alertas que quero receber no WhatsApp</span></div><div class="opcoes-checar" style="margin-top:8px">
            ${tiposVisiveis.map(([k, t]) => `<label class="checar"><input type="checkbox" name="whatsapp_tipos[]" value="${k}" ${tiposWpp.includes(k) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div></div>
          <div class="inteiro"><button class="btn primario" type="submit">Salvar</button></div></div></form>
        <form class="painel" data-form="senha"><div class="painel-cab"><h2>Alterar senha</h2></div><div class="painel-corpo form-grade">
          ${campo('Senha atual', '<input type="password" name="atual" required autocomplete="current-password">', 'inteiro')}
          ${campo('Nova senha', '<input type="password" name="nova" required minlength="10" autocomplete="new-password"><small>Mínimo de 10 caracteres.</small>', 'inteiro')}
          <div class="inteiro"><button class="btn primario" type="submit">Alterar senha</button></div></div></form>
      </div>`;
    el.querySelector('[data-form="perfil"]').addEventListener('submit', async (e) => {
      e.preventDefault(); const d = A.coletar(e.target);
      try {
        S.usuario = await api('PUT', '/eu', { nome: d.nome, whatsapp: d.whatsapp, preferencias: { receber_todos: d.receber_todos, whatsapp_tipos: d.whatsapp_tipos || [] } });
        A.toast('Perfil atualizado.');
      } catch (err) { A.toast(err.message, true); }
    });
    el.querySelector('[data-form="senha"]').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('PUT', '/eu/senha', A.coletar(e.target)); e.target.reset(); A.toast('Senha alterada.'); } catch (err) { A.toast(err.message, true); }
    });
  });

  A.iniciar();
})();
