// Camada 2 do motor de análise: DADOS BRUTOS → MÉTRICAS CALCULADAS.
// Duas regras valem em todo o arquivo:
//  1. Métrica sem dado é null ("indisponível"), nunca 0. Zero é um resultado; null é ausência de informação.
//  2. Nenhuma métrica sai daqui sem a fórmula que a gerou, porque quem lê precisa saber o que está olhando.
// Nada aqui lê o banco: recebe números e devolve números. Isso permite testar o motor fora do navegador.

export const temValor = (v) => v != null && v !== "" && isFinite(Number(v));
export const numeroOuNulo = (v) => (temValor(v) ? Number(v) : null);
// Contadores de vídeo/plataforma: soma zero no período quase sempre significa "a plataforma não
// informou", não "ninguém assistiu". Tratar como null evita conclusões inventadas (item 46).
export const contagemOuNulo = (v) => (temValor(v) && Number(v) > 0 ? Number(v) : null);

// Divisão segura: qualquer lado ausente, ou denominador <= 0, devolve null.
export function razao(a, b) {
  const x = numeroOuNulo(a), y = numeroOuNulo(b);
  if (x == null || y == null || y <= 0) return null;
  const r = x / y;
  return isFinite(r) ? r : null;
}

// Uma métrica calculada carrega valor, fórmula e por que está indisponível quando for o caso.
export function metrica(chave, rotulo, valor, formula, tipo = "pct", extra = {}) {
  const v = numeroOuNulo(valor);
  return { chave, rotulo, valor: v, formula, tipo, disponivel: v != null, ...extra };
}
function comFalta(mt, faltando) {
  if (!mt.disponivel && faltando && faltando.length) mt.faltando = faltando.filter(Boolean);
  return mt;
}

// ---------------------------------------------------------------- métricas de entrega e clique
export function calcularCTR(b) {
  const cliques = numeroOuNulo(b.outbound_clicks) ?? numeroOuNulo(b.link_clicks) ?? numeroOuNulo(b.clicks);
  const base = temValor(b.outbound_clicks) ? "cliques de saída" : temValor(b.link_clicks) ? "cliques no link" : "cliques";
  return comFalta(metrica("ctr", "CTR (taxa de clique)", razao(cliques, b.impressions), `${base} ÷ impressões`, "pct", { numerador: cliques, denominador: numeroOuNulo(b.impressions), base }), ["cliques", "impressões"]);
}
export function calcularCTRTodos(b) {
  return metrica("ctr_todos", "CTR de todos os cliques", razao(b.clicks, b.impressions), "todos os cliques (inclui curtir, comentar, expandir) ÷ impressões", "pct");
}
export function calcularCPC(b) {
  const cliques = numeroOuNulo(b.outbound_clicks) ?? numeroOuNulo(b.link_clicks) ?? numeroOuNulo(b.clicks);
  return metrica("cpc", "CPC (custo por clique)", razao(b.spend, cliques), "investimento ÷ cliques", "money", { numerador: numeroOuNulo(b.spend), denominador: cliques });
}
export function calcularCPM(b) {
  const v = razao(b.spend, b.impressions);
  return metrica("cpm", "CPM (custo por mil impressões)", v == null ? null : v * 1000, "investimento ÷ impressões × 1.000", "money");
}
export function calcularFrequencia(b) {
  // Frequência informada pela plataforma tem prioridade; senão impressões ÷ alcance.
  const informada = numeroOuNulo(b.frequency);
  if (informada != null && informada > 0) return metrica("frequencia", "Frequência", informada, "média de vezes que a mesma pessoa viu o anúncio (informada pela plataforma)", "dec");
  return metrica("frequencia", "Frequência", razao(b.impressions, b.reach), "impressões ÷ alcance", "dec");
}

