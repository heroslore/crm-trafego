// Clientes e LTV: quem já comprou, quanto vale ao longo do tempo e qual campanha o trouxe.
import { db } from "../core/db.js?v=890e3831";
import { clientes, ltvPorCampanha, liquidoDaVenda } from "../core/metrics.js?v=890e3831";
import { cartao, tabela, badge, vazio, kpi, abas, itemLista, barrasH } from "../core/ui.js?v=890e3831";
import { esc, brl, inteiro, pct, dataBR, waLink, semAcento, diasEntre, hoje, dec } from "../core/format.js?v=890e3831";
import { bannerDemo } from "./comum.js?v=890e3831";
import { rotulo as rotuloOpcao } from "../core/schema.js?v=890e3831";

let aba = "lista", busca = "", filtro = "todos";

export default {
  id: "clientes", titulo: "Clientes", icone: "🧑‍🤝‍🧑",
  render(root, ctx) {
    const todos = clientes();
    const b = semAcento(busca.trim());
    const lista = todos.filter((c) => {
      if (filtro === "recompra" && !c.recompra) return false;
      if (filtro === "unica" && c.recompra) return false;
      if (filtro === "sumidos" && !(c.ultima_compra && diasEntre(c.ultima_compra, hoje()) >= 60)) return false;
      if (b && !semAcento(`${c.nome} ${c.telefone}`).includes(b)) return false;
      return true;
    });
    const total = todos.reduce((s, c) => s + c.total, 0);
    const lucro = todos.reduce((s, c) => s + c.lucro, 0);
    const comRecompra = todos.filter((c) => c.recompra).length;
    const ltv = todos.length ? total / todos.length : 0;
    const metaLtv = db.goal("ltv_meta", 0);
    const porCampanha = ltvPorCampanha();

    let corpo = "";
    if (aba === "lista") {
      corpo = `<div class="filtros-linha"><input type="search" placeholder="Buscar cliente" value="${esc(busca)}" data-busca>
        <div class="chips">${[["todos", "Todos"], ["recompra", "Compraram mais de uma vez"], ["unica", "Compraram uma vez"], ["sumidos", "Sem comprar há 60 dias"]].map(([v, t]) => `<button class="chip${filtro === v ? " ativa" : ""}" data-f="${v}">${t}</button>`).join("")}</div></div>
        ${cartao("", tabela("clientes", { colunas: [
          { key: "nome", label: "Cliente", render: (c) => `${c.lead ? `<a href="#/leads/${c.lead.id}">${esc(c.nome)}</a>` : esc(c.nome)}${c.telefone ? `<br><small><a href="${esc(waLink(c.telefone))}" target="_blank" rel="noopener">${esc(c.telefone)}</a></small>` : ""}` },
          { key: "compras", label: "Compras", tipo: "num", fmt: inteiro, render: (c) => `${inteiro(c.compras)} ${c.recompra ? badge("recompra", "verde") : ""}` },
          { key: "total", label: "Total comprado", tipo: "num", fmt: brl },
          { key: "lucro", label: "Lucro gerado", tipo: "num", fmt: brl },
          { key: "ticket", label: "Ticket médio", tipo: "num", fmt: brl },
          { key: "ultima_compra", label: "Última compra", fmt: dataBR, render: (c) => `${dataBR(c.ultima_compra)}<br><small>${c.ultima_compra ? diasEntre(c.ultima_compra, hoje()) + " dias" : ""}</small>` },
          { key: "produto_favorito", label: "Produto preferido", valor: (c) => (db.get("products", c.produto_favorito) || {}).name || "", render: (c) => esc((db.get("products", c.produto_favorito) || {}).name || "—") },
          { key: "campanha_origem", label: "Veio de", valor: (c) => (db.get("campaigns", c.campanha_origem) || {}).name || "", render: (c) => c.campanha_origem ? `<a href="#/campanhas/${c.campanha_origem}">${esc((db.get("campaigns", c.campanha_origem) || {}).name || "")}</a>` : `<small>${esc(rotuloOpcao("lead_source", c.origem))}</small>` },
        ], linhas: lista, ordem: "total", vazioTxt: "Nenhum cliente ainda. Cada venda registrada vira um cliente aqui." }))}`;
    } else {
      corpo = cartao("LTV por campanha de origem", porCampanha.length ? `<p class="sub" style="margin-bottom:10px">Quanto cada campanha gerou depois da primeira venda. Uma campanha com CPA alto pode ser a melhor se aqueles clientes voltarem a comprar.</p>` + tabela("ltv-camp", { colunas: [
        { key: "nome", label: "Campanha", render: (g) => g.campaign_id ? `<a href="#/campanhas/${g.campaign_id}">${esc(g.nome)}</a>` : esc(g.nome) },
        { key: "clientes", label: "Clientes", tipo: "num", fmt: inteiro },
        { key: "compras_por_cliente", label: "Compras por cliente", tipo: "num", fmt: (v) => dec(v, 2) },
        { key: "taxa_recompra", label: "Recompra", tipo: "num", fmt: (v) => pct(v) },
        { key: "ltv", label: "LTV", tipo: "num", fmt: brl },
        { key: "lucro_medio", label: "Lucro por cliente", tipo: "num", fmt: brl },
        { key: "total", label: "Total gerado", tipo: "num", fmt: brl },
      ], linhas: porCampanha, ordem: "ltv" }) + `<h3>LTV médio por campanha</h3>${barrasH(porCampanha.map((g) => ({ nome: g.nome, valor: g.ltv, cor: "var(--verde)", extra: `${inteiro(g.clientes)} cliente(s) · ${pct(g.taxa_recompra)} recompra` })), { fmt: brl })}` : vazio("Sem vendas suficientes para calcular LTV."));
    }

    root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>Clientes</h1><p class="sub">Quem já comprou, quanto vale ao longo do tempo e de onde veio</p></div></div>
      <div class="kpis">${kpi({ rotulo: "Clientes", valor: inteiro(todos.length) })}${kpi({ rotulo: "Faturamento total", valor: brl(total), destaque: true })}${kpi({ rotulo: "Lucro gerado", valor: brl(lucro) })}${kpi({ rotulo: "LTV médio", valor: brl(ltv), destaque: true, avaliacao: metaLtv ? { nivel: ltv >= metaLtv ? "bom" : "atencao", rotulo: ltv >= metaLtv ? "Na meta" : "Abaixo", meta: metaLtv } : null })}${kpi({ rotulo: "Compraram mais de uma vez", valor: inteiro(comRecompra), sub: todos.length ? pct(comRecompra / todos.length) : "" })}${kpi({ rotulo: "Compras por cliente", valor: todos.length ? dec(todos.reduce((s, c) => s + c.compras, 0) / todos.length, 2) : "—" })}</div>
      ${abas([["lista", "Clientes"], ["ltv", "LTV por campanha"]], aba)}${corpo}`;

    root.querySelectorAll("[data-aba]").forEach((x) => x.addEventListener("click", () => { aba = x.dataset.aba; ctx.rerender(); }));
    root.querySelectorAll("[data-f]").forEach((x) => x.addEventListener("click", () => { filtro = x.dataset.f; ctx.rerender(); }));
    const bs = root.querySelector("[data-busca]");
    if (bs) bs.addEventListener("input", (e) => { busca = e.target.value; const p = e.target.selectionStart; ctx.rerender(); const n = root.querySelector("[data-busca]"); if (n) { n.focus(); n.setSelectionRange(p, p); } });
  },
};
