import React, { useRef } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  KeyboardType,
} from 'react-native';

const COLORS = {
  dark: '#0f0f0f',
  card: '#1a1a1a',
  accent: '#ff006e',
  textPrimary: '#ffffff',
  textSecondary: '#b0b0b0',
};

interface OtpInputProps {
  value: string;
  onChangeText: (text: string) => void;
  disabled?: boolean;
  length?: number;
}

export function OtpInput({
  value,
  onChangeText,
  disabled = false,
  length = 6,
}: OtpInputProps) {
  const inputs = useRef<TextInput[]>([]);

  const handleChange = (text: string, index: number) => {
    const newValue = value.split('');
    newValue[index] = text;
    const combined = newValue.join('');

    // Only allow digits
    if (!/^\d*$/.test(combined)) {
      return;
    }

    if (combined.length <= length) {
      onChangeText(combined);

      // Auto-focus next input
      if (text && index < length - 1) {
        inputs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyPress = (nativeEvent: any, index: number) => {
    if (nativeEvent.key === 'Backspace' && !value[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.container}>
      {Array.from({ length }).map((_, index) => (
        <TextInput
          key={index}
          ref={(ref) => {
            if (ref) inputs.current[index] = ref;
          }}
          style={styles.input}
          keyboardType="number-pad"
          maxLength={1}
          value={value[index] || ''}
          onChangeText={(text) => handleChange(text, index)}
          onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent, index)}
          editable={!disabled}
          selectTextOnFocus
          placeholderTextColor={COLORS.textSecondary}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  input: {
    flex: 1,
    height: 60,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 2,
    borderColor: COLORS.card,
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
});
