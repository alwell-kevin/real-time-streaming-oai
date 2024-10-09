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

// Add this function after the existing imports
async function getWeather(location, unit) {
  // This is a mock implementation. In a real scenario, you'd call a weather API.
  console.log(`Getting weather for ${location} in ${unit}`);
  // Simulating an API call delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  return {
    location,
    temperature: unit === 'celsius' ? 22 : 72,
    unit,
    condition: 'Sunny'
  };
}

// Modify the ws.on('message', ...) handler
ws.on('message', async (message) => {
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
  } else if (response.type === 'function_call' && response.function.name === 'get_current_weather') {
    console.log('Received function call for get_current_weather');
    const { location, unit } = response.function.arguments;
    const weatherData = await getWeather(location, unit);
    console.log('Weather data:', weatherData);
    
    // Send the weather data back to OpenAI
    ws.send(JSON.stringify({
      type: 'function_call.result',
      id: response.id,
      result: weatherData
    }));
  } else {
    console.log('Received message:', response);
  }
});

ws.on('open', () => {
  console.log('Connected to OpenAI Realtime API.');
  ws.send(JSON.stringify({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'system',
      content: 'Please assist the user with getting their local weather forecast.',
      tools: [
        {
          type: "function",
          function: {
            name: "get_current_weather",
            description: "Get the current weather for a location",
            parameters: {
              type: "object",
              properties: {
                location: {
                  type: "string",
                  description: "The city and country, e.g., San Francisco, USA"
                },
                unit: {
                  type: "string",
                  enum: ["celsius", "fahrenheit"],
                  description: "The unit of temperature to use"
                }
              },
              required: ["location", "unit"]
            }
          }
        }
      ]
    },
  }));
  startAudioStream(ws);
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