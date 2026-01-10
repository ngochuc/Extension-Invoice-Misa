// Content script - xử lý trên trang MISA

// Lắng nghe message từ popup
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.type === "CREATE_INVOICE") {
    try {
      await createInvoiceFlow();
      sendResponse({ success: true });
    } catch (error) {
      console.error("Error in createInvoiceFlow:", error);
      sendResponse({ success: false, error: error.message });
    }
  }
  
  return true;
});

// Flow chính tạo hóa đơn
async function createInvoiceFlow() {
  try {
    // 1. Lấy dữ liệu từ API của bạn (qua background)
    const myDataResponse = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_MY_API_DATA" }, resolve);
    });
    
    if (!myDataResponse.success) {
      throw new Error("Lỗi lấy dữ liệu từ API: " + myDataResponse.error);
    }
    
    const myData = myDataResponse.data;
    console.log("DATA FROM YOUR API:", myData);

    // 2. Lấy token & context từ localStorage MISA
    const token = localStorage.getItem("access_token");
    const context = localStorage.getItem("x-misa-context");
    const branchId = localStorage.getItem("branch_id") || 
                    JSON.parse(localStorage.getItem("user_info") || '{}').branch_id;
    
    if (!token || !context) {
      throw new Error("Không lấy được token MISA. Vui lòng đăng nhập lại!");
    }

    console.log("MISA Context:", { 
      token: token?.substring(0, 20) + "...", 
      context, 
      branchId 
    });

    // 3. Gọi API MISA lấy thông tin inventory item
    const inventoryItem = await getInventoryItemFromMISA(token, context, myData.productCode);
    if (!inventoryItem) {
      throw new Error(`Không tìm thấy sản phẩm có mã: ${myData.productCode} trong MISA`);
    }

    console.log("INVENTORY ITEM:", inventoryItem);

    // 4. Gọi API MISA lấy thông tin khách hàng
    const customer = await getCustomerFromMISA(token, context, myData.customerCode);
    if (!customer) {
      throw new Error(`Không tìm thấy khách hàng có mã: ${myData.customerCode} trong MISA`);
    }

    console.log("CUSTOMER:", customer);

    // 5. Build payload hoàn chỉnh
    const payload = buildCompletePayload({
      myData,
      inventoryItem,
      customer,
      branchId
    });

    console.log("COMPLETE PAYLOAD:", JSON.stringify(payload, null, 2));

    // 6. Gửi request tạo hóa đơn
    const response = await fetch("https://actapp.misa.vn/g1/api/di/v1/sa_invoice/save", {
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
      alert("✅ Tạo hóa đơn thành công!");
      console.log("SUCCESS:", result);
    } else {
      alert("❌ Lỗi tạo hóa đơn: " + (result.message || result.error || JSON.stringify(result)));
      console.error("ERROR:", result);
    }

  } catch (error) {
    console.error("CONTENT SCRIPT ERROR:", error);
    alert("❌ Lỗi: " + error.message);
  }
}

