// Controle das campanhas na Meta direto do navegador (pausar, reativar, orçamento,
// duplicar e subir campanha nova). A API da Meta responde com CORS liberado, então
// não existe servidor no meio — o CRM fala direto com o Gerenciador de Anúncios.
//
// A chave de acesso NÃO fica no banco, no backup nem na nuvem: mora só neste
// aparelho (localStorage), porque quem tem essa chave gasta o dinheiro da conta.
// Todo comando é confirmado antes e vira registro no histórico de decisões.
import { db } from "./db.js?v=46e26fb2";
import { num } from "./format.js?v=46e26fb2";

// Atenção: "crm-trafego-meta" já é usada pelo sync.js para guardar o meta.json da coleta.
// Esta configuração mora numa chave própria.
const CHAVE_CFG = "crm-trafego-meta-chave";
export const VERSAO_API = "v23.0";
// Endereço da API. A variável só existe para os testes automatizados apontarem para um
// servidor simulado; em produção nada a define e o valor é o da Meta.
const BASE = (typeof window !== "undefined" && window.CRM_META_BASE) || "https://graph.facebook.com";

export const cfg = { token: "", conta: "", versao: VERSAO_API, ligado: false };
export const estado = { verificado: null, erro: "", perfil: null, conta: null, permissoes: [], moeda: "BRL", minimoDiario: 0 };

export function carregarCfg() {
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE_CFG) || "null");
    // Só aceita o que tem cara de configuração: assim um valor estranho na chave
    // não contamina o cliente com campos de outra coisa.
    if (c && typeof c === "object" && ("token" in c || "ligado" in c)) {
      cfg.token = typeof c.token === "string" ? c.token : "";
      cfg.conta = typeof c.conta === "string" ? c.conta : "";
      cfg.versao = typeof c.versao === "string" && /^v\d+\.\d+$/.test(c.versao) ? c.versao : VERSAO_API;
      cfg.ligado = !!c.ligado;
    }
  } catch {}
  if (!cfg.conta) cfg.conta = (db.settings().meta_conta || {}).id || "";
  return cfg;
}
export function salvarCfg(patch) {
  Object.assign(cfg, patch);
  cfg.conta = contaNormalizada(cfg.conta);
  try { localStorage.setItem(CHAVE_CFG, JSON.stringify(cfg)); } catch {}
  return cfg;
}
export function limparCfg() {
  cfg.token = ""; cfg.ligado = false;
  try { localStorage.removeItem(CHAVE_CFG); } catch {}
  Object.assign(estado, { verificado: null, erro: "", perfil: null, conta: null, permissoes: [] });
  return cfg;
}
export const contaNormalizada = (c) => { const s = String(c || "").trim().replace(/^act_/, ""); return s ? "act_" + s : ""; };
export const configurado = () => !!cfg.token && !!cfg.conta;
// Escrever exige três coisas juntas: chave, permissão de gestão e o interruptor ligado.
export const podeEscrever = () => configurado() && cfg.ligado && estado.permissoes.includes("ads_management");

