import io
import math
import logging
import chess
import chess.pgn
import chess.engine
from typing import List, Dict, Any, Optional, Tuple

from backend.engine import StockfishEngineManager, global_engine_manager, eval_to_win_chances

logger = logging.getLogger(__name__)

# Transparent classification thresholds & constants
WIN_PROB_LOSS_BEST = 1.0
WIN_PROB_LOSS_EXCELLENT = 3.5
WIN_PROB_LOSS_GOOD = 8.0
WIN_PROB_LOSS_INACCURACY = 15.0
WIN_PROB_LOSS_MISTAKE = 25.0
WIN_PROB_LOSS_BLUNDER = 40.0

CLASSIFICATIONS = {
    "BRILLIANT": {"name": "Brilliant", "symbol": "!!", "color": "#1baca6"},
    "GREAT_MOVE": {"name": "Great Move", "symbol": "!", "color": "#5c8bb0"},
    "BEST_MOVE": {"name": "Best Move", "symbol": "★", "color": "#96bc4b"},
    "EXCELLENT": {"name": "Excellent", "symbol": "✓", "color": "#96bc4b"},
    "GOOD": {"name": "Good", "symbol": "✓", "color": "#a8b88d"},
    "INACCURACY": {"name": "Inaccuracy", "symbol": "!?", "color": "#f0c15c"},
    "MISTAKE": {"name": "Mistake", "symbol": "?", "color": "#e68a00"},
    "MISS": {"name": "Miss", "symbol": "Miss", "color": "#ee6b6b"},
    "BLUNDER": {"name": "Blunder", "symbol": "??", "color": "#ca3431"},
    "BOOK_MOVE": {"name": "Book Move", "symbol": "📖", "color": "#d5a47e"},
}

# Standard ECO opening map for common openings
ECO_OPENINGS = {
    "e4": {"eco": "C20", "opening": "King's Pawn Opening", "variation": ""},
    "e4 e5": {"eco": "C20", "opening": "King's Pawn Game", "variation": ""},
    "e4 e5 Nf3": {"eco": "C40", "opening": "King's Knight Opening", "variation": ""},
    "e4 e5 Nf3 Nc6": {"eco": "C44", "opening": "King's Knight Game", "variation": ""},
    "e4 e5 Nf3 Nc6 Bb5": {"eco": "C60", "opening": "Ruy Lopez", "variation": ""},
    "e4 e5 Nf3 Nc6 Bb5 Nf6": {"eco": "C65", "opening": "Ruy Lopez", "variation": "Berlin Defense"},
    "e4 e5 Nf3 Nc6 Bc4": {"eco": "C50", "opening": "Italian Game", "variation": ""},
    "e4 e5 Nf3 Nc6 Bc4 Bc5": {"eco": "C53", "opening": "Italian Game", "variation": "Giuoco Piano"},
    "e4 e5 Nf3 Nc6 d4": {"eco": "C44", "opening": "Scotch Game", "variation": ""},
    "e4 c5": {"eco": "B20", "opening": "Sicilian Defense", "variation": ""},
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3": {"eco": "B50", "opening": "Sicilian Defense", "variation": "Open Sicilian"},
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6": {"eco": "B90", "opening": "Sicilian Defense", "variation": "Najdorf Variation"},
    "e4 c5 Nf3 Nc6": {"eco": "B30", "opening": "Sicilian Defense", "variation": "Old Sicilian"},
    "e4 e6": {"eco": "C00", "opening": "French Defense", "variation": ""},
    "e4 e6 d4 d5": {"eco": "C01", "opening": "French Defense", "variation": "Normal Variation"},
    "e4 c6": {"eco": "B10", "opening": "Caro-Kann Defense", "variation": ""},
    "e4 c6 d4 d5": {"eco": "B12", "opening": "Caro-Kann Defense", "variation": "Main Line"},
    "e4 d6": {"eco": "B07", "opening": "Pirc Defense", "variation": ""},
    "e4 g6": {"eco": "B06", "opening": "Modern Defense", "variation": ""},
    "d4": {"eco": "A40", "opening": "Queen's Pawn Game", "variation": ""},
    "d4 d5": {"eco": "D00", "opening": "Queen's Pawn Game", "variation": ""},
    "d4 d5 c4": {"eco": "D06", "opening": "Queen's Gambit", "variation": ""},
    "d4 d5 c4 e6": {"eco": "D30", "opening": "Queen's Gambit Declined", "variation": ""},
    "d4 d5 c4 dxc4": {"eco": "D20", "opening": "Queen's Gambit Accepted", "variation": ""},
    "d4 d5 c4 c6": {"eco": "D10", "opening": "Slav Defense", "variation": ""},
    "d4 Nf6": {"eco": "A45", "opening": "Indian Defense", "variation": ""},
    "d4 Nf6 c4 e6": {"eco": "E00", "opening": "Indian Defense", "variation": "Normal"},
    "d4 Nf6 c4 g6": {"eco": "E60", "opening": "King's Indian Defense", "variation": ""},
    "d4 Nf6 c4 c5": {"eco": "A56", "opening": "Benoni Defense", "variation": ""},
    "c4": {"eco": "A10", "opening": "English Opening", "variation": ""},
    "Nf3": {"eco": "A04", "opening": "Zukertort Opening", "variation": ""},
    "f4": {"eco": "A02", "opening": "Bird's Opening", "variation": ""},
    "b3": {"eco": "A01", "opening": "Nimzo-Larsen Attack", "variation": ""},
}


