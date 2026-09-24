// Testa pausar, reativar, orçamento, duplicar e subir campanha contra um Graph API simulado.
// Antes de rodar:  python3 -m http.server 8777   e   python3 testes/mock-meta.py 8899
// Depois:          node testes/navegador-meta.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

// O Playwright costuma estar instalado globalmente, e import de ESM não olha o NODE_PATH.
// Resolvemos o caminho na mão para o teste rodar em qualquer máquina.
function caminhoPlaywright() {
  try { return createRequire(import.meta.url).resolve("playwright"); } catch {}
  try { return execSync("npm root -g").toString().trim() + "/playwright/index.js"; } catch {}
  throw new Error("Playwright não encontrado. Instale com: npm i -g playwright");
}
const pw = (await import(caminhoPlaywright())).default;
const { chromium } = pw;
const BASE = process.env.CRM_URL || "http://127.0.0.1:8777/";
const MOCK = process.env.CRM_MOCK_META || "http://127.0.0.1:8899";
const SAIDA = process.env.CRM_SAIDA || "/tmp";
const erros = [];
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) falhas++; };

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
// O passo 7 provoca um erro de propósito: ali o console vai reclamar, e isso é o esperado.
let esperandoErro = false;
p.on("pageerror", (e) => erros.push("pageerror: " + e.message));
p.on("console", (m) => { if (m.type() === "error" && !esperandoErro && !/ERR_CERT/.test(m.text())) erros.push("console: " + m.text()); });
await p.addInitScript((mock) => { window.CRM_META_BASE = mock; }, MOCK);

await p.goto(BASE, { waitUntil: "networkidle" });
await p.waitForTimeout(1200);

// campanha vinda da Meta + chave configurada neste "aparelho"
await p.evaluate(() => {
  const chave = "crm-trafego-db";
  const d = JSON.parse(localStorage.getItem(chave));
  const agora = new Date().toISOString(), hoje = agora.slice(0, 10);
  d.tabelas.campaigns.push({ id: "camp-meta", name: "Botijão 13kg — Centro", platform: "meta", objective: "whatsapp", status: "ativa", daily_budget: 50, external_id: "120200000000001", source: "meta", start_date: hoje, created_at: agora, updated_at: agora });
  d.tabelas.ads.push({ id: "ad-meta", name: "Anúncio vídeo 1", campaign_id: "camp-meta", status: "ativa", external_id: "120600000000777", created_at: agora, updated_at: agora });
  d.tabelas.ad_sets.push({ id: "set-meta", name: "Conjunto Centro 10km", campaign_id: "camp-meta", status: "ativa", daily_budget: 50, external_id: "120400000000777", created_at: agora, updated_at: agora });
  d.tabelas.campaigns.push({ id: "camp-erro", name: "Campanha que a Meta recusa", platform: "meta", objective: "whatsapp", status: "ativa", daily_budget: 60, external_id: "explode-123", source: "meta", start_date: hoje, created_at: agora, updated_at: agora });
  d.tabelas.campaign_metrics.push({ id: "mm1", date: hoje, campaign_id: "camp-meta", spend: 50, impressions: 9000, clicks: 120, link_clicks: 90, results: 8, source: "meta", created_at: agora, updated_at: agora });
  localStorage.setItem(chave, JSON.stringify(d));
  localStorage.setItem("crm-trafego-meta-chave", JSON.stringify({ token: "token-de-teste", conta: "act_999", versao: "v23.0", ligado: true }));
});
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(1500);

const chamadas = async () => (await (await fetch(`${MOCK}/v23.0/__chamadas?access_token=x`)).json());
await fetch(`${MOCK}/v23.0/__limpar?access_token=x`);   // zera o diário de chamadas da execução anterior

