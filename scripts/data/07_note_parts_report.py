#!/usr/bin/env python3
"""
解説（data/explanations）と語源分解の食い違いを洗い出すレポート。

解説で語根の語源語（例: ラテン語 portare）に触れていて、単語の綴りにもその語根が
含まれているのに、語源分解でその語根につながっていない語を頻度順に一覧にする。
手動の語源分解（overrides の parts）を追加する候補探しに使う。

  python3 scripts/data/07_note_parts_report.py [--top 300]

public/data（04_build.py の出力）を読むので、ビルド後に実行する。
"""
import argparse
import glob
import json
import os
import re

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ap = argparse.ArgumentParser()
ap.add_argument('--top', type=int, default=300)
args = ap.parse_args()


def rows(path):
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.startswith('#') or not line.strip():
                continue
            yield line.rstrip('\n').split('\t')


roots = []
for r in rows(os.path.join(REPO, 'data', 'roots.tsv')):
    keys = [k for k in r[2].split(',') if len(k) >= 4]
    forms = sorted({f for f in r[1].split(',') if len(f) >= 3}, key=lambda x: (-len(x), x))
    if keys and forms:
        pat = re.compile(r'(?<![a-zāēīōū])(' + '|'.join(re.escape(k.lower()) for k in keys) + r')(?![a-zāēīōū])')
        roots.append((r[0], forms, pat, r[3]))

notes = {}
for p in sorted(glob.glob(os.path.join(REPO, 'data', 'explanations', '*.tsv'))):
    for r in rows(p):
        if len(r) >= 2:
            notes[r[0].lower()] = r[1].lower()

index = json.load(open(os.path.join(REPO, 'public', 'data', 'index.json'), encoding='utf-8'))['e']
found = []
for e in sorted(index, key=lambda r: r[2]):
    if e[1] != 0:
        continue
    word = e[0].lower()
    note = notes.get(word)
    if not note or not re.fullmatch(r'[a-z]+', word):
        continue
    linked = set(e[6])
    for rid, forms, pat, meaning in roots:
        if 'r:' + rid in linked:
            continue
        form = next((f for f in forms if f in word), None)  # 綴りの照合を先に行う（安価なため）
        if not form:
            continue
        m = pat.search(note)
        if m:
            found.append((e[2], e[0], rid, form, m.group(1), meaning))

for rank, w, rid, form, key, meaning in found[:args.top]:
    print(f'{rank}\t{w}\tr:{rid}（{meaning}）\t綴り {form}\t解説の語 {key}')
print(f'# 候補 {len(found)} 件', flush=True)
