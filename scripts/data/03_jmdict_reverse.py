"""JMdict（和英辞書）を逆引きして「英語 → 日本語訳語」の候補表を作る（Wiktionary に日本語訳がない語の補完用）。

usage: python3 -I 03_jmdict_reverse.py <JMdict_e.gz> <out.json>
出典: JMdict (EDRDG, CC BY-SA 4.0) https://www.edrdg.org/jmdict/j_jmdict.html
"""
import gzip, json, re, sys
import xml.etree.ElementTree as ET

src, out = sys.argv[1], sys.argv[2]
PRI = {'news1': 3, 'ichi1': 3, 'spec1': 3, 'gai1': 2, 'news2': 1, 'ichi2': 1, 'spec2': 1, 'gai2': 1}

def norm(g: str) -> str:
    g = re.sub(r'\([^)]*\)', '', g).strip().lower()
    g = re.sub(r'^to ', '', g)
    return re.sub(r'\s+', ' ', g)

rev: dict[str, list] = {}
with gzip.open(src, 'rb') as f:
    for ev, el in ET.iterparse(f, events=('end',)):
        if el.tag != 'entry':
            continue
        kebs = el.findall('k_ele')
        rebs = el.findall('r_ele')
        head_el = kebs[0] if kebs else (rebs[0] if rebs else None)
        if head_el is None:
            el.clear(); continue
        head = (head_el.findtext('keb') or head_el.findtext('reb'))
        pri = sum(PRI.get(p.text, 0) for p in head_el.findall('ke_pri') + head_el.findall('re_pri'))
        if kebs and not kebs[0].findall('ke_pri') and rebs:
            pri = max(pri, sum(PRI.get(p.text, 0) for p in rebs[0].findall('re_pri')))
        for si, sense in enumerate(el.findall('sense')):
            misc = [m.text or '' for m in sense.findall('misc')]
            if any(x in ' '.join(misc) for x in ('archaic', 'obsolete', 'rare', 'vulgar', 'slang')):
                continue
            glosses = [g.text for g in sense.findall('gloss') if g.text]
            h = head
            if 'usually written using kana' in ' '.join(misc) and rebs:
                h = rebs[0].findtext('reb')
            for gi, g in enumerate(glosses):
                k = norm(g)
                if not k or len(k) > 40:
                    continue
                score = pri * 10 - si * 3 - gi * 2 - len(glosses)
                rev.setdefault(k, []).append((score, h))
        el.clear()

res = {}
for k, lst in rev.items():
    lst.sort(key=lambda x: -x[0])
    seen = []
    for s, h in lst:
        if h not in seen:
            seen.append(h)
        if len(seen) >= 4:
            break
    res[k] = [seen, lst[0][0]]
json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
print('keys', len(res))
