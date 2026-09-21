// Pedaços compartilhados pelos módulos.
import { db } from "../core/db.js?v=302fb635";
import { kpi, badge, badgeOpcao, cartao, vazio, itemLista, prioridadeBadge, fmtMetrica } from "../core/ui.js?v=302fb635";
import { avaliar, serieDiaria, contagensAtivas, METRICAS_ROTULOS, MENOR_MELHOR } from "../core/metrics.js?v=302fb635";
import { esc, brl, inteiro, pct, mult, dataBR, hoje, diasEntre, dec } from "../core/format.js?v=302fb635";
import { usuario, podeEditar } from "../core/auth.js?v=302fb635";

export const bannerDemo = () => db.temDemo() ? `<div class="demo-banner"><span>🧪 Há dados de demonstração (marcados com <b>[DEMO]</b> / "(demo)") para você conhecer o sistema. Eles não são dados reais da empresa.</span><a href="#/config?aba=dados" class="btn btn-pq">Remover dados de demonstração</a></div>` : "";
export const btnNovo = (texto, attr) => podeEditar() ? `<button class="btn btn-primario" ${attr}>➕ ${texto}</button>` : "";

// Cartões de KPI a partir de comparar()
export function cartoesKpi(cmp, serie, chaves) {
  const { atual: a, variacao: v } = cmp;
  const s = (k) => serie ? serie.map((d) => d[k] || 0) : null;
  return chaves.map((k) => {
    const destaque = ["spend", "revenue", "net_profit", "roas"].includes(k);
    return kpi({ rotulo: METRICAS_ROTULOS[k] || k, valor: fmtMetrica(k, a[k]), delta: v[k], invertido: MENOR_MELHOR.has(k), avaliacao: avaliar(k, a[k]), serie: s(k), destaque });
  }).join("");
}
export function cartoesContagem() {
  const c = contagensAtivas();
  return kpi({ rotulo: "Campanhas ativas", valor: inteiro(c.campanhas_ativas), sub: "" }) + kpi({ rotulo: "Anúncios ativos", valor: inteiro(c.anuncios_ativos), sub: "" });
}
export const KPIS_PRINCIPAIS = ["spend", "revenue", "gross_profit", "net_profit", "roas", "roi", "leads", "qualified", "sales", "conversion", "cpl", "cpl_qualificado", "cpa", "ticket", "ctr", "cpc", "cpm"];

// Tabela de kpis em linha (para detalhes)
export function linhaNumeros(k, chaves = ["spend", "revenue", "gross_profit", "roas", "leads", "sales", "cpl", "cpa", "ctr", "cpc", "cpm", "ticket"]) {
  return `<div class="kpis">${chaves.map((c) => kpi({ rotulo: METRICAS_ROTULOS[c] || c, valor: fmtMetrica(c, k[c]), avaliacao: avaliar(c, k[c]) })).join("")}</div>`;
}

export function tabelaOportunidades(lista) {
  if (!lista.length) return vazio("Nenhuma oportunidade detectada com os dados atuais.");
  return `<div class="lista">${lista.map((o) => `<div class="oportunidade"><div>${prioridadeBadge(o.prioridade)}</div><div class="txt"><div class="t">${esc(o.titulo)}</div><div class="d">${esc(o.texto)}</div></div><a class="btn btn-pq" href="${esc(o.link)}">${esc(o.acao || "Ver")}</a></div>`).join("")}</div>`;
}

// Negócios parados, agenda, fecha em breve
export function leadsParados(dias = 14) { const h = hoje(); return db.where("leads", (l) => !["venda", "perdido"].includes(l.stage) && diasEntre((l.updated_at || l.created_at || l.entered_at + "T00:00").slice(0, 10), h) >= dias).map((l) => ({ l, dias: diasEntre((l.updated_at || l.entered_at + "T00:00").slice(0, 10), h) })).sort((a, b) => b.dias - a.dias); }
export function agendaDoDia() {
  const h = hoje(), u = usuario();
  const fol = db.where("leads", (l) => l.next_followup && l.next_followup <= h && !["venda", "perdido"].includes(l.stage)).map((l) => ({ tipo: "followup", titulo: `Follow-up: ${l.name}`, data: l.next_followup, atrasado: l.next_followup < h, href: `#/leads/${l.id}` }));
  const tar = db.where("tasks", (t) => t.due_date && t.due_date <= h && t.status !== "finalizado").map((t) => ({ tipo: "tarefa", titulo: t.title, data: t.due_date, atrasado: t.due_date < h, href: "#/tarefas", prioridade: t.priority }));
  return [...fol, ...tar].sort((a, b) => a.data.localeCompare(b.data));
}
export function fechaEmBreve(dias = 7) { const h = hoje(); return db.where("leads", (l) => l.expected_close && l.expected_close >= h && diasEntre(h, l.expected_close) <= dias && !["venda", "perdido"].includes(l.stage)).sort((a, b) => a.expected_close.localeCompare(b.expected_close)); }
