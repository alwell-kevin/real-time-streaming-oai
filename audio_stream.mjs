// Ensure you have installed these dependencies before running the code:
// npm install ws mic dotenv speaker

import WebSocket from 'ws';
import mic from 'mic';
import { Readable } from 'stream';
import Speaker from 'speaker';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import { setTimeout } from 'timers';

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
    console.log('Received audio delta, preparing to play audio...');
    // Delay playback slightly to avoid feedback loop with microphone
    setTimeout(() => {
      playAudio(response.delta);
    }, 500); // Increase delay to help avoid feedback and ensure proper timing
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
    rate: '8000', // Lower rate to reduce playback speed and sync with OpenAI output
    channels: '1',
    debug: false,
    exitOnSilence: 6,
    fileType: 'wav',
  });

  const micInputStream = micInstance.getAudioStream();
  micInputStream.on('error', (error) => {
    console.error('Microphone error:', error);
  });

  micInstance.start();
  console.log('Microphone started streaming.');

  micInputStream.on('data', (data) => {
    // Send audio data to server in chunks
    ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: data.toString('base64') }));
  });

  micInputStream.on('silence', () => {
    // Commit the audio buffer when silence is detected
    ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
  });
}

function playAudio(audioData) {
  try {
    const audioBuffer = Buffer.from(audioData, 'base64');
    const speaker = new Speaker({
      channels: 1,
      rate: 8000, // Match playback rate to microphone capture rate
      bitDepth: 16,
    });

    const readableStream = new Readable({
      highWaterMark: 1024 * 64, // Further increase buffer size to prevent underflow
      read() {
        this.push(audioBuffer);
        this.push(null);
      },
    });

    readableStream.on('error', (error) => {
      console.error('Stream error during playback:', error);
    });

    readableStream.pipe(speaker);
    console.log('Audio played from received stream.');
  } catch (error) {
    console.error('Error playing audio:', error);
  }
}

// Fix for ENOENT 'rec' command not found error
process.env.PATH = `${process.env.PATH}:/usr/local/bin`; // Add common location for 'rec' command
