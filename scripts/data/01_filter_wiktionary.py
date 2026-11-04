"""Wiktextract (kaikki.org) の英語辞書ダンプから、対象候補語のエントリだけを抽出して軽量化する。

usage: python3 -I 01_filter_wiktionary.py <kaikki.jsonl.gz> <out.jsonl>
入力: https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz (CC BY-SA 4.0)
"""
import gzip, json, sys
from wordfreq import top_n_list

src, out = sys.argv[1], sys.argv[2]
top = top_n_list('en', 60000)
single = set(top)
core = set(top[:6000])
KEEP_LANGS = {'ja', 'ko', 'zh', 'cmn'}

def keep_word(w: str) -> bool:
    if w in single:
        return True
    parts = w.split(' ')
    # 句動詞・熟語候補: 2〜4語で、全ての語が頻出語
    return 2 <= len(parts) <= 4 and all(p in core for p in parts)

def slim_tr(trs):
    return [{k: t.get(k) for k in ('lang_code', 'word', 'sense', 'roman') if t.get(k)} for t in trs or [] if t.get('lang_code') in KEEP_LANGS]

n = kept = 0
with gzip.open(src, 'rt', encoding='utf-8') as f, open(out, 'w', encoding='utf-8') as o:
    for line in f:
        n += 1
        if '"lang_code": "en"' not in line[:4000] and '"lang_code":"en"' not in line[:4000]:
            # lang_code は先頭近くにあるとは限らないので最終判断は JSON で
            pass
        d = json.loads(line)
        if d.get('lang_code') != 'en':
            continue
        w = d.get('word', '')
        if not keep_word(w) and not keep_word(w.lower()):
            continue
        senses = []
        for s in d.get('senses', []):
            senses.append({
                'glosses': s.get('glosses'),
                'tags': s.get('tags'),
                'form_of': [x.get('word') for x in s.get('form_of', [])] or None,
                'alt_of': [x.get('word') for x in s.get('alt_of', [])] or None,
                'synonyms': [x.get('word') for x in s.get('synonyms', []) if not x.get('source')][:12] or None,
                'antonyms': [x.get('word') for x in s.get('antonyms', [])][:12] or None,
                'translations': slim_tr(s.get('translations')) or None,
                'categories': [c.get('name') if isinstance(c, dict) else c for c in s.get('categories', [])][:30] or None,
                'examples': [e.get('text') for e in s.get('examples', []) if e.get('type') == 'example'][:3] or None,
            })
        rec = {
            'word': w,
            'pos': d.get('pos'),
            'etymology_text': d.get('etymology_text'),
            'etymology_templates': [{'name': t.get('name'), 'args': t.get('args')} for t in d.get('etymology_templates', [])],
            'etymology_number': d.get('etymology_number'),
            'ipa': [s['ipa'] for s in d.get('sounds', []) if 'ipa' in s][:3],
            # 発音はタグ（地域・古形など）付きで残し、語源・品詞ごとの発音の違いを出せるようにする（ROADMAP C04）
            'sounds': [{k: s[k] for k in ('ipa', 'tags', 'note') if s.get(k)} for s in d.get('sounds', []) if 'ipa' in s][:10],
            # 活用形はタグ（past / plural / archaic / nonstandard など）付きで残し、標準形だけを選べるようにする（ROADMAP C03）
            'forms': [{'form': x['form'], 'tags': x.get('tags') or []} for x in d.get('forms', []) if x.get('form') and 'table-tags' not in (x.get('tags') or []) and 'inflection-template' not in (x.get('tags') or [])][:60],
            'derived': [x.get('word') for x in d.get('derived', [])][:60],
            'related': [x.get('word') for x in d.get('related', [])][:40],
            'synonyms': [x.get('word') for x in d.get('synonyms', [])][:20],
            'antonyms': [x.get('word') for x in d.get('antonyms', [])][:20],
            'translations': slim_tr(d.get('translations')),
            'senses': senses,
        }
        o.write(json.dumps(rec, ensure_ascii=False) + '\n')
        kept += 1
print('lines', n, 'kept', kept)
