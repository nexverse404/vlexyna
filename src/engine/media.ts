/** Media handles — blobs decoded and ready to draw. */
export interface MediaAssets {
  /** Decoded background image, if any. */
  bgImage?: HTMLImageElement;
  /** Background video element (muted, looped), if any. */
  bgVideo?: HTMLVideoElement;
  /** Badge logo image, if any. */
  logo?: HTMLImageElement;
}

export function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = url;
  });
}

export function loadVideoFromBlob(blob: Blob): Promise<HTMLVideoElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error('Could not read that video'));
    v.src = url;
  });
}

/** Frame-exact seek for offline export. Resolves once the frame is paintable. */
export function seekVideo(v: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const target = Math.max(0, Math.min(time, Math.max(0, v.duration - 0.01)));
    if (Math.abs(v.currentTime - target) < 1e-4) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      v.removeEventListener('seeked', finish);
      resolve();
    };
    v.addEventListener('seeked', finish);
    v.currentTime = target;
    // safety net — some browsers stall on rapid seeks
    setTimeout(finish, 250);
  });
}

/** Cover-fit source rect for drawing media of (mw×mh) into (W×H). */
export function coverRect(
  mw: number,
  mh: number,
  W: number,
  H: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(W / mw, H / mh);
  const sw = W / scale;
  const sh = H / scale;
  return { sx: (mw - sw) / 2, sy: (mh - sh) / 2, sw, sh };
}
