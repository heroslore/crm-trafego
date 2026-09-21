// Casca do aplicativo: menu, topo, período global, roteador, busca, notificações, perfil.
import { db, garantirBase, inserirDemonstracao } from "./core/db.js";
import { PERIODOS, intervalo, rotulo as rotuloPeriodo } from "./core/periods.js";
import { esc, hoje, somaDias, semAcento } from "./core/format.js";
import { carregarUsuario, usuario, entrar, pode, PERMISSOES } from "./core/auth.js";
import { carregarMeta, nuvemLer, nuvemLigada, sincronizar, iniciarPoll, agendarEnvio, onNuvem } from "./core/sync.js";
import { iniciarAutomacoes, verificarSemResposta } from "./core/automations.js";
import { alertas } from "./core/rules.js";
import * as W from "./core/wame.js";
import { modal, fecharModal, modalAberto, toast, ordenar, prioridadeBadge } from "./core/ui.js";
import { rotulo as rotuloOpcao } from "./core/schema.js";

import dashboard from "./modules/dashboard.js";
import hoje_ from "./modules/hoje.js";
import inbox from "./modules/inbox.js";
import decisoes from "./modules/decisoes.js";
import campanhas from "./modules/campanhas.js";
import anuncios from "./modules/anuncios.js";
import criativos from "./modules/criativos.js";
import produtos from "./modules/produtos.js";
import publicos from "./modules/publicos.js";
import leads from "./modules/leads.js";
import vendas from "./modules/vendas.js";
import clientes from "./modules/clientes.js";
import financeiro from "./modules/financeiro.js";
import testes from "./modules/testes.js";
import planejamento from "./modules/planejamento.js";
import tarefas from "./modules/tarefas.js";
import calendario from "./modules/calendario.js";
import briefings from "./modules/briefings.js";
import ideias from "./modules/ideias.js";
import relatorios from "./modules/relatorios.js";
import calculadoras from "./modules/calculadoras.js";
import concorrentes from "./modules/concorrentes.js";
import config from "./modules/config.js";

export const MODULOS = [dashboard, hoje_, inbox, decisoes, campanhas, anuncios, criativos, produtos, publicos, leads, vendas, clientes, financeiro, testes, planejamento, tarefas, calendario, briefings, ideias, relatorios, calculadoras, concorrentes, config];
const SECOES = [
  ["Dia a dia", ["hoje", "inbox", "dashboard", "decisoes"]],
  ["Tráfego", ["campanhas", "anuncios", "criativos", "publicos", "testes"]],
  ["Vendas", ["leads", "vendas", "clientes", "produtos", "financeiro"]],
  ["Organização", ["planejamento", "tarefas", "calendario", "briefings", "ideias"]],
  ["Análise", ["relatorios", "calculadoras", "concorrentes"]],
  ["", ["config"]],
];

export const estado = { periodo: { tipo: "30d", inicio: "", fim: "" }, rota: { modulo: "dashboard", id: "", aba: "" } };
try { const p = JSON.parse(localStorage.getItem("crm-trafego-periodo") || "null"); if (p && p.tipo) estado.periodo = p; } catch {}

const $ = (id) => document.getElementById(id);
const ctx = () => ({ iv: intervalo(estado.periodo), periodo: estado.periodo, rota: estado.rota, navegar, rerender: render, usuario: usuario() });

