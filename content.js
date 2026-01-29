// Content script - xử lý trên trang MISA
console.log('MISA Extension Content Script loaded');

// Import payload builder
// Note: Trong Chrome extension, cần load script qua manifest.json

// Lắng nghe message từ popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('Content script received message:', msg);

  if (msg.type === "CREATE_INVOICE") {
    // Xử lý async function với Promise
    createInvoiceFlow(msg.misaConfig, msg.invoiceLimit)
      .then((result) => {
        sendResponse({ 
          success: true,
          total: result.total,
          successCount: result.successCount,
          failedCount: result.failedCount,
          successInvoices: result.successInvoices,
          failedInvoices: result.failedInvoices
        });
      })
      .catch((error) => {
        console.error("Error in createInvoiceFlow:", error);
        sendResponse({ success: false, error: error.message });
      });

    // Quan trọng: return true để giữ message channel mở cho async response
    return true;
  }
});

// Flow chính tạo hóa đơn - Xử lý nhiều invoices với delay
async function createInvoiceFlow(misaConfig, invoiceLimit = 10) {
  try {
    const { token, context } = misaConfig;
    
    if (!token || !context) {
      throw new Error("Thiếu thông tin Token hoặc Context!");
    }
    
    // 1. Lấy danh sách invoices (1 lần duy nhất)
    console.log('📥 Fetching invoices from API...');
    const myDataResponse = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ 
        type: "GET_MY_API_DATA",
        invoiceLimit: invoiceLimit
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
    
    if (!myDataResponse || !myDataResponse.success) {
      throw new Error("Lỗi lấy dữ liệu: " + (myDataResponse?.error || 'Unknown error'));
    }
    
    const invoices = myDataResponse.data; // Mảng invoices

    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
      throw new Error("Không có invoice nào cần tạo");
    }
    
    console.log(`📦 Got ${invoices.length} invoices to process`);
    
    // Send progress: start
    sendProgressUpdate({
      status: 'start',
      total: invoices.length
    });
    
    let successCount = 0;
    let failedCount = 0;
    const failedInvoices = []; // Lưu danh sách failed để log
    const successInvoices = []; // Lưu danh sách success với misa_code
    
    // 2. Loop qua từng invoice với delay
    for (let i = 0; i < invoices.length; i++) {
      const myData = invoices[i];
      
      // 🚨 KIỂM TRA ITEM ĐẶC BIỆT - DỪNG HOÀN TOÀN
      if (myData.hasSpecialItems) {
        // Send progress: stopped
        sendProgressUpdate({
          status: 'stopped',
          current: i + 1,
          total: invoices.length,
          invoiceId: myData.id,
          orderCode: myData.order_code,
          specialItems: myData.specialItemCodes
        });
        
        // Throw error để dừng hoàn toàn
        throw new Error(`Invoice #${myData.id} (${myData.order_code}) có item đặc biệt: ${myData.specialItemCodes.join(', ')}. Vui lòng xem xét trước khi tạo!`);
      }
      
      try {
        // Send progress: processing
        sendProgressUpdate({
          status: 'processing',
          current: i + 1,
          total: invoices.length,
          invoiceId: myData.id,
          orderCode: myData.order_code
        });
        
        // Validate invoice data
        if (!myData.items || !Array.isArray(myData.items) || myData.items.length === 0) {
          throw new Error("Invoice không có items");
        }
        
        // Lấy refno
        const refno = await getNextRefNo(token, context);
        console.log(`📋 RefNo: BH=${refno[353]}, XK=${refno[202]}`);
        
        // Lấy inventory items từ MISA
        const inventoryItems = [];
        for (let j = 0; j < myData.items.length; j++) {
          const myDataItem = myData.items[j];
          
          const inventoryItem = await getInventoryItemFromMISA(token, context, myDataItem.productCode);
          if (!inventoryItem) {
            throw new Error(`Không tìm thấy sản phẩm: ${myDataItem.productCode}`);
          }
          
          inventoryItems.push({ myDataItem, inventoryItem });
          
          // Delay nhỏ giữa các item lookup
          if (j < myData.items.length - 1) {
            await sleep(300);
          }
        }
        
        // Build payload
        const payload = buildCompletePayload({ myData, inventoryItems, refno });
        
        // Gửi MISA
        const response = await fetch("https://actapp.misa.vn/g1/api/sa/v1/sa_voucher/save_full", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token,
            "x-misa-context": context
          },
          body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (response.ok) {
          // 🎯 CALLBACK: Đánh dấu invoice đã tạo xong
          await markInvoiceAsCreated(myData.id, refno[353]);
          
          successCount++;
          
          // Lưu thông tin success invoice
          successInvoices.push({
            id: myData.id,
            order_code: myData.order_code,
            buyer: myData.buyer,
            misa_code: refno[353]
          });
          
          // Send progress: success
          sendProgressUpdate({
            status: 'success',
            current: i + 1,
            total: invoices.length,
            invoiceId: myData.id,
            orderCode: myData.order_code
          });
        } else {
          throw new Error(result.message || result.error || JSON.stringify(result));
        }
        
      } catch (error) {
        // ❌ CHỈ LOG RA, KHÔNG CALLBACK
        console.error(`\n${'='.repeat(60)}`);
        console.error(`❌ Invoice ${myData.id} FAILED`);
        console.error(`   Order Code: ${myData.order_code || 'N/A'}`);
        console.error(`   Buyer: ${myData.buyer || 'N/A'}`);
        console.error(`   Error: ${error.message}`);
        console.error(`${'='.repeat(60)}`);
        
        failedCount++;
        failedInvoices.push({
          id: myData.id,
          order_code: myData.order_code,
          buyer: myData.buyer,
          error: error.message
        });
        
        // Send progress: error
        sendProgressUpdate({
          status: 'error',
          current: i + 1,
          total: invoices.length,
          invoiceId: myData.id,
          orderCode: myData.order_code,
          error: error.message
        });
      }
      
      // 3. DELAY giữa các invoice (quan trọng!)
      if (i < invoices.length - 1) {
        console.log(`\n⏳ Waiting 1 seconds before next invoice...\n`);
        await sleep(1000); // 3 giây
      }
    }
    
    // 4. Tổng kết và log
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 SUMMARY:`);
    console.log(`   Total: ${invoices.length}`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failedCount}`);
    console.log(`${'='.repeat(60)}`);
    
    if (successInvoices.length > 0) {
      console.log(`\n✅ SUCCESS INVOICES:`);
      successInvoices.forEach((inv, idx) => {
        console.log(`${idx + 1}. ID: ${inv.id} | Order: ${inv.order_code} | MISA: ${inv.misa_code} | Buyer: ${inv.buyer}`);
      });
      console.log(`\n${'='.repeat(60)}`);
      // Xuất file Excel cho success invoices
      try {
        console.log('📊 Creating Excel file for success invoices...');
        
        // Kiểm tra XLSX có sẵn không
        if (typeof XLSX === 'undefined') {
          console.error('❌ XLSX library not loaded');
          throw new Error('XLSX library not available');
        }
        
        const workbook = XLSX.utils.book_new();
        
        // Tạo worksheet data
        const wsData = [
          ['STT', 'Invoice ID', 'Order Code', 'MISA Code', 'Buyer', 'Status', 'Created At'],
          ...successInvoices.map((inv, idx) => [
            idx + 1,
            inv.id,
            inv.order_code,
            inv.misa_code,
            inv.buyer,
            'Success',
            new Date().toLocaleString('vi-VN')
          ])
        ];
        
        const worksheet = XLSX.utils.aoa_to_sheet(wsData);
        
        // Định dạng cột
        const colWidths = [
          { wch: 5 },   // STT
          { wch: 12 },  // Invoice ID
          { wch: 15 },  // Order Code
          { wch: 12 },  // MISA Code
          { wch: 30 },  // Buyer
          { wch: 10 },  // Status
          { wch: 20 }   // Created At
        ];
        worksheet['!cols'] = colWidths;
        
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Success Invoices');
        
        // Tạo tên file với timestamp
        const now = new Date();
        const timestamp = now.toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
        const filename = `MISA_Success_Invoices_${timestamp}.xlsx`;
        
        // Xuất file
        XLSX.writeFile(workbook, filename);
        console.log(`📊 Excel file exported: ${filename}`);
        
        // Send progress update về Excel export
        sendProgressUpdate({
          status: 'excel_exported',
          filename: filename,
          count: successInvoices.length
        });
        
      } catch (excelError) {
        console.error('❌ Error exporting Excel file:', excelError);
        console.error('❌ Excel error stack:', excelError.stack);
        
        // Send progress update về Excel error
        sendProgressUpdate({
          status: 'excel_error',
          error: excelError.message
        });
      }
    }
    
    if (failedInvoices.length > 0) {
      console.log(`\n❌ FAILED INVOICES:`);
      failedInvoices.forEach((inv, idx) => {
        console.log(`\n${idx + 1}. Invoice ID: ${inv.id}`);
        console.log(`   Order Code: ${inv.order_code}`);
        console.log(`   Buyer: ${inv.buyer}`);
        console.log(`   Error: ${inv.error}`);
      });
      console.log(`\n${'='.repeat(60)}`);
    }
    
    // Send progress: complete
    sendProgressUpdate({
      status: 'complete',
      total: invoices.length,
      successCount: successCount,
      failedCount: failedCount
    });
    
    return { 
      success: true, 
      total: invoices.length,
      successCount,
      failedCount,
      successInvoices,
      failedInvoices
    };
    
  } catch (error) {
    console.error("CONTENT SCRIPT ERROR:", error);
    throw error;
  }
}

