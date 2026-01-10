// Background script - chỉ gọi API external của bạn

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.type === "GET_MY_API_DATA") {
    try {
      const data = await getInvoiceDataFromMyAPI();
      sendResponse({ success: true, data: data });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  
  // Quan trọng: return true để giữ message channel mở cho async response
  return true;
});

// Gọi API của bạn
async function getInvoiceDataFromMyAPI() {
  try {
    // TODO: Thay đổi URL này thành API endpoint của bạn
    const response = await fetch('YOUR_API_ENDPOINT_HERE', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': 'Bearer YOUR_TOKEN' // nếu cần auth
      }
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // TODO: Map dữ liệu từ API response của bạn
    return {
      productCode: data.product_code || data.productCode,
      quantity: data.quantity || 1,
      price: data.price || data.unit_price,
      vatRate: data.vat_rate || data.vatRate || 0,
      discountRate: data.discount_rate || data.discountRate || 0,
      description: data.description || data.product_name,
      buyer: data.buyer || data.customer_name,
      paymentMethod: data.payment_method || "TM/CK",
      customerCode: data.customer_code || "KLE"
    };
    
  } catch (error) {
    console.error('Error fetching data from your API:', error);
    
    // Fallback data nếu API lỗi
    return {
      productCode: "109284",
      quantity: 1,
      price: 50000,
      vatRate: 8,
      discountRate: 0,
      description: "Test product",
      buyer: "Test customer",
      paymentMethod: "TM/CK",
      customerCode: "KLE"
    };
  }
}