# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend + built frontend
FROM python:3.11-slim
WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

# Python deps
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Backend source
COPY backend/ ./

# Copy built React app into backend/static/
COPY --from=frontend-builder /app/dist ./static

EXPOSE 8000
ENV ENVIRONMENT=production

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