// API lấy thông tin inventory item từ MISA
async function getInventoryItemFromMISA(token, context, productCode) {
  try {
    console.log(`Searching for product: ${productCode}`);
    
    const response = await fetch(`https://actapp.misa.vn/g1/api/di/v1/account_object_get/paging_filter_v2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "x-misa-context": context
      },
      body: JSON.stringify({
        "Skip": 0,
        "Take": 10,
        "Sort": [],
        "Filter": {
          "logic": "and",
          "filters": [
            {
              "field": "inventory_item_code",
              "operator": "eq",
              "value": productCode
            }
          ]
        }
      })
    });

    if (!response.ok) {
      console.error("MISA API Error:", response.status, response.statusText);
      return null;
    }

    const result = await response.json();
    console.log("MISA Inventory API Response:", result);
    
    if (result.Data && result.Data.length > 0) {
      const item = result.Data[0];
      
      return {
        inventory_item_id: item.inventory_item_id,
        inventory_item_code: item.inventory_item_code,
        inventory_item_name: item.inventory_item_name,
        unit_id: item.unit_id,
        main_unit_id: item.main_unit_id,
        unit_name: item.unit_name,
        main_unit_name: item.main_unit_name,
        inventory_item_type: item.inventory_item_type || 0,
        purchase_last_unit_price_list: item.purchase_last_unit_price_list || 
          `[{"currency_id":"VND","unit_id":"${item.unit_id}","unit_name":"${item.unit_name}","unit_price":"0"}]`
      };
    }
    
    console.log("No inventory item found with code:", productCode);
    return null;
    
  } catch (error) {
    console.error("Error getting inventory item from MISA:", error);
    return null;
  }
}

// API lấy thông tin khách hàng từ MISA
async function getCustomerFromMISA(token, context, customerCode) {
  try {
    console.log(`Searching for customer: ${customerCode}`);
    
    const response = await fetch(`https://actapp.misa.vn/g1/api/di/v1/account_object/paging`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "x-misa-context": context
      },
      body: JSON.stringify({
        "Skip": 0,
        "Take": 10,
        "Sort": [],
        "Filter": {
          "logic": "and",
          "filters": [
            {
              "field": "account_object_code",
              "operator": "eq",
              "value": customerCode
            }
          ]
        }
      })
    });

    if (!response.ok) {
      console.error("MISA Customer API Error:", response.status, response.statusText);
      return null;
    }

    const result = await response.json();
    console.log("MISA Customer API Response:", result);
    
    if (result.Data && result.Data.length > 0) {
      const customer = result.Data[0];
      
      return {
        account_object_id: customer.account_object_id,
        account_object_code: customer.account_object_code,
        account_object_name: customer.account_object_name,
        account_object_address: customer.account_object_address || "",
        phone_number: customer.phone_number || ""
      };
    }
    
    console.log("No customer found with code:", customerCode);
    return null;
    
  } catch (error) {
    console.error("Error getting customer from MISA:", error);
    return null;
  }
}

