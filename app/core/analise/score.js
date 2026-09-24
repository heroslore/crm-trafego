// Camada 5 do motor: SCORE.
// O peso de cada etapa muda com o objetivo da campanha — em campanha de WhatsApp o custo por
// conversa pesa mais que faturamento; em campanha de vendas é o contrário (item 43).
// Etapa sem dado não recebe nota: sai do cálculo e os pesos são renormalizados.
// Sem amostra mínima não existe score. Número inventado é pior que número ausente.

export const PESOS_POR_OBJETIVO = {
  whatsapp: { atencao: 0.12, retencao: 0.10, clique: 0.18, conversao: 0.28, custo: 0.20, publico: 0.06, saturacao: 0.06 },
  leads: { atencao: 0.12, retencao: 0.10, clique: 0.18, conversao: 0.28, custo: 0.20, publico: 0.06, saturacao: 0.06 },
  vendas: { atencao: 0.10, retencao: 0.08, clique: 0.14, conversao: 0.20, custo: 0.18, faturamento: 0.22, publico: 0.04, saturacao: 0.04 },
  remarketing: { atencao: 0.08, retencao: 0.08, clique: 0.14, conversao: 0.22, custo: 0.18, faturamento: 0.20, publico: 0.05, saturacao: 0.05 },
  trafego: { atencao: 0.15, retencao: 0.10, clique: 0.35, custo: 0.25, publico: 0.075, saturacao: 0.075 },
  engajamento: { atencao: 0.25, retencao: 0.25, clique: 0.20, custo: 0.20, publico: 0.05, saturacao: 0.05 },
  reconhecimento: { atencao: 0.30, retencao: 0.20, custo: 0.30, publico: 0.10, saturacao: 0.10 },
};
export const PESOS_PADRAO = PESOS_POR_OBJETIVO.vendas;
export const NOTA_POR_NIVEL = { bom: 100, medio: 60, ruim: 20 };
export const FAIXAS = [[70, "bom", "BOM", "verde"], [45, "medio", "MÉDIO", "amarelo"], [0, "ruim", "RUIM", "vermelho"]];

export function pesos(objetivo, config = {}) {
  return { ...(PESOS_POR_OBJETIVO[objetivo] || PESOS_PADRAO), ...((config.pesos || {})[objetivo] || {}) };
}

export function pontuar(cartoes, objetivo, conf, config = {}) {
  const p = pesos(objetivo, config);
  const detalhe = [];
  let soma = 0, pesoUsado = 0, pesoTotal = 0;
  for (const c of cartoes) {
    const peso = p[c.chave];
    if (!peso) continue;
    pesoTotal += peso;
    const nota = NOTA_POR_NIVEL[c.nivel];
    if (nota == null) { detalhe.push({ etapa: c.chave, titulo: c.titulo, peso, nota: null, nivel: c.nivel }); continue; }
    soma += nota * peso; pesoUsado += peso;
    detalhe.push({ etapa: c.chave, titulo: c.titulo, peso, nota, nivel: c.nivel });
  }
  const cobertura = pesoTotal ? pesoUsado / pesoTotal : 0;
  // Sem amostra, ou com menos da metade das etapas medíveis, não damos nota.
  if (conf.nivel === "insuficiente" || cobertura < 0.5 || !pesoUsado) {
    return {
      score: null, nivel: "sem_dados", rotulo: "DADOS INSUFICIENTES", cor: "cinza", icone: "⚪",
      cobertura, detalhe, objetivo, pesos: p,
      texto: conf.nivel === "insuficiente"
        ? "Sem score: a amostra atual não sustenta uma nota. Os números estão abaixo, sem conclusão."
        : `Sem score: só ${Math.round(cobertura * 100)}% das etapas que contam para este objetivo têm dados. Preencha as métricas que faltam para liberar a nota.`,
    };
  }
  const score = Math.round(soma / pesoUsado);
  const faixa = FAIXAS.find(([min]) => score >= min);
  return {
    score, nivel: faixa[1], rotulo: faixa[2], cor: faixa[3], icone: { bom: "🟢", medio: "🟡", ruim: "🔴" }[faixa[1]],
    cobertura, detalhe, objetivo, pesos: p, confianca: conf.nivel,
    texto: `Score ${score}/100, calculado com os pesos do objetivo "${objetivo || "vendas"}" sobre ${Math.round(cobertura * 100)}% das etapas com dados. ${conf.nivel === "baixa" ? "A amostra ainda é pequena: leia como tendência." : ""}`.trim(),
  };
}
