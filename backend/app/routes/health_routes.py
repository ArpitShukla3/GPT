from fastapi import APIRouter

from app.controllers.health_controller import health_check

router = APIRouter(tags=["Health"])


@router.get("/health")
def read_health():
    return health_check()
