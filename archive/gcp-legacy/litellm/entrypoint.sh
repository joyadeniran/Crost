#!/bin/bash

# LiteLLM Entrypoint - Substitutes environment variables in config.yaml before starting

# Create a temporary config file with environment variables substituted
envsubst < /app/config.yaml > /app/config.generated.yaml

# Check if substitution was successful
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to substitute environment variables in config.yaml"
    exit 1
fi

echo "Environment variables substituted in config.yaml"
echo "Starting LiteLLM Proxy Server..."

# Start LiteLLM with the generated config
exec litellm --config /app/config.generated.yaml --port 4000 --host 0.0.0.0
