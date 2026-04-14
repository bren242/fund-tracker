# SKILL — Fund Tracker Design System
*גרסה 1.0 | תאריך: 14.04.2026*

---

## כלל על — לפני כל עבודת עיצוב
**קרא קובץ זה לפני כל שינוי ויזואלי.**
הסטנדרט: Bloomberg meets Apple. TOP PREMIUM.
כל החלטה נמדדת: "האם סטיב ג'ובס היה אומר WOW?"

---

## פלטת צבעים מאושרת

```
Primary:    #1B3A2F  (ירוק כהה — header, כפתורים פעילים)
Accent:     #B8975A  (זהב — underline פעיל, קו הפרדה)
Background: #f5f5f7  (רקע דף)
Surface:    #ffffff  (רקע טבלה/כרטיסים)
Alternate:  #fafafa  (שורות אי-זוגיות)
Positive:   #248a3d  (תשואה חיובית)
Negative:   #ff3b30  (תשואה שלילית)
Text-1:     #1D1D1F  (טקסט ראשי)
Text-2:     #86868B  (טקסט משני)
Text-3:     #AEAEB2  (טקסט שלישוני — תאריכים)
Text-4:     #555555  (מספרים — שארפ)
Border:     #ebebeb  (קווי הפרדה עדינים)
Hover-bg:   #eef2f0  (רקע hover שורה)
Control-bg: #e8e8ed  (רקע Segmented Control)
```

**אסור לחלוטין:**
- Gradients
- Box-shadow כבד (מעל opacity 0.1)
- צבעים שלא ברשימה
- `var(--bg-section)` — לא אמין, תמיד #1B3A2F ישירות

---

## טיפוגרפיה

```
Font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
font-variant-numeric: tabular-nums  — חובה על כל מספרים
```

### היררכיה:

| אלמנט | fontSize | fontWeight | color | letterSpacing |
|-------|----------|------------|-------|---------------|
| שם קרן | 16px | 600 | #1D1D1F | -0.3px |
| Classification | 12px | 400 | #86868B | 0 |
| תשואה לתקופה | 22px | 700 | ירוק/אדום | -0.5px |
| חודשי | 15px | 600 | ירוק/אדום | 0 |
| ממוצע שנתי | 15px | 500 | ירוק/אדום | 0 |
| שארפ | 14px | 400 | #555 | 0 |
| עדכון/תאריך | 13px | 400 | #AEAEB2 | 0 |
| Section header | 10px | 600 | #1B3A2F | 2px |
| כותרת עמודה | 11px | 500 | #999 | 0.8px |
| Nav tab | 14px | 400/600 | white | 0 |
| Sub tab | 13px | 400/500 | #1B3A2F | 0 |
| Meta info | 12px | 400 | #999 | 0 |

---

## קומפוננטים — מפרט מדויק

### AppHeader
```
פס לבן עליון: height 52px, background #ffffff, border-bottom 0.5px solid #e8e8e8
  - צד ימין: לוגו /branding/green/green-logo-transparent.png, height 38px
  - צד שמאל: "{fundCount} קרנות פעילות", fontSize 12, color #999

פס ירוק: height 44px, background #1B3A2F
  - טאבים: קרנות | ניתוח | כלים | ניהול
  - טאב לא פעיל: color rgba(255,255,255,0.65)
  - טאב פעיל: color #ffffff + borderBottom 2px solid #B8975A
  - hover: color #ffffff (לבן מלא)

Sub bar: height 36px, background #f5f5f7, borderBottom 1px solid #B8975A
  - נפתח בריחוף על טאב, נסגר כשעכבר עוזב את ה-header
  - sub tab פעיל: color #1B3A2F, fontWeight 500, borderBottom 2px solid #B8975A
  - sub tab hover: color #1B3A2F, fontWeight 500
```

### Segmented Control (תווות זמן)
```
wrapper: background #e8e8ed, borderRadius 10, padding 3, display inline-flex
כפתור פעיל: background #ffffff, borderRadius 8, 
            boxShadow "0 1px 3px rgba(0,0,0,0.12)", fontWeight 600, color #1D1D1F
כפתור לא פעיל: background transparent, color #666, border none
```

