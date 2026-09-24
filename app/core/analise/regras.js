// Camada 4 do motor: REGRAS DE DIAGNÓSTICO.
// É aqui que o sistema "pensa como gestor de tráfego": nenhuma métrica é julgada sozinha,
// sempre no contexto da etapa anterior e da seguinte. Regras determinísticas, sem IA:
// mesmos números entram, mesmo diagnóstico sai.
import { pct, brl, dec, inteiro } from "../format.js?v=f9372346";
import { numeroOuNulo, temValor, razao } from "./metricas.js?v=f9372346";
import { classificar } from "./benchmarks.js?v=f9372346";
import { confiancaDe } from "./confianca.js?v=f9372346";

export const NIVEIS = { bom: ["🟢", "BOM", "verde"], medio: ["🟡", "MÉDIO", "amarelo"], ruim: ["🔴", "RUIM", "vermelho"], sem_dados: ["⚪", "DADOS INSUFICIENTES", "cinza"] };

// Formata o valor de uma métrica calculada conforme o tipo declarado nela.
export function valorTexto(mt) {
  if (!mt || mt.valor == null) return "—";
  const v = mt.valor;
  return mt.tipo === "money" ? brl(v) : mt.tipo === "pct" ? pct(v) : mt.tipo === "mult" ? dec(v, 2) + "x"
    : mt.tipo === "seg" ? dec(v, 1) + "s" : mt.tipo === "dec" ? dec(v, 2) : inteiro(v);
}
const cls = (valor, bm) => classificar(valor, bm).nivel;
// "a, b e c" — evita o "a e b e c" que aparece quando se junta tudo com "e".
export function listar(itens) {
  const v = (itens || []).filter(Boolean);
  if (!v.length) return "";
  if (v.length === 1) return v[0];
  return v.slice(0, -1).join(", ") + " e " + v[v.length - 1];
}
// Junta níveis de várias métricas da mesma etapa: o pior manda, mas ausência não vira nota.
function piorNivel(niveis) {
  const uteis = niveis.filter((n) => n && n !== "sem_dados");
  if (!uteis.length) return "sem_dados";
  if (uteis.includes("ruim")) return "ruim";
  if (uteis.includes("medio")) return "medio";
  return "bom";
}

// ---------------------------------------------------------------- saúde do público
export function saudePublico(m, bmk, conf, ctx = {}) {
  const freq = m.frequencia.valor, ctr = m.ctr.valor, cpm = m.cpm.valor, conv = m.conversao.valor;
  const alcance = numeroOuNulo(ctx.alcance), tamanho = numeroOuNulo(ctx.tamanho_publico);
  const cobertura = razao(alcance, tamanho);
  const nFreq = cls(freq, bmk.frequencia), nCtr = cls(ctr, bmk.ctr), nCpm = cls(cpm, bmk.cpm);
  const sinais = [];
  if (freq != null) sinais.push(`frequência ${dec(freq, 2)}`);
  if (cobertura != null) sinais.push(`${pct(cobertura)} do público já foi alcançado`);
  if (ctr != null) sinais.push(`CTR ${pct(ctr)}`);
  if (cpm != null) sinais.push(`CPM ${brl(cpm)}`);

  if (!conf.suficiente.publico) {
    return { estado: "dados_insuficientes", nivel: "sem_dados", titulo: "Dados insuficientes sobre o público", sinais, texto: `Com ${inteiro(conf.amostra.impressoes)} impressões e ${inteiro(conf.amostra.alcance)} pessoas alcançadas ainda não é possível dizer se o público está saudável.` };
  }
  if (freq != null && freq >= 4 && (nCtr === "ruim" || ctx.ctr_caindo)) {
    return { estado: "saturado", nivel: "ruim", titulo: "Público saturado", sinais, texto: `A mesma pessoa já viu o anúncio ${dec(freq, 1)} vezes e o CTR ${ctx.ctr_caindo ? "está caindo" : "está abaixo da base de comparação"}. Os dados indicam que o público já viu o que tinha para ver.` };
  }
  const desgastando = ctx.fadiga && ctx.fadiga.tem_fadiga && (ctx.fadiga.piorando || []).includes("frequencia");
  if ((freq != null && freq >= 2.8) || (cobertura != null && cobertura >= 0.6) || (desgastando && freq != null && freq >= 2)) {
    const motivo = freq != null && freq >= 2.8 ? `Frequência em ${dec(freq, 1)}` : cobertura != null && cobertura >= 0.6 ? `Já alcançou ${pct(cobertura)} do público` : `Frequência em ${dec(freq, 1)} e subindo dentro do período`;
    return { estado: "saturando", nivel: "medio", titulo: "Público começando a saturar", sinais, texto: `${motivo}${desgastando ? ", com os indicadores piorando do início para o fim do período" : ""}. Ainda funciona, mas a tendência é o custo subir. Vale preparar público novo ou criativo novo antes de piorar.` };
  }
  if (cobertura != null && cobertura >= 0.35 && tamanho != null && tamanho < 200000) {
    return { estado: "pequeno", nivel: "medio", titulo: "Público pequeno para o investimento", sinais, texto: `O público tem cerca de ${inteiro(tamanho)} pessoas e ${pct(cobertura)} já foram alcançadas. Com esse tamanho, a frequência sobe rápido se o orçamento aumentar.` };
  }
  if (tamanho != null && tamanho >= 3000000 && nCtr === "ruim" && (conv == null || cls(conv, bmk.conversao) === "ruim")) {
    return { estado: "muito_amplo", nivel: "medio", titulo: "Público provavelmente muito amplo", sinais, texto: `Público de cerca de ${inteiro(tamanho)} pessoas com CTR ${pct(ctr)} e conversão baixa. Há sinais de que o anúncio está sendo entregue para gente fora do perfil.` };
  }
  if (nCpm === "ruim" && nCtr !== "bom") {
    return { estado: "caro", nivel: "medio", titulo: "Público caro de alcançar", sinais, texto: `CPM ${brl(cpm)}, acima da base de comparação, sem CTR alto para compensar. Ou a disputa por esse público está cara, ou o criativo não está sendo bem recebido nele.` };
  }
  return { estado: "saudavel", nivel: "bom", titulo: "Público saudável", sinais, texto: `Frequência ${freq != null ? dec(freq, 1) : "—"} e custo de entrega dentro da base de comparação. Não há motivo nos dados para trocar de público agora.` };
}

