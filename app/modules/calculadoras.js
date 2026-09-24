import { cartao } from "../core/ui.js?v=0f43faaa";
import { brl, pct, mult, inteiro } from "../core/format.js?v=0f43faaa";
import { db } from "../core/db.js?v=0f43faaa";

const n = (root, id) => Number(String(root.querySelector("#" + id).value).replace(",", ".")) || 0;
export default {
  id: "calculadoras", titulo: "Calculadoras", icone: "🧮",
  render(root) {
    const campo = (id, label, v = "") => `<div class="campo"><label>${label}</label><input type="number" step="any" inputmode="decimal" id="${id}" value="${v}"></div>`;
    root.innerHTML = `<div class="pagina-cab"><div><h1>Calculadoras</h1><p class="sub">Contas rápidas para planejar campanhas. Nada aqui altera os dados do sistema.</p></div></div>
      <div class="calc">
        ${cartao("ROAS", `<div class="form-grade">${campo("roas_fat", "Faturamento (R$)")}${campo("roas_inv", "Investimento (R$)")}</div><div class="res" id="roas_res">—</div><small>Faturamento ÷ investimento</small>`)}
        ${cartao("ROI", `<div class="form-grade">${campo("roi_lucro", "Lucro (R$)")}${campo("roi_inv", "Investimento (R$)")}</div><div class="res" id="roi_res">—</div><small>(Lucro − investimento) ÷ investimento × 100</small>`)}
        ${cartao("CPA máximo", `<div class="form-grade">${campo("cpa_preco", "Preço de venda (R$)")}${campo("cpa_custo", "Custo do produto (R$)")}${campo("cpa_margem", "Margem desejada após anúncios (%)", 20)}</div><div class="res" id="cpa_res">—</div><small>Quanto dá para pagar por venda mantendo a margem desejada</small>`)}
        ${cartao("Orçamento necessário", `<div class="form-grade">${campo("orc_vendas", "Meta de vendas")}${campo("orc_cpa", "CPA esperado (R$)", db.goal("cpa_max", 0) || "")}${campo("orc_dias", "Dias de campanha", 30)}</div><div class="res" id="orc_res">—</div><small>Meta de vendas × CPA esperado</small>`)}
        ${cartao("Leads necessários", `<div class="form-grade">${campo("ld_vendas", "Meta de vendas")}${campo("ld_conv", "Conversão lead → venda (%)", 20)}${campo("ld_cpl", "CPL esperado (R$)", db.goal("cpl_max", 0) || "")}</div><div class="res" id="ld_res">—</div><small>Leads = vendas ÷ conversão; orçamento = leads × CPL</small>`)}
        ${cartao("Ponto de equilíbrio do ROAS", `<div class="form-grade">${campo("pe_preco", "Preço de venda (R$)")}${campo("pe_custo", "Custo do produto (R$)")}</div><div class="res" id="pe_res">—</div><small>ROAS mínimo para não ter prejuízo = preço ÷ (preço − custo)</small>`)}
      </div>`;
    const calc = () => {
      const g = (id) => n(root, id);
      root.querySelector("#roas_res").textContent = g("roas_inv") ? mult(g("roas_fat") / g("roas_inv")) : "—";
      root.querySelector("#roi_res").textContent = g("roi_inv") ? pct((g("roi_lucro") - g("roi_inv")) / g("roi_inv")) : "—";
      const margemDesejada = g("cpa_preco") * g("cpa_margem") / 100; const cpaMax = g("cpa_preco") - g("cpa_custo") - margemDesejada;
      root.querySelector("#cpa_res").textContent = g("cpa_preco") ? `${brl(cpaMax)} por venda` + (cpaMax < 0 ? " (inviável: custo + margem passam do preço)" : "") : "—";
      const orc = g("orc_vendas") * g("orc_cpa"); root.querySelector("#orc_res").textContent = orc ? `${brl(orc)} no total` + (g("orc_dias") ? ` · ${brl(orc / g("orc_dias"))} por dia` : "") : "—";
      const leads = g("ld_conv") ? g("ld_vendas") / (g("ld_conv") / 100) : 0; root.querySelector("#ld_res").textContent = leads ? `${inteiro(Math.ceil(leads))} leads` + (g("ld_cpl") ? ` · ${brl(leads * g("ld_cpl"))} de orçamento` : "") : "—";
      root.querySelector("#pe_res").textContent = g("pe_preco") > g("pe_custo") && g("pe_preco") ? mult(g("pe_preco") / (g("pe_preco") - g("pe_custo"))) + ` (margem ${pct((g("pe_preco") - g("pe_custo")) / g("pe_preco"))})` : "—";
    };
    root.querySelectorAll("input").forEach((i) => i.addEventListener("input", calc)); calc();
  },
};
