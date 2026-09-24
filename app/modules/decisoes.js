import { db } from "../core/db.js?v=e38ac044";
import { centralDecisoes, oportunidades, alertas, analise } from "../core/rules.js?v=e38ac044";
import { cartao, vazio, itemLista, prioridadeBadge, abas, chips } from "../core/ui.js?v=e38ac044";
import { esc } from "../core/format.js?v=e38ac044";
import { bannerDemo, tabelaOportunidades } from "./comum.js?v=e38ac044";

let aba = "atencao", prio = "";
export default {
  id: "decisoes", titulo: "Central de Decisões", icone: "🎯",
  render(root, ctx) {
    const iv = ctx.iv;
    if (ctx.rota.aba) aba = ctx.rota.aba;
    let corpo = "";
    if (aba === "atencao") {
      const secoes = centralDecisoes(iv).map((s) => ({ ...s, itens: s.itens.filter((i) => !prio || i.prioridade === prio) }));
      const total = secoes.reduce((n, s) => n + s.itens.length, 0);
      corpo = `${chips([["", "Todas"], ["urgente", "Urgente"], ["alta", "Alta"], ["media", "Média"], ["baixa", "Baixa"]], prio, "data-prio")}<p class="sub" style="margin:8px 0 12px">${total} item(ns) precisam da sua atenção hoje.</p><div class="grid2">${secoes.map((s) => cartao(`${esc(s.titulo)} <small>${s.itens.length}</small>`, s.itens.length ? `<div class="lista">${s.itens.map((i) => itemLista({ titulo: esc(i.titulo), sub: esc(i.texto), badges: prioridadeBadge(i.prioridade), href: i.link })).join("")}</div>` : `<div class="vazio" style="padding:8px">Nada aqui.</div>`)).join("")}</div>`;
    } else if (aba === "oportunidades") corpo = cartao("Oportunidades de campanha", tabelaOportunidades(oportunidades(iv)));
    else if (aba === "alertas") { const al = alertas(iv); corpo = cartao(`Alertas automáticos (${al.length})`, al.length ? `<div class="lista">${al.map((a) => itemLista({ titulo: esc(a.texto), sub: esc(a.categoria), badges: prioridadeBadge(a.prioridade), href: a.link })).join("")}</div>` : `<div class="aviso aviso-ok">Nenhum alerta com os dados atuais.</div>`); }
    else corpo = cartao("Analista de Tráfego IA", `<div class="aviso aviso-info">Análise gerada a partir dos números do período. Só apresenta dados e sugestões; nenhuma decisão é tomada automaticamente.</div>${analise(iv).map((p) => `<p style="margin:8px 0;line-height:1.6">${esc(p)}</p>`).join("")}`);
    root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>O que precisa da minha atenção hoje?</h1><p class="sub">Campanhas, produtos, criativos, leads, datas e tarefas que pedem ação, por prioridade</p></div></div>${abas([["atencao", "Atenção hoje"], ["oportunidades", "Oportunidades"], ["alertas", "Alertas"], ["ia", "Analista IA"]], aba)}${corpo}`;
    root.querySelectorAll("[data-aba]").forEach((b) => b.addEventListener("click", () => { aba = b.dataset.aba; ctx.navegar(`#/decisoes?aba=${aba}`); }));
    root.querySelectorAll("[data-prio]").forEach((b) => b.addEventListener("click", () => { prio = b.dataset.prio; ctx.rerender(); }));
  },
};
