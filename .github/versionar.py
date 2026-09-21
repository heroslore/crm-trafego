#!/usr/bin/env python3
"""Carimba a versão da publicação nos endereços dos arquivos do site.

O navegador guarda os arquivos em cache. Sem isso, uma atualização do sistema
pode demorar a aparecer no celular (ou não aparecer, quando o site está
instalado como aplicativo). Acrescentando ?v=<versão> em cada import, cada
publicação tem endereços novos e o navegador é obrigado a baixar tudo de novo.
"""
import os, re, sys, json, datetime

pasta, versao = sys.argv[1], sys.argv[2]

# 1) index.html: script, estilo e um marcador de versão legível pelo próprio sistema
idx = os.path.join(pasta, "index.html")
html = open(idx, encoding="utf-8").read()
html = html.replace('href="app/styles.css"', f'href="app/styles.css?v={versao}"')
html = html.replace('src="app/main.js"', f'src="app/main.js?v={versao}"')
if "<meta name=\"crm-versao\"" not in html:
    html = html.replace("<head>", f'<head>\n<meta name="crm-versao" content="{versao}">', 1)
else:
    html = re.sub(r'<meta name="crm-versao" content="[^"]*">', f'<meta name="crm-versao" content="{versao}">', html)
open(idx, "w", encoding="utf-8").write(html)

# 1b) arquivo que a página consulta para saber se há versão mais nova
with open(os.path.join(pasta, "versao.json"), "w", encoding="utf-8") as f:
    json.dump({"versao": versao, "publicado_em": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")}, f)

# 2) imports relativos dentro de app/: ./x.js e ../x.js
padrao = re.compile(r'(\bfrom\s+|\bimport\s*\()(["\'])(\.{1,2}/[^"\']+?\.js)\2')
n = 0
for raiz, _, arquivos in os.walk(os.path.join(pasta, "app")):
    for nome in arquivos:
        if not nome.endswith(".js"):
            continue
        caminho = os.path.join(raiz, nome)
        texto = open(caminho, encoding="utf-8").read()
        novo, trocas = padrao.subn(lambda m: f"{m.group(1)}{m.group(2)}{m.group(3)}?v={versao}{m.group(2)}", texto)
        if trocas:
            open(caminho, "w", encoding="utf-8").write(novo)
            n += trocas
print(f"versão {versao} carimbada em index.html e em {n} import(s).")
