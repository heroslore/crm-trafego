import { db } from "../core/db.js?v=72aad7ae";
import { cartao, badge, abrirFormulario, kanban, chips } from "../core/ui.js?v=72aad7ae";
import { esc, dataBR } from "../core/format.js?v=72aad7ae";
import { bannerDemo, btnNovo } from "./comum.js?v=72aad7ae";
import { rotulo as rotuloOpcao, OPCOES } from "../core/schema.js?v=72aad7ae";

let fTipo = "";
document.addEventListener("kanban:mover", (ev) => { if (ev.detail.kanban !== "ideias") return; db.update("ideas", ev.detail.id, { status: ev.detail.para }); if (window.CRM) window.CRM.render(); });
export default {
  id: "ideias", titulo: "Banco de ideias", icone: "💡",
  render(root, ctx) {
    const todas = db.all("ideas").filter((i) => !fTipo || i.type === fTipo);
    const card = (i) => `<div class="t">${esc(i.title)}</div><div class="s">${badge(rotuloOpcao("idea_type", i.type), "roxo")}${i.product_id ? " " + esc((db.get("products", i.product_id) || {}).name || "") : ""}</div>${i.description ? `<div class="s">${esc(i.description).slice(0, 140)}</div>` : ""}${i.link ? `<div class="s"><a href="${esc(i.link)}" target="_blank" rel="noopener">referência ↗</a></div>` : ""}<div class="acoes"><button data-editar="${i.id}">✏️ Abrir</button></div><select data-mover="${i.id}"><option value="">Status…</option>${OPCOES.idea_status.filter((s) => s[0] !== i.status).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>`;
    root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>Banco de ideias</h1><p class="sub">Ideias de campanhas, vídeos, promoções, copies, ganchos e referências de concorrentes</p></div><div class="pagina-acoes">${btnNovo("Nova ideia", 'data-novo="1"')}</div></div>
      ${chips([["", "Todas"], ...OPCOES.idea_type], fTipo, "data-tipo")}<div style="height:10px"></div>
      ${kanban("ideias", { colunas: OPCOES.idea_status.map(([id, titulo]) => ({ id, titulo })), itens: todas, colunaDe: (i) => i.status, render: card, cor: (i) => i.status === "funcionou" ? "var(--verde)" : i.status === "nao_funcionou" ? "var(--vermelho)" : "var(--amarelo)" })}`;
    root.querySelectorAll("[data-tipo]").forEach((b) => b.addEventListener("click", () => { fTipo = b.dataset.tipo; ctx.rerender(); }));
    const n = root.querySelector("[data-novo]"); if (n) n.addEventListener("click", () => abrirFormulario("ideas", null, { onSave: ctx.rerender }));
    root.querySelectorAll("[data-editar]").forEach((b) => b.addEventListener("click", () => abrirFormulario("ideas", b.dataset.editar, { onSave: ctx.rerender, onDelete: ctx.rerender })));
    root.querySelectorAll("[data-mover]").forEach((s) => s.addEventListener("change", () => { if (s.value) { db.update("ideas", s.dataset.mover, { status: s.value }); ctx.rerender(); } }));
  },
};
