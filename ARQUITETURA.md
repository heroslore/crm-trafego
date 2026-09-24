# Arquitetura do CRM de Tráfego

## Visão geral

Aplicativo web estático (HTML + CSS + JavaScript em módulos ES), publicado no GitHub Pages,
sem servidor próprio. Funciona em computador e celular, instalável como app.

```
┌──────────────────────── navegador ────────────────────────┐
│  index.html  (casca: menu lateral, topo, área de conteúdo) │
│  app/main.js (roteador, período global, notificações)      │
│  app/modules/*.js  (uma tela por módulo)                   │
│  app/core/                                                 │
│    schema.js   tabelas, campos e relacionamentos           │
│    db.js       banco em memória + persistência + eventos   │
│    metrics.js  todos os indicadores calculados             │
│    rules.js    classificações, alertas, oportunidades      │
│    ui.js       componentes reutilizáveis                   │
│    sync.js     Meta Ads (dados/meta.json) e nuvem GitHub   │
│    importer.js CSV / XLSX (Gerenciador de Anúncios)        │
│    auth.js     usuários, perfis e permissões               │
│    analise/    motor da Análise Inteligente (7 arquivos)   │
│    meta.js     comandos na conta de anúncios da Meta       │
│    acoes-meta.js  confirmação, registro e telas dos comandos│
└───────────────┬─────────────────────────┬──────────────────┘
                │ leitura                 │ leitura/gravação
     dados/meta.json (coleta diária)   repositório privado (crm.json)
                ▲
     coletor/coletar.py  ← GitHub Actions 08:20 / rotina Claude 08:30 ← API da Meta
```

## Camadas

| Camada | Responsabilidade | Regra |
|---|---|---|
| `core/schema.js` | Define cada tabela: campos, tipos, opções, relações (`rel`) | Única fonte da verdade para formulários, listas e validação |
| `core/db.js` | Banco de dados no navegador: tabelas, ids, `insert/update/remove/get/all/where`, índices, eventos `change`, persistência, exportação, dados de demonstração | Módulos nunca gravam no `localStorage` diretamente |
| `core/metrics.js` | Agregações por período, campanha, conjunto, anúncio, criativo, produto, público, vendedor, plataforma, dia; tempo de atendimento (SLA); qualificação; receita líquida com descontos, taxas e frete; retenção de vídeo; ritmo do orçamento; clientes e LTV; efeito de uma decisão | Todo indicador é calculado aqui, nunca digitado |
| `core/rules.js` | Classificação automática (produto, criativo), alertas, oportunidades, central de decisões, textos do analista | Só sugere; nunca altera dados sozinho |
| `core/analise/` | Motor da Análise Inteligente: métricas com fórmula, benchmarks adaptativos, confiança estatística, regras de diagnóstico, score e recomendações | Camadas puras (sem banco) para poder ser testado fora do navegador |
| `core/ui.js` | Cartão KPI, tabela ordenável, kanban, formulário gerado pelo schema, modal, gráficos SVG, barra de progresso, badges, toast | Componentes puros: recebem dados, devolvem HTML/handlers |
| `core/meta.js` | Escrita na API da Meta: pausar, reativar, orçamento, duplicar, criar campanha/conjunto/criativo/anúncio, enviar imagem | A chave mora só no aparelho; o endereço da API só muda em teste |
| `core/acoes-meta.js` | Confirmação de cada comando, atualização do CRM depois do sucesso, registro no histórico de decisões e o assistente de campanha nova | Nenhum comando sai sem a pessoa confirmar |
| `core/wame.js` | Cliente da API da api-wa.me: conversas, envio, polling, criação automática de lead e atribuição da conversa à campanha pelo contexto do anúncio | Chamado direto do navegador (a API responde com CORS aberto); a chave nunca entra no banco |
| `modules/*.js` | Cada tela exporta `{ id, titulo, icone, render(ctx) }` | Sem lógica de cálculo; usa metrics/rules/ui |

## Fluxo de dados

1. **Meta Ads** entra por `dados/meta.json` (gerado pelo coletor). `sync.js` transforma em linhas
   de `campaigns`, `ad_sets`, `ads`, `creatives` e `campaign_metrics` (origem `meta`), de forma
   idempotente (chave = id externo). Campos vindos da Meta são atualizados a cada carga; campos
   do usuário (produto, decisão, observações, categoria) são preservados.
