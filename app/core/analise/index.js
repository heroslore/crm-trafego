// Orquestrador da Análise Inteligente. Único arquivo desta pasta que conhece o banco.
// O caminho é sempre o mesmo, na ordem:
//   DADOS BRUTOS → MÉTRICAS CALCULADAS → BENCHMARKS → REGRAS → SCORE → RECOMENDAÇÕES → (interface)
// Nada aqui altera dados: a análise só lê.
import { db } from "../db.js?v=e40367ec";
import { kpis, serieDiaria, porEntidade, atendimento, plataformaBase } from "../metrics.js?v=e40367ec";
import { anterior } from "../periods.js?v=e40367ec";
import { META } from "../sync.js?v=e40367ec";
import { num, hoje, somaDias, diasEntre, pct, brl, inteiro, dec } from "../format.js?v=e40367ec";
import { metricasCalculadas, contagemOuNulo, numeroOuNulo, razao } from "./metricas.js?v=e40367ec";
import { construirBenchmarks, mesclarReferencia, MENOR_MELHOR } from "./benchmarks.js?v=e40367ec";
import { confianca, MINIMOS } from "./confianca.js?v=e40367ec";
import { cartoesEtapa, diagnosticos, saudePublico, fadiga } from "./regras.js?v=e40367ec";
import { pontuar } from "./score.js?v=e40367ec";
import { plano, gargalos, pontosFortes, resumo10s } from "./recomendacoes.js?v=e40367ec";

export const CHAVES_BENCH = ["ctr", "cpc", "cpm", "frequencia", "cpl", "custo_conversa", "cpa", "roas", "conversao", "taxa_lead", "taxa_pagina", "margem", "retencao_inicial", "retencao_metade", "retencao_fim", "taxa_thruplay"];
const NIVEIS_FILTRO = { campanha: "campaign_id", conjunto: "ad_set_id", anuncio: "ad_id", criativo: "creative_id" };
const TIPO_ENTIDADE = { campanha: "campaign", conjunto: "ad_set", anuncio: "ad", criativo: "creative" };

// Converte o agregado do CRM no bruto que o motor entende.
// Regra: contador de plataforma em zero é "não informado" (null); leads e vendas do CRM em zero
// são zero de verdade, mas o zero nunca entra como denominador.
//
// usarVendas = false significa "as vendas deste escopo não são lançadas no CRM". Nesse caso
// faturamento, CPA, ROAS e lucro saem como indisponíveis em vez de zero — porque zero venda
// registrada não é o mesmo que zero venda acontecida, e a diferença entre as duas coisas muda
// completamente o diagnóstico de um anúncio.
export function brutoDe(k, usarVendas = true) {
  if (!usarVendas) {
    return {
      ...brutoDe(k, true),
      sales: null, revenue: null, gross_profit: null, net_profit: null,
    };
  }
  return {
    spend: numeroOuNulo(k.spend), impressions: contagemOuNulo(k.impressions), reach: contagemOuNulo(k.reach),
    frequency: numeroOuNulo(k.frequency), clicks: contagemOuNulo(k.clicks), link_clicks: contagemOuNulo(k.link_clicks),
    outbound_clicks: contagemOuNulo(k.outbound_clicks), landing_page_views: contagemOuNulo(k.landing_page_views),
    conversations: contagemOuNulo(k.conversations), results: contagemOuNulo(k.results),
    leads: k.leads > 0 ? k.leads : null, qualified: k.qualified > 0 ? k.qualified : null,
    sales: num(k.sales), revenue: k.sales > 0 ? k.revenue : null,
    gross_profit: k.sales > 0 ? k.gross_profit : null, net_profit: numeroOuNulo(k.net_profit),
  };
}
export function videoDe(k, duracao = null) {
  return {
    plays: contagemOuNulo(k.video_plays), v2s: contagemOuNulo(k.video_2s), v3s: contagemOuNulo(k.video_3s),
    p25: contagemOuNulo(k.video_p25), p50: contagemOuNulo(k.video_p50), p75: contagemOuNulo(k.video_p75),
    p95: contagemOuNulo(k.video_p95), p100: contagemOuNulo(k.video_p100),
    thruplay: contagemOuNulo(k.thruplay), avg_watch: numeroOuNulo(k.avg_watch), duracao: numeroOuNulo(duracao),
  };
}
// Valores achatados (chave → número) de um escopo, para montar distribuições de benchmark.
function valoresAnalise(k, usarVendas = true) {
  const m = metricasCalculadas(brutoDe(k, usarVendas), videoDe(k));
  const out = {};
  for (const mt of m.lista) out[mt.chave] = mt.valor;
  for (const mt of m.video.lista) out[mt.chave] = mt.valor;
  return out;
}

