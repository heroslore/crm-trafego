import { db } from "../core/db.js?v=f9372346";
import { kpis, comparar, porEntidade, serieDiaria, METRICAS_ROTULOS, MENOR_MELHOR } from "../core/metrics.js?v=f9372346";
import { relatorio, analise } from "../core/rules.js?v=f9372346";
import { intervalo, anterior, rotulo as rotuloPeriodo } from "../core/periods.js?v=f9372346";
import { cartao, tabela, vazio, kpi, abas, chips, graficoLinhas, itemLista, delta, fmtMetrica } from "../core/ui.js?v=f9372346";
import { esc, brl, inteiro, pct, mult, dataBR, dataCurta, hoje, somaDias, seta, variacao } from "../core/format.js?v=f9372346";
import { bannerDemo } from "./comum.js?v=f9372346";

let aba = "semanal", rankTipo = "campaign", rankOrdem = "revenue", cmpModo = "7d", cmpA = { inicio: somaDias(hoje(), -13), fim: somaDias(hoje(), -7) }, cmpB = { inicio: somaDias(hoje(), -6), fim: hoje() };
const CHAVES = ["spend", "revenue", "gross_profit", "net_profit", "roas", "roi", "leads", "sales", "conversion", "cpa", "cpl", "ticket", "ctr"];

