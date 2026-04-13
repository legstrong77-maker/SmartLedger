// ============================================================
// 個人記帳軟體 — Google Apps Script 後端
// ============================================================

// ===== 設定 =====
const SPREADSHEET_ID = '1RTKR8hpytQEsgCLKSN_0SHwajHrfjQHKai1cXp1kHSs';
const DRIVE_FOLDER_ID = '1pDkCtedvNb-6GTR_gcVmVsu8v4agxDXU';
const GEMINI_API_KEY = 'AIzaSyB6Ca_wMge0YAyAf53IJdfXfYuG1jLPOgw';
const GEMINI_MODEL = 'gemini-2.5-flash';

const SHEET_USERS = '使用者';
const SHEET_RECORDS = '記帳紀錄';
const SHEET_CATEGORIES = '分類設定';
const SHEET_SETTINGS = '系統設定';

// ===== 預設分類 =====
const DEFAULT_EXPENSE_CATEGORIES = [
  { name: '用餐', emoji: '🍽️', color: '#FF6B6B', sort: 1 },
  { name: '運動', emoji: '🏃', color: '#4ECDC4', sort: 2 },
  { name: '加油', emoji: '⛽', color: '#FFE66D', sort: 3 },
  { name: '學費', emoji: '📚', color: '#6C5CE7', sort: 4 },
  { name: '醫療', emoji: '🏥', color: '#FF8A5C', sort: 5 },
  { name: '保險', emoji: '🛡️', color: '#2ECC71', sort: 6 },
  { name: '水電費', emoji: '💡', color: '#3498DB', sort: 7 },
  { name: '其他生活開銷', emoji: '🏠', color: '#95A5A6', sort: 8 },
  { name: '社交', emoji: '👥', color: '#E056A0', sort: 9 },
  { name: '購物', emoji: '🛍️', color: '#F39C12', sort: 10 },
  { name: '出遊', emoji: '✈️', color: '#1ABC9C', sort: 11 },
];

const DEFAULT_INCOME_CATEGORIES = [
  { name: '薪水', emoji: '💰', color: '#27AE60', sort: 1 },
  { name: '利息', emoji: '🏦', color: '#2980B9', sort: 2 },
  { name: '其他收入', emoji: '💵', color: '#8E44AD', sort: 3 },
];

// ===== 路由 =====
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  let result;
  try {
    switch (action) {
      case 'ping':
        result = { success: true, message: 'pong' };
        break;
      case 'login':
        result = handleLogin(e.parameter);
        break;
      case 'getExpenses':
        result = getExpenses(e.parameter);
        break;
      case 'getCategories':
        result = getCategories(e.parameter);
        break;
      case 'getDashboard':
        result = getDashboard(e.parameter);
        break;
      case 'getSettings':
        result = getSettings(e.parameter);
        break;
      case 'getUsers':
        result = getUsers();
        break;
      default:
        result = { error: '未知的操作: ' + action };
    }
  } catch (err) {
    result = { error: err.message, stack: err.stack };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: '無效的 JSON 資料' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  const action = data.action || '';
  let result;
  const lock = LockService.getScriptLock();

  try {
    lock.tryLock(15000);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: '伺服器忙碌中，請稍後再試' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    switch (action) {
      case 'register':
        result = handleRegister(data);
        break;
      case 'addExpense':
        result = addExpense(data);
        break;
      case 'updateExpense':
        result = updateExpense(data);
        break;
      case 'deleteExpense':
        result = deleteExpense(data);
        break;
      case 'updateCategories':
        result = updateCategories(data);
        break;
      case 'addCategory':
        result = addCategory(data);
        break;
      case 'deleteCategory':
        result = deleteCategory(data);
        break;
      case 'parseNaturalLanguage':
        result = parseNaturalLanguage(data);
        break;
      case 'parseReceipt':
        result = parseReceipt(data);
        break;
      case 'uploadImage':
        result = uploadImage(data);
        break;
      case 'updateSettings':
        result = updateSettings(data);
        break;
      default:
        result = { error: '未知的操作: ' + action };
    }
  } catch (err) {
    result = { error: err.message, stack: err.stack };
  } finally {
    lock.releaseLock();
  }

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ===== 初始化 (手動執行一次) =====
function initializeSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // 使用者
  let sheet = ss.getSheetByName(SHEET_USERS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_USERS);
    sheet.appendRow(['id', 'name', 'pin', 'createdAt']);
    sheet.setFrozenRows(1);
  }

  // 記帳紀錄
  sheet = ss.getSheetByName(SHEET_RECORDS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_RECORDS);
    sheet.appendRow([
      'id',
      'userId',
      'date',
      'time',
      'type',
      'category',
      'amount',
      'currency',
      'note',
      'imageUrl',
      'imageId',
      'inputMethod',
      'originalText',
      'createdAt',
    ]);
    sheet.setFrozenRows(1);
  }

  // 分類設定
  sheet = ss.getSheetByName(SHEET_CATEGORIES);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_CATEGORIES);
    sheet.appendRow([
      'userId',
      'type',
      'name',
      'emoji',
      'color',
      'sort',
      'enabled',
    ]);
    sheet.setFrozenRows(1);
  }

  // 系統設定
  sheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_SETTINGS);
    sheet.appendRow(['userId', 'key', 'value']);
    sheet.setFrozenRows(1);
  }

  Logger.log('所有工作表初始化完成！');
}