// ---------------------------------------------------------------- base de comparação
// Nível 1: histórico da própria conta. Nível 2: escopos parecidos. Nível 3: referência editável.
//
// Levantar as entidades da conta é a parte cara (passa por todas as métricas de 90 dias),
// então ela roda UMA vez e é reaproveitada quando a tela analisa uma lista inteira.
export function entidadesDoNivel(nivel, ivRef, modoVendas = "auto") {
  const tipo = TIPO_ENTIDADE[nivel] || "campaign";
  return porEntidade(ivRef, tipo, true)
    .filter((x) => x.k.spend > 0 && x.k.impressions > 200)
    .map((x) => ({ id: x.id, registro: x.registro, valores: valoresAnalise(x.k, consideraVendas(modoVendas, x.k).usar) }));
}

// Como a análise trata as vendas, escolhido em Configurações → Análise.
//
// "parcial" é o padrão e existe porque na vida real a venda acontece no WhatsApp e nem sempre
// dá tempo de lançar. Registro parcial tem uma consequência matemática: o faturamento lançado
// é um PISO (o mínimo confirmado), enquanto a taxa de conversão e o CPA ficam distorcidos —
// poucas vendas registradas empurram a taxa para baixo e o CPA para cima. Por isso, no modo
// parcial, faturamento e ROAS entram como piso e as taxas de venda não entram na nota.
// Sem isso, lançar a primeira venda pioraria a nota do anúncio, que é o oposto do certo.
export const MODOS_VENDA = [
  ["parcial", "Nem toda venda é lançada (recomendado)"],
  ["completo", "Toda venda é lançada no CRM"],
  ["nunca", "Não usar vendas na análise"],
];
export const MODO_VENDA_PADRAO = "parcial";
export function normalizarModoVenda(modo) {
  if (modo === "sempre") return "completo";      // nomes antigos
  if (modo === "auto") return "parcial";
  return ["parcial", "completo", "nunca"].includes(modo) ? modo : MODO_VENDA_PADRAO;
}
// usar    — faturamento, ROAS e lucro existem para este escopo
// parcial — existem, mas como piso: taxas de venda e CPA ficam fora da nota
export function consideraVendas(modo, k) {
  const m = normalizarModoVenda(modo);
  const temVenda = num(k && k.sales) > 0;
  if (m === "nunca") return { usar: false, parcial: false };
  if (m === "completo") return { usar: true, parcial: false };
  return { usar: temVenda, parcial: temVenda };
}
function amostrasDe(nivel, registro, todos) {
  const tipo = TIPO_ENTIDADE[nivel] || "campaign";
  const conta = todos.filter((x) => x.id !== registro.id);
  let similares = [];
  if (tipo === "campaign") {
    similares = conta.filter((x) => x.registro && x.registro.objective === registro.objective && plataformaBase(x.registro.platform) === plataformaBase(registro.platform));
  } else if (tipo === "creative") {
    similares = conta.filter((x) => x.registro && x.registro.type === registro.type);
  } else {
    const camp = registro.campaign_id;
    similares = conta.filter((x) => x.registro && x.registro.campaign_id === camp);
  }
  return { conta: conta.map((x) => x.valores), similares: similares.map((x) => x.valores) };
}
// Tudo que é igual para todos os escopos do mesmo nível: configuração, referência e a lista da conta.
export function baseCompartilhada(nivel, minimos = null) {
  const cfg = db.settings();
  const h = hoje();
  const ivRef = { inicio: somaDias(h, -89), fim: h, dias: 90 };
  return {
    cfg, h, ivRef,
    referencia: mesclarReferencia(cfg.referencias),
    mins: { ...MINIMOS, ...(cfg.minimos_analise || {}), ...(minimos || {}) },
    minimoBenchmark: num(cfg.minimo_benchmark) || 4,
    modoVendas: normalizarModoVenda(cfg.vendas_analise),
    todos: entidadesDoNivel(nivel, ivRef, normalizarModoVenda(cfg.vendas_analise)),
  };
}

