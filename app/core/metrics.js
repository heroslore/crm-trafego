// Todos os indicadores do sistema são calculados aqui a partir de campaign_metrics, sales e leads.
import { db } from "./db.js?v=c59cb573";
import { dentro, dias as diasDe, anterior } from "./periods.js?v=c59cb573";
import { num, variacao, somaDias, hoje } from "./format.js?v=c59cb573";

// ---------------------------------------------------------------- filtros
// filtro: { campaign_id, ad_set_id, ad_id, creative_id, product_id, audience_id, seller_user_id, platform, lojaFn }
function campanhasDoFiltro(filtro) {
  if (!filtro) return null;
  let camps = null;
  if (filtro.product_id) camps = db.where("campaigns", (c) => c.product_id === filtro.product_id);
  if (filtro.platform) camps = (camps || db.all("campaigns")).filter((c) => plataformaBase(c.platform) === plataformaBase(filtro.platform));
  if (filtro.audience_id) { const sets = db.where("ad_sets", (s) => s.audience_id === filtro.audience_id).map((s) => s.campaign_id); camps = (camps || db.all("campaigns")).filter((c) => c.audience_id === filtro.audience_id || sets.includes(c.id)); }
  return camps ? new Set(camps.map((c) => c.id)) : null;
}
export function plataformaBase(p) { return (p === "instagram" || p === "facebook") ? "meta" : (p || "outra"); }

function bateMetrica(m, filtro, setCamp) {
  if (!filtro) return true;
  if (filtro.campaign_id && m.campaign_id !== filtro.campaign_id) return false;
  if (filtro.ad_set_id && m.ad_set_id !== filtro.ad_set_id) return false;
  if (filtro.ad_id && m.ad_id !== filtro.ad_id) return false;
  if (filtro.creative_id && m.creative_id !== filtro.creative_id) return false;
  if (filtro.seller_user_id) return false; // investimento não é atribuível a vendedor
  if (setCamp && !setCamp.has(m.campaign_id)) return false;
  return true;
}
function bateVenda(s, filtro, setCamp) {
  if (!filtro) return true;
  if (filtro.campaign_id && s.campaign_id !== filtro.campaign_id) return false;
  if (filtro.ad_set_id && s.ad_set_id !== filtro.ad_set_id) return false;
  if (filtro.ad_id && s.ad_id !== filtro.ad_id) return false;
  if (filtro.creative_id && s.creative_id !== filtro.creative_id) return false;
  if (filtro.product_id && s.product_id !== filtro.product_id) return false;
  if (filtro.seller_user_id && s.seller_user_id !== filtro.seller_user_id) return false;
  if (filtro.audience_id && setCamp && !setCamp.has(s.campaign_id)) return false;
  if (filtro.platform && !(setCamp && setCamp.has(s.campaign_id)) && plataformaBase(s.source) !== plataformaBase(filtro.platform)) return false;
  return true;
}
function bateLead(l, filtro, setCamp) {
  if (!filtro) return true;
  if (filtro.campaign_id && l.campaign_id !== filtro.campaign_id) return false;
  if (filtro.ad_set_id) { const ad = l.ad_id && db.get("ads", l.ad_id); if (!ad || ad.ad_set_id !== filtro.ad_set_id) return false; }
  if (filtro.ad_id && l.ad_id !== filtro.ad_id) return false;
  if (filtro.creative_id && l.creative_id !== filtro.creative_id) return false;
  if (filtro.product_id && l.product_id !== filtro.product_id) return false;
  if (filtro.seller_user_id && l.owner_user_id !== filtro.seller_user_id) return false;
  if (filtro.audience_id && setCamp && !setCamp.has(l.campaign_id)) return false;
  if (filtro.platform && !(setCamp && setCamp.has(l.campaign_id)) && plataformaBase(l.source) !== plataformaBase(filtro.platform)) return false;
  return true;
}

