// Integrações: dados da Meta (dados/meta.json) e nuvem no GitHub (crm.json em repositório privado).
import { db } from "./db.js?v=c59cb573";
import { agora, horaCurta, b64utf8, utf8b64, semAcento } from "./format.js?v=c59cb573";

export let META = null; // arquivo bruto, usado pelos recortes de público

const STATUS_META = { ACTIVE: "ativa", PAUSED: "pausada", CAMPAIGN_PAUSED: "pausada", ADSET_PAUSED: "pausada", ARCHIVED: "finalizada", DELETED: "finalizada", IN_PROCESS: "producao", PENDING_REVIEW: "producao", WITH_ISSUES: "pausada", DISAPPROVED: "pausada" };
const OBJETIVO_META = { OUTCOME_SALES: "vendas", CONVERSIONS: "vendas", OUTCOME_LEADS: "leads", LEAD_GENERATION: "leads", MESSAGES: "whatsapp", OUTCOME_ENGAGEMENT: "whatsapp", OUTCOME_AWARENESS: "reconhecimento", BRAND_AWARENESS: "reconhecimento", REACH: "reconhecimento", OUTCOME_TRAFFIC: "trafego", LINK_CLICKS: "trafego", VIDEO_VIEWS: "engajamento", POST_ENGAGEMENT: "engajamento" };
const TIPO_CRIATIVO = { VIDEO: "video", PHOTO: "foto", SHARE: "foto", STATUS: "foto", LINK: "foto", ALBUM: "carrossel" };

function indicePorExterno(t) { const m = new Map(); for (const r of db.all(t, true)) if (r.external_id) m.set(r.external_id, r); return m; }
function empresaPorNome(nome) {
  const n = semAcento(nome); for (const e of db.all("companies")) for (const k of (e.keywords || [])) if (k && n.includes(semAcento(String(k)))) return e.id;
  return "";
}

export async function carregarMeta({ forcar = false } = {}) {
  let dados = null;
  try {
    const r = await fetch("dados/meta.json?_=" + Date.now(), { cache: "no-store" });
    if (r.ok) dados = await r.json();
  } catch {}
  if (!dados) { try { dados = JSON.parse(localStorage.getItem("crm-trafego-meta") || "null"); } catch {} if (!dados) return { ok: false }; }
  else { try { localStorage.setItem("crm-trafego-meta", JSON.stringify(dados)); } catch {} }
  META = dados;
  const ultimo = db.settings().meta_gerado_em;
  if (!forcar && ultimo === dados.gerado_em && db.settings().meta_importado) return { ok: true, novo: false };
  aplicarMeta(dados);
  db.setSettings({ meta_gerado_em: dados.gerado_em, meta_importado: true, meta_conta: dados.conta, meta_periodo: dados.periodo });
  return { ok: true, novo: true };
}

