#!/usr/bin/env python3
"""
韓国語・中国語の翻訳用に、公開データから訳すもとを書き出す。

usage: python3 -I scripts/data/08_translation_export.py <出力先ディレクトリ> [--repo .] [--batch 200]

出力（JSON Lines。--batch 件ごとにファイルを分ける）:
  gloss-NNN.jsonl      単語・熟語の訳。1 行 = 1 語の 1 品詞
                       {"key", "head", "pos", "ja": [日本語の訳], "en": [英語の定義（文脈用、最大 2 つ）]}
  morphemes-NNN.jsonl  語根・接頭辞・接尾辞の意味 {"id", "label", "type", "ja"}
  notes-NNN.jsonl      解説（今後の取り込み用。いまは取り込まない） {"key", "head", "ja"}

訳したものは data/translations/<言語>/ に TSV で置き、04_build.py でビルドする（言語は ko・zh-Hans・zh-Hant）:
  gloss.tsv      key<TAB>pos<TAB>訳1 | 訳2 | 訳3
  morphemes.tsv  id<TAB>意味1 | 意味2
詳しくは scripts/data/README.md の「韓国語・中国語の訳」を参照。
"""
import argparse
import ast
import glob
import json
import os

ap = argparse.ArgumentParser()
ap.add_argument('out')
ap.add_argument('--repo', default='.')
ap.add_argument('--batch', type=int, default=200)
args = ap.parse_args()

DATA = os.path.join(args.repo, 'public', 'data')
os.makedirs(args.out, exist_ok=True)

entries = {}
for f in glob.glob(os.path.join(DATA, 'entries', '*.json')):
    with open(f, encoding='utf-8') as fh:
        d = json.load(fh)
    d.pop('_v', None)
    entries.update(d)
order = sorted(entries.values(), key=lambda e: (e['t'] != 'w', e['r'], e['k']))


def en_defs(e, pos):
    d = e.get('d') or []
    if isinstance(d, str):  # 念のため（通常は配列）
        d = ast.literal_eval(d)
    for x in d:
        if x.get('p') == pos:
            return x.get('en', [])[:2]
    return []


gloss, notes = [], []
for e in order:
    for g in e['g']:
        gloss.append({'key': e['k'], 'head': e['h'], 'pos': g['p'], 'ja': g['ja'], 'en': en_defs(e, g['p'])})
    if e.get('note'):
        notes.append({'key': e['k'], 'head': e['h'], 'ja': e['note']['ja']})

with open(os.path.join(DATA, 'morphemes.json'), encoding='utf-8') as fh:
    morphs = [{'id': m['id'], 'label': m['label'], 'type': m['type'], 'ja': m['meaning']['ja']}
              for m in json.load(fh) if m['type'] in ('root', 'prefix', 'suffix', 'particle')]


def write(name, rows):
    files = 0
    for i in range(0, len(rows), args.batch):
        files += 1
        with open(os.path.join(args.out, f'{name}-{files:03d}.jsonl'), 'w', encoding='utf-8') as fh:
            for r in rows[i:i + args.batch]:
                fh.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(f'{name}: {len(rows)} 件 / {files} ファイル')


write('gloss', gloss)
write('morphemes', morphs)
write('notes', notes)