// ---------------------------------------------------------------- fadiga do criativo
// Compara os primeiros dias com os últimos. Só acusa fadiga quando os dois blocos têm volume.
export function fadiga(inicio, fim, minImpressoes = 800) {
  if (!inicio || !fim || (inicio.impressions || 0) < minImpressoes || (fim.impressions || 0) < minImpressoes) {
    return { tem_fadiga: false, nivel: "sem_dados", sinais: [], texto: "Período curto ou com poucos dados para comparar o início com o fim." };
  }
  const v = (a, b) => (temValor(a) && temValor(b) && a > 0 ? (b - a) / a : null);
  const itens = [
    { chave: "ctr", rotulo: "CTR", de: inicio.ctr, para: fim.ctr, var: v(inicio.ctr, fim.ctr), piora: (x) => x <= -0.2, fmt: pct },
    { chave: "cpc", rotulo: "CPC", de: inicio.cpc, para: fim.cpc, var: v(inicio.cpc, fim.cpc), piora: (x) => x >= 0.2, fmt: brl },
    { chave: "cpm", rotulo: "CPM", de: inicio.cpm, para: fim.cpm, var: v(inicio.cpm, fim.cpm), piora: (x) => x >= 0.2, fmt: brl },
    { chave: "frequencia", rotulo: "Frequência", de: inicio.frequency, para: fim.frequency, var: v(inicio.frequency, fim.frequency), piora: (x) => x >= 0.25, fmt: (x) => dec(x, 2) },
    { chave: "conversoes", rotulo: "Conversões por dia", de: inicio.conv_dia, para: fim.conv_dia, var: v(inicio.conv_dia, fim.conv_dia), piora: (x) => x <= -0.3, fmt: (x) => dec(x, 2) },
  ].filter((i) => i.var != null);
  const piorando = itens.filter((i) => i.piora(i.var));
  const sinais = itens.map((i) => ({ ...i, ruim: i.piora(i.var), texto: `${i.rotulo}: ${i.fmt(i.de)} → ${i.fmt(i.para)} (${i.var > 0 ? "+" : ""}${pct(i.var)})` }));
  const tem = piorando.length >= 2;
  const rotulos = piorando.map((i) => i.rotulo);
  return {
    tem_fadiga: tem, nivel: tem ? (piorando.length >= 3 ? "ruim" : "medio") : "bom", sinais,
    piorando: piorando.map((i) => i.chave), rotulos, lista: listar(rotulos),
    texto: tem
      ? `Comparando o início com o fim do período, ${listar(rotulos)} pioraram juntos. Esse conjunto costuma indicar desgaste do criativo no público atual.`
      : "Os indicadores do fim do período estão parecidos com os do início: não há sinal de desgaste.",
  };
}

