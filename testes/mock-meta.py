"""Servidor que imita o Graph API da Meta, só para testar o CRM sem tocar na conta real."""
import json, re, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

CHAMADAS = []
OBJETOS = {
    "120200000000001": {"id": "120200000000001", "name": "Campanha real", "status": "ACTIVE", "daily_budget": "5000"},
}
SEQ = [0]


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")

    def do_OPTIONS(self):
        self.send_response(200); self.cors(); self.end_headers()

    def responder(self, obj, codigo=200):
        corpo = json.dumps(obj).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(corpo)))
        self.cors(); self.end_headers(); self.wfile.write(corpo)

    def erro(self, msg, code=100, user_msg=None, subcode=None, user_title=None):
        e = {"message": msg, "type": "OAuthException", "code": code, "fbtrace_id": "TESTE123"}
        if user_msg:
            e["error_user_msg"] = user_msg
        if subcode:
            e["error_subcode"] = subcode
        if user_title:
            e["error_user_title"] = user_title
        self.responder({"error": e}, 400)

    def do_GET(self):
        u = urlparse(self.path); caminho = u.path.replace("/v23.0/", "").strip("/")
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        CHAMADAS.append({"metodo": "GET", "caminho": caminho, "dados": q})
        if caminho == "__chamadas":
            return self.responder(CHAMADAS)
        if caminho == "__limpar":
            CHAMADAS.clear()
            return self.responder({"ok": True})
        if not q.get("access_token"):
            return self.erro("Invalid OAuth access token", 190)
        if q.get("access_token") == "sem-permissao" and caminho == "me/permissions":
            return self.responder({"data": [{"permission": "ads_read", "status": "granted"}]})
        if caminho == "debug_token":
            return self.responder({"data": {"type": "SYSTEM_USER", "application": "App de teste", "is_valid": True,
                                            "expires_at": 0, "data_access_expires_at": 0,
                                            "scopes": ["ads_management", "ads_read", "pages_show_list", "pages_read_engagement"]}})
        if caminho == "me":
            return self.responder({"id": "1", "name": "Ygor (teste)"})
        if caminho == "me/permissions":
            return self.responder({"data": [{"permission": p, "status": "granted"} for p in ("ads_management", "ads_read", "pages_show_list", "pages_read_engagement")]})
        if caminho == "me/accounts":
            return self.responder({"data": [{"id": "9001", "name": "Loja do Ygor"}, {"id": "9002", "name": "Segunda página"}]})
        # Endpoints da coleta pelo navegador. Precisam vir ANTES do act_ genérico abaixo,
        # que senão engole act_999/campaigns e devolve a conta no lugar da lista.
        if caminho.endswith("/campaigns"):
            return self.responder({"data": [
                {"id": "120200000000001", "name": "Botijão 13kg — Centro", "objective": "OUTCOME_ENGAGEMENT",
                 "status": "ACTIVE", "effective_status": "ACTIVE", "daily_budget": "5000",
                 "created_time": "2026-09-01T10:00:00+0000", "start_time": "2026-09-01T10:00:00+0000"},
                {"id": "120200000000002", "name": "Nova campanha de Reconhecimento", "objective": "OUTCOME_AWARENESS",
                 "status": "ACTIVE", "effective_status": "ACTIVE", "daily_budget": "2000",
                 "created_time": "2026-09-05T10:00:00+0000", "start_time": "2026-09-05T10:00:00+0000"}]})
        if caminho.endswith("/adsets"):
            return self.responder({"data": [
                {"id": "120400000000777", "name": "Conjunto Centro 10km", "campaign_id": "120200000000001",
                 "effective_status": "ACTIVE", "daily_budget": "5000", "optimization_goal": "CONVERSATIONS",
                 "targeting": {"age_min": 18, "age_max": 50, "genders": [],
                               "geo_locations": {"cities": [{"name": "Eunápolis", "radius": 17, "distance_unit": "kilometer"}]}}}]})
        if caminho.endswith("/ads"):
            return self.responder({"data": [
                {"id": "120600000000777", "name": "Anúncio vídeo 1", "campaign_id": "120200000000001",
                 "adset_id": "120400000000777", "status": "ACTIVE", "effective_status": "ACTIVE",
                 "created_time": "2026-09-02T10:00:00+0000",
                 "creative": {"thumbnail_url": "http://exemplo/t.jpg", "body": "Gás na porta de casa", "object_type": "VIDEO"}},
                {"id": "120600000000778", "name": "Anúncio reprovado", "campaign_id": "120200000000002",
                 "adset_id": "120400000000777", "status": "ACTIVE", "effective_status": "WITH_ISSUES",
                 "created_time": "2026-09-06T10:00:00+0000",
                 "issues_info": [{"level": "AD", "error_code": 3867089, "error_type": "HARD_ERROR",
                                  "error_summary": "Analise 1 erro",
                                  "error_message": "Analise 1 erro: Este anúncio não pode ser publicado."}],
                 "creative": {"body": "Reconhecimento da loja", "object_type": "VIDEO"}}]})
        if caminho.endswith("/insights"):
            nivel = q.get("level", "account")
            if q.get("breakdowns"):
                b = q["breakdowns"]
                if "age" in b:
                    return self.responder({"data": [
                        {"campaign_id": "120200000000001", "age": "25-34", "gender": "female", "spend": "60.00",
                         "reach": "2000", "impressions": "3000", "clicks": "40",
                         "actions": [{"action_type": "onsite_conversion.messaging_conversation_started_7d", "value": "12"}]}]})
                if "publisher_platform" in b:
                    return self.responder({"data": [
                        {"campaign_id": "120200000000001", "publisher_platform": "instagram", "platform_position": "instagram_reels",
                         "spend": "40.00", "reach": "1500", "impressions": "2200", "clicks": "30",
                         "actions": [{"action_type": "onsite_conversion.messaging_conversation_started_7d", "value": "10"}]}]})
                if "impression_device" in b:
                    return self.responder({"data": [{"campaign_id": "120200000000001", "impression_device": "android_smartphone",
                                                     "spend": "50.00", "reach": "1800", "impressions": "2500", "clicks": "35", "actions": []}]})
                if "region" in b:
                    return self.responder({"data": [{"campaign_id": "120200000000001", "region": "Bahia",
                                                     "spend": "50.00", "reach": "1800", "impressions": "2500", "clicks": "35", "actions": []}]})
                if "hourly" in b:
                    return self.responder({"data": [{"hourly_stats_aggregated_by_advertiser_time_zone": "09:00:00 - 09:59:59",
                                                     "spend": "10.00", "reach": "0", "impressions": "500", "clicks": "8", "actions": []}]})
                return self.responder({"data": []})
            linha = {
                "date_start": "2026-09-29", "date_stop": "2026-09-29", "campaign_id": "120200000000001",
                "campaign_name": "Botijão 13kg — Centro", "spend": "50.00", "reach": "3000", "impressions": "4000",
                "clicks": "80", "inline_link_clicks": "60", "frequency": "1.33", "cpm": "12.5", "ctr": "2.0",
                "actions": [{"action_type": "onsite_conversion.messaging_conversation_started_7d", "value": "8"},
                            {"action_type": "video_view", "value": "700"},
                            {"action_type": "link_click", "value": "60"}],
                "video_p25_watched_actions": [{"action_type": "video_view", "value": "500"}],
                "video_p50_watched_actions": [{"action_type": "video_view", "value": "300"}],
                "video_p75_watched_actions": [{"action_type": "video_view", "value": "150"}],
                "video_p95_watched_actions": [{"action_type": "video_view", "value": "90"}],
                "video_p100_watched_actions": [{"action_type": "video_view", "value": "80"}],
                "video_play_actions": [{"action_type": "video_view", "value": "3800"}],
                "video_thruplay_watched_actions": [{"action_type": "video_view", "value": "200"}],
                "video_avg_time_watched_actions": [{"action_type": "video_view", "value": "6"}],
                "outbound_clicks": [{"action_type": "outbound_click", "value": "12"}],
            }
            if nivel == "ad":
                linha = {**linha, "ad_id": "120600000000777", "ad_name": "Anúncio vídeo 1", "adset_id": "120400000000777"}
            return self.responder({"data": [linha]})
        if caminho.startswith("act_"):
            return self.responder({"id": caminho, "name": "Conta de teste", "currency": "BRL", "account_status": 1, "min_daily_budget": 600, "business_name": "Loja", "business": {"id": "1899000000000001", "name": "Loja"}})
        if caminho.endswith("/posts"):
            return self.responder({"data": [{"id": "9001_777", "message": "Promoção de hoje", "created_time": "2026-09-20T10:00:00+0000"}]})
        if caminho == "search":
            if q.get("type") == "adgeolocation":
                return self.responder({"data": [{"key": "2673", "name": "Goiânia", "region": "Goiás", "country_name": "Brasil"}]})
            return self.responder({"data": [{"id": "6003", "name": "Churrasco"}]})
        if caminho in OBJETOS:
            return self.responder(OBJETOS[caminho])
        return self.responder({"id": caminho, "name": "Objeto", "status": "ACTIVE"})

    def do_POST(self):
        u = urlparse(self.path); caminho = u.path.replace("/v23.0/", "").strip("/")
        tam = int(self.headers.get("Content-Length") or 0)
        bruto = self.rfile.read(tam).decode("utf-8", "replace")
        tipo = self.headers.get("Content-Type") or ""
        if "multipart" in tipo:
            dados = {"__upload": True}
        else:
            dados = {k: v[0] for k, v in parse_qs(bruto).items()}
        CHAMADAS.append({"metodo": "POST", "caminho": caminho, "dados": {k: v for k, v in dados.items() if k != "access_token"}})
        if caminho.endswith("/adimages"):
            return self.responder({"images": {"imagem.jpg": {"hash": "hash-de-teste", "url": "http://exemplo/img.jpg"}}})
        if "explode" in caminho:
            return self.erro("Invalid parameter", 100, "O orçamento é menor que o mínimo permitido para esta conta.")
        # Anúncio com o número de WhatsApp desconectado da Página: a Meta revalida o anúncio
        # inteiro a cada escrita, então até PAUSAR é recusado. Erro real da conta, código 100
        # subcódigo 2446880, reproduzido aqui para o CRM ser testado contra ele.
        if "wpp-solto" in caminho:
            return self.erro(
                "Invalid parameter", 100,
                "Reconecte seu número do WhatsApp à sua Página do Facebook ou conta do Instagram para veicular esse anúncio.",
                subcode=2446880, user_title="O número do WhatsApp é obrigatório")
        if caminho.endswith("/copies"):
            SEQ[0] += 1
            return self.responder({"copied_campaign_id": f"120299000000{SEQ[0]:03d}", "ad_object_ids": []})
        if caminho.endswith("/campaigns"):
            SEQ[0] += 1; return self.responder({"id": f"120300000000{SEQ[0]:03d}"})
        if caminho.endswith("/adsets"):
            SEQ[0] += 1; return self.responder({"id": f"120400000000{SEQ[0]:03d}"})
        if caminho.endswith("/adcreatives"):
            SEQ[0] += 1; return self.responder({"id": f"120500000000{SEQ[0]:03d}"})
        if caminho.endswith("/ads"):
            SEQ[0] += 1; return self.responder({"id": f"120600000000{SEQ[0]:03d}"})
        if caminho in OBJETOS:
            OBJETOS[caminho].update({k: v for k, v in dados.items() if k != "access_token"})
        return self.responder({"success": True})


porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
HTTPServer(("127.0.0.1", porta), H).serve_forever()
