# syntax=docker/dockerfile:1
#
# Unattended Claude Code runner for Hatcher. Built from the repo root:
#   docker compose build agent
# To bump Claude Code: install the new version on the host, check `claude --version`, set
# CLAUDE_CODE_VERSION below to match, and rebuild. Supercronic and uv bump the same way (for
# supercronic, take the sha256 of the new linux-amd64 binary from its GitHub release page).

FROM ghcr.io/astral-sh/uv:0.12.19 AS uv

FROM node:24-bookworm-slim

ARG CLAUDE_CODE_VERSION=2.1.284
ARG SUPERCRONIC_VERSION=v0.2.49
ARG SUPERCRONIC_SHA256=a53ae236602c7338aba3fbaff40bda6300eae3b9fedb8261eb06cfe3724430c1

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git python3 tini tzdata \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSLo /usr/local/bin/supercronic \
      "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
 && echo "${SUPERCRONIC_SHA256}  /usr/local/bin/supercronic" | sha256sum -c - \
 && chmod 0755 /usr/local/bin/supercronic

COPY --from=uv /uv /uvx /usr/local/bin/

RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" && npm cache clean --force

# The base image's `node` user already has uid/gid 1000 (the usual host owner of the bind
# mounts); rename it to `agent`. Claude Code refuses bypassPermissions as root.
RUN groupmod -n agent node \
 && usermod -l agent -d /home/agent -m node

ENV TZ=UTC \
    CLAUDE_CONFIG_DIR=/data/agent/claude \
    DISABLE_AUTOUPDATER=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
    UV_PROJECT_ENVIRONMENT=/home/agent/.p2gl-venv \
    UV_CACHE_DIR=/data/agent/uv-cache \
    UV_FROZEN=1 \
    UV_LINK_MODE=copy \
    P2GL_CACHE_DIR=/data/agent/p2gl-cache \
    LEARNING_CONTENT_DIR=/data/content \
    PATH=/home/agent/.p2gl-venv/bin:$PATH

COPY agent/ /app/agent/

USER agent
WORKDIR /home/agent
ENTRYPOINT ["tini", "--", "/app/agent/entrypoint.sh"]
