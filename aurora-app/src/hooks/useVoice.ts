import { useState, useEffect, useCallback, useRef } from "react";
import {
  initVoice,
  startListening,
  stopListening,
  destroyVoice,
} from "../services/voice";

interface UseVoiceReturn {
  isListening: boolean;
  isAlwaysListening: boolean;
  transcript: string;
  partialTranscript: string;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string>;
  toggleAlwaysListening: () => void;
  error: string | null;
}

export function useVoice(
  onTranscript?: (text: string) => void
): UseVoiceReturn {
  const [isListening, setIsListening] = useState(false);
  const [isAlwaysListening, setIsAlwaysListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resolveRef = useRef<((text: string) => void) | null>(null);

  useEffect(() => {
    initVoice({
      onResult: (text) => {
        setTranscript(text);
        setPartialTranscript("");
        setIsListening(false);

        if (resolveRef.current) {
          resolveRef.current(text);
          resolveRef.current = null;
        }

        onTranscript?.(text);

        // If always-listening, restart after a brief pause
        if (isAlwaysListening) {
          setTimeout(() => {
            startListening().catch(console.error);
            setIsListening(true);
          }, 500);
        }
      },
      onPartialResult: (text) => {
        setPartialTranscript(text);
      },
      onError: (errorMsg) => {
        setError(errorMsg);
        setIsListening(false);
      },
      onStart: () => {
        setIsListening(true);
        setError(null);
      },
      onEnd: () => {
        if (!isAlwaysListening) {
          setIsListening(false);
        }
      },
    });

    return () => {
      destroyVoice();
    };
  }, [isAlwaysListening, onTranscript]);

  const startRecording = useCallback(async () => {
    setTranscript("");
    setPartialTranscript("");
    setError(null);
    await startListening();
  }, []);

  const stopRecording = useCallback(async (): Promise<string> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      stopListening().catch(() => {
        resolveRef.current = null;
        resolve("");
      });
    });
  }, []);

  const toggleAlwaysListening = useCallback(() => {
    setIsAlwaysListening((prev) => {
      const next = !prev;
      if (next) {
        startListening().catch(console.error);
      } else {
        stopListening().catch(console.error);
        setIsListening(false);
      }
      return next;
    });
  }, []);

  return {
    isListening,
    isAlwaysListening,
    transcript,
    partialTranscript,
    startRecording,
    stopRecording,
    toggleAlwaysListening,
    error,
  };
}
