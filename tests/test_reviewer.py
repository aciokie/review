import pytest
from backend.reviewer import calculate_move_accuracy, estimate_performance_elo, detect_opening, GameReviewer
from backend.engine import StockfishEngineManager

def test_calculate_move_accuracy():
    assert calculate_move_accuracy(0.0) == 100.0
    assert calculate_move_accuracy(10.0) < 90.0
    assert calculate_move_accuracy(100.0) == 0.0

def test_estimate_performance_elo():
    elo_high = estimate_performance_elo(95.0, 0, 0, 1)
    elo_low = estimate_performance_elo(50.0, 3, 4, 5)
    assert elo_high > 2000
    assert elo_low < 1200

def test_detect_opening():
    op = detect_opening(["e4", "e5", "Nf3", "Nc6", "Bb5"])
    assert op["opening"] == "Ruy Lopez"

if __name__ == "__main__":
    pytest.main([__file__])

def test_game_reviewer_mocked(monkeypatch):
    mgr = StockfishEngineManager()

    def mock_eval(fen, depth=18, threads=4, hash_mb=512, multipv=1):
        return {
            "best_move": "e4",
            "best_move_uci": "e2e4",
            "evaluation_cp": 20,
            "mate": None,
            "white_win_chance": 52.8,
            "black_win_chance": 47.2,
            "depth": depth,
            "pv": ["e4", "e5"]
        }

    monkeypatch.setattr(mgr, "evaluate_position", mock_eval)
    reviewer = GameReviewer(engine_manager=mgr)

    sample_pgn = '[Event "Test Game"]\n[White "Alice"]\n[Black "Bob"]\n\n1. e4 e5 2. Nf3 Nc6'
    result = reviewer.review_game(sample_pgn, depth=10)

    assert result["metadata"]["white"] == "Alice"
    assert result["metadata"]["black"] == "Bob"
    assert len(result["moves"]) == 4
    assert "caps_formula" in result["accuracy"]
    assert "white" in result["accuracy"]