console.log("\n[1] Configurações → Meta reconhece a chave");
await p.goto(BASE + "#/config?aba=meta", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
const txtCfg = await p.locator(".cartao").first().innerText();
ok(/Conectado como/.test(txtCfg), "mostra que está conectado");
ok(/ads_management/.test(txtCfg), "lista a permissão de gestão");
await p.locator(".cartao").first().screenshot({ path: `${SAIDA}/meta-config.png` });

console.log("\n[2] Pausar campanha");
await p.goto(BASE + "#/campanhas/camp-meta", { waitUntil: "networkidle" });
await p.waitForTimeout(1400);
ok(await p.locator('[data-meta-acao="pausar"]').first().isVisible(), "botão de pausar aparece");
await p.locator('[data-meta-acao="pausar"]').first().click();
await p.waitForTimeout(400);
const txtModal = await p.locator("#modal").innerText();
ok(/Vai parar de rodar e de gastar/.test(txtModal), "confirmação explica o efeito");
await p.locator("#modal").screenshot({ path: `${SAIDA}/meta-confirma-pausa.png` });
await p.locator("#modal [data-ok]").click();
await p.waitForTimeout(900);
let cs = await chamadas();
const pausa = cs.filter((c) => c.metodo === "POST" && c.dados.status === "PAUSED");
ok(pausa.length === 1, "enviou exatamente um POST status=PAUSED");
ok(pausa[0] && pausa[0].caminho === "120200000000001", "usou o id da campanha na Meta");
const depois = await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem("crm-trafego-db"));
  return { status: d.tabelas.campaigns.find((c) => c.id === "camp-meta").status, decisoes: d.tabelas.campaign_decisions.filter((x) => x.campaign_id === "camp-meta") };
});
ok(depois.status === "pausada", "CRM passou a campanha para pausada");
ok(depois.decisoes.some((x) => x.type === "pausa"), "registrou a pausa no histórico de decisões");

console.log("\n[3] Reativar");
await p.waitForTimeout(600);
await p.locator('[data-meta-acao="ativar"]').first().click();
await p.waitForTimeout(400);
await p.locator("#modal [data-ok]").click();
await p.waitForTimeout(900);
cs = await chamadas();
ok(cs.some((c) => c.dados.status === "ACTIVE"), "enviou status=ACTIVE");
ok(await p.evaluate(() => JSON.parse(localStorage.getItem("crm-trafego-db")).tabelas.campaigns.find((c) => c.id === "camp-meta").status) === "ativa", "CRM voltou para ativa");

console.log("\n[4] Orçamento");
await p.locator('[data-meta-acao="orcamento"]').first().click();
await p.waitForTimeout(400);
await p.locator('#modal [data-fator="1.2"]').click();
const novo = await p.locator("#modal #novoOrc").inputValue();
ok(novo === "60.00", `atalho +20% calculou ${novo}`);
await p.locator("#modal [data-ok]").click();
await p.waitForTimeout(900);
cs = await chamadas();
const orc = cs.filter((c) => c.dados.daily_budget);
ok(orc.length === 1 && orc[0].dados.daily_budget === "6000", `enviou daily_budget em centavos (${orc[0] && orc[0].dados.daily_budget})`);
const st = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem("crm-trafego-db")); return { orc: d.tabelas.campaigns.find((c) => c.id === "camp-meta").daily_budget, dec: d.tabelas.campaign_decisions.filter((x) => x.campaign_id === "camp-meta").map((x) => x.type) }; });
ok(Number(st.orc) === 60, "CRM guardou o novo orçamento");
ok(st.dec.includes("escala"), "registrou como escalada");

