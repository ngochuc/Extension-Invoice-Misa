// Background script - chỉ gọi API external của bạn

// Environment configuration
const ENV = 'production'; // 'development' hoặc 'production'
const API_CONFIG = {
  development: {
    baseUrl: 'http://localhost:3002',
    token: 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3NTA1NTc1NzEsImlzcyI6ImFwaS5jb21wYW55IiwiYXVkIjoiYXBpLmNsaWVudF9uYW1lIiwiaWQiOjQzLCJlbWFpbCI6ImN1b25ndnAyMzAyQGdtYWlsLmNvbSIsImZpcnN0X25hbWUiOiJDxrDhu51uZyIsImxhc3RfbmFtZSI6Ik5ndXnhu4VuIE3huqFuaCIsInVzZXJuYW1lIjoiQ3Vvbmc2NjgiLCJhdmF0YXIiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NJeDZrck1NRERwNjJqVHRlWi0teVF4MGJlbzhHc0VaLTI4ZWZjR2YxVmJRX0ZIeUxnNz1zOTYtYyIsImdwdF90b2tlbiI6ImU2ZmQ5ZmU1YzhlZmMxOThiNDA3ZTgyODFiMjc5NzUwIiwicm9sZSI6InJvb3RfYWRtaW4iLCJpc19ndWVzdCI6bnVsbH0.fwgoRcsUs4IHGQbif-NpWhiydRxMeiQrnfR-aOp0E9Y'
  },
  production: {
    baseUrl: 'https://rtapi.trungtamsach.vn',
    token: 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3NTA1NTc1NzEsImlzcyI6ImFwaS5jb21wYW55IiwiYXVkIjoiYXBpLmNsaWVudF9uYW1lIiwiaWQiOjQzLCJlbWFpbCI6ImN1b25ndnAyMzAyQGdtYWlsLmNvbSIsImZpcnN0X25hbWUiOiJDxrDhu51uZyIsImxhc3RfbmFtZSI6Ik5ndXnhu4VuIE3huqFuaCIsInVzZXJuYW1lIjoiQ3Vvbmc2NjgiLCJhdmF0YXIiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NJeDZrck1NRERwNjJqVHRlWi0teVF4MGJlbzhHc0VaLTI4ZWZjR2YxVmJRX0ZIeUxnNz1zOTYtYyIsImdwdF90b2tlbiI6ImU2ZmQ5ZmU1YzhlZmMxOThiNDA3ZTgyODFiMjc5NzUwIiwicm9sZSI6InJvb3RfYWRtaW4iLCJpc19ndWVzdCI6bnVsbH0.fwgoRcsUs4IHGQbif-NpWhiydRxMeiQrnfR-aOp0E9Y'
  }
};

