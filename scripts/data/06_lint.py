#!/usr/bin/env python3
"""
手で書くデータファイル（data/*.tsv・data/overrides/・data/explanations/）の書式チェック。
元データ（Wiktionary など）がなくても実行でき、CI でも使う。

  python3 scripts/data/06_lint.py

エラーがあれば一覧を出して終了コード 1 で終わる。
（見出し語がデータにない場合は、除外済みの語もあるので警告のみ）
"""
import glob
import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
errors, warnings = [], []
POS = {'noun', 'verb', 'adj', 'adv', 'prep', 'conj', 'pron', 'det', 'intj', 'num', 'phrase'}


def rows(path):
    with open(path, encoding='utf-8') as f:
        for n, line in enumerate(f, 1):
            line = line.rstrip('\n')
            if line.startswith('#') or not line.strip():
                continue
            yield n, line.split('\t')


def where(path, n):
    return f'{os.path.relpath(path, REPO)}:{n}'


# ---- 形態素
morph_ids = set()
for path, prefix, cols in (('roots.tsv', 'r:', 5),):
    p = os.path.join(REPO, 'data', path)
    for n, r in rows(p):
        if len(r) < cols:
            errors.append(f'{where(p, n)} 列が足りません（{cols} 列必要）')
            continue
        mid = prefix + r[0]
        if mid in morph_ids:
            errors.append(f'{where(p, n)} 語根 ID が重複しています: {r[0]}')
        morph_ids.add(mid)
p = os.path.join(REPO, 'data', 'affixes.tsv')
for n, r in rows(p):
    if len(r) < 5 or r[0] not in ('prefix', 'suffix'):
        errors.append(f'{where(p, n)} 書式が正しくありません')
        continue
    mid = ('pre:' if r[0] == 'prefix' else 'suf:') + r[1]
    if mid in morph_ids:
        errors.append(f'{where(p, n)} 接辞 ID が重複しています: {r[1]}')
    morph_ids.add(mid)

# ---- 公開データの見出し語（あれば照合に使う）
headwords = set()
idx_path = os.path.join(REPO, 'public', 'data', 'index.json')
if os.path.exists(idx_path):
    headwords = {r[0].replace('_', ' ').lower() for r in json.load(open(idx_path, encoding='utf-8'))['e']}


def check_head(w, at):
    if headwords and w.lower() not in headwords:
        warnings.append(f'{at} 見出し語がデータにありません: {w}')


# ---- 手動での修正
seen = {}
for p in sorted(glob.glob(os.path.join(REPO, 'data', 'overrides', '*.tsv'))):
    for n, r in rows(p):
        at = where(p, n)
        cmd = r[0]
        if cmd == 'gloss':
            if len(r) != 3:
                errors.append(f'{at} gloss は 3 列です')
                continue
            for part in r[2].split('|'):
                pos, sep, words = part.partition(':')
                if not sep or pos.strip() not in POS:
                    errors.append(f'{at} 品詞が正しくありません: {part}')
                elif not words.strip():
                    errors.append(f'{at} 訳が空です: {part}')
            check_head(r[1], at)
        elif cmd == 'parts':
            if len(r) != 3:
                errors.append(f'{at} parts は 3 列です')
                continue
            spans = []
            for tok in r[2].split():
                sp, _, mid = tok.partition('=')
                spans.append(sp)
                if mid and not mid.startswith('w:') and mid not in morph_ids:
                    errors.append(f'{at} 未登録の形態素 ID です: {mid}')
            if ''.join(spans).lower() != r[1].lower():
                errors.append(f'{at} 綴りをつなげると見出し語と一致しません: {r[1]} ≠ {"".join(spans)}')
            check_head(r[1], at)
        elif cmd == 'exclude':
            if len(r) != 3 or r[1] not in morph_ids:
                errors.append(f'{at} exclude の書式または形態素 ID が正しくありません')
        elif cmd in ('drop', 'noparts'):
            if len(r) != 2:
                errors.append(f'{at} {cmd} は 2 列です')
        else:
            errors.append(f'{at} 不明な指示です: {cmd}')
            continue
        if cmd in ('gloss', 'parts'):
            key = (cmd, r[1])
            if key in seen:
                warnings.append(f'{at} {cmd} が {seen[key]} と重複しています（後のものが優先）: {r[1]}')
            seen[key] = at

# ---- 解説
noted = {}
for p in sorted(glob.glob(os.path.join(REPO, 'data', 'explanations', '*.tsv'))):
    for n, r in rows(p):
        at = where(p, n)
        if len(r) != 2 or not r[1].strip():
            errors.append(f'{at} 解説は「見出し語<TAB>本文」の 2 列です')
            continue
        if r[0] in noted:
            errors.append(f'{at} 解説が {noted[r[0]]} と重複しています: {r[0]}')
        noted[r[0]] = at
        check_head(r[0], at)

for w in warnings:
    print('WARN', w)
for e in errors:
    print('ERROR', e)
print(f'lint: エラー {len(errors)} 件 / 警告 {len(warnings)} 件')
sys.exit(1 if errors else 0)