// ---------------------------------------------------------------- tendência dentro do período
// Divide os dias com entrega em dois blocos e compara. Sem dias suficientes, não compara.
export function blocosTendencia(serie) {
  const dias = serie.filter((d) => (d.impressions || 0) > 0 || (d.spend || 0) > 0);
  if (dias.length < 4) return null;
  const n = dias.length >= 8 ? 3 : Math.floor(dias.length / 2);
  const juntar = (arr) => {
    const t = { impressions: 0, spend: 0, cliques: 0, reach: 0, freqS: 0, freqN: 0, conv: 0, dias: arr.length };
    for (const d of arr) {
      t.impressions += num(d.impressions); t.spend += num(d.spend); t.cliques += num(d.outbound_clicks) || num(d.link_clicks) || num(d.clicks);
      t.reach += num(d.reach); if (d.frequency && d.impressions) { t.freqS += num(d.frequency) * num(d.impressions); t.freqN += num(d.impressions); }
      t.conv += num(d.sales) || num(d.leads_base);
    }
    return {
      impressions: t.impressions, spend: t.spend, dias: t.dias,
      ctr: razao(t.cliques, t.impressions), cpc: razao(t.spend, t.cliques),
      cpm: t.impressions ? (t.spend / t.impressions) * 1000 : null,
      frequency: t.freqN ? t.freqS / t.freqN : razao(t.impressions, t.reach),
      conv_dia: razao(t.conv, t.dias),
    };
  };
  return { inicio: juntar(dias.slice(0, n)), fim: juntar(dias.slice(-n)), n, total: dias.length };
}

// ---------------------------------------------------------------- níveis abaixo do escopo
// A mesma leitura aplicada aos filhos: é o que mostra se o problema é da campanha inteira
// ou de um conjunto/anúncio específico puxando a média para baixo.
export function filhosDoEscopo(nivel, registro, iv, limite = 12) {
  let itens = [];
  if (nivel === "campanha") {
    itens = [
      ...db.where("ad_sets", (x) => x.campaign_id === registro.id).map((x) => ({ tipo: "Conjunto", reg: x, filtro: { ad_set_id: x.id }, href: "" })),
      ...db.where("ads", (x) => x.campaign_id === registro.id).map((x) => ({ tipo: "Anúncio", reg: x, filtro: { ad_id: x.id }, href: `#/anuncios/${x.id}` })),
    ];
  } else if (nivel === "conjunto") {
    itens = db.where("ads", (x) => x.ad_set_id === registro.id).map((x) => ({ tipo: "Anúncio", reg: x, filtro: { ad_id: x.id }, href: `#/anuncios/${x.id}` }));
  } else if (nivel === "anuncio" && registro.creative_id) {
    const cr = db.get("creatives", registro.creative_id);
    if (cr) itens = [{ tipo: "Criativo", reg: cr, filtro: { creative_id: cr.id }, href: `#/criativos/${cr.id}` }];
  }
  return itens.map((x) => {
    const k = kpis(iv, x.filtro);
    const cr = x.reg.creative_id ? db.get("creatives", x.reg.creative_id) : null;
    const m = metricasCalculadas(brutoDe(k), videoDe(k, cr ? cr.duration_seconds : null));
    return { ...x, nome: x.reg.name, k, m, queda: m.maior_queda_funil };
  }).filter((x) => x.k.spend > 0 || x.k.impressions > 0).sort((a, b) => b.k.spend - a.k.spend).slice(0, limite);
}

