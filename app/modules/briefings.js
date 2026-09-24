import { db } from "../core/db.js?v=e38ac044";
import { cartao, tabela, badge, badgeOpcao, abrirFormulario, vazio, kanban, abas } from "../core/ui.js?v=e38ac044";
import { esc, dataBR, hoje, brl } from "../core/format.js?v=e38ac044";
import { bannerDemo, btnNovo } from "./comum.js?v=e38ac044";
import { rotulo as rotuloOpcao, OPCOES } from "../core/schema.js?v=e38ac044";
import { podeEditar, usuario } from "../core/auth.js?v=e38ac044";

document.addEventListener("kanban:mover", (ev) => { if (ev.detail.kanban !== "briefings") return; db.update("briefings", ev.detail.id, { status: ev.detail.para }); if (window.CRM) window.CRM.render(); });
export default {
  id: "briefings", titulo: "Briefings", icone: "📝",
  render(root, ctx) {
    const q = new URLSearchParams(location.hash.split("?")[1] || ""); const h = hoje();
    const todos = db.all("briefings");
    const card = (b) => { const p = db.get("products", b.product_id); return `<div class="t">${p ? esc(p.name) : "Produto?"} · ${esc(rotuloOpcao("briefing_format", b.format))}</div><div class="s">${esc(b.offer || "")}${b.price ? " · " + brl(b.price) : ""}</div><div class="s">${b.deadline ? `<span style="color:${b.deadline < h && b.status !== "publicado" ? "var(--vermelho)" : "inherit"}">📅 ${dataBR(b.deadline)}</span>` : ""}${b.owner_user_id ? " · " + esc((db.get("users", b.owner_user_id) || {}).name || "") : ""}</div>${b.hook ? `<div class="s">🎣 ${esc(b.hook)}</div>` : ""}<div class="acoes"><button data-editar="${b.id}">✏️ Abrir</button></div><select data-mover="${b.id}"><option value="">Status…</option>${OPCOES.briefing_status.filter((s) => s[0] !== b.status).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>`; };
    root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>Briefings de criativos</h1><p class="sub">Solicite um criativo com produto, oferta, público, formato, gancho, argumento e CTA. O responsável muda o status até publicar.</p></div><div class="pagina-acoes">${btnNovo("Solicitar criativo", 'data-novo="1"')}</div></div>
      ${kanban("briefings", { colunas: OPCOES.briefing_status.map(([id, titulo]) => ({ id, titulo })), itens: todos, colunaDe: (b) => b.status, render: card, cor: () => "var(--roxo)" })}`;
    const abrir = (id, padrao) => abrirFormulario("briefings", id, { padrao: { owner_user_id: "", product_id: q.get("produto") || "", ...padrao }, onSave: ctx.rerender, onDelete: ctx.rerender });
    const n = root.querySelector("[data-novo]"); if (n) n.addEventListener("click", () => abrir(null, {}));
    root.querySelectorAll("[data-editar]").forEach((b) => b.addEventListener("click", () => abrir(b.dataset.editar, {})));
    root.querySelectorAll("[data-mover]").forEach((s) => s.addEventListener("change", () => { if (s.value) { db.update("briefings", s.dataset.mover, { status: s.value }); ctx.rerender(); } }));
    if (q.get("novo") === "1" && podeEditar()) { history.replaceState(null, "", "#/briefings"); abrir(null, { product_id: q.get("produto") || "" }); }
  },
};
