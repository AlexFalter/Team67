// Schema-builder fields live on the prototype. Spreading them drops state.
export function snapshot<T extends object>(source: T, defaults: T): T {
  for (const key of Object.keys(defaults) as (keyof T)[]) defaults[key] = source[key];
  return defaults;
}
