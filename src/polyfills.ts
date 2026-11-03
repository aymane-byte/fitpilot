// Compatibilité avec les iPhone plus anciens (iOS 15.0–15.3) : méthodes récentes utilisées par l'app.
function at<T>(this: ArrayLike<T>, i: number): T | undefined {
  const n = Math.trunc(i) || 0;
  const k = n < 0 ? this.length + n : n;
  return k >= 0 && k < this.length ? this[k] : undefined;
}
for (const C of [Array, String, Int8Array, Uint8Array, Float32Array, Float64Array] as unknown as { prototype: { at?: unknown } }[]) {
  if (!C.prototype.at) Object.defineProperty(C.prototype, 'at', { value: at, writable: true, configurable: true });
}
if (!Object.hasOwn) Object.defineProperty(Object, 'hasOwn', { value: (o: object, k: PropertyKey) => Object.prototype.hasOwnProperty.call(o, k), writable: true, configurable: true });
