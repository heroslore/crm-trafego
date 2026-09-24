import { db } from "../core/db.js?v=f9372346";
import { kpis, resumoProduto, serieDiaria, porEntidade } from "../core/metrics.js?v=f9372346";
import { classificarProduto, CLASSES_PRODUTO } from "../core/rules.js?v=f9372346";
import { cartao, tabela, badge, chips, abrirFormulario, vazio, itemLista, graficoLinhas, kpi, progresso } from "../core/ui.js?v=f9372346";
import { esc, brl, inteiro, pct, mult, dataBR, dataCurta, hoje } from "../core/format.js?v=f9372346";
import { bannerDemo, btnNovo, linhaNumeros } from "./comum.js?v=f9372346";
import { rotulo as rotuloOpcao } from "../core/schema.js?v=f9372346";
import { podeEditar } from "../core/auth.js?v=f9372346";

let filtro = "todos";
const FILTROS = [["todos", "Todos"], ["vendendo", "Vendendo muito"], ["precisa_campanha", "Precisa de campanha"], ["parado", "Parados"], ["estoque_alto", "Estoque alto"], ["estoque_critico", "Acabando"], ["inativos", "Inativos"]];

function badgeClasse(cl) { return badge(cl.rotulo, cl.cor); }
function flagsHtml(cl) { const n = { estoque_critico: ["Acabando", "vermelho"], estoque_alto: ["Estoque alto", "amarelo"], parado: ["Parado", "vermelho"], crescendo: ["Crescendo", "verde"], precisa_campanha: ["Precisa de campanha", "ciano"], margem_alta: ["Margem alta", "verde"] }; return cl.flags.map((f) => n[f] ? badge(n[f][0], n[f][1]) : "").join(" "); }

function lista(root, ctx) {
  const todos = db.all("products").map((p) => ({ p, cl: classificarProduto(p) }));
  const lin = todos.filter(({ p, cl }) => {
    if (filtro === "inativos") return p.active === false;
    if (p.active === false) return false;
    if (filtro === "todos") return true;
    if (filtro === "vendendo") return cl.classe === "campeao" || cl.classe === "potencial";
    if (filtro === "parado") return cl.classe === "parado";
    return cl.flags.includes(filtro);
  }).map(({ p, cl }) => ({ ...p, cl, r: cl.resumo }));
  const cont = (f) => todos.filter(({ p, cl }) => p.active !== false && (f === "vendendo" ? (cl.classe === "campeao" || cl.classe === "potencial") : f === "parado" ? cl.classe === "parado" : cl.flags.includes(f))).length;
  root.innerHTML = `${bannerDemo()}
    <div class="pagina-cab"><div><h1>Produtos</h1><p class="sub">${todos.filter((x) => x.p.active !== false).length} produto(s) · classificação automática pelas vendas e pelo estoque</p></div><div class="pagina-acoes">${btnNovo("Novo produto", 'data-novo="1"')}</div></div>
    <div class="kpis">${kpi({ rotulo: "Vendendo muito", valor: inteiro(cont("vendendo")) })}${kpi({ rotulo: "Precisa de campanha", valor: inteiro(cont("precisa_campanha")) })}${kpi({ rotulo: "Parados", valor: inteiro(cont("parado")) })}${kpi({ rotulo: "Estoque alto", valor: inteiro(cont("estoque_alto")) })}${kpi({ rotulo: "Acabando", valor: inteiro(cont("estoque_critico")) })}</div>
    ${chips(FILTROS, filtro, "data-filtro")}
    <div style="height:10px"></div>
    ${cartao("", tabela("produtos", { colunas: [
      { key: "name", label: "Produto", render: (l) => `${l.photo ? `<img class="mini" src="${esc(l.photo)}" alt="">` : ""}<a href="#/produtos/${l.id}">${esc(l.name)}</a><br><small>${esc(l.category || "")}${l.sku ? " · " + esc(l.sku) : ""}</small>` },
      { key: "classe", label: "Classificação", valor: (l) => l.cl.rotulo, render: (l) => badgeClasse(l.cl) + " " + flagsHtml(l.cl) },
      { key: "stock", label: "Estoque", tipo: "num", fmt: inteiro, render: (l) => `${inteiro(l.stock)}${l.stock_min ? ` <small>/ mín ${inteiro(l.stock_min)}</small>` : ""}` },
      { key: "price", label: "Preço", tipo: "num", fmt: brl }, { key: "cost", label: "Custo", tipo: "num", fmt: brl },
      { key: "margem", label: "Margem", tipo: "num", valor: (l) => l.r.margem, fmt: (v) => pct(v) },
      { key: "qtd7", label: "Vend. 7d", tipo: "num", valor: (l) => l.r.qtd7, fmt: inteiro }, { key: "qtd30", label: "Vend. 30d", tipo: "num", valor: (l) => l.r.qtd30, fmt: inteiro },
      { key: "fat30", label: "Faturamento 30d", tipo: "num", valor: (l) => l.r.fat30, fmt: brl }, { key: "lucro30", label: "Lucro 30d", tipo: "num", valor: (l) => l.r.lucro30, fmt: brl },
      { key: "campanhas", label: "Campanhas", tipo: "num", valor: (l) => l.r.campanhas, render: (l) => `${l.r.campanhas_ativas} ativa(s) / ${l.r.campanhas}` },
    ], linhas: lin, ordem: "qtd30", vazioTxt: "Nenhum produto neste filtro." }))}`;
  root.querySelectorAll("[data-filtro]").forEach((b) => b.addEventListener("click", () => { filtro = b.dataset.filtro; ctx.rerender(); }));
  const novo = root.querySelector("[data-novo]"); if (novo) novo.addEventListener("click", () => abrirFormulario("products", null, { onSave: ctx.rerender }));
}

