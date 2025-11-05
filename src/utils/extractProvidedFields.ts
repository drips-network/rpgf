export type ExtractFieldConfig<T extends object> = {
  [K in keyof T]?: ((value: T[K]) => unknown) | true;
};

type ConfigKeys<T extends object, C extends ExtractFieldConfig<T>> = Extract<
  keyof C,
  keyof T
>;

export type ExtractedUpdates<
  T extends object,
  C extends ExtractFieldConfig<T>,
> = Partial<{
  [K in ConfigKeys<T, C>]: C[K] extends (value: T[K]) => infer R ? R : T[K];
}>;

/**
 * Collects a subset of fields from a DTO, returning only those that were explicitly provided
 * (i.e. present on the object, even if their value is `null`). Each collected field may optionally
 * be transformed before being returned in the updates object.
 */
export function extractProvidedFields<
  T extends object,
  C extends ExtractFieldConfig<T>,
>(
  source: T,
  config: C,
): {
  updates: ExtractedUpdates<T, C>;
  has: <K extends ConfigKeys<T, C>>(key: K) => boolean;
} {
  const updates = {} as ExtractedUpdates<T, C>;
  const providedKeys = new Set<ConfigKeys<T, C>>();

  (Object.keys(config) as ConfigKeys<T, C>[]).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      providedKeys.add(key);
      const transform = config[key];
      const rawValue = source[key];

      if (typeof transform === "function") {
        updates[key] = (transform as (value: unknown) => unknown)(rawValue) as ExtractedUpdates<T, C>[typeof key];
      } else {
        updates[key] = rawValue as ExtractedUpdates<T, C>[typeof key];
      }
    }
  });

  return {
    updates,
    has(key) {
      return providedKeys.has(key);
    },
  };
}
