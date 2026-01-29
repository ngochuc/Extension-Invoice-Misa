// Auto-load saved values khi popup mở
document.addEventListener('DOMContentLoaded', function() {
  loadSavedValues();
  setupAutoSave();
});

// Load giá trị đã lưu
function loadSavedValues() {
  chrome.storage.local.get(['misaToken', 'misaContext'], function(result) {
    if (result.misaToken) {
      document.getElementById('token').value = result.misaToken;
      document.getElementById('tokenSaved').style.display = 'inline';
    }
    if (result.misaContext) {
      document.getElementById('context').value = result.misaContext;
      document.getElementById('contextSaved').style.display = 'inline';
    }
  });
}

// Setup auto-save khi user nhập
function setupAutoSave() {
  const tokenField = document.getElementById('token');
  const contextField = document.getElementById('context');
  
  // Auto-save token
  tokenField.addEventListener('input', function() {
    const value = this.value.trim();
    if (value) {
      chrome.storage.local.set({ misaToken: value });
      document.getElementById('tokenSaved').style.display = 'inline';
    } else {
      chrome.storage.local.remove('misaToken');
      document.getElementById('tokenSaved').style.display = 'none';
    }
  });
  
  // Auto-save context
  contextField.addEventListener('input', function() {
    const value = this.value.trim();
    if (value) {
      chrome.storage.local.set({ misaContext: value });
      document.getElementById('contextSaved').style.display = 'inline';
    } else {
      chrome.storage.local.remove('misaContext');
      document.getElementById('contextSaved').style.display = 'none';
    }
  });
}

// Xử lý click button
document.getElementById("send").onclick = function() {
  const token = document.getElementById('token').value.trim();
  const context = document.getElementById('context').value.trim();
  const invoiceLimit = parseInt(document.getElementById('invoiceLimit').value) || 10;
  
  if (!token || !context) {
    showStatus('Vui lòng nhập đầy đủ Token và Context!', 'error');
    return;
  }
  
  if (invoiceLimit < 1 || invoiceLimit > 1000) {
    showStatus('Số lượng hóa đơn phải từ 1 đến 1000!', 'error');
    return;
  }
  
  const button = this;
  button.disabled = true;
  button.textContent = 'Đang xử lý...';
  
  // Ẩn status cũ, hiện progress
  document.getElementById('status').style.display = 'none';
  showProgress();
  
  // Kiểm tra xem có đang ở trang MISA không
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];
    
    if (!currentTab.url || !currentTab.url.includes('actapp.misa.vn')) {
      button.disabled = false;
      button.textContent = 'Tạo hóa đơn';
      hideProgress();
      showStatus('❌ Vui lòng mở trang MISA trước khi sử dụng extension!', 'error');
      return;
    }
    
    // Gửi message đến content script
    chrome.tabs.sendMessage(currentTab.id, { 
      type: "CREATE_INVOICE",
      misaConfig: {
        token: token,
        context: context
      },
      invoiceLimit: invoiceLimit
    }, function(response) {
      button.disabled = false;
      button.textContent = 'Tạo hóa đơn';
      hideProgress();
      
      if (chrome.runtime.lastError) {
        console.error("Runtime Error:", chrome.runtime.lastError);
        showStatus("❌ Lỗi kết nối: " + chrome.runtime.lastError.message + ". Vui lòng refresh trang MISA và thử lại.", 'error');
      } else if (response && !response.success) {
        showStatus("❌ Lỗi: " + response.error, 'error');
      } else if (response && response.success) {
        // Hiển thị kết quả chi tiết
        const total = response.total || 0;
        const successCount = response.successCount || 0;
        const failedCount = response.failedCount || 0;
        
        let message = `✅ Hoàn thành!\n`;
        message += `Tổng: ${total} | Thành công: ${successCount} | Thất bại: ${failedCount}`;
        
        // Hiển thị success invoices với misa_code
        if (successCount > 0 && response.successInvoices) {
          message += `\n\nCác invoice thành công:`;
          response.successInvoices.forEach((inv, idx) => {
            message += `\n${idx + 1}. ID ${inv.id} - ${inv.order_code} - MISA: ${inv.misa_code}`;
          });
        }
        
        // Hiển thị failed invoices
        if (failedCount > 0 && response.failedInvoices) {
          message += `\n\nCác invoice thất bại:`;
          response.failedInvoices.forEach((inv, idx) => {
            message += `\n${idx + 1}. ID ${inv.id} - ${inv.error}`;
          });
        }
        
        showStatus(message, successCount > 0 ? 'success' : 'error', 15000);
        
        // Log chi tiết ra console
        console.log('Invoice creation result:', response);
      } else {
        showStatus("❌ Không nhận được phản hồi từ trang MISA. Vui lòng refresh trang và thử lại.", 'error');
      }
    });
  });
};

