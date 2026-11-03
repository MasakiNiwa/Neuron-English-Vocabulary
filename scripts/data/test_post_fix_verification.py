import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('postfix', Path(__file__).with_name('09_verify_after_fixes.py'))
postfix = importlib.util.module_from_spec(spec)
spec.loader.exec_module(postfix)


class PostFixVerificationTests(unittest.TestCase):
    def test_corrected_old_id_is_reported_without_semantic_approval(self):
        result = postfix.evaluate({'structural_errors': 0, 'guard_failures': 1}, [],
            [{'id': 'C001', 'key': 'import', 'old_id': 'pre:in',
              'guard_matches': False, 'proposed_target_exists': True}], 1)
        self.assertFalse(result['structural_errors'])
        self.assertEqual(result['historical_case_drift'][0]['key'], 'import')
        self.assertIn('not_semantic_approval', result['validation_scope'])

    def test_broken_data_still_fails(self):
        errors = [{'code': 'MANUAL_PARTS_MISMATCH', 'key': 'import'}]
        result = postfix.evaluate({'structural_errors': 1, 'guard_failures': 0}, errors, [], 1)
        self.assertEqual(result['structural_errors'], errors)

    def test_crash_and_inconsistent_results_are_not_success(self):
        for code in (0, 2):
            with self.assertRaises(ValueError):
                postfix.evaluate({'structural_errors': 1, 'guard_failures': 0}, [{}], [], code)


if __name__ == '__main__':
    unittest.main()
