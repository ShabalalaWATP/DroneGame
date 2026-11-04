"""HTTP only, for real-world map packs. The pack files themselves are served as they are, and checked in the browser."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from pydantic import Field

from app.schemas import Strict
from app.services.packs import BuildBusy, PackBuilder, PackLibrary

router = APIRouter(prefix="/api/v1/packs")


class BuildRequest(Strict):
    east: Annotated[int, Field(ge=0, lt=700_000)]
    north: Annotated[int, Field(ge=0, lt=1_300_000)]
    lidar: bool


def library(request: Request) -> PackLibrary:
    return request.app.state.packs


def builder(request: Request) -> PackBuilder:
    return request.app.state.pack_builder


Library = Annotated[PackLibrary, Depends(library)]
Builder = Annotated[PackBuilder, Depends(builder)]


@router.get("")
def list_packs(packs: Library) -> list[dict[str, Any]]:
    return packs.list()


@router.get("/build")
def build_status(jobs: Builder) -> dict[str, Any]:
    return jobs.status()


@router.post("/build", status_code=status.HTTP_202_ACCEPTED)
def build_pack(body: BuildRequest, jobs: Builder) -> dict[str, Any]:
    try:
        return jobs.start(body.east, body.north, body.lidar)
    except BuildBusy:
        raise HTTPException(status.HTTP_409_CONFLICT, "A map is already being built.") from None


@router.get("/{name}")
def get_pack(name: str, packs: Library) -> FileResponse:
    path = packs.path_of(name)
    if not path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return FileResponse(path, media_type="application/octet-stream")
