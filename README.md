# 🛡️ Facebook KOL Brand Safety AI Auditor & Social Listening Crawler

Hệ thống tự động hóa cào dữ liệu thảo luận mạng xã hội Facebook (bài viết, bình luận, phản hồi) và sử dụng trí tuệ nhân tạo (LLM Gemini) để **bóc tách lùm xùm/phốt, đánh giá sắc thái cộng đồng và thẩm định an toàn thương hiệu (Brand Safety Score)** trước khi nhãn hàng quyết định hợp tác quảng cáo với KOL/Influencer.

---

## 🌟 Tính Năng Nổi Bật

- **🌐 Cào dữ liệu Facebook thế hệ mới (Playwright & GraphQL Interception):** Không phụ thuộc vào DOM HTML dễ vỡ. Hệ thống chặn bắt trực tiếp gói tin mạng GraphQL `/api/graphql/` để lấy dữ liệu bài viết và comment gốc có cấu trúc chuẩn xác.
- **🛡️ Bộ giải pháp Anti-Detect tiên tiến:** Giả lập thao tác cuộn chuột tự nhiên như người dùng thật (`humanLikeScroll`), che giấu thuộc tính `navigator.webdriver`, fake plugins và User-Agent để chống checkpoint/khóa tài khoản.
- **🤖 Thẩm định rủi ro bằng AI (Google Gemini):**
  - Tự động sinh danh sách từ khóa rủi ro theo tên KOL và ngành nghề cụ thể.
  - Phân loại sắc thái 4 mức: `POSITIVE`, `NEUTRAL`, `NEGATIVE_MILD`, `SCANDAL_HIGH_RISK`.
  - Phát hiện và trích xuất chi tiết lùm xùm (Tên sự việc, mức độ nghiêm trọng 0-100, bằng chứng hay tin đồn, tóm tắt phản ứng dư luận).
  - Đưa ra khuyến nghị hợp tác nhãn hàng: ngành nghề an toàn & ngành nghề kiêng kỵ quảng cáo.
- **📊 Quản trị trực quan qua Web Dashboard:**
  - Giao diện Dark Mode hiện đại, theo dõi tiến trình cào thời gian thực.
  - Hiển thị biểu đồ điểm an toàn, xem nhật ký lùm xùm và lịch sử các lần thẩm định.
  - Hỗ trợ tải trực tiếp báo cáo định dạng **Markdown (`.md`)** và **JSON (`.json`)**.
- **🚀 Khởi chạy 1-Click trên Windows:** Tích hợp sẵn các file `.bat` tiện lợi cho người dùng phổ thông.

---

## 📋 Yêu Cầu Môi Trường

