// Ações que saem do CRM e mudam a conta de anúncios de verdade.
// Três regras valem para todas elas:
//   1. Nada acontece sem confirmação explícita, com o efeito escrito por extenso.
//   2. Depois de dar certo, o CRM se atualiza e a ação entra no histórico de decisões —
//      é o mesmo histórico que mede o antes e o depois de cada mudança.
//   3. Campanha nova e cópia nascem PAUSADAS. Quem liga o dinheiro é a pessoa.
import { db } from "./db.js?v=ebf7a3c7";
import * as M from "./meta.js?v=ebf7a3c7";
import { modal, fecharModal, toast, badge } from "./ui.js?v=ebf7a3c7";
import { esc, brl, agora, num } from "./format.js?v=ebf7a3c7";
import { usuario, podeEditar } from "./auth.js?v=ebf7a3c7";

const TABELA = { campanha: "campaigns", conjunto: "ad_sets", anuncio: "ads" };
const NOME_TIPO = { campanha: "campanha", conjunto: "conjunto", anuncio: "anúncio" };

export const controlavel = (reg) => !!(reg && reg.external_id) && M.podeEscrever() && podeEditar();
export const ligado = () => M.podeEscrever();

function registrar(campaignId, dados) {
  if (!campaignId) return null;
  return db.insert("campaign_decisions", { campaign_id: campaignId, at: agora(), user_id: (usuario() || {}).id || "", auto: false, ...dados });
}

// ---------------------------------------------------------------- confirmação
// Devolve uma promessa: true se a pessoa confirmou.
function confirmar({ titulo, corpo, botao, perigo = false }) {
  return new Promise((resolve) => {
    let respondeu = false;
    const box = modal(`${corpo}
      <div class="form-acoes" style="margin-top:14px">
        <button class="btn ${perigo ? "btn-perigo" : "btn-primario"}" data-ok>${esc(botao)}</button>
        <button class="btn btn-secundario" data-fechar-modal>Cancelar</button>
      </div>`, { titulo, onClose: () => { if (!respondeu) resolve(false); } });
    box.querySelector("[data-ok]").addEventListener("click", () => { respondeu = true; fecharModal(); resolve(true); });
  });
}
const aviso = (txt) => `<div class="aviso aviso-alerta">${txt}</div>`;
const caixaConta = () => `<p class="sub">Conta de anúncios: <b>${esc((M.estado.conta && M.estado.conta.name) || M.cfg.conta)}</b>. A mudança vale na Meta na hora.</p>`;

// ---------------------------------------------------------------- comandos
async function comFalha(fn, ctx) {
  try { return await fn(); } catch (e) {
    console.error("Meta:", e);
    modal(`<div class="aviso aviso-erro"><b>A Meta recusou o comando.</b><br>${esc(e.message)}</div>
      ${e.codigo ? `<p class="sub">Código ${esc(e.codigo)}${e.subcodigo ? " · subcódigo " + esc(e.subcodigo) : ""}.</p>` : ""}
      ${e.parcial ? `<div class="aviso aviso-alerta">Parte da estrutura chegou a ser criada e ficou <b>pausada</b>: ${(e.passos || []).map((p) => esc(p.etapa)).join(", ")}. Confira no Gerenciador de Anúncios antes de tentar de novo, para não duplicar.</div>` : ""}
      <p class="sub">Nada foi alterado no CRM.</p>`, { titulo: "Não deu certo" });
    return null;
  }
}

