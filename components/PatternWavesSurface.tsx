import { useMemo, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { PATTERN_WAVES_OFFLINE_HTML } from '@/constants/patternWavesHtml';
import { lightColors } from '@/constants/theme';

const DEFAULT_BG = lightColors.accent; // coral #F06B55

type Props = {
  height?: number;
  interactive?: boolean;
  /** Silk / CSS fallback fill (coral promo or white visit tile). */
  bgColor?: string;
  /** Dot ink. Default stays white so splash/promo waves are unchanged. */
  dotColor?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Fires when the PatternWaves document has loaded (CSS fallback + scripts). */
  onReady?: () => void;
};

function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  const n = Number.parseInt(raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function injectWavesHtml(base: string, interactive: boolean, bgColor: string, dotColor?: string) {
  let html = base;
  html = html.replace(
    "const interactive = params.get('interactive') === '1';",
    `const interactive = ${interactive ? 'true' : 'false'};`
  );
  html = html.replace(
    "const backgroundColor = params.get('bg') || '#F06B55';",
    `const backgroundColor = '${bgColor}';`
  );
  if (dotColor) {
    html = html.replace("const color = params.get('color') || '#ffffff';", `const color = '${dotColor}';`);
    const [r, g, b] = hexToRgb(dotColor);
    html = html
      .split('rgba(255,255,255,.26)')
      .join(`rgba(${r},${g},${b},.55)`)
      .split('rgba(255,255,255,.2)')
      .join(`rgba(${r},${g},${b},.42)`)
      .split('rgba(255,255,255,.16)')
      .join(`rgba(${r},${g},${b},.32)`);
  }
  // CSS body + fallback use hardcoded coral — swap when themed.
  if (bgColor.toUpperCase() !== '#F06B55') {
    html = html.split('#F06B55').join(bgColor);
  }
  return html;
}

/**
 * Exact reactbits PatternWaves (silk preset) — original GLSL + ogl.
 * https://reactbits.dev/r/PatternWaves-JS-TW
 */
export function PatternWavesSurface({
  height,
  interactive = false,
  bgColor = DEFAULT_BG,
  dotColor,
  style,
  children,
  onReady
}: Props) {
  const html = useMemo(() => {
    const base = PATTERN_WAVES_OFFLINE_HTML || '';
    if (!base) return '';
    return injectWavesHtml(base, interactive, bgColor, dotColor);
  }, [interactive, bgColor, dotColor]);

  const source = useMemo(
    () => ({
      html: html || `<html><body style="background:${bgColor}"></body></html>`,
      baseUrl: 'https://localhost/'
    }),
    [html, bgColor]
  );

  return (
    <View style={[styles.wrap, { backgroundColor: bgColor }, height != null && { height }, style]}>
      <WebView
        source={source}
        style={[styles.web, { backgroundColor: bgColor }]}
        originWhitelist={['*']}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
        androidLayerType="hardware"
        onLoadEnd={() => onReady?.()}
        {...(Platform.OS === 'ios' ? { allowsLinkPreview: false } : {})}
        pointerEvents={interactive ? 'auto' : 'none'}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: DEFAULT_BG
  },
  web: {
    ...StyleSheet.absoluteFill,
    backgroundColor: DEFAULT_BG
  }
});
