# Huobao Flow Bridge

Local-only WebSocket daemon for the Flow Chrome extension.

> **สำคัญ:** ตัวนี้ทำงานแบบ local บนเครื่องเดียวกัน ไม่ใช่ public online service
> เพราะมันอ่าน session/cookies ของ Google Flow และ bind เฉพาะ `127.0.0.1`
> เพื่อไม่ส่ง credential ออกอินเทอร์เน็ต

## วิธีใช้งานแบบเร็ว

เปิด PowerShell ที่โฟลเดอร์โปรเจคหลัก:

```powershell
cd D:\huobao-drama
npm.cmd run dev:bridge
```

จากนั้น:

1. เปิด Chrome ไปที่ `chrome://extensions`
2. เปิด **Developer mode**
3. กด **Load unpacked** แล้วเลือก `D:\huobao-drama\flow-drama-autopilot\bridge-extension`
4. เปิด `https://flow.google.com` และ sign in ด้วย Google
5. กดไอคอน **Flow Bridge** เพื่อดู popup
6. รอจนขึ้น **Connected**

การจับคู่ token เป็นอัตโนมัติ: การเชื่อมต่อครั้งแรกจะรับ token จาก bridge,
บันทึกไว้ใน Chrome storage และ reconnect เอง ไม่ต้อง paste token ใน popup

ถ้า popup ขึ้น **Offline** ให้ตรวจว่า bridge รันอยู่และมีพอร์ต `9222`:

```powershell
Get-NetTCPConnection -LocalPort 9222 -State Listen
```

ถ้ามี token pairing เก่าหรือเปลี่ยนเครื่อง ให้ลบ pairing แล้วรันใหม่:

```powershell
Remove-Item "$env:USERPROFILE\.huobao-flow-bridge\pairing.json" -Force -ErrorAction SilentlyContinue
```

จากนั้นกด **Reload** ที่ extension ใน `chrome://extensions`

## Current scope

- Listens on `ws://127.0.0.1:9222` by default.
- Accepts the extension's `bridge.ready` event.
- Performs first-connection pairing by sending `config.set` with a generated token.
- Requires the token on later connections.
- Supports request correlation and operation timeouts.
- Normalizes Google cookies to the Qzent-compatible shape without sending them anywhere automatically.
- Does not expose arbitrary Chrome DevTools/CDP calls.

The current daemon is the local protocol foundation. Qzent HTTP calls and Huobao task integration are subsequent phases.

## Development

From `d:\huobao-drama\flow-bridge`:

```text
npm install
npm run typecheck
npm run build
npm test
npm start
```

PowerShell environments that block `npm.ps1` can use `npm.cmd`.

Environment variables:

```text
FLOW_BRIDGE_HOST=127.0.0.1
FLOW_BRIDGE_PORT=9222
FLOW_BRIDGE_REQUEST_TIMEOUT_MS=15000
FLOW_BRIDGE_STATE_FILE=<local pairing file>
```

Pairing state defaults to a restrictive local file under the user's home directory. It must not be copied into source control or sent to chat.