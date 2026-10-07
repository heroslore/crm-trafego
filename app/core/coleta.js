// Coleta das métricas da Meta feita PELO NAVEGADOR.
//
// Existe porque a coleta diária pelo GitHub depende de um segredo no repositório, e quando
// esse segredo falta ela para em silêncio — ficou seis dias parada sem ninguém notar, e o CRM
// seguiu mostrando número velho com cara de número novo. Decisão de pausar campanha foi tomada
// em cima disso.
//
// A API da Meta responde com CORS liberado (é assim que pausar e mudar orçamento já funcionam),
// e a chave já está neste aparelho. Então o CRM não precisa de intermediário: abre, vê que os
// dados estão velhos, e busca o que falta.
//
// A forma do resultado é IGUAL à de dados/meta.json, de propósito: assim o mesmo aplicarMeta()
// serve para o arquivo e para a coleta daqui, e as duas fontes podem conviver — o arquivo traz
// o histórico antigo, o navegador preenche o buraco até hoje.
import * as M from "./meta.js?v=1bb62cf8";
import { num, hoje, somaDias } from "./format.js?v=1bb62cf8";

export const VERSAO_COLETA = 1;

// Mesmo mapa do coletor Python. Se um dos dois mudar, o outro precisa mudar junto.
const ACOES = {
  conversas: "onsite_conversion.messaging_conversation_started_7d",
  conexoes: "onsite_conversion.total_messaging_connection",
  respostas: "onsite_conversion.messaging_first_reply",
  leads_form: "lead",
  cliques_link: "link_click",
  engajamento: "post_engagement",
  reacoes: "post_reaction",
  comentarios: "comment",
  salvos: "onsite_conversion.post_save",
  compartilhamentos: "post",
  visualizacoes_video: "video_view",
  pagina_destino: "landing_page_view",
};
const CAMPOS_VIDEO = {
  thruplay: "video_thruplay_watched_actions",
  video_p25: "video_p25_watched_actions",
  video_p50: "video_p50_watched_actions",
  video_p75: "video_p75_watched_actions",
  video_p95: "video_p95_watched_actions",
  video_p100: "video_p100_watched_actions",
  video_plays: "video_play_actions",
  video_2s: "video_continuous_2_sec_watched_actions",
};
const CAMPOS_DIARIO = "spend,reach,impressions,clicks,inline_link_clicks,outbound_clicks,frequency,cpm,ctr,actions," +
  "video_thruplay_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions," +
  "video_p95_watched_actions,video_p100_watched_actions,video_play_actions,video_continuous_2_sec_watched_actions," +
  "video_avg_time_watched_actions";
const CAMPOS_PUBLICO = "spend,reach,impressions,clicks,actions";

const arred = (v, casas = 2) => { const n = num(v); return n ? Number(n.toFixed(casas)) : 0; };
const somarAcoes = (l, campo) => Math.round((l[campo] || []).reduce((t, a) => t + num(a.value), 0));

function acoesDe(l) {
  const bruto = {};
  for (const a of l.actions || []) bruto[a.action_type] = num(a.value);
  const saida = {};
  for (const [chave, tipo] of Object.entries(ACOES)) if (bruto[tipo]) saida[chave] = Math.round(bruto[tipo]);
  return saida;
}
// Mensagem do dia: conversa iniciada; sem ela, conexão; sem ela, resposta; sem ela, formulário.
function mensagensDe(a) {
  for (const k of ["conversas", "conexoes", "respostas", "leads_form"]) if (a[k]) return a[k];
  return 0;
}
function metricasVideo(l) {
  const v = {};
  for (const [chave, campo] of Object.entries(CAMPOS_VIDEO)) v[chave] = somarAcoes(l, campo);
  const bruto = {};
  for (const a of l.actions || []) bruto[a.action_type] = num(a.value);
  v.video_3s = Math.round(bruto.video_view || 0);
  const t = (l.video_avg_time_watched_actions || [])[0];
  if (t) v.tempo_medio = Math.round(num(t.value));
  return v;
}
const temVideo = (v) => Object.values(v).some((x) => x > 0);

// Percorre a paginação da Meta até o fim. Teto de páginas para que uma conta grande ou um
// "next" que não termina nunca não deixem a tela travada sem fim.
async function lista(caminho, params, { maxPaginas = 40 } = {}) {
  const fora = [];
  let resp = await M.get(caminho, params.fields, { ...params, limit: params.limit || 500 });
  for (let i = 0; i < maxPaginas; i++) {
    fora.push(...(resp.data || []));
    const prox = resp.paging && resp.paging.next;
    if (!prox) break;
    const r = await fetch(prox);
    if (!r.ok) break;
    resp = await r.json();
    if (resp.error) break;
  }
  return fora;
}