export function aplicarMeta(d) {
  const camps = indicePorExterno("campaigns"), sets = indicePorExterno("ad_sets"), ads = indicePorExterno("ads"), crs = indicePorExterno("creatives");
  const idCamp = {}, idSet = {}, idAd = {}, idCr = {};
  const up = (t, idx, ext, dados, camposPlat) => {
    const a = idx.get(ext);
    if (!a) { const r = db.insert(t, { ...dados, external_id: ext }); idx.set(ext, r); return r; }
    const patch = {}; for (const k of camposPlat) if (dados[k] !== undefined && a[k] !== dados[k]) patch[k] = dados[k];
    if (a.deleted_at) patch.deleted_at = null;
    if (Object.keys(patch).length) { delete a.deleted_at; db.update(t, a.id, patch); }
    return a;
  };
  for (const c of d.campanhas || []) {
    const r = up("campaigns", camps, c.id, { name: c.nome, platform: "meta", objective: OBJETIVO_META[c.objetivo] || "engajamento", start_date: c.inicio || c.criado_em, end_date: c.fim || "", status: STATUS_META[c.status] || "pausada", daily_budget: c.orcamento_diario, total_budget: c.orcamento_total, source: "meta", company_id: empresaPorNome(c.nome) }, ["name", "status", "daily_budget", "total_budget", "start_date", "end_date"]);
    if (!r.company_id) { const e = empresaPorNome(c.nome); if (e) db.update("campaigns", r.id, { company_id: e }); }
    idCamp[c.id] = r.id;
  }
  for (const s of d.conjuntos || []) {
    const r = up("ad_sets", sets, s.id, { name: s.nome, campaign_id: idCamp[s.campanha_id] || "", status: STATUS_META[s.status] || "pausada", daily_budget: s.orcamento_diario, targeting: [s.idade ? "idade " + s.idade : "", s.genero, (s.locais || []).join(", "), s.otimizacao ? "otimiza " + s.otimizacao.toLowerCase().replace(/_/g, " ") : ""].filter(Boolean).join(" · ") }, ["name", "campaign_id", "status", "daily_budget", "targeting"]);
    idSet[s.id] = r.id;
  }
  for (const a of d.anuncios || []) {
    const cr = up("creatives", crs, "cr:" + a.id, { name: a.nome, type: TIPO_CRIATIVO[a.tipo] || "foto", campaign_id: idCamp[a.campanha_id] || "", thumbnail: a.miniatura || "", copy: a.texto || "", link: a.link_instagram || "", published_at: a.criado_em || "", created_at_date: a.criado_em || "" }, ["name", "thumbnail", "copy", "link", "campaign_id"]);
    idCr[a.id] = cr.id;
    const r = up("ads", ads, a.id, { name: a.nome, campaign_id: idCamp[a.campanha_id] || "", ad_set_id: idSet[a.conjunto_id] || "", creative_id: cr.id, status: STATUS_META[a.status] || "pausada" }, ["name", "campaign_id", "ad_set_id", "creative_id", "status"]);
    idAd[a.id] = r.id;
  }
  // produto do criativo herda o produto da campanha, se ainda não tiver
  for (const cr of db.all("creatives")) if (!cr.product_id && cr.campaign_id) { const c = db.get("campaigns", cr.campaign_id); if (c && c.product_id) db.update("creatives", cr.id, { product_id: c.product_id }); }
  const metricas = indicePorExterno("campaign_metrics");
  for (const l of d.diario_anuncio || []) {
    const ext = `meta:${l.data}:${l.anuncio_id}`;
    up("campaign_metrics", metricas, ext, { date: l.data, campaign_id: idCamp[l.campanha_id] || "", ad_set_id: idSet[l.conjunto_id] || "", ad_id: idAd[l.anuncio_id] || "", creative_id: idCr[l.anuncio_id] || "", spend: l.gasto, impressions: l.impressoes, reach: l.alcance, clicks: l.cliques, link_clicks: l.cliques_link, results: l.mensagens, frequency: l.frequencia, source: "meta" }, ["spend", "impressions", "reach", "clicks", "link_clicks", "results", "frequency", "campaign_id", "ad_set_id", "ad_id", "creative_id"]);
  }
  // dias em que a campanha teve entrega sem linha de anúncio (raro): usa a linha de campanha
  const diasComAnuncio = new Set((d.diario_anuncio || []).map((l) => `${l.data}:${l.campanha_id}`));
  for (const l of d.diario_campanha || []) {
    if (diasComAnuncio.has(`${l.data}:${l.campanha_id}`)) continue;
    up("campaign_metrics", metricas, `meta:${l.data}:c:${l.campanha_id}`, { date: l.data, campaign_id: idCamp[l.campanha_id] || "", spend: l.gasto, impressions: l.impressoes, reach: l.alcance, clicks: l.cliques, link_clicks: l.cliques_link, results: l.mensagens, frequency: l.frequencia, source: "meta" }, ["spend", "impressions", "reach", "clicks", "link_clicks", "results", "frequency"]);
  }
}

