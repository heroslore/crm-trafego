import { db } from "../core/db.js?v=02b90ebf";
import { motivosPerda } from "../core/rules.js?v=02b90ebf";
import { cartao, tabela, badge, badgeOpcao, chips, abrirFormulario, vazio, kanban, abas, itemLista, modal, fecharModal, toast, barrasH, kpi, formulario, lerFormulario } from "../core/ui.js?v=02b90ebf";
import { esc, brl, inteiro, pct, dataBR, hoje, diasEntre, waLink, agora, horaCurta, somaDias } from "../core/format.js?v=02b90ebf";
import { bannerDemo, btnNovo } from "./comum.js?v=02b90ebf";
import { rotulo as rotuloOpcao, OPCOES } from "../core/schema.js?v=02b90ebf";
import { podeEditar, usuario } from "../core/auth.js?v=02b90ebf";
import { abrirVenda } from "./vendas.js?v=02b90ebf";

let visao = "kanban", busca = "", fOwner = "", fProd = "";
const ETAPAS = OPCOES.lead_stage;
const COR_ETAPA = { novo: "var(--ciano)", contato: "var(--roxo)", respondeu: "var(--roxo)", interessado: "var(--amarelo)", negociacao: "var(--amarelo)", aguardando_pagamento: "var(--laranja)", venda: "var(--verde)", followup: "var(--azul)", perdido: "var(--vermelho)" };

export function registrarInteracao(lead_id, type, text) { db.insert("interactions", { lead_id, type, text, at: agora(), user_id: (usuario() || {}).id || "" }); }
export function mudarEtapa(lead, para, ctx) {
  if (lead.stage === para) return;
  if (para === "perdido") { pedirMotivo(lead, ctx); return; }
  db.update("leads", lead.id, { stage: para, last_contact: hoje(), loss_reason: "" });
  registrarInteracao(lead.id, "etapa", `Etapa: ${rotuloOpcao("lead_stage", lead.stage)} → ${rotuloOpcao("lead_stage", para)}`);
  if (para === "venda" && !db.where("sales", (s) => s.lead_id === lead.id).length) { toast("Registre a venda para entrar no faturamento."); abrirVenda(ctx, { lead_id: lead.id }); }
  else ctx.rerender();
}
function pedirMotivo(lead, ctx) {
  const box = modal(`<p class="sub" style="margin-bottom:10px">Por que ${esc(lead.name)} não comprou?</p><div class="campo"><label>Motivo de perda</label><select id="motivoSel">${OPCOES.loss_reason.filter((o) => o[0]).map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div><div class="campo" style="margin-top:8px"><label>Observação</label><textarea id="motivoObs"></textarea></div><div class="form-acoes"><button class="btn btn-perigo" id="motivoOk">Marcar como perdido</button><button class="btn btn-secundario" data-fechar-modal>Cancelar</button></div>`, { titulo: "Motivo de perda" });
  box.querySelector("#motivoOk").addEventListener("click", () => { const m = box.querySelector("#motivoSel").value, o = box.querySelector("#motivoObs").value.trim(); db.update("leads", lead.id, { stage: "perdido", loss_reason: m, notes: o ? ((lead.notes ? lead.notes + "\n" : "") + "Perda: " + o) : lead.notes }); registrarInteracao(lead.id, "etapa", `Perdido: ${rotuloOpcao("loss_reason", m)}${o ? " — " + o : ""}`); fecharModal(); ctx.rerender(); });
}
export function abrirLead(ctx, padrao = {}, id = null) {
  const box = abrirFormulario("leads", id, { padrao: { entered_at: hoje(), stage: "novo", owner_user_id: (usuario() || {}).id || "", ...padrao }, onSave: (l) => { if (l.ad_id && !l.creative_id) { const ad = db.get("ads", l.ad_id); if (ad && ad.creative_id) db.update("leads", l.id, { creative_id: ad.creative_id }); } if (!id) registrarInteracao(l.id, "nota", "Lead cadastrado."); ctx.rerender(); }, onDelete: () => ctx.navegar("#/leads") });
  // anúncio/criativo acompanham a campanha escolhida
  const camp = box.querySelector('[name="campaign_id"]'), ad = box.querySelector('[name="ad_id"]'), cr = box.querySelector('[name="creative_id"]');
  const filtrar = () => { const cid = camp.value; for (const o of ad.options) o.hidden = !!(o.value && cid && (db.get("ads", o.value) || {}).campaign_id !== cid); for (const o of cr.options) o.hidden = !!(o.value && cid && (db.get("creatives", o.value) || {}).campaign_id && (db.get("creatives", o.value) || {}).campaign_id !== cid); };
  camp.addEventListener("change", filtrar); filtrar();
  ad.addEventListener("change", () => { const a = db.get("ads", ad.value); if (a && a.creative_id) cr.value = a.creative_id; });
}