function tabelaComparacao(cmp, chaves = CHAVES) {
  return `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Indicador</th><th class="num">Anterior</th><th class="num">Atual</th><th class="num">Variação</th></tr></thead><tbody>${chaves.map((k) => { const v = cmp.variacao[k]; const inv = MENOR_MELHOR.has(k); const cls = v == null ? "" : (inv ? v < 0 : v > 0) ? "up" : (Math.abs(v) < 0.005 ? "" : "down"); return `<tr><td>${METRICAS_ROTULOS[k] || k}</td><td class="num">${fmtMetrica(k, cmp.anterior[k])}</td><td class="num"><b>${fmtMetrica(k, cmp.atual[k])}</b></td><td class="num"><span class="delta ${cls}">${v == null ? "—" : seta(v) + " " + pct(Math.abs(v))}</span></td></tr>`; }).join("")}</tbody></table></div>`;
}
function relatorioHtml(r, titulo) {
  const { cmp } = r;
  const top = (lista, fmtSub) => lista.length ? `<ol style="padding-left:18px">${lista.map((x) => `<li style="margin:4px 0"><b>${esc(x.nome || (x.p && x.p.name))}</b><br><small>${fmtSub(x)}</small></li>`).join("")}</ol>` : vazio("Sem dados.");
  const subK = (x) => `${brl(x.k.revenue)} · ${inteiro(x.k.sales)} venda(s) · ${inteiro(x.k.leads_base)} lead(s) · ROAS ${mult(x.k.roas)} · investido ${brl(x.k.spend)}`;
  return `${cartao(titulo, `<p class="sub">${esc(rotuloPeriodo(r.iv))} comparado com ${esc(rotuloPeriodo(anterior(r.iv)))}</p><div class="kpis" style="margin-top:10px">${["spend", "revenue", "gross_profit", "roas", "leads", "sales", "cpa", "cpl", "ticket", "conversion"].map((k) => kpi({ rotulo: METRICAS_ROTULOS[k], valor: fmtMetrica(k, cmp.atual[k]), delta: cmp.variacao[k], invertido: MENOR_MELHOR.has(k) })).join("")}</div>${tabelaComparacao(cmp)}`)}
    <div class="grid3">${cartao("TOP 5 campanhas", top(r.topCampanhas, subK))}${cartao("TOP 5 produtos", top(r.topProdutos, (x) => `${brl(x.k.revenue)} · ${inteiro(x.k.sales)} venda(s) · lucro ${brl(x.k.gross_profit)}`))}${cartao("TOP 5 criativos", top(r.topCriativos, subK))}</div>
    <div class="grid3">${cartao("Campanhas com pior desempenho", top(r.pioresCampanhas, subK))}${cartao("Produtos com pouca saída", top(r.produtosPoucaSaida, (x) => `${inteiro(x.k.sales)} venda(s) no período · estoque ${inteiro(x.p.stock)}`))}${cartao("Produtos com maior crescimento", top(r.produtosCrescimento, (x) => `+${x.cresc} venda(s) na semana vs anterior (${x.r.qtd7} × ${x.r.qtd7ant})`))}</div>
    ${cartao("Leitura do analista", analise(r.iv).map((p) => `<p style="margin:6px 0">${esc(p)}</p>`).join(""))}`;
}
function rankings(iv) {
  const tipos = [["campaign", "Campanhas"], ["ad_set", "Conjuntos"], ["ad", "Anúncios"], ["creative", "Criativos"], ["product", "Produtos"], ["audience", "Públicos"], ["seller", "Vendedores"]];
  const ordens = [["revenue", "Faturamento"], ["gross_profit", "Lucro"], ["roas", "ROAS"], ["sales", "Vendas"], ["cpa", "CPA"], ["cpl_qualificado", "CPL qualificado"], ["conversion", "Conversão"]];
  const lista = porEntidade(iv, rankTipo).filter((x) => x.k.spend || x.k.sales || x.k.leads).sort((a, b) => { const va = a.k[rankOrdem], vb = b.k[rankOrdem]; if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1; return MENOR_MELHOR.has(rankOrdem) ? va - vb : vb - va; });
  const href = { campaign: "campanhas", ad: "anuncios", creative: "criativos", product: "produtos" }[rankTipo];
  return `${chips(tipos, rankTipo, "data-rank-tipo")}<div style="height:8px"></div>${chips(ordens, rankOrdem, "data-rank-ordem")}<div style="height:12px"></div>${cartao(`Melhores ${tipos.find((t) => t[0] === rankTipo)[1].toLowerCase()} por ${ordens.find((o) => o[0] === rankOrdem)[1].toLowerCase()}`, lista.length ? `<div class="lista">${lista.map((x, i) => itemLista({ titulo: `<span class="ranking-pos ${i < 3 ? "p" + (i + 1) : ""}">${i + 1}</span>${href ? `<a href="#/${href}/${x.id}">${esc(x.nome)}</a>` : esc(x.nome)}`, sub: `investido ${brl(x.k.spend)} · ${inteiro(x.k.leads_base)} lead(s) · ${inteiro(x.k.sales)} venda(s) · lucro ${brl(x.k.gross_profit)} · CPA ${brl(x.k.cpa)} · conversão ${pct(x.k.conversion)}`, direita: `<b>${fmtMetrica(rankOrdem, x.k[rankOrdem])}</b>` })).join("")}</div>` : vazio("Sem dados no período."))}`;
}
function comparador() {
  let a, b;
  if (cmpModo === "7d") { b = intervalo({ tipo: "7d" }); a = anterior(b); }
  else if (cmpModo === "mes") { b = intervalo({ tipo: "mes" }); a = anterior(b); }
  else { a = { ...cmpA, dias: 0 }; b = { ...cmpB, dias: 0 }; }
  const ka = kpis(a), kb = kpis(b), cmp = { atual: kb, anterior: ka, variacao: Object.fromEntries(CHAVES.map((k) => [k, variacao(kb[k], ka[k])])) };
  return `${chips([["7d", "Últimos 7 dias × 7 anteriores"], ["mes", "Este mês × mês anterior"], ["custom", "Períodos personalizados"]], cmpModo, "data-cmp")}${cmpModo === "custom" ? `<div class="filtros-linha" style="margin-top:10px"><span>Período A:</span><input type="date" data-cmp-a-ini value="${cmpA.inicio}"><input type="date" data-cmp-a-fim value="${cmpA.fim}"><span>Período B:</span><input type="date" data-cmp-b-ini value="${cmpB.inicio}"><input type="date" data-cmp-b-fim value="${cmpB.fim}"></div>` : ""}<div style="height:12px"></div>${cartao(`${esc(rotuloPeriodo(a))} (anterior) × ${esc(rotuloPeriodo(b))} (atual)`, tabelaComparacao(cmp))}`;
}
export default {
  id: "relatorios", titulo: "Relatórios", icone: "📑",
  render(root, ctx) {
    if (ctx.rota.aba) aba = ctx.rota.aba;
    let corpo = "";
    if (aba === "semanal") { const fimSemana = intervalo({ tipo: "semana_ant" }); corpo = `<div class="chips" style="margin-bottom:12px"><button class="chip${!ctx.rota.id ? " ativa" : ""}" data-sem="">Semana passada (fechada)</button><button class="chip${ctx.rota.id === "atual" ? " ativa" : ""}" data-sem="atual">Semana atual (parcial)</button></div>` + relatorioHtml(relatorio(ctx.rota.id === "atual" ? intervalo({ tipo: "semana" }) : fimSemana), "Relatório semanal automático"); }
    else if (aba === "mensal") { const ivM = ctx.rota.id === "anterior" ? intervalo({ tipo: "mes_ant" }) : intervalo({ tipo: "mes" }); const serie = serieDiaria(ivM); corpo = `<div class="chips" style="margin-bottom:12px"><button class="chip${!ctx.rota.id ? " ativa" : ""}" data-mes="">Mês atual × anterior</button><button class="chip${ctx.rota.id === "anterior" ? " ativa" : ""}" data-mes="anterior">Mês anterior × retrasado</button></div>` + relatorioHtml(relatorio(ivM), "Relatório mensal") + cartao("Evolução no mês", graficoLinhas({ rotulos: serie.map((d) => dataCurta(d.date)), series: [{ nome: "Faturamento", cor: "var(--verde)", valores: serie.map((d) => d.revenue) }, { nome: "Investimento", cor: "var(--acento)", valores: serie.map((d) => d.spend) }], formato: "money" }) + graficoLinhas({ rotulos: serie.map((d) => dataCurta(d.date)), series: [{ nome: "Leads", cor: "var(--ciano)", valores: serie.map((d) => d.leads) }, { nome: "Vendas", cor: "var(--verde)", valores: serie.map((d) => d.sales) }], barras: true, altura: 160 })); }
    else if (aba === "comparador") corpo = comparador();
    else if (aba === "rankings") corpo = rankings(ctx.iv);
    else corpo = cartao("Analista de Tráfego IA", `<div class="aviso aviso-info">Texto gerado a partir dos números do período selecionado no topo (${esc(rotuloPeriodo(ctx.iv))}). Apenas dados, análises e sugestões.</div>${analise(ctx.iv).map((p) => `<p style="margin:8px 0;line-height:1.6">${esc(p)}</p>`).join("")}`);
    root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>Relatórios</h1><p class="sub">Semanal e mensal automáticos, comparador de períodos, rankings e leitura do analista</p></div><div class="pagina-acoes"><button class="btn" onclick="window.print()">🖨️ Imprimir / PDF</button></div></div>${abas([["semanal", "Semanal"], ["mensal", "Mensal"], ["comparador", "Comparador"], ["rankings", "Rankings"], ["ia", "Analista IA"]], aba)}${corpo}`;
    root.querySelectorAll("[data-aba]").forEach((b) => b.addEventListener("click", () => { aba = b.dataset.aba; ctx.navegar(`#/relatorios?aba=${aba}`); }));
    root.querySelectorAll("[data-sem]").forEach((b) => b.addEventListener("click", () => ctx.navegar(`#/relatorios/${b.dataset.sem}?aba=semanal`)));
    root.querySelectorAll("[data-mes]").forEach((b) => b.addEventListener("click", () => ctx.navegar(`#/relatorios/${b.dataset.mes}?aba=mensal`)));
    root.querySelectorAll("[data-rank-tipo]").forEach((b) => b.addEventListener("click", () => { rankTipo = b.dataset.rankTipo; ctx.rerender(); }));
    root.querySelectorAll("[data-rank-ordem]").forEach((b) => b.addEventListener("click", () => { rankOrdem = b.dataset.rankOrdem; ctx.rerender(); }));
    root.querySelectorAll("[data-cmp]").forEach((b) => b.addEventListener("click", () => { cmpModo = b.dataset.cmp; ctx.rerender(); }));
    const liga = (sel, fn) => { const el = root.querySelector(sel); if (el) el.addEventListener("change", (e) => { fn(e.target.value); ctx.rerender(); }); };
    liga("[data-cmp-a-ini]", (v) => cmpA.inicio = v); liga("[data-cmp-a-fim]", (v) => cmpA.fim = v); liga("[data-cmp-b-ini]", (v) => cmpB.inicio = v); liga("[data-cmp-b-fim]", (v) => cmpB.fim = v);
  },
};
