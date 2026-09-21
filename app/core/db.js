// Banco de dados do navegador: tabelas em memória, persistência, eventos e dados de demonstração.
// Módulos usam só esta API; o adaptador de armazenamento pode ser trocado sem mexer neles.
import { TABELAS, TABELAS_COM_EMPRESA } from "./schema.js?v=02b90ebf";
import { uid, agora, hoje, somaDias } from "./format.js?v=02b90ebf";

const CHAVE = "crm-trafego-db";
const VERSAO = 1;

const armazenamento = {
  ler() { try { return JSON.parse(localStorage.getItem(CHAVE) || "null"); } catch { return null; } },
  gravar(obj) { try { localStorage.setItem(CHAVE, JSON.stringify(obj)); return true; } catch (e) { console.warn("Falha ao gravar", e); return false; } },
};

const estado = { versao: VERSAO, atualizado_em: null, tabelas: {} };
let escopoEmpresa = ""; // "" = todas as empresas
const indices = {};
const ouvintes = new Set();
let timerGravar = null;

for (const t of Object.keys(TABELAS)) estado.tabelas[t] = [];

function reindexar(t) { const m = new Map(); for (const r of estado.tabelas[t]) m.set(r.id, r); indices[t] = m; }
function agendarGravacao() { clearTimeout(timerGravar); timerGravar = setTimeout(() => { estado.atualizado_em = agora(); armazenamento.gravar(estado); }, 400); }
function notificar(tabela, tipo, registro) { for (const fn of ouvintes) { try { fn({ tabela, tipo, registro }); } catch (e) { console.error(e); } } }

function aplicarPadroes(t, r) {
  for (const c of TABELAS[t].campos) {
    if (r[c.key] === undefined) r[c.key] = c.default === "hoje" ? hoje() : (c.default !== undefined ? (Array.isArray(c.default) ? c.default.slice() : c.default) : (c.type === "number" || c.type === "money" ? null : c.type === "bool" ? false : c.type === "json" ? null : ""));
  }
  return r;
}

