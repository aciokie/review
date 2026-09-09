/**
 * API Client & Engine Connection Manager
 */
const API = {
  activeProvider: "colab", // 'colab' or 'local'
  colabUrl: "",
  isConnected: false,
  healthCheckTimer: null,

  init() {
    const settings = Settings.load();
    this.activeProvider = settings.engineProvider || "colab";
    this.colabUrl = (settings.colabUrl || "").trim().replace(/\/+$/, "");

    this.checkHealth();
    this.startHealthCheckLoop();
  },

  getBaseUrl() {
    if (this.activeProvider === "colab" && this.colabUrl) {
      return this.colabUrl;
    }
    return window.location.origin;
  },

  updateStatusUI(status, message, engineName) {
    const dot = $("#status-dot");
    const engineText = $("#status-engine-name");
    const statusText = $("#status-text");

    dot.removeClass("bg-green-500 bg-yellow-500 bg-red-500 bg-blue-500 animate-pulse");

    if (status === "connected") {
      dot.addClass("bg-green-500");
      engineText.text(engineName || "Google Colab Stockfish 19");
      statusText.text("Connected");
      this.isConnected = true;
    } else if (status === "local") {
      dot.addClass("bg-blue-500");
      engineText.text("Local Browser Stockfish WASM");
      statusText.text("Available");
      this.isConnected = true;
    } else if (status === "checking") {
      dot.addClass("bg-yellow-500 animate-pulse");
      engineText.text("Connecting Engine...");
      statusText.text("Checking Status");
      this.isConnected = false;
    } else {
      dot.addClass("bg-red-500");
      engineText.text(engineName || "Colab Engine");
      statusText.text(message || "Disconnected");
      this.isConnected = false;
    }
  },

  async checkHealth() {
    const settings = Settings.load();
    this.activeProvider = settings.engineProvider;
    this.colabUrl = (settings.colabUrl || "").trim().replace(/\/+$/, "");

    if (this.activeProvider === "local") {
      this.updateStatusUI("local", "Available", "Local Browser Stockfish WASM");
      return { status: "ok", engine_connected: true, engine: "Local Browser Stockfish WASM" };
    }

    if (!this.colabUrl) {
      this.updateStatusUI("disconnected", "URL Not Configured", "Colab Engine");
      return { status: "error", engine_connected: false, message: "Colab URL not configured" };
    }

    this.updateStatusUI("checking");

    try {
      const url = `${this.colabUrl}/api/health`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { "Accept": "application/json" }
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.engine_connected) {
          this.updateStatusUI("connected", "Connected", data.engine || "Google Colab Stockfish 19");
          return data;
        }
      }
      this.updateStatusUI("disconnected", "Server Offline", "Colab Engine");
      return { status: "error", engine_connected: false };
    } catch (err) {
      console.warn("Colab Health Check Failed:", err.message);
      this.updateStatusUI("disconnected", "Disconnected", "Colab Engine");
      return { status: "error", engine_connected: false };
    }
  },

  startHealthCheckLoop() {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    this.healthCheckTimer = setInterval(() => {
      this.checkHealth();
    }, 15000);
  },

  async evaluatePosition(fen, depth = 20) {
    const settings = Settings.load();
    if (this.activeProvider === "local" || !this.colabUrl || !this.isConnected) {
      return this.evaluatePositionLocal(fen);
    }

    const url = `${this.colabUrl}/api/evaluate`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen: fen,
          depth: settings.depth || depth,
          threads: settings.threads || 4,
          hash_mb: settings.hashMb || 512,
          multipv: settings.multiPv || 1
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.warn("Colab Evaluation Failed, falling back to local WASM:", err.message);
      return this.evaluatePositionLocal(fen);
    }
  },

  async reviewGame(pgnString, depth = 18) {
    const settings = Settings.load();
    if (this.activeProvider === "local" || !this.colabUrl || !this.isConnected) {
      return this.reviewGameLocal(pgnString);
    }

    const url = `${this.colabUrl}/api/review`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pgn: pgnString,
          depth: settings.depth || depth,
          threads: settings.threads || 4,
          hash_mb: settings.hashMb || 512
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.warn("Colab Review Failed, falling back to local WASM analysis:", err.message);
      return this.reviewGameLocal(pgnString);
    }
  },

  /* Local WASM Engine Fallback */
  async evaluatePositionLocal(fen) {
    if (window.stockfishWasm) {
      const wasmResult = await window.stockfishWasm.evaluate(fen, 12);
      if (wasmResult) return wasmResult;
    }

    // JS Fallback evaluator if WASM worker fails
    const game = new Chess(fen);
    if (game.game_over()) {
      if (game.in_checkmate()) {
        const mate = game.turn() === "w" ? -1 : 1;
        return {
          best_move: null,
          evaluation_cp: mate > 0 ? 10000 : -10000,
          mate: mate,
          white_win_chance: mate > 0 ? 100.0 : 0.0,
          black_win_chance: mate > 0 ? 0.0 : 100.0,
          depth: 12,
          pv: []
        };
      }
      return {
        best_move: null,
        evaluation_cp: 0,
        mate: null,
        white_win_chance: 50.0,
        black_win_chance: 50.0,
        depth: 12,
        pv: []
      };
    }

    const pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
    let score = 0;
    const board = game.board();

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p) {
          const val = pieceValues[p.type] || 0;
          score += p.color === 'w' ? val : -val;
        }
      }
    }

    const moves = game.moves({ verbose: true });
    score += (game.turn() === 'w' ? 1 : -1) * (moves.length * 5);

    const cp = Math.round(score / 3);
    const winChance = Math.round(100 / (1 + Math.pow(10, -cp / 400)) * 10) / 10;
    const bestMove = moves.length > 0 ? moves[0].san : null;

    return {
      best_move: bestMove,
      best_move_uci: moves.length > 0 ? moves[0].from + moves[0].to : null,
      evaluation_cp: cp,
      mate: null,
      white_win_chance: winChance,
      black_win_chance: Math.round((100 - winChance) * 10) / 10,
      depth: 12,
      pv: moves.slice(0, 3).map(m => m.san)
    };
  },

  async reviewGameLocal(pgnString) {
    const game = new Chess();
    if (!game.load_pgn(pgnString)) {
      throw new Error("Invalid PGN text string.");
    }

    const history = game.history({ verbose: true });
    const moves = [];
    const tempGame = new Chess();

    let whiteLosses = [];
    let blackLosses = [];

    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      const fenBefore = tempGame.fen();
      const moveNumber = Math.floor(i / 2) + 1;
      const isWhite = tempGame.turn() === 'w';

      const evalBefore = await this.evaluatePositionLocal(fenBefore);
      tempGame.move(move);
      const fenAfter = tempGame.fen();
      const evalAfter = await this.evaluatePositionLocal(fenAfter);

      const winBefore = isWhite ? evalBefore.white_win_chance : evalBefore.black_win_chance;
      const winAfter = isWhite ? evalAfter.white_win_chance : evalAfter.black_win_chance;
      const loss = Math.max(0, Math.round((winBefore - winAfter) * 10) / 10);

      if (isWhite) whiteLosses.push(loss);
      else blackLosses.push(loss);

      let classKey = "GOOD";
      let classSymbol = "✓";
      let classColor = "#96bc4b";
      let className = "Good";

      if (evalBefore.best_move === move.san || evalBefore.best_move_uci === move.from + move.to) {
        classKey = "BEST_MOVE"; classSymbol = "★"; className = "Best Move"; classColor = "#96bc4b";
      } else if (loss > 35) {
        classKey = "BLUNDER"; classSymbol = "??"; className = "Blunder"; classColor = "#ca3431";
      } else if (loss > 20) {
        classKey = "MISTAKE"; classSymbol = "?"; className = "Mistake"; classColor = "#e68a00";
      } else if (loss > 10) {
        classKey = "INACCURACY"; classSymbol = "!?"; className = "Inaccuracy"; classColor = "#f0c15c";
      }

      moves.push({
        ply: i + 1,
        move_number: moveNumber,
        color: isWhite ? "white" : "black",
        played_move: move.san,
        played_uci: move.from + move.to,
        best_move: evalBefore.best_move,
        best_move_uci: evalBefore.best_move_uci,
        classification: className,
        classification_key: classKey,
        symbol: classSymbol,
        color_code: classColor,
        explanation: `${className}! Played ${move.san}. Best was ${evalBefore.best_move || 'N/A'}.`,
        evaluation_cp: evalAfter.evaluation_cp,
        mate: evalAfter.mate,
        white_win_chance: evalAfter.white_win_chance,
        black_win_chance: evalAfter.black_win_chance,
        win_prob_loss: loss,
        game_phase: moveNumber <= 10 ? "Opening" : "Middlegame",
        fen_before: fenBefore,
        fen_after: fenAfter,
        engine_pv: evalAfter.pv
      });
    }

    const calcAcc = (losses) => {
      if (losses.length === 0) return 100.0;
      const avg = losses.reduce((a, b) => a + b, 0) / losses.length;
      return Math.max(0, Math.min(100, Math.round(103.16 * Math.exp(-0.0435 * avg) - 3.16)));
    };

    const wAcc = calcAcc(whiteLosses);
    const bAcc = calcAcc(blackLosses);

    return {
      metadata: {
        white: "White Player",
        black: "Black Player",
        date: new Date().toISOString().split('T')[0],
        total_moves: history.length,
        opening: { eco: "C00", opening: "Chess Game", variation: "" }
      },
      accuracy: {
        white: { overall: wAcc, estimated_elo: Math.round(800 + wAcc * 12), phases: { Opening: wAcc, Middlegame: wAcc, Endgame: wAcc } },
        black: { overall: bAcc, estimated_elo: Math.round(800 + bAcc * 12), phases: { Opening: bAcc, Middlegame: bAcc, Endgame: bAcc } }
      },
      moves: moves,
      key_moments: moves.filter(m => ["BLUNDER", "MISTAKE", "BRILLIANT"].includes(m.classification_key))
    };
  }
};

window.API = API;