### Category Pills (פילטרי קטגוריה)
```
wrapper: display inline-flex, alignSelf flex-start, flexWrap wrap
         gap 2, background #e8e8ed, borderRadius 10, padding 3
pill פעיל: background #1B3A2F, color #ffffff, borderRadius 8
           padding "5px 14px", fontSize 13, fontWeight 600
pill לא פעיל: background transparent, color #444, borderRadius 8
              padding "5px 14px", fontSize 13, border none
pill hover: background rgba(0,0,0,0.06)
```

### שורת טבלה (FundRow)
```
רקע זוגי: #ffffff
רקע אי-זוגי: #fafafa
padding תא: 15px 16px
border-bottom: אין — רק alternating background
font-variant-numeric: tabular-nums

Hover state:
  backgroundColor: #eef2f0
  transform: translateY(-1px)
  boxShadow: 0 2px 12px rgba(0,0,0,0.06)
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.12s

Checkbox:
  opacity: 0 ברגיל, 1 בריחוף
  transition: opacity 0.12s
```

### Section Header
```
fontSize: 10, fontWeight: 600, color: #1B3A2F
textTransform: uppercase, letterSpacing: 2px
opacity: 0.75
borderBottom: 1px solid rgba(27,58,47,0.12)
padding: 14px 24px 6px
```

### Badge (BOND/LONG/MULTI)
```
fontSize: 9px
padding: 2px 6px
borderRadius: 4px
letterSpacing: 0.8px
fontWeight: 600
BOND: background #e8f0eb, color #1B3A2F
LONG: background #e8f4eb, color #1B3A2F  
MULTI: background #e8eef8, color #0a3d5c
```

### Floating Action Bar (השוואה)
```
background: rgba(255,255,255,0.92)
backdropFilter: blur(12px)
borderRadius: 14px
padding: 10px 20px
boxShadow: 0 4px 20px rgba(0,0,0,0.12)
```

---

## כללי Apple HIG הרלוונטיים

1. **Clarity** — כל אלמנט מרוויח את מקומו. אין דקורציה.
2. **Hierarchy** — המשתמש מבין תוך 2 שניות מה חשוב.
3. **Tabular Numbers** — חובה על כל מספרים פיננסיים.
4. **Hover = information** — hover state מוסיף מידע, לא דקורציה.
5. **Spacing replaces borders** — ריווח במקום קווים כשאפשר.
6. **One accent color** — זהב מופיע פעמיים בלבד: בלוגו ובunderline פעיל.
7. **Progressive Disclosure** — מציגים פחות, מחשפים יותר בריחוף/קליק.
8. **No hover navigation on desktop** — sub bar נפתח בריחוף אבל נסגר רק כשעוזבים את האזור כולו.

---

## מה אסור בהחלט

- `var(--bg-section)` — לא אמין
- Gradients מכל סוג
- Border-radius מעל 12px על כרטיסים
- Font-size מתחת ל-9px
- Shadow opacity מעל 0.12
- אנימציות מעל 200ms
- Slide/bounce animations — רק fade ו-ease
- Emoji בממשק
- ALL CAPS על טקסט ארוך (רק section headers)
- translateX על hover — תמיד translateY(-1px)

---

## Routing

```
/                    → קרנות (FundTableV2)
/analysis            → ניתוח/דירוג
/charts              → גרפים
/compare             → השוואה
/consistency         → עקביות
/indications         → אינדיקציה
/fund-status         → סטטוס קרנות
/upload              → העלאת דוח
/admin               → ניהול
```

---

## קבצים מרכזיים

```
components/AppHeader.tsx      — header גלובלי
components/FundTableV2.tsx    — טבלת קרנות ראשית
app/layout.tsx                — מחבר AppHeader לכל הדפים
app/fund-status/page.tsx      — סטטוס קרנות (עוצב)
lib/design-tokens.ts          — tokens (reference)
public/favicon.svg            — G ירוקה
public/branding/green/        — לוגו GREEN
```

---

## V4 — תכנון עתידי (לא לבצע עדיין)

- Card List במקום טבלה
- Split View להשוואה (פאנל ימני inline)
- Focus Mode — opacity 0.6 על שורות לא פעילות
- Bubble חיפוש גלובלי ב-layout.tsx
- Control Bar אחידה לפילטרים

---
*עודכן: 14.04.2026 | checkpoint 3f7c496*
