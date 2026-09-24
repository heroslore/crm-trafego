// Componentes reutilizáveis: só recebem dados e devolvem HTML (ou montam modais).
import { db } from "./db.js?v=e38ac044";
import { TABELAS, OPCOES, rotulo } from "./schema.js?v=e38ac044";
import { esc, brl, brlCurto, inteiro, pct, mult, dec, dataBR, seta, hoje, num, uid, agora } from "./format.js?v=e38ac044";

// ---------------------------------------------------------------- formatação por tipo de métrica
export const FMT = { money: brl, moneyCurto: brlCurto, int: inteiro, pct: (v) => pct(v), pct2: (v) => pct(v, 2), mult, dec: (v) => dec(v, 2), text: (v) => esc(v), date: dataBR };
const EM_REAIS = ["spend", "revenue", "gross_sales", "discount", "fees", "shipping", "gross_profit", "net_profit", "cpl", "cpl_qualificado", "cpa", "ticket", "ticket_liquido", "lucro_por_lead", "cpc", "cpm", "cost", "extra_costs", "custo_thruplay", "custo_video_3s", "custo_conversa", "value", "price", "meta", "canceled_value"];
const EM_PORCENTO = ["roi", "conversion", "taxa_qualificacao", "ctr", "margin", "hook_rate", "thruplay_rate", "retencao_50", "retencao_95", "retencao_100", "taxa_reproducao", "taxa_pagina", "taxaContato", "taxaResposta"];
export function fmtMetrica(k, v) {
  if (EM_REAIS.includes(k)) return brl(v);
  if (k === "roas") return mult(v);
  if (EM_PORCENTO.includes(k)) return pct(v);
  if (k === "frequency") return dec(v, 2);
  return inteiro(v);
}

// ---------------------------------------------------------------- pequenos
export const badge = (texto, cor = "cinza") => `<span class="badge badge-${cor}">${esc(texto)}</span>`;
export const CORES_STATUS = { ativa: "verde", pausada: "amarelo", finalizada: "cinza", planejada: "ciano", producao: "roxo", novo: "ciano", contato: "roxo", respondeu: "roxo", interessado: "amarelo", negociacao: "amarelo", aguardando_pagamento: "laranja", venda: "verde", followup: "ciano", perdido: "vermelho", urgente: "vermelho", alta: "laranja", media: "amarelo", baixa: "cinza", excelente: "verde", bom: "ciano", atencao: "amarelo", ruim: "vermelho" };
export const badgeOpcao = (grupo, valor) => badge(rotulo(grupo, valor), CORES_STATUS[valor] || "cinza");
export const badgeAvaliacao = (av) => av ? `<span class="badge badge-${CORES_STATUS[av.nivel]}" title="meta: ${esc(av.meta)}">${av.rotulo}</span>` : "";
export const vazio = (t = "Nada por aqui ainda.") => `<div class="vazio">${esc(t)}</div>`;
export const progresso = (v, max, cor = "") => `<div class="progresso"><i style="width:${Math.min(100, max > 0 ? 100 * v / max : 0)}%${cor ? ";background:" + cor : ""}"></i></div>`;
export const delta = (v, invertido = false) => { if (v == null || !isFinite(v)) return `<span class="delta">— vs anterior</span>`; const bom = invertido ? v < 0 : v > 0; const cls = Math.abs(v) < 0.005 ? "" : bom ? "up" : "down"; return `<span class="delta ${cls}">${seta(v)} ${pct(Math.abs(v))} vs anterior</span>`; };
export function toast(txt, tipo = "") { const t = document.getElementById("toast"); t.textContent = txt; t.className = "toast mostra " + tipo; clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = "toast"; }, 2800); }
export const nome = (tabela, id, padrao = "—") => { const r = id && db.get(tabela, id); return r ? esc(r.name || r.title || r.company || r.id) : padrao; };
export const link = (href, texto) => `<a href="${esc(href)}" class="link">${esc(texto)}</a>`;
export const botao = (texto, attrs = "", cls = "btn") => `<button class="${cls}" ${attrs}>${texto}</button>`;

