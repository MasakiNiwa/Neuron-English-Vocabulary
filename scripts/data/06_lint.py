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

# ---- 解説と語源分解で、同じ綴りの接頭辞の意味が食い違っていないか（公開データがあれば）
# 例: 解説は「in（中へ）」なのに語源分解が pre:in（否定）、「di（離れて）」なのに pre:dia（横切って）
# 解説の「綴り（意味）」の意味が、付いている形態素ではなく同じ綴りの別の形態素の意味に当てはまるときにエラーにする
import re  # noqa: E402
AFFIX_KW = {
    'pre:a': ['否定', 'ない', '無'], 'pre:ab': ['離れ', 'から'], 'pre:ad': ['へ', 'に向', '加え', 'に'],
    'pre:ante': ['前'], 'pre:anti': ['反', '対抗', '逆'], 'pre:dia': ['横切', '通し', '間', '完全'],
    'pre:dis': ['離れ', '否定', '反対', 'ない', 'ばらばら', '分け', '逆', '除'], 'pre:en': ['中', 'する', '入れ'],
    'pre:into': ['中', '上に', 'へ', 'に', '内'], 'pre:in': ['否定', 'ない', '不', '無'], 'pre:sub': ['下'],
    'pre:super': ['上', '超'], 'pre:un': ['ない', '否定', '元に', '逆', '不'], 'pre:uni': ['1', '一', '単'],
}
mpath = os.path.join(REPO, 'public', 'data', 'morphemes.json')
same_form, morph_meaning = {}, {}
if os.path.exists(mpath):
    by_form = {}
    for x in json.load(open(mpath, encoding='utf-8')):
        if x['type'] in ('prefix', 'root', 'suffix'):
            morph_meaning[x['id']] = x['meaning']['ja']
            for f in x['forms']:
                by_form.setdefault((x['type'] == 'prefix', f), set()).add(x['id'])
    same_form = {f: ids for f, ids in by_form.items() if len(ids) > 1}


def affix_fits(mid, mean):
    """解説の意味が形態素に当てはまるか（接頭辞はキーワード表、語根・接尾辞は形態素の意味の語と照合）"""
    if mid in AFFIX_KW:
        return any(w in mean for w in AFFIX_KW[mid])
    ws = [w for w in re.split(r'[・、,/（）()〜\s]+', morph_meaning.get(mid, '')) if w]
    return any(w in mean or (len(mean) >= 2 and mean in w) for w in ws)

for path in sorted(glob.glob(os.path.join(REPO, 'public', 'data', 'entries', '*.json'))):
    for k, e in json.load(open(path, encoding='utf-8')).items():
        if k == '_v':
            continue  # シャードの版
        note = (e.get('note') or {}).get('ja', '')
        if not note:
            continue
        for p_ in e.get('parts') or []:
            seg, mid = p_.get('s'), p_.get('m')
            key = ((mid or '').startswith('pre:'), seg)
            if key not in same_form or mid not in same_form[key]:
                continue
            mm = re.search(r'(^|[^a-z])-?' + re.escape(seg) + r'[-‐]?（([^）]{1,20})）', note)
            if not mm:
                continue
            mean = mm.group(2)
            others = sorted(i for i in same_form[key] if i != mid and affix_fits(i, mean))
            if others and not affix_fits(mid, mean):
                errors.append(f'{k}: 解説では {seg}（{mean}）ですが、語源分解が {mid} です（{" / ".join(others)} では？）')

