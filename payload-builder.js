// Build payload hoàn chỉnh theo template mới (sa_voucher)
function buildCompletePayload({ myData, inventoryItems, customer, branchId }) {
  const currentDate = new Date().toISOString();
  
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
      "account_object_address": customer.account_object_address,
      "account_object_id": customer.account_object_id,
      "account_object_code": customer.account_object_code,
      "account_object_name": customer.account_object_name,
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
          "account_object_id": customer.account_object_id,
          "display_on_book": 0,
          "reftype": 3560,
          "inv_date": currentDate,
          "is_posted": true,
          "include_invoice": 1,
          "exchange_rate": 1,
          "account_object_name": customer.account_object_name,
          "account_object_address": customer.account_object_address,
          "payment_method": myData.paymentMethod || "TM/CK",
          "discount_type": 0,
          "state": 1,
          "account_object_code": customer.account_object_code,
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
          "payer": myData.buyer || customer.account_object_name,
          "journal_memo": `Bán hàng ${customer.account_object_name}`,
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
          "account_object_id": customer.account_object_id,
          "account_object_name": customer.account_object_name,
          "account_object_code": customer.account_object_code,
          "account_object_address": customer.account_object_address,
          "journal_memo": `Xuất kho bán hàng ${customer.account_object_name}`,
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
          "state": 1,
          "ik_stock_ids": "51a49d53-2fea-4e56-8cdd-bf41af64a0bf",
          "is_sale_with_outward_enum": 1,
          "old_data": null
        }
      }
    ],
    
    "Object": {
      "account_object_id": customer.account_object_id,
      "account_object_name": customer.account_object_name,
      "account_object_address": customer.account_object_address,
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
      "payer": myData.buyer || customer.account_object_name,
      "journal_memo": `Bán hàng ${customer.account_object_name}`,
      "currency_id": "VND",
      "paid_type": 0,
      "state": 1,
      "discount_type": 0,
      "account_object_code": customer.account_object_code,
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
      "reference": "",
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