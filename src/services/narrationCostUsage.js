const MPEG1_LAYER3_BITRATES = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
];
const MPEG2_LAYER3_BITRATES = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
];
const SAMPLE_RATES = [44100, 48000, 32000, 0];

// OpenAI prices gpt-4o-mini-tts output at $12 / 1M audio tokens and
// publishes an estimated $0.015 / generated minute. The Speech endpoint
// returns binary audio without a usage object, so the ledger derives the
// equivalent 1,250 output audio tokens/minute from the real MP3 duration.
export const NARRATION_AUDIO_TOKENS_PER_MINUTE = 1250;

function synchsafeInteger(buffer, offset) {
  return ((buffer[offset] & 0x7f) << 21)
    | ((buffer[offset + 1] & 0x7f) << 14)
    | ((buffer[offset + 2] & 0x7f) << 7)
    | (buffer[offset + 3] & 0x7f);
}

function firstAudioOffset(buffer) {
  if (buffer.length < 10 || buffer.toString("ascii", 0, 3) !== "ID3") return 0;
  const footer = (buffer[5] & 0x10) ? 10 : 0;
  return Math.min(buffer.length, 10 + synchsafeInteger(buffer, 6) + footer);
}

function mp3Frame(buffer, offset) {
  if (offset + 4 > buffer.length || buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) return null;
  const versionBits = (buffer[offset + 1] >> 3) & 0x03;
  const layerBits = (buffer[offset + 1] >> 1) & 0x03;
  if (versionBits === 1 || layerBits !== 1) return null;
  const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f;
  const sampleRateIndex = (buffer[offset + 2] >> 2) & 0x03;
  const padding = (buffer[offset + 2] >> 1) & 0x01;
  const mpeg1 = versionBits === 3;
  const bitrateKbps = (mpeg1 ? MPEG1_LAYER3_BITRATES : MPEG2_LAYER3_BITRATES)[bitrateIndex];
  const divisor = versionBits === 2 ? 2 : versionBits === 0 ? 4 : 1;
  const sampleRate = Math.round(SAMPLE_RATES[sampleRateIndex] / divisor);
  if (!bitrateKbps || !sampleRate) return null;
  const frameLength = Math.floor(((mpeg1 ? 144 : 72) * bitrateKbps * 1000) / sampleRate) + padding;
  if (frameLength < 4 || offset + frameLength > buffer.length) return null;
  return { frameLength, sampleRate, samples: mpeg1 ? 1152 : 576 };
}

export function mp3DurationMs(audio) {
  const buffer = Buffer.isBuffer(audio) ? audio : Buffer.from(audio || []);
  let offset = firstAudioOffset(buffer);
  let durationSeconds = 0;
  let frameCount = 0;
  while (offset + 4 <= buffer.length) {
    const frame = mp3Frame(buffer, offset);
    if (!frame) {
      offset += 1;
      continue;
    }
    durationSeconds += frame.samples / frame.sampleRate;
    frameCount += 1;
    offset += frame.frameLength;
  }
  return frameCount ? Math.round(durationSeconds * 1000) : 0;
}

function estimatedTextTokens(value) {
  const characters = [...String(value || "")].length;
  return characters ? Math.max(1, Math.ceil(characters / 4)) : 0;
}

export function narrationBillableUsage({ text, instructions, audio }) {
  const audioDurationMs = mp3DurationMs(audio);
  if (!audioDurationMs) return null;
  const inputCharacters = [...`${String(text || "")}\n${String(instructions || "")}`].length;
  const inputTokens = estimatedTextTokens(`${String(text || "")}\n${String(instructions || "")}`);
  const outputAudioTokens = Math.max(
    1,
    Math.ceil((audioDurationMs / 60000) * NARRATION_AUDIO_TOKENS_PER_MINUTE),
  );
  return {
    inputTokens,
    outputTokens: outputAudioTokens,
    inputTextTokens: inputTokens,
    outputAudioTokens,
    inputCharacters,
    audioDurationMs,
    estimated: true,
    estimateBasis: "real_mp3_duration_and_official_tts_token_rates",
  };
}
