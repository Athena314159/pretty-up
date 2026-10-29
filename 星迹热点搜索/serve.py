from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import json, os, argparse, webbrowser, mimetypes
from urllib.parse import unquote
import library_store as store
ROOT=Path(__file__).resolve().parent
LIBRARY=ROOT/'library'
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT/'app'),**kwargs)
    def reply(self,value,status=200):
        body=json.dumps(value,ensure_ascii=False).encode('utf8')
        self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Cache-Control','no-store'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        url=urlparse(self.path); query=parse_qs(url.query); category=query.get('category',['collage'])[0]
        if url.path=='/api/library':
            try: return self.reply(store.read(LIBRARY,category))
            except (ValueError,KeyError) as e: return self.reply({'error':str(e)},400)
        if url.path=='/api/snapshots':
            try: return self.reply(store.snapshots(LIBRARY,category))
            except ValueError as e: return self.reply({'error':str(e)},400)
        if url.path=='/api/archive':
            try:
                data=store.read(LIBRARY,category)
                import gzip
                body=gzip.compress(json.dumps(data,ensure_ascii=False).encode('utf8'))
                self.send_response(200); self.send_header('Content-Type','application/gzip'); self.send_header('Content-Disposition','attachment; filename="startrail-'+category+'.json.gz"'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body); return
            except ValueError as e: return self.reply({'error':str(e)},400)
        if url.path.startswith('/library/'):
            target=(ROOT/unquote(url.path).lstrip('/')).resolve()
            if not target.is_relative_to(LIBRARY.resolve()) or not target.is_file(): return self.send_error(404)
            body=target.read_bytes()
            self.send_response(200); self.send_header('Content-Type',mimetypes.guess_type(target.name)[0] or 'application/octet-stream'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body); return
        return super().do_GET()
    def do_POST(self):
        # Only JSON requests from this local origin can modify the portable library.
        origin=self.headers.get('Origin')
        if origin and origin!='http://'+self.headers.get('Host',''): return self.reply({'error':'来源不匹配'},403)
        if self.headers.get('Content-Type','').split(';')[0]!='application/json': return self.reply({'error':'需要JSON'},415)
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=10485760: raise ValueError('请求大小无效')
            data=json.loads(self.rfile.read(length)); category=data.get('resource_category')
            if self.path=='/api/library/merge': return self.reply(store.merge(LIBRARY,category,data))
            if self.path=='/api/library/restore': return self.reply(store.restore(LIBRARY,category,data.get('snapshot')))
            self.reply({'error':'未知操作'},404)
        except (ValueError,KeyError,TypeError) as e: self.reply({'error':str(e)},400)
if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--port',type=int,default=8876); parser.add_argument('--no-browser',action='store_true'); args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print('STARTRAIL 3.2.1: http://127.0.0.1:'+str(args.port)+'/',flush=True)
    if not args.no_browser: webbrowser.open('http://127.0.0.1:'+str(args.port)+'/')
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
