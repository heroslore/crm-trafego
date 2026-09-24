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

    def erro(self, msg, code=100, user_msg=None):
        e = {"message": msg, "type": "OAuthException", "code": code}
        if user_msg:
            e["error_user_msg"] = user_msg
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
        if caminho == "me":
            return self.responder({"id": "1", "name": "Ygor (teste)"})
        if caminho == "me/permissions":
            return self.responder({"data": [{"permission": p, "status": "granted"} for p in ("ads_management", "ads_read", "pages_show_list", "pages_read_engagement")]})
        if caminho == "me/accounts":
            return self.responder({"data": [{"id": "9001", "name": "Loja do Ygor"}, {"id": "9002", "name": "Segunda página"}]})
        if caminho.startswith("act_"):
            return self.responder({"id": caminho, "name": "Conta de teste", "currency": "BRL", "account_status": 1, "min_daily_budget": 600, "business_name": "Loja"})
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
