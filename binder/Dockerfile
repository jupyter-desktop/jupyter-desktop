FROM jupyter/base-notebook:latest

# root ユーザーに切り替えて Node.js をインストール
USER root

# Node.js 20.x をインストール
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# jovyan ユーザーに戻す
USER ${NB_UID}

# JupyterLab インストール
RUN pip install --no-cache-dir jupyterlab

# Angular / JupyterLab extension をコピー
COPY --chown=${NB_UID}:${NB_GID} . /home/jovyan/app/
WORKDIR /home/jovyan/app/

# 必要なPythonパッケージをインストール
RUN pip install --no-cache-dir -r binder/requirements.txt

# postBuild スクリプトでビルドとインストールを実行
RUN chmod +x binder/postBuild && binder/postBuild