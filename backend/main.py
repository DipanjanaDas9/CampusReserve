
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.catalog import seed_default_catalog
from app.db.database import initialize_database
from app.routers.auth import router as auth_router
from app.routers.facilities import router as facilities_router
from app.routers.reservations import router as reservations_router
from app.routers.admin import router as admin_router
from app.routers.availability import router as availability_router
from app.routers.notifications import router as notifications_router
from app.routers.ai import router as ai_router

app = FastAPI(title="Campus Reservation API")

# Allow the React frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the configured database and make bundled rooms available.
initialize_database()
seed_default_catalog()

# Register API routers
app.include_router(auth_router)
app.include_router(facilities_router)
app.include_router(reservations_router)
app.include_router(admin_router)
app.include_router(availability_router)
app.include_router(notifications_router)
app.include_router(ai_router)

@app.get("/")
def home():
    return {"message": "Campus Reservation API is running!"}


@app.get("/health")
def health():
    return {"status": "healthy"}
