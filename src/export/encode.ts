/**
 * Export: renders the scene frame-by-frame and encodes a real video file.
 *
 * Primary path — WebCodecs (Chrome/Edge): H.264 + AAC muxed into MP4 via
 * mp4-muxer. Renders offline (deterministic, usually faster than realtime,
 * keeps running in a background tab).
 *
 * Fallback — MediaRecorder (Safari/Firefox): realtime capture to WebM.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { Scene } from '../engine/scene';
import { renderFrame } from '../engine/scene';
import { seekVideo } from '../engine/media';

export interface ExportRequest {
  scene: Scene;
  audioBuffer: AudioBuffer;
  trimStart: number;
  trimEnd: number;
  width: number;
  height: number;
  fps: number;
  quality: 'low' | 'medium' | 'high';
  onProgress: (fraction: number, label: string) => void;
  shouldCancel: () => boolean;
}

export interface ExportResult {
  blob: Blob;
  extension: 'mp4' | 'webm';
  mode: 'webcodecs' | 'mediarecorder';
}

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled');
  }
}

const BITRATE_FACTOR: Record<'low' | 'medium' | 'high', number> = {
  low: 0.05,
  medium: 0.09,
  high: 0.15,
};

/** MessageChannel yields are not throttled in background tabs. */
function microtaskYield(): Promise<void> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(0);
  });
}

function avcCodec(w: number, h: number, fps: number): string {
  const level = w * h * fps > 1920 * 1080 * 45 ? 0x34 : 0x28; // level 4.2 : 4.0
  return `avc1.4d00${level.toString(16).padStart(2, '0')}`;
}

export function canUseWebCodecs(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

export async function exportVideo(req: ExportRequest): Promise<ExportResult> {
  if (canUseWebCodecs()) {
    try {
      return await exportWebCodecs(req);
    } catch (err) {
      if (err instanceof ExportCancelled) throw err;
      // fall through to MediaRecorder on any encoder failure
      console.warn('WebCodecs export failed, falling back to MediaRecorder:', err);
      req.onProgress(0, 'Falling back to realtime capture');
    }
  }
  return exportMediaRecorder(req);
}

// ---------------------------------------------------------------------------
// WebCodecs path
// ---------------------------------------------------------------------------

async function exportWebCodecs(req: ExportRequest): Promise<ExportResult> {
  const { scene, width: W, height: H, fps, quality } = req;
  const duration = Math.max(0.1, req.trimEnd - req.trimStart);
  const totalFrames = Math.max(1, Math.round(duration * fps));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not create a 2D context');

  const bitrate = Math.round(W * H * fps * BITRATE_FACTOR[quality]);
  const videoCfg: VideoEncoderConfig = {
    codec: avcCodec(W, H, fps),
    width: W,
    height: H,
    bitrate,
    framerate: fps,
  };
  const videoSupport = await VideoEncoder.isConfigSupported(videoCfg);
  if (!videoSupport.supported) {
    videoCfg.codec = 'avc1.420028'; // baseline retry
    const retry = await VideoEncoder.isConfigSupported(videoCfg);
    if (!retry.supported) throw new Error('H.264 encoding not available');
  }

  // audio (optional — a silent export beats a failed one)
  let audioCfg: AudioEncoderConfig | null = null;
  const sr = req.audioBuffer.sampleRate;
  const ch = Math.min(2, req.audioBuffer.numberOfChannels);
  for (const cfg of [
    { codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: ch, bitrate: 192_000 },
    { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 192_000 },
  ]) {
    const s = await AudioEncoder.isConfigSupported(cfg).catch(() => null);
    if (s?.supported) {
      audioCfg = cfg;
      break;
    }
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    fastStart: 'in-memory',
    video: { codec: 'avc', width: W, height: H, frameRate: fps },
    ...(audioCfg ? { audio: { codec: 'aac', numberOfChannels: audioCfg.numberOfChannels, sampleRate: audioCfg.sampleRate } } : {}),
  });

  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });
  videoEncoder.configure(videoCfg);

  // --- audio pass (quick) ---------------------------------------------------
  if (audioCfg) {
    req.onProgress(0.02, 'Encoding audio');
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        encoderError = e instanceof Error ? e : new Error(String(e));
      },
    });
    audioEncoder.configure(audioCfg);

    const buf = req.audioBuffer;
    const outSr = audioCfg.sampleRate;
    const totalOut = Math.floor(duration * outSr);
    const CH = audioCfg.numberOfChannels;
    const chunkFrames = 4800;
    for (let off = 0; off < totalOut; off += chunkFrames) {
      const n = Math.min(chunkFrames, totalOut - off);
      const data = new Float32Array(n * CH);
      const srcT = req.trimStart + off / outSr;
      for (let c = 0; c < CH; c++) {
        const srcCh = buf.getChannelData(Math.min(c, buf.numberOfChannels - 1));
        const srcSr = buf.sampleRate;
        const start = Math.floor(srcT * srcSr);
        for (let i = 0; i < n; i++) {
          const pos = start + Math.floor((i * srcSr) / outSr);
          data[c * n + i] = srcCh[Math.min(pos, srcCh.length - 1)] ?? 0;
        }
      }
      const ad = new AudioData({
        format: 'f32-planar',
        sampleRate: outSr,
        numberOfFrames: n,
        numberOfChannels: CH,
        timestamp: Math.round((off / outSr) * 1e6),
        data,
      });
      audioEncoder.encode(ad);
      ad.close();
      if (audioEncoder.encodeQueueSize > 24) await microtaskYield();
    }
    await audioEncoder.flush();
    audioEncoder.close();
    if (encoderError) throw encoderError;
  }

  // --- video pass -----------------------------------------------------------
  const bgVideo = scene.media.bgVideo;
  const wasPaused = bgVideo?.paused ?? true;
  bgVideo?.pause();

  const keyEvery = Math.max(1, Math.round(fps * 2));
  try {
    for (let i = 0; i < totalFrames; i++) {
      if (req.shouldCancel()) throw new ExportCancelled();
      if (encoderError) throw encoderError;

      const t = req.trimStart + i / fps;
      if (bgVideo && bgVideo.duration > 0 && Number.isFinite(bgVideo.duration)) {
        await seekVideo(bgVideo, t % bgVideo.duration);
      }
      renderFrame(scene, ctx, W, H, t);

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1e6) / fps),
        duration: Math.round(1e6 / fps),
      });
      videoEncoder.encode(frame, { keyFrame: i % keyEvery === 0 });
      frame.close();

      while (videoEncoder.encodeQueueSize > 6) await microtaskYield();
      if (i % 20 === 0) {
        req.onProgress(0.05 + 0.9 * (i / totalFrames), `Rendering ${i + 1} / ${totalFrames}`);
        await microtaskYield();
      }
    }
    await videoEncoder.flush();
    muxer.finalize();
  } finally {
    if (videoEncoder.state !== 'closed') videoEncoder.close();
    if (!wasPaused && bgVideo) bgVideo.play().catch(() => undefined);
  }

  if (encoderError) throw encoderError;
  const buffer = (muxer.target as ArrayBufferTarget).buffer;
  return {
    blob: new Blob([buffer], { type: 'video/mp4' }),
    extension: 'mp4',
    mode: 'webcodecs',
  };
}

