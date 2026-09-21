import { db } from "../core/db.js?v=02b90ebf";
import { kpis, porEntidade, mediaCampanhas } from "../core/metrics.js?v=02b90ebf";
import { intervalo } from "../core/periods.js?v=02b90ebf";
import { cartao, vazio, itemLista, badge, prioridadeBadge } from "../core/ui.js?v=02b90ebf";
import { esc, brl, inteiro, mult, dataBR, hoje, diasEntre, pct } from "../core/format.js?v=02b90ebf";
import { bannerDemo, agendaDoDia } from "./comum.js?v=02b90ebf";
import { situacaoCampanha } from "../core/rules.js?v=02b90ebf";
import * as W from "../core/wame.js?v=02b90ebf";

export default {
  id: "hoje", titulo: "Hoje", icone: "☀️",
  render(root) {
    const iv = intervalo({ tipo: "hoje" }), ivOntem = intervalo({ tipo: "ontem" }), h = hoje();
    const k = kpis(iv), ko = kpis(ivOntem);
    const camps = porEntidade(iv, "campaign").filter((x) => x.k.spend > 0 || x.k.sales > 0);
    const melhor = camps.filter((x) => x.k.sales > 0 || x.k.leads_base > 0).sort((a, b) => ((b.k.roas || 0) - (a.k.roas || 0)) || (b.k.sales - a.k.sales) || (b.k.leads_base - a.k.leads_base))[0];
    const pior = camps.filter((x) => x.k.spend > 0).sort((a, b) => ((a.k.roas ?? -1) - (b.k.roas ?? -1)) || (b.k.spend - a.k.spend))[0];
    const semVenda = camps.filter((x) => x.k.spend > 0 && !x.k.sales && !x.k.leads_base);
    const prods = porEntidade(iv, "product").filter((x) => x.k.sales > 0).sort((a, b) => b.k.sales - a.k.sales || b.k.revenue - a.k.revenue);
    const leadsParadosHoje = db.where("leads", (l) => l.stage === "novo" && diasEntre(l.entered_at, h) >= 1);
    const urgentes = db.where("tasks", (t) => t.status !== "finalizado" && (t.priority === "urgente" || (t.due_date && t.due_date <= h)));
    const agenda = agendaDoDia();
    const semDados = !k.spend && !k.sales && !k.leads;
    const P = (q, r, d = "") => `<div class="pergunta"><div class="q">${q}</div><div class="r">${r}</div>${d ? `<div class="d">${d}</div>` : ""}</div>`;
    root.innerHTML = `${bannerDemo()}
      <div class="pagina-cab"><div><h1>Hoje, ${dataBR(h)}</h1><p class="sub">Respostas rápidas com o que já foi lançado hoje. O investimento da Meta chega no dia seguinte, pela coleta automática.</p></div><div class="pagina-acoes"><a class="btn btn-primario" href="#/leads?novo=1">➕ Lead</a><a class="btn btn-verde" href="#/vendas?novo=1">💰 Venda</a></div></div>
      ${semDados ? `<div class="aviso aviso-info">Ainda não há lançamentos de hoje. Ontem: ${brl(ko.spend)} investidos, ${inteiro(ko.leads)} lead(s), ${inteiro(ko.sales)} venda(s).</div>` : ""}
      <div class="hoje-grade">
        ${P("Quanto gastei hoje?", brl(k.spend), `ontem ${brl(ko.spend)}`)}
        ${P("Quanto vendi hoje?", brl(k.revenue), `${inteiro(k.sales)} venda(s) · ontem ${brl(ko.revenue)}`)}
        ${P("Quanto lucrei?", brl(k.net_profit), `lucro bruto ${brl(k.gross_profit)} menos anúncios ${brl(k.spend)}`)}
        ${P("Quantos leads chegaram?", inteiro(k.leads), `ontem ${inteiro(ko.leads)}${k.cpl ? " · CPL " + brl(k.cpl) : ""}`)}
        ${P("Quantas vendas foram feitas?", inteiro(k.sales), k.ticket ? "ticket médio " + brl(k.ticket) : "")}
        ${P("Qual campanha está melhor?", melhor ? `<a href="#/campanhas/${melhor.id}">${esc(melhor.nome)}</a>` : "—", melhor ? `${inteiro(melhor.k.sales)} venda(s), ${inteiro(melhor.k.leads_base)} lead(s), ROAS ${mult(melhor.k.roas)}` : "sem resultado registrado hoje")}
        ${P("Qual campanha está pior?", pior ? `<a href="#/campanhas/${pior.id}">${esc(pior.nome)}</a>` : "—", pior ? `${brl(pior.k.spend)} gastos · ROAS ${mult(pior.k.roas)}` : "sem investimento registrado hoje")}
        ${P("Qual produto mais vendeu?", prods[0] ? `<a href="#/produtos/${prods[0].id}">${esc(prods[0].nome)}</a>` : "—", prods[0] ? `${inteiro(prods[0].k.quantity)} unidade(s) · ${brl(prods[0].k.revenue)}` : "nenhuma venda hoje")}
        ${P("Campanha gastando sem vender?", semVenda.length ? `<span style="color:var(--vermelho)">${semVenda.length} sim</span>` : `<span style="color:var(--verde)">Não</span>`, semVenda.map((x) => esc(x.nome) + " (" + brl(x.k.spend) + ")").join(", "))}
        ${W.configurado() ? P("Conversas sem responder?", W.estado.naoLidas ? `<span style="color:var(--laranja)">${W.estado.naoLidas}</span>` : `<span style="color:var(--verde)">Nenhuma</span>`, W.estado.naoLidas ? `mensagem(ns) não lida(s) · <a href="#/inbox">abrir conversas</a>` : "tudo respondido") : ""}
        ${P("Existe lead parado?", leadsParadosHoje.length ? `<span style="color:var(--vermelho)">${leadsParadosHoje.length}</span>` : `<span style="color:var(--verde)">Não</span>`, leadsParadosHoje.length ? "novos sem resposta há mais de 1 dia · <a href='#/leads'>abrir funil</a>" : "")}
        ${P("Tarefa urgente?", urgentes.length ? `<span style="color:var(--laranja)">${urgentes.length}</span>` : `<span style="color:var(--verde)">Não</span>`, urgentes.slice(0, 3).map((t) => esc(t.title)).join(" · ") + (urgentes.length ? " · <a href='#/tarefas'>ver</a>" : ""))}
      </div>
      <div class="grid2" style="margin-top:14px">
        ${cartao("Agenda de hoje", agenda.length ? `<div class="lista">${agenda.map((a) => itemLista({ titulo: esc(a.titulo), sub: (a.atrasado ? "atrasado · " : "") + dataBR(a.data), badges: a.prioridade ? prioridadeBadge(a.prioridade) : "", href: a.href })).join("")}</div>` : vazio("Nada pendente."))}
        ${cartao("Campanhas ativas hoje", camps.length ? `<div class="lista">${camps.sort((a, b) => b.k.spend - a.k.spend).map((x) => itemLista({ titulo: esc(x.nome), sub: `${brl(x.k.spend)} · ${inteiro(x.k.leads_base)} lead(s) · ${inteiro(x.k.sales)} venda(s)`, direita: mult(x.k.roas), href: `#/campanhas/${x.id}` })).join("")}</div>` : vazio("Nenhuma campanha com lançamento hoje."))}
      </div>`;
  },
};