// ===== 使用者管理 =====
function handleLogin(params) {
  const name = (params.name || '').trim();
  const pin = (params.pin || '').trim();
  if (!name || !pin) return { error: '請輸入名稱和密碼' };

  const sheet = getSheet(SHEET_USERS);
  const data = sheet.getDataRange().getValues();
  const hashedPin = hashPin(pin);

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === name) {
      if (data[i][2] === hashedPin) {
        return {
          success: true,
          user: { id: data[i][0], name: data[i][1] },
        };
      } else {
        return { error: '密碼錯誤' };
      }
    }
  }
  return { error: '帳號不存在，請先註冊' };
}

function handleRegister(data) {
  const name = (data.name || '').trim();
  const pin = (data.pin || '').trim();
  if (!name || !pin) return { error: '請輸入名稱和密碼' };
  if (pin.length < 4) return { error: '密碼至少需要4位' };

  const sheet = getSheet(SHEET_USERS);
  const existing = sheet.getDataRange().getValues();
  for (let i = 1; i < existing.length; i++) {
    if (existing[i][1] === name) {
      return { error: '此名稱已被使用' };
    }
  }

  const userId = generateId();
  const hashedPin = hashPin(pin);
  const now = new Date().toISOString();
  sheet.appendRow([userId, name, hashedPin, now]);

  // 建立預設分類
  initDefaultCategories(userId);

  // 建立預設設定
  initDefaultSettings(userId);

  return {
    success: true,
    user: { id: userId, name: name },
  };
}

function getUsers() {
  const sheet = getSheet(SHEET_USERS);
  const data = sheet.getDataRange().getValues();
  const users = [];
  for (let i = 1; i < data.length; i++) {
    users.push({ id: data[i][0], name: data[i][1] });
  }
  return { success: true, users: users };
}

function initDefaultCategories(userId) {
  const sheet = getSheet(SHEET_CATEGORIES);
  const rows = [];

  DEFAULT_EXPENSE_CATEGORIES.forEach(function (cat) {
    rows.push([userId, 'expense', cat.name, cat.emoji, cat.color, cat.sort, true]);
  });
  DEFAULT_INCOME_CATEGORIES.forEach(function (cat) {
    rows.push([userId, 'income', cat.name, cat.emoji, cat.color, cat.sort, true]);
  });

  if (rows.length > 0) {
    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, 7)
      .setValues(rows);
  }
}

