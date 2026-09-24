import { db } from "../core/db.js?v=ebf7a3c7";
import { comparar, serieDiaria, progressoMetas, porEntidade, atendimento, filaDeAtendimento, pacing } from "../core/metrics.js?v=ebf7a3c7";
import { intervalo, rotulo as rotuloPeriodo } from "../core/periods.js?v=ebf7a3c7";
import { cartao, graficoLinhas, progresso, vazio, funil, itemLista, badge, chips, badgeOpcao, prioridadeBadge, tabela, kpi, barrasH } from "../core/ui.js?v=ebf7a3c7";
import { esc, brl, inteiro, pct, mult, dataCurta, dataBR, brlCurto, hoje } from "../core/format.js?v=ebf7a3c7";
import { rotulo as rotuloOpcao, OPCOES } from "../core/schema.js?v=ebf7a3c7";
import { alertas, narrativaAtendimento, formatoMinutos } from "../core/rules.js?v=ebf7a3c7";
import { bannerDemo, cartoesKpi, cartoesContagem, KPIS_PRINCIPAIS, leadsParados, agendaDoDia, fechaEmBreve } from "./comum.js?v=ebf7a3c7";

let graficoSel = "fat_inv";
const GRAFICOS = [["fat_inv", "Faturamento × investimento"], ["spend", "Investimento por dia"], ["revenue", "Faturamento por dia"], ["leads", "Leads por dia"], ["sales", "Vendas por dia"], ["roas", "ROAS por dia"], ["cpa", "CPA por dia"]];

