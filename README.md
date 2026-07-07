# Speaker Identification App

An AI-powered speaker identification and speech-to-text application built with React, FastAPI, SpeechBrain and OpenAI Whisper.

The application allows users to enrol multiple voice samples, identify speakers from new recordings using SpeechBrain's ECAPA-TDNN model, and automatically transcribe speech using OpenAI Whisper.

## Screenshot
The application after enrolling several speakers and identifying a new recording:
![Demo Screenshot](docs/DemoScreenshot.png)

## Features
- 🎤 Record audio directly from the browser
- 👤 Enrol multiple speakers, record multiple voice samples per speaker
- 🔍 Identify speakers using AI-generated voice embeddings
- 📝 Automatic speech-to-text transcription
- ▶ Replay previously recorded samples
- 🔁 Re-transcribe recordings
- ❌ Delete individual recordings
- 🧹 Clear all recordings

## How Speaker Identification Works
### Collecting samples and creating voice profiles
Rather than comparing raw audio recordings, the application converts each recording into a 192-dimention embedding (numerical representations) of the audio samples using SpeechBrain's ECAPA-TDNN model. These embeddings capture the unique characteristics of each speaker's voice. This is how voice profiles are created for each speaker. The embeddings are then normalised and stored in a database for future comparisons.

### Identifying speakers
When a new audio sample is recorded for identification, it is converted into an embedding using the same ECAPA-TDNN model. These embeddings are then normalised and compared using cosine similarity to identify the speaker. The speaker with the highest similarity score is considered the closest match.

## Speech-to-Text Transcription
The application uses OpenAI's Whisper model to transcribe audio recordings into text. This allows users to see the spoken content of their recordings in written form.

## Architecture
Here is the detailed project architecture diagram showing the interaction between the front-end and back-end components of the application:
![Architecture Diagram](docs/Architecture.png)

## Tech Stack
| Layer               | Technology             |
| ------------------- | ---------------------- |
| Frontend            | React                  |
| Language            | TypeScript             |
| UI Build Tool       | Vite                   |
| HTTP comms from UI  | axios                  |
| Backend             | FastAPI                |
| ML                  | SpeechBrain ECAPA-TDNN |
| Speech Recognition  | Whisper Tiny           |
| Audio Processing    | FFmpeg                 |
| Deep Learning       | PyTorch                |
| Numerical Computing | NumPy                  |
| Audio Utilities     | SciPy, torchaudio      |
| Run backend server  | uvicorn                |

## Front-End
The front-end is a React-based UI.

The front-end provides a user-friendly UI to record audio samples to:
- Register the known users (training data).
- Identify whom a voice belongs to (test data).

## Back-End
The back-end is a FastAPI backend.

The back-end handles audio processing and speaker identification.
- Exposes RESTful endpoints that the front-end communicates with.

### API Endpoints
| Endpoint          | Method | Description             |
| ----------------- | ------ | ----------------------- |
| /enroll/{name}    | POST   | Register a speaker.     |
| /identify         | POST   | Identify a speaker.     |
| /transcribe       | POST   | Generate a transcript.  |
| /transcripts      | GET    | Retrieve recordings.    |
| /recording/{id}   | DELETE | Delete one sample.      |
| /transcripts      | DELETE | Delete all samples.     |

## Communication
Between the front-end and back-end:
- The front-end (UI) communicates with the back-end via HTTP requests.
- User records training audio samples, UI sends audio to Python based FastAPI server.
- The API embeds the audio samples and stores them in a database.
- User records the testing sample - to identify (comparing with the stored users samples.

### Communication pipeline
```
Browser
     │
     ▼
React UI
     │
    HTTP
     │
     ▼
FastAPI
     │
     ├───────────────────────── Speech-to-Text
     │                                │
     │                                ▼
     │                              Whisper
     │
     ├── Speaker Recognition
     │      │
     │      ▼
     │  ECAPA-TDNN
     │
     ▼
SpeakersDatabase
```

---

Feel free to explore and use the code, if it helps you!