def calculate_move_accuracy(win_prob_loss: float) -> float:
    """
    CAPS-style accuracy scoring for a single move based on win probability loss.
    Accuracy = max(0, min(100, 103.16 * e^(-0.0435 * loss) - 3.16))
    """
    loss = max(0.0, win_prob_loss)
    acc = 103.16 * math.exp(-0.0435 * loss) - 3.16
    return max(0.0, min(100.0, round(acc, 1)))


def calculate_game_phase(board: chess.Board, move_number: int) -> str:
    """
    Determines game phase: Opening, Middlegame, or Endgame.
    """
    if move_number <= 10:
        return "Opening"

    # Count material non-king non-pawn
    piece_value = {
        chess.QUEEN: 9,
        chess.ROOK: 5,
        chess.BISHOP: 3,
        chess.KNIGHT: 3,
    }
    non_pawn_material = 0
    queens_count = 0
    for piece in board.piece_map().values():
        if piece.piece_type in piece_value:
            non_pawn_material += piece_value[piece.piece_type]
            if piece.piece_type == chess.QUEEN:
                queens_count += 1

    if non_pawn_material <= 14 or (queens_count == 0 and non_pawn_material <= 20):
        return "Endgame"
    elif move_number <= 15 and non_pawn_material >= 26:
        return "Opening"
    else:
        return "Middlegame"


def detect_opening(san_history: List[str]) -> Dict[str, str]:
    """
    Matches the move sequence against the ECO database.
    """
    current_seq = ""
    best_match = {"eco": "A00", "opening": "Uncommon Opening", "variation": ""}

    for i, san in enumerate(san_history[:16]):
        current_seq = (current_seq + " " + san).strip()
        if current_seq in ECO_OPENINGS:
            best_match = ECO_OPENINGS[current_seq]

    return best_match


def calculate_material_count(board: chess.Board) -> Dict[str, int]:
    val_map = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}
    w_mat, b_mat = 0, 0
    for square, piece in board.piece_map().items():
        if piece.piece_type in val_map:
            if piece.color == chess.WHITE:
                w_mat += val_map[piece.piece_type]
            else:
                b_mat += val_map[piece.piece_type]
    return {"white": w_mat, "black": b_mat, "balance": w_mat - b_mat}


def is_tactical_sacrifice(board_before: chess.Board, played_move: chess.Move) -> bool:
    """
    Checks if a move sacrifices material (gives up higher value or uncompensated piece).
    """
    piece_values = {
        chess.PAWN: 1,
        chess.KNIGHT: 3,
        chess.BISHOP: 3,
        chess.ROOK: 5,
        chess.QUEEN: 9,
        chess.KING: 0,
    }

    moving_piece = board_before.piece_at(played_move.from_square)
    if not moving_piece:
        return False

    moving_val = piece_values.get(moving_piece.piece_type, 0)

    # Check if target square is defended or if piece is played into attack of lower value piece
    captured_piece = board_before.piece_at(played_move.to_square)
    captured_val = piece_values.get(captured_piece.piece_type, 0) if captured_piece else 0

    # If piece moves into attacked square by a lesser value defender or gives up piece without immediate re-capture
    is_capture_deficit = moving_val > captured_val

    # Board state after move
    board_after = board_before.copy()
    board_after.push(played_move)

    # Check if target square is attacked by opponent on board_after
    if is_capture_deficit and board_after.is_attacked_by(not board_before.turn, played_move.to_square):
        return True

    return False


