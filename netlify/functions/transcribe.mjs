// Netlify Function: Enhanced proxy to Tarteel Whisper on HuggingFace
// With retry logic, timeout handling, and fallback options

const HF_URL = "https://api-inference.huggingface.co/models/tarteel-ai/whisper-base-ar-quran";

// Get HuggingFace API token from environment (optional but recommended)
const HF_TOKEN = Netlify.env.get("HF_TOKEN");

// Retry configuration
const MAX_RETRIES = 4;
const INITIAL_WAIT = 15000; // 15 seconds
const MAX_WAIT = 120000; // 2 minutes

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

    // Try multiple times with exponential backoff
    let lastError = null;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        console.log(`[Transcribe] Attempt ${attempt + 1}/${MAX_RETRIES}`);

        // Calculate wait time with exponential backoff
        if (attempt > 0) {
          const waitTime = Math.min(
            INITIAL_WAIT + attempt * 20000,
            MAX_WAIT
          );
          console.log(`[Transcribe] Waiting ${waitTime}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }

        // Build headers
        const hfHeaders = {
          "Content-Type": "audio/wav",
        };

        // Add authorization token if available
        if (HF_TOKEN) {
          hfHeaders["Authorization"] = `Bearer ${HF_TOKEN}`;
        }

        // Make request with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 180000); // 3 minute timeout

        const hfRes = await fetch(HF_URL, {
          method: "POST",
          headers: hfHeaders,
          body: audioData,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        // Handle response
        const hfText = await hfRes.text();

        // Parse response
        let responseData;
        try {
          responseData = JSON.parse(hfText);
        } catch {
          responseData = { text: hfText };
        }

        // Model is still loading
        if (hfRes.status === 503 || responseData.error?.includes("currently loading")) {
          console.log(`[Transcribe] Model loading (503), will retry...`);
          lastError = { error: "loading", status: 503 };
          continue; // Try again
        }

        // Other HF errors
        if (!hfRes.ok) {
          console.error(`[Transcribe] HF error ${hfRes.status}:`, hfText);
          lastError = {
            error: "hf_error",
            status: hfRes.status,
            detail: hfText,
          };
          
          // Don't retry on 400-level errors (bad request, etc)
          if (hfRes.status >= 400 && hfRes.status < 500) {
            break;
          }
          continue; // Retry on 5xx errors
        }

        // Success!
        if (responseData.text) {
          console.log(`[Transcribe] Success on attempt ${attempt + 1}`);
          return new Response(JSON.stringify({ text: responseData.text }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // No text returned
        console.warn(`[Transcribe] No text in response:`, responseData);
        lastError = {
          error: "no_text",
          detail: "HuggingFace returned valid response but no text field",
        };
        continue;

      } catch (retryErr) {
        console.error(`[Transcribe] Attempt ${attempt + 1} error:`, retryErr.message);
        lastError = {
          error: "network_error",
          detail: retryErr.message,
        };
        
        // Don't retry on abort/timeout if we're on final attempt
        if (attempt === MAX_RETRIES - 1) {
          break;
        }
      }
    }

    // All retries exhausted
    console.error(`[Transcribe] All ${MAX_RETRIES} attempts failed. Last error:`, lastError);

    return new Response(
      JSON.stringify({
        error: lastError?.error || "max_retries_exceeded",
        message:
          lastError?.error === "loading"
            ? "AI model is still warming up. Please wait 1-2 minutes and try again."
            : lastError?.detail || "Could not process audio after multiple attempts.",
        detail: lastError,
      }),
      {
        status: 200, // Return 200 so client receives our error message
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[Transcribe] Fatal error:", err);
    return new Response(
      JSON.stringify({
        error: "proxy_error",
        message: "Server error processing audio.",
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
