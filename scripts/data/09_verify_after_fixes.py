#!/usr/bin/env python3
"""Validate current data without overwriting the historical audit snapshot.

The old-ID guards in 08 describe pre-fix data. A changed old-ID guard after a
fix is reported separately; spelling/reference/TSV consistency failures still
fail. This command does not certify etymological accuracy or approve fixes.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

REPO = Path(__file__).resolve().parents[2]


def evaluate(summary, errors, evidence, returncode):
    if returncode not in (0, 1):
        raise ValueError(f'audit process failed: {returncode}')
    if summary['structural_errors'] != len(errors):
        raise ValueError('inconsistent structural error count')
    changed = [dict(id=c['id'], key=c['key'], old_id=c.get('old_id'),
                    guard_matches=c['guard_matches'],
                    proposed_target_exists=c['proposed_target_exists'])
               for c in evidence if not c['guard_matches'] or not c['proposed_target_exists']]
    if len(changed) != summary['guard_failures']:
        raise ValueError('inconsistent historical guard count')
    if returncode != int(bool(errors or changed)):
        raise ValueError('audit exit status disagrees with results')
    return dict(validation_scope='structural_only_not_semantic_approval',
                structural_errors=errors, historical_case_drift=changed,
                instruction='Review drift against DECISIONS.tsv and FIX_LOG.md; it is not automatic proof of a resolved case.')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--report', type=Path, help='optional new JSON report path')
    args = ap.parse_args()
    if args.report and (args.report.resolve() == REPO or
        any(args.report.resolve().is_relative_to(REPO / p) for p in
            ('public', 'data', 'scripts', 'src')) or args.report.exists()):
        ap.error('--report must be a new file outside source/data/snapshot directories')
    # A fresh directory prevents stale successful results being mistaken for this run.
    with tempfile.TemporaryDirectory(prefix='nev-post-fix-') as tmp:
        cmd = [sys.executable, str(REPO / 'scripts/data/08_etymology_audit.py'), '--output', tmp]
        run = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True,
                             encoding='utf-8', env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
        try:
            read = lambda name: json.loads((Path(tmp) / name).read_text(encoding='utf-8'))
            result = evaluate(read('summary.json'), read('structural-errors.json'),
                              read('case-evidence.json'), run.returncode)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            print(f'Post-fix validation failed: {exc}', file=sys.stderr)
            print(run.stderr, file=sys.stderr)
            return 1
    text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation preserves user-authored reports.
        with args.report.open('x', encoding='utf-8') as f:
            f.write(text)
    print(text, end='')
    return int(bool(result['structural_errors']))


if __name__ == '__main__':
    sys.exit(main())
