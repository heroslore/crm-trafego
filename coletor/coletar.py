#!/usr/bin/env python3
"""
CRM de tráfego — coletor de dados do Meta Ads.

Lê a conta de anúncios pela API de Marketing da Meta e grava tudo em um único
arquivo JSON (crm/dados/meta.json) que o painel do CRM consome. Não publica
nada em lugar nenhum: só lê da Meta e escreve o arquivo.

Uso:
  python3 crm/coletor/coletar.py                     # atualiza os últimos 45 dias e preserva o histórico
  python3 crm/coletor/coletar.py --completo          # baixa o histórico inteiro da conta
  python3 crm/coletor/coletar.py --desde 2026-07-01  # baixa a partir de uma data
  python3 crm/coletor/coletar.py --verificar         # só testa credenciais e acesso
  python3 crm/coletor/coletar.py --saida /tmp/x.json # grava em outro lugar

Variáveis de ambiente:
  META_ACCESS_TOKEN   token do usuário do sistema (ads_read, read_insights)   [obrigatória]
  META_AD_ACCOUNT_ID  act_ + número da conta                                   [obrigatória]
  META_API_VERSION    padrão v23.0
  CRM_DIAS_REFRESCO   quantos dias recentes são baixados de novo a cada rodada (padrão 45)
  CRM_DIAS_PUBLICO    janela dos recortes de público (idade, gênero, posição, região, horário) (padrão 30)

Só usa a biblioteca padrão do Python 3.11+.
"""

import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

VERSAO_API = os.environ.get("META_API_VERSION", "v23.0")
DIAS_REFRESCO = int(os.environ.get("CRM_DIAS_REFRESCO", "45") or 45)
DIAS_PUBLICO = int(os.environ.get("CRM_DIAS_PUBLICO", "30") or 30)
SAIDA_PADRAO = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dados", "meta.json")
DATA_MINIMA = dt.date(2024, 1, 1)

# Ações da Meta que interessam para uma loja que vende pelo WhatsApp/Direct.
# Chave curta usada no JSON -> tipo de ação da Meta.
ACOES = {
    "conversas": "onsite_conversion.messaging_conversation_started_7d",
    "conexoes": "onsite_conversion.total_messaging_connection",
    "respostas": "onsite_conversion.messaging_first_reply",
    "leads_form": "lead",
    "cliques_link": "link_click",
    "engajamento": "post_engagement",
    "reacoes": "post_reaction",
    "comentarios": "comment",
    "salvos": "onsite_conversion.post_save",
    "compartilhamentos": "post",
    "visualizacoes_video": "video_view",
    "pagina_destino": "landing_page_view",
}

CAMPOS_DIARIO = ("spend,reach,impressions,clicks,inline_link_clicks,frequency,cpm,ctr,actions,"
                 "video_thruplay_watched_actions,video_p25_watched_actions,video_p50_watched_actions,"
                 "video_p75_watched_actions,video_p95_watched_actions")

# Métricas de vídeo: cada uma vem da Meta como lista de ações.
CAMPOS_VIDEO = {
    "thruplay": "video_thruplay_watched_actions",
    "video_p25": "video_p25_watched_actions",
    "video_p50": "video_p50_watched_actions",
    "video_p75": "video_p75_watched_actions",
    "video_p95": "video_p95_watched_actions",
}
CAMPOS_PUBLICO = "spend,reach,impressions,clicks,actions"


class ErroColeta(Exception):
    pass


# ---------------------------------------------------------------- utilidades

def env_obrigatoria(nome):
    valor = os.environ.get(nome, "").strip()
    if not valor:
        raise ErroColeta(f"Variável de ambiente {nome} não definida.")
    return valor


def conta_id():
    conta = env_obrigatoria("META_AD_ACCOUNT_ID")
    return conta if conta.startswith("act_") else "act_" + conta


def num(valor):
    try:
        return float(valor or 0)
    except (TypeError, ValueError):
        return 0.0


def arred(valor, casas=2):
    return round(num(valor), casas)


