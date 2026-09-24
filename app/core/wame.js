// Integração de mensagens (WhatsApp, Instagram e Messenger) pela API WAME (api-wa.me).
// Chamada direto do navegador: a API responde com CORS liberado, então não há servidor no meio.
//
// A chave da instância NÃO fica no banco sincronizado: ela mora só neste aparelho
// (localStorage), porque quem tem a chave controla o WhatsApp da loja.
import { db } from "./db.js?v=46e26fb2";
import { agora, hoje, telLimpo, uid, semAcento } from "./format.js?v=46e26fb2";

const CHAVE_CFG = "crm-trafego-wame";
export const BASES = ["https://us.api-wa.me", "https://server.api-wa.me"];
export const PROVIDERS = [["whatsapp", "WhatsApp", "💬"], ["instagram", "Instagram", "📸"], ["messenger", "Messenger", "💠"]];

export const cfg = {
  base: BASES[0], key: "",
  canais: { whatsapp: true, instagram: false, messenger: false },
  auto_lead: true, intervalo: 12, marcar_lido: true,
};
export const estado = {
  conectado: null, erro: "", carregando: false, ultima: null,
  perfil: null, chats: [], mensagens: {}, aberta: null, naoLidas: 0,
  canaisIndisponiveis: {}, diagnostico: "", oficial: null,
};

const ouvintes = new Set();
export const onMensagens = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
const avisar = (motivo) => { for (const f of ouvintes) { try { f(estado, motivo); } catch (e) { console.error(e); } } };

// ---------------------------------------------------------------- configuração
export function carregarCfg() {
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE_CFG) || "null");
    if (c) Object.assign(cfg, c, { canais: { ...cfg.canais, ...(c.canais || {}) } });
  } catch {}
  return cfg;
}
export function salvarCfg(patch) {
  Object.assign(cfg, patch, patch.canais ? { canais: { ...cfg.canais, ...patch.canais } } : {});
  try { localStorage.setItem(CHAVE_CFG, JSON.stringify(cfg)); } catch {}
  return cfg;
}
export function limparCfg() { cfg.key = ""; try { localStorage.removeItem(CHAVE_CFG); } catch {} pararPolling(); Object.assign(estado, { conectado: null, chats: [], mensagens: {}, perfil: null, erro: "" }); avisar("config"); }
export const configurado = () => !!cfg.key;
export const canaisAtivos = () => PROVIDERS.filter((p) => cfg.canais[p[0]]).map((p) => p[0]);

// ---------------------------------------------------------------- chamadas
function url(caminho, query) {
  const u = new URL(`${cfg.base}/${encodeURIComponent(cfg.key)}${caminho}`);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
  return u.toString();
}
let fila = Promise.resolve();
// Uma chamada de cada vez: a instância é a mesma para todos os pedidos e
// chamadas simultâneas atrapalham mais do que ajudam.
export function req(metodo, caminho, opcoes) {
  const proxima = fila.then(() => chamar(metodo, caminho, opcoes || {}), () => chamar(metodo, caminho, opcoes || {}));
  fila = proxima.catch(() => {});
  return proxima;
}
async function chamar(metodo, caminho, { query, body, timeout = 25000 } = {}) {
  if (!cfg.key) throw new Error("chave da instância não configurada");
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeout);
  let r;
  try {
    r = await fetch(url(caminho, query), { method: metodo, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal, cache: "no-store" });
  } catch (e) {
    clearTimeout(t);
    throw new Error(e.name === "AbortError" ? "a API demorou demais para responder" : "sem conexão com a API de mensagens");
  }
  clearTimeout(t);
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok) {
    const msg = (j && (j.message || j.reason)) || `erro ${r.status}`;
    if (r.status === 404) throw new Error("instância não encontrada: confira a chave (key) no portal");
    if (r.status === 401 || r.status === 403) throw new Error("chave sem permissão");
    const err = new Error(msg);
    err.status = r.status;
    err.canalDesligado = r.status === 422;
    err.soOficial = /oficial|cloud api|official/i.test(msg);
    err.jaConectada = /already connected|já (está )?conectad/i.test(msg);
    throw err;
  }
  return j;
}
// A API às vezes devolve { status, data } e às vezes o dado puro.
const corpo = (j) => (j && typeof j === "object" && "data" in j) ? j.data : j;

