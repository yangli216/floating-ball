export interface PcmWavFormat {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
}

interface ParsedPcmWav {
  format: PcmWavFormat;
  pcm: Uint8Array;
}

function readFourCc(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function writeFourCc(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function parsePcmWav(buffer: ArrayBuffer): ParsedPcmWav {
  const view = new DataView(buffer);
  if (
    buffer.byteLength < 44
    || readFourCc(view, 0) !== 'RIFF'
    || readFourCc(view, 8) !== 'WAVE'
  ) {
    throw new Error('录音分段不是有效的 WAV 文件');
  }

  let format: PcmWavFormat | null = null;
  let pcm: Uint8Array | null = null;
  let offset = 12;

  while (offset + 8 <= buffer.byteLength) {
    const chunkId = readFourCc(view, offset);
    const declaredSize = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + declaredSize;
    if (dataEnd > buffer.byteLength) {
      throw new Error('录音分段 WAV 数据不完整');
    }

    if (chunkId === 'fmt ' && declaredSize >= 16) {
      format = {
        audioFormat: view.getUint16(dataOffset, true),
        channels: view.getUint16(dataOffset + 2, true),
        sampleRate: view.getUint32(dataOffset + 4, true),
        byteRate: view.getUint32(dataOffset + 8, true),
        blockAlign: view.getUint16(dataOffset + 12, true),
        bitsPerSample: view.getUint16(dataOffset + 14, true),
      };
    } else if (chunkId === 'data') {
      pcm = new Uint8Array(buffer.slice(dataOffset, dataEnd));
    }

    offset = dataEnd + (declaredSize % 2);
  }

  if (!format || !pcm || format.audioFormat !== 1) {
    throw new Error('录音分段必须是 PCM WAV');
  }

  return { format, pcm };
}

function hasSameFormat(left: PcmWavFormat, right: PcmWavFormat): boolean {
  return left.audioFormat === right.audioFormat
    && left.channels === right.channels
    && left.sampleRate === right.sampleRate
    && left.byteRate === right.byteRate
    && left.blockAlign === right.blockAlign
    && left.bitsPerSample === right.bitsPerSample;
}

export function appendVoiceTranscript(prefix: string, segment: string): string {
  const normalizedPrefix = prefix.trim();
  const normalizedSegment = segment.trim();
  if (!normalizedPrefix) return normalizedSegment;
  if (!normalizedSegment) return normalizedPrefix;
  return `${normalizedPrefix}\n${normalizedSegment}`;
}

/**
 * AudioRecorder 每段都输出同规格 PCM WAV。续采确认时只拼 PCM 数据并重写单个 WAV 头，
 * 避免直接串联多个 RIFF 文件后生成无法播放或无法上传的音频。
 */
export async function mergeVoiceRecordingSegments(segments: Blob[]): Promise<Blob> {
  const availableSegments = segments.filter((segment) => segment.size > 0);
  if (availableSegments.length === 0) {
    return new Blob([], { type: 'audio/wav' });
  }
  if (availableSegments.length === 1) {
    return availableSegments[0];
  }

  const parsedSegments = await Promise.all(
    availableSegments.map(async (segment) => parsePcmWav(await segment.arrayBuffer())),
  );
  const format = parsedSegments[0].format;
  if (parsedSegments.some((segment) => !hasSameFormat(segment.format, format))) {
    throw new Error('续采录音分段的采样格式不一致');
  }

  const pcmLength = parsedSegments.reduce((total, segment) => total + segment.pcm.byteLength, 0);
  const output = new ArrayBuffer(44 + pcmLength);
  const view = new DataView(output);
  writeFourCc(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmLength, true);
  writeFourCc(view, 8, 'WAVE');
  writeFourCc(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format.audioFormat, true);
  view.setUint16(22, format.channels, true);
  view.setUint32(24, format.sampleRate, true);
  view.setUint32(28, format.byteRate, true);
  view.setUint16(32, format.blockAlign, true);
  view.setUint16(34, format.bitsPerSample, true);
  writeFourCc(view, 36, 'data');
  view.setUint32(40, pcmLength, true);

  const pcmOutput = new Uint8Array(output, 44);
  let pcmOffset = 0;
  for (const segment of parsedSegments) {
    pcmOutput.set(segment.pcm, pcmOffset);
    pcmOffset += segment.pcm.byteLength;
  }

  return new Blob([output], { type: 'audio/wav' });
}
