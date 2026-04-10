FROM ghcr.io/berriai/litellm:latest

# LiteLLM runs on port 4000 by default
EXPOSE 4000

# Start LiteLLM proxy server
CMD ["python3", "-m", "litellm.proxy.server"]
