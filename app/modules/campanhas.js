import { db } from "../core/db.js";
import { kpis, serieDiaria, porEntidade, mediaCampanhas } from "../core/metrics.js";
import { situacaoCampanha } from "../core/rules.js";
import { cartao, tabela, badge, badgeOpcao, chips, abrirFormulario, vazio, itemLista, graficoLinhas, kpi, prioridadeBadge, modal, fecharModal, toast, formulario, lerFormulario } from "../core/ui.js";
import { esc, brl, inteiro, pct, mult, dataBR, dataCurta, hoje, dec } from "../core/format.js";
import { bannerDemo, btnNovo, linhaNumeros } from "./comum.js";
import { rotulo as rotuloOpcao, OPCOES } from "../core/schema.js";
import { podeEditar } from "../core/auth.js";

let filtroStatus = "ativa", filtroPlat = "";

function lista(root, ctx) {
  const iv = ctx.iv, media = mediaCampanhas(iv);
  const todas = db.all("campaigns").map((c) => ({ c, s: situacaoCampanha(c, iv, media) }));
  const lin = todas.filter(({ c }) => (filtroStatus === "todas" || c.status === filtroStatus) && (!filtroPlat || c.platform === filtroPlat)).map(({ c, s }) => ({ ...c, k: s.k, s }));
  const q = new URLSearchParams((location.hash.split("?")[1] || ""));
  root.innerHTML = `${bannerDemo()}
    <div class="pagina-cab"><div><h1>Campanhas</h1><p class="sub">${todas.filter((x) => x.c.status === "ativa").length} ativa(s) de ${todas.length} · números do período selecionado</p></div><div class="pagina-acoes">${podeEditar() ? `<button class="btn" data-lancar>📝 Lançar métricas do dia</button><a class="btn" href="#/config?aba=importar">⬆️ Importar CSV/XLSX</a>` : ""}${btnNovo("Nova campanha", 'data-novo="1"')}</div></div>
    <div class="filtros-linha">${chips([["ativa", "Ativas"], ["pausada", "Pausadas"], ["planejada", "Planejadas"], ["producao", "Em produção"], ["finalizada", "Finalizadas"], ["todas", "Todas"]], filtroStatus, "data-fs")}<select data-fp><option value="">Todas as plataformas</option>${OPCOES.platform.map(([v, t]) => `<option value="${v}"${filtroPlat === v ? " selected" : ""}>${t}</option>`).join("")}</select></div>
    ${cartao("", tabela("campanhas", { colunas: [
      { key: "name", label: "Campanha", render: (l) => `<a href="#/campanhas/${l.id}">${esc(l.name)}</a><br><small>${esc(rotuloOpcao("platform", l.platform))} · ${esc(rotuloOpcao("objective", l.objective))}${l.product_id ? " · " + esc((db.get("products", l.product_id) || {}).name || "") : ""}</small>` },
      { key: "status", label: "Status", render: (l) => badgeOpcao("campaign_status", l.status) + (l.s.situacao === "ruim" ? " " + badge("ruim", "vermelho") : l.s.situacao === "atencao" ? " " + badge("atenção", "amarelo") : l.s.situacao === "boa" ? " " + badge("boa", "verde") : "") },
      { key: "daily_budget", label: "Orç./dia", tipo: "num", fmt: brl },
      { key: "spend", label: "Gasto", tipo: "num", valor: (l) => l.k.spend, fmt: brl }, { key: "revenue", label: "Faturamento", tipo: "num", valor: (l) => l.k.revenue, fmt: brl },
      { key: "leads", label: "Leads", tipo: "num", valor: (l) => l.k.leads_base, fmt: inteiro }, { key: "sales", label: "Vendas", tipo: "num", valor: (l) => l.k.sales, fmt: inteiro },
      { key: "cpl", label: "CPL", tipo: "num", valor: (l) => l.k.cpl, fmt: brl }, { key: "cpa", label: "CPA", tipo: "num", valor: (l) => l.k.cpa, fmt: brl },
      { key: "ctr", label: "CTR", tipo: "num", valor: (l) => l.k.ctr, fmt: (v) => pct(v) }, { key: "cpc", label: "CPC", tipo: "num", valor: (l) => l.k.cpc, fmt: brl }, { key: "cpm", label: "CPM", tipo: "num", valor: (l) => l.k.cpm, fmt: brl },
      { key: "roas", label: "ROAS", tipo: "num", valor: (l) => l.k.roas, fmt: mult }, { key: "roi", label: "ROI", tipo: "num", valor: (l) => l.k.roi, fmt: (v) => pct(v) }, { key: "ticket", label: "Ticket", tipo: "num", valor: (l) => l.k.ticket, fmt: brl },
      { key: "decision", label: "Decisão", render: (l) => l.decision ? badge(rotuloOpcao("decision", l.decision), { escalar: "verde", pausar: "vermelho", encerrar: "vermelho", reduzir: "amarelo", manter: "ciano" }[l.decision] || "roxo") : "<small>—</small>" },
    ], linhas: lin, ordem: "spend", vazioTxt: "Nenhuma campanha neste filtro." }))}`;
  root.querySelectorAll("[data-fs]").forEach((b) => b.addEventListener("click", () => { filtroStatus = b.dataset.fs; ctx.rerender(); }));
  root.querySelector("[data-fp]").addEventListener("change", (e) => { filtroPlat = e.target.value; ctx.rerender(); });
  const novo = root.querySelector("[data-novo]"); if (novo) novo.addEventListener("click", () => abrirNova(ctx, q.get("produto") || ""));
  const lan = root.querySelector("[data-lancar]"); if (lan) lan.addEventListener("click", () => lancarMetricas(ctx));
  if (q.get("novo") === "1" && podeEditar()) { history.replaceState(null, "", "#/campanhas"); abrirNova(ctx, q.get("produto") || ""); }
}
function abrirNova(ctx, product_id = "", campaign = null) { abrirFormulario("campaigns", campaign ? campaign.id : null, { padrao: { product_id, source: "manual" }, ocultar: ["external_id", "source"], onSave: (c) => ctx.navegar(`#/campanhas/${c.id}`), onDelete: () => ctx.navegar("#/campanhas") }); }
export function lancarMetricas(ctx, campaign_id = "") {
  abrirFormulario("campaign_metrics", null, { titulo: "Lançar métricas de um dia", padrao: { campaign_id, source: "manual", date: hoje() }, ocultar: ["source", "creative_id"], onSave: () => { toast("Métricas lançadas."); ctx.rerender(); } });
}

