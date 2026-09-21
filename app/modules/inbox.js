// Caixa de entrada: WhatsApp, Instagram e Messenger numa tela só, ligada aos leads.
import { db } from "../core/db.js?v=43ebd473";
import * as W from "../core/wame.js?v=43ebd473";
import { cartao, vazio, badge, badgeOpcao, abrirFormulario, toast, itemLista, modal, fecharModal } from "../core/ui.js?v=43ebd473";
import { esc, brl, dataBR, horaCurta, hoje, somaDias, agora, waLink, semAcento, telLimpo } from "../core/format.js?v=43ebd473";
import { rotulo as rotuloOpcao, OPCOES } from "../core/schema.js?v=43ebd473";
import { podeEditar, usuario } from "../core/auth.js?v=43ebd473";
import { abrirVenda } from "./vendas.js?v=43ebd473";
import { registrarInteracao, mudarEtapa, marcarPrimeiroContato, marcarPrimeiraResposta } from "./leads.js?v=43ebd473";

let canal = "", busca = "", filtro = "todas";
const rascunhos = new Map();
let ligado = false, ctxAtual = null;

function horaMsg(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000), h = hoje();
  const dia = d.toISOString().slice(0, 10);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (dia === h) return hora;
  if (dia === somaDias(h, -1)) return "ontem " + hora;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + hora;
}
const iconeCanal = (p) => (W.PROVIDERS.find((x) => x[0] === p) || [, , "💬"])[2];

function conversas() {
  const b = semAcento(busca.trim());
  return W.estado.chats.filter((c) => {
    if (canal && c.provider !== canal) return false;
    if (filtro === "nao_lidas" && !c.naoLidas) return false;
    if (filtro === "sem_lead" && (c.grupo || W.leadDoChat(c))) return false;
    if (filtro === "abertos") { const l = W.leadDoChat(c); if (!l || ["venda", "perdido"].includes(l.stage)) return false; }
    if (!b) return true;
    const l = W.leadDoChat(c);
    return semAcento(`${c.nome} ${c.telefone} ${c.externo} ${(l && l.name) || ""} ${c.previa}`).includes(b);
  });
}

function listaHtml(abertaId) {
  const lista = conversas();
  if (!lista.length) return vazio(W.estado.chats.length ? "Nenhuma conversa neste filtro." : (W.estado.carregando ? "Carregando conversas…" : "Nenhuma conversa ainda."));
  return lista.map((c) => {
    const lead = W.leadDoChat(c);
    const nome = (lead && lead.name) || c.nome || (c.provider === "whatsapp" ? c.telefone : c.externo);
    return `<button class="conv${c.id === abertaId ? " ativa" : ""}" data-conv="${esc(c.id)}">
      <span class="conv-avatar">${esc((nome || "?").trim()[0].toUpperCase())}<i>${iconeCanal(c.provider)}</i></span>
      <span class="conv-txt"><span class="conv-topo"><b>${esc(nome)}</b><small>${esc(horaMsg(c.ts))}</small></span>
      <span class="conv-previa">${c.grupo ? "👥 " : ""}${esc((c.previa || "").slice(0, 60)) || "<i>sem prévia</i>"}</span>
      <span class="conv-tags">${lead ? badgeOpcao("lead_stage", lead.stage) : (c.grupo ? badge("grupo", "cinza") : badge("sem lead", "amarelo"))}</span></span>
      ${c.naoLidas ? `<span class="conv-n">${c.naoLidas}</span>` : ""}</button>`;
  }).join("");
}

const NOME_MIDIA = { imagem: "🖼️ imagem", audio: "🎧 áudio", video: "🎬 vídeo", documento: "📎 documento", figurinha: "🌟 figurinha", localizacao: "📍 localização", contato: "👤 contato", reacao: "❤️ reação" };
// Cada tipo de anexo é mostrado do jeito que dá para usar: imagem aparece,
// áudio e vídeo tocam na hora, documento vira link. Se a instância não guardou
// a mídia, sobra o aviso com link, em vez de um quadrado quebrado.
function corpoMidia(m, url) {
  if (m.tipo === "texto") return "";
  const rotulo = NOME_MIDIA[m.tipo] || m.tipo;
  if (!url) return `<span class="msg-midia">${rotulo}</span>`;
  if (m.tipo === "imagem" || m.tipo === "figurinha") {
    return `<a class="msg-midia-link" href="${esc(url)}" target="_blank" rel="noopener" data-ver-imagem="${esc(url)}"><img class="msg-img${m.tipo === "figurinha" ? " figurinha" : ""}" src="${esc(url)}" alt="${esc(rotulo)}" loading="lazy" onerror="this.parentNode.outerHTML='<a class=msg-midia href=&quot;${esc(url)}&quot; target=_blank rel=noopener>${esc(rotulo)} · abrir</a>'"></a>`;
  }
  if (m.tipo === "audio") return `<audio class="msg-audio" controls preload="none" src="${esc(url)}"></audio>`;
  if (m.tipo === "video") return `<video class="msg-video" controls preload="metadata" src="${esc(url)}"></video>`;
  if (m.tipo === "documento") return `<a class="msg-midia" href="${esc(url)}" target="_blank" rel="noopener" download>${rotulo} · baixar</a>`;
  return `<span class="msg-midia">${rotulo}</span>`;
}

