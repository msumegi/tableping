import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.rangeroadtech.tabletrade",
  appName: "TableTrade",
  webDir: "dist",
  android: {
    allowMixedContent: false,
    backgroundColor: "#12100e",
  },
  plugins: {
    SystemBars: {
      style: "DARK",
    },
  },
};

export default config;