// ---------------------------------------------------------------- normalização
export function soDigitos(v) { return String(v || "").replace(/\D/g, ""); }
export function idDoChat(chatId) { return String(chatId || "").split("@")[0].split(":")[0]; }
export function ehGrupo(chatId) { return String(chatId || "").includes("@g.us"); }
export function ehStatus(chatId) { return String(chatId || "").startsWith("status@"); }
// Compara telefones tolerando o nono dígito e o código do país.
export function mesmoTelefone(a, b) {
  const x = telLimpo(a), y = telLimpo(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const fim = (s) => s.slice(-8);
  return fim(x) === fim(y) && x.slice(-11, -8).replace(/^9/, "") === y.slice(-11, -8).replace(/^9/, "");
}

function normalizarChat(c, provider) {
  const id = c.chatId || c.id || c.jid || c.remoteJid || "";
  const contato = c.contact || {};
  return {
    id, provider,
    telefone: provider === "whatsapp" ? idDoChat(contato.phone || id) : "",
    externo: idDoChat(id),
    nome: (contato.name || c.name || c.pushName || c.subject || c.notify || "").trim(),
    grupo: ehGrupo(id),
    ts: Number(c.timestamp || c.conversationTimestamp || c.messageTimestamp || c.lastMessageTime || 0) || 0,
    naoLidas: Number(c.unreadCount ?? c.unread ?? 0) || 0,
    fixado: !!(c.pinned || c.fixado),
    previa: textoDaMensagem(c.lastMessage || c.ultimaMensagem) || c.preview || "",
  };
}
// Extrai o texto de uma mensagem no formato Baileys (não oficial) ou Meta (oficial).
export function textoDaMensagem(m) {
  if (!m) return "";
  if (typeof m === "string") return m;
  const msg = desembrulhar(m);
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.text?.body) return msg.text.body;
  if (typeof msg.text === "string") return msg.text;
  if (msg.imageMessage) return msg.imageMessage.caption || "";
  if (msg.videoMessage) return msg.videoMessage.caption || "";
  if (msg.documentMessage) return msg.documentMessage.caption || msg.documentMessage.fileName || "";
  if (msg.buttonsResponseMessage?.selectedDisplayText) return msg.buttonsResponseMessage.selectedDisplayText;
  if (msg.listResponseMessage?.title) return msg.listResponseMessage.title;
  if (msg.templateButtonReplyMessage?.selectedDisplayText) return msg.templateButtonReplyMessage.selectedDisplayText;
  if (msg.reactionMessage?.text) return msg.reactionMessage.text;
  if (msg.ephemeralMessage) return textoDaMensagem(msg.ephemeralMessage);
  if (msg.viewOnceMessage || msg.viewOnceMessageV2) return textoDaMensagem(msg.viewOnceMessage || msg.viewOnceMessageV2);
  if (msg.caption) return msg.caption;
  if (msg.pollCreationMessage?.name) return msg.pollCreationMessage.name;
  if (msg.pollCreationMessageV3?.name) return msg.pollCreationMessageV3.name;
  if (msg.locationMessage?.name || msg.locationMessage?.address) return msg.locationMessage.name || msg.locationMessage.address;
  if (msg.contactMessage?.displayName) return msg.contactMessage.displayName;
  if (msg.listMessage?.description) return msg.listMessage.description;
  if (msg.templateMessage?.hydratedTemplate?.hydratedContentText) return msg.templateMessage.hydratedTemplate.hydratedContentText;
  if (msg.interactiveMessage?.body?.text) return msg.interactiveMessage.body.text;
  if (msg.eventMessage?.name) return msg.eventMessage.name;
  if (msg.groupInviteMessage?.groupName) return "Convite para o grupo " + msg.groupInviteMessage.groupName;
  return "";
}
// Mensagens chegam embrulhadas (efêmera, ver uma vez, editada, enviada por
// outro aparelho). Desembrulhar antes de olhar o tipo evita o "(sem texto)".
const EMBRULHOS = ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension", "documentWithCaptionMessage", "editedMessage", "deviceSentMessage", "protocolMessage"];
export function desembrulhar(m, profundidade = 0) {
  let msg = (m && (m.message || m)) || {};
  if (profundidade > 4) return msg;
  for (const e of EMBRULHOS) {
    if (msg[e] && typeof msg[e] === "object") {
      const dentro = msg[e].message || msg[e].editedMessage || msg[e];
      if (dentro && typeof dentro === "object" && dentro !== msg) return desembrulhar({ message: dentro }, profundidade + 1);
    }
  }
  return msg;
}
const TIPO_POR_CHAVE = {
  imageMessage: "imagem", videoMessage: "video", ptvMessage: "video", audioMessage: "audio", pttMessage: "audio",
  documentMessage: "documento", stickerMessage: "figurinha", locationMessage: "localizacao", liveLocationMessage: "localizacao",
  contactMessage: "contato", contactsArrayMessage: "contato", reactionMessage: "reacao",
  pollCreationMessage: "enquete", pollCreationMessageV2: "enquete", pollCreationMessageV3: "enquete", pollUpdateMessage: "enquete",
  callLogMesssage: "chamada", scheduledCallCreationMessage: "chamada", orderMessage: "pedido", productMessage: "produto",
  listMessage: "lista", buttonsMessage: "botoes", templateMessage: "modelo", interactiveMessage: "interativo",
  paymentInviteMessage: "pagamento", requestPaymentMessage: "pagamento", sendPaymentMessage: "pagamento",
  groupInviteMessage: "convite", eventMessage: "evento", senderKeyDistributionMessage: "sistema",
};
export function tipoDaMensagem(m) {
  const msg = desembrulhar(m);
  for (const chave of Object.keys(TIPO_POR_CHAVE)) if (msg[chave]) return TIPO_POR_CHAVE[chave];
  const t = msg.type || (m && m.type);
  if (t && TIPO_POR_CHAVE[t + "Message"]) return TIPO_POR_CHAVE[t + "Message"];
  if (["image", "video", "audio", "document", "sticker", "location", "contact"].includes(t)) return { image: "imagem", video: "video", audio: "audio", document: "documento", sticker: "figurinha", location: "localizacao", contact: "contato" }[t];
  if (msg.image || msg.video || msg.audio || msg.document) return msg.image ? "imagem" : msg.video ? "video" : msg.audio ? "audio" : "documento";
  if (m && (m.messageStubType || msg.protocolMessage)) return "sistema";
  return "texto";
}
// Contexto de anúncio (Click-to-WhatsApp): usado para atribuir o lead à campanha.
export function contextoAnuncio(m) {
  const msg = (m && (m.message || m)) || {};
  const ctx = msg.extendedTextMessage?.contextInfo || msg.imageMessage?.contextInfo || msg.videoMessage?.contextInfo || msg.contextInfo || {};
  const ext = ctx.externalAdReply || null;
  const ref = m?.referral || msg.referral || null;
  if (!ext && !ref && !ctx.conversionSource && !ctx.entryPointConversionSource) return null;
  return {
    titulo: (ext && (ext.title || ext.body)) || (ref && (ref.headline || ref.body)) || "",
    fonte: ctx.conversionSource || ctx.entryPointConversionSource || (ref && ref.source_type) || "anuncio",
    ctwa: ctx.ctwaClid || (ref && ref.ctwa_clid) || "",
    id_anuncio: (ref && (ref.source_id || ref.ad_id)) || ctx.entryPointConversionApp || "",
    url: (ext && ext.sourceUrl) || (ref && ref.source_url) || "",
  };
}
// Com "Salvar mídia no S3" ligado, a instância troca o arquivo por uma URL
// pronta dentro da própria mensagem. Quando ela existe, é a melhor opção:
// abre direto, sem passar pelo endpoint de download.
const CDN_CRIPTOGRAFADA = /(whatsapp\.net|\.enc(\?|$))/i;
export function urlDeMidia(m) {
  const msg = (m && (m.message || m)) || {};
  const nos = [msg.imageMessage, msg.videoMessage, msg.audioMessage, msg.documentMessage, msg.stickerMessage, msg.ptvMessage, msg.image, msg.video, msg.audio, msg.document, m, msg];
  for (const n of nos) {
    if (!n || typeof n !== "object") continue;
    for (const k of ["mediaUrl", "media_url", "fileUrl", "file_url", "s3Url", "s3_url", "downloadUrl", "download_url", "url", "link"]) {
      const v = n[k];
      if (typeof v === "string" && /^https?:\/\//i.test(v) && !CDN_CRIPTOGRAFADA.test(v)) return v;
    }
  }
  return "";
}

function normalizarMensagem(m, chatId) {
  const key = m.key || {};
  const ts = Number(m.messageTimestamp || m.timestamp || key.timestamp || 0) || 0;
  return {
    id: key.id || m.id || uid(),
    chatId: key.remoteJid || m.chatId || chatId,
    minha: !!(key.fromMe ?? m.fromMe),
    ts: ts > 1e12 ? Math.round(ts / 1000) : ts,
    texto: textoDaMensagem(m),
    tipo: tipoDaMensagem(m),
    status: m.status || "",
    autor: m.pushName || m.notify || "",
    midia_url: urlDeMidia(m),
    anuncio: contextoAnuncio(m),
  };
}

// ---------------------------------------------------------------- endpoints
export async function instancia() { return corpo(await req("GET", "/instance")); }
// A API não fixa o nome do campo de status; aceitamos as formas conhecidas e,
// quando nenhuma aparece, devolvemos null (desconhecido) em vez de "desconectado".
export function lerConexao(d) {
  if (!d || typeof d !== "object") return null;
  const alvo = d.instance || d.data || d;
  for (const k of ["phoneConnected", "phone_connected", "connected", "isConnected", "loggedIn", "logged_in", "online", "conectado"]) {
    if (typeof alvo[k] === "boolean") return alvo[k];
  }
  for (const k of ["state", "status", "connection", "connectionState", "connectionStatus", "situacao"]) {
    const v = alvo[k];
    if (typeof v === "string") {
      const t = v.toLowerCase();
      if (["open", "connected", "online", "authenticated", "ready", "conectado", "conectada", "active"].includes(t)) return true;
      if (["close", "closed", "disconnected", "offline", "qr", "qrcode", "connecting", "pending", "desconectado", "desconectada", "logged_out"].includes(t)) return false;
    }
  }
  if (alvo.user || alvo.wid || alvo.me || alvo.jid || alvo.phone || alvo.number) return true;
  return null;
}
export function lerOficial(d) {
  const alvo = (d && (d.instance || d.data || d)) || {};
  for (const k of ["official", "oficial", "isOfficial", "cloudApi", "cloud_api"]) if (typeof alvo[k] === "boolean") return alvo[k];
  if (typeof alvo.provider === "string") return /official|cloud/i.test(alvo.provider);
  if (typeof alvo.type === "string") return /official|cloud/i.test(alvo.type);
  return null;
}
export async function conectarQr() { return corpo(await req("POST", "/instance")); }
export async function desconectarInstancia() { return corpo(await req("DELETE", "/instance")); }
export async function listarChats(provider = "whatsapp") {
  const d = corpo(await req("GET", "/chat", { query: { provider } })) || [];
  const arr = Array.isArray(d) ? d : (d.chats || []);
  return arr.map((c) => normalizarChat(c, provider)).filter((c) => c.id && !ehStatus(c.id));
}
export async function listarMensagens(chatId, { page = 1, limit = 50 } = {}) {
  let d;
  try { d = corpo(await req("GET", "/chat/messages", { query: { chatId, page, limit } })); }
  catch (e) { d = corpo(await req("GET", `/chat/${encodeURIComponent(chatId)}`, { query: { page, limit } })); }
  const arr = Array.isArray(d) ? d : (d?.messages || d?.data || []);
  return arr.map((m) => normalizarMensagem(m, chatId)).sort((a, b) => a.ts - b.ts);
}
export async function enviarTexto(chat, texto) {
  const to = chat.provider === "whatsapp" ? (chat.telefone || idDoChat(chat.id)) : idDoChat(chat.id);
  return corpo(await req("POST", "/message/text", { body: { to, text: texto, provider: chat.provider } }));
}
export async function marcarLido(chat) {
  try { await req("PATCH", "/chat", { query: { id: chat.id, action: "markRead", value: true } }); } catch {}
}
export async function digitando(chat, ligado = true) {
  const to = chat.provider === "whatsapp" ? (chat.telefone || idDoChat(chat.id)) : idDoChat(chat.id);
  try { await req("POST", "/message/presence", { body: { to, status: ligado ? "composing" : "paused", provider: chat.provider } }); } catch {}
}
// A API devolve JSON com base64 por padrão; ?format=binary entrega o arquivo,
// que é o que <img>, <audio> e <video> conseguem abrir direto.
export function marcarMidiaOk(mensagemId, url) { if (mensagemId && url) midiaPronta.set(mensagemId, url); }
export function marcarMidiaRuim(mensagemId) { if (mensagemId) midiaRuim.add(mensagemId); }
export function urlMidia(mensagemId, formato = "binary") {
  if (!cfg.key || !mensagemId) return "";
  return `${cfg.base}/${encodeURIComponent(cfg.key)}/message/${encodeURIComponent(mensagemId)}/media?format=${formato}`;
}
// Terceira tentativa: pedir o arquivo em JSON (base64) e montar um data: URL.
// Cobre instâncias em que o download binário não funciona ou devolve JSON mesmo assim.
const cacheMidia = new Map();
const midiaPronta = new Map();   // já resolvida: reusa sem pedir de novo
const midiaRuim = new Set();     // não existe mesmo: não insiste a cada tela
export const urlMidiaPronta = (id) => midiaPronta.get(id) || "";
export const midiaIndisponivel = (id) => midiaRuim.has(id);
export function esquecerMidia(id) { midiaRuim.delete(id); midiaPronta.delete(id); cacheMidia.delete(id); }
export function midiaComoUrl(mensagemId) {
  if (!mensagemId) return Promise.reject(new Error("sem id da mensagem"));
  if (midiaPronta.has(mensagemId)) return Promise.resolve(midiaPronta.get(mensagemId));
  if (midiaRuim.has(mensagemId)) return Promise.reject(new Error("arquivo não disponível"));
  if (cacheMidia.has(mensagemId)) return cacheMidia.get(mensagemId);
  const promessa = (async () => {
    const j = await req("GET", `/message/${encodeURIComponent(mensagemId)}/media`, { query: { format: "json" }, timeout: 45000 });
    const d = corpo(j) || {};
    const bruto = typeof d === "string" ? d : (d.base64 || d.data || d.media || d.file || d.buffer || d.content || "");
    if (!bruto || typeof bruto !== "string") throw new Error("a API não devolveu o arquivo");
    if (/^data:/.test(bruto)) return bruto;
    if (/^https?:\/\//i.test(bruto)) return bruto;
    const mime = d.mimetype || d.mime || d.contentType || d.content_type || "application/octet-stream";
    return `data:${mime};base64,${bruto.replace(/^base64,/, "")}`;
  })();
  cacheMidia.set(mensagemId, promessa);
  promessa.then((u) => midiaPronta.set(mensagemId, u)).catch(() => { midiaRuim.add(mensagemId); cacheMidia.delete(mensagemId); });
  return promessa;
}

// Liga/desliga opções da instância (salvar mídia, marcar como lida, presença).
export async function ajustarInstancia({ saveMedia, markMessageRead, receiveStatusMessage, receivePresence } = {}) {
  const atualCfg = (estado.perfil && (estado.perfil.settings || estado.perfil)) || {};
  const q = {
    markMessageRead: markMessageRead ?? !!atualCfg.markMessageRead,
    saveMedia: saveMedia ?? !!atualCfg.saveMedia,
    receiveStatusMessage: receiveStatusMessage ?? !!atualCfg.receiveStatusMessage,
    receivePresence: receivePresence ?? !!atualCfg.receivePresence,
  };
  return corpo(await req("PATCH", "/instance", { query: q }));
}
export function salvaMidia() {
  const c = (estado.perfil && (estado.perfil.settings || estado.perfil)) || {};
  return c.saveMedia === undefined ? null : !!c.saveMedia;
}
export async function sincronizarHistoricoMeta() { return corpo(await req("POST", "/instance/meta/history-sync", { query: { hours: 168 }, timeout: 60000 })); }

// ---------------------------------------------------------------- ligação com o CRM
export function leadDoChat(chat) {
  const leads = db.all("leads");
  let l = leads.find((x) => x.wa_chat_id === chat.id);
  if (l) return l;
  if (chat.provider === "whatsapp" && chat.telefone) {
    l = leads.find((x) => mesmoTelefone(x.whatsapp, chat.telefone) || mesmoTelefone(x.phone, chat.telefone));
    if (l) { db.update("leads", l.id, { wa_chat_id: chat.id, wa_provider: chat.provider }); return l; }
  }
  return null;
}
// Procura a campanha da qual o lead veio, pelo contexto de anúncio da primeira mensagem.
function campanhaDoAnuncio(ad) {
  if (!ad) return null;
  if (ad.id_anuncio) {
    const anuncio = db.all("ads").find((a) => a.external_id === ad.id_anuncio);
    if (anuncio) return { campaign_id: anuncio.campaign_id, ad_id: anuncio.id, creative_id: anuncio.creative_id };
    const camp = db.all("campaigns").find((c) => c.external_id === ad.id_anuncio);
    if (camp) return { campaign_id: camp.id };
  }
  if (ad.titulo) {
    const alvo = semAcento(ad.titulo);
    const cr = db.all("creatives").find((c) => c.name && semAcento(c.name) === alvo);
    if (cr) return { campaign_id: cr.campaign_id || "", creative_id: cr.id };
    const camp = db.all("campaigns").find((c) => c.name && semAcento(c.name) === alvo);
    if (camp) return { campaign_id: camp.id };
  }
  return null;
}
export function criarLeadDoChat(chat, primeiraMensagem) {
  const origem = { whatsapp: "whatsapp", instagram: "meta", messenger: "meta" }[chat.provider] || "outro";
  const quando = chat.ts ? new Date(chat.ts * 1000).toISOString() : agora();
  const canal = { whatsapp: "WhatsApp", instagram: "Instagram Direct", messenger: "Messenger" }[chat.provider] || chat.provider;
  const dados = {
    name: chat.nome || (chat.provider === "whatsapp" ? chat.telefone : `${chat.provider} ${chat.externo.slice(-6)}`) || "Sem nome",
    whatsapp: chat.provider === "whatsapp" ? chat.telefone : "",
    source: origem, stage: "novo", entered_at: quando.slice(0, 10), arrived_at: quando,
    wa_chat_id: chat.id, wa_provider: chat.provider,
    landing: canal + (chat.provider === "whatsapp" && chat.telefone ? "" : " · " + chat.externo),
    first_touch: canal, last_touch: canal,
    notes: chat.provider === "whatsapp" ? "" : `${chat.provider}: ${chat.externo}`,
  };
  const ad = primeiraMensagem && primeiraMensagem.anuncio;
  if (ad) {
    dados.click_id = ad.ctwa || "";
    dados.utm_source = chat.provider === "whatsapp" ? "meta" : chat.provider;
    dados.utm_medium = "paid";
    dados.utm_content = ad.titulo || "";
    dados.landing = ad.url || dados.landing;
    dados.first_touch = `Anúncio${ad.titulo ? ": " + ad.titulo : ""}`;
    dados.last_touch = dados.first_touch;
  }
  const atrib = campanhaDoAnuncio(ad);
  if (atrib) {
    Object.assign(dados, atrib);
    const anuncio = atrib.ad_id && db.get("ads", atrib.ad_id);
    if (anuncio && anuncio.ad_set_id) dados.ad_set_id = anuncio.ad_set_id;
    const camp = atrib.campaign_id && db.get("campaigns", atrib.campaign_id);
    if (camp) dados.utm_campaign = camp.name;
  }
  const lead = db.insert("leads", dados);
  db.insert("interactions", { lead_id: lead.id, type: chat.provider === "whatsapp" ? "whatsapp" : "nota", at: agora(), user_id: "", text: `Primeira mensagem recebida${ad ? ` (veio do anúncio "${ad.titulo || ad.fonte}")` : ""}: ${(primeiraMensagem?.texto || "").slice(0, 200) || "(sem texto)"}` });
  return lead;
}
// A listagem de conversas não traz a última mensagem, então buscamos algumas
// por rodada e guardamos: serve para a prévia na lista e para decidir se a
// conversa vira lead, sem repetir download a cada atualização.
export const NOME_TIPO = { imagem: "📷 Foto", audio: "🎧 Áudio", video: "🎬 Vídeo", documento: "📎 Documento", figurinha: "🌟 Figurinha", localizacao: "📍 Localização", contato: "👤 Contato", reacao: "❤️ Reação", enquete: "📊 Enquete", chamada: "📞 Chamada", pedido: "🧾 Pedido", produto: "🛍️ Produto", lista: "📋 Lista", botoes: "🔘 Botões", modelo: "📄 Modelo", interativo: "📲 Interativo", pagamento: "💳 Pagamento", convite: "👥 Convite", evento: "📅 Evento", sistema: "⚙️ Mensagem do sistema", texto: "" };
const resumoChat = new Map();
export function resumoDe(chatId) { return resumoChat.get(chatId) || null; }
export async function examinarChats(chats, max = 6) {
  let n = 0;
  for (const chat of chats) {
    const cache = resumoChat.get(chat.id);
    if (cache && cache.ts === chat.ts) continue;
    if (n >= max) break;
    n++;
    try {
      const msgs = await listarMensagens(chat.id, { limit: 6 });
      const ultima = msgs[msgs.length - 1];
      const entrada = msgs.find((m) => !m.minha);
      resumoChat.set(chat.id, {
        ts: chat.ts,
        previa: ultima ? (ultima.texto || NOME_TIPO[ultima.tipo] || "") : "",
        temEntrada: !!entrada,
        primeira: entrada || msgs[0] || null,
      });
    } catch { resumoChat.set(chat.id, { ts: chat.ts, previa: "", temEntrada: false, primeira: null }); }
  }
  return n;
}

// Cria leads para conversas novas que ainda não estão no CRM.
export function sincronizarLeads(chats) {
  if (!cfg.auto_lead) return 0;
  let n = 0;
  for (const chat of chats) {
    if (chat.grupo || leadDoChat(chat)) continue;
    const r = resumoChat.get(chat.id);
    if (!r || !r.temEntrada) continue;   // só vira lead quem escreveu para a loja
    criarLeadDoChat(chat, r.primeira); n++;
    if (n >= 10) break;                  // não cria uma enxurrada de uma vez
  }
  return n;
}

// ---------------------------------------------------------------- polling
let timer = null, ocupado = false;
let falhasSeguidas = 0;
export async function atualizar({ comMensagens = true } = {}) {
  if (!configurado() || ocupado) return;
  ocupado = true; estado.carregando = true; avisar("carregando");
  try {
    const canais = canaisAtivos();
    let todos = [], falhas = [];
    const indisponiveis = {};
    for (const p of canais) {
      try { todos = todos.concat(await listarChats(p)); }
      catch (e) {
        if (e.canalDesligado) indisponiveis[p] = e.message || "canal não conectado nesta instância";
        else falhas.push(e.message);
      }
    }
    estado.canaisIndisponiveis = indisponiveis;
    if (falhas.length && !todos.length) throw new Error(falhas[0]);
    estado.erro = falhas[0] || "";
    // Primeiro as conversas que a pessoa vê no topo da lista.
    try { await examinarChats(todos.slice(0, 40), 4); } catch {}
    for (const c of todos) { const r = resumoChat.get(c.id); if (r && !c.previa) c.previa = r.previa; }
    todos.sort((a, b) => (b.fixado ? 1 : 0) - (a.fixado ? 1 : 0) || b.ts - a.ts);
    estado.chats = todos;
    estado.naoLidas = todos.reduce((s, c) => s + (c.naoLidas || 0), 0);
    if (!estado.erro) { estado.conectado = true; falhasSeguidas = 0; }
    estado.ultima = agora();
    try { sincronizarLeads(todos); } catch (e) { console.warn("auto-lead:", e.message); }
    if (comMensagens && estado.aberta) {
      const chat = todos.find((c) => c.id === estado.aberta) || { id: estado.aberta };
      try { estado.mensagens[chat.id] = await listarMensagens(chat.id, { limit: 60 }); } catch {}
    }
  } catch (e) {
    // Uma falha isolada (internet oscilando) não apaga as conversas já carregadas
    // nem muda o status: só a segunda seguida vira aviso.
    falhasSeguidas++;
    if (falhasSeguidas >= 2) { estado.erro = e.message; estado.conectado = false; }
  } finally { ocupado = false; estado.carregando = false; avisar("atualizou"); }
}
export function iniciarPolling() {
  pararPolling();
  if (!configurado()) return;
  const ms = Math.max(6, Number(cfg.intervalo) || 12) * 1000;
  timer = setInterval(() => { if (document.visibilityState === "visible") atualizar(); }, ms);
  atualizar();
}
export function pararPolling() { clearInterval(timer); timer = null; }
export async function abrirConversa(chatId) {
  estado.aberta = chatId;
  if (!chatId) return;
  try { estado.mensagens[chatId] = await listarMensagens(chatId, { limit: 60 }); avisar("mensagens"); } catch (e) { estado.erro = e.message; avisar("erro"); }
  const chat = estado.chats.find((c) => c.id === chatId);
  if (chat && cfg.marcar_lido && chat.naoLidas) { await marcarLido(chat); chat.naoLidas = 0; estado.naoLidas = estado.chats.reduce((s, c) => s + (c.naoLidas || 0), 0); avisar("lido"); }
}
export async function verificarConexao() {
  try {
    const d = await instancia();
    estado.perfil = (d && (d.instance || d)) || null;
    estado.oficial = lerOficial(d);
    estado.diagnostico = JSON.stringify(d, null, 1).slice(0, 1200);
    let conectado = lerConexao(d);
    if (conectado === null) {
      // O status não veio num campo conhecido: vale mais o teste prático —
      // se a instância lista conversas, ela está funcionando.
      try { await listarChats(canaisAtivos()[0] || "whatsapp"); conectado = true; }
      catch (e) { conectado = e.canalDesligado ? null : false; }
    }
    estado.conectado = conectado;
    estado.erro = "";
    return d;
  } catch (e) { estado.erro = e.message; estado.conectado = false; throw e; }
  finally { avisar("conexao"); }
}
export function respostasRapidas() {
  const s = db.settings();
  return Array.isArray(s.respostas_rapidas) ? s.respostas_rapidas : [
    { id: "r1", titulo: "Saudação", texto: "Olá! Tudo bem? Aqui é da loja. Como posso ajudar?" },
    { id: "r2", titulo: "Preço", texto: "O valor é R$ ___. Aceitamos Pix, cartão e crediário." },
    { id: "r3", titulo: "Endereço", texto: "Estamos na ___. Funcionamos de segunda a sábado." },
    { id: "r4", titulo: "Follow-up", texto: "Oi! Passando para saber se ainda tem interesse. Posso separar para você?" },
  ];
}
export function salvarRespostas(lista) { db.setSettings({ respostas_rapidas: lista }); }
