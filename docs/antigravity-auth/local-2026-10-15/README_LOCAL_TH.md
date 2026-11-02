# เปิดทดลอง Huobao local — 15 ตุลาคม 2026

เปิด http://localhost:3013/storyvdo/ (เข้า / จะ redirect มาหน้านี้)

ชุดนี้เป็น server multi-user บนฐานข้อมูลทดสอบแยกและ synthetic Tora fixture. เครดิตที่เห็นเป็นตัวเลขจำลอง ไม่ใช่ยอดบัญชี Tora จริง. ไม่มี provider config และไม่สร้าง/คิดเงินวิดีโอจริง. ข้อมูลผู้ใช้เดิมไม่ได้ใช้เป็น fixture.

## บัญชีทดสอบ

วาง key นี้ในหน้าล็อกอิน:

- User A: `sk-synthetic-qa-user-a-key-primary-1001`
- User B: `sk-synthetic-qa-user-b-key-2001`
- key อีกอันของ User A: `sk-synthetic-qa-user-a-key-secondary-1002`
- บัญชีเครดิตศูนย์: `sk-synthetic-qa-user-zero-key-3001`

ใช้คนละ browser context หรือ logout ก่อนสลับบัญชี. A มี QA Isolated Drama User A; B มี QA Isolated Drama User B. ชื่อ/ข้อมูลเป็น fixture ทั้งหมด.

## หลักฐาน

QA_LOCAL.md, summary.json, logs/, screenshots/, traces/ เก็บผลที่ Antigravity QA รันจริง. PO_ACCEPTANCE_LOCAL.md ระบุขอบเขตที่รับผลและข้อจำกัด. po-test-counts.json ดึงจำนวนจริงจาก raw test logs เพราะ parser รุ่นแรกอ่าน Node spec reporter ไม่ได้.

## Processes

- fixture_tora: PID 4236, port 54811
- backend: PID 4574, port 5679
- frontend: PID 4575, port 3013

รันต่อไว้ให้ลองในเครื่องนี้. Temporary data directory: /var/folders/ph/bkl9clvj0wj4jk3r6p15w_yw0000gn/T/huobao_qa_local_xcr73nv1

หากต้องการหยุด ให้ใช้ process groups ที่เริ่มเฉพาะรอบนี้ (ตรวจ PID ใน summary.json ก่อน):

```python
import os, signal
os.killpg(4236, signal.SIGTERM)
os.killpg(4574, signal.SIGTERM)
os.killpg(4575, signal.SIGTERM)
```

ไม่ต้องเปลี่ยน .env หรือข้อมูล production เพื่อเปิดชุดทดสอบนี้. หลังหยุด processes แล้วการเปิดเว็บใหม่ต้องเริ่ม local fixture/backend/frontend ตาม environment ของรอบนี้อีกครั้ง.
