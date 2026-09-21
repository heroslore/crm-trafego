import { db } from "../core/db.js?v=c59cb573";
import { cartao, tabela, abrirFormulario, vazio } from "../core/ui.js?v=c59cb573";
import { esc, dataBR, brl } from "../core/format.js?v=c59cb573";
import { bannerDemo, btnNovo } from "./comum.js?v=c59cb573";
import { podeEditar } from "../core/auth.js?v=c59cb573";

export default {
  id: "concorrentes", titulo: "Concorrentes", icone: "🕵️",
  render(root, ctx) {
    const lista = db.all("competitors");
    root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>Concorrentes</h1><p class="sub">Registro de preços, promoções, anúncios e criativos da concorrência, com links e imagens</p></div><div class="pagina-acoes">${btnNovo("Nova análise", 'data-novo="1"')}</div></div>
      ${lista.length ? `<div class="grade-cards" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${lista.sort((a, b) => (b.analyzed_at || "").localeCompare(a.analyzed_at || "")).map((c) => `<div class="criativo-card">${c.image ? `<img src="${esc(c.image)}" alt="" style="aspect-ratio:16/9">` : ""}<div class="cc"><b>${esc(c.company)}</b>${c.product ? `<div>${esc(c.product)}${c.price ? " · " + brl(c.price) : ""}</div>` : ""}${c.promotion ? `<div>🏷️ ${esc(c.promotion)}</div>` : ""}${c.ad_type ? `<div>📣 ${esc(c.ad_type)}</div>` : ""}<div class="sub">${c.analyzed_at ? "analisado " + dataBR(c.analyzed_at) : ""}</div><div class="sub" style="margin-top:4px">${c.instagram ? `<a href="${esc(c.instagram)}" target="_blank" rel="noopener">Instagram</a> ` : ""}${c.site ? `<a href="${esc(c.site)}" target="_blank" rel="noopener">Site</a> ` : ""}${c.creative_link ? `<a href="${esc(c.creative_link)}" target="_blank" rel="noopener">Criativo</a>` : ""}</div>${c.notes ? `<div class="sub" style="margin-top:6px">${esc(c.notes)}</div>` : ""}${podeEditar() ? `<button class="btn btn-pq" data-editar="${c.id}" style="margin-top:8px">✏️ Editar</button>` : ""}</div></div>`).join("")}</div>` : cartao("", vazio("Nenhum concorrente cadastrado."))}`;
    const n = root.querySelector("[data-novo]"); if (n) n.addEventListener("click", () => abrirFormulario("competitors", null, { onSave: ctx.rerender }));
    root.querySelectorAll("[data-editar]").forEach((b) => b.addEventListener("click", () => abrirFormulario("competitors", b.dataset.editar, { onSave: ctx.rerender, onDelete: ctx.rerender })));
  },
};