2. **Outras plataformas** (Google, TikTok…) entram por lançamento manual em Campanhas ou por
   importação CSV/XLSX (`importer.js`), que também gera `campaign_metrics` (origem `import`).
3. **Conversas** (WhatsApp, Instagram e Messenger) entram pela API da api-wa.me, lida a cada
   poucos segundos pelo próprio navegador. Conversa nova de quem ainda não está no CRM vira
   lead; quando a mensagem carrega contexto de anúncio (Click-to-WhatsApp), o lead já nasce
   ligado à campanha e ao criativo. As mensagens não são copiadas para o banco: a tela lê a
   API ao vivo e só o que importa (primeiro contato, envios, mudanças de etapa) vira histórico
   do lead.
4. **Leads e vendas** são lançados no CRM. Cada venda aponta para produto, lead, campanha,
   conjunto, anúncio, criativo e vendedor; é dela que saem faturamento, custo e lucro.
5. Dashboard, Financeiro, Rankings, Relatórios e Central de Decisões só leem `metrics.js`.

## Persistência

- `localStorage` (chave `crm-trafego-db`), gravado com atraso curto após cada alteração.
- Nuvem opcional: o banco inteiro em `crm.json` num repositório **privado** do GitHub,
  com mesclagem por `id` + `updated_at` e exclusões propagadas (`deleted_at`).
- Backup: exportar/importar JSON em Configurações.
- **Fora do banco, de propósito:** a chave da API de mensagens e a chave da nuvem ficam só no
  `localStorage` do aparelho, nunca no backup nem na nuvem — quem tem a chave controla o
  WhatsApp da loja.
- Preparado para crescer: `db.js` isola o adaptador de armazenamento; trocar por
  IndexedDB ou por uma API REST não exige mexer nos módulos.

## Permissões

Perfis: administrador, gestor de tráfego, marketing, criador de conteúdo, vendedor,
visualizador. `auth.js` mapeia perfil → módulos visíveis e edição permitida. Como o app é
estático, a proteção é de interface (organização do trabalho), não segurança contra alguém
com acesso ao aparelho.

## Roadmap de segurança

Hoje: dados no `localStorage`, sincronização opcional para repositório privado, perfis
aplicados na interface. É suficiente para a operação atual e para testar o sistema.

Quando a equipe inteira entrar, migrar para servidor com banco (PostgreSQL ou equivalente):
login por pessoa com senha, permissão verificada no servidor, trilha de auditoria e backup
automático. O caminho já está preparado: `core/db.js` é o único ponto que fala com o
armazenamento, e `core/auth.js` concentra as permissões. Os módulos não mudam.

## Convenções

- Português nos nomes de telas e rótulos; inglês curto nos nomes de tabelas e campos
  (padrão do banco pedido: `products`, `campaigns`, `leads`…).
- Datas em ISO (`AAAA-MM-DD`), valores em reais como número (não centavos).
- Registros de demonstração levam `demo: true` e podem ser apagados de uma vez.
- Nunca remover funcionalidade existente sem pedido explícito.


## O motor da Análise Inteligente

Fica em `app/core/analise/` e roda sempre no mesmo sentido, uma camada alimentando a
seguinte. Nenhuma camada pula a anterior, e só a última conhece o banco.

```
 DADOS BRUTOS → MÉTRICAS CALCULADAS → BENCHMARKS → REGRAS → SCORE → RECOMENDAÇÕES → INTERFACE
   (index.js)      (metricas.js)     (benchmarks)  (regras)  (score)  (recomendacoes)   (ui.js)
                                     + confianca.js
```