def http_json(url, params=None, tentativas=4):
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, method="GET")
    req.add_header("User-Agent", "controle-gas-crm/1.0")
    espera = 2
    for tentativa in range(1, tentativas + 1):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                texto = resp.read().decode("utf-8")
            return json.loads(texto) if texto else {}
        except urllib.error.HTTPError as e:
            detalhe = e.read().decode("utf-8", "replace")[:600]
            # 4xx é erro nosso (token, permissão, campo inválido); não adianta repetir.
            # Exceção: código 17/32/613 (limite de uso) vem como 400 e vale esperar.
            limite = any(f'"code":{c}' in detalhe.replace(" ", "") for c in (4, 17, 32, 613, 80004))
            if e.code < 500 and not limite:
                raise ErroColeta(f"HTTP {e.code} em {url.split('?')[0]}: {detalhe}") from None
            erro = f"HTTP {e.code}: {detalhe[:200]}"
        except urllib.error.URLError as e:
            erro = f"falha de rede: {e.reason}"
        if tentativa == tentativas:
            raise ErroColeta(f"Desisti de {url.split('?')[0]} após {tentativas} tentativas ({erro}).")
        print(f"  aviso: {erro}; tentando de novo em {espera}s", file=sys.stderr)
        time.sleep(espera)
        espera *= 3


def meta_get(caminho, **params):
    params["access_token"] = env_obrigatoria("META_ACCESS_TOKEN")
    return http_json(f"https://graph.facebook.com/{VERSAO_API}/{caminho}", params)


def meta_lista(caminho, **params):
    """GET com paginação: junta todas as páginas de `data`."""
    params.setdefault("limit", 500)
    resposta = meta_get(caminho, **params)
    linhas = list(resposta.get("data", []))
    while resposta.get("paging", {}).get("next"):
        resposta = http_json(resposta["paging"]["next"])
        linhas.extend(resposta.get("data", []))
    return linhas


def acoes_de(linha):
    bruto = {a.get("action_type"): num(a.get("value")) for a in (linha.get("actions") or [])}
    return {chave: int(bruto.get(tipo, 0)) for chave, tipo in ACOES.items() if bruto.get(tipo)}


def mensagens_de(acoes):
    """Mensagens/leads do dia: conversas iniciadas; se não houver, conexões; senão formulário."""
    for chave in ("conversas", "conexoes", "respostas", "leads_form"):
        if acoes.get(chave):
            return acoes[chave]
    return 0


def somar_acoes(linha, campo):
    """Soma os valores de um campo que a Meta devolve como lista de ações."""
    return int(sum(num(a.get("value")) for a in (linha.get(campo) or [])))


def metricas_video(linha):
    """Retenção do vídeo: 3 segundos, ThruPlay e os marcos de 25% a 95%."""
    saida = {chave: somar_acoes(linha, campo) for chave, campo in CAMPOS_VIDEO.items()}
    bruto = {a.get("action_type"): num(a.get("value")) for a in (linha.get("actions") or [])}
    saida["video_3s"] = int(bruto.get("video_view", 0))
    return saida


# ---------------------------------------------------------------- coleta

def coletar_conta():
    c = meta_get(conta_id(), fields="name,currency,timezone_name,account_status,amount_spent,business_name")
    return {
        "id": c.get("id"), "nome": c.get("business_name") or c.get("name"), "moeda": c.get("currency"),
        "fuso": c.get("timezone_name") or "America/Sao_Paulo", "status": c.get("account_status"),
        "gasto_total_centavos": int(num(c.get("amount_spent"))),
    }


def coletar_campanhas():
    linhas = meta_lista(f"{conta_id()}/campaigns",
                        fields="name,objective,status,effective_status,daily_budget,lifetime_budget,created_time,start_time,stop_time,updated_time")
    saida = []
    for c in linhas:
        saida.append({
            "id": c["id"], "nome": c.get("name") or "(sem nome)", "objetivo": c.get("objective") or "",
            "status": c.get("effective_status") or c.get("status") or "",
            "orcamento_diario": arred(num(c.get("daily_budget")) / 100) if c.get("daily_budget") else None,
            "orcamento_total": arred(num(c.get("lifetime_budget")) / 100) if c.get("lifetime_budget") else None,
            "criado_em": (c.get("created_time") or "")[:10], "inicio": (c.get("start_time") or "")[:10],
            "fim": (c.get("stop_time") or "")[:10] or None,
        })
    saida.sort(key=lambda c: c["criado_em"], reverse=True)
    return saida


