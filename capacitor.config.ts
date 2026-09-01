import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.rangeroadtech.tabletrade",
  appName: "TableTrade",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
};

export default config;
