import { Alert, AlertButton, Platform } from 'react-native';

// Web-aware replacement for React Native's Alert.alert.
//
// On native it delegates straight to Alert.alert. On web, where Alert.alert is
// a silent no-op, it maps to the browser equivalents:
//   * 0–1 buttons        -> window.alert, then runs the button's onPress
//   * 2+ buttons         -> window.confirm; OK runs the first non-cancel
//                           button's onPress, Cancel runs the cancel button's.
//
// Signature matches Alert.alert so call sites only change the function name.
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const body = [title, message].filter(Boolean).join('\n\n');

  if (!buttons || buttons.length <= 1) {
    window.alert(body);
    buttons?.[0]?.onPress?.();
    return;
  }

  const confirmBtn = buttons.find(b => b.style !== 'cancel') ?? buttons[buttons.length - 1];
  const cancelBtn = buttons.find(b => b.style === 'cancel');
  if (window.confirm(body)) {
    confirmBtn?.onPress?.();
  } else {
    cancelBtn?.onPress?.();
  }
}

// Web-aware single-field text prompt. Alert.prompt is iOS-only, so this maps to
// window.prompt on web. Android has no native text prompt, so it proceeds with
// the supplied default value rather than failing silently.
export function showPrompt(
  title: string,
  message: string,
  onSubmit: (value: string) => void,
  defaultValue = '',
) {
  if (Platform.OS === 'web') {
    const result = window.prompt([title, message].filter(Boolean).join('\n\n'), defaultValue);
    if (result !== null && result.trim()) onSubmit(result);
    return;
  }
  if (Platform.OS === 'ios') {
    Alert.prompt(title, message, onSubmit, 'plain-text', defaultValue);
    return;
  }
  onSubmit(defaultValue);
}
