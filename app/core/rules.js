// Classificações automáticas, alertas, oportunidades, central de decisões e textos do analista.
// Nada aqui altera dados: só lê e sugere.
import { db } from "./db.js?v=302fb635";
import { kpis, comparar, porEntidade, resumoProduto, mediaCampanhas, avaliar, serieDiaria, leadsNoPeriodo, atendimento, filaDeAtendimento, pacing, minutosEsperando } from "./metrics.js?v=302fb635";
import { intervalo, anterior } from "./periods.js?v=302fb635";
import { brl, pct, mult, dec, inteiro, hoje, somaDias, diasEntre, dataBR, variacao, num } from "./format.js?v=302fb635";

const cfg = () => db.settings();

// ---------------------------------------------------------------- produtos
export const CLASSES_PRODUTO = {
  campeao: ["Produto campeão", "verde"], potencial: ["Produto com potencial", "ciano"], normal: ["Produto normal", "cinza"],
  baixa: ["Produto com baixa saída", "amarelo"], parado: ["Produto parado", "vermelho"], estoque_critico: ["Estoque crítico", "vermelho"],
};
export function classificarProduto(p, r = resumoProduto(p)) {
  const flags = [];
  const diasParado = num(cfg().dias_produto_parado) || 15;
  if (num(p.stock_min) > 0 && num(p.stock) <= num(p.stock_min)) flags.push("estoque_critico");
  if (r.estoque_dias != null && r.estoque_dias > 90 && num(p.stock) > 0) flags.push("estoque_alto");
  if (num(p.stock) > 0 && r.qtd30 === 0) flags.push("estoque_alto");
  if (r.dias_sem_venda == null || r.dias_sem_venda >= diasParado) flags.push("parado");
  if (r.qtd7 > r.qtd7ant && r.qtd7 >= 2) flags.push("crescendo");
  if (r.qtd7 >= 2 && r.campanhas_ativas === 0) flags.push("precisa_campanha");
  if (r.qtd30 >= 3 && (r.margem || 0) >= 0.3) flags.push("margem_alta");
  let classe;
  const todos = db.all("products").map((x) => resumoProduto(x).qtd30).sort((a, b) => b - a);
  const top = todos[Math.max(0, Math.floor(todos.length * 0.25) - 1)] || 0;
  if (flags.includes("estoque_critico")) classe = "estoque_critico";
  else if (flags.includes("parado")) classe = "parado";
  else if (r.qtd30 >= Math.max(3, top) && r.qtd30 > 0) classe = "campeao";
  else if (flags.includes("crescendo")) classe = "potencial";
  else if (r.qtd30 <= 1) classe = "baixa";
  else classe = "normal";
  return { classe, rotulo: CLASSES_PRODUTO[classe][0], cor: CLASSES_PRODUTO[classe][1], flags, resumo: r };
}

// ---------------------------------------------------------------- criativos
export const CLASSES_CRIATIVO = {
  campeao: ["Criativo campeão", "verde"], bom: ["Bom desempenho", "ciano"], teste: ["Em teste", "cinza"], saturando: ["Saturando", "amarelo"], baixo: ["Baixo desempenho", "amarelo"], pausar: ["Pausar", "vermelho"],
};
export function classificarCriativo(c, iv, media) {
  const k = kpis(iv, { creative_id: c.id });
  const kAnt = kpis(anterior(iv), { creative_id: c.id });
  const limiteFreq = num(cfg().limite_freq) || 3, gastoSemVenda = num(cfg().gasto_sem_venda) || 100;
  const roasMeta = db.goal("roas_min", 3);
  const idade = c.published_at ? diasEntre(c.published_at, hoje()) : (c.created_at ? diasEntre(c.created_at.slice(0, 10), hoje()) : 99);
  const flags = [];
  let classe;
  if (k.spend >= gastoSemVenda && k.sales === 0 && k.leads_base === 0) classe = "pausar";
  else if ((k.frequency && k.frequency >= limiteFreq) || (k.ctr != null && kAnt.ctr && k.ctr < kAnt.ctr * 0.75 && kAnt.impressions > 500)) { classe = "saturando"; if (k.frequency >= limiteFreq) flags.push("frequencia"); else flags.push("ctr_caindo"); }
  else if (k.spend < 30 || idade < 4) classe = "teste";
  else if (k.sales >= 2 && (k.roas || 0) >= roasMeta) classe = "campeao";
  else if ((k.sales >= 1 && (k.roas || 0) >= roasMeta * 0.7) || (media.ctr && k.ctr >= media.ctr * 1.2 && k.leads_base > 0)) classe = "bom";
  else if ((media.ctr && k.ctr != null && k.ctr < media.ctr * 0.6) || (media.cpa && k.cpa && k.cpa > media.cpa * 1.3)) classe = "baixo";
  else classe = k.sales || k.leads_base ? "bom" : "baixo";
  return { classe, rotulo: CLASSES_CRIATIVO[classe][0], cor: CLASSES_CRIATIVO[classe][1], k, kAnt, flags };
}

