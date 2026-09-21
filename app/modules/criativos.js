import { db } from "../core/db.js";
import { kpis, serieDiaria, mediaCampanhas } from "../core/metrics.js";
import { classificarCriativo, CLASSES_CRIATIVO } from "../core/rules.js";
import { cartao, tabela, badge, badgeOpcao, chips, abrirFormulario, vazio, graficoLinhas, itemLista, abas } from "../core/ui.js";
import { esc, brl, inteiro, pct, mult, dataBR, dataCurta } from "../core/format.js";
import { bannerDemo, btnNovo, linhaNumeros } from "./comum.js";
import { rotulo as rotuloOpcao, OPCOES } from "../core/schema.js";
import { podeEditar } from "../core/auth.js";

let visao = "ranking", filtroClasse = "";
function lista(root, ctx) {
  const iv = ctx.iv, media = mediaCampanhas(iv);
  const todos = db.all("creatives").map((c) => ({ ...c, cl: classificarCriativo(c, iv, media) })).map((c) => ({ ...c, k: c.cl.k }));
  const lin = todos.filter((c) => !filtroClasse || c.cl.classe === filtroClasse);
  const ordenados = lin.slice().sort((a, b) => (b.k.sales - a.k.sales) || (b.k.revenue - a.k.revenue) || (b.k.leads_base - a.k.leads_base) || ((b.k.ctr || 0) - (a.k.ctr || 0)));
  const contagem = Object.keys(CLASSES_CRIATIVO).map((k) => [k, `${CLASSES_CRIATIVO[k][0]} (${todos.filter((c) => c.cl.classe === k).length})`]);
  const card = (c, i) => `<div class="criativo-card"><a href="#/criativos/${c.id}">${c.thumbnail ? `<img src="${esc(c.thumbnail)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=semimg>🖼️</div>'">` : `<div class="semimg">${{ video: "🎬", reels: "🎞️", story: "📱", carrossel: "🧩" }[c.type] || "🖼️"}</div>`}</a><div class="cc">${i != null ? `<span class="ranking-pos ${i < 3 ? "p" + (i + 1) : ""}">${i + 1}</span>` : ""}<b><a href="#/criativos/${c.id}">${esc(c.name)}</a></b>${badge(c.cl.rotulo, c.cl.cor)} ${badge(rotuloOpcao("creative_type", c.type), "roxo")}<div class="sub" style="margin-top:6px">${inteiro(c.k.sales)} venda(s) · ${inteiro(c.k.leads_base)} lead(s)<br>gasto ${brl(c.k.spend)} · CTR ${pct(c.k.ctr)} · CPA ${brl(c.k.cpa)} · ROAS ${mult(c.k.roas)}</div></div></div>`;
  root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>Criativos</h1><p class="sub">${todos.length} criativo(s) · classificados automaticamente pelo desempenho no período</p></div><div class="pagina-acoes"><a class="btn" href="#/briefings?novo=1">🎬 Solicitar criativo</a>${btnNovo("Novo criativo", 'data-novo="1"')}</div></div>
    ${abas([["ranking", "Ranking visual"], ["tabela", "Tabela"]], visao)}
    ${chips([["", "Todos"], ...contagem], filtroClasse, "data-fc")}<div style="height:10px"></div>
    ${visao === "ranking" ? (ordenados.length ? `<div class="grade-cards">${ordenados.map((c, i) => card(c, i)).join("")}</div>` : vazio("Nenhum criativo.")) : cartao("", tabela("criativos", { colunas: [
      { key: "name", label: "Criativo", render: (c) => `${c.thumbnail ? `<img class="mini" src="${esc(c.thumbnail)}" alt="">` : ""}<a href="#/criativos/${c.id}">${esc(c.name)}</a><br><small>${esc(rotuloOpcao("creative_type", c.type))}${c.product_id ? " · " + esc((db.get("products", c.product_id) || {}).name || "") : ""}${c.campaign_id ? " · " + esc((db.get("campaigns", c.campaign_id) || {}).name || "") : ""}</small>` },
      { key: "classe", label: "Classificação", valor: (c) => c.cl.rotulo, render: (c) => badge(c.cl.rotulo, c.cl.cor) },
      { key: "impressions", label: "Impressões", tipo: "num", valor: (c) => c.k.impressions, fmt: inteiro }, { key: "reach", label: "Alcance", tipo: "num", valor: (c) => c.k.reach, fmt: inteiro }, { key: "clicks", label: "Cliques", tipo: "num", valor: (c) => c.k.link_clicks || c.k.clicks, fmt: inteiro }, { key: "ctr", label: "CTR", tipo: "num", valor: (c) => c.k.ctr, fmt: (v) => pct(v) }, { key: "cpc", label: "CPC", tipo: "num", valor: (c) => c.k.cpc, fmt: brl },
      { key: "leads", label: "Leads", tipo: "num", valor: (c) => c.k.leads_base, fmt: inteiro }, { key: "sales", label: "Vendas", tipo: "num", valor: (c) => c.k.sales, fmt: inteiro }, { key: "cpa", label: "CPA", tipo: "num", valor: (c) => c.k.cpa, fmt: brl }, { key: "roas", label: "ROAS", tipo: "num", valor: (c) => c.k.roas, fmt: mult }, { key: "published_at", label: "Publicado", fmt: dataBR },
    ], linhas: lin, ordem: "sales" }))}`;
  root.querySelectorAll("[data-aba]").forEach((b) => b.addEventListener("click", () => { visao = b.dataset.aba; ctx.rerender(); }));
  root.querySelectorAll("[data-fc]").forEach((b) => b.addEventListener("click", () => { filtroClasse = b.dataset.fc; ctx.rerender(); }));
  const n = root.querySelector("[data-novo]"); if (n) n.addEventListener("click", () => abrirFormulario("creatives", null, { ocultar: ["external_id"], onSave: (c) => ctx.navegar(`#/criativos/${c.id}`) }));
}
function detalhe(root, ctx, c) {
  const iv = ctx.iv, cl = classificarCriativo(c, iv, mediaCampanhas(iv)), k = cl.k;
  const serie = serieDiaria(iv, { creative_id: c.id });
  const ads = db.where("ads", (a) => a.creative_id === c.id), vendas = db.where("sales", (s) => s.creative_id === c.id), leads = db.where("leads", (l) => l.creative_id === c.id);
  const testes = db.where("ab_tests", (t) => t.creative_a_id === c.id || t.creative_b_id === c.id);
  root.innerHTML = `<div class="pagina-cab"><div><a href="#/criativos" class="link">← Criativos</a><h1>${esc(c.name)} ${badge(cl.rotulo, cl.cor)}</h1><p class="sub">${esc(rotuloOpcao("creative_type", c.type))}${c.product_id ? ` · produto <a href="#/produtos/${c.product_id}">${esc((db.get("products", c.product_id) || {}).name || "")}</a>` : ""}${c.campaign_id ? ` · campanha <a href="#/campanhas/${c.campaign_id}">${esc((db.get("campaigns", c.campaign_id) || {}).name || "")}</a>` : ""}${c.owner_user_id ? " · por " + esc((db.get("users", c.owner_user_id) || {}).name || "") : ""}</p></div><div class="pagina-acoes">${podeEditar() ? `<a class="btn" href="#/testes?novo=1&a=${c.id}">🧪 Teste A/B</a><button class="btn btn-primario" data-editar>✏️ Editar</button>` : ""}</div></div>
    <div class="grid2">${cartao("Peça", `<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">${c.thumbnail ? `<img src="${esc(c.thumbnail)}" style="width:160px;max-width:40%;border-radius:12px">` : ""}<div style="flex:1;min-width:200px"><p><b>Copy:</b> ${esc(c.copy || "—")}</p><p><b>CTA:</b> ${esc(c.cta || "—")}</p><p><b>Criado:</b> ${dataBR(c.created_at_date)} · <b>Publicado:</b> ${dataBR(c.published_at)}</p>${c.link ? `<p><a href="${esc(c.link)}" target="_blank" rel="noopener">Abrir link / arquivo</a></p>` : ""}${c.notes ? `<p class="sub">${esc(c.notes)}</p>` : ""}</div></div>`)}
    ${cartao("Onde é usado", ads.length ? `<div class="lista">${ads.map((a) => itemLista({ titulo: esc(a.name), sub: esc((db.get("campaigns", a.campaign_id) || {}).name || ""), badges: badgeOpcao("campaign_status", a.status), href: `#/anuncios/${a.id}` })).join("")}</div>` : vazio("Nenhum anúncio usa este criativo.") + (testes.length ? `<h3>Testes A/B</h3><div class="lista">${testes.map((t) => itemLista({ titulo: esc(t.name), sub: rotuloOpcao("ab_result", t.result), href: "#/testes" })).join("")}</div>` : ""))}</div>
    ${cartao("Métricas no período", linhaNumeros(k, ["impressions", "reach", "link_clicks", "ctr", "cpc", "leads", "sales", "cpa", "roas", "spend", "revenue"]) + `<p class="sub">Período anterior: CTR ${pct(cl.kAnt.ctr)} · CPA ${brl(cl.kAnt.cpa)} · ROAS ${mult(cl.kAnt.roas)}</p>` + graficoLinhas({ rotulos: serie.map((d) => dataCurta(d.date)), series: [{ nome: "CTR", cor: "var(--ciano)", valores: serie.map((d) => (d.ctr || 0) * 100) }], formato: "int", altura: 160 }))}
    ${cartao(`Vendas atribuídas (${vendas.length}) · leads (${leads.length})`, vendas.length ? tabela("cr-vendas", { colunas: [{ key: "date", label: "Data", fmt: dataBR }, { key: "product", label: "Produto", valor: (v) => (db.get("products", v.product_id) || {}).name || "—" }, { key: "value", label: "Valor", tipo: "num", fmt: brl }], linhas: vendas, ordem: "date" }) : vazio("Sem vendas atribuídas a este criativo."))}`;
  const e = root.querySelector("[data-editar]"); if (e) e.addEventListener("click", () => abrirFormulario("creatives", c.id, { ocultar: ["external_id"], onSave: ctx.rerender, onDelete: () => ctx.navegar("#/criativos") }));
}
export default { id: "criativos", titulo: "Criativos", icone: "🎬", render(root, ctx) { const c = ctx.rota.id && db.get("creatives", ctx.rota.id); if (c) detalhe(root, ctx, c); else lista(root, ctx); } };
