import { db } from "../core/db.js?v=bb300066";
import { kpis, vendasNoPeriodo, custoDaVenda, porEntidade, liquidoDaVenda, taxaPagamento, vendaVale } from "../core/metrics.js?v=bb300066";
import { cartao, tabela, badge, badgeOpcao, abrirFormulario, vazio, kpi, barrasH, toast, itemLista } from "../core/ui.js?v=bb300066";
import { esc, brl, inteiro, pct, mult, dataBR, hoje, agora } from "../core/format.js?v=bb300066";
import { bannerDemo, btnNovo } from "./comum.js?v=bb300066";
import { rotulo as rotuloOpcao } from "../core/schema.js?v=bb300066";
import { podeEditar, usuario } from "../core/auth.js?v=bb300066";

export function abrirVenda(ctx, padrao = {}, id = null) {
  let pad = { date: hoje(), quantity: 1, seller_user_id: (usuario() || {}).id || "", ...padrao };
  if (pad.lead_id && !id) { const l = db.get("leads", pad.lead_id); if (l) pad = { product_id: l.product_id, campaign_id: l.campaign_id, ad_id: l.ad_id, creative_id: l.creative_id, source: l.source, seller_user_id: l.owner_user_id || pad.seller_user_id, value: l.potential_value || (db.get("products", l.product_id) || {}).price || "", ...pad }; }
  if (pad.campaign_id && !pad.source) pad.source = (db.get("campaigns", pad.campaign_id) || {}).platform || "meta";
  const box = abrirFormulario("sales", id, { padrao: pad, onSave: (v) => aposSalvar(v, !id, ctx), onDelete: ctx.rerender, extraHtml: `<p class="sub" style="grid-column:1/-1">Ao registrar, o lead ligado passa para "Venda realizada" e o estoque do produto é baixado pela quantidade.</p>` });
  const prod = box.querySelector('[name="product_id"]'), val = box.querySelector('[name="value"]'), custo = box.querySelector('[name="product_cost"]'), qtd = box.querySelector('[name="quantity"]'), lead = box.querySelector('[name="lead_id"]'), ad = box.querySelector('[name="ad_id"]'), cr = box.querySelector('[name="creative_id"]'), camp = box.querySelector('[name="campaign_id"]'), set = box.querySelector('[name="ad_set_id"]');
  const preencherProduto = () => { const p = db.get("products", prod.value); if (!p) return; const q = Number(qtd.value) || 1; if (!val.value || val.dataset.auto === "1") { val.value = (Number(p.price) * q).toFixed(2); val.dataset.auto = "1"; } if (!custo.value || custo.dataset.auto === "1") { custo.value = (Number(p.cost) * q).toFixed(2); custo.dataset.auto = "1"; } };
  prod.addEventListener("change", () => { val.dataset.auto = "1"; custo.dataset.auto = "1"; preencherProduto(); }); qtd.addEventListener("input", preencherProduto);
  val.addEventListener("input", () => { val.dataset.auto = "0"; }); custo.addEventListener("input", () => { custo.dataset.auto = "0"; });
  if (!id) preencherProduto();
  lead.addEventListener("change", () => { const l = db.get("leads", lead.value); if (!l) return; if (l.product_id) { prod.value = l.product_id; val.dataset.auto = "1"; custo.dataset.auto = "1"; preencherProduto(); } if (l.campaign_id) camp.value = l.campaign_id; if (l.ad_id) ad.value = l.ad_id; if (l.creative_id) cr.value = l.creative_id; box.querySelector('[name="source"]').value = l.source || "meta"; if (l.owner_user_id) box.querySelector('[name="seller_user_id"]').value = l.owner_user_id; });
  ad.addEventListener("change", () => { const a = db.get("ads", ad.value); if (a) { if (a.creative_id) cr.value = a.creative_id; if (a.ad_set_id) set.value = a.ad_set_id; if (a.campaign_id) camp.value = a.campaign_id; } });
}
function aposSalvar(v, nova, ctx) {
  if (nova) {
    if (v.lead_id) { const l = db.get("leads", v.lead_id); if (l && l.stage !== "venda") { db.update("leads", l.id, { stage: "venda", last_contact: hoje() }); db.insert("interactions", { lead_id: l.id, type: "etapa", text: `Venda registrada: ${brl(v.value)}`, at: agora(), user_id: (usuario() || {}).id || "" }); } }
    const p = db.get("products", v.product_id); if (p && p.stock != null && vendaVale(v)) db.update("products", p.id, { stock: Math.max(0, Number(p.stock) - (Number(v.quantity) || 1)) });
    toast("Venda registrada.");
  }
  ctx.rerender();
}

