"""Refresh preview fixtures from committed origin/dev inputs using unchanged B functions.
Run from any directory: python3 app/frontend/scripts/generate-fixtures.py
Requires pandas (same as app/qc.py). Never reads scenario_truth.json.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import time

import pandas as pd

REPO = Path(__file__).resolve().parents[3]
HERE = REPO / 'app/frontend/src/mocks'
SNAPSHOT = REPO
SCENARIOS = ('normal', 'recovery', 'morning_tail')
ZONES = 'ABCDEF'
DEFAULT_VIEW = '14_1'

spec = importlib.util.spec_from_file_location('qc_current_dev', SNAPSHOT / 'app/qc.py')
qc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qc)

def git(*args):
    return subprocess.check_output(['git', *args], cwd=REPO)

def ref(name):
    return git('rev-parse', name).decode().strip()

def sha(data):
    return hashlib.sha256(data).hexdigest()

# Check the scratch snapshot byte-for-byte against committed origin/dev objects.
input_paths = ['app/qc.py', 'data/generate_data.py', *(f'data/{s}.csv' for s in SCENARIOS)]
objects = {}
for relative in input_paths:
    committed = git('show', f'origin/dev:{relative}')
    assert (SNAPSHOT / relative).read_bytes() == committed, relative
    objects[relative] = {'git_blob': ref(f'origin/dev:{relative}'), 'sha256': sha(committed)}
source = {
    'latest_dev_ref': ref('origin/dev'),
    'data_ref': git('log', '-1', '--format=%H', 'origin/dev', '--', 'data/normal.csv', 'data/recovery.csv', 'data/morning_tail.csv', 'data/generate_data.py').decode().strip(),
    'stats_ref': git('log', '-1', '--format=%H', 'origin/dev', '--', 'app/qc.py').decode().strip(),
    'data_branch_ref': ref('origin/h02-data'),
    'stats_branch_ref': ref('origin/h03-stats'),
    'data_files': {f'{s}.csv': objects[f'data/{s}.csv']['sha256'] for s in SCENARIOS},
    'stats_sha256': objects['app/qc.py']['sha256'],
    'generator_sha256': objects['data/generate_data.py']['sha256'],
    'git_objects': objects,
    'baseline': {'start': '2026-09-14', 'end_exclusive': qc.DEFAULT_BASELINE_END, 'days': 14},
    'monitoring': {'start': '2026-09-28', 'end': '2026-10-11', 'days': 14},
    'hourly_view_windows': {'14': {'monitoring_start': None, 'start': '2026-09-28', 'end': '2026-10-11'}, '7': {'monitoring_start': '2026-10-05', 'start': '2026-10-05', 'end': '2026-10-11'}},
    'note': 'Precomputed prototype fixtures from committed origin/dev synthetic CSVs and unchanged B statistics. Inputs verified byte-for-byte against the listed Git objects. No API or live data connection. scenario_truth.json is not read.',
}
common = {
    'mock': True,
    'units': {'time': 'minutes', 'rate': 'proportion 0-1'},
    'settings': {'T_min': qc.DEFAULT_T, 'q': qc.DEFAULT_Q, 'priority': 'high', 'timezone': qc.TIMEZONE},
    'baseline': dict(source['baseline']),
    'monitoring': dict(source['monitoring']),
    'excluded': {'count': 0, 'reasons': []},
}
exploratory_note = '6 zones x 5 bands = 30 unadjusted comparisons; chance flags can occur. Flags guide investigation and do not prove causes.'
hourly_note = '144 descriptive cells; no per-cell statistical flag. Flags are the time bands.'

def verify_strict_flags(items):
    for item in items:
        if 'flag' in item:
            if item['status'] == 'ok':
                assert item['flag'] == (item['p_band'] > item['ucl'])
            else:
                assert item['flag'] is None
        elif item['phase'] == 'monitoring' and item['status'] == 'ok':
            assert item['deterioration_flag'] == (item['p'] > item['ucl'])
        elif item['phase'] == 'baseline':
            assert item['deterioration_flag'] is None

def verify_hourly_cells(cells, smooth, window):
    assert len(cells) == 144
    assert [(c['zone_id'], c['hour']) for c in cells] == [(z, h) for z in ZONES for h in range(24)]
    for c in cells:
        assert c['smooth_hours'] == smooth
        assert 'flag' not in c and 'deterioration_flag' not in c
        if not c['baseline_n'] or not c['monitoring_n']:
            assert c['status'] == 'no_data' and c['change_pts'] is None
        else:
            assert c['p_baseline'] == c['baseline_late'] / c['baseline_n']
            assert c['p_monitoring'] == c['monitoring_late'] / c['monitoring_n']
            assert c['change_pts'] == 100 * (c['p_monitoring'] - c['p_baseline'])
            enough = c['baseline_late'] >= 5 and c['baseline_n'] - c['baseline_late'] >= 5
            assert c['status'] == ('ok' if enough else 'insufficient_evidence')
    for zone in ZONES:
        zcells = [c for c in cells if c['zone_id'] == zone]
        # Circular smoothing pools each incident into exactly smooth cells.
        assert sum(c['baseline_n'] for c in zcells) == 1400 * smooth
        assert sum(c['monitoring_n'] for c in zcells) == window * 100 * smooth
    if smooth == 1:
        assert sum(c['status'] == 'insufficient_evidence' for c in cells) == 44

audit = {'source': source, 'scenarios': {}, 'validation': {}}
started = time.monotonic()
for scenario in SCENARIOS:
    raw = pd.read_csv(SNAPSHOT / 'data' / f'{scenario}.csv')
    prepared = qc.prepare(raw)
    assert len(prepared) == 16800
    assert qc.validate_incidents(raw) == []
    summaries = [qc.zone_summary(prepared, zone) for zone in ZONES]
    views = {}
    for window in (14, 7):
        start = None if window == 14 else '2026-10-05'
        all_bands = qc.bands_all_zones(prepared, monitoring_start=start)
        assert list(all_bands) == list(ZONES)
        for zone, bands in all_bands.items():
            assert len(bands) == 5
            assert all(b['status'] == 'ok' for b in bands)
            assert sum(b['baseline_n'] for b in bands) == 1400
            assert sum(b['n_band'] for b in bands) == window * 100
            verify_strict_flags(bands)
        for smooth in (1, 3):
            cells = qc.late_rate_change_by_hour(prepared, monitoring_start=start, smooth_hours=smooth)
            verify_hourly_cells(cells, smooth, window)
            views[f'{window}_{smooth}'] = {
                'hour_heatmap': {
                    'metric': 'change in % late, monitoring minus baseline (percentage points)',
                    'window_days': window,
                    'smooth_hours': smooth,
                    'exploratory_note': hourly_note,
                    'cells': cells,
                },
                'time_of_day_all_zones': all_bands,
            }
    summary = {**common, 'scenario': scenario, 'zones': summaries,
               'slowest_incidents': qc.slowest_incidents(prepared), **views[DEFAULT_VIEW]}
    analyses = {}
    scenario_audit = {'rows': len(prepared), 'zones': [], 'hourly_views': {}}
    for zone, zsummary in zip(ZONES, summaries):
        chart = qc.daily_p_chart(prepared, zone)
        bands = qc.late_rate_by_band(prepared, zone)
        stages = qc.stage_summary(prepared, zone)
        assert all('baseline_p90_min' in s for s in stages)
        base = [p for p in chart['points'] if p['phase'] == 'baseline']
        mon = [p for p in chart['points'] if p['phase'] == 'monitoring']
        assert len(base) == len(mon) == 14
        assert sum(p['n'] for p in base) == sum(b['baseline_n'] for b in bands) == zsummary['baseline_n'] == 1400
        assert sum(p['late'] for p in base) == sum(b['baseline_late'] for b in bands) == zsummary['baseline_late']
        assert sum(p['n'] for p in mon) == sum(b['n_band'] for b in bands) == zsummary['n'] == 1400
        assert sum(p['late'] for p in mon) == sum(b['monitoring_late'] for b in bands) == zsummary['late']
        assert bands == views['14_1']['time_of_day_all_zones'][zone]
        verify_strict_flags(chart['points'])
        flags = [p['date'] for p in mon if p['deterioration_flag'] is True]
        expected = [f'2026-10-{d:02d}' for d in range(1, 7)] if scenario == 'recovery' and zone == 'C' else []
        assert flags == expected, (scenario, zone, flags)
        for window in (14, 7):
            bands_w = views[f'{window}_1']['time_of_day_all_zones'][zone]
            cells_w = [c for c in views[f'{window}_1']['hour_heatmap']['cells'] if c['zone_id'] == zone]
            relevant_mon = mon if window == 14 else [p for p in mon if p['date'] >= '2026-10-05']
            assert sum(b['baseline_late'] for b in bands_w) == sum(c['baseline_late'] for c in cells_w) == zsummary['baseline_late']
            assert sum(b['monitoring_late'] for b in bands_w) == sum(c['monitoring_late'] for c in cells_w) == sum(p['late'] for p in relevant_mon)
        analyses[zone] = {
            **common, 'scenario': scenario, 'zone_id': zone, 'zone_type': zsummary['zone_type'],
            'summary': zsummary, 'daily_p_chart': chart, 'stages': stages,
            'time_of_day': {'comparison': 'pooled monitoring vs frozen baseline per band', 'exploratory_note': exploratory_note, 'bands': bands},
            'slowest_incidents': qc.slowest_incidents(prepared, zone_id=zone),
        }
        scenario_audit['zones'].append({
            'zone': zone, 'baseline_n': zsummary['baseline_n'], 'baseline_late': zsummary['baseline_late'],
            'n': zsummary['n'], 'late': zsummary['late'], 'late_rate': zsummary['late_rate'], 'p90_min': zsummary['p90_min'],
            'p0': zsummary['p0'], 'above_service_target': zsummary['above_service_target'], 'daily_flag_days': flags,
            'band_flags_14d': [b['band'] for b in bands if b['flag'] is True],
            'band_flags_7d': [b['band'] for b in views['7_1']['time_of_day_all_zones'][zone] if b['flag'] is True],
        })
    for key, view in views.items():
        cells = view['hour_heatmap']['cells']
        scenario_audit['hourly_views'][key] = {
            'cells': len(cells), 'status_counts': {status: sum(c['status'] == status for c in cells) for status in ('ok', 'insufficient_evidence', 'no_data')},
            'baseline_n_total': sum(c['baseline_n'] for c in cells), 'monitoring_n_total': sum(c['monitoring_n'] for c in cells),
            'band_flags': {z: [b['band'] for b in bs if b['flag'] is True] for z, bs in view['time_of_day_all_zones'].items()},
        }
    if scenario == 'morning_tail':
        d_hourly = {c['hour']: c for c in views['14_1']['hour_heatmap']['cells'] if c['zone_id'] == 'D'}
        expected = {5: (4, 30, 4, 32, -0.8, 'insufficient_evidence'), 6: (9, 59, 17, 53, 16.8, 'ok'), 7: (16, 81, 27, 77, 15.3, 'ok'), 8: (14, 85, 30, 77, 22.5, 'ok'), 9: (11, 55, 24, 57, 22.1, 'ok'), 10: (4, 66, 4, 52, 1.6, 'insufficient_evidence')}
        for h, (bl, bn, ml, mn, change, status) in expected.items():
            c = d_hourly[h]
            assert (c['baseline_late'], c['baseline_n'], c['monitoring_late'], c['monitoring_n']) == (bl, bn, ml, mn)
            assert round(c['change_pts'], 1) == change and c['status'] == status
        scenario_audit['zone_D_hours_05_to_10_14d'] = list(d_hourly[h] for h in range(5, 11))
        scenario_audit['zone_D_hours_06_to_09_7d'] = [c for c in views['7_1']['hour_heatmap']['cells'] if c['zone_id'] == 'D' and 6 <= c['hour'] <= 9]
        scenario_audit['zone_D_bands_14d'] = views['14_1']['time_of_day_all_zones']['D']
        scenario_audit['zone_D_bands_7d'] = views['7_1']['time_of_day_all_zones']['D']
    bundle = {'summary': summary, 'analyses': analyses, 'hourly_views': views}
    assert summary['hour_heatmap'] == bundle['hourly_views']['14_1']['hour_heatmap']
    assert summary['time_of_day_all_zones'] == bundle['hourly_views']['14_1']['time_of_day_all_zones']
    (HERE / f'{scenario}.json').write_text(json.dumps(bundle, indent=2, allow_nan=False) + '\n')
    audit['scenarios'][scenario] = scenario_audit

# Strict known-answer boundary, zero/None, and masking policy checks.
known = qc.evaluate_batch(20, 100, 0.1)
assert abs(known['ucl'] - 0.19) < 1e-12 and known['deterioration_flag'] is True
assert qc.evaluate_batch(19, 100, 0.1)['deterioration_flag'] is False
assert qc.describe_responses([], 12)['late_rate'] is None
assert qc.percentile_linear([5,5,5,5,5,5,5,5,20,20], .9) == 20
last7_flags = {s: {z['zone']: z['band_flags_7d'] for z in a['zones'] if z['band_flags_7d']} for s, a in audit['scenarios'].items()}
assert last7_flags == {'normal': {}, 'recovery': {'C': ['midday', 'evening_rush']}, 'morning_tail': {'D': ['morning_rush']}}
audit['validation'] = {
    'zone_views_reconciled': 18, 'daily_points_per_view': 28,
    'band_comparisons_reconciled': 180, 'all_band_statuses': 'ok',
    'hourly_views': 12, 'cells_per_hourly_view': 144, 'raw_insufficient_cells_per_view': 44,
    'known_answer_and_strict_boundary': 'pass', 'hourly_mask_from_B_status': 'pass',
    'prepared_input': True, 'qc_module_unchanged_and_matches_origin_dev': True,
    'all_inputs_match_origin_dev_git_objects': True,
    'elapsed_seconds': round(time.monotonic() - started, 3),
}
(HERE / 'source.json').write_text(json.dumps(source, indent=2) + '\n')

print(json.dumps({'result': 'PASS', 'dev': source['latest_dev_ref'], 'stats': source['stats_ref'], 'validation': audit['validation'], 'latest7_band_flags': last7_flags}, indent=2))
