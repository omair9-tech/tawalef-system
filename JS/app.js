
"use strict";

document.addEventListener("DOMContentLoaded", async function () {
    const $ = (id) => document.getElementById(id);

    function formatNumber(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return "0";
        return String(Number(number.toFixed(6)));
    }

    function setText(id, value) {
        const element = $(id);
        if (element) element.textContent = value;
    }

    async function loadDashboard() {
        try {
            if (!window.TawalefDB) {
                throw new Error(
                    "تعذر العثور على قاعدة البيانات. تحقق من مسار JS/database.js."
                );
            }

            await window.TawalefDB.initialize();

            const results = await Promise.all([
                window.TawalefDB.getAll("wastage"),
                window.TawalefDB.getAll("employees"),
                window.TawalefDB.getAll("items"),
                window.TawalefDB.getAll("materials"),
                window.TawalefDB.getAll("shifts"),
                window.TawalefDB.getAll("supervisors")
            ]);

            const wastage = results[0] || [];
            const employees = results[1] || [];
            const items = results[2] || [];
            const wasteTypes = results[3] || [];
            const shifts = results[4] || [];
            const supervisors = results[5] || [];

            const totalQuantity = wastage.reduce(
                (sum, record) => sum + (Number(record.quantity) || 0),
                0
            );

            const totalDisallowed = wastage.reduce(
                (sum, record) => {
                    if (record.disallowed !== undefined &&
                        record.disallowed !== null) {
                        return sum + (Number(record.disallowed) || 0);
                    }

                    const quantity = Number(record.quantity) || 0;
                    const allowed = Number(record.allowed) || 0;

                    return sum + Math.max(0, quantity - allowed);
                },
                0
            );

            // تحديث عناصر الملخص إن كانت موجودة في الصفحة.
            setText("totalWastage", formatNumber(wastage.length));
            setText("totalManufacturing", formatNumber(items.length));
            setText("totalPackaging", formatNumber(wasteTypes.length));
            setText("totalEmployees", formatNumber(employees.length));

            // دعم عناصر إضافية اختيارية إذا أُضيفت إلى الصفحة الرئيسية.
            setText("totalQuantity", formatNumber(totalQuantity) + " كجم");
            setText("totalDisallowed", formatNumber(totalDisallowed) + " كجم");
            setText("totalItems", formatNumber(items.length));
            setText("totalWasteTypes", formatNumber(wasteTypes.length));
            setText("totalShifts", formatNumber(shifts.length));
            setText("totalSupervisors", formatNumber(supervisors.length));

            const status = $("dashboardStatus");
            if (status) {
                status.textContent = "تم تحديث الإحصائيات بنجاح.";
            }

        } catch (error) {
            console.error("خطأ في تحميل ملخص الصفحة الرئيسية:", error);

            const status = $("dashboardStatus");
            if (status) {
                status.textContent =
                    "تعذر تحميل الإحصائيات: " +
                    (error.message || "خطأ غير معروف");
            }
        }
    }

    await loadDashboard();
});
