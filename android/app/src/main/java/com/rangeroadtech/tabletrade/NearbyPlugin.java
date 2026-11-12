package com.rangeroadtech.tabletrade;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.BroadcastReceiver;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;

import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.location.LocationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Same-room looking. Profiles move only inside a v2 encrypted frame.
 * There is no plaintext fallback. Advertisements carry a rotating random token, not a user id.
 */
@CapacitorPlugin(
    name = "TableTradeNearby",
    permissions = {
        @Permission(strings = { Manifest.permission.BLUETOOTH_SCAN }, alias = "scan"),
        @Permission(strings = { Manifest.permission.BLUETOOTH_ADVERTISE }, alias = "advertise"),
        @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "connect"),
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location")
    }
)
public class NearbyPlugin extends Plugin {
    private static final String TAG = "TableTradeNearby";
    static final UUID SERVICE = UUID.fromString("74626c74-7264-4e31-8000-7461626c6574");
    static final UUID CHAR = UUID.fromString("74626c74-7264-4e31-8001-7461626c6574");
    private static final int LEGACY_COMPANY_ID = 0xFFFF;
    private static final long TOKEN_ROTATE_MS = 120_000L;

    private BluetoothGattServer gattServer;
    private BluetoothLeAdvertiser advertiser;
    private BluetoothLeScanner scanner;
    private BluetoothGatt openGatt;
    private volatile byte[] payload = "{}".getBytes(StandardCharsets.UTF_8);
    private volatile byte[] advToken = new byte[4];
    private boolean running = false;
    private boolean scanStarted = false;
    private PluginCall pendingStart;
    private final Set<String> delivered = new HashSet<>();
    private final Set<String> ignored = new HashSet<>();
    private boolean legacyHintSent = false;
    private final Map<String, BluetoothDevice> candidates = new HashMap<>();
    private final Map<String, Long> lastSeen = new HashMap<>();
    private final Map<String, Integer> failures = new HashMap<>();
    private final Map<String, Long> retryAt = new HashMap<>();
    private final ArrayDeque<String> waitQueue = new ArrayDeque<>();
    private String activeId;
    private boolean pumpScheduled;
    private boolean radioWatching;
    private final Map<String, ServerSession> sessions = new HashMap<>();
    private final Map<String, Integer> peerMtu = new HashMap<>();
    private BleCrypto.Ephemeral clientKeys;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final SecureRandom random = new SecureRandom();