// Separa "o gancho não segura" de "a oferta não converte": os dois parecem
// o mesmo criativo ruim no relatório, mas pedem correções opostas.
export function diagnosticoVideo(k) {
  if (!k || !k.tem_video || k.impressions < 500) return null;
  const gancho = k.hook_rate, retencao = k.retencao_50, converteu = (k.sales || 0) > 0 || (k.leads_base || 0) > 0;
  if (gancho != null && gancho < 0.15) return { prioridade: "media", titulo: "gancho fraco", texto: `Só ${pct(gancho)} de quem viu passou dos 3 segundos. O problema está no começo do vídeo, não na oferta.`, acao: "Trocar gancho" };
  if (gancho != null && gancho >= 0.25 && retencao != null && retencao >= 0.4 && !converteu && k.spend >= 30) return { prioridade: "media", titulo: "prende, mas não converte", texto: `O vídeo segura a atenção (${pct(gancho)} passam de 3s, ${pct(retencao)} chegam à metade), mas não gerou lead nem venda. O problema é a oferta ou a chamada.`, acao: "Revisar oferta" };
  if (retencao != null && retencao < 0.15 && gancho != null && gancho >= 0.2) return { prioridade: "baixa", titulo: "cai no meio", texto: `As pessoas entram (${pct(gancho)} passam de 3s) mas abandonam cedo: só ${pct(retencao)} chegam à metade. Vale encurtar.`, acao: "Encurtar vídeo" };
  return null;
}

// ---------------------------------------------------------------- campanhas
export function situacaoCampanha(c, iv, media) {
  const k = kpis(iv, { campaign_id: c.id }), kAnt = kpis(anterior(iv), { campaign_id: c.id });
  const gastoSemVenda = num(cfg().gasto_sem_venda) || 100, cpaAltaPct = (num(cfg().cpa_alta_pct) || 30) / 100;
  const roasMeta = db.goal("roas_min", 3), cpaMax = db.goal("cpa_max", 0), cplMax = db.goal("cpl_max", 0), ctrMin = db.goal("ctr_min", 0) / 100;
  const sinais = [];
  const objetivoVenda = ["vendas", "leads", "whatsapp", "remarketing"].includes(c.objective);
  if (c.status === "ativa" && k.spend >= gastoSemVenda && objetivoVenda && k.sales === 0 && k.leads_base === 0) sinais.push({ tipo: "ruim", prioridade: "urgente", texto: `gastou ${brl(k.spend)} sem gerar venda nem lead` });
  if (k.cpa && kAnt.cpa && k.cpa > kAnt.cpa * (1 + cpaAltaPct)) sinais.push({ tipo: "ruim", prioridade: "alta", texto: `CPA subiu ${pct(variacao(k.cpa, kAnt.cpa))} (${brl(kAnt.cpa)} → ${brl(k.cpa)})` });
  if (cpaMax && k.cpa && k.cpa > cpaMax) sinais.push({ tipo: "ruim", prioridade: "alta", texto: `CPA ${brl(k.cpa)} acima do máximo ${brl(cpaMax)}` });
  if (cplMax && k.cpl && k.cpl > cplMax && objetivoVenda) sinais.push({ tipo: "ruim", prioridade: "media", texto: `CPL ${brl(k.cpl)} acima do máximo ${brl(cplMax)}` });
  if (k.roas != null && k.roas < roasMeta && k.sales > 0) sinais.push({ tipo: "ruim", prioridade: "media", texto: `ROAS ${mult(k.roas)} abaixo da meta ${mult(roasMeta)}` });
  if (ctrMin && k.ctr != null && k.impressions > 1000 && k.ctr < ctrMin) sinais.push({ tipo: "ruim", prioridade: "media", texto: `CTR ${pct(k.ctr)} abaixo da meta ${pct(ctrMin)}` });
  if (k.frequency && k.frequency >= (num(cfg().limite_freq) || 3)) sinais.push({ tipo: "atencao", prioridade: "media", texto: `frequência ${dec(k.frequency, 1)}: público saturando` });
  if (k.sales >= 2 && k.roas != null && k.roas >= roasMeta * 1.3) sinais.push({ tipo: "boa", prioridade: "alta", texto: `ROAS ${mult(k.roas)}, acima da meta: candidata a escalar` });
  if (media.cpa && k.cpa && k.sales >= 2 && k.cpa <= media.cpa * 0.65) sinais.push({ tipo: "boa", prioridade: "alta", texto: `CPA ${brl(k.cpa)} é ${pct(1 - k.cpa / media.cpa)} menor que a média` });
  if (media.cpl && k.cpl && k.leads_base >= 5 && k.cpl <= media.cpl * 0.65 && !k.sales) sinais.push({ tipo: "boa", prioridade: "media", texto: `CPL ${brl(k.cpl)} bem abaixo da média (${brl(media.cpl)})` });
  const ruins = sinais.filter((s) => s.tipo === "ruim").length, boas = sinais.filter((s) => s.tipo === "boa").length;
  const situacao = ruins >= 2 ? "ruim" : ruins === 1 ? "atencao" : boas ? "boa" : "normal";
  return { k, kAnt, sinais, situacao };
}