// Build payload hoàn chỉnh theo template
function buildCompletePayload({ myData, inventoryItem, customer, branchId }) {
  // Tính toán các giá trị
  const quantity = myData.quantity || 1;
  const unitPrice = myData.price || 0;
  const amount = quantity * unitPrice;
  
  const discountRate = myData.discountRate || 0;
  const discountAmount = amount * discountRate / 100;
  
  const vatRate = myData.vatRate || 0;
  const vatAmount = vatRate === -1 ? 0 : (amount - discountAmount) * vatRate / 100;
  
  const amountAfterTax = amount - discountAmount + vatAmount;

  // Tạo detail object hoàn chỉnh
  const detailObject = {
    ref_detail_id: crypto.randomUUID(),
    
    // Thông tin sản phẩm từ API
    inventory_item_id: inventoryItem.inventory_item_id,
    inventory_item_code: inventoryItem.inventory_item_code,
    inventory_item_name: inventoryItem.inventory_item_name,
    inventory_item_type: inventoryItem.inventory_item_type,
    
    // Đơn vị tính
    unit_id: inventoryItem.unit_id,
    main_unit_id: inventoryItem.main_unit_id,
    unit_name: inventoryItem.unit_name,
    main_unit_name: inventoryItem.main_unit_name,
    main_convert_rate: 1,
    
    // Số lượng và giá
    quantity: quantity,
    unit_price: unitPrice,
    main_quantity: quantity,
    main_unit_price: unitPrice,
    
    // Thành tiền
    amount: amount,
    amount_oc: amount,
    
    // Chiết khấu
    discount_rate: discountRate,
    discount_amount: discountAmount,
    discount_amount_oc: discountAmount,
    item_discount_rate: 0,
    item_discount_amount: 0,
    item_discount_amount_oc: 0,
    invoice_discount_rate: 0,
    invoice_discount_amount: 0,
    invoice_discount_amount_oc: 0,
    
    // Thuế VAT
    vat_rate: vatRate,
    vat_rate_406: 0,
    vat_amount: vatAmount,
    vat_amount_oc: vatAmount,
    amount_after_tax: amountAfterTax,
    unit_price_after_tax: 0,
    
    // Thuế khấu trừ
    deductions_tax_amount: 0,
    deductions_tax_amount_oc: 0,
    tmp_deductions_tax_amount: 0,
    tmp_deductions_tax_amount_oc: 0,
    
    // Mô tả
    description: myData.description || inventoryItem.inventory_item_name,
    
    // Metadata
    exchange_rate_operator: "*",
    sort_order: 1,
    state: 1,
    discount_type: 0,
    
    // Flags
    is_promotion: false,
    not_in_vat_declaration: false,
    is_unit_price_after_tax: false,
    is_follow_serial_number: false,
    is_allow_duplicate_serial_number: false,
    isChange: true,
    is_delete_relation_invoice_detail: true,
    is_commercial_abatement: false,
    
    // Relations
    relation_detail_sa_voucher_invoice: [],
    quantity_in_combo: 0,
    
    // Purchase info
    purchase_last_unit_price_list: inventoryItem.purchase_last_unit_price_list,
    unitprice_sale: 0
  };

  // Tạo object chính của hóa đơn
  const invoiceObject = {
    // Chi nhánh
    branch_id: branchId,
    
    // Khách hàng
    account_object_id: customer.account_object_id,
    account_object_code: customer.account_object_code,
    account_object_name: customer.account_object_name,
    account_object_address: customer.account_object_address,
    phone_number: customer.phone_number,
    buyer: myData.buyer || customer.account_object_name,
    
    // Ngày tháng
    inv_date: new Date().toISOString(),
    refdate: new Date().toISOString(),
    
    // Loại chứng từ
    reftype: 3560,
    display_on_book: 0,
    
    // Tiền tệ
    currency_id: "VND",
    exchange_rate: 1,
    
    // Tổng tiền (từ detail)
    total_sale_amount: amount,
    total_sale_amount_oc: amount,
    total_discount_amount: discountAmount,
    total_discount_amount_oc: discountAmount,
    total_vat_amount: vatAmount,
    total_vat_amount_oc: vatAmount,
    total_amount: amountAfterTax,
    total_amount_oc: amountAfterTax,
    
    // Thanh toán
    payment_method: myData.paymentMethod || "TM/CK",
    
    // Trạng thái
    is_paid: false,
    is_posted: false,
    invoice_status: 1,
    publish_status: 0,
    state: 1,
    
    // Flags hệ thống
    include_invoice: 0,
    is_attach_list: false,
    is_branch_issued: false,
    is_posted_last_year: false,
    is_invoice_replace: false,
    discount_type: 0,
    discount_rate_voucher: 0,
    is_created_savoucher: 0,
    send_email_status: 0,
    is_invoice_deleted: false,
    is_follows_406: false,
    publish_taxcode_status: 0,
    tax_reduction_type: 0,
    is_tax_reduction_type_43: false,
    is_delete_voucher_reference: false,
    is_discount_invoice: false,
    dav_using_permision: true,
    is_invoice_machine: false,
    
    // Arrays
    voucher_reference: [],
    attachment_id_list_data: [],
    MappingEinvoiceObjectList: []
  };

  // Tạo payload hoàn chỉnh
  return [{
    Type: "sa_invoice",
    Key: null,
    RefType: 3560,
    RefTypeCategory: 0,
    View: "view_sa_invoice",
    
    Details: [{
      Type: "sa_invoice_detail",
      Alias: "detail",
      View: "view_sa_invoice_detail",
      Objects: [detailObject]
    }],
    
    Links: [],
    Object: invoiceObject,
    
    auditing_log: {
      id: null,
      tenant_id: null,
      refid: null,
      user_id: null,
      reftype: 3560,
      login_name: null,
      ip: null,
      action: 1,
      action_name: "Thêm",
      reference: "Số hóa đơn: null",
      description: `- Số dòng: 1 \n- Tổng số tiền: ${amountAfterTax}. (Extension API)`,
      time: null,
      state: 1,
      object_name: "Hóa đơn bán hàng hóa, dịch vụ trong nước",
      branch_name: null,
      is_inserting_log_into_another_db: null,
      log_database_id: null,
      securityactionid: null,
      record_type: null,
      index: 1,
      isAuditingLog: true,
      masterDescription: [],
      isMultiMaster: false,
      detailDescription: {
        insert: [],
        update: [],
        delete: [],
        custom: []
      }
    },
    
    OptionForSave: {
      PostAfterSave: true,
      IsQuickEdit: false,
      FormState: "Add"
    }
  }];
}