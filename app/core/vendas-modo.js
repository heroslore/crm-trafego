// Como o CRM trata as vendas, escolhido em Configurações → Análise.
//
// "parcial" é o padrão e existe porque na vida real a venda acontece no WhatsApp e nem sempre
// dá tempo de lançar. Registro parcial tem uma consequência matemática: o faturamento lançado
// é um PISO (o mínimo confirmado), enquanto a taxa de conversão e o CPA ficam distorcidos —
// poucas vendas registradas empurram a taxa para baixo e o CPA para cima. Por isso, no modo
// parcial, faturamento e ROAS entram como piso e as taxas de venda não entram na nota.
// Sem isso, lançar a primeira venda pioraria a nota do anúncio, que é o oposto do certo.
//
// Mora fora de analise/ porque metrics.js também precisa: é ele que decide se ROAS e ROI
// são número medido ou desconhecido, e metrics.js não pode importar a análise (a análise
// importa metrics.js, e o ciclo quebraria o carregamento dos módulos).
import { num } from "./format.js?v=edb6a568";

export const MODOS_VENDA = [
  ["parcial", "Nem toda venda é lançada (recomendado)"],
  ["completo", "Toda venda é lançada no CRM"],
  ["nunca", "Não usar vendas na análise"],
];
export const MODO_VENDA_PADRAO = "parcial";
export function normalizarModoVenda(modo) {
  if (modo === "sempre") return "completo";      // nomes antigos
  if (modo === "auto") return "parcial";
  return ["parcial", "completo", "nunca"].includes(modo) ? modo : MODO_VENDA_PADRAO;
}
// usar    — faturamento, ROAS e lucro existem para este escopo
// parcial — existem, mas como piso: taxas de venda e CPA ficam fora da nota
export function consideraVendas(modo, k) {
  const m = normalizarModoVenda(modo);
  const temVenda = num(k && k.sales) > 0;
  if (m === "nunca") return { usar: false, parcial: false };
  if (m === "completo") return { usar: true, parcial: false };
  return { usar: temVenda, parcial: temVenda };
}