export function metricasNoPeriodo(iv, filtro) { const set = campanhasDoFiltro(filtro); return db.where("campaign_metrics", (m) => dentro(m.date, iv) && bateMetrica(m, filtro, set)); }
export function vendasNoPeriodo(iv, filtro) { const set = campanhasDoFiltro(filtro); return db.where("sales", (s) => dentro(s.date, iv) && bateVenda(s, filtro, set)); }
export function leadsNoPeriodo(iv, filtro) { const set = campanhasDoFiltro(filtro); return db.where("leads", (l) => dentro(l.entered_at, iv) && bateLead(l, filtro, set)); }
export function custosExtrasNoPeriodo(iv) { return db.where("financial_records", (r) => dentro(r.date, iv)); }

export function custoDaVenda(s) {
  if (s.product_cost != null && s.product_cost !== "") return num(s.product_cost);
  const p = db.get("products", s.product_id); return p ? num(p.cost) * (num(s.quantity) || 1) : 0;
}

// ---------------------------------------------------------------- agregação
export function agregar({ metricas = [], vendas = [], leads = [], extras = [] }) {
  const k = { spend: 0, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, results: 0, freqS: 0, freqN: 0, sales: 0, quantity: 0, revenue: 0, cost: 0, leads: 0, extra_costs: 0, dias: new Set() };
  for (const m of metricas) { k.spend += num(m.spend); k.impressions += num(m.impressions); k.reach += num(m.reach); k.clicks += num(m.clicks); k.link_clicks += num(m.link_clicks); k.results += num(m.results); if (m.frequency && m.impressions) { k.freqS += num(m.frequency) * num(m.impressions); k.freqN += num(m.impressions); } k.dias.add(m.date); }
  for (const s of vendas) { k.sales++; k.quantity += num(s.quantity) || 1; k.revenue += num(s.value); k.cost += custoDaVenda(s); }
  for (const r of extras) k.extra_costs += num(r.value);
  k.leads = leads.length;
  k.dias = k.dias.size;
  k.frequency = k.freqN ? k.freqS / k.freqN : null;
  k.gross_profit = k.revenue - k.cost;
  k.net_profit = k.gross_profit - k.spend - k.extra_costs;
  k.roas = k.spend > 0 ? k.revenue / k.spend : null;
  k.roi = k.spend > 0 ? (k.gross_profit - k.spend) / k.spend : null;
  k.leads_base = k.leads || k.results;              // CRM primeiro; senão resultados da plataforma
  k.cpl = k.spend > 0 && k.leads_base > 0 ? k.spend / k.leads_base : null;
  k.cpl_plataforma = k.spend > 0 && k.results > 0 ? k.spend / k.results : null;
  k.cpa = k.spend > 0 && k.sales > 0 ? k.spend / k.sales : null;
  k.ticket = k.sales ? k.revenue / k.sales : null;
  k.conversion = k.leads_base > 0 ? k.sales / k.leads_base : null;
  const cliquesBase = k.link_clicks || k.clicks;
  k.ctr = k.impressions > 0 ? cliquesBase / k.impressions : null;
  k.cpc = cliquesBase > 0 ? k.spend / cliquesBase : null;
  k.cpm = k.impressions > 0 ? k.spend / k.impressions * 1000 : null;
  k.margin = k.revenue > 0 ? k.gross_profit / k.revenue : null;
  delete k.freqS; delete k.freqN;
  return k;
}

export function kpis(iv, filtro = null) {
  return agregar({ metricas: metricasNoPeriodo(iv, filtro), vendas: vendasNoPeriodo(iv, filtro), leads: leadsNoPeriodo(iv, filtro), extras: filtro ? [] : custosExtrasNoPeriodo(iv) });
}

export function comparar(iv, filtro = null) {
  const atual = kpis(iv, filtro), ant = kpis(anterior(iv), filtro), var_ = {};
  for (const k of Object.keys(atual)) if (typeof atual[k] === "number" || atual[k] === null) var_[k] = variacao(atual[k], ant[k]);
  return { atual, anterior: ant, variacao: var_ };
}