function detalhe(root, ctx, p) {
  const cl = classificarProduto(p), r = cl.resumo, iv = ctx.iv;
  const k = kpis(iv, { product_id: p.id });
  const serie = serieDiaria(iv, { product_id: p.id });
  const camps = db.where("campaigns", (c) => c.product_id === p.id);
  const vendas = db.where("sales", (s) => s.product_id === p.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  const crs = db.where("creatives", (c) => c.product_id === p.id);
  root.innerHTML = `<div class="pagina-cab"><div><a href="#/produtos" class="link">← Produtos</a><h1>${esc(p.name)} ${badgeClasse(cl)}</h1><p class="sub">${esc(p.category || "")}${p.sku ? " · SKU " + esc(p.sku) : ""} · ${flagsHtml(cl)}</p></div><div class="pagina-acoes">${podeEditar() ? `<button class="btn" data-editar>✏️ Editar</button><a class="btn" href="#/briefings?novo=1&produto=${p.id}">🎬 Solicitar criativo</a><a class="btn btn-primario" href="#/campanhas?novo=1&produto=${p.id}">📣 Nova campanha</a>` : ""}</div></div>
    <div class="grid3">
      ${cartao("Ficha", `<div class="ficha-cab">${p.photo ? `<img src="${esc(p.photo)}" style="width:90px;height:90px;object-fit:cover;border-radius:12px">` : ""}<div><div><b>Preço</b> ${brl(p.price)} · <b>Custo</b> ${brl(p.cost)} · <b>Margem</b> ${pct(r.margem)}</div><div><b>Estoque</b> ${inteiro(p.stock)} (mín. ${inteiro(p.stock_min)})${r.estoque_dias != null ? ` · dura ~${inteiro(r.estoque_dias)} dias no ritmo atual` : ""}</div><div><b>Última venda</b> ${r.ultima_venda ? dataBR(r.ultima_venda) + " (" + r.dias_sem_venda + " dias)" : "nunca"}</div></div></div>${p.notes ? `<p class="sub">${esc(p.notes)}</p>` : ""}`)}
      ${cartao("Vendas", `<div class="kpis" style="grid-template-columns:1fr 1fr">${kpi({ rotulo: "Últimos 7 dias", valor: inteiro(r.qtd7), sub: `${inteiro(r.qtd7ant)} na semana anterior` })}${kpi({ rotulo: "Últimos 30 dias", valor: inteiro(r.qtd30), sub: brl(r.fat30) })}${kpi({ rotulo: "Faturamento total", valor: brl(r.fat_total) })}${kpi({ rotulo: "Lucro total", valor: brl(r.lucro_total) })}</div>`)}
      ${cartao("Tráfego (30 dias)", `<div class="kpis" style="grid-template-columns:1fr 1fr">${kpi({ rotulo: "Investimento", valor: brl(r.spend30) })}${kpi({ rotulo: "ROAS", valor: mult(r.roas30) })}${kpi({ rotulo: "Campanhas", valor: `${r.campanhas_ativas} <small>ativa(s) de ${r.campanhas}</small>` })}${kpi({ rotulo: "Criativos", valor: inteiro(crs.length) })}</div>`)}
    </div>
    ${cartao("No período selecionado", linhaNumeros(k) + graficoLinhas({ rotulos: serie.map((d) => dataCurta(d.date)), series: [{ nome: "Faturamento", cor: "var(--verde)", valores: serie.map((d) => d.revenue) }, { nome: "Investimento", cor: "var(--acento)", valores: serie.map((d) => d.spend) }], formato: "money", altura: 180 }))}
    <div class="grid2">
      ${cartao("Campanhas deste produto", camps.length ? `<div class="lista">${camps.map((c) => { const kc = kpis(iv, { campaign_id: c.id }); return itemLista({ titulo: esc(c.name), sub: `${rotuloOpcao("platform", c.platform)} · ${brl(kc.spend)} · ${inteiro(kc.sales)} venda(s)`, badges: badge(rotuloOpcao("campaign_status", c.status), c.status === "ativa" ? "verde" : "cinza"), direita: mult(kc.roas), href: `#/campanhas/${c.id}` }); }).join("")}</div>` : vazio("Nenhuma campanha ligada a este produto."))}
      ${cartao("Últimas vendas", vendas.length ? tabela("prod-vendas", { colunas: [{ key: "date", label: "Data", fmt: dataBR }, { key: "value", label: "Valor", tipo: "num", fmt: brl }, { key: "seller", label: "Vendedor", valor: (s) => (db.get("users", s.seller_user_id) || {}).name || "—" }, { key: "campaign", label: "Campanha", valor: (s) => (db.get("campaigns", s.campaign_id) || {}).name || "—" }], linhas: vendas, ordem: "date" }) : vazio("Sem vendas registradas."))}
    </div>`;
  const ed = root.querySelector("[data-editar]"); if (ed) ed.addEventListener("click", () => abrirFormulario("products", p.id, { onSave: ctx.rerender, onDelete: () => ctx.navegar("#/produtos") }));
}

export default { id: "produtos", titulo: "Produtos", icone: "📦", render(root, ctx) { const p = ctx.rota.id && db.get("products", ctx.rota.id); if (p) detalhe(root, ctx, p); else lista(root, ctx); } };
