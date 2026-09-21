# CRM de Tráfego — Lojas

Painel para analisar o tráfego pago das lojas e acompanhar os leads até a venda.
Repositório próprio, separado do Controle de Gás.

**Endereço (depois de ir para o `main`):** https://heroslore.github.io/crm-trafego/

No celular, abra no Chrome e use "Adicionar à tela inicial" para virar um app.

## O que tem

| Aba | O que mostra |
|---|---|
| **Painel** | investimento, mensagens, custo por mensagem, vendas, faturamento, custo por venda, ROAS, alcance, cliques, CTR, CPM, frequência; comparação com o período anterior; gráfico dia a dia; alertas automáticos; melhor campanha, melhor criativo, melhor dia e melhor horário; leads recentes |
| **Lojas** | os mesmos números separados por loja, comparação entre lojas, funil (mensagens → leads → orçamento → venda), meta de investimento do mês |
| **Campanhas** | cada campanha com status, objetivo, orçamento, loja, gasto, mensagens, custo/msg, cliques, CTR, frequência; ao tocar: público configurado, anúncios com miniatura e texto, gráfico da campanha |
| **Público** | gênero, faixa de idade, públicos mais baratos, onde o anúncio aparece (Reels, Stories, Feed…), aparelho, região, hora do dia e dia da semana |
| **Leads** | o CRM em si: cadastro de lead com origem (campanha/anúncio, orgânico, indicação…), produto, valor, situação (novo → em atendimento → orçamento → vendido/perdido), botão do WhatsApp, busca, exportar CSV |
| **Ajustes** | lojas e palavras-chave, metas, regras dos alertas, nuvem dos leads, backup |

Períodos: ontem, 7, 14, 30 e 90 dias, este mês, mês passado, tudo ou datas livres.
Filtro por loja em todas as abas.

### Como as campanhas viram "lojas"

O Gerenciador de Anúncios não sabe de qual loja é cada campanha. O CRM decide assim:

1. se você escolheu a loja no seletor da aba Campanhas, vale essa escolha;
2. senão, procura as **palavras-chave** de cada loja (Ajustes) no nome da campanha;
3. senão, usa a loja marcada como **padrão**.

Já vem com "Loja de iPhone" (padrão; palavras: iphone, celular, boleto, importados) e
"Depósito de Gás e Água" (palavras: gás, água, botijão, galão). Edite à vontade.

## Automação (nada para fazer no dia a dia)

```
Meta Ads ──(todo dia 08:20, GitHub Actions)──> dados/meta.json ──> site republicado
```

O workflow `.github/workflows/crm-coleta.yml` roda `coletor/coletar.py`, que:

- lê conta, campanhas, conjuntos (público configurado) e anúncios (com miniatura e texto);
- baixa as métricas **dia a dia** por campanha e por anúncio (gasto, alcance, impressões,
  cliques, mensagens, frequência, CPM, CTR e as ações da Meta);
- baixa os recortes de público dos últimos 30 dias (idade × gênero, posicionamento,
  aparelho, região, hora do dia);
- calcula os alertas de ontem (gastou e não gerou mensagem, custo por mensagem alto,
  frequência alta);
- grava tudo em `dados/meta.json`, mantendo o histórico antigo e refazendo só os
  últimos 45 dias (a Meta ajusta números retroativamente);
- faz commit no `main` e dispara a publicação do site.

### Configuração única (2 minutos)

No GitHub: **Settings → Secrets and variables → Actions → New repository secret**, crie:

| Segredo | Valor |
|---|---|
| `META_ACCESS_TOKEN` | o mesmo token do usuário do sistema da Meta usado na automação do Trello (`ads_read`, `read_insights`) |
| `META_AD_ACCOUNT_ID` | `act_` + número da conta de anúncios |

Depois, em **Actions → "CRM — coleta do Meta Ads" → Run workflow** para rodar a primeira
vez na hora (ou espere as 08:20). Sem os segredos o workflow falha com a mensagem dizendo
o que falta; o painel continua mostrando o último `meta.json` que estiver no repositório.

O repositório é público: o arquivo `meta.json` (gasto e resultados das campanhas) fica
visível para quem abrir o repositório. Leads **não** vão para ele (veja abaixo).

### Leads na nuvem (para ver em mais de um celular)

Os leads ficam no aparelho (localStorage). Para sincronizar entre celulares, em
**Ajustes → Leads na nuvem** informe um **repositório privado** (ex.: `heroslore/crm-dados`)
e uma chave fine-grained com `Contents: Read and write` só nesse repositório. O CRM grava
`crm.json` lá, mescla o que foi lançado em cada aparelho e propaga exclusões. O CRM avisa
e pede confirmação se o repositório escolhido for público.

## Rodar à mão

```bash
python3 coletor/coletar.py --verificar        # testa credenciais e acesso
python3 coletor/coletar.py --dry-run          # coleta e mostra o resumo sem gravar
python3 coletor/coletar.py                    # atualiza dados/meta.json (últimos 45 dias + histórico)
python3 coletor/coletar.py --completo         # baixa o histórico inteiro de novo
python3 -m unittest coletor/test_coletar.py   # testes do coletor
python3 -m http.server 8000 --directory .          # abre o painel em http://localhost:8000
```

Só biblioteca padrão do Python 3.11+. O painel é um único `index.html` sem dependências.

## Arquivos

```
crm-trafego/
├── index.html            painel (CRM inteiro)
├── manifest.json         para instalar como app
├── icone.svg
├── coletor/
│   ├── coletar.py        Meta Ads -> dados/meta.json
│   └── test_coletar.py
└── dados/
    └── meta.json         gerado pela automação (não editar à mão)
```
