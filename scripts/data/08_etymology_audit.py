#!/usr/bin/env python3
"""Read-only vocabulary screening; candidate flags are not linguistic verdicts.

Writes review snapshots only; never changes public data or editorial TSVs.
Run from any directory. Standard library only.
"""
import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

REPO = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO / 'data/audit/2026-11-03-resumed'
UNCERTAIN_EN = re.compile(r'\b(uncertain|unknown|perhaps|possibly|probably|apparently|disputed|obscure|unclear)\b', re.I)
UNCERTAIN_JA = re.compile(r'諸説|不明|未詳|未確定|確定.*ない|不確か|おそらく|かもしれ|可能性|とされ|という説|と考え|推測|仮説')


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def tsv(path, fields, rows):
    with path.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fields, delimiter='\t', quoting=csv.QUOTE_ALL)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: str(row.get(k, '')).replace('\r', '\\r').replace('\n', '\\n') for k in fields})


def read_tsvs(paths):
    for p in sorted(paths):
        for n, line in enumerate(p.read_text(encoding='utf-8').splitlines(), 1):
            if line and not line.startswith('#'):
                yield p, n, line.split('\t')


def structural_checks(entries, locations, index, morphs, meta):
    errors = []
    def check(ok, code, key, detail=''):
        if not ok:
            errors.append(dict(code=code, key=key, detail=detail))
    by_id = {m['id']: m for m in morphs}
    check(len(by_id) == len(morphs), 'DUPLICATE_MORPH_ID', '*')
    check(len({r[0] for r in index['e']}) == len(index['e']), 'DUPLICATE_INDEX_KEY', '*')
    check({r[0] for r in index['e']} == set(entries), 'INDEX_KEY_SET', '*')
    expected_reverse = defaultdict(set)
    for k, e in entries.items():
        check(e['k'] == k and e['h'].replace(' ', '_') == k, 'ENTRY_KEY', k)
        parts = e.get('parts') or []
        if parts:
            # Phrase separators are omitted in the existing phrase_parts format.
            norm = lambda s: s.lower().replace(' ', '').replace('_', '') if e['t'] == 'p' else s.lower()
            check(norm(''.join(p['s'] for p in parts)) == norm(e['h']), 'PART_SPELLING', k)
        for p in parts:
            mid = p.get('m')
            if not mid:
                continue
            check(mid[2:] in entries if mid.startswith('w:') else mid in by_id, 'PART_REFERENCE', k, mid)
            if not mid.startswith('w:'):
                expected_reverse[mid].add(k)
        for mid in e.get('pie', []):
            check(mid in by_id and by_id[mid]['type'] == 'pie', 'PIE_REFERENCE', k, mid)
            expected_reverse[mid].add(k)
        for field in ('der', 'rel', 'syn', 'ant', 'comp', 'ph'):
            for target in e.get(field, []):
                check(target in entries, 'RELATED_REFERENCE', k, field + ':' + target)
    for r in index['e']:
        e = entries.get(r[0])
        if e is None:
            continue
        expected = [p['m'] for p in e.get('parts', []) if p.get('m') and not p['m'].startswith('w:')] + e.get('pie', [])
        check(r[1] == (0 if e['t'] == 'w' else 1) and r[2] == e['r'], 'INDEX_TYPE_RANK', r[0])
        check(r[5] == locations[r[0]], 'INDEX_SHARD', r[0])
        check(r[6] == expected, 'INDEX_MORPHS', r[0])
        check(bool(r[7]) == bool(e.get('note')), 'INDEX_NOTE', r[0])
        check(r[4] == [g['p'] for g in e['g']], 'INDEX_POS', r[0])
    for m in morphs:
        check(set(m['words']) == expected_reverse[m['id']], 'REVERSE_MEMBERSHIP', m['id'])
        check(len(m['words']) == len(set(m['words'])), 'REVERSE_DUPLICATE', m['id'])
        for field in ('parts', 'partOf', 'family', 'members'):
            for target in m.get(field, []):
                check(target in by_id, 'MORPH_REFERENCE', m['id'], field + ':' + target)
    counts = {'words': sum(e['t'] == 'w' for e in entries.values()),
              'phrases': sum(e['t'] == 'p' for e in entries.values()),
              'morphemes': len(morphs), 'pieRoots': sum(m['type'] == 'pie' for m in morphs)}
    for field, prop in [('withParts', 'parts'), ('withExamples', 'ex'), ('withNote', 'note'),
                        ('manualParts', 'manualParts'), ('manual', 'manual'), ('withPie', 'pie')]:
        counts[field] = sum(bool(e.get(prop)) for e in entries.values())
    check(meta['counts'] == counts, 'META_COUNTS', '*', json.dumps(counts))
    check(index['v'] == meta['version'], 'META_VERSION', '*')
    return errors, counts


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output', type=Path, default=DEFAULT_OUT)
    ap.add_argument('--cases', type=Path, default=DEFAULT_OUT / 'review-cases.json')
    args = ap.parse_args()
    out = args.output.resolve()
    if out == REPO or out == REPO / 'data' or out.is_relative_to(REPO / 'public'):
        ap.error('output must be a dedicated review directory, not public data')
    out.mkdir(parents=True, exist_ok=True)
    entries, locations, duplicates = {}, {}, []
    inputs = sorted((REPO / 'public/data').rglob('*.json'))
    inputs += sorted((REPO / 'data/overrides').glob('*.tsv'))
    inputs += sorted((REPO / 'data/explanations').glob('*.tsv'))
    inputs += sorted((REPO / 'data').glob('*.tsv'))
    inputs += [REPO / 'scripts/data/04_build.py', REPO / 'scripts/data/07_note_parts_report.py',
               REPO / 'docs/audit/2026-11-03-resumed/UPLOADED_REPORT.md',
               Path(__file__).resolve(), args.cases.resolve()]
    for p in sorted((REPO / 'public/data/entries').glob('*.json')):
        obj = json.loads(p.read_text(encoding='utf-8'))
        duplicates.extend(set(obj) & set(entries))
        entries.update(obj)
        locations.update({k: p.stem for k in obj})
    index, morphs, meta = [json.loads((REPO / 'public/data' / f).read_text(encoding='utf-8'))
                           for f in ('index.json', 'morphemes.json', 'meta.json')]
    errors, counts = structural_checks(entries, locations, index, morphs, meta)
    errors += [dict(code='DUPLICATE_SHARD_KEY', key=k, detail='') for k in duplicates]
    by_id = {m['id']: m for m in morphs}
    lower = {k.lower(): k for k in entries}
    notes, parts, noparts = {}, {}, set()
    for p, n, row in read_tsvs((REPO / 'data/explanations').glob('*.tsv')):
        if len(row) >= 2:
            notes[row[0].replace(' ', '_').lower()] = (row[1], f'{p.relative_to(REPO)}:{n}')
    for p, n, row in read_tsvs((REPO / 'data/overrides').glob('*.tsv')):
        if row[0] == 'parts' and len(row) >= 3:
            ps = []
            for tok in row[2].split():
                surface, _, mid = tok.partition('=')
                if mid.startswith('w:'):
                    mid = 'w:' + lower.get(mid[2:].lower(), mid[2:])
                ps.append(dict(s=surface, m=mid or None))
            parts[row[1].replace(' ', '_').lower()] = (ps, f'{p.relative_to(REPO)}:{n}')
        elif row[0] == 'noparts':
            noparts.update(w.strip().replace(' ', '_').lower() for w in row[1].split(','))
    for key, (ps, src) in parts.items():
        if key in lower and entries[lower[key]].get('parts') != ps:
            errors.append(dict(code='MANUAL_PARTS_MISMATCH', key=lower[key], detail=src))
    for key, (note, src) in notes.items():
        if key in lower and entries[lower[key]].get('note', {}).get('ja') != note:
            errors.append(dict(code='MANUAL_NOTE_MISMATCH', key=lower[key], detail=src))
    cases = json.loads(args.cases.read_text(encoding='utf-8'))
    by_key, evidence = defaultdict(list), []
    for i, case in enumerate(cases, 1):
        key = case['key']
        e = entries.get(key)
        old = case.get('old_id')
        new = case.get('new_id')
        matched = e is not None and (not old or any(p.get('m') == old for p in e.get('parts', [])))
        valid_new = new is None or (new[2:] in entries if new.startswith('w:') else new in by_id)
        proposed_parts = case.get('proposed_parts')
        if proposed_parts is not None:
            valid_new = valid_new and all(not p.get('m') or
                (p['m'][2:] in entries if p['m'].startswith('w:') else p['m'] in by_id) for p in proposed_parts)
            valid_new = valid_new and e is not None and ''.join(p['s'] for p in proposed_parts).lower() == e['h'].lower()
        status = 'proposal_requires_claude_review' if matched and valid_new else 'baseline_mismatch_requires_investigation'
        if status == 'proposal_requires_claude_review' and case['action'] == 'preserve_control':
            status = 'preserve_current_pending_external_review'
        by_key[key].append(f'C{i:03}')
        ev = dict(case, id=f'C{i:03}', review_status=status, guard_matches=matched,
                  proposed_target_exists=valid_new,
                  public_source=f'public/data/entries/{locations.get(key, "MISSING")}.json',
                  manual_note_source=notes.get(key.lower(), ('', ''))[1],
                  manual_parts_source=parts.get(key.lower(), ([], ''))[1],
                  current_parts=(e or {}).get('parts', []), current_pie=(e or {}).get('pie', []),
                  current_examples=(e or {}).get('ex', []) if case['action'] == 'example_review' else [],
                  current_note=(e or {}).get('note', {}).get('ja', ''),
                  embedded_source=(e or {}).get('ety', ''),
                  current_node=by_id.get(old), proposed_node=by_id.get(new),
                  external_dictionary_checked=False)
        evidence.append(ev)
    note_report = subprocess.run([sys.executable, str(REPO / 'scripts/data/07_note_parts_report.py'),
                                  '--top', '100000'], check=True, capture_output=True, text=True).stdout
    (out / 'note-parts-candidates.txt').write_text(note_report, encoding='utf-8')
    note_candidates = {line.split('\t')[1] for line in note_report.splitlines() if '\t' in line}
    rows, flag_counts, base_groups = [], Counter(), defaultdict(list)
    root_groups = {m['id']: [] for m in morphs if m['type'] == 'root'}
    for k, e in sorted(entries.items(), key=lambda pair: (pair[1]['t'] != 'w', pair[1]['r'], pair[0])):
        note, ety = e.get('note', {}).get('ja', ''), e.get('ety', '')
        ps = e.get('parts', [])
        flags = []
        if not ps: flags.append('NO_DECOMPOSITION')
        if not note: flags.append('NO_JAPANESE_NOTE')
        if not ety: flags.append('NO_EMBEDDED_ETYMOLOGY')
        if len(ety) >= 590: flags.append('SOURCE_LENGTH_NEAR_600_CANDIDATE')
        if UNCERTAIN_EN.search(ety) and note and not UNCERTAIN_JA.search(note):
            flags.append('SOURCE_UNCERTAINTY_NOTE_REVIEW')
        if e['t'] == 'p' and note: flags.append('PHRASE_MNEMONIC_VS_HISTORY')
        if k.lower() in noparts and k.lower() in parts: flags.append('PARTS_NOPARTS_CONFLICT')
        for part in ps:
            mid = part.get('m')
            if mid and mid.startswith('r:'): root_groups[mid].append(k)
            if mid and mid.startswith('w:') and e['t'] == 'w': base_groups[mid].append(k)
            if mid in by_id and by_id[mid]['type'] == 'root' and part['s'].lower() not in by_id[mid]['forms']:
                flags.append('ROOT_SURFACE_VARIANT')
        if k in by_key: flags.append('NAMED_REVIEW_CASE')
        if k in note_candidates: flags.append('NOTE_ROOT_LINK_CANDIDATE')
        flags = sorted(set(flags)); flag_counts.update(flags)
        rows.append(dict(key=k, type=e['t'], rank=e['r'], status='screened_not_independently_verified',
                         cases=','.join(by_key.get(k, [])), flags=','.join(flags),
                         parts=json.dumps(ps, ensure_ascii=False), pie=','.join(e.get('pie', [])),
                         manual_parts=e.get('manualParts', False), note=note, embedded_source=ety,
                         public_source=f'public/data/entries/{locations[k]}.json',
                         note_source=notes.get(k.lower(), ('', ''))[1]))
    fields = list(rows[0])
    tsv(out / 'all-entries.tsv', fields, rows)
    tsv(out / 'review-queue.tsv', fields, [r for r in rows if r['flags']])
    tsv(out / 'semantic-priority.tsv', fields, [r for r in rows if any(f in r['flags'].split(',') for f in
        ('NAMED_REVIEW_CASE', 'NOTE_ROOT_LINK_CANDIDATE', 'SOURCE_UNCERTAINTY_NOTE_REVIEW', 'PARTS_NOPARTS_CONFLICT'))])
    for name, groups in [('root-groups', root_groups), ('base-groups', base_groups)]:
        tsv(out / (name + '.tsv'), ['id', 'meaning', 'entries'],
            [dict(id=mid, meaning=by_id.get(mid, {}).get('meaning', {}).get('ja', ''), entries=','.join(ks))
             for mid, ks in sorted(groups.items())])
    dump(out / 'case-evidence.json', evidence)
    tsv(out / 'cases.tsv', ['id', 'key', 'action', 'review_status', 'guard_matches', 'reason'], evidence)
    dump(out / 'structural-errors.json', errors)
    summary = dict(schema_version=1, baseline_commit='1f65cbefdf0d41eb868533f378a8ed5ea0a4b808',
                   vocabulary_version=meta['version'], counts=counts, structural_errors=len(errors),
                   flags=dict(sorted(flag_counts.items())), named_cases=len(cases),
                   preservation_controls=sum(c['action'] == 'preserve_control' for c in cases),
                   named_entries=len(by_key), guard_failures=sum(not e['guard_matches'] or not e['proposed_target_exists'] for e in evidence),
                   root_groups=len(root_groups), base_groups=len(base_groups),
                   queue_entries=sum(bool(r['flags']) for r in rows),
                   semantic_priority_entries=sum(any(f in r['flags'].split(',') for f in
                       ('NAMED_REVIEW_CASE', 'NOTE_ROOT_LINK_CANDIDATE', 'SOURCE_UNCERTAINTY_NOTE_REVIEW', 'PARTS_NOPARTS_CONFLICT')) for r in rows),
                   externally_verified_entries=0, recovered_historical_300_corrections=False,
                   note='Candidate counts overlap. Rules differ from the unavailable previous audit; do not compare counts as a correction delta.')
    dump(out / 'summary.json', summary)
    manifest = {str(p.relative_to(REPO)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(inputs))}
    dump(out / 'input-sha256.json', manifest)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if errors or summary['guard_failures'] else 0


if __name__ == '__main__':
    sys.exit(main())
