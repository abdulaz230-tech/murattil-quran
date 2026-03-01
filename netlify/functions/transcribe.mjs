// Netlify Function: Transcribe Arabic Quran audio using AssemblyAI
// AssemblyAI is reliable, has free tier, and great Arabic support

const ASSEMBLYAI_KEY = Netlify.env.get("ASSEMBLYAI_KEY");
const ASSEMBLYAI_UPLOAD_URL = "https://api.assemblyai.com/v1/upload";
const ASSEMBLYAI_TRANSCRIBE_URL = "https://api.assemblyai.com/v1/transcript";

async function uploadAudio(audioData) {
  console.log("[Transcribe] Uploading audio to AssemblyAI...");
  
  const response = await fetch(ASSEMBLYAI_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: ASSEMBLYAI_KEY,
    },
    body: audioData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  const data = await response.json();
  return data.upload_url;
}

async function transcribeAudio(audioUrl) {
  console.log("[Transcribe] Starting transcription...");
  
  // Submit transcription job
  const submitResponse = await fetch(ASSEMBLYAI_TRANSCRIBE_URL, {
    method: "POST",
    headers: {
      Authorization: ASSEMBLYAI_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      language_code: "ar", // Arabic
    }),
  });

  if (!submitResponse.ok) {
    throw new Error(`Transcription submission failed: ${submitResponse.status}`);
  }

  const submitData = await submitResponse.json();
  const transcriptId = submitData.id;
  
  console.log(`[Transcribe] Job ID: ${transcriptId}`);

  // Poll for completion (max 60 seconds)
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    const pollResponse = await fetch(
      `${ASSEMBLYAI_TRANSCRIBE_URL}/${transcriptId}`,
      {
        headers: {
          Authorization: ASSEMBLYAI_KEY,
        },
      }
    );

    const pollData = await pollResponse.json();
    console.log(`[Transcribe] Status: ${pollData.status}`);

    if (pollData.status === "completed") {
      console.log(`[Transcribe] ✓ Transcription complete!`);
      return pollData.text || "";
    }

    if (pollData.status === "error") {
      throw new Error(`Transcription error: ${pollData.error}`);
    }

    // Wait 1 second before next poll
    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempts++;
  }

  throw new Error("Transcription timeout");
}

export default async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Check if API key is configured
    if (!ASSEMBLYAI_KEY) {
      console.error("[Transcribe] ASSEMBLYAI_KEY not configured!");
      return new Response(
        JSON.stringify({
          error: "no_api_key",
          message: "Server not configured. Please contact admin.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const audioData = await request.arrayBuffer();

    if (!audioData || audioData.byteLength < 100) {
      return new Response(JSON.stringify({ error: "No audio data received" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(
      `[Transcribe] Received ${audioData.byteLength} bytes of audio`
    );

    // Upload audio
    const audioUrl = await uploadAudio(audioData);
    console.log(`[Transcribe] Audio uploaded to: ${audioUrl}`);

    // Transcribe
    const text = await transcribeAudio(audioUrl);

    if (!text || text.trim().length === 0) {
      console.warn("[Transcribe] Empty transcription returned");
      return new Response(
        JSON.stringify({
          error: "no_text",
          detail: "No speech detected in audio",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[Transcribe] ✓ Success! Text: "${text.substring(0, 50)}..."`);

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[Transcribe] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "transcription_error",
        message: "Could not transcribe audio",
        detail: err.message,
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
