"""Regressions for independent review findings, including the full-build hook."""
import ast
import copy
import importlib.util
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'scripts/data/10_sync_fixes.py'
spec = importlib.util.spec_from_file_location('review_sync', SCRIPT)
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class FinalReviewTests(unittest.TestCase):
    def test_repetition_is_not_connected_to_go(self):
        entries = {}
        for path in (ROOT / 'public/data/entries').glob('*.json'):
            entries.update(json.loads(path.read_text(encoding='utf-8')))
        for key in ('iteration', 'reiterate'):
            ids = {p['m'] for p in entries[key]['parts']}
            self.assertNotIn('r:it', ids)
            self.assertNotIn('r:rat', ids)

    def test_full_build_exclusions_survive_raw_example_variation(self):
        # Execute the actual full-build hook without requiring multi-GB inputs.
        path = ROOT / 'scripts/data/04_build.py'
        tree = ast.parse(path.read_text(encoding='utf-8'))
        hooks = [node for node in tree.body if isinstance(node, ast.Expr)
                 and 'apply_editorial_filters' in ast.unparse(node)]
        self.assertEqual(len(hooks), 1)
        entries = {'for_good': {'ex': [{'id': 21606}, {'id': 99999}]},
                   'parent': {'pie': ['pie:per', 'pie:other']}}
        env = {'entries': entries, 'REPO': str(ROOT), '__file__': str(path), 'runpy': runpy, 'os': os}
        exec(compile(ast.Module(body=hooks, type_ignores=[]), str(path), 'exec'), env)
        self.assertEqual(entries['for_good']['ex'], [{'id': 99999}])
        self.assertEqual(entries['parent']['pie'], ['pie:other'])
        first = copy.deepcopy(entries)
        exec(compile(ast.Module(body=hooks, type_ignores=[]), str(path), 'exec'), env)
        self.assertEqual(entries, first)

    def test_sync_cli_rejects_changed_snapshot_without_writing(self):
        with tempfile.TemporaryDirectory() as folder:
            repo = Path(folder)
            target = repo / 'public/data/entries/w0.json'
            target.parent.mkdir(parents=True)
            target.write_text('{}', encoding='utf-8')
            expected = sync.public_sha256(repo)
            target.write_text('{"unexpected": true}', encoding='utf-8')
            before = target.read_bytes()
            result = subprocess.run([sys.executable, str(SCRIPT), '--repo', str(repo),
                                     '--expect-public-sha256', expected], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('no files written', result.stderr)
            self.assertEqual(target.read_bytes(), before)

    def test_sync_cli_requires_reviewed_snapshot_for_writes(self):
        result = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Writes require', result.stderr)


if __name__ == '__main__':
    unittest.main()
