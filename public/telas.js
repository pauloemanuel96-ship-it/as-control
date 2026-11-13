'use strict';
(() => {
  const A = window.ASC;
  const { esc, brl, dataBR, etq, ic, pode, rota, api, qs, campo, opcoes, vazio, S } = A;

  const compacto = (c) => {
    const v = c / 100;
    if (v >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (v >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
  };
  const variacao = (atual, ant) => {
    if (!ant) return '';
    const p = ((atual / ant - 1) * 100);
    if (Math.abs(p) < 0.5) return '<span class="fraco">estável</span>';
    return `<span class="${p > 0 ? 'variacao-up' : 'variacao-down'}">${p > 0 ? '+' : ''}${p.toFixed(1).replace('.', ',')}%</span>`;
  };

  // ================= PAINEL =================
  function regua(itens, hoje) {
    const ini = -7; const fim = 30; const total = fim - ini;
    const pos = (d) => ((A.diff(d, hoje) - ini) / total) * 100;
    const grupos = {};
    for (const l of itens) (grupos[l.vencimento] ||= []).push(l);
    const cls = (s) => ({ pago: 'p-pago', atrasado: 'p-atrasado', aguardando_fatura: 'p-aguardando_fatura', aprovado: 'p-aprovado' }[s] || 'p-aberto');
    let pontos = '';
    for (const [d, ls] of Object.entries(grupos)) {
      ls.slice(0, 4).forEach((l, i) => {
        const excesso = i === 3 && ls.length > 4;
        const dica = excesso ? `${ls.length} lançamentos em ${dataBR(d)}` : `${l.descricao} · ${brl(l.valor)} · ${dataBR(d)} · ${A.STATUS[l.status]}`;
        const href = excesso ? `#/lancamentos?de=${d}&ate=${d}&status=` : `#/lancamentos/${l.id}`;
        pontos += `<a class="regua-ponto ${excesso ? 'p-aberto' : cls(l.status)}" style="left:${pos(d)}%;bottom:${40 + i * 25}px" href="${href}" data-dica="${esc(dica)}" aria-label="${esc(dica)}">${excesso ? `+${ls.length - 3}` : ''}</a>`;
      });
    }
    const dias = [-7, 7, 14, 21, 28].map((o) => `<span class="regua-dia" style="left:${pos(A.addDias(hoje, o))}%">${dataBR(A.addDias(hoje, o)).slice(0, 5)}</span>`).join('');
    return `<div class="regua"><div class="regua-trilho">
      <div class="regua-eixo"></div><div class="regua-passado" style="width:${pos(hoje)}%"></div>${dias}
      <div class="regua-hoje" style="left:${pos(hoje)}%"><span>Hoje</span></div>${pontos}</div></div>
      <div class="regua-legenda"><span><i class="p-atrasado"></i>Vencido</span><span><i class="p-aberto"></i>A pagar</span><span><i class="p-aguardando_fatura"></i>Aguardando fatura</span><span><i class="p-aprovado"></i>Aprovado</span><span><i class="p-pago"></i>Pago</span></div>`;
  }

  function graficoEvolucao(dados) {
    const W = 660; const H = 210; const pl = 62; const pb = 26; const pt = 10;
    const max = Math.max(1, ...dados.map((d) => Math.max(d.previsto, d.pago)));
    const passo = Math.pow(10, Math.floor(Math.log10(max))) / 2;
    const topo = Math.ceil(max / passo) * passo;
    const y = (v) => pt + (H - pb - pt) * (1 - v / topo);
    const larg = (W - pl) / dados.length;
    let s = '';
    for (let i = 0; i <= 4; i++) {
      const v = (topo / 4) * i;
      s += `<line x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#E6EAF0"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${compacto(v)}</text>`;
    }
    dados.forEach((d, i) => {
      const x = pl + i * larg + larg * 0.18; const b = larg * 0.3;
      s += `<rect x="${x}" y="${y(d.previsto)}" width="${b}" height="${Math.max(0, H - pb - y(d.previsto))}" rx="2" fill="#BFD0F3" data-dica="${esc(`${A.compLonga(d.competencia)} · previsto ${brl(d.previsto)}`)}"/>`;
      s += `<rect x="${x + b + 2}" y="${y(d.pago)}" width="${b}" height="${Math.max(0, H - pb - y(d.pago))}" rx="2" fill="#1D4FC4" data-dica="${esc(`${A.compLonga(d.competencia)} · pago ${brl(d.pago)}`)}"/>`;
      s += `<text x="${pl + i * larg + larg / 2}" y="${H - 6}" text-anchor="middle">${A.compCurta(d.competencia)}</text>`;
    });
    return `<div class="grafico"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução mensal de despesas previstas e pagas">${s}</svg></div>
      <div class="regua-legenda" style="padding:8px 0 0"><span><i style="background:#BFD0F3"></i>Previsto</span><span><i style="background:#1D4FC4"></i>Pago</span></div>`;
  }

  function listaAtencao(itens, hoje) {
    if (!itens.length) return '<div class="vazio" style="padding:26px">Nada por aqui.</div>';
    return `<ul class="atencao-lista">${itens.map((l) => {
      const [, m, d] = l.vencimento.split('-');
      const dd = A.diff(l.vencimento, hoje);
      const quando = dd === 0 ? 'hoje' : dd === 1 ? 'amanhã' : dd < 0 ? `há ${-dd} dia(s)` : `em ${dd} dias`;
      return `<li><div class="data"><b>${d}</b><span>${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][m - 1]}</span></div>
        <div class="info"><a href="#/lancamentos/${l.id}">${esc(l.descricao)}</a><div class="fraco">${esc(l.fornecedor || '')} · vence ${quando}${l.responsavel_nome ? ` · ${esc(l.responsavel_nome)}` : ''}</div></div>
        <div class="dir"><div class="num" style="font-weight:600">${brl(l.valor)}</div>${etq(l.status)}</div></li>`;
    }).join('')}</ul>`;
  }

  rota(/^\/$/, 'lancamentos.ver', 'Painel', async (el) => {
    const d = await api('GET', '/dashboard');
    const k = d.indicadores; const at = d.atencao;
    const semDados = !k.servicos_ativos && !d.linha_tempo.length;
    const abas = [['hoje', 'Hoje', at.hoje], ['amanha', 'Amanhã', at.amanha], ['sete', 'Próximos 7 dias', at.sete_dias], ['trinta', 'Até 30 dias', at.trinta_dias], ['atrasados', 'Atrasados', at.atrasados]];
    const abaInicial = (abas.find((a) => a[0] === 'atrasados' && a[2].length) || abas.find((a) => a[2].length) || abas[0])[0];
    const totalCat = d.categorias.reduce((t, c) => t + c.mensal, 0) || 1;
    const pctPago = k.previsto_mes ? Math.round((k.pago_mes / k.previsto_mes) * 100) : 0;
    el.innerHTML = `
      <div class="cabecalho"><div><h1>Painel</h1><p class="mudo">Despesas da AS Brasil em ${A.compLonga(d.competencia)}</p></div>
        <div class="acoes">${pode('lancamentos.editar') ? `<a class="btn" href="#/lancamentos?nova=1">${ic('mais')}Despesa avulsa</a>` : ''}${pode('servicos.editar') ? `<a class="btn primario" href="#/servicos?novo=1">${ic('mais')}Novo serviço</a>` : ''}</div></div>
      ${semDados ? `<div class="painel mb">${vazio('Comece cadastrando os serviços da empresa', 'Cadastre PABX, 0800, ferramentas e contratos. O AS Control gera os vencimentos e passa a avisar antes de cada cobrança.', pode('servicos.editar') ? `<div><a class="btn primario" href="#/servicos?novo=1">${ic('mais')}Cadastrar primeiro serviço</a></div>` : '')}</div>` : ''}
      <section class="painel mb" aria-label="Indicadores">
        <div class="faixa-kpi">
          <div class="kpi"><div class="rotulo">Despesas recorrentes por mês</div><div class="valor num">${brl(k.recorrente_mensal)}</div><div class="det">Projeção anual: ${brl(k.projecao_anual)}</div></div>
          <div class="kpi"><div class="rotulo">Previsto para o mês</div><div class="valor num">${brl(k.previsto_mes)}</div><div class="det">${variacao(k.previsto_mes, d.comparacao.anterior.previsto) || 'sem mês anterior para comparar'} ${d.comparacao.anterior.previsto ? 'vs. mês anterior' : ''}</div></div>
          <div class="kpi"><div class="rotulo">Pago no mês</div><div class="valor num">${brl(k.pago_mes)}</div><div class="det">${pctPago}% do previsto</div></div>
          <div class="kpi"><div class="rotulo">Pendente no mês</div><div class="valor num">${brl(k.pendente_mes)}</div><div class="det">ainda não pago</div></div>
        </div>
        <div class="faixa-sec">
          <div>Contas vencidas: <b class="${k.vencidas_qtd ? 'variacao-up' : ''}">${k.vencidas_qtd}</b>${k.vencidas_qtd ? ` · ${brl(k.vencidas_total)}` : ''}</div>
          <div>Serviços ativos: <b>${k.servicos_ativos}</b></div>
          <div>Renovações em 60 dias: <b>${k.renovacoes_proximas}</b></div>
          <div>Cobranças para conferir: <b>${at.cobrancas_pendentes}</b></div>
        </div>
      </section>
      <section class="painel mb"><div class="painel-cab"><h2>Régua de vencimentos</h2><span class="fraco">7 dias atrás até 30 dias à frente</span></div>${regua(d.linha_tempo, d.hoje)}</section>
      <div class="grade g-2-1 mb">
        <section class="painel"><div class="painel-cab"><h2>Vencimentos</h2><a href="#/lancamentos" class="fraco">Ver todos</a></div>
          <div class="abas" role="tablist">${abas.map(([id, t, l]) => `<button type="button" role="tab" data-acao="aba" data-aba="${id}" aria-selected="${id === abaInicial}">${t}<span class="n">${l.length}</span></button>`).join('')}</div>
          ${abas.map(([id, , l]) => `<div data-painel-aba="${id}" class="${id === abaInicial ? '' : 'oculto'}">${listaAtencao(l, d.hoje)}</div>`).join('')}
        </section>
        <section class="painel"><div class="painel-cab"><h2>Precisa de atenção</h2></div><div class="sinais">
          ${at.cobrancas_pendentes ? `<div class="sinal"><span class="marcador" style="background:var(--fatura)"></span><div><b>${at.cobrancas_pendentes} cobrança(s) recebida(s) sem conferência</b><div class="fraco">Confira antes de lançar.</div>${pode('cobrancas.conferir') ? '<a href="#/cobrancas" class="fraco">Abrir fila de conferência</a>' : ''}</div></div>` : ''}
          ${at.aumentos.map((a) => `<div class="sinal"><span class="marcador" style="background:var(--atraso)"></span><div style="flex:1"><b>Aumento em ${esc(a.nome)}</b>
            <div class="fraco">${brl(a.valor_anterior_centavos)} → ${brl(a.valor_novo_centavos)} (+${((a.valor_novo_centavos / a.valor_anterior_centavos - 1) * 100).toFixed(1).replace('.', ',')}%)</div>
            <div class="acoes" style="margin-top:6px"><a class="btn pequeno" href="#/servicos/${a.servico_id}">Ver serviço</a>${pode('lancamentos.editar') ? `<button class="btn pequeno fantasma" data-acao="revisarAumento" data-id="${a.id}">Marcar como revisado</button>` : ''}</div></div></div>`).join('')}
          ${at.renovacoes.map((r) => `<div class="sinal"><span class="marcador" style="background:var(--renov)"></span><div><b>${esc(r.nome)} renova em ${dataBR(r.data_renovacao)}</b>
            <div class="fraco">${r.prazo_cancelamento_dias ? `Cancelamento até ${dataBR(A.addDias(r.data_renovacao, -r.prazo_cancelamento_dias))}` : 'Sem prazo de cancelamento informado'}</div><a class="fraco" href="#/servicos/${r.id}">Abrir contrato</a></div></div>`).join('')}
          ${!at.cobrancas_pendentes && !at.aumentos.length && !at.renovacoes.length ? '<div class="sinal"><span class="marcador" style="background:var(--pago)"></span><div>Nenhum aumento, renovação ou cobrança pendente de conferência.</div></div>' : ''}
        </div></section>
      </div>
      <div class="grade g-2-1">
        <section class="painel"><div class="painel-cab"><h2>Evolução mensal</h2><span class="fraco">últimos 12 meses</span></div><div class="painel-corpo">${graficoEvolucao(d.evolucao)}</div>
          <div class="comparacao">
            <div><span>${A.compLonga(d.competencia)}</span><b class="num">${brl(d.comparacao.atual.previsto)}</b></div>
            <div><span>Mês anterior</span><b class="num">${brl(d.comparacao.anterior.previsto)}</b> ${variacao(d.comparacao.atual.previsto, d.comparacao.anterior.previsto)}</div>
            <div><span>Mesmo mês do ano passado</span><b class="num">${brl(d.comparacao.ano_anterior.previsto)}</b> ${variacao(d.comparacao.atual.previsto, d.comparacao.ano_anterior.previsto)}</div>
          </div></section>
        <section class="painel"><div class="painel-cab"><h2>Por categoria</h2><span class="fraco">custo mensal recorrente</span></div><div class="painel-corpo">
          ${d.categorias.length ? `<div class="barras-h">${d.categorias.map((c) => `<div class="barra-h"><div class="topo-b"><span>${esc(c.categoria)}</span><span class="num">${brl(c.mensal)}</span></div>
            <div class="trilho"><div style="width:${(c.mensal / totalCat) * 100}%"></div></div></div>`).join('')}</div>` : '<p class="mudo">Sem serviços ativos.</p>'}
        </div></section>
      </div>`;
  });
  S.acoes.aba = (b) => {
    const sec = b.closest('section');
    for (const x of sec.querySelectorAll('[data-acao="aba"]')) x.setAttribute('aria-selected', x === b);
    for (const p of sec.querySelectorAll('[data-painel-aba]')) p.classList.toggle('oculto', p.dataset.painelAba !== b.dataset.aba);
  };
  S.acoes.revisarAumento = async (b) => {
    try { await api('POST', `/servicos/aumentos/${b.dataset.id}/revisar`); A.toast('Aumento marcado como revisado.'); A.navegar(); } catch (e) { A.toast(e.message, true); }
  };

  // ================= SERVIÇOS =================
  function formServico(s = {}) {
    const editando = !!s.id;
    return `<div class="form-grade">
      <div class="form-secao">Identificação</div>
      ${campo('Nome do serviço', `<input type="text" name="nome" required maxlength="150" value="${esc(s.nome)}" placeholder="Ex.: PABX, Telefonia 0800, Claude">`)}
      ${campo('Fornecedor', `<input type="text" name="fornecedor" required maxlength="150" value="${esc(s.fornecedor)}">`)}
      ${campo('Categoria', `<input type="text" name="categoria" required list="lista-categorias" value="${esc(s.categoria)}"><datalist id="lista-categorias">${S.categorias.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`)}
      ${campo('Responsável interno', `<select name="responsavel_id">${A.opcoesUsuarios(s.responsavel_id)}</select>`)}
      ${campo('Descrição', `<textarea name="descricao" maxlength="2000">${esc(s.descricao)}</textarea>`, 'inteiro')}
      <div class="form-secao">Cobrança</div>
      ${campo('Tipo de valor', `<select name="tipo_valor">${opcoes({ fixo: 'Fixo', variavel: 'Variável (uso a estimativa abaixo)' }, s.tipo_valor || 'fixo')}</select>`)}
      <div class="grade" style="grid-template-columns:2fr 1fr;gap:10px">${campo('Valor por cobrança', `<input type="text" name="valor" inputmode="decimal" required value="${esc(A.paraInput(s.valor_centavos))}" placeholder="389,90">`)}
        ${campo('Moeda', `<select name="moeda">${opcoes({ BRL: 'R$', USD: 'US$', EUR: '€' }, s.moeda || 'BRL')}</select>`)}</div>
      ${campo('Periodicidade', `<select name="periodicidade" data-periodo>${opcoes(A.PERIODO, s.periodicidade || 'mensal')}</select>`)}
      <div class="grade ${s.periodicidade === 'personalizada' ? '' : 'oculto'}" data-personalizada style="grid-template-columns:1fr 1fr;gap:10px">
        ${campo('A cada', `<input type="number" name="intervalo_qtd" min="1" max="999" value="${esc(s.intervalo_qtd || '')}">`)}
        ${campo('Unidade', `<select name="intervalo_unidade">${opcoes({ meses: 'meses', dias: 'dias' }, s.intervalo_unidade || 'meses')}</select>`)}</div>
      ${campo(editando ? 'Data-base dos vencimentos' : 'Próximo vencimento', `<input type="date" name="proximo_vencimento" required value="${esc(s.base_vencimento || '')}">${editando ? '<small>Alterar esta data recalcula os próximos vencimentos ainda sem cobrança registrada.</small>' : '<small>A partir desta data o sistema gera os vencimentos automaticamente.</small>'}`)}
      ${campo('Dia habitual de cobrança', `<input type="number" name="dia_cobranca" min="1" max="31" value="${esc(s.dia_cobranca || '')}"><small>Opcional. Em meses mais curtos, usa o último dia.</small>`)}
      ${campo('Forma de pagamento', `<input type="text" name="forma_pagamento" list="lista-formas" value="${esc(s.forma_pagamento)}"><datalist id="lista-formas">${A.FORMAS.map((f) => `<option value="${esc(f)}">`).join('')}</datalist>`)}
      ${campo('Link para pagamento', `<input type="url" name="link_pagamento" value="${esc(s.link_pagamento)}" placeholder="https://">`)}
      <div class="form-secao">Contato do fornecedor</div>
      ${campo('E-mail do fornecedor', `<input type="email" name="email_fornecedor" value="${esc(s.email_fornecedor)}">`)}
      ${campo('Telefone', `<input type="tel" name="telefone" value="${esc(s.telefone)}">`)}
      ${campo('Site ou painel do fornecedor', `<input type="url" name="link_fornecedor" value="${esc(s.link_fornecedor)}" placeholder="https://">`, 'inteiro')}
      <div class="form-secao">Contrato</div>
      ${campo('Data de contratação', `<input type="date" name="data_contratacao" value="${esc(s.data_contratacao || '')}">`)}
      ${campo('Data de renovação', `<input type="date" name="data_renovacao" value="${esc(s.data_renovacao || '')}">`)}
      ${campo('Aviso prévio para cancelar (dias)', `<input type="number" name="prazo_cancelamento_dias" min="0" max="365" value="${esc(s.prazo_cancelamento_dias ?? '')}">`)}
      ${campo('Observações', `<textarea name="observacoes" maxlength="4000">${esc(s.observacoes)}</textarea>`, 'inteiro')}
    </div>`;
  }
  function abrirFormServico(s) {
    A.modal({
      titulo: s ? `Editar ${s.nome}` : 'Novo serviço', largo: true, botao: s ? 'Salvar alterações' : 'Cadastrar serviço', corpo: formServico(s || {}),
      aoAbrir: (f) => f.querySelector('[data-periodo]').addEventListener('change', (e) => f.querySelector('[data-personalizada]').classList.toggle('oculto', e.target.value !== 'personalizada')),
      aoEnviar: async (dados) => {
        if (s) { await api('PUT', `/servicos/${s.id}`, dados); A.toast('Serviço atualizado.'); A.navegar(); }
        else { const r = await api('POST', '/servicos', dados); A.toast('Serviço cadastrado. Vencimentos gerados.'); location.hash = `#/servicos/${r.id}`; }
        S.categorias = await api('GET', '/servicos/categorias');
      },
    });
  }
  S.acoes.novoServico = () => abrirFormServico();

  rota(/^\/servicos$/, 'servicos.ver', 'Serviços e contratos', async (el, _m, p) => {
    const filtros = { busca: p.busca || '', status: p.status ?? 'ativo', categoria: p.categoria || '' };
    const lista = await api('GET', `/servicos${qs(filtros)}`);
    const totalMensal = lista.filter((s) => s.status === 'ativo').reduce((t, s) => t + s.mensal_equivalente_centavos, 0);
    el.innerHTML = `<div class="cabecalho"><div><h1>Serviços e contratos</h1><p class="mudo">Assinaturas, contratos e serviços recorrentes da AS Brasil</p></div>
      <div class="acoes">${pode('servicos.editar') ? `<button class="btn primario" data-acao="novoServico">${ic('mais')}Novo serviço</button>` : ''}</div></div>
      <section class="painel">
        <form class="filtros" data-filtros>
          ${campo('Buscar', `<input type="search" name="busca" value="${esc(filtros.busca)}" placeholder="Nome ou fornecedor">`, 'largo')}
          ${campo('Status', `<select name="status">${opcoes({ ativo: 'Ativos', pausado: 'Pausados', cancelado: 'Cancelados' }, filtros.status, 'Todos')}</select>`)}
          ${campo('Categoria', `<select name="categoria">${opcoes(Object.fromEntries(S.categorias.map((c) => [c, c])), filtros.categoria, 'Todas')}</select>`)}
          <button class="btn" type="submit">Filtrar</button>
        </form>
        ${lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Serviço</th><th>Categoria</th><th class="dir">Valor</th><th>Periodicidade</th><th class="dir">Custo mensal</th><th>Próximo vencimento</th><th>Responsável</th><th>Status</th></tr></thead><tbody>
          ${lista.map((s) => `<tr class="clicavel" data-ir="#/servicos/${s.id}" tabindex="0"><td><div class="principal-txt">${esc(s.nome)}</div><div class="fraco">${esc(s.fornecedor)}</div></td>
            <td>${esc(s.categoria)}</td><td class="dir num">${A.moeda(s.valor_centavos, s.moeda)}${s.tipo_valor === 'variavel' ? '<div class="fraco">estimado</div>' : ''}</td>
            <td>${esc(A.periodoTxt(s))}</td><td class="dir num">${brl(s.mensal_equivalente_centavos)}</td>
            <td class="num">${dataBR(s.proximo_vencimento)}</td><td>${esc(s.responsavel_nome || '—')}</td><td>${etq(s.status)}</td></tr>`).join('')}
          </tbody>${filtros.status === 'ativo' ? `<tfoot><tr><td colspan="4">Total mensal dos ativos listados</td><td class="dir num">${brl(totalMensal)}</td><td colspan="3"></td></tr></tfoot>` : ''}</table></div>`
        : vazio('Nenhum serviço encontrado', filtros.busca || filtros.categoria ? 'Ajuste os filtros para ver outros resultados.' : 'Cadastre o primeiro serviço para começar a acompanhar os vencimentos.', pode('servicos.editar') ? `<div><button class="btn primario" data-acao="novoServico">${ic('mais')}Novo serviço</button></div>` : '')}
      </section>`;
    el.querySelector('[data-filtros]').addEventListener('submit', (e) => { e.preventDefault(); location.hash = `#/servicos${qs(A.coletar(e.target)) || '?status='}`; });
    if (p.novo && pode('servicos.editar')) { history.replaceState(null, '', '#/servicos'); abrirFormServico(); }
  });

  function blocoDocumentos(docs, vinculo) {
    if (docs === null) return '';
    const podeAnexar = vinculo.includes('data-demanda') ? pode('juridico.editar') : pode('documentos.enviar');
    return `<section class="painel"><div class="painel-cab"><h2>Documentos</h2>${podeAnexar ? `<button class="btn pequeno" data-acao="anexar" ${vinculo}>${ic('clipe')}Anexar</button>` : ''}</div>
      ${docs.length ? `<ul class="linha-tempo">${docs.map((d) => `<li style="display:flex;gap:10px;align-items:center"><span class="etiqueta s-cancelado">${esc(A.tipoDocTxt(d))}</span>
        <a href="/api/documentos/${d.id}/arquivo" target="_blank" rel="noopener" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.nome_original)}</a>
        <span class="fraco">${A.tamanho(d.tamanho)}</span><a class="btn fantasma icone pequeno" href="/api/documentos/${d.id}/arquivo?baixar=1" aria-label="Baixar ${esc(d.nome_original)}">${ic('baixar')}</a></li>`).join('')}</ul>`
        : '<div class="vazio" style="padding:22px">Nenhum documento anexado.</div>'}</section>`;
  }
  S.acoes.anexar = (b) => {
    A.modal({
      titulo: 'Anexar documento', botao: 'Enviar documento',
      corpo: `<div class="form-grade">${campo('Tipo', `<select name="tipo">${b.dataset.demanda ? opcoes(A.TIPO_DOC_JUR, 'citacao_intimacao') : opcoes(A.TIPO_DOC, b.dataset.lancamento ? 'boleto' : 'contrato')}</select>`)}
        ${campo('Competência', `<input type="month" name="competencia" value="${esc(b.dataset.competencia || '')}">`)}
        ${campo('Arquivo', '<input type="file" name="arquivo" required accept=".pdf,.png,.jpg,.jpeg,.webp,.xml,.docx,.xlsx,.txt"><small>PDF, imagem, XML, DOCX, XLSX ou TXT · até 15 MB</small>', 'inteiro')}</div>`,
      aoEnviar: async (dados, form) => {
        const arq = form.querySelector('[name=arquivo]').files[0];
        if (!arq) throw new Error('Selecione um arquivo.');
        const fd = new FormData();
        fd.append('tipo', dados.tipo); fd.append('competencia', dados.competencia || '');
        if (b.dataset.lancamento) fd.append('lancamento_id', b.dataset.lancamento);
        if (b.dataset.servico) fd.append('servico_id', b.dataset.servico);
        if (b.dataset.demanda) fd.append('demanda_id', b.dataset.demanda);
        fd.append('arquivo', arq);
        await api('POST', '/documentos', fd);
        A.toast('Documento anexado.'); A.navegar();
      },
    });
  };

  rota(/^\/servicos\/(\d+)$/, 'servicos.ver', 'Serviço', async (el, m) => {
    const s = await api('GET', `/servicos/${m[1]}`);
    const ed = pode('servicos.editar');
    const renovLimite = s.data_renovacao && s.prazo_cancelamento_dias ? A.addDias(s.data_renovacao, -s.prazo_cancelamento_dias) : null;
    const pagos = s.lancamentos.filter((l) => l.status === 'pago');
    const linha = (rot, val) => `<div><dt>${esc(rot)}</dt><dd>${val || '—'}</dd></div>`;
    const link = (u) => (u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\//, '').slice(0, 48))}</a>` : '');
    el.innerHTML = `<div class="cabecalho"><div><a href="#/servicos" class="fraco">← Serviços e contratos</a><h1 style="margin-top:6px">${esc(s.nome)} ${etq(s.status)}</h1><p class="mudo">${esc(s.fornecedor)} · ${esc(s.categoria)}</p></div>
      <div class="acoes">${ed ? `<button class="btn" data-acao="editarServico">Editar</button>
        ${s.status === 'ativo' ? '<button class="btn" data-acao="statusServico" data-op="pausar">Pausar</button>' : ''}
        ${s.status !== 'ativo' ? '<button class="btn primario" data-acao="statusServico" data-op="reativar">Reativar</button>' : ''}
        ${s.status !== 'cancelado' ? '<button class="btn perigo" data-acao="statusServico" data-op="cancelar">Cancelar serviço</button>' : ''}` : ''}</div></div>
      ${s.status === 'pausado' ? '<div class="aviso amarelo mb">Serviço pausado. Nenhum vencimento novo é gerado até a reativação.</div>' : ''}
      ${s.status === 'cancelado' ? '<div class="aviso vermelho mb">Serviço cancelado. O histórico de cobranças continua disponível abaixo.</div>' : ''}
      ${renovLimite && renovLimite >= A.hojeSP() ? `<div class="aviso azul mb">Renovação em ${dataBR(s.data_renovacao)}. Para não renovar, o cancelamento precisa ser pedido até <b>&nbsp;${dataBR(renovLimite)}</b>.</div>` : ''}
      <div class="grade g-2-1 mb">
        <section class="painel"><div class="painel-cab"><h2>Dados do serviço</h2></div><dl class="detalhes" style="margin:0">
          ${linha('Valor', `${A.moeda(s.valor_centavos, s.moeda)} ${s.tipo_valor === 'variavel' ? '(estimado)' : ''}${s.moeda !== 'BRL' ? ` ≈ ${brl(s.valor_brl_centavos)}` : ''}`)}
          ${linha('Periodicidade', esc(A.periodoTxt(s)))}${linha('Custo mensal equivalente', brl(s.mensal_equivalente_centavos))}${linha('Próximo vencimento', dataBR(s.proximo_vencimento))}
          ${linha('Dia habitual de cobrança', s.dia_cobranca ? `Dia ${s.dia_cobranca}` : '')}${linha('Forma de pagamento', esc(s.forma_pagamento))}
          ${linha('Responsável', esc(s.responsavel_nome))}${linha('Link para pagamento', link(s.link_pagamento))}
          ${linha('E-mail do fornecedor', s.email_fornecedor ? `<a href="mailto:${esc(s.email_fornecedor)}">${esc(s.email_fornecedor)}</a>` : '')}${linha('Telefone', esc(s.telefone))}
          ${linha('Site do fornecedor', link(s.link_fornecedor))}${linha('Contratação', dataBR(s.data_contratacao))}
          ${linha('Renovação', dataBR(s.data_renovacao))}${linha('Aviso prévio para cancelar', s.prazo_cancelamento_dias != null ? `${s.prazo_cancelamento_dias} dias` : '')}
          ${s.descricao ? `<div style="grid-column:1/-1"><dt>Descrição</dt><dd>${esc(s.descricao)}</dd></div>` : ''}
          ${s.observacoes ? `<div style="grid-column:1/-1"><dt>Observações</dt><dd>${esc(s.observacoes)}</dd></div>` : ''}
        </dl></section>
        <div class="grade" style="align-content:start">
          <section class="painel"><div class="painel-cab"><h2>Resumo</h2></div><div class="painel-corpo">
            <div class="fraco">Total pago até hoje</div><div class="valor-destaque num">${brl(pagos.reduce((t, l) => t + (l.valor_cobrado_centavos || 0), 0))}</div>
            <div class="fraco">${pagos.length} pagamento(s) registrado(s)</div></div></section>
          ${s.aumentos.length ? `<section class="painel"><div class="painel-cab"><h2>Alterações de valor</h2></div><ul class="linha-tempo">${s.aumentos.map((a) =>
            `<li><b class="variacao-up">+${((a.valor_novo_centavos / a.valor_anterior_centavos - 1) * 100).toFixed(1).replace('.', ',')}%</b> ${brl(a.valor_anterior_centavos)} → ${brl(a.valor_novo_centavos)}
            <div class="fraco">${a.origem === 'cobranca' ? 'Detectado na cobrança' : 'Alterado no cadastro'} · ${A.dataHoraBR(a.detectado_em)}${a.revisado ? ' · revisado' : ''}</div></li>`).join('')}</ul></section>` : ''}
          ${blocoDocumentos(s.documentos, `data-servico="${s.id}"`)}
        </div>
      </div>
      <section class="painel"><div class="painel-cab"><h2>Histórico de cobranças</h2></div>
        ${s.lancamentos.length ? `<div class="tabela-wrap"><table><thead><tr><th>Vencimento</th><th>Competência</th><th class="dir">Previsto</th><th class="dir">Cobrado</th><th>Pagamento</th><th>Status</th></tr></thead><tbody>
          ${s.lancamentos.map((l) => `<tr class="clicavel" data-ir="#/lancamentos/${l.id}" tabindex="0"><td class="num">${dataBR(l.vencimento)}</td><td>${A.compLonga(l.competencia)}</td>
          <td class="dir num">${brl(l.valor_previsto_centavos)}</td><td class="dir num">${brl(l.valor_cobrado_centavos)}</td><td class="num">${dataBR(l.data_pagamento)}</td><td>${etq(l.status)}</td></tr>`).join('')}
        </tbody></table></div>` : vazio('Sem lançamentos', 'Os vencimentos aparecem aqui quando o serviço está ativo.')}</section>`;
    S.acoes.editarServico = () => abrirFormServico(s);
    S.acoes.statusServico = async (b) => {
      const op = b.dataset.op;
      const textos = {
        pausar: ['Pausar serviço', 'Os vencimentos futuros ainda sem cobrança deixam de existir até a reativação. O histórico é mantido.', 'Pausar'],
        cancelar: ['Cancelar serviço', 'Os lançamentos futuros não pagos serão cancelados. O histórico continua disponível e você pode reativar depois.', 'Cancelar serviço'],
        reativar: ['Reativar serviço', 'Os vencimentos voltam a ser gerados a partir da próxima data de cobrança, sem cobranças retroativas.', 'Reativar'],
      }[op];
      if (!(await A.confirmar(textos[0], textos[1], textos[2], op === 'cancelar'))) return;
      try { await api('POST', `/servicos/${s.id}/${op}`); A.toast('Status do serviço atualizado.'); A.navegar(); } catch (e) { A.toast(e.message, true); }
    };
  });

  window.ASC_T = { blocoDocumentos, compacto, variacao, graficoEvolucao };
})();