def classify_move(
    board_before: chess.Board,
    played_move: chess.Move,
    played_san: str,
    engine_best_san: Optional[str],
    engine_best_uci: Optional[str],
    eval_before: dict,
    eval_after: dict,
    move_number: int,
    is_book_move: bool,
) -> Tuple[str, str]:
    """
    Multi-signal move classification algorithm.
    Returns (classification_key, explanation_text)
    """
    player_color = board_before.turn

    # Check opening book
    if is_book_move and move_number <= 12:
        return "BOOK_MOVE", f"Book move: {played_san} is standard opening theory."

    # Calculate win chance before and after from the player's perspective
    if player_color == chess.WHITE:
        win_before = eval_before["white_win_chance"]
        win_after = eval_after["white_win_chance"]
    else:
        win_before = eval_before["black_win_chance"]
        win_after = eval_after["black_win_chance"]

    win_loss = max(0.0, round(win_before - win_after, 2))

    is_best_move = (
        played_san == engine_best_san or
        played_move.uci() == engine_best_uci
    )

    # Check for forced moves (only 1 legal move)
    is_forced = board_before.legal_moves.count() == 1

    # Check for brilliant move heuristic:
    # 1. Player made a tactical sacrifice or difficult sequence
    # 2. Resulting position maintains strong advantage (win_after >= 55.0 or win_loss <= 2.0)
    # 3. Best move or within 1% win chance of best move
    # 4. Not a simple forced move or basic recapture
    if is_best_move and not is_forced and win_after >= 55.0 and win_loss <= 2.0:
        if is_tactical_sacrifice(board_before, played_move):
            return "BRILLIANT", f"Brilliant! {played_san} executes a tactical sacrifice that maintains a winning position."

    # Great move heuristic:
    # 1. Only good move in a critical position (or massive eval swing avoided)
    # 2. Best move when win_before was low or equal (win_before <= 60.0) and maintains advantage or turns game around
    if is_best_move and not is_forced:
        if win_before <= 50.0 and win_after > 65.0:
            return "GREAT_MOVE", f"Great move! {played_san} turns the game around in your favor."
        elif win_before >= 30.0 and win_loss <= 1.0 and move_number > 10:
            # Check if second best move was significantly worse
            return "GREAT_MOVE", f"Great move! {played_san} was crucial in this position."

    if is_best_move:
        return "BEST_MOVE", f"Best move. {played_san} matches Stockfish's top recommendation."

    # Non-best move classifications based on win-probability loss & tactical context
    if win_loss <= WIN_PROB_LOSS_BEST:
        return "BEST_MOVE", f"Best move. {played_san} keeps almost full engine evaluation."
    elif win_loss <= WIN_PROB_LOSS_EXCELLENT:
        return "EXCELLENT", f"Excellent move. {played_san} maintains your strong position."
    elif win_loss <= WIN_PROB_LOSS_GOOD:
        return "GOOD", f"Good move. {played_san} is solid, though best was {engine_best_san}."
    elif win_loss <= WIN_PROB_LOSS_INACCURACY:
        return "INACCURACY", f"Inaccuracy. {played_san} weakens position slightly. Best was {engine_best_san}."
    elif win_loss <= WIN_PROB_LOSS_MISTAKE:
        return "MISTAKE", f"Mistake. {played_san} lost win probability. {engine_best_san} was better."
    elif win_loss <= WIN_PROB_LOSS_BLUNDER:
        # Check if user missed a winning tactic or gave away a winning position
        if win_before >= 70.0 and win_after < 50.0:
            return "MISS", f"Missed opportunity! {played_san} lets opponent back into the game. Best was {engine_best_san}."
        return "MISTAKE", f"Mistake. {played_san} lost significant advantage."
    else:
        # Blunder or Miss
        if win_before >= 65.0 and win_after <= 45.0:
            return "MISS", f"Miss! {played_san} missed a clear winning advantage. {engine_best_san} was best."
        return "BLUNDER", f"Blunder! {played_san} drastically changes the evaluation. Engine preferred {engine_best_san}."


