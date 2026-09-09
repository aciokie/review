/**
 * Main Application Orchestrator
 */
$(document).ready(function() {

  // Sample Games
  const SAMPLE_GAMES = {
    kasparov: `[Event "Hoogovens Group A"]
[Site "Wijk aan Zee NED"]
[Date "1999.01.20"]
[Round "4"]
[White "Garry Kasparov"]
[Black "Veselin Topalov"]
[Result "1-0"]
[ECO "B07"]

1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7 8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O 14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5 20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4 cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 Qxd5 29. Ra7 Bb7 30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ Kxc3 34. Qa1+ Kd2 35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 Rd3 40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7 1-0`,

    opera: `[Event "Paris Opera House"]
[Site "Paris FRA"]
[Date "1858.11.02"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]
[ECO "C41"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`
  };

  // Initialize App Modules
  Settings.load();
  API.init();
  BoardManager.init();
  ReviewUI.init();

  // Populate PGN with default sample
  $("#pgn-input").val(SAMPLE_GAMES.kasparov);

  // Engine Selector Dropdown in Header
  $("#engine-selector").val(API.activeProvider).change(function() {
    const val = $(this).val();
    Settings.save({ engineProvider: val });
    API.activeProvider = val;
    API.checkHealth();
  });

  // Settings Modal Controls
  $("#btn-open-settings").click(() => {
    const s = Settings.load();
    $("#modal-engine-provider").val(s.engineProvider);
    $("#modal-colab-url").val(s.colabUrl || "");
    $("#modal-depth").val(s.depth);
    $("#modal-threads").val(s.threads);
    $("#modal-hash").val(s.hashMb);
    $("#modal-multipv").val(s.multiPv);

    $("#test-connection-status").addClass("hidden");
    $("#settings-modal").removeClass("hidden");
  });

  $("#btn-close-settings").click(() => {
    $("#settings-modal").addClass("hidden");
  });

  $("#btn-save-settings").click(() => {
    const updated = {
      engineProvider: $("#modal-engine-provider").val(),
      colabUrl: $("#modal-colab-url").val().trim(),
      depth: parseInt($("#modal-depth").val()) || 20,
      threads: parseInt($("#modal-threads").val()) || 4,
      hashMb: parseInt($("#modal-hash").val()) || 512,
      multiPv: parseInt($("#modal-multipv").val()) || 1
    };

    Settings.save(updated);
    API.activeProvider = updated.engineProvider;
    API.colabUrl = updated.colabUrl;
    $("#engine-selector").val(updated.engineProvider);

    API.checkHealth();
    $("#settings-modal").addClass("hidden");
  });

  $("#btn-reset-settings").click(() => {
    const defs = Settings.reset();
    $("#modal-engine-provider").val(defs.engineProvider);
    $("#modal-colab-url").val(defs.colabUrl);
    $("#modal-depth").val(defs.depth);
    $("#modal-threads").val(defs.threads);
    $("#modal-hash").val(defs.hashMb);
    $("#modal-multipv").val(defs.multiPv);
  });

  $("#btn-test-connection").click(async () => {
    const provider = $("#modal-engine-provider").val();
    const url = $("#modal-colab-url").val().trim().replace(/\/+$/, "");
    const statusBox = $("#test-connection-status");

    statusBox.removeClass("hidden bg-green-900/60 text-green-300 bg-red-900/60 text-red-300 bg-blue-900/60 text-blue-300");

    if (provider === "local") {
      statusBox.addClass("bg-blue-900/60 text-blue-300").text("✓ Local Browser Engine is ready.");
      return;
    }

    if (!url) {
      statusBox.addClass("bg-red-900/60 text-red-300").text("❌ Please enter a valid Cloudflare Tunnel URL.");
      return;
    }

    statusBox.addClass("bg-yellow-900/60 text-yellow-300").text("Testing connection to Colab server...");

    try {
      const res = await fetch(`${url}/api/health`, { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        statusBox.removeClass("bg-yellow-900/60 text-yellow-300")
                 .addClass("bg-green-900/60 text-green-300")
                 .text(`✓ Connected! Server reported: ${data.engine || 'Stockfish 19'}`);
      } else {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
    } catch (err) {
      statusBox.removeClass("bg-yellow-900/60 text-yellow-300")
               .addClass("bg-red-900/60 text-red-300")
               .text(`❌ Connection failed: ${err.message}`);
    }
  });

  // Sample Buttons
  $("#btn-sample-1").click(() => $("#pgn-input").val(SAMPLE_GAMES.kasparov));
  $("#btn-sample-2").click(() => $("#pgn-input").val(SAMPLE_GAMES.opera));

  // PGN File Upload
  $("#pgn-file-input").change(function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
      $("#pgn-input").val(evt.target.result);
    };
    reader.readAsText(file);
  });

  // Start Game Review
  $("#btn-start-review").click(async function() {
    const pgn = $("#pgn-input").val().trim();
    if (!pgn) {
      alert("Please enter or paste a PGN game to review.");
      return;
    }

    const btn = $(this);
    const origText = btn.html();
    btn.prop("disabled", true).html(`<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Analyzing Game...`);
    if (window.lucide) lucide.createIcons();

    try {
      const reviewResult = await API.reviewGame(pgn);
      ReviewUI.renderReview(reviewResult);
    } catch (err) {
      alert(`Game Review Error: ${err.message}`);
    } finally {
      btn.prop("disabled", false).html(origText);
      if (window.lucide) lucide.createIcons();
    }
  });

});
