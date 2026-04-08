# פרומפט פתיחה לסשן חדש — fund-tracker

אני איל ברנר מ-GREEN Wealth Management. ממשיכים עבודה על fund-tracker.

הפרויקט: Next.js + Vercel KV. מולטי-טננט (GREEN, NOX).
Claude Vision מפענח דוחות PDF/PNG של קרנות השקעה.

מצב נוכחי:
* Cache v11
* Two-Pass Architecture ב-app/api/parse/route.ts
* 80+ קרנות GREEN בפרודקשן
* dark mode + light mode מלאים
* Scatter Chart מלא עם תובנות אוטומטיות
* FundCard עם גרפים משודרגים
* ריצת לילה עובדת (run-night.bat)
* **פיצ'ר אינדיקציה מהירה — הושלם (commit d19cf25)**
  - API: GET/POST/PUT/DELETE /api/indications
  - /indications — מסך הזנה מהיר
  - /indications/output — תמונה WhatsApp + PDF (Heebo font)
  - טאב "⚡ אינדיקציה" באדמין (super) עם toggle + reset
  - feature flag: brand.features.indications
  - כרגע מופעל על GREEN

פתוח לטיפול:
1. דוחות מרץ 2026 — פרסור מלא של כל הקרנות
2. בנצ'מרק פנימי — ממוצע תשואה לפי קטגוריה
3. שדרוג PDF של דף Scatter
4. המשך טאב ניתוח והשוואה (FundCard)
5. Maximum Drawdown (MDD) — להחליט אם מחליף "חודשי התאוששות"

כללי עבודה:
* אתה הארכיטקט — אני מעביר פרומפטים לקלוד קוד
* שלב שלב — לא קופצים לפני אישור
* בדיקה לוקאלית לפני כל דיפלוי
* קומיט אחרי כל משימה
* SPEC.md ו-LESSONS.md — מעודכנים תמיד

מוכן — ממשיכים.
