FROM python:3.11-slim

WORKDIR /app

# Install LiteLLM with proxy dependencies
RUN pip install --no-cache-dir 'litellm[proxy]' python-dotenv

# Copy LiteLLM configuration
COPY config.yaml /app/config.yaml

# LiteLLM runs on port 4000 by default
EXPOSE 4000

# Start LiteLLM proxy server with configuration file
CMD ["litellm", "--config", "/app/config.yaml", "--port", "4000", "--host", "0.0.0.0"]
