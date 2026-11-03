#!/usr/bin/env python3
"""Synchronize editorial TSVs (overrides/explanations) with public/data JSONs.

Designed for environments without the multi-GB raw Wiktionary/Tatoeba dumps.
Enforces structural guards, updates index.json, morphemes.json reverse links,
word-base derived links (der), and meta.json counts idempotently.
"""
from __future__ import annotations

import argparse
import hashlib
from collections import defaultdict
import json
from pathlib import Path
import re
import runpy
import sys

REPO = Path(__file__).resolve().parents[2]


def read_tsv(path: Path) -> list[list[str]]:
    rows = []
    if not path.exists():
        return rows
    for line in path.read_text(encoding='utf-8').splitlines():
        if line.startswith('#') or not line.strip():
            continue
        rows.append(line.split('\t'))
    return rows


def key_of(head: str) -> str:
    return head.replace(' ', '_')


def synchronize_data(
    entries: dict[str, dict],
    locations: dict[str, str],
    index: dict,
    morphs: list[dict],
    meta: dict,
    overrides_rows: list[tuple[str, int, list[str]]],
    explanation_rows: list[tuple[str, int, list[str]]],
    extra_patches: dict[str, dict] | None = None,
    repo: Path | None = None,
) -> dict[str, int]:
    """Apply TSVs to in-memory public data structures with strict validation."""
    by_id = {m['id']: m for m in morphs}
    valid_morph = {m['id'] for m in morphs if m['type'] in ('root', 'prefix', 'suffix', 'particle')}
    lower_entry: dict[str, str] = {}
    for k in entries:
        lower_entry.setdefault(k.lower(), k)

    def entry_for(word: str) -> dict | None:
        k = key_of(word.strip())
        return entries.get(k) or entries.get(lower_entry.get(k.lower(), ''))

    # Record initial w: base links to detect removed base links accurately
    old_bases_by_child: dict[str, set[str]] = defaultdict(set)
    for k, e in entries.items():
        for p in e.get('parts') or []:
            mid = p.get('m')
            if mid and mid.startswith('w:'):
                old_bases_by_child[k].add(mid[2:])

    # 1. Validate and collect overrides
    noparts_keys: set[str] = set()
    manual_parts_map: dict[str, list[dict]] = {}
    overrides_exclude: dict[str, set[str]] = defaultdict(set)
    overrides_gloss: dict[str, list[tuple[str, list[str]]]] = {}

    for src, line_no, r in overrides_rows:
        cmd = r[0]
        if cmd == 'noparts':
            if len(r) < 2:
                raise ValueError(f'{src}:{line_no} noparts requires 2 columns')
            for w in r[1].split(','):
                k = key_of(w.strip())
                if k in entries:
                    noparts_keys.add(k)
        elif cmd == 'parts':
            if len(r) < 3:
                raise ValueError(f'{src}:{line_no} parts requires 3 columns')
            target_word = r[1].strip()
            e = entries.get(key_of(target_word))
            if not e:
                raise ValueError(f'{src}:{line_no} unknown entry for parts: {target_word}')
            ps = []
            for tok in r[2].split():
                sp, _, mid = tok.partition('=')
                if mid:
                    if mid.startswith('w:'):
                        base_key = lower_entry.get(mid[2:].replace(' ', '_').lower())
                        if not base_key or base_key not in entries or entries[base_key]['t'] != 'w':
                            raise ValueError(f'{src}:{line_no} unknown word base {mid} in {target_word}')
                        mid = 'w:' + entries[base_key]['h']
                    elif mid not in valid_morph:
                        raise ValueError(f'{src}:{line_no} unknown morpheme {mid} in {target_word}')
                ps.append({'s': sp, 'm': mid or None})
            if ''.join(p['s'] for p in ps).lower() != e['h'].lower():
                raise ValueError(f'{src}:{line_no} spelling mismatch for {target_word}: {r[2]}')
            manual_parts_map[e['k']] = ps
        elif cmd == 'exclude':
            if len(r) < 3 or r[1] not in valid_morph:
                raise ValueError(f'{src}:{line_no} invalid exclude row')
            overrides_exclude[r[1]].update(x.strip() for x in r[2].split(',') if x.strip())
        elif cmd == 'gloss':
            if len(r) < 3:
                raise ValueError(f'{src}:{line_no} invalid gloss row')
            groups = []
            for part in r[2].split('|'):
                pos, sep, words = part.partition(':')
                if not sep:
                    raise ValueError(f'{src}:{line_no} invalid gloss format: {part}')
                groups.append((pos.strip(), [w.strip() for w in words.split('、') if w.strip()]))
            overrides_gloss[r[1].strip()] = groups
        elif cmd == 'drop':
            continue
        else:
            raise ValueError(f'{src}:{line_no} unknown override command: {cmd}')

    # Apply noparts and parts following 04_build.py semantics
    for k in noparts_keys:
        if k not in manual_parts_map:
            entries[k].pop('parts', None)
            entries[k].pop('manualParts', None)

    for k, e in entries.items():
        if k in manual_parts_map:
            e['parts'] = manual_parts_map[k]
            e['manualParts'] = True
        elif e.get('manualParts'):
            # Entry previously had manualParts, but was removed from parts TSV
            e.pop('manualParts', None)
            e.pop('parts', None)

    for mid, words in overrides_exclude.items():
        for w in words:
            e = entries.get(key_of(w))
            if e and e.get('parts') and not e.get('manualParts') and any(p.get('m') == mid for p in e['parts']):
                e.pop('parts', None)

    for key, groups in overrides_gloss.items():
        e = entry_for(key)
        if not e:
            continue
        old = {g['p']: g for g in e['g']}
        e['g'] = [
            {**{k: v for k, v in old.get(pos, {}).items() if k in ('ko', 'zh')}, 'p': pos, 'ja': words}
            for pos, words in groups
        ]
        e['manual'] = True

    # 2. Validate and apply explanations
    seen_notes: dict[str, str] = {}
    for src, line_no, r in explanation_rows:
        if len(r) != 2 or not r[1].strip():
            raise ValueError(f'{src}:{line_no} explanation requires 2 non-empty columns')
        word_key = r[0].strip()
        if word_key in seen_notes:
            raise ValueError(f'{src}:{line_no} duplicate explanation for {word_key} (first at {seen_notes[word_key]})')
        seen_notes[word_key] = f'{src}:{line_no}'
        e = entry_for(word_key)
        if e:
            e['note'] = {'ja': r[1].strip()}

    # 3. Apply guarded extra patches (e.g. pie or ex fixes)
    if extra_patches:
        for k, patch in extra_patches.items():
            if k not in entries:
                raise ValueError(f'extra_patch target missing: {k}')
            e = entries[k]
            for field, spec in patch.items():
                before = spec['before']
                after = spec['after']
                cur = e.get(field)
                if cur != before and cur != after:
                    raise ValueError(f'Guard mismatch on {k}.{field}: current={cur!r} != before={before!r}')
                if after is None or after == []:
                    e.pop(field, None)
                else:
                    e[field] = after

    if repo is not None:
        runpy.run_path(str(Path(__file__).with_name('editorial_filters.py')))['apply_editorial_filters'](entries, repo)

    # 4. Update w: base derived links (der)
    new_bases_by_child: dict[str, set[str]] = defaultdict(set)
    children_by_base: dict[str, list[str]] = defaultdict(list)
    for k, e in entries.items():
        for p in e.get('parts') or []:
            mid = p.get('m')
            if mid and mid.startswith('w:'):
                base_k = key_of(mid[2:])
                if base_k not in entries:
                    raise ValueError(f'Unknown word base {mid} in {k}')
                new_bases_by_child[k].add(base_k)
                if k != base_k and k not in children_by_base[base_k]:
                    children_by_base[base_k].append(k)

    # Remove stale derived links where w:<base> was removed from parts
    for child_k, old_bases in old_bases_by_child.items():
        removed_bases = old_bases - new_bases_by_child.get(child_k, set())
        for base_k in removed_bases:
            base_entry = entries.get(base_k)
            if base_entry and 'der' in base_entry and child_k in base_entry['der']:
                base_entry['der'] = [x for x in base_entry['der'] if x != child_k]
                if not base_entry['der']:
                    base_entry.pop('der', None)

    # Add new derived links where w:<base> was added to parts (respecting 20-item cap)
    for base_k, children in children_by_base.items():
        old_children = {c for c, obs in old_bases_by_child.items() if base_k in obs}
        added_children = [c for c in children if c not in old_children]
        if not added_children:
            continue
        base_entry = entries[base_k]
        der = list(base_entry.get('der') or [])
        for c in added_children:
            if c not in der and len(der) < 20:
                der.append(c)
        if der:
            base_entry['der'] = der

    # 5. Update morphemes.json reverse membership
    def sort_key(k: str):
        e = entries[k]
        return (e['t'] != 'w', e['r'], k)

    morph_words: dict[str, list[str]] = defaultdict(list)
    pie_words: dict[str, list[str]] = defaultdict(list)
    for k, e in entries.items():
        for p in e.get('parts') or []:
            mid = p.get('m')
            if mid and not mid.startswith('w:') and k not in morph_words[mid]:
                morph_words[mid].append(k)
        for pid in e.get('pie') or []:
            if pid not in by_id or by_id[pid]['type'] != 'pie':
                raise ValueError(f'Invalid PIE reference {pid} in {k}')
            if k not in pie_words[pid]:
                pie_words[pid].append(k)

    for m in morphs:
        if m['type'] == 'pie':
            m['words'] = sorted(pie_words.get(m['id'], []), key=sort_key)
        else:
            m['words'] = sorted(morph_words.get(m['id'], []), key=sort_key)

    # 6. Update index.json rows
    for r in index['e']:
        k = r[0]
        e = entries[k]
        flat = [x for g in e['g'] for x in g['ja']]
        if not e.get('manual'):
            flat.sort(key=lambda x: bool(re.fullmatch(r'[\u30a0-\u30ffー・]+', x)))
        r[3] = '、'.join(flat[:3])
        r[4] = [g['p'] for g in e['g']]
        r[6] = [p['m'] for p in (e.get('parts') or []) if p.get('m') and not p['m'].startswith('w:')] + (e.get('pie') or [])
        r[7] = 1 if e.get('note') else 0

    # 7. Update meta.json counts
    counts = {
        'words': sum(1 for e in entries.values() if e['t'] == 'w'),
        'phrases': sum(1 for e in entries.values() if e['t'] == 'p'),
        'morphemes': len(morphs),
        'withParts': sum(1 for e in entries.values() if e.get('parts')),
        'withExamples': sum(1 for e in entries.values() if e.get('ex')),
        'pieRoots': sum(1 for m in morphs if m['type'] == 'pie'),
        'withNote': sum(1 for e in entries.values() if e.get('note')),
        'manualParts': sum(1 for e in entries.values() if e.get('manualParts')),
        'manual': sum(1 for e in entries.values() if e.get('manual')),
        'withPie': sum(1 for e in entries.values() if e.get('pie')),
    }
    meta['counts'] = counts
    return counts


