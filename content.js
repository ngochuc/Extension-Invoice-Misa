// Content script - xử lý trên trang MISA
console.log('MISA Extension Content Script loaded');

// Import payload builder
// Note: Trong Chrome extension, cần load script qua manifest.json

// Lắng nghe message từ popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('Content script received message:', msg);

  if (msg.type === "CREATE_INVOICE") {
    // Xử lý async function với Promise
    createInvoiceFlow(msg.misaConfig)
      .then(() => {
        console.log('Invoice creation successful');
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("Error in createInvoiceFlow:", error);
        sendResponse({ success: false, error: error.message });
      });

    // Quan trọng: return true để giữ message channel mở cho async response
    return true;
  }
});

// Flow chính tạo hóa đơn
async function createInvoiceFlow(misaConfig) {
  try {
    // 1. Lấy dữ liệu từ API của bạn (qua background)
    console.log('Requesting data from background script...');

    const myDataResponse = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "GET_MY_API_DATA" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error('Background script error: ' + chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });

    console.log('Background response:', myDataResponse);

    if (!myDataResponse) {
      throw new Error("Không nhận được phản hồi từ background script");
    }

    if (!myDataResponse.success) {
      throw new Error("Lỗi lấy dữ liệu từ API: " + (myDataResponse.error || 'Unknown error'));
    }

    const myData = myDataResponse.data;
    console.log("DATA FROM YOUR API:", myData);

    // Validate data structure
    if (!myData) {
      throw new Error("Dữ liệu từ API trống");
    }

    if (!myData.items || !Array.isArray(myData.items) || myData.items.length === 0) {
      throw new Error("Không có items trong dữ liệu từ API hoặc items không phải là mảng");
    }

    // 2. Sử dụng token và context từ popup
    const { token, context } = misaConfig;

    if (!token || !context) {
      throw new Error("Thiếu thông tin Token hoặc Context!");
    }

    console.log("MISA Config:", {
      token: token?.substring(0, 20) + "...",
      context
    });

    console.log(`Processing ${myData.items.length} items...`);

    const refno = await getNextRefNo(token, context);

    // 4. Lặp qua từng item và lấy thông tin inventory item từ MISA
    const inventoryItems = [];

    for (let i = 0; i < myData.items.length; i++) {
      const myDataItem = myData.items[i];
      console.log(`Getting inventory for item ${i + 1}: ${myDataItem.productCode}`);

      const inventoryItem = await getInventoryItemFromMISA(token, context, myDataItem.productCode);
      if (!inventoryItem) {
        throw new Error(`Không tìm thấy sản phẩm có mã: ${myDataItem.productCode} trong MISA`);
      }

      inventoryItems.push({
        myDataItem,
        inventoryItem
      });
    }

    console.log("ALL INVENTORY ITEMS:", inventoryItems);

    // 6. Build payload hoàn chỉnh với mảng items (sử dụng sa_voucher format)
    const payload = buildCompletePayload({
      myData,
      inventoryItems,
      refno
    });

    console.log("COMPLETE PAYLOAD:", JSON.stringify(payload, null, 2));

    // 7. Gửi request tạo sa_voucher (không phải sa_invoice)
    const response = await fetch("https://actapp.misa.vn/g1/api/sa/v1/sa_voucher/full", {
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
      console.log("SUCCESS:", result);
      // Không alert ở đây, để popup xử lý
    } else {
      throw new Error(result.message || result.error || JSON.stringify(result));
    }

  } catch (error) {
    console.error("CONTENT SCRIPT ERROR:", error);
    throw error; // Re-throw để popup có thể catch
  }
}