// ---------------------------------------------------------------- chamadas
export class ErroMeta extends Error {
  constructor(msg, extra = {}) { super(msg); this.name = "ErroMeta"; Object.assign(this, extra); }
}
// Mensagens da Meta traduzidas para o que a pessoa precisa fazer a respeito.
function amigavel(e) {
  const cod = e.code, sub = e.error_subcode;
  if (e.error_user_msg) return e.error_user_msg;
  if (cod === 190) return "A chave de acesso expirou ou foi revogada. Gere outra e cole de novo em Configurações → Meta.";
  if (cod === 200 || cod === 10 || cod === 299) return "Esta chave não tem permissão para alterar campanhas. Falta a permissão ads_management na conta de anúncios.";
  if (cod === 17 || cod === 613 || sub === 2446079) return "A Meta limitou a quantidade de chamadas por agora. Espere alguns minutos e tente de novo.";
  if (cod === 2 || cod === 1) return "A Meta está instável neste momento. Tente de novo em alguns segundos.";
  if (cod === 100) return e.message || "A Meta recusou os dados enviados.";
  if (cod === 368) return "A conta de anúncios está com restrição. Resolva no Gerenciador de Anúncios antes.";
  return e.message || "A Meta recusou o comando.";
}
async function chamar(caminho, { metodo = "GET", dados = null, campos = null, corpo = null } = {}) {
  if (!cfg.token) throw new ErroMeta("Chave de acesso da Meta não configurada.");
  const url = new URL(`${BASE}/${cfg.versao}/${String(caminho).replace(/^\//, "")}`);
  const opcoes = { method: metodo };
  if (metodo === "GET") {
    url.searchParams.set("access_token", cfg.token);
    if (campos) url.searchParams.set("fields", campos);
    for (const [k, v] of Object.entries(dados || {})) url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : v);
  } else if (corpo) {
    // upload de arquivo: a chave vai dentro do formulário, nunca na URL
    corpo.set("access_token", cfg.token);
    opcoes.body = corpo;
  } else {
    const p = new URLSearchParams();
    p.set("access_token", cfg.token);
    for (const [k, v] of Object.entries(dados || {})) { if (v === undefined || v === null || v === "") continue; p.set(k, typeof v === "object" ? JSON.stringify(v) : String(v)); }
    opcoes.body = p;
  }
  let r, j;
  try { r = await fetch(url.toString(), opcoes); } catch (e) { throw new ErroMeta("Não consegui falar com a Meta. Verifique a internet deste aparelho."); }
  try { j = await r.json(); } catch { j = null; }
  if (!r.ok || (j && j.error)) {
    const e = (j && j.error) || { message: `Erro ${r.status}` };
    throw new ErroMeta(amigavel(e), { codigo: e.code, subcodigo: e.error_subcode, titulo: e.error_user_title, bruto: e });
  }
  return j;
}
export const get = (caminho, campos, dados) => chamar(caminho, { metodo: "GET", campos, dados });
export const post = (caminho, dados) => chamar(caminho, { metodo: "POST", dados });

// ---------------------------------------------------------------- verificação
export async function verificar() {
  estado.erro = "";
  try {
    const eu = await get("me", "id,name");
    const perms = await get("me/permissions");
    estado.permissoes = (perms.data || []).filter((p) => p.status === "granted").map((p) => p.permission);
    const conta = await get(cfg.conta, "name,currency,account_status,min_daily_budget,amount_spent,business_name,timezone_name");
    estado.perfil = eu; estado.conta = conta;
    estado.moeda = conta.currency || "BRL";
    estado.minimoDiario = num(conta.min_daily_budget) / 100;
    estado.verificado = true;
    return { eu, conta, permissoes: estado.permissoes };
  } catch (e) {
    estado.verificado = false; estado.erro = e.message;
    throw e;
  }
}
export const contaAtiva = () => estado.conta && Number(estado.conta.account_status) === 1;

// ---------------------------------------------------------------- leitura de um objeto
export const CAMPOS_STATUS = "id,name,status,effective_status,daily_budget,lifetime_budget,issues_info";
export async function situacao(id) { return get(id, CAMPOS_STATUS); }

// ---------------------------------------------------------------- comandos
export async function mudarStatus(id, status) {
  const r = await post(id, { status });
  return r;
}
export const pausar = (id) => mudarStatus(id, "PAUSED");
export const ativar = (id) => mudarStatus(id, "ACTIVE");

// Orçamento vai em centavos da moeda da conta. Conferimos o mínimo antes de enviar,
// porque a mensagem de erro da Meta para isso é confusa.
export async function definirOrcamentoDiario(id, reais) {
  const v = num(reais);
  if (!(v > 0)) throw new ErroMeta("Informe um orçamento diário maior que zero.");
  if (estado.minimoDiario && v < estado.minimoDiario) throw new ErroMeta(`O mínimo desta conta é ${estado.minimoDiario.toFixed(2)} por dia.`);
  return post(id, { daily_budget: Math.round(v * 100) });
}

