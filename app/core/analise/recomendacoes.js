// Camada 6 do motor: RECOMENDAÇÕES.
// Toda recomendação sai com a mesma estrutura (item 53): problema, evidência, hipótese,
// ação, prioridade e confiança. E o plano é separado em três caixas, porque mexer em tudo
// ao mesmo tempo impede saber o que resolveu.
import { pct, brl, inteiro } from "../format.js";
import { listar } from "./regras.js";

export const ORDEM_PRIORIDADE = { urgente: 0, alta: 1, media: 2, baixa: 3 };
export const ORDEM_IMPACTO = { alto: 0, medio: 1, baixo: 2 };
const ordenar = (a, b) => (ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade]) || (ORDEM_IMPACTO[a.impacto] - ORDEM_IMPACTO[b.impacto]);

// Gargalos: no máximo três, os de maior impacto. Lista longa vira lista ignorada (item 50).
export function gargalos(cartoes, achados, funil) {
  const lista = [];
  const queda = funil && funil.maior;
  if (queda) lista.push({ tipo: "funil", titulo: `Maior queda do funil: ${queda.rotulo}`, texto: `${pct(queda.perda)} das pessoas se perdem entre "${queda.de}" e "${queda.rotulo}" (${queda.formula}).`, prioridade: "alta", impacto: "alto" });
  for (const a of achados.filter((a) => ["urgente", "alta"].includes(a.prioridade) && a.id !== "escalar" && a.id !== "cpm_alto_roas_bom")) {
    lista.push({ tipo: "padrao", titulo: a.nome, texto: a.problema, prioridade: a.prioridade, impacto: a.impacto, etapa: a.etapa });
  }
  for (const c of cartoes.filter((c) => c.nivel === "ruim")) {
    if (lista.some((l) => l.etapa === c.chave)) continue;
    lista.push({ tipo: "etapa", titulo: `${c.titulo} em nível ruim`, texto: c.explicacao, prioridade: "media", impacto: "medio", etapa: c.chave });
  }
  return lista.sort(ordenar).slice(0, 3);
}

// Pontos fortes: serve para não estragar o que funciona (item 49).
export function pontosFortes(cartoes, achados, m) {
  const fortes = cartoes.filter((c) => c.nivel === "bom").map((c) => ({ titulo: c.titulo, texto: c.explicacao, etapa: c.chave }));
  const bons = achados.filter((a) => ["escalar", "cpm_alto_roas_bom"].includes(a.id));
  for (const a of bons) fortes.push({ titulo: a.nome, texto: a.problema, etapa: a.etapa });
  return fortes;
}

// O que não mexer agora, com o motivo. Mexer no que está bom é o erro mais comum depois de um diagnóstico.
export function naoAlterar(cartoes, achados) {
  const itens = [];
  const bom = (chave) => cartoes.find((c) => c.chave === chave && c.nivel === "bom");
  if (bom("atencao")) itens.push({ item: "Os primeiros segundos do vídeo", motivo: "A retenção inicial está boa: trocar o gancho agora joga fora a única parte comprovada." });
  if (bom("retencao")) itens.push({ item: "A edição e a duração do vídeo", motivo: "A curva de retenção sustenta a atenção até o meio." });
  if (bom("clique")) itens.push({ item: "A chamada e o texto do anúncio", motivo: "O CTR está dentro da base de comparação: o convite ao clique funciona." });
  if (bom("publico")) itens.push({ item: "A segmentação do público", motivo: "Frequência e custo de entrega saudáveis; trocar público reinicia o aprendizado sem motivo." });
  if (bom("faturamento")) itens.push({ item: "A oferta e o preço", motivo: "O retorno está acima da base: a oferta está sendo aceita." });
  if (achados.some((a) => a.id === "cpm_alto_roas_bom")) itens.push({ item: "O CPM alto", motivo: "Custo de entrega alto com retorno bom não é problema a resolver." });
  if (achados.some((a) => a.id === "amostra_curta")) itens.push({ item: "Orçamento, público e criativo", motivo: "Com amostra pequena, qualquer mudança agora apaga o teste em andamento." });
  return itens;
}

