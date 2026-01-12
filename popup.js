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
  
  if (!token || !context) {
    showStatus('Vui lòng nhập đầy đủ Token và Context!', 'error');
    return;
  }
  
  const button = this;
  button.disabled = true;
  button.textContent = 'Đang xử lý...';
  
  // Kiểm tra xem có đang ở trang MISA không
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];
    
    if (!currentTab.url || !currentTab.url.includes('actapp.misa.vn')) {
      button.disabled = false;
      button.textContent = 'Tạo hóa đơn';
      showStatus('❌ Vui lòng mở trang MISA trước khi sử dụng extension!', 'error');
      return;
    }
    
    // Gửi message đến content script
    chrome.tabs.sendMessage(currentTab.id, { 
      type: "CREATE_INVOICE",
      misaConfig: {
        token: token,
        context: context
      }
    }, function(response) {
      button.disabled = false;
      button.textContent = 'Tạo hóa đơn';
      
      if (chrome.runtime.lastError) {
        console.error("Runtime Error:", chrome.runtime.lastError);
        showStatus("❌ Lỗi kết nối: " + chrome.runtime.lastError.message + ". Vui lòng refresh trang MISA và thử lại.", 'error');
      } else if (response && !response.success) {
        showStatus("❌ Lỗi: " + response.error, 'error');
      } else if (response && response.success) {
        showStatus("✅ Tạo hóa đơn thành công!", 'success');
      } else {
        showStatus("❌ Không nhận được phản hồi từ trang MISA. Vui lòng refresh trang và thử lại.", 'error');
      }
    });
  });
};

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status ' + type;
  status.style.display = 'block';
  
  setTimeout(() => {
    status.style.display = 'none';
  }, 5000);
}