const SAMPLE_RATE = 22050;
const MAX_AMPLITUDE = 32767; // 16-bit signed

export type AudioKind = 'music' | 'sfx';

export interface AudioRequestItem {
  query: string;
  output: string;
  duration?: number;
}

export interface AudioGenerationRequest {
  music?: AudioRequestItem[];
  soundEffects?: AudioRequestItem[];
}

export interface GeneratedAudioFile {
  kind: AudioKind;
  filename: string;
  mimeType: string;
  blob: Blob;
}

class MusicGenerator {
  private generateSquareWave(freq: number, duration: number, sampleRate: number = SAMPLE_RATE): Int16Array {
    const sampleCount = Math.floor(sampleRate * duration);
    const samples = new Int16Array(sampleCount);

    for (let i = 0; i < sampleCount; i++) {
      const t = i / sampleRate;
      const value = Math.sign(Math.sin(2 * Math.PI * freq * t));
      samples[i] = value * MAX_AMPLITUDE * 0.3;
    }

    return samples;
  }

  private generate8BitSequence(numNotes: number, noteDuration: number): Int16Array {
    const noteFreqs: Record<string, number> = {
      C: 261.63,
      D: 293.66,
      E: 329.63,
      F: 349.23,
      G: 392.0,
      A: 440.0,
      B: 493.88,
      C5: 523.25,
    };
    const noteNames = Object.keys(noteFreqs);

    // Roughly match Python logic: sequence of notes with small gaps
    const silenceDuration = 0.05;
    const noteSamples = Math.floor(SAMPLE_RATE * noteDuration);
    const silenceSamples = Math.floor(SAMPLE_RATE * silenceDuration);
    const totalSamples = numNotes * (noteSamples + silenceSamples);
    const result = new Int16Array(totalSamples);

    let offset = 0;
    for (let i = 0; i < numNotes; i++) {
      const name = noteNames[Math.floor(Math.random() * noteNames.length)];
      const freq = noteFreqs[name];
      const wave = this.generateSquareWave(freq, noteDuration);

      result.set(wave, offset);
      offset += noteSamples;

      // silence
      offset += silenceSamples;
    }

    return result;
  }

  generateMusicBytes(durationNotes: number = 256): Int16Array {
    const clampedNotes = Math.max(8, Math.min(durationNotes, 512));
    // Slightly vary note duration for more life
    const noteDuration = 0.35;
    return this.generate8BitSequence(clampedNotes, noteDuration);
  }

  generateSfxBytes(kind: string = 'generic'): Int16Array {
    // Map requested query/kind to different feel
    const lower = kind.toLowerCase();
    if (lower.includes('coin') || lower.includes('collect')) {
      // short, bright blip
      return this.generate8BitSequence(4, 0.12);
    }
    if (lower.includes('jump')) {
      return this.generate8BitSequence(6, 0.1);
    }
    if (lower.includes('explosion') || lower.includes('boom')) {
      return this.generate8BitSequence(10, 0.07);
    }
    // generic UI / click
    return this.generate8BitSequence(3, 0.09);
  }
}

/**
 * Very small WAV encoder for 16‑bit mono PCM.
 * Returns a Blob that can be used as an <audio> source.
 */
function pcm16ToWavBlob(pcm: Int16Array, sampleRate: number = SAMPLE_RATE): Blob {
  const bytesPerSample = 2;
  const numChannels = 1;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  let offset = 0;

  // RIFF header
  writeString(view, offset, 'RIFF');
  offset += 4;
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeString(view, offset, 'WAVE');
  offset += 4;

  // fmt chunk
  writeString(view, offset, 'fmt ');
  offset += 4;
  view.setUint32(offset, 16, true); // PCM chunk size
  offset += 4;
  view.setUint16(offset, 1, true); // format = PCM
  offset += 2;
  view.setUint16(offset, numChannels, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, bytesPerSample * 8, true); // bits per sample
  offset += 2;

  // data chunk
  writeString(view, offset, 'data');
  offset += 4;
  view.setUint32(offset, dataSize, true);
  offset += 4;

  // PCM data
  for (let i = 0; i < pcm.length; i++, offset += 2) {
    view.setInt16(offset, pcm[i], true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/**
 * High-level helper that roughly повторяет контракт Python‑эндпоинта:
 * принимает массивы music/sound_effects и возвращает список Blob‑файлов.
 */
export async function generateAudioAssets(
  request: AudioGenerationRequest,
): Promise<GeneratedAudioFile[]> {
  const mg = new MusicGenerator();
  const result: GeneratedAudioFile[] = [];

  const musicItems = request.music ?? [];
  const sfxItems = request.soundEffects ?? [];

  for (const item of musicItems) {
    if (!item.query || !item.output) continue;
    const duration = typeof item.duration === 'number' ? item.duration : 256;
    const pcm = mg.generateMusicBytes(duration);
    const blob = pcm16ToWavBlob(pcm);
    result.push({
      kind: 'music',
      filename: item.output.endsWith('.wav') ? item.output : `${item.output}.wav`,
      mimeType: 'audio/wav',
      blob,
    });
  }

  for (const item of sfxItems) {
    if (!item.query || !item.output) continue;
    const pcm = mg.generateSfxBytes(item.query);
    const blob = pcm16ToWavBlob(pcm);
    result.push({
      kind: 'sfx',
      filename: item.output.endsWith('.wav') ? item.output : `${item.output}.wav`,
      mimeType: 'audio/wav',
      blob,
    });
  }

  return result;
}


