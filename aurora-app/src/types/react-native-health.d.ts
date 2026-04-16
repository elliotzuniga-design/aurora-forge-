// react-native-health is an optional iOS-only dependency
// This declaration prevents TypeScript errors when it's not installed
declare module "react-native-health" {
  const HealthKit: {
    initHealthKit: (
      options: { permissions: { read: string[]; write: string[] } },
      callback: (error: string | null) => void
    ) => void;
    getStepCount: (
      options: { startDate: string; endDate: string },
      callback: (error: string | null, result: { value: number }) => void
    ) => void;
    getHeartRateSamples: (
      options: { startDate: string; endDate: string },
      callback: (error: string | null, results: Array<{ value: number }>) => void
    ) => void;
    getHeartRateVariabilitySamples?: (
      options: { startDate: string; endDate: string },
      callback: (error: string | null, results: Array<{ value: number }>) => void
    ) => void;
    getRestingHeartRateSamples?: (
      options: { startDate: string; endDate: string },
      callback: (error: string | null, results: Array<{ value: number }>) => void
    ) => void;
    getActiveEnergyBurned?: (
      options: { startDate: string; endDate: string },
      callback: (error: string | null, results: Array<{ value: number }>) => void
    ) => void;
    getAppleExerciseTime?: (
      options: { startDate: string; endDate: string },
      callback: (error: string | null, results: Array<{ value: number }>) => void
    ) => void;
    getOxygenSaturationSamples?: (
      options: { startDate: string; endDate: string },
      callback: (error: string | null, results: Array<{ value: number }>) => void
    ) => void;
    getLatestWeight?: (
      options: { startDate: string; endDate: string },
      callback: (error: string | null, result: { value: number }) => void
    ) => void;
    Constants?: {
      Permissions: Record<string, string>;
    };
  };
  export default HealthKit;
}
