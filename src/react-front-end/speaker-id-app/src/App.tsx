import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { BACKEND_URL } from "./config";

interface TranscriptEntry {
  id: string;
  name: string;
  message: string;
  audioBlob: Blob | null;
  speaker: string;
  timestamp: string;
}

function App() {
  const [name, setName] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [result, setResult] = useState<object | null>(null);
  const [previousTranscripts, setPreviousTranscripts] = useState<TranscriptEntry[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const levelFillRef = useRef<HTMLSpanElement>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [isTranscribingDraft, setIsTranscribingDraft] = useState(false);

  const transcribeDraft = async (blob: Blob) => {
    setIsTranscribingDraft(true);
    setDraftText(null);
    try {
      const formData = new FormData();
      formData.append("file", blob, "audio.webm");
      formData.append("recording_id", crypto.randomUUID());
      formData.append("speaker_name", "unknown");
      const res = await axios.post(`${BACKEND_URL}/transcribe`, formData);
      setDraftText(res.data.text ?? "");
    } catch (err) {
      console.error("Draft transcription failed", err);
      setDraftText("[Transcription failed - try again]");
    } finally {
      setIsTranscribingDraft(false);
    }
  };

  const discardDraft = () => {
    setAudioBlob(null);
    setDraftText(null);
  };

  useEffect(() => {
    loadTranscripts();
  }, []);

  const loadTranscripts = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/transcripts`);

      const loaded = res.data.map((item: any) => {
        let blob: Blob | null = null;

        if (item.audio_base64) {
          const byteChars = atob(item.audio_base64);
          const byteNumbers = new Array(byteChars.length);

          for (let i = 0; i < byteChars.length; i++) {
            byteNumbers[i] = byteChars.charCodeAt(i);
          }

          const byteArray = new Uint8Array(byteNumbers);
          blob = new Blob([byteArray], { type: "audio/webm" });
        }

        return {
          id: item.id,
          name: item.name,
          message: item.message,
          audioBlob: blob,
          speaker: item.name,
          timestamp: item.timestamp || "",
        };
      });

      setPreviousTranscripts(loaded);
    } catch (err) {
      console.error("Failed to load transcripts", err);
    }
  };

  const RECORDING_DURATION_SECONDS = 3;

  const startRecording = () => {
    setAudioBlob(null);
    setDraftText(null);
    // Give instant feedback: getUserMedia can take several hundred ms to open the mic
    setIsStarting(true);

    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    }).then((stream) => {
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      // Real-time level meter so the user can see when they're actually speaking
      const audioContext = new AudioContext();
      audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const timeDomainData = new Uint8Array(analyser.fftSize);

      let animationFrameId: number;
      const updateLevel = () => {
        analyser.getByteTimeDomainData(timeDomainData);
        let sumSquares = 0;
        for (let i = 0; i < timeDomainData.length; i++) {
          const normalized = (timeDomainData[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / timeDomainData.length);
        // Update the DOM directly to avoid re-rendering the component every frame
        const level = Math.min(100, Math.round(Math.sqrt(rms) * 250));
        if (levelFillRef.current) levelFillRef.current.style.width = `${level}%`;
        animationFrameId = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      const countdownInterval = setInterval(() => {
        setCountdown((prev) => Math.max(0, prev - 1));
      }, 1000);

      const cleanup = () => {
        cancelAnimationFrame(animationFrameId);
        clearInterval(countdownInterval);
        if (levelFillRef.current) levelFillRef.current.style.width = "0%";
        setCountdown(0);
        setIsRecording(false);
        source.disconnect();
        audioContext.close();
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        setAudioBlob(blob);
        transcribeDraft(blob);
        cleanup();
      };

      // Start the visible timer only once the recorder is really capturing
      mediaRecorder.onstart = () => {
        setIsStarting(false);
        setIsRecording(true);
        setCountdown(RECORDING_DURATION_SECONDS);
        setTimeout(() => mediaRecorder.stop(), RECORDING_DURATION_SECONDS * 1000);
      };
      mediaRecorder.start();
    }).catch((err) => {
      console.error("Microphone access failed", err);
      setIsStarting(false);
    });
  };

 const sendToServer = async (endpoint: "enroll" | "identify") => {
   if (!audioBlob) return;

   try {
     const formData = new FormData();
     formData.append("file", audioBlob, "audio.webm");

     let recordingId: string | null = null;

     if (endpoint === "enroll") {
       recordingId = crypto.randomUUID();
       formData.append("recording_id", recordingId);
     }

     let url = `${BACKEND_URL}/${endpoint}`;
     if (endpoint === "enroll" && name) url += `/${name}`;

     console.log(`Sending to: ${url}`);
     const res = await axios.post(url, formData);
     console.log(`Response:`, res.data);
     setResult(res.data);

     // ✅ ADD DIRECTLY TO HISTORY (no extra API call)
     if (endpoint === "enroll") {
       const text = res.data.text ?? "";
       const timestamp = res.data.timestamp ?? "";

       setPreviousTranscripts((prev) => [
         {
           id: recordingId!,
           name: name,
           message: text,
           audioBlob: audioBlob,
           speaker: name,
           timestamp: timestamp,
         },
         ...prev,
       ]);
     }
   } catch (error) {
     console.error(`Error in ${endpoint}:`, error);
     setResult({ error: `Failed to ${endpoint}: ${error instanceof Error ? error.message : String(error)}` });
   }
 };

  const transcribe = async (
    inputAudioBlob: Blob | null,
    audioSampleId: string | null,
    speakerName: string = name,
    recordingId: string | null = null
  ) => {
    if (!inputAudioBlob) return;

    // If retranscribing, set message to "re-transcribing..."
    if (audioSampleId) {
      setPreviousTranscripts((prev) =>
        prev.map((entry) =>
          entry.id === audioSampleId ? { ...entry, message: "re-transcribing..." } : entry
        )
      );
    }

    const formData = new FormData();
    formData.append("file", inputAudioBlob, "audio.webm");

    const id = recordingId || crypto.randomUUID();
    formData.append("recording_id", id);
    formData.append("speaker_name", speakerName);

    const res = await axios.post(`${BACKEND_URL}/transcribe`, formData);
    const text = res.data.text ?? "";
    const timestamp = res.data.timestamp ?? "";

    if (audioSampleId == null) {
      setPreviousTranscripts((prev) => [
        {
          id,
          name: speakerName,
          message: text,
          audioBlob: inputAudioBlob,
          speaker: speakerName,
          timestamp: timestamp,
        },
        ...prev,
      ]);
    } else {
      setPreviousTranscripts((prev) =>
        prev.map((entry) =>
          entry.id === audioSampleId ? { ...entry, message: text, timestamp: timestamp } : entry
        )
      );
      // Update the output-message with the returned data in enroll-like format
      const retranscribeResult = {
        message: `Re-transcribed sample for ${speakerName}`,
        recording_id: audioSampleId,
        text: text,
        timestamp: timestamp
      };
      setResult(retranscribeResult);
    }
  };

  const deleteRecording = async (id: string) => {
    try {
      await axios.delete(`${BACKEND_URL}/recording/${id}`);
      setPreviousTranscripts((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const clearAll = async () => {
    const confirmClear = window.confirm("Are you sure you want to delete ALL recordings?");
    if (!confirmClear) return;

    try {
      await axios.delete(`${BACKEND_URL}/transcripts?confirm=true`);
      setPreviousTranscripts([]);
      setResult(null);
    } catch (err) {
      console.error("Clear all failed", err);
    }
  };

  const playThisAudio = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    new Audio(url).play();
  };

  return (
    <>
      <style>{`
        .app-container {
          padding: 20px;
          font-family: sans-serif;
          max-width: 900px;
          margin: auto;
        }

        h2 {
          margin-bottom: 16px;
        }

        input {
          padding: 8px;
          margin-right: 8px;
          border-radius: 4px;
          border: 1px solid #ccc;
        }

        button {
          padding: 8px 12px;
          margin: 4px;
          border-radius: 4px;
          border: none;
          cursor: pointer;
          background-color: #2ba276;
          color: white;
        }

        button:hover {
          opacity: 0.9;
        }

        button:disabled {
          background-color: #aaa;
          cursor: not-allowed;
        }

        .danger {
          background-color: #d9534f;
        }

        .toolbar {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }

        .draft-box {
          border: 1px solid #ccc;
          border-radius: 6px;
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .draft-text {
          font-style: italic;
        }

        .toolbar-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .toolbar-row button,
        .toolbar-row input {
          margin: 0;
        }

        .recording-indicator {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-left: 8px;
          vertical-align: middle;
        }

        .level-meter-track {
          display: inline-block;
          vertical-align: middle;
          width: 120px;
          height: 10px;
          background-color: #ddd;
          border-radius: 5px;
          overflow: hidden;
        }

        .level-meter-fill {
          display: block;
          height: 100%;
          background-color: #2ba276;
          transition: width 60ms linear;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 16px;
        }

        th, td {
          padding: 8px;
          text-align: left;
          border: 1px solid #847f7f;
        }

        th {
          background-color: #5f99d3;
        }

        pre {
          background: #5f89d3;
          padding: 10px;
          color: #f8f1ea;
          border-radius: 6px;
          margin-top: 10px;
        }
      `}</style>

      <div className="app-container">
        <h2>🎤 Speaker Identification Application</h2>

        <div className="toolbar">
          <div className="toolbar-row">
            <button onClick={startRecording} disabled={isRecording || isStarting}>
              {isStarting ? "⏳ Starting mic..." : "🎙️ Record 3s"}
            </button>

            <span className="recording-indicator">
              <span style={{ opacity: isRecording ? 1 : 0.4 }}>🔴 Recording... {countdown}s</span>
              <span className="level-meter-track">
                <span className="level-meter-fill" ref={levelFillRef} />
              </span>
            </span>

            <button onClick={() => audioBlob && playThisAudio(audioBlob)} disabled={!audioBlob}>
              ▶️ Play Recorded Message
            </button>
          </div>

          {(isTranscribingDraft || draftText !== null) && (
            <div className="draft-box">
              <div className="draft-text">
                {isTranscribingDraft ? "⏳ Transcribing..." : <>📝 “{draftText}”</>}
              </div>
              <div className="toolbar-row">
                <button
                  onClick={() => audioBlob && transcribeDraft(audioBlob)}
                  disabled={!audioBlob || isTranscribingDraft}
                >
                  🔁 Re-transcribe
                </button>
                <button className="danger" onClick={discardDraft} disabled={isTranscribingDraft}>
                  🚫 Discard
                </button>
              </div>
            </div>
          )}

          <div className="toolbar-row">
            <input
              type="text"
              placeholder="Friend's name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <button onClick={() => sendToServer("enroll")} disabled={!name || !audioBlob || isTranscribingDraft}>
              Enroll
            </button>

            <button onClick={() => sendToServer("identify")}>
              👤 Identify Me
            </button>
          </div>
        </div>

        {result && <pre data-name="output-message">{JSON.stringify(result, null, 2)}</pre>}

        {previousTranscripts.length > 0 && (
          <div>
            <h3>Transcription History</h3>

            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Message</th>
                  <th>Timestamp</th>
                  <th>Play</th>
                  <th>Re-transcribe</th>
                  <th>
                    Delete{" "}
                    <button className="danger" onClick={clearAll} title="Delete all recordings">
                      🗑️ Clear All
                    </button>
                  </th>
                </tr>
              </thead>

              <tbody>
                {previousTranscripts.map((entry) => (
                  <tr key={entry.id}>
                    <td>({entry.id.slice(-4)})</td>
                    <td>{entry.name}</td>
                    <td>{entry.message}</td>
                    <td>{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ""}</td>

                    <td>
                      <button onClick={() => entry.audioBlob && playThisAudio(entry.audioBlob)}>
                        ▶️
                      </button>
                    </td>

                    <td>
                      <button data-name="retranscribe" onClick={() => transcribe(entry.audioBlob, entry.id, entry.name)}>
                        🔁
                      </button>
                    </td>

                    <td>
                      <button className="danger" onClick={() => deleteRecording(entry.id)}>
                        ❌
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default App;