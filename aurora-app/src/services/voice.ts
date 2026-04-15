import Voice, {
  type SpeechResultsEvent,
  type SpeechErrorEvent,
} from "@react-native-voice/voice";

interface VoiceCallbacks {
  onResult: (text: string) => void;
  onPartialResult: (text: string) => void;
  onError: (error: string) => void;
  onStart: () => void;
  onEnd: () => void;
}

let callbacks: VoiceCallbacks | null = null;

export function initVoice(cbs: VoiceCallbacks): void {
  callbacks = cbs;

  Voice.onSpeechStart = () => {
    callbacks?.onStart();
  };

  Voice.onSpeechEnd = () => {
    callbacks?.onEnd();
  };

  Voice.onSpeechResults = (event: SpeechResultsEvent) => {
    const text = event.value?.[0];
    if (text) {
      callbacks?.onResult(text);
    }
  };

  Voice.onSpeechPartialResults = (event: SpeechResultsEvent) => {
    const text = event.value?.[0];
    if (text) {
      callbacks?.onPartialResult(text);
    }
  };

  Voice.onSpeechError = (event: SpeechErrorEvent) => {
    callbacks?.onError(event.error?.message || "Speech recognition error");
  };
}

export async function startListening(): Promise<void> {
  try {
    await Voice.start("en-US");
  } catch (err) {
    console.error("Failed to start voice recognition:", err);
  }
}

export async function stopListening(): Promise<void> {
  try {
    await Voice.stop();
  } catch (err) {
    console.error("Failed to stop voice recognition:", err);
  }
}

export async function destroyVoice(): Promise<void> {
  try {
    await Voice.destroy();
  } catch (err) {
    console.error("Failed to destroy voice instance:", err);
  }
}

export async function isVoiceAvailable(): Promise<boolean> {
  try {
    return await Voice.isAvailable() === 1;
  } catch {
    return false;
  }
}
