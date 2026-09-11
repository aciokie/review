with open('frontend/js/board.js') as f:
    code = f.read()

new_ondrop = """  onDrop(source, target) {
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
  },"""

start_drop = code.find('  onDrop(source, target) {')
end_drop = code.find('  onSnapEnd() {')

if start_drop != -1 and end_drop != -1:
    code = code[:start_drop] + new_ondrop + '\n\n  ' + code[end_drop:]

with open('frontend/js/board.js', 'w') as f:
    f.write(code)

print("Updated board.js successfully")