console.log("\n[5] Duplicar campanha");
await p.locator('[data-meta-acao="duplicar"]').first().click();
await p.waitForTimeout(400);
await p.locator("#modal #dupNome").fill("Botijão 13kg — Setor Sul");
await p.locator("#modal #dupOrc").fill("35");
await p.locator("#modal [data-ok]").click();
await p.waitForTimeout(1400);
cs = await chamadas();
const copia = cs.find((c) => c.caminho.endsWith("/copies"));
ok(!!copia, "chamou /copies");
ok(copia && copia.dados.status_option === "PAUSED", "cópia nasce pausada");
ok(copia && copia.dados.deep_copy === "true", "cópia é completa (deep_copy)");
const nova = await p.evaluate(() => JSON.parse(localStorage.getItem("crm-trafego-db")).tabelas.campaigns.find((c) => c.name === "Botijão 13kg — Setor Sul"));
ok(!!nova, "cópia entrou no CRM");
ok(nova && nova.status === "pausada" && Number(nova.daily_budget) === 35, "cópia pausada com o orçamento pedido");
await p.locator("#modal").screenshot({ path: `${SAIDA}/meta-duplicou.png` });
await p.locator("#modal [data-fechar-modal]").first().click();
await p.waitForTimeout(400);

console.log("\n[5b] Encerrar (arquivar na Meta)");
await p.goto(BASE + "#/campanhas/camp-erro", { waitUntil: "networkidle" });
await p.waitForTimeout(1300);
await p.locator('[data-meta-acao="encerrar"]').first().click();
await p.waitForTimeout(400);
const txtEnc = await p.locator("#modal").innerText();
ok(/Nada é apagado/.test(txtEnc), "confirmação deixa claro que não apaga nada");
ok(/use <b>Pausar<\/b>|use Pausar/i.test(txtEnc), "oferece pausar como alternativa reversível");
await p.locator("#modal [data-fechar-modal]").first().click();
await p.waitForTimeout(300);
// agora de verdade, numa campanha que a Meta aceita
await p.goto(BASE + "#/campanhas/camp-meta", { waitUntil: "networkidle" });
await p.waitForTimeout(1300);
await p.locator('[data-meta-acao="encerrar"]').first().click();
await p.waitForTimeout(400);
await p.locator("#modal [data-ok]").click();
await p.waitForTimeout(900);
cs = await chamadas();
ok(cs.some((c) => c.dados.status === "ARCHIVED"), "enviou status=ARCHIVED");
const fim = await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem("crm-trafego-db"));
  return { status: d.tabelas.campaigns.find((c) => c.id === "camp-meta").status, dec: d.tabelas.campaign_decisions.filter((x) => x.campaign_id === "camp-meta").map((x) => x.type) };
});
ok(fim.status === "finalizada", "CRM marcou como finalizada");
ok(fim.dec.includes("encerramento"), "registrou o encerramento no histórico");

console.log("\n[6] Subir campanha do zero (impulsionar publicação)");
await p.goto(BASE + "#/campanhas", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
ok(await p.locator('[data-meta-nova]').first().isVisible(), "botão 'Subir campanha na Meta' aparece na lista");
await p.locator('[data-meta-nova]').first().click();
await p.waitForTimeout(500);
await p.locator('#modal [data-aba-nova="zero"]').click();
await p.waitForTimeout(900);
await p.locator("#modal #nvNome").fill("Teste automático — Reels");
await p.locator("#modal #nvOrc").fill("25");
await p.waitForTimeout(600);
await p.locator("#modal").screenshot({ path: `${SAIDA}/meta-nova-campanha.png` });
await p.locator("#modal [data-criar]").click();
await p.waitForTimeout(1600);
cs = await chamadas();
const criouCamp = cs.find((c) => c.caminho.endsWith("/campaigns") && c.metodo === "POST");
const criouSet = cs.find((c) => c.caminho.endsWith("/adsets"));
const criouCr = cs.find((c) => c.caminho.endsWith("/adcreatives"));
const criouAd = cs.find((c) => c.caminho.endsWith("/ads") && c.metodo === "POST");
ok(!!criouCamp && !!criouSet && !!criouCr && !!criouAd, "criou campanha, conjunto, criativo e anúncio");
ok(criouCamp && criouCamp.dados.status === "PAUSED", "campanha nasce pausada");
ok(criouCamp && criouCamp.dados.special_ad_categories === "[]", "envia special_ad_categories (obrigatório na Meta)");
ok(criouSet && criouSet.dados.daily_budget === "2500", "orçamento do conjunto em centavos");
ok(criouSet && criouSet.dados.optimization_goal === "CONVERSATIONS", "objetivo mensagens otimiza para conversas");
ok(criouSet && criouSet.dados.destination_type === "WHATSAPP", "destino WhatsApp");
ok(criouCr && criouCr.dados.object_story_id === "9001_777", "criativo impulsiona a publicação escolhida");
const criada = await p.evaluate(() => JSON.parse(localStorage.getItem("crm-trafego-db")).tabelas.campaigns.find((c) => c.name === "Teste automático — Reels"));
ok(!!criada && criada.status === "pausada" && criada.source === "meta", "campanha entrou no CRM, pausada");
await p.locator("#modal").screenshot({ path: `${SAIDA}/meta-criou.png` });
await p.locator("#modal [data-fechar-modal]").first().click();

await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem("crm-trafego-db"));
  d.tabelas.campaigns.find((c) => c.id === "camp-meta").status = "ativa";
  localStorage.setItem("crm-trafego-db", JSON.stringify(d));
});
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(1200);

