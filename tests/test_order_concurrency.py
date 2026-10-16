"""Pruebas de carga ligera usando solo una base SQLite temporal.

Ejecutar: python -m unittest discover -s tests -v
Nunca usa la base de datos de producción.
"""
import os
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4


class PedidosSimultaneosTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="pedidos-test-")
        cls.db_path = str(Path(cls.temporary.name) / "pedidos-pruebas.db")
        os.environ["DB_PATH"] = cls.db_path
        os.environ["API_KEY"] = "clave-temporal-solo-pruebas"
        # Importar después de configurar DB_PATH evita tocar datos reales.
        from app import app
        cls.app = app
        with sqlite3.connect(cls.db_path) as conn:
            conn.execute(
                "UPDATE productos SET stock_diario=10000,disponible=1 WHERE id=1"
            )

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    @classmethod
    def count(cls, where="", args=()):
        with sqlite3.connect(cls.db_path) as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM pedidos" + where, args
            ).fetchone()[0]

    def submit_web(self, token):
        with self.app.test_client() as client:
            response = client.post("/ordenar", data={
                "activity_token": token,
                "q_1": "1",
                "salsa_1": ["Mayonesa", "Ketchup"],
                "cliente": "Cliente de prueba",
                "telefono": "56912345678",
                "entrega": "Retiro en local",
                "pago": "Efectivo",
            })
            return response.status_code, response.data.decode("utf-8")

    def submit_mac(self, client_id):
        with self.app.test_client() as client:
            response = client.post(
                "/api/desktop/orders",
                headers={"X-API-Key": "clave-temporal-solo-pruebas"},
                json={
                    "client_id": client_id,
                    "client": "Pedido local de prueba",
                    "total": 6500,
                    "items": [{
                        "name": "Burger test",
                        "type": "Hamburguesa",
                        "qty": 1, "price": 6500, "cost": 2800
                    }],
                },
            )
            return response.status_code, response.get_json()

    def test_01_veinte_clientes_distintos(self):
        tokens = [str(uuid4()) for _ in range(20)]
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(self.submit_web, tokens))
        self.assertTrue(all(status == 200 for status, _ in results), results)
        with sqlite3.connect(self.db_path) as conn:
            values = [
                conn.execute(
                    "SELECT COUNT(*) FROM pedidos WHERE order_token=?", (token,)
                ).fetchone()[0] for token in tokens
            ]
        self.assertEqual(values, [1] * len(tokens))

    def test_02_reintento_mismo_formulario_no_duplicado(self):
        token = str(uuid4())
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(self.submit_web, [token] * 12))
        self.assertTrue(all(status == 200 for status, _ in results), results)
        self.assertEqual(
            self.count(" WHERE order_token=?", (token,)), 1
        )
        with sqlite3.connect(self.db_path) as conn:
            item = conn.execute(
                """SELECT i.nombre FROM pedido_items i
                JOIN pedidos p ON p.id=i.pedido_id WHERE p.order_token=?""",
                (token,),
            ).fetchone()
        self.assertIsNotNone(item)
        self.assertIn("Salsas: Mayonesa, Ketchup", item[0])

    def test_03_reintento_mismo_pedido_mac(self):
        client_id = str(uuid4())
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(self.submit_mac, [client_id] * 10))
        self.assertTrue(all(status in (200, 201) for status, _ in results), results)
        self.assertEqual(
            self.count(" WHERE client_id=?", (client_id,)), 1
        )
        ids = [data["id"] for _, data in results]
        self.assertEqual(len(set(ids)), 1)

    def test_04_listado_es_consistente(self):
        with self.app.test_client() as client:
            response = client.get(
                "/api/desktop/orders",
                headers={"X-API-Key": "clave-temporal-solo-pruebas"},
            )
        self.assertEqual(response.status_code, 200)
        orders = response.get_json()
        self.assertEqual(len(orders), self.count())
        self.assertTrue(all(o["items"] for o in orders))

    def test_05_cien_pedidos_concurrentes_sin_duplicados(self):
        """Simula 100 clientes independientes con base SQLite temporal."""
        tokens = [str(uuid4()) for _ in range(100)]
        with ThreadPoolExecutor(max_workers=12) as pool:
            results = list(pool.map(self.submit_web, tokens))
        self.assertTrue(all(status == 200 for status, _ in results), results)
        with sqlite3.connect(self.db_path) as conn:
            placeholders = ",".join("?" for _ in tokens)
            rows = conn.execute(
                "SELECT order_token, COUNT(*) FROM pedidos WHERE order_token IN (" +
                placeholders + ") GROUP BY order_token", tokens
            ).fetchall()
        self.assertEqual(len(rows), 100)
        self.assertTrue(all(n == 1 for _, n in rows))


if __name__ == "__main__":
    unittest.main()
