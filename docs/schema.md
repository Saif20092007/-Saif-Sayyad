-- SS Plastotech ERP Database Schema (SQL script for Supabase initialization)

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: settings
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inactivity_timeout_minutes INTEGER NOT NULL DEFAULT 60,
    invoice_prefix VARCHAR(50) NOT NULL DEFAULT 'SSPT',
    backup_time TIME NOT NULL DEFAULT '02:00:00',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: users (linked with Supabase Auth or standard credentials verification)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: company_profile
CREATE TABLE IF NOT EXISTS company_profile (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    gstin VARCHAR(15) NOT NULL,
    pan VARCHAR(10) NOT NULL,
    cin VARCHAR(21),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    logo_url TEXT,
    bank_name VARCHAR(255) NOT NULL,
    bank_account_no VARCHAR(50) NOT NULL,
    bank_ifsc VARCHAR(20) NOT NULL,
    signature_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: customers
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    gstin VARCHAR(15),
    billing_address TEXT NOT NULL,
    shipping_address TEXT NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    gstin VARCHAR(15),
    address TEXT NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: products
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    hsn_code VARCHAR(15) NOT NULL,
    gst_percent NUMERIC(5,2) NOT NULL DEFAULT 18.00,
    default_rate NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    unit VARCHAR(20) NOT NULL DEFAULT 'NOS',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: stock
CREATE TABLE IF NOT EXISTS stock (
    product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    quantity_available NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: invoices (Session 2 Schema)
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_no TEXT UNIQUE NOT NULL,
    financial_year TEXT NOT NULL,
    running_number INTEGER NOT NULL,
    invoice_date DATE NOT NULL DEFAULT now(),
    customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
    po_number TEXT,
    place_of_supply TEXT,
    tax_type TEXT CHECK (tax_type IN ('CGST_SGST','IGST')),
    taxable_value NUMERIC(14,2) NOT NULL,
    cgst_total NUMERIC(14,2) DEFAULT 0,
    sgst_total NUMERIC(14,2) DEFAULT 0,
    igst_total NUMERIC(14,2) DEFAULT 0,
    round_off NUMERIC(6,2) DEFAULT 0,
    grand_total NUMERIC(14,2) NOT NULL,
    invoice_status TEXT CHECK (invoice_status IN ('Active','Cancelled')) DEFAULT 'Active',
    payment_status TEXT CHECK (payment_status IN ('Draft','Final','Paid','Partially Paid','Unpaid')) DEFAULT 'Draft',
    copy_type TEXT CHECK (copy_type IN ('Original','Duplicate','Triplicate')) DEFAULT 'Original',
    is_signed_digital BOOLEAN DEFAULT false,
    verify_token UUID UNIQUE DEFAULT uuid_generate_v4(),
    pdf_url TEXT,
    pdf_generation_status TEXT CHECK (pdf_generation_status IN ('pending','success','failed')) DEFAULT 'pending',
    snapshot_customer_name TEXT,
    snapshot_customer_address TEXT,
    snapshot_customer_gstin TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (financial_year, running_number)
);

-- Table: invoice_items (Session 2 Schema)
CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    snapshot_description TEXT NOT NULL,
    snapshot_hsn TEXT NOT NULL,
    snapshot_gst_percent NUMERIC(5,2) NOT NULL,
    qty NUMERIC(10,3) NOT NULL CHECK (qty > 0 AND qty <= 100000),
    rate NUMERIC(12,2) NOT NULL CHECK (rate >= 0 AND rate <= 10000000),
    taxable_amount NUMERIC(14,2) NOT NULL,
    cgst_amount NUMERIC(14,2) DEFAULT 0,
    sgst_amount NUMERIC(14,2) DEFAULT 0,
    igst_amount NUMERIC(14,2) DEFAULT 0,
    line_total NUMERIC(14,2) NOT NULL
);

-- Table: invoice_counters (Session 2 Helper Table)
CREATE TABLE IF NOT EXISTS invoice_counters (
    financial_year TEXT PRIMARY KEY,
    last_number INTEGER DEFAULT 0
);

-- Stored Procedure: get_next_invoice_number (Atomic sequential numbering)
CREATE OR REPLACE FUNCTION get_next_invoice_number(fy TEXT)
RETURNS INTEGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  INSERT INTO invoice_counters (financial_year, last_number)
  VALUES (fy, 1)
  ON CONFLICT (financial_year)
  DO UPDATE SET last_number = invoice_counters.last_number + 1
  RETURNING last_number INTO next_num;
  RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- Stored Procedure: create_invoice_transaction
-- Handles sequential numbering, stock validations, stock decrements, and record insertions atomically.
CREATE OR REPLACE FUNCTION create_invoice_transaction(
    invoice_payload JSONB,
    items_payload JSONB
)
RETURNS UUID AS $$
DECLARE
    new_invoice_id UUID;
    item_record JSONB;
    p_id UUID;
    qty_needed NUMERIC(12,3);
    qty_avail NUMERIC(12,3);
    fy TEXT;
    next_num INTEGER;
    final_invoice_no TEXT;
