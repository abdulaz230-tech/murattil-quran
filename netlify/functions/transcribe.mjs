// Netlify Function: proxy audio to HuggingFace Whisper
// Uses openai/whisper-large-v3 with API token authentication

const HF_URL = "https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3";

export default async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const audioData = await request.arrayBuffer();
    console.log("Audio received:", audioData.byteLength, "bytes");

    if (!audioData || audioData.byteLength < 100) {
      return new Response(JSON.stringify({ error: "no_audio" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get HF token from Netlify environment variable
    const token = process.env.HF_TOKEN;
    if (!token) {
      console.error("HF_TOKEN not set in environment variables");
      return new Response(
        JSON.stringify({ error: "config_error", detail: "HF_TOKEN not configured. Add it in Netlify Site Configuration > Environment Variables." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const hfRes = await fetch(HF_URL, {
      method: "POST",
      headers: {
        "Content-Type": "audio/wav",
        "Authorization": "Bearer " + token,
      },
      body: audioData,
    });

    const hfBody = await hfRes.text();
    console.log("HF status:", hfRes.status, "body:", hfBody.substring(0, 300));

    if (!hfRes.ok) {
      if (hfRes.status === 503) {
        return new Response(JSON.stringify({ error: "loading" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ error: "hf_error", status: hfRes.status, detail: hfBody.substring(0, 300) }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(hfBody, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Proxy error:", err);
    return new Response(
      JSON.stringify({ error: "proxy_error", detail: err.message }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = {
  path: "/api/transcribe",
};
