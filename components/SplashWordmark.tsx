import { Image } from 'expo-image';

const source = require('@/assets/splash-logo-wordmark.png');

/** Must match Android MainActivity launch bridge (widthPx * 0.72, true center). */
export const SPLASH_LOGO_WIDTH_RATIO = 0.72;
/** Wordmark intrinsic aspect (706×243). */
export const SPLASH_LOGO_ASPECT = 243 / 706;

export function splashLogoWidth(screenWidth: number) {
  return screenWidth * SPLASH_LOGO_WIDTH_RATIO;
}

export function splashLogoHeight(logoWidth: number) {
  return logoWidth * SPLASH_LOGO_ASPECT;
}

type Props = {
  width: number;
  onLoad?: () => void;
};

/** CutLy + GROOMING MADE EASY — same asset/size as native splash_logo_wordmark. */
export function SplashWordmark({ width, onLoad }: Props) {
  const height = splashLogoHeight(width);
  return (
    <Image
      source={source}
      accessibilityLabel="CutLy"
      contentFit="contain"
      style={{ width, height }}
      onLoad={onLoad}
      cachePolicy="memory-disk"
    />
  );
}
