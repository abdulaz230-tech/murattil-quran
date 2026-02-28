// Netlify Function: proxies audio to Tarteel Whisper on HuggingFace
// This runs server-side so no CORS issues

const HF_URL = "https://router.huggingface.co/hf-inference/models/tarteel-ai/whisper-base-ar-quran";

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

    // Forward to HuggingFace
    const hfHeaders = { "Content-Type": "audio/wav" };

    // If you add a HF token later for faster/dedicated inference:
    // const HF_TOKEN = Netlify.env.get("HF_TOKEN");
    // if (HF_TOKEN) hfHeaders["Authorization"] = "Bearer " + HF_TOKEN;

    const hfRes = await fetch(HF_URL, {
      method: "POST",
      headers: hfHeaders,
      body: audioData,
    });

    const hfText = await hfRes.text();

    if (!hfRes.ok) {
      // Pass through HF error (e.g. 503 = model loading)
      return new Response(
        JSON.stringify({
          error: hfRes.status === 503 ? "loading" : "hf_error",
          status: hfRes.status,
          detail: hfText,
        }),
        {
          status: 200, // Return 200 to our app, with error info in body
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Return the transcription
    return new Response(hfText, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "proxy_error", detail: err.message }),
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
