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


if __name__ == "__main__":
    unittest.main()
