// Testes do motor de análise: node --test testes/
// Cada teste é um cenário real de gestão de tráfego. O que se verifica não é o número
// em si, e sim o diagnóstico: o motor precisa apontar a etapa certa do funil.
import test from "node:test";
import assert from "node:assert/strict";

import { metricasCalculadas, contagemOuNulo } from "../app/core/analise/metricas.js";
import { construirBenchmarks, REFERENCIA_PADRAO } from "../app/core/analise/benchmarks.js";
import { confianca } from "../app/core/analise/confianca.js";
import { cartoesEtapa, diagnosticos, saudePublico, fadiga } from "../app/core/analise/regras.js";
import { pontuar } from "../app/core/analise/score.js";
import { plano, gargalos, resumo10s, pontosFortes } from "../app/core/analise/recomendacoes.js";

const CHAVES = ["ctr", "cpc", "cpm", "frequencia", "cpl", "custo_conversa", "cpa", "roas", "conversao", "taxa_lead", "taxa_pagina", "margem", "retencao_inicial", "retencao_metade", "retencao_fim", "taxa_thruplay"];

// Roda o pipeline inteiro sem banco: bruto → métricas → benchmarks → regras → score → recomendações.
function motor({ bruto, video = {}, objetivo = "whatsapp", conta = [], tendencia = null, tamanho_publico = null, dias = 7 }) {
  const m = metricasCalculadas(bruto, video);
  const bmk = construirBenchmarks(CHAVES, { conta }, REFERENCIA_PADRAO);
  const conf = confianca({
    impressoes: bruto.impressions, alcance: bruto.reach, cliques: bruto.outbound_clicks || bruto.link_clicks || bruto.clicks,
    gasto: bruto.spend, dias, video: video.v3s || video.plays, leads: bruto.leads || bruto.results, vendas: bruto.sales,
  });
  const fad = tendencia ? fadiga(tendencia.inicio, tendencia.fim) : fadiga(null, null);
  const publico = saudePublico(m, bmk, conf, { alcance: bruto.reach, tamanho_publico, ctr_caindo: fad.piorando ? fad.piorando.includes("ctr") : false });
  const ctx = { objetivo, bruto, metas: {}, alcance: bruto.reach, tamanho_publico, publico, fadiga: fad, lucro_liquido: bruto.net_profit };
  const cartoes = cartoesEtapa(m, bmk, conf, ctx);
  const achados = diagnosticos(m, bmk, conf, cartoes, ctx);
  const score = pontuar(cartoes, objetivo, conf);
  const funil = { etapas: m.funil, maior: m.maior_queda_funil };
  const garg = gargalos(cartoes, achados, funil);
  const fortes = pontosFortes(cartoes, achados, m);
  return { m, bmk, conf, cartoes, achados, score, funil, publico, fadiga: fad, gargalos: garg, fortes, plano: plano(achados, cartoes, conf), resumo: resumo10s({ score, cartoes, achados, gargalos: garg, fortes, conf, m }) };
}
const ids = (r) => r.achados.map((a) => a.id);
const nivelDe = (r, chave) => r.cartoes.find((c) => c.chave === chave).nivel;

test("retenção boa com CTR baixo aponta para chamada e oferta, não para o gancho", () => {
  const r = motor({
    bruto: { spend: 400, impressions: 60000, reach: 22000, frequency: 2.1, clicks: 400, link_clicks: 150, leads: 8, sales: 0 },
    video: { plays: 40000, v3s: 21000, p25: 14000, p50: 10000, p75: 6000, p95: 3000, p100: 2500, thruplay: 8000 },
  });
  assert.equal(nivelDe(r, "atencao"), "bom");
  assert.equal(nivelDe(r, "clique"), "ruim");
  assert.ok(ids(r).includes("assiste_nao_clica"), "deveria acusar 'prende atenção mas não induz ação'");
  assert.ok(!ids(r).includes("gancho_fraco"), "não pode culpar o gancho quando a retenção está boa");
  const rec = r.achados.find((a) => a.id === "assiste_nao_clica");
  assert.match(rec.acao, /CTA|oferta/i);
});

test("CTR bom com conversão ruim joga o diagnóstico para depois do clique", () => {
  const r = motor({
    bruto: { spend: 500, impressions: 40000, reach: 18000, frequency: 2.2, clicks: 1400, link_clicks: 900, landing_page_views: 800, leads: 12, sales: 0 },
    video: { plays: 26000, v3s: 12000, p25: 8000, p50: 5000, p75: 3000, p95: 1500, thruplay: 4200 },
  });
  assert.equal(nivelDe(r, "clique"), "bom");
  assert.ok(ids(r).includes("clica_nao_converte"));
  const rec = r.achados.find((a) => a.id === "clica_nao_converte");
  assert.match(rec.hipotese, /criativo provavelmente não é o principal problema/i);
});