// ---------------------------------------------------------------- roteador
function lerHash() {
  const h = location.hash.replace(/^#\/?/, ""); const [caminho, query] = h.split("?");
  const partes = caminho.split("/").filter(Boolean);
  estado.rota = { modulo: partes[0] || "dashboard", id: partes[1] || "", aba: new URLSearchParams(query || "").get("aba") || "" };
  if (!MODULOS.find((m) => m.id === estado.rota.modulo)) estado.rota.modulo = "dashboard";
}
export function navegar(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function render() {
  lerHash();
  const m = MODULOS.find((x) => x.id === estado.rota.modulo);
  const root = $("pagina");
  if (!pode(m.id)) { root.innerHTML = `<div class="cartao"><div class="cartao-corpo"><h1>Sem acesso</h1><p class="sub">Seu perfil (${esc(rotuloOpcao("role", usuario()?.role))}) não tem acesso a "${esc(m.titulo)}". Troque de usuário no canto inferior do menu.</p></div></div>`; return; }
  document.title = `${m.titulo} · CRM de Tráfego`;
  try { m.render(root, ctx()); } catch (e) { console.error(e); root.innerHTML = `<div class="aviso aviso-erro">Erro ao montar a tela "${esc(m.titulo)}": ${esc(e.message)}</div>`; }
  document.querySelectorAll("#menu a").forEach((a) => a.classList.toggle("ativa", a.dataset.modulo === m.id));
  document.body.classList.remove("menu-aberto");
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- menu, topo
function montarMenu() {
  const contadores = contagensMenu();
  $("menu").innerHTML = SECOES.map(([titulo, ids]) => `${titulo ? `<div class="secao">${titulo}</div>` : `<div class="secao"></div>`}${ids.map((id) => MODULOS.find((m) => m.id === id)).filter((m) => m && pode(m.id)).map((m) => `<a href="#/${m.id}" data-modulo="${m.id}"><span class="ico">${m.icone}</span><span>${m.titulo}</span>${contadores[m.id] ? `<span class="cont">${contadores[m.id]}</span>` : ""}</a>`).join("")}`).join("");
  const u = usuario();
  $("usuarioNome").textContent = u ? u.name : "—"; $("usuarioPapel").textContent = u ? rotuloOpcao("role", u.role) : ""; $("avatar").textContent = (u && u.name ? u.name : "?").trim()[0].toUpperCase();
  const sel = $("empresaSel"); const emps = db.all("companies");
  sel.innerHTML = `<option value="">Todas as empresas / lojas</option>` + emps.map((e) => `<option value="${esc(e.id)}"${db.empresa() === e.id ? " selected" : ""}>${esc(e.name)}</option>`).join("");
  sel.style.display = emps.length > 1 ? "" : "none";
}
function contagensMenu() {
  const h = hoje();
  return {
    leads: db.where("leads", (l) => l.stage === "novo" || (l.next_followup && l.next_followup <= h && !["venda", "perdido"].includes(l.stage))).length,
    tarefas: db.where("tasks", (t) => t.due_date && t.due_date < h && t.status !== "finalizado").length,
    inbox: W.estado.naoLidas || 0,
    decisoes: 0,
  };
}
function montarPeriodo() {
  const p = estado.periodo; const el = $("periodo");
  el.className = "periodo" + (p.tipo === "custom" ? " custom" : "");
  el.innerHTML = `<select id="periodoSel" title="Período">${PERIODOS.map(([v, t]) => `<option value="${v}"${v === p.tipo ? " selected" : ""}>${t}</option>`).join("")}</select>${p.tipo === "custom" ? `<input type="date" id="periodoIni" value="${esc(p.inicio || somaDias(hoje(), -29))}"><input type="date" id="periodoFim" value="${esc(p.fim || hoje())}">` : ""}`;
}
function gravarPeriodo() { try { localStorage.setItem("crm-trafego-periodo", JSON.stringify(estado.periodo)); } catch {} }

// ---------------------------------------------------------------- notificações
let cacheAlertas = [];
function atualizarNotificacoes() {
  try { cacheAlertas = alertas(intervalo(estado.periodo)); } catch (e) { console.error(e); cacheAlertas = []; }
  const n = cacheAlertas.filter((a) => a.prioridade === "urgente" || a.prioridade === "alta").length;
  const c = $("notifCont"); c.textContent = n; c.style.display = n ? "" : "none";
  $("painelNotif").innerHTML = `<div class="cab"><span>Alertas automáticos (${cacheAlertas.length})</span><a href="#/decisoes" class="link">Central de decisões</a></div>` + (cacheAlertas.length ? cacheAlertas.slice(0, 40).map((a) => `<div class="notif"><div class="txt"><a href="${esc(a.link || "#/decisoes")}" style="color:inherit">${prioridadeBadge(a.prioridade)} ${esc(a.texto)}</a><small>${esc(a.categoria)}</small></div><button title="Descartar" data-descartar="${esc(a.key)}">✕</button></div>`).join("") : `<div class="vazio">Nenhum alerta agora.</div>`);
}

// ---------------------------------------------------------------- busca
function buscar(q) {
  const res = $("buscaRes"); const t = semAcento(q.trim()); if (t.length < 2) { res.classList.remove("aberta"); return; }
  const fontes = [["leads", "Lead", (r) => r.name + " " + (r.whatsapp || "") + " " + (r.phone || ""), (r) => `#/leads/${r.id}`], ["products", "Produto", (r) => r.name + " " + (r.sku || "") + " " + (r.category || ""), (r) => `#/produtos/${r.id}`], ["campaigns", "Campanha", (r) => r.name, (r) => `#/campanhas/${r.id}`], ["creatives", "Criativo", (r) => r.name + " " + (r.copy || ""), (r) => `#/criativos/${r.id}`], ["tasks", "Tarefa", (r) => r.title, () => `#/tarefas`], ["competitors", "Concorrente", (r) => r.company + " " + (r.product || ""), () => `#/concorrentes`], ["audiences", "Público", (r) => r.name, () => `#/publicos`]];
  const achados = [];
  for (const [tab, rot, txt, href] of fontes) for (const r of db.all(tab)) if (semAcento(txt(r)).includes(t)) { achados.push({ rot, nome: r.name || r.title || r.company, href: href(r) }); if (achados.length >= 25) break; }
  res.innerHTML = achados.length ? achados.map((a) => `<a href="${esc(a.href)}">${esc(a.nome)}<small>${esc(a.rot)}</small></a>`).join("") : `<div class="vazio">Nada encontrado.</div>`;
  res.classList.add("aberta");
}

// ---------------------------------------------------------------- usuário
function trocarUsuario() {
  const us = db.where("users", (u) => u.active !== false);
  modal(`<p class="sub" style="margin-bottom:10px">Escolha quem está usando o sistema neste aparelho. Cada perfil vê só as áreas permitidas.</p><div class="lista">${us.map((u) => `<div class="item clicavel" data-entrar="${esc(u.id)}"><div class="item-txt"><div class="item-titulo">${esc(u.name)}</div><div class="item-sub">${esc(rotuloOpcao("role", u.role))}${u.pin ? " · com PIN" : ""}</div></div><div class="item-dir">→</div></div>`).join("")}</div><p class="sub" style="margin-top:12px">Cadastre pessoas em Configurações → Usuários.</p>`, { titulo: "Quem está usando?" });
}

// ---------------------------------------------------------------- eventos globais
document.addEventListener("click", (ev) => {
  const t = ev.target;
  if (t.closest("[data-fechar-modal]") || t === $("modal-fundo")) { fecharModal(); return; }
  const href = t.closest("[data-href]"); if (href && !t.closest("a, button, select, input")) { navegar(href.dataset.href); return; }
  const sort = t.closest("th[data-sort]"); if (sort) { ordenar(sort.dataset.tabela, sort.dataset.sort); render(); return; }
  const d = t.closest("[data-descartar]"); if (d) { db.insert("alerts", { key: d.dataset.descartar, dismissed_at: new Date().toISOString() }); atualizarNotificacoes(); return; }
  const e = t.closest("[data-entrar]"); if (e) { const u = db.get("users", e.dataset.entrar); if (u && u.pin) { const p = prompt("PIN de " + u.name + ":"); if (p !== String(u.pin)) { toast("PIN incorreto.", "erro"); return; } } entrar(e.dataset.entrar); fecharModal(); montarMenu(); render(); return; }
  if (t.closest("#btnUsuario")) { trocarUsuario(); return; }
  if (t.closest("#btnMenu")) { document.body.classList.toggle("menu-aberto"); return; }
  if (t.closest("#fundoLateral")) { document.body.classList.remove("menu-aberto"); return; }
  if (t.closest("#btnNotif")) { atualizarNotificacoes(); $("painelNotif").classList.toggle("aberto"); return; }
  if (!t.closest("#painelNotif")) $("painelNotif").classList.remove("aberto");
  if (t.closest("#btnTema")) { const atual = document.documentElement.getAttribute("data-theme") === "light" ? "" : "light"; if (atual) document.documentElement.setAttribute("data-theme", atual); else document.documentElement.removeAttribute("data-theme"); try { localStorage.setItem("crm-trafego-tema", atual); } catch {} return; }
  if (!t.closest(".busca")) $("buscaRes").classList.remove("aberta");
  const chipP = t.closest("[data-periodo]"); if (chipP) { estado.periodo = { ...estado.periodo, tipo: chipP.dataset.periodo }; gravarPeriodo(); montarPeriodo(); render(); return; }
});
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.id === "periodoSel") { estado.periodo.tipo = t.value; if (t.value === "custom") { estado.periodo.inicio = estado.periodo.inicio || somaDias(hoje(), -29); estado.periodo.fim = estado.periodo.fim || hoje(); } gravarPeriodo(); montarPeriodo(); render(); }
  if (t.id === "periodoIni" || t.id === "periodoFim") { estado.periodo.inicio = $("periodoIni").value || estado.periodo.inicio; estado.periodo.fim = $("periodoFim").value || estado.periodo.fim; gravarPeriodo(); render(); }
  if (t.id === "empresaSel") { db.setEmpresa(t.value); render(); }
});
document.addEventListener("input", (ev) => { if (ev.target.id === "busca") buscar(ev.target.value); });
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { if (modalAberto()) fecharModal(); $("buscaRes").classList.remove("aberta"); $("painelNotif").classList.remove("aberto"); } });
window.addEventListener("hashchange", () => { $("buscaRes").classList.remove("aberta"); render(); });

