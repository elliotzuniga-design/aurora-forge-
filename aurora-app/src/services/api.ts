import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL, API_TIMEOUT } from "../constants/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach Firebase ID token to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync("firebase_id_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — token expired
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired — attempt refresh via Firebase
      const { getAuth } = await import("firebase/auth");
      const auth = getAuth();
      const user = auth.currentUser;

      if (user) {
        try {
          const newToken = await user.getIdToken(true);
          await SecureStore.setItemAsync("firebase_id_token", newToken);

          // Retry the original request with new token
          error.config.headers.Authorization = `Bearer ${newToken}`;
          return api.request(error.config);
        } catch {
          // Refresh failed — user needs to re-authenticate
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