export async function pausarOuAtivar(tipo, reg, ativar, ctx) {
  const nome = reg.name || NOME_TIPO[tipo];
  const ok = await confirmar({
    titulo: ativar ? `Reativar ${NOME_TIPO[tipo]} na Meta` : `Pausar ${NOME_TIPO[tipo]} na Meta`,
    corpo: `<p>${ativar ? "Vai voltar a rodar e a gastar" : "Vai parar de rodar e de gastar"}: <b>${esc(nome)}</b>.</p>${caixaConta()}
      ${ativar ? aviso("Reativar faz a Meta recomeçar o aprendizado do conjunto. É normal o custo oscilar nos primeiros dias.") : ""}`,
    botao: ativar ? "▶️ Reativar agora" : "⏸️ Pausar agora",
    perigo: !ativar,
  });
  if (!ok) return;
  return comFalha(async () => {
    await M.mudarStatus(reg.external_id, ativar ? "ACTIVE" : "PAUSED");
    db.update(TABELA[tipo], reg.id, { status: ativar ? "ativa" : "pausada" });
    const campId = tipo === "campanha" ? reg.id : reg.campaign_id;
    registrar(campId, {
      type: ativar ? "retomada" : "pausa",
      de: ativar ? "pausada" : "ativa", para: ativar ? "ativa" : "pausada",
      reason: `${ativar ? "Reativação" : "Pausa"} de ${NOME_TIPO[tipo]} "${nome}" feita pelo CRM na Meta.`,
    });
    toast(ativar ? "Reativado na Meta." : "Pausado na Meta.");
    if (ctx) ctx.rerender();
    return true;
  });
}

export async function ajustarOrcamento(tipo, reg, ctx) {
  const atual = num(reg.daily_budget);
  const min = M.estado.minimoDiario || 0;
  const box = modal(`
    <p>Orçamento diário de <b>${esc(reg.name || "")}</b>, hoje em ${esc(brl(atual))}.</p>
    <div class="form-grade">
      <div class="campo"><label>Novo orçamento diário (R$)</label><input type="number" step="0.01" min="${min || 1}" id="novoOrc" value="${atual || ""}"></div>
    </div>
    <div class="chips" style="margin-top:8px">
      ${[["-30%", 0.7], ["-20%", 0.8], ["+20%", 1.2], ["+30%", 1.3], ["+50%", 1.5]].map(([r, f]) => `<button class="chip" data-fator="${f}">${r}</button>`).join("")}
    </div>
    ${aviso("Subir muito de uma vez reinicia o aprendizado e costuma piorar o custo. Aumentos de até 20% a cada 2 ou 3 dias são o caminho mais seguro.")}
    ${min ? `<p class="sub">Mínimo desta conta: ${esc(brl(min))} por dia.</p>` : ""}
    ${caixaConta()}
    <div class="form-acoes" style="margin-top:14px"><button class="btn btn-primario" data-ok>💰 Alterar na Meta</button><button class="btn btn-secundario" data-fechar-modal>Cancelar</button></div>`,
    { titulo: `Orçamento do ${NOME_TIPO[tipo]}` });
  const campo = box.querySelector("#novoOrc");
  box.querySelectorAll("[data-fator]").forEach((b) => b.addEventListener("click", () => {
    const base = atual || num(campo.value);
    campo.value = (Math.round(base * Number(b.dataset.fator) * 100) / 100).toFixed(2);
  }));
  box.querySelector("[data-ok]").addEventListener("click", async () => {
    const valor = num(campo.value);
    if (!(valor > 0)) { toast("Informe um valor maior que zero.", "erro"); return; }
    fecharModal();
    await comFalha(async () => {
      await M.definirOrcamentoDiario(reg.external_id, valor);
      db.update(TABELA[tipo], reg.id, { daily_budget: valor });
      const campId = tipo === "campanha" ? reg.id : reg.campaign_id;
      registrar(campId, {
        type: valor > atual ? "escala" : valor < atual ? "reducao" : "orcamento",
        de: brl(atual), para: brl(valor),
        reason: `Orçamento diário do ${NOME_TIPO[tipo]} "${reg.name}" alterado pelo CRM na Meta.`,
      });
      toast("Orçamento alterado na Meta.");
      if (ctx) ctx.rerender();
      return true;
    });
  });
}

