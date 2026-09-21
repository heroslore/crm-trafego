import { db } from "../core/db.js?v=43ebd473";
import { kpis, porEntidade } from "../core/metrics.js?v=43ebd473";
import { META } from "../core/sync.js?v=43ebd473";
import { cartao, tabela, badge, badgeOpcao, abrirFormulario, vazio, barrasH, abas, itemLista } from "../core/ui.js?v=43ebd473";
import { esc, brl, inteiro, pct, mult, dataBR } from "../core/format.js?v=43ebd473";
import { bannerDemo, btnNovo } from "./comum.js?v=43ebd473";
import { rotulo as rotuloOpcao } from "../core/schema.js?v=43ebd473";

let aba = "biblioteca";
export default {
  id: "publicos", titulo: "Públicos", icone: "👥",
  render(root, ctx) {
    const iv = ctx.iv;
    const lin = db.all("audiences").map((a) => { const k = kpis(iv, { audience_id: a.id }); const camps = db.where("campaigns", (c) => c.audience_id === a.id).length + db.where("ad_sets", (s) => s.audience_id === a.id).length; return { ...a, k, camps }; });
    const ranking = lin.filter((a) => a.k.spend || a.k.sales || a.k.leads).sort((a, b) => (b.k.sales - a.k.sales) || ((b.k.roas || 0) - (a.k.roas || 0)) || (b.k.leads_base - a.k.leads_base));
    let corpo = "";
    if (aba === "biblioteca") corpo = cartao("", tabela("publicos", { colunas: [
      { key: "name", label: "Público", render: (a) => `<b>${esc(a.name)}</b><br><small>${esc(a.description || "")}</small>` }, { key: "platform", label: "Plataforma", render: (a) => esc(rotuloOpcao("platform", a.platform)) }, { key: "type", label: "Tipo", render: (a) => badge(rotuloOpcao("audience_type", a.type), "roxo") },
      { key: "camps", label: "Campanhas", tipo: "num", fmt: inteiro }, { key: "spend", label: "Investimento", tipo: "num", valor: (a) => a.k.spend, fmt: brl }, { key: "leads", label: "Leads", tipo: "num", valor: (a) => a.k.leads_base, fmt: inteiro }, { key: "sales", label: "Vendas", tipo: "num", valor: (a) => a.k.sales, fmt: inteiro }, { key: "cpa", label: "CPA", tipo: "num", valor: (a) => a.k.cpa, fmt: brl }, { key: "roas", label: "ROAS", tipo: "num", valor: (a) => a.k.roas, fmt: mult },
      { key: "acao", label: "", render: (a) => `<button class="btn btn-pq" data-editar="${a.id}">✏️</button>` },
    ], linhas: lin, ordem: "sales", vazioTxt: "Nenhum público cadastrado. Cadastre os públicos usados nas campanhas e ligue-os aos conjuntos de anúncios." }));
    else if (aba === "ranking") corpo = cartao("Ranking dos públicos (vendas, depois ROAS)", ranking.length ? `<div class="lista">${ranking.map((a, i) => itemLista({ titulo: `<span class="ranking-pos ${i < 3 ? "p" + (i + 1) : ""}">${i + 1}</span>${esc(a.name)}`, sub: `${rotuloOpcao("audience_type", a.type)} · ${brl(a.k.spend)} investidos · ${inteiro(a.k.leads_base)} lead(s) · CPA ${brl(a.k.cpa)}`, direita: `<b>${inteiro(a.k.sales)} venda(s)</b><br>ROAS ${mult(a.k.roas)}` })).join("")}</div>` : vazio("Sem dados de público no período. Ligue públicos aos conjuntos de anúncios e registre leads/vendas."));
    else corpo = recortesMeta();
    root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>Públicos</h1><p class="sub">Biblioteca de públicos, ranking por resultado e recortes de quem responde aos anúncios</p></div><div class="pagina-acoes">${btnNovo("Novo público", 'data-novo="1"')}</div></div>${abas([["biblioteca", "Biblioteca"], ["ranking", "Ranking"], ["meta", "Recortes da Meta (30 dias)"]], aba)}${corpo}`;
    root.querySelectorAll("[data-aba]").forEach((b) => b.addEventListener("click", () => { aba = b.dataset.aba; ctx.rerender(); }));
    const n = root.querySelector("[data-novo]"); if (n) n.addEventListener("click", () => abrirFormulario("audiences", null, { onSave: ctx.rerender }));
    root.querySelectorAll("[data-editar]").forEach((b) => b.addEventListener("click", () => abrirFormulario("audiences", b.dataset.editar, { onSave: ctx.rerender, onDelete: ctx.rerender })));
  },
};
function recortesMeta() {
  if (!META || !META.publico) return `<div class="aviso aviso-info">Os recortes de público (idade, gênero, posicionamento, aparelho, região, horário) vêm da coleta automática da Meta em <code>dados/meta.json</code>. Ainda não há arquivo carregado.</div>`;
  const P = META.publico, per = P.periodo || {};
  const grupo = (arr, f) => { const m = {}; for (const x of arr || []) { const k = f(x); const g = m[k] = m[k] || { nome: k, gasto: 0, msgs: 0, imp: 0 }; g.gasto += x.gasto; g.msgs += x.mensagens; g.imp += x.impressoes; } return Object.values(m); };
  const itens = (gs, cor) => gs.sort((a, b) => b.msgs - a.msgs || b.gasto - a.gasto).map((g) => ({ nome: g.nome, valor: g.msgs, cor, extra: brl(g.gasto) + (g.msgs ? " · " + brl(g.gasto / g.msgs) + "/msg" : "") }));
  const gen = { male: "Homens", female: "Mulheres", unknown: "Não informado" };
  const posN = { facebook_reels: "Reels FB", facebook_stories: "Stories FB", feed: "Feed", instagram_stories: "Stories IG", instagram_reels: "Reels IG", instagram_explore: "Explorar IG", instagram_profile_feed: "Perfil IG", facebook_profile_feed: "Perfil FB", instagram_search: "Busca IG", marketplace: "Marketplace", video_feeds: "Feeds de vídeo", right_hand_column: "Coluna direita", facebook_notification: "Notificações", instream_video: "Vídeo in-stream", search: "Busca" };
  const disp = { android_smartphone: "Android", iphone: "iPhone", android_tablet: "Tablet Android", ipad: "iPad", desktop: "Computador", other: "Outro" };
  const horas = (P.horario || []).slice().sort((a, b) => a.hora - b.hora); const maxH = Math.max(...horas.map((h) => h.mensagens), 1);
  return `<div class="aviso aviso-info">Recortes de ${dataBR(per.inicio)} a ${dataBR(per.fim)} (últimos 30 dias da conta Meta, mensagens iniciadas por anúncio). Não seguem o filtro de período.</div>
    <div class="grid2">${cartao("Gênero", barrasH(itens(grupo(P.idade_genero, (x) => gen[x.genero] || x.genero), "var(--roxo)")))}${cartao("Faixa de idade", barrasH(itens(grupo(P.idade_genero, (x) => x.idade === "Unknown" ? "Não informado" : x.idade).sort((a, b) => a.nome.localeCompare(b.nome)), "var(--ciano)")))}</div>
    <div class="grid2">${cartao("Onde o anúncio aparece", barrasH(itens(grupo(P.posicionamento, (x) => (x.plataforma === "instagram" ? "IG · " : x.plataforma === "facebook" ? "FB · " : "") + (posN[x.posicao] || x.posicao)), "var(--acento)").slice(0, 10)))}${cartao("Aparelho", barrasH(itens(grupo(P.dispositivo, (x) => disp[x.dispositivo] || x.dispositivo), "var(--amarelo)")))}</div>
    <div class="grid2">${cartao("Região", barrasH(itens(grupo(P.regiao, (x) => x.regiao || "?"), "var(--verde)").slice(0, 10)))}${cartao("Mensagens por hora do dia", horas.length ? `<div style="display:grid;grid-template-columns:repeat(24,1fr);gap:2px;align-items:end;height:90px">${horas.map((h) => `<div title="${h.hora}h: ${h.mensagens} msgs · ${brl(h.gasto)}" style="background:var(--ciano);border-radius:3px 3px 0 0;height:${100 * h.mensagens / maxH}%;min-height:2px"></div>`).join("")}</div><div style="display:grid;grid-template-columns:repeat(24,1fr);font-size:.58rem;color:var(--mudo);text-align:center">${horas.map((h) => `<span>${h.hora % 3 === 0 ? h.hora : ""}</span>`).join("")}</div>` : vazio())}</div>`;
}