// ---------------------------------------------------------------- alertas
export function alertas(iv) {
  const lista = [];
  const media = mediaCampanhas(iv);
  const h = hoje();
  const descartados = new Set(db.all("alerts").map((a) => a.key));
  const add = (key, prioridade, categoria, texto, link) => { if (!descartados.has(key)) lista.push({ key, prioridade, categoria, texto, link }); };
  for (const c of db.where("campaigns", (c) => c.status === "ativa")) {
    const s = situacaoCampanha(c, iv, media);
    for (const sn of s.sinais) add(`camp:${c.id}:${sn.texto.slice(0, 30)}`, sn.prioridade, sn.tipo === "boa" ? "Campanha boa" : "Campanha", `${c.name}: ${sn.texto}.`, `#/campanhas/${c.id}`);
  }
  for (const p of db.where("products", (p) => p.active !== false)) {
    const cl = classificarProduto(p);
    if (cl.flags.includes("estoque_critico")) add(`prod:${p.id}:estoque`, "alta", "Produto", `${p.name} com estoque baixo: ${inteiro(p.stock)} unidade(s), mínimo ${inteiro(p.stock_min)}.`, `#/produtos/${p.id}`);
    if (cl.flags.includes("parado") && cl.resumo.dias_sem_venda != null && cl.resumo.dias_sem_venda < 999) add(`prod:${p.id}:parado`, "media", "Produto", `${p.name} está há ${cl.resumo.dias_sem_venda} dia(s) sem vendas.`, `#/produtos/${p.id}`);
    if (cl.flags.includes("crescendo")) add(`prod:${p.id}:crescendo`, "media", "Produto bom", `${p.name} aumentou as vendas nos últimos 7 dias (${cl.resumo.qtd7} × ${cl.resumo.qtd7ant} antes).`, `#/produtos/${p.id}`);
  }
  for (const c of db.all("creatives")) {
    const cl = classificarCriativo(c, iv, media);
    if (cl.classe === "saturando") add(`cr:${c.id}:sat`, "media", "Criativo", `${c.name} apresenta sinais de saturação (${cl.flags.includes("frequencia") ? "frequência " + dec(cl.k.frequency, 1) : "CTR caindo: " + pct(cl.kAnt.ctr) + " → " + pct(cl.k.ctr)}).`, `#/criativos/${c.id}`);
    if (cl.classe === "pausar") add(`cr:${c.id}:pausar`, "alta", "Criativo", `${c.name} gastou ${brl(cl.k.spend)} sem lead nem venda: avaliar pausar.`, `#/criativos/${c.id}`);
  }
  // Atendimento: o lead esperando é a perda mais cara e mais fácil de evitar.
  const fila = filaDeAtendimento();
  if (fila.foraSla.length) {
    const pior = fila.foraSla[0];
    add(`sla:${h}:${fila.foraSla.length}`, "urgente", "Atendimento", `${fila.foraSla.length} lead(s) esperando há mais de ${fila.sla} min sem nenhum contato. O mais antigo: ${pior.lead.name}, há ${formatoMinutos(pior.minutos)}.`, "#/leads");
  } else if (fila.esperando.length) {
    add(`sla:fila:${h}:${fila.esperando.length}`, "alta", "Atendimento", `${fila.esperando.length} lead(s) aguardando o primeiro contato.`, "#/leads");
  }
  const at = atendimento(iv);
  if (at.total >= 5 && at.taxaContato != null && at.taxaContato < 0.8) add(`sla:taxa:${h}`, "alta", "Atendimento", `Só ${pct(at.taxaContato)} dos leads do período foram atendidos: ${at.naoAtendidos} ficaram sem nenhum contato.`, "#/dashboard");
  if (at.medidos >= 5 && at.tempoMedio != null && at.tempoMedio > at.sla) add(`sla:tempo:${h}`, "media", "Atendimento", `Tempo médio até o primeiro atendimento: ${formatoMinutos(at.tempoMedio)}, acima da meta de ${at.sla} min.`, "#/dashboard");
  const semResposta = db.where("leads", (l) => l.stage === "novo" && diasEntre(l.entered_at, h) >= 1);
  if (semResposta.length) add(`leads:novos:${h}`, semResposta.length >= 3 ? "urgente" : "alta", "Leads", `${semResposta.length} lead(s) novo(s) sem resposta há mais de 1 dia.`, "#/leads");
  const followups = db.where("leads", (l) => l.next_followup && l.next_followup <= h && !["venda", "perdido"].includes(l.stage));
  if (followups.length) add(`leads:followup:${h}`, "alta", "Leads", `${followups.length} lead(s) com follow-up para hoje ou atrasado.`, "#/leads");
  const atrasadas = db.where("tasks", (t) => t.due_date && t.due_date < h && t.status !== "finalizado");
  for (const t of atrasadas) add(`task:${t.id}:atraso`, t.priority === "urgente" ? "urgente" : "alta", "Tarefa", `Tarefa atrasada: ${t.title} (venceu ${dataBR(t.due_date)}).`, "#/tarefas");
  for (const e of alertasCalendario()) add(`cal:${e.id}:${e.faltam}`, e.faltam <= 3 ? "alta" : e.faltam <= 7 ? "media" : "baixa", "Calendário", `${e.title} em ${e.faltam} dia(s) (${dataBR(e.date)}).`, "#/calendario");
  const pc = pacing(intervalo({ tipo: "mes" }));
  if (pc.meta) {
    if (pc.gasto > pc.meta) add(`meta:inv:${h.slice(0, 7)}`, "alta", "Meta", `Investimento do mês (${brl(pc.gasto)}) passou do limite de ${brl(pc.meta)}.`, "#/financeiro");
    else if (pc.projecao > pc.meta * 1.08) add(`meta:ritmo:${h}`, "media", "Meta", `No ritmo atual o mês fecha em ${brl(pc.projecao)}, acima do limite de ${brl(pc.meta)}. Diário sugerido: ${brl(pc.diarioSugerido)}.`, "#/dashboard");
    else if (pc.projecao < pc.meta * 0.8 && pc.decorridos >= 7) add(`meta:sobra:${h}`, "baixa", "Meta", `No ritmo atual sobram ${brl(pc.meta - pc.projecao)} do orçamento do mês. Dá para escalar o que está indo bem.`, "#/decisoes");
  }
  const ordem = { urgente: 0, alta: 1, media: 2, baixa: 3 };
  return lista.sort((a, b) => ordem[a.prioridade] - ordem[b.prioridade]);
}

