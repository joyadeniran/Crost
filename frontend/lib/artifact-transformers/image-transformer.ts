
export async function transformToImage(data: any): Promise<Buffer> {
  // Try to find a prompt in the payload
  const promptText = typeof data === 'string' 
    ? data 
    : data.prompt || data.image_prompt || data.description || JSON.stringify(data);
    
  // We use Pollinations.ai, a free, no-auth image generation API.
  // It returns a JPEG directly.
  const encodedPrompt = encodeURIComponent(promptText || "abstract corporate background");
  
  const width = data.width || 1024;
  const height = data.height || 768;
  const seed = data.seed || Math.floor(Math.random() * 10000);
  
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
  
  console.log('[transformToImage] Generating image via Pollinations.ai:', url);
  
  const res = await fetch(url, {
    // Timeout after 30 seconds since image gen can take a moment
    signal: AbortSignal.timeout(30000)
  });
  
  if (!res.ok) {
    throw new Error(`Image generation failed: ${res.statusText}`);
  }
  
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