export function contagensAtivas() {
  const camps = db.where("campaigns", (c) => c.status === "ativa");
  const set = new Set(camps.map((c) => c.id));
  const ads = db.where("ads", (a) => a.status === "ativa" && set.has(a.campaign_id));
  return { campanhas_ativas: camps.length, anuncios_ativos: ads.length };
}

// ---------------------------------------------------------------- séries
export function serieDiaria(iv, filtro = null) {
  const metricas = metricasNoPeriodo(iv, filtro), vendas = vendasNoPeriodo(iv, filtro), leads = leadsNoPeriodo(iv, filtro);
  const porDia = {};
  for (const d of diasDe(iv)) porDia[d] = { metricas: [], vendas: [], leads: [] };
  for (const m of metricas) porDia[m.date.slice(0, 10)]?.metricas.push(m);
  for (const s of vendas) porDia[s.date.slice(0, 10)]?.vendas.push(s);
  for (const l of leads) porDia[l.entered_at.slice(0, 10)]?.leads.push(l);
  return Object.keys(porDia).sort().map((d) => ({ date: d, ...agregar(porDia[d]) }));
}

// ---------------------------------------------------------------- por entidade
const ENTIDADES = {
  campaign: { tabela: "campaigns", chave: "campaign_id" },
  ad_set: { tabela: "ad_sets", chave: "ad_set_id" },
  ad: { tabela: "ads", chave: "ad_id" },
  creative: { tabela: "creatives", chave: "creative_id" },
  product: { tabela: "products", chave: "product_id" },
  audience: { tabela: "audiences", chave: "audience_id" },
  seller: { tabela: "users", chave: "seller_user_id" },
};
export function porEntidade(iv, tipo, apenasComDados = true) {
  if (tipo === "platform") {
    const plats = ["meta", "google", "tiktok", "outra"];
    return plats.map((p) => ({ id: p, nome: { meta: "Meta (Instagram/Facebook)", google: "Google", tiktok: "TikTok", outra: "Outros" }[p], k: kpis(iv, { platform: p }) })).filter((x) => !apenasComDados || x.k.spend || x.k.sales || x.k.leads);
  }
  const e = ENTIDADES[tipo];
  const registros = tipo === "seller" ? db.where("users", (u) => u.role === "vendedor" || u.role === "admin" || db.all("sales").some((s) => s.seller_user_id === u.id)) : db.all(e.tabela);
  return registros.map((r) => ({ id: r.id, nome: r.name, registro: r, k: kpis(iv, { [e.chave]: r.id }) })).filter((x) => !apenasComDados || x.k.spend || x.k.sales || x.k.leads || x.k.impressions);
}

