FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
# Orchestrator process that consumes RQ jobs and launches sandboxed executors.
CMD ["python", "worker/orchestrator.py"]