function initDefaultSettings(userId) {
  const sheet = getSheet(SHEET_SETTINGS);
  const defaults = [
    [userId, 'defaultCurrency', 'TWD'],
    [userId, 'enabledCurrencies', JSON.stringify(['TWD'])],
    [
      userId,
      'budgets',
      JSON.stringify({}),
    ],
  ];
  sheet
    .getRange(sheet.getLastRow() + 1, 1, defaults.length, 3)
    .setValues(defaults);
}

// ===== 記帳 CRUD =====
function addExpense(data) {
  const sheet = getSheet(SHEET_RECORDS);
  const id = generateId();
  const now = new Date();
  const row = [
    id,
    data.userId,
    data.date || Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM-dd'),
    data.time || Utilities.formatDate(now, 'Asia/Taipei', 'HH:mm'),
    data.type || 'expense',
    data.category || '其他生活開銷',
    parseFloat(data.amount) || 0,
    data.currency || 'TWD',
    data.note || '',
    data.imageUrl || '',
    data.imageId || '',
    data.inputMethod || 'manual',
    data.originalText || '',
    now.toISOString(),
  ];
  sheet.appendRow(row);

  return {
    success: true,
    expense: rowToExpense(row),
  };
}

function getExpenses(params) {
  const userId = params.userId;
  if (!userId) return { error: '缺少 userId' };

  const sheet = getSheet(SHEET_RECORDS);
  const data = sheet.getDataRange().getValues();
  const expenses = [];

  const month = params.month || ''; // YYYY-MM
  const category = params.category || '';
  const type = params.type || '';
  const limit = parseInt(params.limit) || 0;

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] !== userId) continue;
    if (month && !formatCellDate(data[i][2]).startsWith(month)) continue;
    if (category && data[i][5] !== category) continue;
    if (type && data[i][4] !== type) continue;

    expenses.push(rowToExpense(data[i]));
  }

  // 按日期降序
  expenses.sort(function (a, b) {
    return (b.date + b.time).localeCompare(a.date + a.time);
  });

  if (limit > 0) {
    return { success: true, expenses: expenses.slice(0, limit) };
  }
  return { success: true, expenses: expenses };
}

function updateExpense(data) {
  const sheet = getSheet(SHEET_RECORDS);
  const allData = sheet.getDataRange().getValues();

  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] === data.id && allData[i][1] === data.userId) {
      const row = i + 1;
      if (data.date !== undefined) sheet.getRange(row, 3).setValue(data.date);
      if (data.time !== undefined) sheet.getRange(row, 4).setValue(data.time);
      if (data.type !== undefined) sheet.getRange(row, 5).setValue(data.type);
      if (data.category !== undefined)
        sheet.getRange(row, 6).setValue(data.category);
      if (data.amount !== undefined)
        sheet.getRange(row, 7).setValue(parseFloat(data.amount));
      if (data.currency !== undefined)
        sheet.getRange(row, 8).setValue(data.currency);
      if (data.note !== undefined) sheet.getRange(row, 9).setValue(data.note);

      // 回傳更新後的資料
      const updated = sheet.getRange(row, 1, 1, 14).getValues()[0];
      return { success: true, expense: rowToExpense(updated) };
    }
  }
  return { error: '找不到該筆記錄' };
}

function deleteExpense(data) {
  const sheet = getSheet(SHEET_RECORDS);
  const allData = sheet.getDataRange().getValues();

  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] === data.id && allData[i][1] === data.userId) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { error: '找不到該筆記錄' };
}

function rowToExpense(row) {
  return {
    id: row[0],
    userId: row[1],
    date: formatCellDate(row[2]),
    time: formatCellTime(row[3]),
    type: row[4],
    category: row[5],
    amount: parseFloat(row[6]) || 0,
    currency: row[7] || 'TWD',
    note: row[8] || '',
    imageUrl: row[9] || '',
    imageId: row[10] || '',
    inputMethod: row[11] || 'manual',
    originalText: row[12] || '',
    createdAt: row[13] || '',
  };
}

