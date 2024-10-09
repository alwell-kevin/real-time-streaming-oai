import { RealtimeClient } from '@openai/realtime-api-beta';
import mic from 'mic';
import { Readable } from 'stream';
import Speaker from 'speaker';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) {
  console.error('Please set your OPENAI_API_KEY in your environment variables.');
  process.exit(1);
}

const client = new RealtimeClient({
  apiKey: API_KEY,
  model: 'gpt-4o-realtime-preview-2024-10-01',
});

let micInstance;
let speaker;

async function main() {
  try {
    console.log('Attempting to connect...');
    await client.connect();
    startAudioStream();
    console.log('Connection established successfully.');
  } catch (error) {
    console.error('Error connecting to OpenAI Realtime API:', error);
    console.log('Connection attempt failed. Retrying in 5 seconds...');
    setTimeout(main, 5000);
  }
}

main();


client.on('conversation.item.completed', ({ item }) => {
  console.log('Conversation item completed:', item);
  
  if (item.type === 'message' && item.role === 'assistant' && item.formatted && item.formatted.audio) {
    console.log('Playing audio response...');
    playAudio(item.formatted.audio);
  } else {
    console.log('No audio content in this item.');
  }
});

// BEGIN MANAGE Mac AUDIO INTERFACES

function startAudioStream() {
  try {
    micInstance = mic({
      rate: '24000',
      channels: '1',
      debug: false,
      exitOnSilence: 6,
      fileType: 'raw',
      encoding: 'signed-integer',
    });

    const micInputStream = micInstance.getAudioStream();

    micInputStream.on('error', (error) => {
      console.error('Microphone error:', error);
    });

    micInstance.start();
    console.log('Microphone started streaming.');

    let audioBuffer = Buffer.alloc(0);
    const chunkSize = 4800; // 0.2 seconds of audio at 24kHz

    micInputStream.on('data', (data) => {
      audioBuffer = Buffer.concat([audioBuffer, data]);

      while (audioBuffer.length >= chunkSize) {
        const chunk = audioBuffer.slice(0, chunkSize);
        audioBuffer = audioBuffer.slice(chunkSize);

        const int16Array = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.length / 2);

        try {
          client.appendInputAudio(int16Array);
        } catch (error) {
          console.error('Error sending audio data:', error);
        }
      }
    });

    micInputStream.on('silence', () => {
      console.log('Silence detected, creating response...');
      try {
        client.createResponse();
      } catch (error) {
        console.error('Error creating response:', error);
      }
    });
  } catch (error) {
    console.error('Error starting audio stream:', error);
  }
}

function playAudio(audioData) {
  try {
    if (!speaker) {
      speaker = new Speaker({
        channels: 1,
        bitDepth: 16,
        sampleRate: 24000,
      });
    }

    // Convert Int16Array to Buffer
    const buffer = Buffer.from(audioData.buffer);

    // Create a readable stream from the buffer
    const readableStream = new Readable({
      read() {
        this.push(buffer);
        this.push(null);
      },
    });

    // Pipe the stream to the speaker
    readableStream.pipe(speaker);
    console.log('Audio sent to speaker for playback. Buffer length:', buffer.length);

    // Handle the 'close' event to recreate the speaker for the next playback
    speaker.on('close', () => {
      console.log('Speaker closed. Recreating for next playback.');
      speaker = null;
    });
  } catch (error) {
    console.error('Error playing audio:', error);
  }
}

// END MANAGE AUDIO INTERFACES