// ---------------------------------------------------------------- produtos
export function resumoProduto(p) {
  const h = hoje();
  const janela = (n) => ({ inicio: somaDias(h, -(n - 1)), fim: h, dias: n });
  const v7 = vendasNoPeriodo(janela(7), { product_id: p.id }), v30 = vendasNoPeriodo(janela(30), { product_id: p.id });
  const v7ant = db.where("sales", (s) => s.product_id === p.id && s.date >= somaDias(h, -13) && s.date <= somaDias(h, -7));
  const todas = db.where("sales", (s) => s.product_id === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const q = (arr) => arr.reduce((t, s) => t + (num(s.quantity) || 1), 0);
  const rev = (arr) => arr.reduce((t, s) => t + num(s.value), 0);
  const lucro = (arr) => arr.reduce((t, s) => t + num(s.value) - custoDaVenda(s), 0);
  const camps = db.where("campaigns", (c) => c.product_id === p.id);
  const ativas = camps.filter((c) => c.status === "ativa");
  const k30 = kpis(janela(30), { product_id: p.id });
  const ultima = todas[0] ? todas[0].date : null;
  return {
    qtd7: q(v7), qtd30: q(v30), qtd7ant: q(v7ant), fat30: rev(v30), lucro30: lucro(v30), fat_total: rev(todas), lucro_total: lucro(todas),
    campanhas: camps.length, campanhas_ativas: ativas.length, spend30: k30.spend, roas30: k30.roas,
    margem: num(p.price) > 0 ? (num(p.price) - num(p.cost)) / num(p.price) : null,
    ultima_venda: ultima, dias_sem_venda: ultima ? Math.round((new Date(h + "T12:00Z") - new Date(ultima + "T12:00Z")) / 86400000) : null,
    estoque_dias: q(v30) > 0 ? num(p.stock) / (q(v30) / 30) : null,
  };
}

// ---------------------------------------------------------------- metas e avaliação
export const METRICAS_ROTULOS = {
  spend: "Investimento", revenue: "Faturamento", gross_profit: "Lucro bruto", net_profit: "Lucro após anúncios", roas: "ROAS", roi: "ROI", leads: "Leads", sales: "Vendas",
  conversion: "Conversão", cpl: "CPL", cpa: "CPA", ticket: "Ticket médio", ctr: "CTR", cpc: "CPC", cpm: "CPM", impressions: "Impressões", reach: "Alcance", link_clicks: "Cliques", results: "Resultados",
};
export const MENOR_MELHOR = new Set(["cpl", "cpa", "cpc", "cpm", "spend", "cost", "extra_costs"]);

// Avalia um valor contra a meta configurada. Retorna null se não houver meta.
export function avaliar(metrica, valor) {
  if (valor == null || !isFinite(valor)) return null;
  const metaDe = { roas: ["roas_min", false], cpa: ["cpa_max", true], cpl: ["cpl_max", true], ctr: ["ctr_min", false, 100], ticket: ["ticket_medio", false] }[metrica];
  if (!metaDe) return null;
  const meta = db.goal(metaDe[0], 0); if (!meta) return null;
  const v = metaDe[2] ? valor * metaDe[2] : valor;
  const razao = metaDe[1] ? meta / v : v / meta; // >1 é bom
  const nivel = razao >= 1.4 ? "excelente" : razao >= 1 ? "bom" : razao >= 0.7 ? "atencao" : "ruim";
  return { nivel, rotulo: { excelente: "Excelente", bom: "Bom", atencao: "Atenção", ruim: "Ruim" }[nivel], meta, razao };
}

export function progressoMetas(ivMes, ivSemana) {
  const m = kpis(ivMes), s = kpis(ivSemana);
  const itens = [
    ["faturamento_mes", "Faturamento do mês", m.revenue, "money"], ["faturamento_semana", "Faturamento da semana", s.revenue, "money"],
    ["vendas_mes", "Vendas no mês", m.sales, "int"], ["leads_mes", "Leads no mês", m.leads, "int"],
    ["investimento_max_mes", "Investimento no mês (limite)", m.spend, "money", true],
    ["roas_min", "ROAS do mês (mínimo)", m.roas, "mult"], ["cpa_max", "CPA do mês (máximo)", m.cpa, "money", true], ["cpl_max", "CPL do mês (máximo)", m.cpl, "money", true], ["ticket_medio", "Ticket médio do mês", m.ticket, "money"],
  ];
  return itens.map(([key, rotulo, realizado, tipo, limite]) => ({ key, rotulo, realizado, tipo, limite: !!limite, meta: db.goal(key, 0) })).filter((x) => x.meta > 0);
}

// ---------------------------------------------------------------- médias para comparação
export function mediaCampanhas(iv) {
  const lista = porEntidade(iv, "campaign").map((x) => x.k).filter((k) => k.spend > 0);
  const media = (f) => { const v = lista.map(f).filter((x) => x != null && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  return { n: lista.length, cpa: media((k) => k.cpa), cpl: media((k) => k.cpl), ctr: media((k) => k.ctr), roas: media((k) => k.roas), cpc: media((k) => k.cpc) };
}
