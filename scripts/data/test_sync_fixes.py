"""Unit tests for 10_sync_fixes.py limited synchronization logic."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec_audit = importlib.util.spec_from_file_location('audit', Path(__file__).with_name('08_etymology_audit.py'))
audit = importlib.util.module_from_spec(spec_audit)
spec_audit.loader.exec_module(audit)

spec_sync = importlib.util.spec_from_file_location('sync', Path(__file__).with_name('10_sync_fixes.py'))
sync = importlib.util.module_from_spec(spec_sync)
spec_sync.loader.exec_module(sync)


class SyncFixesTests(unittest.TestCase):
    def setUp(self):
        self.entries = {
            'import': {
                'k': 'import', 'h': 'import', 't': 'w', 'r': 1,
                'g': [{'p': 'verb', 'ja': ['輸入する']}],
                'parts': [{'s': 'im', 'm': 'pre:in'}, {'s': 'port', 'm': 'r:port'}],
                'note': {'ja': 'im（中へ）+ port（運ぶ）。'},
            },
            'iron': {
                'k': 'iron', 'h': 'iron', 't': 'w', 'r': 2,
                'g': [{'p': 'noun', 'ja': ['鉄']}],
                'der': ['irony'],
            },
            'irony': {
                'k': 'irony', 'h': 'irony', 't': 'w', 'r': 3,
                'g': [{'p': 'noun', 'ja': ['皮肉']}],
                'parts': [{'s': 'iron', 'm': 'w:iron'}, {'s': 'y', 'm': 'suf:y'}],
            },
            'moon': {
                'k': 'moon', 'h': 'moon', 't': 'w', 'r': 4,
                'g': [{'p': 'noun', 'ja': ['月']}],
            },
            'day': {
                'k': 'day', 'h': 'day', 't': 'w', 'r': 5,
                'g': [{'p': 'noun', 'ja': ['日']}],
                'der': ['Monday'],
            },
            'Monday': {
                'k': 'Monday', 'h': 'Monday', 't': 'w', 'r': 6,
                'g': [{'p': 'noun', 'ja': ['月曜日']}],
                'parts': [{'s': 'mon', 'm': 'pre:mono'}, {'s': 'day', 'm': 'w:day'}],
            },
        }
        self.locations = {k: 'w0' for k in self.entries}
        self.index = {
            'v': '20261102',
            'e': [
                ['import', 0, 1, '輸入する', ['verb'], 'w0', ['pre:in', 'r:port'], 1],
                ['iron', 0, 2, '鉄', ['noun'], 'w0', [], 0],
                ['irony', 0, 3, '皮肉', ['noun'], 'w0', ['suf:y'], 0],
                ['moon', 0, 4, '月', ['noun'], 'w0', [], 0],
                ['day', 0, 5, '日', ['noun'], 'w0', [], 0],
                ['Monday', 0, 6, '月曜日', ['noun'], 'w0', ['pre:mono'], 0],
            ],
        }
        self.morphs = [
            {'id': 'pre:in', 'type': 'prefix', 'words': ['import']},
            {'id': 'pre:into', 'type': 'prefix', 'words': []},
            {'id': 'pre:mono', 'type': 'prefix', 'words': ['Monday']},
            {'id': 'r:port', 'type': 'root', 'words': ['import']},
            {'id': 'suf:y', 'type': 'suffix', 'words': ['irony']},
        ]
        self.meta = {
            'version': '20261102',
            'counts': {
                'words': 6, 'phrases': 0, 'morphemes': 5, 'pieRoots': 0,
                'withParts': 3, 'withExamples': 0, 'withNote': 1,
                'manualParts': 0, 'manual': 0, 'withPie': 0,
            },
        }

    def test_sync_updates_parts_reverse_links_der_and_is_idempotent(self):
        overrides = [
            ('data/overrides/063.tsv', 1, ['parts', 'import', 'im=pre:into port=r:port']),
            ('data/overrides/063.tsv', 2, ['noparts', 'irony']),
            ('data/overrides/063.tsv', 3, ['parts', 'Monday', 'mon=w:moon day=w:day']),
        ]
        explanations = [
            ('data/explanations/005.tsv', 1, ['import', 'im（中へ）+ port（運ぶ）。輸入する。']),
        ]
        sync.synchronize_data(
            self.entries, self.locations, self.index, self.morphs, self.meta,
            overrides, explanations,
        )
        errors, _ = audit.structural_checks(self.entries, self.locations, self.index, self.morphs, self.meta)
        self.assertEqual(errors, [])
        self.assertTrue(self.entries['import'].get('manualParts'))
        self.assertNotIn('parts', self.entries['irony'])
        self.assertNotIn('der', self.entries['iron'])
        self.assertIn('Monday', self.entries['moon'].get('der', []))

        # Second run must produce identical state (idempotency)
        snapshot = copy.deepcopy((self.entries, self.index, self.morphs, self.meta))
        sync.synchronize_data(
            self.entries, self.locations, self.index, self.morphs, self.meta,
            overrides, explanations,
        )
        self.assertEqual((self.entries, self.index, self.morphs, self.meta), snapshot)

    def test_invalid_inputs_and_guards_stop_execution(self):
        with self.assertRaises(ValueError):
            sync.synchronize_data(
                self.entries, self.locations, self.index, self.morphs, self.meta,
                [('063.tsv', 1, ['parts', 'import', 'im=pre:nonexistent port=r:port'])], [],
            )
        with self.assertRaises(ValueError):
            sync.synchronize_data(
                self.entries, self.locations, self.index, self.morphs, self.meta,
                [('063.tsv', 1, ['parts', 'import', 'imp=pre:into port=r:port'])], [],
            )
        with self.assertRaises(ValueError):
            sync.synchronize_data(
                self.entries, self.locations, self.index, self.morphs, self.meta,
                [], [('001.tsv', 1, ['import', 'note1']), ('002.tsv', 1, ['import', 'note2'])],
            )
        with self.assertRaises(ValueError):
            sync.synchronize_data(
                self.entries, self.locations, self.index, self.morphs, self.meta,
                [], [], {'import': {'note': {'before': {'ja': 'wrong guard'}, 'after': {'ja': 'new'}}}},
            )


if __name__ == '__main__':
    unittest.main()
