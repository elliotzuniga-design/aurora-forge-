import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";

import { HomeScreen } from "./src/screens/HomeScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { MemoryScreen } from "./src/screens/MemoryScreen";
import { AgentsScreen } from "./src/screens/AgentsScreen";
import { HealthScreen } from "./src/screens/HealthScreen";
import { FinancialScreen } from "./src/screens/FinancialScreen";
import { StrategyScreen } from "./src/screens/StrategyScreen";
import { LoginScreen } from "./src/screens/LoginScreen";

import { useUserStore } from "./src/store/userStore";
import { onAuthChange } from "./src/services/auth";
import { registerForPushNotifications } from "./src/services/notifications";
import { colors } from "./src/constants/colors";

export type RootStackParamList = {
  Main: undefined;
  Memory: undefined;
  Agents: undefined;
};

export type TabParamList = {
  Home: undefined;
  Health: undefined;
  Financial: undefined;
  Strategy: undefined;
  Settings: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={{
        fontSize: 10,
        fontWeight: focused ? "700" : "400",
        color: focused ? colors.primary : colors.textMuted,
      }}
    >
      {label}
    </Text>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: 4,
          paddingTop: 4,
          height: 52,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: "Aurora" }}
      />
      <Tab.Screen
        name="Health"
        component={HealthScreen}
        options={{ tabBarLabel: "Health" }}
      />
      <Tab.Screen
        name="Financial"
        component={FinancialScreen}
        options={{ tabBarLabel: "Finances" }}
      />
      <Tab.Screen
        name="Strategy"
        component={StrategyScreen}
        options={{ tabBarLabel: "Strategy" }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: "Settings" }}
      />
    </Tab.Navigator>
  );
}

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
        name="Main"
        component={MainTabs}
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
    </Stack.Navigator>
  );
}

export default function App() {
  const { isAuthenticated, isLoading, setUser } = useUserStore();

  useEffect(() => {
    const unsubscribe = onAuthChange(async (user) => {
      setUser(user);

      if (user) {
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
