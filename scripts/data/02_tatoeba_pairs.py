"""Tatoeba の英語・日本語文とリンクから英日対訳ペアを抽出する。

usage: python3 -I 02_tatoeba_pairs.py <eng_sentences.tsv.bz2> <jpn_sentences.tsv.bz2> <links.tar.bz2> <out.tsv> <eng_all.txt>
出典: https://tatoeba.org/ (CC BY 2.0 FR)
"""
import bz2, sys, tarfile

eng_p, jpn_p, links_p, out_p, eng_all_p = sys.argv[1:6]

def load(p):
    d = {}
    with bz2.open(p, 'rt', encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) >= 3:
                d[int(parts[0])] = parts[2]
    return d

eng = load(eng_p)
jpn = load(jpn_p)
print('eng', len(eng), 'jpn', len(jpn))
with open(eng_all_p, 'w', encoding='utf-8') as f:
    for s in eng.values():
        f.write(s + '\n')

pairs = {}
with tarfile.open(links_p, 'r:bz2') as tar:
    for m in tar:
        if not m.isfile():
            continue
        f = tar.extractfile(m)
        for raw in f:
            a, b = raw.decode().split('\t')[:2]
            a, b = int(a), int(b)
            if a in eng and b in jpn and a not in pairs:
                pairs[a] = b
print('pairs', len(pairs))
with open(out_p, 'w', encoding='utf-8') as o:
    for a, b in pairs.items():
        o.write(f'{a}\t{eng[a]}\t{b}\t{jpn[b]}\n')