function detalhe(root, ctx, c) {
  const iv = ctx.iv, media = mediaCampanhas(iv), s = situacaoCampanha(c, iv, media), k = s.k;
  const serie = serieDiaria(iv, { campaign_id: c.id });
  const sets = db.where("ad_sets", (a) => a.campaign_id === c.id), ads = db.where("ads", (a) => a.campaign_id === c.id);
  const leads = db.where("leads", (l) => l.campaign_id === c.id).sort((a, b) => b.entered_at.localeCompare(a.entered_at));
  const vendas = db.where("sales", (v) => v.campaign_id === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const metricas = db.where("campaign_metrics", (m) => m.campaign_id === c.id && m.date >= iv.inicio && m.date <= iv.fim).sort((a, b) => b.date.localeCompare(a.date));
  const prod = db.get("products", c.product_id);
  const gastoTotal = kpis({ inicio: "2000-01-01", fim: "2999-12-31" }, { campaign_id: c.id }).spend;
  root.innerHTML = `<div class="pagina-cab"><div><a href="#/campanhas" class="link">← Campanhas</a><h1>${esc(c.name)} ${badgeOpcao("campaign_status", c.status)}</h1><p class="sub">${esc(rotuloOpcao("platform", c.platform))} · ${esc(rotuloOpcao("objective", c.objective))}${prod ? ` · <a href="#/produtos/${prod.id}">${esc(prod.name)}</a>` : ""}${c.category ? " · " + esc(c.category) : ""} · ${c.start_date ? "início " + dataBR(c.start_date) : ""}${c.end_date ? " · término " + dataBR(c.end_date) : ""}${c.source === "meta" ? " · " + badge("dados automáticos da Meta", "acento") : ""}</p></div>
    <div class="pagina-acoes">${podeEditar() ? `<button class="btn" data-lancar>📝 Lançar métricas</button><a class="btn" href="#/leads?novo=1&campanha=${c.id}">➕ Lead</a><a class="btn btn-verde" href="#/vendas?novo=1&campanha=${c.id}">💰 Venda</a><button class="btn btn-primario" data-editar>✏️ Editar</button>` : ""}</div></div>
    ${s.sinais.length ? `<div class="lista" style="margin-bottom:14px">${s.sinais.map((sn) => `<div class="aviso ${sn.tipo === "boa" ? "aviso-ok" : sn.tipo === "ruim" ? "aviso-erro" : "aviso-alerta"}" style="margin:0">${prioridadeBadge(sn.prioridade)} ${esc(sn.texto[0].toUpperCase() + sn.texto.slice(1))}.</div>`).join("")}</div>` : ""}
    <div class="grid3">
      ${cartao("Orçamento", `<div class="kpis" style="grid-template-columns:1fr 1fr">${kpi({ rotulo: "Diário", valor: brl(c.daily_budget) })}${kpi({ rotulo: "Total previsto", valor: brl(c.total_budget) })}${kpi({ rotulo: "Gasto acumulado", valor: brl(gastoTotal), sub: c.total_budget ? pct(gastoTotal / c.total_budget) + " do total" : "" })}${kpi({ rotulo: "Gasto no período", valor: brl(k.spend) })}</div>`)}
      ${cartao("Decisão da campanha", `<div class="campo"><label>Decisão</label><select data-decisao>${OPCOES.decision.map(([v, t]) => `<option value="${v}"${c.decision === v ? " selected" : ""}>${t}</option>`).join("")}</select></div><div class="campo" style="margin-top:8px"><label>Observações</label><textarea data-obs>${esc(c.notes || "")}</textarea></div><button class="btn btn-pq btn-primario" data-salvar-decisao style="margin-top:8px">Salvar</button>`)}
      ${cartao("Público", sets.length ? `<div class="lista">${sets.map((a) => itemLista({ titulo: esc(a.name), sub: esc(a.targeting || "") + (a.audience_id ? " · " + esc((db.get("audiences", a.audience_id) || {}).name || "") : ""), badges: badgeOpcao("campaign_status", a.status), direita: a.daily_budget ? brl(a.daily_budget) + "/dia" : "" })).join("")}</div>` : (c.audience_id ? itemLista({ titulo: esc((db.get("audiences", c.audience_id) || {}).name || ""), sub: "público principal" }) : vazio("Sem conjuntos cadastrados.")), podeEditar() ? `<button class="btn btn-pq" data-novo-conjunto>➕ Conjunto</button>` : "")}
    </div>
    ${cartao("Resultados no período", linhaNumeros(k, ["spend", "revenue", "gross_profit", "roas", "roi", "leads", "sales", "conversion", "cpl", "cpa", "ticket", "ctr", "cpc", "cpm", "impressions", "reach"]) + graficoLinhas({ rotulos: serie.map((d) => dataCurta(d.date)), series: [{ nome: "Investimento", cor: "var(--acento)", valores: serie.map((d) => d.spend), barras: true }, { nome: "Faturamento", cor: "var(--verde)", valores: serie.map((d) => d.revenue) }], formato: "money", altura: 200 }))}
    <div class="grid2">
      ${cartao("Anúncios e criativos", ads.length ? tabela("camp-ads", { colunas: [{ key: "name", label: "Anúncio", render: (a) => { const cr = db.get("creatives", a.creative_id); return `${cr && cr.thumbnail ? `<img class="mini" src="${esc(cr.thumbnail)}" alt="">` : ""}<a href="#/anuncios/${a.id}">${esc(a.name)}</a>${cr ? `<br><small><a href="#/criativos/${cr.id}">${esc(cr.name)}</a></small>` : ""}`; } }, { key: "status", label: "Status", render: (a) => badgeOpcao("campaign_status", a.status) }, { key: "spend", label: "Gasto", tipo: "num", valor: (a) => kpis(iv, { ad_id: a.id }).spend, fmt: brl }, { key: "leads", label: "Leads", tipo: "num", valor: (a) => kpis(iv, { ad_id: a.id }).leads_base, fmt: inteiro }, { key: "sales", label: "Vendas", tipo: "num", valor: (a) => kpis(iv, { ad_id: a.id }).sales, fmt: inteiro }, { key: "ctr", label: "CTR", tipo: "num", valor: (a) => kpis(iv, { ad_id: a.id }).ctr, fmt: (v) => pct(v) }, { key: "cpa", label: "CPA", tipo: "num", valor: (a) => kpis(iv, { ad_id: a.id }).cpa, fmt: brl }], linhas: ads, ordem: "spend" }) : vazio("Nenhum anúncio cadastrado nesta campanha."), podeEditar() ? `<button class="btn btn-pq" data-novo-anuncio>➕ Anúncio</button>` : "")}
      ${cartao("Métricas lançadas no período", metricas.length ? tabela("camp-metricas", { colunas: [{ key: "date", label: "Dia", fmt: dataBR }, { key: "ad", label: "Anúncio", valor: (m) => (db.get("ads", m.ad_id) || {}).name || "—" }, { key: "spend", label: "Gasto", tipo: "num", fmt: brl }, { key: "impressions", label: "Impr.", tipo: "num", fmt: inteiro }, { key: "link_clicks", label: "Cliques", tipo: "num", valor: (m) => m.link_clicks || m.clicks, fmt: inteiro }, { key: "results", label: "Result.", tipo: "num", fmt: inteiro }, { key: "source", label: "Origem", render: (m) => badge(rotuloOpcao("metric_source", m.source), m.source === "meta" ? "acento" : "cinza") }, { key: "acao", label: "", render: (m) => m.source !== "meta" && podeEditar() ? `<button class="btn btn-pq" data-editar-metrica="${m.id}">✏️</button>` : "" }], linhas: metricas, ordem: "date", limite: 60 }) : vazio("Nenhuma métrica no período. Lance manualmente, importe um CSV ou aguarde a coleta da Meta."))}
    </div>
    <div class="grid2">
      ${cartao(`Leads desta campanha (${leads.length})`, leads.length ? `<div class="lista">${leads.slice(0, 10).map((l) => itemLista({ titulo: esc(l.name), sub: dataBR(l.entered_at) + (l.product_id ? " · " + esc((db.get("products", l.product_id) || {}).name || "") : ""), badges: badgeOpcao("lead_stage", l.stage), direita: brl(l.potential_value), href: `#/leads/${l.id}` })).join("")}</div>` : vazio("Nenhum lead atribuído a esta campanha."))}
      ${cartao(`Vendas desta campanha (${vendas.length})`, vendas.length ? tabela("camp-vendas", { colunas: [{ key: "date", label: "Data", fmt: dataBR }, { key: "product", label: "Produto", valor: (v) => (db.get("products", v.product_id) || {}).name || "—" }, { key: "value", label: "Valor", tipo: "num", fmt: brl }, { key: "seller", label: "Vendedor", valor: (v) => (db.get("users", v.seller_user_id) || {}).name || "—" }], linhas: vendas, ordem: "date", limite: 20 }) : vazio("Nenhuma venda atribuída."))}
    </div>`;
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.addEventListener("click", fn); };
  on("[data-editar]", () => abrirFormulario("campaigns", c.id, { ocultar: c.source === "meta" ? [] : ["external_id", "source"], onSave: ctx.rerender, onDelete: () => ctx.navegar("#/campanhas") }));
  on("[data-lancar]", () => lancarMetricas(ctx, c.id));
  on("[data-salvar-decisao]", () => { db.update("campaigns", c.id, { decision: root.querySelector("[data-decisao]").value, notes: root.querySelector("[data-obs]").value }); toast("Decisão salva."); ctx.rerender(); });
  on("[data-novo-conjunto]", () => abrirFormulario("ad_sets", null, { padrao: { campaign_id: c.id }, ocultar: ["external_id"], onSave: ctx.rerender }));
  on("[data-novo-anuncio]", () => abrirFormulario("ads", null, { padrao: { campaign_id: c.id }, ocultar: ["external_id"], onSave: ctx.rerender }));
  root.querySelectorAll("[data-editar-metrica]").forEach((b) => b.addEventListener("click", () => abrirFormulario("campaign_metrics", b.dataset.editarMetrica, { ocultar: ["source"], onSave: ctx.rerender, onDelete: ctx.rerender })));
}

export default { id: "campanhas", titulo: "Campanhas", icone: "📣", render(root, ctx) { const c = ctx.rota.id && db.get("campaigns", ctx.rota.id); if (c) detalhe(root, ctx, c); else lista(root, ctx); } };