// API lấy thông tin inventory item từ MISA
async function getInventoryItemFromMISA(token, context, productCode) {
  try {
    console.log(`🔍 Searching for product: ${productCode}`);
    console.log(`🔑 Using token: ${token?.substring(0, 20)}...`);
    console.log(`📋 Using context: ${context}`);

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

    console.log('📤 MISA Inventory Request Payload:', JSON.stringify(payloadInventoryItem, null, 2));

    const response = await fetch("https://actapp.misa.vn/g1/api/di/v1/inventory_item_get/paging_filter_inventory_item_new_v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "x-misa-context": context
      },
      body: JSON.stringify(payloadInventoryItem)
    });

    console.log('📊 MISA Inventory Response Status:', response.status);
    console.log('📊 MISA Inventory Response StatusText:', response.statusText);
    console.log('📊 MISA Inventory Response Headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ MISA Inventory API Error Response:", errorText);
      console.error("❌ MISA API Error:", response.status, response.statusText);
      return null;
    }

    const result = await response.json();
    console.log("✅ MISA Inventory API Response:", JSON.stringify(result, null, 2));

    // Kiểm tra cấu trúc response
    console.log('🔍 Checking inventory response structure:');
    console.log('- result.Success:', result.Success);
    console.log('- result.Data exists:', !!result.Data);
    console.log('- result.Data.PageData exists:', !!result.Data?.PageData);
    console.log('- result.Data.PageData is array:', Array.isArray(result.Data?.PageData));
    console.log('- result.Data.PageData length:', result.Data?.PageData?.length || 0);

    if (result.ErrorsMessage) {
      console.error("❌ MISA API Errors:", result.ErrorsMessage);
    }

    if (!result.Success) {
      console.error("❌ MISA API returned Success: false");
      console.error("❌ Error messages:", result.ErrorsMessage);
      return null;
    }

    if (result.Data && result.Data.PageData && result.Data.PageData.length > 0) {
      const item = result.Data.PageData[0];
      console.log('📦 Found inventory item:', item);
      console.log('- inventory_item_id:', item.inventory_item_id);
      console.log('- inventory_item_code:', item.inventory_item_code);
      console.log('- inventory_item_name:', item.inventory_item_name);
      console.log('- unit_id:', item.unit_id);
      console.log('- unit_name:', item.unit_name);

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

      console.log('🎯 Mapped inventory item:', mappedItem);
      return mappedItem;
    }

    console.log("⚠️ No inventory item found with code:", productCode);
    console.log("💡 Available items in response:", result.Data?.PageData?.map(item => ({
      code: item.inventory_item_code,
      name: item.inventory_item_name
    })));
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
    const vatAmount = vatRate === -1 ? 0 : (amount - discountAmount) * vatRate / 100;

    // Tính thuế khấu trừ (2% của VAT)
    const deductionsTaxAmount = vatAmount * 0.02;

    return {
      "account_object_address": myData.company_address,
      "account_object_id": "2e09a780-d17f-47a7-bff2-eef23ea3b9b6",
      "account_object_code": "KLE",
      "account_object_name": "Khách lẻ",
      "amount": amount,
      "amount_finance": 0,
      "amount_management": 0,
      "amount_oc": amount,
      "credit_account": "5111",
      "debit_account": "131",
      "description": myDataItem.description || inventoryItem.inventory_item_name,
      "discount_account": "5111",
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
      "sale_account": "5111",
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
  const totalVatAmount = detailObjects.reduce((sum, detail) => sum + detail.vat_amount, 0);
  const totalAmount = totalSaleAmount - totalDiscountAmount + totalVatAmount;

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
        "Object": {
          "account_object_id": "2e09a780-d17f-47a7-bff2-eef23ea3b9b6",
          "display_on_book": 0,
          "reftype": 3560,
          "inv_date": currentDate,
          "is_posted": true,
          "include_invoice": 1,
          "exchange_rate": 1,
          "account_object_name": "Khách lẻ",
          "account_object_address": myData.company_address,
          "payment_method": myData.paymentMethod || "TM/CK",
          "discount_type": 0,
          "state": 1,
          "account_object_code": "KLE",
          "is_invoice_machine": false,
          "employee_id": "98a6e8e5-5aeb-42f7-8238-8fbd1e34b1b3",
          "employee_name": "CÔNG TY CỔ PHẦN ĐẦU TƯ GIÁO DỤC BẮC TRUNG NAM",
          "outward_exported_status": 1,
          "refdate": currentDate,
          "posted_date": currentDate,
          "is_invoice_exported": true,
          "is_paid": false,
          "is_sale_with_outward": true,
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
          "discount_rate_voucher": 0,
          "employee_code": "NV000001",
          "attachment_id_list_data": [],
          "is_follows_406": false,
          "tax_reduction_type": 0,
          "is_tax_reduction_type_43": false,
          "invoiced_amount": 0,
          "invoice_exported_status": 0,
          "dav_using_permision": true,
          "is_discount_invoice_123": false,
          "invoiveRefids": [],
          "invoiveRefidsDelete": [],
          "MappingEinvoiceObjectList": []
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
      "reference": "Số chứng từ: BH00300\nSố phiếu xuất: XK00304\n", // refno
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