- **Node.js**: Phiên bản 18.0.0 trở lên ([Tải tại đây](https://nodejs.org/)).
- **Trình duyệt**: Hỗ trợ Chromium (sẽ được cài đặt tự động qua lệnh của Playwright).
- **Tài khoản Facebook**: 1 tài khoản Facebook (khuyến nghị dùng tài khoản phụ / nick clone) để đăng nhập và lưu phiên cào dữ liệu.
- **Google Gemini API Key**: Đăng ký lấy key miễn phí tại [Google AI Studio](https://aistudio.google.com/).

---

## 🚀 Hướng Dẫn Cài Đặt Từng Bước

### Bước 1: Tải mã nguồn về máy

```bash
git clone https://github.com/ducthanh2212/crawl_social_network.git
cd crawl_social_network
```

### Bước 2: Cài đặt thư viện dependencies

```bash
npm install
```

Cài đặt trình duyệt Chromium cho Playwright:
```bash
npx playwright install chromium
```

### Bước 3: Cấu hình biến môi trường

Tạo file `.env` từ file mẫu `.env.example`:

**Trên Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**Trên Linux / macOS:**
```bash
cp .env.example .env
```

Mở file `.env` vừa tạo và điền Google Gemini API Key của bạn:
```env
GEMINI_API_KEY="AIzaSy...your_gemini_api_key_here..."
HEADLESS=true
LOG_LEVEL="info"
```

---

## 🔑 Bước 4: Đăng nhập Facebook & Lưu phiên làm việc (Chỉ cần làm 1 lần)

Hệ thống cần lưu cookie đăng nhập Facebook để có thể duyệt tìm kiếm và đọc bình luận.

- **Cách 1 (Windows - Khuyên dùng):** Nhấp đúp chuột vào file **`DANG_NHAP_FACEBOOK.bat`**.
- **Cách 2 (Terminal):** Chạy lệnh:
  ```bash
  npm run login:manual
  ```

Một cửa sổ trình duyệt Chrome sẽ hiện lên:
1. Đăng nhập tài khoản Facebook của bạn.
2. Sau khi vào được trang chủ Facebook, hệ thống sẽ tự động phát hiện và lưu phiên vào `data/sessions/storageState.json`.
3. Trình duyệt tự đóng lại, báo hiệu lưu phiên thành công!

> *Kiểm tra phiên đăng nhập bất kỳ lúc nào bằng lệnh: `npm run test:session`*

---

## 💻 Hướng Dẫn Sử Dụng

### Cách 1: Sử dụng giao diện Web Dashboard (Dễ nhất)

- **Trên Windows:** Nhấp đúp chuột vào file **`RUN_WEB_UI.bat`**.
- **Trên Terminal:**
  ```bash
  npm run ui
  ```
Trình duyệt sẽ tự động mở trang quản trị tại: **`http://localhost:3000`**

1. Nhập **Tên KOL / Influencer** (ví dụ: `Võ Hà Linh`, `Trấn Thành`, ...).
2. Nhập **Lĩnh vực / Ngành nghề** (ví dụ: `Mỹ phẩm & Beauty`, `Thời trang`, ...).
3. Bật hoặc tắt tùy chọn để AI tự sinh từ khóa tìm kiếm lùm xùm.
4. Bấm **BẮT ĐẦU QUÉT & THẨM ĐỊNH AI** và theo dõi kết quả hiển thị trực tiếp.

---

### Cách 2: Chạy trực tiếp bằng dòng lệnh CLI

Nếu muốn chạy tự động theo lịch (Cronjob / Pipeline CI-CD), bạn có thể chạy dòng lệnh:

```bash
# Chạy thẩm định với từ khóa do Gemini AI tự sinh
npm run start:brand-safety -- --target="Võ Hà Linh" --domain="Mỹ phẩm" --autoKeywords=true --maxPosts=10

# Chạy thẩm định với từ khóa tùy chỉnh
npm run start:brand-safety -- --target="Võ Hà Linh" --keywords="phốt,review,kem trộn,tẩy chay" --maxPosts=10 --maxComments=15
```

---

## 📁 Cấu Trúc Dữ Liệu Đầu Ra

Dữ liệu sau khi cào và thẩm định sẽ được lưu vào thư mục `data/`:
```text
data/
├── sessions/
│   └── storageState.json         # Phiên đăng nhập Facebook (được bảo mật trong .gitignore)
├── raw/
│   ├── search_results_*.json     # Danh sách các bài viết thô tìm kiếm được
│   └── comments_*.json           # Danh sách các bình luận thô cào được theo bài
└── processed/
    ├── REPORT_<kol_name>.json    # Dữ liệu thẩm định rủi ro có cấu trúc (chuẩn JSON)
    └── REPORT_<kol_name>.md      # Báo cáo tổng hợp chi tiết (chuẩn Markdown)
```

---

## 🔒 Lưu Ý Về An Toàn & Bảo Mật

1. **Bảo mật thông tin:** File `.gitignore` đã được cấu hình chặt chẽ để **không bao giờ push** file `.env` hoặc file cookie `storageState.json` lên Git. Tuyệt đối không xóa các dòng này khỏi `.gitignore`.
2. **Khuyến nghị tài khoản cào:** Luôn sử dụng tài khoản Facebook phụ (nick clone) để cào dữ liệu, tránh dùng tài khoản chính để đảm bảo an toàn tuyệt đối.
3. **Tuân thủ quy định:** Dự án phục vụ mục đích nghiên cứu, học tập, hỗ trợ nhãn hàng thẩm định truyền thông an toàn. Hãy tuân thủ điều khoản sử dụng của nền tảng khi khai thác dữ liệu.

---

## 📄 Giấy Phép (License)

Dự án phát hành dưới giấy phép ISC License.
