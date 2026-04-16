import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, Text, ActivityIndicator, StyleSheet, AppState } from "react-native";

import { HomeScreen } from "./src/screens/HomeScreen";
import { ConversationsScreen } from "./src/screens/ConversationsScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { MemoryScreen } from "./src/screens/MemoryScreen";
import { AgentsScreen } from "./src/screens/AgentsScreen";
import { GoalsScreen } from "./src/screens/GoalsScreen";
import { HealthScreen } from "./src/screens/HealthScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ErrorBoundary } from "./src/components/ErrorBoundary";

import { useUserStore } from "./src/store/userStore";
import { onAuthChange } from "./src/services/auth";
import { registerForPushNotifications } from "./src/services/notifications";
import { syncHealthData } from "./src/services/health";
import { colors } from "./src/constants/colors";

// ─── Navigation Types ────────────────────────────────────────

export type RootStackParamList = {
  MainTabs: undefined;
  Conversations: undefined;
  Memory: undefined;
  Profile: undefined;
};

export type TabParamList = {
  Home: undefined;
  Goals: undefined;
  Health: undefined;
  Agents: undefined;
  Settings: undefined;
};

// ─── Tab Icon Component ──────────────────────────────────────

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: "💬",
    Goals: "🎯",
    Health: "❤️",
    Agents: "🤖",
    Settings: "⚙️",
  };

  return (
    <View style={tabIconStyles.container}>
      <Text style={tabIconStyles.icon}>{icons[label] || "•"}</Text>
      <Text
        style={[
          tabIconStyles.label,
          { color: focused ? colors.primary : colors.textDim },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
  },
  icon: {
    fontSize: 20,
    marginBottom: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
  },
});

// ─── Tab Navigator ───────────────────────────────────────────

const Tab = createBottomTabNavigator<TabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 20,
          paddingTop: 4,
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textDim,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Home" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Goals"
        component={GoalsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Goals" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Health"
        component={HealthScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Health" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Agents"
        component={AgentsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Agents" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Settings" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Root Stack (tabs + modals) ──────────────────────────────

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
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Conversations"
        component={ConversationsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Memory"
        component={MemoryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// ─── App Root ────────────────────────────────────────────────

export default function App() {
  const { isAuthenticated, isLoading, setUser } = useUserStore();

  useEffect(() => {
    const unsubscribe = onAuthChange(async (user) => {
      setUser(user);

      if (user) {
        await registerForPushNotifications().catch(console.error);
        // Sync health data on login
        syncHealthData().catch(console.error);
      }
    });

    return unsubscribe;
  }, [setUser]);

  // Auto-sync health data when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && isAuthenticated) {
        syncHealthData().catch(console.error);
      }
    });

    return () => subscription.remove();
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
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
