document.addEventListener('DOMContentLoaded', function() {
  const actionBtn = document.getElementById('actionBtn');
  const getTabInfoBtn = document.getElementById('getTabInfo');
  const infoDiv = document.getElementById('info');
  const tabTitle = document.getElementById('tabTitle');
  const tabUrl = document.getElementById('tabUrl');

  // Xử lý nút hành động
  actionBtn.addEventListener('click', function() {
    // Gửi message đến content script
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'performAction'
      }, function(response) {
        if (response) {
          console.log('Response từ content script:', response);
        }
      });
    });
  });

  // Xử lý nút lấy thông tin tab
  getTabInfoBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentTab = tabs[0];
      
      tabTitle.textContent = `Tiêu đề: ${currentTab.title}`;
      tabUrl.textContent = `URL: ${currentTab.url}`;
      infoDiv.style.display = 'block';
    });
  });

  // Lưu dữ liệu vào storage
  function saveData(key, value) {
    chrome.storage.sync.set({[key]: value}, function() {
      console.log('Đã lưu dữ liệu:', key, value);
    });
  }

  // Đọc dữ liệu từ storage
  function loadData(key, callback) {
    chrome.storage.sync.get([key], function(result) {
      callback(result[key]);
    });
  }
});