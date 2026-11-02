"""Verify that the read-only audit catches broken public-data relationships."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('audit', Path(__file__).with_name('08_etymology_audit.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.entries = {'action': {'k': 'action', 'h': 'action', 't': 'w', 'r': 1,
            'g': [{'p': 'noun', 'ja': ['行動']}],
            'parts': [{'s': 'act', 'm': 'r:act'}, {'s': 'ion', 'm': None}]}}
        self.locations = {'action': 'w0'}
        self.index = {'v': 'fixture', 'e': [['action', 0, 1, '行動', ['noun'], 'w0', ['r:act'], 0]]}
        self.morphs = [{'id': 'r:act', 'type': 'root', 'words': ['action']}]
        self.meta = {'version': 'fixture', 'counts': {'words': 1, 'phrases': 0, 'morphemes': 1,
            'pieRoots': 0, 'withParts': 1, 'withExamples': 0, 'withNote': 0,
            'manualParts': 0, 'manual': 0, 'withPie': 0}}

    def codes(self):
        errors, _ = audit.structural_checks(self.entries, self.locations, self.index, self.morphs, self.meta)
        return {e['code'] for e in errors}

    def test_consistent_fixture(self):
        self.assertEqual(self.codes(), set())

    def test_dangling_part_and_stale_index(self):
        self.entries['action']['parts'][0]['m'] = 'r:missing'
        self.assertTrue({'PART_REFERENCE', 'INDEX_MORPHS', 'REVERSE_MEMBERSHIP'} <= self.codes())

    def test_missing_word_base(self):
        self.entries['action']['parts'][0]['m'] = 'w:absent'
        self.assertIn('PART_REFERENCE', self.codes())

    def test_spelling_and_shard_corruption(self):
        self.entries['action']['parts'][0]['s'] = 'wrong'
        self.locations['action'] = 'w99'
        self.assertTrue({'PART_SPELLING', 'INDEX_SHARD'} <= self.codes())

    def test_pie_and_meta_corruption(self):
        self.entries['action']['pie'] = ['pie:unknown']
        self.meta['counts']['words'] = 2
        self.assertTrue({'PIE_REFERENCE', 'META_COUNTS'} <= self.codes())

    def test_duplicate_index_and_reverse_membership(self):
        self.index['e'].append(copy.deepcopy(self.index['e'][0]))
        self.morphs[0]['words'] = []
        self.assertTrue({'DUPLICATE_INDEX_KEY', 'REVERSE_MEMBERSHIP'} <= self.codes())


if __name__ == '__main__':
    unittest.main()
