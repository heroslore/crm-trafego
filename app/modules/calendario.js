import { db } from "../core/db.js?v=e38ac044";
import { alertasCalendario } from "../core/rules.js?v=e38ac044";
import { cartao, abrirFormulario, vazio, itemLista, badge } from "../core/ui.js?v=e38ac044";
import { esc, hoje, dataBR, NOMES_MESES, somaDias } from "../core/format.js?v=e38ac044";
import { bannerDemo, btnNovo } from "./comum.js?v=e38ac044";
import { rotulo as rotuloOpcao } from "../core/schema.js?v=e38ac044";
import { podeEditar } from "../core/auth.js?v=e38ac044";

let mes = hoje().slice(0, 7);
const COR = { campanha: "var(--acento)", promocao: "var(--laranja)", comemorativa: "var(--vermelho)", lancamento: "var(--verde)", video: "var(--roxo)", publicacao: "var(--azul)", reels: "var(--ciano)", stories: "var(--ciano)", trafego: "var(--acento)", outro: "var(--cinza)" };
export default {
  id: "calendario", titulo: "Calendário", icone: "📅",
  render(root, ctx) {
    const [ano, m] = mes.split("-").map(Number); const h = hoje();
    const primeiro = new Date(Date.UTC(ano, m - 1, 1)), diasNoMes = new Date(Date.UTC(ano, m, 0)).getUTCDate(), inicioGrade = primeiro.getUTCDay();
    const evs = db.all("calendar_events");
    const doDia = (iso) => evs.filter((e) => e.date <= iso && (e.end_date || e.date) >= iso);
    const camps = db.where("campaigns", (c) => c.start_date && (c.status === "ativa" || c.status === "planejada" || c.status === "producao"));
    const campDoDia = (iso) => camps.filter((c) => c.start_date <= iso && (c.end_date || "2999") >= iso);
    let celulas = "";
    for (let i = 0; i < inicioGrade; i++) celulas += `<div class="cal-dia outro"></div>`;
    for (let d = 1; d <= diasNoMes; d++) { const iso = `${mes}-${String(d).padStart(2, "0")}`; const lista = doDia(iso), cs = campDoDia(iso); celulas += `<div class="cal-dia${iso === h ? " hoje" : ""}" data-dia="${iso}"><div class="n">${d}</div>${lista.slice(0, 3).map((e) => `<span class="cal-ev" style="background:${COR[e.type] || COR.outro}" data-ev="${e.id}" title="${esc(e.title)}">${esc(e.title)}</span>`).join("")}${cs.slice(0, 2).map((c) => `<span class="cal-ev" style="background:var(--card);color:var(--texto2);border:1px dashed var(--borda)" title="Campanha: ${esc(c.name)}">📣 ${esc(c.name)}</span>`).join("")}${lista.length + cs.length > 5 ? `<small>+${lista.length + cs.length - 5}</small>` : ""}</div>`; }
    const proximos = alertasCalendario();
    const futuros = evs.filter((e) => e.date >= h).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
    root.innerHTML = `${bannerDemo()}<div class="pagina-cab"><div><h1>Calendário de marketing</h1><p class="sub">Campanhas, promoções, datas comemorativas, lançamentos e produção de conteúdo. Avisos 30, 15, 7 e 3 dias antes.</p></div><div class="pagina-acoes">${btnNovo("Novo evento", 'data-novo="1"')}</div></div>
      ${cartao(`<button class="btn btn-pq" data-mes="-1">‹</button> ${NOMES_MESES[m - 1]} ${ano} <button class="btn btn-pq" data-mes="1">›</button>`, `<div class="calendario">${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => `<div class="cal-cab">${d}</div>`).join("")}${celulas}</div><div class="legenda" style="margin-top:8px">${Object.keys(COR).map((k) => `<span><i style="background:${COR[k]}"></i>${rotuloOpcao("event_type", k)}</span>`).join("")}</div>`, podeEditar() ? `<small>Clique num dia para cadastrar</small>` : "")}
      <div class="grid2">${cartao("Avisos antecipados", proximos.length ? `<div class="lista">${proximos.map((e) => itemLista({ titulo: esc(e.title), sub: `${dataBR(e.date)} · ${rotuloOpcao("event_type", e.type)}`, badges: badge(`em ${e.faltam} dia(s)`, e.faltam <= 3 ? "vermelho" : e.faltam <= 7 ? "laranja" : e.faltam <= 15 ? "amarelo" : "ciano"), href: "#/calendario" })).join("")}</div>` : vazio("Nenhuma data nos próximos 30 dias."))}
      ${cartao("Próximos eventos", futuros.length ? `<div class="lista">${futuros.map((e) => `<div class="item"><div class="item-txt"><div class="item-titulo">${esc(e.title)} ${badge(rotuloOpcao("event_type", e.type), "roxo")}</div><div class="item-sub">${dataBR(e.date)}${e.end_date ? " a " + dataBR(e.end_date) : ""}${e.notes ? " · " + esc(e.notes) : ""}</div></div><div class="item-dir">${podeEditar() ? `<button class="btn btn-pq" data-ev="${e.id}">✏️</button>` : ""}</div></div>`).join("")}</div>` : vazio("Nenhum evento futuro."))}</div>`;
    root.querySelectorAll("[data-mes]").forEach((b) => b.addEventListener("click", () => { const d = new Date(Date.UTC(ano, m - 1 + Number(b.dataset.mes), 1)); mes = d.toISOString().slice(0, 7); ctx.rerender(); }));
    const n = root.querySelector("[data-novo]"); if (n) n.addEventListener("click", () => abrirFormulario("calendar_events", null, { onSave: ctx.rerender }));
    root.querySelectorAll("[data-ev]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); if (podeEditar()) abrirFormulario("calendar_events", b.dataset.ev, { onSave: ctx.rerender, onDelete: ctx.rerender }); }));
    root.querySelectorAll("[data-dia]").forEach((c) => c.addEventListener("click", (e) => { if (e.target.closest("[data-ev]") || !podeEditar()) return; abrirFormulario("calendar_events", null, { padrao: { date: c.dataset.dia }, onSave: ctx.rerender }); }));
  },
};
