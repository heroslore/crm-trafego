// Camada 3 do motor: BENCHMARKS ADAPTATIVOS.
// Nada aqui usa regra universal do tipo "CTR abaixo de 1% é ruim". A comparação sempre
// vem de uma base explícita, em três níveis de prioridade (item 23):
//   1. histórico da própria conta   2. campanhas parecidas   3. referência padrão editável
// O nível usado aparece no texto, para o usuário saber contra o que está sendo comparado.
import { numeroOuNulo, temValor } from "./metricas.js?v=46e26fb2";

export const MENOR_MELHOR = new Set(["cpc", "cpm", "cpl", "cpa", "custo_conversa", "custo_thruplay", "custo_3s", "frequencia"]);

// Referência padrão: ponto de partida quando a conta ainda não tem histórico.
// Fica visível e editável em Configurações → Análise; não é lei, é chute honesto e rotulado.
export const REFERENCIA_PADRAO = {
  ctr: { bom: 0.012, ruim: 0.005 },
  cpc: { bom: 1.5, ruim: 4 },
  cpm: { bom: 25, ruim: 60 },
  frequencia: { bom: 1.8, ruim: 3.5 },
  retencao_inicial: { bom: 0.25, ruim: 0.12 },
  retencao_metade: { bom: 0.35, ruim: 0.15 },
  retencao_fim: { bom: 0.15, ruim: 0.05 },
  taxa_thruplay: { bom: 0.25, ruim: 0.1 },
  taxa_pagina: { bom: 0.8, ruim: 0.5 },
  taxa_lead: { bom: 0.15, ruim: 0.04 },
  conversao: { bom: 0.2, ruim: 0.06 },
  cpl: { bom: 8, ruim: 25 },
  custo_conversa: { bom: 8, ruim: 25 },
  cpa: { bom: 40, ruim: 120 },
  roas: { bom: 3, ruim: 1.5 },
  margem: { bom: 0.4, ruim: 0.15 },
};
export const FONTES = {
  conta: "histórico da sua conta",
  similares: "campanhas parecidas",
  padrao: "referência padrão (editável em Configurações)",
};

export function distribuicao(valores) {
  const v = valores.filter((x) => temValor(x)).map(Number).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * p)))];
  return { n: v.length, min: v[0], max: v[v.length - 1], p25: q(0.25), mediana: q(0.5), p75: q(0.75), media: v.reduce((a, b) => a + b, 0) / v.length };
}

// amostras: { conta: [{chave: valor}], similares: [...] }  |  padrao: objeto igual a REFERENCIA_PADRAO
export function construirBenchmark(chave, amostras = {}, padrao = REFERENCIA_PADRAO, minimo = 4) {
  const menor = MENOR_MELHOR.has(chave);
  for (const fonte of ["conta", "similares"]) {
    const bruto = (amostras[fonte] || []).map((o) => (o ? o[chave] : null));
    const d = distribuicao(bruto);
    if (d && d.n >= minimo) {
      return {
        chave, fonte, rotuloFonte: FONTES[fonte], n: d.n, menor_melhor: menor,
        alvo: d.mediana, bom: menor ? d.p25 : d.p75, ruim: menor ? d.p75 : d.p25, distribuicao: d,
        texto: `mediana de ${d.n} ${fonte === "conta" ? "campanhas da conta" : "campanhas parecidas"}`,
      };
    }
  }
  const ref = (padrao || {})[chave];
  if (!ref || !temValor(ref.bom) || !temValor(ref.ruim)) return null;
  return {
    chave, fonte: "padrao", rotuloFonte: FONTES.padrao, n: 0, menor_melhor: menor,
    alvo: (Number(ref.bom) + Number(ref.ruim)) / 2, bom: Number(ref.bom), ruim: Number(ref.ruim),
    texto: "referência padrão, porque a conta ainda não tem histórico suficiente",
  };
}

export function construirBenchmarks(chaves, amostras, padrao, minimo) {
  const out = {};
  for (const c of chaves) { const b = construirBenchmark(c, amostras, padrao, minimo); if (b) out[c] = b; }
  return out;
}

// Classifica um valor contra o benchmark. Sem valor ou sem base, devolve sem_dados — nunca inventa.
export function classificar(valor, bm) {
  const v = numeroOuNulo(valor);
  if (v == null) return { nivel: "sem_dados", texto: "métrica indisponível" };
  if (!bm) return { nivel: "sem_dados", texto: "sem base de comparação" };
  const menor = bm.menor_melhor;
  const bom = menor ? v <= bm.bom : v >= bm.bom;
  const ruim = menor ? v >= bm.ruim : v <= bm.ruim;
  const nivel = bom ? "bom" : ruim ? "ruim" : "medio";
  const razao = bm.alvo ? (menor ? bm.alvo / v : v / bm.alvo) : null;
  return { nivel, razao, alvo: bm.alvo, fonte: bm.fonte, rotuloFonte: bm.rotuloFonte, texto: `comparado com ${bm.texto}` };
}

export function mesclarReferencia(salva) {
  const out = {};
  for (const k of Object.keys(REFERENCIA_PADRAO)) {
    const p = REFERENCIA_PADRAO[k], s = (salva || {})[k] || {};
    out[k] = { bom: temValor(s.bom) ? Number(s.bom) : p.bom, ruim: temValor(s.ruim) ? Number(s.ruim) : p.ruim };
  }
  return out;
}
