import { db } from "../core/db.js?v=ebf7a3c7";
import { kpis, serieDiaria } from "../core/metrics.js?v=ebf7a3c7";
import { cartao, tabela, badge, badgeOpcao, chips, abas, abrirFormulario, vazio, graficoLinhas, itemLista } from "../core/ui.js?v=ebf7a3c7";
import { esc, brl, inteiro, pct, mult, dataBR, dataCurta } from "../core/format.js?v=ebf7a3c7";
import { blocoAnalise, listaDiagnostico, comparativoEtapas, ordenarAnalises, chipsOrdem } from "../core/analise/ui.js?v=ebf7a3c7";
import { analisarVarios } from "../core/analise/index.js?v=ebf7a3c7";
import * as AcoesMeta from "../core/acoes-meta.js?v=ebf7a3c7";
import { bannerDemo, btnNovo, linhaNumeros } from "./comum.js?v=ebf7a3c7";
import { rotulo as rotuloOpcao } from "../core/schema.js?v=ebf7a3c7";
import { podeEditar } from "../core/auth.js?v=ebf7a3c7";

let filtro = "ativa", visao = "diagnostico", ordem = "gasto";
function lista(root, ctx) {
  const iv = ctx.iv;
  const lin = db.all("ads").filter((a) => filtro === "todas" || a.status === filtro).map((a) => ({ ...a, k: kpis(iv, { ad_id: a.id }), cr: db.get("creatives", a.creative_id), camp: db.get("campaigns", a.campaign_id) }));
  const comGasto = lin.filter((a) => a.k.spend > 0);
  root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>Anúncios</h1><p class="sub">${lin.length} anúncio(s) · ${comGasto.filter((a) => !a.k.sales && !a.k.leads_base && a.k.spend >= 50).length} gastando sem resultado no período</p></div><div class="pagina-acoes">${btnNovo("Novo anúncio", 'data-novo="1"')}</div></div>
    ${abas([["diagnostico", "🧠 Diagnóstico"], ["tabela", "Tabela"]], visao)}
    ${chips([["ativa", "Ativos"], ["pausada", "Pausados"], ["todas", "Todos"]], filtro, "data-f")}<div style="height:10px"></div>
    ${visao === "diagnostico" ? diagnosticoHtml(lin, ctx) : cartao("", tabela("anuncios", { colunas: [
      { key: "name", label: "Anúncio", render: (a) => `${a.cr && a.cr.thumbnail ? `<img class="mini" src="${esc(a.cr.thumbnail)}" alt="">` : ""}<a href="#/anuncios/${a.id}">${esc(a.name)}</a><br><small>${a.camp ? esc(a.camp.name) : "—"}${a.cr ? " · " + esc(rotuloOpcao("creative_type", a.cr.type)) : ""}</small>` },
      { key: "status", label: "Status", render: (a) => badgeOpcao("campaign_status", a.status) + (a.k.spend >= 50 && !a.k.sales && !a.k.leads_base ? " " + badge("pausar?", "vermelho") : "") },
      { key: "spend", label: "Gasto", tipo: "num", valor: (a) => a.k.spend, fmt: brl }, { key: "impressions", label: "Impressões", tipo: "num", valor: (a) => a.k.impressions, fmt: inteiro }, { key: "ctr", label: "CTR", tipo: "num", valor: (a) => a.k.ctr, fmt: (v) => pct(v) }, { key: "cpc", label: "CPC", tipo: "num", valor: (a) => a.k.cpc, fmt: brl },
      { key: "leads", label: "Leads", tipo: "num", valor: (a) => a.k.leads_base, fmt: inteiro }, { key: "cpl", label: "CPL", tipo: "num", valor: (a) => a.k.cpl, fmt: brl }, { key: "sales", label: "Vendas", tipo: "num", valor: (a) => a.k.sales, fmt: inteiro }, { key: "cpa", label: "CPA", tipo: "num", valor: (a) => a.k.cpa, fmt: brl }, { key: "revenue", label: "Faturamento", tipo: "num", valor: (a) => a.k.revenue, fmt: brl }, { key: "roas", label: "ROAS", tipo: "num", valor: (a) => a.k.roas, fmt: mult },
      { key: "meta", label: "Na Meta", render: (a) => AcoesMeta.botaoStatus("anuncio", a) || "<small>—</small>" },
    ], linhas: lin, ordem: "spend", vazioTxt: "Nenhum anúncio." }))}`;
  root.querySelectorAll("[data-aba]").forEach((b) => b.addEventListener("click", () => { visao = b.dataset.aba; ctx.rerender(); }));
  root.querySelectorAll("[data-ord]").forEach((b) => b.addEventListener("click", () => { ordem = b.dataset.ord; ctx.rerender(); }));
  root.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { filtro = b.dataset.f; ctx.rerender(); }));
  const n = root.querySelector("[data-novo]"); if (n) n.addEventListener("click", () => abrirFormulario("ads", null, { ocultar: ["external_id"], onSave: ctx.rerender }));
  AcoesMeta.ligar(root, ctx);
}
// Analisa todos os anúncios do filtro de uma vez (a base de comparação é montada uma só vez)
// e mostra, por anúncio, a nota, a trilha do funil, o gargalo e a próxima ação.
function diagnosticoHtml(lin, ctx) {
  const analises = analisarVarios({ nivel: "anuncio", registros: lin, iv: ctx.iv });
  const link = (an) => {
    const cr = an.contexto.criativo, camp = an.contexto.campanha;
    return {
      href: `#/anuncios/${an.registro.id}`,
      imagem: cr && cr.thumbnail ? cr.thumbnail : "",
      subtitulo: [camp ? esc(camp.name) : "", cr ? esc(rotuloOpcao("creative_type", cr.type)) : ""].filter(Boolean).join(" · "),
    };
  };
  const comparativo = comparativoEtapas(analises, link);
  return `${comparativo ? cartao("Quem ganha em cada etapa", comparativo) : ""}
    <div class="filtros-linha">${chipsOrdem(ordem)}</div>
    ${listaDiagnostico(ordenarAnalises(analises, ordem), link, { vazioTxt: "Nenhum anúncio com entrega no período. Troque o período no topo ou o filtro de status." })}`;
}

