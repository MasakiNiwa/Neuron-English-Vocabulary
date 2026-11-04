"""単語データの品質チェック（訳語の怪しい語を頻度順に列挙する）。

usage: python3 scripts/data/05_quality_report.py [--top 2000] [--limit 300]
  - カタカナだけの訳しかない（音訳の可能性）
  - 先頭の訳がカタカナ（より適切な訳が後ろにある可能性）
  - 訳が 1 つだけ
  - 手動修正 (data/overrides/*.tsv) 済みの語は除外
出力は data/overrides/*.tsv に書き写して直す想定のタブ区切り。
"""
import argparse, glob, json, os, re

ap = argparse.ArgumentParser()
ap.add_argument('--top', type=int, default=2000)
ap.add_argument('--limit', type=int, default=300)
ap.add_argument('--repo', default='.')
a = ap.parse_args()

KATA = re.compile(r'^[゠-ヿー・]+$')
entries = {}
for f in glob.glob(os.path.join(a.repo, 'public/data/entries/w*.json')):
    entries.update({k: v for k, v in json.load(open(f, encoding='utf-8')).items() if k != '_v'})
rows = sorted((e for e in entries.values() if e['r'] <= a.top and not e.get('manual')), key=lambda e: e['r'])
out = []
for e in rows:
    ja = [x for g in e['g'] for x in g['ja']]
    reasons = []
    if ja and all(KATA.match(x) for x in ja):
        reasons.append('カタカナのみ')
    elif ja and KATA.match(ja[0]):
        reasons.append('先頭がカタカナ')
    if len(ja) == 1:
        reasons.append('訳が1つ')
    if reasons:
        gl = '|'.join(f"{g['p']}:{'、'.join(g['ja'])}" for g in e['g'])
        out.append(f"{e['r']}\t{e['k']}\t{','.join(reasons)}\t{gl}")
print(f'# {len(out)} 件（上位 {a.top} 語中）')
print('\n'.join(out[: a.limit]))
