const payload = [
  {
    /* ===============================
       I. THÔNG TIN CHỨNG TỪ (HEADER)
    =============================== */

    Type: "sa_invoice",           // Loại chứng từ: hóa đơn bán hàng
    Key: null,                    // null = tạo mới
    RefType: 3560,                // Mã loại chứng từ nội bộ của MISA (invoice)
    RefTypeCategory: 0,
    View: "view_sa_invoice",      // Mapping view backend (giữ nguyên)

    /* ===============================
       II. CHI TIẾT DÒNG HÀNG
    =============================== */

    Details: [
      {
        Type: "sa_invoice_detail",        // Bảng detail của hóa đơn
        Alias: "detail",
        View: "view_sa_invoice_detail",

        Objects: [
          {
            /* ===== A. ĐỊNH DANH ITEM (PHẢI LẤY TỪ API INVENTORY) ===== */

            ref_detail_id: crypto.randomUUID(), // UUID local cho dòng

            inventory_item_id: "GUID",    // ❗ ID sản phẩm trong MISA (bắt buộc)
            inventory_item_code: "SP001", // Mã hàng
            inventory_item_name: "Tên SP",// Tên hàng

            inventory_item_type: 0,       // 0: hàng hóa, 1: dịch vụ (lấy từ API item)

            /* ===== B. ĐƠN VỊ TÍNH ===== */

            unit_id: "GUID",              // Đơn vị đang dùng
            main_unit_id: "GUID",         // Đơn vị chuẩn

            unit_name: "Cái",             // Tên đơn vị
            main_unit_name: "Cái",

            main_convert_rate: 1,         // Tỉ lệ đổi về đơn vị chuẩn

            /* ===== C. SỐ LƯỢNG & GIÁ ===== */

            quantity: 2,                  // Số lượng bán
            unit_price: 50000,            // Đơn giá chưa thuế

            main_quantity: 2,
            main_unit_price: 50000,

            /* ===== D. THÀNH TIỀN & CHIẾT KHẤU ===== */

            amount: 100000,               // quantity * unit_price
            amount_oc: 100000,            // giống amount (OC = original currency)

            discount_rate: 0,             // % chiết khấu dòng
            discount_amount: 0,
            discount_amount_oc: 0,

            item_discount_rate: 0,
            item_discount_amount: 0,

            invoice_discount_rate: 0,
            invoice_discount_amount: 0,

            /* ===== E. THUẾ GTGT ===== */

            vat_rate: 8,                  // % VAT: 0,5,8,10 hoặc -1 (không chịu thuế)

            vat_amount: 8000,             // amount * vat_rate / 100
            vat_amount_oc: 8000,

            amount_after_tax: 108000,     // amount + vat_amount - discount

            deductions_tax_amount: 0,
            deductions_tax_amount_oc: 0,

            tmp_deductions_tax_amount: 0,
            tmp_deductions_tax_amount_oc: 0,

            vat_rate_406: 0,              // dùng cho quy định đặc biệt (thường = 0)

            /* ===== F. MÔ TẢ & THÔNG TIN HIỂN THỊ ===== */

            description: "Tên SP hiển thị trên hóa đơn",

            exchange_rate_operator: "*",  // nhân tỷ giá

            /* ===== G. TRẠNG THÁI & FLAGS ===== */

            sort_order: 1,                // thứ tự dòng

            state: 1,                     // 1 = active

            is_promotion: false,          // có phải hàng khuyến mãi không
            not_in_vat_declaration: false,

            is_unit_price_after_tax: false,

            is_follow_serial_number: false,
            is_allow_duplicate_serial_number: false,

            isChange: true,               // báo backend đây là dòng mới

            relation_detail_sa_voucher_invoice: [],
            is_delete_relation_invoice_detail: true,

            is_commercial_abatement: false,

            quantity_in_combo: 0,

            /* ===== H. METADATA MISA (NÊN COPY NGUYÊN) ===== */

            purchase_last_unit_price_list:
              "[{\"currency_id\":\"VND\",\"unit_id\":\"GUID\",\"unit_name\":\"Cái\",\"unit_price\":\"50000\"}]",

            discount_type: 0
          }
        ]
      }
    ],

    Links: [],

    /* ===============================
       III. THÔNG TIN HÓA ĐƠN (MASTER)
    =============================== */

    Object: {
      /* --- Chi nhánh --- */
      branch_id: "GUID",

      /* --- Khách hàng (phải tồn tại trong MISA) --- */
      account_object_id: "GUID",
      account_object_code: "KLE",
      account_object_name: "Khách lẻ",
      account_object_address: "Địa chỉ KH",
      phone_number: "0909xxxx",

      buyer: "Tên người mua",

      /* --- Ngày --- */
      inv_date: new Date().toISOString(),
      refdate: new Date().toISOString(),

      /* --- Tiền tệ --- */
      currency_id: "VND",
      exchange_rate: 1,

      /* --- Tổng tiền (PHẢI TỰ TÍNH TỪ DETAIL) --- */
      total_sale_amount: 100000,
      total_sale_amount_oc: 100000,

      total_vat_amount: 8000,
      total_vat_amount_oc: 8000,

      total_discount_amount: 0,
      total_discount_amount_oc: 0,

      total_amount: 108000,
      total_amount_oc: 108000,

      /* --- Trạng thái hóa đơn --- */
      is_paid: false,
      is_posted: false,
      invoice_status: 1,
      publish_status: 0,

      /* --- Thanh toán --- */
      payment_method: "TM/CK",

      /* --- Flags hệ thống --- */
      display_on_book: 0,
      include_invoice: 0,
      is_attach_list: false,
      is_branch_issued: false,
      is_posted_last_year: false,
      is_invoice_replace: false,

      discount_type: 0,
      discount_rate_voucher: 0,

      is_created_savoucher: 0,
      send_email_status: 0,

      voucher_reference: [],
      attachment_id_list_data: [],

      is_invoice_deleted: false,
      is_follows_406: false,

      publish_taxcode_status: 0,
      tax_reduction_type: 0,
      is_tax_reduction_type_43: false,

      is_delete_voucher_reference: false,
      is_discount_invoice: false,

      dav_using_permision: true,
      is_invoice_machine: false,

      MappingEinvoiceObjectList: []
    },

    /* ===============================
       IV. LOG HỆ THỐNG
       (có thể copy từ request gốc)
    =============================== */

    auditing_log: {
      action: 1,
      action_name: "Thêm",
      state: 1,
      isAuditingLog: true,
      detailDescription: { insert: [], update: [], delete: [], custom: [] }
    },

    /* ===============================
       V. OPTION LƯU
    =============================== */

    OptionForSave: {
      PostAfterSave: true,   // ghi sổ sau khi lưu
      IsQuickEdit: false,
      FormState: "Add"       // Add = tạo mới
    }
  }
];
