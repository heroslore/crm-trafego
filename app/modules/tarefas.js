import { db } from "../core/db.js?v=c59cb573";
import { cartao, tabela, badge, badgeOpcao, abrirFormulario, vazio, kanban, abas, prioridadeBadge, toast } from "../core/ui.js?v=c59cb573";
import { esc, dataBR, hoje } from "../core/format.js?v=c59cb573";
import { bannerDemo, btnNovo } from "./comum.js?v=c59cb573";
import { rotulo as rotuloOpcao, OPCOES } from "../core/schema.js?v=c59cb573";
import { podeEditar, usuario } from "../core/auth.js?v=c59cb573";

let visao = "kanban", fOwner = "";
const COR = { urgente: "var(--vermelho)", alta: "var(--laranja)", media: "var(--amarelo)", baixa: "var(--cinza)" };
document.addEventListener("kanban:mover", (ev) => { if (ev.detail.kanban !== "tarefas") return; db.update("tasks", ev.detail.id, { status: ev.detail.para }); if (window.CRM) window.CRM.render(); });
export default {
  id: "tarefas", titulo: "Tarefas", icone: "☑️",
  render(root, ctx) {
    const h = hoje(); const todas = db.all("tasks").filter((t) => !fOwner || t.owner_user_id === fOwner);
    const atrasadas = todas.filter((t) => t.due_date && t.due_date < h && t.status !== "finalizado").length;
    const card = (t) => `<div class="t">${esc(t.title)}</div><div class="s">${prioridadeBadge(t.priority)} ${t.due_date ? `<span style="color:${t.due_date < h && t.status !== "finalizado" ? "var(--vermelho)" : "inherit"}">📅 ${dataBR(t.due_date)}</span>` : ""}${t.owner_user_id ? " · " + esc((db.get("users", t.owner_user_id) || {}).name || "") : ""}</div>${t.product_id || t.campaign_id ? `<div class="s">${t.product_id ? "📦 " + esc((db.get("products", t.product_id) || {}).name || "") : ""} ${t.campaign_id ? "📣 " + esc((db.get("campaigns", t.campaign_id) || {}).name || "") : ""}</div>` : ""}<div class="acoes"><button data-editar="${t.id}">✏️ Editar</button>${t.status !== "finalizado" ? `<button data-concluir="${t.id}">✓ Concluir</button>` : ""}</div><select data-mover="${t.id}"><option value="">Mover para…</option>${OPCOES.task_status.filter((s) => s[0] !== t.status).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>`;
    const corpo = visao === "kanban" ? kanban("tarefas", { colunas: OPCOES.task_status.map(([id, titulo]) => ({ id, titulo })), itens: todas.sort((a, b) => ({ urgente: 0, alta: 1, media: 2, baixa: 3 }[a.priority] - { urgente: 0, alta: 1, media: 2, baixa: 3 }[b.priority]) || (a.due_date || "9").localeCompare(b.due_date || "9")), colunaDe: (t) => t.status, render: card, cor: (t) => COR[t.priority] })
      : cartao("", tabela("tarefas", { colunas: [{ key: "title", label: "Tarefa", render: (t) => `<b>${esc(t.title)}</b>${t.description ? `<br><small>${esc(t.description)}</small>` : ""}` }, { key: "status", label: "Status", render: (t) => badgeOpcao("task_status", t.status) }, { key: "priority", label: "Prioridade", render: (t) => prioridadeBadge(t.priority) }, { key: "due_date", label: "Prazo", fmt: dataBR, render: (t) => t.due_date ? `<span style="color:${t.due_date < h && t.status !== "finalizado" ? "var(--vermelho)" : "inherit"}">${dataBR(t.due_date)}</span>` : "—" }, { key: "owner", label: "Responsável", valor: (t) => (db.get("users", t.owner_user_id) || {}).name || "" }, { key: "product", label: "Produto", valor: (t) => (db.get("products", t.product_id) || {}).name || "" }, { key: "campaign", label: "Campanha", valor: (t) => (db.get("campaigns", t.campaign_id) || {}).name || "" }, { key: "acao", label: "", render: (t) => `<button class="btn btn-pq" data-editar="${t.id}">✏️</button>` }], linhas: todas, ordem: "due_date", desc: false }));
    root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>Quadro de tarefas</h1><p class="sub">${todas.filter((t) => t.status !== "finalizado").length} em aberto${atrasadas ? ` · <span style="color:var(--vermelho)">${atrasadas} atrasada(s)</span>` : ""}</p></div><div class="pagina-acoes">${btnNovo("Nova tarefa", 'data-novo="1"')}</div></div>
      ${abas([["kanban", "Kanban"], ["lista", "Lista"]], visao)}<div class="filtros-linha"><select data-owner><option value="">Todos os responsáveis</option>${db.all("users").map((u) => `<option value="${u.id}"${fOwner === u.id ? " selected" : ""}>${esc(u.name)}</option>`).join("")}</select></div>${corpo}`;
    root.querySelectorAll("[data-aba]").forEach((b) => b.addEventListener("click", () => { visao = b.dataset.aba; ctx.rerender(); }));
    root.querySelector("[data-owner]").addEventListener("change", (e) => { fOwner = e.target.value; ctx.rerender(); });
    const n = root.querySelector("[data-novo]"); if (n) n.addEventListener("click", () => abrirFormulario("tasks", null, { padrao: { owner_user_id: (usuario() || {}).id || "" }, onSave: ctx.rerender }));
    root.querySelectorAll("[data-editar]").forEach((b) => b.addEventListener("click", () => abrirFormulario("tasks", b.dataset.editar, { onSave: ctx.rerender, onDelete: ctx.rerender })));
    root.querySelectorAll("[data-concluir]").forEach((b) => b.addEventListener("click", () => { db.update("tasks", b.dataset.concluir, { status: "finalizado" }); toast("Tarefa concluída."); ctx.rerender(); }));
    root.querySelectorAll("[data-mover]").forEach((s) => s.addEventListener("change", () => { if (s.value) { db.update("tasks", s.dataset.mover, { status: s.value }); ctx.rerender(); } }));
  },
};
