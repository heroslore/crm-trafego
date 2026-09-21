import { db } from "../core/db.js?v=c59cb573";
import { comparar, serieDiaria, progressoMetas, porEntidade } from "../core/metrics.js?v=c59cb573";
import { intervalo, rotulo as rotuloPeriodo } from "../core/periods.js?v=c59cb573";
import { cartao, graficoLinhas, progresso, vazio, funil, itemLista, badge, chips, badgeOpcao, prioridadeBadge, tabela } from "../core/ui.js?v=c59cb573";
import { esc, brl, inteiro, pct, mult, dataCurta, dataBR, brlCurto, hoje } from "../core/format.js?v=c59cb573";
import { rotulo as rotuloOpcao, OPCOES } from "../core/schema.js?v=c59cb573";
import { alertas } from "../core/rules.js?v=c59cb573";
import { bannerDemo, cartoesKpi, cartoesContagem, KPIS_PRINCIPAIS, leadsParados, agendaDoDia, fechaEmBreve } from "./comum.js?v=c59cb573";

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
    const topCamp = porEntidade(iv, "campaign").filter((x) => x.k.spend > 0 || x.k.sales > 0).sort((a, b) => (b.k.revenue - a.k.revenue) || (b.k.leads - a.k.leads)).slice(0, 5);
    const alertasLista = alertas(iv).slice(0, 6);

    root.innerHTML = `${bannerDemo()}
      <div class="pagina-cab"><div><h1>Dashboard</h1><p class="sub">${esc(rotuloPeriodo(iv))} · comparado com o período anterior de ${iv.dias} dia(s)</p></div><div class="pagina-acoes"><a class="btn" href="#/hoje">☀️ Hoje</a><a class="btn" href="#/decisoes">🎯 Decisões</a></div></div>
      <div class="kpis">${cartoesKpi(cmp, serie, KPIS_PRINCIPAIS)}${cartoesContagem()}</div>
      <div class="grid2">
        ${cartao("Evolução no período", grafico, chips(GRAFICOS, graficoSel, "data-grafico"))}
        ${cartao("Alertas", alertasLista.length ? `<div class="lista">${alertasLista.map((a) => itemLista({ titulo: esc(a.texto), sub: esc(a.categoria), badges: prioridadeBadge(a.prioridade), href: a.link })).join("")}</div>` : `<div class="aviso aviso-ok">Nenhum alerta com os dados atuais.</div>`, `<a href="#/decisoes" class="link">ver central</a>`)}
      </div>
      <div class="grid2">
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