export function alertasCalendario() {
  const h = hoje(), out = [];
  for (const e of db.all("calendar_events")) {
    const faltam = diasEntre(h, e.date);
    const avisos = Array.isArray(e.alert_days) && e.alert_days.length ? e.alert_days.map(Number) : [30, 15, 7, 3];
    if (faltam >= 0 && faltam <= Math.max(...avisos) && (avisos.includes(faltam) || faltam <= 3 || e.type !== "comemorativa")) out.push({ ...e, faltam });
  }
  return out.sort((a, b) => a.faltam - b.faltam);
}

// ---------------------------------------------------------------- oportunidades
export function oportunidades(iv) {
  const out = [];
  const media = mediaCampanhas(iv);
  for (const p of db.where("products", (p) => p.active !== false)) {
    const cl = classificarProduto(p), r = cl.resumo;
    if (cl.flags.includes("estoque_alto") && r.qtd30 <= 2) out.push({ tipo: "produto", prioridade: "alta", titulo: `${p.name} está com estoque alto e poucas vendas`, texto: `Estoque de ${inteiro(p.stock)} unidade(s) e ${r.qtd30} venda(s) em 30 dias. Criar campanha promocional.`, acao: "Criar campanha promocional", link: `#/produtos/${p.id}` });
    if (cl.flags.includes("crescendo")) out.push({ tipo: "produto", prioridade: "alta", titulo: `${p.name} aumentou as vendas nos últimos 7 dias`, texto: `${r.qtd7} venda(s) contra ${r.qtd7ant} na semana anterior. Considere escalar a campanha.`, acao: "Escalar campanha", link: `#/produtos/${p.id}` });
    if (cl.flags.includes("margem_alta") && r.roas30 && r.roas30 >= db.goal("roas_min", 3)) out.push({ tipo: "produto", prioridade: "media", titulo: `${p.name} tem margem alta e bom ROAS`, texto: `Margem de ${pct(r.margem)} e ROAS ${mult(r.roas30)} nos últimos 30 dias. Vale investir mais.`, acao: "Aumentar orçamento", link: `#/produtos/${p.id}` });
    if (cl.flags.includes("precisa_campanha")) out.push({ tipo: "produto", prioridade: "media", titulo: `${p.name} vende e não tem campanha ativa`, texto: `${r.qtd7} venda(s) na semana sem nenhuma campanha ativa. Criar campanha para acelerar.`, acao: "Criar campanha", link: `#/campanhas` });
    if (cl.flags.includes("parado") && r.dias_sem_venda != null && r.dias_sem_venda < 999 && num(p.stock) > 0) out.push({ tipo: "produto", prioridade: "media", titulo: `${p.name} está há ${r.dias_sem_venda} dias sem vendas`, texto: `Avaliar promoção, novo criativo ou remarketing.`, acao: "Planejar promoção", link: `#/produtos/${p.id}` });
  }
  for (const c of db.where("campaigns", (c) => c.status === "ativa")) {
    const s = situacaoCampanha(c, iv, media);
    for (const sn of s.sinais) out.push({ tipo: "campanha", prioridade: sn.prioridade, titulo: `${c.name}: ${sn.tipo === "boa" ? "oportunidade" : "atenção"}`, texto: sn.texto[0].toUpperCase() + sn.texto.slice(1) + ".", acao: sn.tipo === "boa" ? "Escalar" : "Revisar", link: `#/campanhas/${c.id}` });
  }
  for (const cr of db.all("creatives")) {
    const cl = classificarCriativo(cr, iv, media);
    if (cl.classe === "saturando" && cl.flags.includes("ctr_caindo")) out.push({ tipo: "criativo", prioridade: "media", titulo: `${cr.name} apresenta queda de CTR`, texto: `De ${pct(cl.kAnt.ctr)} para ${pct(cl.k.ctr)}. Preparar criativo novo.`, acao: "Solicitar criativo", link: `#/criativos/${cr.id}` });
    if (cl.classe === "campeao") out.push({ tipo: "criativo", prioridade: "media", titulo: `${cr.name} é criativo campeão`, texto: `${cl.k.sales} venda(s) e ROAS ${mult(cl.k.roas)}. Usar em mais conjuntos/campanhas.`, acao: "Reaproveitar", link: `#/criativos/${cr.id}` });
    const d = diagnosticoVideo(cl.k);
    if (d) out.push({ tipo: "criativo", prioridade: d.prioridade, titulo: `${cr.name}: ${d.titulo}`, texto: d.texto, acao: d.acao, link: `#/criativos/${cr.id}` });
  }
  const ordem = { urgente: 0, alta: 1, media: 2, baixa: 3 };
  return out.sort((a, b) => ordem[a.prioridade] - ordem[b.prioridade]);
}