// Hiển thị progress
function showProgress() {
  const progressDiv = document.getElementById('progress');
  progressDiv.style.display = 'block';
  updateProgress(0, 0, 'Đang lấy danh sách hóa đơn...');
  clearProgressDetails();
}

// Ẩn progress
function hideProgress() {
  document.getElementById('progress').style.display = 'none';
}

// Update progress bar và text
function updateProgress(current, total, text) {
  const progressText = document.getElementById('progressText');
  const progressFill = document.getElementById('progressFill');
  
  if (total > 0) {
    const percent = (current / total) * 100;
    progressFill.style.width = percent + '%';
    progressText.textContent = `${text} (${current}/${total})`;
  } else {
    progressFill.style.width = '0%';
    progressText.textContent = text;
  }
}

// Thêm log vào progress details
function addProgressLog(message, type = 'info') {
  const detailsDiv = document.getElementById('progressDetails');
  const logItem = document.createElement('div');
  logItem.className = `progress-item ${type}`;
  logItem.textContent = message;
  detailsDiv.appendChild(logItem);
  
  // Auto scroll to bottom
  detailsDiv.scrollTop = detailsDiv.scrollHeight;
}

// Clear progress details
function clearProgressDetails() {
  document.getElementById('progressDetails').innerHTML = '';
}

// Listen for progress updates from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PROGRESS_UPDATE') {
    const data = msg.data;
    
    if (data.status === 'start') {
      updateProgress(0, data.total, 'Bắt đầu xử lý...');
      addProgressLog(`📦 Tìm thấy ${data.total} hóa đơn cần tạo`, 'info');
    } else if (data.status === 'processing') {
      updateProgress(data.current, data.total, `Đang xử lý invoice ${data.current}/${data.total}`);
      addProgressLog(`🔄 Invoice #${data.invoiceId} - ${data.orderCode} - Đang xử lý...`, 'processing');
    } else if (data.status === 'success') {
      addProgressLog(`✅ Invoice #${data.invoiceId} - ${data.orderCode} - Thành công`, 'success');
    } else if (data.status === 'error') {
      addProgressLog(`❌ Invoice #${data.invoiceId} - ${data.orderCode} - Lỗi: ${data.error}`, 'error');
    } else if (data.status === 'stopped') {
      addProgressLog(`\n🛑 DỪNG TẠO HÓA ĐƠN`, 'error');
      addProgressLog(`Invoice #${data.invoiceId} - ${data.orderCode}`, 'error');
      addProgressLog(`Có item đặc biệt: ${data.specialItems.join(', ')}`, 'error');
      addProgressLog(`⚠️ Các invoice sau sẽ không được tạo. Vui lòng xem xét!`, 'error');
    } else if (data.status === 'complete') {
      updateProgress(data.total, data.total, 'Hoàn thành!');
      addProgressLog(`\n📊 Tổng kết: ${data.successCount} thành công, ${data.failedCount} thất bại`, 'info');
    } else if (data.status === 'excel_exported') {
      addProgressLog(`📊 Đã xuất file Excel: ${data.filename} (${data.count} records)`, 'success');
    } else if (data.status === 'excel_error') {
      addProgressLog(`❌ Lỗi xuất Excel: ${data.error}`, 'error');
    }
  }
});

function showStatus(message, type, duration = 5000) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status ' + type;
  status.style.display = 'block';
  status.style.whiteSpace = 'pre-line'; // Cho phép xuống dòng
  
  if (duration > 0) {
    setTimeout(() => {
      status.style.display = 'none';
    }, duration);
  }
}