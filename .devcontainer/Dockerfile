FROM mcr.microsoft.com/devcontainers/base:ubuntu-22.04

# docker-compose.ymlから値が渡されなかった場合のフォールバック
ARG USER_UID=1000
ARG USER_GID=1000

# 非rootユーザーの作成
RUN groupadd -g ${USER_GID} user && \
    useradd -m -u ${USER_UID} -g ${USER_GID} -s /bin/bash user && \
    usermod -aG sudo user && \
    echo "user ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Node.js 22のインストール
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs

# 開発ツールのインストール
RUN apt-get update && apt-get install -y \
    gcc \
    python3 \
    python3-pip \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

USER user

# Claude Codeのネイティブインストール
RUN curl -fsSL https://claude.ai/install.sh | bash

# PATHの設定
ENV PATH="/home/user/.local/bin:$PATH"

WORKDIR /workspace