// Quando o anúncio realmente rodou, olhando todo o histórico e não só o período da tela.
// É o que permite dizer "este rodou de 01/08 a 15/08" em vez de só "sem dados".
export function janelaDeEntrega(nivel, id) {
  const chave = NIVEIS_FILTRO[nivel] || "campaign_id";
  const linhas = db.where("campaign_metrics", (m) => m[chave] === id && (num(m.impressions) > 0 || num(m.spend) > 0));
  if (!linhas.length) return null;
  const datas = linhas.map((r) => String(r.date).slice(0, 10)).sort();
  return {
    inicio: datas[0], fim: datas[datas.length - 1], dias: new Set(datas).size,
    gasto: linhas.reduce((t, r) => t + num(r.spend), 0),
    impressoes: linhas.reduce((t, r) => t + num(r.impressions), 0),
  };
}

// Recortes que só existem na coleta automática da Meta: posicionamento e demografia.
// Quando o arquivo não foi carregado, a seção simplesmente não aparece — nada é inventado.
export function recortesDaCampanha(externalId) {
  if (!externalId || !META || !META.publico) return null;
  const P = META.publico;
  const juntar = (arr, nomeDe) => {
    const m = {};
    for (const x of arr || []) {
      if (x.campanha_id !== externalId) continue;
      const nome = nomeDe(x);
      const g = m[nome] = m[nome] || { nome, gasto: 0, mensagens: 0, impressoes: 0, cliques: 0 };
      g.gasto += num(x.gasto); g.mensagens += num(x.mensagens); g.impressoes += num(x.impressoes); g.cliques += num(x.cliques);
    }
    return Object.values(m).map((g) => ({ ...g, custo_msg: g.mensagens > 0 ? g.gasto / g.mensagens : null, ctr: g.impressoes > 0 ? g.cliques / g.impressoes : null }))
      .filter((g) => g.gasto > 0).sort((a, b) => b.gasto - a.gasto);
  };
  const POS = { facebook_reels: "Reels FB", facebook_stories: "Stories FB", feed: "Feed", instagram_stories: "Stories IG", instagram_reels: "Reels IG", instagram_explore: "Explorar IG", instagram_profile_feed: "Perfil IG", facebook_profile_feed: "Perfil FB", instagram_search: "Busca IG", marketplace: "Marketplace", video_feeds: "Feeds de vídeo", right_hand_column: "Coluna direita", facebook_notification: "Notificações", instream_video: "Vídeo in-stream", search: "Busca" };
  const GEN = { male: "Homens", female: "Mulheres", unknown: "Não informado" };
  const posicionamento = juntar(P.posicionamento, (x) => (x.plataforma === "instagram" ? "IG · " : x.plataforma === "facebook" ? "FB · " : "") + (POS[x.posicao] || x.posicao));
  const demografia = juntar(P.idade_genero, (x) => `${x.idade === "Unknown" ? "idade não informada" : x.idade} · ${GEN[x.genero] || x.genero}`);
  if (posicionamento.length < 2 && demografia.length < 2) return null;
  return { periodo: P.periodo || {}, posicionamento, demografia };
}