// ---------------------------------------------------------------- métricas de resultado
export function calcularCPL(b) {
  const leads = numeroOuNulo(b.leads) ?? numeroOuNulo(b.results);
  const base = temValor(b.leads) ? "leads do CRM" : "resultados da plataforma";
  return metrica("cpl", "CPL (custo por lead)", razao(b.spend, leads), `investimento ÷ ${base}`, "money", { base, numerador: numeroOuNulo(b.spend), denominador: leads });
}
export function calcularCustoConversa(b) {
  return metrica("custo_conversa", "Custo por conversa iniciada", razao(b.spend, b.conversations), "investimento ÷ conversas iniciadas", "money");
}
export function calcularCPA(b) {
  return metrica("cpa", "CPA (custo por venda)", razao(b.spend, b.sales), "investimento ÷ vendas", "money");
}
export function calcularROAS(b) {
  return metrica("roas", "ROAS", razao(b.revenue, b.spend), "faturamento ÷ investimento", "mult");
}
export function calcularTicket(b) {
  return metrica("ticket", "Ticket médio", razao(b.revenue, b.sales), "faturamento ÷ vendas", "money");
}
export function calcularConversao(b) {
  const leads = numeroOuNulo(b.leads) ?? numeroOuNulo(b.results);
  return metrica("conversao", "Conversão de lead em venda", razao(b.sales, leads), "vendas ÷ leads", "pct", { numerador: numeroOuNulo(b.sales), denominador: leads });
}
export function calcularTaxaLead(b) {
  // Do clique ao contato: separa "não clica" de "clica e não fala com a loja".
  const cliques = numeroOuNulo(b.outbound_clicks) ?? numeroOuNulo(b.link_clicks) ?? numeroOuNulo(b.clicks);
  const contatos = numeroOuNulo(b.leads) ?? numeroOuNulo(b.conversations) ?? numeroOuNulo(b.results);
  return metrica("taxa_lead", "Cliques que viraram contato", razao(contatos, cliques), "leads (ou conversas) ÷ cliques", "pct", { numerador: contatos, denominador: cliques });
}
export function calcularTaxaPagina(b) {
  const cliques = numeroOuNulo(b.outbound_clicks) ?? numeroOuNulo(b.link_clicks);
  return metrica("taxa_pagina", "Cliques que chegaram na página", razao(b.landing_page_views, cliques), "visitas à página ÷ cliques", "pct");
}
export function calcularMargem(b) {
  return metrica("margem", "Margem sobre o faturamento", razao(b.gross_profit, b.revenue), "lucro bruto ÷ faturamento", "pct");
}
export function calcularLucroPorLead(b) {
  const leads = numeroOuNulo(b.leads) ?? numeroOuNulo(b.results);
  const lucro = numeroOuNulo(b.net_profit);
  return metrica("lucro_por_lead", "Lucro por lead", lucro == null || leads == null || leads <= 0 ? null : lucro / leads, "lucro após anúncios ÷ leads", "money");
}

// ---------------------------------------------------------------- vídeo
// Cadeia ordinal do vídeo. ThruPlay fica fora da cadeia porque significa "15s ou até o fim":
// é um corte de tempo, não uma porcentagem assistida.
export const PASSOS_VIDEO = [
  ["plays", "Reproduções", "reproduções do vídeo"],
  ["v2s", "Assistiram 2 segundos", "assistiram 2s"],
  ["v3s", "Assistiram 3 segundos", "assistiram 3s"],
  ["p25", "Assistiram 25%", "assistiram 25%"],
  ["p50", "Assistiram 50%", "assistiram 50%"],
  ["p75", "Assistiram 75%", "assistiram 75%"],
  ["p95", "Assistiram 95%", "assistiram 95%"],
  ["p100", "Assistiram até o fim", "assistiram 100%"],
];

