from fastapi import APIRouter

from .strategies       import router as strategies_router
from .backtests        import router as backtests_router
from .paper.router     import router as paper_router
from .scrip            import router as scrip_router
from .stream           import router as stream_router
from .options          import router as options_router
from .strategy_basket  import router as strategy_basket_router
from .tokens           import router as tokens_router

v1_router = APIRouter()
v1_router.include_router(strategies_router)
v1_router.include_router(backtests_router)
v1_router.include_router(paper_router)
v1_router.include_router(scrip_router)
v1_router.include_router(stream_router)
v1_router.include_router(options_router)
v1_router.include_router(strategy_basket_router)
v1_router.include_router(tokens_router)
