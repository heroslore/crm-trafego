// Interface da Análise Inteligente. Só desenha: todo o julgamento já veio pronto do motor.
// A ordem das seções é a do briefing: primeiro o que decide, depois o que explica, por último o detalhe.
import { cartao, badge, vazio, funil as funilUi, barrasH, tabela, prioridadeBadge } from "../ui.js?v=0f43faaa";
import { esc, brl, pct, dec, inteiro, dataCurta } from "../format.js?v=0f43faaa";
import { valorTexto, NIVEIS } from "./regras.js?v=0f43faaa";
import { analisar } from "./index.js?v=0f43faaa";

// Ponto de entrada usado pelas telas. Se algo falhar no motor, a tela continua de pé:
// a análise é um complemento, não pode derrubar a página da campanha.
export function blocoAnalise(nivel, registro, iv) {
  try {
    return secaoAnalise(analisar({ nivel, registro, iv }));
  } catch (e) {
    console.error("Análise inteligente:", e);
    return cartao("🧠 Análise inteligente", `<div class="aviso aviso-erro">Não foi possível montar a análise deste escopo (${esc(e.message)}). O restante da tela continua funcionando normalmente.</div>`);
  }
}

const pill = (nivel, texto) => {
  const n = NIVEIS[nivel] || NIVEIS.sem_dados;
  return `<span class="an-pill an-${n[2]}">${n[0]} ${esc(texto || n[1])}</span>`;
};
const CONFIANCA_TXT = { insuficiente: "dados insuficientes", baixa: "confiança baixa", media: "confiança média", alta: "confiança alta" };
const confPill = (c) => `<span class="an-conf an-conf-${c}">${esc(CONFIANCA_TXT[c] || c)}</span>`;