const janela = (desde, ate) => JSON.stringify({ since: desde, until: ate });

function problemasDe(r) {
  return (r.issues_info || []).map((i) => {
    const resumo = (i.error_summary || "").trim();
    let mensagem = (i.error_message || "").trim();
    if (mensagem.startsWith(resumo + ":")) mensagem = mensagem.slice(resumo.length + 1).trim();
    return { nivel: i.level || "", codigo: i.error_code, tipo: i.error_type || "", resumo, mensagem };
  });
}

// ---------------------------------------------------------------- as partes
async function conta() {
  const c = await M.get(M.cfg.conta, "name,currency,account_status,amount_spent,timezone_name,business_name");
  return { id: c.id, nome: c.name, moeda: c.currency, fuso: c.timezone_name || "America/Sao_Paulo", status: c.account_status, gasto_total_centavos: Math.round(num(c.amount_spent)) };
}
async function campanhas() {
  const l = await lista(`${M.cfg.conta}/campaigns`, { fields: "name,objective,status,effective_status,issues_info,daily_budget,lifetime_budget,created_time,start_time,stop_time" });
  return l.map((c) => ({
    id: c.id, nome: c.name || "(sem nome)", objetivo: c.objective || "",
    status: c.effective_status || c.status || "",
    orcamento_diario: c.daily_budget ? arred(num(c.daily_budget) / 100) : null,
    orcamento_total: c.lifetime_budget ? arred(num(c.lifetime_budget) / 100) : null,
    criado_em: (c.created_time || "").slice(0, 10), inicio: (c.start_time || "").slice(0, 10),
    fim: (c.stop_time || "").slice(0, 10) || null, problemas: problemasDe(c),
  })).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
}
async function conjuntos() {
  const l = await lista(`${M.cfg.conta}/adsets`, { fields: "name,campaign_id,effective_status,issues_info,daily_budget,optimization_goal,targeting{age_min,age_max,genders,geo_locations}" });
  return l.map((a) => {
    const alvo = a.targeting || {}, geo = alvo.geo_locations || {}, locais = [];
    for (const chave of ["cities", "regions", "custom_locations", "zips", "places"]) {
      for (const it of geo[chave] || []) {
        const nome = it.name || it.address_string || it.key;
        if (nome) locais.push(it.radius ? `${nome} (${it.radius} ${it.distance_unit || "km"})` : nome);
      }
    }
    for (const p of geo.countries || []) locais.push(p);
    const g = alvo.genders || [];
    const genero = !g.length ? "todos" : (String(g) === "1" ? "homens" : String(g) === "2" ? "mulheres" : "todos");
    return {
      id: a.id, nome: a.name || "(sem nome)", campanha_id: a.campaign_id,
      status: a.effective_status || "", otimizacao: a.optimization_goal || "",
      orcamento_diario: a.daily_budget ? arred(num(a.daily_budget) / 100) : null,
      idade: alvo.age_min ? `${alvo.age_min}-${alvo.age_max || ""}` : "",
      genero, locais: locais.slice(0, 8), problemas: problemasDe(a),
    };
  });
}
async function anuncios() {
  const l = await lista(`${M.cfg.conta}/ads`, { fields: "name,status,effective_status,issues_info,campaign_id,adset_id,created_time,creative{thumbnail_url,body,title,object_type,instagram_permalink_url}" });
  return l.map((a) => {
    const cr = a.creative || {};
    return {
      id: a.id, nome: a.name || "(sem nome)", campanha_id: a.campaign_id, conjunto_id: a.adset_id,
      status: a.effective_status || a.status || "", criado_em: (a.created_time || "").slice(0, 10),
      miniatura: cr.thumbnail_url || "", tipo: cr.object_type || "",
      texto: String(cr.body || cr.title || "").trim().slice(0, 240),
      link_instagram: cr.instagram_permalink_url || "", problemas: problemasDe(a),
    };
  });
}
async function diario(nivel, desde, ate) {
  const campos = (nivel === "campaign" ? "campaign_id,campaign_name," : "ad_id,ad_name,adset_id,campaign_id,") + CAMPOS_DIARIO;
  const l = await lista(`${M.cfg.conta}/insights`, { level: nivel, fields: campos, time_increment: 1, time_range: janela(desde, ate) });
  return l.map((x) => {
    const acoes = acoesDe(x);
    const item = {
      data: x.date_start, campanha_id: x.campaign_id,
      gasto: arred(x.spend), alcance: Math.round(num(x.reach)), impressoes: Math.round(num(x.impressions)),
      cliques: Math.round(num(x.clicks)), cliques_link: Math.round(num(x.inline_link_clicks)),
      frequencia: arred(x.frequency, 3), cpm: arred(x.cpm), ctr: arred(x.ctr, 3),
      cliques_saida: somarAcoes(x, "outbound_clicks"), pagina_destino: acoes.pagina_destino || 0,
      conversas: acoes.conversas || acoes.conexoes || 0, mensagens: mensagensDe(acoes), acoes,
    };
    const v = metricasVideo(x);
    if (temVideo(v)) item.video = v;
    if (nivel === "ad") { item.anuncio_id = x.ad_id; item.conjunto_id = x.adset_id; }
    return item;
  });
}
async function publico(desde, ate) {
  const faixa = janela(desde, ate);
  const recorte = async (nivel, breakdowns, chaves) => {
    const campos = (nivel === "campaign" ? "campaign_id," : "") + CAMPOS_PUBLICO;
    const l = await lista(`${M.cfg.conta}/insights`, { level: nivel, fields: campos, breakdowns, time_range: faixa });
    return l.map((x) => {
      const acoes = acoesDe(x), item = {};
      for (const k of chaves) item[k] = x[k];
      if (nivel === "campaign") item.campanha_id = x.campaign_id;
      return {
        ...item, gasto: arred(x.spend), alcance: Math.round(num(x.reach)),
        impressoes: Math.round(num(x.impressions)), cliques: Math.round(num(x.clicks)),
        mensagens: mensagensDe(acoes),
      };
    });
  };
  const horario = await recorte("account", "hourly_stats_aggregated_by_advertiser_time_zone", ["hourly_stats_aggregated_by_advertiser_time_zone"]);
  for (const h of horario) {
    const faixaH = String(h.hourly_stats_aggregated_by_advertiser_time_zone || "");
    h.hora = /^\d\d/.test(faixaH) ? Number(faixaH.slice(0, 2)) : null;
    delete h.hourly_stats_aggregated_by_advertiser_time_zone;
  }
  return {
    periodo: { inicio: desde, fim: ate },
    idade_genero: await recorte("campaign", "age,gender", ["age", "gender"]),
    posicionamento: (await recorte("campaign", "publisher_platform,platform_position", ["publisher_platform", "platform_position"]))
      .map((x) => ({ ...x, plataforma: x.publisher_platform, posicao: x.platform_position, publisher_platform: undefined, platform_position: undefined })),
    dispositivo: (await recorte("campaign", "impression_device", ["impression_device"]))
      .map((x) => ({ ...x, dispositivo: x.impression_device, impression_device: undefined })),
    regiao: (await recorte("campaign", "region", ["region"])).map((x) => ({ ...x, regiao: x.region, region: undefined })),
    horario,
  };
}

