import { Platform, TurboModuleRegistry, UIManager } from 'react-native';

/** True when the native @react-native-community/datetimepicker is linked in this binary. */
export function canUseNativeTimePicker(): boolean {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    // Package registers both; getEnforcing('RNCDatePicker') is what crashes on old APKs.
    return (
      TurboModuleRegistry.get('RNCTimePicker') != null ||
      TurboModuleRegistry.get('RNCDatePicker') != null
    );
  }
  if (Platform.OS === 'ios') {
    return (
      UIManager.getViewManagerConfig?.('RNDateTimePicker') != null ||
      UIManager.hasViewManagerConfig?.('RNDateTimePicker') === true
    );
  }
  return false;
}