// kanban: arrastar e soltar (delegado)
let arrastando = null;
document.addEventListener("dragstart", (ev) => { const c = ev.target.closest && ev.target.closest(".kcard"); if (c) { arrastando = { id: c.dataset.id, kanban: c.closest(".kanban").dataset.kanban }; ev.dataTransfer.effectAllowed = "move"; } });
document.addEventListener("dragover", (ev) => { const col = ev.target.closest && ev.target.closest(".kcol"); if (col && arrastando) { ev.preventDefault(); col.classList.add("sobre"); } });
document.addEventListener("dragleave", (ev) => { const col = ev.target.closest && ev.target.closest(".kcol"); if (col) col.classList.remove("sobre"); });
document.addEventListener("drop", (ev) => { const col = ev.target.closest && ev.target.closest(".kcol"); if (col && arrastando) { ev.preventDefault(); col.classList.remove("sobre"); document.dispatchEvent(new CustomEvent("kanban:mover", { detail: { ...arrastando, para: col.dataset.col } })); arrastando = null; } });

// ---------------------------------------------------------------- início
async function iniciar() {
  db.carregar(); garantirBase();
  if (!db.settings().demo_inserido && !db.settings().demo_removido && !db.count("products") && !db.count("leads") && !db.count("sales")) inserirDemonstracao();
  carregarUsuario(); nuvemLer(); iniciarAutomacoes(); W.carregarCfg();
  montarMenu(); montarPeriodo(); render(); atualizarNotificacoes();
  let timerMudou = null;
  db.onChange(({ tabela }) => { if (tabela !== "alerts" && tabela !== "settings") agendarEnvio(); clearTimeout(timerMudou); timerMudou = setTimeout(() => { montarMenu(); atualizarNotificacoes(); }, 300); });
  onNuvem(() => { const el = document.querySelector("[data-nuvem-status]"); if (el) el.textContent = ""; });
  if (W.configurado()) { W.onMensagens(() => { montarMenu(); }); W.verificarConexao().catch(() => {}); W.iniciarPolling(); }
  const r = await carregarMeta();
  if (r.ok && r.novo) { toast("Dados da Meta atualizados."); verificarSemResposta(); render(); atualizarNotificacoes(); }
  if (nuvemLigada()) { await sincronizar("abrir"); iniciarPoll(); render(); }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { carregarMeta().then((x) => { if (x.novo) render(); }); if (nuvemLigada()) sincronizar("voltar"); } });
  window.addEventListener("online", () => { if (nuvemLigada()) sincronizar("online"); });
  window.CRM = { db, estado, render, wame: W };
}
iniciar();
