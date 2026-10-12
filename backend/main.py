
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Campus Reservation API")

# Allow requests from the local React development server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"message": "Campus Reservation API is running!"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/facilities")
def get_facilities():
    return [
        {
            "id": 1,
            "name": "Study Room A",
            "capacity": 6,
            "equipment": ["Whiteboard", "Projector"],
        },
        {
            "id": 2,
            "name": "Computer Lab",
            "capacity": 25,
            "equipment": ["Computers", "Projector"],
        },
        {
            "id": 3,
            "name": "Practice Room",
            "capacity": 10,
            "equipment": ["Whiteboard"],
        },
    ]