// ---------------------------------------------------------------- cartões
export function kpi({ rotulo: r, valor, delta: d, invertido, avaliacao, sub, serie, destaque, cor }) {
  return `<div class="kpi${destaque ? " destaque" : ""}"><div class="kpi-topo"><span class="kpi-rotulo">${esc(r)}</span>${avaliacao ? badgeAvaliacao(avaliacao) : ""}</div><div class="kpi-valor">${valor}</div>${serie ? sparkline(serie, cor) : ""}<div class="kpi-rodape">${d !== undefined ? delta(d, invertido) : ""}${sub ? `<span class="kpi-sub">${sub}</span>` : ""}</div></div>`;
}
export function sparkline(valores, cor = "var(--acento)") {
  const n = valores.length; if (n < 2) return "";
  const max = Math.max(...valores, 0.0001), min = Math.min(...valores, 0);
  const W = 120, H = 28; const pts = valores.map((v, i) => `${(i / (n - 1) * W).toFixed(1)},${(H - 2 - (H - 4) * ((v - min) / (max - min || 1))).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts.join(" ")}" fill="none" stroke="${cor}" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}
export const cartao = (titulo, corpo, extra = "", cls = "") => `<section class="cartao ${cls}">${titulo ? `<header class="cartao-cab"><h2>${titulo}</h2><div class="cartao-extra">${extra}</div></header>` : ""}<div class="cartao-corpo">${corpo}</div></section>`;

// ---------------------------------------------------------------- gráficos
export function graficoLinhas({ rotulos, series, formato = "int", altura = 220, barras = false }) {
  const W = 720, H = altura, pl = 54, pr = 16, pt = 14, pb = 28, n = rotulos.length;
  if (!n) return vazio("Sem dados no período.");
  const todos = series.flatMap((s) => s.valores.map((v) => v || 0));
  const max = Math.max(...todos, 0.0001), min = Math.min(0, ...todos);
  const y = (v) => pt + (H - pt - pb) * (1 - ((v || 0) - min) / (max - min || 1));
  const x = (i) => pl + (n === 1 ? (W - pl - pr) / 2 : i * (W - pl - pr) / (n - 1));
  const fmt = formato === "money" ? brlCurto : formato === "mult" ? mult : formato === "pct" ? pct : inteiro;
  let svg = `<svg class="grafico" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
  for (let g = 0; g <= 4; g++) { const v = min + (max - min) * g / 4; svg += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="grade"/><text x="${pl - 6}" y="${y(v) + 4}" class="eixo" text-anchor="end">${esc(fmt(v))}</text>`; }
  const passo = n > 40 ? 7 : n > 16 ? 3 : 1;
  rotulos.forEach((r, i) => { if (i % passo === 0 || i === n - 1) svg += `<text x="${x(i)}" y="${H - 8}" class="eixo" text-anchor="middle">${esc(r)}</text>`; });
  series.forEach((s, si) => {
    if (barras || s.barras) { const bw = Math.max(3, (W - pl - pr) / n * 0.6 / series.length); s.valores.forEach((v, i) => { svg += `<rect x="${x(i) - bw * series.length / 2 + si * bw}" y="${y(v)}" width="${bw}" height="${Math.max(0, y(min) - y(v))}" rx="2" fill="${s.cor}" opacity="0.85"><title>${esc(rotulos[i] + ": " + fmt(v))}</title></rect>`; }); }
    else { svg += `<polyline points="${s.valores.map((v, i) => `${x(i)},${y(v)}`).join(" ")}" fill="none" stroke="${s.cor}" stroke-width="2.2" stroke-linejoin="round"/>`; s.valores.forEach((v, i) => { if (n <= 45) svg += `<circle cx="${x(i)}" cy="${y(v)}" r="2.6" fill="${s.cor}"><title>${esc(rotulos[i] + ": " + fmt(v))}</title></circle>`; }); }
  });
  svg += "</svg>";
  return svg + `<div class="legenda">${series.map((s) => `<span><i style="background:${s.cor}"></i>${esc(s.nome)}</span>`).join("")}</div>`;
}
export function barrasH(itens, { cor = "var(--acento)", fmt = inteiro, vazioTxt = "Sem dados." } = {}) {
  if (!itens.length) return vazio(vazioTxt);
  const max = Math.max(...itens.map((i) => i.valor || 0), 0.0001);
  return `<div class="barras">${itens.map((i) => `<div class="barra" title="${esc(i.titulo || "")}"><div class="barra-nome">${i.html || esc(i.nome)}</div><div class="barra-trilho"><i style="width:${100 * (i.valor || 0) / max}%;background:${i.cor || cor}"></i></div><div class="barra-valor">${esc(i.rotulo != null ? i.rotulo : fmt(i.valor))}${i.extra ? ` <small>${esc(i.extra)}</small>` : ""}</div></div>`).join("")}</div>`;
}

// ---------------------------------------------------------------- tabela ordenável
const ordenacoes = new Map();
export function tabela(id, { colunas, linhas, ordem = null, desc = true, vazioTxt = "Nada para mostrar.", linkLinha = null, limite = 0 }) {
  const st = ordenacoes.get(id) || { chave: ordem, desc };
  ordenacoes.set(id, st);
  let dados = linhas.slice();
  if (st.chave) { const col = colunas.find((c) => c.key === st.chave); const val = (l) => (col && col.valor ? col.valor(l) : l[st.chave]); dados.sort((a, b) => { const va = val(a), vb = val(b); if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1; if (typeof va === "number" && typeof vb === "number") return st.desc ? vb - va : va - vb; return st.desc ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb)); }); }
  if (limite) dados = dados.slice(0, limite);
  if (!dados.length) return vazio(vazioTxt);
  const th = colunas.map((c) => `<th class="${c.align || (c.tipo && c.tipo !== "text" ? "num" : "")}${st.chave === c.key ? " ordenada" : ""}" data-sort="${esc(c.key)}" data-tabela="${esc(id)}">${esc(c.label)}${st.chave === c.key ? (st.desc ? " ↓" : " ↑") : ""}</th>`).join("");
  const tr = dados.map((l) => `<tr${linkLinha ? ` class="clicavel" data-href="${esc(linkLinha(l))}"` : ""}>${colunas.map((c) => { const v = c.valor ? c.valor(l) : l[c.key]; const txt = c.render ? c.render(l, v) : (c.fmt ? c.fmt(v) : esc(v)); return `<td class="${c.align || (c.tipo && c.tipo !== "text" ? "num" : "")}">${txt}</td>`; }).join("")}</tr>`).join("");
  return `<div class="tabela-wrap"><table class="tabela"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}
export function ordenar(id, chave) { const st = ordenacoes.get(id) || { chave: null, desc: true }; if (st.chave === chave) st.desc = !st.desc; else { st.chave = chave; st.desc = true; } ordenacoes.set(id, st); }

// ---------------------------------------------------------------- kanban
export function kanban(id, { colunas, itens, colunaDe, render, cor = () => "" }) {
  return `<div class="kanban" data-kanban="${esc(id)}">${colunas.map((c) => { const lista = itens.filter((i) => colunaDe(i) === c.id); const soma = c.soma ? c.soma(lista) : ""; return `<div class="kcol" data-col="${esc(c.id)}"><div class="kcol-cab"><span>${esc(c.titulo)}</span><span class="kcol-n">${lista.length}${soma ? ` · ${soma}` : ""}</span></div><div class="kcol-corpo">${lista.map((i) => `<div class="kcard" draggable="true" data-id="${esc(i.id)}" style="${cor(i) ? "border-left-color:" + cor(i) : ""}">${render(i)}</div>`).join("")}</div></div>`; }).join("")}</div>`;
}

// ---------------------------------------------------------------- formulários gerados pelo schema
function opcoesRel(tabelaRel, atual) {
  const regs = db.all(tabelaRel).slice().sort((a, b) => String(a.name || a.title || a.company || "").localeCompare(String(b.name || b.title || b.company || "")));
  return `<option value="">—</option>` + regs.map((r) => `<option value="${esc(r.id)}"${r.id === atual ? " selected" : ""}>${esc(r.name || r.title || r.company || r.id)}</option>`).join("");
}
export function campoHtml(c, valor) {
  const v = valor == null ? "" : valor;
  const id = "f_" + c.key; const ro = c.readonly ? " readonly disabled" : "";
  let input;
  switch (c.type) {
    case "textarea": input = `<textarea id="${id}" name="${c.key}"${ro}>${esc(v)}</textarea>`; break;
    case "number": input = `<input type="number" step="any" inputmode="decimal" id="${id}" name="${c.key}" value="${esc(v)}"${ro}>`; break;
    case "money": input = `<input type="number" step="0.01" inputmode="decimal" id="${id}" name="${c.key}" value="${esc(v)}" placeholder="0,00"${ro}>`; break;
    case "date": input = `<input type="date" id="${id}" name="${c.key}" value="${esc(String(v).slice(0, 10))}"${ro}>`; break;
    case "datetime": input = `<input type="datetime-local" id="${id}" name="${c.key}" value="${esc(String(v).slice(0, 16))}"${ro}>`; break;
    case "select": input = `<select id="${id}" name="${c.key}"${ro}>${(OPCOES[c.options] || []).map((o) => `<option value="${esc(o[0])}"${o[0] === v ? " selected" : ""}>${esc(o[1])}</option>`).join("")}</select>`; break;
    case "rel": input = `<select id="${id}" name="${c.key}"${ro}>${opcoesRel(c.rel, v)}</select>`; break;
    case "bool": input = `<label class="check"><input type="checkbox" id="${id}" name="${c.key}"${v ? " checked" : ""}${ro}> Sim</label>`; break;
    case "image": input = `<div class="imagem-campo">${v ? `<img src="${esc(v)}" alt="">` : ""}<input type="file" accept="image/*" data-imagem="${c.key}"><input type="hidden" name="${c.key}" id="${id}" value="${esc(v)}"><input type="url" placeholder="ou cole um link de imagem" data-imagem-url="${c.key}" value="${/^https?:/.test(v) ? esc(v) : ""}"></div>`; break;
    case "tags": input = `<input type="text" id="${id}" name="${c.key}" value="${esc(Array.isArray(v) ? v.join(", ") : v)}" placeholder="separe por vírgula"${ro}>`; break;
    case "url": input = `<input type="url" id="${id}" name="${c.key}" value="${esc(v)}" placeholder="https://"${ro}>`; break;
    case "json": input = `<textarea id="${id}" name="${c.key}"${ro}>${esc(typeof v === "string" ? v : JSON.stringify(v || null))}</textarea>`; break;
    default: input = `<input type="text" id="${id}" name="${c.key}" value="${esc(v)}"${ro}>`;
  }
  return `<div class="campo campo-${c.type}${c.type === "textarea" || c.type === "image" ? " largo" : ""}"><label for="${id}">${esc(c.label)}${c.required ? " *" : ""}</label>${input}${c.help ? `<small>${esc(c.help)}</small>` : ""}</div>`;
}
export function formulario(tabela, registro = {}, { ocultar = [], somente = null } = {}) {
  const campos = TABELAS[tabela].campos.filter((c) => !ocultar.includes(c.key) && (!somente || somente.includes(c.key)) && !(c.readonly && registro[c.key] == null));
  return `<div class="form-grade">${campos.map((c) => campoHtml(c, registro[c.key] !== undefined ? registro[c.key] : (c.default === "hoje" ? hoje() : c.default))).join("")}</div>`;
}
export function lerFormulario(tabela, root) {
  const out = {};
  for (const c of TABELAS[tabela].campos) {
    const el = root.querySelector(`[name="${c.key}"]`); if (!el) continue;
    if (c.readonly && el.disabled) continue;
    let v = el.value;
    if (c.type === "bool") v = el.checked;
    else if (c.type === "number" || c.type === "money") v = v === "" ? null : Number(String(v).replace(",", "."));
    else if (c.type === "tags") v = String(v).split(",").map((s) => s.trim()).filter(Boolean).map((s) => (isNaN(s) ? s : Number(s)));
    else if (c.type === "json") { try { v = v ? JSON.parse(v) : null; } catch { v = null; } }
    else if (c.type === "datetime" && v) v = new Date(v).toISOString();
    out[c.key] = v;
  }
  return out;
}
export function validar(tabela, dados) {
  const faltando = TABELAS[tabela].campos.filter((c) => c.required && (dados[c.key] === "" || dados[c.key] == null)).map((c) => c.label);
  return faltando.length ? "Preencha: " + faltando.join(", ") : "";
}

// ---------------------------------------------------------------- modal
let aoFechar = null;
export function modal(html, { titulo = "", largo = false, onClose = null } = {}) {
  const fundo = document.getElementById("modal-fundo"), box = document.getElementById("modal");
  box.className = "modal" + (largo ? " largo" : "");
  box.innerHTML = `<header class="modal-cab"><h2>${titulo}</h2><button class="fechar" data-fechar-modal aria-label="Fechar">✕</button></header><div class="modal-corpo">${html}</div>`;
  fundo.classList.add("aberto"); aoFechar = onClose;
  const foco = box.querySelector("input:not([type=hidden]):not([type=file]), select, textarea"); if (foco) setTimeout(() => foco.focus(), 30);
  return box;
}
export function fecharModal() { const fundo = document.getElementById("modal-fundo"); if (!fundo.classList.contains("aberto")) return; fundo.classList.remove("aberto"); document.getElementById("modal").innerHTML = ""; if (aoFechar) { const f = aoFechar; aoFechar = null; f(); } }
export function modalAberto() { return document.getElementById("modal-fundo").classList.contains("aberto"); }

// Abre formulário de criação/edição de um registro; chama onSave(registro) depois.
export function abrirFormulario(tabela, id = null, { titulo = null, padrao = {}, ocultar = [], somente = null, onSave = null, onDelete = null, extraHtml = "", permitirApagar = true } = {}) {
  const t = TABELAS[tabela]; const reg = id ? db.get(tabela, id) : null;
  const html = `<form class="form" data-form-tabela="${tabela}" data-form-id="${esc(id || "")}">${formulario(tabela, reg || padrao, { ocultar, somente })}${extraHtml}<div class="form-acoes"><button type="submit" class="btn btn-primario">💾 Salvar</button>${reg && permitirApagar ? `<button type="button" class="btn btn-perigo" data-apagar-registro>🗑️ Apagar</button>` : ""}<button type="button" class="btn btn-secundario" data-fechar-modal>Cancelar</button></div></form>`;
  const box = modal(html, { titulo: titulo || (reg ? "Editar " + t.singular.toLowerCase() : "Novo " + t.singular.toLowerCase()), largo: true });
  const form = box.querySelector("form");
  form.querySelectorAll("[data-imagem]").forEach((inp) => inp.addEventListener("change", () => { const f = inp.files[0]; if (!f) return; if (f.size > 900 * 1024) { toast("Imagem grande demais (máx. 900 KB). Use um link.", "erro"); return; } const rd = new FileReader(); rd.onload = () => { form.querySelector(`[name="${inp.dataset.imagem}"]`).value = rd.result; const img = inp.parentNode.querySelector("img") || inp.parentNode.insertBefore(document.createElement("img"), inp.parentNode.firstChild); img.src = rd.result; }; rd.readAsDataURL(f); }));
  form.querySelectorAll("[data-imagem-url]").forEach((inp) => inp.addEventListener("input", () => { form.querySelector(`[name="${inp.dataset.imagemUrl}"]`).value = inp.value; }));
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const dados = lerFormulario(tabela, form); const erro = validar(tabela, { ...(reg || {}), ...dados }); if (erro) { toast(erro, "erro"); return; }
    const salvo = reg ? db.update(tabela, reg.id, dados) : db.insert(tabela, { ...padrao, ...dados });
    fecharModal(); toast(reg ? "Salvo." : "Cadastrado."); if (onSave) onSave(salvo);
  });
  const apagar = form.querySelector("[data-apagar-registro]");
  if (apagar) apagar.addEventListener("click", () => { if (!confirm("Apagar este registro? Os vínculos com outros registros ficam vazios.")) return; db.remove(tabela, reg.id); fecharModal(); toast("Apagado."); if (onDelete) onDelete(reg); });
  return box;
}

