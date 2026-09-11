/**
 * Interactive Chess Board & Control Module with SVG Arrow & On-Board Classification Icons
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
    $(window).resize(() => {
      if (this.board) {
        this.board.resize();
        this.highlightCurrentMove();
      }
    });

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

    const totalMoves = this.reviewData.moves.length;
    this.currentPly = Math.max(0, Math.min(ply, totalMoves));

    if (this.currentPly === 0) {
      this.game.reset();
    } else {
      const moveData = this.reviewData.moves[this.currentPly - 1];
      if (moveData && moveData.fen_after) {
        this.game.load(moveData.fen_after);
      } else {
        // Fallback move replay
        this.game.reset();
        for (let i = 0; i < this.currentPly; i++) {
          const m = this.reviewData.moves[i];
          if (m && m.played_san) {
            this.game.move(m.played_san);
          } else if (m && m.played_uci) {
            this.game.move({
              from: m.played_uci.substring(0, 2),
              to: m.played_uci.substring(2, 4),
              promotion: m.played_uci.length > 4 ? m.played_uci[4] : 'q'
            });
          }
        }
      }
    }

    // Clear previous overlays synchronously
    this.clearArrowsAndBadges();

    // Update Chessboard UI position instantly
    this.board.position(this.game.fen(), false);

    // Highlight moves and draw arrows/badges synchronously in same frame
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

    $("#eval-bar-white").css("height", `${whiteWin}%`);
    $("#eval-bar-black").css("height", `${blackWin}%`);

    $("#eval-text-bottom").text(`${Math.round(whiteWin)}%`);
    $("#eval-text-top").text(`${Math.round(blackWin)}%`);

    let scoreStr = "0.0";
    if (mate !== null && mate !== undefined) {
      scoreStr = `M${Math.abs(mate)}`;
    } else if (cp !== null && cp !== undefined) {
      const val = (cp / 100.0).toFixed(1);
      scoreStr = val > 0 ? `+${val}` : `${val}`;
    }

    $("#eval-score-badge").text(scoreStr);
  },

  clearArrowsAndBadges() {
    const svg = document.getElementById("board-arrows-svg");
    if (svg) {
      $(svg).find("line, path").remove();
    }
    $("#my-board .board-classification-badge").remove();
  },

  getSquareCenterCoords(square) {
    const boardEl = $("#my-board");
    const squareEl = boardEl.find(`.square-${square}`);
    if (squareEl.length === 0) return null;

    const boardOffset = boardEl.offset();
    const sqOffset = squareEl.offset();
    const sqWidth = squareEl.width();
    const sqHeight = squareEl.height();

    const x = sqOffset.left - boardOffset.left + sqWidth / 2;
    const y = sqOffset.top - boardOffset.top + sqHeight / 2;

    return { x, y };
  },

  drawArrow(fromSquare, toSquare, color = "#81b64c", markerId = "arrow-best") {
    const fromCoords = this.getSquareCenterCoords(fromSquare);
    const toCoords = this.getSquareCenterCoords(toSquare);

    if (!fromCoords || !toCoords) return;

    const svg = document.getElementById("board-arrows-svg");
    if (!svg) return;

    const dx = toCoords.x - fromCoords.x;
    const dy = toCoords.y - fromCoords.y;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) return;

    const shorten = 18;
    const endX = fromCoords.x + (length - shorten) * Math.cos(angle);
    const endY = fromCoords.y + (length - shorten) * Math.sin(angle);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", fromCoords.x);
    line.setAttribute("y1", fromCoords.y);
    line.setAttribute("x2", endX);
    line.setAttribute("y2", endY);
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", "12");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("opacity", "0.85");
    line.setAttribute("marker-end", `url(#${markerId})`);

    svg.appendChild(line);
  },

  highlightCurrentMove() {
    $("#my-board .square-55d63").removeClass("highlight-last-move highlight-best-move highlight-played-move");
    this.clearArrowsAndBadges();

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
      const targetToSqEl = $(`#my-board .square-${toSq}`).addClass("highlight-played-move");

      // Attach On-Board Move Classification Badge Icon on target square
      const badgeHtml = `<div class="board-classification-badge" style="background-color: ${moveData.color_code}">${moveData.symbol}</div>`;
      targetToSqEl.css("position", "relative").append(badgeHtml);
    }

    // Highlight engine best move square if different
    if (moveData.best_move_uci && moveData.best_move_uci.length >= 4) {
      const bestFrom = moveData.best_move_uci.substring(0, 2);
      const bestTo = moveData.best_move_uci.substring(2, 4);
      $(`#my-board .square-${bestTo}`).addClass("highlight-best-move");

      // Draw Best Move Arrow (Green)
      this.drawArrow(bestFrom, bestTo, "#81b64c", "arrow-best");
    }

    // If played move was blunder/mistake, draw Played Move Arrow (Orange)
    if (moveData.played_uci && moveData.played_uci.length >= 4 && moveData.best_move_uci !== moveData.played_uci) {
      const playedFrom = moveData.played_uci.substring(0, 2);
      const playedTo = moveData.played_uci.substring(2, 4);
      if (["BLUNDER", "MISTAKE", "MISS", "INACCURACY"].includes(moveData.classification_key)) {
        this.drawArrow(playedFrom, playedTo, "#e68a00", "arrow-played");
      }
    }
  },

  onDragStart(source, piece, position, orientation) {
    if (this.game.game_over()) return false;

    // Do not pick up pieces of the wrong turn
    if ((this.game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (this.game.turn() === 'b' && piece.search(/^w/) !== -1)) {
      return false;
    }
    return true;
  },

  onDrop(source, target) {
    if (source === target) return 'snapback';

    // Attempt legal move on the current position
    const move = this.game.move({
      from: source,
      to: target,
      promotion: 'q'
    });

    if (move === null) return 'snapback';

    // Update board position
    this.board.position(this.game.fen());

    if (this.isPracticeMode) {
      this.checkPracticeMove(move);
      return;
    }

    // Interactive Try Move in Review Mode
    if (this.reviewData && this.reviewData.moves && this.reviewData.moves.length > 0) {
      const targetMoveData = this.currentPly > 0 ? this.reviewData.moves[this.currentPly - 1] : this.reviewData.moves[0];
      if (targetMoveData) {
        this.startPracticeMode(targetMoveData);
        this.checkPracticeMove(move);
        return;
      }
    }

    // Custom move feedback on empty/interactive board
    $("#selected-move-title").text("PLAYED " + move.san.toUpperCase()).css("color", "#81b64c");
    $("#move-explanation").text("Played move " + move.san + " on the board. Start engine review for deep analysis!");
  },

    onSnapEnd() {
    this.board.position(this.game.fen());
  },

  startPracticeMode(targetMoveData) {
    if (!targetMoveData) return;

    this.isPracticeMode = true;
    this.practiceTargetMove = targetMoveData;
    this.clearArrowsAndBadges();

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
      this.highlightCurrentMove();
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
          this.highlightCurrentMove();
          break;
      }
    });
  }
};

window.BoardManager = BoardManager;
