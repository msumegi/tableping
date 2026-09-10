package com.rangeroadtech.tabletrade;

import android.Manifest;
import android.annotation.SuppressLint;
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
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.ParcelUuid;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Same-room looking: advertise + scan + a small GATT read.
 * JS API is platform-neutral so iPhone can use the same calls later.
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

    private BluetoothGattServer gattServer;
    private BluetoothLeAdvertiser advertiser;
    private BluetoothLeScanner scanner;
    private BluetoothGatt openGatt;
    private byte[] payload = "{}".getBytes(StandardCharsets.UTF_8);
    private boolean running = false;
    private final Set<String> seen = new HashSet<>();

    private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {
        @Override
        public void onStartFailure(int errorCode) {
            Log.w(TAG, "advertise fail " + errorCode);
        }
    };

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            if (result == null || result.getDevice() == null) return;
            readPeer(result.getDevice());
        }
    };

    @PluginMethod
    public void start(PluginCall call) {
        String body = call.getString("payload", "{}");
        payload = body.getBytes(StandardCharsets.UTF_8);
        if (Build.VERSION.SDK_INT >= 31) {
            if (getPermissionState("scan") != com.getcapacitor.PermissionState.GRANTED
                    || getPermissionState("advertise") != com.getcapacitor.PermissionState.GRANTED
                    || getPermissionState("connect") != com.getcapacitor.PermissionState.GRANTED) {
                requestPermissionForAliases(new String[] { "scan", "advertise", "connect" }, call, "permStart");
                return;
            }
        } else if (getPermissionState("location") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAliases(new String[] { "location" }, call, "permStart");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void permStart(PluginCall call) {
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
        seen.clear();
        try {
            gattServer = mgr.openGattServer(getContext(), serverCallback);
            BluetoothGattService service = new BluetoothGattService(SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY);
            BluetoothGattCharacteristic ch = new BluetoothGattCharacteristic(
                    CHAR,
                    BluetoothGattCharacteristic.PROPERTY_READ,
                    BluetoothGattCharacteristic.PERMISSION_READ);
            service.addCharacteristic(ch);
            gattServer.addService(service);

            advertiser = mgr.getAdapter().getBluetoothLeAdvertiser();
            if (advertiser == null) {
                call.reject("This phone cannot share over Bluetooth.");
                halt();
                return;
            }
            AdvertiseSettings settings = new AdvertiseSettings.Builder()
                    .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                    .setConnectable(true)
                    .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                    .build();
            AdvertiseData data = new AdvertiseData.Builder()
                    .setIncludeDeviceName(false)
                    .addServiceUuid(new ParcelUuid(SERVICE))
                    .build();
            advertiser.startAdvertising(settings, data, advertiseCallback);

            scanner = mgr.getAdapter().getBluetoothLeScanner();
            ScanFilter filter = new ScanFilter.Builder().setServiceUuid(new ParcelUuid(SERVICE)).build();
            ScanSettings scanSettings = new ScanSettings.Builder()
                    .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                    .build();
            scanner.startScan(Collections.singletonList(filter), scanSettings, scanCallback);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "start", e);
            halt();
            call.reject("Could not start Bluetooth looking.");
        }
    }

    @SuppressLint("MissingPermission")
    private void readPeer(BluetoothDevice device) {
        if (!running) return;
        String id = device.getAddress();
        if (seen.contains(id)) return;
        seen.add(id);
        try {
            if (openGatt != null) {
                openGatt.close();
                openGatt = null;
            }
            openGatt = device.connectGatt(getContext(), false, new BluetoothGattCallback() {
                @Override
                public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        gatt.discoverServices();
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        gatt.close();
                        if (openGatt == gatt) openGatt = null;
                    }
                }

                @Override
                public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                    BluetoothGattService svc = gatt.getService(SERVICE);
                    if (svc == null) {
                        gatt.disconnect();
                        return;
                    }
                    BluetoothGattCharacteristic ch = svc.getCharacteristic(CHAR);
                    if (ch == null) {
                        gatt.disconnect();
                        return;
                    }
                    gatt.readCharacteristic(ch);
                }

                @Override
                public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
                    byte[] value = characteristic.getValue();
                    if (value != null && value.length > 0) {
                        JSObject ev = new JSObject();
                        ev.put("payload", new String(value, StandardCharsets.UTF_8));
                        notifyListeners("peer", ev);
                    }
                    gatt.disconnect();
                }
            });
        } catch (Exception e) {
            Log.w(TAG, "readPeer", e);
            seen.remove(id);
        }
    }

    private final BluetoothGattServerCallback serverCallback = new BluetoothGattServerCallback() {
        @Override
        public void onCharacteristicReadRequest(BluetoothDevice device, int requestId, int offset,
                                                BluetoothGattCharacteristic characteristic) {
            if (gattServer == null) return;
            byte[] slice = payload;
            if (offset > 0) {
                if (offset >= slice.length) {
                    gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, new byte[0]);
                    return;
                }
                byte[] rest = new byte[slice.length - offset];
                System.arraycopy(slice, offset, rest, 0, rest.length);
                slice = rest;
            }
            gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, slice);
        }
    };

    @SuppressLint("MissingPermission")
    private void halt() {
        running = false;
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
        seen.clear();
    }

    @Override
    protected void handleOnDestroy() {
        halt();
        super.handleOnDestroy();
    }
}
