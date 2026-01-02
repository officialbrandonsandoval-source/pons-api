/**
 * PONS Voice Service
 * Uses OpenAI TTS for human-like speech
 */

import OpenAI from 'openai';

let openai = null;

export function initVoice() {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('✓ OpenAI Voice initialized');
    return true;
  }
  console.warn('⚠ OPENAI_API_KEY not set - voice disabled');
  return false;
}

/**
 * Generate speech from text
 * @param {string} text - Text to speak
 * @param {string} voice - Voice: alloy, echo, fable, onyx, nova, shimmer
 * @returns {Buffer} MP3 audio buffer
 */
export async function generateSpeech(text, voice = 'nova') {
  if (!openai) {
    throw new Error('Voice not initialized - OPENAI_API_KEY required');
  }

  // nova = warm female, onyx = deep male, alloy = neutral
  const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  const selectedVoice = validVoices.includes(voice) ? voice : 'nova';

  const response = await openai.audio.speech.create({
    model: 'tts-1-hd', // HD model for best quality
    voice: selectedVoice,
    input: text,
    response_format: 'mp3',
    speed: 1.0
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer;
}

/**
 * Available voices with descriptions
 */
export const VOICES = {
  nova: { name: 'Nova', description: 'Warm, friendly female voice', default: true },
  onyx: { name: 'Onyx', description: 'Deep, authoritative male voice' },
  alloy: { name: 'Alloy', description: 'Neutral, balanced voice' },
  echo: { name: 'Echo', description: 'Soft, clear male voice' },
  fable: { name: 'Fable', description: 'Expressive, dynamic voice' },
  shimmer: { name: 'Shimmer', description: 'Bright, energetic female voice' }
};

export default { initVoice, generateSpeech, VOICES };
