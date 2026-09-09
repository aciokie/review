import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend.engine import global_engine_manager

client = TestClient(app)

def test_api_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    json_data = response.json()
    assert "status" in json_data
    assert "engine_connected" in json_data
    assert "engine" in json_data

def test_api_engine():
    response = client.get("/api/engine")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["engine"] == "Stockfish"
    assert json_data["version"] == "19"

def test_api_review_empty_pgn():
    response = client.post("/api/review", json={"pgn": ""})
    assert response.status_code == 400
    assert "PGN string cannot be empty" in response.json()["error"]

def test_api_evaluate_invalid_fen():
    response = client.post("/api/evaluate", json={"fen": "invalid fen"})
    # Since engine is not installed locally, expect 503 or 400
    assert response.status_code in [400, 503]

if __name__ == "__main__":
    pytest.main([__file__])
