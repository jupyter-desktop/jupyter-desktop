FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /backend

# tkinterに必要なシステムライブラリをインストール
RUN apt-get update && apt-get install -y --no-install-recommends \
    tk \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./

# カーネルランチャースクリプトに実行権限を付与
RUN chmod +x /backend/.ipython/kernels/python3/start_kernel.sh

ENV HOST=0.0.0.0 \
    PORT=8888

EXPOSE 8888

CMD ["python", "run.py", "--host", "0.0.0.0", "--port", "8888", "--no-browser", "--allow-root"]