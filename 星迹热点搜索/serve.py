from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path
import webbrowser
root=Path(__file__).resolve().parent/'app'
server=ThreadingHTTPServer(('127.0.0.1',8876),partial(SimpleHTTPRequestHandler,directory=str(root)))
print('STARTRAIL 3.2.0: http://127.0.0.1:8876/  (Ctrl+C stops the server)',flush=True)
webbrowser.open('http://127.0.0.1:8876/')
try: server.serve_forever()
except KeyboardInterrupt: pass
finally: server.server_close()