// ---------------------------------------------------------------- contexto do escopo
function contextoDoEscopo(nivel, registro) {
  let campanha = null, criativo = null, publicoReg = null;
  if (nivel === "campanha") campanha = registro;
  else if (nivel === "conjunto") campanha = db.get("campaigns", registro.campaign_id);
  else if (nivel === "anuncio") { campanha = db.get("campaigns", registro.campaign_id); criativo = db.get("creatives", registro.creative_id); }
  else if (nivel === "criativo") { campanha = registro.campaign_id ? db.get("campaigns", registro.campaign_id) : null; criativo = registro; }
  if (nivel === "conjunto" && registro.audience_id) publicoReg = db.get("audiences", registro.audience_id);
  if (!publicoReg && campanha) {
    if (campanha.audience_id) publicoReg = db.get("audiences", campanha.audience_id);
    else {
      const sets = db.where("ad_sets", (s) => s.campaign_id === campanha.id && s.audience_id);
      if (sets.length === 1) publicoReg = db.get("audiences", sets[0].audience_id);
    }
  }
  return { campanha, criativo, publicoReg };
}
// Metas da própria campanha vêm antes de qualquer referência. Na falta delas, as metas gerais.
function metasDoEscopo(campanha) {
  const g = (k, p = 0) => db.goal(k, p);
  const v = (x) => (x != null && x !== "" && isFinite(Number(x)) && Number(x) > 0 ? Number(x) : null);
  const c = campanha || {};
  return {
    cpa: v(c.target_cpa) ?? v(g("cpa_max")), cpl: v(c.target_cpl) ?? v(g("cpl_max")),
    custo_conversa: v(c.target_conversation_cost), roas: v(c.target_roas) ?? v(g("roas_min")),
    ctr: v(c.target_ctr) != null ? Number(c.target_ctr) / 100 : (v(g("ctr_min")) != null ? g("ctr_min") / 100 : null),
    vendas: v(c.target_sales),
  };
}