// Helper: Send progress update to popup
function sendProgressUpdate(data) {
  chrome.runtime.sendMessage({
    type: 'PROGRESS_UPDATE',
    data: data
  });
}

// Helper: Sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Đánh dấu invoice đã tạo thành công
async function markInvoiceAsCreated(invoiceId, misaCode) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: "MARK_INVOICE_CREATED",
      invoiceId: invoiceId,
      misaCode: misaCode
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(`⚠️ Failed to mark invoice ${invoiceId}:`, chrome.runtime.lastError);
        // Không reject, vì invoice đã tạo thành công trên MISA rồi
        resolve(null);
        return;
      }
      
      if (response && response.success) {
        console.log(`  ✅ Invoice ${invoiceId} marked as created in your system`);
        resolve(response.data);
      } else {
        console.error(`⚠️ Failed to mark invoice ${invoiceId}:`, response?.error);
        resolve(null);
      }
    });
  });
}

// API lấy thông tin inventory item từ MISA
async function getInventoryItemFromMISA(token, context, productCode) {
  try {
    const payloadInventoryItem = {
      sort: JSON.stringify([
        { property: 2157, desc: false, operand: 1 }
      ]),

      isIncludeDependentBranch: false,
      isFilter: true,
      branchFilter: false,

      customFilter: [
        {
          property: 2157,   // thường là: Mã hàng
          value: productCode,
          operator: 1,      // contains / like
          operand: 2
        },
        {
          property: 2167,   // thường là: Tên hàng
          value: productCode,
          operator: 1,
          operand: 2
        }
      ],

      pageIndex: 1,
      pageSize: 20,
      useSp: false
    };


    const response = await fetch("https://actapp.misa.vn/g1/api/di/v1/inventory_item_get/paging_filter_inventory_item_new_v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "x-misa-context": context
      },
      body: JSON.stringify(payloadInventoryItem)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ MISA Inventory API Error Response:", errorText);
      console.error("❌ MISA API Error:", response.status, response.statusText);
      return null;
    }

    const result = await response.json();

    // Kiểm tra cấu trúc response
    console.log('🔍 Checking inventory response structure:');
    console.log('- result.Success:', result.Success);

    if (result.ErrorsMessage && result.ErrorsMessage.length > 0) {
      console.error("❌ MISA API Errors:", result.ErrorsMessage);
    }

    if (!result.Success) {
      console.error("❌ MISA API returned Success: false");
      console.error("❌ Error messages:", result.ErrorsMessage);
      return null;
    }

    if (result.Data && result.Data.PageData && result.Data.PageData.length > 0) {
      const item = result.Data.PageData[0];

      const mappedItem = {
        inventory_item_id: item.inventory_item_id,
        inventory_item_code: item.inventory_item_code,
        inventory_item_name: item.inventory_item_name,
        unit_id: item.unit_id,
        main_unit_id: item.main_unit_id || item.unit_id,
        unit_name: item.unit_name,
        main_unit_name: item.main_unit_name || item.unit_name,
        inventory_item_type: item.inventory_item_type || 0,
        purchase_last_unit_price_list: item.purchase_last_unit_price_list ||
          `[{"currency_id":"VND","unit_id":"${item.unit_id}","unit_name":"${item.unit_name}","unit_price":"0"}]`
      };

      return mappedItem;
    }

    console.log("⚠️ No inventory item found with code:", productCode);
    return null;

  } catch (error) {
    console.error("💥 Error getting inventory item from MISA:", error);
    console.error("💥 Error stack:", error.stack);
    return null;
  }
}

