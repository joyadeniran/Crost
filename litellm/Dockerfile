FROM python:3.11-slim

WORKDIR /app

# Install LiteLLM with proxy dependencies
RUN pip install --no-cache-dir 'litellm[proxy]' python-dotenv

# LiteLLM runs on port 4000 by default
EXPOSE 4000

# Start LiteLLM proxy server using the litellm CLI
CMD ["litellm", "--port", "4000", "--host", "0.0.0.0"]