function detalhe(root, ctx, a) {
  const iv = ctx.iv, k = kpis(iv, { ad_id: a.id }), cr = db.get("creatives", a.creative_id), camp = db.get("campaigns", a.campaign_id), set = db.get("ad_sets", a.ad_set_id);
  const serie = serieDiaria(iv, { ad_id: a.id });
  const leads = db.where("leads", (l) => l.ad_id === a.id), vendas = db.where("sales", (s) => s.ad_id === a.id);
  root.innerHTML = `<div class="pagina-cab"><div><a href="#/anuncios" class="link">← Anúncios</a><h1>${esc(a.name)} ${badgeOpcao("campaign_status", a.status)}</h1><p class="sub">${camp ? `campanha <a href="#/campanhas/${camp.id}">${esc(camp.name)}</a>` : ""}${set ? ` · conjunto ${esc(set.name)}` : ""}${cr ? ` · criativo <a href="#/criativos/${cr.id}">${esc(cr.name)}</a>` : ""}</p></div><div class="pagina-acoes">${AcoesMeta.botaoStatus("anuncio", a)}${podeEditar() ? `<button class="btn btn-primario" data-editar>✏️ Editar</button>` : ""}</div></div>
    ${blocoAnalise("anuncio", a, iv)}
    <div class="grid2">${cartao("Criativo", cr ? `<div style="display:flex;gap:12px;align-items:flex-start">${cr.thumbnail ? `<img src="${esc(cr.thumbnail)}" style="width:120px;height:120px;object-fit:cover;border-radius:10px">` : ""}<div><b>${esc(cr.name)}</b> ${badge(rotuloOpcao("creative_type", cr.type), "roxo")}<p class="sub">${esc(cr.copy || "")}</p>${cr.cta ? `<small>CTA: ${esc(cr.cta)}</small>` : ""}${cr.link ? `<br><a href="${esc(cr.link)}" target="_blank" rel="noopener">abrir</a>` : ""}</div></div>` : vazio("Sem criativo ligado."))}
    ${cartao("Atribuição", `<div class="kpis" style="grid-template-columns:1fr 1fr">${[["Leads (CRM)", inteiro(leads.length)], ["Vendas (CRM)", inteiro(vendas.length)], ["Faturamento", brl(vendas.reduce((s, v) => s + Number(v.value || 0), 0))], ["Resultados na plataforma", inteiro(k.results)]].map(([r, v]) => `<div class="kpi"><div class="kpi-rotulo">${r}</div><div class="kpi-valor">${v}</div></div>`).join("")}</div>`)}</div>
    ${cartao("Resultados no período", linhaNumeros(k, ["spend", "impressions", "reach", "link_clicks", "ctr", "cpc", "cpm", "leads", "cpl", "sales", "cpa", "revenue", "roas"]) + graficoLinhas({ rotulos: serie.map((d) => dataCurta(d.date)), series: [{ nome: "Investimento", cor: "var(--acento)", valores: serie.map((d) => d.spend), barras: true }, { nome: "Cliques", cor: "var(--ciano)", valores: serie.map((d) => d.link_clicks) }], altura: 180 }))}`;
  const e = root.querySelector("[data-editar]"); if (e) e.addEventListener("click", () => abrirFormulario("ads", a.id, { ocultar: ["external_id"], onSave: ctx.rerender, onDelete: () => ctx.navegar("#/anuncios") }));
  AcoesMeta.ligar(root, ctx);
}
export default { id: "anuncios", titulo: "Anúncios", icone: "🖼️", render(root, ctx) { const a = ctx.rota.id && db.get("ads", ctx.rota.id); if (a) detalhe(root, ctx, a); else lista(root, ctx); } };