// ---------------------------------------------------------------- central de decisões
export function centralDecisoes(iv) {
  const media = mediaCampanhas(iv), h = hoje();
  const camps = db.where("campaigns", (c) => c.status === "ativa").map((c) => ({ c, s: situacaoCampanha(c, iv, media) }));
  const prods = db.where("products", (p) => p.active !== false).map((p) => ({ p, cl: classificarProduto(p) }));
  const crs = db.all("creatives").map((c) => ({ c, cl: classificarCriativo(c, iv, media) }));
  const item = (prioridade, titulo, texto, link) => ({ prioridade, titulo, texto, link });
  const secoes = [
    { titulo: "Campanhas ruins", itens: camps.filter((x) => x.s.situacao === "ruim" || x.s.situacao === "atencao").map((x) => item(x.s.sinais[0].prioridade, x.c.name, x.s.sinais.filter((s) => s.tipo !== "boa").map((s) => s.texto).join("; "), `#/campanhas/${x.c.id}`)) },
    { titulo: "Campanhas boas", itens: camps.filter((x) => x.s.situacao === "boa").map((x) => item("media", x.c.name, x.s.sinais.filter((s) => s.tipo === "boa").map((s) => s.texto).join("; "), `#/campanhas/${x.c.id}`)) },
    { titulo: "Campanhas que podem ser escaladas", itens: camps.filter((x) => x.s.sinais.some((s) => s.tipo === "boa" && s.prioridade === "alta")).map((x) => item("alta", x.c.name, `Orçamento diário atual ${brl(x.c.daily_budget)}. Aumentar gradualmente (10–20% por vez).`, `#/campanhas/${x.c.id}`)) },
    { titulo: "Campanhas que precisam ser pausadas", itens: camps.filter((x) => x.s.sinais.some((s) => s.prioridade === "urgente")).map((x) => item("urgente", x.c.name, x.s.sinais.find((s) => s.prioridade === "urgente").texto, `#/campanhas/${x.c.id}`)) },
    { titulo: "Produtos parados", itens: prods.filter((x) => x.cl.classe === "parado" && x.cl.resumo.dias_sem_venda != null && x.cl.resumo.dias_sem_venda < 999).map((x) => item("media", x.p.name, `${x.cl.resumo.dias_sem_venda} dias sem venda · estoque ${inteiro(x.p.stock)}`, `#/produtos/${x.p.id}`)) },
    { titulo: "Produtos vendendo muito", itens: prods.filter((x) => x.cl.classe === "campeao" || x.cl.classe === "potencial").map((x) => item("media", x.p.name, `${x.cl.resumo.qtd7} em 7 dias · ${x.cl.resumo.qtd30} em 30 dias · ${x.cl.rotulo}`, `#/produtos/${x.p.id}`)) },
    { titulo: "Estoque crítico", itens: prods.filter((x) => x.cl.flags.includes("estoque_critico")).map((x) => item("alta", x.p.name, `${inteiro(x.p.stock)} unidade(s), mínimo ${inteiro(x.p.stock_min)}`, `#/produtos/${x.p.id}`)) },
    { titulo: "Criativos saturados", itens: crs.filter((x) => x.cl.classe === "saturando" || x.cl.classe === "pausar").map((x) => item(x.cl.classe === "pausar" ? "alta" : "media", x.c.name, x.cl.rotulo, `#/criativos/${x.c.id}`)) },
    { titulo: "Leads sem resposta", itens: db.where("leads", (l) => l.stage === "novo").map((l) => item(diasEntre(l.entered_at, h) >= 1 ? "urgente" : "alta", l.name, `entrou ${dataBR(l.entered_at)}`, `#/leads`)) },
    { titulo: "Leads aguardando follow-up", itens: db.where("leads", (l) => l.next_followup && l.next_followup <= h && !["venda", "perdido"].includes(l.stage)).map((l) => item(l.next_followup < h ? "alta" : "media", l.name, `follow-up ${dataBR(l.next_followup)}`, `#/leads`)) },
    { titulo: "Datas importantes próximas", itens: alertasCalendario().map((e) => item(e.faltam <= 3 ? "alta" : e.faltam <= 7 ? "media" : "baixa", e.title, `em ${e.faltam} dia(s), ${dataBR(e.date)}`, "#/calendario")) },
    { titulo: "Tarefas atrasadas", itens: db.where("tasks", (t) => t.due_date && t.due_date < h && t.status !== "finalizado").map((t) => item(t.priority === "urgente" ? "urgente" : "alta", t.title, `venceu ${dataBR(t.due_date)}`, "#/tarefas")) },
  ];
  const ordem = { urgente: 0, alta: 1, media: 2, baixa: 3 };
  for (const s of secoes) s.itens.sort((a, b) => ordem[a.prioridade] - ordem[b.prioridade]);
  return secoes;
}

