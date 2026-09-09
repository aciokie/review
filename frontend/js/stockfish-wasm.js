/**
 * Stockfish WASM Web Worker Engine Wrapper
 */
class StockfishWasmEngine {
  constructor() {
    this.worker = null;
    this.isReady = false;
    this.currentResolver = null;
    this.currentFen = null;
    this.currentTurn = 'w';
    this.initWorker();
  }

  initWorker() {
    try {
      // Use standard CDN Stockfish WASM JS worker
      const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js";

      // Create Worker from CDN script
      const blob = new Blob([`importScripts('${workerUrl}');`], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);

      this.worker = new Worker(blobUrl);

      this.worker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : (e.data && e.data.cmd ? e.data.cmd : '');
        this.handleMessage(line);
      };

      this.worker.postMessage('uci');
      this.worker.postMessage('isready');
      this.isReady = true;
    } catch (err) {
      console.warn("Stockfish WASM Worker Initialization failed, falling back to JS evaluator:", err);
      this.isReady = false;
    }
  }

  handleMessage(line) {
    if (!line) return;

    if (this.currentResolver) {
      // Parse info score
      if (line.includes("info depth") && line.includes("score")) {
        const cpMatch = line.match(/score cp (-?\d+)/);
        const mateMatch = line.match(/score mate (-?\d+)/);
        const pvMatch = line.match(/pv (.+)/);

        if (cpMatch) {
          let cp = parseInt(cpMatch[1], 10);
          // Stockfish score is relative to turn
          if (this.currentTurn === 'b') cp = -cp;
          this.currentResolver.cp = cp;
          this.currentResolver.mate = null;
        } else if (mateMatch) {
          let mate = parseInt(mateMatch[1], 10);
          if (this.currentTurn === 'b') mate = -mate;
          this.currentResolver.mate = mate;
          this.currentResolver.cp = mate > 0 ? 10000 : -10000;
        }

        if (pvMatch) {
          this.currentResolver.pvUci = pvMatch[1].trim().split(" ");
        }
      }

      // Parse bestmove
      if (line.startsWith("bestmove")) {
        const parts = line.split(" ");
        const bestMoveUci = parts[1] && parts[1] !== "(none)" ? parts[1] : null;

        const cp = this.currentResolver.cp !== undefined ? this.currentResolver.cp : 0;
        const mate = this.currentResolver.mate !== undefined ? this.currentResolver.mate : null;

        let whiteWin = 50.0;
        if (mate !== null) {
          whiteWin = mate > 0 ? 100.0 : 0.0;
        } else {
          whiteWin = Math.round(100.0 / (1.0 + Math.pow(10, -cp / 400.0)) * 10) / 10;
        }
        const blackWin = Math.round((100.0 - whiteWin) * 10) / 10;

        // Convert UCI PV to SAN if chess.js is available
        let pvSan = [];
        let bestSan = bestMoveUci;

        if (window.Chess && this.currentFen && bestMoveUci) {
          try {
            const g = new Chess(this.currentFen);
            const m = g.move({ from: bestMoveUci.substring(0, 2), to: bestMoveUci.substring(2, 4), promotion: bestMoveUci.length > 4 ? bestMoveUci[4] : 'q' });
            if (m) bestSan = m.san;

            const tempG = new Chess(this.currentFen);
            for (const uciMove of (this.currentResolver.pvUci || []).slice(0, 8)) {
              if (uciMove.length >= 4) {
                const pm = tempG.move({ from: uciMove.substring(0, 2), to: uciMove.substring(2, 4), promotion: uciMove.length > 4 ? uciMove[4] : 'q' });
                if (pm) pvSan.push(pm.san);
                else break;
              }
            }
          } catch (err) {
            console.warn("SAN conversion error:", err);
          }
        }

        const res = {
          best_move: bestSan,
          best_move_uci: bestMoveUci,
          evaluation_cp: cp,
          mate: mate,
          white_win_chance: whiteWin,
          black_win_chance: blackWin,
          depth: 14,
          pv: pvSan.length > 0 ? pvSan : (this.currentResolver.pvUci || [])
        };

        const resolve = this.currentResolver.resolve;
        this.currentResolver = null;
        resolve(res);
      }
    }
  }

  evaluate(fen, depth = 14) {
    if (!this.worker || !this.isReady) {
      return null;
    }

    return new Promise((resolve) => {
      this.currentFen = fen;
      this.currentTurn = fen.split(" ")[1] || "w";
      this.currentResolver = {
        resolve: resolve,
        cp: 0,
        mate: null,
        pvUci: []
      };

      this.worker.postMessage("stop");
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${depth}`);

      // Timeout safety fallback (3 seconds max for local WASM move)
      setTimeout(() => {
        if (this.currentResolver) {
          const res = {
            best_move: null,
            best_move_uci: null,
            evaluation_cp: 0,
            mate: null,
            white_win_chance: 50.0,
            black_win_chance: 50.0,
            depth: depth,
            pv: []
          };
          const r = this.currentResolver.resolve;
          this.currentResolver = null;
          r(res);
        }
      }, 3000);
    });
  }
}

window.stockfishWasm = new StockfishWasmEngine();
