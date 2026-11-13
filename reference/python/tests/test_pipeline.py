import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from practical_solutions.data import synthetic, load_csv
from practical_solutions.detect import Config, detect
from practical_solutions.loop import run_cycles, run_cycle


class Recovery(unittest.TestCase):
    def test_recovers_planted_rejects_decoys_and_artefacts(self):
        for seed in (0, 1, 2):
            ds = synthetic(seed=seed, effect=3.0)
            rec = run_cycle(ds, 0, seed)
            t = rec["truth"]
            self.assertGreaterEqual(t["recall"], 0.7, rec)
            self.assertGreaterEqual(t["precision"], 0.8, rec)
            self.assertEqual(t["artefacts_flagged"], 0, rec)
            self.assertLessEqual(t["decoys_flagged"], 1, rec)

    def test_weak_signal_costs_recall_not_precision(self):
        rec = run_cycle(synthetic(seed=1, effect=2.0), 0, 1)
        t = rec["truth"]
        if rec["survivors"]:
            self.assertGreaterEqual(t["precision"], 0.8, rec)
        self.assertEqual(t["artefacts_flagged"], 0)

    def test_artefacts_pass_every_stage_but_the_screen(self):
        ds = synthetic(seed=0)
        r = detect(ds, Config(alpha=0.2, peer_z=0.5, persist_z=1.5), 0)
        f = r["funnel"]
        self.assertGreater(f["persistent"], f["artefact_clean"])


class NoSignal(unittest.TestCase):
    def test_pure_noise_yields_almost_nothing(self):
        for seed in range(3):
            ds = synthetic(n_planted=0, n_decoys=0, n_artefacts=0, seed=seed)
            rec = run_cycle(ds, 0, seed)
            self.assertLessEqual(len(rec["survivors"]), 2, rec["funnel"])
            self.assertLessEqual(rec["essential"]["null_flags"], 0.5 + 1e-9)


class Ledger(unittest.TestCase):
    def test_ledger_is_appended_and_reproducible(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "l.jsonl"
            a = run_cycles(lambda s: synthetic(seed=s), 2, p, seed=5)
            lines = p.read_text().splitlines()
            self.assertEqual(len(lines), 2)
            rec = json.loads(lines[0])
            for k in ("data_sha256", "config_hash", "essential", "funnel", "survivors", "state"):
                self.assertIn(k, rec)
            b = run_cycle(synthetic(seed=5), 0, 5)
            self.assertEqual(a[0]["data_sha256"], b["data_sha256"])
            self.assertEqual(a[0]["survivors"], b["survivors"])


class Csv(unittest.TestCase):
    def test_csv_roundtrip_matches_in_memory(self):
        ds = synthetic(n_units=60, n_periods=3, n_ctx=2, n_planted=3, n_decoys=0, n_artefacts=0, seed=3)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.csv"
            with p.open("w") as f:
                f.write("unit,period,y,a,b\n")
                for i, u in enumerate(ds.unit_ids):
                    for t in range(ds.T):
                        f.write(f"{u},{t},{ds.Y[i, t]},{ds.X[i, 0]},{ds.X[i, 1]}\n")
            got = load_csv(p, "unit", "period", "y", ["a", "b"])
            self.assertEqual(got.n, ds.n)
            self.assertTrue(np.allclose(got.Y, ds.Y))


if __name__ == "__main__":
    unittest.main()
