// Pedaços compartilhados pelos módulos.
import { db } from "../core/db.js?v=dd1de662";
import { kpi, badge, badgeOpcao, cartao, vazio, itemLista, prioridadeBadge, fmtMetrica, tabela } from "../core/ui.js?v=dd1de662";
import { avaliar, serieDiaria, contagensAtivas, porEntidade, METRICAS_ROTULOS, MENOR_MELHOR } from "../core/metrics.js?v=dd1de662";
import { porEtapa, ROTULO_ETAPA, CORES_ETAPA, METRICA_DA_ETAPA } from "../core/funil.js?v=dd1de662";
import { esc, brl, inteiro, pct, mult, dataBR, hoje, diasEntre, dec } from "../core/format.js?v=dd1de662";
import { usuario, podeEditar } from "../core/auth.js?v=dd1de662";

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
// ROAS, ROI e taxa de conversão aparecem como "—" quando nenhuma venda foi lançada no escopo
// e o modo de vendas é "parcial". Sem esta linha o traço vira mistério: o gestor já foi
// enganado uma vez por número que não existia, e ficar calado agora seria a mesma falha.
export function avisoVendasNaoLancadas(linhas, oQue = "campanhas") {
  const kk = (linhas || []).map((l) => (l && l.k) || l).filter(Boolean);
  const afetadas = kk.filter((k) => k.vendas_medidas === false && (k.spend || 0) > 0).length;
  if (!afetadas) return "";
  return `<div class="aviso aviso-info"><b>ROAS, ROI e conversão aparecem como "—" em ${inteiro(afetadas)} ${esc(oQue)}.</b> Nenhuma venda foi lançada nesse período, e o sistema está configurado para "nem toda venda é lançada". Mostrar 0,00x de ROAS e −100% de ROI seria afirmar um prejuízo que ninguém mediu. Lance a venda e o número aparece — ou mude em <a href="#/config?aba=analise">Configurações → Análise</a>.</div>`;
}

// ---------------------------------------------------------------- entrega bloqueada pela Meta
// Anúncio reprovado chegava como "pausado", indistinguível de uma pausa que a equipe deu. O
// dinheiro não está sendo gasto errado: não está rodando, e ninguém foi avisado. Por isso o
// aviso é vermelho e traz o texto da Meta inteiro — é ele que diz o que precisa ser resolvido.
export const bloqueado = (reg) => !!(reg && reg.meta_bloqueio);
export function badgeBloqueio(reg) {
  return bloqueado(reg) ? badge("⛔ bloqueado na Meta", "vermelho") : "";
}
export function avisoBloqueio(reg, oQue = "anúncio") {
  if (!bloqueado(reg)) return "";
  return `<div class="aviso aviso-erro" style="margin-bottom:12px">
    <b>⛔ A Meta bloqueou a entrega deste ${esc(oQue)}.</b> Ele não está rodando nem gastando, e pausar ou reativar pelo CRM não resolve — quem libera é a Meta.
    <div style="margin-top:6px">${esc(reg.meta_bloqueio)}</div>
    <p class="sub" style="margin:8px 0 0">Resolva no <a href="https://adsmanager.facebook.com/" target="_blank" rel="noopener">Gerenciador de Anúncios</a> ou na Central de Qualidade da Conta. Assim que a Meta liberar, a próxima coleta limpa este aviso sozinha.</p>
  </div>`;
}

// ---------------------------------------------------------------- investimento por etapa do funil
// Campanha de topo e campanha de fundo fazem trabalhos diferentes. Somar as duas numa linha só
// esconde a decisão mais importante do mês: quanto foi para encher a base e quanto foi para
// colher. E cada uma aparece com a SUA régua — o topo com o custo por pessoa na base, não com
// um custo por conversa que ele nunca teve a obrigação de produzir.
export function blocoFunil(iv, { titulo = "Investimento por etapa do funil" } = {}) {
  const itens = porEntidade(iv, "campaign").filter((c) => c.k.spend > 0).map((c) => ({ registro: c.registro, k: c.k }));
  if (!itens.length) return cartao(titulo, vazio("Nenhuma campanha com investimento no período."));
  const linhas = porEtapa(itens).filter((g) => g.n > 0 || g.spend > 0);
  const total = linhas.reduce((t, g) => t + g.spend, 0);
  const celula = (g) => {
    const m = METRICA_DA_ETAPA[g.etapa];
    const v = g[m.chave];
    return v == null
      ? `<span class="sub">— <small>${esc(m.ajuda)}</small></span>`
      : `<b>${brl(v)}</b><br><small class="sub">${esc(m.rotulo.toLowerCase())}</small>`;
  };
  const corpo = `<div class="barras" style="margin-bottom:12px">${linhas.map((g) => `
      <div class="barra"><div class="barra-nome">${badge(ROTULO_ETAPA[g.etapa].split(" — ")[0], CORES_ETAPA[g.etapa])} ${esc(ROTULO_ETAPA[g.etapa].split(" — ")[1] || "")}</div>
      <div class="barra-trilho"><i style="width:${total ? 100 * g.spend / total : 0}%;background:var(--${CORES_ETAPA[g.etapa] === "ciano" ? "ciano" : CORES_ETAPA[g.etapa] === "amarelo" ? "amarelo" : "verde"})"></i></div>
      <div class="barra-valor"><b>${brl(g.spend)}</b> <small>${pct(g.fatia)}</small></div></div>`).join("")}</div>
    ${tabela("funil-etapas", { colunas: [
      { key: "rotulo", label: "Etapa", render: (g) => `${badge(ROTULO_ETAPA[g.etapa].split(" — ")[0], CORES_ETAPA[g.etapa])}<br><small class="sub">${esc(ROTULO_ETAPA[g.etapa].split(" — ")[1] || "")}</small>` },
      { key: "n", label: "Campanhas", tipo: "num", fmt: inteiro },
      { key: "spend", label: "Investido", tipo: "num", fmt: brl },
      { key: "fatia", label: "% da verba", tipo: "num", fmt: (v) => pct(v) },
      { key: "reach", label: "Alcance", tipo: "num", fmt: inteiro },
      { key: "video_p50", label: "Viram 50% do vídeo", tipo: "num", fmt: inteiro },
      { key: "conversations", label: "Conversas", tipo: "num", fmt: inteiro },
      { key: "metrica", label: "Régua desta etapa", render: celula },
    ], linhas, ordem: "spend", vazioTxt: "Sem campanhas no período." })}
    <p class="sub" style="margin-top:10px">Cada etapa é julgada pelo que ela existe para fazer. O topo enche a base de público que o meio e o fundo reaproveitam depois — cobrar conversa dele é cobrar pelo trabalho errado. A etapa sai do objetivo e do nome da campanha, e pode ser corrigida no campo <b>Etapa do funil</b> ao editar a campanha.</p>`;
  return cartao(titulo, corpo);
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