function cardLead(l) {
  const dias = diasEntre(l.entered_at, hoje()); const prod = db.get("products", l.product_id); const dono = db.get("users", l.owner_user_id);
  const atrasado = l.next_followup && l.next_followup < hoje() && !["venda", "perdido"].includes(l.stage);
  return `<div class="t"><a href="#/leads/${l.id}" style="color:inherit">${esc(l.name)}</a></div><div class="s">${prod ? esc(prod.name) + " · " : ""}${l.potential_value ? brl(l.potential_value) + " · " : ""}${dias === 0 ? "hoje" : dias + "d"}${dono ? " · " + esc(dono.name.split(" ")[0]) : ""}</div>${(l.tags || []).length ? `<div style="margin-top:4px">${l.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}${l.next_followup ? `<div class="s" style="color:${atrasado ? "var(--vermelho)" : "inherit"}">⏰ ${dataBR(l.next_followup)}</div>` : ""}<div class="acoes">${l.whatsapp || l.phone ? `<a href="${esc(waLink(l.whatsapp || l.phone))}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ""}<button data-abrir-lead="${l.id}">Ficha</button>${l.stage !== "venda" && l.stage !== "perdido" ? `<button data-venda-lead="${l.id}">💰 Venda</button>` : ""}</div><select data-mover-lead="${l.id}"><option value="">Mover para…</option>${ETAPAS.filter((e) => e[0] !== l.stage).map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>`;
}

function lista(root, ctx) {
  const q = new URLSearchParams(location.hash.split("?")[1] || "");
  const todos = db.all("leads").filter((l) => (!fOwner || l.owner_user_id === fOwner) && (!fProd || l.product_id === fProd) && (!busca || (l.name + " " + (l.whatsapp || "") + " " + (l.phone || "") + " " + (l.tags || []).join(" ")).toLowerCase().includes(busca.toLowerCase())));
  const abertos = todos.filter((l) => !["venda", "perdido"].includes(l.stage));
  const users = db.all("users"), prods = db.all("products");
  let corpo = "";
  if (visao === "kanban") corpo = kanban("leads", { colunas: ETAPAS.map(([id, t]) => ({ id, titulo: t, soma: (ls) => { const v = ls.reduce((s, l) => s + (Number(l.potential_value) || 0), 0); return v ? brl(v) : ""; } })), itens: todos.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")), colunaDe: (l) => l.stage, render: cardLead, cor: (l) => COR_ETAPA[l.stage] });
  else if (visao === "lista") corpo = cartao("", tabela("leads", { colunas: [
    { key: "name", label: "Lead", render: (l) => `<a href="#/leads/${l.id}">${esc(l.name)}</a><br><small>${esc(l.whatsapp || l.phone || "")}</small>` }, { key: "stage", label: "Etapa", render: (l) => badgeOpcao("lead_stage", l.stage) },
    { key: "product", label: "Produto", valor: (l) => (db.get("products", l.product_id) || {}).name || "" }, { key: "campaign", label: "Campanha", valor: (l) => (db.get("campaigns", l.campaign_id) || {}).name || rotuloOpcao("lead_source", l.source) },
    { key: "owner", label: "Responsável", valor: (l) => (db.get("users", l.owner_user_id) || {}).name || "" }, { key: "potential_value", label: "Valor", tipo: "num", fmt: brl }, { key: "entered_at", label: "Entrada", fmt: dataBR }, { key: "last_contact", label: "Últ. contato", fmt: dataBR }, { key: "next_followup", label: "Follow-up", fmt: dataBR },
  ], linhas: todos, ordem: "entered_at" }));
  else corpo = perdas(ctx);
  root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>Leads</h1><p class="sub">${abertos.length} em aberto · ${brl(abertos.reduce((s, l) => s + (Number(l.potential_value) || 0), 0))} em negociação · ${todos.filter((l) => l.stage === "venda").length} vendido(s) · ${todos.filter((l) => l.stage === "perdido").length} perdido(s)</p></div><div class="pagina-acoes">${btnNovo("Novo lead", 'data-novo="1"')}</div></div>
    ${abas([["kanban", "Funil (Kanban)"], ["lista", "Lista"], ["perdas", "Motivos de perda"]], visao)}
    <div class="filtros-linha"><input type="search" placeholder="Buscar nome, telefone, etiqueta" value="${esc(busca)}" data-busca><select data-owner><option value="">Todos os responsáveis</option>${users.map((u) => `<option value="${u.id}"${fOwner === u.id ? " selected" : ""}>${esc(u.name)}</option>`).join("")}</select><select data-prod><option value="">Todos os produtos</option>${prods.map((p) => `<option value="${p.id}"${fProd === p.id ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>${corpo}`;
  root.querySelectorAll("[data-aba]").forEach((b) => b.addEventListener("click", () => { visao = b.dataset.aba; ctx.rerender(); }));
  root.querySelector("[data-busca]").addEventListener("input", (e) => { busca = e.target.value; const pos = e.target.selectionStart; ctx.rerender(); const el = root.querySelector("[data-busca]"); el.focus(); el.setSelectionRange(pos, pos); });
  root.querySelector("[data-owner]").addEventListener("change", (e) => { fOwner = e.target.value; ctx.rerender(); });
  root.querySelector("[data-prod]").addEventListener("change", (e) => { fProd = e.target.value; ctx.rerender(); });
  const n = root.querySelector("[data-novo]"); if (n) n.addEventListener("click", () => abrirLead(ctx));
  root.querySelectorAll("[data-mover-lead]").forEach((s) => s.addEventListener("change", () => { const l = db.get("leads", s.dataset.moverLead); if (l && s.value) mudarEtapa(l, s.value, ctx); }));
  root.querySelectorAll("[data-abrir-lead]").forEach((b) => b.addEventListener("click", () => ctx.navegar(`#/leads/${b.dataset.abrirLead}`)));
  root.querySelectorAll("[data-venda-lead]").forEach((b) => b.addEventListener("click", () => abrirVenda(ctx, { lead_id: b.dataset.vendaLead })));
  if (q.get("novo") === "1" && podeEditar()) { history.replaceState(null, "", "#/leads"); abrirLead(ctx, { campaign_id: q.get("campanha") || "", source: q.get("campanha") ? (db.get("campaigns", q.get("campanha")) || {}).platform || "meta" : "meta" }); }
}
function perdas(ctx) {
  const m = motivosPerda(ctx.iv), mTudo = motivosPerda(null);
  const perdidos = db.where("leads", (l) => l.stage === "perdido").sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  return `<div class="grid2">${cartao(`Motivos de perda no período (${m.total})`, barrasH(m.itens.map((i) => ({ nome: i.rotulo, valor: i.n, cor: "var(--vermelho)", extra: pct(i.n / m.total) })), { vazioTxt: "Nenhum lead perdido no período." }))}${cartao(`Motivos de perda (todo o histórico, ${mTudo.total})`, barrasH(mTudo.itens.map((i) => ({ nome: i.rotulo, valor: i.n, cor: "var(--laranja)", extra: pct(i.n / mTudo.total) })), { vazioTxt: "Nenhum lead perdido." }))}</div>
    ${cartao("Leads perdidos", perdidos.length ? tabela("perdidos", { colunas: [{ key: "name", label: "Lead", render: (l) => `<a href="#/leads/${l.id}">${esc(l.name)}</a>` }, { key: "loss_reason", label: "Motivo", render: (l) => badge(rotuloOpcao("loss_reason", l.loss_reason) || "—", "vermelho") }, { key: "product", label: "Produto", valor: (l) => (db.get("products", l.product_id) || {}).name || "" }, { key: "campaign", label: "Campanha", valor: (l) => (db.get("campaigns", l.campaign_id) || {}).name || "" }, { key: "potential_value", label: "Valor", tipo: "num", fmt: brl }, { key: "entered_at", label: "Entrada", fmt: dataBR }], linhas: perdidos, ordem: "entered_at" }) : vazio("Nenhum lead perdido."))}`;
}

function ficha(root, ctx, l) {
  const prod = db.get("products", l.product_id), camp = db.get("campaigns", l.campaign_id), ad = db.get("ads", l.ad_id), cr = db.get("creatives", l.creative_id), dono = db.get("users", l.owner_user_id);
  const hist = db.where("interactions", (i) => i.lead_id === l.id).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const vendas = db.where("sales", (s) => s.lead_id === l.id), tarefas = db.where("tasks", (t) => t.lead_id === l.id);
  const dias = diasEntre(l.entered_at, hoje());
  root.innerHTML = `<div class="pagina-cab"><div><a href="#/leads" class="link">← Leads</a><div class="ficha-cab"><span class="avatar">${esc(l.name.trim()[0].toUpperCase())}</span><div><h1>${esc(l.name)} ${badgeOpcao("lead_stage", l.stage)}</h1><p class="sub">${esc(l.whatsapp || l.phone || "sem telefone")} · entrou ${dataBR(l.entered_at)} (${dias} dia(s)) · ${dono ? "com " + esc(dono.name) : "sem responsável"} ${(l.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</p></div></div></div>
    <div class="pagina-acoes">${l.whatsapp || l.phone ? `<a class="btn btn-verde" href="${esc(waLink(l.whatsapp || l.phone))}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ""}${podeEditar() ? `${l.stage !== "venda" ? `<button class="btn" data-venda>💰 Registrar venda</button>` : ""}<button class="btn" data-tarefa>☑️ Tarefa</button><button class="btn btn-primario" data-editar>✏️ Editar</button>` : ""}</div></div>
    ${podeEditar() ? `<div class="chips" style="margin-bottom:14px">${ETAPAS.map(([v, t]) => `<button class="chip${l.stage === v ? " ativa" : ""}" data-etapa="${v}">${t}</button>`).join("")}</div>` : ""}
    <div class="grid3">
      ${cartao("Dados", `<p><b>Produto de interesse:</b> ${prod ? `<a href="#/produtos/${prod.id}">${esc(prod.name)}</a>` : "—"}</p><p><b>Valor potencial:</b> ${brl(l.potential_value)}</p><p><b>Previsão de fechamento:</b> ${dataBR(l.expected_close)}</p><p><b>Último contato:</b> ${dataBR(l.last_contact)} · <b>Próximo follow-up:</b> ${dataBR(l.next_followup)}</p>${l.stage === "perdido" ? `<p><b>Motivo de perda:</b> ${badge(rotuloOpcao("loss_reason", l.loss_reason) || "—", "vermelho")}</p>` : ""}${l.notes ? `<p class="sub" style="white-space:pre-wrap">${esc(l.notes)}</p>` : ""}`)}
      ${cartao("Origem", `<p><b>Fonte:</b> ${esc(rotuloOpcao("lead_source", l.source))}</p><p><b>Campanha:</b> ${camp ? `<a href="#/campanhas/${camp.id}">${esc(camp.name)}</a>` : "—"}</p><p><b>Anúncio:</b> ${ad ? `<a href="#/anuncios/${ad.id}">${esc(ad.name)}</a>` : "—"}</p><p><b>Criativo:</b> ${cr ? `<a href="#/criativos/${cr.id}">${esc(cr.name)}</a>` : "—"}</p>`)}
      ${cartao("Vendas e tarefas", (vendas.length ? `<div class="lista">${vendas.map((v) => itemLista({ titulo: brl(v.value), sub: dataBR(v.date) + " · " + esc((db.get("products", v.product_id) || {}).name || ""), href: "#/vendas" })).join("")}</div>` : `<p class="sub">Nenhuma venda registrada.</p>`) + (tarefas.length ? `<h3>Tarefas</h3><div class="lista">${tarefas.map((t) => itemLista({ titulo: esc(t.title), sub: dataBR(t.due_date), badges: badgeOpcao("task_status", t.status), href: "#/tarefas" })).join("")}</div>` : ""))}
    </div>
    ${cartao("Histórico", (podeEditar() ? `<div class="filtros-linha"><select id="intTipo">${OPCOES.interaction_type.filter((o) => o[0] !== "etapa").map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select><input type="text" id="intTexto" placeholder="O que aconteceu? (ex.: cliente pediu desconto)" style="flex:1;min-width:200px"><input type="date" id="intFollow" title="Próximo follow-up"><button class="btn btn-primario btn-pq" id="intOk">Registrar</button></div>` : "") + (hist.length ? `<div class="linha-tempo">${hist.map((i) => `<div class="evento"><b>${esc(rotuloOpcao("interaction_type", i.type))}</b> ${esc(i.text)}<small>${esc(horaCurta(i.at))}${i.user_id ? " · " + esc((db.get("users", i.user_id) || {}).name || "") : ""}</small></div>`).join("")}</div>` : vazio("Sem registros ainda.")))}`;
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.addEventListener("click", fn); };
  on("[data-editar]", () => abrirLead(ctx, {}, l.id));
  on("[data-venda]", () => abrirVenda(ctx, { lead_id: l.id }));
  on("[data-tarefa]", () => abrirFormulario("tasks", null, { padrao: { title: "Acompanhar " + l.name, lead_id: l.id, product_id: l.product_id, campaign_id: l.campaign_id, owner_user_id: l.owner_user_id, due_date: somaDias(hoje(), 1) }, onSave: ctx.rerender }));
  root.querySelectorAll("[data-etapa]").forEach((b) => b.addEventListener("click", () => mudarEtapa(l, b.dataset.etapa, ctx)));
  on("#intOk", () => { const t = root.querySelector("#intTexto").value.trim(), tipo = root.querySelector("#intTipo").value, f = root.querySelector("#intFollow").value; if (!t && !f) return; if (t) registrarInteracao(l.id, tipo, t); const patch = { last_contact: hoje() }; if (f) patch.next_followup = f; if (l.stage === "novo" && tipo !== "nota") patch.stage = "contato"; db.update("leads", l.id, patch); ctx.rerender(); });
}

document.addEventListener("kanban:mover", (ev) => { if (ev.detail.kanban !== "leads") return; const l = db.get("leads", ev.detail.id); if (l && window.CRM) mudarEtapa(l, ev.detail.para, { rerender: window.CRM.render, navegar: (h) => { location.hash = h; } }); });

export default { id: "leads", titulo: "Leads", icone: "🤝", render(root, ctx) { const l = ctx.rota.id && db.get("leads", ctx.rota.id); if (l) ficha(root, ctx, l); else lista(root, ctx); } };
