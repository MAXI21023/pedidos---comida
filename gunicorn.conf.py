# Gunicorn carga automáticamente este archivo al iniciar desde la carpeta del proyecto.
# Un solo proceso mantiene reducido el uso de memoria; varios hilos permiten
# recibir pedidos web mientras se atienden las consultas del Mac.
workers = 1
worker_class = "gthread"
threads = 4
timeout = 60
graceful_timeout = 30
keepalive = 5
backlog = 256
accesslog = "-"
errorlog = "-"