// Cada etapa traz: quantas pessoas, a taxa em relação à etapa anterior disponível e a fórmula.
export function etapasVideo(v = {}, impressoes = null) {
  const impr = contagemOuNulo(impressoes);
  const out = [];
  let anterior = null, rotAnterior = null;
  for (const [chave, rotulo, nomeCurto] of PASSOS_VIDEO) {
    const n = contagemOuNulo(v[chave]);
    if (n == null) { out.push({ chave, rotulo, n: null, taxa: null, formula: null, disponivel: false }); continue; }
    const baseN = anterior != null ? anterior : impr;
    const baseRot = anterior != null ? rotAnterior : "impressões";
    out.push({
      chave, rotulo, n, disponivel: true,
      taxa: razao(n, baseN), base: baseRot, baseN,
      formula: baseN != null ? `${nomeCurto} ÷ ${baseRot}` : null,
      sobre_impressoes: razao(n, impr),
      formula_impressoes: impr != null ? `${nomeCurto} ÷ impressões` : null,
    });
    anterior = n; rotAnterior = nomeCurto;
  }
  return out;
}

export function metricasVideo(v = {}, b = {}) {
  const impr = contagemOuNulo(b.impressions);
  const plays = contagemOuNulo(v.plays), v3 = contagemOuNulo(v.v3s), thru = contagemOuNulo(v.thruplay);
  const duracao = numeroOuNulo(v.duracao), tempoMedio = numeroOuNulo(v.avg_watch);
  const lista = [
    comFalta(metrica("taxa_reproducao", "Reproduções por impressão", razao(plays, impr), "reproduções ÷ impressões", "pct"), ["reproduções do vídeo"]),
    comFalta(metrica("retencao_inicial", "Passaram de 3 segundos (sobre impressões)", razao(v3, impr), "assistiram 3s ÷ impressões", "pct", { apelido: "às vezes chamada de hook rate" }), ["visualizações de 3s"]),
    metrica("retencao_inicial_plays", "Passaram de 3 segundos (sobre quem deu play)", razao(v3, plays), "assistiram 3s ÷ reproduções", "pct"),
    metrica("retencao_metade", "Chegaram à metade do vídeo", razao(v.p50, v3), "assistiram 50% ÷ assistiram 3s", "pct", { apelido: "às vezes chamada de hold rate" }),
    metrica("retencao_fim", "Assistiram até o fim", razao(v.p100, v3), "assistiram 100% ÷ assistiram 3s", "pct"),
    metrica("taxa_thruplay", "Chegaram ao ThruPlay", razao(thru, v3), "ThruPlay (15s ou até o fim) ÷ assistiram 3s", "pct"),
    metrica("custo_thruplay", "Custo por ThruPlay", razao(b.spend, thru), "investimento ÷ ThruPlay", "money"),
    metrica("custo_3s", "Custo por visualização de 3s", razao(b.spend, v3), "investimento ÷ assistiram 3s", "money"),
    metrica("tempo_medio", "Tempo médio assistido", tempoMedio, "informado pela plataforma, em segundos", "seg"),
    metrica("parte_assistida", "Parte do vídeo assistida em média", razao(tempoMedio, duracao), "tempo médio assistido ÷ duração do vídeo", "pct"),
    metrica("duracao", "Duração do vídeo", duracao, "cadastrada no criativo", "seg"),
  ];
  const mapa = {};
  for (const mt of lista) mapa[mt.chave] = mt;
  return { lista, ...mapa, tem_video: !!(plays || v3 || thru || contagemOuNulo(v.p25)) };
}

// Onde o vídeo perde mais gente. Só compara etapas realmente informadas.
export function maiorQuedaVideo(etapas) {
  const comTaxa = etapas.filter((e) => e.disponivel && e.taxa != null && e.chave !== "plays");
  if (comTaxa.length < 2) return null;
  let pior = null;
  for (const e of comTaxa) if (!pior || e.taxa < pior.taxa) pior = e;
  if (!pior) return null;
  return { etapa: pior.chave, rotulo: pior.rotulo, taxa: pior.taxa, perda: 1 - pior.taxa, de: pior.base, formula: pior.formula };
}