// ---------------------------------------------------------------- analista (textos)
export function analise(iv) {
  const { atual: a, anterior: b, variacao: v } = comparar(iv);
  const media = mediaCampanhas(iv);
  const paras = [];
  const p = (t) => paras.push(t);
  const dir = (x) => x > 0 ? "aumentou" : "caiu";
  if (a.spend || b.spend) {
    let t = `No período, o investimento ${v.spend != null ? dir(v.spend) + " " + pct(Math.abs(v.spend)) : "foi de " + brl(a.spend)}`;
    if (v.revenue != null) t += `, e o faturamento ${dir(v.revenue)} ${pct(Math.abs(v.revenue))}`;
    else if (a.revenue) t += `, com faturamento de ${brl(a.revenue)}`;
    if (a.roas != null && b.roas != null) t += `. O ROAS ${a.roas >= b.roas ? "melhorou" : "piorou"} de ${mult(b.roas)} para ${mult(a.roas)}`;
    else if (a.roas != null) t += `. O ROAS ficou em ${mult(a.roas)}`;
    p(t + ".");
  } else p("Ainda não há investimento registrado no período. Lance métricas nas campanhas, importe o relatório do Gerenciador de Anúncios ou aguarde a coleta automática da Meta.");
  if (a.leads || a.sales) p(`Entraram ${inteiro(a.leads)} lead(s) e ${inteiro(a.sales)} venda(s)${a.conversion != null ? `, conversão de ${pct(a.conversion)}` : ""}${a.cpl ? `, CPL ${brl(a.cpl)}` : ""}${a.cpa ? `, CPA ${brl(a.cpa)}` : ""}${a.ticket ? ` e ticket médio ${brl(a.ticket)}` : ""}.`);
  if (a.net_profit != null && (a.revenue || a.spend)) p(`Lucro bruto de ${brl(a.gross_profit)}; descontando os anúncios${a.extra_costs ? " e outros custos" : ""}, ${a.net_profit >= 0 ? "sobraram" : "faltaram"} ${brl(Math.abs(a.net_profit))}${a.roi != null ? ` (ROI ${pct(a.roi)})` : ""}.`);
  const camps = porEntidade(iv, "campaign").filter((x) => x.k.spend > 0);
  for (const x of camps) {
    if (media.cpa && x.k.cpa && x.k.sales >= 2 && x.k.cpa <= media.cpa * 0.65) p(`A campanha ${x.nome} possui CPA ${pct(1 - x.k.cpa / media.cpa)} menor que a média (${brl(x.k.cpa)} × ${brl(media.cpa)}) e pode ser analisada para aumento gradual de orçamento.`);
    if (media.cpa && x.k.cpa && x.k.cpa >= media.cpa * 1.5) p(`A campanha ${x.nome} está com CPA ${pct(x.k.cpa / media.cpa - 1)} acima da média (${brl(x.k.cpa)}). Vale revisar público, criativo ou oferta.`);
    if (x.k.spend >= (num(cfg().gasto_sem_venda) || 100) && !x.k.sales && !x.k.leads_base) p(`A campanha ${x.nome} gastou ${brl(x.k.spend)} sem registrar lead ou venda no período.`);
  }
  for (const cr of db.all("creatives")) {
    const cl = classificarCriativo(cr, iv, media);
    if (cl.classe === "saturando" && cl.flags.includes("ctr_caindo")) p(`O criativo ${cr.name} está apresentando queda progressiva de CTR (${pct(cl.kAnt.ctr)} → ${pct(cl.k.ctr)}).`);
    if (cl.classe === "campeao") p(`O criativo ${cr.name} lidera em resultado: ${cl.k.sales} venda(s) com ROAS ${mult(cl.k.roas)}.`);
  }
  for (const pr of db.where("products", (p) => p.active !== false)) {
    const cl = classificarProduto(pr);
    if (cl.flags.includes("estoque_alto") && cl.resumo.qtd30 <= 2) p(`O produto ${pr.name} possui estoque alto (${inteiro(pr.stock)}) e poucas vendas (${cl.resumo.qtd30} em 30 dias), sendo candidato a uma campanha promocional.`);
  }
  for (const f of narrativaAtendimento(iv)) p(f);
  const at2 = atendimento(iv);
  if (at2.medidos >= 3 && at2.tempoMedio != null && at2.tempoMedio > at2.sla * 2) p(`O atendimento está demorando: ${formatoMinutos(at2.tempoMedio)} em média contra a meta de ${at2.sla} min. Campanha boa com atendimento lento vira lead perdido, não venda.`);
  const perdas = motivosPerda(iv);
  if (perdas.total >= 3) p(`Principal motivo de perda no período: "${perdas.itens[0].rotulo}" (${pct(perdas.itens[0].n / perdas.total)} dos leads perdidos).`);
  paras.push("Estas observações são sugestões calculadas a partir dos dados lançados; nenhuma alteração é feita automaticamente.");
  return paras;
}

