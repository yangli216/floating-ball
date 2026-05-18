import type { RegionalSpeechUploadPayload } from './types';

function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function resolveAudioExtension(mimeType?: string, format?: string): string {
  if (mimeType === 'audio/webm') return '.webm';
  if (mimeType === 'audio/wav' || mimeType === 'audio/wave') return '.wav';
  if (mimeType === 'audio/mpeg') return '.mp3';
  if (mimeType === 'audio/mp4') return '.m4a';
  if (mimeType === 'audio/ogg') return '.ogg';
  if (mimeType === 'audio/pcm' || format === 'pcm') return '.pcm';
  return '.bin';
}

export async function buildRegionalSpeechUploadPayload(
  blob: Blob,
  options: {
    mimeType?: string;
    format?: string;
    fileName?: string;
    scene?: string;
  } = {}
): Promise<RegionalSpeechUploadPayload> {
  const mimeType = options.mimeType || blob.type || (options.format === 'pcm' ? 'audio/pcm' : undefined);
  const scene = options.scene || 'speech';
  const fileName = options.fileName || `${scene}-${Date.now()}${resolveAudioExtension(mimeType, options.format)}`;

  return {
    audio: arrayBufferToBase64(await blob.arrayBuffer()),
    mimeType,
    format: options.format,
    fileName,
    scene,
  };
}
