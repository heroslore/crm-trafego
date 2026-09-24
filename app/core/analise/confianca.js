// Camada de amostra: diz se já existe dado suficiente para afirmar qualquer coisa.
// Existe para impedir o erro mais caro da análise de tráfego: matar uma campanha
// com 200 impressões porque "o CTR está ruim".
import { numeroOuNulo } from "./metricas.js?v=890e3831";

export const MINIMOS = {
  impressoes: 1000,   // abaixo disso, CTR e CPM oscilam demais para significar algo
  alcance: 500,
  cliques: 30,        // abaixo disso, CPC e taxa de clique são ruído
  gasto: 50,
  dias: 3,            // menos que isso é fase de aprendizado da plataforma
  video: 300,         // visualizações de 3s (ou reproduções) para falar de retenção
  leads: 10,
  vendas: 3,
};
export const NIVEIS = { insuficiente: "Dados insuficientes", baixa: "Confiança baixa", media: "Confiança média", alta: "Confiança alta" };

export function confianca(amostra = {}, minimos = MINIMOS) {
  const mi = { ...MINIMOS, ...minimos };
  const n = (v) => numeroOuNulo(v) || 0;
  const impressoes = n(amostra.impressoes), alcance = n(amostra.alcance), cliques = n(amostra.cliques);
  const gasto = n(amostra.gasto), dias = n(amostra.dias), video = n(amostra.video);
  const leads = n(amostra.leads), vendas = n(amostra.vendas);

  const suficiente = {
    entrega: impressoes >= mi.impressoes && dias >= 2,
    clique: cliques >= mi.cliques || impressoes >= mi.impressoes * 2,
    video: video >= mi.video,
    conversao: leads >= mi.leads || cliques >= mi.cliques * 3,
    venda: vendas >= mi.vendas || leads >= mi.leads * 2,
    publico: alcance >= mi.alcance && impressoes >= mi.impressoes,
  };
  const criterios = [
    { rotulo: "Impressões", valor: impressoes, minimo: mi.impressoes, ok: impressoes >= mi.impressoes },
    { rotulo: "Cliques", valor: cliques, minimo: mi.cliques, ok: cliques >= mi.cliques },
    { rotulo: "Investimento", valor: gasto, minimo: mi.gasto, ok: gasto >= mi.gasto, dinheiro: true },
    { rotulo: "Dias com dados", valor: dias, minimo: mi.dias, ok: dias >= mi.dias },
    { rotulo: "Leads", valor: leads, minimo: mi.leads, ok: leads >= mi.leads },
  ];
  let nivel;
  if (!suficiente.entrega && gasto < mi.gasto) nivel = "insuficiente";
  else if (!suficiente.entrega || !suficiente.clique) nivel = "baixa";
  else if (impressoes >= mi.impressoes * 10 && cliques >= mi.cliques * 6 && dias >= 7 && (suficiente.venda || suficiente.conversao)) nivel = "alta";
  else nivel = "media";

  // Campanha recém-subida ou com gasto baixo ainda está aprendendo: não é hora de julgar.
  const aprendizado = dias < mi.dias || gasto < mi.gasto;
  const faltando = criterios.filter((c) => !c.ok).map((c) => c.rotulo.toLowerCase());
  const texto = nivel === "insuficiente"
    ? `Os números estão todos aqui e podem ser lidos — o que ainda não dá é concluir a partir deles: ${faltando.join(", ")} abaixo do mínimo. Com um pouco mais de entrega, as mesmas taxas viram diagnóstico.`
    : nivel === "baixa"
      ? `A amostra já mostra tendência, mas ainda oscila. Trate como sinal, não como conclusão${faltando.length ? ` (${faltando.join(", ")} abaixo do mínimo)` : ""}.`
      : nivel === "media" ? "Amostra suficiente para as leituras de entrega e clique. Conversão e venda pedem mais volume para virarem conclusão."
        : "Amostra confortável em todas as etapas: as leituras abaixo são estáveis.";
  return { nivel, rotulo: NIVEIS[nivel], criterios, suficiente, aprendizado, faltando, texto, amostra: { impressoes, alcance, cliques, gasto, dias, video, leads, vendas } };
}

// Confiança de uma leitura específica. Usado nas recomendações (item 53).
export function confiancaDe(etapa, conf) {
  const s = conf.suficiente || {};
  const mapa = { atencao: s.video, retencao: s.video, clique: s.clique, conversao: s.conversao, venda: s.venda, publico: s.publico, custo: s.entrega, faturamento: s.venda, saturacao: s.publico };
  if (mapa[etapa] === false) return "baixa";
  return conf.nivel === "alta" ? "alta" : conf.nivel === "media" ? "media" : conf.nivel === "baixa" ? "baixa" : "baixa";
}
