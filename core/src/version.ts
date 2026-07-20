import { createRequire } from "node:module";

/**
 * Version des Cores, gelesen aus der eigenen package.json.
 * Wir nutzen createRequire, weil das JSON zuverlässig sowohl unter tsx
 * (Dev) als auch unter Vitest lädt, ohne Import-Attribute zu brauchen.
 */
const requireFromHere = createRequire(import.meta.url);
const pkg = requireFromHere("../package.json") as { version: string };

export const version: string = pkg.version;
