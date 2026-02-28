"""
FastAPI backend for Therapist Tool Chrome Extension.

Simple API with health check endpoint and evaluator listing.
"""
from os.path import join, dirname
from dotenv import load_dotenv
import os

dotenv_path = join(dirname(__file__), '.env')
load_dotenv(dotenv_path)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

# Import routers
from evaluators.routes import router as evaluators_router
from customizePipeline.routes import router as customize_router
from literature.routes import router as literature_router
from models.routes import router as models_router
from summary.routes import router as summary_router

# Import response models
from schemas import HealthResponse

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Disable verbose HTTP logs from httpx and openai
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("openai").setLevel(logging.WARNING)

# Create FastAPI app
app = FastAPI(
    title="Therapist Tool API",
    description="API for evaluating therapist-patient conversations",
    version="0.1.0"
)

# CORS middleware (allow Chrome extension to call API)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(evaluators_router, prefix="/predefined_metrics")
app.include_router(customize_router, prefix="/customize_pipeline")
app.include_router(literature_router, prefix="/literature")
app.include_router(models_router, prefix="/models")
app.include_router(summary_router, prefix="/summary")
@app.get("/", response_model=HealthResponse)
def root():
    """Root endpoint."""
    return {
        "status": "healthy",
        "version": "0.1.0"
    }


if __name__ == "__main__":
    import uvicorn
    
    # Use string reference to delay imports and avoid nest_asyncio conflicts
    # Note: reload disabled due to nest_asyncio compatibility issues
    # uvicorn.run("main:app", host="127.0.0.1", port=8000)
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
