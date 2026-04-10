FROM python:3.11-slim

WORKDIR /app

# Install LiteLLM and dependencies
RUN pip install --no-cache-dir litellm python-dotenv gunicorn

# LiteLLM runs on port 4000 by default
EXPOSE 4000

# Start LiteLLM proxy server using the litellm CLI
CMD ["litellm", "--port", "4000", "--host", "0.0.0.0"]
