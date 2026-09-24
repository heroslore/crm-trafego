import { db } from "../core/db.js?v=46e26fb2";
import { cartao, tabela, badge, badgeOpcao, abrirFormulario, vazio, itemLista } from "../core/ui.js?v=46e26fb2";
import { esc, brl, inteiro, pct, mult, dataBR } from "../core/format.js?v=46e26fb2";
import { bannerDemo, btnNovo } from "./comum.js?v=46e26fb2";
import { rotulo as rotuloOpcao } from "../core/schema.js?v=46e26fb2";
import { podeEditar } from "../core/auth.js?v=46e26fb2";

function comparaLinha(t, rot, a, b, fmt, menorMelhor = false) { const va = t[a], vb = t[b]; if (va == null && vb == null) return ""; const ganha = va != null && vb != null ? (menorMelhor ? (va < vb ? "a" : va > vb ? "b" : "") : (va > vb ? "a" : va < vb ? "b" : "")) : ""; return `<tr><td>${rot}</td><td class="num ${ganha === "a" ? "delta up" : ""}">${fmt(va)}</td><td class="num ${ganha === "b" ? "delta up" : ""}">${fmt(vb)}</td></tr>`; }
export default {
  id: "testes", titulo: "Testes A/B", icone: "🧪",
  render(root, ctx) {
    const q = new URLSearchParams(location.hash.split("?")[1] || "");
    const testes = db.all("ab_tests").sort((a, b) => (b.start || "").localeCompare(a.start || ""));
    const cr = (id) => (db.get("creatives", id) || {}).name || "—";
    root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>Testes A/B</h1><p class="sub">Histórico de testes com hipótese, resultado e aprendizado a levar para as próximas campanhas</p></div><div class="pagina-acoes">${btnNovo("Novo teste", 'data-novo="1"')}</div></div>
      ${testes.length ? testes.map((t) => cartao(`${esc(t.name)} ${badge(rotuloOpcao("ab_result", t.result), t.result === "a" || t.result === "b" ? "verde" : t.result ? "cinza" : "amarelo")}`, `<p class="sub">${t.campaign_id ? `campanha <a href="#/campanhas/${t.campaign_id}">${esc((db.get("campaigns", t.campaign_id) || {}).name || "")}</a> · ` : ""}${t.product_id ? `produto ${esc((db.get("products", t.product_id) || {}).name || "")} · ` : ""}${dataBR(t.start)}${t.end ? " a " + dataBR(t.end) : ""}${t.audience_id ? ` · público ${esc((db.get("audiences", t.audience_id) || {}).name || "")}` : ""}${t.spend ? ` · investimento ${brl(t.spend)}` : ""}</p>${t.hypothesis ? `<p><b>Hipótese:</b> ${esc(t.hypothesis)}</p>` : ""}
        <div class="tabela-wrap" style="margin-top:8px"><table class="tabela"><thead><tr><th></th><th class="num">A: ${esc(cr(t.creative_a_id))}</th><th class="num">B: ${esc(cr(t.creative_b_id))}</th></tr></thead><tbody>${comparaLinha(t, "CTR", "a_ctr", "b_ctr", (v) => v == null ? "—" : v + "%")}${comparaLinha(t, "CPC", "a_cpc", "b_cpc", brl, true)}${comparaLinha(t, "CPL", "a_cpl", "b_cpl", brl, true)}${comparaLinha(t, "CPA", "a_cpa", "b_cpa", brl, true)}${comparaLinha(t, "Conversões", "a_conv", "b_conv", inteiro)}${comparaLinha(t, "ROAS", "a_roas", "b_roas", mult)}</tbody></table></div>
        ${t.learning ? `<p style="margin-top:8px"><b>Aprendizado:</b> ${esc(t.learning)}</p>` : ""}${t.apply_next ? `<div class="aviso aviso-ok" style="margin-top:8px"><b>Usar nas próximas campanhas:</b> ${esc(t.apply_next)}</div>` : ""}`, podeEditar() ? `<button class="btn btn-pq" data-editar="${t.id}">✏️ Editar</button>` : "")).join("") : cartao("", vazio("Nenhum teste registrado. Registre cada teste de criativo, público ou oferta para construir o histórico de aprendizados."))}`;
    const n = root.querySelector("[data-novo]"); if (n) n.addEventListener("click", () => abrirFormulario("ab_tests", null, { padrao: { creative_a_id: q.get("a") || "" }, onSave: ctx.rerender }));
    root.querySelectorAll("[data-editar]").forEach((b) => b.addEventListener("click", () => abrirFormulario("ab_tests", b.dataset.editar, { onSave: ctx.rerender, onDelete: ctx.rerender })));
    if (q.get("novo") === "1" && podeEditar()) { history.replaceState(null, "", "#/testes"); abrirFormulario("ab_tests", null, { padrao: { creative_a_id: q.get("a") || "" }, onSave: ctx.rerender }); }
  },
};
