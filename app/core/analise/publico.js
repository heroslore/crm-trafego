// Diagnóstico de público: o dinheiro está indo para quem responde?
//
// A régua é a PRÓPRIA CONTA, não um número de internet. Em cada recorte (idade, gênero, onde
// o anúncio aparece, aparelho, região, hora) o custo por mensagem de cada segmento é comparado
// com a média ponderada daquele mesmo recorte. Segmento que custa bem mais caro E carrega uma
// fatia grande do gasto é desperdício com nome e valor em reais.
//
// Duas travas contra conclusão inventada:
//   1. Segmento sem entrega mínima não recebe nota — recebe "sem conclusão" e sai do cálculo.
//      Um segmento com 200 impressões e 1 mensagem pode ter qualquer custo por acaso.
//   2. Segmento caro com 2% do gasto não vira recomendação. Mexer nele não muda o resultado,
//      e encher a tela de ação irrelevante faz o gestor parar de ler a tela.
//
// Este arquivo é puro: recebe as linhas de recorte e devolve o diagnóstico. Quem lê o
// dados/meta.json é o módulo da tela.
import { num } from "../format.js?v=b71c1ba8";

// Mínimos por segmento. Abaixo de qualquer um deles, o custo por mensagem é ruído.
export const MINIMOS_SEGMENTO = { impressoes: 800, gasto: 15 };
// Um segmento que gastou o mínimo e não trouxe NENHUMA mensagem é conclusão por si só:
// não é amostra pequena, é dinheiro sem retorno.
export const GASTO_SEM_RETORNO = 25;
export const CARO = 1.35;             // custo por mensagem acima disso, frente à média do recorte
export const BARATO = 0.75;
export const FATIA_RELEVANTE = 0.08;  // 8% do gasto: abaixo disso, mexer não muda o jogo

export const NIVEIS = {
  bom: { icone: "🟢", rotulo: "BARATO", cor: "verde" },
  medio: { icone: "🟡", rotulo: "NA MÉDIA", cor: "amarelo" },
  ruim: { icone: "🔴", rotulo: "CARO", cor: "vermelho" },
  sem_retorno: { icone: "🔴", rotulo: "SEM RETORNO", cor: "vermelho" },
  sem_dados: { icone: "⚪", rotulo: "SEM CONCLUSÃO", cor: "cinza" },
};

const GENERO = { male: "Homens", female: "Mulheres", unknown: "Não informado" };
const APARELHO = { android_smartphone: "Android", iphone: "iPhone", android_tablet: "Tablet Android", ipad: "iPad", desktop: "Computador", other: "Outro", unknown: "Não informado" };
const POSICAO = {
  feed: "Feed", instagram_stories: "Stories", instagram_reels: "Reels", instagram_explore: "Explorar",
  instagram_explore_grid_home: "Explorar (grade)", instagram_profile_feed: "Perfil", instagram_search: "Busca",
  facebook_reels: "Reels", facebook_stories: "Stories", facebook_profile_feed: "Perfil",
  facebook_notification: "Notificações", marketplace: "Marketplace", search: "Busca",
  instream_video: "Vídeo in-stream", video_feeds: "Feeds de vídeo", right_hand_column: "Coluna direita",
  an_classic: "Audience Network", rewarded_video: "Vídeo premiado", unknown: "Não informado",
};
const PLATAFORMA = { instagram: "IG", facebook: "FB", messenger: "Messenger", audience_network: "Audience Network", threads: "Threads", unknown: "?" };
const idadeNome = (x) => (x === "Unknown" || !x ? "Não informado" : x);

// Cada recorte sabe de onde vem, como se chama cada segmento e o que dá para fazer com ele.
// "acao" é o verbo que a recomendação usa: o que existe de verdade no Gerenciador de Anúncios.
export const RECORTES = [
  { chave: "idade", rotulo: "Idade", de: (P) => P.idade_genero, nome: (x) => idadeNome(x.idade),
    acao: "estreitar a faixa de idade do conjunto", ordem: (a, b) => a.nome.localeCompare(b.nome) },
  { chave: "genero", rotulo: "Gênero", de: (P) => P.idade_genero, nome: (x) => GENERO[x.genero] || x.genero,
    acao: "escolher o gênero no conjunto" },
  { chave: "posicionamento", rotulo: "Onde o anúncio aparece", de: (P) => P.posicionamento,
    nome: (x) => `${PLATAFORMA[x.plataforma] || x.plataforma} · ${POSICAO[x.posicao] || x.posicao}`,
    acao: "desmarcar esse posicionamento (posicionamento manual)" },
  { chave: "aparelho", rotulo: "Aparelho", de: (P) => P.dispositivo, nome: (x) => APARELHO[x.dispositivo] || x.dispositivo,
    acao: "filtrar o aparelho no conjunto" },
  { chave: "regiao", rotulo: "Região", de: (P) => P.regiao, nome: (x) => x.regiao || "Não informado",
    acao: "ajustar a área de entrega" },
  { chave: "horario", rotulo: "Hora do dia", de: (P) => P.horario, nome: (x) => String(x.hora).padStart(2, "0") + "h",
    acao: "usar orçamento vitalício com programação por horário", semCampanha: true,
    ordem: (a, b) => a.nome.localeCompare(b.nome) },
];