function painelLead(chat) {
  const lead = W.leadDoChat(chat);
  if (!lead) return `<div class="thread-lead"><span>Nenhum lead ligado a esta conversa.</span>${podeEditar() && !chat.grupo ? `<button class="btn btn-pq btn-primario" data-criar-lead>➕ Criar lead</button>` : ""}</div>`;
  const prod = db.get("products", lead.product_id), camp = db.get("campaigns", lead.campaign_id);
  return `<div class="thread-lead">
    <span><a href="#/leads/${lead.id}"><b>${esc(lead.name)}</b></a> ${badgeOpcao("lead_stage", lead.stage)}
    ${lead.potential_value ? " · " + brl(lead.potential_value) : ""}${prod ? " · " + esc(prod.name) : ""}${camp ? ` · <a href="#/campanhas/${camp.id}">${esc(camp.name)}</a>` : ""}</span>
    ${podeEditar() ? `<span class="thread-acoes">
      <select data-etapa-lead title="Etapa">${OPCOES.lead_stage.map(([v, t]) => `<option value="${v}"${lead.stage === v ? " selected" : ""}>${t}</option>`).join("")}</select>
      <button class="btn btn-pq" data-followup title="Agendar follow-up para amanhã">⏰</button>
      <button class="btn btn-pq" data-nota title="Registrar anotação">📝</button>
      <button class="btn btn-pq btn-verde" data-venda>💰 Venda</button>
    </span>` : ""}</div>`;
}

function threadHtml(chat) {
  if (!chat) return `<div class="thread-vazia">${W.configurado() ? "Escolha uma conversa à esquerda." : "Configure a chave da API em Configurações → Mensagens para ver as conversas."}</div>`;
  const msgs = W.estado.mensagens[chat.id] || [];
  const lead = W.leadDoChat(chat);
  const nome = (lead && lead.name) || chat.nome || chat.telefone || chat.externo;
  let diaAtual = "";
  const bolhas = msgs.map((m) => {
    const dia = m.ts ? new Date(m.ts * 1000).toISOString().slice(0, 10) : "";
    let sep = "";
    if (dia && dia !== diaAtual) { diaAtual = dia; sep = `<div class="msg-dia">${dia === hoje() ? "Hoje" : dia === somaDias(hoje(), -1) ? "Ontem" : dataBR(dia)}</div>`; }
    const url = W.urlMidia(m.id);
    const anexo = corpoMidia(m, url);
    return `${sep}<div class="msg ${m.minha ? "minha" : "dele"}">${anexo}${m.texto ? `<span class="msg-txt">${esc(m.texto)}</span>` : (anexo ? "" : `<span class="msg-txt"><i>(sem texto)</i></span>`)}${m.anuncio ? `<span class="msg-ad">📣 veio do anúncio${m.anuncio.titulo ? ": " + esc(m.anuncio.titulo) : ""}</span>` : ""}<span class="msg-hora">${esc(horaMsg(m.ts))}${m.minha && m.status ? " ✓" : ""}</span></div>`;
  }).join("");
  const rr = W.respostasRapidas();
  return `<div class="thread-cab">
      <button class="btn btn-pq so-celular" data-voltar>←</button>
      <span class="conv-avatar">${esc((nome || "?").trim()[0].toUpperCase())}<i>${iconeCanal(chat.provider)}</i></span>
      <span class="thread-nome"><b>${esc(nome)}</b><small>${esc(chat.provider === "whatsapp" ? (chat.telefone || "") : `${chat.provider} · ${chat.externo}`)}${chat.grupo ? " · grupo" : ""}</small></span>
      ${chat.provider === "whatsapp" && chat.telefone ? `<a class="btn btn-pq" href="${esc(waLink(chat.telefone))}" target="_blank" rel="noopener" title="Abrir no WhatsApp">↗</a>` : ""}
    </div>
    ${painelLead(chat)}
    <div class="thread-msgs" id="threadMsgs">${bolhas || vazio("Sem mensagens carregadas.")}</div>
    ${podeEditar() ? `<form class="thread-envio" data-enviar>
      <select data-rapida title="Resposta rápida"><option value="">⚡</option>${rr.map((r) => `<option value="${esc(r.id)}">${esc(r.titulo)}</option>`).join("")}</select>
      <textarea data-msg rows="1" placeholder="Escreva a mensagem… (Enter envia)"></textarea>
      <button class="btn btn-primario" type="submit">Enviar</button>
    </form>` : `<div class="thread-envio"><span class="mudo">Seu perfil não envia mensagens.</span></div>`}`;
}

