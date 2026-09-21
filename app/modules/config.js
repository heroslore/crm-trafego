import { db, inserirDemonstracao } from "../core/db.js?v=02b90ebf";
import { cartao, tabela, badge, badgeOpcao, abrirFormulario, vazio, abas, toast, modal, fecharModal, kpi } from "../core/ui.js?v=02b90ebf";
import { esc, dataBR, horaCurta, brl, inteiro } from "../core/format.js?v=02b90ebf";
import { rotulo as rotuloOpcao, OPCOES } from "../core/schema.js?v=02b90ebf";
import { PERMISSOES, ehAdmin, podeEditar, usuario } from "../core/auth.js?v=02b90ebf";
import { nuvem, nuvemLigada, conectar, desconectar, sincronizar, carregarMeta, META } from "../core/sync.js?v=02b90ebf";
import { lerCSV, lerXLSX, mapearColunas, importar, CAMPOS_IMPORT } from "../core/importer.js?v=02b90ebf";
import * as W from "../core/wame.js?v=02b90ebf";

let aba = "empresa", importState = null;
const METAS = [["faturamento_mes", "Meta de faturamento mensal (R$)"], ["faturamento_semana", "Meta de faturamento semanal (R$)"], ["vendas_mes", "Meta de vendas no mês"], ["leads_mes", "Meta de leads no mês"], ["roas_min", "ROAS mínimo"], ["cpa_max", "CPA máximo (R$)"], ["cpl_max", "CPL máximo (R$)"], ["ticket_medio", "Ticket médio desejado (R$)"], ["investimento_max_mes", "Investimento máximo mensal (R$)"], ["ctr_min", "CTR mínimo (%)"]];

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
  return cartao("Metas", `<p class="sub" style="margin-bottom:10px">As metas definem os indicadores Excelente / Bom / Atenção / Ruim, as barras de progresso e os alertas.</p><div class="form-grade">${METAS.map(([k, l]) => `<div class="campo"><label>${l}</label><input type="number" step="any" inputmode="decimal" data-meta="${k}" value="${esc(db.goal(k, 0) || "")}"></div>`).join("")}</div><h3>Regras dos alertas</h3><div class="form-grade">${[["gasto_sem_venda", "Alertar campanha que gastou mais que (R$) sem lead/venda", 100], ["cpa_alta_pct", "Alertar quando o CPA subir mais que (%)", 30], ["limite_freq", "Frequência que indica saturação", 3], ["dias_produto_parado", "Dias sem venda para produto parado", 15]].map(([k, l, d]) => `<div class="campo"><label>${l}</label><input type="number" step="any" data-cfg="${k}" value="${esc(cfg[k] != null ? cfg[k] : d)}"></div>`).join("")}</div>${podeEditar() ? `<button class="btn btn-primario" data-salvar-metas style="margin-top:12px">💾 Salvar metas e regras</button>` : ""}`);
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