// ---------------------------------------------------------------- cartões por etapa
export function cartoesEtapa(m, bmk, conf, ctx = {}) {
  const V = m.video, s = conf.suficiente;
  // Vendas fora da conta: ou não há venda lançada neste escopo, ou a pessoa desligou o uso
  // de vendas na análise. Nos dois casos o texto precisa dizer isso, nunca omitir em silêncio.
  const semVendas = ctx.vendas_consideradas === false;
  // Registro parcial: o que foi lançado é piso, não retrato. Taxa de venda e CPA ficam fora
  // da nota, senão lançar uma venda de dez pioraria a avaliação do anúncio.
  const parcial = ctx.vendas_parciais === true;
  const cartoes = [];
  const add = (c) => cartoes.push({ ...c, ...(NIVEIS[c.nivel] ? { icone: NIVEIS[c.nivel][0], rotuloNivel: NIVEIS[c.nivel][1], cor: NIVEIS[c.nivel][2] } : {}) });

  // ATENÇÃO — os 3 primeiros segundos. Sem vídeo, não é medível: não inventamos nota.
  if (!V.tem_video) {
    add({ chave: "atencao", titulo: "Atenção", nivel: "sem_dados", chaveValor: "retencao_inicial", valor: null, valorTxt: "—", metricas: [], explicacao: "Este criativo não tem métricas de vídeo (é imagem, carrossel, ou a plataforma não informou). A atenção nos primeiros segundos não existe aqui; o sinal mais próximo é o CTR." });
  } else if (!s.video) {
    add({ chave: "atencao", titulo: "Atenção", nivel: "sem_dados", chaveValor: "retencao_inicial", valor: V.retencao_inicial.valor, valorTxt: valorTexto(V.retencao_inicial), metricas: [V.taxa_reproducao, V.retencao_inicial], explicacao: `Só ${inteiro(conf.amostra.video)} visualização(ões) de 3 segundos no período. Abaixo de ${inteiro(300)}, essa taxa oscila demais para dizer se o gancho funciona.` });
  } else {
    const c = classificar(V.retencao_inicial.valor, bmk.retencao_inicial);
    add({
      chave: "atencao", titulo: "Atenção", nivel: c.nivel, chaveValor: "retencao_inicial", rotuloValor: "passaram de 3s", valor: V.retencao_inicial.valor, valorTxt: valorTexto(V.retencao_inicial),
      metricas: [V.taxa_reproducao, V.retencao_inicial, V.retencao_inicial_plays], fonte: c.rotuloFonte,
      explicacao: `${pct(V.retencao_inicial.valor)} de quem viu o anúncio passou dos 3 segundos (assistiram 3s ÷ impressões), ${c.texto}. ${c.nivel === "bom" ? "O começo do vídeo está segurando quem passa." : c.nivel === "medio" ? "O começo segura parte das pessoas, mas há espaço para um gancho mais forte." : "A maioria vai embora antes dos 3 segundos: o problema está no começo do vídeo, não na oferta."}`,
    });
  }

  // RETENÇÃO — o que acontece depois que a pessoa ficou.
  if (!V.tem_video || !s.video) {
    add({ chave: "retencao", titulo: "Retenção", nivel: "sem_dados", chaveValor: "retencao_metade", valorTxt: "—", metricas: [], explicacao: V.tem_video ? "Volume de visualizações ainda baixo para ler a curva de retenção." : "Sem métricas de vídeo, não há curva de retenção para ler. Vale conferir se o criativo é vídeo e se a coleta trouxe esses números." });
  } else {
    const c = classificar(V.retencao_metade.valor, bmk.retencao_metade);
    const q = m.maior_queda_video;
    add({
      chave: "retencao", titulo: "Retenção", nivel: c.nivel, chaveValor: "retencao_metade", rotuloValor: "chegaram à metade", valor: V.retencao_metade.valor, valorTxt: valorTexto(V.retencao_metade),
      metricas: [V.retencao_metade, V.retencao_fim, V.taxa_thruplay, V.tempo_medio, V.parte_assistida], fonte: c.rotuloFonte,
      explicacao: `${V.retencao_metade.valor != null ? `${pct(V.retencao_metade.valor)} de quem passou dos 3 segundos chegou à metade (assistiram 50% ÷ assistiram 3s)` : "Retenção na metade indisponível"}${q ? `. A maior queda está em "${q.rotulo}": ${pct(q.perda)} das pessoas somem nesse trecho (${q.formula})` : ""}. ${c.nivel === "bom" ? "O conteúdo sustenta a atenção até o meio." : c.nivel === "medio" ? "Prende parte das pessoas; encurtar ou adiantar a informação principal tende a ajudar." : "As pessoas entram e abandonam cedo: o vídeo provavelmente demora para entregar o que prometeu."}`,
    });
  }

  // CLIQUE — atenção virou ação?
  {
    const cCtr = classificar(m.ctr.valor, bmk.ctr), cCpc = classificar(m.cpc.valor, bmk.cpc);
    const nivel = !s.clique ? "sem_dados" : piorNivel([cCtr.nivel, cCpc.nivel]);
    add({
      chave: "clique", titulo: "Clique", nivel, chaveValor: "ctr", rotuloValor: "CTR", valor: m.ctr.valor, valorTxt: valorTexto(m.ctr),
      metricas: [m.ctr, m.cpc, m.ctr_todos, m.taxa_pagina], fonte: cCtr.rotuloFonte,
      explicacao: !s.clique
        ? `Apenas ${inteiro(conf.amostra.cliques)} clique(s) no período: pouco para julgar CTR ou CPC.`
        : `CTR ${pct(m.ctr.valor)} (${m.ctr.formula}) e CPC ${brl(m.cpc.valor)}, ${cCtr.texto}. ${nivel === "bom" ? "Quem vê está clicando na proporção esperada." : nivel === "medio" ? "O clique acontece, mas abaixo do que a base de comparação mostra." : "Poucos cliques para o volume entregue: chamada, oferta ou público desalinhados."}`,
    });
  }

  // CONVERSÃO — clique virou conversa, conversa virou venda.
  {
    const cLead = classificar(m.taxa_lead.valor, bmk.taxa_lead), cConv = classificar(m.conversao.valor, bmk.conversao);
    const nivel = !s.conversao ? "sem_dados" : piorNivel(parcial ? [cLead.nivel] : [cLead.nivel, cConv.nivel]);
    add({
      chave: "conversao", titulo: "Conversão", nivel, chaveValor: "conversao", rotuloValor: "lead vira venda", valor: m.conversao.valor, valorTxt: valorTexto(m.conversao),
      metricas: [m.taxa_pagina, m.taxa_lead, m.conversao, m.cpl, m.custo_conversa, m.cpa], fonte: cConv.rotuloFonte,
      explicacao: !s.conversao
        ? `Com ${inteiro(conf.amostra.leads)} lead(s) e ${inteiro(conf.amostra.vendas)} venda(s) no período, as taxas de conversão ainda não são conclusivas.`
        : `${m.taxa_lead.valor != null ? `${pct(m.taxa_lead.valor)} dos cliques viraram contato` : "Taxa de contato indisponível"}${m.conversao.valor != null ? ` e ${parcial ? "pelo menos " : ""}${pct(m.conversao.valor)} dos leads viraram venda` : ""}. ${semVendas ? "As vendas deste escopo não estão lançadas no CRM, então a etapa é avaliada só até o contato: o que vem depois o sistema não tem como saber. " : parcial ? "Como nem toda venda é lançada, a taxa de venda aparece como piso e não entra na nota: a etapa é avaliada até o contato. " : ""}${nivel === "bom" ? "O pós-clique está funcionando." : nivel === "medio" ? "Parte do caminho depois do clique está se perdendo." : semVendas || parcial ? "Até o contato, a perda já é grande: destino, oferta ou público desalinhados." : "A perda maior está depois do clique: destino, oferta, preço ou atendimento."}`,
    });
  }

  // PÚBLICO
  {
    const sp = ctx.publico || saudePublico(m, bmk, conf, ctx);
    add({ chave: "publico", titulo: "Público", nivel: sp.nivel, chaveValor: "frequencia", rotuloValor: "frequência", valorTxt: m.frequencia.valor != null ? `freq. ${dec(m.frequencia.valor, 2)}` : "—", metricas: [m.frequencia, m.cpm], explicacao: `${sp.titulo}: ${sp.texto}`, estado: sp.estado });
  }

  // CUSTO — a métrica de custo que importa depende do objetivo da campanha.
  {
    const preferida = { vendas: "cpa", leads: "cpl", whatsapp: "custo_conversa", remarketing: "cpa", trafego: "cpc", engajamento: "cpm", reconhecimento: "cpm" }[ctx.objetivo] || "cpa";
    const ordem = (parcial ? [preferida === "cpa" ? "cpl" : preferida, "cpl", "custo_conversa", "cpc", "cpm"] : [preferida, "cpa", "cpl", "custo_conversa", "cpc", "cpm"]);
    const escolhida = ordem.map((k) => m[k]).find((x) => x && x.valor != null) || m[preferida] || m.cpm;
    const c = classificar(escolhida.valor, bmk[escolhida.chave]);
    const meta = ctx.metas && ctx.metas[escolhida.chave];
    const acimaDaMeta = temValor(meta) && escolhida.valor != null && escolhida.valor > Number(meta);
    // Custo por clique ou por resultado com meia dúzia de cliques é ruído, não custo alto.
    const semAmostraCusto = !s.entrega || (["cpc", "cpm"].includes(escolhida.chave) && !s.clique) || (["cpa", "cpl", "custo_conversa"].includes(escolhida.chave) && !s.conversao);
    add({
      chave: "custo", titulo: "Custo", nivel: c.nivel === "sem_dados" || semAmostraCusto ? "sem_dados" : acimaDaMeta ? "ruim" : c.nivel,
      chaveValor: escolhida.chave, rotuloValor: escolhida.rotulo.replace(/ \(.*\)$/, ""),
      valor: escolhida.valor, valorTxt: valorTexto(escolhida), metricas: [m.cpm, m.cpc, m.cpl, m.custo_conversa, m.cpa], fonte: c.rotuloFonte,
      explicacao: escolhida.valor == null
        ? `Ainda não há ${escolhida.rotulo.toLowerCase()} no período: sem resultado registrado, o custo por resultado não existe (e não é zero).`
        : semAmostraCusto
          ? `${escolhida.rotulo} em ${valorTexto(escolhida)} (${escolhida.formula}), mas com ${inteiro(conf.amostra.cliques)} clique(s) e ${inteiro(conf.amostra.impressoes)} impressões esse número ainda muda muito de um dia para o outro. Sem amostra, custo alto ou baixo não quer dizer nada.`
          : `${escolhida.rotulo} em ${valorTexto(escolhida)} (${escolhida.formula}), ${c.texto}${temValor(meta) ? `; a meta desta campanha é ${brl(Number(meta))}` : ""}. ${acimaDaMeta ? "Está acima da meta definida por você." : c.nivel === "bom" ? "Custo por resultado dentro do aceitável." : c.nivel === "medio" ? "Custo por resultado em zona de atenção." : "Custo por resultado alto para a base de comparação."}`,
    });
  }

  // FATURAMENTO — só faz sentido quando existe venda registrada.
  {
    const c = classificar(m.roas.valor, bmk.roas);
    const lucro = numeroOuNulo(ctx.lucro_liquido);
    const nivelBase = m.roas.valor == null ? "sem_dados" : !s.venda ? "sem_dados" : c.nivel;
    // Piso confirmado acima da régua é conclusão válida; abaixo dela, não é.
    const nivel = parcial ? (nivelBase === "bom" ? "bom" : "sem_dados") : nivelBase;
    add({
      chave: "faturamento", titulo: "Faturamento", nivel, chaveValor: "roas", rotuloValor: "ROAS", valor: m.roas.valor, valorTxt: valorTexto(m.roas),
      metricas: [m.roas, m.ticket, m.margem, m.lucro_por_lead], fonte: c.rotuloFonte,
      explicacao: semVendas
        ? "As vendas deste escopo não estão lançadas no CRM, então faturamento, ROAS e lucro ficam fora da nota. Não é que o anúncio não venda: é que o sistema não tem como saber. Enquanto isso, o CPL é o número que decide aqui."
        : parcial
          ? `Com as vendas lançadas até agora, este escopo já devolveu ${dec(m.roas.valor, 2)}x o investimento${ctx.lucro_liquido != null && ctx.lucro_liquido > 0 ? ` e ${brl(ctx.lucro_liquido)} de lucro` : ""}. Como nem toda venda é lançada, trate esse número como o mínimo confirmado: ele pode ser maior, nunca menor.${nivel === "bom" ? " Já é o bastante para dizer que o anúncio paga." : " Ainda abaixo da régua, mas com registro parcial isso não prova que o anúncio não paga — só que falta lançamento."}`
        : m.roas.valor == null
          ? "Nenhuma venda atribuída a este escopo no período. Sem venda, ROAS e CPA não existem — pode ser ausência de resultado ou venda ainda não lançada no CRM."
        : `ROAS ${dec(m.roas.valor, 2)}x (faturamento ÷ investimento)${lucro != null ? ` e ${lucro >= 0 ? "lucro" : "prejuízo"} de ${brl(Math.abs(lucro))} depois do investimento` : ""}, ${c.texto}.${!s.venda ? ` Com ${inteiro(conf.amostra.vendas)} venda(s), trate como sinal e não como conclusão.` : ""}`,
    });
  }

  // SATURAÇÃO — frequência + tendência do período.
  {
    const f = ctx.fadiga || { nivel: "sem_dados", texto: "Sem comparação entre início e fim do período." };
    const cFreq = classificar(m.frequencia.valor, bmk.frequencia);
    const nivel = !s.publico ? "sem_dados"
      : f.nivel === "sem_dados" ? (cFreq.nivel === "sem_dados" ? "sem_dados" : cFreq.nivel)
        : piorNivel([f.nivel, cFreq.nivel]);
    add({
      chave: "saturacao", titulo: "Saturação", nivel, chaveValor: "frequencia", rotuloValor: "frequência", valor: m.frequencia.valor, valorTxt: m.frequencia.valor != null ? dec(m.frequencia.valor, 2) : "—",
      metricas: [m.frequencia, m.cpm, m.ctr], explicacao: `${m.frequencia.valor != null ? `Frequência ${dec(m.frequencia.valor, 2)} (${m.frequencia.formula}). ` : ""}${f.texto}`,
      sinais: f.sinais || [],
    });
  }
  return cartoes;
}