// ---------------------------------------------------------------- subir campanha
export async function duplicar(reg, ctx) {
  const box = modal(`
    <p>Vai criar na Meta uma cópia completa de <b>${esc(reg.name)}</b>: mesmo público, mesmos criativos, mesma configuração de WhatsApp e de conversão.</p>
    <div class="form-grade">
      <div class="campo"><label>Nome da cópia</label><input type="text" id="dupNome" value="${esc(reg.name + " (cópia)")}"></div>
      <div class="campo"><label>Orçamento diário da cópia (R$) — opcional</label><input type="number" step="0.01" id="dupOrc" placeholder="manter o mesmo" ></div>
    </div>
    <label class="check" style="margin-top:8px"><input type="checkbox" id="dupAtiva"> Já subir ativa (começa a gastar na hora)</label>
    ${aviso("Sem marcar essa caixa, a cópia nasce <b>pausada</b>. É o recomendado: você confere no Gerenciador e liga quando quiser.")}
    ${caixaConta()}
    <div class="form-acoes" style="margin-top:14px"><button class="btn btn-primario" data-ok>📋 Duplicar na Meta</button><button class="btn btn-secundario" data-fechar-modal>Cancelar</button></div>`,
    { titulo: "Duplicar campanha", largo: true });
  box.querySelector("[data-ok]").addEventListener("click", async () => {
    const nome = box.querySelector("#dupNome").value.trim() || reg.name + " (cópia)";
    const orc = num(box.querySelector("#dupOrc").value);
    const ativa = box.querySelector("#dupAtiva").checked;
    fecharModal();
    toast("Duplicando na Meta…");
    await comFalha(async () => {
      const novoId = await M.duplicarCampanha(reg.external_id, { sufixo: " (cópia)", ativa });
      if (!novoId) throw new M.ErroMeta("A Meta não devolveu o identificador da cópia.");
      await M.renomear(novoId, nome);
      if (orc > 0) { try { await M.definirOrcamentoDiario(novoId, orc); } catch (e) { toast("Cópia criada, mas o orçamento não foi aplicado: " + e.message, "erro"); } }
      const nova = db.insert("campaigns", {
        name: nome, platform: reg.platform || "meta", objective: reg.objective, product_id: reg.product_id || "",
        category: reg.category || "", audience_id: reg.audience_id || "", company_id: reg.company_id || "",
        status: ativa ? "ativa" : "pausada", daily_budget: orc > 0 ? orc : num(reg.daily_budget),
        target_cpa: reg.target_cpa || "", target_cpl: reg.target_cpl || "", target_roas: reg.target_roas || "",
        external_id: novoId, source: "meta",
        notes: `Cópia de "${reg.name}" criada pelo CRM.`,
      });
      registrar(nova.id, { type: "outra", de: reg.name, para: nome, reason: `Campanha duplicada a partir de "${reg.name}" pelo CRM. Nasceu ${ativa ? "ativa" : "pausada"}.` });
      registrar(reg.id, { type: "outra", de: "", para: nome, reason: `Esta campanha foi duplicada. A cópia se chama "${nome}".` });
      modal(`<div class="aviso aviso-ok"><b>Cópia criada na Meta.</b> ${ativa ? "Ela já está ativa." : "Ela está <b>pausada</b> — confira e ative quando quiser."}</div>
        <p>Identificador na Meta: <code>${esc(novoId)}</code></p>
        <p class="sub">Os conjuntos e anúncios copiados aparecem no CRM na próxima coleta automática da Meta.</p>
        <div class="form-acoes" style="margin-top:12px"><a class="btn btn-primario" href="#/campanhas/${nova.id}" data-fechar-modal>Abrir a cópia</a></div>`, { titulo: "Pronto" });
      if (ctx) setTimeout(() => ctx.rerender(), 50);
      return true;
    });
  });
}

