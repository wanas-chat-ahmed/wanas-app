# Converts FreeDict eng-ara 0.6.3 (eng-ara.tei) into the dict1..dict15.json shards used by the app.
# Licence: GNU GPL v2 or later (same as the data). Usage: python3 build_dict.py eng-ara.tei
import sys,re,json,collections
import xml.etree.ElementTree as ET
T='{http://www.tei-c.org/ns/1.0}'
d=collections.OrderedDict()
for e in ET.parse(sys.argv[1]).getroot().iter(T+'entry'):
    w=e.find(T+'form/'+T+'orth').text.strip()
    d.setdefault(w,[]).extend(q.text.strip() for q in e.iter(T+'quote') if q.text and q.text.strip())
single={}
for w,v in d.items():
    if re.fullmatch(r"[A-Za-z][A-Za-z'\-]*",w):
        s=[];[s.append(x) for x in v if x not in s];single[w]=s[:4]
m=collections.OrderedDict()
for w,v in single.items():
    k=w.lower()
    if len(k)>14: continue
    for x in v:
        if len(x)<=40 and x not in m.setdefault(k,[]): m[k].append(x)
items=sorted((w,'، '.join(v[:3])) for w,v in m.items() if v and w[0].isalpha())
chunks=[];cur=[];sz=2
for w,t in items:
    e=len(json.dumps({w:t},ensure_ascii=False).encode())+1
    if cur and sz+e>200000: chunks.append(cur);cur=[];sz=2
    cur.append((w,t));sz+=e
if cur:chunks.append(cur)
for i,c in enumerate(chunks,1):
    open('dict%d.json'%i,'w',encoding='utf8').write(json.dumps(dict(c),ensure_ascii=False,separators=(',',':')))