// ---------------------------------------------------------------- padrões nomeados
// Cada padrão cruza pelo menos duas etapas: é o que separa "criativo ruim" de
// "criativo bom com problema depois do clique".
export const PADROES = [
  {
    id: "amostra_curta", nome: "Dados insuficientes", etapa: "amostra", prioridade: "alta", impacto: "alto",
    quando: (x) => x.conf.nivel === "insuficiente",
    diagnostico: (x) => `Com a amostra atual (${inteiro(x.conf.amostra.impressoes)} impressões, ${brl(x.conf.amostra.gasto)} investidos, ${inteiro(x.conf.amostra.dias)} dia(s)) não é possível dizer se esta campanha funciona.`,
    hipotese: () => "Qualquer variação vista aqui pode ser sorte, não desempenho.",
    acao: () => "Deixar rodar até atingir volume mínimo (cerca de 1.000 impressões e 30 cliques) antes de mexer. Não pausar por causa dos números atuais.",
    evidencias: (x) => x.conf.criterios.filter((c) => !c.ok).map((c) => `${c.rotulo}: ${c.dinheiro ? brl(c.valor) : inteiro(c.valor)} (mínimo ${c.dinheiro ? brl(c.minimo) : inteiro(c.minimo)})`),
  },
  {
    id: "vendas_nao_lancadas", nome: "Vendas não lançadas", etapa: "faturamento", prioridade: "media", impacto: "alto",
    quando: (x) => (x.ctx.vendas_consideradas === false || x.ctx.vendas_parciais === true) && x.ctx.modo_vendas !== "nunca" && ((x.b.leads || 0) >= 5 || (x.b.results || 0) >= 5),
    diagnostico: (x) => x.ctx.vendas_parciais
      ? `Este escopo gerou ${inteiro(x.b.leads || x.b.results)} contato(s) e ${inteiro(x.b.sales)} venda(s) lançada(s) — provavelmente menos do que as que aconteceram.`
      : `Este escopo gerou ${inteiro(x.b.leads || x.b.results)} contato(s) no período e nenhuma venda foi lançada no CRM.`,
    hipotese: (x) => x.ctx.vendas_parciais
      ? "Com registro parcial, faturamento e ROAS valem como piso, mas taxa de venda e CPA ficam distorcidos e saem da nota."
      : "Sem as vendas registradas não dá para calcular CPA, ROAS nem lucro — a análise para no custo por lead, que é só metade da história.",
    acao: () => "Lançar as vendas que vierem desses leads, nem que seja pelo botão de venda na ficha do lead ou na conversa. A partir da primeira venda registrada, o sistema volta a medir CPA, ROAS e lucro deste escopo sozinho.",
    evidencias: (x) => [`Contatos no período: ${inteiro(x.b.leads || x.b.results)}`, `Investimento: ${brl(x.b.spend)}`, x.m.cpl.valor != null ? `CPL: ${brl(x.m.cpl.valor)}` : ""],
  },
  {
    id: "gancho_fraco", nome: "O gancho não segura", etapa: "atencao", prioridade: "alta", impacto: "alto",
    quando: (x) => x.n.atencao === "ruim",
    diagnostico: (x) => `Só ${pct(x.m.video.retencao_inicial.valor)} de quem viu o anúncio passou dos 3 segundos. A perda começa antes de qualquer oferta.`,
    hipotese: () => "Os primeiros segundos não dão motivo para continuar assistindo: abertura lenta, sem rosto, sem promessa clara ou sem movimento.",
    acao: () => "Refazer só os 3 primeiros segundos, mantendo o resto do vídeo. Testar abertura com o produto em uso, preço na tela ou pergunta direta.",
    evidencias: (x) => [`Passaram de 3s: ${pct(x.m.video.retencao_inicial.valor)} (${x.m.video.retencao_inicial.formula})`, x.m.video.taxa_reproducao.valor != null ? `Reproduções por impressão: ${pct(x.m.video.taxa_reproducao.valor)}` : ""],
  },
  {
    id: "cai_no_meio", nome: "Entra e abandona no meio", etapa: "retencao", prioridade: "media", impacto: "medio",
    quando: (x) => x.n.atencao === "bom" && x.n.retencao === "ruim",
    diagnostico: (x) => `O começo funciona (${pct(x.m.video.retencao_inicial.valor)} passam de 3s), mas ${x.m.video.retencao_metade.valor != null ? `só ${pct(x.m.video.retencao_metade.valor)} chegam à metade` : "a queda no meio é grande"}.`,
    hipotese: (x) => `O vídeo promete no início e demora para entregar${x.m.maior_queda_video ? `; a maior queda está em "${x.m.maior_queda_video.rotulo}"` : ""}.`,
    acao: () => "Encurtar o vídeo e adiantar a informação principal (preço, condição, prova) para antes do ponto de maior queda.",
    evidencias: (x) => [x.m.maior_queda_video ? `Maior queda: ${x.m.maior_queda_video.rotulo} — ${pct(x.m.maior_queda_video.perda)} saem (${x.m.maior_queda_video.formula})` : "", x.m.video.tempo_medio.valor != null ? `Tempo médio assistido: ${dec(x.m.video.tempo_medio.valor, 1)}s` : ""],
  },
  {
    id: "assiste_nao_clica", nome: "Prende atenção mas não induz ação", etapa: "clique", prioridade: "alta", impacto: "alto",
    quando: (x) => x.n.atencao === "bom" && (x.n.retencao === "bom" || x.n.retencao === "medio") && x.n.clique === "ruim",
    diagnostico: (x) => `As pessoas assistem (${pct(x.m.video.retencao_inicial.valor)} passam de 3s${x.m.video.retencao_metade.valor != null ? `, ${pct(x.m.video.retencao_metade.valor)} chegam à metade` : ""}) mas não clicam: CTR ${pct(x.m.ctr.valor)}.`,
    hipotese: () => "O criativo entretém e informa, porém não pede a ação com clareza, ou a oferta não dá motivo para agir agora.",
    acao: () => "Manter o vídeo e mexer na chamada: CTA falado e escrito no fim, oferta explícita (preço, condição, prazo) e texto do anúncio alinhado ao que o vídeo prometeu.",
    evidencias: (x) => [`CTR ${pct(x.m.ctr.valor)} (${x.m.ctr.formula})`, `Retenção na metade: ${pct(x.m.video.retencao_metade.valor)}`],
  },
  {
    id: "clica_nao_converte", nome: "Clica mas não converte", etapa: "conversao", prioridade: "urgente", impacto: "alto",
    quando: (x) => (x.n.clique === "bom" || x.n.clique === "medio") && x.n.conversao === "ruim",
    diagnostico: (x) => `O clique está acontecendo (CTR ${pct(x.m.ctr.valor)}), mas ${x.m.taxa_lead.valor != null ? `só ${pct(x.m.taxa_lead.valor)} dos cliques viram contato` : "o contato não acontece na proporção esperada"}${x.m.conversao.valor != null ? ` e ${pct(x.m.conversao.valor)} dos leads viram venda` : ""}.`,
    hipotese: () => "A perda está depois do clique. O criativo provavelmente não é o principal problema: olhar destino do link, tempo de resposta no WhatsApp, oferta e preço.",
    acao: () => "Conferir o destino (link, mensagem automática, página), o tempo até o primeiro atendimento e se a oferta prometida no anúncio é a mesma que a pessoa encontra.",
    evidencias: (x) => [`CTR ${pct(x.m.ctr.valor)}`, x.m.taxa_pagina.valor != null ? `Cliques que chegaram na página: ${pct(x.m.taxa_pagina.valor)}` : "", x.m.taxa_lead.valor != null ? `Cliques que viraram contato: ${pct(x.m.taxa_lead.valor)}` : "", x.ctx.sla_texto || ""],
  },
  {
    id: "leads_sem_venda", nome: "Muitos leads e poucas vendas", etapa: "conversao", prioridade: "urgente", impacto: "alto",
    quando: (x) => x.ctx.vendas_consideradas !== false && x.ctx.vendas_parciais !== true && (x.b.leads || 0) >= 10 && x.m.conversao.valor != null && x.m.conversao.valor < 0.08 && x.n.clique !== "ruim",
    diagnostico: (x) => `${inteiro(x.b.leads)} leads no período e ${inteiro(x.b.sales)} venda(s): conversão de ${pct(x.m.conversao.valor)}.`,
    hipotese: () => "O anúncio está trazendo volume, mas o filtro ou o fechamento não acompanham: leads fora do perfil, atendimento lento ou objeção de preço não tratada.",
    acao: () => "Revisar qualificação e atendimento antes de mexer no criativo: tempo de primeira resposta, motivo de perda mais frequente e clareza de preço no anúncio.",
    evidencias: (x) => [`Conversão ${pct(x.m.conversao.valor)} (${x.m.conversao.formula})`, x.ctx.sla_texto || "", x.ctx.perda_texto || ""],
  },
  {
    id: "fadiga", nome: "Fadiga do criativo", etapa: "saturacao", prioridade: "alta", impacto: "medio",
    quando: (x) => !!(x.ctx.fadiga && x.ctx.fadiga.tem_fadiga),
    diagnostico: (x) => `Do início para o fim do período, ${x.ctx.fadiga.lista || listar(x.ctx.fadiga.rotulos)} pioraram juntos.`,
    hipotese: () => "O público atual já viu este criativo vezes suficientes para parar de reagir.",
    acao: () => "Subir criativo novo para o mesmo público, ou ampliar o público mantendo o criativo. Trocar os dois ao mesmo tempo impede saber o que resolveu.",
    evidencias: (x) => (x.ctx.fadiga.sinais || []).filter((s) => s.ruim).map((s) => s.texto),
  },
  {
    id: "publico_saturado", nome: "Público saturado", etapa: "publico", prioridade: "alta", impacto: "medio",
    quando: (x) => x.ctx.publico && ["saturado", "saturando"].includes(x.ctx.publico.estado),
    diagnostico: (x) => x.ctx.publico.texto,
    hipotese: () => "A frequência alta faz o custo subir sem ganho de resultado.",
    acao: () => "Ampliar o público ou trocar por um semelhante, mantendo o criativo que já funciona.",
    evidencias: (x) => x.ctx.publico.sinais || [],
  },
  {
    id: "cpm_alto_roas_bom", nome: "Caro de alcançar, mas rentável", etapa: "custo", prioridade: "baixa", impacto: "baixo",
    quando: (x) => x.n.custo !== "bom" && x.m.roas.valor != null && x.n.faturamento === "bom",
    diagnostico: (x) => `O custo de entrega está acima da base de comparação, mas o ROAS é ${dec(x.m.roas.valor, 2)}x.`,
    hipotese: () => "Público caro que compra. Custo alto isolado não é problema quando o retorno paga.",
    acao: () => "Não mexer por causa do CPM/CPC. Acompanhar o ROAS: ele é o número que decide aqui.",
    evidencias: (x) => [`ROAS ${dec(x.m.roas.valor, 2)}x`, x.m.cpm.valor != null ? `CPM ${brl(x.m.cpm.valor)}` : "", x.m.cpa.valor != null ? `CPA ${brl(x.m.cpa.valor)}` : ""],
  },
  {
    id: "gasto_sem_resultado", nome: "Investimento sem resultado", etapa: "conversao", prioridade: "urgente", impacto: "alto",
    quando: (x) => x.conf.nivel !== "insuficiente" && (x.b.spend || 0) >= 100 && !(x.b.leads || 0) && !(x.b.results || 0) && !(x.b.conversations || 0) && ["vendas", "leads", "whatsapp", "remarketing"].includes(x.ctx.objetivo),
    diagnostico: (x) => `${brl(x.b.spend)} investidos com amostra suficiente e nenhum lead ou venda registrado.`,
    hipotese: () => "Ou a oferta não tem demanda no público escolhido, ou os resultados estão acontecendo e não sendo registrados no CRM.",
    acao: () => "Conferir primeiro se leads e vendas estão sendo lançados. Confirmada a ausência, pausar e revisar oferta e público antes de investir mais.",
    evidencias: (x) => [`Investimento ${brl(x.b.spend)}`, `Cliques ${inteiro(x.conf.amostra.cliques)}`, "Leads e vendas registrados: 0"],
  },
  {
    id: "escalar", nome: "Pronta para escalar", etapa: "faturamento", prioridade: "alta", impacto: "alto",
    quando: (x) => x.conf.nivel !== "insuficiente" && x.n.faturamento === "bom" && x.n.custo !== "ruim" && !(x.ctx.fadiga && x.ctx.fadiga.tem_fadiga) && !(x.ctx.publico && x.ctx.publico.estado === "saturado"),
    diagnostico: (x) => `ROAS ${dec(x.m.roas.valor, 2)}x com custo por resultado dentro da base e sem sinal de saturação.`,
    hipotese: () => "Há espaço para mais investimento antes de a frequência estragar o resultado.",
    acao: () => "Aumentar o orçamento em torno de 20% e reavaliar em 3 dias. Subir demais de uma vez reinicia o aprendizado e costuma piorar o custo.",
    evidencias: (x) => [`ROAS ${dec(x.m.roas.valor, 2)}x`, x.m.cpa.valor != null ? `CPA ${brl(x.m.cpa.valor)}` : "", x.m.frequencia.valor != null ? `Frequência ${dec(x.m.frequencia.valor, 2)}` : ""],
  },
];

export function diagnosticos(m, bmk, conf, cartoes, ctx = {}) {
  const n = {};
  for (const c of cartoes) n[c.chave] = c.nivel;
  const x = { m, bmk, conf, cartoes, n, ctx, b: ctx.bruto || {} };
  const achados = [];
  for (const p of PADROES) {
    let bate = false;
    try { bate = !!p.quando(x); } catch { bate = false; }
    if (!bate) continue;
    achados.push({
      id: p.id, nome: p.nome, etapa: p.etapa, prioridade: p.prioridade, impacto: p.impacto,
      problema: p.diagnostico(x), hipotese: p.hipotese(x), acao: p.acao(x),
      evidencias: (p.evidencias(x) || []).filter(Boolean),
      confianca: confiancaDe(p.etapa, conf),
    });
  }
  return achados;
}
