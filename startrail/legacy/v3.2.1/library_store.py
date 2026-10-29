import gzip, json, os, re, threading, hashlib
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from pathlib import Path
from datetime import datetime, timezone
CATEGORIES={'collage','makeup','template','other'}
LOCK=threading.RLock()
def blank(category):
    return {'library_schema':1,'resource_category':category,'records':[],'tasks':[],'searches':[],'events':[],'blacklist':[]}
def validate(payload,category):
    if category not in CATEGORIES or payload.get('library_schema')!=1 or payload.get('resource_category')!=category:
        raise ValueError('资源分类或版本不匹配')
    for key in ('records','tasks','searches','events','blacklist'):
        rows=payload.get(key,[])
        if not isinstance(rows,list) or len(rows)>50000: raise ValueError('资源数组无效')
        for row in rows:
            if not isinstance(row,dict) or not isinstance(row.get('id'),str): raise ValueError('记录缺少id')
            if row.get('resource_category',category)!=category: raise ValueError('不同类别不得混入同一资源库')
    return payload
def read(root,category):
    if category not in CATEGORIES: raise ValueError('未知分类')
    p=Path(root)/category/'ledger.json.gz'
    return validate(json.loads(gzip.decompress(p.read_bytes())),category) if p.exists() else blank(category)
def stamp(row):
    try: return datetime.fromisoformat(row.get('updated_at','').replace('Z','+00:00')).timestamp()
    except (ValueError,TypeError): return 0

def identity(row,key):
    if key not in ('records','blacklist'): return row['id']
    post=row.get('platform_post_id')
    media=row.get('media_index','source')
    if post: return str(row.get('platform','')).lower()+':'+str(post)+'#'+str(media)
    raw=row.get('canonical_url') or row.get('url')
    if raw:
        u=urlsplit(raw)
        query=urlencode(sorted((k,v) for k,v in parse_qsl(u.query) if not k.lower().startswith('utm_') and k.lower() not in ('xsec_token','xsec_source','fbclid','gclid','region')))
        return urlunsplit((u.scheme.lower(),u.netloc.lower(),u.path.rstrip('/'),query,''))+'#'+str(media)
    return row['id']

def merge(root,category,payload):
    validate(payload,category)
    with LOCK:
        current=read(root,category)
        for key in ('records','tasks','searches','events','blacklist'):
            index={identity(r,key):r for r in current.get(key,[])}
            for row in payload.get(key,[]):
                row_key=identity(row,key)
                old=index.get(row_key)
                if not old: index[row_key]=row
                elif stamp(row)>stamp(old):
                    merged={**old,**row,'id':old['id']}
                    if old.get('seen'): merged['seen']=True
                    index[row_key]=merged
                elif row.get('seen'): old['seen']=True
            current[key]=list(index.values())
        now=datetime.now(timezone.utc).isoformat()
        current['updated_at']=now
        write(root,category,current)
        return current

def write(root,category,payload):
    validate(payload,category)
    directory=Path(root)/category
    directory.mkdir(parents=True,exist_ok=True)
    p=directory/'ledger.json.gz'
    if p.exists():
        snapshots=directory/'snapshots'; snapshots.mkdir(exist_ok=True)
        old=p.read_bytes(); name=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')+'-'+hashlib.sha256(old).hexdigest()[:10]+'.json.gz'
        (snapshots/name).write_bytes(old)
    temp=directory/'ledger.tmp'
    temp.write_bytes(gzip.compress(json.dumps(payload,ensure_ascii=False).encode('utf8'),mtime=0))
    os.replace(temp,p)

def snapshots(root,category):
    if category not in CATEGORIES: raise ValueError('未知分类')
    return sorted([p.name for p in (Path(root)/category/'snapshots').glob('*.json.gz')],reverse=True)

def restore(root,category,name):
    if name not in snapshots(root,category): raise ValueError('快照不存在')
    with LOCK:
        old=validate(json.loads(gzip.decompress((Path(root)/category/'snapshots'/name).read_bytes())),category)
        current=read(root,category)
        # 回退判定仍保留后续看过的标记，避免回退导致重复查找。
        known={r['id'] for r in old['records']}
        old['records'] += [{**r,'review_status':'rollback-seen','seen':True} for r in current['records'] if r['id'] not in known]
        now=datetime.now(timezone.utc).isoformat()
        for r in old['records']: r['updated_at']=now
        old['events'].append({'id':'restore-'+now,'type':'restore','snapshot':name,'updated_at':now})
        old['updated_at']=now
        write(root,category,old)
        return old

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(); parser.add_argument('action',choices=['import','export','snapshots','restore']); parser.add_argument('category',choices=sorted(CATEGORIES)); parser.add_argument('file',nargs='?'); parser.add_argument('--root',default=str(Path(__file__).resolve().parent/'library')); args=parser.parse_args()
    if args.action=='import':
        p=Path(args.file); raw=p.read_bytes(); payload=json.loads(gzip.decompress(raw) if p.suffix=='.gz' else raw); result=merge(args.root,args.category,payload); print(len(result['records']))
    elif args.action=='export':
        payload=read(args.root,args.category); Path(args.file).write_bytes(gzip.compress(json.dumps(payload,ensure_ascii=False).encode('utf8'))); print(args.file)
    elif args.action=='snapshots': print(json.dumps(snapshots(args.root,args.category)))
    else: print(len(restore(args.root,args.category,args.file)['records']))