export default {
  id: "dashboard", titulo: "Dashboard", icone: "📊",
  render(root, ctx) {
    const iv = ctx.iv, cmp = comparar(iv), serie = serieDiaria(iv);
    const rot = serie.map((d) => dataCurta(d.date));
    let grafico;
    if (graficoSel === "fat_inv") grafico = graficoLinhas({ rotulos: rot, series: [{ nome: "Faturamento", cor: "var(--verde)", valores: serie.map((d) => d.revenue) }, { nome: "Investimento", cor: "var(--acento)", valores: serie.map((d) => d.spend) }], formato: "money" });
    else if (graficoSel === "leads" || graficoSel === "sales") grafico = graficoLinhas({ rotulos: rot, series: [{ nome: graficoSel === "leads" ? "Leads" : "Vendas", cor: graficoSel === "leads" ? "var(--ciano)" : "var(--verde)", valores: serie.map((d) => d[graficoSel]) }], barras: true });
    else grafico = graficoLinhas({ rotulos: rot, series: [{ nome: GRAFICOS.find((g) => g[0] === graficoSel)[1], cor: graficoSel === "spend" ? "var(--acento)" : graficoSel === "cpa" ? "var(--laranja)" : "var(--verde)", valores: serie.map((d) => d[graficoSel] || 0) }], formato: ["spend", "revenue", "cpa"].includes(graficoSel) ? "money" : graficoSel === "roas" ? "mult" : "int", barras: graficoSel === "spend" || graficoSel === "revenue" });

    const metas = progressoMetas(intervalo({ tipo: "mes" }), intervalo({ tipo: "semana" }));
    const etapas = OPCOES.lead_stage.filter((e) => !["venda", "perdido"].includes(e[0]));
    const abertos = db.where("leads", (l) => !["venda", "perdido"].includes(l.stage));
    const valorEtapa = etapas.map(([id, nome]) => { const ls = abertos.filter((l) => l.stage === id); return { rotulo: nome, n: ls.length, extra: brlCurto(ls.reduce((s, l) => s + (Number(l.potential_value) || 0), 0)), cor: ["var(--ciano)", "var(--roxo)", "var(--roxo)", "var(--amarelo)", "var(--amarelo)", "var(--laranja)", "var(--azul)"][etapas.findIndex((e) => e[0] === id)] }; });
    const parados = leadsParados(14), agenda = agendaDoDia(), breve = fechaEmBreve(7);
    const at = atendimento(iv), fila = filaDeAtendimento(), pc = pacing(intervalo({ tipo: "mes" }));
    const faixa = (n, rot, cor) => ({ nome: rot, valor: n, cor, extra: at.medidos ? pct(n / at.medidos) : "" });
    const cartaoAtendimento = cartao(`Atendimento dos leads <small>meta: primeiro contato em até ${at.sla} min</small>`, at.total ? `
      <div class="kpis" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:10px">
        ${kpi({ rotulo: "Leads no período", valor: inteiro(at.total) })}
        ${kpi({ rotulo: "Atendidos", valor: inteiro(at.atendidos), sub: at.taxaContato != null ? pct(at.taxaContato) + " de contato" : "" })}
        ${kpi({ rotulo: "Nunca atendidos", valor: inteiro(at.naoAtendidos), destaque: at.naoAtendidos > 0 })}
        ${kpi({ rotulo: "Tempo médio", valor: formatoMinutos(at.tempoMedio), sub: at.mediana != null ? "mediana " + formatoMinutos(at.mediana) : "", destaque: true })}
        ${kpi({ rotulo: "Dentro da meta", valor: at.medidos ? pct(at.dentroSla / at.medidos) : "—", sub: `${at.dentroSla} de ${at.medidos}` })}
        ${kpi({ rotulo: "Responderam", valor: inteiro(at.responderam), sub: at.taxaResposta != null ? pct(at.taxaResposta) + " dos atendidos" : "" })}
        ${kpi({ rotulo: "Qualificados", valor: inteiro(at.qualificados), sub: at.taxaQualificacao != null ? pct(at.taxaQualificacao) : "" })}
        ${kpi({ rotulo: "Compraram", valor: inteiro(at.compraram), sub: at.taxaFechamento != null ? pct(at.taxaFechamento) + " dos leads" : "" })}
      </div>
      <h3>Em quanto tempo o lead foi atendido</h3>
      ${barrasH([faixa(at.ate5, "Em até 5 min", "var(--verde)"), faixa(at.ate15 - at.ate5, "5 a 15 min", "var(--ciano)"), faixa(at.ate60 - at.ate15, "15 min a 1 h", "var(--amarelo)"), faixa(at.acima60, "Mais de 1 h", "var(--vermelho)")], { vazioTxt: "Sem tempos medidos no período." })}
      ${fila.esperando.length ? `<div class="aviso ${fila.foraSla.length ? "aviso-erro" : "aviso-alerta"}" style="margin-top:12px">${fila.foraSla.length ? `⏰ <b>${fila.foraSla.length} lead(s) passaram da meta</b> e seguem sem contato. ` : ""}${fila.esperando.length} na fila agora. Mais antigo: <a href="#/leads/${fila.esperando[0].lead.id}">${esc(fila.esperando[0].lead.name)}</a>, há ${formatoMinutos(fila.esperando[0].minutos)}.</div>` : `<div class="aviso aviso-ok" style="margin-top:12px">Ninguém esperando atendimento agora.</div>`}
      ${fila.followups.length ? `<div class="aviso aviso-alerta">📅 ${fila.followups.length} follow-up(s) vencido(s) ou para hoje.</div>` : ""}`
      : `<div class="vazio">Nenhum lead novo no período.</div>`, `<a href="#/leads" class="link">abrir funil</a>`);
    const cartaoPacing = pc.meta ? cartao("Ritmo do orçamento do mês", `
      <div class="kpis" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr));margin-bottom:10px">
        ${kpi({ rotulo: "Orçamento do mês", valor: brl(pc.meta) })}
        ${kpi({ rotulo: "Gasto até hoje", valor: brl(pc.gasto), sub: `dia ${pc.decorridos} de ${pc.totalDias}` })}
        ${kpi({ rotulo: "Deveria ter gasto", valor: brl(pc.esperado) })}
        ${kpi({ rotulo: "Projeção do mês", valor: brl(pc.projecao), destaque: true, sub: pc.projecao > pc.meta ? "acima do limite" : "dentro do limite" })}
        ${kpi({ rotulo: "Diário sugerido", valor: brl(pc.diarioSugerido), sub: "para fechar no limite" })}
      </div>${progresso(pc.gasto, pc.meta, pc.gasto > pc.meta ? "var(--vermelho)" : "")}
      <p class="sub" style="margin-top:6px">${pc.ritmo != null ? (pc.ritmo > 1.08 ? `Gastando ${pct(pc.ritmo - 1)} acima do ritmo previsto.` : pc.ritmo < 0.9 ? `Gastando ${pct(1 - pc.ritmo)} abaixo do ritmo: sobra orçamento para escalar.` : "No ritmo certo.") : ""}</p>`)
      : cartao("Ritmo do orçamento do mês", `<div class="vazio">Defina o investimento máximo mensal em <a href="#/config?aba=metas">Configurações → Metas</a> para acompanhar o ritmo do gasto.</div>`);
    const topCamp = porEntidade(iv, "campaign").filter((x) => x.k.spend > 0 || x.k.sales > 0).sort((a, b) => (b.k.revenue - a.k.revenue) || (b.k.leads - a.k.leads)).slice(0, 5);
    const alertasLista = alertas(iv).slice(0, 6);

    root.innerHTML = `${bannerDemo()}
      <div class="pagina-cab"><div><h1>Dashboard</h1><p class="sub">${esc(rotuloPeriodo(iv))} · comparado com o período anterior de ${iv.dias} dia(s)</p></div><div class="pagina-acoes"><a class="btn" href="#/hoje">☀️ Hoje</a><a class="btn" href="#/decisoes">🎯 Decisões</a></div></div>
      <div class="kpis">${cartoesKpi(cmp, serie, KPIS_PRINCIPAIS)}${cartoesContagem()}</div>
      ${cartao("O que aconteceu depois que o lead chegou", `<div class="narrativa">${narrativaAtendimento(iv).map((f) => `<p>${esc(f)}</p>`).join("")}</div>`, `<a href="#/decisoes?aba=ia" class="link">análise completa</a>`)}
      ${cartaoAtendimento}
      <div class="grid2">
        ${cartao("Evolução no período", grafico, chips(GRAFICOS, graficoSel, "data-grafico"))}
        ${cartao("Alertas", alertasLista.length ? `<div class="lista">${alertasLista.map((a) => itemLista({ titulo: esc(a.texto), sub: esc(a.categoria), badges: prioridadeBadge(a.prioridade), href: a.link })).join("")}</div>` : `<div class="aviso aviso-ok">Nenhum alerta com os dados atuais.</div>`, `<a href="#/decisoes" class="link">ver central</a>`)}
      </div>
      <div class="grid2">
        ${cartaoPacing}
        ${cartao("Metas", metas.length ? metas.map((m) => { const r = m.realizado || 0; const p = m.meta ? r / m.meta : 0; const fmt = m.tipo === "money" ? brl : m.tipo === "mult" ? mult : inteiro; return `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:.86rem"><span>${esc(m.rotulo)}</span><span><b>${fmt(r)}</b> de ${fmt(m.meta)} · ${pct(p)}</span></div>${progresso(m.limite ? (p > 1 ? 1 : p) : p, 1, m.limite && p > 1 ? "var(--vermelho)" : (m.limite ? "var(--amarelo)" : ""))}</div>`; }).join("") : `<div class="vazio">Defina metas em Configurações → Metas para acompanhar o progresso aqui.</div>`, `<a href="#/config?aba=metas" class="link">editar metas</a>`)}
        ${cartao("Valor por etapa", `<div class="sub" style="margin-bottom:8px">${abertos.length} negócio(s) em aberto · ${brl(abertos.reduce((s, l) => s + (Number(l.potential_value) || 0), 0))} potencial</div>${funil(valorEtapa)}`, `<a href="#/leads" class="link">abrir funil</a>`)}
      </div>
      <div class="grid3">
        ${cartao("Minha agenda", agenda.length ? `<div class="lista">${agenda.slice(0, 8).map((a) => itemLista({ titulo: esc(a.titulo), sub: (a.atrasado ? "atrasado · " : "") + dataBR(a.data), badges: a.atrasado ? badge("atrasado", "vermelho") : "", href: a.href })).join("")}</div>` : vazio("Nada pendente para hoje."), `<span class="${agenda.some((a) => a.atrasado) ? "badge badge-vermelho" : ""}">${agenda.filter((a) => a.atrasado).length ? agenda.filter((a) => a.atrasado).length + " atrasada(s)" : ""}</span>`)}
        ${cartao("Parados há mais de 14 dias", parados.length ? `<div class="lista">${parados.slice(0, 8).map(({ l, dias }) => itemLista({ titulo: esc(l.name), sub: esc(rotuloOpcao("lead_stage", l.stage)) + " · parado há " + dias + " dias", direita: brl(l.potential_value), badges: badge(dias + "d", "laranja"), href: `#/leads/${l.id}` })).join("")}</div>` : vazio("Nenhum negócio parado."), `<b>${parados.length}</b>`)}
        ${cartao("Fecha em breve", breve.length ? `<div class="lista">${breve.map((l) => itemLista({ titulo: esc(l.name), sub: esc(rotuloOpcao("lead_stage", l.stage)) + " · previsão " + dataBR(l.expected_close), direita: brl(l.potential_value), href: `#/leads/${l.id}` })).join("")}</div>` : vazio("Nenhum negócio com previsão de fechamento nos próximos 7 dias."), `<b>${breve.length}</b>`)}
      </div>
      ${cartao("Campanhas com mais resultado no período", tabela("dash-camp", { colunas: [{ key: "nome", label: "Campanha", render: (l) => `<a href="#/campanhas/${l.id}">${esc(l.nome)}</a>` }, { key: "spend", label: "Investimento", tipo: "num", valor: (l) => l.k.spend, fmt: brl }, { key: "revenue", label: "Faturamento", tipo: "num", valor: (l) => l.k.revenue, fmt: brl }, { key: "roas", label: "ROAS", tipo: "num", valor: (l) => l.k.roas, fmt: mult }, { key: "leads", label: "Leads", tipo: "num", valor: (l) => l.k.leads, fmt: inteiro }, { key: "sales", label: "Vendas", tipo: "num", valor: (l) => l.k.sales, fmt: inteiro }, { key: "cpa", label: "CPA", tipo: "num", valor: (l) => l.k.cpa, fmt: brl }], linhas: topCamp, ordem: "revenue", vazioTxt: "Sem campanhas com investimento ou vendas no período." }), `<a href="#/relatorios?aba=rankings" class="link">rankings completos</a>`)}`;
    root.querySelectorAll("[data-grafico]").forEach((b) => b.addEventListener("click", () => { graficoSel = b.dataset.grafico; ctx.rerender(); }));
  },
};
