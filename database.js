
(function () {
    "use strict";

    const DB_NAME = "TawalefDatabase";
    const DB_VERSION = 3;

    const STORE_NAMES = [
        "settings",
        "shifts",
        "employees",
        "supervisors",
        "manufacturing",
        "packaging",
        "materials",
        "wastage",
        "items"
    ];

    let databasePromise = null;

    function requestToPromise(request) {
        return new Promise(function (resolve, reject) {
            request.onsuccess = function () {
                resolve(request.result);
            };

            request.onerror = function () {
                reject(
                    request.error ||
                    new Error("تعذّر تنفيذ طلب قاعدة البيانات.")
                );
            };
        });
    }

    function transactionToPromise(transaction) {
        return new Promise(function (resolve, reject) {
            transaction.oncomplete = function () {
                resolve();
            };

            transaction.onerror = function () {
                reject(
                    transaction.error ||
                    new Error("حدث خطأ أثناء تنفيذ عملية قاعدة البيانات.")
                );
            };

            transaction.onabort = function () {
                reject(
                    transaction.error ||
                    new Error("تم إلغاء عملية قاعدة البيانات.")
                );
            };
        });
    }

    function open() {
        if (!("indexedDB" in window)) {
            return Promise.reject(
                new Error("هذا المتصفح لا يدعم قاعدة البيانات المحلية IndexedDB.")
            );
        }

        if (databasePromise) {
            return databasePromise;
        }

        databasePromise = new Promise(function (resolve, reject) {
            let request;

            try {
                request = indexedDB.open(DB_NAME, DB_VERSION);
            } catch (error) {
                databasePromise = null;
                reject(error);
                return;
            }

            request.onupgradeneeded = function (event) {
                const db = event.target.result;

                STORE_NAMES.forEach(function (storeName) {
                    if (!db.objectStoreNames.contains(storeName)) {
                        if (storeName === "settings") {
                            db.createObjectStore(storeName, {
                                keyPath: "key"
                            });
                        } else {
                            db.createObjectStore(storeName, {
                                keyPath: "id",
                                autoIncrement: true
                            });
                        }
                    }
                });
            };

            request.onsuccess = function () {
                const db = request.result;

                db.onversionchange = function () {
                    db.close();
                    databasePromise = null;
                };

                resolve(db);
            };

            request.onerror = function () {
                databasePromise = null;

                reject(
                    request.error ||
                    new Error("تعذّر فتح قاعدة البيانات المحلية.")
                );
            };

            request.onblocked = function () {
                console.warn(
                    "تحديث قاعدة البيانات متوقف. أغلق الصفحات الأخرى المفتوحة للمشروع."
                );
            };
        });

        return databasePromise;
    }

    async function initialize() {
        const db = await open();

        return {
            name: DB_NAME,
            version: DB_VERSION,
            stores: Array.from(db.objectStoreNames)
        };
    }

    function checkStoreName(storeName) {
        if (!STORE_NAMES.includes(storeName)) {
            throw new Error("اسم مخزن غير معروف: " + storeName);
        }
    }

    async function getAll(storeName) {
        checkStoreName(storeName);

        const db = await open();
        const transaction = db.transaction([storeName], "readonly");
        const request = transaction.objectStore(storeName).getAll();

        return await requestToPromise(request);
    }

    async function getById(storeName, id) {
        checkStoreName(storeName);

        if (id === undefined || id === null || id === "") {
            throw new Error("معرّف السجل غير موجود.");
        }

        const db = await open();
        const transaction = db.transaction([storeName], "readonly");
        const key = storeName === "settings" ? id : Number(id);
        const request = transaction.objectStore(storeName).get(key);

        return await requestToPromise(request);
    }

    async function add(storeName, data) {
        checkStoreName(storeName);

        if (!data || typeof data !== "object") {
            throw new Error("بيانات السجل غير صحيحة.");
        }

        const db = await open();
        const transaction = db.transaction([storeName], "readwrite");
        const completion = transactionToPromise(transaction);
        const store = transaction.objectStore(storeName);
        const record = Object.assign({}, data);

        if (storeName === "settings") {
            if (!record.key) {
                throw new Error("يجب تحديد مفتاح الإعداد.");
            }

            await requestToPromise(store.put(record));
            await completion;

            return record;
        }

        delete record.id;

        const newId = await requestToPromise(store.add(record));
        await completion;

        record.id = newId;

        return record;
    }

    async function update(storeName, id, data) {
        checkStoreName(storeName);

        if (storeName === "settings") {
            throw new Error(
                "لتعديل الإعدادات استخدم الدالة setSetting."
            );
        }

        let recordData;

        if (id && typeof id === "object" && data === undefined) {
            recordData = Object.assign({}, id);
            id = recordData.id;
        } else {
            recordData = Object.assign({}, data || {});
            recordData.id = Number(id);
        }

        if (id === undefined || id === null || id === "") {
            throw new Error("معرّف السجل المطلوب تعديله غير موجود.");
        }

        const numericId = Number(id);

        if (!Number.isFinite(numericId)) {
            throw new Error("معرّف السجل غير صالح.");
        }

        const db = await open();
        const transaction = db.transaction([storeName], "readwrite");
        const completion = transactionToPromise(transaction);
        const store = transaction.objectStore(storeName);

        const existing = await requestToPromise(
            store.get(numericId)
        );

        if (!existing) {
            transaction.abort();

            try {
                await completion;
            } catch (error) {
                // نتعامل مع الإلغاء أدناه برسالة واضحة.
            }

            throw new Error("السجل المطلوب تعديله غير موجود.");
        }

        const record = Object.assign(
            {},
            existing,
            recordData,
            { id: numericId }
        );

        await requestToPromise(store.put(record));
        await completion;

        return record;
    }

    async function remove(storeName, id) {
        checkStoreName(storeName);

        if (id === undefined || id === null || id === "") {
            throw new Error("معرّف السجل المطلوب حذفه غير موجود.");
        }

        const db = await open();
        const transaction = db.transaction([storeName], "readwrite");
        const completion = transactionToPromise(transaction);
        const store = transaction.objectStore(storeName);

        const key = storeName === "settings" ? id : Number(id);

        await requestToPromise(store.delete(key));
        await completion;

        return true;
    }

    async function getSetting(key) {
        const record = await getById("settings", key);

        return record ? record.value : undefined;
    }

    async function setSetting(key, value) {
        if (key === undefined || key === null || key === "") {
            throw new Error("يجب تحديد مفتاح الإعداد.");
        }

        const db = await open();
        const transaction = db.transaction(["settings"], "readwrite");
        const completion = transactionToPromise(transaction);

        const record = {
            key: key,
            value: value
        };

        await requestToPromise(
            transaction.objectStore("settings").put(record)
        );

        await completion;

        return record;
    }

    async function exportBackup() {
        const db = await open();
        const transaction = db.transaction(STORE_NAMES, "readonly");
        const result = {};

        const requests = STORE_NAMES.map(function (storeName) {
            return requestToPromise(
                transaction.objectStore(storeName).getAll()
            ).then(function (records) {
                result[storeName] = records;
            });
        });

        await Promise.all(requests);

        return {
            appName: "نظام التوالف",
            databaseName: DB_NAME,
            version: DB_VERSION,
            exportedAt: new Date().toISOString(),
            data: result
        };
    }

    function validateBackup(backup) {
        if (!backup || typeof backup !== "object") {
            throw new Error("ملف النسخة الاحتياطية غير صالح.");
        }

        const data = backup.data || backup;

        if (!data || typeof data !== "object") {
            throw new Error("بيانات النسخة الاحتياطية غير موجودة.");
        }

        const hasKnownStore = STORE_NAMES.some(function (storeName) {
            return Array.isArray(data[storeName]);
        });

        if (!hasKnownStore) {
            throw new Error(
                "لم يتم العثور على مخازن معروفة داخل النسخة الاحتياطية."
            );
        }

        return data;
    }

    async function restoreBackup(backup) {
        const data = validateBackup(backup);
        const db = await open();

        const transaction = db.transaction(STORE_NAMES, "readwrite");
        const completion = transactionToPromise(transaction);

        STORE_NAMES.forEach(function (storeName) {
            if (!Array.isArray(data[storeName])) {
                return;
            }

            const store = transaction.objectStore(storeName);

            store.clear();

            data[storeName].forEach(function (record) {
                store.put(record);
            });
        });

        await completion;

        return true;
    }

    window.TawalefDB = {
        DB_NAME: DB_NAME,
        DB_VERSION: DB_VERSION,
        STORE_NAMES: STORE_NAMES.slice(),

        initialize: initialize,
        open: open,

        getAll: getAll,
        getById: getById,
        add: add,
        update: update,
        remove: remove,

        getSetting: getSetting,
        setSetting: setSetting,

        exportBackup: exportBackup,
        validateBackup: validateBackup,
        restoreBackup: restoreBackup
    };

})();