# Optional exact before/after patches. Stable exclusions live in the shared
# data/editorial_exclusions.json so full builds preserve them too.
EXTRA_PATCHES: dict[str, dict] = {}


def write_if_changed(path: Path, content: str) -> bool:
    old = path.read_text(encoding='utf-8') if path.exists() else None
    if old == content:
        return False
    path.write_text(content, encoding='utf-8', newline='\n')
    return True


def public_sha256(repo: Path) -> str:
    """Bind a planned sync to the exact paths and bytes reviewed beforehand."""
    digest = hashlib.sha256()
    paths = sorted((repo / 'public/data').rglob('*.json'))
    if not paths:
        raise ValueError('No public data to synchronize')
    for path in paths:
        digest.update(str(path.relative_to(repo)).replace('\\', '/').encode('utf-8') + b'\0')
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--repo', type=Path, default=REPO)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--print-public-sha256', action='store_true')
    ap.add_argument('--expect-public-sha256', help='reviewed input digest, required for writes')
    args = ap.parse_args()
    repo = args.repo.resolve()
    current_digest = public_sha256(repo)
    if args.print_public_sha256:
        print(current_digest)
        return 0
    if args.expect_public_sha256 and args.expect_public_sha256 != current_digest:
        ap.error('Public input changed since review; no files written')
    if not args.dry_run and not args.expect_public_sha256:
        ap.error('Writes require --expect-public-sha256 from the reviewed input')

    shard_files = sorted((repo / 'public/data/entries').glob('*.json'))
    shards: dict[str, dict[str, dict]] = {}
    entries: dict[str, dict] = {}
    locations: dict[str, str] = {}
    for p in shard_files:
        obj = json.loads(p.read_text(encoding='utf-8'))
        shards[p.stem] = obj
        entries.update(obj)
        for k in obj:
            locations[k] = p.stem

    index = json.loads((repo / 'public/data/index.json').read_text(encoding='utf-8'))
    morphs = json.loads((repo / 'public/data/morphemes.json').read_text(encoding='utf-8'))
    meta = json.loads((repo / 'public/data/meta.json').read_text(encoding='utf-8'))

    overrides_rows = []
    for p in sorted((repo / 'data/overrides').glob('*.tsv')):
        for n, line in enumerate(p.read_text(encoding='utf-8').splitlines(), 1):
            if line and not line.startswith('#'):
                overrides_rows.append((str(p.relative_to(repo)), n, line.split('\t')))

    explanation_rows = []
    for p in sorted((repo / 'data/explanations').glob('*.tsv')):
        for n, line in enumerate(p.read_text(encoding='utf-8').splitlines(), 1):
            if line and not line.startswith('#'):
                explanation_rows.append((str(p.relative_to(repo)), n, line.split('\t')))

    counts = synchronize_data(
        entries, locations, index, morphs, meta,
        overrides_rows, explanation_rows, EXTRA_PATCHES, repo=repo,
    )

    changed_files = []
    for stem, shard_obj in shards.items():
        cleaned = {}
        for k in shard_obj:
            e = entries[k]
            cleaned[k] = {kk: vv for kk, vv in e.items() if vv not in (None, [], '')}
        text = json.dumps(cleaned, ensure_ascii=False, separators=(',', ':'))
        p = repo / 'public/data/entries' / f'{stem}.json'
        if args.dry_run:
            if p.read_text(encoding='utf-8') != text:
                changed_files.append(str(p.relative_to(repo)))
        elif write_if_changed(p, text):
            changed_files.append(str(p.relative_to(repo)))

    for name, obj, indent, seps in [
        ('index.json', index, None, (',', ':')),
        ('morphemes.json', morphs, None, (',', ':')),
        ('meta.json', meta, 1, None),
    ]:
        p = repo / 'public/data' / name
        text = json.dumps(obj, ensure_ascii=False, indent=indent, separators=seps)
        if args.dry_run:
            if p.read_text(encoding='utf-8') != text:
                changed_files.append(str(p.relative_to(repo)))
        elif write_if_changed(p, text):
            changed_files.append(str(p.relative_to(repo)))

    print(json.dumps({'changed_files': changed_files, 'counts': counts}, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