def coletar_conjuntos():
    linhas = meta_lista(f"{conta_id()}/adsets",
                        fields="name,campaign_id,effective_status,daily_budget,optimization_goal,targeting{age_min,age_max,genders,geo_locations}")
    saida = []
    for a in linhas:
        alvo = a.get("targeting") or {}
        geo = alvo.get("geo_locations") or {}
        locais = []
        for chave in ("cities", "regions", "custom_locations", "zips", "places"):
            for item in geo.get(chave) or []:
                nome = item.get("name") or item.get("address_string") or item.get("key")
                if nome:
                    raio = item.get("radius")
                    locais.append(f"{nome} ({raio} {item.get('distance_unit', 'km')})" if raio else nome)
        for pais in geo.get("countries") or []:
            locais.append(pais)
        generos = alvo.get("genders") or []
        genero = "todos" if not generos else ("homens" if generos == [1] else "mulheres" if generos == [2] else "todos")
        saida.append({
            "id": a["id"], "nome": a.get("name") or "(sem nome)", "campanha_id": a.get("campaign_id"),
            "status": a.get("effective_status") or "", "otimizacao": a.get("optimization_goal") or "",
            "orcamento_diario": arred(num(a.get("daily_budget")) / 100) if a.get("daily_budget") else None,
            "idade": f"{alvo.get('age_min', '')}-{alvo.get('age_max', '')}" if alvo.get("age_min") else "",
            "genero": genero, "locais": locais[:8],
        })
    return saida


def coletar_anuncios():
    linhas = meta_lista(f"{conta_id()}/ads",
                        fields="name,status,effective_status,campaign_id,adset_id,created_time,"
                               "creative{thumbnail_url,body,title,object_type,instagram_permalink_url,effective_object_story_id}")
    saida = []
    for a in linhas:
        cr = a.get("creative") or {}
        texto = (cr.get("body") or cr.get("title") or "").strip()
        saida.append({
            "id": a["id"], "nome": a.get("name") or "(sem nome)", "campanha_id": a.get("campaign_id"),
            "conjunto_id": a.get("adset_id"), "status": a.get("effective_status") or a.get("status") or "",
            "criado_em": (a.get("created_time") or "")[:10],
            "miniatura": cr.get("thumbnail_url") or "", "tipo": cr.get("object_type") or "",
            "texto": texto[:240], "link_instagram": cr.get("instagram_permalink_url") or "",
        })
    return saida


def coletar_diario(nivel, desde, ate):
    """Uma linha por dia por campanha (ou por anúncio)."""
    campos = ("campaign_id,campaign_name," if nivel == "campaign" else "ad_id,ad_name,adset_id,campaign_id,") + CAMPOS_DIARIO
    linhas = meta_lista(f"{conta_id()}/insights", level=nivel, fields=campos, time_increment=1,
                        time_range=json.dumps({"since": desde.isoformat(), "until": ate.isoformat()}))
    saida = []
    for l in linhas:
        acoes = acoes_de(l)
        item = {
            "data": l.get("date_start"), "campanha_id": l.get("campaign_id"),
            "gasto": arred(l.get("spend")), "alcance": int(num(l.get("reach"))),
            "impressoes": int(num(l.get("impressions"))), "cliques": int(num(l.get("clicks"))),
            "cliques_link": int(num(l.get("inline_link_clicks"))), "frequencia": arred(l.get("frequency"), 3),
            "cpm": arred(l.get("cpm")), "ctr": arred(l.get("ctr"), 3),
            "mensagens": mensagens_de(acoes), "acoes": acoes,
        }
        video = metricas_video(l)
        if any(video.values()):
            item["video"] = video
        if nivel == "ad":
            item["anuncio_id"] = l.get("ad_id")
            item["conjunto_id"] = l.get("adset_id")
        saida.append(item)
    return saida