// A frase que responde "o anúncio trouxe, e depois o que aconteceu?".
export function narrativaAtendimento(iv) {
  const at = atendimento(iv);
  const frases = [];
  if (!at.total) return ["Nenhum lead novo no período."];
  const camps = porEntidade(iv, "campaign").filter((x) => x.k.leads || x.k.sales);
  const maisLeads = camps.slice().sort((a, b) => b.k.leads - a.k.leads)[0];
  const maisVendas = camps.slice().sort((a, b) => (b.k.sales - a.k.sales) || (b.k.revenue - a.k.revenue))[0];
  frases.push(`Entraram ${inteiro(at.total)} lead(s). ${inteiro(at.atendidos)} foram atendidos e ${inteiro(at.naoAtendidos)} ainda não receberam contato.`);
  if (at.tempoMedio != null) frases.push(`Tempo médio até o primeiro atendimento: ${formatoMinutos(at.tempoMedio)}${at.mediana != null ? ` (metade em até ${formatoMinutos(at.mediana)})` : ""}. Meta: ${at.sla} min.`);
  if (at.atendidos) frases.push(`Dos ${inteiro(at.atendidos)} atendidos, ${inteiro(at.responderam)} responderam, ${inteiro(at.qualificados)} foram qualificados, ${inteiro(at.negociaram)} negociaram e ${inteiro(at.compraram)} compraram.`);
  if (maisLeads && maisVendas) {
    if (maisLeads.id === maisVendas.id) frases.push(`${maisLeads.nome} foi a campanha que mais trouxe leads e vendas.`);
    else frases.push(`${maisLeads.nome} trouxe mais leads (${inteiro(maisLeads.k.leads)}); ${maisVendas.nome} trouxe mais vendas (${inteiro(maisVendas.k.sales)}).`);
  }
  return frases;
}
export function formatoMinutos(m) {
  if (m == null || !isFinite(m)) return "—";
  if (m < 60) return `${Math.round(m)} min`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}`;
  return `${Math.floor(m / 1440)} dia(s)`;
}

export function motivosPerda(iv) {
  const perdidos = db.where("leads", (l) => l.stage === "perdido" && (!iv || (l.entered_at >= iv.inicio && l.entered_at <= iv.fim) || ((l.updated_at || "").slice(0, 10) >= iv.inicio && (l.updated_at || "").slice(0, 10) <= iv.fim)));
  const m = {};
  for (const l of perdidos) { const k = l.loss_reason || "outro"; m[k] = (m[k] || 0) + 1; }
  const rot = { caro: "Achou caro", sem_dinheiro: "Sem dinheiro", sem_limite: "Sem limite", nao_respondeu: "Não respondeu", concorrente: "Comprou do concorrente", indisponivel: "Produto indisponível", pesquisando: "Apenas pesquisando", desistiu: "Desistiu", outro: "Outro" };
  return { total: perdidos.length, itens: Object.keys(m).map((k) => ({ key: k, rotulo: rot[k] || k, n: m[k] })).sort((a, b) => b.n - a.n) };
}

// ---------------------------------------------------------------- relatórios
export function relatorio(iv) {
  const cmp = comparar(iv);
  const top = (tipo, n, f, ordem = "desc") => porEntidade(iv, tipo).filter(f).sort((a, b) => (ordem === "desc" ? (b.k.revenue - a.k.revenue) || (b.k.sales - a.k.sales) || (b.k.leads - a.k.leads) : (a.k.revenue - b.k.revenue))).slice(0, n);
  const campanhas = porEntidade(iv, "campaign").filter((x) => x.k.spend > 0);
  const piores = campanhas.filter((x) => x.k.spend >= 20).sort((a, b) => ((a.k.roas ?? -1) - (b.k.roas ?? -1)) || (b.k.spend - a.k.spend)).slice(0, 5);
  const produtos = db.where("products", (p) => p.active !== false).map((p) => ({ p, r: resumoProduto(p), k: kpis(iv, { product_id: p.id }) }));
  return {
    iv, cmp,
    topCampanhas: top("campaign", 5, (x) => x.k.spend > 0 || x.k.sales > 0),
    topProdutos: produtos.filter((x) => x.k.sales > 0).sort((a, b) => b.k.revenue - a.k.revenue).slice(0, 5),
    topCriativos: top("creative", 5, (x) => x.k.spend > 0 || x.k.sales > 0),
    pioresCampanhas: piores,
    produtosPoucaSaida: produtos.filter((x) => x.k.sales <= 1).sort((a, b) => a.k.sales - b.k.sales || b.p.stock - a.p.stock).slice(0, 5),
    produtosCrescimento: produtos.map((x) => ({ ...x, cresc: x.r.qtd7 - x.r.qtd7ant })).filter((x) => x.cresc > 0).sort((a, b) => b.cresc - a.cresc).slice(0, 5),
  };
}