// ---------------------------------------------------------------- nuvem (GitHub)
const NUVEM_CHAVE = "crm-trafego-nuvem", ARQUIVO = "crm.json";
export const nuvem = { token: "", repo: "", branch: "main", sha: null, ultimaSync: null, pendente: false, ocupado: false, erro: "", status: "" };
let timer = null, poll = null;
const ouvintes = new Set();
export const onNuvem = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
const avisar = () => { for (const f of ouvintes) f(nuvem); };
export function nuvemLer() { try { const c = JSON.parse(localStorage.getItem(NUVEM_CHAVE) || "null"); if (c && c.token && c.repo) Object.assign(nuvem, { token: c.token, repo: c.repo, branch: c.branch || "main", sha: c.sha || null, ultimaSync: c.ultimaSync || null, pendente: !!c.pendente }); } catch {} }
function gravarCfg() { try { localStorage.setItem(NUVEM_CHAVE, JSON.stringify({ token: nuvem.token, repo: nuvem.repo, branch: nuvem.branch, sha: nuvem.sha, ultimaSync: nuvem.ultimaSync, pendente: nuvem.pendente })); } catch {} }
export const nuvemLigada = () => !!(nuvem.token && nuvem.repo);
const headers = () => ({ Authorization: "Bearer " + nuvem.token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });
const url = () => `https://api.github.com/repos/${nuvem.repo}/contents/${ARQUIVO}`;
export async function repoInfo() {
  const r = await fetch(`https://api.github.com/repos/${nuvem.repo}?_=${Date.now()}`, { headers: headers(), cache: "no-store" });
  if (r.status === 404) throw new Error(`a chave não tem acesso ao repositório ${nuvem.repo}`);
  if (r.status === 401) throw new Error("chave inválida ou vencida");
  if (!r.ok) throw new Error("GitHub respondeu " + r.status);
  return r.json();
}
async function baixar() {
  if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(nuvem.token)) throw new Error("a chave parece incompleta");
  const r = await fetch(`${url()}?ref=${encodeURIComponent(nuvem.branch)}&_=${Date.now()}`, { headers: headers(), cache: "no-store" });
  if (r.status === 404) { const info = await repoInfo(); if (info.default_branch && info.default_branch !== nuvem.branch) { nuvem.branch = info.default_branch; gravarCfg(); return baixar(); } return { obj: null, sha: null }; }
  if (r.status === 401) throw new Error("chave inválida ou vencida");
  if (!r.ok) throw new Error("GitHub respondeu " + r.status);
  const j = await r.json(); let obj; try { obj = JSON.parse(utf8b64(j.content)); } catch { throw new Error("arquivo na nuvem está corrompido"); }
  return { obj, sha: j.sha };
}
async function subir(obj, sha) {
  const corpo = { message: "CRM de tráfego — " + new Date().toLocaleString("pt-BR"), content: b64utf8(JSON.stringify(obj)), branch: nuvem.branch }; if (sha) corpo.sha = sha;
  const r = await fetch(url(), { method: "PUT", headers: { "Content-Type": "application/json", ...headers() }, body: JSON.stringify(corpo) });
  if (r.status === 404) throw new Error("sem permissão de escrita (na chave, Contents: Read and write)");
  if (r.status === 409 || r.status === 422) return null;
  if (!r.ok) throw new Error("GitHub respondeu " + r.status + " ao gravar");
  return (await r.json()).content.sha;
}
function assinatura(obj) { const t = {}; for (const k of Object.keys(obj.tabelas || {})) t[k] = (obj.tabelas[k] || []).map((r) => r.id + ":" + (r.updated_at || "")).sort().join("|"); return JSON.stringify(t); }
export async function sincronizar(motivo = "") {
  if (!nuvemLigada() || nuvem.ocupado) return;
  if (!navigator.onLine) { nuvem.pendente = true; gravarCfg(); nuvem.status = "sem internet"; avisar(); return; }
  nuvem.ocupado = true; nuvem.status = "sincronizando…"; avisar();
  try {
    for (let t = 0; t < 3; t++) {
      const { obj, sha } = await baixar();
      if (obj) db.mesclarRemoto(obj);
      const snap = db.snapshot();
      if (obj && assinatura(obj) === assinatura(snap)) { nuvem.sha = sha; break; }
      const novo = await subir(snap, sha); if (novo) { nuvem.sha = novo; break; }
    }
    nuvem.pendente = false; nuvem.erro = ""; nuvem.ultimaSync = agora(); nuvem.status = "sincronizado " + horaCurta(nuvem.ultimaSync); gravarCfg();
  } catch (e) { nuvem.erro = e.message; nuvem.pendente = true; nuvem.status = "erro: " + e.message; gravarCfg(); }
  finally { nuvem.ocupado = false; avisar(); }
}
export function agendarEnvio() { if (!nuvemLigada()) return; nuvem.pendente = true; gravarCfg(); clearTimeout(timer); timer = setTimeout(() => sincronizar("edicao"), 3000); }
export async function conectar(repo, token) {
  repo = repo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, ""); token = String(token || "").replace(/[\s​-‍﻿]/g, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("informe o repositório como usuário/nome");
  if (!token) throw new Error("cole a chave de acesso");
  Object.assign(nuvem, { token, repo, branch: "main", sha: null, erro: "" });
  let info; try { info = await repoInfo(); } catch (e) { nuvem.token = ""; nuvem.repo = ""; throw e; }
  if (info.default_branch) nuvem.branch = info.default_branch;
  gravarCfg(); iniciarPoll(); await sincronizar("conectar");
  return info;
}
export function desconectar() { Object.assign(nuvem, { token: "", repo: "", sha: null, ultimaSync: null, pendente: false, erro: "", status: "" }); try { localStorage.removeItem(NUVEM_CHAVE); } catch {} clearInterval(poll); avisar(); }
export function iniciarPoll() { clearInterval(poll); if (!nuvemLigada()) return; poll = setInterval(() => { if (document.visibilityState === "visible") sincronizar("poll"); }, 3 * 60 * 1000); }
