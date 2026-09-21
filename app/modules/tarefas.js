import { db } from "../core/db.js?v=43ebd473";
import { cartao, tabela, badge, badgeOpcao, abrirFormulario, vazio, kanban, abas, prioridadeBadge, toast } from "../core/ui.js?v=43ebd473";
import { esc, dataBR, hoje, somaDias, agora, uid } from "../core/format.js?v=43ebd473";
import { bannerDemo, btnNovo } from "./comum.js?v=43ebd473";
import { rotulo as rotuloOpcao, OPCOES } from "../core/schema.js?v=43ebd473";
import { podeEditar, usuario } from "../core/auth.js?v=43ebd473";

let visao = "kanban", fOwner = "";
const proximaData = (data, rec) => { const base = data || hoje(); return { diaria: somaDias(base, 1), semanal: somaDias(base, 7), quinzenal: somaDias(base, 15), mensal: somaDias(base, 30) }[rec] || null; };
// Tarefa recorrente: ao concluir, a próxima já nasce com o checklist zerado.
export function concluirTarefa(id) {
  const t = db.get("tasks", id); if (!t) return;
  db.update("tasks", id, { status: "finalizado", done_at: agora() });
  if (t.recurrence) {
    db.insert("tasks", { title: t.title, description: t.description, product_id: t.product_id, campaign_id: t.campaign_id, lead_id: t.lead_id, owner_user_id: t.owner_user_id, priority: t.priority, due_date: proximaData(t.due_date, t.recurrence), status: "a_fazer", recurrence: t.recurrence, checklist: (t.checklist || []).map((i) => ({ ...i, feito: false })) });
  }
}
const COR = { urgente: "var(--vermelho)", alta: "var(--laranja)", media: "var(--amarelo)", baixa: "var(--cinza)" };
document.addEventListener("kanban:mover", (ev) => { if (ev.detail.kanban !== "tarefas") return; db.update("tasks", ev.detail.id, { status: ev.detail.para }); if (window.CRM) window.CRM.render(); });
export default {
  id: "tarefas", titulo: "Tarefas", icone: "☑️",
  render(root, ctx) {
    const h = hoje(); const todas = db.all("tasks").filter((t) => !fOwner || t.owner_user_id === fOwner);
    const atrasadas = todas.filter((t) => t.due_date && t.due_date < h && t.status !== "finalizado").length;
const card = (t) => { const bloq = t.blocked_by && db.get("tasks", t.blocked_by); const travada = bloq && bloq.status !== "finalizado"; return `<div class="t">${travada ? "🔒 " : ""}${esc(t.title)}</div><div class="s">${prioridadeBadge(t.priority)} ${t.due_date ? `<span style="color:${t.due_date < h && t.status !== "finalizado" ? "var(--vermelho)" : "inherit"}">📅 ${dataBR(t.due_date)}</span>` : ""}${t.owner_user_id ? " · " + esc((db.get("users", t.owner_user_id) || {}).name || "") : ""}</div>${t.product_id || t.campaign_id ? `<div class="s">${t.product_id ? "📦 " + esc((db.get("products", t.product_id) || {}).name || "") : ""} ${t.campaign_id ? "📣 " + esc((db.get("campaigns", t.campaign_id) || {}).name || "") : ""}</div>` : ""}${(t.checklist || []).length ? `<div class="checklist">${t.checklist.map((i) => `<label class="${i.feito ? "feito" : ""}"><input type="checkbox" data-check="${t.id}" data-item="${i.id}"${i.feito ? " checked" : ""}><span>${esc(i.texto)}</span></label>`).join("")}</div>` : ""}
    ${t.recurrence ? `<div class="s">🔁 ${esc(rotuloOpcao("recurrence", t.recurrence))}</div>` : ""}${travada ? `<div class="s" style="color:var(--laranja)">espera: ${esc(bloq.title)}</div>` : ""}
    <div class="acoes"><button data-editar="${t.id}">✏️ Editar</button>${t.status !== "finalizado" ? `<button data-concluir="${t.id}"${travada ? " disabled title=\"Conclua antes a tarefa que bloqueia\"" : ""}>✓ Concluir</button>` : ""}<button data-additem="${t.id}">+ item</button></div><select data-mover="${t.id}"><option value="">Mover para…</option>${OPCOES.task_status.filter((s) => s[0] !== t.status).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>`; };
    const corpo = visao === "kanban" ? kanban("tarefas", { colunas: OPCOES.task_status.map(([id, titulo]) => ({ id, titulo })), itens: todas.sort((a, b) => ({ urgente: 0, alta: 1, media: 2, baixa: 3 }[a.priority] - { urgente: 0, alta: 1, media: 2, baixa: 3 }[b.priority]) || (a.due_date || "9").localeCompare(b.due_date || "9")), colunaDe: (t) => t.status, render: card, cor: (t) => COR[t.priority] })
      : cartao("", tabela("tarefas", { colunas: [{ key: "title", label: "Tarefa", render: (t) => `<b>${esc(t.title)}</b>${t.description ? `<br><small>${esc(t.description)}</small>` : ""}` }, { key: "status", label: "Status", render: (t) => badgeOpcao("task_status", t.status) }, { key: "priority", label: "Prioridade", render: (t) => prioridadeBadge(t.priority) }, { key: "due_date", label: "Prazo", fmt: dataBR, render: (t) => t.due_date ? `<span style="color:${t.due_date < h && t.status !== "finalizado" ? "var(--vermelho)" : "inherit"}">${dataBR(t.due_date)}</span>` : "—" }, { key: "owner", label: "Responsável", valor: (t) => (db.get("users", t.owner_user_id) || {}).name || "" }, { key: "product", label: "Produto", valor: (t) => (db.get("products", t.product_id) || {}).name || "" }, { key: "campaign", label: "Campanha", valor: (t) => (db.get("campaigns", t.campaign_id) || {}).name || "" }, { key: "checklist", label: "Checklist", valor: (t) => (t.checklist || []).filter((i) => i.feito).length, render: (t) => (t.checklist || []).length ? `${(t.checklist || []).filter((i) => i.feito).length}/${t.checklist.length}` : "—" },
      { key: "recurrence", label: "Repete", render: (t) => t.recurrence ? esc(rotuloOpcao("recurrence", t.recurrence)) : "—" },
      { key: "acao", label: "", render: (t) => `<button class="btn btn-pq" data-editar="${t.id}">✏️</button>` }], linhas: todas, ordem: "due_date", desc: false }));
    root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>Quadro de tarefas</h1><p class="sub">${todas.filter((t) => t.status !== "finalizado").length} em aberto${atrasadas ? ` · <span style="color:var(--vermelho)">${atrasadas} atrasada(s)</span>` : ""}</p></div><div class="pagina-acoes">${btnNovo("Nova tarefa", 'data-novo="1"')}</div></div>
      ${abas([["kanban", "Kanban"], ["lista", "Lista"]], visao)}<div class="filtros-linha"><select data-owner><option value="">Todos os responsáveis</option>${db.all("users").map((u) => `<option value="${u.id}"${fOwner === u.id ? " selected" : ""}>${esc(u.name)}</option>`).join("")}</select></div>${corpo}`;
    root.querySelectorAll("[data-aba]").forEach((b) => b.addEventListener("click", () => { visao = b.dataset.aba; ctx.rerender(); }));
    root.querySelector("[data-owner]").addEventListener("change", (e) => { fOwner = e.target.value; ctx.rerender(); });
    const n = root.querySelector("[data-novo]"); if (n) n.addEventListener("click", () => abrirFormulario("tasks", null, { padrao: { owner_user_id: (usuario() || {}).id || "" }, onSave: ctx.rerender }));
    root.querySelectorAll("[data-editar]").forEach((b) => b.addEventListener("click", () => abrirFormulario("tasks", b.dataset.editar, { onSave: ctx.rerender, onDelete: ctx.rerender })));
    root.querySelectorAll("[data-concluir]").forEach((b) => b.addEventListener("click", () => { const t = db.get("tasks", b.dataset.concluir); concluirTarefa(b.dataset.concluir); toast(t && t.recurrence ? "Concluída. A próxima já foi criada." : "Tarefa concluída."); ctx.rerender(); }));
    root.querySelectorAll("[data-check]").forEach((c) => c.addEventListener("change", () => { const t = db.get("tasks", c.dataset.check); if (!t) return; db.update("tasks", t.id, { checklist: (t.checklist || []).map((i) => i.id === c.dataset.item ? { ...i, feito: c.checked } : i) }); ctx.rerender(); }));
    root.querySelectorAll("[data-additem]").forEach((b) => b.addEventListener("click", () => { const t = db.get("tasks", b.dataset.additem); const txt = prompt("Novo item do checklist:"); if (!txt || !txt.trim()) return; db.update("tasks", t.id, { checklist: [...(t.checklist || []), { id: uid(), texto: txt.trim(), feito: false }] }); ctx.rerender(); }));
    root.querySelectorAll("[data-mover]").forEach((s) => s.addEventListener("change", () => { if (s.value) { db.update("tasks", s.dataset.mover, { status: s.value }); ctx.rerender(); } }));
  },
};
