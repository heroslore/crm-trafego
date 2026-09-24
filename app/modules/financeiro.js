import { db } from "../core/db.js?v=e40367ec";
import { kpis, serieDiaria, porEntidade, custosExtrasNoPeriodo, pacing } from "../core/metrics.js?v=e40367ec";
import { intervalo } from "../core/periods.js?v=e40367ec";
import { progresso, badge, toast } from "../core/ui.js?v=e40367ec";
import { cartao, tabela, abrirFormulario, vazio, kpi, abas, graficoLinhas, barrasH } from "../core/ui.js?v=e40367ec";
import { esc, brl, inteiro, pct, mult, dataBR, dataCurta, hoje } from "../core/format.js?v=e40367ec";
import { bannerDemo, btnNovo } from "./comum.js?v=e40367ec";
import { rotulo as rotuloOpcao } from "../core/schema.js?v=e40367ec";
import { podeEditar } from "../core/auth.js?v=e40367ec";

let aba = "investimento";

// Quanto entra em tráfego no mês e na semana: o planejado, o gasto, o ritmo e o que sobra
// por dia. É a conta que decide se dá para escalar hoje ou se é hora de segurar.
function blocoPacing(titulo, chaveMeta, rotuloMeta, iv) {
  const meta = db.goal(chaveMeta, 0);
  const pc = pacing(iv, null, meta || null);
  const ritmo = pc.ritmo;
  const estouro = meta && pc.projecao > meta * 1.05;
  const sobrando = meta && pc.projecao < meta * 0.85;
  const cor = !meta ? "cinza" : estouro ? "vermelho" : sobrando ? "amarelo" : "verde";
  const recado = !meta
    ? "Defina o valor planejado para o sistema poder falar de ritmo, projeção e sobra."
    : estouro ? `No ritmo de hoje o mês fecha em ${brl(pc.projecao)}, acima do planejado. Para não passar, o restante precisa ficar em ${brl(pc.diarioSugerido)} por dia.`
      : sobrando ? `No ritmo de hoje fecha em ${brl(pc.projecao)}, abaixo do planejado. Sobra espaço para escalar: dá para ir até ${brl(pc.diarioSugerido)} por dia no restante.`
        : `Ritmo em linha com o planejado. O restante comporta ${brl(pc.diarioSugerido)} por dia.`;
  return cartao(`${titulo} ${badge(meta ? (estouro ? "acima do ritmo" : sobrando ? "abaixo do ritmo" : "no ritmo") : "sem plano", cor)}`,
    `<div class="form-grade" style="margin-bottom:10px"><div class="campo"><label>${esc(rotuloMeta)}</label><input type="number" step="0.01" data-meta-inv="${esc(chaveMeta)}" value="${esc(meta || "")}" placeholder="0,00"></div></div>
     <div class="kpis" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
       ${kpi({ rotulo: "Planejado", valor: meta ? brl(meta) : "—" })}
       ${kpi({ rotulo: "Gasto até agora", valor: brl(pc.gasto), destaque: true })}
       ${kpi({ rotulo: "Esperado até hoje", valor: pc.esperado != null ? brl(pc.esperado) : "—", sub: `${pc.decorridos} de ${pc.totalDias} dia(s)` })}
       ${kpi({ rotulo: "Média por dia", valor: brl(pc.porDia) })}
       ${kpi({ rotulo: "Projeção do período", valor: meta ? brl(pc.projecao) : brl(pc.projecao) })}
       ${kpi({ rotulo: "Sobra do planejado", valor: pc.sobra != null ? brl(pc.sobra) : "—" })}
       ${kpi({ rotulo: "Cabe por dia no restante", valor: pc.diarioSugerido != null ? brl(pc.diarioSugerido) : "—" })}
       ${kpi({ rotulo: "Ritmo", valor: ritmo != null ? pct(ritmo) : "—", sub: "gasto ÷ esperado até hoje" })}
     </div>
     ${meta ? progresso(pc.gasto, meta, estouro ? "var(--vermelho)" : "var(--acento)") : ""}
     <p class="sub" style="margin-top:8px">${esc(recado)}</p>`);
}