    private final Runnable retryBeat = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            pruneStale();
            long now = SystemClock.elapsedRealtime();
            for (String id : new ArrayList<>(candidates.keySet())) {
                Long ready = retryAt.get(id);
                if (ready != null && ready > now) continue;
                enqueue(id);
            }
            main.postDelayed(this, 4000);
        }
    };

    private final Runnable attemptTimeout = new Runnable() {
        @Override
        public void run() {
            if (activeId == null) return;
            Log.w(TAG, "connection attempt timed out");
            finishAttempt(activeId, false);
        }
    };

    private final BroadcastReceiver radioWatch = new BroadcastReceiver() {
        @Override
        public void onReceive(android.content.Context context, Intent intent) {
            if (!running || intent == null) return;
            String action = intent.getAction();
            if (BluetoothAdapter.ACTION_STATE_CHANGED.equals(action)) {
                int state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR);
                if (state == BluetoothAdapter.STATE_OFF || state == BluetoothAdapter.STATE_TURNING_OFF) {
                    stopForRadio(NearbyStartGate.BLUETOOTH_OFF);
                }
            } else if (Intent.ACTION_AIRPLANE_MODE_CHANGED.equals(action)) {
                if (intent.getBooleanExtra("state", false)) stopForRadio(NearbyStartGate.BLUETOOTH_OFF);
            } else if (LocationManager.PROVIDERS_CHANGED_ACTION.equals(action)
                    || LocationManager.MODE_CHANGED_ACTION.equals(action)) {
                if (NearbyStartGate.needsSystemLocation(Build.VERSION.SDK_INT) && !systemLocationEnabled()) {
                    stopForRadio(NearbyStartGate.LOCATION_OFF);
                }
            }
        }
    };

    private final Runnable rotateToken = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            rollToken();
            try {
                beginAdvertise();
            } catch (Exception e) {
                Log.w(TAG, "rotate advertise", e);
            }
            main.postDelayed(this, TOKEN_ROTATE_MS);
        }
    };

    private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {
        @Override
        public void onStartSuccess(AdvertiseSettings settingsInEffect) {
            if (!scanStarted) {
                scanStarted = true;
                startScan();
                if (!running) return;
                PluginCall call = pendingStart;
                pendingStart = null;
                if (call != null) call.resolve();
            }
        }

        @Override
        public void onStartFailure(int errorCode) {
            Log.w(TAG, "advertise fail " + errorCode);
            if (pendingStart != null) {
                failStart("Could not share over Bluetooth. Try I’m looking again.");
            }
        }
    };

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            if (result == null || result.getDevice() == null) return;
            BluetoothDevice device = result.getDevice();
            ScanRecord record = result.getScanRecord();
            byte[] service = record == null ? null : record.getServiceData(new ParcelUuid(SERVICE));
            byte[] peerToken = BleAdvertisement.tokenFromServiceData(service);
            if (peerToken == null) {
                byte[] legacy = record == null ? null : record.getManufacturerSpecificData(LEGACY_COMPANY_ID);
                if (BleAdvertisement.isLegacy(legacy)) noteLegacy(device.getAddress());
                return;
            }
            final String id = device.getAddress();
            final boolean reach = shouldReachOut(peerToken);
            main.post(() -> {
                if (!running) return;
                lastSeen.put(id, SystemClock.elapsedRealtime());
                candidates.put(id, device);
                if (reach) enqueue(id);
                else main.postDelayed(() -> enqueue(id), 2500);
            });
        }
    };

    @PluginMethod
    public void start(PluginCall call) {
        String body = call.getString("payload", "{}");
        byte[] next = body.getBytes(StandardCharsets.UTF_8);
        if (next.length > BleCrypto.MAX_PLAINTEXT) {
            call.reject("PAYLOAD_TOO_LARGE", "PAYLOAD_TOO_LARGE");
            return;
        }
        payload = next;
        if (!permissionsGranted()) {
            if (!NearbyStartGate.shouldRequestPermission(false, permissionAsked(), permissionRationale())) {
                rejectPermission(call);
                return;
            }
            markPermissionAsked();
            if (Build.VERSION.SDK_INT >= 31) {
                requestPermissionForAliases(new String[] { "scan", "advertise", "connect" }, call, "permStart");
            } else {
                requestPermissionForAliases(new String[] { "location" }, call, "permStart");
            }
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void permStart(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31) {
            if (getPermissionState("scan") != PermissionState.GRANTED
                    || getPermissionState("advertise") != PermissionState.GRANTED
                    || getPermissionState("connect") != PermissionState.GRANTED) {
                rejectPermission(call);
                return;
            }
        } else if (getPermissionState("location") != PermissionState.GRANTED) {
            rejectPermission(call);
            return;
        }
        begin(call);
    }

    @PluginMethod
    public void setPayload(PluginCall call) {
        String body = call.getString("payload", "{}");
        byte[] next = body.getBytes(StandardCharsets.UTF_8);
        if (next.length > BleCrypto.MAX_PLAINTEXT) {
            call.reject("PAYLOAD_TOO_LARGE", "PAYLOAD_TOO_LARGE");
            return;
        }
        payload = next;
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        halt();
        call.resolve();
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
        Activity activity = getActivity();
        try {
            if (activity != null) {
                activity.startActivity(intent);
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            Log.w(TAG, "open location settings", e);
            call.reject("Could not open Location settings.", NearbyStartGate.LOCATION_OFF);
        }
    }

    @PluginMethod
    public void requestEnableBluetooth(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31 && getPermissionState("connect") != PermissionState.GRANTED) {
            requestPermissionForAliases(new String[] { "connect" }, call, "permEnableBt");
            return;
        }
        launchEnableBluetooth(call);
    }

    @PermissionCallback
    private void permEnableBt(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31 && getPermissionState("connect") != PermissionState.GRANTED) {
            call.reject("Allow Bluetooth, then turn it on.", NearbyStartGate.BLUETOOTH_OFF);
            return;
        }
        launchEnableBluetooth(call);
    }

    @SuppressLint("MissingPermission")
    private void launchEnableBluetooth(PluginCall call) {
        BluetoothManager mgr = manager();
        try {
            if (mgr != null && mgr.getAdapter() != null && mgr.getAdapter().isEnabled()) {
                call.resolve();
                return;
            }
        } catch (SecurityException e) {
            Log.w(TAG, "bluetooth state", e);
            call.reject("Allow Bluetooth, then turn it on.", NearbyStartGate.BLUETOOTH_OFF);
            return;
        }
        Intent intent = new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE);
        try {
            startActivityForResult(call, intent, "enableBtResult");
        } catch (SecurityException e) {
            Log.w(TAG, "enable bluetooth permission", e);
            call.reject("Allow Bluetooth, then turn it on.", NearbyStartGate.BLUETOOTH_OFF);
        } catch (Exception e) {
            Log.w(TAG, "enable bluetooth", e);
            call.reject(NearbyStartGate.BLUETOOTH_OFF_MESSAGE, NearbyStartGate.BLUETOOTH_OFF);
        }
    }

    @ActivityCallback
    private void enableBtResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_OK) call.resolve();
        else call.reject(NearbyStartGate.BLUETOOTH_OFF_MESSAGE, NearbyStartGate.BLUETOOTH_OFF);
    }

    @SuppressLint("MissingPermission")
    private void begin(PluginCall call) {
        if (!getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)) {
            call.reject("This phone cannot use Bluetooth looking.");
            return;
        }
        BluetoothManager mgr = manager();
        if (mgr == null || mgr.getAdapter() == null) {
            call.reject(NearbyStartGate.BLUETOOTH_OFF_MESSAGE, NearbyStartGate.BLUETOOTH_OFF);
            return;
        }
        boolean bluetoothOn;
        try {
            bluetoothOn = mgr.getAdapter().isEnabled();
        } catch (SecurityException e) {
            Log.w(TAG, "bluetooth state", e);
            bluetoothOn = false;
        }
        boolean locationOn = true;
        if (NearbyStartGate.needsSystemLocation(Build.VERSION.SDK_INT)) {
            locationOn = systemLocationEnabled();
        }
        String block = NearbyStartGate.blockCode(Build.VERSION.SDK_INT, bluetoothOn, locationOn);
        if (block != null) {
            Log.w(TAG, "not starting scan: " + block);
            call.reject(NearbyStartGate.messageFor(block), block);
            return;
        }
        halt();
        running = true;
        scanStarted = false;
        pendingStart = call;
        delivered.clear();
        candidates.clear();
        lastSeen.clear();
        failures.clear();
        retryAt.clear();
        waitQueue.clear();
        activeId = null;
        rollToken();
        watchRadio();
        try {
            gattServer = mgr.openGattServer(getContext(), serverCallback);
            BluetoothGattService service = new BluetoothGattService(SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY);
            BluetoothGattCharacteristic ch = new BluetoothGattCharacteristic(
                    CHAR,
                    BluetoothGattCharacteristic.PROPERTY_READ | BluetoothGattCharacteristic.PROPERTY_WRITE,
                    BluetoothGattCharacteristic.PERMISSION_READ | BluetoothGattCharacteristic.PERMISSION_WRITE);
            ch.setValue(new byte[0]);
            service.addCharacteristic(ch);
            if (!gattServer.addService(service)) {
                failStart("Could not start Bluetooth looking.");
            }
        } catch (Exception e) {
            Log.e(TAG, "start", e);
            failStart("Could not start Bluetooth looking.");
        }
    }

    private boolean systemLocationEnabled() {
        try {
            LocationManager lm = (LocationManager) getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
            if (lm == null) return false;
            return LocationManagerCompat.isLocationEnabled(lm);
        } catch (Exception e) {
            Log.w(TAG, "location toggle", e);
            return false;
        }
    }

    private BluetoothManager manager() {
        return (BluetoothManager) getContext().getSystemService(android.content.Context.BLUETOOTH_SERVICE);
    }

    @SuppressLint("MissingPermission")
    private void startAdvertiseAndScan() {
        if (!running) return;
        BluetoothManager mgr = manager();
        if (mgr == null || mgr.getAdapter() == null) {
            failStart("Turn Bluetooth on, then tap I’m looking.");
            return;
        }
        advertiser = mgr.getAdapter().getBluetoothLeAdvertiser();
        if (advertiser == null) {
            failStart("This phone cannot share over Bluetooth.");
            return;
        }
        try {
            beginAdvertise();
            main.removeCallbacks(rotateToken);
            main.postDelayed(rotateToken, TOKEN_ROTATE_MS);
        } catch (Exception e) {
            Log.e(TAG, "advertise", e);
            failStart("Could not share over Bluetooth. Try I’m looking again.");
        }
    }

    @SuppressLint("MissingPermission")
    private void beginAdvertise() {
        if (advertiser == null || !running) return;
        AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setConnectable(true)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .build();
        ParcelUuid service = new ParcelUuid(SERVICE);
        AdvertiseData data = new AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .setIncludeTxPowerLevel(false)
                .addServiceUuid(service)
                .addServiceData(service, BleAdvertisement.serviceData(advToken))
                .build();
        try {
            advertiser.stopAdvertising(advertiseCallback);
        } catch (Exception ignored) {
        }
        advertiser.startAdvertising(settings, data, advertiseCallback);
    }

    @SuppressLint("MissingPermission")
    private void startScan() {
        if (!running) return;
        if (NearbyStartGate.needsSystemLocation(Build.VERSION.SDK_INT) && !systemLocationEnabled()) {
            Log.w(TAG, "Location is off; refusing to scan on API " + Build.VERSION.SDK_INT);
            failStart(NearbyStartGate.LOCATION_OFF_MESSAGE, NearbyStartGate.LOCATION_OFF);
            return;
        }
        BluetoothManager mgr = manager();
        if (mgr == null || mgr.getAdapter() == null) return;
        scanner = mgr.getAdapter().getBluetoothLeScanner();
        if (scanner == null) return;
        ScanSettings scanSettings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build();
        java.util.List<ScanFilter> filters = new ArrayList<>();
        filters.add(new ScanFilter.Builder().setServiceUuid(new ParcelUuid(SERVICE)).build());
        filters.add(new ScanFilter.Builder()
                .setManufacturerData(LEGACY_COMPANY_ID, new byte[] { 'T', 'T' }, new byte[] { (byte) 0xff, (byte) 0xff })
                .build());
        scanner.startScan(filters, scanSettings, scanCallback);
        main.removeCallbacks(retryBeat);
        main.postDelayed(retryBeat, 4000);
    }

    private void rollToken() {
        byte[] next = new byte[4];
        random.nextBytes(next);
        advToken = next;
    }

    private boolean shouldReachOut(byte[] peerToken) {
        byte[] mine = advToken;
        for (int i = 0; i < 4; i++) {
            int a = mine[i] & 0xff;
            int b = peerToken[i] & 0xff;
            if (a < b) return true;
            if (a > b) return false;
        }
        return true;
    }

    private void enqueue(String id) {
        if (!running || id == null) return;
        if (ignored.contains(id) || delivered.contains(id) || id.equals(activeId)) return;
        if (waitQueue.contains(id)) return;
        long now = SystemClock.elapsedRealtime();
        Long seen = lastSeen.get(id);
        if (seen == null || now - seen > NearbyRetry.SEEN_TTL_MS) return;
        Long ready = retryAt.get(id);
        if (ready != null && ready > now) {
            schedulePump(ready - now);
            return;
        }
        waitQueue.addLast(id);
        pumpQueue();
    }

    private void schedulePump(long delay) {
        if (pumpScheduled) return;
        pumpScheduled = true;
        main.postDelayed(() -> {
            pumpScheduled = false;
            if (!running) return;
            long now = SystemClock.elapsedRealtime();
            for (String id : new ArrayList<>(candidates.keySet())) {
                Long ready = retryAt.get(id);
                if (ready == null || ready <= now) enqueue(id);
            }
        }, Math.max(250L, delay));
    }

    @SuppressLint("MissingPermission")
    private void pumpQueue() {
        if (!running || activeId != null) return;
        pruneStale();
        long now = SystemClock.elapsedRealtime();
        while (!waitQueue.isEmpty()) {
            String id = waitQueue.pollFirst();
            if (id == null || ignored.contains(id) || delivered.contains(id)) continue;
            Long seen = lastSeen.get(id);
            if (seen == null || now - seen > NearbyRetry.SEEN_TTL_MS) {
                candidates.remove(id);
                continue;
            }
            Long ready = retryAt.get(id);
            if (ready != null && ready > now) {
                schedulePump(ready - now);
                continue;
            }
            BluetoothDevice device = candidates.get(id);
            if (device == null) continue;
            activeId = id;
            main.postDelayed(attemptTimeout, NearbyRetry.ATTEMPT_TIMEOUT_MS);
            connectPeer(device, id);
            return;
        }
    }

    private void pruneStale() {
        long now = SystemClock.elapsedRealtime();
        Iterator<Map.Entry<String, Long>> it = lastSeen.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, Long> entry = it.next();
            if (entry.getKey().equals(activeId)) continue;
            if (now - entry.getValue() > NearbyRetry.SEEN_TTL_MS) {
                it.remove();
                candidates.remove(entry.getKey());
                waitQueue.remove(entry.getKey());
            }
        }
    }

    private void bumpBackoff(String id) {
        int count = failures.containsKey(id) ? failures.get(id) + 1 : 1;
        failures.put(id, count);
        long delay = NearbyRetry.backoffMs(count);
        retryAt.put(id, SystemClock.elapsedRealtime() + delay);
        Log.i(TAG, "retry in " + delay + "ms after " + count + " failures");
    }

    private void finishAttempt(String id, boolean success) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            main.post(() -> finishAttempt(id, success));
            return;
        }
        if (id == null || activeId == null || !activeId.equals(id)) return;
        main.removeCallbacks(attemptTimeout);
        if (success) {
            failures.remove(id);
            retryAt.remove(id);
        } else if (!delivered.contains(id) && !ignored.contains(id)) {
            bumpBackoff(id);
        }
        activeId = null;
        pumpQueue();
    }

    @SuppressLint("MissingPermission")
    private void connectPeer(BluetoothDevice device, String id) {
        if (!running || !id.equals(activeId)) return;
        try {
            dropClientKeys();
            final BleCrypto.Ephemeral mine = BleCrypto.generate();
            clientKeys = mine;
            final BleCrypto.NonceWindow nonces = new BleCrypto.NonceWindow();
            final int[] mtu = new int[] { 23 };
            final boolean[] sent = new boolean[] { false };
            final byte[][] serverPub = new byte[1][];
            BluetoothGattCallback cb = new BluetoothGattCallback() {
                private void fail(BluetoothGatt gatt, String why) {
                    Log.w(TAG, why);
                    mine.zeroize();
                    if (clientKeys == mine) clientKeys = null;
                    try {
                        gatt.disconnect();
                    } catch (Exception ignored) {
                    }
                    finishAttempt(id, false);
                }

                @Override
                public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        if (!gatt.requestMtu(BleCrypto.TARGET_MTU)) {
                            Log.w(TAG, "MTU request failed; staying at 23 and using long writes");
                            gatt.discoverServices();
                        }
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        mine.zeroize();
                        if (clientKeys == mine) clientKeys = null;
                        try {
                            gatt.close();
                        } catch (Exception ignored) {
                        }
                        if (openGatt == gatt) openGatt = null;
                        finishAttempt(id, delivered.contains(id));
                    }
                }

                @Override
                public void onMtuChanged(BluetoothGatt gatt, int newMtu, int status) {
                    if (status == BluetoothGatt.GATT_SUCCESS && newMtu >= 23) mtu[0] = newMtu;
                    else Log.w(TAG, "MTU negotiate failed; using " + mtu[0]);
                    gatt.discoverServices();
                }

                @Override
                public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                    BluetoothGattService svc = gatt.getService(SERVICE);
                    BluetoothGattCharacteristic ch = svc == null ? null : svc.getCharacteristic(CHAR);
                    if (ch == null) {
                        fail(gatt, "nearby service missing");
                        return;
                    }
                    gatt.readCharacteristic(ch);
                }

                @Override
                public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
                    if (Build.VERSION.SDK_INT >= 33) return;
                    onRead(gatt, characteristic, characteristic == null ? null : characteristic.getValue(), status);
                }

                @Override
                public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value, int status) {
                    onRead(gatt, characteristic, value, status);
                }

                private void onRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value, int status) {
                    if (status != BluetoothGatt.GATT_SUCCESS || value == null) {
                        fail(gatt, "rejecting nearby read, status " + status);
                        return;
                    }
                    try {
                        if (!sent[0]) {
                            serverPub[0] = BleCrypto.serverPublicFromHandshake(value);
                            byte[] frame = BleCrypto.sealClientToServer(mine, serverPub[0], payload);
                            if (frame.length > BleCrypto.MAX_FRAME) {
                                notifyTooBig();
                                fail(gatt, "encrypted frame exceeds 2 KB ceiling; refusing plaintext fallback");
                                return;
                            }
                            if (!BleCrypto.frameFitsSinglePacket(frame.length, mtu[0])) {
                                Log.i(TAG, "sending " + frame.length + " byte encrypted frame in pieces (MTU " + mtu[0] + ")");
                            }
                            if (!writeFrame(gatt, characteristic, frame)) {
                                fail(gatt, "encrypted write failed at MTU " + mtu[0] + "; not sending plaintext");
                                return;
                            }
                            sent[0] = true;
                            return;
                        }
                        byte[] plain = BleCrypto.openServerToClient(mine, serverPub[0], value, nonces);
                        emitPeer(plain);
                        delivered.add(id);
                        mine.zeroize();
                        if (clientKeys == mine) clientKeys = null;
                        gatt.disconnect();
                    } catch (BleCrypto.Rejected e) {
                        if (BleCrypto.isLegacyPayload(e.getMessage())) {
                            noteLegacy(id);
                            fail(gatt, "ignoring older TableTrade: " + e.getMessage());
                            return;
                        }
                        if (e.getMessage() != null && e.getMessage().contains("2 KB")) notifyTooBig();
                        fail(gatt, "rejecting nearby payload: " + e.getMessage());
                    }
                }

                @Override
                public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
                    if (status != BluetoothGatt.GATT_SUCCESS) {
                        fail(gatt, "encrypted write rejected (" + status + "); not sending plaintext");
                        return;
                    }
                    if (!gatt.readCharacteristic(characteristic)) {
                        fail(gatt, "could not read encrypted reply");
                    }
                }
            };
            openGatt = device.connectGatt(getContext(), false, cb, BluetoothDevice.TRANSPORT_LE);
        } catch (Exception e) {
            Log.w(TAG, "connect", e);
            dropClientKeys();
            finishAttempt(id, false);
        }
    }

    @SuppressLint("MissingPermission")
    private boolean writeFrame(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] frame) {
        if (Build.VERSION.SDK_INT >= 33) {
            int result = gatt.writeCharacteristic(characteristic, frame, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
            return result == BluetoothGatt.GATT_SUCCESS;
        }
        characteristic.setValue(frame);
        return gatt.writeCharacteristic(characteristic);
    }

    private void emitPeer(byte[] value) {
        JSObject ev = new JSObject();
        ev.put("payload", new String(value, StandardCharsets.UTF_8));
        notifyListeners("peer", ev);
    }

    private final BluetoothGattServerCallback serverCallback = new BluetoothGattServerCallback() {
        @Override
        public void onServiceAdded(int status, BluetoothGattService service) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                failStart("Could not start Bluetooth looking.");
                return;
            }
            startAdvertiseAndScan();
        }

        @Override
        public void onConnectionStateChange(BluetoothDevice device, int status, int newState) {
            if (device == null) return;
            String addr = device.getAddress();
            if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                dropSession(addr);
            } else if (newState == BluetoothProfile.STATE_CONNECTED) {
                ServerSession existing;
                synchronized (sessions) {
                    existing = sessions.get(addr);
                }
                if (existing == null || !existing.open) {
                    dropSession(addr);
                    session(addr);
                }
            }
        }

        @Override
        public void onMtuChanged(BluetoothDevice device, int mtu) {
            if (device == null || mtu < 23) return;
            peerMtu.put(device.getAddress(), mtu);
            ServerSession s;
            synchronized (sessions) {
                s = sessions.get(device.getAddress());
            }
            if (s != null) s.mtu = mtu;
        }

        @SuppressLint("MissingPermission")
        @Override
        public void onCharacteristicReadRequest(BluetoothDevice device, int requestId, int offset,
                                                BluetoothGattCharacteristic characteristic) {
            if (gattServer == null || device == null) return;
            String addr = device.getAddress();
            ServerSession s = session(addr);
            if (!s.open && s.reply == null) {
                dropSession(addr);
                s = session(addr);
            }
            byte[] all;
            if (s.reply != null) {
                all = s.reply;
            } else {
                try {
                    all = BleCrypto.handshake(s.keys.publicKey());
                } catch (BleCrypto.Rejected e) {
                    Log.w(TAG, "rejecting nearby handshake: " + e.getMessage());
                    gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null);
                    return;
                }
            }
            byte[] slice = BleCrypto.readResponse(all, offset);
            gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, slice);
        }

        @SuppressLint("MissingPermission")
        @Override
        public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId,
                                                 BluetoothGattCharacteristic characteristic, boolean preparedWrite,
                                                 boolean responseNeeded, int offset, byte[] value) {
            if (device == null) return;
            ServerSession s = session(device.getAddress());
            if (preparedWrite || offset > 0) {
                s.assembler.append(offset, value);
                if (responseNeeded && gattServer != null) {
                    gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value);
                }
                return;
            }
            boolean ok = acceptClientFrame(device, value);
            if (responseNeeded && gattServer != null) {
                gattServer.sendResponse(device, requestId, ok ? BluetoothGatt.GATT_SUCCESS : BluetoothGatt.GATT_FAILURE, offset, null);
            }
        }

        @SuppressLint("MissingPermission")
        @Override
        public void onExecuteWrite(BluetoothDevice device, int requestId, boolean execute) {
            if (device == null) return;
            ServerSession s = session(device.getAddress());
            boolean ok = false;
            if (execute) {
                try {
                    byte[] frame = s.assembler.finish();
                    ok = acceptClientFrame(device, frame);
                } catch (BleCrypto.Rejected e) {
                    Log.w(TAG, "rejecting nearby payload: " + e.getMessage());
                    s.assembler.reset();
                }
            } else {
                s.assembler.reset();
                ok = true;
            }
            if (gattServer != null) {
                gattServer.sendResponse(device, requestId, ok ? BluetoothGatt.GATT_SUCCESS : BluetoothGatt.GATT_FAILURE, 0, null);
            }
        }
    };

    private boolean acceptClientFrame(BluetoothDevice device, byte[] frame) {
        ServerSession s = session(device.getAddress());
        try {
            BleCrypto.Opened opened = BleCrypto.openClientToServer(s.keys, frame, s.nonces);
            emitPeer(opened.plaintext);
            delivered.add(device.getAddress());
            try {
                s.reply = BleCrypto.sealServerToClient(s.keys, opened.peerPublic, payload);
            } catch (BleCrypto.Rejected e) {
                s.reply = null;
                s.open = false;
                if (e.getMessage() != null && e.getMessage().contains("2 KB")) notifyTooBig();
                Log.w(TAG, "not sending plaintext reply: " + e.getMessage());
                s.keys.zeroize();
                return false;
            }
            s.open = false;
            s.keys.zeroize();
            return true;
        } catch (BleCrypto.Rejected e) {
            if (BleCrypto.isLegacyPayload(e.getMessage())) {
                noteLegacy(device.getAddress());
                Log.w(TAG, "ignoring older TableTrade: " + e.getMessage());
            } else {
                Log.w(TAG, "rejecting nearby payload: " + e.getMessage());
            }
            return false;
        }
    }

    /** Log once per address, tell the UI once, and do not connect again. */
    private void noteLegacy(String address) {
        boolean first = address == null || ignored.add(address);
        if (address != null) {
            candidates.remove(address);
            waitQueue.remove(address);
            lastSeen.remove(address);
        }
        if (!first) return;
        Log.w(TAG, "ignoring older TableTrade" + (address == null ? "" : " at " + address) + "; not retrying");
        if (legacyHintSent || !running) return;
        legacyHintSent = true;
        JSObject ev = new JSObject();
        ev.put("code", "LEGACY_PEER");
        notifyListeners("status", ev);
    }

    private void notifyTooBig() {
        JSObject ev = new JSObject();
        ev.put("code", "PAYLOAD_TOO_LARGE");
        notifyListeners("status", ev);
    }

    private ServerSession session(String address) {
        synchronized (sessions) {
            ServerSession s = sessions.get(address);
            if (s == null) {
                s = new ServerSession();
                Integer mtu = peerMtu.get(address);
                if (mtu != null) s.mtu = mtu;
                sessions.put(address, s);
            }
            return s;
        }
    }

    private void dropSession(String address) {
        ServerSession s;
        synchronized (sessions) {
            s = sessions.remove(address);
        }
        if (s != null) s.zeroize();
    }

    private void dropClientKeys() {
        BleCrypto.Ephemeral mine = clientKeys;
        clientKeys = null;
        if (mine != null) mine.zeroize();
    }

    @PluginMethod
    public void permissionStatus(PluginCall call) {
        boolean granted = permissionsGranted();
        JSObject info = new JSObject();
        info.put("granted", granted);
        info.put("blocked", !granted && permissionAsked() && !permissionRationale());
        call.resolve(info);
    }

    @PluginMethod
    public void radioInfo(PluginCall call) {
        JSObject info = new JSObject();
        info.put("needsLocation", NearbyStartGate.needsSystemLocation(Build.VERSION.SDK_INT));
        call.resolve(info);
    }

    @PluginMethod
    public void recheck(PluginCall call) {
        if (!running) {
            call.resolve();
            return;
        }
        boolean bluetoothOn = false;
        try {
            BluetoothManager mgr = manager();
            bluetoothOn = mgr != null && mgr.getAdapter() != null && mgr.getAdapter().isEnabled();
        } catch (SecurityException e) {
            bluetoothOn = false;
        }
        boolean locationOn = true;
        if (NearbyStartGate.needsSystemLocation(Build.VERSION.SDK_INT)) locationOn = systemLocationEnabled();
        String block = NearbyStartGate.blockCode(Build.VERSION.SDK_INT, bluetoothOn, locationOn);
        if (block != null) {
            stopForRadio(block);
            call.reject(NearbyStartGate.messageFor(block), block);
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        Activity activity = getActivity();
        try {
            if (activity != null) activity.startActivity(intent);
            else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            Log.w(TAG, "app settings", e);
            call.reject("Could not open app settings.", NearbyStartGate.PERMISSION_BLOCKED);
        }
    }

    private void watchRadio() {
        if (radioWatching) return;
        IntentFilter filter = new IntentFilter();
        filter.addAction(BluetoothAdapter.ACTION_STATE_CHANGED);
        filter.addAction(Intent.ACTION_AIRPLANE_MODE_CHANGED);
        filter.addAction(LocationManager.PROVIDERS_CHANGED_ACTION);
        filter.addAction(LocationManager.MODE_CHANGED_ACTION);
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                getContext().registerReceiver(radioWatch, filter, android.content.Context.RECEIVER_NOT_EXPORTED);
            } else {
                getContext().registerReceiver(radioWatch, filter);
            }
            radioWatching = true;
        } catch (Exception e) {
            Log.w(TAG, "radio watch", e);
        }
    }

    private void unwatchRadio() {
        if (!radioWatching) return;
        try {
            getContext().unregisterReceiver(radioWatch);
        } catch (Exception ignored) {
        }
        radioWatching = false;
    }

    private void stopForRadio(String code) {
        if (!running) return;
        Log.w(TAG, "stopping look: " + code);
        JSObject ev = new JSObject();
        ev.put("code", code);
        notifyListeners("status", ev);
        halt();
    }

    private boolean permissionsGranted() {
        if (Build.VERSION.SDK_INT >= 31) {
            return getPermissionState("scan") == PermissionState.GRANTED
                    && getPermissionState("advertise") == PermissionState.GRANTED
                    && getPermissionState("connect") == PermissionState.GRANTED;
        }
        return getPermissionState("location") == PermissionState.GRANTED;
    }

    private boolean permissionAsked() {
        return getContext().getSharedPreferences("tabletrade_nearby", android.content.Context.MODE_PRIVATE)
                .getBoolean("asked_permission", false);
    }

    private void markPermissionAsked() {
        getContext().getSharedPreferences("tabletrade_nearby", android.content.Context.MODE_PRIVATE)
                .edit()
                .putBoolean("asked_permission", true)
                .apply();
    }

    private boolean permissionRationale() {
        Activity activity = getActivity();
        if (activity == null) return false;
        if (Build.VERSION.SDK_INT >= 31) {
            return ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.BLUETOOTH_SCAN)
                    || ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.BLUETOOTH_CONNECT)
                    || ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.BLUETOOTH_ADVERTISE);
        }
        return ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.ACCESS_FINE_LOCATION);
    }

    private void rejectPermission(PluginCall call) {
        String permission = Build.VERSION.SDK_INT >= 31
                ? Manifest.permission.BLUETOOTH_SCAN
                : Manifest.permission.ACCESS_FINE_LOCATION;
        boolean blocked = false;
        Activity activity = getActivity();
        if (activity != null) {
            blocked = !ActivityCompat.shouldShowRequestPermissionRationale(activity, permission);
        }
        String code = blocked ? NearbyStartGate.PERMISSION_BLOCKED : NearbyStartGate.PERMISSION_DENIED;
        String message = Build.VERSION.SDK_INT >= 31
                ? NearbyStartGate.PERMISSION_NEARBY
                : NearbyStartGate.PERMISSION_LOCATION;
        call.reject(message, code);
    }

    private void failStart(String msg) {
        failStart(msg, null);
    }

    private void failStart(String msg, String code) {
        PluginCall call = pendingStart;
        pendingStart = null;
        halt();
        if (call == null) return;
        if (code != null) call.reject(msg, code);
        else call.reject(msg);
    }

    @SuppressLint("MissingPermission")
    private void halt() {
        running = false;
        scanStarted = false;
        main.removeCallbacks(retryBeat);
        main.removeCallbacks(rotateToken);
        main.removeCallbacksAndMessages(null);
        try {
            if (scanner != null) scanner.stopScan(scanCallback);
        } catch (Exception ignored) {
        }
        scanner = null;
        try {
            if (advertiser != null) advertiser.stopAdvertising(advertiseCallback);
        } catch (Exception ignored) {
        }
        advertiser = null;
        try {
            if (openGatt != null) openGatt.close();
        } catch (Exception ignored) {
        }
        openGatt = null;
        dropClientKeys();
        try {
            if (gattServer != null) gattServer.close();
        } catch (Exception ignored) {
        }
        gattServer = null;
        synchronized (sessions) {
            for (ServerSession s : sessions.values()) s.zeroize();
            sessions.clear();
        }
        peerMtu.clear();
        delivered.clear();
        ignored.clear();
        legacyHintSent = false;
        candidates.clear();
        lastSeen.clear();
        failures.clear();
        retryAt.clear();
        waitQueue.clear();
        activeId = null;
        pumpScheduled = false;
        unwatchRadio();
    }

    @Override
    protected void handleOnDestroy() {
        halt();
        super.handleOnDestroy();
    }

    private static final class ServerSession {
        final BleCrypto.Ephemeral keys = BleCrypto.generate();
        final BleCrypto.NonceWindow nonces = new BleCrypto.NonceWindow();
        final BleCrypto.WriteAssembler assembler = new BleCrypto.WriteAssembler();
        byte[] reply;
        int mtu = 23;
        boolean open = true;

        void zeroize() {
            keys.zeroize();
            assembler.reset();
            if (reply != null) Arrays.fill(reply, (byte) 0);
            reply = null;
        }
    }
}