// Assistente de campanha nova: os dois caminhos numa tela só.
export async function assistenteNova(ctx, campanhaBase = null) {
  if (!M.podeEscrever()) {
    modal(`<div class="aviso aviso-alerta">O controle das campanhas pela Meta está desligado. Ligue em <a href="#/config?aba=meta" data-fechar-modal>Configurações → Meta</a> colando a chave de acesso.</div>`, { titulo: "Ainda não dá" });
    return;
  }
  const daMeta = db.where("campaigns", (c) => c.external_id && c.source === "meta").sort((a, b) => (a.status === "ativa" ? -1 : 1) - (b.status === "ativa" ? -1 : 1) || String(a.name).localeCompare(String(b.name)));
  const box = modal(`
    <div class="abas" data-abas-nova>
      <button class="aba ativa" data-aba-nova="duplicar">Duplicar uma que já roda</button>
      <button class="aba" data-aba-nova="zero">Criar do zero</button>
    </div>
    <div data-painel="duplicar">
      <p class="sub" style="margin:10px 0">O caminho mais seguro: a cópia herda público, criativo, pixel e configuração de WhatsApp de uma campanha que já funciona. Você muda nome e orçamento.</p>
      ${daMeta.length ? `<div class="form-grade"><div class="campo largo"><label>Campanha a duplicar</label><select id="novaBase">${daMeta.map((c) => `<option value="${esc(c.id)}"${campanhaBase && campanhaBase.id === c.id ? " selected" : ""}>${esc(c.name)} — ${esc(c.status)}</option>`).join("")}</select></div></div>
        <div class="form-acoes" style="margin-top:14px"><button class="btn btn-primario" data-ir-duplicar>📋 Continuar</button></div>`
      : `<div class="aviso aviso-info">Nenhuma campanha vinda da Meta no CRM ainda. Use "Criar do zero" ou espere a próxima coleta automática.</div>`}
    </div>
    <div data-painel="zero" hidden>
      <div class="form-grade">
        <div class="campo largo"><label>Nome da campanha *</label><input type="text" id="nvNome" placeholder="Ex.: Botijão 13kg — bairro Centro"></div>
        <div class="campo"><label>Objetivo</label><select id="nvObj">${M.OBJETIVOS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div>
        <div class="campo"><label>Orçamento diário (R$) *</label><input type="number" step="0.01" id="nvOrc" placeholder="${M.estado.minimoDiario ? M.estado.minimoDiario.toFixed(2) : "20,00"}"></div>
        <div class="campo"><label>Página do Facebook/Instagram *</label><select id="nvPagina"><option value="">carregando…</option></select></div>
        <div class="campo"><label>WhatsApp de destino (objetivo Mensagens)</label><input type="text" id="nvWpp" placeholder="55 99 99999-9999"></div>
        <div class="campo"><label>Link de destino (demais objetivos)</label><input type="url" id="nvLink" placeholder="https://"></div>
        <div class="campo"><label>Idade mínima</label><input type="number" id="nvIdadeMin" value="18" min="13" max="65"></div>
        <div class="campo"><label>Idade máxima</label><input type="number" id="nvIdadeMax" value="65" min="13" max="65"></div>
        <div class="campo"><label>Gênero</label><select id="nvGenero"><option value="">Todos</option><option value="1">Homens</option><option value="2">Mulheres</option></select></div>
        <div class="campo"><label>Cidade (vazio = Brasil inteiro)</label><input type="text" id="nvCidade" placeholder="digite e escolha"><div id="nvCidades" class="chips"></div></div>
        <div class="campo"><label>Raio da cidade (km)</label><input type="number" id="nvRaio" value="15" min="1" max="80"></div>
      </div>
      <h3>Criativo</h3>
      <div class="abas" data-abas-criativo>
        <button class="aba ativa" data-aba-cr="post">Impulsionar publicação existente</button>
        <button class="aba" data-aba-cr="novo">Imagem + texto novos</button>
      </div>
      <div data-painel-cr="post"><div class="campo largo" style="margin-top:8px"><label>Publicação da página</label><select id="nvPost"><option value="">escolha a página primeiro</option></select></div></div>
      <div data-painel-cr="novo" hidden>
        <div class="form-grade" style="margin-top:8px">
          <div class="campo largo"><label>Texto do anúncio *</label><textarea id="nvTexto" placeholder="O que aparece acima da imagem"></textarea></div>
          <div class="campo"><label>Título</label><input type="text" id="nvTitulo"></div>
          <div class="campo"><label>Imagem *</label><input type="file" id="nvImagem" accept="image/*"></div>
        </div>
      </div>
      <label class="check" style="margin-top:10px"><input type="checkbox" id="nvAtiva"> Já subir ativa (começa a gastar na hora)</label>
      ${aviso("Sem marcar, a campanha nasce <b>pausada</b>. Recomendado: confira no Gerenciador de Anúncios e ligue quando estiver certo.")}
      ${caixaConta()}
      <div class="form-acoes" style="margin-top:14px"><button class="btn btn-primario" data-criar>🚀 Subir campanha na Meta</button><button class="btn btn-secundario" data-fechar-modal>Cancelar</button></div>
    </div>`, { titulo: "Subir campanha na Meta", largo: true });

  const painel = (n) => box.querySelector(`[data-painel="${n}"]`);
  box.querySelectorAll("[data-aba-nova]").forEach((b) => b.addEventListener("click", () => {
    box.querySelectorAll("[data-aba-nova]").forEach((x) => x.classList.toggle("ativa", x === b));
    painel("duplicar").hidden = b.dataset.abaNova !== "duplicar";
    painel("zero").hidden = b.dataset.abaNova !== "zero";
  }));
  const irDup = box.querySelector("[data-ir-duplicar]");
  if (irDup) irDup.addEventListener("click", () => {
    const c = db.get("campaigns", box.querySelector("#novaBase").value);
    fecharModal();
    if (c) duplicar(c, ctx);
  });

  // criativo: publicação existente x imagem nova
  box.querySelectorAll("[data-aba-cr]").forEach((b) => b.addEventListener("click", () => {
    box.querySelectorAll("[data-aba-cr]").forEach((x) => x.classList.toggle("ativa", x === b));
    box.querySelector('[data-painel-cr="post"]').hidden = b.dataset.abaCr !== "post";
    box.querySelector('[data-painel-cr="novo"]').hidden = b.dataset.abaCr !== "novo";
  }));

  // páginas e publicações
  const selPagina = box.querySelector("#nvPagina"), selPost = box.querySelector("#nvPost");
  M.paginas().then((ps) => {
    selPagina.innerHTML = ps.length ? ps.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("") : `<option value="">nenhuma página encontrada nesta chave</option>`;
    if (ps.length) carregarPosts(ps[0].id);
  }).catch((e) => { selPagina.innerHTML = `<option value="">${esc(e.message)}</option>`; });
  function carregarPosts(pageId) {
    selPost.innerHTML = `<option value="">carregando…</option>`;
    M.publicacoesDaPagina(pageId).then((ps) => {
      selPost.innerHTML = ps.length ? ps.map((p) => `<option value="${esc(p.story_id)}">${esc((p.message || "(sem texto)").slice(0, 70))}</option>`).join("") : `<option value="">a página não tem publicações recentes</option>`;
    }).catch((e) => { selPost.innerHTML = `<option value="">${esc(e.message)}</option>`; });
  }
  selPagina.addEventListener("change", () => carregarPosts(selPagina.value));

  // cidade por busca
  let cidadeEscolhida = null;
  const campoCidade = box.querySelector("#nvCidade"), listaCidades = box.querySelector("#nvCidades");
  let t = null;
  campoCidade.addEventListener("input", () => {
    clearTimeout(t); cidadeEscolhida = null;
    const q = campoCidade.value.trim();
    if (q.length < 3) { listaCidades.innerHTML = ""; return; }
    t = setTimeout(() => M.buscarCidades(q).then((cs) => {
      listaCidades.innerHTML = cs.map((c) => `<button class="chip" data-cidade="${esc(c.key)}" data-nome="${esc(c.name + " - " + (c.region || ""))}">${esc(c.name)}${c.region ? " · " + esc(c.region) : ""}</button>`).join("");
      listaCidades.querySelectorAll("[data-cidade]").forEach((b) => b.addEventListener("click", () => {
        cidadeEscolhida = { key: b.dataset.cidade, nome: b.dataset.nome };
        campoCidade.value = b.dataset.nome; listaCidades.innerHTML = `<span class="tag">${esc(b.dataset.nome)}</span>`;
      }));
    }).catch(() => { listaCidades.innerHTML = ""; }), 400);
  });

  box.querySelector("[data-criar]").addEventListener("click", async () => {
    const v = (id) => box.querySelector(id).value.trim();
    const nome = v("#nvNome"), objetivo = v("#nvObj"), orc = num(v("#nvOrc")), pagina = v("#nvPagina");
    const usaPost = box.querySelector('[data-aba-cr="post"]').classList.contains("ativa");
    if (!nome) return toast("Dê um nome à campanha.", "erro");
    if (!(orc > 0)) return toast("Informe o orçamento diário.", "erro");
    if (!pagina) return toast("Escolha a página.", "erro");
    const criativo = {};
    if (usaPost) {
      criativo.story_id = v("#nvPost");
      if (!criativo.story_id) return toast("Escolha a publicação a impulsionar.", "erro");
    } else {
      criativo.texto = v("#nvTexto"); criativo.titulo = v("#nvTitulo");
      if (!criativo.texto) return toast("Escreva o texto do anúncio.", "erro");
      const arq = box.querySelector("#nvImagem").files[0];
      if (!arq) return toast("Escolha a imagem do anúncio.", "erro");
      toast("Enviando a imagem para a Meta…");
      try { const img = await M.enviarImagem(arq); criativo.image_hash = img.hash; }
      catch (e) { return toast("A imagem não foi aceita: " + e.message, "erro"); }
    }
    const cidades = cidadeEscolhida ? [{ key: cidadeEscolhida.key, raio: num(v("#nvRaio")) || 15 }] : [];
    const generoSel = v("#nvGenero");
    const publico = M.montarPublico({
      cidades, idade_min: num(v("#nvIdadeMin")) || 18, idade_max: num(v("#nvIdadeMax")) || 65,
      generos: generoSel ? [Number(generoSel)] : [],
    });
    const ativa = box.querySelector("#nvAtiva").checked;
    // Lê tudo antes de fechar: depois do fecharModal() o formulário deixa de existir.
    const whatsapp = v("#nvWpp"), link = v("#nvLink");
    fecharModal();
    toast("Subindo a campanha na Meta…");
    await comFalha(async () => {
      const r = await M.criarCampanha({
        nome, objetivo, orcamento_diario: orc, pagina_id: pagina, publico, criativo, whatsapp, link, ativa,
      });
      const objetivoCrm = (M.OBJETIVOS.find((o) => o[0] === objetivo) || [])[2] || "vendas";
      const nova = db.insert("campaigns", {
        name: nome, platform: "meta", objective: objetivoCrm, status: ativa ? "ativa" : "pausada",
        daily_budget: orc, external_id: r.campanha_id, source: "meta",
        start_date: new Date().toISOString().slice(0, 10),
        notes: "Campanha criada pelo CRM direto na Meta.",
      });
      registrar(nova.id, { type: "outra", de: "", para: nome, reason: `Campanha criada pelo CRM na Meta, com orçamento de ${brl(orc)}/dia. Nasceu ${ativa ? "ativa" : "pausada"}.` });
      modal(`<div class="aviso aviso-ok"><b>Campanha criada na Meta.</b> ${ativa ? "Já está ativa." : "Está <b>pausada</b> — confira no Gerenciador e ative quando quiser."}</div>
        <ul class="an-sinais">${r.passos.map((p) => `<li>${esc(p.etapa)}: <code>${esc(p.id)}</code></li>`).join("")}</ul>
        <p class="sub">Conjunto e anúncio aparecem no CRM na próxima coleta automática.</p>
        <div class="form-acoes" style="margin-top:12px"><a class="btn btn-primario" href="#/campanhas/${nova.id}" data-fechar-modal>Abrir no CRM</a></div>`, { titulo: "Pronto" });
      if (ctx) setTimeout(() => ctx.rerender(), 50);
      return true;
    });
  });
}

