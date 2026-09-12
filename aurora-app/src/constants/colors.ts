export const colors = {
  background: "#0A0A0F",
  surface: "#12121A",
  surfaceLight: "#1A1A2E",
  primary: "#00D4AA", // teal aurora
  primaryDim: "#00A080",
  secondary: "#7C3AED", // purple
  secondaryDim: "#5B21B6",
  accent: "#06B6D4", // cyan
  text: "#F0F0F0",
  textMuted: "#8080A0",
  textDim: "#505070",
  error: "#EF4444",
  warning: "#F59E0B",
  success: "#10B981",
  border: "#2A2A3E",
  messageBubbleUser: "#00D4AA",
  messageBubbleAssistant: "#1E1E30",
  inputBackground: "#16162A",
  overlay: "rgba(0, 0, 0, 0.7)",
} as const;

export type ColorKey = keyof typeof colors;
