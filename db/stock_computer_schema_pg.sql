-- =============================================================================
-- ระบบบัญชีรับ-จ่ายวัสดุคอมพิวเตอร์ โรงพยาบาลคลองหาด (เวอร์ชัน PostgreSQL / Supabase)
-- =============================================================================

-- 1. หมวดหมู่วัสดุ (item_categories)
CREATE TABLE IF NOT EXISTS item_categories (
    id SERIAL PRIMARY KEY,
    category_code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. รายการวัสดุ Master (items)
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    category_id INT DEFAULT 1 REFERENCES item_categories(id) ON DELETE SET NULL,
    item_code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(50) NOT NULL DEFAULT 'ชิ้น',
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    min_qty INT DEFAULT 5,
    reorder_point INT DEFAULT 10,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ปีงบประมาณ (fiscal_years)
CREATE TABLE IF NOT EXISTS fiscal_years (
    id SERIAL PRIMARY KEY,
    year_name VARCHAR(10) NOT NULL UNIQUE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. เดือนปีงบประมาณ (fiscal_months)
CREATE TABLE IF NOT EXISTS fiscal_months (
    id SERIAL PRIMARY KEY,
    fiscal_year_id INT NOT NULL REFERENCES fiscal_years(id) ON DELETE CASCADE,
    month_no INT NOT NULL,
    month_name VARCHAR(50) NOT NULL,
    calendar_month INT NOT NULL,
    calendar_year_ad INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_closed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_fiscal_month UNIQUE (fiscal_year_id, month_no)
);

-- 5. บันทึกความเคลื่อนไหว รับ-จ่าย (stock_movements)
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    fiscal_month_id INT NOT NULL REFERENCES fiscal_months(id) ON DELETE CASCADE,
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('receive', 'issue')),
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_value NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    movement_date DATE NOT NULL,
    reference_no VARCHAR(100),
    note TEXT,
    created_by INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. สรุปยอดสต๊อกประจำเดือนต่อรายการ (monthly_stock_summary)
CREATE TABLE IF NOT EXISTS monthly_stock_summary (
    id SERIAL PRIMARY KEY,
    item_id INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    fiscal_month_id INT NOT NULL REFERENCES fiscal_months(id) ON DELETE CASCADE,
    opening_qty INT NOT NULL DEFAULT 0,
    received_qty INT NOT NULL DEFAULT 0,
    issued_qty INT NOT NULL DEFAULT 0,
    closing_qty INT GENERATED ALWAYS AS (opening_qty + received_qty - issued_qty) STORED,
    opening_value NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    received_value NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    issued_value NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    closing_value NUMERIC(14,2) GENERATED ALWAYS AS (opening_value + received_value - issued_value) STORED,
    is_signed BOOLEAN DEFAULT FALSE,
    signed_by INT,
    signed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_item_month UNIQUE (item_id, fiscal_month_id)
);

-- 7. Views สำหรับ Dashboard

-- View: ยอดคงเหลือสต๊อกล่าสุด (v_current_stock)
CREATE OR REPLACE VIEW v_current_stock AS
SELECT 
    i.id AS item_id,
    i.item_code,
    i.name AS item_name,
    i.unit,
    i.unit_price,
    i.reorder_point,
    ic.name AS category_name,
    COALESCE(curr.closing_qty, 0) AS current_qty,
    COALESCE(curr.closing_value, 0.00) AS current_value,
    CASE 
        WHEN COALESCE(curr.closing_qty, 0) <= i.reorder_point THEN 1 
        ELSE 0 
    END AS is_low_stock,
    curr.fiscal_month_id AS last_fiscal_month_id
FROM items i
LEFT JOIN item_categories ic ON i.category_id = ic.id
LEFT JOIN (
    SELECT mss1.*
    FROM monthly_stock_summary mss1
    INNER JOIN (
        SELECT item_id, MAX(fiscal_month_id) AS max_month_id
        FROM monthly_stock_summary
        GROUP BY item_id
    ) mss2 ON mss1.item_id = mss2.item_id AND mss1.fiscal_month_id = mss2.max_month_id
) curr ON i.id = curr.item_id
WHERE i.status = 'active';

-- View: สรุปภาพรวมรายปีงบประมาณ (v_annual_summary)
CREATE OR REPLACE VIEW v_annual_summary AS
SELECT 
    i.id AS item_id,
    i.item_code,
    i.name AS item_name,
    i.unit,
    fm.fiscal_year_id,
    fy.year_name AS fiscal_year_name,
    SUM(mss.received_qty) AS annual_received_qty,
    SUM(mss.received_value) AS annual_received_value,
    SUM(mss.issued_qty) AS annual_issued_qty,
    SUM(mss.issued_value) AS annual_issued_value,
    (
        SELECT closing_qty 
        FROM monthly_stock_summary m 
        JOIN fiscal_months f ON m.fiscal_month_id = f.id 
        WHERE m.item_id = i.id AND f.fiscal_year_id = fm.fiscal_year_id 
        ORDER BY f.month_no DESC LIMIT 1
    ) AS year_end_closing_qty,
    (
        SELECT closing_value 
        FROM monthly_stock_summary m 
        JOIN fiscal_months f ON m.fiscal_month_id = f.id 
        WHERE m.item_id = i.id AND f.fiscal_year_id = fm.fiscal_year_id 
        ORDER BY f.month_no DESC LIMIT 1
    ) AS year_end_closing_value
FROM items i
JOIN monthly_stock_summary mss ON i.id = mss.item_id
JOIN fiscal_months fm ON mss.fiscal_month_id = fm.id
JOIN fiscal_years fy ON fm.fiscal_year_id = fy.id
GROUP BY i.id, i.item_code, i.name, i.unit, fm.fiscal_year_id, fy.year_name;