// Plano de ação em três caixas (item 52).
export function plano(achados, cartoes, conf) {
  const rec = achados.map((a) => ({
    id: a.id, titulo: a.nome, problema: a.problema, evidencias: a.evidencias, hipotese: a.hipotese,
    acao: a.acao, prioridade: a.prioridade, impacto: a.impacto, confianca: a.confianca, etapa: a.etapa,
  })).sort(ordenar);
  const agora = rec.filter((r) => ["urgente", "alta"].includes(r.prioridade)).slice(0, 3);
  const depois = rec.filter((r) => !agora.includes(r)).slice(0, 4);
  const testes = depois.map((r) => r);
  // Com amostra insuficiente, a única ação legítima é esperar.
  if (conf.nivel === "insuficiente") {
    const espera = rec.find((r) => r.id === "amostra_curta");
    return { agora: espera ? [espera] : [], proximo_teste: [], nao_alterar: naoAlterar(cartoes, achados), todas: rec };
  }
  return { agora, proximo_teste: testes, nao_alterar: naoAlterar(cartoes, achados), todas: rec };
}

// Resumo em 10 segundos: o que a pessoa lê antes de decidir se vale abrir o resto (item 47).
export function resumo10s({ escopo, score, cartoes, achados, gargalos: garg, fortes, conf, m }) {
  const principal = garg[0] || null;
  const oportunidade = achados.find((a) => a.id === "escalar") || achados.find((a) => a.prioridade === "baixa") || (fortes[0] ? { nome: fortes[0].titulo, problema: fortes[0].texto } : null);
  const proxima = (achados.filter((a) => ["urgente", "alta"].includes(a.prioridade)).sort(ordenar)[0] || achados[0] || null);
  const etapas = cartoes.filter((c) => c.nivel !== "sem_dados");
  const ruins = etapas.filter((c) => c.nivel === "ruim").map((c) => c.titulo.toLowerCase());
  const bons = etapas.filter((c) => c.nivel === "bom").map((c) => c.titulo.toLowerCase());
  const queda = m.maior_queda_funil;
  const frase = conf.nivel === "insuficiente"
    ? `Ainda não há amostra para avaliar: ${inteiro(conf.amostra.impressoes)} impressões e ${brl(conf.amostra.gasto)} investidos. Os dados aparecem abaixo, mas sem conclusão.`
    : `${score.score != null ? `Score ${score.score}/100 (${score.rotulo}).` : "Sem score pela falta de dados em etapas importantes."} ${ruins.length ? `O funil se quebra em ${listar(ruins)}.` : bons.length ? `Nenhuma etapa em nível ruim; ${listar(bons.slice(0, 3))} em nível bom.` : ""} ${proxima ? `Próxima ação: ${proxima.acao.split(".")[0]}.` : ""}`.replace(/\s+/g, " ").trim();
  // O diagnóstico descreve ONDE o funil quebra; o problema descreve o QUÊ. Um não repete o outro.
  const diagnostico = conf.nivel === "insuficiente"
    ? "Amostra insuficiente para diagnóstico. Os números existem, mas ainda não significam nada."
    : queda
      ? `A maior perda está entre “${queda.de}” e “${queda.rotulo}”: ${pct(queda.perda)} das pessoas não avançam (${queda.formula}).${ruins.length ? ` Etapas em nível ruim: ${listar(ruins)}.` : ""}`
      : ruins.length ? `Etapas em nível ruim: ${listar(ruins)}.` : "Nenhum gargalo claro nos dados atuais.";
  return {
    frase, diagnostico,
    problema: principal ? principal.titulo : null,
    problema_texto: principal ? principal.texto : null,
    oportunidade: oportunidade ? (oportunidade.nome || oportunidade.titulo) : null,
    oportunidade_texto: oportunidade ? (oportunidade.problema || oportunidade.texto) : null,
    proxima_acao: proxima ? proxima.acao : (conf.nivel === "insuficiente" ? "Deixar rodar até atingir volume mínimo antes de mexer." : "Manter como está e reavaliar no próximo período."),
    confianca: conf.nivel, rotuloConfianca: conf.rotulo,
  };
}
