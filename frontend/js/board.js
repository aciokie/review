/**
 * Interactive Chess Board & Control Module
 */
const BoardManager = {
  board: null,
  game: null,
  currentPly: 0,
  reviewData: null,
  autoplayTimer: null,
  isPracticeMode: false,
  practiceTargetMove: null,

  init() {
    this.game = new Chess();
    const config = {
      draggable: true,
      position: 'start',
      onDragStart: this.onDragStart.bind(this),
      onDrop: this.onDrop.bind(this),
      onSnapEnd: this.onSnapEnd.bind(this),
      pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    };

    this.board = Chessboard('my-board', config);
    $(window).resize(() => this.board && this.board.resize());

    this.bindControls();
    this.bindKeyboardShortcuts();
  },

  setReviewData(data) {
    this.reviewData = data;
    this.currentPly = 0;
    this.game.reset();
    this.board.position(this.game.fen(), false);
    this.updateEvalBar(data.initial_eval || { white_win_chance: 50.0, black_win_chance: 50.0, evaluation_cp: 0 });
    this.highlightCurrentMove();
  },

  goToPly(ply) {
    if (!this.reviewData || !this.reviewData.moves) return;

    this.currentPly = Math.max(0, Math.min(ply, this.reviewData.moves.length));

    this.game.reset();
    for (let i = 0; i < this.currentPly; i++) {
      const m = this.reviewData.moves[i];
      if (m && m.played_san) {
        this.game.move(m.played_san);
      }
    }

    this.board.position(this.game.fen(), true);
    this.highlightCurrentMove();

    // Trigger update move review panel & chart highlight
    if (window.ReviewUI) {
      window.ReviewUI.onPlyChanged(this.currentPly);
    }
  },

  updateEvalBar(evalInfo) {
    if (!evalInfo) return;

    let whiteWin = evalInfo.white_win_chance || 50.0;
    let blackWin = evalInfo.black_win_chance || (100.0 - whiteWin);
    let cp = evalInfo.evaluation_cp;
    let mate = evalInfo.mate;

    if (mate !== null && mate !== undefined) {
      if (mate > 0) {
        whiteWin = 100.0;
        blackWin = 0.0;
      } else {
        whiteWin = 0.0;
        blackWin = 100.0;
      }
    }

    // Set height of white and black bars
    $("#eval-bar-white").css("height", `${whiteWin}%`);
    $("#eval-bar-black").css("height", `${blackWin}%`);

    $("#eval-text-bottom").text(`${Math.round(whiteWin)}%`);
    $("#eval-text-top").text(`${Math.round(blackWin)}%`);

    // Badge score display
    let scoreStr = "0.0";
    if (mate !== null && mate !== undefined) {
      scoreStr = `M${Math.abs(mate)}`;
    } else if (cp !== null && cp !== undefined) {
      const val = (cp / 100.0).toFixed(1);
      scoreStr = val > 0 ? `+${val}` : `${val}`;
    }

    $("#eval-score-badge").text(scoreStr);
  },

  highlightCurrentMove() {
    $("#my-board .square-55d63").removeClass("highlight-last-move highlight-best-move highlight-played-move");

    if (this.currentPly === 0 || !this.reviewData || !this.reviewData.moves) {
      return;
    }

    const moveData = this.reviewData.moves[this.currentPly - 1];
    if (!moveData) return;

    // Highlight played move squares
    if (moveData.played_uci && moveData.played_uci.length >= 4) {
      const fromSq = moveData.played_uci.substring(0, 2);
      const toSq = moveData.played_uci.substring(2, 4);
      $(`#my-board .square-${fromSq}`).addClass("highlight-played-move");
      $(`#my-board .square-${toSq}`).addClass("highlight-played-move");
    }

    // Highlight engine best move square if different
    if (moveData.best_move_uci && moveData.best_move_uci !== moveData.played_uci) {
      const bestToSq = moveData.best_move_uci.substring(2, 4);
      $(`#my-board .square-${bestToSq}`).addClass("highlight-best-move");
    }
  },

  onDragStart(source, piece, position, orientation) {
    if (this.isPracticeMode) {
      // Allow dragging in practice mode
      if ((this.game.turn() === 'w' && piece.search(/^b/) !== -1) ||
          (this.game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
      }
      return true;
    }
    // Block dragging on main review board unless practicing
    return false;
  },

  onDrop(source, target) {
    if (!this.isPracticeMode) return 'snapback';

    const move = this.game.move({
      from: source,
      to: target,
      promotion: 'q'
    });

    if (move === null) return 'snapback';

    this.checkPracticeMove(move);
  },

  onSnapEnd() {
    this.board.position(this.game.fen());
  },

  startPracticeMode(targetMoveData) {
    if (!targetMoveData) return;

    this.isPracticeMode = true;
    this.practiceTargetMove = targetMoveData;

    // Reset game to position before blunder/mistake
    this.game.load(targetMoveData.fen_before);
    this.board.position(this.game.fen(), true);

    $("#practice-overlay").removeClass("hidden");
    $("#practice-feedback").addClass("hidden").removeClass("bg-green-600 bg-red-600");
  },

  cancelPracticeMode() {
    this.isPracticeMode = false;
    this.practiceTargetMove = null;
    $("#practice-overlay").addClass("hidden");
    this.goToPly(this.currentPly);
  },

  checkPracticeMove(attemptedMove) {
    const feedbackEl = $("#practice-feedback");
    feedbackEl.removeClass("hidden bg-green-600 bg-red-600");

    const targetSan = this.practiceTargetMove.best_move;
    const targetUci = this.practiceTargetMove.best_move_uci;

    if (attemptedMove.san === targetSan || attemptedMove.from + attemptedMove.to === targetUci) {
      feedbackEl.addClass("bg-green-600 text-white").text(`🎉 Excellent! ${attemptedMove.san} is the best move!`);
      setTimeout(() => {
        this.cancelPracticeMode();
      }, 1800);
    } else {
      feedbackEl.addClass("bg-red-600 text-white").text(`❌ ${attemptedMove.san} is not the best move. Try again!`);
      setTimeout(() => {
        this.game.load(this.practiceTargetMove.fen_before);
        this.board.position(this.game.fen());
      }, 1200);
    }
  },

  bindControls() {
    $("#btn-first").click(() => this.goToPly(0));
    $("#btn-prev").click(() => this.goToPly(this.currentPly - 1));
    $("#btn-next").click(() => this.goToPly(this.currentPly + 1));
    $("#btn-last").click(() => this.goToPly(this.reviewData ? this.reviewData.moves.length : 0));

    $("#btn-flip").click(() => {
      this.board.flip();
    });

    $("#btn-play").click(() => {
      if (this.autoplayTimer) {
        clearInterval(this.autoplayTimer);
        this.autoplayTimer = null;
        $("#btn-play").html("▶ Play").removeClass("bg-amber-600").addClass("bg-chess-green");
      } else {
        $("#btn-play").html("⏸ Pause").removeClass("bg-chess-green").addClass("bg-amber-600");
        this.autoplayTimer = setInterval(() => {
          if (!this.reviewData || this.currentPly >= this.reviewData.moves.length) {
            clearInterval(this.autoplayTimer);
            this.autoplayTimer = null;
            $("#btn-play").html("▶ Play").removeClass("bg-amber-600").addClass("bg-chess-green");
            return;
          }
          this.goToPly(this.currentPly + 1);
        }, 1200);
      }
    });

    $("#btn-cancel-practice").click(() => this.cancelPracticeMode());
  },

  bindKeyboardShortcuts() {
    $(document).keydown((e) => {
      // Don't intercept when user typing in text inputs or textareas
      if ($(e.target).is("input, textarea, select")) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          this.goToPly(this.currentPly - 1);
          break;
        case "ArrowRight":
          e.preventDefault();
          this.goToPly(this.currentPly + 1);
          break;
        case "Home":
          e.preventDefault();
          this.goToPly(0);
          break;
        case "End":
          e.preventDefault();
          this.goToPly(this.reviewData ? this.reviewData.moves.length : 0);
          break;
        case " ":
          e.preventDefault();
          $("#btn-play").click();
          break;
        case "f":
        case "F":
          e.preventDefault();
          this.board.flip();
          break;
      }
    });
  }
};

window.BoardManager = BoardManager;
