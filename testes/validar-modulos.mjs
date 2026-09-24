// Valida a sintaxe ES Module de todos os arquivos do app.
// `node --check` não serve aqui: o Node 22 aceita `export` solto dentro de função
// quando analisa como módulo detectado. vm.SourceTextModule analisa de verdade.
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

// vm.SourceTextModule exige a flag --experimental-vm-modules. Em vez de obrigar quem roda
// a lembrar disso, o próprio script se chama de novo com a flag.
if (typeof vm.SourceTextModule !== "function") {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, ["--experimental-vm-modules", fileURLToPath(import.meta.url)], { stdio: "inherit" });
  process.exit(r.status == null ? 1 : r.status);
}

function arquivos(dir) {
  const out = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) out.push(...arquivos(caminho));
    else if (nome.endsWith(".js")) out.push(caminho);
  }
  return out;
}

let erros = 0;
for (const caminho of arquivos("app")) {
  try {
    new vm.SourceTextModule(readFileSync(caminho, "utf8"), { identifier: caminho });
  } catch (e) {
    erros++;
    console.error(`✗ ${caminho}: ${e.message}`);
  }
}
const total = arquivos("app").length;
console.log(erros ? `${erros} de ${total} arquivo(s) com erro de sintaxe.` : `${total} módulos válidos.`);
process.exit(erros ? 1 : 0);