console.log("\n[7] Erro da Meta é mostrado sem quebrar nada");
esperandoErro = true;
await p.goto(BASE + "#/campanhas/camp-erro", { waitUntil: "networkidle" });
await p.waitForTimeout(1300);
await p.locator('[data-meta-acao="orcamento"]').first().click();
await p.waitForTimeout(400);
await p.locator("#modal #novoOrc").fill("99");
await p.locator("#modal [data-ok]").click();
await p.waitForTimeout(1000);
const erroTxt = await p.locator("#modal").innerText();
ok(/A Meta recusou o comando/.test(erroTxt), "mostra o erro da Meta");
ok(/orçamento é menor que o mínimo/i.test(erroTxt), "usa a mensagem em português que a Meta devolveu");
ok(/Nada foi alterado no CRM/.test(erroTxt), "avisa que o CRM não mudou");
const orcDepoisErro = await p.evaluate(() => JSON.parse(localStorage.getItem("crm-trafego-db")).tabelas.campaigns.find((c) => c.id === "camp-erro").daily_budget);
ok(Number(orcDepoisErro) === 60, "orçamento no CRM continua o anterior");
await p.locator("#modal").screenshot({ path: `${SAIDA}/meta-erro.png` });
await p.locator("#modal [data-fechar-modal]").first().click();

esperandoErro = false;
console.log("\n[8] Com o controle desligado, os botões somem");
await p.evaluate(() => { const c = JSON.parse(localStorage.getItem("crm-trafego-meta-chave")); c.ligado = false; localStorage.setItem("crm-trafego-meta-chave", JSON.stringify(c)); });
await p.reload({ waitUntil: "networkidle" });
await p.goto(BASE + "#/campanhas/camp-meta", { waitUntil: "networkidle" });
await p.waitForTimeout(1300);
ok(await p.locator('[data-meta-acao]').count() === 0, "nenhum botão de comando na tela");
const explicacao = await p.locator("main").innerText();
ok(/está desligado/i.test(explicacao) && /Ligar agora/i.test(explicacao), "explica o motivo exato e oferece o caminho para religar");

console.log("\n[9] Celular");
await p.evaluate(() => { const c = JSON.parse(localStorage.getItem("crm-trafego-meta-chave")); c.ligado = true; localStorage.setItem("crm-trafego-meta-chave", JSON.stringify(c)); });
await p.setViewportSize({ width: 390, height: 844 });
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(1600);
ok(await p.locator('[data-meta-acao]').count() > 0, "botões voltam quando o controle é religado");
const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(over === 0, `sem transbordo horizontal (${over}px)`);
await p.screenshot({ path: `${SAIDA}/meta-mobile.png`, fullPage: false });

console.log("\nERROS DE JS:", erros.length);
for (const e of erros.slice(0, 10)) console.log(" -", e);
console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodas as verificações passaram.");
await b.close();
process.exit(falhas || erros.length ? 1 : 0);
