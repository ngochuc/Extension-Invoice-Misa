# Chrome Extension MV3

Một Chrome extension đơn giản sử dụng Manifest V3.

## Tính năng

- **Popup Interface**: Giao diện popup với các nút tương tác
- **Tab Information**: Lấy thông tin về tab hiện tại
- **Content Script**: Tương tác với nội dung trang web
- **Background Service Worker**: Xử lý các tác vụ nền
- **Storage API**: Lưu trữ dữ liệu extension

## Cấu trúc file

```
├── manifest.json          # File cấu hình chính
├── popup.html            # Giao diện popup
├── popup.js              # Logic cho popup
├── background.js         # Service worker
├── content.js            # Content script
├── icons/                # Thư mục chứa icons
└── README.md            # File hướng dẫn
```

## Cài đặt

1. Mở Chrome và truy cập `chrome://extensions/`
2. Bật "Developer mode" ở góc trên bên phải
3. Click "Load unpacked" và chọn thư mục chứa extension
4. Extension sẽ xuất hiện trong danh sách và thanh công cụ

## Sử dụng

1. Click vào icon extension trên thanh công cụ
2. Sử dụng các nút trong popup:
   - **Thực hiện hành động**: Highlight tất cả links trên trang
   - **Lấy thông tin tab**: Hiển thị title và URL của tab hiện tại

## Tùy chỉnh

### Thêm permissions mới
Chỉnh sửa `manifest.json`:
```json
"permissions": [
  "activeTab",
  "storage",
  "notifications"  // Thêm permission mới
]
```

### Thêm tính năng mới
1. Cập nhật `popup.html` để thêm UI
2. Thêm event listeners trong `popup.js`
3. Thêm logic xử lý trong `content.js` hoặc `background.js`

## Lưu ý

- Extension này sử dụng Manifest V3 (phiên bản mới nhất)
- Service Worker thay thế background pages
- Cần icons để extension hiển thị đúng (tạo file PNG với kích thước 16x16, 32x32, 48x48, 128x128)

## Debug

1. Mở Developer Tools cho popup: Right-click popup → Inspect
2. Xem console của content script: F12 trên trang web
3. Debug service worker: `chrome://extensions/` → Details → Inspect views: service worker