def estimate_performance_elo(accuracy: float, blunders: int, mistakes: int, inaccuracies: int) -> int:
    """
    Stable deterministic performance Elo estimation.
    Labeled explicitly as 'Estimated Performance Elo'.
    """
    base_elo = 600 + (accuracy / 100.0) ** 2.2 * 1900
    penalty = (blunders * 45) + (mistakes * 18) + (inaccuracies * 5)
    estimated = int(round(base_elo - penalty))
    return max(400, min(2850, estimated))


class GameReviewer:
    def __init__(self, engine_manager: Optional[StockfishEngineManager] = None):
        self.engine_manager = engine_manager or global_engine_manager

    def review_game(self, pgn_string: str, depth: int = 18, threads: int = 4, hash_mb: int = 512) -> Dict[str, Any]:
        """
        Main analysis entrypoint for PGN games.
        Parses PGN and analyzes every move with Stockfish.
        """
        pgn_io = io.StringIO(pgn_string.strip())
        game = chess.pgn.read_game(pgn_io)
        if game is None:
            raise ValueError("Invalid PGN format or empty game.")

        headers = game.headers
        white_player = headers.get("White", "White Player")
        black_player = headers.get("Black", "Black Player")
        date_str = headers.get("Date", "Unknown Date")
        event_str = headers.get("Event", "Casual Game")

        board = game.board()
        moves = list(game.mainline_moves())
        total_half_moves = len(moves)

        if total_half_moves == 0:
            raise ValueError("PGN game contains no moves.")

        # Pre-evaluation of initial starting position
        initial_fen = board.fen()
        initial_eval = self.engine_manager.evaluate_position(initial_fen, depth=depth, threads=threads, hash_mb=hash_mb)

        san_history: List[str] = []
        analyzed_moves: List[Dict[str, Any]] = []

        white_losses: List[float] = []
        black_losses: List[float] = []

        white_phase_losses = {"Opening": [], "Middlegame": [], "Endgame": []}
        black_phase_losses = {"Opening": [], "Middlegame": [], "Endgame": []}

        white_counts = {k: 0 for k in CLASSIFICATIONS.keys()}
        black_counts = {k: 0 for k in CLASSIFICATIONS.keys()}

        curr_eval = initial_eval
        key_moments: List[Dict[str, Any]] = []

        temp_board = board.copy()

        for idx, move in enumerate(moves):
            move_number = (idx // 2) + 1
            is_white = (temp_board.turn == chess.WHITE)
            player_name = white_player if is_white else black_player
            player_color_str = "white" if is_white else "black"

            board_before = temp_board.copy()
            fen_before = board_before.fen()
            played_san = board_before.san(move)

            # Check if sequence is in book moves
            seq_for_book = san_history + [played_san]
            opening_info = detect_opening(seq_for_book)
            is_book_move = (opening_info["opening"] != "Uncommon Opening") and move_number <= 10

            # Execute move on temp board
            temp_board.push(move)
            fen_after = temp_board.fen()

            # Evaluate position after move
            eval_after = self.engine_manager.evaluate_position(fen_after, depth=depth, threads=threads, hash_mb=hash_mb)

            # Win chance calculation
            if is_white:
                win_before = curr_eval["white_win_chance"]
                win_after = eval_after["white_win_chance"]
            else:
                win_before = curr_eval["black_win_chance"]
                win_after = eval_after["black_win_chance"]

            win_loss = max(0.0, round(win_before - win_after, 2))
            accuracy_score = calculate_move_accuracy(win_loss)

            phase = calculate_game_phase(board_before, move_number)

            class_key, explanation = classify_move(
                board_before=board_before,
                played_move=move,
                played_san=played_san,
                engine_best_san=curr_eval.get("best_move"),
                engine_best_uci=curr_eval.get("best_move_uci"),
                eval_before=curr_eval,
                eval_after=eval_after,
                move_number=move_number,
                is_book_move=is_book_move,
            )

            class_info = CLASSIFICATIONS[class_key]

            if is_white:
                white_losses.append(win_loss)
                white_phase_losses[phase].append(win_loss)
                white_counts[class_key] += 1
            else:
                black_losses.append(win_loss)
                black_phase_losses[phase].append(win_loss)
                black_counts[class_key] += 1

            # Key moment detection
            eval_diff_cp = (
                (eval_after["evaluation_cp"] or 0) - (curr_eval["evaluation_cp"] or 0)
            )
            if class_key in ["BLUNDER", "MISS", "MISTAKE", "BRILLIANT", "GREAT_MOVE"] or abs(eval_diff_cp) >= 200:
                key_type = "turning_point" if abs(eval_diff_cp) >= 200 else class_key.lower()
                key_moments.append({
                    "move_index": idx,
                    "move_number": move_number,
                    "player": player_color_str,
                    "type": key_type,
                    "played_san": played_san,
                    "best_san": curr_eval.get("best_move"),
                    "classification": class_info["name"],
                    "evaluation_before": curr_eval["evaluation_cp"],
                    "evaluation_after": eval_after["evaluation_cp"],
                    "explanation": explanation
                })

            san_history.append(played_san)

            move_data = {
                "ply": idx + 1,
                "move_number": move_number,
                "color": player_color_str,
                "player": player_name,
                "played_move": played_san,
                "played_uci": move.uci(),
                "best_move": curr_eval.get("best_move"),
                "best_move_uci": curr_eval.get("best_move_uci"),
                "classification": class_info["name"],
                "classification_key": class_key,
                "symbol": class_info["symbol"],
                "color_code": class_info["color"],
                "explanation": explanation,
                "evaluation_cp": eval_after["evaluation_cp"],
                "mate": eval_after["mate"],
                "white_win_chance": eval_after["white_win_chance"],
                "black_win_chance": eval_after["black_win_chance"],
                "win_prob_loss": win_loss,
                "move_accuracy": accuracy_score,
                "game_phase": phase,
                "fen_before": fen_before,
                "fen_after": fen_after,
                "engine_pv": curr_eval.get("pv", []),
                "material": calculate_material_count(temp_board)
            }
            analyzed_moves.append(move_data)

            # Advance current eval to eval_after for next iteration
            curr_eval = eval_after

        # Overall accuracies
        white_avg_loss = sum(white_losses) / len(white_losses) if white_losses else 0.0
        black_avg_loss = sum(black_losses) / len(black_losses) if black_losses else 0.0

        white_overall_acc = calculate_move_accuracy(white_avg_loss)
        black_overall_acc = calculate_move_accuracy(black_avg_loss)

        def phase_acc(loss_list: List[float]) -> float:
            if not loss_list:
                return 100.0
            return calculate_move_accuracy(sum(loss_list) / len(loss_list))

        white_phase_acc = {k: phase_acc(v) for k, v in white_phase_losses.items()}
        black_phase_acc = {k: phase_acc(v) for k, v in black_phase_losses.items()}

        white_elo = estimate_performance_elo(
            white_overall_acc, white_counts["BLUNDER"], white_counts["MISTAKE"], white_counts["INACCURACY"]
        )
        black_elo = estimate_performance_elo(
            black_overall_acc, black_counts["BLUNDER"], black_counts["MISTAKE"], black_counts["INACCURACY"]
        )

        final_opening = detect_opening(san_history)

        return {
            "metadata": {
                "white": white_player,
                "black": black_player,
                "date": date_str,
                "event": event_str,
                "total_moves": len(moves),
                "opening": final_opening
            },
            "accuracy": {
                "caps_formula": "103.16 * e^(-0.0435 * loss) - 3.16",
                "white": {
                    "overall": white_overall_acc,
                    "estimated_elo": white_elo,
                    "phases": white_phase_acc,
                    "classifications": white_counts
                },
                "black": {
                    "overall": black_overall_acc,
                    "estimated_elo": black_elo,
                    "phases": black_phase_acc,
                    "classifications": black_counts
                }
            },
            "key_moments": key_moments[:10],
            "moves": analyzed_moves,
            "initial_eval": {
                "evaluation_cp": initial_eval["evaluation_cp"],
                "mate": initial_eval["mate"],
                "white_win_chance": initial_eval["white_win_chance"],
                "black_win_chance": initial_eval["black_win_chance"],
            }
        }


# Global reviewer instance
global_reviewer = GameReviewer()
