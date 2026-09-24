// Importação de CSV/XLSX (principalmente exportações do Gerenciador de Anúncios da Meta).
import { db } from "./db.js?v=0f43faaa";
import { semAcento, hoje } from "./format.js?v=0f43faaa";

export const CAMPOS_IMPORT = [
  ["campaign", "Campanha", ["nome da campanha", "campanha", "campaign name", "campaign"]],
  ["ad_set", "Conjunto", ["nome do conjunto de anuncios", "conjunto de anuncios", "conjunto", "ad set name", "adset name", "ad set"]],
  ["ad", "Anúncio", ["nome do anuncio", "anuncio", "ad name", "ad"]],
  ["date", "Dia", ["dia", "data", "inicio dos relatorios", "reporting starts", "day", "date"]],
  ["spend", "Investimento", ["valor usado (brl)", "valor usado", "valor gasto", "investimento", "amount spent", "amount spent (brl)", "spend", "custo"]],
  ["impressions", "Impressões", ["impressoes", "impressions"]],
  ["reach", "Alcance", ["alcance", "reach"]],
  ["clicks", "Cliques", ["cliques (todos)", "cliques", "clicks (all)", "clicks"]],
  ["link_clicks", "Cliques no link", ["cliques no link", "link clicks"]],
  ["ctr", "CTR", ["ctr (todos)", "ctr", "ctr (all)"]],
  ["cpc", "CPC", ["cpc (todos)", "cpc", "cpc (all)"]],
  ["cpm", "CPM", ["cpm (custo por 1.000 impressoes)", "cpm"]],
  ["results", "Resultados", ["resultados", "results", "conversas por mensagem iniciadas", "leads", "mensagens"]],
  ["cost_per_result", "Custo por resultado", ["custo por resultado", "cost per result", "custo por lead"]],
  ["frequency", "Frequência", ["frequencia", "frequency"]],
  ["outbound_clicks", "Cliques de saída", ["cliques de saida", "cliques no link de saida", "outbound clicks"]],
  ["landing_page_views", "Visitas à página", ["visualizacoes da pagina de destino", "visitas a pagina", "landing page views"]],
  ["conversations", "Conversas iniciadas", ["conversas por mensagem iniciadas", "conversas iniciadas", "messaging conversations started"]],
  ["video_plays", "Reproduções do vídeo", ["reproducoes de video", "reproducoes do video", "video plays"]],
  ["video_3s", "Visualizações de 3s", ["reproducoes de video de 3 segundos", "visualizacoes de 3 segundos", "3-second video plays"]],
  ["thruplay", "ThruPlay", ["thruplays", "thruplay", "reproducoes ate o fim"]],
  ["video_p25", "Assistiram 25%", ["reproducoes de video ate 25%", "video plays at 25%"]],
  ["video_p50", "Assistiram 50%", ["reproducoes de video ate 50%", "video plays at 50%"]],
  ["video_p75", "Assistiram 75%", ["reproducoes de video ate 75%", "video plays at 75%"]],
  ["video_p95", "Assistiram 95%", ["reproducoes de video ate 95%", "video plays at 95%"]],
  ["video_p100", "Assistiram até o fim", ["reproducoes de video ate 100%", "video plays at 100%"]],
  ["avg_watch", "Tempo médio assistido", ["tempo medio de reproducao do video", "tempo medio assistido", "video average play time"]],
];
// Colunas numéricas opcionais: só entram no banco quando existem na planilha.
// Coluna ausente vira campo vazio, nunca zero (senão a análise conclui sobre dado que não existe).
export const OPCIONAIS_METRICA = ["outbound_clicks", "landing_page_views", "conversations", "video_plays", "video_3s", "thruplay", "video_p25", "video_p50", "video_p75", "video_p95", "video_p100", "avg_watch"];

export function lerCSV(texto) {
  texto = texto.replace(/^﻿/, "");
  const primeira = texto.split(/\r?\n/)[0] || "";
  const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ";" : (primeira.includes("\t") ? "\t" : ",");
  const linhas = []; let campo = "", linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) { if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c; }
    else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && texto[i + 1] === "\n") i++; linha.push(campo); linhas.push(linha); linha = []; campo = ""; }
    else campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  const cab = (linhas.shift() || []).map((h) => h.trim());
  return { cabecalho: cab, linhas: linhas.filter((l) => l.some((v) => v !== "")).map((l) => Object.fromEntries(cab.map((h, i) => [h, (l[i] ?? "").trim()]))) };
}

export async function lerXLSX(arquivo) {
  if (!window.XLSX) await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = res; s.onerror = () => rej(new Error("não consegui carregar o leitor de XLSX (sem internet?)")); document.head.appendChild(s); });
  const buf = await arquivo.arrayBuffer(); const wb = window.XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]]; const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  const cab = (rows.shift() || []).map((h) => String(h).trim());
  return { cabecalho: cab, linhas: rows.filter((l) => l.some((v) => v !== "")).map((l) => Object.fromEntries(cab.map((h, i) => [h, String(l[i] ?? "").trim()]))) };
}

