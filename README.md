# CRM de Tráfego

Central de comando de tráfego pago e CRM para a empresa: campanhas, anúncios, criativos,
produtos, públicos, leads, vendas, financeiro, testes A/B, planejamento, tarefas, calendário,
relatórios, concorrentes e configurações. Funciona em computador e celular, instalável como app.

**Endereço:** https://heroslore.github.io/crm-trafego/

## Módulos

| Área | O que faz |
|---|---|
| **Conversas** | WhatsApp, Instagram e Messenger na mesma tela pela API da [api-wa.me](https://api-wa.me): lista de conversas com não lidas, histórico, envio com respostas rápidas, e o lead ao lado (etapa, follow-up, anotação, registrar venda). Conversa de quem não está no CRM vira lead sozinha, já ligada à campanha quando a mensagem vem de um anúncio |
| **Hoje** | responde rápido: gastei, vendi, lucrei, leads, vendas, melhor/pior campanha, produto mais vendido, campanha gastando sem vender, lead parado, tarefa urgente |
| **Dashboard** | investimento, faturamento, lucro bruto e após anúncios, ROAS, ROI, leads, **leads qualificados**, vendas, conversão, CPL, **CPL qualificado**, CPA, ticket, CTR, CPC, CPM, com variação vs período anterior e avaliação pelas metas; **o que aconteceu depois que o lead chegou**; **atendimento** (tempo médio, faixas de 5 min / 15 min / 1 h, nunca atendidos, fila de espera); **ritmo do orçamento** do mês com projeção; gráficos por dia; metas; valor por etapa; parados; agenda |
| **Central de Decisões** | "O que precisa da minha atenção hoje?" por prioridade (urgente/alta/média/baixa); oportunidades de campanha; alertas automáticos; Analista de Tráfego IA (texto explicativo, nunca decide sozinho) |
| **Campanhas** | plataforma, objetivo, produto, datas, status, orçamentos, gasto, faturamento, leads, vendas, CPL, CPL qualificado, CPA, CTR, CPC, CPM, ROAS, ROI, ticket e decisão; **histórico de decisões** com o efeito de cada mudança (7 dias antes × 7 dias depois); lançamento manual de métricas; conjuntos e anúncios |
| **Anúncios / Criativos** | biblioteca com tipo, copy, CTA, responsável, link/arquivo, ranking visual e classificação automática (campeão, bom, em teste, saturando, baixo, pausar). **Retenção de vídeo** (3 s, ThruPlay, 25/50/75/95%, custo por ThruPlay) e diagnóstico que separa "gancho fraco" de "prende mas não converte" |
| **Produtos** | estoque, custo, preço, margem, vendas 7/30 dias, faturamento, lucro, campanhas relacionadas; classificação automática (campeão, potencial, normal, baixa saída, parado, estoque crítico) e filtros "vendendo muito", "precisa de campanha", "parado", "estoque alto", "acabando" |
| **Públicos** | biblioteca e ranking dos públicos; recortes da Meta (idade, gênero, posicionamento, aparelho, região, hora) |
| **Leads** | Kanban com 9 etapas, ficha com histórico, follow-up, etiquetas, WhatsApp e motivo de perda. **Tempo de atendimento** (chegada, primeiro contato, primeira resposta) carimbado sozinho, **qualificação** (temperatura, qualificado, intenção e prazo de compra) e **atribuição completa** (conjunto, UTMs, identificador do clique, primeiro e último toque) |
| **Clientes** | quem já comprou, compras, total, ticket, última compra, produto preferido, recompra e **LTV por campanha de origem** |
| **Vendas** | cada venda liga produto → lead → campanha → conjunto → anúncio → criativo → vendedor; baixa estoque; ranking de vendedores |
| **Financeiro** | por dia, campanha, produto e plataforma: investimento, faturamento, descontos, custo dos produtos, taxas de pagamento e plataforma, frete, lucro bruto e lucro líquido; vendas canceladas não contam |
| **Testes A/B** | hipótese, criativos, métricas A × B, resultado, aprendizado e "o que usar nas próximas campanhas" |
| **Planejamento** | tarefas fixas de segunda a domingo, editáveis, com marcação por semana |
| **Tarefas** | Kanban (ideias → finalizado) com responsável, prioridade, prazo, produto e campanha, **checklist, recorrência** (diária, semanal, quinzenal, mensal) e **bloqueio por outra tarefa** |
| **Calendário** | mensal com campanhas, promoções, datas comemorativas, lançamentos e conteúdo; avisos 30/15/7/3 dias antes |
| **Briefings / Ideias** | solicitação de criativo com status até publicado; banco de ideias por status |
| **Relatórios** | semanal e mensal automáticos (TOP 5, piores, crescimento, comparação com o período anterior), comparador de períodos, rankings, analista |
| **Calculadoras** | ROAS, ROI, CPA máximo, orçamento necessário, leads necessários, ponto de equilíbrio |
| **Configurações** | empresas/lojas, usuários e perfis (admin, gestor, marketing, criador, vendedor, visualizador), metas, regras de alerta, automações, importação CSV/XLSX do Gerenciador de Anúncios, integrações, nuvem e backup |

## Como os dados entram

- **Meta Ads**: o coletor (`coletor/coletar.py`) roda todo dia (GitHub Actions 08:20 / rotina do
  Claude 08:30) e grava `dados/meta.json`. O CRM transforma isso em campanhas, conjuntos,
  anúncios, criativos e métricas diárias, sem apagar o que você editou (produto, decisão, notas).
- **Google, TikTok e outras**: lançamento manual em Campanhas ou importação CSV/XLSX.
- **Conversas**: WhatsApp, Instagram e Messenger pela api-wa.me, lidos direto pelo navegador.
  Configure em Configurações → Mensagens colando a *key* da instância. A chave fica só naquele
  aparelho (fora do backup e da nuvem), então cada pessoa cola a dela no próprio celular.
- **Leads e vendas**: lançados no CRM (é daí que saem faturamento, lucro, ROAS e CPA).
- **Dados de demonstração**: entram na primeira abertura, marcados como `[DEMO]`, e podem ser
  removidos em Configurações → Dados.

## Roadmap

O sistema é um aplicativo estático: os dados ficam no aparelho e a sincronização opcional
guarda o banco num repositório privado. Os perfis de usuário organizam o trabalho e escondem
áreas, mas **não são segurança de verdade** contra quem tem acesso ao aparelho ou à chave.

Como o CRM guarda nome e WhatsApp de clientes, quando a equipe inteira passar a usá-lo no
dia a dia o próximo passo é migrar autenticação e dados para um servidor com banco de
verdade (login por pessoa, permissão aplicada no servidor, registro de quem fez o quê e
backup automático). Nada disso é necessário para operar e testar agora, e a arquitetura já
foi feita para essa troca: `core/db.js` isola o armazenamento, então trocar o `localStorage`
por uma API REST não obriga a mexer nas telas.

## Onde os dados ficam

No próprio aparelho (`localStorage`). Para usar em vários aparelhos, ligue a **nuvem** em
Configurações apontando para um repositório **privado** do GitHub. Backup em JSON a qualquer hora.

## Arquitetura e código

Veja [ARQUITETURA.md](ARQUITETURA.md). Resumo:

```
index.html            casca (menu, topo, período)
app/main.js           roteador, busca, notificações, perfil
app/core/schema.js    tabelas, campos, relacionamentos
app/core/db.js        banco no navegador (insert/update/remove, eventos, backup, demo)
app/core/metrics.js   todos os indicadores
app/core/rules.js     classificações, alertas, oportunidades, decisões, analista
app/core/ui.js        componentes (kpi, tabela, kanban, formulário, gráficos, modal)
app/core/sync.js      Meta (dados/meta.json) e nuvem GitHub
app/core/wame.js      conversas (WhatsApp, Instagram, Messenger) pela api-wa.me
app/core/importer.js  CSV / XLSX
app/core/auth.js      perfis e permissões
app/core/automations.js  fluxos automáticos (follow-up, tarefa, etiqueta, nota)
app/modules/*.js      uma tela por arquivo
coletor/coletar.py    Meta Ads -> dados/meta.json
```

## Rodar localmente

```bash
python3 -m http.server 8000          # abre http://localhost:8000
python3 coletor/coletar.py --verificar
python3 -m unittest coletor/test_coletar.py
```

Sem dependências para instalar. O leitor de XLSX é carregado sob demanda de um CDN.

## Configuração única

Segredos `META_ACCESS_TOKEN` e `META_AD_ACCOUNT_ID` em Settings → Secrets → Actions
(mesmos valores da automação do Trello). Pages: Settings → Pages → branch `gh-pages`.