// Duplicar é a forma mais segura de subir campanha: a cópia herda público, criativo,
// pixel e configuração de WhatsApp de algo que já roda. Sempre nasce pausada.
export async function duplicarCampanha(id, { sufixo = " (cópia)", ativa = false } = {}) {
  const r = await post(`${id}/copies`, {
    deep_copy: true,
    status_option: ativa ? "ACTIVE" : "PAUSED",
    rename_options: { rename_suffix: sufixo },
  });
  return r.copied_campaign_id || r.id || null;
}
export async function duplicarConjunto(id, { campanhaDestino = "", sufixo = " (cópia)", ativa = false } = {}) {
  const r = await post(`${id}/copies`, {
    deep_copy: true, campaign_id: campanhaDestino || undefined,
    status_option: ativa ? "ACTIVE" : "PAUSED", rename_options: { rename_suffix: sufixo },
  });
  return r.copied_adset_id || r.id || null;
}
export async function renomear(id, nome) { return post(id, { name: nome }); }

// ---------------------------------------------------------------- criar do zero
export const OBJETIVOS = [
  ["OUTCOME_ENGAGEMENT", "Mensagens (WhatsApp / Direct)", "whatsapp"],
  ["OUTCOME_SALES", "Vendas", "vendas"],
  ["OUTCOME_LEADS", "Cadastros (leads)", "leads"],
  ["OUTCOME_TRAFFIC", "Tráfego para um link", "trafego"],
  ["OUTCOME_AWARENESS", "Reconhecimento", "reconhecimento"],
];
const META_DO_OBJETIVO = {
  OUTCOME_ENGAGEMENT: { optimization_goal: "CONVERSATIONS", destination_type: "WHATSAPP", cta: "WHATSAPP_MESSAGE" },
  OUTCOME_SALES: { optimization_goal: "OFFSITE_CONVERSIONS", destination_type: "WEBSITE", cta: "SHOP_NOW" },
  OUTCOME_LEADS: { optimization_goal: "LEAD_GENERATION", destination_type: "ON_AD", cta: "SIGN_UP" },
  OUTCOME_TRAFFIC: { optimization_goal: "LINK_CLICKS", destination_type: "WEBSITE", cta: "LEARN_MORE" },
  OUTCOME_AWARENESS: { optimization_goal: "REACH", destination_type: "WEBSITE", cta: "LEARN_MORE" },
};

export async function paginas() {
  const r = await get("me/accounts", "id,name,link,picture{url}");
  return r.data || [];
}
export async function publicacoesDaPagina(pageId, limite = 12) {
  const r = await get(`${pageId}/posts`, "id,message,created_time,full_picture,permalink_url", { limit: limite });
  return (r.data || []).map((p) => ({ ...p, story_id: p.id }));
}
export async function enviarImagem(arquivo) {
  const fd = new FormData();
  fd.append("filename", arquivo, arquivo.name || "imagem.jpg");
  const r = await chamar(`${cfg.conta}/adimages`, { metodo: "POST", corpo: fd });
  const imgs = r.images || {};
  const primeira = Object.values(imgs)[0];
  if (!primeira || !primeira.hash) throw new ErroMeta("A Meta aceitou o arquivo mas não devolveu o identificador da imagem.");
  return primeira;
}