function agrupar(linhas, nome) {
  const m = new Map();
  for (const x of linhas || []) {
    const k = nome(x);
    if (k == null || k === "undefined") continue;
    const g = m.get(k) || { nome: k, gasto: 0, impressoes: 0, cliques: 0, mensagens: 0, alcance: 0 };
    g.gasto += num(x.gasto); g.impressoes += num(x.impressoes); g.cliques += num(x.cliques);
    g.mensagens += num(x.mensagens); g.alcance += num(x.alcance);
    m.set(k, g);
  }
  return [...m.values()];
}

// Nota de um segmento. Só recebe nota quem teve entrega suficiente para o número significar algo.
function classificar(s, media) {
  const entregou = s.impressoes >= MINIMOS_SEGMENTO.impressoes && s.gasto >= MINIMOS_SEGMENTO.gasto;
  if (!s.mensagens) {
    if (s.gasto >= GASTO_SEM_RETORNO && entregou) return { nivel: "sem_retorno", motivo: "gastou e não trouxe nenhuma mensagem" };
    return { nivel: "sem_dados", motivo: entregou ? "sem mensagem ainda" : "entrega pequena demais para concluir" };
  }
  if (!entregou) return { nivel: "sem_dados", motivo: "entrega pequena demais para concluir" };
  if (media == null) return { nivel: "sem_dados", motivo: "sem média do recorte para comparar" };
  const rel = (s.gasto / s.mensagens) / media;
  if (rel >= CARO) return { nivel: "ruim", motivo: `${rel.toFixed(1)}× o custo médio deste recorte` };
  if (rel <= BARATO) return { nivel: "bom", motivo: `${rel.toFixed(2)}× o custo médio — o dinheiro rende mais aqui` };
  return { nivel: "medio", motivo: "custo perto da média do recorte" };
}

// Diagnóstico de um recorte: os segmentos com nota, quanto do gasto está no caro e no barato,
// e quantas mensagens a mais o dinheiro do caro daria se rendesse como o melhor segmento.
export function diagnosticarRecorte(recorte, linhas) {
  const segs = agrupar(linhas, recorte.nome);
  const total = segs.reduce((a, s) => a + s.gasto, 0);
  const msgs = segs.reduce((a, s) => a + s.mensagens, 0);
  const media = msgs > 0 ? total / msgs : null;

  const itens = segs.map((s) => {
    const c = classificar(s, media);
    return {
      ...s,
      fatia: total > 0 ? s.gasto / total : 0,
      custo: s.mensagens > 0 ? s.gasto / s.mensagens : null,
      relativo: media && s.mensagens > 0 ? (s.gasto / s.mensagens) / media : null,
      ctr: s.impressoes > 0 ? s.cliques / s.impressoes : null,
      nivel: c.nivel, motivo: c.motivo,
    };
  }).sort(recorte.ordem || ((a, b) => b.gasto - a.gasto));

  // O corte de fatia se adapta ao número de segmentos. Hora do dia tem 24 fatias: nenhuma
  // sozinha chega a 8% do gasto, e com o corte fixo o recorte nunca teria o que dizer.
  // Mas o recorte inteiro só vira recomendação se o caro somado pesar de verdade — senão
  // a tela encheria de ação que não muda nada.
  const nConclusivos = itens.filter((i) => i.nivel !== "sem_dados").length;
  const fatiaMin = Math.min(FATIA_RELEVANTE, 1 / Math.max(3, nConclusivos * 1.5));
  const relevante = (i) => i.fatia >= fatiaMin;
  let caros = itens.filter((i) => (i.nivel === "ruim" || i.nivel === "sem_retorno") && relevante(i));
  if (caros.reduce((a, i) => a + i.fatia, 0) < FATIA_RELEVANTE) caros = [];
  const bons = itens.filter((i) => i.nivel === "bom" && relevante(i));
  // O alvo é o segmento barato mais forte: já provou que o custo menor existe NESTA conta.
  const melhor = bons.slice().sort((a, b) => (a.custo || Infinity) - (b.custo || Infinity))[0] || null;
  const gastoCaro = caros.reduce((a, i) => a + i.gasto, 0);
  const msgsCaro = caros.reduce((a, i) => a + i.mensagens, 0);
  const ganho = melhor && melhor.custo > 0 && gastoCaro > 0
    ? Math.round(gastoCaro / melhor.custo) - msgsCaro
    : null;

  return {
    ...recorte, itens, total, mensagens: msgs, media, caros, bons, melhor,
    gastoCaro, fatiaCaro: total > 0 ? gastoCaro / total : 0,
    ganho: ganho != null && ganho > 0 ? ganho : null,
    conclusivo: itens.some((i) => i.nivel !== "sem_dados"),
  };
}

