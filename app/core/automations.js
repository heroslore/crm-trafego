// Automações internas: reagem a eventos do banco e executam ações simples (follow-up, tarefa, etiqueta, anotação).
// Nunca tomam decisões de tráfego; só organizam o trabalho.
import { db } from "./db.js?v=46e26fb2";
import { hoje, somaDias, agora, diasEntre } from "./format.js?v=46e26fb2";

const etapaAnterior = new Map();
let ativo = false;

function registrar(lead, texto) { db.insert("interactions", { lead_id: lead.id, type: "nota", text: "Automação: " + texto, at: agora(), user_id: "" }); }
function executar(regra, lead, venda) {
  if (!lead) return;
  const dias = Number(regra.days) || 0;
  switch (regra.action) {
    case "followup": { const data = somaDias(hoje(), dias); if (lead.next_followup === data) return; db.update("leads", lead.id, { next_followup: data }); registrar(lead, `follow-up agendado para ${data.split("-").reverse().join("/")} (${regra.name}).`); break; }
    case "tarefa": { const titulo = (regra.value || "Acompanhar {lead}").replace("{lead}", lead.name); if (db.where("tasks", (t) => t.title === titulo && t.status !== "finalizado").length) return; db.insert("tasks", { title: titulo, description: `Criada pela automação "${regra.name}".`, product_id: lead.product_id || "", campaign_id: lead.campaign_id || "", lead_id: lead.id, owner_user_id: regra.owner_user_id || lead.owner_user_id || "", priority: "alta", due_date: somaDias(hoje(), dias), status: "a_fazer" }); registrar(lead, `tarefa "${titulo}" criada (${regra.name}).`); break; }
    case "etiqueta": { const tag = String(regra.value || "").trim(); if (!tag) return; const tags = Array.isArray(lead.tags) ? lead.tags.slice() : []; if (tags.includes(tag)) return; tags.push(tag); db.update("leads", lead.id, { tags }); registrar(lead, `etiqueta "${tag}" adicionada (${regra.name}).`); break; }
    case "nota": if (regra.value) registrar(lead, regra.value.replace("{lead}", lead.name)); break;
  }
}
function regras(trigger) { return db.where("automations", (a) => a.active !== false && a.trigger === trigger); }

export function iniciarAutomacoes() {
  if (ativo) return; ativo = true;
  for (const l of db.all("leads", true)) etapaAnterior.set(l.id, l.stage);
  db.onChange(({ tabela, tipo, registro }) => {
    if (tabela === "leads" && tipo === "insert") { etapaAnterior.set(registro.id, registro.stage); for (const r of regras("lead_criado")) executar(r, registro); }
    if (tabela === "leads" && tipo === "update") { const antes = etapaAnterior.get(registro.id); if (antes !== registro.stage) { etapaAnterior.set(registro.id, registro.stage); for (const r of regras("etapa_mudou")) if (r.stage === registro.stage) executar(r, registro); } }
    if (tabela === "sales" && tipo === "insert" && registro.lead_id) { const lead = db.get("leads", registro.lead_id); for (const r of regras("venda_registrada")) executar(r, lead, registro); }
  });
  verificarSemResposta();
}
export function verificarSemResposta() {
  const rs = regras("sem_resposta_24h"); if (!rs.length) return;
  for (const l of db.where("leads", (l) => l.stage === "novo" && diasEntre(l.entered_at, hoje()) >= 1 && !(l.auto_flags || []).includes("sem_resposta"))) {
    db.update("leads", l.id, { auto_flags: [...(l.auto_flags || []), "sem_resposta"] });
    for (const r of rs) executar(r, l);
  }
}
