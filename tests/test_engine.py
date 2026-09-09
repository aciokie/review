import pytest
import chess
from backend.engine import cp_to_win_chance, mate_to_win_chance, eval_to_win_chances, StockfishEngineManager

def test_cp_to_win_chance():
    assert cp_to_win_chance(0) == 50.0
    assert cp_to_win_chance(400) == round(100 / 1.1, 2)
    assert cp_to_win_chance(-400) == round(100 / 11, 2)
    assert cp_to_win_chance(1000) > 90.0
    assert cp_to_win_chance(-1000) < 10.0

def test_mate_to_win_chance():
    assert mate_to_win_chance(1, True) > 99.0
    assert mate_to_win_chance(-1, True) < 1.0
    assert mate_to_win_chance(0, True) == 50.0

def test_engine_manager_instantiation():
    mgr = StockfishEngineManager()
    assert mgr.info["engine"] == "Stockfish"
    assert mgr.info["version"] == "19"
    assert mgr.info["build"] == "Dev/Master"

if __name__ == "__main__":
    pytest.main([__file__])