test("muitos leads e poucas vendas manda olhar qualificação e atendimento", () => {
  const r = motor({
    bruto: { spend: 600, impressions: 50000, reach: 20000, frequency: 2.5, clicks: 1500, link_clicks: 1000, leads: 60, sales: 2, revenue: 400, gross_profit: 150, net_profit: -450 },
  });
  assert.ok(ids(r).includes("leads_sem_venda"));
  assert.match(r.achados.find((a) => a.id === "leads_sem_venda").acao, /qualificação|atendimento/i);
});

test("frequência subindo com CTR caindo é fadiga, não criativo ruim", () => {
  const r = motor({
    bruto: { spend: 700, impressions: 90000, reach: 20000, frequency: 4.5, clicks: 900, link_clicks: 600, leads: 20, sales: 3, revenue: 1800, gross_profit: 700, net_profit: 0 },
    video: { plays: 60000, v3s: 25000, p25: 15000, p50: 9000, p75: 5000, p95: 2500, thruplay: 8000 },
    tendencia: {
      inicio: { impressions: 30000, spend: 200, ctr: 0.018, cpc: 0.8, cpm: 18, frequency: 1.6, conv_dia: 4 },
      fim: { impressions: 30000, spend: 260, ctr: 0.009, cpc: 1.4, cpm: 31, frequency: 4.4, conv_dia: 1.5 },
    },
    tamanho_publico: 120000,
  });
  assert.equal(r.fadiga.tem_fadiga, true);
  assert.ok(ids(r).includes("fadiga"));
  assert.ok(["saturado", "saturando"].includes(r.publico.estado));
  assert.match(r.achados.find((a) => a.id === "fadiga").acao, /criativo novo|ampliar o público/i);
});

test("poucas impressões não geram score nem veredito", () => {
  const r = motor({ bruto: { spend: 18, impressions: 420, reach: 380, clicks: 6, link_clicks: 3, leads: 0, sales: 0 }, dias: 1 });
  assert.equal(r.conf.nivel, "insuficiente");
  assert.equal(r.score.score, null);
  assert.equal(r.score.nivel, "sem_dados");
  assert.ok(ids(r).includes("amostra_curta"));
  assert.equal(r.plano.agora.length, 1, "com amostra curta a única ação é esperar");
  assert.match(r.plano.agora[0].acao, /Deixar rodar|Não pausar/i);
  assert.ok(!ids(r).includes("gasto_sem_resultado"), "não pode condenar campanha sem amostra");
});

test("custo não recebe veredito enquanto a amostra for pequena", () => {
  const r = motor({ bruto: { spend: 14, impressions: 380, reach: 340, clicks: 5, link_clicks: 3, leads: 0, sales: 0 }, dias: 1 });
  assert.equal(nivelDe(r, "custo"), "sem_dados", "CPC alto com 3 cliques é ruído, não custo alto");
  assert.equal(nivelDe(r, "saturacao"), "sem_dados");
  assert.match(r.cartoes.find((c) => c.chave === "custo").explicacao, /Sem amostra/i);
});

test("CPM alto com ROAS excelente não é condenado", () => {
  const r = motor({
    objetivo: "vendas",
    bruto: { spend: 1000, impressions: 12000, reach: 6000, frequency: 2, clicks: 500, link_clicks: 300, leads: 40, sales: 20, revenue: 9000, gross_profit: 4200, net_profit: 3200 },
  });
  assert.ok(r.m.cpm.valor > 60, "cenário precisa ter CPM alto");
  assert.equal(nivelDe(r, "faturamento"), "bom");
  assert.ok(ids(r).includes("cpm_alto_roas_bom"));
  const rec = r.achados.find((a) => a.id === "cpm_alto_roas_bom");
  assert.equal(rec.prioridade, "baixa");
  assert.match(rec.acao, /Não mexer/i);
  assert.ok(r.plano.nao_alterar.some((i) => /CPM/.test(i.item)));
});

test("métrica ausente fica indisponível, nunca zero", () => {
  const m = metricasCalculadas({ spend: 100, impressions: 5000, clicks: 50, leads: null, sales: 0 }, {});
  assert.equal(m.cpl.valor, null);
  assert.equal(m.cpa.valor, null);
  assert.equal(m.roas.valor, null);
  assert.equal(m.video.retencao_metade.valor, null);
  assert.equal(m.video.tem_video, false);
  assert.equal(contagemOuNulo(0), null);
  assert.equal(contagemOuNulo(3), 3);
  for (const mt of m.lista) assert.ok(mt.formula, `${mt.chave} precisa declarar a fórmula`);
});

test("a maior queda do vídeo é apontada na etapa certa", () => {
  const m = metricasCalculadas(
    { spend: 200, impressions: 30000, clicks: 200, link_clicks: 120 },
    { plays: 20000, v3s: 15000, p25: 12000, p50: 2000, p75: 1600, p95: 1200, p100: 1000 },
  );
  assert.equal(m.maior_queda_video.etapa, "p50");
  assert.ok(m.maior_queda_video.perda > 0.8);
  assert.equal(m.maior_queda_video.formula, "assistiram 50% ÷ assistiram 25%");
});

