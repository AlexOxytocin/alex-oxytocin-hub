from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict
from starlette.middleware.trustedhost import TrustedHostMiddleware


class RootStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str


class HealthStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str


app = FastAPI(
    title="God Mode Tools API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=[
        "godmodetools.com",
        "www.godmodetools.com",
        "backend",
        "localhost",
        "127.0.0.1",
    ],
)


@app.get("/", response_model=RootStatus)
async def root() -> RootStatus:
    """Return the public API status without echoing runtime configuration."""
    return RootStatus(message="API is running")


@app.get("/health", response_model=HealthStatus)
async def health() -> HealthStatus:
    """Return the deliberately minimal health contract used by Nginx smoke tests."""
    return HealthStatus(status="healthy")
