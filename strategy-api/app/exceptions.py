from fastapi import Request
from fastapi.responses import ORJSONResponse
from fastapi.exceptions import RequestValidationError


class AppError(Exception):
    def __init__(
        self,
        message: str,
        status_code: int = 400,
        code: str = "BAD_REQUEST",
        details: dict | None = None,
    ):
        super().__init__(message)
        self.message     = message
        self.status_code = status_code
        self.code        = code
        self.details     = details


class NotFoundError(AppError):
    def __init__(self, resource: str = "Resource"):
        super().__init__(f"{resource} not found", 404, "NOT_FOUND")


class ForbiddenError(AppError):
    def __init__(self, message: str = "Access denied"):
        super().__init__(message, 403, "FORBIDDEN")


class UnauthorizedError(AppError):
    def __init__(self, message: str = "Authentication required"):
        super().__init__(message, 401, "UNAUTHORIZED")


class ValidationError(AppError):
    def __init__(self, message: str, details: dict | None = None):
        super().__init__(message, 422, "VALIDATION_ERROR", details)


# ── FastAPI exception handlers ────────────────────────────────────────────────

async def app_error_handler(request: Request, exc: AppError) -> ORJSONResponse:
    body = {"error": exc.message, "code": exc.code}
    if exc.details:
        body["details"] = exc.details
    return ORJSONResponse(status_code=exc.status_code, content=body)


async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> ORJSONResponse:
    details: dict[str, list[str]] = {}
    for err in exc.errors():
        field = ".".join(str(loc) for loc in err["loc"] if loc != "body")
        details.setdefault(field, []).append(err["msg"])

    return ORJSONResponse(
        status_code=422,
        content={
            "error": "Request validation failed",
            "code":  "VALIDATION_ERROR",
            "details": details,
        },
    )