def coletar_publico(desde, ate):
    janela = json.dumps({"since": desde.isoformat(), "until": ate.isoformat()})

    def linhas_para(nivel, breakdowns, chaves):
        campos = ("campaign_id," if nivel == "campaign" else "") + CAMPOS_PUBLICO
        linhas = meta_lista(f"{conta_id()}/insights", level=nivel, fields=campos, breakdowns=breakdowns, time_range=janela)
        saida = []
        for l in linhas:
            acoes = acoes_de(l)
            item = {k: l.get(k) for k in chaves}
            if nivel == "campaign":
                item["campanha_id"] = l.get("campaign_id")
            item.update({"gasto": arred(l.get("spend")), "alcance": int(num(l.get("reach"))),
                         "impressoes": int(num(l.get("impressions"))), "cliques": int(num(l.get("clicks"))),
                         "mensagens": mensagens_de(acoes)})
            saida.append(item)
        return saida

    publico = {"periodo": {"inicio": desde.isoformat(), "fim": ate.isoformat()}}
    publico["idade_genero"] = linhas_para("campaign", "age,gender", ("age", "gender"))
    publico["posicionamento"] = linhas_para("campaign", "publisher_platform,platform_position", ("publisher_platform", "platform_position"))
    publico["dispositivo"] = linhas_para("campaign", "impression_device", ("impression_device",))
    publico["regiao"] = linhas_para("campaign", "region", ("region",))
    publico["horario"] = linhas_para("account", "hourly_stats_aggregated_by_advertiser_time_zone",
                                     ("hourly_stats_aggregated_by_advertiser_time_zone",))
    # nomes mais curtos para o painel
    for l in publico["idade_genero"]:
        l["idade"] = l.pop("age", ""); l["genero"] = l.pop("gender", "")
    for l in publico["posicionamento"]:
        l["plataforma"] = l.pop("publisher_platform", ""); l["posicao"] = l.pop("platform_position", "")
    for l in publico["dispositivo"]:
        l["dispositivo"] = l.pop("impression_device", "")
    for l in publico["regiao"]:
        l["regiao"] = l.pop("region", "")
    for l in publico["horario"]:
        faixa = l.pop("hourly_stats_aggregated_by_advertiser_time_zone", "") or ""
        l["hora"] = int(faixa[:2]) if faixa[:2].isdigit() else None
    return publico


# ---------------------------------------------------------------- alertas

OBJETIVOS_SEM_MENSAGEM = ("OUTCOME_AWARENESS", "BRAND_AWARENESS", "REACH", "VIDEO_VIEWS", "OUTCOME_TRAFFIC", "LINK_CLICKS")


def calcular_alertas(dia, diario_campanha, campanhas, limite_custo_msg=15.0):
    por_id = {c["id"]: c for c in campanhas}
    avisos = []
    for l in diario_campanha:
        if l["data"] != dia.isoformat() or l["gasto"] <= 0:
            continue
        c = por_id.get(l["campanha_id"], {})
        nome = c.get("nome") or l["campanha_id"]
        if l["frequencia"] >= 3:
            avisos.append({"tipo": "frequencia", "campanha_id": l["campanha_id"], "campanha": nome, "frequencia": l["frequencia"],
                           "texto": f"'{nome}' com frequência {l['frequencia']:.1f}: público saturando, avaliar novo criativo."})
        if c.get("objetivo") in OBJETIVOS_SEM_MENSAGEM:
            continue  # campanha de alcance/tráfego: não se cobra mensagem dela
        if l["mensagens"] == 0:
            avisos.append({"tipo": "sem_mensagem", "campanha_id": l["campanha_id"], "campanha": nome, "gasto": l["gasto"],
                           "texto": f"'{nome}' gastou R$ {l['gasto']:.2f} e não gerou nenhuma mensagem."})
        else:
            custo = l["gasto"] / l["mensagens"]
            if custo > limite_custo_msg:
                avisos.append({"tipo": "custo_alto", "campanha_id": l["campanha_id"], "campanha": nome, "custo_msg": arred(custo),
                               "texto": f"'{nome}' com custo por mensagem de R$ {custo:.2f}, acima de R$ {limite_custo_msg:.2f}."})
    return avisos


# ---------------------------------------------------------------- junção com o histórico

