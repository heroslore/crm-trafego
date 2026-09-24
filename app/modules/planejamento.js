import { db } from "../core/db.js?v=f9372346";
import { cartao, toast } from "../core/ui.js?v=f9372346";
import { esc, hoje, semanaISO, NOMES_DIAS, uid, somaDias, dataBR } from "../core/format.js?v=f9372346";
import { bannerDemo } from "./comum.js?v=f9372346";
import { podeEditar } from "../core/auth.js?v=f9372346";

export default {
  id: "planejamento", titulo: "Planejamento", icone: "🗓️",
  render(root, ctx) {
    const h = hoje(), semana = semanaISO(h), diaHoje = new Date(h + "T12:00:00Z").getUTCDay() || 7;
    const dias = [1, 2, 3, 4, 5, 6, 7].map((d) => db.get("weekly_plan", "dia-" + d) || db.insert("weekly_plan", { id: "dia-" + d, day: d, items: [], done: {} }));
    const inicioSemana = somaDias(h, -(diaHoje - 1));
    const total = dias.reduce((n, d) => n + (d.items || []).length, 0), feitos = dias.reduce((n, d) => n + ((d.done || {})[semana] || []).length, 0);
    root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>Planejamento da semana</h1><p class="sub">Semana de ${dataBR(inicioSemana)} a ${dataBR(somaDias(inicioSemana, 6))} · ${feitos} de ${total} tarefas concluídas. As tarefas se repetem toda semana; marque as feitas e edite à vontade.</p></div></div>
      <div class="semana">${dias.map((d) => { const feitas = (d.done || {})[semana] || []; return `<div class="dia-plano${d.day === diaHoje ? " hoje" : ""}"><h3>${NOMES_DIAS[d.day % 7]}${d.day === diaHoje ? " · hoje" : ""}</h3>${(d.items || []).map((it) => `<label class="${feitas.includes(it.id) ? "feito" : ""}"><input type="checkbox" data-dia="${d.day}" data-item="${it.id}"${feitas.includes(it.id) ? " checked" : ""}><span>${esc(it.text)}</span>${podeEditar() ? `<button class="rm" data-rm-dia="${d.day}" data-rm-item="${it.id}" title="Remover">✕</button>` : ""}</label>`).join("")}${podeEditar() ? `<form data-add-dia="${d.day}" style="display:flex;gap:4px;margin-top:8px"><input type="text" placeholder="Nova tarefa" style="flex:1;min-width:0;background:var(--card);border:1px solid var(--borda);color:var(--texto);border-radius:8px;padding:6px 8px;font-size:.8rem"><button class="btn btn-pq" type="submit">+</button></form>` : ""}</div>`; }).join("")}</div>`;
    root.querySelectorAll("input[type=checkbox][data-dia]").forEach((c) => c.addEventListener("change", () => { const d = db.get("weekly_plan", "dia-" + c.dataset.dia); const done = { ...(d.done || {}) }; const lista = new Set(done[semana] || []); if (c.checked) lista.add(c.dataset.item); else lista.delete(c.dataset.item); done[semana] = [...lista]; db.update("weekly_plan", d.id, { done }); ctx.rerender(); }));
    root.querySelectorAll("[data-rm-dia]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); const d = db.get("weekly_plan", "dia-" + b.dataset.rmDia); db.update("weekly_plan", d.id, { items: d.items.filter((i) => i.id !== b.dataset.rmItem) }); ctx.rerender(); }));
    root.querySelectorAll("form[data-add-dia]").forEach((f) => f.addEventListener("submit", (e) => { e.preventDefault(); const t = f.querySelector("input").value.trim(); if (!t) return; const d = db.get("weekly_plan", "dia-" + f.dataset.addDia); db.update("weekly_plan", d.id, { items: [...(d.items || []), { id: uid(), text: t }] }); ctx.rerender(); }));
  },
};
