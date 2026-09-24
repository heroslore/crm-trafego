// Garante que melhorar o mapeamento de dados/meta.json alcança quem já importou aquele arquivo.
// Sem a versão do mapa, a trava de "arquivo não mudou" congelava os registros antigos:
// campos novos (métricas de vídeo, cliques de saída, conversas) nunca chegavam.
// Antes de rodar: python3 -m http.server 8777
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
function caminhoPlaywright() {
  try { return createRequire(import.meta.url).resolve("playwright"); } catch {}
  try { return execSync("npm root -g").toString().trim() + "/playwright/index.js"; } catch {}
  throw new Error("Playwright não encontrado. Instale com: npm i -g playwright");
}
const { chromium } = (await import(caminhoPlaywright())).default;
const BASE = process.env.CRM_URL || "http://127.0.0.1:8777/";
let falhas = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) falhas++; };

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
p.on("pageerror", (e) => { console.log("PAGEERROR:", e.message); falhas++; });
await p.goto(BASE, { waitUntil: "networkidle" });
await p.waitForTimeout(1000);
await p.evaluate(() => localStorage.clear());
await p.goto(BASE + "#/anuncios", { waitUntil: "networkidle" });
await p.waitForTimeout(3500);

const antes = await p.evaluate(() => {
  const db = window.CRM.db;
  return { metricas: db.count("campaign_metrics"), comVideo: db.where("campaign_metrics", (m) => m.video_3s > 0).length };
});
console.log("\n[1] Importação limpa");
ok(antes.metricas > 0, `importou ${antes.metricas} linha(s) de métrica`);
ok(antes.comVideo > 0, `${antes.comVideo} linha(s) com métrica de vídeo`);

console.log("\n[2] Simula um banco importado por uma versão antiga (sem os campos de vídeo)");
await p.evaluate(() => {
  const db = window.CRM.db;
  for (const m of db.all("campaign_metrics")) {
    for (const c of ["video_3s", "thruplay", "video_p25", "video_p50", "video_p75", "video_p95", "outbound_clicks", "conversations"]) delete m[c];
  }
  db.setSettings({ meta_mapa_versao: null });   // como se tivesse sido importado antes da versão do mapa
  db.gravarAgora();
});
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(3500);
const depois = await p.evaluate(() => {
  const db = window.CRM.db;
  return { metricas: db.count("campaign_metrics"), comVideo: db.where("campaign_metrics", (m) => m.video_3s > 0).length, mapa: db.settings().meta_mapa_versao };
});
ok(depois.comVideo > 0, `reimportou sozinho: ${depois.comVideo} linha(s) com vídeo de volta`);
ok(depois.comVideo === antes.comVideo, `mesmo total de antes (${antes.comVideo})`);
ok(depois.metricas === antes.metricas, "não duplicou linhas");
ok(Number(depois.mapa) >= 3, `gravou a versão do mapa (${depois.mapa})`);

console.log("\n[3] Com o mapa já na versão certa, não refaz o trabalho à toa");
const chamadas = [];
p.on("console", (m) => { if (/reimportad/i.test(m.text())) chamadas.push(m.text()); });
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(2500);
const terceira = await p.evaluate(() => window.CRM.db.count("campaign_metrics"));
ok(terceira === antes.metricas, "segunda abertura mantém o mesmo número de linhas");

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodas as verificações passaram.");
await b.close();
process.exit(falhas ? 1 : 0);
