// Background script - chỉ gọi API external của bạn

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('🎯 Background received message:', msg);
  
  if (msg.type === "GET_MY_API_DATA") {
    getInvoiceDataFromMyAPI()
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

// Gọi API của bạn
async function getInvoiceDataFromMyAPI_OLD() {
  console.log('🚀 Starting API call to your server...');
  
  try {
    const apiUrl = 'https://rtapi.trungtamsach.vn/api/v1/invoices/5543';
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

    console.log('📊 Response create at:', actualData.invoice?.created_at)
    
    // Map dữ liệu từ API response của bạn
    const mappedData = {
      customerCode: "KLE", // Mặc định khách lẻ
      buyer: actualData.invoice?.buyer_full_name || 'Unknown buyer',
      paymentMethod: actualData.invoice?.payment_method === 'cash_on_delivery' ? 'TM/CK' : 'TM/CK',
      company_address: actualData.invoice?.company_address || '',
      phone: actualData.invoice?.phone || '',
      create_at: new Date(actualData.invoice?.created_at).toISOString() || new Date().toISOString(),

      
      // Mảng items - mỗi item có thông tin riêng
      items: actualData.invoice_items?.map((item, index) => {
        console.log(`🔄 Mapping item ${index + 1}:`, item);
        
        // Tính toán từ dữ liệu thực
        let price = parseFloat(item.price) || 0;
        const vatRate = parseFloat(item.vat_rate) || 0;
        const quantity = parseInt(item.quantity) || 1;
        let item_id = item.item_id;

        if(!item_id && item.item_code == "PHI-VAN-CHUYEN"){
          item_id = 138609
        } else if (!item_id && item.item_code == "DV-DONG-GOI") {
          item_id = 138463
        } else if (!item_id && item.item_code == "PHI_SAN") {
          item_id = 138608
        }

        if ( vatRate > 0 ) {
          price = Math.ceil(price / (1 + vatRate / 100));
          if( !item_id ) {  // dịch vụ lấy giá gốc không cần tính ngược từ vatRate
            price = parseFloat(item.original_price);
          }
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


async function getInvoiceDataFromMyAPI() {
  console.log('🚀 Fetching pending invoices from API...');
  
  try {
    // const apiUrl = 'https://rtapi.trungtamsach.vn/api/v1/invoices/pending_misa?exclude_discount=true';
    const apiUrl = 'http://localhost:3002/api/v1/invoices/pending_misa?exclude_discount=true';
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3NTA1NTc1NzEsImlzcyI6ImFwaS5jb21wYW55IiwiYXVkIjoiYXBpLmNsaWVudF9uYW1lIiwiaWQiOjQzLCJlbWFpbCI6ImN1b25ndnAyMzAyQGdtYWlsLmNvbSIsImZpcnN0X25hbWUiOiJDxrDhu51uZyIsImxhc3RfbmFtZSI6Ik5ndXnhu4VuIE3huqFuaCIsInVzZXJuYW1lIjoiQ3Vvbmc2NjgiLCJhdmF0YXIiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NJeDZrck1NRERwNjJqVHRlWi0teVF4MGJlbzhHc0VaLTI4ZWZjR2YxVmJRX0ZIeUxnNz1zOTYtYyIsImdwdF90b2tlbiI6ImU2ZmQ5ZmU1YzhlZmMxOThiNDA3ZTgyODFiMjc5NzUwIiwicm9sZSI6InJvb3RfYWRtaW4iLCJpc19ndWVzdCI6bnVsbH0.fwgoRcsUs4IHGQbif-NpWhiydRxMeiQrnfR-aOp0E9Y'
    
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
      
      return {
        id: invoice.id,
        order_code: invoice.order_code,
        customerCode: "KLE",
        buyer: invoice.buyer_full_name,
        paymentMethod: invoice.payment_method === 'cash_on_delivery' ? 'TM/CK' : 'TM/CK',
        company_address: invoice.company_address,
        phone: invoice.phone,
        create_at: new Date(invoice.created_at).toISOString(),
        
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
            price = Math.ceil(price / (1 + vatRate / 100));
            if (!item_id) {
              price = parseFloat(item.original_price);
            }
          }
          
          return {
            productCode: item_id,
            name: item.item_name,
            quantity: parseInt(item.quantity) || 1,
            price: price,
            vatRate: vatRate,
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
  // const apiUrl = `https://rtapi.trungtamsach.vn/api/v1/invoices/mark_misa_created`;
  const apiUrl = `http://localhost:3002/api/v1/invoices/mark_misa_created`;
  const token = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3NTA1NTc1NzEsImlzcyI6ImFwaS5jb21wYW55IiwiYXVkIjoiYXBpLmNsaWVudF9uYW1lIiwiaWQiOjQzLCJlbWFpbCI6ImN1b25ndnAyMzAyQGdtYWlsLmNvbSIsImZpcnN0X25hbWUiOiJDxrDhu51uZyIsImxhc3RfbmFtZSI6Ik5ndXnhu4VuIE3huqFuaCIsInVzZXJuYW1lIjoiQ3Vvbmc2NjgiLCJhdmF0YXIiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NJeDZrck1NRERwNjJqVHRlWi0teVF4MGJlbzhHc0VaLTI4ZWZjR2YxVmJRX0ZIeUxnNz1zOTYtYyIsImdwdF90b2tlbiI6ImU2ZmQ5ZmU1YzhlZmMxOThiNDA3ZTgyODFiMjc5NzUwIiwicm9sZSI6InJvb3RfYWRtaW4iLCJpc19ndWVzdCI6bnVsbH0.fwgoRcsUs4IHGQbif-NpWhiydRxMeiQrnfR-aOp0E9Y'
  
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