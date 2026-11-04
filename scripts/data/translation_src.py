"""
韓国語・中国語の訳（data/translations）の共通処理。04_build.py と 08_translation_export.py から使う。

訳の各行には、訳したときの日本語の「指紋」（src）を入れておく。
あとで日本語の訳や語根の意味を直すと指紋が変わるので、どの訳が古くなったかを機械的に見つけられる。
"""
import glob
import hashlib
import json
import os

TR_LANGS = ('ko', 'zh-Hans', 'zh-Hant')


def _h(x) -> str:
    return hashlib.sha256(json.dumps(x, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()[:8]


def gloss_src(pos: str, ja: list[str]) -> str:
    """単語・熟語の 1 品詞の訳の指紋（品詞と日本語の訳から）"""
    return _h([pos, ja])


def morph_src(ja: str) -> str:
    """語根・接辞の意味の指紋"""
    return _h(ja)


def read_translations(repo: str, lang: str, kind: str, warn=print) -> dict:
    """
    data/translations/<lang>/<kind>*.tsv を名前順に読む（kind は gloss か morphemes）。
    同じ語が複数あれば後のものを使う（差分のファイルを足していける）。
    戻り値: gloss は {(key, pos): (src, [訳…])}、morphemes は {(id,): (src, [訳…])}
    """
    ncols = 4 if kind == 'gloss' else 3
    out = {}
    for path in sorted(glob.glob(os.path.join(repo, 'data', 'translations', lang, kind + '*.tsv'))):
        name = os.path.relpath(path, os.path.join(repo, 'data'))
        with open(path, encoding='utf-8') as f:
            for n, line in enumerate(f, 1):
                line = line.rstrip('\n')
                if not line.strip() or line.startswith('#'):
                    continue
                cols = line.split('\t')
                if len(cols) != ncols or not cols[-1].strip():
                    warn(f'WARN {name}:{n} 列の数が {ncols} ではないか、訳が空です')
                    continue
                words = [w.strip() for w in cols[-1].split('|') if w.strip()]
                out[tuple(cols[:-2])] = (cols[-2].strip(), words)
    return out