// ---------------------------------------------------------------- botões prontos
export function botoes(tipo, reg, { compacto = false } = {}) {
  if (!controlavel(reg)) return "";
  const ativo = reg.status === "ativa";
  const cls = compacto ? "btn btn-pq" : "btn";
  const attrs = `data-meta-tipo="${esc(tipo)}" data-meta-id="${esc(reg.id)}"`;
  return `${ativo
    ? `<button class="${cls}" ${attrs} data-meta-acao="pausar" title="Pausa de verdade, na conta de anúncios">⏸️ Pausar${compacto ? "" : " na Meta"}</button>`
    : `<button class="${cls} btn-verde" ${attrs} data-meta-acao="ativar" title="Volta a rodar na conta de anúncios">▶️ Reativar${compacto ? "" : " na Meta"}</button>`}
    <button class="${cls}" ${attrs} data-meta-acao="orcamento">💰 Orçamento</button>
    ${tipo === "campanha" ? `<button class="${cls}" ${attrs} data-meta-acao="duplicar">📋 Duplicar</button>` : ""}`;
}

// Só o liga/desliga, para caber numa célula de tabela.
export function botaoStatus(tipo, reg) {
  if (!controlavel(reg)) return "";
  const ativo = reg.status === "ativa";
  const attrs = `data-meta-tipo="${esc(tipo)}" data-meta-id="${esc(reg.id)}"`;
  return ativo
    ? `<button class="btn btn-pq" ${attrs} data-meta-acao="pausar" title="Pausar na conta de anúncios">⏸️ Pausar</button>`
    : `<button class="btn btn-pq btn-verde" ${attrs} data-meta-acao="ativar" title="Reativar na conta de anúncios">▶️ Ativar</button>`;
}

