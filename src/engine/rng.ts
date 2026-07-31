// Seeded PRNG for deterministic game-year simulation.
// Port of a simple LCG (linear congruential generator) — sufficient for game use.

export class SeededRng {
  private seed: number

  constructor(seed: number) {
    this.seed = seed >>> 0 // Ensure 32-bit unsigned int
  }

  // Returns a random float in [0, 1)
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff
    return this.seed / 0x7fffffff
  }

  // Returns a random int in [min, max] (inclusive)
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  // Gaussian-distributed value (mean 1.0, with stdev tuned by multiplier)
  // Used for harvest yields: baseYield * nextGaussian(0.15) gives ±15% variance
  nextGaussian(stdev: number): number {
    // Box-Muller transform: two uniform [0,1) → one normal
    const u1 = this.next()
    const u2 = this.next()
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    return 1.0 + z0 * stdev
  }

  // Snapshot current seed (for serialization in tests)
  getSeed(): number {
    return this.seed
  }
}
