import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Props = {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /**
   * On iOS, added to the top safe inset so the view clears stack/tab headers.
   */
  iosHeaderOffset?: number
  /**
   * When false, `keyboardVerticalOffset` does not add `insets.top` (use when the parent
   * `SafeAreaView` already insets the top, or for tab content that starts below the safe area).
   */
  includeTopSafeArea?: boolean
  /**
   * When set (iOS only), used as the full `keyboardVerticalOffset` — ignores
   * `includeTopSafeArea` and `iosHeaderOffset`. Use for nested tabs or custom chrome.
   */
  iosKeyboardOffsetOverride?: number
}

/**
 * Standard keyboard avoidance for scrollable forms and tab/chat layouts.
 * On Android, pair with Expo `android.softwareKeyboardLayoutMode: resize`.
 */
export function KeyboardSafeView({
  children,
  style,
  iosHeaderOffset = 0,
  includeTopSafeArea = true,
  iosKeyboardOffsetOverride,
}: Props) {
  const insets = useSafeAreaInsets()
  let keyboardVerticalOffset = 0
  if (Platform.OS === 'ios') {
    if (typeof iosKeyboardOffsetOverride === 'number') {
      keyboardVerticalOffset = iosKeyboardOffsetOverride
    } else {
      keyboardVerticalOffset = (includeTopSafeArea ? insets.top : 0) + iosHeaderOffset
    }
  }

  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  )
}