export function ligar(root, ctx) {
  root.querySelectorAll("[data-meta-acao]").forEach((b) => b.addEventListener("click", async () => {
    const tipo = b.dataset.metaTipo, reg = db.get(TABELA[tipo], b.dataset.metaId);
    if (!reg) return;
    if (!M.podeEscrever()) { toast("O controle pela Meta está desligado (Configurações → Meta).", "erro"); return; }
    b.disabled = true;
    try {
      if (b.dataset.metaAcao === "pausar") await pausarOuAtivar(tipo, reg, false, ctx);
      else if (b.dataset.metaAcao === "ativar") await pausarOuAtivar(tipo, reg, true, ctx);
      else if (b.dataset.metaAcao === "orcamento") await ajustarOrcamento(tipo, reg, ctx);
      else if (b.dataset.metaAcao === "duplicar") await duplicar(reg, ctx);
    } finally { b.disabled = false; }
  }));
  root.querySelectorAll("[data-meta-nova]").forEach((b) => b.addEventListener("click", () => assistenteNova(ctx, b.dataset.metaNova ? db.get("campaigns", b.dataset.metaNova) : null)));
}

// Aviso que aparece quando a campanha veio da Meta mas o controle está desligado.
export function dicaDesligada(reg) {
  if (!reg || !reg.external_id || M.podeEscrever() || !podeEditar()) return "";
  return `<p class="sub">Para pausar, mudar orçamento ou duplicar esta campanha direto daqui, ligue o controle em <a href="#/config?aba=meta">Configurações → Meta</a>.</p>`;
}
