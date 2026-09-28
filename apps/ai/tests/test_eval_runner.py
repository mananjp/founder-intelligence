import runpy
import sys


def test_eval_runner_entry_point(monkeypatch, capsys):
    monkeypatch.setattr(sys, "argv", ["fi_ai.evals.run", "--suite", "golden", "--fail-under-config"])

    runpy.run_module("fi_ai.evals.run", run_name="__main__")

    assert capsys.readouterr().out.strip() == "eval suite=golden: harness not implemented yet"
