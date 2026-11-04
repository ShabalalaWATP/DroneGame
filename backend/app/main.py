"""The application: stores saved laydowns, run history and tuning. It takes no part in live play."""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.db.connection import open_database
from app.routes.api import router
from app.security import ALLOWED_HOSTS, RequestGuard, SecurityHeaders
from app.services.records import NotFound

DEFAULT_DB = Path(__file__).parent.parent / "data" / "siteguard.db"


def create_app(db_path: Path | None = None) -> FastAPI:
    path = db_path or Path(os.environ.get("SITE_GUARD_DB", DEFAULT_DB))

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        open_database(path)
        yield

    # Interactive docs are off because they load scripts from a CDN, and this works offline. The schema is at /api/v1/openapi.json.
    app = FastAPI(title="Site Guard", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url="/api/v1/openapi.json")
    app.state.db_path = path
    app.include_router(router)

    @app.exception_handler(NotFound)
    async def not_found(_: Request, __: NotFound) -> JSONResponse:
        return JSONResponse({"detail": "Not found"}, status_code=404)

    @app.exception_handler(RequestValidationError)
    async def invalid(_: Request, exc: RequestValidationError) -> JSONResponse:
        # says what is wrong and where, without echoing the input back
        return JSONResponse({"detail": [{"loc": e["loc"], "msg": e["msg"]} for e in exc.errors()]}, status_code=422)

    app.add_middleware(RequestGuard)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)  # stops DNS rebinding
    app.add_middleware(SecurityHeaders)  # outermost, so refusals get the headers too
    return app


app = create_app()
