"""
Standard API envelope — every response from this service uses these wrappers.
Matches the ApiEnvelope<T> / PaginationMeta types in api.client.ts exactly.
"""

from typing import Generic, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class PaginationMeta(BaseModel):
    page:        int
    page_size:   int  = 20
    total:       int
    total_pages: int

    model_config = {"populate_by_name": True}


class ApiResponse(BaseModel, Generic[T]):
    data:    T
    meta:    PaginationMeta | None = None
    message: str | None = None

    # Serialise as camelCase to match the TypeScript frontend
    model_config = {
        "populate_by_name": True,
        "alias_generator": None,   # we set aliases per field where needed
    }


def paginate(
    total: int,
    page: int,
    page_size: int,
) -> PaginationMeta:
    total_pages = max(1, (total + page_size - 1) // page_size)
    return PaginationMeta(
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages,
    )