export function montarPublico({ paises = ["BR"], cidades = [], idade_min = 18, idade_max = 65, generos = [], interesses = [] } = {}) {
  const geo = {};
  if (cidades.length) geo.cities = cidades.map((c) => ({ key: c.key, radius: c.raio || 15, distance_unit: "kilometer" }));
  else geo.countries = paises;
  const alvo = { geo_locations: geo, age_min: Number(idade_min) || 18, age_max: Number(idade_max) || 65 };
  if (generos.length === 1) alvo.genders = generos;
  if (interesses.length) alvo.flexible_spec = [{ interests: interesses.map((i) => ({ id: i.id, name: i.name })) }];
  return alvo;
}
export async function buscarInteresses(termo) {
  const r = await get("search", "id,name,audience_size_lower_bound,audience_size_upper_bound", { type: "adinterest", q: termo, limit: 12 });
  return r.data || [];
}
export async function buscarCidades(termo) {
  const r = await get("search", "key,name,region,country_name", { type: "adgeolocation", location_types: JSON.stringify(["city"]), q: termo, limit: 10 });
  return r.data || [];
}

// Sobe a estrutura inteira. Se qualquer etapa falhar, a anterior fica pausada e o
// erro diz exatamente onde parou — nada some sem explicação.
export async function criarCampanha({
  nome, objetivo, orcamento_diario, pagina_id, publico, criativo,
  whatsapp = "", link = "", ativa = false, inicio = "",
}) {
  const passos = [];
  const conf = META_DO_OBJETIVO[objetivo] || META_DO_OBJETIVO.OUTCOME_TRAFFIC;
  const statusInicial = ativa ? "ACTIVE" : "PAUSED";
  try {
    const camp = await post(`${cfg.conta}/campaigns`, {
      name: nome, objective: objetivo, status: statusInicial,
      special_ad_categories: [], buying_type: "AUCTION",
    });
    passos.push({ etapa: "campanha", id: camp.id });

    const adset = {
      name: `${nome} — conjunto`, campaign_id: camp.id, status: statusInicial,
      daily_budget: Math.round(num(orcamento_diario) * 100),
      billing_event: "IMPRESSIONS", optimization_goal: conf.optimization_goal,
      targeting: publico, destination_type: conf.destination_type,
    };
    if (inicio) adset.start_time = inicio;
    if (objetivo === "OUTCOME_ENGAGEMENT") adset.promoted_object = { page_id: pagina_id };
    const set = await post(`${cfg.conta}/adsets`, adset);
    passos.push({ etapa: "conjunto", id: set.id });

    let creativeId = criativo.creative_id;
    if (!creativeId) {
      const spec = { page_id: pagina_id };
      if (criativo.story_id) {
        // impulsionar uma publicação que já existe na página
        const cr = await post(`${cfg.conta}/adcreatives`, { name: `${nome} — criativo`, object_story_id: criativo.story_id });
        creativeId = cr.id;
      } else {
        const destino = objetivo === "OUTCOME_ENGAGEMENT"
          ? (whatsapp ? `https://api.whatsapp.com/send?phone=${String(whatsapp).replace(/\D/g, "")}` : "https://api.whatsapp.com/send")
          : (link || "https://api.whatsapp.com/send");
        spec.link_data = {
          message: criativo.texto || "", link: destino, name: criativo.titulo || "",
          description: criativo.descricao || "",
          call_to_action: objetivo === "OUTCOME_ENGAGEMENT"
            ? { type: conf.cta, value: { app_destination: "WHATSAPP" } }
            : { type: conf.cta, value: { link: destino } },
        };
        if (criativo.image_hash) spec.link_data.image_hash = criativo.image_hash;
        const cr = await post(`${cfg.conta}/adcreatives`, { name: `${nome} — criativo`, object_story_spec: spec });
        creativeId = cr.id;
      }
      passos.push({ etapa: "criativo", id: creativeId });
    }

    const anuncio = await post(`${cfg.conta}/ads`, {
      name: `${nome} — anúncio`, adset_id: set.id, creative: { creative_id: creativeId }, status: statusInicial,
    });
    passos.push({ etapa: "anuncio", id: anuncio.id });
    return { campanha_id: camp.id, conjunto_id: set.id, criativo_id: creativeId, anuncio_id: anuncio.id, passos, status: statusInicial };
  } catch (e) {
    e.passos = passos;
    e.parcial = passos.length > 0;
    throw e;
  }
}
