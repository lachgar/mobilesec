FROM python:3.11-slim

LABEL maintainer="Security Platform ML Team"
LABEL description="ML Model Service for Security Scan Analysis"

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/

# Create necessary directories
RUN mkdir -p /app/data /app/logs /app/models

# Copy training data bootstrap script
COPY src/ ./src/

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:8001/health || exit 1

# Entrypoint: bootstrap dataset + train model at first start (if model not cached in volume),
# then launch the API. Training is done at runtime to avoid OOM crashes during Docker build.
CMD ["sh", "-c", "\
  if [ ! -f /app/models/lightgbm_model.txt ]; then \
    echo '[ml-model] Bootstrapping dataset...'; \
    python -m src.data.bootstrap_dataset --output data/security_scan_dataset.csv && \
    echo '[ml-model] Training model...'; \
    python -m src.model.trainer data/security_scan_dataset.csv; \
  else \
    echo '[ml-model] Model already trained, skipping.'; \
  fi && \
  uvicorn src.main:app --host 0.0.0.0 --port 8001 --log-level info"]
