// Cenários do diagnóstico de público. Cada um existe porque um erro possível aqui
// mandaria o gestor mexer no lugar errado, ou deixaria de apontar dinheiro sendo queimado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analisarPublico, diagnosticarRecorte, RECORTES } from "../app/core/analise/publico.js";

const R = (chave) => RECORTES.find((r) => r.chave === chave);
// Linha de recorte com valores realistas: gasto, impressões, cliques, mensagens.
const pos = (plataforma, posicao, gasto, impressoes, cliques, mensagens, campanha_id = "c1") =>
  ({ campanha_id, plataforma, posicao, gasto, impressoes, cliques, mensagens });
const ig = (idade, genero, gasto, impressoes, cliques, mensagens, campanha_id = "c1") =>
  ({ campanha_id, idade, genero, gasto, impressoes, cliques, mensagens });

test("segmento caro com fatia grande do gasto vira achado com valor em reais", () => {
  const d = diagnosticarRecorte(R("posicionamento"), [
    pos("instagram", "instagram_reels", 300, 60000, 600, 100),   // R$ 3,00/msg
    pos("instagram", "instagram_stories", 300, 60000, 240, 25),  // R$ 12,00/msg
  ]);
  assert.equal(d.caros.length, 1);
  assert.match(d.caros[0].nome, /Stories/);
  assert.equal(Math.round(d.gastoCaro), 300);
  assert.ok(d.ganho > 50, "diz quantas mensagens a mais o mesmo dinheiro daria");
});

test("segmento caro mas irrelevante no orçamento não vira recomendação", () => {
  const d = diagnosticarRecorte(R("posicionamento"), [
    pos("instagram", "instagram_reels", 1000, 200000, 2000, 300),
    pos("facebook", "marketplace", 20, 4000, 20, 1),   // caríssimo, mas 2% do gasto
  ]);
  assert.equal(d.caros.length, 0, "mexer em 2% do gasto não muda o resultado");
});

test("entrega pequena não recebe nota: 1 mensagem por acaso não é conclusão", () => {
  const d = diagnosticarRecorte(R("posicionamento"), [
    pos("instagram", "instagram_reels", 500, 100000, 1000, 100),
    pos("facebook", "facebook_stories", 16, 400, 3, 1),
  ]);
  const p = d.itens.find((i) => /Stories/.test(i.nome));
  assert.equal(p.nivel, "sem_dados");
  assert.match(p.motivo, /pequena demais/);
});

test("gasto relevante com zero mensagem é conclusão, não amostra pequena", () => {
  const d = diagnosticarRecorte(R("posicionamento"), [
    pos("instagram", "instagram_reels", 400, 80000, 800, 100),
    pos("facebook", "marketplace", 120, 30000, 40, 0),
  ]);
  const m = d.itens.find((i) => /Marketplace/.test(i.nome));
  assert.equal(m.nivel, "sem_retorno");
  assert.ok(d.caros.some((i) => /Marketplace/.test(i.nome)));
});

test("custo por mensagem nulo quando não houve mensagem — nunca zero", () => {
  const d = diagnosticarRecorte(R("posicionamento"), [pos("facebook", "search", 50, 20000, 10, 0)]);
  assert.equal(d.itens[0].custo, null);
  assert.equal(d.itens[0].relativo, null);
});

test("recorte com muitos segmentos ainda consegue apontar (hora do dia)", () => {
  // 24 horas: nenhuma sozinha chega a 8% do gasto. Com corte fixo, nunca haveria achado.
  const horas = [];
  for (let h = 0; h < 24; h++) {
    const caro = h === 18 || h === 22;
    horas.push({ hora: h, gasto: caro ? 120 : 60, impressoes: 20000, cliques: 200, mensagens: caro ? 6 : 20 });
  }
  const d = diagnosticarRecorte(R("horario"), horas);
  assert.equal(d.caros.length, 2, "18h e 22h aparecem");
  assert.ok(d.fatiaCaro > 0.08, "e só aparecem porque somados pesam");
});

test("veredito é 'adequado' quando nenhum recorte tem fatia cara", () => {
  const P = {
    idade_genero: [ig("25-34", "female", 500, 100000, 900, 100), ig("25-34", "male", 500, 100000, 900, 95)],
    posicionamento: [pos("instagram", "instagram_reels", 1000, 200000, 1800, 195)],
  };
  const a = analisarPublico(P);
  assert.equal(a.veredito.nivel, "bom");
  assert.match(a.veredito.texto, /criativo ou na oferta/, "aponta onde procurar quando não é o público");
  assert.equal(a.acoes.length, 0);
});

test("veredito é 'desalinhado' quando um quarto do gasto está na parte cara", () => {
  const P = { posicionamento: [
    pos("instagram", "instagram_reels", 600, 120000, 1200, 200),
    pos("instagram", "instagram_stories", 400, 90000, 400, 30),
  ] };
  const a = analisarPublico(P);
  assert.equal(a.veredito.nivel, "ruim");
  assert.equal(a.acoes.length, 1);
  assert.match(a.acoes[0].titulo, /desmarcar esse posicionamento/);
});

test("sem entrega suficiente, não inventa veredito", () => {
  const a = analisarPublico({ posicionamento: [pos("instagram", "feed", 5, 200, 2, 0)] });
  assert.equal(a.veredito.nivel, "sem_dados");
  assert.match(a.veredito.titulo, /não dá para concluir/);
});

test("filtro por campanha só olha as linhas daquela campanha", () => {
  const P = { posicionamento: [
    pos("instagram", "instagram_reels", 600, 120000, 1200, 200, "c1"),
    pos("instagram", "instagram_stories", 400, 90000, 400, 30, "c2"),
  ] };
  const a = analisarPublico(P, { campanhaId: "c1" });
  assert.equal(a.recortes[0].itens.length, 1);
  assert.equal(a.veredito.nivel, "bom");
});

test("hora do dia não é filtrada por campanha — a Meta não devolve isso por campanha", () => {
  const P = {
    posicionamento: [pos("instagram", "feed", 600, 120000, 1200, 200, "c1")],
    horario: [{ hora: 9, gasto: 300, impressoes: 60000, cliques: 600, mensagens: 90 }],
  };
  const a = analisarPublico(P, { campanhaId: "c1" });
  assert.ok(a.recortes.some((r) => r.chave === "horario"), "o recorte de hora continua aparecendo");
});

test("a alavanca escolhida é a de maior ganho, não a primeira da lista", () => {
  const P = {
    idade_genero: [ig("25-34", "female", 300, 60000, 500, 60), ig("55-64", "male", 200, 40000, 200, 8)],
    posicionamento: [
      pos("instagram", "instagram_reels", 300, 60000, 600, 100),
      pos("instagram", "instagram_stories", 700, 140000, 700, 50),
    ],
  };
  const a = analisarPublico(P);
  assert.equal(a.alavanca.chave, "posicionamento");
  assert.equal(a.acoes[0].recorte, "Onde o anúncio aparece");
});