function abaInvestimento(ctx) {
  const h = hoje();
  const ivMes = intervalo({ tipo: "mes" });
  const ivSem = intervalo({ tipo: "semana" });
  const camps = porEntidade(ivMes, "campaign").filter((c) => c.k.spend > 0).sort((a, b) => b.k.spend - a.k.spend);
  const totalMes = camps.reduce((t, c) => t + c.k.spend, 0);
  return `${blocoPacing("Investimento do mês", "investimento_mes", "Planejado para este mês (R$)", ivMes)}
    ${blocoPacing("Investimento da semana", "investimento_semana", "Planejado para esta semana (R$)", ivSem)}
    ${cartao("Para onde o dinheiro do mês está indo",
      camps.length
        ? barrasH(camps.map((c) => ({ nome: c.nome, valor: c.k.spend, cor: "var(--acento)", extra: `${pct(totalMes ? c.k.spend / totalMes : 0)} do mês · ${inteiro(c.k.leads_base)} lead(s)${c.k.cpl ? " · CPL " + brl(c.k.cpl) : ""}` })), { fmt: brl })
        : vazio("Nenhuma campanha com investimento neste mês."))}
    <p class="sub">Os valores planejados ficam junto das metas e também aparecem no acompanhamento do Dashboard. O mês vai do dia 1 até hoje (${dataBR(h)}); a semana começa na segunda-feira.</p>`;
}
const colsBase = [{ key: "spend", label: "Investimento", tipo: "num", valor: (l) => l.k.spend, fmt: brl }, { key: "revenue", label: "Faturamento", tipo: "num", valor: (l) => l.k.revenue, fmt: brl }, { key: "cost", label: "Custo produtos", tipo: "num", valor: (l) => l.k.cost, fmt: brl }, { key: "taxas", label: "Taxas+frete", tipo: "num", valor: (l) => l.k.fees + l.k.shipping, fmt: brl }, { key: "gross", label: "Lucro bruto", tipo: "num", valor: (l) => l.k.gross_profit, fmt: brl }, { key: "net", label: "Lucro líquido", tipo: "num", valor: (l) => l.k.gross_profit - l.k.spend, fmt: brl }, { key: "roas", label: "ROAS", tipo: "num", valor: (l) => l.k.roas, fmt: mult }, { key: "roi", label: "ROI", tipo: "num", valor: (l) => l.k.roi, fmt: (v) => pct(v) }];

