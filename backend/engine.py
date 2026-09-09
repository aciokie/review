import os
import shutil
import threading
import logging
import math
import chess
import chess.engine

logger = logging.getLogger(__name__)

DEFAULT_DEPTH = 30
DEFAULT_THREADS = 4
DEFAULT_HASH_MB = 512
DEFAULT_MULTIPV = 1

MAX_SAFE_DEPTH = 50
MAX_SAFE_THREADS = 16
MAX_SAFE_HASH_MB = 4096
MAX_SAFE_MULTIPV = 5


def cp_to_win_chance(cp: int) -> float:
    """
    Convert centipawns evaluation to white win probability %.
    WinChance = 100 / (1 + 10^(-cp / 400))
    Normalized from White's perspective.
    """
    if cp is None:
        return 50.0
    return round(100.0 / (1.0 + math.pow(10, -cp / 400.0)), 2)


def mate_to_win_chance(mate_in: int, is_white_turn_or_perspective: bool = True) -> float:
    """
    Convert mate score to white win probability %.
    mate_in > 0: mate for the side to move (or white if normalized).
    """
    if mate_in > 0:
        return round(100.0 - min(abs(mate_in) * 0.1, 0.9), 2)
    elif mate_in < 0:
        return round(0.0 + min(abs(mate_in) * 0.1, 0.9), 2)
    else:
        return 50.0


def eval_to_win_chances(score: chess.engine.Score, turn: chess.Color = chess.WHITE) -> tuple[int | None, int | None, float, float]:
    """
    Evaluates score and returns (cp, mate, white_win_chance, black_win_chance)
    always normalized from White's perspective.
    """
    pov_score = score.white()

    cp = None
    mate = None

    if pov_score.is_mate():
        mate = pov_score.mate()
        if mate is not None:
            if mate > 0:
                white_win = mate_to_win_chance(mate, True)
                cp = 10000 - (mate * 10)
            else:
                white_win = mate_to_win_chance(mate, True)
                cp = -10000 - (mate * 10)
        else:
            white_win = 50.0
            cp = 0
    else:
        cp = pov_score.score()
        if cp is None:
            cp = 0
        white_win = cp_to_win_chance(cp)

    black_win = round(100.0 - white_win, 2)
    return cp, mate, white_win, black_win


