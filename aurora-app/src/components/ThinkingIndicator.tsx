import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { colors } from "../constants/colors";

interface ThinkingIndicatorProps {
  message?: string | null;
  toolName?: string | null;
}

export function ThinkingIndicator({
  message,
  toolName,
}: ThinkingIndicatorProps) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  const gradientAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Dot bounce animation
    const createDotAnim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ])
      );

    const anim1 = createDotAnim(dot1, 0);
    const anim2 = createDotAnim(dot2, 200);
    const anim3 = createDotAnim(dot3, 400);

    anim1.start();
    anim2.start();
    anim3.start();

    // Aurora gradient sweep
    const gradient = Animated.loop(
      Animated.timing(gradientAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: false,
      })
    );
    gradient.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
      gradient.stop();
    };
  }, [dot1, dot2, dot3, gradientAnim]);

  const displayText =
    toolName
      ? `Aurora is using ${toolName}...`
      : message || "Aurora is thinking...";

  const backgroundColor = gradientAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [colors.primary, colors.secondary, colors.primary],
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.gradientBar, { backgroundColor }]} />
      <View style={styles.content}>
        <Text style={styles.text}>{displayText}</Text>
        <View style={styles.dots}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  transform: [
                    {
                      translateY: dot.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -6],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  gradientBar: {
    height: 2,
    borderRadius: 1,
    marginBottom: 8,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  text: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  dots: {
    flexDirection: "row",
    gap: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
});