// 將 Date 物件或字串轉為 YYYY-MM-DD
function formatCellDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  var s = String(val);
  // 已經是 YYYY-MM-DD 格式
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // 嘗試解析其他格式
  try {
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd');
    }
  } catch (e) {}
  return s;
}

// 將 Date 物件或字串轉為 HH:mm
function formatCellTime(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Taipei', 'HH:mm');
  }
  var s = String(val);
  // 已經是 HH:mm 格式
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  // 嘗試解析
  try {
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, 'Asia/Taipei', 'HH:mm');
    }
  } catch (e) {}
  return s;
}

// ===== 分類管理 =====
function getCategories(params) {
  const userId = params.userId;
  if (!userId) return { error: '缺少 userId' };

  const sheet = getSheet(SHEET_CATEGORIES);
  const data = sheet.getDataRange().getValues();
  const categories = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      categories.push({
        type: data[i][1],
        name: data[i][2],
        emoji: data[i][3],
        color: data[i][4],
        sort: data[i][5],
        enabled: data[i][6] === true || data[i][6] === 'true' || data[i][6] === 'TRUE',
      });
    }
  }

  categories.sort(function (a, b) {
    if (a.type !== b.type) return a.type === 'expense' ? -1 : 1;
    return a.sort - b.sort;
  });

  return { success: true, categories: categories };
}

function addCategory(data) {
  const sheet = getSheet(SHEET_CATEGORIES);
  const catData = sheet.getDataRange().getValues();
  
  // 計算最大排序值
  let maxSort = 0;
  for (let i = 1; i < catData.length; i++) {
    if (catData[i][0] === data.userId && catData[i][1] === data.type) {
      maxSort = Math.max(maxSort, catData[i][5] || 0);
    }
  }

  sheet.appendRow([
    data.userId,
    data.type || 'expense',
    data.name,
    data.emoji || '📌',
    data.color || '#95A5A6',
    maxSort + 1,
    true,
  ]);

  return { success: true };
}

function deleteCategory(data) {
  const sheet = getSheet(SHEET_CATEGORIES);
  const catData = sheet.getDataRange().getValues();

  for (let i = catData.length - 1; i >= 1; i--) {
    if (
      catData[i][0] === data.userId &&
      catData[i][2] === data.name &&
      catData[i][1] === data.type
    ) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { error: '找不到該分類' };
}

function updateCategories(data) {
  const sheet = getSheet(SHEET_CATEGORIES);
  const catData = sheet.getDataRange().getValues();

  // 刪除該使用者的所有分類
  for (let i = catData.length - 1; i >= 1; i--) {
    if (catData[i][0] === data.userId) {
      sheet.deleteRow(i + 1);
    }
  }

  // 重新寫入
  const rows = [];
  (data.categories || []).forEach(function (cat) {
    rows.push([
      data.userId,
      cat.type,
      cat.name,
      cat.emoji,
      cat.color,
      cat.sort,
      cat.enabled !== false,
    ]);
  });

  if (rows.length > 0) {
    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, 7)
      .setValues(rows);
  }

  return { success: true };
}

