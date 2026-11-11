import { defaultFeatures, mergeFeatures } from "./features.js";

let current = null;

export function getFeatures() {
  return current ?? defaultFeatures();
}

export function adoptRemoteFeatures(remote) {
  current = mergeFeatures(defaultFeatures(), remote);
  return getFeatures();
}
