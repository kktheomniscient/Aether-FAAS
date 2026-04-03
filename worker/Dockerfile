FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
# Workers usually don't have a "reload" flag, so you may 
# need to restart this container manually if you change worker.py
CMD ["python", "worker/worker.py"]