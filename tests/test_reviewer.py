import pytest
import chess
from backend.reviewer import calculate_move_accuracy, estimate_performance_elo, detect_opening, GameReviewer, classify_move
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

def test_classify_move_categories():
    board = chess.Board()
    move_e4 = chess.Move.from_uci("e2e4")

    # 1. Book Move
    cat, exp = classify_move(board, move_e4, "e4", "e4", "e2e4", {"white_win_chance": 50.0}, {"white_win_chance": 50.0}, 1, True)
    assert cat == "BOOK_MOVE"

    # 2. Great Move
    cat, exp = classify_move(board, move_e4, "e4", "e4", "e2e4", {"white_win_chance": 45.0}, {"white_win_chance": 70.0}, 15, False)
    assert cat == "GREAT_MOVE"

    # 3. Best Move
    cat, exp = classify_move(board, move_e4, "e4", "e4", "e2e4", {"white_win_chance": 50.0}, {"white_win_chance": 50.0}, 5, False)
    assert cat == "BEST_MOVE"

    # 4. Excellent Move
    cat, exp = classify_move(board, move_e4, "e4", "d4", "d2d4", {"white_win_chance": 50.0}, {"white_win_chance": 48.0}, 5, False)
    assert cat == "EXCELLENT"

    # 5. Good Move
    cat, exp = classify_move(board, move_e4, "e4", "d4", "d2d4", {"white_win_chance": 50.0}, {"white_win_chance": 44.0}, 5, False)
    assert cat == "GOOD"

    # 6. Inaccuracy
    cat, exp = classify_move(board, move_e4, "e4", "d4", "d2d4", {"white_win_chance": 50.0}, {"white_win_chance": 38.0}, 5, False)
    assert cat == "INACCURACY"

    # 7. Mistake
    cat, exp = classify_move(board, move_e4, "e4", "d4", "d2d4", {"white_win_chance": 50.0}, {"white_win_chance": 28.0}, 5, False)
    assert cat == "MISTAKE"

    # 8. Blunder
    cat, exp = classify_move(board, move_e4, "e4", "d4", "d2d4", {"white_win_chance": 50.0}, {"white_win_chance": 5.0}, 5, False)
    assert cat == "BLUNDER"

    # 9. Miss
    cat, exp = classify_move(board, move_e4, "e4", "d4", "d2d4", {"white_win_chance": 75.0}, {"white_win_chance": 20.0}, 5, False)
    assert cat == "MISS"

if __name__ == "__main__":
    pytest.main([__file__])
