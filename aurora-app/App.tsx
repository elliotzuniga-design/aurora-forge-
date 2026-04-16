import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, ActivityIndicator, StyleSheet } from "react-native";

import { HomeScreen } from "./src/screens/HomeScreen";
import { ConversationsScreen } from "./src/screens/ConversationsScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { MemoryScreen } from "./src/screens/MemoryScreen";
import { AgentsScreen } from "./src/screens/AgentsScreen";
import { GoalsScreen } from "./src/screens/GoalsScreen";
import { HealthScreen } from "./src/screens/HealthScreen";
import { LoginScreen } from "./src/screens/LoginScreen";

import { useUserStore } from "./src/store/userStore";
import { onAuthChange } from "./src/services/auth";
import { registerForPushNotifications } from "./src/services/notifications";
import { colors } from "./src/constants/colors";

export type RootStackParamList = {
  Home: undefined;
  Conversations: undefined;
  Settings: undefined;
  Memory: undefined;
  Agents: undefined;
  Goals: undefined;
  Health: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.background,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 0,
        },
        headerTintColor: colors.primary,
        headerTitleStyle: {
          fontWeight: "600",
          color: colors.text,
        },
        cardStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Conversations"
        component={ConversationsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Memory"
        component={MemoryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Agents"
        component={AgentsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Goals"
        component={GoalsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Health"
        component={HealthScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  const { isAuthenticated, isLoading, setUser } = useUserStore();

  useEffect(() => {
    const unsubscribe = onAuthChange(async (user) => {
      setUser(user);

      if (user) {
        // Register for push notifications once authenticated
        await registerForPushNotifications().catch(console.error);
      }
    });

    return unsubscribe;
  }, [setUser]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: colors.primary,
            background: colors.background,
            card: colors.surface,
            text: colors.text,
            border: colors.border,
            notification: colors.primary,
          },
          fonts: {
            regular: { fontFamily: "System", fontWeight: "400" },
            medium: { fontFamily: "System", fontWeight: "500" },
            bold: { fontFamily: "System", fontWeight: "700" },
            heavy: { fontFamily: "System", fontWeight: "900" },
          },
        }}
      >
        {isAuthenticated ? <AppNavigator /> : <LoginScreen />}
      </NavigationContainer>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
});