# ---- 公開データの不変条件（ROADMAP T03。公開データがあれば）
# 書式だけでなく、教材として壊れていないことを確かめる
if os.path.exists(idx_path) and os.path.exists(mpath):
    index = {r[0]: r for r in json.load(open(idx_path, encoding='utf-8'))['e']}
    mids = {x['id'] for x in json.load(open(mpath, encoding='utf-8'))}
    seen_keys = set()
    PLACEHOLDER = ('（手動の訳で置き換え）', 'TODO', 'FIXME')
    for path in sorted(glob.glob(os.path.join(REPO, 'public', 'data', 'entries', '*.json'))):
        shard = os.path.splitext(os.path.basename(path))[0]
        for k, e in json.load(open(path, encoding='utf-8')).items():
            if k == '_v':
                continue  # シャードの版
            seen_keys.add(k)
            ir = index.get(k)
            if not ir:
                errors.append(f'{k}: 詳細データにあるが索引にない')
                continue
            if ir[5] != shard:
                errors.append(f'{k}: 索引のシャード {ir[5]} と実際のシャード {shard} が違う')
            if not e.get('g') or not any(g.get('ja') for g in e['g']):
                errors.append(f'{k}: 日本語訳がない')
            text = json.dumps(e.get('g'), ensure_ascii=False) + (e.get('note') or {}).get('ja', '')
            if any(t in text for t in PLACEHOLDER):
                errors.append(f'{k}: 仮の文字列が残っている')
            parts = e.get('parts') or []
            if parts:
                joined = ''.join(p_['s'] for p_ in parts).lower()
                if joined != e['h'].lower().replace(' ', '') and joined.replace('-', '') != e['h'].lower().replace('-', ''):
                    errors.append(f'{k}: 語源分解の綴り {joined} が見出し語と一致しない')
                for p_ in parts:
                    m_ = p_.get('m')
                    if m_ and not m_.startswith('w:') and m_ not in mids:
                        errors.append(f'{k}: 存在しない形態素 {m_} を参照している')
                    if m_ and m_.startswith('w:') and m_[2:].replace(' ', '_') not in index and m_[2:] not in index:
                        warnings.append(f'{k}: 語源分解の参照先 {m_[2:]} が見出し語にない')
            for ex in e.get('ex') or []:
                if not ex.get('en') or not ex.get('ja'):
                    errors.append(f'{k}: 例文の英文か訳が空')
    for k in index:
        if k not in seen_keys:
            errors.append(f'{k}: 索引にあるが詳細データにない')

# ---- 韓国語・中国語の訳（data/translations）: 訳したあとに日本語が変わった訳・見出し語にない訳
if os.path.isdir(os.path.join(REPO, 'data', 'translations')):
    import runpy
    TR = runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'translation_src.py'))
    cur_gloss, cur_morph = {}, {}
    for f in glob.glob(os.path.join(REPO, 'public', 'data', 'entries', '*.json')):
        with open(f, encoding='utf-8') as fh:
            for k, e in json.load(fh).items():
                if k != '_v':
                    for g in e['g']:
                        cur_gloss[(k, g['p'])] = TR['gloss_src'](g['p'], g['ja'])
    with open(os.path.join(REPO, 'public', 'data', 'morphemes.json'), encoding='utf-8') as fh:
        for m in json.load(fh):
            cur_morph[(m['id'],)] = TR['morph_src'](m['meaning']['ja'])
    for lang in TR['TR_LANGS']:
        for kind, cur in (('gloss', cur_gloss), ('morphemes', cur_morph)):
            tr = TR['read_translations'](REPO, lang, kind, warn=lambda msg: warnings.append(msg.removeprefix('WARN ')))
            missing = [' '.join(k) for k in tr if k not in cur]
            stale = [' '.join(k) for k, (src, _) in tr.items() if k in cur and cur[k] != src]
            if missing:
                warnings.append(f'translations/{lang}/{kind}: 見出し語・形態素にない訳 {len(missing)} 件: ' + ', '.join(missing[:10]))
            if stale:
                warnings.append(f'translations/{lang}/{kind}: 訳したあとに日本語が変わった訳 {len(stale)} 件'
                                f'（08_translation_export.py --needed {lang} で訳し直す分を書き出せる）: ' + ', '.join(stale[:10]))

for w in warnings:
    print('WARN', w)
for e in errors:
    print('ERROR', e)
print(f'lint: エラー {len(errors)} 件 / 警告 {len(warnings)} 件')
sys.exit(1 if errors else 0)