// ---------------------------------------------------------------- análise completa
// leve = análise para listas: pula série diária, tendência, atendimento, filhos e recortes.
// O diagnóstico e o score continuam iguais; o que sai é só o detalhamento que a lista não mostra.
export function analisar({ nivel = "campanha", registro, iv, minimos = null, base = null, leve = false }) {
  const chave = NIVEIS_FILTRO[nivel] || "campaign_id";
  const filtro = { [chave]: registro.id };
  const { campanha, criativo, publicoReg } = contextoDoEscopo(nivel, registro);
  const k = kpis(iv, filtro);
  const kAnt = leve ? null : kpis(anterior(iv), filtro);
  const serie = leve ? [] : serieDiaria(iv, filtro);

  const b = base || baseCompartilhada(nivel, minimos);
  const { cfg, referencia, mins, h } = b;
  const { usar: usarVendas, parcial: vendasParciais } = consideraVendas(b.modoVendas, k);
  const bruto = brutoDe(k, usarVendas);
  const video = videoDe(k, criativo ? criativo.duration_seconds : null);
  const m = metricasCalculadas(bruto, video);
  const bmk = construirBenchmarks(CHAVES_BENCH, amostrasDe(nivel, registro, b.todos), referencia, b.minimoBenchmark);

  // Na análise leve o número de dias vem do próprio agregado, que já conta os dias distintos.
  const diasComDados = leve ? num(k.dias) : serie.filter((d) => (d.impressions || 0) > 0 || (d.spend || 0) > 0).length;
  const conf = confianca({
    impressoes: k.impressions, alcance: k.reach, cliques: k.outbound_clicks || k.link_clicks || k.clicks,
    gasto: k.spend, dias: diasComDados, video: k.video_3s || k.video_plays, leads: k.leads || k.results, vendas: k.sales,
  }, mins);

  const blocos = leve ? null : blocosTendencia(serie);
  const fad = blocos ? fadiga(blocos.inicio, blocos.fim) : fadiga(null, null);
  const publico = saudePublico(m, bmk, conf, { alcance: k.reach, tamanho_publico: publicoReg ? publicoReg.size : null, ctr_caindo: fad.piorando ? fad.piorando.includes("ctr") : false });

  // Textos de apoio que só o CRM conhece: atendimento e motivo de perda.
  const at = leve ? { medidos: 0, total: 0, naoAtendidos: 0, leads: [] } : atendimento(iv, filtro);
  const sla_texto = at.medidos ? `Tempo médio até o primeiro contato: ${dec(at.tempoMedio, 0)} min${at.naoAtendidos ? `; ${inteiro(at.naoAtendidos)} lead(s) sem nenhum contato` : ""}` : (at.total ? `${inteiro(at.total)} lead(s) no período, ${inteiro(at.naoAtendidos)} sem nenhum contato` : "");
  const perdidos = at.leads.filter((l) => l.stage === "perdido" && l.loss_reason);
  const contagemPerda = {};
  for (const l of perdidos) contagemPerda[l.loss_reason] = (contagemPerda[l.loss_reason] || 0) + 1;
  const topPerda = Object.keys(contagemPerda).sort((a, b) => contagemPerda[b] - contagemPerda[a])[0];
  const perda_texto = topPerda ? `Motivo de perda mais frequente: ${topPerda.replace(/_/g, " ")} (${contagemPerda[topPerda]} lead(s))` : "";

  const ctx = {
    nivel, objetivo: (campanha && campanha.objective) || "vendas", bruto, metas: metasDoEscopo(campanha),
    alcance: k.reach, tamanho_publico: publicoReg ? publicoReg.size : null,
    vendas_consideradas: usarVendas, vendas_parciais: vendasParciais, modo_vendas: b.modoVendas,
    lucro_liquido: usarVendas && (k.sales > 0 || k.spend > 0) ? k.net_profit : null,
    publico, fadiga: fad, sla_texto, perda_texto, atendimento: at,
    dias_rodando: campanha && campanha.start_date ? diasEntre(campanha.start_date, h) : null,
    dias_com_dados: diasComDados,
  };
  const cartoes = cartoesEtapa(m, bmk, conf, ctx);
  const achados = diagnosticos(m, bmk, conf, cartoes, ctx);
  const score = pontuar(cartoes, ctx.objetivo, conf, cfg.analise || {});
  const funil = { etapas: m.funil, maior: m.maior_queda_funil };
  const garg = gargalos(cartoes, achados, funil);
  const fortes = pontosFortes(cartoes, achados, m);
  const pl = plano(achados, cartoes, conf);
  const resumo = resumo10s({ escopo: registro, score, cartoes, achados, gargalos: garg, fortes, conf, m });

  return {
    leve,
    filhos: leve ? [] : filhosDoEscopo(nivel, registro, iv),
    recortes: !leve && nivel === "campanha" ? recortesDaCampanha(registro.external_id) : null,
    usarVendas, vendasParciais, modoVendas: b.modoVendas,
    nivel, registro, iv, filtro, k, kAnt, serie, bruto, video, m, bmk, conf, referencia,
    cartoes, achados, score, funil, gargalos: garg, fortes, plano: pl, resumo, ctx,
    contexto: { campanha, criativo, publico: publicoReg }, tendencia: blocos, fadiga: fad,
  };
}


// Analisa uma lista de escopos do mesmo nível reaproveitando a base de comparação.
// Sem isso, cada anúncio recalcularia o histórico da conta inteira — em 50 anúncios,
// 50 vezes o mesmo trabalho.
export function analisarVarios({ nivel = "anuncio", registros = [], iv, minimos = null, leve = true }) {
  if (!registros.length) return [];
  const base = baseCompartilhada(nivel, minimos);
  return registros.map((registro) => {
    try { return analisar({ nivel, registro, iv, base, leve }); }
    catch (e) { console.error("Análise de", registro && registro.name, e); return null; }
  }).filter(Boolean);
}