// ---------------------------------------------------------------------------
// MediaRecorder fallback (realtime)
// ---------------------------------------------------------------------------

async function exportMediaRecorder(req: ExportRequest): Promise<ExportResult> {
  const { scene, width: W, height: H } = req;
  const duration = Math.max(0.1, req.trimEnd - req.trimStart);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not create a 2D context');

  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;

  const actx = new AudioContext();
  const dest = actx.createMediaStreamDestination();
  const src = actx.createBufferSource();
  src.buffer = req.audioBuffer;
  src.connect(dest);
  for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);

  const mimeCandidates = [
    'video/mp4;codecs=avc1.42001f,mp4a.40.2',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 10_000_000 } : undefined);
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const bgVideo = scene.media.bgVideo;
  if (bgVideo && Number.isFinite(bgVideo.duration) && bgVideo.duration > 0) {
    bgVideo.currentTime = req.trimStart % bgVideo.duration;
    bgVideo.play().catch(() => undefined);
  }

  const done = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start(500);
  const startAt = actx.currentTime + 0.1;
  src.start(startAt, req.trimStart, duration);

  const isMp4 = (recorder.mimeType || mimeType).includes('mp4');
  let raf = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const step = () => {
        if (req.shouldCancel()) {
          reject(new ExportCancelled());
          return;
        }
        const elapsed = actx.currentTime - startAt;
        const t = req.trimStart + Math.max(0, Math.min(elapsed, duration));
        renderFrame(scene, ctx, W, H, t);
        track.requestFrame();
        req.onProgress(Math.max(0, elapsed / duration), 'Recording in realtime — keep this tab visible');
        if (elapsed >= duration + 0.1) {
          resolve();
          return;
        }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
  } finally {
    cancelAnimationFrame(raf);
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
    recorder.stop();
    bgVideo?.pause();
  }

  await done;
  await actx.close();
  return {
    blob: new Blob(chunks, { type: isMp4 ? 'video/mp4' : 'video/webm' }),
    extension: isMp4 ? 'mp4' : 'webm',
    mode: 'mediarecorder',
  };
}
