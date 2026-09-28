// Etapa do funil: cada erro aqui faz o CRM cobrar de uma campanha o resultado que ela
// nunca teve a obrigação de dar — foi assim que uma campanha de topo apareceu como
// "R$ 107,16 por mensagem" ao lado de uma de fundo a R$ 1,58, como se fossem comparáveis.
import { test } from "node:test";
import assert from "node:assert/strict";
import { etapaDe, porEtapa, METRICA_DA_ETAPA, ROTULO_ETAPA } from "../app/core/funil.js";

test("objetivo de reconhecimento cai no topo", () => {
  assert.equal(etapaDe({ objective: "reconhecimento", name: "Campanha X" }), "topo");
  assert.equal(etapaDe({ objective: "engajamento", name: "Campanha X" }), "topo");
});

test("objetivo de conversa cai no fundo", () => {
  assert.equal(etapaDe({ objective: "whatsapp", name: "Campanha X" }), "fundo");
  assert.equal(etapaDe({ objective: "vendas", name: "Campanha X" }), "fundo");
});

test("o nome da campanha vence o objetivo: quem escreveu sabia o que queria", () => {
  // A conta real tem "Fundo de Funil Evely" com objetivo OUTCOME_ENGAGEMENT, que viraria topo.
  assert.equal(etapaDe({ objective: "engajamento", name: "Fundo de Funil Evely 1,2 Wesley + Manu" }), "fundo");
  assert.equal(etapaDe({ objective: "whatsapp", name: "Nova campanha de Reconhecimento" }), "topo");
  assert.equal(etapaDe({ objective: "whatsapp", name: "Meio de Funil - Evelyn 1 e 2" }), "meio");
});

test("o campo escolhido à mão vence tudo", () => {
  assert.equal(etapaDe({ objective: "reconhecimento", name: "Reconhecimento da Loja", funnel_stage: "fundo" }), "fundo");
});

test("valor inválido no campo não derruba a dedução", () => {
  assert.equal(etapaDe({ objective: "reconhecimento", name: "X", funnel_stage: "inventado" }), "topo");
  assert.equal(etapaDe(null), "fundo");
});

test("cada etapa é julgada pela régua dela, e o topo nunca por conversa", () => {
  assert.equal(METRICA_DA_ETAPA.topo.chave, "custo_base");
  assert.equal(METRICA_DA_ETAPA.fundo.chave, "custo_conversa");
  assert.notEqual(METRICA_DA_ETAPA.topo.chave, METRICA_DA_ETAPA.fundo.chave);
});

test("reparte o gasto e calcula a régua de cada etapa", () => {
  const linhas = porEtapa([
    { registro: { name: "Reconhecimento A", objective: "reconhecimento" },
      k: { spend: 300, reach: 100000, video_p50: 3000, conversations: 2 } },
    { registro: { name: "Fundo de Funil B", objective: "whatsapp" },
      k: { spend: 100, reach: 5000, video_p50: 500, conversations: 50 } },
  ]);
  const topo = linhas.find((g) => g.etapa === "topo");
  const fundo = linhas.find((g) => g.etapa === "fundo");
  assert.equal(topo.spend, 300);
  assert.equal(fundo.spend, 100);
  assert.equal(topo.fatia, 0.75);
  assert.equal(topo.custo_base, 0.1);        // 300 / 3000
  assert.equal(fundo.custo_conversa, 2);     // 100 / 50
});

test("sem denominador, o custo é desconhecido e não zero", () => {
  const linhas = porEtapa([
    { registro: { name: "Topo sem vídeo", objective: "reconhecimento" }, k: { spend: 200, video_p50: 0, conversations: 0 } },
  ]);
  const topo = linhas.find((g) => g.etapa === "topo");
  assert.equal(topo.custo_base, null);
  assert.equal(topo.custo_conversa, null);
  assert.equal(topo.cpl, null);
});

test("etapa sem campanha nenhuma aparece zerada, não some", () => {
  const linhas = porEtapa([{ registro: { objective: "whatsapp", name: "F" }, k: { spend: 10 } }]);
  assert.equal(linhas.length, 3);
  assert.ok(linhas.every((g) => ROTULO_ETAPA[g.etapa]));
});
