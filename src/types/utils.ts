export type DeepImmutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends Array<infer U>
    ? ReadonlyArray<DeepImmutable<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepImmutable<T[K]> }
      : T

export type Permutations<T extends string> = T
