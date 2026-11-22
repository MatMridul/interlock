import asyncio
import time

from server.stub_model import StubModel, delay_seconds


def test_delay_is_off_by_default_and_for_bad_values(monkeypatch):
    monkeypatch.delenv("STUB_DELAY_MS", raising=False)
    assert delay_seconds() == 0
    for bad in ("abc", "-5", ""):
        monkeypatch.setenv("STUB_DELAY_MS", bad)
        assert delay_seconds() == 0
    monkeypatch.setenv("STUB_DELAY_MS", "400")
    assert delay_seconds() == 0.4


def _run(model):
    async def go():
        msgs = [{"role": "user", "content": [{"text": "draft 5 for bob"}]}]
        return [e async for e in model.stream(msgs)]
    t = time.perf_counter()
    events = asyncio.run(go())
    return events, time.perf_counter() - t


def test_delay_spaces_events_without_changing_them(monkeypatch):
    monkeypatch.delenv("STUB_DELAY_MS", raising=False)
    fast, t0 = _run(StubModel())
    monkeypatch.setenv("STUB_DELAY_MS", "120")
    slow, t1 = _run(StubModel())
    assert [list(e) for e in fast] == [list(e) for e in slow]
    assert t0 < 0.1 and t1 >= 0.11
