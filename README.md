# Chess.com-Style Game Review Platform

A production-quality Chess.com-style Game Review web application utilizing a **decoupled, high-performance architecture**:

- **Render Web App (Frontend + Application Layer)**: Serves the web interface and API routing layer permanently on Render from GitHub (`chess-game-review-gui`).
- **Google Colab Stockfish 19 GPU/NNUE Engine**: High-compute server running official Stockfish 19 Dev/Master compiled natively on GPU runtime with NNUE neural net acceleration (**Depth 30+**).
- **Cloudflare Tunnel**: Exposes the Colab FastAPI Stockfish engine via a secure public HTTPS endpoint configurable directly in the web app UI.

---

## 🏗️ Architecture Diagram

```text
USER
  │
  ▼
RENDER DEPLOYED WEB APP (GitHub Repo)
  │ (Static Frontend + Fallback WASM Stockfish Engine)
  │
  │ HTTPS API Calls (/api/health, /api/evaluate, /api/review)
  ▼
CLOUDFLARE TUNNEL (https://xxxxx.trycloudflare.com)
  │
  ▼
GOOGLE COLAB STOCKFISH 19 GPU SERVER
  │
  ├── FastAPI / Uvicorn Server (Port 8000)
  └── Stockfish 19 Dev/Master Engine Process (Depth 30+ Multithreaded UCI + NNUE)
```

---

## 🚀 Features

- **Chess.com-Style Game Review Interface**: Clean dark-mode UI with Chessboard.js, Tailwind CSS, Lucide icons, and Chart.js evaluation graph.
- **On-Board Classification Badge Icons**: Floating badges (`!!`, `!`, `★`, `✓`, `!?`, `?`, `Miss`, `??`, `📖`) rendered on target board squares.
- **SVG Directional Move Arrows**: Green best-move and orange blunder/mistake directional arrows rendered over the chessboard.
- **Chess Coach Persona Commentary**: Conversational coach feedback box explaining key tactical concepts and material changes.
- **Depth 30+ Deep Analysis with Live Progressive Ticker**: Stockfish 19 runs deep depth 30+ searches with real-time depth counter feedback.
- **Stockfish WASM Web Worker Fallback**: Automatic local browser engine fallback if Colab is offline or local engine is selected.
- **CAPS-Style Accuracy Scoring**: Calculates move-by-move evaluation loss using `103.16 * e^(-0.0435 * loss) - 3.16`.
- **Performance Elo Estimation**: Deterministic rating performance calculation per player based on accuracy and error distribution.
- **Interactive Evaluation Bar**: Dynamic win probability % bar normalized from White's perspective using `WinChance = 100 / (1 + 10^(-cp / 400))`.
- **Retry Move Practice Mode**: Replay blunders or mistakes interactively without exposing engine solutions.

---

## 📦 Directory Structure

```text
chess-game-review/
├── frontend/
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── app.js
│   │   ├── board.js
│   │   ├── review.js
│   │   ├── api.js
│   │   ├── settings.js
│   │   └── stockfish-wasm.js
│   └── assets/
├── backend/
│   ├── app.py
│   ├── engine.py
│   └── reviewer.py
├── colab/
│   └── stockfish_server.ipynb
├── tests/
│   ├── test_app.py
│   ├── test_engine.py
│   ├── test_reviewer.py
│   └── test_integration.py
├── requirements.txt
├── render.yaml
├── README.md
└── .gitignore
```

---

## 🛠️ Deployment & Setup Guide

### 1. GitHub Setup
1. Clone this repository or fork it to your GitHub account:
   ```bash
   git clone https://github.com/your-username/chess-game-review.git
   cd chess-game-review
   ```

### 2. Render Web App Deployment
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository.
4. Render will automatically detect `render.yaml` configuration:
   - **Environment**: Python 3.11+
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn backend.app:app --host 0.0.0.0 --port $PORT`
5. Deploy service. Once deployed, Render will provide a permanent HTTPS URL (e.g. `https://chess-game-review-gui.onrender.com`).
   > **Note on Initial Deploy**: Ensure the pull request containing `requirements.txt` and `backend/app.py` is merged into your default branch (`main`) so Render's automated build finds `requirements.txt`.

### 3. Google Colab Stockfish GPU Server Setup
1. Open Google Colab and upload `colab/stockfish_server.ipynb`.
2. Run the 5 steps in order:
   - **STEP 1**: Install dependencies (`python-chess`, `fastapi`, `uvicorn`, `cloudflared`).
   - **STEP 2**: Detect CUDA GPU hardware capabilities & compile official Stockfish 19 Dev/Master with NNUE.
   - **STEP 3**: Start local FastAPI server on port 8000.
   - **STEP 4**: Launch Cloudflare Tunnel and copy the generated HTTPS URL:
     ```text
     ==================================================
     🏆 STOCKFISH 19 GPU (DEPTH 30+) SERVER IS LIVE!
     ==================================================
     Public URL: https://xxxxx.trycloudflare.com
     ==================================================
     ```
   - **STEP 5**: Run keep-alive polling cell to prevent idle disconnects.

### 4. Linking Render App to Colab Engine
1. Open your Render Web App in browser.
2. Click **Settings** in the top header.
3. Paste your Cloudflare Tunnel URL (`https://xxxxx.trycloudflare.com`) into **Google Colab Server Public URL**.
4. Click **Test Connection** -> **Save Settings**.
5. The status badge will change to `● Google Colab Stockfish 19 Connected`.

---

## 🔌 API Documentation

### `GET /api/health`
Checks engine status and connectivity.
- **Response**:
  ```json
  {
    "status": "ok",
    "engine_connected": true,
    "engine": "Stockfish 19 (Dev/Master (NNUE GPU Accelerated))",
    "threads": 4,
    "hash_mb": 512,
    "min_depth": 30
  }
  ```

### `GET /api/engine`
Returns detailed engine build metadata.

### `POST /api/evaluate`
Evaluates a single FEN position at minimum 30+ depth.

### `POST /api/review`
Performs complete game review from a PGN string at depth 30+.

---

## 🛠️ Local Development & Testing

Run unit & integration tests:
```bash
pip install -r requirements.txt
PYTHONPATH=. pytest tests/
```

Start application locally:
```bash
uvicorn backend.app:app --reload --port 8000
```
Open `http://127.0.0.1:8000` in browser.

---

## ❓ Troubleshooting

- **Render Build Error "Could not open requirements file"**: Render tried to build an older commit on `main` before `requirements.txt` was merged into `main`. Merging the branch into `main` resolves this automatically.
- **Colab Engine Disconnected**: Verify Colab notebook Step 4 URL is active and re-paste the Cloudflare Tunnel URL into Settings.
- **Colab Disconnects After Hours**: Google Colab runtimes are temporary (12-24 hours max). Simply restart the notebook and update the Cloudflare URL in settings.

---

## 📄 License
MIT License. Built for chess analysis and education.