export const db = {
  carregar() {
    const salvo = armazenamento.ler();
    if (salvo && salvo.tabelas) {
      for (const t of Object.keys(TABELAS)) estado.tabelas[t] = Array.isArray(salvo.tabelas[t]) ? salvo.tabelas[t] : [];
      estado.atualizado_em = salvo.atualizado_em || null;
    }
    for (const t of Object.keys(TABELAS)) reindexar(t);
    try { escopoEmpresa = localStorage.getItem(CHAVE + "-empresa") || ""; } catch {}
    if (escopoEmpresa && !indices.companies.get(escopoEmpresa)) escopoEmpresa = "";
    return estado;
  },
  vazio() { return Object.keys(TABELAS).every((t) => t === "settings" || t === "weekly_plan" || t === "marketing_goals" || estado.tabelas[t].filter((r) => !r.deleted_at).length === 0); },
  tabelas() { return Object.keys(TABELAS); },
  all(t, incluirApagados = false) {
    const base = incluirApagados ? estado.tabelas[t].slice() : estado.tabelas[t].filter((r) => !r.deleted_at);
    if (escopoEmpresa && TABELAS_COM_EMPRESA.includes(t)) return base.filter((r) => !r.company_id || r.company_id === escopoEmpresa);
    return base;
  },
  setEmpresa(id) { escopoEmpresa = id || ""; try { localStorage.setItem(CHAVE + "-empresa", escopoEmpresa); } catch {} notificar("*", "escopo", null); },
  empresa() { return escopoEmpresa; },
  where(t, fn) { return this.all(t).filter(fn); },
  get(t, id) { const r = indices[t] && indices[t].get(id); return r && !r.deleted_at ? r : null; },
  count(t) { return this.all(t).length; },
  insert(t, dados) {
    const r = aplicarPadroes(t, { ...dados });
    if (escopoEmpresa && TABELAS_COM_EMPRESA.includes(t) && !r.company_id) r.company_id = escopoEmpresa;
    r.id = r.id || uid(); r.created_at = r.created_at || agora(); r.updated_at = agora(); delete r.deleted_at;
    const existente = indices[t].get(r.id);
    if (existente) { Object.assign(existente, r); } else { estado.tabelas[t].push(r); indices[t].set(r.id, r); }
    agendarGravacao(); notificar(t, "insert", existente || r); return existente || r;
  },
  update(t, id, patch) {
    const r = indices[t].get(id); if (!r) return null;
    Object.assign(r, patch, { updated_at: agora() });
    agendarGravacao(); notificar(t, "update", r); return r;
  },
  remove(t, id) {
    const r = indices[t].get(id); if (!r) return false;
    r.deleted_at = agora(); r.updated_at = r.deleted_at;
    agendarGravacao(); notificar(t, "remove", r); return true;
  },
  upsertPorExterno(t, external_id, dados, camposDaPlataforma) {
    // Atualiza só os campos da plataforma; preserva o que o usuário editou.
    const atual = this.all(t, true).find((r) => r.external_id === external_id);
    if (!atual) return this.insert(t, { ...dados, external_id });
    const patch = {};
    for (const k of camposDaPlataforma) if (dados[k] !== undefined && atual[k] !== dados[k]) patch[k] = dados[k];
    if (atual.deleted_at) { patch.deleted_at = null; }
    if (Object.keys(patch).length) { delete atual.deleted_at; this.update(t, atual.id, patch); }
    return atual;
  },
  settings() { const r = this.get("settings", "app"); return (r && r.data) || {}; },
  setSettings(patch) { const r = this.get("settings", "app"); const data = { ...((r && r.data) || {}), ...patch }; if (r) this.update("settings", "app", { data }); else this.insert("settings", { id: "app", data }); return data; },
  goal(key, padrao = 0) { const r = this.get("marketing_goals", key); return r && r.value != null && r.value !== "" ? Number(r.value) : padrao; },
  setGoal(key, label, value) { if (this.get("marketing_goals", key)) this.update("marketing_goals", key, { label, value }); else this.insert("marketing_goals", { id: key, key, label, value }); },
  onChange(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
  exportar() { return JSON.stringify({ versao: VERSAO, exportado_em: agora(), tabelas: estado.tabelas }); },
  importar(obj, modo = "mesclar") {
    if (!obj || !obj.tabelas) throw new Error("arquivo não é um backup do CRM");
    for (const t of Object.keys(TABELAS)) {
      const vindos = Array.isArray(obj.tabelas[t]) ? obj.tabelas[t] : [];
      if (modo === "substituir") { estado.tabelas[t] = vindos; }
      else {
        for (const v of vindos) { if (!v || !v.id) continue; const a = indices[t].get(v.id); if (!a || (v.updated_at || "") > (a.updated_at || "")) { if (a) Object.assign(a, v); else estado.tabelas[t].push(v); } }
      }
      reindexar(t);
    }
    agendarGravacao(); notificar("*", "import", null);
  },
  mesclarRemoto(obj) { this.importar(obj, "mesclar"); },
  snapshot() { return { versao: VERSAO, atualizado_em: estado.atualizado_em, tabelas: estado.tabelas }; },
  limparTudo() { for (const t of Object.keys(TABELAS)) { estado.tabelas[t] = []; reindexar(t); } agendarGravacao(); notificar("*", "clear", null); },
  removerDemo() {
    let n = 0;
    for (const t of Object.keys(TABELAS)) { for (const r of estado.tabelas[t]) if (r.demo && !r.deleted_at) { r.deleted_at = agora(); r.updated_at = r.deleted_at; n++; } }
    this.setSettings({ demo_removido: true });
    agendarGravacao(); notificar("*", "demo", null); return n;
  },
  temDemo() { return Object.keys(TABELAS).some((t) => estado.tabelas[t].some((r) => r.demo && !r.deleted_at)); },
  purgarApagados(dias = 120) {
    const limite = somaDias(hoje(), -dias) + "T00:00:00";
    for (const t of Object.keys(TABELAS)) { estado.tabelas[t] = estado.tabelas[t].filter((r) => !r.deleted_at || r.deleted_at > limite); reindexar(t); }
  },
  gravarAgora() { clearTimeout(timerGravar); estado.atualizado_em = agora(); return armazenamento.gravar(estado); },
};

// ------------------------------------------------------------ dados iniciais
export function garantirBase() {
  if (!db.get("settings", "app")) db.insert("settings", { id: "app", data: { empresa: "Minha empresa", limite_custo_msg: 15, limite_freq: 3, gasto_sem_venda: 100, dias_produto_parado: 15, cpa_alta_pct: 30 } });
  if (!db.count("users")) db.insert("users", { id: "u-admin", name: "Administrador", role: "admin", active: true });
  if (!db.count("companies")) db.insert("companies", { id: "emp-principal", name: "Minha loja", segment: "", currency: "BRL", timezone: "America/Bahia", keywords: [] });
  if (!db.count("automations") && !db.settings().automacoes_criadas) {
    db.insert("automations", { id: "auto-1", name: "Lead novo: tarefa de resposta em 1 dia", trigger: "lead_criado", action: "tarefa", days: 1, value: "Responder lead {lead}", active: true });
    db.insert("automations", { id: "auto-2", name: "Interessado: follow-up em 2 dias", trigger: "etapa_mudou", stage: "interessado", action: "followup", days: 2, active: true });
    db.insert("automations", { id: "auto-3", name: "Aguardando pagamento: follow-up em 1 dia", trigger: "etapa_mudou", stage: "aguardando_pagamento", action: "followup", days: 1, active: true });
    db.insert("automations", { id: "auto-4", name: "Venda registrada: etiqueta cliente", trigger: "venda_registrada", action: "etiqueta", value: "cliente", active: true });
    db.setSettings({ automacoes_criadas: true });
  }
  const metasPadrao = [["faturamento_mes", "Meta de faturamento mensal (R$)", 0], ["faturamento_semana", "Meta de faturamento semanal (R$)", 0], ["vendas_mes", "Meta de vendas no mês", 0], ["leads_mes", "Meta de leads no mês", 0],
    ["roas_min", "ROAS mínimo", 3], ["cpa_max", "CPA máximo (R$)", 0], ["cpl_max", "CPL máximo (R$)", 15], ["ticket_medio", "Ticket médio desejado (R$)", 0], ["investimento_max_mes", "Investimento máximo mensal (R$)", 0], ["ctr_min", "CTR mínimo (%)", 1]];
  for (const [k, l, v] of metasPadrao) if (!db.get("marketing_goals", k)) db.insert("marketing_goals", { id: k, key: k, label: l, value: v });
  const plano = {
    1: ["Analisar resultados do final de semana", "Ver produtos com maior saída", "Ver produtos com menor saída", "Ver estoque", "Definir campanhas da semana"],
    2: ["Criar novas campanhas", "Subir novos criativos", "Testar públicos"],
    3: ["Analisar desempenho", "Ajustar orçamento", "Pausar anúncios ruins"],
    4: ["Testar novos criativos", "Planejar promoções", "Preparar campanhas do final de semana"],
    5: ["Escalar campanhas vencedoras", "Preparar campanhas de sábado e domingo"],
    6: ["Monitorar campanhas", "Acompanhar vendas"],
    7: ["Resumo semanal"],
  };
  for (const d of Object.keys(plano)) if (!db.get("weekly_plan", "dia-" + d)) db.insert("weekly_plan", { id: "dia-" + d, day: Number(d), items: plano[d].map((text) => ({ id: uid(), text })), done: {} });
  const datas = [["Dia das Mães", "05-10"], ["Dia dos Namorados", "06-12"], ["Dia dos Pais", "08-09"], ["Dia do Cliente", "09-15"], ["Black Friday", "11-27"], ["Natal", "12-25"], ["Ano Novo", "01-01"]];
  const ano = Number(hoje().slice(0, 4));
  if (!db.all("calendar_events").some((e) => e.type === "comemorativa")) {
    for (const [t, md] of datas) { for (const a of [ano, ano + 1]) db.insert("calendar_events", { id: `data-${a}-${md}`, title: t, date: `${a}-${md}`, type: "comemorativa", alert_days: [30, 15, 7, 3] }); }
  }
}

export function inserirDemonstracao() {
  const h = hoje(); const d = (n) => somaDias(h, -n);
  const marca = (r) => ({ ...r, demo: true });
  const u1 = db.insert("users", marca({ id: "demo-vend-1", name: "Ana (demo)", role: "vendedor", active: true }));
  const u2 = db.insert("users", marca({ id: "demo-vend-2", name: "Carlos (demo)", role: "vendedor", active: true }));
  const p1 = db.insert("products", marca({ id: "demo-prod-1", name: "Produto Demo A", category: "Demonstração", sku: "DEMO-A", stock: 12, stock_min: 5, cost: 1500, price: 2600 }));
  const p2 = db.insert("products", marca({ id: "demo-prod-2", name: "Produto Demo B", category: "Demonstração", sku: "DEMO-B", stock: 40, stock_min: 5, cost: 900, price: 1400 }));
  const p3 = db.insert("products", marca({ id: "demo-prod-3", name: "Produto Demo C (parado)", category: "Demonstração", sku: "DEMO-C", stock: 25, stock_min: 3, cost: 300, price: 520 }));
  const pub = db.insert("audiences", marca({ id: "demo-pub-1", name: "Interesse tecnologia 25-45 (demo)", platform: "google", type: "interesse" }));
  const c1 = db.insert("campaigns", marca({ id: "demo-camp-1", name: "[DEMO] Google — Produto A", platform: "google", objective: "vendas", product_id: p1.id, audience_id: pub.id, start_date: d(20), status: "ativa", daily_budget: 40, source: "manual" }));
  const c2 = db.insert("campaigns", marca({ id: "demo-camp-2", name: "[DEMO] TikTok — Produto B", platform: "tiktok", objective: "leads", product_id: p2.id, start_date: d(12), status: "ativa", daily_budget: 25, source: "manual" }));
  const cr1 = db.insert("creatives", marca({ id: "demo-cr-1", name: "[DEMO] Vídeo depoimento", type: "video", product_id: p1.id, campaign_id: c1.id, cta: "Compre agora", published_at: d(20), owner_user_id: u1.id }));
  const cr2 = db.insert("creatives", marca({ id: "demo-cr-2", name: "[DEMO] Carrossel oferta", type: "carrossel", product_id: p2.id, campaign_id: c2.id, cta: "Saiba mais", published_at: d(12), owner_user_id: u2.id }));
  const a1 = db.insert("ads", marca({ id: "demo-ad-1", name: "[DEMO] Anúncio A1", campaign_id: c1.id, creative_id: cr1.id, status: "ativa" }));
  const a2 = db.insert("ads", marca({ id: "demo-ad-2", name: "[DEMO] Anúncio B1", campaign_id: c2.id, creative_id: cr2.id, status: "ativa" }));
  for (let i = 0; i < 20; i++) {
    db.insert("campaign_metrics", marca({ id: `demo-m1-${i}`, date: d(i), campaign_id: c1.id, ad_id: a1.id, creative_id: cr1.id, spend: 35 + (i % 4) * 3, impressions: 4000 + i * 90, reach: 3200 + i * 70, clicks: 90 + (i % 5) * 6, link_clicks: 70 + (i % 5) * 5, results: 4 + (i % 3), source: "manual" }));
    if (i < 12) db.insert("campaign_metrics", marca({ id: `demo-m2-${i}`, date: d(i), campaign_id: c2.id, ad_id: a2.id, creative_id: cr2.id, spend: 22 + (i % 3) * 2, impressions: 6000 + i * 50, reach: 5000, clicks: 60 + (i % 4) * 4, link_clicks: 45, results: 3 + (i % 2), source: "manual" }));
  }
  const nomes = ["João", "Maria", "Pedro", "Lúcia", "Rafael", "Bruna", "Tiago", "Camila", "Diego", "Paula", "Marcos", "Júlia"];
  const etapas = ["novo", "contato", "respondeu", "interessado", "negociacao", "venda", "venda", "perdido", "followup", "venda", "aguardando_pagamento", "perdido"];
  nomes.forEach((n, i) => {
    const camp = i % 3 === 0 ? c2 : c1; const prod = i % 3 === 0 ? p2 : p1;
    const lead = db.insert("leads", marca({ id: `demo-lead-${i}`, name: `${n} (demo)`, whatsapp: `7399990${String(i).padStart(4, "0")}`, product_id: prod.id, source: camp.platform, campaign_id: camp.id, ad_id: camp === c1 ? a1.id : a2.id, creative_id: camp === c1 ? cr1.id : cr2.id, entered_at: d(15 - i), owner_user_id: i % 2 ? u1.id : u2.id, potential_value: prod.price, stage: etapas[i], loss_reason: etapas[i] === "perdido" ? (i % 2 ? "caro" : "nao_respondeu") : "", next_followup: etapas[i] === "followup" ? d(1) : "" }));
    if (etapas[i] === "venda") db.insert("sales", marca({ id: `demo-sale-${i}`, date: d(12 - i < 0 ? 0 : 12 - i), product_id: prod.id, quantity: 1, value: prod.price, product_cost: prod.cost, lead_id: lead.id, seller_user_id: lead.owner_user_id, source: camp.platform, campaign_id: camp.id, ad_id: lead.ad_id, creative_id: lead.creative_id, payment: i % 2 ? "pix" : "cartao" }));
  });
  db.insert("tasks", marca({ id: "demo-task-1", title: "[DEMO] Subir criativo novo do Produto A", product_id: p1.id, campaign_id: c1.id, owner_user_id: u1.id, priority: "alta", due_date: d(-2), status: "aguardando_criativo" }));
  db.insert("tasks", marca({ id: "demo-task-2", title: "[DEMO] Revisar orçamento da campanha B", campaign_id: c2.id, owner_user_id: u2.id, priority: "urgente", due_date: d(1), status: "a_fazer" }));
  db.insert("ab_tests", marca({ id: "demo-ab-1", name: "[DEMO] Vídeo x Carrossel", campaign_id: c1.id, product_id: p1.id, hypothesis: "Vídeo com depoimento gera CTR maior que carrossel de oferta.", start: d(10), end: d(3), creative_a_id: cr1.id, creative_b_id: cr2.id, spend: 300, a_ctr: 2.1, b_ctr: 1.4, a_cpa: 45, b_cpa: 62, a_conv: 6, b_conv: 4, a_roas: 5.2, b_roas: 3.8, result: "a", learning: "Depoimento em vídeo converte melhor.", apply_next: "Priorizar vídeos com prova social nos próximos criativos." }));
  db.insert("competitors", marca({ id: "demo-comp-1", company: "[DEMO] Concorrente X", instagram: "https://instagram.com/", product: "Produto similar ao A", price: 2450, promotion: "10% no Pix", ad_type: "Reels com influenciador", analyzed_at: d(3) }));
  db.insert("ideas", marca({ id: "demo-idea-1", title: "[DEMO] Reels 'antes e depois'", type: "video", product_id: p1.id, status: "avaliar" }));
  db.insert("briefings", marca({ id: "demo-brief-1", product_id: p2.id, objective: "vendas", offer: "Frete grátis", price: 1400, audience: "Mulheres 25-45", format: "reels", hook: "Você ainda paga caro por isso?", argument: "Mesma qualidade, metade do preço", cta: "Chama no WhatsApp", deadline: d(-5), owner_user_id: u2.id, status: "producao" }));
  db.setSettings({ demo_inserido: true });
}
