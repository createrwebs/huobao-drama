# วิธีล็อกอิน Google Colab CLI สำหรับบัญชีระบบ

ตรวจ source main วันที่ 10 ตุลาคม 2026. ขั้นตอนนี้เตรียม login/read session; ไม่สร้าง GPU และไม่ render.

## วิธีแนะนำ: OAuth2 ของ Colab CLI

ทำบนเครื่องที่จะเป็น worker ด้วย OS user ที่จะรัน service. ถ้ายังไม่มี CLI ให้ใช้ virtual environment แยก (ไม่แก้ dependencies ของ Huobao):

```sh
rtk python3 -m venv ~/.venvs/huobao-colab-cli
rtk ~/.venvs/huobao-colab-cli/bin/python -m pip install google-colab-cli
rtk ~/.venvs/huobao-colab-cli/bin/colab --auth oauth2 sessions
```

หาก `colab` ติดตั้งอยู่แล้ว ใช้ `rtk colab --auth oauth2 sessions` ได้เลย.

1. CLI แสดง URL ให้ authorize: เปิด URL นั้นใน browser
2. เลือกบัญชี Google ของระบบที่ใช้ Colab/Drive และตรวจสิทธิ์ที่ Google ขอ
3. Google แสดง authorization code: วางใน prompt `Enter the authorization code:` ของ terminal worker ไม่ส่ง code/token ในแชต
4. ทดสอบด้วยคำสั่ง sessions เดิมอีกครั้ง. รายการว่างอาจแปลว่า login ใช้ได้แต่ไม่มี VM; HTTP 401/403 เป็นปัญหา auth/access ที่ต้องแก้ก่อนเปิดงาน
5. Source ปัจจุบันมี bundled OAuth client config; ไม่ต้องใช้ Google API key แทน config. ถ้ามีไฟล์ `~/.colab-cli-oauth-config.json` เดิมจะ override bundled config และ client/redirect ที่ไม่ตรงอาจทำให้ `redirect_uri_mismatch` ต้องตรวจค่าที่ใช้จริง

OAuth credential cache อยู่ที่ `~/.config/colab-cli/token.json`. เป็น secret ของ service user; ไม่ commit หรือส่งให้ client. `--config` แยก session metadata ได้ แต่ source OAuth token path ปัจจุบันไม่ได้เปลี่ยนตาม flag นี้ จึงไม่ใช้ flag นี้อ้างว่าแยก credential ของหลายบัญชีแล้ว.

## ทางเลือก: ADC ถ้า worker มี gcloud อยู่แล้ว

```sh
rtk gcloud auth application-default login --no-launch-browser --scopes=openid,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/colaboratory
rtk colab --auth adc sessions
```

`gcloud auth login` อย่างเดียวไม่ใช่ ADC login. คำสั่ง application-default login สามารถแทนที่ ADC ของ OS user เดิม จึงใช้ service user ของ worker แยกตาม deployment. ยังไม่ถือว่า service-account ADC ทำงานกับ consumer Colab ได้จนกว่าจะมี live test.

## Google Drive หลังมี runtime

```sh
rtk colab --auth oauth2 drivemount -s huobao-render /content/drive
```

คำสั่งนี้ใช้ได้เมื่อมี session ชื่อ `huobao-render` แล้ว และอาจขอ browser consent อีกครั้ง. `colab auth` เป็น GCP auth ภายใน VM ไม่ใช่คำสั่งแทน login ของ CLI. การสร้าง runtime ต้องกำหนด compute budget/GPU ของระบบก่อน; ไม่รวมในชุดตรวจ login ข้างบน.

## แหล่งอ้างอิง

- [Colab CLI README](https://github.com/googlecolab/google-colab-cli)
- [Source OAuth flow และ credential cache](https://github.com/googlecolab/google-colab-cli/blob/main/src/colab_cli/auth.py)
- [Source default --auth](https://github.com/googlecolab/google-colab-cli/blob/main/src/colab_cli/cli.py)
- [Authentication และ Drive mount](https://github.com/googlecolab/google-colab-cli/blob/main/docs/04_automation_and_utility.md)
- [Google: gcloud ADC login](https://docs.cloud.google.com/sdk/gcloud/reference/auth/application-default/login)

ข้อจำกัด: verified from source/docs; ยังไม่ติดตั้งแพ็กเกจหรือทำ OAuth/live session บนเครื่องผู้ใช้ในรอบนี้. API key ที่ผู้ใช้ส่งมาไม่ได้ถูกเรียก/บันทึก.
