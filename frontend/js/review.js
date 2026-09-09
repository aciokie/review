/**
 * Review UI Renderer & Coach Feedback Manager
 */
const ReviewUI = {
  chart: null,
  reviewData: null,
  activeFilter: "all",

  init() {
    this.bindTabEvents();
    this.bindFilterEvents();
  },

  renderReview(data) {
    this.reviewData = data;
    this.renderAccuracySummary(data);
    this.renderChart(data);
    this.renderMoveTable(data);

    if (data.moves && data.moves.length > 0) {
      BoardManager.setReviewData(data);
      this.onPlyChanged(0);
    }
  },

  renderAccuracySummary(data) {
    const acc = data.accuracy || {};
    const whiteAcc = acc.white || {};
    const blackAcc = acc.black || {};
    const meta = data.metadata || {};

    $("#white-summary-name").text(meta.white || "White");
    $("#black-summary-name").text(meta.black || "Black");

    $("#white-summary-acc").text(`${whiteAcc.overall || 0}%`);
    $("#black-summary-acc").text(`${blackAcc.overall || 0}%`);

    $("#bottom-player-name").text(meta.white || "White");
    $("#top-player-name").text(meta.black || "Black");

    $("#bottom-player-accuracy").text(`${whiteAcc.overall || 0}%`);
    $("#top-player-accuracy").text(`${blackAcc.overall || 0}%`);

    $("#white-summary-elo").text(whiteAcc.estimated_elo || "1500");
    $("#black-summary-elo").text(blackAcc.estimated_elo || "1500");

    const wPhases = whiteAcc.phases || {};
    const bPhases = blackAcc.phases || {};

    const openW = wPhases.Opening || 100;
    const openB = bPhases.Opening || 100;
    $("#phase-opening-val").text(`${openW}% vs ${openB}%`);
    $("#phase-opening-bar-w").css("width", `${openW}%`);
    $("#phase-opening-bar-b").css("width", `${openB}%`);

    const midW = wPhases.Middlegame || 100;
    const midB = bPhases.Middlegame || 100;
    $("#phase-middle-val").text(`${midW}% vs ${midB}%`);
    $("#phase-middle-bar-w").css("width", `${midW}%`);
    $("#phase-middle-bar-b").css("width", `${midB}%`);

    const endW = wPhases.Endgame || 100;
    const endB = bPhases.Endgame || 100;
    $("#phase-end-val").text(`${endW}% vs ${endB}%`);
    $("#phase-end-bar-w").css("width", `${endW}%`);
    $("#phase-end-bar-b").css("width", `${endB}%`);

    const op = meta.opening || {};
    $("#opening-eco").text(op.eco || "ECO");
    $("#opening-name").text(`${op.opening || "Custom Game"} ${op.variation || ""}`);
  },

  onPlyChanged(ply) {
    if (!this.reviewData || !this.reviewData.moves) return;

    if (ply === 0) {
      $("#move-badge").text("START").css("background-color", "#4b5563");
      $("#move-number-title").text("Game Starting Position");
      $("#move-details-content").html(`
        <div class="flex items-start gap-3 bg-[#1e1c18] p-3 rounded-lg border border-gray-800">
          <div class="coach-avatar text-amber-300">
            <i data-lucide="bot" class="w-5 h-5"></i>
          </div>
          <div>
            <span class="font-bold text-gray-200 text-xs block mb-0.5">Chess Coach Danny</span>
            <p class="text-gray-300 text-xs">Game starting position. Review player performance or click Play to analyze move by move!</p>
          </div>
        </div>
      `);
      if (window.lucide) lucide.createIcons();
      $("#btn-retry-move").addClass("hidden");
      BoardManager.updateEvalBar(this.reviewData.initial_eval);
      return;
    }

    const moveData = this.reviewData.moves[ply - 1];
    if (!moveData) return;

    BoardManager.updateEvalBar({
      white_win_chance: moveData.white_win_chance,
      black_win_chance: moveData.black_win_chance,
      evaluation_cp: moveData.evaluation_cp,
      mate: moveData.mate
    });

    const badge = $("#move-badge");
    badge.text(`${moveData.symbol} ${moveData.classification}`)
         .css("background-color", moveData.color_code || "#4b5563");

    $("#move-number-title").text(`Move ${moveData.move_number}. ${moveData.color === 'white' ? '' : '...'}${moveData.played_move}`);

    const isBlunderOrMistake = ["BLUNDER", "MISTAKE", "MISS", "INACCURACY"].includes(moveData.classification_key);

    // Coach persona explanation box
    let coachTitle = "Chess Coach Danny";
    let html = `
      <div class="flex flex-col gap-2">
        <div class="flex items-start gap-3 bg-[#1e1c18] p-3 rounded-lg border border-gray-800">
          <div class="coach-avatar text-amber-300 shrink-0">
            <i data-lucide="bot" class="w-5 h-5"></i>
          </div>
          <div class="flex-1">
            <div class="flex items-center justify-between mb-1">
              <span class="font-bold text-gray-200 text-xs">${coachTitle}</span>
              <span class="text-[10px] font-semibold text-gray-400 font-mono">${moveData.color === 'white' ? 'White' : 'Black'} played</span>
            </div>
            <p class="text-gray-200 text-xs leading-relaxed">${moveData.explanation || ''}</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs">
          <div class="bg-[#1e1c18] p-2.5 rounded-lg border border-gray-800 flex flex-col">
            <span class="text-gray-400 text-[10px] uppercase font-semibold">Played Move</span>
            <span class="font-mono font-bold text-amber-300 text-sm mt-0.5">${moveData.played_move}</span>
          </div>
          <div class="bg-[#1e1c18] p-2.5 rounded-lg border border-gray-800 flex flex-col">
            <span class="text-gray-400 text-[10px] uppercase font-semibold">Stockfish Best</span>
            <span class="font-mono font-bold text-chess-green text-sm mt-0.5">${moveData.best_move || 'N/A'}</span>
          </div>
        </div>
    `;

    if (moveData.engine_pv && moveData.engine_pv.length > 0) {
      html += `
        <div class="text-[11px] bg-[#1a1816] p-2.5 rounded-lg border border-gray-800">
          <span class="text-gray-400 font-semibold block mb-1 flex items-center gap-1">
            <i data-lucide="cpu" class="w-3.5 h-3.5 text-chess-green"></i>
            Stockfish 19 Continuation (PV)
          </span>
          <span class="font-mono text-gray-200">${moveData.engine_pv.join(" ")}</span>
        </div>
      `;
    }

    html += `</div>`;
    $("#move-details-content").html(html);
    if (window.lucide) lucide.createIcons();

    if (isBlunderOrMistake) {
      $("#btn-retry-move").removeClass("hidden").off("click").on("click", () => {
        BoardManager.startPracticeMode(moveData);
      });
    } else {
      $("#btn-retry-move").addClass("hidden");
    }

    $("#moves-table-body tr").removeClass("bg-chess-green/20 font-bold");
    $(`#move-row-${ply}`).addClass("bg-chess-green/20 font-bold");

    if (this.chart) {
      this.chart.setActiveElements([{ datasetIndex: 0, index: ply }]);
      this.chart.update();
    }
  },

  renderChart(data) {
    const ctx = document.getElementById('evalChart').getContext('2d');
    if (this.chart) {
      this.chart.destroy();
    }

    const labels = ["0"];
    const winData = [data.initial_eval ? data.initial_eval.white_win_chance : 50.0];
    const pointColors = ['#81b64c'];

    (data.moves || []).forEach(m => {
      labels.push(`${m.move_number}${m.color === 'white' ? 'W' : 'B'}`);
      winData.push(m.white_win_chance);
      pointColors.push(m.color_code || '#81b64c');
    });

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'White Win Chance %',
          data: winData,
          borderColor: '#81b64c',
          backgroundColor: 'rgba(129, 182, 76, 0.15)',
          fill: true,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: pointColors,
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `White Win Chance: ${ctx.raw}%`
            }
          }
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            grid: { color: '#312e2b' },
            ticks: { color: '#9ca3af', callback: v => `${v}%` }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#9ca3af', maxTicksLimit: 15 }
          }
        },
        onClick: (e, activeEls) => {
          if (activeEls.length > 0) {
            const index = activeEls[0].index;
            BoardManager.goToPly(index);
          }
        }
      }
    });
  },

  renderMoveTable(data) {
    const tbody = $("#moves-table-body");
    tbody.empty();

    if (!data.moves || data.moves.length === 0) {
      tbody.html(`<tr><td colspan="5" class="p-3 text-center text-gray-500">No review loaded yet.</td></tr>`);
      return;
    }

    data.moves.forEach((m, idx) => {
      const ply = idx + 1;
      const isMistake = ["BLUNDER", "MISTAKE", "MISS", "INACCURACY"].includes(m.classification_key);
      const isKey = (data.key_moments || []).some(k => k.move_index === idx);

      let rowClass = "hover:bg-gray-800/60 cursor-pointer transition";
      if (this.activeFilter === "key" && !isKey) return;
      if (this.activeFilter === "mistakes" && !isMistake) return;

      const rowHtml = `
        <tr id="move-row-${ply}" class="${rowClass}" onclick="BoardManager.goToPly(${ply})">
          <td class="p-2 font-mono text-gray-400">${m.move_number}${m.color === 'white' ? '.' : '...'}</td>
          <td class="p-2 font-semibold text-gray-200">${m.played_move}</td>
          <td class="p-2">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style="background-color: ${m.color_code}">
              ${m.symbol} ${m.classification}
            </span>
          </td>
          <td class="p-2 font-mono text-gray-300">${m.white_win_chance}%</td>
          <td class="p-2 font-mono text-chess-green">${m.best_move || '-'}</td>
        </tr>
      `;
      tbody.append(rowHtml);
    });
  },

  bindTabEvents() {
    $("#tab-btn-summary").click(function() {
      $(".border-chess-green").removeClass("border-chess-green text-chess-green font-bold").addClass("text-gray-400");
      $(this).addClass("border-chess-green text-chess-green font-bold").removeClass("text-gray-400");
      $("#tab-content-summary").removeClass("hidden");
      $("#tab-content-graph, #tab-content-moves").addClass("hidden");
    });

    $("#tab-btn-graph").click(() => {
      $(".border-chess-green").removeClass("border-chess-green text-chess-green font-bold").addClass("text-gray-400");
      $("#tab-btn-graph").addClass("border-chess-green text-chess-green font-bold").removeClass("text-gray-400");
      $("#tab-content-graph").removeClass("hidden");
      $("#tab-content-summary, #tab-content-moves").addClass("hidden");
      if (this.chart) this.chart.resize();
    });

    $("#tab-btn-moves").click(() => {
      $(".border-chess-green").removeClass("border-chess-green text-chess-green font-bold").addClass("text-gray-400");
      $("#tab-btn-moves").addClass("border-chess-green text-chess-green font-bold").removeClass("text-gray-400");
      $("#tab-content-moves").removeClass("hidden");
      $("#tab-content-summary, #tab-content-graph").addClass("hidden");
    });
  },

  bindFilterEvents() {
    $("#filter-all").click(() => {
      this.activeFilter = "all";
      $("#filter-all").addClass("bg-chess-green text-white").removeClass("bg-gray-800 text-gray-300");
      $("#filter-key, #filter-mistakes").addClass("bg-gray-800 text-gray-300").removeClass("bg-chess-green text-white");
      if (this.reviewData) this.renderMoveTable(this.reviewData);
    });

    $("#filter-key").click(() => {
      this.activeFilter = "key";
      $("#filter-key").addClass("bg-chess-green text-white").removeClass("bg-gray-800 text-gray-300");
      $("#filter-all, #filter-mistakes").addClass("bg-gray-800 text-gray-300").removeClass("bg-chess-green text-white");
      if (this.reviewData) this.renderMoveTable(this.reviewData);
    });

    $("#filter-mistakes").click(() => {
      this.activeFilter = "mistakes";
      $("#filter-mistakes").addClass("bg-chess-green text-white").removeClass("bg-gray-800 text-gray-300");
      $("#filter-all, #filter-key").addClass("bg-gray-800 text-gray-300").removeClass("bg-chess-green text-white");
      if (this.reviewData) this.renderMoveTable(this.reviewData);
    });
  }
};

window.ReviewUI = ReviewUI;
