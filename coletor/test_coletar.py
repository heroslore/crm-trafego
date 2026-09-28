"""Testes do coletor: python3 -m unittest crm/coletor/test_coletar.py"""
import datetime as dt
import unittest

import coletar


class TestAcoes(unittest.TestCase):
    def test_extrai_acoes_conhecidas(self):
        linha = {"actions": [{"action_type": "link_click", "value": "12"},
                             {"action_type": "onsite_conversion.messaging_conversation_started_7d", "value": "8"},
                             {"action_type": "algo_desconhecido", "value": "99"}]}
        acoes = coletar.acoes_de(linha)
        self.assertEqual(acoes, {"conversas": 8, "cliques_link": 12})

    def test_mensagens_prefere_conversas(self):
        self.assertEqual(coletar.mensagens_de({"conversas": 8, "conexoes": 9}), 8)
        self.assertEqual(coletar.mensagens_de({"conexoes": 9}), 9)
        self.assertEqual(coletar.mensagens_de({"leads_form": 2}), 2)
        self.assertEqual(coletar.mensagens_de({}), 0)


class TestVideo(unittest.TestCase):
    def test_soma_listas_de_acoes(self):
        linha = {
            "video_thruplay_watched_actions": [{"action_type": "video_view", "value": "120"}, {"action_type": "x", "value": "5"}],
            "video_p50_watched_actions": [{"action_type": "video_view", "value": "60"}],
            "actions": [{"action_type": "video_view", "value": "400"}],
        }
        v = coletar.metricas_video(linha)
        self.assertEqual(v["thruplay"], 125)
        self.assertEqual(v["video_p50"], 60)
        self.assertEqual(v["video_3s"], 400)
        self.assertEqual(v["video_p95"], 0)

    def test_sem_video_fica_zerado(self):
        self.assertEqual(coletar.metricas_video({}), {"thruplay": 0, "video_p25": 0, "video_p50": 0, "video_p75": 0,
                                                      "video_p95": 0, "video_p100": 0, "video_plays": 0, "video_2s": 0,
                                                      "video_3s": 0})

    def test_cadeia_completa_do_video(self):
        linha = {
            "video_play_actions": [{"action_type": "video_view", "value": "900"}],
            "video_continuous_2_sec_watched_actions": [{"action_type": "video_view", "value": "500"}],
            "video_p100_watched_actions": [{"action_type": "video_view", "value": "40"}],
            "video_avg_time_watched_actions": [{"action_type": "video_view", "value": "7.5"}],
            "actions": [{"action_type": "video_view", "value": "400"}],
        }
        v = coletar.metricas_video(linha)
        self.assertEqual(v["video_plays"], 900)
        self.assertEqual(v["video_2s"], 500)
        self.assertEqual(v["video_p100"], 40)
        self.assertEqual(v["tempo_medio"], 7.5)


class TestJuncao(unittest.TestCase):
    def test_mantem_historico_antigo_e_troca_janela(self):
        antigo = [{"data": "2026-08-01", "campanha_id": "a", "gasto": 1},
                  {"data": "2026-08-10", "campanha_id": "a", "gasto": 2},
                  {"data": "2026-08-11", "campanha_id": "b", "gasto": 3}]
        novo = [{"data": "2026-08-10", "campanha_id": "a", "gasto": 20}]
        junto = coletar.juntar_diario(antigo, novo, dt.date(2026, 8, 10))
        self.assertEqual([(l["data"], l["gasto"]) for l in junto], [("2026-08-01", 1), ("2026-08-10", 20)])

    def test_sem_arquivo_antigo(self):
        self.assertEqual(coletar.juntar_diario(None, [{"data": "2026-09-01", "campanha_id": "a"}], dt.date(2026, 9, 1)),
                         [{"data": "2026-09-01", "campanha_id": "a"}])


class TestAlertas(unittest.TestCase):
    campanhas = [{"id": "c1", "nome": "Fundo de funil", "objetivo": "OUTCOME_ENGAGEMENT"},
                 {"id": "c2", "nome": "Alcance", "objetivo": "OUTCOME_AWARENESS"}]

    def test_sem_mensagem_e_custo_alto(self):
        dia = dt.date(2026, 9, 20)
        diario = [{"data": "2026-09-20", "campanha_id": "c1", "gasto": 30.0, "mensagens": 0, "frequencia": 1.2},
                  {"data": "2026-09-20", "campanha_id": "c2", "gasto": 30.0, "mensagens": 0, "frequencia": 3.5},
                  {"data": "2026-09-19", "campanha_id": "c1", "gasto": 30.0, "mensagens": 0, "frequencia": 1.0}]
        tipos = sorted(a["tipo"] for a in coletar.calcular_alertas(dia, diario, self.campanhas))
        # c2 é de alcance: não cobra mensagem, mas a frequência alta ainda avisa
        self.assertEqual(tipos, ["frequencia", "sem_mensagem"])
        diario[0]["mensagens"] = 1
        tipos = sorted(a["tipo"] for a in coletar.calcular_alertas(dia, diario, self.campanhas))
        self.assertEqual(tipos, ["custo_alto", "frequencia"])


class TestProblemas(unittest.TestCase):
    def test_le_o_motivo_do_bloqueio(self):
        r = {"issues_info": [{"level": "AD", "error_code": 3867089, "error_type": "HARD_ERROR",
                              "error_summary": "Analise 1 erro",
                              "error_message": "Analise 1 erro: Este anúncio não pode ser publicado."}]}
        p = coletar.problemas_de(r)[0]
        self.assertEqual(p["codigo"], 3867089)
        self.assertEqual(p["tipo"], "HARD_ERROR")
        # a Meta repete o resumo dentro da mensagem; guardar duas vezes só polui a tela
        self.assertEqual(p["mensagem"], "Este anúncio não pode ser publicado.")

    def test_sem_problema_vira_lista_vazia(self):
        self.assertEqual(coletar.problemas_de({}), [])
        self.assertEqual(coletar.problemas_de({"issues_info": None}), [])

    def test_entrega_bloqueada_vira_alerta_com_nivel(self):
        dia = dt.date(2026, 9, 20)
        anuncios = [{"id": "a1", "nome": "android", "campanha_id": "c1",
                     "problemas": [{"nivel": "AD", "codigo": 3867089, "tipo": "HARD_ERROR",
                                    "resumo": "Analise 1 erro", "mensagem": "Loja fora dos requisitos."}]}]
        av = coletar.calcular_alertas(dia, [], TestAlertas.campanhas, anuncios=anuncios)
        self.assertEqual(len(av), 1)
        self.assertEqual(av[0]["tipo"], "entrega_bloqueada")
        self.assertEqual(av[0]["nivel"], "anúncio")
        self.assertEqual(av[0]["campanha_id"], "c1")
        self.assertTrue(av[0]["grave"])
        self.assertIn("Loja fora dos requisitos.", av[0]["texto"])

    def test_anuncio_sem_problema_nao_gera_alerta(self):
        av = coletar.calcular_alertas(dt.date(2026, 9, 20), [], TestAlertas.campanhas,
                                      anuncios=[{"id": "a1", "nome": "ok", "problemas": []}])
        self.assertEqual(av, [])


if __name__ == "__main__":
    unittest.main()
