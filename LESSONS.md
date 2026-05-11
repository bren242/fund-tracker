# LESSONS.md — לקחים טכניים מהפרויקט
> קובץ זה מתעדכן בסוף כל סשן עם לקחים שיישמרו לעתיד.

---

## Sticky Layout

### לקח 1: backdropFilter שובר sticky background
`position:sticky` עם `backdropFilter` על child יוצר compositing layer שמתעלם מה-background של ה-parent.  
**כלל:** תמיד background סולידי (`#ffffff` / `#FAFAF7`) על ה-sticky element עצמו. לעולם לא `rgba` + `blur` על child שבתוך sticky wrapper.

### לקח 2: גבהים קבועים = top סטטי = יציבות מלאה
`height: Xpx` (לא `padding`) על כל שורה → ניתן לחשב `top` ל-thead בזמן build: `52 + 44 + 40 = 136`.  
`ResizeObserver` עובד אבל הוא מקור לבאגים: initial state שגוי לפני mount, race conditions, useEffect vs useLayoutEffect. **להעדיף static תמיד.**  
כשגובה משתנה דינמית (sub-bar אופציונלי) — להסיר את ה-sub-bar ולאחד את התוכן לשורה עם overflow-x, לא להוסיף observer.

### לקח 3: RTL flex + overflow-x חותך את הקצה השמאלי
ב-flex container עם `direction:rtl` + `overflow-x:auto`, ה-scroll position מתחיל מימין (RTL-start).  
Pills שנמצאים בקצה השמאלי (DOM-end) — נחתכים ולא נגישים ב-100% zoom. המשתמש לא יודע שיש scroll.  
**הפתרון:** 2 שורות נפרדות — כל שורה קצרה מספיק להיכנס ב-viewport ללא overflow.

### לקח 4: overflow:clip vs overflow:hidden לטבלה
`overflow:clip` — לא יוצר scroll container, לא שובר `position:sticky` של children.  
`overflow:hidden` — יוצר BFC, שובר sticky. **לעולם לא להשתמש ב-`overflow:hidden` על wrapper שמכיל sticky thead.**

### לקח 5: backgroundColor על outer wrapper, לא רק inner
אם sticky wrapper מכיל div פנימי עם background, ה-wrapper עצמו גם חייב `backgroundColor` אטום.  
אחרת: גלילה תחת ה-sticky wrapper תציג תוכן דרך השכבה האטומה-לכאורה.

---

## Worktrees

### לקח 6: Claude Code ב-worktree לא דוחף ל-trunk אוטומטית
שינויים נעשים ב-`.claude/worktrees/{name}/`, לא בשורש הפרויקט.  
**תמיד:** `pwd && git branch --show-current` בפרומפט הראשון לכל סשן.  
Merge ל-main חייב להיעשות מ-`cd C:\...\fund-tracker` (שורש), לא מהworktree.

### לקח 7: rebase > merge כשיש conflict עם worktree
כשmain קיבל commit בזמן שעבדנו ב-worktree:  
`git merge claude/branch` מcreates merge commit עם conflicts.  
`git rebase origin/main` מה-worktree, פתרון conflict ישיר בקובץ, `git rebase --continue` — עדיף.

---

## UX / Credit Error

### לקח 8: 402 מ-Anthropic SDK ≠ 502 גנרי
שגיאת `402 Payment Required` = מכסת credits נגמרה. המשתמש צריך לראות הודעה ייעודית.  
**Pattern:** `isCreditExhaustedError(status, body)` — בודק status 402 + keywords בgody ("credit balance", "billing").  
Response: `creditExhaustedBody()` → JSON עם `error: "anthropic_credit_exhausted"` + הודעה בעברית.  
Frontend: banner ייעודי (צהוב/כתום), לא toast גנרי.

---

## כלל ברזל — לא לחפור פעמיים
אם ניסית תיקון ולא עבד, **עצור לאחר ניסיון שני**. סכם מה ניסית ולמה נכשל. שנה כיוון.  
"לחפור עמוק יותר באותו כיוון" = בזבוז זמן + שחיקת ביטחון. מדידה אמיתית (console.log, DevTools) לפני ניסיון שלישי.

*עודכן: 2026-05-10 — לקחים מסשן sticky iteration × 7*
