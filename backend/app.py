import os
import logging
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field

from backend.engine import global_engine_manager
from backend.reviewer import global_reviewer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("chess_app")

app = FastAPI(
    title="Chess.com-Style Game Review API",
    description="Stockfish 19 deep analysis engine server and review platform API",
    version="1.0.0"
)

# Enable CORS for Render frontend / Colab tunnel / local dev
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if "*" not in allowed_origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Input Schemas
class EvaluateRequest(BaseModel):
    fen: str = Field(..., description="Target board position in FEN format")
    depth: Optional[int] = Field(20, ge=1, le=30, description="Search depth (1-30)")
    threads: Optional[int] = Field(4, ge=1, le=16, description="CPU threads (1-16)")
    hash_mb: Optional[int] = Field(512, ge=16, le=4096, description="Hash memory in MB")
    multipv: Optional[int] = Field(1, ge=1, le=5, description="MultiPV principal variations (1-5)")


class ReviewRequest(BaseModel):
    pgn: str = Field(..., description="Full PGN string to review")
    depth: Optional[int] = Field(18, ge=1, le=30, description="Analysis depth per move")
    threads: Optional[int] = Field(4, ge=1, le=16, description="Engine threads")
    hash_mb: Optional[int] = Field(512, ge=16, le=4096, description="Engine Hash memory")


@app.get("/api/health")
def get_health():
    """
    Health check endpoint for frontend connection status detection.
    """
    engine_available = global_engine_manager.is_available()
    return {
        "status": "ok",
        "engine_connected": engine_available,
        "engine": f"Stockfish {global_engine_manager.info['version']} ({global_engine_manager.info['build']})",
        "threads": global_engine_manager.info.get("threads", 4),
        "hash_mb": global_engine_manager.info.get("hash_mb", 512)
    }


@app.get("/api/engine")
def get_engine_info():
    """
    Engine information endpoint.
    """
    return {
        "engine": global_engine_manager.info["engine"],
        "version": global_engine_manager.info["version"],
        "build": global_engine_manager.info["build"],
        "threads": global_engine_manager.info.get("threads", 4),
        "hash_mb": global_engine_manager.info.get("hash_mb", 512),
        "executable_found": global_engine_manager.info.get("executable_found", False),
        "path": global_engine_manager.executable_path or "Not configured"
    }


@app.post("/api/evaluate")
def evaluate_position(req: EvaluateRequest):
    """
    Evaluate single FEN position.
    """
    if len(req.fen.strip()) > 200:
        raise HTTPException(status_code=400, detail="FEN string is too long.")

    try:
        res = global_engine_manager.evaluate_position(
            fen=req.fen,
            depth=req.depth or 20,
            threads=req.threads or 4,
            hash_mb=req.hash_mb or 512,
            multipv=req.multipv or 1
        )
        return res
    except RuntimeError as e:
        logger.warning(f"Engine evaluation warning: {e}")
        raise HTTPException(status_code=503, detail="Engine unavailable or not installed. Please connect Google Colab engine.")
    except Exception as e:
        logger.error(f"Error evaluating FEN: {e}")
        raise HTTPException(status_code=400, detail="Invalid FEN string provided.")


@app.post("/api/review")
def review_game(req: ReviewRequest):
    """
    Perform deep analysis review of a game in PGN format.
    """
    if not req.pgn or len(req.pgn.strip()) == 0:
        raise HTTPException(status_code=400, detail="PGN string cannot be empty.")

    if len(req.pgn) > 100000:
        raise HTTPException(status_code=400, detail="PGN exceeds maximum allowed size (100KB).")

    try:
        result = global_reviewer.review_game(
            pgn_string=req.pgn,
            depth=req.depth or 18,
            threads=req.threads or 4,
            hash_mb=req.hash_mb or 512
        )
        return result
    except ValueError as ve:
        logger.warning(f"Invalid PGN input: {ve}")
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        logger.warning(f"Engine review error: {re}")
        raise HTTPException(status_code=503, detail="Engine unavailable or not installed. Please connect Google Colab engine.")
    except Exception as e:
        logger.error(f"Unhandled error during game review: {e}")
        raise HTTPException(status_code=500, detail="An error occurred while processing the game analysis.")


# Mount static assets / frontend app if directory exists
if os.path.exists("frontend"):
    app.mount("/static", StaticFiles(directory="frontend"), name="static")

    @app.get("/")
    def serve_frontend_index():
        index_path = os.path.join("frontend", "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"message": "Chess Game Review API is running. Frontend index.html not found."}


@app.exception_handler(HTTPException)
def custom_http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "status_code": exc.status_code}
    )
