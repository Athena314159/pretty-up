import json,subprocess,tempfile,sys
from pathlib import Path
script=Path(__file__).resolve().parents[1]/'startrail-search/scripts/memory.py'
with tempfile.TemporaryDirectory() as d:
 p=Path(d);db=p/'memory.sqlite3'
 def run(*args,ok=True):
  r=subprocess.run([sys.executable,str(script),'--db',str(db),*args],capture_output=True,text=True)
  assert (r.returncode==0)==ok,r.stderr
  return r
 def load(data,ok=True):
  f=p/'in.json';f.write_text(json.dumps({'schema_version':1,**data}));run('import',str(f),ok=ok)
 old={'id':'s','url':'https://example.org/1','verification':'verified','verification_updated_at':'2026-10-25T00:00:00Z','task_reviews':{'a':{'decision':'accepted','updated_at':'2026-10-25T00:00:00Z'}}}
 new={**old,'verification':'lead','verification_updated_at':'2026-10-27T00:00:00Z','task_reviews':{'a':{'decision':'rejected','updated_at':'2026-10-27T00:00:00Z'}}}
 load({'sources':[old]});load({'sources':[new]});load({'sources':[old]})
 load({'tasks':[{'id':'t','brief':'current','updated_at':'2026-10-27T00:00:00Z'}]});load({'tasks':[{'id':'t','brief':'old','updated_at':'2026-10-25T00:00:00Z'}]})
 # Failing transaction must roll back the preceding insert as well.
 load({'sources':[{'id':'other','url':'https://example.org/other'},{'id':'s','url':'https://example.org/wrong'}]},ok=False)
 out=p/'out.json';run('export',str(out));v=json.loads(out.read_text())
 assert len(v['sources'])==1
 assert v['sources'][0]['verification']=='lead'
 assert v['sources'][0]['task_reviews']['a']['decision']=='rejected'
 assert v['tasks'][0]['brief']=='current'
 print('PASS SQLite correction, stale import, source collision, transaction rollback')
