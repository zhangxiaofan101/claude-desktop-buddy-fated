#include "ble_bridge.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLESecurity.h>
#include <BLE2902.h>
#include <Arduino.h>
#include <string.h>

// Nordic UART Service UUIDs — every BLE serial example uses these, so
// existing tools (nRF Connect, bluefy, Web Bluetooth examples) can talk to
// us without custom UUIDs.
#define NUS_SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_RX_UUID      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_TX_UUID      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

// Incoming bytes are buffered in a simple ring for bleRead()/bleAvailable().
// Sized to hold a transcript snapshot JSON plus headroom; the GATT layer
// will flow-control if we fall behind.
static const size_t RX_CAP = 2048;
static uint8_t  rxBuf[RX_CAP];
static volatile size_t rxHead = 0;
static volatile size_t rxTail = 0;

static BLEServer*         server = nullptr;
static BLECharacteristic* txChar = nullptr;
static BLECharacteristic* rxChar = nullptr;
static volatile bool      connected = false;
static volatile bool      secure = false;
static volatile uint32_t  passkey = 0;
static volatile uint16_t  mtu = 23;

// Event flags posted by Bluedroid callbacks (Core 0) and drained by
// bleTick() in loop() (Core 1). Keep callbacks branchless and allocation-
// free — anything else (Serial logging, restartAdvertising) goes through
// these flags. esp32-arduino BLE is built on Bluedroid; bumping callback
// runtime starves the Bluedroid task and trips the interrupt watchdog.
static volatile bool _evtConnect    = false;
static volatile bool _evtDisconnect = false;
static volatile bool _evtAuthOk     = false;
static volatile bool _evtAuthFail   = false;
static volatile bool _evtPasskey    = false;
static volatile bool _evtMtu        = false;

static void rxPush(const uint8_t* p, size_t n) {
  for (size_t i = 0; i < n; i++) {
    size_t next = (rxHead + 1) % RX_CAP;
    if (next == rxTail) return;  // full — drop (upstream should keep up)
    rxBuf[rxHead] = p[i];
    rxHead = next;
  }
}

class RxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    std::string v = c->getValue();
    if (!v.empty()) rxPush((const uint8_t*)v.data(), v.size());
  }
};

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* s) override {
    connected = true;
    _evtConnect = true;
  }
  void onDisconnect(BLEServer* s) override {
    connected = false;
    secure = false;
    passkey = 0;
    mtu = 23;
    _evtDisconnect = true;   // bleTick() restarts advertising on Core 1
  }
  void onMtuChanged(BLEServer*, esp_ble_gatts_cb_param_t* param) override {
    mtu = param->mtu.mtu;
    _evtMtu = true;
  }
};

// LE Secure Connections, passkey-entry: we are DisplayOnly, the central
// is KeyboardOnly. The stack picks a random 6-digit passkey, calls
// onPassKeyNotify here, and the user types it on the desktop. main.cpp
// polls blePasskey() to render it.
class SecCallbacks : public BLESecurityCallbacks {
  uint32_t onPassKeyRequest() override { return 0; }
  bool onConfirmPIN(uint32_t) override { return false; }
  bool onSecurityRequest() override { return true; }
  void onPassKeyNotify(uint32_t pk) override {
    passkey = pk;
    _evtPasskey = true;
  }
  void onAuthenticationComplete(esp_ble_auth_cmpl_t cmpl) override {
    passkey = 0;
    secure = cmpl.success;
    if (cmpl.success) _evtAuthOk = true;
    else              _evtAuthFail = true;
    // Disconnect on auth failure stays here — it's a quick BLE API call
    // and waiting for loop() would let an unauthenticated peer hold the
    // link. server->disconnect() just queues a host event; safe in cb.
    if (!cmpl.success && server) server->disconnect(server->getConnId());
  }
};

