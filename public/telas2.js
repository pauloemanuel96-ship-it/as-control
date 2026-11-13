'use strict';
(() => {
  const A = window.ASC; const T = window.ASC_T;
  const { esc, brl, dataBR, etq, ic, pode, rota, api, qs, campo, opcoes, vazio, S } = A;
  const ABERTOS = ['aguardando_fatura', 'fatura_recebida', 'pendente_conferencia', 'aguardando_pagamento', 'aprovado', 'atrasado'];

  // ================= CONTAS A PAGAR =================
  function abrirAvulsa() {
    A.modal({
      titulo: 'Nova despesa avulsa', botao: 'Criar despesa',
      corpo: `<p class="mudo" style="margin-bottom:14px">Para cobranças únicas, fora dos serviços recorrentes.</p><div class="form-grade">
        ${campo('Descrição', '<input type="text" name="descricao" required maxlength="200">', 'inteiro')}
        ${campo('Fornecedor', '<input type="text" name="fornecedor" required>')}
        ${campo('Categoria', `<input type="text" name="categoria" required list="cat-avulsa"><datalist id="cat-avulsa">${S.categorias.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`)}
        ${campo('Valor', '<input type="text" name="valor" inputmode="decimal" required placeholder="0,00">')}
        ${campo('Vencimento', '<input type="date" name="vencimento" required>')}
        ${campo('Responsável', `<select name="responsavel_id">${A.opcoesUsuarios(S.usuario.id)}</select>`)}
        ${campo('Nº da fatura', '<input type="text" name="numero_fatura">')}
        ${campo('Observações', '<textarea name="observacoes"></textarea>', 'inteiro')}</div>`,
      aoEnviar: async (d) => { const r = await api('POST', '/lancamentos', d); A.toast('Despesa criada.'); location.hash = `#/lancamentos/${r.id}`; },
    });
  }
  S.acoes.novaAvulsa = abrirAvulsa;

  rota(/^\/lancamentos$/, 'lancamentos.ver', 'Contas a pagar', async (el, _m, p) => {
    const f = { status: p.status ?? 'abertos', de: p.de || '', ate: p.ate || '', categoria: p.categoria || '', responsavel_id: p.responsavel_id || '', busca: p.busca || '' };
    const lista = await api('GET', `/lancamentos${qs(f)}`);
    const total = lista.filter((l) => l.status !== 'cancelado').reduce((t, l) => t + (l.valor_cobrado_centavos ?? l.valor_previsto_centavos), 0);
    const h = A.hojeSP();
    el.innerHTML = `<div class="cabecalho"><div><h1>Contas a pagar</h1><p class="mudo">Lançamentos gerados pelos serviços e despesas avulsas</p></div>
      <div class="acoes">${pode('lancamentos.editar') ? `<button class="btn primario" data-acao="novaAvulsa">${ic('mais')}Despesa avulsa</button>` : ''}</div></div>
      <section class="painel"><form class="filtros" data-filtros>
        ${campo('Buscar', `<input type="search" name="busca" value="${esc(f.busca)}" placeholder="Serviço, fornecedor ou nº da fatura">`, 'largo')}
        ${campo('Status', `<select name="status"><option value="abertos"${f.status === 'abertos' ? ' selected' : ''}>Em aberto</option>${opcoes(A.STATUS, f.status, 'Todos')}</select>`)}
        ${campo('Vencimento de', `<input type="date" name="de" value="${esc(f.de)}">`)}${campo('até', `<input type="date" name="ate" value="${esc(f.ate)}">`)}
        ${campo('Categoria', `<select name="categoria">${opcoes(Object.fromEntries(S.categorias.map((c) => [c, c])), f.categoria, 'Todas')}</select>`)}
        ${campo('Responsável', `<select name="responsavel_id">${A.opcoesUsuarios(f.responsavel_id, 'Todos')}</select>`)}
        <button class="btn" type="submit">Filtrar</button></form>
        ${lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Vencimento</th><th>Serviço / despesa</th><th>Competência</th><th class="dir">Previsto</th><th class="dir">Cobrado</th><th>Status</th><th>Responsável</th></tr></thead><tbody>
          ${lista.map((l) => { const dd = A.diff(l.vencimento, h); const aberto = ABERTOS.includes(l.status);
            return `<tr class="clicavel" data-ir="#/lancamentos/${l.id}" tabindex="0"><td class="num"><b>${dataBR(l.vencimento)}</b>${aberto ? `<div class="fraco">${dd === 0 ? 'hoje' : dd === 1 ? 'amanhã' : dd < 0 ? `${-dd} dia(s) de atraso` : `em ${dd} dias`}</div>` : ''}</td>
            <td><div class="principal-txt">${esc(l.descricao)}${l.qtd_documentos ? ` <span class="fraco" title="Documentos anexados">${ic('clipe').replace('<svg', '<svg width="13" height="13"')}${l.qtd_documentos}</span>` : ''}</div><div class="fraco">${esc(l.fornecedor || '')}${l.avulsa ? ' · avulsa' : ''}</div></td>
            <td>${A.compCurta(l.competencia)}</td><td class="dir num">${brl(l.valor_previsto_centavos)}</td><td class="dir num">${brl(l.valor_cobrado_centavos)}</td><td>${etq(l.status)}</td><td>${esc(l.responsavel_nome || '—')}</td></tr>`; }).join('')}
          </tbody><tfoot><tr><td colspan="4">${lista.length} lançamento(s)</td><td class="dir num">${brl(total)}</td><td colspan="2"></td></tr></tfoot></table></div>`
        : vazio('Nenhum lançamento encontrado', f.status === 'abertos' ? 'Não há contas em aberto com estes filtros.' : 'Ajuste os filtros para ver outros resultados.')}
      </section>`;
    el.querySelector('[data-filtros]').addEventListener('submit', (e) => { e.preventDefault(); location.hash = `#/lancamentos${qs(A.coletar(e.target)) || '?status='}`; });
    if (p.nova && pode('lancamentos.editar')) { history.replaceState(null, '', '#/lancamentos'); abrirAvulsa(); }
  });

  rota(/^\/lancamentos\/(\d+)$/, 'lancamentos.ver', 'Lançamento', async (el, m) => {
    const l = await api('GET', `/lancamentos/${m[1]}`);
    const aberto = ABERTOS.includes(l.status);
    const valor = l.valor_cobrado_centavos ?? l.valor_previsto_centavos;
    const linha = (r, v) => `<div><dt>${esc(r)}</dt><dd>${v || '—'}</dd></div>`;
    const dif = l.valor_cobrado_centavos != null ? l.valor_cobrado_centavos - l.valor_previsto_centavos : 0;
    el.innerHTML = `<div class="cabecalho"><div><a href="#/lancamentos" class="fraco">← Contas a pagar</a>
        <h1 style="margin-top:6px">${esc(l.descricao)}</h1><p class="mudo">${esc(l.fornecedor || '')} · competência ${A.compLonga(l.competencia)}${l.servico_id ? ` · <a href="#/servicos/${l.servico_id}">ver serviço</a>` : ' · despesa avulsa'}</p></div>
      <div class="acoes">
        ${aberto && pode('lancamentos.editar') ? '<button class="btn" data-acao="registrarCobranca">Registrar cobrança</button>' : ''}
        ${aberto && l.status !== 'aprovado' && pode('lancamentos.aprovar') ? '<button class="btn" data-acao="aprovar">Aprovar pagamento</button>' : ''}
        ${aberto && pode('lancamentos.pagar') ? '<button class="btn sucesso" data-acao="pagar">Registrar pagamento</button>' : ''}
        ${l.status === 'pago' && pode('lancamentos.pagar') ? '<button class="btn" data-acao="desfazerPagamento">Desfazer pagamento</button>' : ''}
        ${aberto && pode('lancamentos.editar') ? '<button class="btn perigo" data-acao="cancelarLanc">Cancelar</button>' : ''}
      </div></div>
      ${l.status === 'atrasado' ? `<div class="aviso vermelho mb">Vencido há ${-A.diff(l.vencimento, A.hojeSP())} dia(s). Verifique o pagamento.</div>` : ''}
      ${l.exige_aprovacao && aberto && l.status !== 'aprovado' ? '<div class="aviso amarelo mb">Este valor exige aprovação de um gestor ou administrador antes do pagamento.</div>' : ''}
      ${l.aumento && !l.aumento.revisado ? `<div class="aviso amarelo mb">Valor cobrado acima do previsto: ${brl(l.aumento.valor_anterior_centavos)} → ${brl(l.aumento.valor_novo_centavos)}. Confira antes de pagar.</div>` : ''}
      <div class="grade g-2-1 mb">
        <section class="painel"><div class="painel-corpo" style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-end;border-bottom:1px solid var(--linha)">
            <div><div class="fraco">${l.status === 'pago' ? 'Valor pago' : l.valor_cobrado_centavos != null ? 'Valor cobrado' : 'Valor previsto'}</div><div class="valor-destaque num">${brl(valor)}</div>
            ${dif ? `<div class="${dif > 0 ? 'variacao-up' : 'variacao-down'}">${dif > 0 ? '+' : ''}${brl(dif)} em relação ao previsto</div>` : ''}</div>
            <div class="dir">${etq(l.status)}<div class="fraco" style="margin-top:6px">Vencimento ${dataBR(l.vencimento)}</div></div></div>
          <dl class="detalhes" style="margin:0">
            ${linha('Valor previsto', brl(l.valor_previsto_centavos))}${linha('Valor cobrado', brl(l.valor_cobrado_centavos))}
            ${linha('Vencimento', dataBR(l.vencimento))}${linha('Data de pagamento', dataBR(l.data_pagamento))}
            ${linha('Responsável', esc(l.responsavel_nome))}${linha('Nº da fatura', esc(l.numero_fatura))}
            ${linha('Forma de pagamento', esc(l.forma_pagamento))}${linha('Link para pagamento', l.link_pagamento ? `<a href="${esc(l.link_pagamento)}" target="_blank" rel="noopener noreferrer">Abrir</a>` : '')}
            ${linha('Aprovado por', l.aprovado_por_nome ? `${esc(l.aprovado_por_nome)} em ${A.dataHoraBR(l.aprovado_em)}` : '')}${linha('Pagamento registrado por', esc(l.pago_por_nome))}
            ${l.observacoes ? `<div style="grid-column:1/-1"><dt>Observações</dt><dd style="white-space:pre-line">${esc(l.observacoes)}</dd></div>` : ''}
          </dl></section>
        <div class="grade" style="align-content:start">
          ${T.blocoDocumentos(l.documentos, `data-lancamento="${l.id}" data-competencia="${esc(l.competencia)}"`)}
          ${l.historico ? `<section class="painel"><div class="painel-cab"><h2>Histórico</h2></div>${l.historico.length ? `<ul class="linha-tempo">${l.historico.map((h) => `<li><b>${esc(h.usuario_nome)}</b> ${esc(h.acao)}<div class="fraco">${A.dataHoraBR(h.criado_em)}</div></li>`).join('')}</ul>` : '<div class="vazio" style="padding:20px">Sem alterações registradas.</div>'}</section>` : ''}
        </div></div>`;

    S.acoes.registrarCobranca = () => A.modal({
      titulo: 'Registrar cobrança', botao: 'Salvar cobrança',
      corpo: `<div class="form-grade">
        ${campo('Valor cobrado', `<input type="text" name="valor_cobrado" inputmode="decimal" value="${esc(A.paraInput(l.valor_cobrado_centavos))}" placeholder="${esc(A.paraInput(l.valor_previsto_centavos))}"><small>Previsto: ${brl(l.valor_previsto_centavos)}</small>`)}
        ${campo('Vencimento', `<input type="date" name="vencimento" required value="${esc(l.vencimento)}">`)}
        ${campo('Nº da fatura', `<input type="text" name="numero_fatura" value="${esc(l.numero_fatura)}">`)}
        ${campo('Status', `<select name="status">${opcoes(Object.fromEntries(['aguardando_fatura', 'fatura_recebida', 'pendente_conferencia', 'aguardando_pagamento'].map((s) => [s, A.STATUS[s]])), ['aguardando_fatura', 'fatura_recebida', 'pendente_conferencia', 'aguardando_pagamento'].includes(l.status) ? l.status : 'aguardando_pagamento')}</select>`)}
        ${campo('Responsável', `<select name="responsavel_id">${A.opcoesUsuarios(l.responsavel_id)}</select>`)}
        ${campo('Observações', `<textarea name="observacoes">${esc(l.observacoes)}</textarea>`, 'inteiro')}</div>`,
      aoEnviar: async (d) => { await api('PUT', `/lancamentos/${l.id}`, d); A.toast('Cobrança registrada.'); A.navegar(); },
    });
    S.acoes.aprovar = async () => {
      if (!(await A.confirmar('Aprovar pagamento', `Aprovar o pagamento de ${brl(valor)} para ${l.descricao}?`, 'Aprovar', false))) return;
      try { await api('POST', `/lancamentos/${l.id}/aprovar`); A.toast('Pagamento aprovado.'); A.navegar(); } catch (e) { A.toast(e.message, true); }
    };
    S.acoes.pagar = () => A.modal({
      titulo: 'Registrar pagamento', botao: 'Confirmar pagamento',
      corpo: `<p class="mudo" style="margin-bottom:14px">Registre apenas pagamentos já realizados. Depois, anexe o comprovante.</p><div class="form-grade">
        ${campo('Valor pago', `<input type="text" name="valor_pago" inputmode="decimal" required value="${esc(A.paraInput(valor))}">`)}
        ${campo('Data do pagamento', `<input type="date" name="data_pagamento" required max="${A.hojeSP()}" value="${A.hojeSP()}">`)}</div>`,
      aoEnviar: async (d) => { await api('POST', `/lancamentos/${l.id}/pagar`, d); A.toast('Pagamento registrado.'); A.navegar(); },
    });
    S.acoes.desfazerPagamento = async () => {
      const motivo = await A.confirmar('Desfazer pagamento', 'O lançamento volta para "Aguardando pagamento". A ação fica registrada na auditoria.', 'Desfazer pagamento', true, true);
      if (!motivo) return;
      try { await api('POST', `/lancamentos/${l.id}/desfazer-pagamento`, { motivo }); A.toast('Pagamento desfeito.'); A.navegar(); } catch (e) { A.toast(e.message, true); }
    };
    S.acoes.cancelarLanc = async () => {
      const motivo = await A.confirmar('Cancelar lançamento', 'Use quando esta cobrança não vai acontecer (ex.: fornecedor isentou o mês). O registro fica no histórico.', 'Cancelar lançamento', true, true);
      if (!motivo) return;
      try { await api('POST', `/lancamentos/${l.id}/cancelar`, { motivo }); A.toast('Lançamento cancelado.'); A.navegar(); } catch (e) { A.toast(e.message, true); }
    };
  });

  // ================= CALENDÁRIO =================
  rota(/^\/calendario$/, 'lancamentos.ver', 'Calendário', async (el, _m, p) => {
    const d = await api('GET', `/lancamentos/calendario${qs({ mes: p.mes })}`);
    const [y, mm] = d.mes.split('-').map(Number);
    const primeiro = new Date(Date.UTC(y, mm - 1, 1)); const diasMes = new Date(Date.UTC(y, mm, 0)).getUTCDate();
    const inicio = primeiro.getUTCDay();
    const mover = (n) => { const x = new Date(Date.UTC(y, mm - 1 + n, 1)); return x.toISOString().slice(0, 7); };
    const porDia = {};
    for (const l of d.lancamentos) (porDia[l.vencimento] ||= []).push(l);
    for (const r of d.renovacoes) (porDia[r.data_renovacao] ||= []).push({ renovacao: true, ...r });
    const cor = (l) => (l.renovacao ? 's-renovacao' : l.status === 'pago' ? 's-pago' : l.status === 'atrasado' ? 's-atrasado' : l.status === 'aguardando_fatura' ? 's-aguardando_fatura' : l.status === 'cancelado' ? 's-cancelado' : 's-aguardando_pagamento');
    let celulas = '';
    const total = Math.ceil((inicio + diasMes) / 7) * 7;
    for (let i = 0; i < total; i++) {
      const dia = i - inicio + 1;
      if (dia < 1 || dia > diasMes) { celulas += '<div class="cal-dia fora"></div>'; continue; }
      const data = `${d.mes}-${String(dia).padStart(2, '0')}`;
      const itens = porDia[data] || [];
      celulas += `<div class="cal-dia${data === d.hoje ? ' hoje' : ''}${itens.length ? '' : ' sem-itens'}"><span class="n">${dia}<span class="sr"> de ${A.compLonga(d.mes)}</span></span>
        ${itens.map((l) => (l.renovacao
          ? `<a class="cal-item ${cor(l)}" href="#/servicos/${l.id}" data-dica="${esc(`Renovação do contrato de ${l.nome}`)}">↻ ${esc(l.nome)}</a>`
          : `<a class="cal-item ${cor(l)}" href="#/lancamentos/${l.id}" data-dica="${esc(`${l.descricao} · ${brl(l.valor_cobrado_centavos ?? l.valor_previsto_centavos)} · ${A.STATUS[l.status]}`)}">${esc(l.descricao)}<span class="v">${brl(l.valor_cobrado_centavos ?? l.valor_previsto_centavos)}</span></a>`)).join('')}</div>`;
    }
    const soma = d.lancamentos.filter((l) => l.status !== 'cancelado').reduce((t, l) => t + (l.valor_cobrado_centavos ?? l.valor_previsto_centavos), 0);
    el.innerHTML = `<div class="cabecalho"><div><h1>${A.compLonga(d.mes).replace(/^./, (x) => x.toUpperCase())}</h1><p class="mudo">${d.lancamentos.length} vencimento(s) · ${brl(soma)}</p></div>
      <div class="acoes"><a class="btn icone" href="#/calendario?mes=${mover(-1)}" aria-label="Mês anterior">${ic('voltar')}</a><a class="btn" href="#/calendario">Hoje</a><a class="btn icone" href="#/calendario?mes=${mover(1)}" aria-label="Próximo mês">${ic('avancar')}</a></div></div>
      <section class="painel"><div class="cal-cab">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((x) => `<div>${x}</div>`).join('')}</div><div class="cal">${celulas}</div>
        <div class="cal-legenda">${etq('aguardando_pagamento', 'Pendente')}${etq('pago', 'Pago')}${etq('atrasado', 'Vencido')}${etq('aguardando_fatura', 'Aguardando fatura')}${etq('renovacao', 'Renovação contratual')}</div></section>`;
  });

  // ================= COBRANÇAS RECEBIDAS =================
  function abrirNovaCobranca() {
    A.modal({
      titulo: 'Registrar cobrança recebida', botao: 'Enviar para conferência',
      corpo: `<p class="mudo" style="margin-bottom:14px">Use quando chegar um boleto, fatura ou aviso de cobrança. Ela entra na fila e só altera as contas depois da conferência.</p><div class="form-grade">
        ${campo('Fornecedor', '<input type="text" name="fornecedor" required>')}${campo('Valor', '<input type="text" name="valor" inputmode="decimal" required placeholder="0,00">')}
        ${campo('Vencimento', '<input type="date" name="vencimento">')}${campo('Competência', '<input type="month" name="competencia">')}
        ${campo('Nº da fatura', '<input type="text" name="numero_fatura">')}${campo('Observações', '<input type="text" name="observacoes">')}</div>`,
      aoEnviar: async (d) => { await api('POST', '/cobrancas', d); A.toast('Cobrança enviada para conferência.'); A.navegar(); },
    });
  }
  S.acoes.novaCobranca = abrirNovaCobranca;

  rota(/^\/cobrancas$/, 'cobrancas.conferir', 'Cobranças recebidas', async (el, _m, p) => {
    const status = p.status || 'pendente';
    const lista = await api('GET', `/cobrancas?status=${status}`);
    const abas = [['pendente', 'Para conferir'], ['confirmada', 'Confirmadas'], ['descartada', 'Descartadas']];
    const item = (c) => {
      const cab = `<div><b>${esc(c.fornecedor || 'Fornecedor não identificado')}</b> <span class="fraco">· ${c.origem === 'manual' ? 'registro manual' : c.origem === 'email' ? 'recebida por e-mail' : 'integração'} · ${A.dataHoraBR(c.criado_em)}</span>
        <div class="fraco">Valor <b class="num" style="color:var(--tinta)">${brl(c.valor_centavos)}</b>${c.vencimento ? ` · vencimento ${dataBR(c.vencimento)}` : ''}${c.numero_fatura ? ` · fatura ${esc(c.numero_fatura)}` : ''}${c.assunto ? ` · “${esc(c.assunto)}”` : ''}</div></div>`;
      if (status !== 'pendente') return `<div class="sinal"><div style="flex:1">${cab}<div class="fraco">${c.lancamento_id ? `<a href="#/lancamentos/${c.lancamento_id}">Lançamento vinculado</a> · ` : ''}${esc(c.revisado_por_nome || '')} ${A.dataHoraBR(c.revisado_em)}</div></div></div>`;
      return `<form class="sinal" data-conferir="${c.id}" style="flex-direction:column;gap:10px">${cab}
        ${c.sugestoes.length ? `<fieldset style="border:0;padding:0;margin:0;display:grid;gap:6px"><legend class="fraco" style="margin-bottom:6px">Qual lançamento corresponde a esta cobrança?</legend>
          ${c.sugestoes.map((s, i) => `<label class="checar"><input type="radio" name="lancamento_id" value="${s.id}"${i === 0 ? ' checked' : ''}> ${esc(s.descricao)} · venc. ${dataBR(s.vencimento)} · previsto ${brl(s.valor_previsto_centavos)}
            ${s.diferenca_centavos ? `<span class="${s.diferenca_centavos > 0 ? 'variacao-up' : 'variacao-down'}">(${s.diferenca_centavos > 0 ? '+' : ''}${brl(s.diferenca_centavos)})</span>` : ''} ${etq(s.status)}</label>`).join('')}
          <label class="checar"><input type="radio" name="lancamento_id" value="avulsa"> Nenhum destes — criar despesa avulsa</label></fieldset>
          ${c.vencimento ? '<label class="checar fraco"><input type="checkbox" name="usar_vencimento"> Atualizar a data de vencimento com a desta cobrança</label>' : ''}`
        : '<div class="fraco">Nenhum lançamento em aberto deste fornecedor. Ao confirmar, será criada uma despesa avulsa.<input type="hidden" name="lancamento_id" value="avulsa"></div>'}
        <div class="acoes"><button class="btn primario pequeno" type="submit">Confirmar cobrança</button><button class="btn pequeno perigo" type="button" data-acao="descartarCobranca" data-id="${c.id}">Descartar</button></div></form>`;
    };
    el.innerHTML = `<div class="cabecalho"><div><h1>Cobranças recebidas</h1><p class="mudo">Toda cobrança passa por conferência humana antes de alterar as contas. Nenhuma cobrança é marcada como paga automaticamente.</p></div>
      <div class="acoes"><button class="btn primario" data-acao="novaCobranca">${ic('mais')}Registrar cobrança</button></div></div>
      <section class="painel"><div class="abas">${abas.map(([k, t]) => `<button type="button" aria-selected="${k === status}" data-acao="irAba" data-href="#/cobrancas?status=${k}">${t}</button>`).join('')}</div>
        ${lista.length ? `<div class="sinais">${lista.map(item).join('')}</div>` : vazio(status === 'pendente' ? 'Fila de conferência vazia' : 'Nada por aqui', status === 'pendente' ? 'Quando uma cobrança chegar, ela aparece aqui para você vincular ao lançamento certo.' : '')}</section>
      <div class="aviso azul" style="margin-top:18px">A leitura automática da caixa de e-mail de cobranças é a próxima etapa. A entrada já está preparada: quando conectada, as cobranças chegam nesta mesma fila.</div>`;
    for (const f of el.querySelectorAll('[data-conferir]')) {
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const d = A.coletar(f);
        const corpo = d.lancamento_id === 'avulsa' ? { modo: 'avulsa' } : { lancamento_id: d.lancamento_id, usar_vencimento: !!d.usar_vencimento };
        try { const r = await api('POST', `/cobrancas/${f.dataset.conferir}/confirmar`, corpo); A.toast('Cobrança confirmada e vinculada.'); location.hash = `#/lancamentos/${r.lancamento_id}`; } catch (err) { A.toast(err.message, true); }
      });
    }
  });
  S.acoes.irAba = (b) => { location.hash = b.dataset.href; };
  S.acoes.descartarCobranca = async (b) => {
    const motivo = await A.confirmar('Descartar cobrança', 'Use para cobranças duplicadas, enviadas por engano ou que não pertencem à AS Brasil.', 'Descartar', true, true);
    if (!motivo) return;
    try { await api('POST', `/cobrancas/${b.dataset.id}/descartar`, { motivo }); A.toast('Cobrança descartada.'); A.navegar(); } catch (e) { A.toast(e.message, true); }
  };

  // ================= DOCUMENTOS =================
  rota(/^\/documentos$/, 'documentos.ver', 'Documentos', async (el, _m, p) => {
    const f = { busca: p.busca || '', tipo: p.tipo || '', competencia: p.competencia || '', fornecedor: p.fornecedor || '', origem: p.origem || '' };
    const lista = await api('GET', `/documentos${qs(f)}`);
    const fornecedores = [...new Set(lista.map((d) => d.fornecedor).filter(Boolean))];
    el.innerHTML = `<div class="cabecalho"><div><h1>Documentos</h1><p class="mudo">Boletos, faturas, notas fiscais, comprovantes, contratos${pode('juridico.ver') ? ' e peças jurídicas' : ''}. Para anexar, abra o serviço, o lançamento${pode('juridico.ver') ? ' ou a demanda' : ''}.</p></div></div>
      <section class="painel"><form class="filtros" data-filtros>
        ${campo('Buscar', `<input type="search" name="busca" value="${esc(f.busca)}" placeholder="Arquivo ou serviço">`, 'largo')}
        ${campo('Tipo', `<select name="tipo">${opcoes(A.TIPO_DOC, f.tipo, 'Todos')}</select>`)}
        ${campo('Fornecedor', `<select name="fornecedor">${opcoes(Object.fromEntries([...new Set([...fornecedores, f.fornecedor].filter(Boolean))].map((x) => [x, x])), f.fornecedor, 'Todos')}</select>`)}
        ${campo('Competência', `<input type="month" name="competencia" value="${esc(f.competencia)}">`)}
        ${pode('juridico.ver') ? campo('Área', `<select name="origem">${opcoes({ contas: 'Contas', juridico: 'Jurídico' }, f.origem, 'Todas')}</select>`) : ''}
        <button class="btn" type="submit">Filtrar</button></form>
        ${lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Documento</th><th>Tipo</th><th>Serviço / fornecedor</th><th>Competência</th><th>Enviado</th><th></th></tr></thead><tbody>
          ${lista.map((d) => `<tr><td><a href="/api/documentos/${d.id}/arquivo" target="_blank" rel="noopener">${esc(d.nome_original)}</a><div class="fraco">${A.tamanho(d.tamanho)}</div></td>
            <td>${esc(A.tipoDocTxt(d))}</td><td>${d.demanda_id ? `<a href="#/juridico/demandas/${d.demanda_id}">${esc(d.demanda_numero || d.demanda_titulo)}</a>` : d.lancamento_id ? `<a href="#/lancamentos/${d.lancamento_id}">${esc(d.servico_nome || 'Lançamento')}</a>` : d.servico_id ? `<a href="#/servicos/${d.servico_id}">${esc(d.servico_nome)}</a>` : '—'}<div class="fraco">${esc(d.fornecedor || '')}</div></td>
            <td>${d.competencia ? A.compCurta(d.competencia) : '—'}</td><td>${A.dataHoraBR(d.criado_em)}<div class="fraco">${esc(d.enviado_por_nome || '')}</div></td>
            <td class="dir"><a class="btn fantasma icone pequeno" href="/api/documentos/${d.id}/arquivo?baixar=1" aria-label="Baixar">${ic('baixar')}</a>${pode('config.gerenciar') ? `<button class="btn fantasma pequeno perigo" data-acao="excluirDoc" data-id="${d.id}">Excluir</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>` : vazio('Nenhum documento', 'Os arquivos anexados aos serviços e lançamentos aparecem aqui.')}</section>`;
    el.querySelector('[data-filtros]').addEventListener('submit', (e) => { e.preventDefault(); location.hash = `#/documentos${qs(A.coletar(e.target))}`; });
  });
  S.acoes.excluirDoc = async (b) => {
    if (!(await A.confirmar('Excluir documento', 'O arquivo será removido do servidor. Esta ação fica registrada na auditoria e não pode ser desfeita.', 'Excluir'))) return;
    try { await api('DELETE', `/documentos/${b.dataset.id}`); A.toast('Documento excluído.'); A.navegar(); } catch (e) { A.toast(e.message, true); }
  };
})();