// Get current environment config
const currentConfig = API_CONFIG[ENV];
console.log(`🌍 Running in ${ENV} mode - API: ${currentConfig.baseUrl}`);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('🎯 Background received message:', msg);
  
  if (msg.type === "GET_MY_API_DATA") {
    const invoiceLimit = msg.invoiceLimit || 10;
    getInvoiceDataFromMyAPI(invoiceLimit)
      .then((data) => {
        sendResponse({ success: true, data: data });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (msg.type === "MARK_INVOICE_CREATED") {
    markInvoiceCreated(msg.invoiceId, msg.misaCode)
      .then((data) => {
        sendResponse({ success: true, data: data });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

async function getInvoiceDataFromMyAPI(invoiceLimit = 10) {
  console.log(`🚀 Fetching pending invoices from API (limit: ${invoiceLimit})...`);
  
  try {
    const apiUrl = `${currentConfig.baseUrl}/api/v1/invoices/pending_misa?exclude_discount=true&limit=${invoiceLimit}`;
    // const apiUrl = `${currentConfig.baseUrl}/api/v1/invoices/272`;
    const token = currentConfig.token;
    
    console.log(`📡 API URL: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('✅ Raw API Response:', JSON.stringify(data, null, 2));
    
    if (data.status !== 'SUCCESS') {
      throw new Error(`API returned status: ${data.status}`);
    }
    
    // data.data là mảng các object { invoice: {...}, invoice_items: [...] }
    const invoicesData = data.data;
    
    if (!invoicesData || invoicesData.length === 0) {
      console.log('⚠️ No pending invoices found');
      return [];
    }
    
    console.log(`📦 Found ${invoicesData.length} pending invoices`);
    
    // Map từng invoice
    return invoicesData.map(invoiceData => {
      const invoice = invoiceData.invoice;
      const items = invoiceData.invoice_items;
      
      // 🚨 Kiểm tra item đặc biệt
      const specialItems = items.filter(item => 
        ['PHI-VAN-CHUYEN', 'DV-DONG-GOI', 'PHI_SAN'].includes(item.item_code)
      );
      
      const hasSpecialItems = specialItems.length > 0;
      const invoiceSeries = new Date(invoice.signed_at).getFullYear() == 2026 ? '1C26MAA' : '1C25MAA';
      console.log
      
      return {
        id: invoice.id,
        order_code: invoice.order_code,
        customerCode: "KLE",
        buyer: invoice.buyer_full_name,
        paymentMethod: invoice.payment_method === 'cash_on_delivery' ? 'TM/CK' : 'TM/CK',
        company_address: invoice.company_address,
        invoiceNo: parseInt(invoice.invoice_no),
        invoiceSeries: invoiceSeries,
        phone: invoice.phone,
        create_at: new Date(invoice.signed_at).toISOString(),
        // hasSpecialItems: hasSpecialItems, // 🚨 Flag để content script kiểm tra
        // specialItemCodes: hasSpecialItems ? specialItems.map(i => i.item_code) : [],
        
        items: items.map(item => {
          let price = parseFloat(item.price) || 0;
          const vatRate = parseFloat(item.vat_rate) || 0;
          let item_id = item.item_id;
          
          // Xử lý item đặc biệt
          if (!item_id && item.item_code == "PHI-VAN-CHUYEN") {
            item_id = 138609;
          } else if (!item_id && item.item_code == "DV-DONG-GOI") {
            item_id = 138463;
          } else if (!item_id && item.item_code == "PHI_SAN") {
            item_id = 138608;
          }
          
          // Tính ngược giá từ VAT
          if (vatRate > 0) {
            price = Math.round(price / (1 + vatRate / 100));
            if (item_id == 138609 || item_id == 138463 || item_id == 138608) {
              price = parseFloat(item.original_price);
            }
          }

          return {
            productCode: item_id,
            name: item.item_name,
            quantity: parseInt(item.quantity) || 1,
            price: price,
            originalPrice: parseFloat(item.original_price),
            vatAmount: item.vat_amount,
            totalAmount: item.total_amount,
            discountRate: 0,
            description: item.item_name
          };
        })
      };
    });
    
  } catch (error) {
    console.error('💥 Error fetching invoices:', error);
    throw error;
  }
}

// Callback đánh dấu invoice đã tạo
async function markInvoiceCreated(invoiceId, misaCode) {
  const apiUrl = `${currentConfig.baseUrl}/api/v1/invoices/mark_misa_created`;
  const token = currentConfig.token;
  
  console.log(`\n🔖 ========== MARKING INVOICE ==========`);
  console.log(`   Invoice ID: ${invoiceId}`);
  console.log(`   MISA Code: ${misaCode}`);
  console.log(`   API URL: ${apiUrl}`);
  console.log(`   Token (first 50 chars): ${token.substring(0, 50)}...`);
  console.log(`   Request body:`, JSON.stringify({ misa_code: misaCode, id: invoiceId }, null, 2));
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ misa_code: misaCode, id: invoiceId })
    });
    
    console.log(`   Response status: ${response.status} ${response.statusText}`);
    console.log(`   Response headers:`, Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`   ❌ API Error Response:`, errorText);
      throw new Error(`Failed to mark invoice: ${response.statusText}. Response: ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`   ✅ Success response:`, JSON.stringify(data, null, 2));
    console.log(`========================================\n`);
    return data;
    
  } catch (error) {
    console.error(`   💥 Error marking invoice:`, error.message);
    console.error(`   💥 Error stack:`, error.stack);
    console.error(`========================================\n`);
    throw error;
  }
}