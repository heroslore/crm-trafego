import { db, inserirDemonstracao } from "../core/db.js";
import { cartao, tabela, badge, badgeOpcao, abrirFormulario, vazio, abas, toast, modal, fecharModal, kpi } from "../core/ui.js";
import { esc, dataBR, horaCurta, brl, inteiro } from "../core/format.js";
import { rotulo as rotuloOpcao, OPCOES } from "../core/schema.js";
import { PERMISSOES, ehAdmin, podeEditar, usuario } from "../core/auth.js";
import { nuvem, nuvemLigada, conectar, desconectar, sincronizar, carregarMeta, META } from "../core/sync.js";
import { lerCSV, lerXLSX, mapearColunas, importar, CAMPOS_IMPORT } from "../core/importer.js";
import * as W from "../core/wame.js";
import { REFERENCIA_PADRAO, mesclarReferencia, MENOR_MELHOR } from "../core/analise/benchmarks.js";
import { MINIMOS } from "../core/analise/confianca.js";
import * as MetaApi from "../core/meta.js";
import { MODOS_VENDA, MODO_VENDA_PADRAO, normalizarModoVenda } from "../core/analise/index.js";

let aba = "empresa", importState = null;
const METAS = [["faturamento_mes", "Meta de faturamento mensal (R$)"], ["faturamento_semana", "Meta de faturamento semanal (R$)"], ["vendas_mes", "Meta de vendas no mês"], ["leads_mes", "Meta de leads no mês"], ["roas_min", "ROAS mínimo"], ["cpa_max", "CPA máximo (R$)"], ["cpl_max", "CPL máximo (R$)"], ["ticket_medio", "Ticket médio desejado (R$)"], ["investimento_mes", "Investimento planejado do mês (R$)"], ["investimento_semana", "Investimento planejado da semana (R$)"], ["investimento_max_mes", "Investimento máximo mensal (R$)"], ["ctr_min", "CTR mínimo (%)"], ["sla_minutos", "Tempo máximo para o primeiro atendimento (minutos)"], ["taxa_contato_min", "Taxa mínima de leads atendidos (%)"], ["ltv_meta", "LTV desejado por cliente (R$)"]];
const PAGAMENTOS = [["pix", "Pix"], ["cartao", "Cartão"], ["boleto", "Boleto"], ["dinheiro", "Dinheiro"], ["crediario", "Crediário"], ["outro", "Outro"]];

