export class CircuitOpenError extends Error {
  constructor(host: string, retryInSeconds: number) {
    super(`Circuit breaker is open for ${host}; upstream is failing. Try again in ~${retryInSeconds}s.`);
    this.name = "CircuitOpenError";
  }
}