function render(root, ctx) {
  ctxAtual = ctx;
  const abertaId = ctx.rota.id ? decodeURIComponent(ctx.rota.id) : "";
  const chat = abertaId ? (W.estado.chats.find((c) => c.id === abertaId) || { id: abertaId, provider: canal || "whatsapp", externo: W.idDoChat(abertaId), telefone: W.idDoChat(abertaId), nome: "" }) : null;
  const naoConfig = !W.configurado();
  const st = W.estado;
  root.innerHTML = `<div class="pagina-cab"><div><h1>Conversas</h1><p class="sub">WhatsApp, Instagram e Messenger na mesma tela, ligados aos leads${st.ultima ? ` · atualizado ${esc(horaCurta(st.ultima))}` : ""}</p></div>
      <div class="pagina-acoes">${st.erro ? badge(st.erro, "vermelho") : st.conectado === true ? badge("conectado", "verde") : st.conectado === false ? badge("desconectado", "vermelho") : ""}
      <button class="btn btn-pq" data-atualizar>${st.carregando ? "⏳" : "🔄"} Atualizar</button><a class="btn btn-pq" href="#/config?aba=mensagens">⚙️ Configurar</a></div></div>
    ${naoConfig ? `<div class="aviso aviso-info">Para ver as conversas aqui, cole a <b>key</b> da sua instância da api-wa.me em <a href="#/config?aba=mensagens">Configurações → Mensagens</a>. A chave fica só neste aparelho.</div>` : ""}
    ${st.erro && !naoConfig ? `<div class="aviso aviso-erro">${esc(st.erro)}</div>` : ""}
    ${Object.keys(st.canaisIndisponiveis || {}).length ? `<div class="aviso aviso-alerta">${Object.keys(st.canaisIndisponiveis).map((c) => esc((W.PROVIDERS.find((x) => x[0] === c) || [, c])[1])).join(" e ")} não ${Object.keys(st.canaisIndisponiveis).length > 1 ? "estão ligados" : "está ligado"} nesta instância. Ligue no portal da api-wa.me ou desmarque em <a href="#/config?aba=mensagens">Configurações → Mensagens</a>.</div>` : ""}
    <div class="inbox${chat ? " com-conversa" : ""}">
      <aside class="inbox-lista">
        <div class="inbox-filtros">
          <div class="chips"><button class="chip${!canal ? " ativa" : ""}" data-canal="">Todos</button>${W.PROVIDERS.filter((p) => W.cfg.canais[p[0]]).map(([v, t, i]) => `<button class="chip${canal === v ? " ativa" : ""}" data-canal="${v}">${i} ${t}</button>`).join("")}</div>
          <input type="search" placeholder="Buscar conversa" value="${esc(busca)}" data-busca>
          <div class="chips">${[["todas", "Todas"], ["nao_lidas", `Não lidas${st.naoLidas ? " (" + st.naoLidas + ")" : ""}`], ["abertos", "Em negociação"], ["sem_lead", "Sem lead"]].map(([v, t]) => `<button class="chip${filtro === v ? " ativa" : ""}" data-filtro="${v}">${t}</button>`).join("")}</div>
        </div>
        <div class="inbox-convs">${listaHtml(abertaId)}</div>
      </aside>
      <section class="inbox-thread">${threadHtml(chat)}</section>
    </div>`;

  const on = (sel, ev, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(el, e)));
  on("[data-canal]", "click", (el) => { canal = el.dataset.canal; ctx.rerender(); });
  on("[data-filtro]", "click", (el) => { filtro = el.dataset.filtro; ctx.rerender(); });
  on("[data-atualizar]", "click", () => W.atualizar());
  on("[data-voltar]", "click", () => ctx.navegar("#/inbox"));
  const bs = root.querySelector("[data-busca]");
  if (bs) bs.addEventListener("input", (e) => { busca = e.target.value; const p = e.target.selectionStart; ctx.rerender(); const n = root.querySelector("[data-busca]"); if (n) { n.focus(); n.setSelectionRange(p, p); } });
  on("[data-conv]", "click", (el) => { const id = el.dataset.conv; W.abrirConversa(id); ctx.navegar(`#/inbox/${encodeURIComponent(id)}`); });

  if (chat) {
    const leadAberto = W.leadDoChat(chat);
    if (leadAberto && leadAberto.first_contact_at && !leadAberto.first_reply_at) {
      const corte = new Date(leadAberto.first_contact_at).getTime() / 1000;
      const resposta = (W.estado.mensagens[chat.id] || []).find((m) => !m.minha && m.ts > corte);
      if (resposta) marcarPrimeiraResposta(leadAberto, new Date(resposta.ts * 1000).toISOString());
    }
    const caixa = root.querySelector("#threadMsgs"); if (caixa) caixa.scrollTop = caixa.scrollHeight;
    const ta = root.querySelector("[data-msg]");
    if (ta) {
      ta.value = rascunhos.get(chat.id) || "";
      ta.addEventListener("input", () => { rascunhos.set(chat.id, ta.value); ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px"; });
      ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); root.querySelector("[data-enviar]").requestSubmit(); } });
    }
    const form = root.querySelector("[data-enviar]");
    if (form) form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const texto = (ta.value || "").trim(); if (!texto) return;
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Enviando…";
      try {
        await W.enviarTexto(chat, texto);
        rascunhos.delete(chat.id); ta.value = "";
        const lead = W.leadDoChat(chat);
        if (lead) {
          marcarPrimeiroContato(lead);
          db.update("leads", lead.id, { last_contact: hoje(), ...(lead.stage === "novo" ? { stage: "contato" } : {}) });
          registrarInteracao(lead.id, chat.provider === "whatsapp" ? "whatsapp" : "nota", "Enviado: " + texto.slice(0, 180));
        }
        await W.abrirConversa(chat.id);
        ctx.rerender();
      } catch (err) { toast("Não enviou: " + err.message, "erro"); btn.disabled = false; btn.textContent = "Enviar"; }
    });
    root.querySelectorAll("[data-ver-imagem]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      modal(`<img src="${esc(a.dataset.verImagem)}" alt="" style="max-width:100%;max-height:74vh;display:block;margin:0 auto;border-radius:10px"><p style="text-align:center;margin-top:10px"><a class="btn btn-pq" href="${esc(a.dataset.verImagem)}" target="_blank" rel="noopener">Abrir em nova aba</a></p>`, { titulo: "Imagem", largo: true });
    }));
    const rap = root.querySelector("[data-rapida]");
    if (rap) rap.addEventListener("change", () => { const r = W.respostasRapidas().find((x) => x.id === rap.value); if (r && ta) { ta.value = (ta.value ? ta.value + " " : "") + r.texto; rascunhos.set(chat.id, ta.value); ta.focus(); } rap.value = ""; });
    on("[data-criar-lead]", "click", async () => {
      const msgs = W.estado.mensagens[chat.id] || [];
      const lead = W.criarLeadDoChat(chat, msgs.find((m) => !m.minha) || msgs[0]);
      toast("Lead criado."); ctx.rerender();
      abrirFormulario("leads", lead.id, { onSave: ctx.rerender });
    });
    on("[data-etapa-lead]", "change", (el) => { const lead = W.leadDoChat(chat); if (lead) mudarEtapa(lead, el.value, ctx); });
    on("[data-followup]", "click", () => { const lead = W.leadDoChat(chat); if (!lead) return; db.update("leads", lead.id, { next_followup: somaDias(hoje(), 1) }); registrarInteracao(lead.id, "nota", "Follow-up agendado para amanhã."); toast("Follow-up para amanhã."); ctx.rerender(); });
    on("[data-nota]", "click", () => { const lead = W.leadDoChat(chat); if (!lead) return; const t = prompt("Anotação no histórico do lead:"); if (t && t.trim()) { registrarInteracao(lead.id, "nota", t.trim()); toast("Anotação registrada."); } });
    on("[data-venda]", "click", () => { const lead = W.leadDoChat(chat); abrirVenda(ctx, lead ? { lead_id: lead.id } : {}); });
  }

  if (!ligado && W.configurado()) {
    ligado = true;
    W.onMensagens(() => { if (location.hash.startsWith("#/inbox") && ctxAtual) ctxAtual.rerender(); });
  }
}

export default {
  id: "inbox", titulo: "Conversas", icone: "💬",
  render(root, ctx) {
    W.carregarCfg();
    render(root, ctx);
    if (W.configurado()) {
      const abertaId = ctx.rota.id ? decodeURIComponent(ctx.rota.id) : "";
      if (abertaId && W.estado.aberta !== abertaId) W.abrirConversa(abertaId).then(() => ctx.rerender());
      if (!W.estado.chats.length && !W.estado.carregando) W.atualizar();
    }
  },
};
