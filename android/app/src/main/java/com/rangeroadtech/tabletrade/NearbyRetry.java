package com.rangeroadtech.tabletrade;

/** Per-peer retry delays. One failure waits 4s, then 8s, 16s, and 60s after that. */
public final class NearbyRetry {
    public static final long SEEN_TTL_MS = 30_000L;
    public static final long ATTEMPT_TIMEOUT_MS = 10_000L;
    private static final long[] BACKOFF_MS = { 4_000L, 8_000L, 16_000L, 60_000L };

    private NearbyRetry() {}

    public static long backoffMs(int failures) {
        if (failures <= 0) return 0L;
        int index = Math.min(failures, BACKOFF_MS.length) - 1;
        return BACKOFF_MS[index];
    }
}
