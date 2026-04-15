// Aurora Backend API Configuration
// In production, this points to your home server via Tailscale
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";

// Timeouts
export const API_TIMEOUT = 30000; // 30 seconds for normal requests
export const STREAM_TIMEOUT = 120000; // 2 minutes for streaming chat
