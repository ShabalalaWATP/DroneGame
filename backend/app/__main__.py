"""Run the game: uv run python -m app. Bound to this machine only: sign-in runs over plain http, with no TLS."""

import uvicorn

PORT = 8200

if __name__ == "__main__":
    print(f"Site Guard: open http://localhost:{PORT}")
    uvicorn.run("app.main:app", host="127.0.0.1", port=PORT)