const pctTxt = (v) => `${(v * 100).toFixed(0)}%`;
const reais = (v) => `R$ ${v.toFixed(2).replace(".", ",")}`;

// Frase do recorte. Sem achado relevante, diz isso — não enfeita.
export function frase(d) {
  if (!d.conclusivo) return { nivel: "sem_dados", texto: `Entrega pequena demais para concluir alguma coisa sobre ${d.rotulo.toLowerCase()}.` };
  if (!d.caros.length) {
    const b = d.bons.length ? ` O dinheiro rende melhor em ${d.bons.map((i) => i.nome).join(", ")}.` : "";
    return { nivel: "bom", texto: `Nenhuma fatia grande do gasto está cara neste recorte.${b}` };
  }
  const nomes = d.caros.map((i) => i.nome).join(", ");
  const g = d.ganho ? ` No custo de ${d.melhor.nome} (${reais(d.melhor.custo)}/msg), esse mesmo dinheiro daria cerca de ${d.ganho} mensagem(ns) a mais.` : "";
  return {
    nivel: d.fatiaCaro >= 0.25 ? "ruim" : "medio",
    texto: `${reais(d.gastoCaro)} (${pctTxt(d.fatiaCaro)} do gasto) está em ${nomes}, que ${d.caros.length > 1 ? "custam" : "custa"} bem mais caro por mensagem.${g}`,
  };
}

// Veredito geral: soma o gasto que está em segmento caro, sem contar o mesmo real duas vezes.
// Cada recorte fatia o MESMO dinheiro por um critério diferente, então somar os recortes
// inflaria o desperdício. Vale o pior recorte, que é a alavanca a puxar primeiro.
export function analisarPublico(publico, { campanhaId = "" } = {}) {
  const P = publico || {};
  const filtra = (rows, sem) => (campanhaId && !sem ? (rows || []).filter((x) => x.campanha_id === campanhaId) : rows || []);
  const recortes = RECORTES
    .map((r) => {
      const linhas = filtra(r.de(P), r.semCampanha);
      if (!linhas.length) return null;
      const d = diagnosticarRecorte(r, linhas);
      return { ...d, frase: frase(d) };
    })
    .filter(Boolean);

  const comAchado = recortes.filter((d) => d.caros.length);
  const alavanca = comAchado.slice().sort((a, b) => (b.ganho || 0) - (a.ganho || 0) || b.gastoCaro - a.gastoCaro)[0] || null;
  const conclusivos = recortes.filter((d) => d.conclusivo);
  const gastoTotal = recortes.length ? Math.max(...recortes.map((d) => d.total)) : 0;
  const pior = alavanca ? alavanca.fatiaCaro : 0;

  let veredito;
  if (!conclusivos.length) {
    veredito = { nivel: "sem_dados", titulo: "Ainda não dá para concluir", texto: "A entrega nos recortes é pequena demais. Deixe rodar mais dias ou olhe um período maior no topo da tela." };
  } else if (!alavanca) {
    veredito = { nivel: "bom", titulo: "O público está adequado", texto: "Nenhum recorte tem fatia grande do gasto indo para segmento caro. O gargalo, se existe, está no criativo ou na oferta — não em quem está vendo." };
  } else if (pior >= 0.25) {
    veredito = { nivel: "ruim", titulo: "O dinheiro está no lugar errado", texto: `${pctTxt(pior)} do gasto está em ${alavanca.rotulo.toLowerCase()} que custa bem mais caro por mensagem. É a maior alavanca que você tem hoje.` };
  } else {
    veredito = { nivel: "medio", titulo: "Adequado, mas dá para melhorar", texto: `O público em si responde. Sobra ajuste em ${alavanca.rotulo.toLowerCase()}: ${pctTxt(pior)} do gasto está na parte cara.` };
  }

  const acoes = comAchado
    .sort((a, b) => (b.ganho || 0) - (a.ganho || 0) || b.gastoCaro - a.gastoCaro)
    .map((d) => ({
      recorte: d.rotulo,
      titulo: `${d.caros.map((i) => i.nome).join(", ")} — ${d.acao}`,
      porque: d.frase.texto,
      ganho: d.ganho,
    }));

  return { recortes, veredito, alavanca, acoes, gastoTotal, periodo: P.periodo || null, escopo: campanhaId || "conta" };
}
