#!/usr/bin/env python3
"""Startrail research memory. Local SQLite; explicit JSON interchange with UI."""
import argparse, json, sqlite3, math, sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
KINDS=('tasks','sources','searches','observations','deliveries')
TRACK={'fbclid','gclid','igshid','xsec_token','xsec_source','spm'}
def canon(url):
    u=urlsplit(url)
    if u.scheme not in ('http','https') or not u.hostname or u.username or u.password:
        raise ValueError('Source URL must be HTTP(S) without credentials')
    pairs=sorted((k,v) for k,v in parse_qsl(u.query,keep_blank_values=True) if not k.lower().startswith('utm_') and k.lower() not in TRACK)
    return urlunsplit((u.scheme.lower(),u.netloc.lower(),u.path or '/',urlencode(pairs),''))
def validate(bundle):
    if not isinstance(bundle,dict) or bundle.get('schema_version')!=1: raise ValueError('Expected schema_version: 1')
    clean={k:[] for k in KINDS}
    for k in KINDS:
        rows=bundle.get(k,[])
        if not isinstance(rows,list) or len(rows)>20000: raise ValueError('Invalid '+k)
        for row in rows:
            if not isinstance(row,dict) or not isinstance(row.get('id'),str) or not row['id'] or len(row['id'])>200: raise ValueError('Each record needs a nonempty string id')
            if k=='sources':
                row=dict(row); row['canonical_url']=canon(row.get('url',''))
                if row.get('verification','lead') not in ('lead','verified','unavailable'): raise ValueError('Invalid verification')
            if k=='observations':
                if not row.get('source_id') or not row.get('observed_at'): raise ValueError('Snapshot needs source_id and observed_at')
                datetime.fromisoformat(row['observed_at'].replace('Z','+00:00'))
                if not isinstance(row.get('metrics',{}),dict): raise ValueError('Metrics must be an object')
                if any(v is not None and (isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or v<0) for v in row.get('metrics',{}).values()): raise ValueError('Metrics must be nonnegative numbers or null')
            clean[k].append(dict(row))
    return clean


def timestamp(value):
    try: return datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
    except (ValueError,AttributeError,TypeError): return float('-inf')

def merge_source(prior,incoming):
    row={**prior,**incoming,'id':prior['id'],'task_ids':sorted(set(prior.get('task_ids',[])+incoming.get('task_ids',[])))}
    if timestamp(incoming.get('verification_updated_at')) <= timestamp(prior.get('verification_updated_at')):
        for key in ('verification','verification_updated_at','content_verified','original_opened','total_media','reviewed_count','full_post_review_complete','media_items'):
            if key in prior: row[key]=prior[key]
    reviews=dict(prior.get('task_reviews',{}))
    for key,item in incoming.get('task_reviews',{}).items():
        if key not in reviews or timestamp(item.get('updated_at')) > timestamp(reviews[key].get('updated_at')): reviews[key]=item
    row['task_reviews']=reviews
    return row

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--db',default=str(Path.home()/'Documents/Codex/research-memory/startrail.sqlite3'))
    sub=p.add_subparsers(dest='cmd',required=True)
    sub.add_parser('init')
    i=sub.add_parser('import');i.add_argument('file')
    e=sub.add_parser('export');e.add_argument('file')
    q=sub.add_parser('search');q.add_argument('query');q.add_argument('--limit',type=int,default=20)
    sub.add_parser('stats')
    args=p.parse_args(); path=Path(args.db); path.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(path); db.execute('PRAGMA foreign_keys=ON')
    db.execute('CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,url TEXT,PRIMARY KEY(kind,id))')
    db.execute("CREATE UNIQUE INDEX IF NOT EXISTS canonical_sources ON records(url) WHERE kind='sources'")
    if args.cmd=='import':
        bundle=validate(json.loads(Path(args.file).read_text())); remap={};counts={k:0 for k in KINDS}
        with db:
            # Stable sources, URL deduplication, no destructive overwrite of snapshots.
            for kind in ('sources','tasks','searches','observations','deliveries'):
                for row in bundle[kind]:
                    if 'source_id' in row: row['source_id']=remap.get(row['source_id'],row['source_id'])
                    rid=row['id'];url=row.get('canonical_url') if kind=='sources' else None
                    old=db.execute('SELECT id,data FROM records WHERE kind=? AND '+('url=?' if url else 'id=?'),(kind,url or rid)).fetchone()
                    if kind=='sources' and not old and db.execute("SELECT 1 FROM records WHERE kind='sources' AND id=?",(rid,)).fetchone(): raise ValueError('Source id collision with a different URL')
                    if old:
                        prior=json.loads(old[1]);remap[rid]=old[0] if kind=='sources' else rid;rid=old[0]
                        if kind=='observations':
                            if prior!=row: raise ValueError('Snapshot id collision; preserve history with a new id')
                            continue
                        if kind=='sources':
                            row=merge_source(prior,row)
                        else:
                            incoming=row
                            row=({**incoming,**prior,'id':rid} if kind=='tasks' and timestamp(prior.get('updated_at'))>timestamp(incoming.get('updated_at')) else {**prior,**incoming,'id':rid})
                            if kind=='tasks':
                                if prior.get('workflow_progress') or incoming.get('workflow_progress'):
                                    merged=dict(prior.get('workflow_progress',{}))
                                    for key,item in incoming.get('workflow_progress',{}).items():
                                        before=merged.get(key,{})
                                        if not (before.get('updated_at') and item.get('updated_at') and before['updated_at']>item['updated_at']): merged[key]={**before,**item}
                                    row['workflow_progress']=merged
                                for field in ('results','attachments'):
                                    if prior.get(field) or incoming.get(field):
                                        merged={x['id']:x for x in prior.get(field,[])}
                                        for item in incoming.get(field,[]):
                                            before=merged.get(item['id'],{})
                                            if not (before.get('updated_at') and item.get('updated_at') and before['updated_at']>item['updated_at']): merged[item['id']]={**before,**item}
                                        row[field]=list(merged.values())
                    if 'source_id' in row: row['source_id']=remap.get(row['source_id'],row['source_id'])
                    if kind=='observations' and not db.execute("SELECT 1 FROM records WHERE kind='sources' AND id=?",(row['source_id'],)).fetchone(): raise ValueError('Unknown snapshot source')
                    db.execute('INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,url=excluded.url',(kind,rid,json.dumps(row,ensure_ascii=False),url));counts[kind]+=1
        print(json.dumps({'merged':counts},ensure_ascii=False))
    elif args.cmd=='export':
        result={'schema_version':1,'exported_at':datetime.now(timezone.utc).isoformat(),**{k:[] for k in KINDS}}
        for kind,data in db.execute('SELECT kind,data FROM records ORDER BY kind,id'): result[kind].append(json.loads(data))
        out=Path(args.file);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,ensure_ascii=False,indent=2));print(out)
    elif args.cmd=='search':
        matches=[]
        for kind,data in db.execute('SELECT kind,data FROM records'):
            if args.query.casefold() in data.casefold(): matches.append({'kind':kind,**json.loads(data)})
            if len(matches)>=max(1,min(args.limit,100)):break
        print(json.dumps(matches,ensure_ascii=False,indent=2))
    else: print(json.dumps({k:db.execute('SELECT count(*) FROM records WHERE kind=?',(k,)).fetchone()[0] for k in KINDS}))
    db.close()
if __name__=='__main__':
    try: main()
    except (ValueError,sqlite3.Error,OSError) as e: print(str(e),file=sys.stderr);sys.exit(1)
