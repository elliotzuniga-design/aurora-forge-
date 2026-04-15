import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import api from "./api";

// Configure foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  // Check and request permissions
  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("Push notification permission not granted");
    return null;
  }

  // Get Expo push token
  const tokenResponse = await Notifications.getExpoPushTokenAsync({
    projectId: "your-eas-project-id", // Replace with actual EAS project ID
  });
  const token = tokenResponse.data;

  // Register token with backend
  try {
    await api.post("/push/register", { token });
  } catch (err) {
    console.error("Failed to register push token with backend:", err);
  }

  // iOS-specific: set badge count to 0 on launch
  if (Platform.OS === "ios") {
    await Notifications.setBadgeCountAsync(0);
  }

  return token;
}

export function addNotificationListener(
  handler: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(handler);
}

export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(handler);
}
