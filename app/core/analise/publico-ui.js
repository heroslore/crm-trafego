// Tela do diagnóstico de público. Ordem: veredito primeiro, ação depois, número por último —
// quem abre quer saber se está certo ou errado, não conferir tabela.
import { analisarPublico, NIVEIS } from "./publico.js?v=cb6be18a";
import { cartao, barrasH, vazio, badge } from "../ui.js?v=cb6be18a";
import { esc, brl, pct, inteiro, dataBR } from "../format.js?v=cb6be18a";

const CLASSE = { bom: "aviso-ok", medio: "aviso-alerta", ruim: "aviso-erro", sem_dados: "aviso-info" };

function cartaoVeredito(v) {
  const n = NIVEIS[v.nivel] || NIVEIS.sem_dados;
  return `<div class="aviso ${CLASSE[v.nivel] || "aviso-info"}" style="padding:14px 16px">
    <div style="font-size:1.05rem;font-weight:700;margin-bottom:4px">${n.icone} ${esc(v.titulo)}</div>
    <div>${esc(v.texto)}</div></div>`;
}

function listaAcoes(acoes) {
  if (!acoes.length) return "";
  return cartao("O que fazer, na ordem", `<div class="lista">${acoes.map((a, i) => `
    <div class="oportunidade">
      <div><span class="ranking-pos ${i < 3 ? "p" + (i + 1) : ""}">${i + 1}</span></div>
      <div class="txt"><div class="t">${esc(a.titulo)}</div><div class="d">${esc(a.porque)}</div></div>
      ${a.ganho ? `<div style="text-align:right;white-space:nowrap"><b>+~${inteiro(a.ganho)}</b><br><small>mensagens</small></div>` : ""}
    </div>`).join("")}</div>
    <p class="sub" style="margin:10px 2px 0">Estimativa pelo custo que a própria conta já alcançou no melhor segmento. Não é promessa: tirar um posicionamento muda o leilão, e parte dessa entrega pode migrar para os que sobraram. Mexa em um de cada vez e compare depois.</p>`);
}

function cartaoRecorte(d) {
  const itens = d.itens.map((i) => {
    const n = NIVEIS[i.nivel] || NIVEIS.sem_dados;
    // O custo por mensagem é o número que decide, então é ele que fica grande. O resto é
    // apoio e precisa caber num celular de 390px — texto comprido aqui rasgava a tela.
    const custo = i.custo != null ? `${brl(i.custo)}/msg` : "sem msg";
    const rel = i.relativo != null ? `${i.relativo.toFixed(1).replace(".", ",")}×` : "";
    return {
      nome: i.nome,
      html: `${n.icone} ${esc(i.nome)}`,
      valor: i.gasto,
      rotulo: custo,
      extra: [brl(i.gasto), rel, `${inteiro(i.mensagens)} msg`].filter(Boolean).join(" · "),
      titulo: `${i.nome}: ${n.rotulo} — ${i.motivo}. ${brl(i.gasto)} gastos, ${inteiro(i.mensagens)} mensagens, CTR ${i.ctr != null ? pct(i.ctr) : "—"}.`,
      cor: { bom: "var(--verde)", medio: "var(--amarelo)", ruim: "var(--vermelho)", sem_retorno: "var(--vermelho)", sem_dados: "var(--mudo)" }[i.nivel],
    };
  });
  const f = d.frase;
  return cartao(`${esc(d.rotulo)} ${d.media != null ? `<small class="sub">média ${brl(d.media)}/msg</small>` : ""}`,
    `<div class="aviso ${CLASSE[f.nivel] || "aviso-info"}">${esc(f.texto)}</div>${barrasH(itens, { vazioTxt: "Sem recorte neste período." })}`);
}

// Bloco inteiro. campanhaId vazio = conta toda.
export function blocoPublico(publico, { campanhaId = "", compacto = false } = {}) {
  if (!publico || !publico.idade_genero) {
    return `<div class="aviso aviso-info">Os recortes de público vêm da coleta automática da Meta (<code>dados/meta.json</code>). Ainda não há arquivo carregado.</div>`;
  }
  const a = analisarPublico(publico, { campanhaId });
  if (!a.recortes.length) {
    return `<div class="aviso aviso-info">Esta campanha não aparece nos recortes dos últimos 30 dias da Meta. Recorte de público só existe para campanha que entregou nesse intervalo.</div>`;
  }
  const per = a.periodo || {};
  const aviso = `<p class="sub" style="margin:0 2px 10px">Recortes de ${dataBR(per.inicio)} a ${dataBR(per.fim)} — últimos 30 dias da conta na Meta. <b>Não seguem o filtro de período do topo</b>, porque a Meta só devolve recorte de janela recente. Custo por mensagem = gasto ÷ conversas iniciadas pelo anúncio.</p>`;
  const ordem = a.recortes.slice().sort((x, y) => (y.caros.length ? 1 : 0) - (x.caros.length ? 1 : 0));
  return `${cartaoVeredito(a.veredito)}${aviso}${listaAcoes(a.acoes)}
    ${compacto ? ordem.filter((d) => d.caros.length).map(cartaoRecorte).join("") : `<div class="grid2">${ordem.map(cartaoRecorte).join("")}</div>`}`;
}
