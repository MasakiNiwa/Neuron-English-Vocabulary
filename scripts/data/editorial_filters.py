"""Shared, persistent editorial exclusions for full builds and limited sync."""
import json
from pathlib import Path


def apply_editorial_filters(entries, repo):
    rules = json.loads((Path(repo) / 'data/editorial_exclusions.json').read_text(encoding='utf-8'))
    for key, rule in rules.items():
        if set(rule) - {'example_ids', 'pie_ids'}:
            raise ValueError(f'Unknown editorial exclusion field: {key}')
        for field, values in rule.items():
            if not isinstance(values, list) or any(
                (type(v) is not int if field == 'example_ids' else not isinstance(v, str)) for v in values
            ):
                raise ValueError(f'Invalid editorial exclusion: {key}.{field}')
        e = entries.get(key)
        if e is None:
            continue
        for field, values in [('ex', rule.get('example_ids', [])), ('pie', rule.get('pie_ids', []))]:
            if field not in e:
                continue
            result = [v for v in (e[field] or []) if (v['id'] if field == 'ex' else v) not in values]
            if result:
                e[field] = result
            else:
                e.pop(field, None)
