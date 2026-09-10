package com.rangeroadtech.tabletrade;

import android.Manifest;
import android.annotation.SuppressLint;
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
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Same-room looking. One phone reaches out, the other waits, then we retry if missed.
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
    private static final int MFG = 0xFFFF;

    private BluetoothGattServer gattServer;
    private BluetoothLeAdvertiser advertiser;
    private BluetoothLeScanner scanner;
    private BluetoothGatt openGatt;
    private byte[] payload = "{}".getBytes(StandardCharsets.UTF_8);
    private byte[] ourHash = new byte[4];
    private boolean running = false;
    private PluginCall pendingStart;
    private final Set<String> delivered = new HashSet<>();
    private final Set<String> inFlight = new HashSet<>();
    private final Map<String, BluetoothDevice> candidates = new HashMap<>();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable retryBeat = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            for (BluetoothDevice device : candidates.values()) {
                readPeer(device, true);
            }
            main.postDelayed(this, 4000);
        }
    };

    private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {
        @Override
        public void onStartSuccess(AdvertiseSettings settingsInEffect) {
            startScan();
            PluginCall call = pendingStart;
            pendingStart = null;
            if (call != null) call.resolve();
        }

        @Override
        public void onStartFailure(int errorCode) {
            Log.w(TAG, "advertise fail " + errorCode);
            failStart("Could not share over Bluetooth. Try I’m looking again.");
        }
    };

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            if (result == null || result.getDevice() == null) return;
            byte[] peerHash = peerHashFrom(result.getScanRecord());
            if (peerHash == null) return;
            BluetoothDevice device = result.getDevice();
            candidates.put(device.getAddress(), device);
            if (shouldReachOut(peerHash)) {
                readPeer(device, false);
            } else {
                main.postDelayed(() -> readPeer(device, true), 2500);
            }
        }
    };

    @PluginMethod
    public void start(PluginCall call) {
        String body = call.getString("payload", "{}");
        payload = body.getBytes(StandardCharsets.UTF_8);
        ourHash = hashId(call.getString("userId", ""));
        if (Build.VERSION.SDK_INT >= 31) {
            if (getPermissionState("scan") != PermissionState.GRANTED
                    || getPermissionState("advertise") != PermissionState.GRANTED
                    || getPermissionState("connect") != PermissionState.GRANTED) {
                requestPermissionForAliases(new String[] { "scan", "advertise", "connect" }, call, "permStart");
                return;
            }
        } else if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAliases(new String[] { "location" }, call, "permStart");
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
                call.reject("Allow Bluetooth, then tap I’m looking.");
                return;
            }
        } else if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Allow the nearby permission, then tap I’m looking.");
            return;
        }
        begin(call);
    }

    @PluginMethod
    public void setPayload(PluginCall call) {
        String body = call.getString("payload", "{}");
        payload = body.getBytes(StandardCharsets.UTF_8);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        halt();
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    private void begin(PluginCall call) {
        if (!getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)) {
            call.reject("This phone cannot use Bluetooth looking.");
            return;
        }
        BluetoothManager mgr = (BluetoothManager) getContext().getSystemService(android.content.Context.BLUETOOTH_SERVICE);
        if (mgr == null || mgr.getAdapter() == null || !mgr.getAdapter().isEnabled()) {
            call.reject("Turn Bluetooth on, then tap I’m looking.");
            return;
        }
        halt();
        running = true;
        pendingStart = call;
        delivered.clear();
        inFlight.clear();
        candidates.clear();
        try {
            gattServer = mgr.openGattServer(getContext(), serverCallback);
            BluetoothGattService service = new BluetoothGattService(SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY);
            BluetoothGattCharacteristic ch = new BluetoothGattCharacteristic(
                    CHAR,
                    BluetoothGattCharacteristic.PROPERTY_READ | BluetoothGattCharacteristic.PROPERTY_WRITE,
                    BluetoothGattCharacteristic.PERMISSION_READ | BluetoothGattCharacteristic.PERMISSION_WRITE);
            ch.setValue(payload);
            service.addCharacteristic(ch);
            if (!gattServer.addService(service)) {
                failStart("Could not start Bluetooth looking.");
            }
        } catch (Exception e) {
            Log.e(TAG, "start", e);
            failStart("Could not start Bluetooth looking.");
        }
    }

    @SuppressLint("MissingPermission")
    private void startAdvertiseAndScan() {
        if (!running) return;
        BluetoothManager mgr = (BluetoothManager) getContext().getSystemService(android.content.Context.BLUETOOTH_SERVICE);
        if (mgr == null || mgr.getAdapter() == null) {
            failStart("Turn Bluetooth on, then tap I’m looking.");
            return;
        }
        advertiser = mgr.getAdapter().getBluetoothLeAdvertiser();
        if (advertiser == null) {
            failStart("This phone cannot share over Bluetooth.");
            return;
        }
        AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setConnectable(true)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .build();
        byte[] mfg = new byte[6];
        mfg[0] = 'T';
        mfg[1] = 'T';
        System.arraycopy(ourHash, 0, mfg, 2, 4);
        AdvertiseData data = new AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .addManufacturerData(MFG, mfg)
                .build();
        try {
            advertiser.startAdvertising(settings, data, advertiseCallback);
        } catch (Exception e) {
            Log.e(TAG, "advertise", e);
            failStart("Could not share over Bluetooth. Try I’m looking again.");
        }
    }

    @SuppressLint("MissingPermission")
    private void startScan() {
        if (!running) return;
        BluetoothManager mgr = (BluetoothManager) getContext().getSystemService(android.content.Context.BLUETOOTH_SERVICE);
        if (mgr == null || mgr.getAdapter() == null) return;
        scanner = mgr.getAdapter().getBluetoothLeScanner();
        if (scanner == null) return;
        ScanSettings scanSettings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build();
        scanner.startScan(null, scanSettings, scanCallback);
        main.removeCallbacks(retryBeat);
        main.postDelayed(retryBeat, 4000);
    }

    private boolean shouldReachOut(byte[] peerHash) {
        for (int i = 0; i < 4; i++) {
            int a = ourHash[i] & 0xff;
            int b = peerHash[i] & 0xff;
            if (a < b) return true;
            if (a > b) return false;
        }
        return true;
    }

    private static byte[] hashId(String userId) {
        byte[] out = new byte[4];
        if (userId == null) return out;
        byte[] raw = userId.getBytes(StandardCharsets.UTF_8);
        for (int i = 0; i < raw.length; i++) {
            out[i % 4] ^= raw[i];
        }
        return out;
    }

    private static byte[] peerHashFrom(ScanRecord record) {
        if (record == null) return null;
        byte[] mfg = record.getManufacturerSpecificData(MFG);
        if (mfg == null || mfg.length < 6 || mfg[0] != 'T' || mfg[1] != 'T') return null;
        byte[] hash = new byte[4];
        System.arraycopy(mfg, 2, hash, 0, 4);
        return hash;
    }

    @SuppressLint("MissingPermission")
    private void readPeer(BluetoothDevice device, boolean fallback) {
        if (!running) return;
        final String id = device.getAddress();
        if (delivered.contains(id) || inFlight.contains(id)) return;
        if (!fallback && inFlight.contains(id)) return;
        inFlight.add(id);
        main.postDelayed(() -> inFlight.remove(id), 8000);
        main.post(() -> connectPeer(device, id));
    }

    @SuppressLint("MissingPermission")
    private void connectPeer(BluetoothDevice device, String id) {
        if (!running) return;
        try {
            if (openGatt != null) {
                openGatt.close();
                openGatt = null;
            }
            BluetoothGattCallback cb = new BluetoothGattCallback() {
                @Override
                public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        if (!gatt.requestMtu(517)) {
                            gatt.discoverServices();
                        }
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        gatt.close();
                        inFlight.remove(id);
                        if (openGatt == gatt) openGatt = null;
                    }
                }

                @Override
                public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) {
                    gatt.discoverServices();
                }

                @Override
                public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                    BluetoothGattService svc = gatt.getService(SERVICE);
                    BluetoothGattCharacteristic ch = svc == null ? null : svc.getCharacteristic(CHAR);
                    if (ch == null) {
                        gatt.disconnect();
                        return;
                    }
                    gatt.readCharacteristic(ch);
                }

                @Override
                public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
                    afterRead(gatt, characteristic, characteristic.getValue(), status, id);
                }

                @Override
                public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value, int status) {
                    afterRead(gatt, characteristic, value, status, id);
                }

                @Override
                public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
                    gatt.disconnect();
                }
            };
            openGatt = device.connectGatt(getContext(), false, cb, BluetoothDevice.TRANSPORT_LE);
        } catch (Exception e) {
            Log.w(TAG, "connect", e);
            inFlight.remove(id);
        }
    }

    @SuppressLint("MissingPermission")
    private void afterRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value, int status, String id) {
        if (status == BluetoothGatt.GATT_SUCCESS && value != null && value.length > 0) {
            emitPeer(value);
            delivered.add(id);
            writeOurs(gatt, characteristic);
            return;
        }
        inFlight.remove(id);
        gatt.disconnect();
    }

    @SuppressLint("MissingPermission")
    private void writeOurs(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                gatt.writeCharacteristic(characteristic, payload, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
            } else {
                characteristic.setValue(payload);
                gatt.writeCharacteristic(characteristic);
            }
        } catch (Exception e) {
            gatt.disconnect();
        }
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
        public void onCharacteristicReadRequest(BluetoothDevice device, int requestId, int offset,
                                                BluetoothGattCharacteristic characteristic) {
            if (gattServer == null) return;
            byte[] all = payload;
            if (offset >= all.length) {
                gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, new byte[0]);
                return;
            }
            int max = Math.min(512, all.length - offset);
            byte[] slice = new byte[max];
            System.arraycopy(all, offset, slice, 0, max);
            gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, slice);
        }

        @Override
        public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId,
                                                 BluetoothGattCharacteristic characteristic, boolean preparedWrite,
                                                 boolean responseNeeded, int offset, byte[] value) {
            if (gattServer != null && responseNeeded) {
                gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value);
            }
            if (value != null && value.length > 0 && !preparedWrite) {
                emitPeer(value);
                if (device != null) delivered.add(device.getAddress());
            }
        }
    };

    private void failStart(String msg) {
        PluginCall call = pendingStart;
        pendingStart = null;
        halt();
        if (call != null) call.reject(msg);
    }

    @SuppressLint("MissingPermission")
    private void halt() {
        running = false;
        main.removeCallbacks(retryBeat);
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
        try {
            if (gattServer != null) gattServer.close();
        } catch (Exception ignored) {
        }
        gattServer = null;
        delivered.clear();
        inFlight.clear();
        candidates.clear();
    }

    @Override
    protected void handleOnDestroy() {
        halt();
        super.handleOnDestroy();
    }
}
