"""単語データ（public/data）を生成するメインスクリプト。

usage:
  python3 -I scripts/data/04_build.py --work <作業ディレクトリ> --raw <生データディレクトリ> --repo <リポジトリ>

入力（作業ディレクトリ）:
  wikt.jsonl     01_filter_wiktionary.py の出力
  pairs.tsv      02_tatoeba_pairs.py の出力（英日対訳）
  eng_all.txt    02_tatoeba_pairs.py の出力（熟語の頻度計測用の英文）
  jm_rev.json    03_jmdict_reverse.py の出力
入力（生データ）:
  NGSL_12_stats.csv, NGSL_12_lemmatized_for_research.csv
入力（リポジトリ）:
  data/roots.tsv, data/affixes.tsv, data/phrases_extra.tsv（任意）

出力: public/data/ 以下（index.json, morphemes.json, entries/*.json, meta.json）
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone

from wordfreq import top_n_list, zipf_frequency

ap = argparse.ArgumentParser()
ap.add_argument('--work', required=True)
ap.add_argument('--raw', required=True)
ap.add_argument('--repo', required=True)
ap.add_argument('--words', type=int, default=10000)
ap.add_argument('--phrases', type=int, default=1500)
args = ap.parse_args()
W, R, REPO = args.work, args.raw, args.repo
OUT = os.path.join(REPO, 'public', 'data')
SHARD = 200

OK_POS = {'noun', 'verb', 'adj', 'adv', 'prep', 'pron', 'conj', 'det', 'num', 'intj', 'article', 'particle', 'postp'}
PHRASE_POS = {'verb', 'phrase', 'prep_phrase', 'adv', 'adj', 'noun', 'intj', 'prep', 'conj'}
POS_MAP = {'article': 'det', 'particle': 'adv', 'postp': 'prep', 'prep_phrase': 'phrase'}
BAD_TAGS = {'obsolete', 'archaic', 'misspelling', 'abbreviation', 'initialism', 'acronym', 'rare', 'dated',
            'nonstandard', 'pronunciation-spelling', 'eye-dialect', 'dialectal', 'Internet', 'slang', 'vulgar',
            'offensive', 'derogatory', 'alternative'}


def strip_accents(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def norm_text(s: str) -> str:
    return strip_accents(s or '').lower()


# ---------------------------------------------------------------- 読み込み
print('loading wiktionary…')
wikt: dict[str, list[dict]] = defaultdict(list)
with open(os.path.join(W, 'wikt.jsonl'), encoding='utf-8') as f:
    for line in f:
        d = json.loads(line)
        wikt[d['word']].append(d)

jm = json.load(open(os.path.join(W, 'jm_rev.json'), encoding='utf-8'))

ngsl_rank: dict[str, int] = {}
with open(os.path.join(R, 'NGSL_12_stats.csv'), encoding='utf-8') as f:
    for row in csv.DictReader(f):
        ngsl_rank[row['Lemma'].strip().lower()] = int(row['SFI Rank'])
form2lemma: dict[str, str] = {}
with open(os.path.join(R, 'NGSL_12_lemmatized_for_research.csv'), encoding='utf-8-sig') as f:
    for line in f:
        if line.startswith('#') or not line.strip():
            continue
        parts = [p.strip().lower() for p in line.strip().split(',') if p.strip()]
        for p in parts:
            form2lemma.setdefault(p, parts[0])
        form2lemma[parts[0]] = parts[0]


def read_tsv(path):
    rows = []
    if not os.path.exists(path):
        return rows
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.startswith('#') or not line.strip():
                continue
            rows.append(line.rstrip('\n').split('\t'))
    return rows


roots = []
for r in read_tsv(os.path.join(REPO, 'data', 'roots.tsv')):
    rid, forms, etymons, meaning, origin = r[:5]
    roots.append({
        'id': 'r:' + rid, 'label': rid, 'forms': sorted({x for x in forms.split(',') if x}, key=len, reverse=True),
        'etymons': [norm_text(x) for x in etymons.split(',') if x], 'meaning': meaning, 'origin': origin,
    })
prefixes, suffixes = [], []
for r in read_tsv(os.path.join(REPO, 'data', 'affixes.tsv')):
    typ, aid, forms, meaning, origin = r[:5]
    item = {'id': ('pre:' if typ == 'prefix' else 'suf:') + aid, 'label': aid,
            'forms': sorted({x for x in forms.split(',') if x}, key=len, reverse=True), 'meaning': meaning, 'origin': origin}
    (prefixes if typ == 'prefix' else suffixes).append(item)
def _etymon_re(ets):
    if not ets:
        return re.compile(r'(?!)')  # 語源判定キーがない語根（構成要素専用）は単語と照合しない
    strict = '|'.join(re.escape(e) for e in ets)
    # 5文字以上の語源語は前に接頭辞が付いた形（exportare → portare）も許容する
    loose = '|'.join(re.escape(e) for e in ets if len(e) >= 5) or '(?!)'
    return re.compile(r'(?<![a-z])(' + strict + r')(?![a-z])|(' + loose + r')(?![a-z])')


etymon_res = {r['id']: _etymon_re(r['etymons']) for r in roots}


def entries_for(w: str) -> list[dict]:
    es = [e for e in wikt.get(w, []) if e['pos'] in OK_POS]
    if not es and w.islower():
        cap = w.capitalize()
        es = [e for e in wikt.get(cap, []) if e['pos'] in OK_POS]
    return es


def good_sense(s) -> bool:
    if s.get('form_of') or s.get('alt_of'):
        return False
    tags = set(s.get('tags') or [])
    return not (tags & BAD_TAGS)


# ---------------------------------------------------------------- 日本語訳
def is_ja(word: str) -> bool:
    return bool(re.search(r'[぀-ヿ一-鿿]', word)) and len(word) <= 14


def collect_tr(entries: list[dict], lang: str, limit_pos=3, limit_all=7):
    """品詞ごとの訳語リスト [(pos, [訳…])]"""
    langs = {'zh': ('zh', 'cmn')}.get(lang, (lang,))
    out = []
    total = 0
    for e in entries:
        seen = []
        for s in e['senses']:
            if not good_sense(s):
                continue
            for t in s.get('translations') or []:
                if t['lang_code'] in langs and t.get('word') and t['word'] not in seen and (lang != 'ja' or is_ja(t['word'])):
                    seen.append(t['word'])
        for t in e.get('translations') or []:
            if t['lang_code'] in langs and t.get('word') and t['word'] not in seen and (lang != 'ja' or is_ja(t['word'])):
                seen.append(t['word'])
        seen = [re.sub(r'\s+', '', x) if lang == 'ja' else x for x in seen][:limit_pos]
        if seen:
            pos = POS_MAP.get(e['pos'], e['pos'])
            prev = next((o for o in out if o[0] == pos), None)
            if prev:
                prev[1].extend([x for x in seen if x not in prev[1]])
            else:
                out.append((pos, seen))
            total += len(seen)
        if total >= limit_all:
            break
    return out


def jm_gloss(word: str, min_score=25):
    v = jm.get(word.lower())
    if v and v[1] >= min_score:
        return [x for x in v[0] if is_ja(x)][:3]
    return []


# ---------------------------------------------------------------- 見出し語の選定
print('selecting headwords…')
DROP = {r[1] for r in read_tsv(os.path.join(REPO, 'data', 'overrides.tsv')) if r[0] == 'drop' and len(r) > 1}
top = top_n_list('en', 80000)
lemmas: dict[str, dict] = {}
skipped_no_ja = 0
for w in top:
    if len(lemmas) >= args.words:
        break
    if not re.fullmatch(r"[a-z][a-z'-]*", w) or "'" in w:
        continue
    if len(w) == 1 and w not in ('a', 'i'):
        continue
    if w in form2lemma:
        L = form2lemma[w]
    else:
        es = entries_for(w)
        if not es:
            continue
        good = [s for e in es for s in e['senses'] if good_sense(s)]
        targets = [t for e in es for s in e['senses'] for t in (s.get('form_of') or []) if t]
        if targets:
            t0 = targets[0]
            if t0.lower() in lemmas or t0.lower() in form2lemma or not good:
                L = form2lemma.get(t0.lower(), t0.lower())
            else:
                L = w
        elif good:
            L = w
        else:
            continue
    if L in lemmas or L in DROP:
        continue
    key = 'I' if L == 'i' else L
    es = entries_for(key) or entries_for(L)
    if not es:
        continue
    head = es[0]['word']
    tr = collect_tr(es, 'ja')
    if not tr:
        g = jm_gloss(L)
        if g:
            tr = [(POS_MAP.get(es[0]['pos'], es[0]['pos']), g)]
    if not tr:
        skipped_no_ja += 1
        continue
    lemmas[L] = {'head': head, 'entries': es, 'ja': tr}
print('lemmas', len(lemmas), 'skipped(no ja)', skipped_no_ja)

# 活用形 → 見出し語
infl: dict[str, str] = {}
for L, v in lemmas.items():
    for e in v['entries']:
        for fm in e.get('forms') or []:
            fm = fm.lower()
            if re.fullmatch(r'[a-z-]+', fm) and fm not in lemmas:
                infl.setdefault(fm, L)
for fm, L in form2lemma.items():
    if L in lemmas and fm not in lemmas:
        infl.setdefault(fm, L)
for L in lemmas:
    infl[L] = L


def lemma_of(tok: str) -> str:
    return infl.get(tok, tok)


# ---------------------------------------------------------------- 熟語（句動詞）の選定
print('selecting phrases…')
cand: dict[str, list[dict]] = defaultdict(list)
for w, es in wikt.items():
    if ' ' not in w or not re.fullmatch(r"[a-z ]+", w):
        continue
    toks = w.split(' ')
    if not (2 <= len(toks) <= 4) or not all(t in lemmas or t in infl for t in toks):
        continue
    es2 = [e for e in es if e['pos'] in PHRASE_POS and any(good_sense(s) for s in e['senses'])]
    if es2:
        cand[w] = es2
print('phrase candidates', len(cand))
SUBJ = {'i', 'you', 'he', 'she', 'it', 'we', 'they', 'do', 'does', 'did', 'is', 'was', 'are'}
cand_keys = set(cand)
# 先頭語を見出し語化したキーでも照合する（gave up → give up）
cand_by_lemma = defaultdict(set)
for w in cand:
    toks = w.split(' ')
    cand_by_lemma[(lemma_of(toks[0]),) + tuple(toks[1:])].add(w)
pcount = Counter()
tok_re = re.compile(r"[a-z]+(?:'[a-z]+)?")
with open(os.path.join(W, 'eng_all.txt'), encoding='utf-8') as f:
    for line in f:
        toks = tok_re.findall(line.lower())
        n = len(toks)
        for i in range(n):
            l0 = lemma_of(toks[i])
            for k in (2, 3, 4):
                if i + k > n:
                    break
                key = (l0,) + tuple(toks[i + 1:i + k])
                ws = cand_by_lemma.get(key)
                if ws:
                    for w in ws:
                        pcount[w] += 1
phr_sel = []
for w, c in pcount.most_common():
    if len(phr_sel) >= args.phrases:
        break
    if w in DROP:
        continue
    if c < 8:
        break
    es = cand[w]
    tr = collect_tr(es, 'ja')
    if not tr:
        g = jm_gloss(w, 30)
        if g:
            tr = [(POS_MAP.get(es[0]['pos'], es[0]['pos']), g)]
    if not tr:
        continue
    toks0 = w.split(' ')
    if toks0[0] in SUBJ or not any(e['pos'] != 'noun' for e in es):
        continue  # 文（"do you know"）や複合名詞（"car wash"）は熟語として扱わない
    # 先頭語＋機能語だけの自明な連語（"of the" など）を除外
    if all(t in ('the', 'a', 'an', 'of', 'to', 'and', 'in', 'is', 'it') for t in w.split(' ')[1:]) and es[0]['pos'] not in ('verb', 'phrase', 'prep_phrase'):
        continue
    phr_sel.append((w, c, es, tr))
print('phrases', len(phr_sel))


# ---------------------------------------------------------------- 印欧祖語（PIE）の語根
def pie_slug(form: str) -> str:
    t = strip_accents(form).translate(str.maketrans({'₁': '1', '₂': '2', '₃': '3', 'ʰ': 'h', 'ʷ': 'w', 'ǵ': 'g', 'ḱ': 'k'}))
    t = re.sub(r'[^A-Za-z0-9]+', '-', t).strip('-').lower()
    return 'pie:' + t


pie_defs = {}
for r in read_tsv(os.path.join(REPO, 'data', 'pie_roots.tsv')):
    form, meaning = r[0], r[1]
    members = [x for x in (r[2].split(',') if len(r) > 2 else []) if x]
    pie_defs[form] = {'id': pie_slug(form), 'form': form, 'meaning': meaning, 'members': members}


def pie_of(es: list[dict]) -> list[str]:
    out = []
    for e in es:
        for tp in e.get('etymology_templates') or []:
            a = tp.get('args') or {}
            if tp['name'] == 'root' and a.get('2') == 'ine-pro':
                for k in sorted((k for k in a if k.isdigit() and int(k) >= 3), key=int):
                    d = pie_defs.get(a[k])
                    if d and d['id'] not in out:
                        out.append(d['id'])
    return out


# 形態素自体の成り立ち（語源の語源分解）
morph_parts = {}
for r in read_tsv(os.path.join(REPO, 'data', 'morpheme_parts.tsv')):
    morph_parts[r[0]] = {'parts': [x for x in r[1].split('+') if x], 'note': r[2] if len(r) > 2 else ''}


# ---------------------------------------------------------------- 語源分解
def ety_info(es: list[dict]):
    texts, tparts = [], []
    for e in es:
        t = e.get('etymology_text') or ''
        if t and t not in texts:
            texts.append(t)
        for tp in e.get('etymology_templates') or []:
            if tp['name'] in ('affix', 'af', 'prefix', 'pre', 'suffix', 'suf', 'confix', 'con', 'compound', 'com', 'surf', 'univerbation'):
                a = tp.get('args') or {}
                parts = [a[k] for k in sorted((k for k in a if k.isdigit() and k != '1'), key=int)]
                tparts.append((a.get('1'), [p for p in parts if p]))
    return texts, tparts


PREFIX_FORMS = sorted({f for p in prefixes for f in p['forms']}, key=len, reverse=True)


def classical_has(c: str, fm: str) -> bool:
    """ラテン語などの語形 c に語根の綴り fm が含まれるか。短い綴りは語頭（または接頭辞の直後）に限る"""
    if len(fm) >= 4:
        return fm in c
    return c.startswith(fm)


def analyze(L: str, es: list[dict]):
    """語の成り立ちを [{s: 綴り, m: 形態素ID | 'w:<語>' | None}] で返す"""
    texts, tparts = ety_info(es)
    ntext = norm_text(' '.join(texts))
    word = L.lower()
    if not re.fullmatch(r'[a-z]+', word):
        return None, texts
    en_parts = [norm_text(p) for lang, ps in tparts if lang in ('en', None) for p in ps]
    all_parts_text = ' '.join(norm_text(p) for _, ps in tparts for p in ps)
    mentioned_pre = set(re.findall(r'(?<![a-z-])([a-z]+)-(?=[\s(,.;:"“]|$)', ntext)) | {p[:-1] for p in en_parts if p.endswith('-')}
    mentioned_suf = set(re.findall(r'(?<![a-z])-([a-z]+)\b', ntext)) | {p[1:] for p in en_parts if p.startswith('-')}

    spans = []  # (start, end, id)
    # 1) 英語の語基（kind + -ness, foot + ball）
    for p in en_parts:
        if p.startswith('-') or p.endswith('-') or p == word or len(p) < 3:
            continue
        if p in lemmas and p in word:
            i = word.find(p)
            spans.append((i, i + len(p), 'w:' + lemmas[p]['head'], 3))
    # 2) 語根: 語源テキストに語源語が現れる、またはラテン語・ギリシャ語の語形にその綴りが含まれる
    classical = set(re.findall(r'(?:latin|greek|french|anglo-norman)\s+([a-z-]{4,})', ntext))
    for e in es:
        for tp in e.get('etymology_templates') or []:
            a = tp.get('args') or {}
            if tp['name'] in ('bor', 'der', 'inh', 'uder', 'lbor', 'ubor') and a.get('2') in ('la', 'grc', 'LL', 'ML.', 'NL.', 'fro', 'frm', 'xno', 'fr'):
                classical.add(norm_text(a.get('3') or ''))
            if tp['name'] == 'etymon':
                for v in a.values():
                    if isinstance(v, str) and v[:3] in ('la:', 'grc'):
                        classical.add(norm_text(v.split(':', 1)[1]))
    classical.discard(word)
    for r in roots:
        strength = 2 if etymon_res[r['id']].search(ntext + ' ' + all_parts_text) else 0
        if not strength and any(classical_has(c, fm) for c in classical for fm in r['forms'] if len(fm) >= 3 and fm in word):
            strength = 1
        if not strength:
            continue
        for fm in r['forms']:
            i = word.find(fm)
            if i < 0:
                continue
            if len(fm) <= 2 and i > 4:
                continue
            spans.append((i, i + len(fm), r['id'], strength))
            break
    # 語末の語根が接尾辞と同じ綴り（government の -ment など）なら接尾辞として扱う
    suffix_forms = {f for sf in suffixes for f in sf['forms']}
    spans = [sp for sp in spans if not (sp[2].startswith('r:') and sp[1] == len(word) and word[sp[0]:sp[1]] in suffix_forms)]
    # 3) 接頭辞
    for p in prefixes:
        for fm in p['forms']:
            if not word.startswith(fm) or len(word) - len(fm) < 3:
                continue
            explicit = fm in mentioned_pre or p['label'] in mentioned_pre
            follows_root = any(s[0] == len(fm) and s[2].startswith(('r:', 'w:')) for s in spans)
            if explicit or follows_root:
                pid = p['id']
                if pid == 'pre:in' and ('not' not in ntext and 'un-' not in ntext) and follows_root:
                    pid = 'pre:into'
                rem = word[len(fm):]
                if pid == 'pre:into' and (('“not' in ntext or '"not' in ntext) or
                                          (rem in lemmas and any(e['pos'] == 'adj' for e in lemmas[rem]['entries']))):
                    pid = 'pre:in'
                spans.append((0, len(fm), pid, 3))
                break
        else:
            continue
        break
    # 4) 接尾辞
    for s in suffixes:
        for fm in s['forms']:
            if not word.endswith(fm) or len(word) - len(fm) < 3:
                continue
            explicit = fm in mentioned_suf or s['label'] in mentioned_suf
            before_end = len(word) - len(fm)
            if any(sp[2].startswith('r:') and sp[1] > before_end for sp in spans):
                continue  # 語根と重なる長い接尾辞は避け、短い異形を試す（conclusion → clus + ion）
            after_root = any(sp[1] == before_end and sp[2].startswith(('r:', 'w:')) for sp in spans)
            if explicit or after_root:
                spans.append((before_end, len(word), s['id'], 3))
                break
        else:
            continue
        break
    if not spans:
        return None, texts
    # 重なりを解消（接頭辞・接尾辞・語基・語根の順に長いものを優先）
    prio = lambda sp: (0 if sp[2].startswith(('pre:', 'suf:')) else 1 if sp[2].startswith('w:') else 2, -sp[3], -(sp[1] - sp[0]))
    chosen = []
    for sp in sorted(spans, key=prio):
        if all(sp[1] <= c[0] or sp[0] >= c[1] for c in chosen):
            chosen.append(sp)
    chosen.sort()
    if not any(c[2].startswith(('r:', 'w:')) for c in chosen) and len(chosen) < 2:
        return None, texts  # 接辞1つだけの分解は信頼性が低いので採用しない
    segs, pos = [], 0
    for a, b, mid, _ in chosen:
        if a > pos:
            segs.append({'s': word[pos:a], 'm': None})
        segs.append({'s': word[a:b], 'm': mid})
        pos = b
    if pos < len(word):
        segs.append({'s': word[pos:], 'm': None})
    # 綴りの大半が未解析なら採用しない
    unknown = sum(len(s['s']) for s in segs if s['m'] is None)
    if unknown > max(3, len(word) * 0.45):
        return None, texts
    return segs, texts


# ---------------------------------------------------------------- 例文
print('indexing examples…')
pairs = []
with open(os.path.join(W, 'pairs.tsv'), encoding='utf-8') as f:
    for line in f:
        a, en, b, ja = line.rstrip('\n').split('\t')
        toks = tok_re.findall(en.lower())
        if 4 <= len(toks) <= 14 and len(ja) <= 60:
            pairs.append((en, ja, toks, int(a)))
easy = set(top[:4000])
post = defaultdict(list)
for i, (en, ja, toks, _) in enumerate(pairs):
    for t in set(toks):
        post[t].append(i)


def ex_score(i):
    en, ja, toks, _ = pairs[i]
    hard = sum(1 for t in toks if t not in easy)
    return hard * 3 + abs(len(toks) - 8)


def pick_examples(forms: set[str], seq: list[str] | None = None, k=3):
    ids = set()
    for fm in forms:
        ids.update(post.get(fm, ()))
    if seq:
        ok = []
        for i in ids:
            toks = pairs[i][2]
            for j, t in enumerate(toks):
                if t in forms and toks[j + 1:j + len(seq)] == seq[1:]:
                    ok.append(i)
                    break
        ids = set(ok)
    best = sorted(ids, key=ex_score)
    out, used_en = [], set()
    for i in best:
        en, ja, _, sid = pairs[i]
        if en in used_en:
            continue
        used_en.add(en)
        out.append({'en': en, 'ja': ja, 'id': sid})
        if len(out) >= k:
            break
    return out


# ---------------------------------------------------------------- エントリ生成
print('building entries…')


def key_of(head: str) -> str:
    return head.replace(' ', '_')


def defs(es, n=2):
    out = []
    for e in es:
        gl = []
        for s in e['senses']:
            if good_sense(s) and s.get('glosses'):
                g = s['glosses'][-1]
                gl.append(g if len(g) <= 140 else g[:137] + '…')
            if len(gl) >= n:
                break
        if gl:
            pos = POS_MAP.get(e['pos'], e['pos'])
            if not any(o['p'] == pos for o in out):
                out.append({'p': pos, 'en': gl})
    return out[:4]


def ipa_of(es):
    for e in es:
        for x in e.get('ipa') or []:
            if x.startswith('/'):
                return x
    return None


def collect_rel(es, field):
    out = []
    for e in es:
        for x in e.get(field) or []:
            if x and x not in out:
                out.append(x)
        if field in ('synonyms', 'antonyms'):
            for s in e['senses']:
                if not good_sense(s):
                    continue
                for x in s.get(field) or []:
                    if x and x not in out:
                        out.append(x)
    return out


def merge_gloss(ja, ko, zh):
    out = []
    for pos, words in ja:
        g = {'p': pos, 'ja': words[:4]}
        k = next((w for p, w in ko if p == pos), None)
        z = next((w for p, w in zh if p == pos), None)
        if k:
            g['ko'] = k[:3]
        if z:
            g['zh'] = z[:3]
        out.append(g)
    return out


entries = {}
lemma_list = list(lemmas.items())
for rank, (L, v) in enumerate(lemma_list, 1):
    es = v['entries']
    head = v['head']
    parts, texts = analyze(L, es)
    forms = []
    for e in es:
        for fm in e.get('forms') or []:
            if re.fullmatch(r"[A-Za-z-]+", fm) and fm.lower() != L and fm not in forms:
                forms.append(fm)
    fset = {L} | {f.lower() for f in forms if infl.get(f.lower()) == L or f.lower() not in lemmas}
    entries[key_of(head)] = {
        'k': key_of(head), 'h': head, 't': 'w', 'r': rank,
        'ipa': ipa_of(es),
        'g': merge_gloss(v['ja'], collect_tr(es, 'ko'), collect_tr(es, 'zh')),
        'd': defs(es),
        'parts': parts,
        'ety': (texts[0][:600] if texts else None),
        'forms': forms[:8],
        '_syn': collect_rel(es, 'synonyms'), '_ant': collect_rel(es, 'antonyms'),
        '_der': collect_rel(es, 'derived'), '_rel': collect_rel(es, 'related'),
        'ex': pick_examples(fset),
        'ngsl': L in ngsl_rank,
        'z': round(zipf_frequency(L, 'en'), 2),
        'pie': pie_of(es),
    }

particles = {}
for r in read_tsv(os.path.join(REPO, 'data', 'particles.tsv')):
    particles[r[0]] = {'meaning': r[1], 'note': r[2] if len(r) > 2 else ''}


def phrase_parts(toks):
    """句動詞の成り立ち: 各語を見出し語（w:）または不変化詞（pt:）に対応づける"""
    out = []
    for i, t in enumerate(toks):
        if i > 0 and t in particles:
            out.append({'s': t, 'm': 'pt:' + t})
        else:
            lt = lemma_of(t)
            out.append({'s': t, 'm': ('w:' + lemmas[lt]['head']) if lt in lemmas else None})
    # 不変化詞を含まない熟語（in fact など）は成り立ちを表示しない
    return out if any(p['m'] and p['m'].startswith('pt:') for p in out) else None


for prank, (w, c, es, tr) in enumerate(phr_sel, 1):
    toks = w.split(' ')
    vforms = {toks[0]} | {f for f, l in infl.items() if l == toks[0]}
    comps = []
    for t in toks:
        lt = lemma_of(t)
        if lt in lemmas:
            comps.append(key_of(lemmas[lt]['head']))
    entries[key_of(w)] = {
        'k': key_of(w), 'h': w, 't': 'p', 'r': prank,
        'ipa': ipa_of(es),
        'g': merge_gloss(tr, collect_tr(es, 'ko'), collect_tr(es, 'zh')),
        'd': defs(es),
        'parts': phrase_parts(toks),
        'ety': None,
        'forms': [],
        'comp': comps,
        '_syn': collect_rel(es, 'synonyms'), '_ant': collect_rel(es, 'antonyms'),
        '_der': [], '_rel': collect_rel(es, 'related'),
        'ex': pick_examples(vforms, toks),
        'freq': c,
    }

# ---------------------------------------------------------------- 手動での修正（data/overrides.tsv）
overrides_gloss, overrides_exclude = {}, defaultdict(set)
for r in read_tsv(os.path.join(REPO, 'data', 'overrides.tsv')):
    if r[0] == 'gloss' and len(r) >= 3:
        groups = []
        for part in r[2].split('|'):
            pos, _, words = part.partition(':')
            groups.append((pos.strip(), [w.strip() for w in words.split('、') if w.strip()]))
        overrides_gloss[r[1]] = groups
    elif r[0] == 'exclude' and len(r) >= 3:
        overrides_exclude[r[1]].update(x.strip() for x in r[2].split(','))
    elif r[0] == 'noparts' and len(r) >= 2:
        for w in r[1].split(','):
            e = entries.get(key_of(w.strip()))
            if e:
                e['parts'] = None
for key, groups in overrides_gloss.items():
    e = entries.get(key_of(key))
    if not e:
        continue
    old = {g['p']: g for g in e['g']}
    e['g'] = [{**{k: v for k, v in old.get(pos, {}).items() if k in ('ko', 'zh')}, 'p': pos, 'ja': words} for pos, words in groups]
    e['manual'] = True
for mid, words in overrides_exclude.items():
    for w in words:
        e = entries.get(key_of(w))
        if e and e.get('parts') and any(p['m'] == mid for p in e['parts']):
            e['parts'] = None  # 誤った分解は丸ごと取り除く（部分的に残すと不自然になるため）

# ---------------------------------------------------------------- 解説（data/explanations/*.tsv）
# このリポジトリで書き下ろす「語源・意味のつながり」の解説。頻出語から少しずつ追加していく。
import glob as _glob
explained = 0
for path in sorted(_glob.glob(os.path.join(REPO, 'data', 'explanations', '*.tsv'))):
    for r in read_tsv(path):
        if len(r) < 2:
            continue
        e = entries.get(key_of(r[0]))
        if e:
            e['note'] = {'ja': r[1].strip()}
            explained += 1
print('explanations', explained)

# 関連語をデータ内に存在するものだけに解決
lower_key = {k.lower().replace('_', ' '): k for k in entries}


def resolve(words, self_key):
    out = []
    for x in words:
        k = lower_key.get(x.lower())
        if k and k != self_key and k not in out:
            out.append(k)
    return out


phrases_of = defaultdict(list)
for k, e in entries.items():
    if e['t'] == 'p':
        for c in e['comp']:
            phrases_of[c].append(k)
base_of = defaultdict(list)  # 語基 → 派生語
for k, e in entries.items():
    for p in e.get('parts') or []:
        if p['m'] and p['m'].startswith('w:'):
            base_of[p['m'][2:]].append(k)

for k, e in entries.items():
    e['syn'] = resolve(e.pop('_syn'), k)[:12]
    e['ant'] = resolve(e.pop('_ant'), k)[:8]
    der = resolve(e.pop('_der'), k) + [x for x in base_of.get(k, []) if x != k]
    e['der'] = list(dict.fromkeys(der))[:20]
    e['rel'] = resolve(e.pop('_rel'), k)[:12]
    if e['t'] == 'w':
        e['ph'] = sorted(phrases_of.get(k, []), key=lambda x: entries[x]['r'])[:20]

# 形態素 → 単語
morph_words = defaultdict(list)
for k, e in entries.items():
    for p in e.get('parts') or []:
        if p['m'] and not p['m'].startswith('w:') and k not in morph_words[p['m']]:
            morph_words[p['m']].append(k)


def sort_key(k):
    e = entries[k]
    return (e['t'] != 'w', e['r'])


morphemes = []
for typ, lst in (('root', roots), ('prefix', prefixes), ('suffix', suffixes)):
    for m in lst:
        ws = sorted(morph_words.get(m['id'], []), key=sort_key)
        morphemes.append({'id': m['id'], 'type': typ, 'label': m['label'], 'forms': m['forms'],
                          'meaning': {'ja': m['meaning']}, 'origin': m['origin'], 'words': ws})

# 句動詞の不変化詞
for pid, v in particles.items():
    ws = sorted(morph_words.get('pt:' + pid, []), key=sort_key)
    if ws:
        morphemes.append({'id': 'pt:' + pid, 'type': 'particle', 'label': pid, 'forms': [pid],
                          'meaning': {'ja': v['meaning']}, 'origin': '句動詞の不変化詞', 'words': ws,
                          'desc': {'ja': v['note']} if v['note'] else None})

# 印欧祖語の語根: その祖語から来た見出し語と、そこから生まれた語根
pie_words = defaultdict(list)
for k, e in entries.items():
    for pid in e.get('pie') or []:
        pie_words[pid].append(k)
known_ids = {m['id'] for m in morphemes}
for d in pie_defs.values():
    ws = sorted(pie_words.get(d['id'], []), key=sort_key)
    members = [x for x in d['members'] if x in known_ids]
    if not ws and not members:
        continue
    morphemes.append({'id': d['id'], 'type': 'pie', 'label': d['form'], 'forms': [],
                      'meaning': {'ja': d['meaning']}, 'origin': '印欧祖語', 'words': ws, 'members': members})

# 語源の語源: 成り立ち（parts）・それを含む語源（partOf）・祖語ファミリー（family）
by_id = {m['id']: m for m in morphemes}
for mid, v in morph_parts.items():
    m = by_id.get(mid)
    parts = [x for x in v['parts'] if x in by_id]
    if not m or not parts:
        continue
    m['parts'] = parts
    if v['note']:
        m['partsNote'] = {'ja': v['note']}
    for x in parts:
        by_id[x].setdefault('partOf', []).append(mid)
for m in morphemes:
    if m['type'] == 'pie':
        for x in m['members']:
            by_id[x].setdefault('family', []).append(m['id'])

# ---------------------------------------------------------------- 出力
if os.path.isdir(OUT):
    shutil.rmtree(OUT)
os.makedirs(os.path.join(OUT, 'entries'))

shards = defaultdict(dict)
index_rows = []
for k, e in entries.items():
    shard = ('w' if e['t'] == 'w' else 'p') + str((e['r'] - 1) // SHARD)
    shards[shard][k] = {kk: vv for kk, vv in e.items() if vv not in (None, [], '')}
    flat = [x for g in e['g'] for x in g['ja']]
    # 一覧用の短い訳: カタカナだけの訳（音訳）より漢字・ひらがなを含む訳を優先
    flat.sort(key=lambda x: bool(re.fullmatch(r'[\u30a0-\u30ffー・]+', x)))
    short = '、'.join(flat[:3])
    pos = ''.join(sorted({g['p'][:4] for g in e['g']}))
    index_rows.append([k, 0 if e['t'] == 'w' else 1, e['r'], short, [g['p'] for g in e['g']], shard,
                       [p['m'] for p in (e.get('parts') or []) if p['m'] and not p['m'].startswith('w:')] + (e.get('pie') or []),
                       1 if e.get('note') else 0])
for name, data in shards.items():
    with open(os.path.join(OUT, 'entries', name + '.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
index_rows.sort(key=lambda r: (r[1], r[2]))
version = datetime.now(timezone.utc).strftime('%Y%m%d')
with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as f:
    json.dump({'v': version, 'e': index_rows}, f, ensure_ascii=False, separators=(',', ':'))
with open(os.path.join(OUT, 'morphemes.json'), 'w', encoding='utf-8') as f:
    json.dump(morphemes, f, ensure_ascii=False, separators=(',', ':'))
meta = {
    'version': version,
    'generatedAt': datetime.now(timezone.utc).isoformat(),
    'counts': {
        'words': sum(1 for e in entries.values() if e['t'] == 'w'),
        'phrases': sum(1 for e in entries.values() if e['t'] == 'p'),
        'morphemes': len(morphemes),
        'withParts': sum(1 for e in entries.values() if e.get('parts')),
        'withExamples': sum(1 for e in entries.values() if e.get('ex')),
        'pieRoots': sum(1 for m in morphemes if m['type'] == 'pie'),
        'withNote': sum(1 for e in entries.values() if e.get('note')),
        'manual': sum(1 for e in entries.values() if e.get('manual')),
        'withPie': sum(1 for e in entries.values() if e.get('pie')),
    },
    'shardSize': SHARD,
}
with open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)
print(json.dumps(meta, ensure_ascii=False, indent=1))
