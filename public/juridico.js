'use strict';
(() => {
  const A = window.ASC; const T = window.ASC_T;
  const { esc, brl, dataBR, etq, ic, pode, rota, api, qs, campo, opcoes, vazio, S } = A;

  const TIPO = { jec: 'JEC', justica_comum: 'Justiça Comum', procon: 'Procon', consumidor_gov: 'Consumidor.gov', reclame_aqui: 'Reclame Aqui', notificacao: 'Notificação extrajudicial', chargeback: 'Chargeback' };
  const JUDICIAIS = ['jec', 'justica_comum'];
  const STATUS = { nova: 'Nova', em_andamento: 'Em andamento', aguardando: 'Aguardando terceiros', acordo: 'Em acordo', encerrada: 'Encerrada' };
  const COR_STATUS = { nova: 'aguardando_fatura', em_andamento: 'aprovado', aguardando: 'aguardando_pagamento', acordo: 'renovacao', encerrada: 'cancelado' };
  const RESULTADO = { favoravel: 'Favorável', desfavoravel: 'Desfavorável', parcial: 'Parcialmente favorável', acordo: 'Acordo', arquivada: 'Arquivada' };
  const RISCO = { provavel: 'Provável', possivel: 'Possível', remoto: 'Remoto' };
  const PRIORIDADE = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
  const TIPO_VALOR = { pedido: 'Pedido', acordo: 'Acordo', condenacao: 'Condenação', custas: 'Custas', honorarios: 'Honorários', reembolso: 'Reembolso', chargeback: 'Valor contestado', outro: 'Outro' };
  const GERA_CONTA = ['acordo', 'condenacao', 'custas', 'honorarios', 'reembolso', 'outro'];
  const COMP = { prazo: 'Prazo', audiencia: 'Audiência', tarefa: 'Tarefa' };
  const MODALIDADE = { presencial: 'Presencial', virtual: 'Virtual', hibrida: 'Híbrida' };
  const NUM_ROT = { jec: 'Número do processo (CNJ)', justica_comum: 'Número do processo (CNJ)', procon: 'Nº da reclamação / F.A.', consumidor_gov: 'Protocolo', reclame_aqui: 'ID da reclamação', notificacao: 'Referência', chargeback: 'ID da contestação' };
  const ORG_ROT = { jec: 'Juizado', justica_comum: 'Vara', procon: 'Unidade do Procon', consumidor_gov: 'Plataforma', reclame_aqui: 'Plataforma', notificacao: 'Remetente / escritório', chargeback: 'Plataforma de pagamento' };
  const ORG_PH = { jec: 'Ex.: 1º Juizado Especial Cível da Barra da Tijuca', justica_comum: 'Ex.: 3ª Vara Cível da Capital', procon: 'Ex.: Procon-RJ', consumidor_gov: 'Consumidor.gov.br', reclame_aqui: 'Reclame Aqui', notificacao: 'Ex.: escritório que enviou', chargeback: 'Ex.: Mercado Pago' };
  const SUGESTOES = {
    prazo: ['Contestação', 'Manifestação', 'Recurso inominado', 'Embargos de declaração', 'Cumprimento de sentença', 'Juntada de documentos', 'Resposta ao Procon', 'Resposta no Consumidor.gov', 'Resposta no Reclame Aqui', 'Resposta à notificação', 'Defesa do chargeback'],
    audiencia: ['Audiência de conciliação', 'Audiência de instrução e julgamento', 'Audiência UNA', 'Audiência no Procon'],
    tarefa: ['Separar documentos', 'Enviar carta de preposição', 'Contatar o cliente', 'Pagar acordo'],
  };

  const tag = (t) => `<span class="tag">${esc(TIPO[t] || t)}</span>`;
  const etqStatus = (s) => etq(COR_STATUS[s], STATUS[s]);
  const quando = (d, h) => { const n = A.diff(d, h); return n === 0 ? 'hoje' : n === 1 ? 'amanhã' : n < 0 ? `há ${-n} dia(s)` : `em ${n} dias`; };
  const refDemanda = (d) => d.numero || d.titulo;

  // ================= PAINEL JURÍDICO =================
  function reguaAgenda(itens, hoje) {
    const fim = 30;
    const pos = (d) => (A.diff(d, hoje) / fim) * 96 + 2;
    const grupos = {};
    for (const c of itens) (grupos[c.data] ||= []).push(c);
    let pontos = '';
    for (const [d, cs] of Object.entries(grupos)) {
      cs.slice(0, 4).forEach((c, i) => {
        const dica = `${COMP[c.tipo]}: ${c.titulo} · ${dataBR(d)}${c.hora ? ` ${c.hora}` : ''} · ${refDemanda({ numero: c.numero, titulo: c.demanda_titulo })}`;
        pontos += `<a class="regua-ponto ${c.tipo === 'audiencia' ? 'p-audiencia' : c.tipo === 'tarefa' ? 'p-aprovado' : 'p-aberto'}${c.tipo === 'prazo' ? ' quadrado' : ''}" style="left:${pos(d)}%;bottom:${40 + i * 25}px" href="#/juridico/demandas/${c.demanda_id}" data-dica="${esc(dica)}" aria-label="${esc(dica)}"></a>`;
      });
    }
    const dias = [7, 14, 21, 28].map((o) => `<span class="regua-dia" style="left:${pos(A.addDias(hoje, o))}%">${dataBR(A.addDias(hoje, o)).slice(0, 5)}</span>`).join('');
    return `<div class="regua"><div class="regua-trilho"><div class="regua-eixo"></div>${dias}<div class="regua-hoje" style="left:${pos(hoje)}%"><span>Hoje</span></div>${pontos}</div></div>
      <div class="regua-legenda"><span><i class="p-aberto" style="border-radius:3px"></i>Prazo</span><span><i class="p-audiencia"></i>Audiência</span><span><i class="p-aprovado"></i>Tarefa</span></div>`;
  }
  const listaComp = (itens, h, vazioTxt = 'Nada por aqui.') => (itens.length ? `<ul class="atencao-lista">${itens.map((c) => {
    const [, m, d] = c.data.split('-');
    return `<li><div class="data"><b>${d}</b><span>${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][m - 1]}</span></div>
      <div class="info"><a href="#/juridico/demandas/${c.demanda_id}">${esc(c.titulo)}</a><div class="fraco">${tag(c.demanda_tipo)} ${esc(refDemanda({ numero: c.numero, titulo: c.demanda_titulo }))}${c.parte_nome ? ` · ${esc(c.parte_nome)}` : ''}</div></div>
      <div class="dir"><div style="font-weight:600">${c.hora ? esc(c.hora) : ''}</div><span class="fraco">${quando(c.data, h)}</span><div>${etq(c.tipo === 'audiencia' ? 'renovacao' : c.data < h ? 'atrasado' : 'aguardando_pagamento', COMP[c.tipo])}</div></div></li>`;
  }).join('')}</ul>` : `<div class="vazio" style="padding:24px">${esc(vazioTxt)}</div>`);

  rota(/^\/juridico$/, 'juridico.ver', 'Painel jurídico', async (el) => {
    const d = await api('GET', '/juridico/painel');
    const k = d.indicadores;
    const totalTipos = d.por_tipo.reduce((t, x) => t + x.n, 0) || 1;
    const maxRisco = Math.max(1, ...Object.values(d.por_risco));
    el.innerHTML = `<div class="cabecalho"><div><h1>Painel jurídico</h1><p class="mudo">Processos, Procon, Consumidor.gov, Reclame Aqui, notificações e chargebacks da AS Brasil</p></div>
      <div class="acoes"><a class="btn" href="#/juridico/agenda">${ic('calendario')}Agenda</a>${pode('juridico.editar') ? `<a class="btn primario" href="#/juridico/demandas?nova=1">${ic('mais')}Nova demanda</a>` : ''}</div></div>
      ${!k.abertas && !d.proximos.length ? `<div class="painel mb">${vazio('Cadastre a primeira demanda', 'Processos, reclamações e chargebacks ficam aqui, com prazos e audiências avisados com antecedência.', pode('juridico.editar') ? `<div><a class="btn primario" href="#/juridico/demandas?nova=1">${ic('mais')}Nova demanda</a></div>` : '')}</div>` : ''}
      <section class="painel mb"><div class="faixa-kpi">
        <div class="kpi"><div class="rotulo">Demandas em aberto</div><div class="valor num">${k.abertas}</div><div class="det">${d.por_tipo.map((t) => `${t.n} ${TIPO[t.tipo]}`).slice(0, 3).join(' · ') || 'nenhuma'}</div></div>
        <div class="kpi"><div class="rotulo">Prazos nos próximos 7 dias</div><div class="valor num">${k.prazos_7_dias}</div><div class="det">inclui o dia de hoje</div></div>
        <div class="kpi"><div class="rotulo">Audiências em 30 dias</div><div class="valor num">${k.audiencias_30_dias}</div><div class="det">presenciais e virtuais</div></div>
        <div class="kpi"><div class="rotulo">Valor em discussão</div><div class="valor num">${brl(k.valor_em_discussao)}</div><div class="det">soma dos pedidos em aberto</div></div></div>
        <div class="faixa-sec">
          <div>Prazos vencidos: <b class="${k.prazos_vencidos ? 'variacao-up' : ''}">${k.prazos_vencidos}</b></div>
          <div>Sem andamento: <b class="${k.paradas ? 'variacao-up' : ''}">${k.paradas}</b></div>
          <div>Encerradas no mês: <b>${k.encerradas_mes}</b></div>
          <div>Êxito em 12 meses: <b>${k.taxa_exito == null ? '—' : `${k.taxa_exito}%`}</b>${k.encerradas_12m ? ` de ${k.encerradas_12m}` : ''}</div></div></section>
      <section class="painel mb"><div class="painel-cab"><h2>Agenda dos próximos 30 dias</h2><a class="fraco" href="#/juridico/agenda">Abrir calendário</a></div>${reguaAgenda(d.proximos, d.hoje)}</section>
      <div class="grade g-2-1 mb">
        <section class="painel"><div class="painel-cab"><h2>Próximos compromissos</h2><span class="fraco">14 dias</span></div>${listaComp(d.proximos.filter((c) => c.data <= A.addDias(d.hoje, 14)), d.hoje, 'Nenhum prazo ou audiência nos próximos 14 dias.')}</section>
        <section class="painel"><div class="painel-cab"><h2>Precisa de atenção</h2></div><div class="sinais">
          ${d.vencidos.map((c) => `<div class="sinal"><span class="marcador" style="background:var(--atraso)"></span><div><b>Prazo vencido: ${esc(c.titulo)}</b><div class="fraco">${esc(refDemanda({ numero: c.numero, titulo: c.demanda_titulo }))} · ${dataBR(c.data)}</div><a class="fraco" href="#/juridico/demandas/${c.demanda_id}">Abrir demanda</a></div></div>`).join('')}
          ${d.audiencias_sem_resultado.map((c) => `<div class="sinal"><span class="marcador" style="background:var(--renov)"></span><div><b>Registre o resultado: ${esc(c.titulo)}</b><div class="fraco">${esc(refDemanda({ numero: c.numero, titulo: c.demanda_titulo }))} · ${dataBR(c.data)}</div><a class="fraco" href="#/juridico/demandas/${c.demanda_id}">Abrir demanda</a></div></div>`).join('')}
          ${d.paradas.map((p) => `<div class="sinal"><span class="marcador" style="background:var(--pendente)"></span><div><b>Sem andamento: ${esc(p.titulo)}</b><div class="fraco">${tag(p.tipo)} último registro em ${dataBR(p.ultimo)}</div><a class="fraco" href="#/juridico/demandas/${p.id}">Abrir demanda</a></div></div>`).join('')}
          ${k.acordos_a_pagar.n ? `<div class="sinal"><span class="marcador" style="background:var(--fatura)"></span><div><b>${k.acordos_a_pagar.n} parcela(s) de acordo/condenação a pagar</b><div class="fraco">${brl(k.acordos_a_pagar.total)} em Contas a pagar</div>${pode('lancamentos.ver') ? '<a class="fraco" href="#/lancamentos?categoria=Jur%C3%ADdico">Ver contas</a>' : ''}</div></div>` : ''}
          ${!d.vencidos.length && !d.audiencias_sem_resultado.length && !d.paradas.length && !k.acordos_a_pagar.n ? '<div class="sinal"><span class="marcador" style="background:var(--pago)"></span><div>Nenhum prazo vencido, audiência sem resultado ou demanda parada.</div></div>' : ''}
        </div></section></div>
      <div class="grade g-2">
        <section class="painel"><div class="painel-cab"><h2>Demandas em aberto por tipo</h2></div><div class="painel-corpo">${d.por_tipo.length ? `<div class="barras-h">${d.por_tipo.map((t) => `<div class="barra-h"><div class="topo-b"><a href="#/juridico/demandas?tipo=${t.tipo}">${esc(TIPO[t.tipo])}</a><span class="num">${t.n}</span></div><div class="trilho"><div style="width:${(t.n / totalTipos) * 100}%"></div></div></div>`).join('')}</div>` : '<p class="mudo">Nenhuma demanda em aberto.</p>'}</div></section>
        <section class="painel"><div class="painel-cab"><h2>Valor pedido por risco</h2><span class="fraco">demandas em aberto</span></div><div class="painel-corpo"><div class="barras-h">
          ${[['provavel', 'Provável', 'var(--atraso)'], ['possivel', 'Possível', '#D49100'], ['remoto', 'Remoto', 'var(--pago)'], ['sem', 'Sem classificação', 'var(--neutro)']].map(([kk, t, cor]) => `<div class="barra-h"><div class="topo-b"><span>${t}</span><span class="num">${brl(d.por_risco[kk])}</span></div><div class="trilho"><div style="width:${(d.por_risco[kk] / maxRisco) * 100}%;background:${cor}"></div></div></div>`).join('')}
        </div><p class="fraco" style="margin-top:12px">Classificação de risco informada no cadastro de cada demanda.</p></div></section></div>`;
  });

  // ================= DEMANDAS =================
  function formDemanda(d = {}) {
    const tipo = d.tipo || 'jec';
    return `<div class="form-grade">
      ${campo('Tipo', `<select name="tipo" data-tipo-demanda>${opcoes(TIPO, tipo)}</select>`)}
      ${campo(NUM_ROT[tipo], `<input type="text" name="numero" value="${esc(d.numero)}" data-num>${JUDICIAIS.includes(tipo) ? '<small data-num-dica>Pode colar com ou sem pontuação. O dígito verificador é conferido.</small>' : '<small data-num-dica></small>'}`, 'campo-num')}
      ${campo('Título', `<input type="text" name="titulo" required maxlength="200" value="${esc(d.titulo)}" placeholder="Ex.: Cliente pede reembolso do transporte do show">`, 'inteiro')}
      ${campo('Parte contrária (cliente)', `<input type="text" name="parte_nome" value="${esc(d.parte_nome)}">`)}
      ${campo('Contato da parte', `<input type="text" name="parte_contato" value="${esc(d.parte_contato)}" placeholder="E-mail ou telefone">`)}
      ${campo(ORG_ROT[tipo], `<input type="text" name="orgao" value="${esc(d.orgao)}" placeholder="${esc(ORG_PH[tipo])}" data-org>`, 'campo-org')}
      ${campo('Cidade / UF', `<input type="text" name="localidade" value="${esc(d.localidade)}" placeholder="Ex.: Rio de Janeiro/RJ">`)}
      ${campo('Evento relacionado', `<input type="text" name="evento" value="${esc(d.evento)}" placeholder="Ex.: BTS — Rio 2026">`)}
      ${campo('Recebida em', `<input type="date" name="data_recebimento" value="${esc(d.data_recebimento || A.hojeSP())}"><small>Data da citação, notificação ou abertura da reclamação.</small>`)}
      <div class="form-secao">Valores e risco</div>
      ${campo('Valor da causa', `<input type="text" name="valor_causa" inputmode="decimal" value="${esc(A.paraInput(d.valor_causa_centavos))}">`, `campo-causa ${JUDICIAIS.includes(tipo) ? '' : 'oculto'}`)}
      ${campo('Valor pedido / contestado', `<input type="text" name="valor_pedido" inputmode="decimal" value="${esc(A.paraInput(d.valor_pedido_centavos))}">`)}
      ${campo('Risco de perda', `<select name="risco">${opcoes(RISCO, d.risco, 'Não classificado')}</select>`)}
      ${campo('Prioridade', `<select name="prioridade">${opcoes(PRIORIDADE, d.prioridade || 'normal')}</select>`)}
      <div class="form-secao">Acompanhamento</div>
      ${d.id && d.status !== 'encerrada' ? campo('Situação', `<select name="status">${opcoes(Object.fromEntries(Object.entries(STATUS).filter(([s]) => s !== 'encerrada')), d.status)}</select>`) : ''}
      ${campo('Responsável interno', `<select name="responsavel_id">${A.opcoesUsuarios(d.responsavel_id ?? S.usuario.id)}</select>`)}
      ${campo('Advogado / escritório externo', `<input type="text" name="advogado" value="${esc(d.advogado)}">`)}
      ${campo('Pedido / resumo do caso', `<textarea name="pedido" maxlength="4000">${esc(d.pedido)}</textarea>`, 'inteiro')}
      ${campo('Observações internas', `<textarea name="observacoes" maxlength="4000">${esc(d.observacoes)}</textarea>`, 'inteiro')}
    </div>`;
  }
  function ajustarCamposTipo(f) {
    const t = f.querySelector('[data-tipo-demanda]').value;
    f.querySelector('.campo-num > span').textContent = NUM_ROT[t];
    f.querySelector('[data-num-dica]').textContent = JUDICIAIS.includes(t) ? 'Pode colar com ou sem pontuação. O dígito verificador é conferido.' : '';
    f.querySelector('.campo-org > span').textContent = ORG_ROT[t];
    f.querySelector('[data-org]').placeholder = ORG_PH[t];
    f.querySelector('.campo-causa').classList.toggle('oculto', !JUDICIAIS.includes(t));
  }
  function abrirFormDemanda(d) {
    A.modal({
      titulo: d ? 'Editar demanda' : 'Nova demanda', largo: true, botao: d ? 'Salvar alterações' : 'Cadastrar demanda', corpo: formDemanda(d || {}),
      aoAbrir: (f) => f.querySelector('[data-tipo-demanda]').addEventListener('change', () => ajustarCamposTipo(f)),
      aoEnviar: async (dados) => {
        if (d) { await api('PUT', `/juridico/demandas/${d.id}`, dados); A.toast('Demanda atualizada.'); A.navegar(); }
        else { const r = await api('POST', '/juridico/demandas', dados); A.toast('Demanda cadastrada.'); location.hash = `#/juridico/demandas/${r.id}`; }
      },
    });
  }
  S.acoes.novaDemanda = () => abrirFormDemanda();

  rota(/^\/juridico\/demandas$/, 'juridico.ver', 'Demandas', async (el, _m, p) => {
    const f = { busca: p.busca || '', status: p.status ?? 'abertas', tipo: p.tipo || '', risco: p.risco || '', responsavel_id: p.responsavel_id || '' };
    const lista = await api('GET', `/juridico/demandas${qs({ ...f, status: f.status || 'todas' })}`);
    const h = A.hojeSP();
    el.innerHTML = `<div class="cabecalho"><div><h1>Demandas jurídicas</h1><p class="mudo">${lista.length} demanda(s)</p></div>
      <div class="acoes"><a class="btn" href="/api/juridico/demandas/csv${qs({ ...f, status: f.status || 'todas' })}">${ic('baixar')}Exportar CSV</a>${pode('juridico.editar') ? `<button class="btn primario" data-acao="novaDemanda">${ic('mais')}Nova demanda</button>` : ''}</div></div>
      <section class="painel"><form class="filtros" data-filtros>
        ${campo('Buscar', `<input type="search" name="busca" value="${esc(f.busca)}" placeholder="Número, título, parte, evento ou órgão">`, 'largo')}
        ${campo('Situação', `<select name="status"><option value="abertas"${f.status === 'abertas' ? ' selected' : ''}>Em aberto</option><option value="todas"${f.status === 'todas' ? ' selected' : ''}>Todas</option>${opcoes(STATUS, f.status)}</select>`)}
        ${campo('Tipo', `<select name="tipo">${opcoes(TIPO, f.tipo, 'Todos')}</select>`)}
        ${campo('Risco', `<select name="risco">${opcoes(RISCO, f.risco, 'Todos')}</select>`)}
        ${campo('Responsável', `<select name="responsavel_id">${A.opcoesUsuarios(f.responsavel_id, 'Todos')}</select>`)}
        <button class="btn" type="submit">Filtrar</button></form>
        ${lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Tipo</th><th>Demanda</th><th>Parte</th><th>Próximo compromisso</th><th class="dir">Valor pedido</th><th>Situação</th><th>Responsável</th></tr></thead><tbody>
          ${lista.map((d) => `<tr class="clicavel" data-ir="#/juridico/demandas/${d.id}" tabindex="0"><td>${tag(d.tipo)}</td>
            <td><div class="principal-txt">${['urgente', 'alta'].includes(d.prioridade) ? `<span class="prio prio-${d.prioridade}" title="Prioridade ${PRIORIDADE[d.prioridade]}">${PRIORIDADE[d.prioridade]}</span> ` : ''}${esc(d.titulo)}</div><div class="fraco">${esc(d.numero || '')}${d.orgao ? `${d.numero ? ' · ' : ''}${esc(d.orgao)}` : ''}</div></td>
            <td>${esc(d.parte_nome || '—')}${d.evento ? `<div class="fraco">${esc(d.evento)}</div>` : ''}</td>
            <td>${d.proximo ? `<span class="${d.proximo.data < h ? 'variacao-up' : ''}">${dataBR(d.proximo.data)}</span><div class="fraco">${esc(COMP[d.proximo.tipo])}: ${esc(d.proximo.titulo)}</div>` : '<span class="fraco">—</span>'}</td>
            <td class="dir num">${brl(d.valor_pedido_centavos)}</td><td>${etqStatus(d.status)}${d.resultado ? `<div class="fraco">${esc(RESULTADO[d.resultado])}</div>` : ''}</td><td>${esc(d.responsavel_nome || '—')}</td></tr>`).join('')}
        </tbody></table></div>` : vazio('Nenhuma demanda encontrada', f.busca || f.tipo || f.risco ? 'Ajuste os filtros para ver outros resultados.' : 'Cadastre processos, reclamações, notificações e chargebacks para acompanhar prazos e audiências.', pode('juridico.editar') ? `<div><button class="btn primario" data-acao="novaDemanda">${ic('mais')}Nova demanda</button></div>` : '')}
      </section>`;
    el.querySelector('[data-filtros]').addEventListener('submit', (e) => { e.preventDefault(); location.hash = `#/juridico/demandas${qs(A.coletar(e.target))}`; });
    if (p.nova && pode('juridico.editar')) { history.replaceState(null, '', '#/juridico/demandas'); abrirFormDemanda(); }
  });

  // ---------- Compromisso (prazo / audiência / tarefa) ----------
  function abrirCompromisso(demanda, c) {
    const tipo = c?.tipo || 'prazo';
    A.modal({
      titulo: c ? 'Editar compromisso' : 'Novo prazo ou audiência', largo: true, botao: c ? 'Salvar' : 'Agendar',
      corpo: `<div class="form-grade">
        ${campo('Tipo', `<select name="tipo" data-ctipo>${opcoes(COMP, tipo)}</select>`)}
        ${campo('Título', `<input type="text" name="titulo" required list="sug-comp" value="${esc(c?.titulo)}"><datalist id="sug-comp">${SUGESTOES[tipo].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`)}
        <div class="inteiro calc-prazo ${tipo === 'prazo' ? '' : 'oculto'}" data-calc>
          <div class="campo"><span>Calcular a data final em dias úteis</span></div>
          <div class="acoes" style="margin-top:6px;align-items:flex-end">
            ${campo('Intimação / publicação em', '<input type="date" data-c-inicio>')}${campo('Prazo (dias úteis)', '<input type="number" min="1" max="365" data-c-dias style="width:120px">')}
            <label class="checar" style="margin-bottom:9px"><input type="checkbox" data-c-recesso checked> Suspender no recesso (20/12 a 20/01)</label>
            <button type="button" class="btn" data-calcular>Calcular</button></div>
          <div class="fraco" data-c-res style="margin-top:8px">Considera fins de semana e feriados nacionais e exclui o dia do começo. Confira feriados locais e suspensões do tribunal.</div></div>
        ${campo('Data', `<input type="date" name="data" required value="${esc(c?.data || '')}">`)}
        ${campo('Hora', `<input type="time" name="hora" value="${esc(c?.hora || '')}">`)}
        ${campo('Modalidade', `<select name="modalidade">${opcoes(MODALIDADE, c?.modalidade, 'Não se aplica')}</select>`, `campo-aud ${tipo === 'audiencia' ? '' : 'oculto'}`)}
        ${campo('Local ou link', `<input type="text" name="local" value="${esc(c?.local)}" placeholder="Endereço ou link da sala virtual">`, `campo-aud ${tipo === 'audiencia' ? '' : 'oculto'}`)}
        ${campo('Responsável', `<select name="responsavel_id">${A.opcoesUsuarios(c?.responsavel_id ?? demanda.responsavel_id)}</select>`)}
        ${campo('Observações', `<textarea name="observacoes">${esc(c?.observacoes)}</textarea>`, 'inteiro')}</div>`,
      aoAbrir: (f) => {
        f.querySelector('[data-ctipo]').addEventListener('change', (e) => {
          const t = e.target.value;
          f.querySelector('[data-calc]').classList.toggle('oculto', t !== 'prazo');
          for (const x of f.querySelectorAll('.campo-aud')) x.classList.toggle('oculto', t !== 'audiencia');
          f.querySelector('#sug-comp').innerHTML = SUGESTOES[t].map((x) => `<option value="${esc(x)}">`).join('');
        });
        f.querySelector('[data-calcular]').addEventListener('click', async () => {
          const res = f.querySelector('[data-c-res]');
          try {
            const r = await api('POST', '/juridico/calcular-prazo', { inicio: f.querySelector('[data-c-inicio]').value, dias: f.querySelector('[data-c-dias]').value, recesso: f.querySelector('[data-c-recesso]').checked });
            f.querySelector('[name=data]').value = r.data;
            res.innerHTML = `<b style="color:var(--tinta)">Data calculada: ${dataBR(r.data)}.</b> ${r.ignorados.length ? `Dias não contados além dos fins de semana: ${r.ignorados.slice(0, 6).map((i) => `${dataBR(i.data).slice(0, 5)} (${esc(i.motivo)})`).join(', ')}${r.ignorados.length > 6 ? '…' : ''}.` : ''} Confira feriados locais e suspensões do tribunal antes de confiar na data.`;
          } catch (e) { res.textContent = e.message; }
        });
      },
      aoEnviar: async (dados) => {
        if (dados.tipo !== 'audiencia') { dados.modalidade = ''; dados.local = dados.local || ''; }
        if (c) await api('PUT', `/juridico/compromissos/${c.id}`, dados); else await api('POST', `/juridico/demandas/${demanda.id}/compromissos`, dados);
        A.toast(c ? 'Compromisso atualizado.' : `${COMP[dados.tipo]} agendad${dados.tipo === 'prazo' ? 'o' : 'a'}.`); A.navegar();
      },
    });
  }

  rota(/^\/juridico\/demandas\/(\d+)$/, 'juridico.ver', 'Demanda', async (el, m) => {
    const d = await api('GET', `/juridico/demandas/${m[1]}`);
    const h = A.hojeSP(); const ed = pode('juridico.editar') && d.status !== 'encerrada';
    const vencidos = d.compromissos.filter((c) => c.status === 'pendente' && c.data < h && c.tipo !== 'audiencia');
    const linha = (r, v) => `<div><dt>${esc(r)}</dt><dd>${v || '—'}</dd></div>`;
    const lancPorValor = (vid) => d.lancamentos.filter((l) => l.juridico_valor_id === vid);
    el.innerHTML = `<div class="cabecalho"><div><a href="#/juridico/demandas" class="fraco">← Demandas</a>
        <h1 style="margin-top:6px">${esc(d.titulo)}</h1>
        <p class="mudo" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">${tag(d.tipo)} ${etqStatus(d.status)} ${d.numero ? `<span class="num">${esc(d.numero)}</span>` : ''}${d.orgao ? `· ${esc(d.orgao)}` : ''} ${['urgente', 'alta'].includes(d.prioridade) ? `<span class="prio prio-${d.prioridade}">Prioridade ${PRIORIDADE[d.prioridade].toLowerCase()}</span>` : ''}</p></div>
      <div class="acoes">
        ${ed ? '<button class="btn" data-acao="novoAndamento">Registrar andamento</button><button class="btn primario" data-acao="novoCompromisso">Novo prazo ou audiência</button><button class="btn" data-acao="editarDemanda">Editar</button><button class="btn perigo" data-acao="encerrarDemanda">Encerrar</button>' : ''}
        ${pode('juridico.editar') && d.status === 'encerrada' ? '<button class="btn" data-acao="reabrirDemanda">Reabrir</button>' : ''}
      </div></div>
      ${d.status === 'encerrada' ? `<div class="aviso azul mb">Demanda encerrada em ${dataBR(d.data_encerramento)}. Resultado: <b>&nbsp;${esc(RESULTADO[d.resultado] || '—')}</b>.</div>` : ''}
      ${vencidos.length ? `<div class="aviso vermelho mb">${vencidos.length} prazo(s) vencido(s) sem registro de cumprimento.</div>` : ''}
      <div class="grade g-2-1">
        <div class="grade" style="align-content:start">
          <section class="painel"><div class="painel-cab"><h2>Prazos, audiências e tarefas</h2>${ed ? `<button class="btn pequeno" data-acao="novoCompromisso">${ic('mais')}Agendar</button>` : ''}</div>
            ${d.compromissos.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Compromisso</th><th>Responsável</th><th>Situação</th><th></th></tr></thead><tbody>
              ${d.compromissos.map((c) => { const atrasado = c.status === 'pendente' && c.data < h;
                return `<tr><td class="num"><b class="${atrasado ? 'variacao-up' : ''}">${dataBR(c.data)}</b>${c.hora ? `<div class="fraco">${esc(c.hora)}</div>` : ''}${c.status === 'pendente' ? `<div class="fraco">${quando(c.data, h)}</div>` : ''}</td>
                <td><div class="principal-txt">${esc(c.titulo)}</div><div class="fraco">${esc(COMP[c.tipo])}${c.modalidade ? ` · ${MODALIDADE[c.modalidade]}` : ''}${c.local ? ` · ${/^https?:\/\//.test(c.local) ? `<a href="${esc(c.local)}" target="_blank" rel="noopener noreferrer">abrir link</a>` : esc(c.local)}` : ''}</div>${c.observacoes ? `<div class="fraco" style="white-space:pre-line">${esc(c.observacoes)}</div>` : ''}</td>
                <td>${esc(c.responsavel_nome || '—')}</td>
                <td>${c.status === 'pendente' ? etq(atrasado ? 'atrasado' : c.tipo === 'audiencia' ? 'renovacao' : 'aguardando_pagamento', atrasado ? (c.tipo === 'audiencia' ? 'Sem resultado' : 'Vencido') : 'Pendente') : c.status === 'cumprido' ? `${etq('pago', c.tipo === 'audiencia' ? 'Realizada' : 'Cumprido')}<div class="fraco">${esc(c.cumprido_por_nome || '')}</div>` : etq('cancelado', 'Cancelado')}</td>
                <td class="dir">${ed && c.status === 'pendente' ? `<button class="btn pequeno sucesso" data-acao="cumprir" data-id="${c.id}" data-tipo="${c.tipo}">${c.tipo === 'audiencia' ? 'Registrar resultado' : 'Cumprido'}</button> <button class="btn pequeno fantasma" data-acao="editarComp" data-id="${c.id}">Editar</button> <button class="btn pequeno fantasma perigo" data-acao="cancelarComp" data-id="${c.id}">Cancelar</button>` : ''}</td></tr>`; }).join('')}
            </tbody></table></div>` : vazio('Nenhum prazo ou audiência', 'Agende os prazos e audiências para receber os avisos com antecedência.')}</section>
          <section class="painel"><div class="painel-cab"><h2>Andamentos</h2>${ed ? `<button class="btn pequeno" data-acao="novoAndamento">${ic('mais')}Registrar</button>` : ''}</div>
            <ul class="linha-tempo">${d.andamentos.map((a) => `<li class="${a.tipo === 'sistema' ? 'andamento-sistema' : ''}"><div style="display:flex;justify-content:space-between;gap:10px"><b>${dataBR(a.data)}</b><span class="fraco">${esc(a.usuario_nome || 'Sistema')}${a.tipo === 'nota' ? ' · nota interna' : ''}</span></div><div style="white-space:pre-line">${esc(a.descricao)}</div></li>`).join('')}</ul></section>
        </div>
        <div class="grade" style="align-content:start">
          <section class="painel"><div class="painel-cab"><h2>Dados da demanda</h2></div><dl class="detalhes uma-coluna" style="margin:0">
            ${linha('Parte contrária', esc(d.parte_nome))}${linha('Contato', esc(d.parte_contato))}${linha(ORG_ROT[d.tipo], esc(d.orgao))}${linha('Cidade / UF', esc(d.localidade))}
            ${linha('Evento relacionado', esc(d.evento))}${linha('Recebida em', dataBR(d.data_recebimento))}
            ${JUDICIAIS.includes(d.tipo) ? linha('Valor da causa', brl(d.valor_causa_centavos)) : ''}${linha('Valor pedido / contestado', brl(d.valor_pedido_centavos))}
            ${linha('Risco de perda', d.risco ? `<span class="risco risco-${d.risco}">${RISCO[d.risco]}</span>` : 'Não classificado')}${linha('Responsável', esc(d.responsavel_nome))}${linha('Advogado / escritório', esc(d.advogado))}
            ${d.pedido ? `<div><dt>Pedido / resumo</dt><dd style="white-space:pre-line">${esc(d.pedido)}</dd></div>` : ''}${d.observacoes ? `<div><dt>Observações internas</dt><dd style="white-space:pre-line">${esc(d.observacoes)}</dd></div>` : ''}
          </dl></section>
          <section class="painel"><div class="painel-cab"><h2>Valores</h2>${ed ? `<button class="btn pequeno" data-acao="novoValor">${ic('mais')}Registrar</button>` : ''}</div>
            ${d.valores.length ? `<ul class="linha-tempo">${d.valores.map((v) => { const ls = lancPorValor(v.id); const pagos = ls.filter((l) => l.status === 'pago').length;
              return `<li><div style="display:flex;justify-content:space-between;gap:10px"><b>${esc(TIPO_VALOR[v.tipo])}</b><b class="num">${brl(v.valor_centavos)}</b></div>
              <div class="fraco">${v.parcelas > 1 ? `${v.parcelas} parcelas` : 'Parcela única'}${v.primeiro_vencimento ? ` · 1º vencimento ${dataBR(v.primeiro_vencimento)}` : ''}${v.descricao ? ` · ${esc(v.descricao)}` : ''}</div>
              ${ls.length ? `<div class="fraco">${pagos} de ${ls.length} parcela(s) paga(s) · ${ls.map((l) => (pode('lancamentos.ver') ? `<a href="#/lancamentos/${l.id}">${dataBR(l.vencimento).slice(0, 5)}</a>` : dataBR(l.vencimento).slice(0, 5))).join(', ')}</div>` : ''}
              <div class="acoes" style="margin-top:6px">${ed && GERA_CONTA.includes(v.tipo) && !v.gerou_contas && d.pode_gerar_contas ? `<button class="btn pequeno" data-acao="gerarContas" data-id="${v.id}">Gerar contas a pagar</button>` : ''}${ed && !v.gerou_contas ? `<button class="btn pequeno fantasma perigo" data-acao="removerValor" data-id="${v.id}">Remover</button>` : ''}</div></li>`; }).join('')}</ul>`
            : '<div class="vazio" style="padding:22px">Registre pedidos, acordos, condenações e custas. Acordos e condenações podem virar contas a pagar.</div>'}</section>
          ${T.blocoDocumentos(d.documentos, `data-demanda="${d.id}"`)}
        </div></div>`;

    const comp = (id) => d.compromissos.find((c) => String(c.id) === String(id));
    S.acoes.editarDemanda = () => abrirFormDemanda(d);
    S.acoes.novoCompromisso = () => abrirCompromisso(d);
    S.acoes.editarComp = (b) => abrirCompromisso(d, comp(b.dataset.id));
    S.acoes.cumprir = (b) => A.modal({
      titulo: b.dataset.tipo === 'audiencia' ? 'Registrar resultado da audiência' : 'Marcar como cumprido', botao: 'Confirmar',
      corpo: campo(b.dataset.tipo === 'audiencia' ? 'Resultado da audiência' : 'Observação (opcional)', `<textarea name="observacao" ${b.dataset.tipo === 'audiencia' ? 'required placeholder="Ex.: Sem acordo. Nova audiência de instrução a designar."' : ''}></textarea><small>Fica registrado nos andamentos da demanda.</small>`),
      aoEnviar: async (x) => {
        if (b.dataset.tipo === 'audiencia' && !x.observacao.trim()) throw new Error('Descreva o resultado da audiência.');
        await api('POST', `/juridico/compromissos/${b.dataset.id}/cumprir`, x); A.toast('Registrado.'); A.navegar();
      },
    });
    S.acoes.cancelarComp = async (b) => {
      const motivo = await A.confirmar('Cancelar compromisso', 'Use quando o prazo ou a audiência não vai mais acontecer (ex.: audiência redesignada, acordo fechado).', 'Cancelar compromisso', true, true);
      if (!motivo) return;
      try { await api('POST', `/juridico/compromissos/${b.dataset.id}/cancelar`, { observacao: motivo }); A.toast('Compromisso cancelado.'); A.navegar(); } catch (e) { A.toast(e.message, true); }
    };
    S.acoes.novoAndamento = () => A.modal({
      titulo: 'Registrar andamento', botao: 'Registrar',
      corpo: `<div class="form-grade">${campo('Data', `<input type="date" name="data" required max="${h}" value="${h}">`)}${campo('Tipo', `<select name="tipo">${opcoes({ andamento: 'Andamento', nota: 'Nota interna' }, 'andamento')}</select>`)}
        ${campo('Descrição', '<textarea name="descricao" required placeholder="Ex.: Juntada de contestação. Cliente respondeu no Reclame Aqui."></textarea>', 'inteiro')}</div>`,
      aoEnviar: async (x) => { await api('POST', `/juridico/demandas/${d.id}/andamentos`, x); A.toast('Andamento registrado.'); A.navegar(); },
    });
    S.acoes.encerrarDemanda = () => A.modal({
      titulo: 'Encerrar demanda', botao: 'Encerrar demanda', perigo: true,
      corpo: `<div class="form-grade">${campo('Resultado', `<select name="resultado" required>${opcoes(RESULTADO, '', 'Selecione')}</select>`)}${campo('Data do encerramento', `<input type="date" name="data" required value="${h}">`)}
        ${campo('Observação', '<textarea name="observacao" placeholder="Ex.: Sentença de improcedência transitada em julgado."></textarea>', 'inteiro')}
        <label class="checar inteiro"><input type="checkbox" name="cancelar_pendentes" checked> Cancelar prazos e audiências que ainda estão pendentes</label></div>`,
      aoEnviar: async (x) => { if (!x.resultado) throw new Error('Selecione o resultado.'); await api('POST', `/juridico/demandas/${d.id}/encerrar`, x); A.toast('Demanda encerrada.'); A.navegar(); },
    });
    S.acoes.reabrirDemanda = async () => {
      const motivo = await A.confirmar('Reabrir demanda', 'A demanda volta para "Em andamento". O motivo fica registrado no histórico.', 'Reabrir', false, true);
      if (!motivo) return;
      try { await api('POST', `/juridico/demandas/${d.id}/reabrir`, { motivo }); A.toast('Demanda reaberta.'); A.navegar(); } catch (e) { A.toast(e.message, true); }
    };
    S.acoes.novoValor = () => A.modal({
      titulo: 'Registrar valor', botao: 'Registrar valor',
      corpo: `<div class="form-grade">${campo('Tipo', `<select name="tipo">${opcoes(TIPO_VALOR, d.tipo === 'chargeback' ? 'chargeback' : 'acordo')}</select>`)}${campo('Valor total', '<input type="text" name="valor" inputmode="decimal" required placeholder="0,00">')}
        ${campo('Parcelas', '<input type="number" name="parcelas" min="1" max="60" value="1">')}${campo('1º vencimento', '<input type="date" name="primeiro_vencimento"><small>Necessário para gerar contas a pagar.</small>')}
        ${campo('Descrição', '<input type="text" name="descricao" placeholder="Ex.: Acordo homologado em audiência">', 'inteiro')}</div>`,
      aoEnviar: async (x) => { await api('POST', `/juridico/demandas/${d.id}/valores`, x); A.toast('Valor registrado.'); A.navegar(); },
    });
    S.acoes.gerarContas = async (b) => {
      const v = d.valores.find((x) => String(x.id) === b.dataset.id);
      if (!(await A.confirmar('Gerar contas a pagar', `Serão criadas ${v.parcelas} conta(s) em Contas a pagar, categoria Jurídico, somando ${brl(v.valor_centavos)}. Elas seguem o fluxo normal de aprovação e pagamento.`, 'Gerar contas', false))) return;
      try { await api('POST', `/juridico/valores/${v.id}/gerar-contas`); A.toast('Contas a pagar geradas.'); A.navegar(); } catch (e) { A.toast(e.message, true); }
    };
    S.acoes.removerValor = async (b) => {
      if (!(await A.confirmar('Remover valor', 'O valor sai da demanda. A remoção fica registrada nos andamentos.', 'Remover'))) return;
      try { await api('DELETE', `/juridico/valores/${b.dataset.id}`); A.toast('Valor removido.'); A.navegar(); } catch (e) { A.toast(e.message, true); }
    };
  });

  // ================= AGENDA =================
  rota(/^\/juridico\/agenda$/, 'juridico.ver', 'Prazos e audiências', async (el, _m, p) => {
    const [ag, painel] = await Promise.all([api('GET', `/juridico/agenda${qs({ mes: p.mes })}`), api('GET', '/juridico/painel')]);
    const [y, mm] = ag.mes.split('-').map(Number);
    const inicio = new Date(Date.UTC(y, mm - 1, 1)).getUTCDay(); const diasMes = new Date(Date.UTC(y, mm, 0)).getUTCDate();
    const mover = (n) => new Date(Date.UTC(y, mm - 1 + n, 1)).toISOString().slice(0, 7);
    const porDia = {};
    for (const c of ag.itens) (porDia[c.data] ||= []).push(c);
    const cor = (c) => (c.status === 'cumprido' ? 's-pago' : c.data < ag.hoje ? 's-atrasado' : c.tipo === 'audiencia' ? 's-renovacao' : c.tipo === 'tarefa' ? 's-aprovado' : 's-aguardando_pagamento');
    let cel = '';
    const total = Math.ceil((inicio + diasMes) / 7) * 7;
    for (let i = 0; i < total; i++) {
      const dia = i - inicio + 1;
      if (dia < 1 || dia > diasMes) { cel += '<div class="cal-dia fora"></div>'; continue; }
      const data = `${ag.mes}-${String(dia).padStart(2, '0')}`; const itens = porDia[data] || [];
      cel += `<div class="cal-dia${data === ag.hoje ? ' hoje' : ''}${itens.length ? '' : ' sem-itens'}"><span class="n">${dia}<span class="sr"> de ${A.compLonga(ag.mes)}</span></span>
        ${itens.map((c) => `<a class="cal-item ${cor(c)}" href="#/juridico/demandas/${c.demanda_id}" data-dica="${esc(`${COMP[c.tipo]}: ${c.titulo} · ${refDemanda({ numero: c.numero, titulo: c.demanda_titulo })}${c.parte_nome ? ` · ${c.parte_nome}` : ''}`)}">${c.hora ? `${esc(c.hora)} ` : ''}${esc(c.titulo)}<span class="v">${esc(refDemanda({ numero: c.numero, titulo: c.demanda_titulo }))}</span></a>`).join('')}</div>`;
    }
    el.innerHTML = `<div class="cabecalho"><div><h1>${A.compLonga(ag.mes).replace(/^./, (x) => x.toUpperCase())}</h1><p class="mudo">${ag.itens.filter((c) => c.tipo === 'prazo').length} prazo(s) · ${ag.itens.filter((c) => c.tipo === 'audiencia').length} audiência(s)</p></div>
      <div class="acoes"><a class="btn icone" href="#/juridico/agenda?mes=${mover(-1)}" aria-label="Mês anterior">${ic('voltar')}</a><a class="btn" href="#/juridico/agenda">Hoje</a><a class="btn icone" href="#/juridico/agenda?mes=${mover(1)}" aria-label="Próximo mês">${ic('avancar')}</a></div></div>
      ${painel.vencidos.length ? `<section class="painel mb"><div class="painel-cab"><h2>Prazos vencidos sem cumprimento</h2></div>${listaComp(painel.vencidos, ag.hoje)}</section>` : ''}
      <section class="painel"><div class="cal-cab">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((x) => `<div>${x}</div>`).join('')}</div><div class="cal">${cel}</div>
        <div class="cal-legenda">${etq('aguardando_pagamento', 'Prazo')}${etq('renovacao', 'Audiência')}${etq('aprovado', 'Tarefa')}${etq('pago', 'Cumprido')}${etq('atrasado', 'Vencido')}</div></section>`;
  });
})();