// ---------------------------------------------------------------- junção com o que já existe
// O arquivo do repositório guarda o histórico inteiro; a coleta daqui cobre só a janela recente.
// Mantemos do antigo tudo que está ANTES da janela, para não perder meses de histórico só
// porque hoje baixamos 45 dias.
export function juntarDiario(antigo, novo, desde) {
  const mantidos = (antigo || []).filter((l) => String(l.data || "") < desde);
  const chave = (l) => `${l.data}|${l.campanha_id || ""}|${l.anuncio_id || ""}`;
  return [...mantidos, ...novo].sort((a, b) => chave(a).localeCompare(chave(b)));
}

// ---------------------------------------------------------------- a coleta inteira
export async function coletar({ dias = 45, base = null, aoProgresso = null } = {}) {
  if (!M.configurado()) throw new Error("Chave de acesso da Meta não configurada neste aparelho.");
  const ate = hoje(), desde = somaDias(ate, -(dias - 1));
  const passo = (n, t) => { if (aoProgresso) aoProgresso(n, t); };
  passo("conta", "Conta");
  const c = await conta();
  passo("estrutura", "Campanhas, conjuntos e anúncios");
  const [camps, sets, ads] = [await campanhas(), await conjuntos(), await anuncios()];
  passo("diario", `Métricas de ${desde} a ${ate}`);
  const dCamp = await diario("campaign", desde, ate);
  const dAd = await diario("ad", desde, ate);
  passo("publico", "Recortes de público");
  let pub = null;
  // O recorte de público é a parte mais cara e a menos crítica: se falhar, a coleta continua
  // valendo. Melhor dados de ontem sem recorte do que nenhum dado.
  try { pub = await publico(somaDias(ate, -29), ate); } catch { pub = (base && base.publico) || null; }
  return {
    versao: 1, gerado_em: new Date().toISOString(), origem: "navegador",
    conta: c, periodo: { inicio: desde, fim: ate, dias },
    campanhas: camps, conjuntos: sets, anuncios: ads,
    diario_campanha: juntarDiario(base && base.diario_campanha, dCamp, desde),
    diario_anuncio: juntarDiario(base && base.diario_anuncio, dAd, desde),
    publico: pub, alertas: (base && base.alertas) || { data: ate, itens: [] },
  };
}
