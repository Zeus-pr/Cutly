/** Expo SDK 57 — Reanimated plugin comes via babel-preset-expo (no manual plugin entry). */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo']
  };
};
