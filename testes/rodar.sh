#!/bin/sh
# Roda tudo que dá para rodar fora do navegador.
set -e
cd "$(dirname "$0")/.."
echo "→ sintaxe dos módulos"
node testes/validar-modulos.mjs
echo "→ motor de análise"
node --test testes/analise.test.mjs
echo "→ coletor da Meta"
(cd coletor && python3 test_coletar.py)
