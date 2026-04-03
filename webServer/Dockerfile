FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
# --reload allows live code updates
CMD ["uvicorn", "webServer.main:app", "--host", "0.0.0.0", "--reload"]