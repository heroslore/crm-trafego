// Todos os indicadores do sistema são calculados aqui a partir de campaign_metrics, sales e leads.
import { db } from "./db.js?v=0f43faaa";
import { dentro, dias as diasDe, anterior } from "./periods.js?v=0f43faaa";
import { num, variacao, somaDias, hoje, diasEntre } from "./format.js?v=0f43faaa";

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
// Vendas canceladas ou devolvidas não contam como faturamento.
export const vendaVale = (s) => !["cancelada", "devolvida"].includes(s.status || "confirmada");
export const TAXAS_PADRAO = { pix: 0, dinheiro: 0, cartao: 4.5, boleto: 2, crediario: 0, outro: 0 };
export function taxaPagamento(s) {
  if (s.payment_fee != null && s.payment_fee !== "") return num(s.payment_fee);
  const cfg = db.settings().taxas || {};
  const pct = cfg[s.payment || "outro"] != null ? num(cfg[s.payment || "outro"]) : (TAXAS_PADRAO[s.payment] || 0);
  return (num(s.value) - num(s.discount)) * pct / 100;
}
export function liquidoDaVenda(s) {
  const bruto = num(s.value), desconto = num(s.discount);
  const receita = bruto - desconto;
  const taxas = taxaPagamento(s) + num(s.platform_fee);
  const frete = num(s.shipping_cost);
  const mercadoria = custoDaVenda(s);
  return { bruto, desconto, receita, taxas, frete, mercadoria, lucro: receita - mercadoria - taxas - frete };
}

