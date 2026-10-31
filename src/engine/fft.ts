/**
 * Iterative radix-2 complex FFT (Cooley–Tukey), forward transform.
 * Standard enough to be boring; precomputed twiddles + bit-reversal table.
 */
export class FFT {
  readonly n: number;
  private readonly levels: number;
  private readonly cosTable: Float32Array;
  private readonly sinTable: Float32Array;
  private readonly rev: Uint32Array;

  constructor(n: number) {
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`FFT size must be a power of two, got ${n}`);
    this.n = n;
    this.levels = Math.round(Math.log2(n));
    this.cosTable = new Float32Array(n / 2);
    this.sinTable = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cosTable[i] = Math.cos((2 * Math.PI * i) / n);
      this.sinTable[i] = Math.sin((2 * Math.PI * i) / n);
    }
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let j = 0; j < this.levels; j++) r = (r << 1) | ((i >>> j) & 1);
      this.rev[i] = r;
    }
  }

  /** In-place forward DFT of (re, im), each length n. */
  transform(re: Float32Array, im: Float32Array): void {
    const { n, rev, cosTable: cos, sinTable: sin } = this;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const tre = re[l] * cos[k] + im[l] * sin[k];
          const tim = -re[l] * sin[k] + im[l] * cos[k];
          re[l] = re[j] - tre;
          im[l] = im[j] - tim;
          re[j] += tre;
          im[j] += tim;
        }
      }
    }
  }
}

export function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}
