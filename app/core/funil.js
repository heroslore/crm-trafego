// Etapa do funil e a régua certa de cada uma.
//
// Campanha de reconhecimento e campanha de fundo fazem trabalhos diferentes e não podem ser
// medidas pela mesma conta. Reconhecimento existe para ENCHER A BASE de público que o meio e
// o fundo vão reaproveitar; cobrar mensagem dela é cobrar pelo trabalho errado — e foi
// exatamente isso que as tabelas do CRM faziam, mostrando "R$ 107,16 por mensagem" de uma
// campanha de topo ao lado de "R$ 1,58" de uma de fundo, como se fossem comparáveis.
//
// A régua do topo é o custo de colocar UMA PESSOA na base: gasto ÷ quantas assistiram metade
// do vídeo. É esse público que depois alimenta o remarketing.
import { num } from "./format.js";

export const ETAPAS = [
  ["topo", "Topo — encher a base"],
  ["meio", "Meio — aquecer quem já viu"],
  ["fundo", "Fundo — gerar conversa"],
];
export const ROTULO_ETAPA = Object.fromEntries(ETAPAS);
export const CORES_ETAPA = { topo: "ciano", meio: "amarelo", fundo: "verde" };

// Objetivo da plataforma → etapa. É o palpite inicial; o campo funnel_stage manda quando existe.
const POR_OBJETIVO = {
  reconhecimento: "topo", engajamento: "topo",
  trafego: "meio", remarketing: "meio",
  whatsapp: "fundo", leads: "fundo", vendas: "fundo",
};
export function etapaDe(reg) {
  if (!reg) return "fundo";
  if (reg.funnel_stage && ROTULO_ETAPA[reg.funnel_stage]) return reg.funnel_stage;
  // O nome da campanha costuma dizer, e quem escreveu sabia o que queria.
  const n = String(reg.name || "").toLowerCase();
  if (/reconhecim|awareness|topo/.test(n)) return "topo";
  if (/meio de funil|meio-de-funil/.test(n)) return "meio";
  if (/fundo de funil|fundo-de-funil/.test(n)) return "fundo";
  return POR_OBJETIVO[reg.objective] || "fundo";
}

// Qual número julga cada etapa. O topo não é julgado por mensagem: seria condenar quem fez
// o trabalho certo. Nas duas outras etapas a mensagem é o resultado esperado.
export const METRICA_DA_ETAPA = {
  topo: { chave: "custo_base", rotulo: "Custo por pessoa na base", ajuda: "gasto ÷ pessoas que assistiram metade do vídeo" },
  meio: { chave: "cpl", rotulo: "Custo por lead", ajuda: "gasto ÷ leads do período" },
  fundo: { chave: "custo_conversa", rotulo: "Custo por conversa", ajuda: "gasto ÷ conversas iniciadas pelo anúncio" },
};

// Reparte o gasto e o resultado por etapa. Recebe [{registro, k}] e devolve uma linha por etapa.
export function porEtapa(itens) {
  const mapa = new Map(ETAPAS.map(([e]) => [e, { etapa: e, rotulo: ROTULO_ETAPA[e], n: 0, spend: 0, impressions: 0, reach: 0, conversations: 0, leads: 0, video_p50: 0, sales: 0 }]));
  for (const { registro, k } of itens || []) {
    const g = mapa.get(etapaDe(registro));
    if (!g) continue;
    g.n++;
    for (const f of ["spend", "impressions", "reach", "conversations", "leads", "video_p50", "sales"]) g[f] += num(k && k[f]);
  }
  const total = [...mapa.values()].reduce((a, g) => a + g.spend, 0);
  return [...mapa.values()].map((g) => ({
    ...g,
    fatia: total > 0 ? g.spend / total : 0,
    // Sem denominador não existe custo: null, nunca zero nem infinito.
    custo_base: g.video_p50 > 0 ? g.spend / g.video_p50 : null,
    custo_conversa: g.conversations > 0 ? g.spend / g.conversations : null,
    cpl: g.leads > 0 ? g.spend / g.leads : null,
  }));
}