test("o peso das etapas muda com o objetivo da campanha", () => {
  const cartoes = [
    { chave: "atencao", titulo: "Atenção", nivel: "bom" }, { chave: "retencao", titulo: "Retenção", nivel: "bom" },
    { chave: "clique", titulo: "Clique", nivel: "bom" }, { chave: "conversao", titulo: "Conversão", nivel: "ruim" },
    { chave: "custo", titulo: "Custo", nivel: "bom" }, { chave: "faturamento", titulo: "Faturamento", nivel: "ruim" },
    { chave: "publico", titulo: "Público", nivel: "bom" }, { chave: "saturacao", titulo: "Saturação", nivel: "bom" },
  ];
  const conf = confianca({ impressoes: 50000, alcance: 20000, cliques: 600, gasto: 500, dias: 10, leads: 40, vendas: 8 });
  const wa = pontuar(cartoes, "whatsapp", conf), vendas = pontuar(cartoes, "vendas", conf);
  assert.ok(wa.score > vendas.score, "em vendas o faturamento ruim pesa mais que em WhatsApp");
  assert.equal(pontuar(cartoes, "trafego", conf).pesos.clique, 0.35);
});

test("benchmark do histórico da conta tem prioridade sobre a referência padrão", () => {
  const conta = [{ ctr: 0.03 }, { ctr: 0.032 }, { ctr: 0.028 }, { ctr: 0.035 }, { ctr: 0.031 }];
  const bmk = construirBenchmarks(["ctr"], { conta }, REFERENCIA_PADRAO);
  assert.equal(bmk.ctr.fonte, "conta");
  // 1,5% seria "bom" pela referência padrão, mas é ruim para uma conta que costuma fazer 3%.
  const r = motor({ bruto: { spend: 300, impressions: 40000, reach: 15000, frequency: 2, clicks: 900, link_clicks: 600, leads: 15, sales: 2, revenue: 900, gross_profit: 400, net_profit: 100 }, conta });
  assert.equal(r.bmk.ctr.fonte, "conta");
  assert.equal(nivelDe(r, "clique"), "ruim");
});

test("campanha sem vídeo não recebe nota de atenção inventada", () => {
  const r = motor({ bruto: { spend: 300, impressions: 40000, reach: 15000, frequency: 2, clicks: 700, link_clicks: 500, leads: 20, sales: 4, revenue: 2000, gross_profit: 900, net_profit: 600 } });
  assert.equal(nivelDe(r, "atencao"), "sem_dados");
  assert.equal(nivelDe(r, "retencao"), "sem_dados");
  assert.match(r.cartoes.find((c) => c.chave === "atencao").explicacao, /não tem métricas de vídeo/i);
});

test("toda recomendação sai com problema, evidência, hipótese, ação, prioridade e confiança", () => {
  const r = motor({
    bruto: { spend: 400, impressions: 60000, reach: 22000, frequency: 2.1, clicks: 400, link_clicks: 150, leads: 8, sales: 0 },
    video: { plays: 40000, v3s: 21000, p25: 14000, p50: 10000, p75: 6000, p95: 3000, thruplay: 8000 },
  });
  assert.ok(r.achados.length > 0);
  for (const a of r.achados) {
    for (const campo of ["problema", "hipotese", "acao", "prioridade", "confianca"]) {
      assert.ok(a[campo], `recomendação ${a.id} sem ${campo}`);
    }
    assert.ok(Array.isArray(a.evidencias));
  }
  assert.ok(r.gargalos.length <= 3, "no máximo três gargalos");
  assert.ok(r.resumo.proxima_acao);
});

test("a linguagem evita afirmação causal definitiva", () => {
  const r = motor({
    bruto: { spend: 700, impressions: 90000, reach: 20000, frequency: 4.5, clicks: 900, link_clicks: 600, leads: 20, sales: 1, revenue: 300, gross_profit: 100, net_profit: -600 },
    tendencia: {
      inicio: { impressions: 30000, spend: 200, ctr: 0.018, cpc: 0.8, cpm: 18, frequency: 1.6, conv_dia: 4 },
      fim: { impressions: 30000, spend: 260, ctr: 0.009, cpc: 1.4, cpm: 31, frequency: 4.4, conv_dia: 1 },
    },
    tamanho_publico: 100000,
  });
  const textos = [r.publico.texto, ...r.cartoes.map((c) => c.explicacao), ...r.achados.map((a) => a.hipotese)].join(" ");
  assert.ok(/Há sinais|indicam|costuma|provavelmente|tendência/i.test(textos), "os textos precisam usar linguagem de hipótese");
});