def carregar_existente(caminho):
    try:
        with open(caminho, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def juntar_diario(antigo, novo, desde):
    """Mantém do arquivo antigo só o que está antes da janela baixada de novo."""
    limite = desde.isoformat()
    mantidos = [l for l in (antigo or []) if (l.get("data") or "") < limite]
    return sorted(mantidos + novo, key=lambda l: (l["data"], l.get("campanha_id") or "", l.get("anuncio_id") or ""))


def primeira_data(campanhas):
    datas = [c["criado_em"] for c in campanhas if c.get("criado_em")]
    if not datas:
        return dt.date.today() - dt.timedelta(days=90)
    return max(DATA_MINIMA, dt.date.fromisoformat(min(datas)) - dt.timedelta(days=1))


# ---------------------------------------------------------------- comandos

def verificar():
    for nome in ("META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"):
        print(f"{nome}: {'ok' if os.environ.get(nome) else 'FALTANDO'}")
    conta = coletar_conta()
    print(f"Conta {conta['id']} ({conta['nome']}), moeda {conta['moeda']}, fuso {conta['fuso']}.")
    campanhas = coletar_campanhas()
    ativas = sum(1 for c in campanhas if c["status"] == "ACTIVE")
    print(f"{len(campanhas)} campanha(s), {ativas} ativa(s). Tudo pronto.")
    return 0


def coletar(args):
    inicio_exec = time.time()
    saida = args.saida or SAIDA_PADRAO
    existente = carregar_existente(saida)

    print("Conta…")
    conta = coletar_conta()
    fuso = ZoneInfo(conta["fuso"])
    ontem = dt.datetime.now(fuso).date() - dt.timedelta(days=1)

    print("Campanhas, conjuntos e anúncios…")
    campanhas = coletar_campanhas()
    conjuntos = coletar_conjuntos()
    anuncios = coletar_anuncios()

    if args.desde:
        desde = dt.date.fromisoformat(args.desde)
    elif args.completo or not existente:
        desde = primeira_data(campanhas)
    else:
        desde = ontem - dt.timedelta(days=DIAS_REFRESCO - 1)
    desde = min(desde, ontem)

    print(f"Métricas diárias de {desde} a {ontem}…")
    diario_campanha = coletar_diario("campaign", desde, ontem)
    diario_anuncio = coletar_diario("ad", desde, ontem)
    if existente and not args.completo:
        diario_campanha = juntar_diario(existente.get("diario_campanha"), diario_campanha, desde)
        diario_anuncio = juntar_diario(existente.get("diario_anuncio"), diario_anuncio, desde)

    print(f"Recortes de público dos últimos {DIAS_PUBLICO} dias…")
    publico = coletar_publico(ontem - dt.timedelta(days=DIAS_PUBLICO - 1), ontem)

    alertas = calcular_alertas(ontem, diario_campanha, campanhas)
    datas = [l["data"] for l in diario_campanha]

    dados = {
        "versao": 1,
        "gerado_em": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "conta": conta,
        "periodo": {"inicio": min(datas) if datas else desde.isoformat(), "fim": max(datas) if datas else ontem.isoformat(),
                    "referencia": ontem.isoformat(), "janela_atualizada": {"inicio": desde.isoformat(), "fim": ontem.isoformat()}},
        "campanhas": campanhas,
        "conjuntos": conjuntos,
        "anuncios": anuncios,
        "diario_campanha": diario_campanha,
        "diario_anuncio": diario_anuncio,
        "publico": publico,
        "alertas": {"data": ontem.isoformat(), "itens": alertas},
    }

    gasto_ontem = sum(l["gasto"] for l in diario_campanha if l["data"] == ontem.isoformat())
    msgs_ontem = sum(l["mensagens"] for l in diario_campanha if l["data"] == ontem.isoformat())
    print(f"Ontem ({ontem.strftime('%d/%m')}): R$ {gasto_ontem:.2f} gastos, {msgs_ontem} mensagens, {len(alertas)} alerta(s).")
    print(f"Histórico: {len(diario_campanha)} linhas de campanha, {len(diario_anuncio)} de anúncio, "
          f"{len(campanhas)} campanhas, {len(anuncios)} anúncios, de {dados['periodo']['inicio']} a {dados['periodo']['fim']}.")

    if args.dry_run:
        print("[dry-run] nada foi gravado.")
        return 0
    os.makedirs(os.path.dirname(os.path.abspath(saida)), exist_ok=True)
    temporario = saida + ".tmp"
    with open(temporario, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    os.replace(temporario, saida)
    print(f"Gravado em {saida} ({os.path.getsize(saida) // 1024} KB) em {time.time() - inicio_exec:.0f}s.")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--saida", help=f"arquivo de saída (padrão {SAIDA_PADRAO})")
    p.add_argument("--desde", help="baixar a partir desta data AAAA-MM-DD")
    p.add_argument("--completo", action="store_true", help="baixar o histórico inteiro, ignorando o arquivo existente")
    p.add_argument("--verificar", action="store_true", help="só testa credenciais e acesso à conta")
    p.add_argument("--dry-run", action="store_true", help="coleta, mostra o resumo e não grava")
    args = p.parse_args(argv)
    try:
        return verificar() if args.verificar else coletar(args)
    except ErroColeta as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