// ---------------------------------------------------------------- 1. resumo em 10 segundos
function resumoHtml(a) {
  const s = a.score, r = a.resumo;
  const bloco = (rot, txt, cls = "") => txt ? `<div class="an-bloco ${cls}"><div class="an-bloco-rot">${rot}</div><div class="an-bloco-txt">${esc(txt)}</div></div>` : "";
  return `<div class="an-resumo">
      <div class="an-score an-score-${s.cor}">
        <div class="an-score-num">${s.score != null ? s.score : "—"}</div>
        <div class="an-score-max">${s.score != null ? "de 100" : "sem nota"}</div>
        <div class="an-score-rot">${s.icone} ${esc(s.rotulo)}</div>
      </div>
      <div class="an-resumo-txt">
        <p class="an-frase">${esc(r.frase)}</p>
        <div class="an-blocos">
          ${bloco("Diagnóstico principal", r.diagnostico)}
          ${bloco("Principal problema", r.problema_texto || "Nenhum gargalo claro nos dados atuais.")}
          ${bloco("Principal oportunidade", r.oportunidade_texto || "Nenhuma oportunidade evidente com a amostra atual.")}
          ${bloco("Próxima ação recomendada", r.proxima_acao, "an-bloco-acao")}
        </div>
        <p class="an-rodape">${confPill(a.conf.nivel)} ${esc(a.conf.texto)}</p>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- 2. diagnóstico por etapa
function etapaHtml(c) {
  const mets = (c.metricas || []).filter((m) => m && m.valor != null).slice(0, 4);
  return `<div class="an-etapa an-borda-${(NIVEIS[c.nivel] || NIVEIS.sem_dados)[2]}">
    <div class="an-etapa-cab"><b>${esc(c.titulo)}</b>${pill(c.nivel)}</div>
    <div class="an-etapa-valor">${esc(c.valorTxt || "—")}</div>
    <p class="an-etapa-txt">${esc(c.explicacao)}</p>
    ${mets.length ? `<ul class="an-mini">${mets.map((m) => `<li><span>${esc(m.rotulo)}</span><b>${esc(valorTexto(m))}</b><small title="${esc(m.formula || "")}">${esc(m.formula || "")}</small></li>`).join("")}</ul>` : ""}
  </div>`;
}
function diagnosticoHtml(a) {
  const pesos = a.score.detalhe.filter((d) => d.peso).sort((x, y) => y.peso - x.peso);
  return `<div class="an-etapas">${a.cartoes.map(etapaHtml).join("")}</div>
    <details class="an-pesos"><summary>Como o score foi calculado</summary>
      <p class="sub">Objetivo da campanha: <b>${esc(a.score.objetivo)}</b>. Cada etapa vale um peso diferente conforme o objetivo; etapa sem dado sai da conta e os pesos são reequilibrados. Nota por nível: bom 100, médio 60, ruim 20.</p>
      <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Etapa</th><th>Peso</th><th>Nível</th><th>Nota</th></tr></thead><tbody>
      ${pesos.map((d) => `<tr><td>${esc(d.titulo)}</td><td>${pct(d.peso)}</td><td>${pill(d.nivel)}</td><td>${d.nota == null ? "—" : d.nota}</td></tr>`).join("")}
      </tbody></table></div></details>`;
}

// ---------------------------------------------------------------- 3. plano de ação
function recHtml(r) {
  return `<div class="an-rec">
    <div class="an-rec-cab">${prioridadeBadge(r.prioridade)} <b>${esc(r.titulo)}</b> ${confPill(r.confianca)}</div>
    <div class="an-rec-linha"><span>Problema</span><p>${esc(r.problema)}</p></div>
    ${r.evidencias && r.evidencias.length ? `<div class="an-rec-linha"><span>Evidência</span><ul>${r.evidencias.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
    <div class="an-rec-linha"><span>Hipótese</span><p>${esc(r.hipotese)}</p></div>
    <div class="an-rec-linha an-rec-acao"><span>Ação</span><p>${esc(r.acao)}</p></div>
    <div class="an-rec-pe"><small>impacto ${esc({ alto: "alto", medio: "médio", baixo: "baixo" }[r.impacto] || r.impacto)}</small></div>
  </div>`;
}
function planoHtml(a) {
  const p = a.plano;
  const col = (titulo, sub, itens, corpoVazio) => `<div class="an-col"><h3>${esc(titulo)}</h3><p class="sub">${esc(sub)}</p>${itens.length ? itens : `<div class="vazio">${esc(corpoVazio)}</div>`}</div>`;
  return `<div class="an-plano">
    ${col("Agora", "O que mexer nesta semana, em ordem de impacto.", p.agora.map(recHtml).join(""), "Nada urgente com os dados atuais.")}
    ${col("Próximo teste", "Uma variável por vez, senão não dá para saber o que resolveu.", p.proximo_teste.map(recHtml).join(""), "Sem teste sugerido no momento.")}
    ${col("Não alterar", "O que já funciona e não deve ser mexido junto.", p.nao_alterar.map((i) => `<div class="an-manter"><b>${esc(i.item)}</b><p>${esc(i.motivo)}</p></div>`).join(""), "Nada confirmado como ponto forte ainda.")}
  </div>`;
}

// ---------------------------------------------------------------- 4. funil
function funilHtml(a) {
  const etapas = a.funil.etapas.filter((e) => e.disponivel);
  if (!etapas.length) return vazio("Sem números suficientes para desenhar o funil.");
  const q = a.funil.maior;
  return `${funilUi(etapas.map((e) => ({ rotulo: e.rotulo, n: e.n, extra: e.taxa != null ? `${pct(e.taxa)} de ${e.de.toLowerCase()}` : "", cor: q && q.etapa === e.chave ? "var(--vermelho)" : "var(--acento)" })))}
    ${q ? `<div class="aviso aviso-alerta">Maior queda do funil: <b>${esc(q.rotulo)}</b>. ${esc(pct(q.perda))} das pessoas se perdem entre “${esc(q.de)}” e “${esc(q.rotulo)}”. <small>(${esc(q.formula)})</small></div>` : ""}
    ${a.funil.etapas.some((e) => !e.disponivel) ? `<p class="sub">Etapas sem dado no período: ${a.funil.etapas.filter((e) => !e.disponivel).map((e) => esc(e.rotulo)).join(", ")}. Aparecem vazias de propósito — preencher com zero daria uma conclusão falsa.</p>` : ""}`;
}

// ---------------------------------------------------------------- 5. vídeo
function videoHtml(a) {
  const v = a.m.video, etapas = a.m.etapas_video.filter((e) => e.disponivel);
  if (!v.tem_video) return vazio("Este escopo não tem métricas de vídeo no período (criativo estático, ou a plataforma não informou).");
  const q = a.m.maior_queda_video;
  const cores = { plays: "var(--ciano)", v2s: "var(--ciano)", v3s: "var(--acento)", p25: "var(--acento)", p50: "var(--roxo)", p75: "var(--amarelo)", p95: "var(--verde)", p100: "var(--verde)" };
  return `${barrasH(etapas.map((e) => ({ nome: e.rotulo, valor: e.n, cor: q && q.etapa === e.chave ? "var(--vermelho)" : (cores[e.chave] || "var(--acento)"), extra: e.sobre_impressoes != null ? pct(e.sobre_impressoes) + " das impressões" : "" })), { vazioTxt: "Sem dados de vídeo." })}
    ${q ? `<div class="aviso aviso-alerta">Maior queda do vídeo em <b>${esc(q.rotulo)}</b>: ${esc(pct(q.perda))} de quem chegou em “${esc(q.de)}” não avançou. <small>(${esc(q.formula)})</small></div>` : ""}
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Etapa</th><th>Pessoas</th><th>Retenção da etapa anterior</th><th>Fórmula</th></tr></thead><tbody>
      ${etapas.map((e) => `<tr${q && q.etapa === e.chave ? ' class="an-destaque"' : ""}><td>${esc(e.rotulo)}</td><td>${inteiro(e.n)}</td><td>${e.taxa != null ? pct(e.taxa) : "—"}</td><td><small>${esc(e.formula || "primeira etapa disponível")}</small></td></tr>`).join("")}
    </tbody></table></div>
    <h3>Indicadores do vídeo</h3>
    ${metricasTabela(v.lista, a)}
    <p class="sub">Os apelidos do mercado aparecem só como referência: “hook rate” é a taxa de quem passa dos 3 segundos e “hold rate” é a de quem chega à metade. O que vale é a fórmula ao lado de cada número.</p>`;
}

// ---------------------------------------------------------------- tabela genérica de métricas
function metricasTabela(lista, a) {
  const linhas = lista.filter(Boolean).map((m) => {
    const bm = a.bmk[m.chave];
    const cl = bm && m.valor != null ? classificarLocal(m.valor, bm) : null;
    return `<tr><td>${esc(m.rotulo)}${m.apelido ? ` <small>(${esc(m.apelido)})</small>` : ""}</td>
      <td class="num">${m.valor != null ? esc(valorTexto(m)) : `<span class="an-indisp">indisponível</span>`}</td>
      <td><small>${esc(m.formula || "—")}</small></td>
      <td>${cl ? pill(cl.nivel, cl.nivel === "bom" ? "bom" : cl.nivel === "medio" ? "médio" : "ruim") : ""}</td>
      <td><small>${cl ? esc(cl.texto) : m.valor == null ? "sem dado para comparar" : "sem base de comparação"}</small></td></tr>`;
  }).join("");
  return `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Métrica</th><th>Valor</th><th>Como é calculada</th><th>Leitura</th><th>Base da comparação</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
}
// Repetido aqui para a interface não precisar importar a camada de benchmarks inteira.
function classificarLocal(valor, bm) {
  const menor = bm.menor_melhor;
  const nivel = (menor ? valor <= bm.bom : valor >= bm.bom) ? "bom" : (menor ? valor >= bm.ruim : valor <= bm.ruim) ? "ruim" : "medio";
  return { nivel, texto: `comparado com ${bm.texto}` };
}

// ---------------------------------------------------------------- 7 a 10
function publicoHtml(a) {
  const p = a.ctx.publico, pub = a.contexto.publico;
  return `<div class="an-linha-titulo">${pill(p.nivel, p.titulo)}</div>
    <p>${esc(p.texto)}</p>
    ${p.sinais && p.sinais.length ? `<ul class="an-sinais">${p.sinais.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
    ${pub ? `<p class="sub">Público considerado: <a href="#/publicos/${esc(pub.id)}">${esc(pub.name)}</a>${pub.size ? ` · tamanho estimado ${inteiro(pub.size)}` : " · sem tamanho estimado cadastrado (preencha no público para liberar a leitura de amplitude)"}.</p>` : `<p class="sub">Nenhum público está ligado a este escopo. Ligue um público ao conjunto ou à campanha para a análise medir amplitude e cobertura.</p>`}`;
}
function tendenciaHtml(a) {
  const t = a.tendencia, f = a.fadiga;
  if (!t) return vazio("O período tem poucos dias com entrega para comparar começo e fim. Escolha um período maior no topo da tela.");
  return `<div class="an-linha-titulo">${pill(f.nivel === "sem_dados" ? "sem_dados" : f.tem_fadiga ? (f.nivel === "ruim" ? "ruim" : "medio") : "bom", f.tem_fadiga ? "Sinais de fadiga" : "Sem sinal de fadiga")}</div>
    <p>${esc(f.texto)}</p>
    <p class="sub">Comparação entre os ${t.n} primeiros e os ${t.n} últimos dias com entrega, de ${t.total} dias no período.</p>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Indicador</th><th>Início</th><th>Fim</th><th>Variação</th></tr></thead><tbody>
      ${(f.sinais || []).map((s) => `<tr${s.ruim ? ' class="an-destaque"' : ""}><td>${esc(s.rotulo)}</td><td>${esc(s.fmt(s.de))}</td><td>${esc(s.fmt(s.para))}</td><td>${s.var > 0 ? "+" : ""}${pct(s.var)}</td></tr>`).join("")}
    </tbody></table></div>`;
}

// ---------------------------------------------------------------- níveis abaixo e recortes
function filhosHtml(a) {
  if (!a.filhos || !a.filhos.length) return vazio("Nenhum conjunto ou anúncio com entrega no período.");
  const linhas = a.filhos.map((f) => `<tr>
    <td>${f.href ? `<a href="${esc(f.href)}">${esc(f.nome)}</a>` : esc(f.nome)}<br><small>${esc(f.tipo)}</small></td>
    <td class="num">${brl(f.k.spend)}</td>
    <td class="num">${f.m.ctr.valor != null ? pct(f.m.ctr.valor) : "—"}</td>
    <td class="num">${f.m.video.retencao_inicial.valor != null ? pct(f.m.video.retencao_inicial.valor) : "—"}</td>
    <td class="num">${f.m.cpl.valor != null ? brl(f.m.cpl.valor) : "—"}</td>
    <td class="num">${f.m.cpa.valor != null ? brl(f.m.cpa.valor) : "—"}</td>
    <td class="num">${f.m.roas.valor != null ? dec(f.m.roas.valor, 2) + "x" : "—"}</td>
    <td>${f.queda ? `<small>${esc(f.queda.rotulo)} (${esc(pct(f.queda.perda))} se perdem)</small>` : "<small>—</small>"}</td></tr>`).join("");
  return `<p class="sub">A mesma leitura aplicada um nível abaixo. Quando um conjunto ou anúncio destoa, o problema não é da campanha inteira: é dele.</p>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Conjunto / anúncio</th><th>Gasto</th><th>CTR</th><th>Passaram de 3s</th><th>CPL</th><th>CPA</th><th>ROAS</th><th>Maior queda do funil</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
}
function recortesHtml(a) {
  const r = a.recortes;
  if (!r) return "";
  const bloco = (titulo, itens) => itens.length < 2 ? "" : `<h3>${esc(titulo)}</h3>${barrasH(itens.slice(0, 8).map((g) => ({ nome: g.nome, valor: g.mensagens || g.cliques || g.impressoes, cor: "var(--acento)", extra: `${brl(g.gasto)}${g.custo_msg != null ? " · " + brl(g.custo_msg) + "/msg" : ""}${g.ctr != null ? " · CTR " + pct(g.ctr) : ""}` })), { vazioTxt: "Sem dados." })}`;
  const melhor = r.posicionamento.filter((g) => g.custo_msg != null).sort((x, y) => x.custo_msg - y.custo_msg)[0];
  const pior = r.posicionamento.filter((g) => g.custo_msg != null).sort((x, y) => y.custo_msg - x.custo_msg)[0];
  return `${bloco("Onde o anúncio aparece", r.posicionamento)}${bloco("Quem está respondendo", r.demografia)}
    ${melhor && pior && melhor !== pior ? `<div class="aviso aviso-info">Entre os posicionamentos, <b>${esc(melhor.nome)}</b> traz o contato mais barato (${esc(brl(melhor.custo_msg))}) e <b>${esc(pior.nome)}</b> o mais caro (${esc(brl(pior.custo_msg))}). Há sinais de que concentrar entrega no primeiro reduz o custo, mas o teste precisa ser feito para confirmar.</div>` : ""}
    <p class="sub">Estes recortes vêm da coleta automática da Meta (${esc(r.periodo.inicio || "")} a ${esc(r.periodo.fim || "")}) e não seguem o filtro de período da tela.</p>`;
}

// ---------------------------------------------------------------- seção completa
export function secaoAnalise(a) {
  const m = a.m;
  const grupo = (titulo, corpo) => `<section class="an-sec"><h2>${esc(titulo)}</h2>${corpo}</section>`;
  const perf = [m.ctr, m.ctr_todos, m.cpc, m.cpm, m.frequencia].filter(Boolean);
  const conv = [m.taxa_pagina, m.taxa_lead, m.conversao, m.cpl, m.custo_conversa, m.cpa].filter(Boolean);
  const fin = [m.roas, m.ticket, m.margem, m.lucro_por_lead].filter(Boolean);
  const todas = [...m.lista, ...m.video.lista];
  return cartao(
    `🧠 Análise inteligente <small>período selecionado · ${esc(a.conf.rotulo.toLowerCase())}</small>`,
    `<div class="analise">
      ${resumoHtml(a)}
      ${grupo("Diagnóstico por etapa", diagnosticoHtml(a))}
      ${grupo("Plano de ação", planoHtml(a))}
      <details class="an-mais"><summary>Ver a análise completa (funil, vídeo, público, conversão, financeiro, tendências e todas as métricas)</summary>
        ${grupo("Funil completo", funilHtml(a))}
        ${grupo("Análise do vídeo", videoHtml(a))}
        ${grupo("Performance de entrega e clique", metricasTabela(perf, a))}
        ${grupo("Público", publicoHtml(a))}
        ${grupo("Conversão", metricasTabela(conv, a))}
        ${grupo("Financeiro", metricasTabela(fin, a) + `<p class="sub">Faturamento, ROAS e CPA usam as vendas lançadas no CRM. Venda não lançada não aparece aqui — e é por isso que ausência de venda é mostrada como “indisponível”, não como zero.</p>`)}
        ${grupo("Tendências no período", tendenciaHtml(a))}
        ${grupo("Conjuntos e anúncios", filhosHtml(a))}
        ${a.recortes ? grupo("Posicionamento e demografia", recortesHtml(a)) : ""}
        ${grupo("Detalhamento das métricas", metricasTabela(todas, a) + baseHtml(a))}
      </details>
    </div>`
  );
}

function baseHtml(a) {
  const fontes = {};
  for (const k of Object.keys(a.bmk)) { const f = a.bmk[k].rotuloFonte; fontes[f] = (fontes[f] || 0) + 1; }
  return `<h3>De onde vêm as comparações</h3>
    <p class="sub">A análise não usa regra universal do tipo “CTR abaixo de 1% é ruim”. Cada métrica é comparada com a melhor base disponível, nesta ordem: histórico da sua conta, campanhas parecidas e, só em último caso, a referência padrão — que fica editável em <a href="#/config?aba=analise">Configurações → Análise</a>.</p>
    <ul class="an-sinais">${Object.keys(fontes).map((f) => `<li>${esc(f)}: ${fontes[f]} métrica(s)</li>`).join("")}</ul>
    <p class="sub">Amostra do período: ${inteiro(a.conf.amostra.impressoes)} impressões, ${inteiro(a.conf.amostra.cliques)} cliques, ${brl(a.conf.amostra.gasto)} investidos, ${inteiro(a.conf.amostra.dias)} dia(s) com entrega, ${inteiro(a.conf.amostra.leads)} lead(s), ${inteiro(a.conf.amostra.vendas)} venda(s).</p>`;
}
