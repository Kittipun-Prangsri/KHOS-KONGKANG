-- กันพลาด: บังคับใช้ฐานของแอปเสมอ ไม่ว่าเครื่องมือจะเลือกฐานไว้ที่ไหน (ห้ามสร้างตารางใน hosoffice)
USE computer_stock;

-- =============================================================================
-- ระบบบัญชีรับ-จ่ายวัสดุคอมพิวเตอร์ โรงพยาบาลคลองหาด
-- Database DDL Schema (รองรับทั้ง MySQL และ PostgreSQL)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. หมวดหมู่วัสดุ (item_categories)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 2. รายการวัสดุ Master (items)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT DEFAULT 1,
    item_code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(50) NOT NULL DEFAULT 'ชิ้น',
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    min_qty INT DEFAULT 5,
    reorder_point INT DEFAULT 10,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES item_categories(id) ON DELETE SET NULL
);

-- -----------------------------------------------------------------------------
-- 3. ปีงบประมาณ (fiscal_years)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fiscal_years (
    id INT AUTO_INCREMENT PRIMARY KEY,
    year_name VARCHAR(10) NOT NULL UNIQUE, -- เช่น '2569'
    start_date DATE NOT NULL,              -- เช่น '2025-10-01'
    end_date DATE NOT NULL,                -- เช่น '2026-09-30'
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 4. เดือนปีงบประมาณ (fiscal_months)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fiscal_months (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fiscal_year_id INT NOT NULL,
    month_no INT NOT NULL,                -- ลำดับในปีงบ (1=ต.ค., 2=พ.ย., ..., 12=ก.ย.)
    month_name VARCHAR(50) NOT NULL,       -- เช่น 'ตุลาคม', 'พฤศจิกายน'
    calendar_month INT NOT NULL,           -- เดือนปฏิทินจริง (1-12)
    calendar_year_ad INT NOT NULL,         -- ปี ค.ศ. จริง เช่น 2025
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_closed TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id) ON DELETE CASCADE,
    UNIQUE KEY uq_fiscal_month (fiscal_year_id, month_no)
);

-- -----------------------------------------------------------------------------
-- 5. บันทึกความเคลื่อนไหว รับ-จ่าย (stock_movements)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_movements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    fiscal_month_id INT NOT NULL,
    movement_type ENUM('receive', 'issue') NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_value DECIMAL(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    movement_date DATE NOT NULL,
    reference_no VARCHAR(100),
    note TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (fiscal_month_id) REFERENCES fiscal_months(id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 6. สรุปยอดสต๊อกประจำเดือนต่อรายการ (monthly_stock_summary)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS monthly_stock_summary (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    fiscal_month_id INT NOT NULL,
    opening_qty INT NOT NULL DEFAULT 0,
    received_qty INT NOT NULL DEFAULT 0,
    issued_qty INT NOT NULL DEFAULT 0,
    closing_qty INT GENERATED ALWAYS AS (opening_qty + received_qty - issued_qty) STORED,
    opening_value DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    received_value DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    issued_value DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    closing_value DECIMAL(14,2) GENERATED ALWAYS AS (opening_value + received_value - issued_value) STORED,
    is_signed TINYINT(1) DEFAULT 0,
    signed_by INT,
    signed_at DATETIME,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (fiscal_month_id) REFERENCES fiscal_months(id) ON DELETE CASCADE,
    UNIQUE KEY uq_item_month (item_id, fiscal_month_id)
);

-- -----------------------------------------------------------------------------
-- 7. Views สำหรับ Dashboard
-- -----------------------------------------------------------------------------

-- 7.1 View: ยอดคงเหลือสต๊อกล่าสุด (v_current_stock)
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

-- 7.2 View: สรุปภาพรวมรายปีงบประมาณ (v_annual_summary)
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