void bleInit(const char* deviceName) {
  BLEDevice::init(deviceName);
  // We used to request 517 to match BLE 5 max. On M5StickC Plus + macOS +
  // Bluedroid + encrypted link that pushes BT-task pressure noticeably and
  // correlated with IWDT resets in the field. macOS's natural negotiated
  // MTU is around 185, so cap there. Our notifies are JSON ≤ ~250B and
  // the bleWrite() path already chunks, so this isn't a throughput hit.
  BLEDevice::setMTU(185);

  BLEDevice::setEncryptionLevel(ESP_BLE_SEC_ENCRYPT_MITM);
  BLEDevice::setSecurityCallbacks(new SecCallbacks());

  server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService* svc = server->createService(NUS_SERVICE_UUID);

  txChar = svc->createCharacteristic(
    NUS_TX_UUID,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  txChar->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED);
  BLE2902* cccd = new BLE2902();
  cccd->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED | ESP_GATT_PERM_WRITE_ENCRYPTED);
  txChar->addDescriptor(cccd);

  // WRITE only — no WRITE_NR. Write-without-response lets the central
  // fire commands faster than the GATT server can process them, and the
  // resulting backlog inside Bluedroid is a known IWDT trigger when the
  // foreground is also doing flash work. The bridge sends one JSON line
  // at a time and waits for an ack anyway, so WRITE (acked) is correct.
  rxChar = svc->createCharacteristic(
    NUS_RX_UUID,
    BLECharacteristic::PROPERTY_WRITE
  );
  rxChar->setAccessPermissions(ESP_GATT_PERM_WRITE_ENCRYPTED);
  rxChar->setCallbacks(new RxCallbacks());

  svc->start();

  BLESecurity* sec = new BLESecurity();
  sec->setAuthenticationMode(ESP_LE_AUTH_REQ_SC_MITM_BOND);
  sec->setCapability(ESP_IO_CAP_OUT);
  sec->setKeySize(16);
  sec->setInitEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);
  sec->setRespEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE_UUID);
  adv->setScanResponse(true);
  // Connection interval in 1.25ms units. The old 0x06..0x12 (7.5..22.5ms)
  // was Apple's "iOS friendly" range but it keeps the radio hot and feeds
  // BT-task pressure. 0x18..0x28 (30..50ms) is plenty for an approval-
  // chat workload (one write per few seconds) and gives Bluedroid more
  // breathing room between events.
  adv->setMinPreferred(0x18);
  adv->setMaxPreferred(0x28);
  BLEDevice::startAdvertising();
  Serial.printf("[ble] advertising as '%s'\n", deviceName);
}

// Pump deferred BLE callback work. Called from loop() on Core 1, so flash
// writes / Serial / startAdvertising here don't starve the Bluedroid task.
void bleTick() {
  if (_evtConnect)    { _evtConnect = false;    Serial.println("[ble] connected"); }
  if (_evtAuthOk)     { _evtAuthOk = false;     Serial.println("[ble] auth ok"); }
  if (_evtAuthFail)   { _evtAuthFail = false;   Serial.println("[ble] auth FAIL"); }
  if (_evtPasskey)    { _evtPasskey = false;
                        Serial.printf("[ble] passkey %06lu\n", (unsigned long)passkey); }
  if (_evtMtu)        { _evtMtu = false;        Serial.printf("[ble] mtu=%u\n", mtu); }
  if (_evtDisconnect) {
    _evtDisconnect = false;
    Serial.println("[ble] disconnected");
    // Re-arm advertising on Core 1 instead of inside the disconnect cb.
    BLEDevice::startAdvertising();
  }
}

bool bleConnected() { return connected; }
bool bleSecure()    { return secure; }
uint32_t blePasskey() { return passkey; }

void bleClearBonds() {
  int n = esp_ble_get_bond_device_num();
  if (n <= 0) return;
  esp_ble_bond_dev_t* list = (esp_ble_bond_dev_t*)malloc(n * sizeof(esp_ble_bond_dev_t));
  if (!list) return;
  esp_ble_get_bond_device_list(&n, list);
  for (int i = 0; i < n; i++) esp_ble_remove_bond_device(list[i].bd_addr);
  free(list);
  Serial.printf("[ble] cleared %d bond(s)\n", n);
}

size_t bleAvailable() {
  return (rxHead + RX_CAP - rxTail) % RX_CAP;
}

int bleRead() {
  if (rxHead == rxTail) return -1;
  int b = rxBuf[rxTail];
  rxTail = (rxTail + 1) % RX_CAP;
  return b;
}

size_t bleWrite(const uint8_t* data, size_t len) {
  if (!connected || !txChar) return 0;
  // ATT notify payload is limited to (MTU - 3). macOS negotiates 185, so
  // the 182-byte chunk works there; use the live mtu so a peer that caps
  // at the 23-byte default doesn't get truncated notifies.
  size_t chunk = mtu > 3 ? mtu - 3 : 20;
  if (chunk > 180) chunk = 180;
  size_t sent = 0;
  while (sent < len) {
    size_t n = len - sent;
    if (n > chunk) n = chunk;
    txChar->setValue((uint8_t*)(data + sent), n);
    txChar->notify();
    sent += n;
    // Small yield so the BLE stack flushes before the next chunk.
    delay(4);
  }
  return sent;
}