// ---------------------------------------------------------------- listas genéricas
export function cabecalhoPagina(titulo, subtitulo = "", acoes = "") { return `<div class="pagina-cab"><div><h1>${titulo}</h1>${subtitulo ? `<p class="sub">${subtitulo}</p>` : ""}</div><div class="pagina-acoes">${acoes}</div></div>`; }
export function chips(itens, ativo, attr) { return `<div class="chips">${itens.map(([v, t]) => `<button class="chip${v === ativo ? " ativa" : ""}" ${attr}="${esc(v)}">${esc(t)}</button>`).join("")}</div>`; }
export function abas(itens, ativa, attr = "data-aba") { return `<div class="abas">${itens.map(([v, t]) => `<button class="aba${v === ativa ? " ativa" : ""}" ${attr}="${esc(v)}">${esc(t)}</button>`).join("")}</div>`; }
export function itemLista({ titulo, sub, direita = "", badges = "", href = "", cor = "" }) { return `<div class="item${href ? " clicavel" : ""}"${href ? ` data-href="${esc(href)}"` : ""}${cor ? ` style="border-left-color:${cor}"` : ""}><div class="item-txt"><div class="item-titulo">${titulo} ${badges}</div>${sub ? `<div class="item-sub">${sub}</div>` : ""}</div><div class="item-dir">${direita}</div></div>`; }
export const prioridadeBadge = (p) => badge({ urgente: "URGENTE", alta: "ALTA", media: "MÉDIA", baixa: "BAIXA" }[p] || p, CORES_STATUS[p] || "cinza");
export function funil(etapas) { const max = Math.max(...etapas.map((e) => e.n), 1); return `<div class="funil">${etapas.map((e) => `<div class="funil-etapa"><div class="funil-rot">${esc(e.rotulo)}</div><div class="funil-trilho"><i style="width:${100 * e.n / max}%;background:${e.cor || "var(--acento)"}"></i></div><div class="funil-n">${inteiro(e.n)}${e.extra ? ` <small>${esc(e.extra)}</small>` : ""}</div></div>`).join("")}</div>`; }
