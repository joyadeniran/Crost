FROM python:3.11-slim

WORKDIR /app

# Install LiteLLM with proxy dependencies and gettext (for envsubst)
RUN pip install --no-cache-dir 'litellm[proxy]' python-dotenv && \
    apt-get update && apt-get install -y gettext-base && rm -rf /var/lib/apt/lists/*

# Copy LiteLLM configuration and entrypoint script
COPY config.yaml /app/config.yaml
COPY entrypoint.sh /app/entrypoint.sh

# Make entrypoint script executable
RUN chmod +x /app/entrypoint.sh

# LiteLLM runs on port 4000 by default
EXPOSE 4000

# Start LiteLLM proxy server with environment variable substitution
ENTRYPOINT ["/app/entrypoint.sh"]
