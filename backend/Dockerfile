FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /backend

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./

ENV HOST=0.0.0.0 \
    PORT=8888

EXPOSE 8888

CMD ["python", "run.py", "--host", "0.0.0.0", "--port", "8888", "--no-browser", "--allow-root"]