export default {
  id: "vendas", titulo: "Vendas", icone: "💰",
  render(root, ctx) {
    const iv = ctx.iv, q = new URLSearchParams(location.hash.split("?")[1] || "");
    const vendas = vendasNoPeriodo(iv).sort((a, b) => b.date.localeCompare(a.date)), k = kpis(iv);
    const vendedores = porEntidade(iv, "seller").filter((x) => x.k.sales > 0).sort((a, b) => b.k.revenue - a.k.revenue);
    const pag = {}; for (const v of vendas) { if (!vendaVale(v)) continue; pag[v.payment || "outro"] = (pag[v.payment || "outro"] || 0) + liquidoDaVenda(v).receita; }
    const origem = {}; for (const v of vendas) { if (!vendaVale(v)) continue; const o = v.source || "outro"; origem[o] = (origem[o] || 0) + liquidoDaVenda(v).receita; }
    root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>Vendas</h1><p class="sub">Cada venda liga produto, lead, campanha, conjunto, anúncio, criativo e vendedor. É daqui que saem faturamento, lucro, ROAS e CPA.</p></div><div class="pagina-acoes">${btnNovo("Registrar venda", 'data-novo="1"')}</div></div>
      <div class="kpis">${kpi({ rotulo: "Vendas", valor: inteiro(k.sales), sub: k.canceled ? `${k.canceled} cancelada(s)` : "" })}${kpi({ rotulo: "Faturamento", valor: brl(k.revenue), destaque: true, sub: k.discount ? `já sem ${brl(k.discount)} de desconto` : "" })}${kpi({ rotulo: "Custo dos produtos", valor: brl(k.cost) })}${kpi({ rotulo: "Taxas e frete", valor: brl(k.fees + k.shipping), sub: `taxas ${brl(k.fees)} · frete ${brl(k.shipping)}` })}${kpi({ rotulo: "Lucro bruto", valor: brl(k.gross_profit), sub: "margem " + pct(k.margin) })}${kpi({ rotulo: "Lucro por venda", valor: brl(k.ticket_liquido) })}${kpi({ rotulo: "Ticket médio", valor: brl(k.ticket) })}${kpi({ rotulo: "Custo por venda (CPA)", valor: brl(k.cpa) })}${kpi({ rotulo: "Conversão lead → venda", valor: pct(k.conversion) })}</div>
      <div class="grid3">${cartao("Ranking de vendedores", vendedores.length ? `<div class="lista">${vendedores.map((x, i) => itemLista({ titulo: `<span class="ranking-pos ${i < 3 ? "p" + (i + 1) : ""}">${i + 1}</span>${esc(x.nome)}`, sub: `${inteiro(x.k.sales)} venda(s) · ${inteiro(x.k.leads)} lead(s) · conversão ${pct(x.k.conversion)}`, direita: `<b>${brl(x.k.revenue)}</b>` })).join("")}</div>` : vazio("Sem vendas no período."))}
      ${cartao("Por forma de pagamento", barrasH(Object.keys(pag).map((p) => ({ nome: rotuloOpcao("payment", p), valor: pag[p], cor: "var(--ciano)" })), { fmt: brl }))}
      ${cartao("Por origem", barrasH(Object.keys(origem).map((o) => ({ nome: rotuloOpcao("lead_source", o), valor: origem[o], cor: "var(--verde)" })), { fmt: brl }))}</div>
      ${cartao(`Vendas no período (${vendas.length})`, tabela("vendas", { colunas: [
        { key: "date", label: "Data", fmt: dataBR }, { key: "product", label: "Produto", valor: (v) => (db.get("products", v.product_id) || {}).name || "—", render: (v) => `<a href="#/produtos/${v.product_id}">${esc((db.get("products", v.product_id) || {}).name || "—")}</a>${Number(v.quantity) > 1 ? ` <small>× ${v.quantity}</small>` : ""}` },
        { key: "value", label: "Valor", tipo: "num", fmt: brl }, { key: "discount", label: "Desconto", tipo: "num", fmt: brl }, { key: "cost", label: "Custo", tipo: "num", valor: custoDaVenda, fmt: brl },
        { key: "taxas", label: "Taxas+frete", tipo: "num", valor: (v) => taxaPagamento(v) + Number(v.platform_fee || 0) + Number(v.shipping_cost || 0), fmt: brl },
        { key: "profit", label: "Lucro", tipo: "num", valor: (v) => liquidoDaVenda(v).lucro, fmt: brl },
        { key: "status", label: "Situação", render: (v) => badge(rotuloOpcao("sale_status", v.status || "confirmada"), v.status === "cancelada" || v.status === "devolvida" ? "vermelho" : v.status === "pendente" ? "amarelo" : "verde") },
        { key: "lead", label: "Lead", valor: (v) => (db.get("leads", v.lead_id) || {}).name || "", render: (v) => v.lead_id ? `<a href="#/leads/${v.lead_id}">${esc((db.get("leads", v.lead_id) || {}).name || "")}</a>` : "—" },
        { key: "campaign", label: "Campanha", valor: (v) => (db.get("campaigns", v.campaign_id) || {}).name || "", render: (v) => v.campaign_id ? `<a href="#/campanhas/${v.campaign_id}">${esc((db.get("campaigns", v.campaign_id) || {}).name || "")}</a>` : `<small>${esc(rotuloOpcao("lead_source", v.source))}</small>` },
        { key: "creative", label: "Criativo", valor: (v) => (db.get("creatives", v.creative_id) || {}).name || "" }, { key: "seller", label: "Vendedor", valor: (v) => (db.get("users", v.seller_user_id) || {}).name || "" }, { key: "payment", label: "Pagamento", render: (v) => esc(rotuloOpcao("payment", v.payment)) },
        { key: "acao", label: "", render: (v) => podeEditar() ? `<button class="btn btn-pq" data-editar="${v.id}">✏️</button>` : "" },
      ], linhas: vendas, ordem: "date", vazioTxt: "Nenhuma venda no período." }))}`;
    const n = root.querySelector("[data-novo]"); if (n) n.addEventListener("click", () => abrirVenda(ctx));
    root.querySelectorAll("[data-editar]").forEach((b) => b.addEventListener("click", () => abrirVenda(ctx, {}, b.dataset.editar)));
    if (q.get("novo") === "1" && podeEditar()) { history.replaceState(null, "", "#/vendas"); abrirVenda(ctx, { campaign_id: q.get("campanha") || "", product_id: q.get("produto") || "" }); }
  },
};
