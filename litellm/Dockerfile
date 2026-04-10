FROM python:3.11-slim

WORKDIR /app

# Install LiteLLM and dependencies
RUN pip install --no-cache-dir litellm python-dotenv

# LiteLLM runs on port 4000 by default
EXPOSE 4000

# Start LiteLLM proxy server
CMD ["python", "-m", "litellm.proxy.server"]