class StockfishEngineManager:
    def __init__(self, executable_path: str | None = None):
        self.executable_path = executable_path or os.getenv("STOCKFISH_PATH") or shutil.which("stockfish")
        self.engine: chess.engine.SimpleEngine | None = None
        self._lock = threading.Lock()
        self.info = {
            "engine": "Stockfish",
            "version": "19",
            "build": "Dev/Master (NNUE GPU Accelerated)",
            "threads": DEFAULT_THREADS,
            "hash_mb": DEFAULT_HASH_MB,
            "min_depth": 30,
            "executable_found": False,
        }
        if self.executable_path and os.path.exists(self.executable_path):
            self.info["executable_found"] = True

    def find_executable(self) -> str | None:
        if self.executable_path and os.path.exists(self.executable_path):
            return self.executable_path

        possible_paths = [
            "stockfish",
            "/usr/games/stockfish",
            "/usr/local/bin/stockfish",
            "/usr/bin/stockfish",
            "./stockfish",
            "../stockfish"
        ]
        for path in possible_paths:
            found = shutil.which(path) or (os.path.exists(path) and path)
            if found:
                self.executable_path = found
                self.info["executable_found"] = True
                return found
        return None

    def start_engine(self, threads: int = DEFAULT_THREADS, hash_mb: int = DEFAULT_HASH_MB) -> bool:
        with self._lock:
            if self.engine is not None:
                return True

            exe = self.find_executable()
            if not exe:
                logger.warning("Stockfish executable not found.")
                return False

            try:
                threads = min(max(1, threads), MAX_SAFE_THREADS)
                hash_mb = min(max(16, hash_mb), MAX_SAFE_HASH_MB)

                transport, engine = chess.engine.SimpleEngine.popen_uci(exe)
                self.engine = engine

                options = {}
                if "Threads" in self.engine.options:
                    options["Threads"] = threads
                    self.info["threads"] = threads
                if "Hash" in self.engine.options:
                    options["Hash"] = hash_mb
                    self.info["hash_mb"] = hash_mb

                if options:
                    self.engine.configure(options)

                logger.info(f"Started Stockfish 19 engine from {exe} with Threads={threads}, Hash={hash_mb}")
                return True
            except Exception as e:
                logger.error(f"Failed to start Stockfish engine: {e}")
                self.engine = None
                return False

    def stop_engine(self):
        with self._lock:
            if self.engine is not None:
                try:
                    self.engine.quit()
                except Exception:
                    pass
                self.engine = None

    def is_available(self) -> bool:
        if self.engine is None:
            return self.start_engine()
        return True

    def evaluate_position(
        self,
        fen: str,
        depth: int = DEFAULT_DEPTH,
        threads: int = DEFAULT_THREADS,
        hash_mb: int = DEFAULT_HASH_MB,
        multipv: int = DEFAULT_MULTIPV
    ) -> dict:
        """
        Evaluate a given FEN position with minimum 30+ depth.
        """
        if not self.is_available():
            raise RuntimeError("Stockfish engine is unavailable.")

        board = chess.Board(fen)
        # Ensure depth is at least 30 as requested
        safe_depth = max(30, min(max(1, depth), MAX_SAFE_DEPTH))
        safe_multipv = min(max(1, multipv), MAX_SAFE_MULTIPV)

        with self._lock:
            if self.engine is None:
                raise RuntimeError("Stockfish engine is not running.")

            limit = chess.engine.Limit(depth=safe_depth)

            options = {}
            if "Threads" in self.engine.options and self.info.get("threads") != threads:
                options["Threads"] = min(max(1, threads), MAX_SAFE_THREADS)
                self.info["threads"] = options["Threads"]
            if "Hash" in self.engine.options and self.info.get("hash_mb") != hash_mb:
                options["Hash"] = min(max(16, hash_mb), MAX_SAFE_HASH_MB)
                self.info["hash_mb"] = options["Hash"]
            if options:
                try:
                    self.engine.configure(options)
                except Exception as e:
                    logger.warning(f"Failed to set engine options: {e}")

            analysis = self.engine.analyse(board, limit, multipv=safe_multipv)

            if safe_multipv == 1:
                top_line = analysis if isinstance(analysis, dict) else analysis[0]
                score = top_line.get("score", chess.engine.PovScore(chess.engine.Cp(0), chess.WHITE))
                pv_moves = top_line.get("pv", [])

                cp, mate, white_win, black_win = eval_to_win_chances(score, board.turn)

                best_move_san = board.san(pv_moves[0]) if pv_moves else None
                best_move_uci = pv_moves[0].uci() if pv_moves else None
                pv_san = []
                temp_board = board.copy()
                for m in pv_moves[:10]:
                    pv_san.append(temp_board.san(m))
                    temp_board.push(m)

                return {
                    "best_move": best_move_san or best_move_uci,
                    "best_move_uci": best_move_uci,
                    "evaluation_cp": cp,
                    "mate": mate,
                    "white_win_chance": white_win,
                    "black_win_chance": black_win,
                    "depth": top_line.get("depth", safe_depth),
                    "nodes": top_line.get("nodes", 0),
                    "nps": top_line.get("nps", 0),
                    "pv": pv_san,
                    "pv_uci": [m.uci() for m in pv_moves[:10]]
                }
            else:
                lines = []
                for entry in analysis:
                    score = entry.get("score", chess.engine.PovScore(chess.engine.Cp(0), chess.WHITE))
                    pv_moves = entry.get("pv", [])
                    cp, mate, white_win, black_win = eval_to_win_chances(score, board.turn)

                    temp_board = board.copy()
                    pv_san = []
                    for m in pv_moves[:10]:
                        pv_san.append(temp_board.san(m))
                        temp_board.push(m)

                    lines.append({
                        "best_move": temp_board.san(pv_moves[0]) if pv_moves else None,
                        "best_move_uci": pv_moves[0].uci() if pv_moves else None,
                        "evaluation_cp": cp,
                        "mate": mate,
                        "white_win_chance": white_win,
                        "black_win_chance": black_win,
                        "depth": entry.get("depth", safe_depth),
                        "pv": pv_san
                    })

                primary = lines[0]
                return {
                    "best_move": primary["best_move"],
                    "best_move_uci": primary["best_move_uci"],
                    "evaluation_cp": primary["evaluation_cp"],
                    "mate": primary["mate"],
                    "white_win_chance": primary["white_win_chance"],
                    "black_win_chance": primary["black_win_chance"],
                    "depth": primary["depth"],
                    "multipv_lines": lines,
                    "pv": primary["pv"]
                }


# Global singleton instance
global_engine_manager = StockfishEngineManager()