// ===== 儀表板 =====
function getDashboard(params) {
  const userId = params.userId;
  if (!userId) return { error: '缺少 userId' };

  const month = params.month || Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  const sheet = getSheet(SHEET_RECORDS);
  const data = sheet.getDataRange().getValues();

  let totalExpense = 0;
  let totalIncome = 0;
  let count = 0;
  const dailyExpense = {};
  const dailyIncome = {};
  const categoryExpense = {};
  const categoryIncome = {};
  const topExpenses = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] !== userId) continue;
    const dateStr = formatCellDate(data[i][2]);
    if (!dateStr.startsWith(month)) continue;

    const type = data[i][4];
    const category = data[i][5];
    const amount = parseFloat(data[i][6]) || 0;
    const day = dateStr.length >= 10 ? dateStr.slice(8, 10) : '';

    count++;

    if (type === 'expense') {
      totalExpense += amount;
      dailyExpense[day] = (dailyExpense[day] || 0) + amount;
      categoryExpense[category] = (categoryExpense[category] || 0) + amount;
      topExpenses.push({
        date: dateStr,
        category: category,
        amount: amount,
        note: data[i][8] || '',
      });
    } else {
      totalIncome += amount;
      dailyIncome[day] = (dailyIncome[day] || 0) + amount;
      categoryIncome[category] = (categoryIncome[category] || 0) + amount;
    }
  }

  // 排序 top expenses
  topExpenses.sort(function (a, b) {
    return b.amount - a.amount;
  });

  // 取得預算
  const settingsSheet = getSheet(SHEET_SETTINGS);
  const settingsData = settingsSheet.getDataRange().getValues();
  let budgets = {};
  for (let i = 1; i < settingsData.length; i++) {
    if (settingsData[i][0] === userId && settingsData[i][1] === 'budgets') {
      try {
        budgets = JSON.parse(settingsData[i][2]);
      } catch (e) {}
      break;
    }
  }

  return {
    success: true,
    dashboard: {
      month: month,
      totalExpense: totalExpense,
      totalIncome: totalIncome,
      netAmount: totalIncome - totalExpense,
      count: count,
      dailyExpense: dailyExpense,
      dailyIncome: dailyIncome,
      categoryExpense: categoryExpense,
      categoryIncome: categoryIncome,
      topExpenses: topExpenses.slice(0, 10),
      budgets: budgets,
    },
  };
}

// ===== AI 整合 (Gemini) =====
function parseNaturalLanguage(data) {
  const text = (data.text || '').trim();
  const userId = data.userId;
  if (!text) return { error: '請提供文字內容' };

  // 取得該用戶的分類列表
  const cats = getCategories({ userId: userId });
  const expenseCats = (cats.categories || [])
    .filter(function (c) { return c.type === 'expense' && c.enabled; })
    .map(function (c) { return c.name; });
  const incomeCats = (cats.categories || [])
    .filter(function (c) { return c.type === 'income' && c.enabled; })
    .map(function (c) { return c.name; });

  const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');

  const prompt =
    '你是一個繁體中文記帳助手。請解析以下記帳描述，提取出結構化的記帳資訊。\n\n' +
    '描述: "' + text + '"\n\n' +
    '支出分類選項: ' + expenseCats.join('、') + '\n' +
    '收入分類選項: ' + incomeCats.join('、') + '\n\n' +
    '請回傳 JSON 格式（不要加 markdown 標記），包含以下欄位:\n' +
    '- type: "expense" 或 "income"\n' +
    '- category: 最匹配的分類名稱\n' +
    '- amount: 金額數字 (純數字)\n' +
    '- note: 簡短備註描述\n' +
    '- date: 日期 (YYYY-MM-DD 格式，如果沒有提到日期用 "' + today + '")\n' +
    '- confidence: 解析信心度 (0到1之間的數字)\n\n' +
    '注意:\n' +
    '- 中文數字轉換："兩百五" = 250, "一千二" = 1200, "三萬" = 30000\n' +
    '- 如果沒明確說是收入，預設為支出\n' +
    '- "昨天" 表示 ' + getYesterday() + '\n' +
    '- "前天" 表示 ' + getDayBefore() + '\n' +
    '- 回傳純 JSON，不要任何其他文字';

  try {
    const parsed = callGemini(prompt, null);
    return { success: true, parsed: parsed };
  } catch (err) {
    return { error: 'AI 解析失敗: ' + err.message };
  }
}

