// Netlify Function: Simple proxy to Tarteel Whisper on HuggingFace
// Receives audio from browser, forwards to HF Inference API, returns transcription
// This runs server-side so there are no CORS issues

const HF_URL = "https://router.huggingface.co/hf-inference/models/tarteel-ai/whisper-base-ar-quran";

export default async (request) => {
  // Only POST allowed
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Get the raw audio bytes from the request
    const audioData = await request.arrayBuffer();
    console.log("Audio received:", audioData.byteLength, "bytes");

    if (!audioData || audioData.byteLength < 100) {
      return new Response(JSON.stringify({ error: "no_audio", detail: "No audio data received" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Send directly to HuggingFace Inference API
    // The API accepts raw audio bytes with Content-Type header
    const hfRes = await fetch(HF_URL, {
      method: "POST",
      headers: {
        "Content-Type": "audio/wav",
      },
      body: audioData,
    });

    console.log("HF response status:", hfRes.status);

    // Read the response
    const hfBody = await hfRes.text();
    console.log("HF response body:", hfBody.substring(0, 500));

    if (!hfRes.ok) {
      // Model is loading (cold start) - returns 503
      if (hfRes.status === 503) {
        return new Response(JSON.stringify({ error: "loading", detail: "Model is loading, retry in 20-30 seconds" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Other HF error
      return new Response(JSON.stringify({ error: "hf_error", status: hfRes.status, detail: hfBody.substring(0, 300) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Success - return the transcription as-is
    // HF returns: {"text": "بسم الله الرحمن الرحيم"}
    return new Response(hfBody, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Proxy error:", err);
    return new Response(JSON.stringify({ error: "proxy_error", detail: err.message }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/transcribe",
};
