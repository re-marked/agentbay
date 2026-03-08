# AgentBay base agent image
# Wraps the official OpenClaw image with marketplace defaults:
#   - Hardened sandbox config
#   - Gateway on port 18789 (LAN only)
#   - Persistent state at /data
#   - Health-check endpoint
#   - Auth-profiles from env vars (BYOK)

FROM ghcr.io/openclaw/openclaw:2026.2.26

# ── Store defaults outside the volume mount point ────────────
# /data is a volume — anything COPY'd there gets overwritten at runtime.
# We store defaults in /opt and seed /data at boot via entrypoint.
USER root
RUN mkdir -p /opt/openclaw-defaults/workspace /data && \
    chmod -R 777 /data

COPY openclaw.json /opt/openclaw-defaults/openclaw.json
COPY workspace/ /opt/openclaw-defaults/workspace/

# ── Workspace CLI scripts (workspace-msg, workspace-task) ─────
COPY bin/ /opt/openclaw-defaults/bin/
RUN sed -i 's/\r$//' /opt/openclaw-defaults/bin/* && \
    chmod +x /opt/openclaw-defaults/bin/* && \
    ln -sf /opt/openclaw-defaults/bin/* /usr/local/bin/

# Entrypoint: COPY + sed to strip CRLF (avoids Windows line-ending issues)
COPY entrypoint.sh /opt/entrypoint.sh
RUN sed -i 's/\r$//' /opt/entrypoint.sh && chmod +x /opt/entrypoint.sh

USER node
VOLUME /data

# ── Environment ───────────────────────────────────────────────
ENV OPENCLAW_STATE_DIR=/data
ENV NODE_OPTIONS="--max-old-space-size=1536"
ENV NODE_ENV=production

EXPOSE 18789

ENTRYPOINT ["/opt/entrypoint.sh"]
CMD ["node", "dist/index.js", "gateway", "--allow-unconfigured", "--port", "18789", "--bind", "lan"]