function abaEmpresa(ctx) {
  const emps = db.all("companies");
  return cartao("Empresas / lojas", `<p class="sub" style="margin-bottom:10px">Cada empresa pode ter produtos, campanhas, leads e vendas próprios. O seletor no menu filtra tudo por empresa. Campanhas da Meta entram na empresa cujas palavras-chave aparecem no nome da campanha.</p>` + tabela("empresas", { colunas: [{ key: "name", label: "Empresa" }, { key: "segment", label: "Segmento" }, { key: "keywords", label: "Palavras-chave", render: (e) => (e.keywords || []).map((k) => `<span class="tag">${esc(k)}</span>`).join("") || "—" }, { key: "acao", label: "", render: (e) => ehAdmin() ? `<button class="btn btn-pq" data-editar-emp="${e.id}">✏️</button>` : "" }], linhas: emps }), ehAdmin() ? `<button class="btn btn-pq btn-primario" data-nova-emp>➕ Empresa</button>` : "");
}
function abaUsuarios() {
  const us = db.all("users");
  const perm = Object.keys(PERMISSOES).map((r) => `<tr><td>${rotuloOpcao("role", r)}</td><td>${PERMISSOES[r].modulos === "*" ? "todas as áreas" : PERMISSOES[r].modulos.join(", ")}</td><td>${PERMISSOES[r].editar ? "sim" : "só leitura"}</td></tr>`).join("");
  return cartao("Usuários e perfis", tabela("usuarios", { colunas: [{ key: "name", label: "Nome" }, { key: "role", label: "Perfil", render: (u) => badge(rotuloOpcao("role", u.role), "acento") }, { key: "email", label: "E-mail" }, { key: "pin", label: "PIN", render: (u) => u.pin ? "••••" : "—" }, { key: "active", label: "Ativo", render: (u) => u.active === false ? badge("inativo", "cinza") : badge("ativo", "verde") }, { key: "acao", label: "", render: (u) => ehAdmin() ? `<button class="btn btn-pq" data-editar-user="${u.id}">✏️</button>` : "" }], linhas: us }) + `<h3>O que cada perfil acessa</h3><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Perfil</th><th>Áreas</th><th>Edita</th></tr></thead><tbody>${perm}</tbody></table></div><p class="sub">O sistema é um app estático: os perfis organizam o trabalho e escondem áreas, mas não substituem uma senha do aparelho.</p>`, ehAdmin() ? `<button class="btn btn-pq btn-primario" data-novo-user>➕ Usuário</button>` : "");
}
function abaMetas() {
  const cfg = db.settings();
  return cartao("Metas", `<p class="sub" style="margin-bottom:10px">As metas definem os indicadores Excelente / Bom / Atenção / Ruim, as barras de progresso e os alertas.</p><div class="form-grade">${METAS.map(([k, l]) => `<div class="campo"><label>${l}</label><input type="number" step="any" inputmode="decimal" data-meta="${k}" value="${esc(db.goal(k, 0) || "")}"></div>`).join("")}</div><h3>Regras dos alertas</h3><div class="form-grade">${[["gasto_sem_venda", "Alertar campanha que gastou mais que (R$) sem lead/venda", 100], ["cpa_alta_pct", "Alertar quando o CPA subir mais que (%)", 30], ["limite_freq", "Frequência que indica saturação", 3], ["dias_produto_parado", "Dias sem venda para produto parado", 15]].map(([k, l, d]) => `<div class="campo"><label>${l}</label><input type="number" step="any" data-cfg="${k}" value="${esc(cfg[k] != null ? cfg[k] : d)}"></div>`).join("")}</div><h3>Taxas por forma de pagamento</h3><p class="sub">Usadas para calcular o lucro real quando a venda não tem a taxa preenchida à mão.</p>
    <div class="form-grade">${PAGAMENTOS.map(([k, l]) => `<div class="campo"><label>${l} (%)</label><input type="number" step="0.01" data-taxa="${k}" value="${esc((cfg.taxas || {})[k] != null ? (cfg.taxas || {})[k] : "")}"></div>`).join("")}</div>
    ${podeEditar() ? `<button class="btn btn-primario" data-salvar-metas style="margin-top:12px">💾 Salvar metas, regras e taxas</button>` : ""}`);
}
const ROTULOS_REF = {
  ctr: "CTR (proporção, 0,012 = 1,2%)", cpc: "CPC (R$)", cpm: "CPM (R$)", frequencia: "Frequência",
  retencao_inicial: "Passaram de 3 segundos (proporção)", retencao_metade: "Chegaram à metade (proporção)",
  retencao_fim: "Assistiram até o fim (proporção)", taxa_thruplay: "Chegaram ao ThruPlay (proporção)",
  taxa_pagina: "Cliques que chegaram na página", taxa_lead: "Cliques que viraram contato",
  conversao: "Lead que virou venda", cpl: "CPL (R$)", custo_conversa: "Custo por conversa (R$)",
  cpa: "CPA (R$)", roas: "ROAS", margem: "Margem sobre o faturamento",
};
const ROTULOS_MIN = {
  impressoes: "Impressões mínimas para concluir", alcance: "Alcance mínimo", cliques: "Cliques mínimos",
  gasto: "Investimento mínimo (R$)", dias: "Dias com entrega", video: "Visualizações de vídeo mínimas",
  leads: "Leads mínimos", vendas: "Vendas mínimas",
};
function abaAnalise() {
  const cfg = db.settings();
  const ref = mesclarReferencia(cfg.referencias);
  const mins = { ...MINIMOS, ...(cfg.minimos_analise || {}) };
  const linhas = Object.keys(REFERENCIA_PADRAO).map((k) => `<tr><td>${esc(ROTULOS_REF[k] || k)}<br><small>${MENOR_MELHOR.has(k) ? "quanto menor, melhor" : "quanto maior, melhor"}</small></td>
    <td><input type="number" step="any" data-ref-bom="${k}" value="${esc(ref[k].bom)}"></td>
    <td><input type="number" step="any" data-ref-ruim="${k}" value="${esc(ref[k].ruim)}"></td></tr>`).join("");
  return cartao("Análise inteligente", `<p class="sub" style="margin-bottom:10px">A Análise Inteligente compara cada métrica com a melhor base disponível, nesta ordem: <b>1)</b> histórico da sua conta, <b>2)</b> campanhas parecidas, <b>3)</b> a referência abaixo. Ou seja: estes números só são usados enquanto a conta não tiver histórico suficiente — e você pode mudá-los quando quiser.</p>
    <h3>Referência padrão</h3>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Métrica</th><th>Considerar bom a partir de</th><th>Considerar ruim a partir de</th></tr></thead><tbody>${linhas}</tbody></table></div>
    <h3>Como a análise trata as vendas</h3>
    <p class="sub">Quando a venda acontece no WhatsApp e nem sempre dá tempo de lançar no CRM, contar "nenhuma venda lançada" como "nenhuma venda" derruba a nota de anúncios que estão funcionando.</p>
    <div class="form-grade"><div class="campo largo"><label>Acompanhamento de vendas</label><select data-cfg2="vendas_analise">${MODOS_VENDA.map(([v, t]) => `<option value="${esc(v)}"${normalizarModoVenda(cfg.vendas_analise) === v ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></div></div>
    <div class="lista" style="margin-top:8px">
      ${[["Nem toda venda é lançada", "Sem nenhuma venda no escopo, vendas ficam fora da nota. Com alguma venda, faturamento e ROAS entram como <b>piso</b> (mínimo confirmado) e a taxa de venda e o CPA ficam de fora — assim lançar uma venda de dez nunca piora a avaliação."], ["Toda venda é lançada no CRM", "Usa tudo. Nenhuma venda lançada passa a significar conversão zero de verdade."], ["Não usar vendas na análise", "A leitura para no lead, em qualquer situação."]].map(([t, d]) => `<div class="item"><div class="item-txt"><div class="item-titulo">${esc(t)}</div><div class="item-sub">${d}</div></div></div>`).join("")}
    </div>
    <h3>Quando o sistema pode concluir</h3>
    <p class="sub">Abaixo destes mínimos a análise mostra ⚪ “dados insuficientes” em vez de inventar um diagnóstico. Subir demais esses números deixa o sistema mudo; baixar demais faz ele concluir sobre ruído.</p>
    <div class="form-grade">${Object.keys(ROTULOS_MIN).map((k) => `<div class="campo"><label>${esc(ROTULOS_MIN[k])}</label><input type="number" step="any" data-min="${k}" value="${esc(mins[k])}"></div>`).join("")}
      <div class="campo"><label>Campanhas necessárias para usar o histórico como base</label><input type="number" step="1" data-cfg2="minimo_benchmark" value="${esc(cfg.minimo_benchmark != null ? cfg.minimo_benchmark : 4)}"></div></div>
    ${podeEditar() ? `<button class="btn btn-primario" data-salvar-analise style="margin-top:12px">💾 Salvar referências</button> <button class="btn" data-restaurar-analise style="margin-top:12px">↩️ Voltar ao padrão</button>` : ""}`);
}
function abaMeta() {
  const c = MetaApi.cfg, e = MetaApi.estado;
  const temGestao = e.permissoes.includes("ads_management");
  const contaNome = e.conta ? `${e.conta.name || ""} · ${e.conta.currency || ""}${e.conta.account_status != 1 ? " · ⚠️ conta com restrição" : ""}` : "";
  const val = MetaApi.validadeDaChave();
  const tipoChave = e.chave && e.chave.tipo === "SYSTEM_USER" ? "usuário do sistema" : e.chave && e.chave.tipo ? e.chave.tipo.toLowerCase().replace(/_/g, " ") : "";
  const validadeHtml = !val ? ""
    : val.nunca
      ? `<div class="aviso aviso-ok" style="margin-top:8px">🔒 Esta chave <b>não expira</b>${tipoChave ? ` (${esc(tipoChave)})` : ""}. É o tipo certo para o dia a dia.</div>`
      : `<div class="aviso ${val.curta ? "aviso-alerta" : "aviso-info"}" style="margin-top:8px">⏳ Esta chave <b>${esc(val.texto)}</b> (em ${esc(horaCurta(val.quando.toISOString()))})${tipoChave ? ` · tipo: ${esc(tipoChave)}` : ""}.${val.curta ? " Quando ela morrer, os botões de pausar somem sem aviso. Troque por uma chave de usuário do sistema, que não expira — o passo a passo está logo abaixo." : ""}</div>`;
  const estadoHtml = e.verificado === null
    ? (MetaApi.configurado() ? `<div class="aviso aviso-info">Chave guardada neste aparelho. Clique em "Testar chave" para conferir o acesso.</div>` : `<div class="aviso aviso-info">Ainda sem chave neste aparelho. Sem ela o CRM continua lendo os dados da coleta diária, mas não consegue mexer nas campanhas.</div>`)
    : e.verificado
      ? `<div class="aviso ${temGestao ? "aviso-ok" : "aviso-alerta"}">${temGestao ? "✓" : "⚠️"} Conectado como <b>${esc((e.perfil || {}).name || "")}</b> na conta <b>${esc(contaNome)}</b>.<br>Permissões da chave: ${e.permissoes.length ? e.permissoes.map((p) => `<span class="tag">${esc(p)}</span>`).join(" ") : "nenhuma"}.${temGestao ? "" : "<br><b>Falta <code>ads_management</code></b> — com o que existe hoje dá para ler, não para pausar nem criar campanha."}</div>`
      : `<div class="aviso aviso-erro">Não consegui usar essa chave: ${esc(e.erro || "erro desconhecido")}</div>`;
  return cartao("Meta — controlar campanhas pelo CRM", `
    ${estadoHtml}
    ${validadeHtml}
    <p class="sub" style="margin:10px 0">Com a chave certa, o CRM pausa, reativa, muda orçamento, duplica e sobe campanha direto na sua conta de anúncios. Sem servidor no meio: o navegador fala direto com a Meta.</p>
    <div class="form-grade">
      <div class="campo largo"><label>Chave de acesso (token) com <code>ads_management</code></label><input type="password" id="mtToken" value="${esc(c.token ? "••••••••••••" : "")}" placeholder="EAAG…" autocapitalize="off" autocomplete="off"><small>Gere em developers.facebook.com → sua aplicação → Ferramentas → Explorador da API, marcando <code>ads_management</code>, <code>ads_read</code>, <code>pages_show_list</code> e <code>pages_read_engagement</code>. Depois troque por uma chave de longa duração.</small></div>
      <div class="campo"><label>Conta de anúncios</label><input type="text" id="mtConta" value="${esc(c.conta || "")}" placeholder="act_123456789" autocapitalize="off"></div>
      <div class="campo"><label>Versão da API</label><input type="text" id="mtVersao" value="${esc(c.versao || MetaApi.VERSAO_API)}"></div>
    </div>
    <label class="check" style="margin-top:10px"><input type="checkbox" id="mtLigado"${c.ligado ? " checked" : ""}> <b>Permitir que o CRM altere campanhas nesta conta</b> (pausar, orçamento, duplicar, criar)</label>
    <p class="sub">Desligado, os botões somem das telas e o CRM volta a só ler. É o freio de mão.</p>
    <div class="aviso aviso-alerta" style="margin-top:10px"><b>Onde essa chave fica.</b> Só neste aparelho, no armazenamento do navegador — nunca no banco, no backup nem na nuvem. Quem tem essa chave gasta o dinheiro da conta de anúncios, então ela não é compartilhada entre a equipe: cada pessoa que precisar controlar campanhas cola a dela no próprio aparelho. No celular da sua funcionária, sem chave, os botões simplesmente não aparecem.</div>
    <div id="mtResultado"></div>
    ${podeEditar() ? `<div class="linha-btns" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primario" data-mt-salvar>💾 Salvar e testar</button><button class="btn" data-mt-testar>🔌 Testar chave</button><button class="btn" data-mt-escrita title="Reenvia para uma campanha o status que ela já tem: prova que o comando funciona sem alterar nada">🧪 Testar comando (não altera nada)</button>${MetaApi.configurado() ? `<button class="btn btn-perigo" data-mt-esquecer>🗑️ Esquecer a chave deste aparelho</button>` : ""}</div>` : ""}
    <details style="margin-top:14px"><summary class="sub">Como conseguir uma chave que não expira (recomendado)</summary>
      <p class="sub" style="margin-top:8px">A chave do Explorador da API dura cerca de <b>2 horas</b>, e a estendida dura 60 dias. Quem controla campanhas todo dia acaba tendo que refazer. A chave de <b>usuário do sistema</b> não expira.</p>
      <p class="sub"><b>Atalho:</b> se a coleta automática já funciona, o usuário do sistema <b>já existe</b> — é ele que baixa os dados. Nesse caso basta abrir esse mesmo usuário, <b>Gerar novo token</b> marcando também <code>ads_management</code>, e conferir que a conta de anúncios está nos ativos dele com <b>Controle total</b> (só “ver desempenho” não deixa pausar). Se for criar do zero:</p>
      <ol class="sub" style="padding-left:18px;line-height:1.7">
        <li>Abra <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener">business.facebook.com → Configurações do negócio → Usuários → Usuários do sistema</a>.</li>
        <li><b>Adicionar</b> → nome qualquer (ex.: “CRM Tráfego”) → função <b>Administrador</b>.</li>
        <li>Em <b>Adicionar ativos</b>, escolha <b>Contas de anúncios</b>, marque a sua e dê <b>Controle total</b> — “ver desempenho” lê mas não deixa pausar. Faça o mesmo em <b>Páginas</b> se for subir campanha nova por aqui.</li>
        <li><b>Gerar novo token</b> → escolha a sua aplicação → marque <code>ads_management</code>, <code>ads_read</code>, <code>pages_show_list</code> e <code>pages_read_engagement</code> → Gerar.</li>
        <li>Copie e cole no campo acima. Essa chave vale até você revogá-la.</li>
      </ol>
      <p class="sub">Se a sua aplicação não aparecer na lista do passo 4, ela precisa estar adicionada ao negócio em <b>Configurações do negócio → Contas → Aplicativos</b>.</p>
    </details>
    <h3>O que o CRM faz e o que não faz</h3>
    <div class="lista">
      ${[["Pausar e reativar", "campanha, conjunto e anúncio, com confirmação"], ["Mudar orçamento diário", "com aviso sobre reiniciar o aprendizado"], ["Duplicar campanha", "cópia completa, nascendo pausada"], ["Subir campanha nova", "impulsionando publicação ou com imagem e texto novos"], ["Registrar tudo", "cada ação entra no histórico de decisões, que mede o antes e o depois"]].map(([t, d]) => `<div class="item"><div class="item-txt"><div class="item-titulo">${esc(t)}</div><div class="item-sub">${esc(d)}</div></div><div class="item-dir">${badge("faz", "verde")}</div></div>`).join("")}
      ${[["Apagar campanha", "nunca. Encerrar é decisão para o Gerenciador de Anúncios"], ["Mexer sozinho", "nenhuma ação acontece sem você confirmar na tela"], ["Subir ativa por padrão", "campanha nova e cópia nascem pausadas"]].map(([t, d]) => `<div class="item"><div class="item-txt"><div class="item-titulo">${esc(t)}</div><div class="item-sub">${esc(d)}</div></div><div class="item-dir">${badge("não faz", "cinza")}</div></div>`).join("")}
    </div>`);
}
function abaAutomacoes() {
  const lista = db.all("automations");
  return cartao("Automações", `<p class="sub" style="margin-bottom:10px">Fluxos que rodam sozinhos dentro do CRM: follow-up agendado, tarefa criada, etiqueta e anotação, por gatilho. Nunca alteram campanhas nem tomam decisões de tráfego.</p>` + tabela("automacoes", { colunas: [{ key: "name", label: "Automação" }, { key: "trigger", label: "Gatilho", render: (a) => esc(rotuloOpcao("automation_trigger", a.trigger)) + (a.trigger === "etapa_mudou" && a.stage ? ` <small>${esc(rotuloOpcao("lead_stage", a.stage))}</small>` : "") }, { key: "action", label: "Ação", render: (a) => esc(rotuloOpcao("automation_action", a.action)) + (a.days ? ` <small>${a.days} dia(s)</small>` : "") + (a.value ? ` <small>“${esc(a.value)}”</small>` : "") }, { key: "active", label: "Ativa", render: (a) => a.active === false ? badge("desligada", "cinza") : badge("ligada", "verde") }, { key: "acao", label: "", render: (a) => podeEditar() ? `<button class="btn btn-pq" data-editar-auto="${a.id}">✏️</button>` : "" }], linhas: lista, vazioTxt: "Nenhuma automação." }), podeEditar() ? `<button class="btn btn-pq btn-primario" data-nova-auto>➕ Automação</button>` : "");
}
function abaImportar() {
  const camps = CAMPOS_IMPORT;
  let mapeamento = "";
  if (importState) {
    mapeamento = `<h3>Mapeamento das colunas (${importState.linhas.length} linha(s))</h3><div class="form-grade">${camps.map(([k, l]) => `<div class="campo"><label>${l}</label><select data-map="${k}"><option value="">— não importar —</option>${importState.cabecalho.map((h) => `<option value="${esc(h)}"${importState.mapa[k] === h ? " selected" : ""}>${esc(h)}</option>`).join("")}</select></div>`).join("")}<div class="campo"><label>Plataforma</label><select id="impPlat">${OPCOES.platform.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div><div class="campo"><label>Produto (para campanhas novas)</label><select id="impProd"><option value="">—</option>${db.all("products").map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div><div class="campo"><label>Data fixa (se o arquivo não tiver coluna de dia)</label><input type="date" id="impData"></div></div><p class="sub">Prévia: ${esc(JSON.stringify(importState.linhas[0] || {}).slice(0, 300))}</p><button class="btn btn-primario" data-importar style="margin-top:10px">⬆️ Importar ${importState.linhas.length} linha(s)</button>`;
  }
  return cartao("Importar CSV / XLSX", `<p class="sub" style="margin-bottom:10px">Exporte o relatório do Gerenciador de Anúncios (por dia, com campanha, conjunto e anúncio) e importe aqui. As colunas são reconhecidas automaticamente e podem ser ajustadas. Campanhas, conjuntos e anúncios são criados pelo nome se não existirem.</p><input type="file" id="impArquivo" accept=".csv,.xlsx,.xls,text/csv">${mapeamento}`);
}
function abaIntegracoes() {
  const s = db.settings(); const conta = s.meta_conta || {};
  const linhas = [["Meta Ads (Facebook / Instagram)", META ? `conectado · conta ${esc(conta.nome || conta.id || "")} · dados até ${dataBR((s.meta_periodo || {}).fim)} · gerado ${horaCurta(s.meta_gerado_em)}` : "aguardando dados/meta.json (coleta diária automática)", !!META], ["Google Ads", "lançamento manual ou importação CSV", false], ["TikTok Ads", "lançamento manual ou importação CSV", false], ["WhatsApp (API oficial)", "planejado: exige servidor; hoje o histórico é registrado na ficha do lead", false], ["Instagram / Google Analytics / Pixel / API de Conversões", "planejado", false], ["Planilhas Google / sistema de vendas / estoque", "planejado; hoje via importação CSV/XLSX e cadastro", false]];
  return cartao("Integrações", `<div class="lista">${linhas.map(([n, d, ok]) => `<div class="item"><div class="item-txt"><div class="item-titulo">${n}</div><div class="item-sub">${d}</div></div><div class="item-dir">${ok ? badge("ativa", "verde") : badge("manual", "cinza")}</div></div>`).join("")}</div><p class="sub" style="margin-top:10px">A estrutura já recebe dados de qualquer fonte pela tabela <code>campaign_metrics</code> (com origem). Quando uma API for ligada, ela grava nessa tabela e todos os indicadores passam a considerá-la.</p><div class="linha-btns" style="margin-top:10px"><button class="btn btn-pq" data-recarregar-meta>🔄 Recarregar dados da Meta</button></div>`);
}
function abaNuvem() {
  return cartao("☁️ Nuvem (vários aparelhos)", nuvemLigada() ? `<div class="aviso ${nuvem.erro ? "aviso-erro" : "aviso-ok"}">${nuvem.erro ? "⚠️ " + esc(nuvem.erro) : `✓ Conectado a <b>${esc(nuvem.repo)}</b>${nuvem.ultimaSync ? " · última sincronização " + esc(horaCurta(nuvem.ultimaSync)) : ""}`}</div><div class="linha-btns"><button class="btn btn-pq" data-nuvem-agora>🔄 Sincronizar agora</button> <button class="btn btn-pq" data-nuvem-sair>Desconectar</button></div>` : `<p class="sub">O banco fica neste aparelho. Para usar em vários celulares/computadores, guarde-o num <b>repositório privado</b> do GitHub: o CRM mescla as alterações de cada aparelho.</p><div class="form-grade" style="margin-top:10px"><div class="campo"><label>Repositório privado (usuário/nome)</label><input type="text" id="nvRepo" value="${esc(nuvem.repo || "heroslore/crm-dados")}" autocapitalize="off"></div><div class="campo"><label>Chave fine-grained (Contents: Read and write)</label><input type="password" id="nvToken" placeholder="github_pat_…"></div></div><button class="btn btn-primario" data-nuvem-conectar style="margin-top:10px">☁️ Conectar</button>`);
}
function abaDados() {
  const cont = db.tabelas().map((t) => `${t}: ${db.count(t)}`).join(" · ");
  const versao = (document.querySelector('meta[name="crm-versao"]') || {}).content || "local";
  return cartao("Sistema", `<p class="sub">Versão publicada: <code>${esc(versao)}</code>. Se uma novidade não aparecer no celular, é o navegador guardando a versão antiga.</p><button class="btn btn-primario" data-atualizar-sistema style="margin-top:8px">🔄 Baixar a versão mais nova</button>`)
    + cartao("Dados e backup", `<p class="sub">${esc(cont)}</p><div class="linha-btns" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-exportar>⬇️ Baixar backup (JSON)</button><label class="btn" style="cursor:pointer">⬆️ Restaurar backup <input type="file" id="impBackup" accept="application/json" style="display:none"></label>${db.temDemo() ? `<button class="btn btn-perigo" data-remover-demo>🧪 Remover dados de demonstração</button>` : `<button class="btn" data-inserir-demo>🧪 Inserir dados de demonstração</button>`}${ehAdmin() ? `<button class="btn btn-perigo" data-limpar>🗑️ Apagar tudo</button>` : ""}</div><p class="sub" style="margin-top:10px">Registros de demonstração são marcados e podem ser removidos de uma vez sem afetar os dados reais.</p>`);
}

const rotuloCanal = (c) => (W.PROVIDERS.find((x) => x[0] === c) || [, c])[1];
function abaMensagens() {
  W.carregarCfg();
  const st = W.estado, p = st.perfil || {};
  const numero = p.phone || p.number || p.wid || p.user || (p.profile && p.profile.number) || "";
  const canaisOff = Object.entries(st.canaisIndisponiveis || {});
  const status = st.erro ? `<div class="aviso aviso-erro">⚠️ ${esc(st.erro)}</div>`
    : st.conectado === true ? `<div class="aviso aviso-ok">✓ Conectada${numero ? " · número " + esc(numero) : ""}${p.name ? " · " + esc(p.name) : ""}${st.oficial === true ? " · conta oficial (Cloud API)" : st.oficial === false ? " · conexão por QR Code" : ""}${st.ultima ? " · última leitura " + esc(horaCurta(st.ultima)) : ""}</div>`
    : st.conectado === false ? `<div class="aviso aviso-alerta">A instância respondeu, mas está sem sessão do WhatsApp. Conecte pelo QR Code abaixo ou pelo portal da api-wa.me.</div>`
    : W.configurado() ? `<div class="aviso aviso-info">Chave salva. Clique em "Testar conexão".</div>` : "";
  const avisoCanais = canaisOff.length ? `<div class="aviso aviso-alerta">${canaisOff.map(([c, m]) => `<b>${esc(rotuloCanal(c))}</b>: ${esc(m)}`).join("<br>")}<div style="margin-top:4px">Instagram e Messenger só aparecem quando você liga esses canais no portal da api-wa.me (a conexão por QR Code cobre apenas o WhatsApp).</div></div>` : "";
  const rr = W.respostasRapidas();
  return cartao("💬 WhatsApp, Instagram e Messenger (api-wa.me)", `
    <p class="sub" style="margin-bottom:10px">O CRM fala direto com a API da <b>api-wa.me</b> pelo navegador, sem servidor no meio. Cole a <b>key</b> da sua instância (a que aparece na URL <code>us.api-wa.me/SUA_KEY/...</code>).</p>
    <div class="aviso aviso-alerta"><b>A chave fica só neste aparelho</b>, fora do backup e da nuvem: quem tem a chave controla o WhatsApp da loja. Cada pessoa cola a dela no próprio celular. Esta é uma API não oficial do WhatsApp; usar um número que não seja o comercial não é recomendado.</div>
    <div class="form-grade">
      <div class="campo"><label>Servidor</label><select id="wmBase">${[...new Set([...W.BASES, W.cfg.base].filter(Boolean))].map((b) => `<option value="${esc(b)}"${W.cfg.base === b ? " selected" : ""}>${esc(b)}</option>`).join("")}</select></div>
      <div class="campo"><label>Key da instância</label><input type="password" id="wmKey" value="${esc(W.cfg.key)}" placeholder="cole aqui a key" autocomplete="off"></div>
      <div class="campo"><label>Canais ligados</label><div style="display:flex;gap:12px;flex-wrap:wrap;padding-top:6px">${W.PROVIDERS.map(([v, t, i]) => `<label class="check" style="padding:0"><input type="checkbox" data-canal="${v}"${W.cfg.canais[v] ? " checked" : ""}> ${i} ${t}</label>`).join("")}</div></div>
      <div class="campo"><label>Atualizar a cada (segundos)</label><input type="number" id="wmInt" min="6" max="120" value="${esc(W.cfg.intervalo)}"></div>
      <div class="campo largo"><label class="check"><input type="checkbox" id="wmAuto"${W.cfg.auto_lead ? " checked" : ""}> Criar lead automaticamente quando chegar mensagem de alguém que ainda não está no CRM</label></div>
      <div class="campo largo"><label class="check"><input type="checkbox" id="wmLido"${W.cfg.marcar_lido ? " checked" : ""}> Marcar a conversa como lida no WhatsApp quando eu abrir aqui</label></div>
      <div class="campo largo"><label class="check"><input type="checkbox" id="wmMidia"${W.salvaMidia() ? " checked" : ""} data-tocado="0"> Guardar as mídias na instância — <b>necessário para ver imagens, áudios e vídeos aqui</b></label>
        <small>${W.salvaMidia() === true ? "Está ligado na instância." : W.salvaMidia() === false ? "Está desligado na instância." : "A instância não informou como está. Só mexa nesta opção se quiser mudar; deixada em paz, nada é alterado lá."}</small></div>
    </div>
    <div class="linha-btns" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="btn btn-primario" data-wm-salvar>💾 Salvar</button>
      <button class="btn" data-wm-testar>🔌 Testar conexão</button>
      <button class="btn" data-wm-qr>📱 Conectar por QR Code</button>
      ${(W.cfg.canais.instagram || W.cfg.canais.messenger) ? `<button class="btn" data-wm-hist title="Puxa as conversas recentes de Instagram e Messenger (precisa desses canais ligados no portal)">📥 Puxar histórico do Instagram/Messenger</button>` : ""}
      ${W.configurado() ? `<button class="btn btn-perigo" data-wm-limpar>Remover chave deste aparelho</button>` : ""}
    </div>
    ${status}
    ${W.salvaMidia() === false ? `<div class="aviso aviso-alerta">As mídias não estão sendo guardadas na instância, então imagens, áudios e vídeos podem não abrir nas Conversas. Marque a opção acima e salve, ou ligue "Salvar mídia no S3" no portal da api-wa.me.</div>` : ""}
    ${avisoCanais}
    <div id="wmQr"></div>
    ${st.diagnostico ? `<details style="margin-top:8px"><summary class="mudo" style="cursor:pointer;font-size:.8rem">Ver o que a API respondeu (diagnóstico)</summary><pre style="white-space:pre-wrap;font-size:.72rem;background:var(--card2);border:1px solid var(--borda);border-radius:8px;padding:8px;overflow:auto;max-height:220px">${esc(st.diagnostico)}</pre></details>` : ""}
    <h3>Respostas rápidas</h3>
    <p class="sub">Atalhos que aparecem no ⚡ da conversa. Uma por linha, no formato <code>Título | texto da mensagem</code>.</p>
    <textarea id="wmRR" style="min-height:120px">${esc(rr.map((r) => `${r.titulo} | ${r.texto}`).join("\n"))}</textarea>
    <button class="btn btn-pq btn-primario" data-wm-rr style="margin-top:8px">💾 Salvar respostas</button>
  `);
}

export default {
  id: "config", titulo: "Configurações", icone: "⚙️",
  render(root, ctx) {
    if (ctx.rota.aba) aba = ctx.rota.aba;
    const corpo = { empresa: abaEmpresa, usuarios: abaUsuarios, mensagens: abaMensagens, meta: abaMeta, metas: abaMetas, analise: abaAnalise, automacoes: abaAutomacoes, importar: abaImportar, integracoes: abaIntegracoes, nuvem: abaNuvem, dados: abaDados }[aba] || abaEmpresa;
    root.innerHTML = `<div class="pagina-cab"><div><h1>Configurações</h1><p class="sub">Empresas, usuários e permissões, mensagens (WhatsApp/Instagram/Messenger), metas, referências da análise, automações, importação, integrações, nuvem e backup</p></div></div>${abas([["empresa", "Empresas"], ["usuarios", "Usuários"], ["mensagens", "Mensagens"], ["meta", "Meta (campanhas)"], ["metas", "Metas e alertas"], ["analise", "Análise"], ["automacoes", "Automações"], ["importar", "Importar dados"], ["integracoes", "Integrações"], ["nuvem", "Nuvem"], ["dados", "Dados e backup"]], aba)}${corpo(ctx)}`;
    root.querySelectorAll("[data-aba]").forEach((b) => b.addEventListener("click", () => { aba = b.dataset.aba; ctx.navegar(`#/config?aba=${aba}`); }));
    const on = (sel, ev, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(el, e)));
    on("[data-wm-salvar]", "click", async () => {
      const canais = {}; root.querySelectorAll("[data-canal]").forEach((c) => canais[c.dataset.canal] = c.checked);
      W.salvarCfg({ base: root.querySelector("#wmBase").value, key: root.querySelector("#wmKey").value.trim(), canais, intervalo: Number(root.querySelector("#wmInt").value) || 12, auto_lead: root.querySelector("#wmAuto").checked, marcar_lido: root.querySelector("#wmLido").checked });
      const caixaMidia = root.querySelector("#wmMidia");
      const querMidia = caixaMidia.checked;
      toast("Configuração salva.");
      // Só mexe na instância se a pessoa realmente clicou na opção: assim uma
      // configuração que já está certa no portal nunca é desligada sem querer.
      if (W.configurado() && caixaMidia.dataset.tocado === "1" && querMidia !== W.salvaMidia()) {
        try { await W.ajustarInstancia({ saveMedia: querMidia }); toast(querMidia ? "A instância passou a guardar as mídias. Mensagens novas já aparecem com imagem." : "A instância deixou de guardar mídias."); }
        catch (e) { toast("Não consegui mudar o salvamento de mídia: " + e.message, "erro"); }
      }
      W.iniciarPolling(); W.verificarConexao().catch(() => {}).finally(() => ctx.rerender());
    });
    on("#wmMidia", "change", (el) => { el.dataset.tocado = "1"; });
    on("[data-wm-testar]", "click", async () => { try { const d = await W.verificarConexao(); toast("Conectado."); console.log("instância:", d); } catch (e) { toast("Falhou: " + e.message, "erro"); } ctx.rerender(); });
    on("[data-wm-qr]", "click", async () => {
      const alvo = root.querySelector("#wmQr"); alvo.innerHTML = `<div class="aviso aviso-info">Gerando QR Code…</div>`;
      try {
        const d = await W.conectarQr();
        const qr = d && (d.qrcode || d.qr || d.base64 || d.qrCode || (d.data && (d.data.qrcode || d.data.qr)));
        alvo.innerHTML = qr ? `<div class="aviso aviso-info">Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho e aponte para o código. Ele expira em cerca de 1 minuto.</div><img src="${/^data:/.test(qr) ? esc(qr) : "data:image/png;base64," + esc(qr)}" alt="QR Code" style="width:240px;border-radius:12px;background:#fff;padding:8px">`
          : `<div class="aviso aviso-ok">A API respondeu sem QR Code: a instância provavelmente já está conectada. Clique em "Testar conexão".</div>`;
      } catch (e) {
        alvo.innerHTML = e.jaConectada
          ? `<div class="aviso aviso-ok">A instância já está conectada — não precisa de QR Code. Se as conversas não aparecerem, clique em "Testar conexão".</div>`
          : `<div class="aviso aviso-erro">Não deu: ${esc(e.message)}</div>`;
        if (e.jaConectada) W.estado.conectado = true;
      }
    });
    on("[data-wm-hist]", "click", async () => {
      try { await W.sincronizarHistoricoMeta(); toast("Pedido enviado. As conversas de Instagram e Messenger aparecem em instantes."); W.atualizar(); }
      catch (e) {
        if (e.soOficial) modal(`<p>Puxar o histórico de Instagram e Messenger só funciona quando o número está ligado à <b>Cloud API oficial</b> da Meta. Sua instância está conectada por <b>QR Code</b>, que atende apenas o WhatsApp.</p><p class="sub" style="margin-top:8px">Para usar Instagram e Messenger aqui, ligue esses canais no portal da api-wa.me (o login é feito com a conta da Meta, não depende da aprovação de documentos do WhatsApp). Enquanto isso, deixe só o WhatsApp marcado nos canais.</p><div class="form-acoes"><button class="btn" data-fechar-modal>Entendi</button></div>`, { titulo: "Recurso da conta oficial" });
        else toast("Não deu: " + e.message, "erro");
      }
    });
    on("[data-wm-limpar]", "click", () => { if (confirm("Remover a chave deste aparelho? As conversas deixam de aparecer aqui.")) { W.limparCfg(); ctx.rerender(); } });
    on("[data-wm-rr]", "click", () => {
      const linhas = root.querySelector("#wmRR").value.split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => { const [t, ...r] = l.split("|"); return { id: "r" + (i + 1), titulo: (t || "").trim() || "Atalho " + (i + 1), texto: r.join("|").trim() }; });
      W.salvarRespostas(linhas); toast("Respostas rápidas salvas.");
    });
    on("[data-nova-emp]", "click", () => abrirFormulario("companies", null, { onSave: ctx.rerender }));
    on("[data-editar-emp]", "click", (el) => abrirFormulario("companies", el.dataset.editarEmp, { onSave: ctx.rerender, onDelete: ctx.rerender }));
    on("[data-novo-user]", "click", () => abrirFormulario("users", null, { onSave: ctx.rerender }));
    on("[data-editar-user]", "click", (el) => abrirFormulario("users", el.dataset.editarUser, { onSave: ctx.rerender, onDelete: ctx.rerender, permitirApagar: el.dataset.editarUser !== (usuario() || {}).id }));
    const testarMeta = async () => {
      try { await MetaApi.verificar(); toast(MetaApi.podeEscrever() ? "Conectado. O controle das campanhas está ligado." : "Chave aceita, mas o controle ainda não está liberado."); }
      catch (e) { toast("Não deu: " + e.message, "erro"); }
      ctx.rerender();
    };
    on("[data-mt-salvar]", "click", async () => {
      const t = root.querySelector("#mtToken").value.trim();
      MetaApi.salvarCfg({
        ...(t && !/^•+$/.test(t) ? { token: t } : {}),
        conta: root.querySelector("#mtConta").value.trim(),
        versao: root.querySelector("#mtVersao").value.trim() || MetaApi.VERSAO_API,
        ligado: root.querySelector("#mtLigado").checked,
      });
      await testarMeta();
    });
    on("[data-mt-testar]", "click", testarMeta);
    on("[data-mt-escrita]", "click", async () => {
      const alvo = root.querySelector("#mtResultado");
      const camp = db.where("campaigns", (c) => c.external_id && c.source === "meta").sort((a, b) => (a.status === "pausada" ? -1 : 1) - (b.status === "pausada" ? -1 : 1))[0];
      if (!camp) { alvo.innerHTML = `<div class="aviso aviso-alerta">Nenhuma campanha vinda da Meta no CRM para testar. Espere a próxima coleta.</div>`; return; }
      alvo.innerHTML = `<div class="aviso aviso-info">Testando em “${esc(camp.name)}”…</div>`;
      try {
        const r = await MetaApi.testarEscrita(camp.external_id);
        alvo.innerHTML = `<div class="aviso aviso-ok"><b>✓ O comando funciona.</b> A Meta aceitou a alteração em “${esc(r.nome)}” e o status continua <b>${esc(r.status_depois)}</b>${r.inalterado ? " (nada mudou, como esperado)" : ""}.<br>Pausar, reativar, orçamento, duplicar e encerrar vão funcionar nas telas de campanha e de anúncio.</div>`;
      } catch (e) {
        alvo.innerHTML = `<div class="aviso aviso-erro"><b>✗ O comando não passou.</b> ${esc(e.message)}${e.codigo ? `<br><small>código ${esc(e.codigo)}</small>` : ""}</div>`;
      }
    });
    on("[data-mt-esquecer]", "click", () => {
      if (!confirm("Apagar a chave da Meta deste aparelho? O CRM volta a só ler os dados da coleta.")) return;
      MetaApi.limparCfg(); toast("Chave apagada deste aparelho."); ctx.rerender();
    });
    on("[data-salvar-analise]", "click", () => {
      const ref = {};
      root.querySelectorAll("[data-ref-bom]").forEach((i) => { const k = i.dataset.refBom; ref[k] = { ...(ref[k] || {}), bom: Number(i.value) }; });
      root.querySelectorAll("[data-ref-ruim]").forEach((i) => { const k = i.dataset.refRuim; ref[k] = { ...(ref[k] || {}), ruim: Number(i.value) }; });
      const mins = {};
      root.querySelectorAll("[data-min]").forEach((i) => { if (i.value !== "") mins[i.dataset.min] = Number(i.value); });
      const extra = {};
      root.querySelectorAll("[data-cfg2]").forEach((i) => { extra[i.dataset.cfg2] = i.tagName === "SELECT" ? i.value : (Number(i.value) || 0); });
      db.setSettings({ referencias: ref, minimos_analise: mins, ...extra });
      toast("Referências salvas. A análise já usa os novos valores.");
      ctx.rerender();
    });
    on("[data-restaurar-analise]", "click", () => { db.setSettings({ referencias: null, minimos_analise: null, vendas_analise: MODO_VENDA_PADRAO }); toast("Referência padrão restaurada."); ctx.rerender(); });
    on("[data-salvar-metas]", "click", () => { root.querySelectorAll("[data-meta]").forEach((i) => db.setGoal(i.dataset.meta, METAS.find((m) => m[0] === i.dataset.meta)[1], Number(i.value) || 0)); const cfg = {}; root.querySelectorAll("[data-cfg]").forEach((i) => cfg[i.dataset.cfg] = Number(i.value) || 0);
      const taxas = {}; root.querySelectorAll("[data-taxa]").forEach((i) => taxas[i.dataset.taxa] = Number(i.value) || 0);
      db.setSettings({ ...cfg, taxas }); toast("Metas, regras e taxas salvas."); ctx.rerender(); });
    on("[data-nova-auto]", "click", () => abrirFormulario("automations", null, { onSave: ctx.rerender }));
    on("[data-editar-auto]", "click", (el) => abrirFormulario("automations", el.dataset.editarAuto, { onSave: ctx.rerender, onDelete: ctx.rerender }));
    on("#impArquivo", "change", async (el) => { const f = el.files[0]; if (!f) return; try { const r = /\.xlsx?$/i.test(f.name) ? await lerXLSX(f) : lerCSV(await f.text()); importState = { ...r, mapa: mapearColunas(r.cabecalho) }; toast(`${r.linhas.length} linha(s) lidas.`); ctx.rerender(); } catch (e) { toast("Não consegui ler: " + e.message, "erro"); } });
    on("[data-map]", "change", (el) => { importState.mapa[el.dataset.map] = el.value; });
    on("[data-importar]", "click", () => { if (!importState) return; if (!importState.mapa.campaign) { toast("Escolha a coluna da campanha.", "erro"); return; } const r = importar(importState.linhas, importState.mapa, { platform: root.querySelector("#impPlat").value, product_id: root.querySelector("#impProd").value, dataFixa: root.querySelector("#impData").value }); toast(`Importado: ${r.novas} nova(s), ${r.atualizadas} atualizada(s), ${r.campanhasNovas} campanha(s) criada(s).`); importState = null; ctx.rerender(); });
    on("[data-recarregar-meta]", "click", async () => { const r = await carregarMeta({ forcar: true }); toast(r.ok ? "Dados da Meta recarregados." : "Não achei dados/meta.json.", r.ok ? "" : "erro"); ctx.rerender(); });
    on("[data-nuvem-conectar]", "click", async () => { try { const info = await conectar(root.querySelector("#nvRepo").value, root.querySelector("#nvToken").value); if (info.private === false && !confirm("O repositório é PÚBLICO: leads e vendas ficariam visíveis. Continuar mesmo assim?")) { desconectar(); ctx.rerender(); return; } toast("Nuvem conectada."); } catch (e) { toast("Não conectou: " + e.message, "erro"); } ctx.rerender(); });
    on("[data-nuvem-agora]", "click", async () => { await sincronizar("manual"); toast(nuvem.erro ? "Erro: " + nuvem.erro : "Sincronizado."); ctx.rerender(); });
    on("[data-nuvem-sair]", "click", () => { if (confirm("Desconectar este aparelho da nuvem? Os dados continuam aqui.")) { desconectar(); ctx.rerender(); } });
    on("[data-atualizar-sistema]", "click", async () => {
      toast("Buscando a versão mais nova…");
      try { if (window.caches) { for (const c of await caches.keys()) await caches.delete(c); } } catch {}
      db.gravarAgora();
      let nova = String(Date.now());
      try { const r = await fetch("versao.json?_=" + Date.now(), { cache: "no-store" }); if (r.ok) { const j = await r.json(); if (j && j.versao) nova = j.versao; } } catch {}
      try { sessionStorage.removeItem("crm-recarga-" + nova); } catch {}
      const u = new URL(location.href); u.searchParams.set("v", nova); location.replace(u.toString());
    });
    on("[data-exportar]", "click", () => { const blob = new Blob([db.exportar()], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `crm-trafego-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); });
    on("#impBackup", "change", (el) => { const f = el.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { db.importar(JSON.parse(rd.result), confirm("OK = mesclar com os dados atuais · Cancelar = substituir tudo pelo backup") ? "mesclar" : "substituir"); toast("Backup restaurado."); ctx.rerender(); } catch (e) { toast("Não deu: " + e.message, "erro"); } }; rd.readAsText(f); });
    on("[data-remover-demo]", "click", () => { if (!confirm("Remover todos os registros de demonstração?")) return; const n = db.removerDemo(); toast(`${n} registro(s) de demonstração removidos.`); ctx.rerender(); });
    on("[data-inserir-demo]", "click", () => { inserirDemonstracao(); db.setSettings({ demo_removido: false }); toast("Dados de demonstração inseridos."); ctx.rerender(); });
    on("[data-limpar]", "click", () => { if (prompt('Isso apaga TODOS os dados deste aparelho (e da nuvem na próxima sincronização). Digite APAGAR para confirmar:') !== "APAGAR") return; db.limparTudo(); db.setSettings({ demo_removido: true }); db.gravarAgora(); location.reload(); });
  },
};
