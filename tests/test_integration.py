import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend.engine import StockfishEngineManager, cp_to_win_chance, mate_to_win_chance, eval_to_win_chances
from backend.reviewer import GameReviewer, calculate_move_accuracy, estimate_performance_elo, detect_opening

client = TestClient(app)

def test_frontend_index_route():
    res = client.get("/")
    assert res.status_code == 200
    assert "Game Review" in res.text
    assert "Stockfish 19" in res.text

def test_static_asset_route():
    res = client.get("/static/css/styles.css")
    assert res.status_code == 200
    assert "highlight-last-move" in res.text

def test_win_chance_boundaries():
    assert cp_to_win_chance(0) == 50.0
    assert cp_to_win_chance(2000) > 99.0
    assert cp_to_win_chance(-2000) < 1.0

def test_mate_win_chances():
    assert mate_to_win_chance(1, True) > 99.0
    assert mate_to_win_chance(-1, True) < 1.0

def test_caps_accuracy_curve():
    assert calculate_move_accuracy(0) == 100.0
    assert calculate_move_accuracy(5) == 79.8
    assert calculate_move_accuracy(50) < 20.0
    assert calculate_move_accuracy(200) == 0.0

def test_elo_estimation_bounds():
    assert estimate_performance_elo(100.0, 0, 0, 0) == 2500
    assert estimate_performance_elo(0.0, 10, 10, 10) == 400

def test_review_game_full_flow(monkeypatch):
    mgr = StockfishEngineManager()

    def mock_eval(fen, depth=18, threads=4, hash_mb=512, multipv=1):
        return {
            "best_move": "e4",
            "best_move_uci": "e2e4",
            "evaluation_cp": 25,
            "mate": None,
            "white_win_chance": 53.6,
            "black_win_chance": 46.4,
            "depth": depth,
            "pv": ["e4", "e5"]
        }

    monkeypatch.setattr(mgr, "evaluate_position", mock_eval)
    reviewer = GameReviewer(engine_manager=mgr)

    pgn = """[Event "Test"]
[White "Player1"]
[Black "Player2"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6
"""
    result = reviewer.review_game(pgn)
    assert result["metadata"]["white"] == "Player1"
    assert result["metadata"]["black"] == "Player2"
    assert len(result["moves"]) == 6
    assert result["metadata"]["opening"]["opening"] == "Ruy Lopez"

if __name__ == "__main__":
    pytest.main([__file__])
