## סשן הבא — עדיפויות

### פתוח לטיפול:
1. המשך העלאת דוחות מרץ 2026 — קרנות נוספות
2. בנצ'מרק פנימי — ממוצע תשואה לפי קטגוריה, דירוג יחסי
3. טעינת ת"א 125 ואג"ח כללי היסטורי
4. MDD — Maximum Drawdown
5. לוגו NOX כשנגיע
6. fixDecemberYtdSwap — לחשוב על פתרון נקי שלא פוגע בשנים מלאות

### בוצע בסשן זה (v41):
- מסך סטטוס קרנות — חיפוש חופשי ✅
- lastReportDate מתעדכן אוטומטית בעת apply (פורמט MM/YYYY) ✅
- ניהול קרנות — תאריך דוח אחרון מוצג כטקסט עם placeholder "לא עודכן" ✅
- מסך סטטוס — השוואת mismatch מנרמלת פורמטים (toYYYYMM) ✅

### בוצע בסשן קודם (v40):
- תיקון באג מבני: fixAnnualJanSwapPerYear רצה על Pass-1 fields בלבד — Pass-2 דרס אותם. תוקן ע"י הוצאה לרמת מודול + Pass-2.5 על mappedEntries
- ניקוי YTD_ALIASES: הסרת 'dec','december','דצמבר',"דצמ'" — December הוא חודש, לא YTD
- אימות: creative-value y2021=28.88% תקין, alpha-opportunities 12/12 כל השנים
- Cache v40 פעיל ב-production
