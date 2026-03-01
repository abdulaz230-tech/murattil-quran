// Netlify Function: Fixed proxy to Tarteel Whisper on HuggingFace
// Uses official HuggingFace Inference API with proper retry logic

const HF_API_KEY = Netlify.env.get("HF_API_KEY");
const HF_MODEL_ID = "tarteel-ai/whisper-base-ar-quran";
const HF_API_URL = `https://api-inference.huggingface.co/models/${HF_MODEL_ID}`;

const MAX_RETRIES = 5;
const BASE_WAIT = 20000; // 20 seconds

export default async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const audioData = await request.arrayBuffer();

    if (!audioData || audioData.byteLength < 100) {
      return new Response(JSON.stringify({ error: "No audio data received" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build headers
    const headers = {
      "Content-Type": "audio/wav",
    };

    // Add API key if available (STRONGLY RECOMMENDED)
    if (HF_API_KEY) {
      headers["Authorization"] = `Bearer ${HF_API_KEY}`;
      console.log("[Transcribe] Using HuggingFace API key for faster inference");
    } else {
      console.warn("[Transcribe] No HF_API_KEY set - using free tier (slower, may timeout)");
    }

    // Retry loop
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        console.log(`[Transcribe] Attempt ${attempt + 1}/${MAX_RETRIES} to ${HF_MODEL_ID}`);

        // Wait before retry (except on first attempt)
        if (attempt > 0) {
          const waitTime = BASE_WAIT + attempt * 15000; // 20s, 35s, 50s, 65s, 80s
          console.log(`[Transcribe] Waiting ${waitTime}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }

        // Make request with 3-minute timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000);

        const response = await fetch(HF_API_URL, {
          method: "POST",
          headers,
          body: audioData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle 503 (model loading)
        if (response.status === 503) {
          const data = await response.json();
          console.log(`[Transcribe] Model loading (503):`, data);
          
          if (attempt < MAX_RETRIES - 1) {
            continue; // Retry
          } else {
            return new Response(
              JSON.stringify({
                error: "loading",
                message: "Model is warming up - please wait 2-3 minutes and try again",
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }
            );
          }
        }

        // Handle other errors
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Transcribe] HTTP ${response.status}:`, errorText);
          
          return new Response(
            JSON.stringify({
              error: "api_error",
              status: response.status,
              detail: errorText,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        // Parse response
        const data = await response.json();
        
        if (data.text) {
          console.log(`[Transcribe] ✓ Success on attempt ${attempt + 1}:`, data.text.substring(0, 50));
          return new Response(JSON.stringify({ text: data.text }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        console.warn(`[Transcribe] No text in response:`, data);
        return new Response(
          JSON.stringify({
            error: "no_text",
            detail: "API returned valid response but no text field",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );

      } catch (err) {
        console.error(`[Transcribe] Attempt ${attempt + 1} failed:`, err.message);

        // If it's the last attempt, return error
        if (attempt === MAX_RETRIES - 1) {
          return new Response(
            JSON.stringify({
              error: "network_error",
              detail: err.message,
              message: "Could not reach AI service. Please check your internet and try again.",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      }
    }

  } catch (err) {
    console.error("[Transcribe] Fatal error:", err);
    return new Response(
      JSON.stringify({
        error: "server_error",
        message: "Internal server error",
        detail: err.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const config = {
  path: "/api/transcribe",
};