export function mapearColunas(cabecalho) {
  const mapa = {};
  for (const [key, , sinonimos] of CAMPOS_IMPORT) {
    const achado = cabecalho.find((h) => sinonimos.includes(semAcento(h))) || cabecalho.find((h) => sinonimos.some((s) => semAcento(h).startsWith(s)));
    if (achado && !Object.values(mapa).includes(achado)) mapa[key] = achado;
  }
  return mapa;
}
export function numeroBR(v) { if (v == null || v === "") return 0; let s = String(v).replace(/[^\d,.-]/g, ""); if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", "."); else if (s.includes(",")) s = s.replace(",", "."); const n = Number(s); return isFinite(n) ? n : 0; }
export function dataISO(v) {
  if (!v) return hoje(); const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s); return isNaN(d) ? hoje() : d.toISOString().slice(0, 10);
}

// Grava as linhas no banco. Campanhas/conjuntos/anúncios são localizados pelo nome (ou criados).
export function importar(linhas, mapa, { platform = "meta", product_id = "", dataFixa = "" } = {}) {
  const porNome = (t, extra) => { const m = new Map(); for (const r of db.all(t)) m.set(semAcento(r.name) + "|" + (extra ? extra(r) : ""), r); return m; };
  const camps = porNome("campaigns"), sets = porNome("ad_sets", (r) => r.campaign_id), ads = porNome("ads", (r) => r.ad_set_id || r.campaign_id);
  const metricas = new Map(); for (const m of db.all("campaign_metrics", true)) if (m.external_id) metricas.set(m.external_id, m);
  let novas = 0, atualizadas = 0, campanhasNovas = 0;
  for (const l of linhas) {
    const nomeC = (mapa.campaign && l[mapa.campaign]) || ""; if (!nomeC) continue;
    let c = camps.get(semAcento(nomeC) + "|");
    if (!c) { c = db.insert("campaigns", { name: nomeC, platform, objective: "vendas", status: "ativa", source: "import", product_id, start_date: dataFixa || dataISO(mapa.date ? l[mapa.date] : "") }); camps.set(semAcento(nomeC) + "|", c); campanhasNovas++; }
    let s = null; const nomeS = (mapa.ad_set && l[mapa.ad_set]) || "";
    if (nomeS) { s = sets.get(semAcento(nomeS) + "|" + c.id); if (!s) { s = db.insert("ad_sets", { name: nomeS, campaign_id: c.id, status: "ativa" }); sets.set(semAcento(nomeS) + "|" + c.id, s); } }
    let a = null; const nomeA = (mapa.ad && l[mapa.ad]) || "";
    if (nomeA) { const k = semAcento(nomeA) + "|" + (s ? s.id : c.id); a = ads.get(k); if (!a) { const cr = db.insert("creatives", { name: nomeA, type: "foto", campaign_id: c.id, product_id: product_id || c.product_id || "" }); a = db.insert("ads", { name: nomeA, campaign_id: c.id, ad_set_id: s ? s.id : "", creative_id: cr.id, status: "ativa" }); ads.set(k, a); } }
    const data = dataFixa || dataISO(mapa.date ? l[mapa.date] : "");
    const ext = `import:${data}:${c.id}:${s ? s.id : ""}:${a ? a.id : ""}`;
    const dados = { date: data, campaign_id: c.id, ad_set_id: s ? s.id : "", ad_id: a ? a.id : "", creative_id: a ? a.creative_id : "", spend: numeroBR(mapa.spend ? l[mapa.spend] : 0), impressions: numeroBR(mapa.impressions ? l[mapa.impressions] : 0), reach: numeroBR(mapa.reach ? l[mapa.reach] : 0), clicks: numeroBR(mapa.clicks ? l[mapa.clicks] : 0), link_clicks: numeroBR(mapa.link_clicks ? l[mapa.link_clicks] : 0), results: numeroBR(mapa.results ? l[mapa.results] : 0), frequency: mapa.frequency ? numeroBR(l[mapa.frequency]) : null, source: "import", external_id: ext };
    for (const chave of OPCIONAIS_METRICA) if (mapa[chave] && l[mapa[chave]] !== "" && l[mapa[chave]] != null) dados[chave] = numeroBR(l[mapa[chave]]);
    if (!dados.link_clicks && mapa.ctr && dados.impressions) dados.link_clicks = Math.round(dados.impressions * numeroBR(l[mapa.ctr]) / 100);
    const ex = metricas.get(ext);
    if (ex) { db.update("campaign_metrics", ex.id, dados); atualizadas++; } else { metricas.set(ext, db.insert("campaign_metrics", dados)); novas++; }
  }
  return { novas, atualizadas, campanhasNovas };
}
