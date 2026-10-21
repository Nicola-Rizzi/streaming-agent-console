/**
 * "Random" numbers in [0, 1) that repeat for the same seed, so a failing test variant
 * can be replayed. Park–Miller: each number is the previous one times 48271, modulo 2³¹ − 1.
 */
export function seeded(seed: number): () => number {
  const modulus = 2_147_483_647;
  let state = seed % modulus || 1; // 0 would stay 0 forever
  return () => {
    state = (state * 48_271) % modulus;
    return (state - 1) / (modulus - 1);
  };
}