// ---------------------------------------------------------------- agregação
export function agregar({ metricas = [], vendas = [], leads = [], extras = [] }) {
  const k = { spend: 0, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, results: 0, freqS: 0, freqN: 0, sales: 0, quantity: 0, gross_sales: 0, discount: 0, revenue: 0, cost: 0, fees: 0, shipping: 0, canceled: 0, canceled_value: 0, leads: 0, qualified: 0, extra_costs: 0, video_3s: 0, thruplay: 0, video_p25: 0, video_p50: 0, video_p75: 0, video_p95: 0, video_p100: 0, video_plays: 0, video_2s: 0, outbound_clicks: 0, landing_page_views: 0, conversations: 0, watchS: 0, watchN: 0, dias: new Set() };
  for (const m of metricas) {
    k.spend += num(m.spend); k.impressions += num(m.impressions); k.reach += num(m.reach); k.clicks += num(m.clicks); k.link_clicks += num(m.link_clicks); k.results += num(m.results);
    k.video_3s += num(m.video_3s); k.thruplay += num(m.thruplay); k.video_p25 += num(m.video_p25); k.video_p50 += num(m.video_p50); k.video_p75 += num(m.video_p75); k.video_p95 += num(m.video_p95);
    k.video_p100 += num(m.video_p100); k.video_plays += num(m.video_plays); k.video_2s += num(m.video_2s);
    k.outbound_clicks += num(m.outbound_clicks); k.landing_page_views += num(m.landing_page_views); k.conversations += num(m.conversations);
    // Tempo médio assistido é média, não soma: pondera pelas reproduções do dia (ou impressões, na falta delas).
    if (m.avg_watch) { const peso = num(m.video_plays) || num(m.impressions) || 1; k.watchS += num(m.avg_watch) * peso; k.watchN += peso; }
    if (m.frequency && m.impressions) { k.freqS += num(m.frequency) * num(m.impressions); k.freqN += num(m.impressions); }
    k.dias.add(m.date);
  }
  for (const s of vendas) {
    if (!vendaVale(s)) { k.canceled++; k.canceled_value += num(s.value); continue; }
    const v = liquidoDaVenda(s);
    k.sales++; k.quantity += num(s.quantity) || 1;
    k.gross_sales += v.bruto; k.discount += v.desconto; k.revenue += v.receita; k.cost += v.mercadoria; k.fees += v.taxas; k.shipping += v.frete;
  }
  for (const r of extras) k.extra_costs += num(r.value);
  k.leads = leads.length;
  k.qualified = leads.filter((l) => l.qualified === "sim").length;
  k.dias = k.dias.size;
  k.frequency = k.freqN ? k.freqS / k.freqN : null;
  // Lucro bruto = o que entrou menos mercadoria, taxas e frete pagos pela loja.
  k.gross_profit = k.revenue - k.cost - k.fees - k.shipping;
  k.net_profit = k.gross_profit - k.spend - k.extra_costs;
  k.roas = k.spend > 0 ? k.revenue / k.spend : null;
  k.roi = k.spend > 0 ? (k.gross_profit - k.spend) / k.spend : null;
  k.leads_base = k.leads || k.results;              // CRM primeiro; senão resultados da plataforma
  k.cpl = k.spend > 0 && k.leads_base > 0 ? k.spend / k.leads_base : null;
  k.cpl_plataforma = k.spend > 0 && k.results > 0 ? k.spend / k.results : null;
  k.cpl_qualificado = k.spend > 0 && k.qualified > 0 ? k.spend / k.qualified : null;
  k.taxa_qualificacao = k.leads > 0 ? k.qualified / k.leads : null;
  k.cpa = k.spend > 0 && k.sales > 0 ? k.spend / k.sales : null;
  k.ticket = k.sales ? k.revenue / k.sales : null;
  k.conversion = k.leads_base > 0 ? k.sales / k.leads_base : null;
  const cliquesBase = k.link_clicks || k.clicks;
  k.ctr = k.impressions > 0 ? cliquesBase / k.impressions : null;
  k.cpc = cliquesBase > 0 ? k.spend / cliquesBase : null;
  k.cpm = k.impressions > 0 ? k.spend / k.impressions * 1000 : null;
  k.margin = k.revenue > 0 ? k.gross_profit / k.revenue : null;
  k.ticket_liquido = k.sales ? k.gross_profit / k.sales : null;
  k.lucro_por_lead = k.leads_base > 0 ? k.net_profit / k.leads_base : null;
  // vídeo
  k.hook_rate = k.impressions > 0 && k.video_3s ? k.video_3s / k.impressions : null;
  k.thruplay_rate = k.video_3s > 0 && k.thruplay ? k.thruplay / k.video_3s : null;
  k.custo_thruplay = k.thruplay > 0 ? k.spend / k.thruplay : null;
  k.custo_video_3s = k.video_3s > 0 ? k.spend / k.video_3s : null;
  k.retencao_50 = k.video_3s > 0 && k.video_p50 ? k.video_p50 / k.video_3s : null;
  k.retencao_95 = k.video_3s > 0 && k.video_p95 ? k.video_p95 / k.video_3s : null;
  k.tem_video = !!(k.video_3s || k.thruplay || k.video_p25 || k.video_plays);
  k.avg_watch = k.watchN ? k.watchS / k.watchN : null;
  k.retencao_100 = k.video_3s > 0 && k.video_p100 ? k.video_p100 / k.video_3s : null;
  k.taxa_reproducao = k.impressions > 0 && k.video_plays ? k.video_plays / k.impressions : null;
  k.custo_conversa = k.spend > 0 && k.conversations > 0 ? k.spend / k.conversations : null;
  k.taxa_pagina = k.landing_page_views && (k.outbound_clicks || k.link_clicks) ? k.landing_page_views / (k.outbound_clicks || k.link_clicks) : null;
  delete k.freqS; delete k.freqN; delete k.watchS; delete k.watchN;
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

// ---------------------------------------------------------------- atendimento (SLA)
// Momento em que o lead chegou de verdade. Quando o lead foi lançado à mão sobre
// um dia anterior, não dá para medir tempo de resposta: devolvemos null.
export function chegadaDoLead(l) {
  if (l.arrived_at) return l.arrived_at;
  const criado = l.created_at || "";
  if (!criado) return null;
  if (l.entered_at && l.entered_at < criado.slice(0, 10)) return null;
  return criado;
}
export function minutosAteAtendimento(l) {
  const a = chegadaDoLead(l); if (!a || !l.first_contact_at) return null;
  const m = (new Date(l.first_contact_at) - new Date(a)) / 60000;
  return isFinite(m) && m >= 0 ? m : null;
}
export function minutosEsperando(l) {
  const a = chegadaDoLead(l); if (!a || l.first_contact_at) return null;
  const m = (Date.now() - new Date(a)) / 60000;
  return isFinite(m) && m >= 0 ? m : null;
}
const RESPONDEU = new Set(["respondeu", "interessado", "negociacao", "aguardando_pagamento", "venda", "followup"]);
export function atendimento(iv, filtro = null) {
  const leads = leadsNoPeriodo(iv, filtro);
  const sla = db.goal("sla_minutos", 15);
  const atendidos = leads.filter((l) => l.first_contact_at);
  const tempos = atendidos.map(minutosAteAtendimento).filter((m) => m != null).sort((a, b) => a - b);
  const naoAtendidos = leads.filter((l) => !l.first_contact_at);
  const faixa = (max) => tempos.filter((m) => m <= max).length;
  const responderam = leads.filter((l) => l.first_reply_at || RESPONDEU.has(l.stage)).length;
  const qualificados = leads.filter((l) => l.qualified === "sim").length;
  const negociaram = leads.filter((l) => ["negociacao", "aguardando_pagamento", "venda"].includes(l.stage)).length;
  const compraram = leads.filter((l) => l.stage === "venda").length;
  return {
    total: leads.length, atendidos: atendidos.length, naoAtendidos: naoAtendidos.length,
    medidos: tempos.length,
    tempoMedio: tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null,
    mediana: tempos.length ? tempos[Math.floor(tempos.length / 2)] : null,
    ate5: faixa(5), ate15: faixa(15), ate60: faixa(60), acima60: tempos.filter((m) => m > 60).length,
    sla, dentroSla: tempos.filter((m) => m <= sla).length, foraSla: tempos.filter((m) => m > sla).length,
    taxaContato: leads.length ? atendidos.length / leads.length : null,
    responderam, taxaResposta: atendidos.length ? responderam / atendidos.length : null,
    qualificados, taxaQualificacao: leads.length ? qualificados / leads.length : null,
    negociaram, compraram, taxaFechamento: leads.length ? compraram / leads.length : null,
    leads,
  };
}
// Fila do que está esperando agora (não depende do período).
export function filaDeAtendimento() {
  const sla = db.goal("sla_minutos", 15), h = hoje();
  const esperando = db.where("leads", (l) => !l.first_contact_at && !["venda", "perdido"].includes(l.stage))
    .map((l) => ({ lead: l, minutos: minutosEsperando(l) }))
    .sort((a, b) => (b.minutos || 0) - (a.minutos || 0));
  const followups = db.where("leads", (l) => l.next_followup && l.next_followup <= h && !["venda", "perdido"].includes(l.stage))
    .sort((a, b) => (a.next_followup || "").localeCompare(b.next_followup || ""));
  return { esperando, foraSla: esperando.filter((x) => x.minutos != null && x.minutos > sla), followups, sla };
}

// ---------------------------------------------------------------- pacing de orçamento
export function pacing(iv, filtro = null, metaValor = null) {
  const k = kpis(iv, filtro);
  const hojeStr = hoje();
  const fim = iv.fim, inicio = iv.inicio;
  const totalDias = diasEntre(inicio, fim) + 1;
  const decorridos = Math.min(totalDias, Math.max(1, diasEntre(inicio, hojeStr < fim ? hojeStr : fim) + 1));
  const meta = metaValor != null ? metaValor : db.goal("investimento_max_mes", 0);
  const esperado = meta ? meta * decorridos / totalDias : null;
  const porDia = k.spend / decorridos;
  const projecao = porDia * totalDias;
  return {
    meta, gasto: k.spend, esperado, projecao, porDia, decorridos, totalDias,
    ritmo: esperado ? k.spend / esperado : null,
    sobra: meta ? meta - k.spend : null,
    diarioSugerido: meta && totalDias > decorridos ? Math.max(0, (meta - k.spend) / (totalDias - decorridos)) : null,
  };
}

// ---------------------------------------------------------------- efeito de uma decisão
// Compara os dias anteriores e posteriores a uma mudança na campanha.
export function efeitoDecisao(campaignId, quando, dias = 7) {
  const dia = String(quando || "").slice(0, 10); if (!dia) return null;
  const h = hoje();
  const antes = { inicio: somaDias(dia, -dias), fim: somaDias(dia, -1), dias };
  const fimDepois = somaDias(dia, dias - 1) > h ? h : somaDias(dia, dias - 1);
  const depois = { inicio: dia, fim: fimDepois, dias: diasEntre(dia, fimDepois) + 1 };
  const a = kpis(antes, { campaign_id: campaignId }), d = kpis(depois, { campaign_id: campaignId });
  const porDia = (k, iv) => ({ spend: k.spend / Math.max(1, iv.dias), sales: k.sales / Math.max(1, iv.dias), leads: k.leads_base / Math.max(1, iv.dias), revenue: k.revenue / Math.max(1, iv.dias) });
  return { antes, depois, a, d, mediaAntes: porDia(a, antes), mediaDepois: porDia(d, depois), completo: diasEntre(dia, h) >= dias };
}

// ---------------------------------------------------------------- clientes e LTV
export function clientes() {
  const porChaveCliente = new Map();
  const chave = (s) => {
    const l = s.lead_id && db.get("leads", s.lead_id);
    if (l) return "lead:" + l.id;
    return "venda:" + s.id;
  };
  for (const s of db.all("sales")) {
    if (!vendaVale(s)) continue;
    const k = chave(s);
    const c = porChaveCliente.get(k) || { id: k, lead: s.lead_id ? db.get("leads", s.lead_id) : null, vendas: [], total: 0, lucro: 0, quantidade: 0 };
    const v = liquidoDaVenda(s);
    c.vendas.push(s); c.total += v.receita; c.lucro += v.lucro; c.quantidade += num(s.quantity) || 1;
    porChaveCliente.set(k, c);
  }
  return [...porChaveCliente.values()].map((c) => {
    const datas = c.vendas.map((s) => s.date).sort();
    const produtos = {};
    for (const s of c.vendas) { const p = s.product_id; if (p) produtos[p] = (produtos[p] || 0) + (num(s.quantity) || 1); }
    const favorito = Object.keys(produtos).sort((a, b) => produtos[b] - produtos[a])[0] || "";
    const primeira = c.vendas.slice().sort((a, b) => a.date.localeCompare(b.date))[0];
    return {
      ...c,
      nome: (c.lead && c.lead.name) || "Cliente sem lead",
      telefone: (c.lead && (c.lead.whatsapp || c.lead.phone)) || "",
      compras: c.vendas.length, ticket: c.vendas.length ? c.total / c.vendas.length : 0,
      primeira_compra: datas[0], ultima_compra: datas[datas.length - 1],
      produto_favorito: favorito,
      campanha_origem: (c.lead && c.lead.campaign_id) || (primeira && primeira.campaign_id) || "",
      origem: (c.lead && c.lead.source) || (primeira && primeira.source) || "",
      recompra: c.vendas.length > 1,
    };
  }).sort((a, b) => b.total - a.total);
}
// LTV por campanha de primeira aquisição: mostra campanha cara na 1ª venda que compensa depois.
export function ltvPorCampanha() {
  const m = {};
  for (const c of clientes()) {
    const k = c.campanha_origem || "";
    const g = m[k] = m[k] || { campaign_id: k, clientes: 0, compras: 0, total: 0, lucro: 0, recompras: 0 };
    g.clientes++; g.compras += c.compras; g.total += c.total; g.lucro += c.lucro; if (c.recompra) g.recompras++;
  }
  return Object.values(m).map((g) => ({
    ...g, ltv: g.clientes ? g.total / g.clientes : 0, lucro_medio: g.clientes ? g.lucro / g.clientes : 0,
    compras_por_cliente: g.clientes ? g.compras / g.clientes : 0, taxa_recompra: g.clientes ? g.recompras / g.clientes : 0,
    nome: (db.get("campaigns", g.campaign_id) || {}).name || "Sem campanha",
  })).sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------- metas e avaliação
export const METRICAS_ROTULOS = {
  spend: "Investimento", revenue: "Faturamento", gross_sales: "Vendas brutas", discount: "Descontos", fees: "Taxas", shipping: "Frete", cost: "Custo dos produtos",
  gross_profit: "Lucro bruto", net_profit: "Lucro após anúncios", roas: "ROAS", roi: "ROI", leads: "Leads", qualified: "Leads qualificados", sales: "Vendas", canceled: "Vendas canceladas",
  conversion: "Conversão", taxa_qualificacao: "Taxa de qualificação", cpl: "CPL", cpl_qualificado: "CPL qualificado", cpa: "CPA", ticket: "Ticket médio", ticket_liquido: "Lucro por venda",
  lucro_por_lead: "Lucro por lead", ctr: "CTR", cpc: "CPC", cpm: "CPM", impressions: "Impressões", reach: "Alcance", link_clicks: "Cliques", results: "Resultados",
  conversations: "Conversas iniciadas", custo_conversa: "Custo por conversa", outbound_clicks: "Cliques de saída", landing_page_views: "Visitas à página", taxa_pagina: "Cliques que chegaram na página",
  video_plays: "Reproduções", avg_watch: "Tempo médio assistido", retencao_100: "Assistiram até o fim", taxa_reproducao: "Reproduções por impressão",
  video_3s: "Visualizações 3s", thruplay: "ThruPlay", custo_thruplay: "Custo por ThruPlay", hook_rate: "Retenção inicial (3s)", thruplay_rate: "Chegaram ao ThruPlay", retencao_50: "Assistiram 50%", retencao_95: "Assistiram 95%",
};
export const MENOR_MELHOR = new Set(["cpl", "cpl_qualificado", "cpa", "cpc", "cpm", "spend", "cost", "extra_costs", "fees", "discount", "shipping", "canceled", "custo_thruplay", "custo_video_3s", "custo_conversa"]);

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
