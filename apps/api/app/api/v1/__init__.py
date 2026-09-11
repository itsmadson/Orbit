from fastapi import APIRouter

from app.api.v1 import (
    ai, assets, auth, crm, dashboard, finance, goals, hr, ideas, knowledge,
    letters, meetings, projects, rd, system, tasks, users, workflows,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(projects.router)
api_router.include_router(tasks.router)
api_router.include_router(ideas.router)
api_router.include_router(rd.router)
api_router.include_router(knowledge.router)
api_router.include_router(meetings.router)
api_router.include_router(letters.router)
api_router.include_router(workflows.router)
api_router.include_router(finance.router)
api_router.include_router(crm.router)
api_router.include_router(hr.router)
api_router.include_router(assets.router)
api_router.include_router(goals.router)
api_router.include_router(dashboard.router)
api_router.include_router(ai.router)
api_router.include_router(system.router)
