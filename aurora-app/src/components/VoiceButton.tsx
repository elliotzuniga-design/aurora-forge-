import React, { useRef, useCallback } from "react";
import {
  TouchableOpacity,
  StyleSheet,
  Animated,
  View,
  Text,
} from "react-native";
import { colors } from "../constants/colors";

interface VoiceButtonProps {
  isListening: boolean;
  isAlwaysListening: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
  onDoubleTap: () => void;
  partialTranscript?: string;
}

export function VoiceButton({
  isListening,
  isAlwaysListening,
  onPressIn,
  onPressOut,
  onDoubleTap,
  partialTranscript,
}: VoiceButtonProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const lastTapRef = useRef(0);

  // Pulse animation when listening
  React.useEffect(() => {
    if (isListening) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening, pulseAnim]);

  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      onDoubleTap();
    }
    lastTapRef.current = now;
  }, [onDoubleTap]);

  const ringColor = isAlwaysListening
    ? colors.success
    : isListening
      ? colors.error
      : colors.primary;

  return (
    <View style={styles.wrapper}>
      {partialTranscript ? (
        <Text style={styles.partialText} numberOfLines={1}>
          {partialTranscript}
        </Text>
      ) : null}

      <TouchableOpacity
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <Animated.View
          style={[
            styles.button,
            { transform: [{ scale: pulseAnim }] },
            { borderColor: ringColor },
            isListening && styles.listening,
          ]}
        >
          <Text style={styles.icon}>
            {isListening ? "🎙" : "🎤"}
          </Text>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
  },
  partialText: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 4,
    maxWidth: 200,
    textAlign: "center",
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  listening: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  icon: {
    fontSize: 20,
  },
});