async function getNextRefNo(token, context) {
    const url = "https://actapp.misa.vn/g1/api/refno/v1/refno/next_value?categories=353_101_150_202&branch_id=a4c49e6a-ccd7-413a-94b0-8349d1ccbb22&display_on_book=0";

    try {
        const response = await fetch(url, {
            "headers": {
                "accept": "application/json, text/plain, */*",
                "authorization": "Bearer "  + token,// Token của bạn
                "x-misa-context": context
            },
            "method": "GET"
        });
        const result = await response.json();
        const data = result.Data;

        if (!data || !data[353]) {
            throw new Error("Không tìm thấy số chứng từ phiếu bán hàng");
        }

        if (!data || !data[202]) {
            throw new Error("Không tìm thấy số chứng từ phiếu xuất kho");
        }

        // result.Data sẽ chứa các số mới như { "353": "BH001", "202": "XK001", ... }
        return result.Data;
    } catch (error) {
        console.error("Lỗi lấy số chứng từ:", error);
    }
}

// Build payload hoàn chỉnh theo template mới (sa_voucher)
function buildCompletePayload({ myData, inventoryItems, refno}) {
  const currentDate = myData.create_at;

  // Tạo mảng detail objects từ inventoryItems
  const detailObjects = inventoryItems.map((item, index) => {
    const { myDataItem, inventoryItem } = item;

    // Tính toán các giá trị cho từng item
    const quantity = myDataItem.quantity || 1;
    const unitPrice = myDataItem.price || 0;
    const amount = quantity * unitPrice;

    const discountRate = myDataItem.discountRate || 0;
    const discountAmount = amount * discountRate / 100;

    const vatRate = myDataItem.vatRate || 0;
    const vatAmount = myDataItem.vatAmount ? myDataItem.vatAmount : (amount - discountAmount) * vatRate / 100;

    // Tính thuế khấu trừ (2% của VAT)
    const deductionsTaxAmount = vatAmount * 0.02;

    let sale_account = "5111";
    if (myDataItem.productCode == 138463) { //DV-DONG-GOI
      sale_account = "5113";
    } else if (myDataItem.productCode == 138608) { //PHI_SAN
      sale_account = "5118";
    } else if (myDataItem.productCode == 138609) {
      sale_account = "5114"
    }


    return {
      "account_object_address": myData.company_address,
      "account_object_id": "2e09a780-d17f-47a7-bff2-eef23ea3b9b6",
      "account_object_code": "KLE",
      "account_object_name": "Khách lẻ",
      "amount": amount,
      "amount_finance": 0,
      "amount_management": 0,
      "amount_oc": amount,
      "credit_account": sale_account,
      "debit_account": "131",
      "description": myDataItem.description || inventoryItem.inventory_item_name,
      "discount_account": sale_account,
      "discount_amount": discountAmount,
      "discount_amount_oc": discountAmount,
      "discount_rate": discountRate,
      "discount_type": 0,
      "exchange_rate_operator": "*",
      "inventory_item_id": inventoryItem.inventory_item_id,
      "inventory_item_code": inventoryItem.inventory_item_code,
      "inventory_item_name": inventoryItem.inventory_item_name,
      "inventory_resale_type_id": 0,
      "is_promotion": false,
      "main_convert_rate": 1,
      "main_quantity": quantity,
      "main_unit_id": inventoryItem.main_unit_id,
      "main_unit_name": inventoryItem.main_unit_name,
      "main_unit_price": unitPrice,
      "main_unit_price_finance": 0,
      "main_unit_price_management": 0,
      "not_in_vat_declaration": false,
      "panel_length_quantity": 0,
      "panel_width_quantity": 0,
      "panel_height_quantity": 0,
      "panel_radius_quantity": 0,
      "panel_quantity": 0,
      "quantity": quantity,
      "ref_detail_id": crypto.randomUUID(),
      "sale_amount": 0,
      "sale_price": 0,
      "sort_order": index + 1,
      "state": 1,
      "stock_code": "KHN",
      "stock_id": "51a49d53-2fea-4e56-8cdd-bf41af64a0bf",
      "unit_id": inventoryItem.unit_id,
      "unit_name": inventoryItem.unit_name,
      "unit_price": unitPrice,
      "unit_price_after_discount": unitPrice - (unitPrice * discountRate / 100),
      "unit_price_after_tax": 0,
      "unit_price_finance": 0,
      "unit_price_management": 0,
      "vat_account": "33311",
      "vat_amount": vatAmount,
      "vat_amount_oc": vatAmount,
      "vat_rate": vatRate,
      "vat_rate_406": 0,
      "deductions_tax_amount": deductionsTaxAmount,
      "deductions_tax_amount_oc": deductionsTaxAmount,
      "tmp_deductions_tax_amount": deductionsTaxAmount,
      "tmp_deductions_tax_amount_oc": deductionsTaxAmount,
      "inventory_item_type": inventoryItem.inventory_item_type,
      "amount_after_tax": 0,
      "inventory_account": "156",
      "vat_description": `Thuế GTGT - ${inventoryItem.inventory_item_name}`,
      "unitprice_sale": unitPrice,
      "cost_account": "632",
      "stock_account": "156",
      "cost_main_unit_price_finance": 0,
      "cost_amount_finance": 0,
      "cost_unit_price_finance": 0,
      "cost_amount_management": 0,
      "cost_unit_price_management": 0,
      "cost_main_unit_price_management": 0,
      "export_tax_rate": 0,
      "export_tax_amount": 0,
      "fob_amount": 0,
      "is_follow_serial_number": false,
      "is_allow_duplicate_serial_number": false,
      "is_open": true,
      "stock_name": "KHO HÀ NỘI",
      "is_unit_price_after_tax": false,
      "is_change": false,
      "purchase_last_unit_price_list": inventoryItem.purchase_last_unit_price_list,
      "allocation_time": 0,
      "allocation_type": 0,
      "unit_sell_divide_min": 0,
      "is_drug": false,
      "invoiced_quantity": quantity,
      "exported_invoice_at_least_one": false,
      "relation_detail_sa_voucher_invoice": [],
      "is_delete_relation_invoice_detail": false,
      "sale_account": sale_account,
      "is_combo": false,
      "combo_type": 0,
      "inventory_item_cost_method": -1,
      "item_discount_rate": 0,
      "invoice_discount_rate": 0,
      "item_discount_amount_oc": 0,
      "invoice_discount_amount_oc": 0,
      "item_discount_amount": 0,
      "invoice_discount_amount": 0,
      "is_commercial_abatement": false,
      "quantity_in_combo": 0,
      "serial_text": null,
      "serial_inward_list": null,
      "serial_define_list": null,
      "serial_text_tooltip": null
    };
  });

  // Tính tổng các giá trị từ tất cả detail objects
  const totalSaleAmount = detailObjects.reduce((sum, detail) => sum + detail.amount, 0);
  const totalDiscountAmount = detailObjects.reduce((sum, detail) => sum + detail.discount_amount, 0);
  const totalVatAmount = Math.floor(detailObjects.reduce((sum, detail) => sum + detail.vat_amount, 0));
  const totalAmount = totalSaleAmount - totalDiscountAmount + totalVatAmount;

  console.log('mydata', myData)

  // Tạo payload hoàn chỉnh theo cấu trúc sa_voucher
  return [{
    "Type": "sa_voucher",
    "Key": null,
    "RefType": 3530,
    "RefTypeCategory": 353,
    "View": "view_sa_voucher",
    "enableAutoSave": true,

    "Details": [
      {
        "Type": "sa_voucher_detail",
        "View": "view_sa_voucher_detail",
        "Alias": "detail",
        "UseRecover": true,
        "Objects": detailObjects
      },
      {
        "Type": "sa_voucher_detail_allocation",
        "Alias": "detailOther1",
        "View": "view_sa_voucher_detail_allocation",
        "UseRecover": true,
        "Objects": []
      }
    ],

    "Links": [
      {
        "Type": "sa_invoice",
        "RefType": 3560,
        "RefTypeCategory": 356,
        "View": "view_sa_invoice",
        "Reference": {
          "Type": "sa_invoice_reference",
          "Key": "referencef_id",
          "MainKey": "voucher_refid",
          "SubKey": "sa_invoice_refid",
          "ReferenceKey": "voucher_refid",
          "IsUsingSubQuery": true
        },   
        "Object":{
          // Thông tin khách hàng & Đối tượng
          "account_object_id": "2e09a780-d17f-47a7-bff2-eef23ea3b9b6",
          "account_object_code": "KLE",
          "account_object_name": "Khách lẻ",
          "account_object_address": myData.company_address || "123 ABc, Hà Nội",
          "phone_number": myData.phone || "",
          "payer": myData.buyer || "Chúc Test",
          
          // Thông tin định danh hóa đơn NGOÀI (Điểm khác biệt chính)
          "inv_no": myData.invoiceNo,       // Biến động số hóa đơn bên ngoài của bạn
          "inv_series": myData.invoiceSeries, // Biến động ký hiệu hóa đơn (VD: 1C26MAA)
          "inv_template_no": myData.invoiceTemplate || "01GTKT0/001", 
          "inv_date": currentDate,
          "inv_type_id": 0,
          
          // Thông tin hạch toán
          "reftype": 3560,
          "refdate": currentDate,
          "posted_date": currentDate,
          "refno_finance": refno[353], // Lấy từ biến refno của bạn
          "journal_memo": `Bán hàng Khách lẻ theo hóa đơn số ${myData.invoiceNo}`,
          "is_posted": true,
          "display_on_book": 0,
          "currency_id": "VND",
          "exchange_rate": 1,
          "payment_method": myData.paymentMethod || "TM/CK",
          
          // Trạng thái hóa đơn (Rất quan trọng để MISA hiểu là hóa đơn ngoài)
          "include_invoice": 1,
          "is_invoice_exported": true,     // Đánh dấu đã xuất để không chờ meInvoice cấp số
          "invoice_exported_status": 0,    // Trạng thái hóa đơn gốc
          "outward_exported_status": 1,
          "is_sale_with_outward": true,
          "caba_refno_finance": refno[202], 
          "invoiced_amount": 0,
          
          // Thông tin tiền hàng (Dùng các biến động của bạn)
          "total_sale_amount_oc": totalSaleAmount,
          "total_sale_amount": totalSaleAmount,
          "total_vat_amount_oc": totalVatAmount,
          "total_vat_amount": totalVatAmount,
          "total_amount_oc": totalAmount,
          "total_amount": totalAmount,
          "total_discount_amount_oc": totalDiscountAmount || 0,
          "total_discount_amount": totalDiscountAmount || 0,
          "total_export_tax_amount_oc": 0,
          "total_export_tax_amount": 0,
          "caba_amount": 0,
          "caba_amount_oc": 0,
          
          // Các trường hệ thống khác
          "discount_type": 0,
          "paid_type": 0,
          "state": 1,
          "is_invoice_machine": false,
          "is_follows_406": false,
          "tax_reduction_type": 0,
          "is_tax_reduction_type_43": false,
          "dav_using_permision": true,
          "is_discount_invoice_123": false,
          "invoiveRefids": [],
          "invoiveRefidsDelete": [],
          "MappingEinvoiceObjectList": [],
          "attachment_id_list_data": [],
          "old_data": null
        }
      },
      {
        "Type": "in_outward",
        "RefType": 2020,
        "RefTypeCategory": 202,
        "Key": "",
        "Reference": {
          "Type": "sale_outward_reference",
          "Key": "referencef_id",
          "MainKey": "sa_voucher_refid",
          "SubKey": "in_outward_refid"
        },
        "Object": {
          "account_object_id": "2e09a780-d17f-47a7-bff2-eef23ea3b9b6",
          "account_object_name": "Khách lẻ",
          "account_object_code": "KLE",
          "account_object_address": myData.company_address,
          "journal_memo": `Xuất kho bán hàng Khách lẻ`,
          "employee_id": "98a6e8e5-5aeb-42f7-8238-8fbd1e34b1b3",
          "employee_code": "NV000001",
          "employee_name": "CÔNG TY CỔ PHẦN ĐẦU TƯ GIÁO DỤC BẮC TRUNG NAM",
          "display_on_book": 0,
          "reftype": 2020,
          "posted_date": currentDate,
          "refdate": currentDate,
          "in_reforder": currentDate,
          "is_sale_with_outward": true,
          "total_amount_finance": 0,
          "refno_finance": refno[202],// refno XK00304
          "state": 1,
          "ik_stock_ids": "51a49d53-2fea-4e56-8cdd-bf41af64a0bf",
          "is_sale_with_outward_enum": 1,
          "old_data": null
        }
      }
    ],

    "Object": {
      "account_object_id": "2e09a780-d17f-47a7-bff2-eef23ea3b9b6",
      "account_object_name": "Khách lẻ",
      "account_object_address": myData.company_address,
      "employee_id": "98a6e8e5-5aeb-42f7-8238-8fbd1e34b1b3",
      "employee_name": "CÔNG TY CỔ PHẦN ĐẦU TƯ GIÁO DỤC BẮC TRUNG NAM",
      "display_on_book": 0,
      "reftype": 3530,
      "outward_exported_status": 1,
      "refdate": currentDate,
      "posted_date": currentDate,
      "inv_no": myData.invoiceNo,       
      "inv_series": myData.invoiceSeries, 
      "inv_template_no": myData.invoiceTemplate || "01GTKT0/001", 
      "include_invoice": 1,
      "is_invoice_exported": true,
      "is_paid": false,
      "is_sale_with_outward": true,
      "exchange_rate": 1,
      "total_sale_amount_oc": totalSaleAmount,
      "total_sale_amount": totalSaleAmount,
      "total_amount_oc": totalAmount,
      "total_amount": totalAmount,
      "total_discount_amount_oc": totalDiscountAmount,
      "total_discount_amount": totalDiscountAmount,
      "total_vat_amount_oc": totalVatAmount,
      "total_vat_amount": totalVatAmount,
      "total_export_tax_amount_oc": 0,
      "total_export_tax_amount": 0,
      "caba_amount": 0,
      "caba_amount_oc": 0,
      "refno_finance": refno[353],// refno
      "payer": myData.buyer || "Noname",
      "journal_memo": `Bán hàng Khách lẻ`,
      "currency_id": "VND",
      "paid_type": 0,
      "state": 1,
      "discount_type": 0,
      "account_object_code": "KLE",
      "discount_rate_voucher": 0,
      "employee_code": "NV000001",
      "attachment_id_list_data": [],
      "is_follows_406": false,
      "tax_reduction_type": 0,
      "is_tax_reduction_type_43": false,
      "invoiced_amount": totalAmount,
      "invoice_exported_status": 0,
      "dav_using_permision": true,
      "is_discount_invoice_123": false,
      "invoiveRefids": [],
      "invoiveRefidsDelete": [],
      "inv_date": currentDate,
      "lstContractRefid": "",
      "lstContractRefidMaster": ""
    },

    "auditing_log": {
      "id": null,
      "tenant_id": null,
      "refid": null,
      "user_id": null,
      "reftype": 3530,
      "login_name": null,
      "ip": null,
      "action": 1,
      "action_name": "Thêm",
      "reference": `Số chứng từ: ${refno[353]}\nSố phiếu xuất: ${refno[202]}\n`,
      "description": `- Số dòng: ${detailObjects.length} \n- Tổng số tiền: ${totalAmount}. (Extension API)`,
      "time": null,
      "state": 1,
      "object_name": "Bán hàng hóa trong nước chưa thu tiền",
      "branch_name": "CÔNG TY CỔ PHẦN ĐẦU TƯ GIÁO DỤC BẮC TRUNG NAM",
      "is_inserting_log_into_another_db": null,
      "log_database_id": null,
      "securityactionid": null,
      "record_type": null,
      "index": 1,
      "isAuditingLog": true,
      "masterDescription": [],
      "isMultiMaster": false,
      "detailDescription": {
        "insert": [],
        "update": [],
        "delete": [],
        "custom": []
      }
    },

    "BypassValidate": {},
    "OptionForSave": {
      "PostAfterSave": true,
      "IsQuickEdit": false,
      "FormState": "Add"
    }
  }];
}
