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
| `core/metrics.js` | Agregações por período, campanha, anúncio, criativo, produto, público, vendedor, plataforma, dia; comparação de períodos; metas | Todo indicador é calculado aqui, nunca digitado |
| `core/rules.js` | Classificação automática (produto, criativo), alertas, oportunidades, central de decisões, textos do analista | Só sugere; nunca altera dados sozinho |
| `core/ui.js` | Cartão KPI, tabela ordenável, kanban, formulário gerado pelo schema, modal, gráficos SVG, barra de progresso, badges, toast | Componentes puros: recebem dados, devolvem HTML/handlers |
| `modules/*.js` | Cada tela exporta `{ id, titulo, icone, render(ctx) }` | Sem lógica de cálculo; usa metrics/rules/ui |

## Fluxo de dados

1. **Meta Ads** entra por `dados/meta.json` (gerado pelo coletor). `sync.js` transforma em linhas
   de `campaigns`, `ad_sets`, `ads`, `creatives` e `campaign_metrics` (origem `meta`), de forma
   idempotente (chave = id externo). Campos vindos da Meta são atualizados a cada carga; campos
   do usuário (produto, decisão, observações, categoria) são preservados.
2. **Outras plataformas** (Google, TikTok…) entram por lançamento manual em Campanhas ou por
   importação CSV/XLSX (`importer.js`), que também gera `campaign_metrics` (origem `import`).
3. **Leads e vendas** são lançados no CRM. Cada venda aponta para produto, lead, campanha,
   conjunto, anúncio, criativo e vendedor; é dela que saem faturamento, custo e lucro.
4. Dashboard, Financeiro, Rankings, Relatórios e Central de Decisões só leem `metrics.js`.

## Persistência

- `localStorage` (chave `crm-trafego-db`), gravado com atraso curto após cada alteração.
- Nuvem opcional: o banco inteiro em `crm.json` num repositório **privado** do GitHub,
  com mesclagem por `id` + `updated_at` e exclusões propagadas (`deleted_at`).
- Backup: exportar/importar JSON em Configurações.
- Preparado para crescer: `db.js` isola o adaptador de armazenamento; trocar por
  IndexedDB ou por uma API REST não exige mexer nos módulos.

## Permissões

Perfis: administrador, gestor de tráfego, marketing, criador de conteúdo, vendedor,
visualizador. `auth.js` mapeia perfil → módulos visíveis e edição permitida. Como o app é
estático, a proteção é de interface (organização do trabalho), não segurança contra alguém
com acesso ao aparelho.

## Convenções

- Português nos nomes de telas e rótulos; inglês curto nos nomes de tabelas e campos
  (padrão do banco pedido: `products`, `campaigns`, `leads`…).
- Datas em ISO (`AAAA-MM-DD`), valores em reais como número (não centavos).
- Registros de demonstração levam `demo: true` e podem ser apagados de uma vez.
- Nunca remover funcionalidade existente sem pedido explícito.