| Arquivo | O que faz |
|---|---|
| `metricas.js` | Cálculos puros com a fórmula declarada em cada métrica; cadeia de retenção do vídeo; funil completo; maior queda |
| `benchmarks.js` | Base de comparação em três níveis e a referência padrão editável |
| `confianca.js` | Tamanho de amostra: decide quando o sistema pode concluir e quando precisa ficar calado |
| `regras.js` | Cartões por etapa, padrões nomeados de diagnóstico, saúde do público, fadiga do criativo |
| `score.js` | Nota 0–100 com pesos por objetivo da campanha |
| `recomendacoes.js` | Problema → evidência → hipótese → ação → prioridade → confiança; plano em três caixas; resumo em 10 segundos |
| `index.js` | Junta os dados do CRM, roda o pipeline e devolve tudo pronto. `analisarVarios()` analisa uma lista inteira montando a base de comparação **uma vez** — sem isso, 50 anúncios refariam 50 vezes o histórico da conta |
| `ui.js` | Desenha. Não julga nada |

Quatro decisões que valem para o motor inteiro:

1. **Métrica sem dado é `null`, nunca `0`.** Zero é resultado; `null` é ausência de
   informação. É por isso que a tela mostra "indisponível" em vez de "0%".
2. **Nenhuma regra universal.** Não existe "CTR abaixo de 1% é ruim". A comparação vem do
   histórico da conta; na falta dele, de campanhas parecidas; e só em último caso da
   referência padrão, que fica editável em Configurações → Análise e é sempre nomeada no texto.
3. **Registro parcial de venda é piso, não veredito.** Com vendas lançadas só em parte, o
   faturamento é um limite inferior (pode ser maior, nunca menor) e por isso um ROAS alto vale
   como conclusão; já a taxa de venda e o CPA ficam distorcidos pelo numerador incompleto e
   saem da nota. Sem isso, lançar a primeira venda de dez pioraria a avaliação do anúncio —
   um incentivo exatamente invertido. Escolhido em Configurações → Análise.
4. **Motor determinístico.** Os mesmos números produzem sempre o mesmo diagnóstico. Se um dia
   uma IA entrar nesse caminho, será para reescrever o texto — nunca para decidir se uma
   métrica é boa ou ruim.

Testes em `testes/analise.test.mjs` (`node --test`) cobrem os cenários que o motor precisa
acertar: retenção boa com CTR baixo, CTR bom com conversão baixa, fadiga, amostra pequena,
CPM alto com ROAS excelente, e a regra de que métrica ausente nunca vira zero.


## Comandos na conta de anúncios

O CRM escreve na Meta direto do navegador. O caminho é curto de propósito:

```
 tela (campanha/anúncio) → acoes-meta.js (confirma) → meta.js (fala com a Meta)
        ↓ deu certo
 db.update(...) + campaign_decisions (histórico que mede antes × depois)
```

Três travas presas no código, não só na interface:

1. `podeEscrever()` exige as três coisas juntas — chave no aparelho, permissão
   `ads_management` confirmada pela própria Meta e o interruptor ligado em Configurações.
   Sem isso os botões nem são desenhados.
2. Campanha nova e cópia nascem com `status: PAUSED`. Subir ativa é uma caixa que a pessoa
   marca, nunca o padrão.
3. Não existe função de apagar. O CRM pausa, ajusta e cria; encerrar é decisão para o
   Gerenciador de Anúncios.

A chave de acesso fica em `localStorage`, numa chave própria (`crm-trafego-meta-chave`), e
nunca entra em `db.exportar()` nem na sincronização em nuvem.

`testes/mock-meta.py` imita o Graph API e `testes/navegador-meta.mjs` roda o fluxo inteiro
contra ele — pausar, reativar, orçamento, duplicar, criar, erro da Meta e o caso do controle
desligado — sem encostar na conta real.


## Importação da Meta e a versão do mapa

`carregarMeta()` evita retrabalho pulando a importação quando `dados/meta.json` não mudou.
Isso tem uma armadilha: quando o **mapeamento** do arquivo para as tabelas melhora (um campo
novo passa a ser gravado), quem já importou aquele arquivo nunca receberia a melhoria — os
registros antigos ficariam para sempre sem os campos novos, sem nenhum sinal na tela.

Por isso existe `VERSAO_MAPA` em `core/sync.js`. Ela **sobe junto com qualquer mudança em
`aplicarMeta()` que grave um campo novo**, e a importação é refeita quando a versão guardada
no banco é menor que a do código, mesmo com o arquivo igual. `testes/sync-remapeia.mjs`
simula um banco importado por uma versão antiga e verifica que os campos voltam sozinhos,
sem duplicar linhas.