function abaMensagens() {
  W.carregarCfg();
  const st = W.estado, p = st.perfil || {};
  const numero = p.phone || p.number || p.wid || p.user || (p.profile && p.profile.number) || "";
  const status = st.erro ? `<div class="aviso aviso-erro">⚠️ ${esc(st.erro)}</div>`
    : st.conectado === true ? `<div class="aviso aviso-ok">✓ Conectado${numero ? " · número " + esc(numero) : ""}${p.name ? " · " + esc(p.name) : ""}${st.ultima ? " · última leitura " + esc(horaCurta(st.ultima)) : ""}</div>`
    : st.conectado === false ? `<div class="aviso aviso-alerta">Instância não conectada. Use o QR Code abaixo ou conecte pelo portal da api-wa.me.</div>`
    : W.configurado() ? `<div class="aviso aviso-info">Chave salva. Clique em "Testar conexão".</div>` : "";
  const rr = W.respostasRapidas();
  return cartao("💬 WhatsApp, Instagram e Messenger (api-wa.me)", `
    <p class="sub" style="margin-bottom:10px">O CRM fala direto com a API da <b>api-wa.me</b> pelo navegador, sem servidor no meio. Cole a <b>key</b> da sua instância (a que aparece na URL <code>us.api-wa.me/SUA_KEY/...</code>).</p>
    <div class="aviso aviso-alerta"><b>A chave fica só neste aparelho</b>, fora do backup e da nuvem: quem tem a chave controla o WhatsApp da loja. Cada pessoa cola a dela no próprio celular. Esta é uma API não oficial do WhatsApp; usar um número que não seja o comercial não é recomendado.</div>
    <div class="form-grade">
      <div class="campo"><label>Servidor</label><select id="wmBase">${["https://us.api-wa.me", "https://server.api-wa.me"].map((b) => `<option value="${b}"${W.cfg.base === b ? " selected" : ""}>${b}</option>`).join("")}</select></div>
      <div class="campo"><label>Key da instância</label><input type="password" id="wmKey" value="${esc(W.cfg.key)}" placeholder="cole aqui a key" autocomplete="off"></div>
      <div class="campo"><label>Canais ligados</label><div style="display:flex;gap:12px;flex-wrap:wrap;padding-top:6px">${W.PROVIDERS.map(([v, t, i]) => `<label class="check" style="padding:0"><input type="checkbox" data-canal="${v}"${W.cfg.canais[v] ? " checked" : ""}> ${i} ${t}</label>`).join("")}</div></div>
      <div class="campo"><label>Atualizar a cada (segundos)</label><input type="number" id="wmInt" min="6" max="120" value="${esc(W.cfg.intervalo)}"></div>
      <div class="campo largo"><label class="check"><input type="checkbox" id="wmAuto"${W.cfg.auto_lead ? " checked" : ""}> Criar lead automaticamente quando chegar mensagem de alguém que ainda não está no CRM</label></div>
      <div class="campo largo"><label class="check"><input type="checkbox" id="wmLido"${W.cfg.marcar_lido ? " checked" : ""}> Marcar a conversa como lida no WhatsApp quando eu abrir aqui</label></div>
    </div>
    <div class="linha-btns" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="btn btn-primario" data-wm-salvar>💾 Salvar</button>
      <button class="btn" data-wm-testar>🔌 Testar conexão</button>
      <button class="btn" data-wm-qr>📱 Conectar por QR Code</button>
      <button class="btn" data-wm-hist title="Puxa as conversas recentes de Instagram e Messenger para a instância">📥 Sincronizar Instagram/Messenger</button>
      ${W.configurado() ? `<button class="btn btn-perigo" data-wm-limpar>Remover chave deste aparelho</button>` : ""}
    </div>
    ${status}
    <div id="wmQr"></div>
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
    const corpo = { empresa: abaEmpresa, usuarios: abaUsuarios, mensagens: abaMensagens, metas: abaMetas, automacoes: abaAutomacoes, importar: abaImportar, integracoes: abaIntegracoes, nuvem: abaNuvem, dados: abaDados }[aba] || abaEmpresa;
    root.innerHTML = `<div class="pagina-cab"><div><h1>Configurações</h1><p class="sub">Empresas, usuários e permissões, mensagens (WhatsApp/Instagram/Messenger), metas, automações, importação, integrações, nuvem e backup</p></div></div>${abas([["empresa", "Empresas"], ["usuarios", "Usuários"], ["mensagens", "Mensagens"], ["metas", "Metas e alertas"], ["automacoes", "Automações"], ["importar", "Importar dados"], ["integracoes", "Integrações"], ["nuvem", "Nuvem"], ["dados", "Dados e backup"]], aba)}${corpo(ctx)}`;
    root.querySelectorAll("[data-aba]").forEach((b) => b.addEventListener("click", () => { aba = b.dataset.aba; ctx.navegar(`#/config?aba=${aba}`); }));
    const on = (sel, ev, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(el, e)));
    on("[data-wm-salvar]", "click", () => {
      const canais = {}; root.querySelectorAll("[data-canal]").forEach((c) => canais[c.dataset.canal] = c.checked);
      W.salvarCfg({ base: root.querySelector("#wmBase").value, key: root.querySelector("#wmKey").value.trim(), canais, intervalo: Number(root.querySelector("#wmInt").value) || 12, auto_lead: root.querySelector("#wmAuto").checked, marcar_lido: root.querySelector("#wmLido").checked });
      toast("Configuração salva."); W.iniciarPolling(); W.verificarConexao().catch(() => {}).finally(() => ctx.rerender());
    });
    on("[data-wm-testar]", "click", async () => { try { const d = await W.verificarConexao(); toast("Conectado."); console.log("instância:", d); } catch (e) { toast("Falhou: " + e.message, "erro"); } ctx.rerender(); });
    on("[data-wm-qr]", "click", async () => {
      const alvo = root.querySelector("#wmQr"); alvo.innerHTML = `<div class="aviso aviso-info">Gerando QR Code…</div>`;
      try {
        const d = await W.conectarQr();
        const qr = d && (d.qrcode || d.qr || d.base64 || d.qrCode || (d.data && (d.data.qrcode || d.data.qr)));
        alvo.innerHTML = qr ? `<div class="aviso aviso-info">Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho e aponte para o código. Ele expira em cerca de 1 minuto.</div><img src="${/^data:/.test(qr) ? esc(qr) : "data:image/png;base64," + esc(qr)}" alt="QR Code" style="width:240px;border-radius:12px;background:#fff;padding:8px">`
          : `<div class="aviso aviso-ok">A API respondeu sem QR Code: a instância provavelmente já está conectada. Clique em "Testar conexão".</div>`;
      } catch (e) { alvo.innerHTML = `<div class="aviso aviso-erro">Não deu: ${esc(e.message)}</div>`; }
    });
    on("[data-wm-hist]", "click", async () => { try { await W.sincronizarHistoricoMeta(); toast("Pedido de sincronização enviado. As conversas aparecem em instantes."); W.atualizar(); } catch (e) { toast("Não deu: " + e.message, "erro"); } });
    on("[data-wm-limpar]", "click", () => { if (confirm("Remover a chave deste aparelho? As conversas deixam de aparecer aqui.")) { W.limparCfg(); ctx.rerender(); } });
    on("[data-wm-rr]", "click", () => {
      const linhas = root.querySelector("#wmRR").value.split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => { const [t, ...r] = l.split("|"); return { id: "r" + (i + 1), titulo: (t || "").trim() || "Atalho " + (i + 1), texto: r.join("|").trim() }; });
      W.salvarRespostas(linhas); toast("Respostas rápidas salvas.");
    });
    on("[data-nova-emp]", "click", () => abrirFormulario("companies", null, { onSave: ctx.rerender }));
    on("[data-editar-emp]", "click", (el) => abrirFormulario("companies", el.dataset.editarEmp, { onSave: ctx.rerender, onDelete: ctx.rerender }));
    on("[data-novo-user]", "click", () => abrirFormulario("users", null, { onSave: ctx.rerender }));
    on("[data-editar-user]", "click", (el) => abrirFormulario("users", el.dataset.editarUser, { onSave: ctx.rerender, onDelete: ctx.rerender, permitirApagar: el.dataset.editarUser !== (usuario() || {}).id }));
    on("[data-salvar-metas]", "click", () => { root.querySelectorAll("[data-meta]").forEach((i) => db.setGoal(i.dataset.meta, METAS.find((m) => m[0] === i.dataset.meta)[1], Number(i.value) || 0)); const cfg = {}; root.querySelectorAll("[data-cfg]").forEach((i) => cfg[i.dataset.cfg] = Number(i.value) || 0); db.setSettings(cfg); toast("Metas salvas."); ctx.rerender(); });
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
      const u = new URL(location.href); u.searchParams.set("v", Date.now()); location.replace(u.toString());
    });
    on("[data-exportar]", "click", () => { const blob = new Blob([db.exportar()], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `crm-trafego-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); });
    on("#impBackup", "change", (el) => { const f = el.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { db.importar(JSON.parse(rd.result), confirm("OK = mesclar com os dados atuais · Cancelar = substituir tudo pelo backup") ? "mesclar" : "substituir"); toast("Backup restaurado."); ctx.rerender(); } catch (e) { toast("Não deu: " + e.message, "erro"); } }; rd.readAsText(f); });
    on("[data-remover-demo]", "click", () => { if (!confirm("Remover todos os registros de demonstração?")) return; const n = db.removerDemo(); toast(`${n} registro(s) de demonstração removidos.`); ctx.rerender(); });
    on("[data-inserir-demo]", "click", () => { inserirDemonstracao(); db.setSettings({ demo_removido: false }); toast("Dados de demonstração inseridos."); ctx.rerender(); });
    on("[data-limpar]", "click", () => { if (prompt('Isso apaga TODOS os dados deste aparelho (e da nuvem na próxima sincronização). Digite APAGAR para confirmar:') !== "APAGAR") return; db.limparTudo(); db.setSettings({ demo_removido: true }); db.gravarAgora(); location.reload(); });
  },
};
