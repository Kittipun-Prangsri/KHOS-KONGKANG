-- กันพลาด: บังคับใช้ฐานของแอปเสมอ ไม่ว่าเครื่องมือจะเลือกฐานไว้ที่ไหน (ห้ามสร้างตารางใน hosoffice)
USE computer_stock;

-- =============================================================================
-- ระบบบัญชีรับ-จ่ายวัสดุคอมพิวเตอร์ โรงพยาบาลคลองหาด
-- Stored Procedures & Triggers สำหรับ Cascade Recalculation ของยอดยกมา
-- =============================================================================

-- =============================================================================
-- สำหรับ MySQL / MariaDB เท่านั้น (เวอร์ชัน PostgreSQL/Supabase อยู่ที่ db/stock_triggers_procedures_pg.sql)
-- =============================================================================

DELIMITER //

DROP PROCEDURE IF EXISTS sp_recalc_cascade //

CREATE PROCEDURE sp_recalc_cascade(
    IN p_item_id INT,
    IN p_start_fiscal_month_id INT
)
BEGIN
    DECLARE v_current_fm_id INT;
    DECLARE v_prev_closing_qty INT DEFAULT 0;
    DECLARE v_prev_closing_val DECIMAL(14,2) DEFAULT 0.00;
    DECLARE v_rec_qty INT DEFAULT 0;
    DECLARE v_rec_val DECIMAL(14,2) DEFAULT 0.00;
    DECLARE v_iss_qty INT DEFAULT 0;
    DECLARE v_iss_val DECIMAL(14,2) DEFAULT 0.00;
    DECLARE v_done INT DEFAULT 0;

    DECLARE month_cursor CURSOR FOR
        SELECT fm.id
        FROM fiscal_months fm
        JOIN fiscal_months start_fm ON start_fm.id = p_start_fiscal_month_id
        JOIN fiscal_years fy ON fm.fiscal_year_id = fy.id
        JOIN fiscal_years start_fy ON start_fm.fiscal_year_id = start_fy.id
        WHERE (
            (fy.start_date > start_fy.start_date) OR 
            (fy.start_date = start_fy.start_date AND fm.month_no >= start_fm.month_no)
        )
        AND (
            fm.id = p_start_fiscal_month_id  -- เดือนที่แก้ไขต้องคำนวณเสมอ แม้ยังไม่มีแถวสรุป
            OR EXISTS (
            SELECT 1 FROM monthly_stock_summary mss 
            WHERE mss.item_id = p_item_id AND mss.fiscal_month_id = fm.id
            )
        )
        ORDER BY fy.start_date ASC, fm.month_no ASC;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    OPEN month_cursor;

    recalc_loop: LOOP
        FETCH month_cursor INTO v_current_fm_id;
        IF v_done = 1 THEN
            LEAVE recalc_loop;
        END IF;

        -- ไม่มีเดือนก่อนหน้า = ยอดยกมา 0 (และต้องไม่ให้ NOT FOUND handler ตัดจบลูปก่อนเวลา)
        SET v_prev_closing_qty = 0, v_prev_closing_val = 0.00;
        SELECT COALESCE(mss.closing_qty, 0), COALESCE(mss.closing_value, 0.00)
        INTO v_prev_closing_qty, v_prev_closing_val
        FROM fiscal_months prev_fm
        JOIN fiscal_months curr_fm ON curr_fm.id = v_current_fm_id
        JOIN fiscal_years prev_fy ON prev_fm.fiscal_year_id = prev_fy.id
        JOIN fiscal_years curr_fy ON curr_fm.fiscal_year_id = curr_fy.id
        JOIN monthly_stock_summary mss ON mss.item_id = p_item_id AND mss.fiscal_month_id = prev_fm.id
        -- เดือนล่าสุดที่มีแถวสรุปก่อนเดือนนี้ (ไม่ใช่แค่ "เดือนก่อนหน้าพอดี" เพราะเดือนที่ไม่มีความเคลื่อนไหวไม่มีแถว)
        WHERE (
            prev_fy.start_date < curr_fy.start_date OR
            (prev_fy.start_date = curr_fy.start_date AND prev_fm.month_no < curr_fm.month_no)
        )
        ORDER BY prev_fy.start_date DESC, prev_fm.month_no DESC
        LIMIT 1;
        SET v_done = 0;

        SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(total_value), 0.00)
        INTO v_rec_qty, v_rec_val
        FROM stock_movements
        WHERE item_id = p_item_id AND fiscal_month_id = v_current_fm_id AND movement_type = 'receive';

        SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(total_value), 0.00)
        INTO v_iss_qty, v_iss_val
        FROM stock_movements
        WHERE item_id = p_item_id AND fiscal_month_id = v_current_fm_id AND movement_type = 'issue';

        INSERT INTO monthly_stock_summary (
            item_id, fiscal_month_id,
            opening_qty, received_qty, issued_qty,
            opening_value, received_value, issued_value
        ) VALUES (
            p_item_id, v_current_fm_id,
            v_prev_closing_qty, v_rec_qty, v_iss_qty,
            v_prev_closing_val, v_rec_val, v_iss_val
        )
        ON DUPLICATE KEY UPDATE
            opening_qty = v_prev_closing_qty,
            received_qty = v_rec_qty,
            issued_qty = v_iss_qty,
            opening_value = v_prev_closing_val,
            received_value = v_rec_val,
            issued_value = v_iss_val;

    END LOOP recalc_loop;

    CLOSE month_cursor;
END //

DELIMITER ;

DROP TRIGGER IF EXISTS trg_stock_movement_after_insert;
DELIMITER //
CREATE TRIGGER trg_stock_movement_after_insert
AFTER INSERT ON stock_movements
FOR EACH ROW
BEGIN
    CALL sp_recalc_cascade(NEW.item_id, NEW.fiscal_month_id);
END //
DELIMITER ;

DROP TRIGGER IF EXISTS trg_stock_movement_after_update;
DELIMITER //
CREATE TRIGGER trg_stock_movement_after_update
AFTER UPDATE ON stock_movements
FOR EACH ROW
BEGIN
    CALL sp_recalc_cascade(NEW.item_id, NEW.fiscal_month_id);
    IF OLD.item_id <> NEW.item_id OR OLD.fiscal_month_id <> NEW.fiscal_month_id THEN
        CALL sp_recalc_cascade(OLD.item_id, OLD.fiscal_month_id);
    END IF;
END //
DELIMITER ;

DROP TRIGGER IF EXISTS trg_stock_movement_after_delete;
DELIMITER //
CREATE TRIGGER trg_stock_movement_after_delete
AFTER DELETE ON stock_movements
FOR EACH ROW
BEGIN
    CALL sp_recalc_cascade(OLD.item_id, OLD.fiscal_month_id);
END //
DELIMITER ;