export default {
  id: "financeiro", titulo: "Financeiro", icone: "🏦",
  render(root, ctx) {
    const iv = ctx.iv, k = kpis(iv), serie = serieDiaria(iv), extras = custosExtrasNoPeriodo(iv);
    let corpo = "";
    if (aba === "investimento") corpo = abaInvestimento(ctx);
    else if (aba === "dia") corpo = cartao("Por dia", graficoLinhas({ rotulos: serie.map((d) => dataCurta(d.date)), series: [{ nome: "Faturamento", cor: "var(--verde)", valores: serie.map((d) => d.revenue) }, { nome: "Investimento", cor: "var(--acento)", valores: serie.map((d) => d.spend) }, { nome: "Lucro líquido", cor: "var(--ciano)", valores: serie.map((d) => d.gross_profit - d.spend) }], formato: "money" }) + tabela("fin-dia", { colunas: [{ key: "date", label: "Dia", fmt: dataBR }, { key: "spend", label: "Investimento", tipo: "num", fmt: brl }, { key: "revenue", label: "Faturamento", tipo: "num", fmt: brl }, { key: "cost", label: "Custo produtos", tipo: "num", fmt: brl }, { key: "taxas", label: "Taxas+frete", tipo: "num", valor: (d) => d.fees + d.shipping, fmt: brl }, { key: "gross_profit", label: "Lucro bruto", tipo: "num", fmt: brl }, { key: "traf", label: "Custo de tráfego", tipo: "num", valor: (d) => d.spend, fmt: brl }, { key: "net", label: "Lucro líquido est.", tipo: "num", valor: (d) => d.gross_profit - d.spend, fmt: brl }, { key: "roas", label: "ROAS", tipo: "num", fmt: mult }], linhas: serie.filter((d) => d.spend || d.revenue), ordem: "date" }));
    else if (aba === "campanha") corpo = cartao("Por campanha", tabela("fin-camp", { colunas: [{ key: "nome", label: "Campanha", render: (l) => `<a href="#/campanhas/${l.id}">${esc(l.nome)}</a>` }, ...colsBase], linhas: porEntidade(iv, "campaign"), ordem: "revenue" }));
    else if (aba === "produto") corpo = cartao("Por produto", tabela("fin-prod", { colunas: [{ key: "nome", label: "Produto", render: (l) => `<a href="#/produtos/${l.id}">${esc(l.nome)}</a>` }, { key: "sales", label: "Vendas", tipo: "num", valor: (l) => l.k.sales, fmt: inteiro }, ...colsBase], linhas: porEntidade(iv, "product"), ordem: "revenue" }));
    else if (aba === "plataforma") { const pl = porEntidade(iv, "platform"); corpo = cartao("Por plataforma", barrasH(pl.map((p) => ({ nome: p.nome, valor: p.k.revenue, cor: "var(--verde)", extra: "investido " + brl(p.k.spend) + " · ROAS " + mult(p.k.roas) })), { fmt: brl }) + "<div style='height:12px'></div>" + tabela("fin-plat", { colunas: [{ key: "nome", label: "Plataforma" }, { key: "leads", label: "Leads", tipo: "num", valor: (l) => l.k.leads_base, fmt: inteiro }, { key: "sales", label: "Vendas", tipo: "num", valor: (l) => l.k.sales, fmt: inteiro }, ...colsBase], linhas: pl, ordem: "revenue" })); }
    else corpo = cartao("Outros custos de tráfego (ferramentas, agência, produção)", (podeEditar() ? `<button class="btn btn-pq btn-primario" data-novo-custo style="margin-bottom:10px">➕ Lançar custo</button>` : "") + tabela("fin-extra", { colunas: [{ key: "date", label: "Data", fmt: dataBR }, { key: "type", label: "Tipo", render: (r) => esc(rotuloOpcao("cost_type", r.type)) }, { key: "description", label: "Descrição" }, { key: "value", label: "Valor", tipo: "num", fmt: brl }, { key: "acao", label: "", render: (r) => podeEditar() ? `<button class="btn btn-pq" data-editar-custo="${r.id}">✏️</button>` : "" }], linhas: extras, ordem: "date", vazioTxt: "Nenhum custo extra no período." }));
    root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>Financeiro do tráfego</h1><p class="sub">Investimento, faturamento, custo dos produtos e lucro no período</p></div></div>
      <div class="kpis">${kpi({ rotulo: "Investimento em anúncios", valor: brl(k.spend), destaque: true })}${kpi({ rotulo: "Faturamento", valor: brl(k.revenue), destaque: true })}${kpi({ rotulo: "Custo dos produtos", valor: brl(k.cost) })}${kpi({ rotulo: "Descontos dados", valor: brl(k.discount) })}${kpi({ rotulo: "Taxas e frete", valor: brl(k.fees + k.shipping) })}${kpi({ rotulo: "Lucro bruto", valor: brl(k.gross_profit), sub: "já sem mercadoria, taxas e frete" })}${kpi({ rotulo: "Custo de tráfego total", valor: brl(k.spend + k.extra_costs), sub: k.extra_costs ? "inclui " + brl(k.extra_costs) + " de outros custos" : "" })}${kpi({ rotulo: "Lucro líquido estimado", valor: brl(k.net_profit), destaque: true })}${kpi({ rotulo: "ROAS", valor: mult(k.roas) })}${kpi({ rotulo: "ROI", valor: pct(k.roi) })}</div>
      ${abas([["investimento", "💸 Investimento"], ["dia", "Por dia"], ["campanha", "Por campanha"], ["produto", "Por produto"], ["plataforma", "Por plataforma"], ["extras", "Outros custos"]], aba)}${corpo}`;
    root.querySelectorAll("[data-aba]").forEach((b) => b.addEventListener("click", () => { aba = b.dataset.aba; ctx.rerender(); }));
    const n = root.querySelector("[data-novo-custo]"); if (n) n.addEventListener("click", () => abrirFormulario("financial_records", null, { onSave: ctx.rerender }));
    root.querySelectorAll("[data-editar-custo]").forEach((b) => b.addEventListener("click", () => abrirFormulario("financial_records", b.dataset.editarCusto, { onSave: ctx.rerender, onDelete: ctx.rerender })));
    root.querySelectorAll("[data-meta-inv]").forEach((el) => el.addEventListener("change", () => {
      const chave = el.dataset.metaInv;
      db.setGoal(chave, chave === "investimento_mes" ? "Investimento planejado do mês" : "Investimento planejado da semana", Number(el.value) || 0);
      toast("Valor planejado salvo."); ctx.rerender();
    }));
  },
};