BEGIN
    -- Extract Financial Year
    fy := invoice_payload->>'financial_year';
    IF fy IS NULL OR fy = '' THEN
        RAISE EXCEPTION 'financial_year is required in invoice_payload';
    END IF;

    -- Call get_next_invoice_number
    next_num := get_next_invoice_number(fy);

    -- Construct Invoice Number
    final_invoice_no := 'SSPT/' || fy || '/' || lpad(next_num::text, 6, '0');

    -- Set new invoice ID
    new_invoice_id := COALESCE((invoice_payload->>'id')::UUID, uuid_generate_v4());

    -- Validate Stock for all items first
    FOR item_record IN SELECT * FROM jsonb_array_elements(items_payload)
    LOOP
        p_id := (item_record->>'product_id')::UUID;
        qty_needed := (item_record->>'qty')::NUMERIC(12,3);

        -- Get available stock
        SELECT quantity_available INTO qty_avail FROM stock WHERE product_id = p_id;
        IF qty_avail IS NULL THEN
            qty_avail := 0;
        END IF;

        IF qty_avail < qty_needed THEN
            RAISE EXCEPTION 'Insufficient stock for product ID: % (Available: %, Requested: %)', p_id, qty_avail, qty_needed;
        END IF;
    END LOOP;

    -- Decrement stock and insert invoice items
    FOR item_record IN SELECT * FROM jsonb_array_elements(items_payload)
    LOOP
        p_id := (item_record->>'product_id')::UUID;
        qty_needed := (item_record->>'qty')::NUMERIC(12,3);

        -- Decrement stock
        UPDATE stock
        SET quantity_available = quantity_available - qty_needed,
            last_updated = timezone('utc'::text, now())
        WHERE product_id = p_id;

        -- Insert invoice_items row
        INSERT INTO invoice_items (
            id,
            invoice_id,
            product_id,
            snapshot_description,
            snapshot_hsn,
            snapshot_gst_percent,
            qty,
            rate,
            taxable_amount,
            cgst_amount,
            sgst_amount,
            igst_amount,
            line_total
        ) VALUES (
            uuid_generate_v4(),
            new_invoice_id,
            p_id,
            item_record->>'snapshot_description',
            item_record->>'snapshot_hsn',
            (item_record->>'snapshot_gst_percent')::NUMERIC(5,2),
            qty_needed,
            (item_record->>'rate')::NUMERIC(12,2),
            (item_record->>'taxable_amount')::NUMERIC(14,2),
            COALESCE((item_record->>'cgst_amount')::NUMERIC(14,2), 0),
            COALESCE((item_record->>'sgst_amount')::NUMERIC(14,2), 0),
            COALESCE((item_record->>'igst_amount')::NUMERIC(14,2), 0),
            (item_record->>'line_total')::NUMERIC(14,2)
        );
    END LOOP;

    -- Insert the invoice row
    INSERT INTO invoices (
        id,
        invoice_no,
        financial_year,
        running_number,
        invoice_date,
        customer_id,
        po_number,
        place_of_supply,
        tax_type,
        taxable_value,
        cgst_total,
        sgst_total,
        igst_total,
        round_off,
        grand_total,
        invoice_status,
        payment_status,
        copy_type,
        is_signed_digital,
        verify_token,
        pdf_url,
        pdf_generation_status,
        snapshot_customer_name,
        snapshot_customer_address,
        snapshot_customer_gstin
    ) VALUES (
        new_invoice_id,
        final_invoice_no,
        fy,
        next_num,
        COALESCE((invoice_payload->>'invoice_date')::DATE, now()::DATE),
        (invoice_payload->>'customer_id')::UUID,
        invoice_payload->>'po_number',
        invoice_payload->>'place_of_supply',
        invoice_payload->>'tax_type',
        (invoice_payload->>'taxable_value')::NUMERIC(14,2),
        COALESCE((invoice_payload->>'cgst_total')::NUMERIC(14,2), 0),
        COALESCE((invoice_payload->>'sgst_total')::NUMERIC(14,2), 0),
        COALESCE((invoice_payload->>'igst_total')::NUMERIC(14,2), 0),
        COALESCE((invoice_payload->>'round_off')::NUMERIC(6,2), 0),
        (invoice_payload->>'grand_total')::NUMERIC(14,2),
        COALESCE(invoice_payload->>'invoice_status', 'Active'),
        COALESCE(invoice_payload->>'payment_status', 'Draft'),
        COALESCE(invoice_payload->>'copy_type', 'Original'),
        COALESCE((invoice_payload->>'is_signed_digital')::BOOLEAN, false),
        uuid_generate_v4(),
        null,
        'pending',
        invoice_payload->>'snapshot_customer_name',
        invoice_payload->>'snapshot_customer_address',
        invoice_payload->>'snapshot_customer_gstin'
    );

    RETURN new_invoice_id;
END;
$$ LANGUAGE plpgsql;

-- Table: purchases
CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    purchase_date DATE NOT NULL,
    invoice_ref VARCHAR(100) NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: purchase_items
CREATE TABLE IF NOT EXISTS purchase_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    qty NUMERIC(12,3) NOT NULL,
    rate NUMERIC(12,2) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: payments
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL,
    payment_date DATE NOT NULL,
    mode VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID, -- NULL if system action or auth issue
    action VARCHAR(255) NOT NULL,
    module VARCHAR(100) NOT NULL,
    reference_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger to automatically handle stock creation for a new product
CREATE OR REPLACE FUNCTION handle_new_product_stock()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO stock (product_id, quantity_available, last_updated)
    VALUES (NEW.id, 0.000, now())
    ON CONFLICT (product_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_new_product_stock ON products;
CREATE TRIGGER trigger_new_product_stock
AFTER INSERT ON products
FOR EACH ROW
EXECUTE FUNCTION handle_new_product_stock();
