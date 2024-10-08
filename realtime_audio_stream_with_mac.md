## OpenAI Realtime API Integration for Node.js

This example will guide you through the process of integrating [the OpenAI Realtime platform](https://platform.openai.com/docs/api-reference/realtime) into a Node.js application that runs locally on mac (or other device) for development. It serves as a gateway for developers looking to interact with OpenAI's GPT models in real-time, using audio input and output to create a conversational assistant.

In this tutorial, developers will learn how to use WebSocket communication to connect to OpenAI's API, stream audio input, and receive responses in real time. This integration provides a way to implement dynamic interactions that utilize GPT's natural language processing capabilities in audio form, making it well suited for conversational AI, live assistant applications, and other real-time use cases.

This code sample is also a great way to create a development environment that allows developers to test their own use cases locally, facilitating rapid prototyping and iteration.

### Machine Dependencies

To successfully run this application, the following machine dependencies are required:

(This guide was developed on a mac for mac users. The machine dependency is mostly related to audio input/output utilities resident on mac. Other components are reusable.)

1. **Node.js** (version 14 or higher): Required to run the JavaScript code.
2. **npm** (Node Package Manager): To install the necessary Node.js packages (`ws`, `mic`, `dotenv`, `speaker`).
3. **Sox**: The application uses the `mic` package, which relies on the Sox command line utility (`rec`) to capture audio. Install via Homebrew on macOS:
   ```sh
   brew install sox
   ```
4. **Microphone**: A working microphone is required for capturing live audio.
5. **Speakers or Headphones**: Needed to play back the audio response from the OpenAI API.
6. **Environment Variables**: You need to set the `OPENAI_API_KEY` in your environment to authenticate with OpenAI's API. You can add it to a `.env` file:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```
7. **Homebrew** (for macOS users): To install system dependencies like Sox.
8. **Network Connection**: A stable internet connection is required for communication with the OpenAI API.

### Summary

This tutorial is valuable for developers who want to:
- Understand how to use [OpenAI’s Realtime API](https://platform.openai.com/docs/api-reference/realtime-client-events) for conversational AI applications.
- Gain hands-on experience with audio streaming and real-time processing in Node.js.
- Create an interactive experience that takes full advantage of GPT's capabilities for spoken dialogue.

By providing a practical example of connecting and interacting with OpenAI, this tutorial serves as a foundational guide for building real-time AI-driven solutions. This example is designed to assist developers in quickly setting up a voice-based AI assistant using Node.js.

### Step-by-Step Guide for Implementing this Code

1. **Install Node.js and npm**
   - Make sure you have Node.js (version 14 or higher) and npm installed on your machine.

2. **Clone or Create the Project**
   - Create a new project directory and navigate into it:
   ```sh
   mkdir openai-realtime-api
   cd openai-realtime-api
   ```

3. **Install Required Dependencies**
   - Install the necessary packages using npm:
   ```sh
   npm init -y
   npm install ws mic dotenv speaker
   ```

4. **Install Sox**
   - Sox is required for capturing microphone input. Install it using Homebrew (for macOS):
   ```sh
   brew install sox
   ```

5. **Create a `.env` File**
   - Create a `.env` file in the root of your project directory and add your OpenAI API key:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

6. **Set Up the Code**
   - Copy the provided JavaScript code at the bottom into a file named `app.mjs` in your project directory.

7. **Run the Application**
   - Run the application with Node.js:
   ```sh
   node app.mjs
   ```

8. **Verify Dependencies**
   - Ensure Sox is available in your system path. If you encounter an error related to `rec` command not found, add the following line to your code to adjust the path:
   ```javascript
   process.env.PATH = `${process.env.PATH}:/usr/local/bin`;
   ```

9. **Connect to the OpenAI API**
   
   To connect to the OpenAI API, the application uses a WebSocket to establish a real-time link:

   - **Initialize WebSocket Connection**: Once you run the application (`node app.mjs`), the code initializes a WebSocket connection to the OpenAI Realtime API using the provided URL (`wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`).
     ```javascript
     const ws = new WebSocket(OPENAI_API_URL, {
       headers: {
         Authorization: `Bearer ${API_KEY}`,
         'OpenAI-Beta': 'realtime=v1',
       },
     });
     ```

   - **Handle Connection Events**: Once the WebSocket connection is open, you can start interacting with the API. Upon connection, the application sends an initial request to create a response stream.
     ```javascript
     ws.on('open', () => {
       console.log('Connected to OpenAI Realtime API.');
       ws.send(JSON.stringify({
         type: 'response.create',
         response: {
           modalities: ['text', 'audio'],
           instructions: 'Please assist the user.',
         },
       }));
       startAudioStream(ws);
     });
     ```

10. **Interact with the Assistant**

    Now that you are connected, you can start speaking to interact with the assistant:

    - **Audio Streaming**: The `startAudioStream()` function starts capturing audio from your microphone using the `mic` package and sends it to the OpenAI API via WebSocket.
      ```javascript
      function startAudioStream(ws) {
        const micInstance = mic({
          rate: '24000', // Adjusted rate to match the Speaker configuration
          channels: '1',
          debug: false,
          exitOnSilence: 6,
          fileType: 'wav',
          encoding: 'signed-integer',
        });

        const micInputStream = micInstance.getAudioStream();
        micInputStream.on('error', (error) => {
          console.error('Microphone error:', error);
        });

        micInstance.start();
        console.log('Microphone started streaming.');

        micInputStream.on('data', (data) => {
          if (data.length > 0) {
            console.log('Sending audio data chunk to server...');
            ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: data.toString('base64') }));
          }
        });

        micInputStream.on('silence', () => {
          console.log('Committing audio buffer after silence...');
          ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
        });
      }
      ```

    - **Handle API Responses**: The application listens for responses from OpenAI through the WebSocket connection. It accumulates audio data, plays back the response, and logs the received messages.
      ```javascript
      ws.on('message', (message) => {
        const response = JSON.parse(message.toString());
        if (response.type === 'response.audio.delta') {
          console.log('Received audio delta, accumulating audio...');
          accumulatedAudio.push(response.delta);
        } else if (response.type === 'response.audio.done') {
          console.log('Received complete audio response, preparing to play...');
          const completeAudio = accumulatedAudio.join('');
          playAudio(completeAudio, () => {
            accumulatedAudio = []; // Clear accumulated audio after successful playback
          });
        } else {
          console.log('Received message:', response);
        }
      });
      ```

### Updated Audio Playback Function

The `playAudio()` function has been updated to accommodate the new audio streaming rate and ensure smooth playback:

```javascript
function playAudio(audioData, callback) {
  try {
    const audioBuffer = Buffer.from(audioData, 'base64');
    const speaker = new Speaker({
      channels: 1,
      sampleRate: 24000, // Adjusted rate to match the incoming audio format
      bitDepth: 16,
    });

    // Ensure buffer sizes are appropriate
    const readableStream = new Readable({
      highWaterMark: 1024 * 32, // Buffer size to prevent underflow
      read() {
        this.push(audioBuffer);
        this.push(null);
      },
    });

    readableStream.on('error', (error) => {
      console.error('Stream error during playback:', error);
    });

    readableStream.on('end', () => {
      if (callback) callback();
    });

    readableStream.pipe(speaker);
    console.log('Audio played from received stream.');
  } catch (error) {
    console.error('Error playing audio:', error);
  }
}
```

`playAudio()` function uses the `sampleRate` of `24000` to match the recording settings, ensuring that the audio plays back at the correct speed and pitch.

By following these steps, developers new to integrating real-time APIs can easily set up a voice-based assistant that interacts with OpenAI's models, providing an engaging example of real-time conversational AI.


```
    // Fully executable code from realtime_audio_stream_with_mac.md

 // Ensure you have installed these dependencies before running the code:
// npm install ws mic dotenv speaker
import WebSocket from 'ws';
import mic from 'mic';
import { Readable } from 'stream';
import Speaker from 'speaker';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

const OPENAI_API_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
const API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) {
  console.error('Please set your OPENAI_API_KEY in your environment variables.');
  process.exit(1);
}

// Check if 'sox' is installed and available
try {
  execSync('which rec');
} catch (error) {
  console.error("Error: 'rec' command not found. Please install 'sox' using 'brew install sox'.");
  process.exit(1);
}

// Establish the WebSocket connection to OpenAI
const ws = new WebSocket(OPENAI_API_URL, {
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'OpenAI-Beta': 'realtime=v1',
  },
});

let accumulatedAudio = [];

// Handle WebSocket connection events
ws.on('open', () => {
  console.log('Connected to OpenAI Realtime API.');
  ws.send(JSON.stringify({
    type: 'response.create',
    response: {
      modalities: ['text', 'audio'],
      instructions: 'Please assist the user.',
    },
  }));
  startAudioStream(ws);
});

ws.on('message', (message) => {
  const response = JSON.parse(message.toString());
  if (response.type === 'response.audio.delta') {
    console.log('Received audio delta, accumulating audio...');
    accumulatedAudio.push(response.delta);
  } else if (response.type === 'response.audio.done') {
    console.log('Received complete audio response, preparing to play...');
    const completeAudio = accumulatedAudio.join('');
    playAudio(completeAudio, () => {
      accumulatedAudio = []; // Clear accumulated audio after successful playback
    });
  } else if (response.type === 'response.content_part.added' && response.part?.type === 'audio') {
    console.log('Received audio content part, accumulating audio...');
    accumulatedAudio.push(response.part.transcript);
  } else if (response.type === 'response.content_part.done') {
    console.log('Received complete content part, preparing to play...');
    const completeAudio = accumulatedAudio.join('');
    playAudio(completeAudio, () => {
      accumulatedAudio = []; // Clear accumulated audio after successful playback
    });
  } else {
    console.log('Received message:', response);
  }
});

ws.on('close', () => {
  console.log('WebSocket connection closed.');
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

function startAudioStream(ws) {
  // Initialize mic and start capturing audio
  const micInstance = mic({
    rate: '24000', // Adjust this to match the Speaker configuration
    channels: '1',
    debug: false,
    exitOnSilence: 6,
    fileType: 'wav',
    encoding: 'signed-integer',
  });

  const micInputStream = micInstance.getAudioStream();
  micInputStream.on('error', (error) => {
    console.error('Microphone error:', error);
  });

  micInstance.start();
  console.log('Microphone started streaming.');

  micInputStream.on('data', (data) => {
    if (data.length > 0) {
      // Send audio data to server in chunks
      console.log('Sending audio data chunk to server...');
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: data.toString('base64') }));
    }
  });

  micInputStream.on('silence', () => {
    console.log('Committing audio buffer after silence...');
    ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
  });
}

function playAudio(audioData, callback) {
  try {
    const audioBuffer = Buffer.from(audioData, 'base64');
    const speaker = new Speaker({
      channels: 1,
      sampleRate: 24000, // Adjust this to match the incoming audio format
      bitDepth: 16,
    });

    // Ensure buffer sizes are appropriate
    const readableStream = new Readable({
      highWaterMark: 1024 * 32, // Buffer size to prevent underflow
      read() {
        this.push(audioBuffer);
        this.push(null);
      },
    });

    readableStream.on('error', (error) => {
      console.error('Stream error during playback:', error);
    });

    readableStream.on('end', () => {
      if (callback) callback();
    });

    readableStream.pipe(speaker);
    console.log('Audio played from received stream.');
  } catch (error) {
    console.error('Error playing audio:', error);
  }
}

// Fix for ENOENT 'rec' command not found error
process.env.PATH = `${process.env.PATH}:/usr/local/bin`; // Add common location for 'rec' command
```