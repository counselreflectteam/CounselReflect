# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Install uv from the official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set environment variables
# DC: Prevent python from writing pyc files to disc
ENV PYTHONDONTWRITEBYTECODE=1
# BUFFER: Prevent python from buffering stdout and stderr
ENV PYTHONUNBUFFERED=1

# Set the working directory in the container
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    git-lfs \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install

# Copy the requirements file into the container at /app
COPY requirements.txt /app/

# Install any needed packages using uv
# Configure uv to use the system Python environment rather than creating a virtualenv
ENV UV_SYSTEM_PYTHON=1

# Note: This might install CUDA-enabled torch which is large. 
# If you only need CPU, you could uncomment the following line before installing requirements:
# RUN uv pip install torch --index-url https://download.pytorch.org/whl/cpu
RUN uv pip install --no-cache -r requirements.txt
RUN python -m nltk.downloader punkt punkt_tab

# Copy the current directory contents into the container at /app
COPY . /app/

# Make port 8000 available to the world outside this container
EXPOSE 8000

# Run prefetch to download heavy models/dbs, then run main.py when the container launches
CMD ["sh", "-c", "python prefetch_models.py && exec uvicorn main:app --host 0.0.0.0 --port 8000"]