// ---------------------------------------------------------------- funil completo
// A ordem é a do funil real: quem não viu não retém, quem não clicou não fala, quem não falou não compra.
export function montarFunil(b = {}, v = {}) {
  const cliques = numeroOuNulo(b.outbound_clicks) ?? numeroOuNulo(b.link_clicks) ?? numeroOuNulo(b.clicks);
  const rotCliques = temValor(b.outbound_clicks) ? "Cliques de saída" : temValor(b.link_clicks) ? "Cliques no link" : "Cliques";
  const contatos = numeroOuNulo(b.leads) ?? numeroOuNulo(b.conversations) ?? numeroOuNulo(b.results);
  const rotContatos = temValor(b.leads) ? "Leads no CRM" : temValor(b.conversations) ? "Conversas iniciadas" : "Resultados da plataforma";
  const bruta = [
    { chave: "impressao", rotulo: "Impressões", n: contagemOuNulo(b.impressions) },
    { chave: "alcance", rotulo: "Pessoas alcançadas", n: contagemOuNulo(b.reach) },
    { chave: "atencao", rotulo: "Passaram de 3 segundos", n: contagemOuNulo(v.v3s) },
    { chave: "retencao", rotulo: "Chegaram à metade do vídeo", n: contagemOuNulo(v.p50) },
    { chave: "interesse", rotulo: "ThruPlay", n: contagemOuNulo(v.thruplay) },
    { chave: "clique", rotulo: rotCliques, n: cliques },
    { chave: "pagina", rotulo: "Visitas à página", n: contagemOuNulo(b.landing_page_views) },
    { chave: "contato", rotulo: rotContatos, n: contatos },
    { chave: "qualificado", rotulo: "Leads qualificados", n: contagemOuNulo(b.qualified) },
    { chave: "venda", rotulo: "Vendas", n: numeroOuNulo(b.sales) },
  ];
  const etapas = [];
  let anterior = null;
  for (const e of bruta) {
    if (e.n == null) { etapas.push({ ...e, disponivel: false, taxa: null }); continue; }
    etapas.push({
      ...e, disponivel: true,
      taxa: anterior ? razao(e.n, anterior.n) : null,
      de: anterior ? anterior.rotulo : null,
      formula: anterior ? `${e.rotulo} ÷ ${anterior.rotulo}` : null,
    });
    anterior = e;
  }
  return etapas;
}

// A maior queda do funil, ignorando o primeiro degrau (impressão → alcance é entrega, não desempenho).
export function maiorQuedaFunil(etapas) {
  const cand = etapas.filter((e) => e.disponivel && e.taxa != null && !["alcance"].includes(e.chave));
  if (!cand.length) return null;
  let pior = cand[0];
  for (const e of cand) if (e.taxa < pior.taxa) pior = e;
  return { etapa: pior.chave, rotulo: pior.rotulo, de: pior.de, taxa: pior.taxa, perda: 1 - pior.taxa, formula: pior.formula };
}

// ---------------------------------------------------------------- pacote completo
export function metricasCalculadas(b = {}, v = {}) {
  const lista = [
    calcularCTR(b), calcularCTRTodos(b), calcularCPC(b), calcularCPM(b), calcularFrequencia(b),
    calcularTaxaPagina(b), calcularTaxaLead(b), calcularCPL(b), calcularCustoConversa(b),
    calcularConversao(b), calcularCPA(b), calcularROAS(b), calcularTicket(b), calcularMargem(b), calcularLucroPorLead(b),
  ];
  const mapa = {};
  for (const mt of lista) mapa[mt.chave] = mt;
  const video = metricasVideo(v, b);
  const etapas = etapasVideo(v, b.impressions);
  const funil = montarFunil(b, v);
  return {
    lista, ...mapa, video, etapas_video: etapas, funil,
    maior_queda_video: maiorQuedaVideo(etapas),
    maior_queda_funil: maiorQuedaFunil(funil),
  };
}
