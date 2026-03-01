// Netlify Function: Transcribe Arabic audio using AssemblyAI
// With detailed logging to debug issues

const ASSEMBLYAI_KEY = Netlify.env.get("ASSEMBLYAI_KEY");
const ASSEMBLYAI_UPLOAD_URL = "https://api.assemblyai.com/v1/upload";
const ASSEMBLYAI_TRANSCRIBE_URL = "https://api.assemblyai.com/v1/transcript";

async function uploadAudio(audioData) {
  console.log("[Upload] Starting audio upload...");
  console.log("[Upload] Audio size:", audioData.byteLength, "bytes");
  console.log("[Upload] API Key configured:", !!ASSEMBLYAI_KEY);

  try {
    const response = await fetch(ASSEMBLYAI_UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: ASSEMBLYAI_KEY,
      },
      body: audioData,
    });

    const responseText = await response.text();
    console.log("[Upload] Response status:", response.status);
    console.log("[Upload] Response:", responseText);

    if (!response.ok) {
      throw new Error(`Upload failed (${response.status}): ${responseText}`);
    }

    const data = JSON.parse(responseText);
    console.log("[Upload] ✓ Upload successful. URL:", data.upload_url);
    return data.upload_url;
  } catch (err) {
    console.error("[Upload] Error:", err.message);
    throw err;
  }
}

async function transcribeAudio(audioUrl) {
  console.log("[Transcribe] Submitting transcription job...");
  console.log("[Transcribe] Audio URL:", audioUrl);

  try {
    const submitResponse = await fetch(ASSEMBLYAI_TRANSCRIBE_URL, {
      method: "POST",
      headers: {
        Authorization: ASSEMBLYAI_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        language_code: "ar",
      }),
    });

    const submitText = await submitResponse.text();
    console.log("[Transcribe] Submit response status:", submitResponse.status);
    console.log("[Transcribe] Submit response:", submitText);

    if (!submitResponse.ok) {
      throw new Error(`Submission failed (${submitResponse.status}): ${submitText}`);
    }

    const submitData = JSON.parse(submitText);
    const transcriptId = submitData.id;
    console.log("[Transcribe] Job ID:", transcriptId);

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes max

    while (attempts < maxAttempts) {
      console.log(`[Transcribe] Polling attempt ${attempts + 1}/${maxAttempts}...`);

      const pollResponse = await fetch(
        `${ASSEMBLYAI_TRANSCRIBE_URL}/${transcriptId}`,
        {
          headers: {
            Authorization: ASSEMBLYAI_KEY,
          },
        }
      );

      const pollText = await pollResponse.text();
      console.log("[Transcribe] Poll response:", pollText.substring(0, 200));

      const pollData = JSON.parse(pollText);
      console.log("[Transcribe] Status:", pollData.status);

      if (pollData.status === "completed") {
        const result = pollData.text || "";
        console.log("[Transcribe] ✓ COMPLETE! Text:", result.substring(0, 100));
        return result;
      }

      if (pollData.status === "error") {
        throw new Error(`Job error: ${pollData.error}`);
      }

      // Wait 1 second before next poll
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error("Transcription timeout after 2 minutes");
  } catch (err) {
    console.error("[Transcribe] Error:", err.message);
    throw err;
  }
}

export default async (request) => {
  console.log("[Handler] Request received");
  console.log("[Handler] Method:", request.method);

  if (request.method !== "POST") {
    console.log("[Handler] ❌ Invalid method");
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Check configuration
    if (!ASSEMBLYAI_KEY) {
      console.error("[Handler] ❌ ASSEMBLYAI_KEY not set!");
      return new Response(
        JSON.stringify({
          error: "config_error",
          message:
            "ASSEMBLYAI_KEY environment variable not configured. Please add it to Netlify.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("[Handler] ✓ API Key present");

    const audioData = await request.arrayBuffer();
    console.log("[Handler] Audio data received:", audioData.byteLength, "bytes");

    if (!audioData || audioData.byteLength < 100) {
      console.error("[Handler] ❌ Audio too small or empty");
      return new Response(JSON.stringify({ error: "No audio data received" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Upload
    console.log("[Handler] Uploading audio...");
    const audioUrl = await uploadAudio(audioData);

    // Transcribe
    console.log("[Handler] Starting transcription...");
    const text = await transcribeAudio(audioUrl);

    if (!text || text.trim().length === 0) {
      console.warn("[Handler] ⚠️ Empty transcription");
      return new Response(
        JSON.stringify({
          error: "no_text",
          text: "",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("[Handler] ✓✓✓ SUCCESS!");
    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Handler] ❌ FATAL ERROR:", err.message);
    console.error("[Handler] Stack:", err.stack);

    return new Response(
      JSON.stringify({
        error: "processing_error",
        message: err.message,
        text: "", // Empty text so app knows it failed
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const config = {
  path: "/api/transcribe",
};