function parseReceipt(data) {
  const imageBase64 = data.image;
  const userId = data.userId;
  if (!imageBase64) return { error: '請提供圖片' };

  const cats = getCategories({ userId: userId });
  const expenseCats = (cats.categories || [])
    .filter(function (c) { return c.type === 'expense' && c.enabled; })
    .map(function (c) { return c.name; });

  const prompt =
    '你是一個收據/發票辨識助手。請分析這張圖片，提取出消費資訊。\n\n' +
    '分類選項: ' + expenseCats.join('、') + '\n\n' +
    '請回傳 JSON 格式（不要加 markdown 標記），包含:\n' +
    '- type: "expense" 或 "income"\n' +
    '- category: 最匹配的分類名稱\n' +
    '- amount: 總金額數字 (純數字)\n' +
    '- note: 商家名稱和簡要描述\n' +
    '- date: 日期 (YYYY-MM-DD)\n' +
    '- items: 品項列表 [{ "name": "品名", "amount": 金額 }]\n' +
    '- confidence: 辨識信心度 (0到1)\n\n' +
    '如果無法辨識，設 confidence 為 0。回傳純 JSON。';

  try {
    const parsed = callGemini(prompt, imageBase64);
    return { success: true, parsed: parsed };
  } catch (err) {
    return { error: '收據辨識失敗: ' + err.message };
  }
}

function callGemini(prompt, imageBase64) {
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    GEMINI_MODEL +
    ':generateContent?key=' +
    GEMINI_API_KEY;

  const parts = [{ text: prompt }];

  if (imageBase64) {
    // 移除 data:image/...;base64, 前綴
    const cleanBase64 = imageBase64.replace(
      /^data:image\/(png|jpeg|jpg|gif|webp);base64,/,
      ''
    );
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: cleanBase64,
      },
    });
  }

  const payload = {
    contents: [{ parts: parts }],
    generationConfig: {
      temperature: 0.1,
    },
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());

  if (result.error) {
    throw new Error(result.error.message || JSON.stringify(result.error));
  }

  const text = result.candidates[0].content.parts[0].text;

  // 清理可能的 markdown 標記
  const cleaned = text
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();
  return JSON.parse(cleaned);
}

// ===== 圖片上傳 =====
function uploadImage(data) {
  const imageBase64 = data.image;
  const fileName = data.fileName || 'receipt_' + Date.now() + '.jpg';
  if (!imageBase64) return { error: '請提供圖片' };

  try {
    const cleanBase64 = imageBase64.replace(
      /^data:image\/(png|jpeg|jpg|gif|webp);base64,/,
      ''
    );
    const decoded = Utilities.base64Decode(cleanBase64);
    const blob = Utilities.newBlob(decoded, 'image/jpeg', fileName);

    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const file = folder.createFile(blob);
    file.setSharing(
      DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.VIEW
    );

    const fileId = file.getId();
    const imageUrl =
      'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800';

    return {
      success: true,
      fileId: fileId,
      imageUrl: imageUrl,
    };
  } catch (err) {
    return { error: '圖片上傳失敗: ' + err.message };
  }
}

// ===== 設定 =====
function getSettings(params) {
  const userId = params.userId;
  if (!userId) return { error: '缺少 userId' };

  const sheet = getSheet(SHEET_SETTINGS);
  const data = sheet.getDataRange().getValues();
  const settings = {};

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      const key = data[i][1];
      let value = data[i][2];
      try {
        value = JSON.parse(value);
      } catch (e) {
        // Keep as string
      }
      settings[key] = value;
    }
  }

  return { success: true, settings: settings };
}

function updateSettings(data) {
  const userId = data.userId;
  const key = data.key;
  const value =
    typeof data.value === 'object' ? JSON.stringify(data.value) : data.value;

  const sheet = getSheet(SHEET_SETTINGS);
  const allData = sheet.getDataRange().getValues();

  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] === userId && allData[i][1] === key) {
      sheet.getRange(i + 1, 3).setValue(value);
      return { success: true };
    }
  }

  // 新增設定
  sheet.appendRow([userId, key, value]);
  return { success: true };
}

// ===== 工具函數 =====
function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    initializeSheets();
    sheet = ss.getSheetByName(name);
  }
  return sheet;
}

function generateId() {
  return Utilities.getUuid();
}

function hashPin(pin) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    pin + '_accounting_salt'
  );
  return raw
    .map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    })
    .join('');
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd');
}

function getDayBefore() {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd');
}
