// Background script - chỉ gọi API external của bạn

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('🎯 Background received message:', msg);
  console.log('📍 Sender info:', sender);
  
  if (msg.type === "GET_MY_API_DATA") {
    console.log('🚀 Processing GET_MY_API_DATA request...');
    
    // Xử lý async function với Promise
    getInvoiceDataFromMyAPI()
      .then((data) => {
        console.log('✅ Background API success, sending response:', data);
        sendResponse({ success: true, data: data });
      })
      .catch((error) => {
        console.error('❌ Background API error:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Quan trọng: return true để giữ message channel mở cho async response
    return true;
  } else {
    console.log('❓ Unknown message type:', msg.type);
  }
});

// Gọi API của bạn
async function getInvoiceDataFromMyAPI() {
  console.log('🚀 Starting API call to your server...');
  
  try {
    const apiUrl = 'https://rtapi.trungtamsach.vn/api/v1/invoices/220';
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3NTA1NTc1NzEsImlzcyI6ImFwaS5jb21wYW55IiwiYXVkIjoiYXBpLmNsaWVudF9uYW1lIiwiaWQiOjQzLCJlbWFpbCI6ImN1b25ndnAyMzAyQGdtYWlsLmNvbSIsImZpcnN0X25hbWUiOiJDxrDhu51uZyIsImxhc3RfbmFtZSI6Ik5ndXnhu4VuIE3huqFuaCIsInVzZXJuYW1lIjoiQ3Vvbmc2NjgiLCJhdmF0YXIiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NJeDZrck1NRERwNjJqVHRlWi0teVF4MGJlbzhHc0VaLTI4ZWZjR2YxVmJRX0ZIeUxnNz1zOTYtYyIsImdwdF90b2tlbiI6ImU2ZmQ5ZmU1YzhlZmMxOThiNDA3ZTgyODFiMjc5NzUwIiwicm9sZSI6InJvb3RfYWRtaW4iLCJpc19ndWVzdCI6bnVsbH0.fwgoRcsUs4IHGQbif-NpWhiydRxMeiQrnfR-aOp0E9Y'
    
    console.log('📡 API URL:', apiUrl);
    console.log('🔑 Token (first 50 chars):', token.substring(0, 50) + '...');
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    });
    
    console.log('📊 Response status:', response.status);
    console.log('📊 Response statusText:', response.statusText);
    console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error Response:', errorText);
      throw new Error(`API Error: ${response.status} - ${response.statusText}. Response: ${errorText}`);
    }
    
    const data = await response.json();
    console.log('✅ Raw API Response:', JSON.stringify(data, null, 2));
    
    // Kiểm tra status wrapper
    if (data.status !== 'SUCCESS') {
      throw new Error(`API returned status: ${data.status}`);
    }
    
    // Lấy data thực từ wrapper
    const actualData = data.data;
    
    // Kiểm tra cấu trúc dữ liệu
    console.log('🔍 Checking data structure...');
    console.log('- actualData.invoice exists:', !!actualData.invoice);
    console.log('- actualData.invoice_items exists:', !!actualData.invoice_items);
    
    if (actualData.invoice) {
      console.log('- invoice.buyer_full_name:', actualData.invoice.buyer_full_name);
      console.log('- invoice.company_address:', actualData.invoice.company_address);
      console.log('- invoice.phone:', actualData.invoice.phone);
      console.log('- invoice.payment_method:', actualData.invoice.payment_method);
    }
    
    if (actualData.invoice_items) {
      console.log('- invoice_items length:', actualData.invoice_items.length);
      console.log('- first item:', actualData.invoice_items[0]);
    }
    
    // Map dữ liệu từ API response của bạn
    const mappedData = {
      customerCode: "KLE", // Mặc định khách lẻ
      buyer: actualData.invoice?.buyer_full_name || 'Unknown buyer',
      paymentMethod: actualData.invoice?.payment_method === 'cash_on_delivery' ? 'TM/CK' : 'TM/CK',
      company_address: actualData.invoice?.company_address || '',
      phone: actualData.invoice?.phone || '',
      create_at: new Date(actualData.invoice?.create_at).toISOString() || new Date().toISOString(),

      // Mảng items - mỗi item có thông tin riêng
      items: actualData.invoice_items?.map((item, index) => {
        console.log(`🔄 Mapping item ${index + 1}:`, item);
        
        // Tính toán từ dữ liệu thực
        const price = parseFloat(item.price) || 0;
        const vatRate = parseFloat(item.vat_rate) || 0;
        const quantity = parseInt(item.quantity) || 1;
        let item_id = item.item_id;

        if(!item_id && item.item_code == "PHI-VAN-CHUYEN"){
          item_id = 138609
        } else if (!item_id && item.item_code == "DV-DONG-GOI") {
          item_id = 138463
        }
        
        return {
          productCode: item_id,
          name: item.name,
          quantity: quantity,
          price: price,
          vatRate: vatRate,
          discountRate: 0,
          description: item.name || 'No description'
        };
      }) || [] // Thêm fallback empty array
    };
    
    console.log('🎯 Final mapped data:', JSON.stringify(mappedData, null, 2));
    return mappedData;
    
  } catch (error) {
    console.error('💥 Error fetching data from your API:', error);
    console.error('💥 Error stack:', error.stack);
    
    // Fallback data nếu API lỗi
    const fallbackData = {
      customerCode: "KLE",
      buyer: "Test customer",
      paymentMethod: "TM/CK",
      items: [
        {
          productCode: "109284",
          quantity: 1,
          price: 50000,
          vatRate: 8,
          discountRate: 0,
          description: "Test product"
        }
      ]
    };
    
    console.log('🔄 Using fallback data:', fallbackData);
    return fallbackData;
  }
}